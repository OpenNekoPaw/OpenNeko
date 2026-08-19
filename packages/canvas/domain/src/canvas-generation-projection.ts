import {
  contentLocatorKey,
  contentLocatorsEqual,
  isWorkspaceFileContentLocator,
  validateContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import {
  isCanvasMaterialGenerationContext,
  type CanvasConnection,
  type CanvasData,
  type CanvasJobStatus,
  type CanvasMaterialGenerationContext,
  type JobCanvasNode,
} from './types/canvas';
import { planCanvasNodeCreation } from './utils/canvasHeadlessAuthoring';
import {
  type CanvasGenerationJobRef,
  type CanvasMaterialAuthoringIdentity,
  type CanvasMaterialMediaKind,
} from './types/canvas-material-contracts';
import type { JobFailureSummary, JobPhase } from '@neko/shared/job-lifecycle';
import { projectResolvedCanvasMaterialToCanvas } from './canvas-content-authoring';

export interface CanvasGenerationProjectionSnapshot {
  readonly ref: CanvasGenerationJobRef;
  readonly retryOf?: CanvasGenerationJobRef;
  readonly regenerateOf?: CanvasGenerationJobRef;
  readonly phase: JobPhase;
  readonly title: string;
  readonly inputNodeIds: readonly string[];
  readonly mediaKind: CanvasMaterialMediaKind;
  readonly summary: CanvasMaterialGenerationContext;
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

/**
 * Projects owner-authored Generation state into Canvas.
 * Canvas never mutates Generation state and never reconstructs a recipe from summary text.
 */
export function projectGenerationSnapshotToCanvas(
  input: CanvasGenerationProjectionInput,
): CanvasData {
  assertProjectionIdentity(input.identity, input.expectedIdentity);
  assertProjectionSnapshot(input.canvas, input.snapshot);

  const existingJob = findJobNode(input.canvas, input.snapshot.ref);
  if (existingJob) assertJobProjectionTransition(existingJob.data.status, input.snapshot.phase);

  let canvas = upsertJobNode(input.canvas, input.snapshot, existingJob);
  const job = requireJobNode(canvas, input.snapshot.ref);

  if (input.snapshot.phase !== 'succeeded') {
    if (job.data.outputRefs.length > 0) {
      throw new Error('A non-succeeded Generation Job must not project result artifacts.');
    }
    return projectJobLineage(canvas, input.snapshot, job, []);
  }

  const resultLocators = input.snapshot.resultLocators;
  if (!resultLocators || resultLocators.length === 0) {
    throw new Error('A succeeded Generation Job requires at least one committed result locator.');
  }

  const outputNodeIds: string[] = [];
  for (const [index, locator] of resultLocators.entries()) {
    const validation = validateContentLocator(locator);
    if (
      !validation.ok ||
      !isWorkspaceFileContentLocator(validation.locator) ||
      validation.locator.selector !== undefined
    ) {
      throw new Error(`Generation result locator ${index} is invalid.`);
    }
    const existingOutput = canvas.nodes.find(
      (node) =>
        (node.type === 'media' || node.type === 'file') &&
        node.data.generation?.jobRef.jobId === input.snapshot.ref.jobId &&
        node.data.generation.jobRef.kind === input.snapshot.ref.kind &&
        node.data.contentLocator !== undefined &&
        contentLocatorsEqual(node.data.contentLocator, validation.locator),
    );
    if (existingOutput) {
      outputNodeIds.push(existingOutput.id);
      continue;
    }

    const outputId = outputNodeId(input.snapshot.ref, validation.locator);
    if (canvas.nodes.some((node) => node.id === outputId)) {
      throw new Error(`Canvas Generation output identity "${outputId}" is already occupied.`);
    }
    canvas = projectResolvedCanvasMaterialToCanvas({
      canvas,
      material: {
        locator: validation.locator,
        title: titleFromPath(validation.locator.file.path),
        mediaKind: input.snapshot.mediaKind,
        generation: {
          jobRef: input.snapshot.ref,
          summary: input.snapshot.summary,
        },
        position: resultPosition(job, index),
      },
      generateId: () => outputId,
    });
    outputNodeIds.push(outputId);
  }

  canvas = replaceJobNode(canvas, input.snapshot, outputNodeIds);
  return projectJobLineage(
    canvas,
    input.snapshot,
    requireJobNode(canvas, input.snapshot.ref),
    outputNodeIds,
  );
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

function upsertJobNode(
  canvas: CanvasData,
  snapshot: CanvasGenerationProjectionSnapshot,
  existing: JobCanvasNode | undefined,
): CanvasData {
  if (existing) {
    return replaceJobNode(canvas, snapshot, existing.data.outputRefs.flatMap(readCanvasNodeRef));
  }
  return planCanvasNodeCreation(
    { canvasData: canvas, generateId: () => jobNodeId(snapshot.ref) },
    {
      type: 'job',
      position: snapshot.position ?? jobPosition(canvas),
      data: jobNodeData(snapshot, []),
    },
  ).canvasData;
}

function replaceJobNode(
  canvas: CanvasData,
  snapshot: CanvasGenerationProjectionSnapshot,
  outputNodeIds: readonly string[],
): CanvasData {
  const id = jobNodeId(snapshot.ref);
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      node.id === id && node.type === 'job'
        ? { ...node, data: jobNodeData(snapshot, outputNodeIds) }
        : node,
    ),
  };
}

function jobNodeData(
  snapshot: CanvasGenerationProjectionSnapshot,
  outputNodeIds: readonly string[],
): JobCanvasNode['data'] {
  return {
    jobRef: snapshot.ref,
    title: snapshot.title,
    objective: snapshot.summary.prompt,
    status: projectJobStatus(snapshot.phase),
    inputRefs: snapshot.inputNodeIds.map((nodeId) => ({ kind: 'canvas-node', nodeId })),
    outputRefs: outputNodeIds.map((nodeId) => ({ kind: 'canvas-node', nodeId })),
    ...(snapshot.failure
      ? { diagnostic: `${snapshot.failure.code}: ${snapshot.failure.message}` }
      : {}),
  };
}

function assertJobProjectionTransition(current: CanvasJobStatus, nextPhase: JobPhase): void {
  const next = projectJobStatus(nextPhase);
  const allowed: Readonly<Record<CanvasJobStatus, ReadonlySet<CanvasJobStatus>>> = {
    draft: new Set(['queued']),
    queued: new Set(['queued', 'running', 'waiting', 'completed', 'failed', 'cancelled']),
    running: new Set(['running', 'waiting', 'completed', 'failed', 'cancelled']),
    waiting: new Set(['waiting', 'running', 'completed', 'failed', 'cancelled']),
    completed: new Set(['completed']),
    failed: new Set(['failed']),
    cancelled: new Set(['cancelled']),
  };
  if (!allowed[current].has(next)) {
    throw new Error(`Canvas Generation projection cannot move from ${current} to ${next}.`);
  }
}

function projectJobStatus(phase: JobPhase): JobCanvasNode['data']['status'] {
  switch (phase) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'running';
    case 'succeeded':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'outcome-unknown':
      return 'waiting';
  }
}

