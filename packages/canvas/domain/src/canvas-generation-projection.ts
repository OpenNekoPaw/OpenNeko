import {
  contentLocatorKey,
  isWorkspaceFileContentLocator,
  validateContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import {
  isCanvasMaterialGenerationContext,
  type CanvasConnection,
  type CanvasData,
  type GenerationCanvasNode,
  type CanvasMaterialGenerationContext,
} from './types/canvas';
import { planCanvasNodeCreation } from './utils/canvasHeadlessAuthoring';
import {
  type CanvasGenerationJobRef,
  type CanvasMaterialAuthoringIdentity,
  type CanvasMaterialMediaKind,
} from './types/canvas-material-contracts';
import type { JobFailureSummary, JobPhase } from '@neko/shared/job-lifecycle';
import {
  isCanvasGenerationRecipe,
  type CanvasGenerationOutputBinding,
  type CanvasGenerationRecipe,
} from './types/canvas-generation-node';

export interface CanvasGenerationProjectionSnapshot {
  readonly ref: CanvasGenerationJobRef;
  readonly retryOf?: CanvasGenerationJobRef;
  readonly regenerateOf?: CanvasGenerationJobRef;
  readonly phase: JobPhase;
  readonly title: string;
  readonly inputNodeIds: readonly string[];
  readonly mediaKind: CanvasMaterialMediaKind;
  readonly summary: CanvasMaterialGenerationContext;
  readonly recipe: CanvasGenerationRecipe;
  readonly submissionId?: string;
  readonly recipeInputFingerprint: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly resultLocators?: readonly WorkspaceFileContentLocator[];
  readonly failure?: JobFailureSummary;
}

export interface CanvasGenerationProjectionInput {
  readonly identity: CanvasMaterialAuthoringIdentity;
  readonly expectedIdentity: CanvasMaterialAuthoringIdentity;
  readonly canvas: CanvasData;
  readonly snapshot: CanvasGenerationProjectionSnapshot;
}

export interface CanvasWorkspaceGenerationProjectionInput {
  readonly canvas: CanvasData;
  readonly snapshot: CanvasGenerationProjectionSnapshot;
}

/**
 * Projects owner-authored Generation state into Canvas.
 * Canvas never mutates Generation state and never reconstructs a recipe from summary text.
 */
export function projectGenerationSnapshotToCanvas(
  input: CanvasGenerationProjectionInput,
): CanvasData {
  assertProjectionIdentity(input.identity, input.expectedIdentity);
  return projectGenerationSnapshot(input.canvas, input.snapshot);
}

/**
 * Projects an Agent-owned Generation Job into an already-authorized Workspace Board target.
 * Exact target admission is owned by the Workspace Board delivery boundary, so this projection
 * deliberately has no active Canvas identity fallback.
 */
export function projectGenerationSnapshotToWorkspaceBoard(
  input: CanvasWorkspaceGenerationProjectionInput,
): CanvasData {
  return projectGenerationSnapshot(input.canvas, input.snapshot);
}

function projectGenerationSnapshot(
  inputCanvas: CanvasData,
  snapshot: CanvasGenerationProjectionSnapshot,
): CanvasData {
  assertProjectionSnapshot(inputCanvas, snapshot);
  const existing = findGenerationNode(inputCanvas, snapshot.ref);
  if (existing?.data.outputs.length && snapshot.phase !== 'succeeded') {
    throw new Error('A non-succeeded Generation Job must not project result artifacts.');
  }
  if (snapshot.phase === 'succeeded' && !snapshot.resultLocators?.length) {
    throw new Error('A succeeded Generation Job requires at least one committed result locator.');
  }
  const outputs = createOutputBindings(snapshot);
  const canvas = upsertGenerationNode(inputCanvas, snapshot, existing, outputs);
  return projectJobLineage(canvas, snapshot, requireGenerationNode(canvas, snapshot.ref));
}

export function isCanvasGenerationProjectionSnapshot(
  value: unknown,
): value is CanvasGenerationProjectionSnapshot {
  if (!isRecord(value)) return false;
  if (!isGenerationJobRef(value['ref']) || !isJobPhase(value['phase'])) return false;
  if (typeof value['title'] !== 'string' || !value['title'].trim()) return false;
  if (
    !Array.isArray(value['inputNodeIds']) ||
    !value['inputNodeIds'].every((nodeId) => typeof nodeId === 'string' && nodeId.trim())
  ) {
    return false;
  }
  if (!isCanvasMaterialMediaKind(value['mediaKind'])) return false;
  if (!isCanvasMaterialGenerationContext(value['summary'])) return false;
  if (!isCanvasGenerationRecipe(value['recipe'])) return false;
  if (
    value['submissionId'] !== undefined &&
    (typeof value['submissionId'] !== 'string' || !value['submissionId'].trim())
  ) {
    return false;
  }
  if (
    typeof value['recipeInputFingerprint'] !== 'string' ||
    !value['recipeInputFingerprint'].trim()
  ) {
    return false;
  }
  if (value['retryOf'] !== undefined && !isGenerationJobRef(value['retryOf'])) return false;
  if (value['regenerateOf'] !== undefined && !isGenerationJobRef(value['regenerateOf'])) {
    return false;
  }
  if (value['retryOf'] !== undefined && value['regenerateOf'] !== undefined) return false;
  if (value['position'] !== undefined && !isFinitePosition(value['position'])) return false;
  if (
    value['resultLocators'] !== undefined &&
    (!Array.isArray(value['resultLocators']) ||
      !value['resultLocators'].every((locator) => {
        const validation = validateContentLocator(locator);
        return (
          validation.ok &&
          isWorkspaceFileContentLocator(validation.locator) &&
          validation.locator.selector === undefined
        );
      }))
  ) {
    return false;
  }
  return value['failure'] === undefined || isJobFailureSummary(value['failure']);
}

function assertProjectionIdentity(
  actual: CanvasMaterialAuthoringIdentity,
  expected: CanvasMaterialAuthoringIdentity,
): void {
  for (const key of ['projectId', 'canvasId', 'canvasSessionId'] as const) {
    if (!actual[key].trim() || actual[key] !== expected[key]) {
      throw new Error(`Canvas Generation projection ${key} does not match the active instance.`);
    }
  }
}

function assertProjectionSnapshot(
  canvas: CanvasData,
  snapshot: CanvasGenerationProjectionSnapshot,
): void {
  if (snapshot.ref.kind !== 'generation' || !snapshot.ref.jobId.trim()) {
    throw new Error('Canvas Generation projection requires a canonical Generation JobRef.');
  }
  if (!snapshot.title.trim()) {
    throw new Error('Canvas Generation projection title must be non-empty.');
  }
  if (!isCanvasMaterialGenerationContext(snapshot.summary)) {
    throw new Error('Canvas Generation projection requires an immutable creator-facing summary.');
  }
  if (!isCanvasGenerationRecipe(snapshot.recipe)) {
    throw new Error('Canvas Generation projection requires a canonical Generation Recipe.');
  }
  if (!snapshot.recipeInputFingerprint.trim()) {
    throw new Error('Canvas Generation projection requires a stable Recipe/input fingerprint.');
  }
  if (snapshot.retryOf && snapshot.regenerateOf) {
    throw new Error('Canvas Generation projection cannot be both a retry and a regeneration.');
  }
  const nodeIds = new Set(canvas.nodes.map((node) => node.id));
  for (const nodeId of snapshot.inputNodeIds) {
    if (!nodeId.trim() || !nodeIds.has(nodeId)) {
      throw new Error(`Canvas Generation input node "${nodeId}" does not exist.`);
    }
  }
}

function upsertGenerationNode(
  canvas: CanvasData,
  snapshot: CanvasGenerationProjectionSnapshot,
  existing: GenerationCanvasNode | undefined,
  outputs: readonly CanvasGenerationOutputBinding[],
): CanvasData {
  if (existing) {
    if (existing.data.recipe.kind !== snapshot.recipe.kind) {
      throw new Error('Canvas Generation Recipe kind cannot change for the same Job.');
    }
    const merged = new Map(existing.data.outputs.map((output) => [output.outputId, output]));
    for (const output of outputs) {
      const previous = merged.get(output.outputId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(output)) {
        throw new Error(`Canvas Generation output identity "${output.outputId}" conflicts.`);
      }
      merged.set(output.outputId, output);
    }
    const selectedOutputId = outputs.at(-1)?.outputId ?? existing.data.selectedOutputId;
    return {
      ...canvas,
      nodes: canvas.nodes.map((node) =>
        node.id === existing.id && node.type === 'generation'
          ? {
              ...node,
              data: {
                recipe: snapshot.recipe,
                latestRun: generationRun(snapshot),
                outputs: [...merged.values()],
                ...(selectedOutputId ? { selectedOutputId } : {}),
              },
            }
          : node,
      ),
    };
  }
  const selectedOutput = outputs.at(-1);
  return planCanvasNodeCreation(
    { canvasData: canvas, generateId: () => generationNodeId(snapshot.ref) },
    {
      type: 'generation',
      position: snapshot.position ?? jobPosition(canvas),
      data: {
        recipe: snapshot.recipe,
        latestRun: generationRun(snapshot),
        outputs,
        ...(selectedOutput ? { selectedOutputId: selectedOutput.outputId } : {}),
      },
    },
  ).canvasData;
}

function projectJobLineage(
  canvas: CanvasData,
  snapshot: CanvasGenerationProjectionSnapshot,
  job: GenerationCanvasNode,
): CanvasData {
  const edges: Array<readonly [string, string]> = [
    ...snapshot.inputNodeIds.map((nodeId) => [nodeId, job.id] as const),
  ];
  if (snapshot.retryOf) {
    const previous = findGenerationNode(canvas, snapshot.retryOf);
    if (!previous) {
      throw new Error(
        `Canvas Generation retry source "${snapshot.retryOf.jobId}" is not projected.`,
      );
    }
    edges.unshift([previous.id, job.id]);
  }
  if (snapshot.regenerateOf) {
    const previous = findGenerationNode(canvas, snapshot.regenerateOf);
    if (!previous) {
      throw new Error(
        `Canvas Generation regeneration source "${snapshot.regenerateOf.jobId}" is not projected.`,
      );
    }
    edges.unshift([previous.id, job.id]);
  }

  let connections = canvas.connections;
  for (const [sourceId, targetId] of edges) {
    if (
      connections.some(
        (connection) =>
          connection.type === 'derived-from' &&
          connection.sourceId === sourceId &&
          connection.targetId === targetId,
      )
    ) {
      continue;
    }
    const connection = derivedFromConnection(sourceId, targetId);
    if (connections.some((candidate) => candidate.id === connection.id)) {
      throw new Error(`Canvas Generation lineage identity "${connection.id}" is occupied.`);
    }
    connections = [...connections, connection];
  }
  return connections === canvas.connections ? canvas : { ...canvas, connections };
}

function derivedFromConnection(sourceId: string, targetId: string): CanvasConnection {
  return {
    id: `generation-derived:${encodeURIComponent(sourceId)}:${encodeURIComponent(targetId)}`,
    sourceId,
    targetId,
    type: 'derived-from',
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
  };
}

function findGenerationNode(
  canvas: CanvasData,
  ref: CanvasGenerationJobRef,
): GenerationCanvasNode | undefined {
  const expectedId = generationNodeId(ref);
  const node = canvas.nodes.find((candidate) => candidate.id === expectedId);
  if (!node) return undefined;
  if (node.type !== 'generation') {
    throw new Error(`Canvas Generation node identity "${expectedId}" is occupied.`);
  }
  if (node.data.latestRun?.jobRef?.jobId !== ref.jobId) {
    throw new Error(`Canvas Generation node identity "${expectedId}" has conflicting authority.`);
  }
  return node;
}

function requireGenerationNode(
  canvas: CanvasData,
  ref: CanvasGenerationJobRef,
): GenerationCanvasNode {
  const node = findGenerationNode(canvas, ref);
  if (!node) throw new Error(`Canvas Generation node "${ref.jobId}" was not projected.`);
  return node;
}

function generationRun(snapshot: CanvasGenerationProjectionSnapshot) {
  return {
    recipeInputFingerprint: snapshot.recipeInputFingerprint,
    jobRef: snapshot.ref,
    ...(snapshot.submissionId ? { submissionId: snapshot.submissionId } : {}),
  } as const;
}

function createOutputBindings(
  snapshot: CanvasGenerationProjectionSnapshot,
): readonly CanvasGenerationOutputBinding[] {
  return (snapshot.resultLocators ?? []).map((locator, index) => {
    const validation = validateContentLocator(locator);
    if (
      !validation.ok ||
      !isWorkspaceFileContentLocator(validation.locator) ||
      validation.locator.selector !== undefined
    ) {
      throw new Error(`Generation result locator ${index} is invalid.`);
    }
    return {
      outputId: contentLocatorKey(validation.locator),
      jobRef: snapshot.ref,
      locator: validation.locator,
      kind: snapshot.recipe.kind,
      recipeInputFingerprint: snapshot.recipeInputFingerprint,
    };
  });
}

function generationNodeId(ref: CanvasGenerationJobRef): string {
  return `generation:${encodeURIComponent(ref.jobId)}`;
}

function jobPosition(canvas: CanvasData): { readonly x: number; readonly y: number } {
  return { x: 120 + (canvas.nodes.length % 3) * 36, y: 120 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGenerationJobRef(value: unknown): value is CanvasGenerationJobRef {
  return (
    isRecord(value) &&
    value['kind'] === 'generation' &&
    typeof value['jobId'] === 'string' &&
    value['jobId'].trim().length > 0
  );
}

function isJobPhase(value: unknown): value is JobPhase {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'outcome-unknown'
  );
}

function isCanvasMaterialMediaKind(value: unknown): value is CanvasMaterialMediaKind {
  return (
    value === 'image' ||
    value === 'audio' ||
    value === 'video' ||
    value === 'document' ||
    value === 'model' ||
    value === 'other'
  );
}

function isFinitePosition(value: unknown): value is { readonly x: number; readonly y: number } {
  return (
    isRecord(value) &&
    typeof value['x'] === 'number' &&
    Number.isFinite(value['x']) &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y'])
  );
}

function isJobFailureSummary(value: unknown): value is JobFailureSummary {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    value['code'].trim().length > 0 &&
    typeof value['message'] === 'string' &&
    value['message'].trim().length > 0 &&
    (value['retryable'] === undefined || typeof value['retryable'] === 'boolean')
  );
}