function projectJobLineage(
  canvas: CanvasData,
  snapshot: CanvasGenerationProjectionSnapshot,
  job: JobCanvasNode,
  outputNodeIds: readonly string[],
): CanvasData {
  const edges: Array<readonly [string, string]> = [
    ...snapshot.inputNodeIds.map((nodeId) => [nodeId, job.id] as const),
    ...outputNodeIds.map((nodeId) => [job.id, nodeId] as const),
  ];
  if (snapshot.retryOf) {
    const previous = findJobNode(canvas, snapshot.retryOf);
    if (!previous) {
      throw new Error(
        `Canvas Generation retry source "${snapshot.retryOf.jobId}" is not projected.`,
      );
    }
    edges.unshift([previous.id, job.id]);
  }
  if (snapshot.regenerateOf) {
    const previous = findJobNode(canvas, snapshot.regenerateOf);
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

function findJobNode(canvas: CanvasData, ref: CanvasGenerationJobRef): JobCanvasNode | undefined {
  const expectedId = jobNodeId(ref);
  const node = canvas.nodes.find((candidate) => candidate.id === expectedId);
  if (!node) return undefined;
  if (node.type !== 'job') {
    throw new Error(`Canvas Generation Job identity "${expectedId}" is occupied.`);
  }
  if (node.data.jobRef.kind !== ref.kind || node.data.jobRef.jobId !== ref.jobId) {
    throw new Error(`Canvas Generation Job identity "${expectedId}" has conflicting authority.`);
  }
  return node;
}

function requireJobNode(canvas: CanvasData, ref: CanvasGenerationJobRef): JobCanvasNode {
  const node = findJobNode(canvas, ref);
  if (!node) throw new Error(`Canvas Generation Job "${ref.jobId}" was not projected.`);
  return node;
}

function readCanvasNodeRef(ref: JobCanvasNode['data']['outputRefs'][number]): readonly string[] {
  return ref.kind === 'canvas-node' ? [ref.nodeId] : [];
}

function jobNodeId(ref: CanvasGenerationJobRef): string {
  return `generation-job:${encodeURIComponent(ref.jobId)}`;
}

function outputNodeId(ref: CanvasGenerationJobRef, locator: WorkspaceFileContentLocator): string {
  return `generation-output:${encodeURIComponent(ref.jobId)}:${encodeURIComponent(contentLocatorKey(locator))}`;
}

function jobPosition(canvas: CanvasData): { readonly x: number; readonly y: number } {
  return { x: 120 + (canvas.nodes.length % 3) * 36, y: 120 };
}

function resultPosition(
  job: JobCanvasNode,
  index: number,
): { readonly x: number; readonly y: number } {
  return { x: job.position.x + job.size.width + 80, y: job.position.y + index * 220 };
}

function titleFromPath(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || 'Generated output';
}
