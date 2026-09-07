import type { GeneratedAssetMediaKind } from './generated-asset';
import {
  createWorkspaceFileContentLocator,
  isWorkspaceFileContentLocator,
  normalizeWorkspaceContentPath,
  validateContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content-domain';
import { hashStableValue } from '@neko/shared';

export interface GeneratedAssetWorkflowStageRef {
  readonly stageId: string;
  readonly workflowId?: string;
}

export interface GeneratedAssetGenerationLineage {
  readonly operationId: string;
  readonly runId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly workflowStage?: GeneratedAssetWorkflowStageRef;
}

/**
 * Stable identity for one generated-asset content revision. Host paths and
 * render URIs are deliberately excluded from this record.
 */
export interface GeneratedAssetRevisionRef {
  readonly assetId: string;
  readonly revision: string;
  readonly contentDigest: string;
  readonly mediaKind: GeneratedAssetMediaKind;
  readonly mimeType: string;
  readonly contentLocator: WorkspaceFileContentLocator;
  readonly generation: GeneratedAssetGenerationLineage;
}

export interface CreateGeneratedAssetRevisionRefInput {
  readonly assetId: string;
  readonly contentDigest: string;
  readonly contentPath: string;
  readonly mediaKind: GeneratedAssetMediaKind;
  readonly mimeType: string;
  readonly generation: GeneratedAssetGenerationLineage;
}

export type GeneratedAssetRevisionRefValidationResult =
  | {
      readonly ok: true;
      readonly lifecycle: GeneratedAssetRevisionRef;
    }
  | {
      readonly ok: false;
      readonly diagnostic: string;
    };

export function createGeneratedAssetRevisionRef(
  input: CreateGeneratedAssetRevisionRefInput,
): GeneratedAssetRevisionRef {
  assertNonEmpty(input.assetId, 'assetId');
  assertNonEmpty(input.contentDigest, 'contentDigest');
  assertNonEmpty(input.contentPath, 'contentPath');
  assertNonEmpty(input.mimeType, 'mimeType');
  assertNonEmpty(input.generation.operationId, 'generation.operationId');

  const revision = createGeneratedAssetRevision(input.assetId, input.contentDigest);
  const contentPath = normalizeWorkspaceContentPath(input.contentPath);
  if (!contentPath || contentPath !== input.contentPath) {
    throw new Error(
      'Generated asset lifecycle requires a normalized workspace-relative contentPath.',
    );
  }
  const contentLocator = createWorkspaceFileContentLocator(contentPath);
  return {
    assetId: input.assetId,
    revision,
    contentDigest: input.contentDigest,
    mediaKind: input.mediaKind,
    mimeType: input.mimeType,
    contentLocator,
    generation: input.generation,
  };
}

export function validateGeneratedAssetRevisionRef(
  value: unknown,
): GeneratedAssetRevisionRefValidationResult {
  if (!isRecord(value) || !hasOnlyKeys(value, LIFECYCLE_KEYS)) {
    return invalidLifecycle('Generated asset lifecycle contains unsupported fields.');
  }
  const assetId = readNonEmptyString(value['assetId']);
  const revision = readNonEmptyString(value['revision']);
  const contentDigest = readNonEmptyString(value['contentDigest']);
  const mimeType = readNonEmptyString(value['mimeType']);
  const mediaKind = readGeneratedAssetMediaKind(value['mediaKind']);
  const generation = readGenerationLineage(value['generation']);
  const contentLocator = validateContentLocator(value['contentLocator']);
  if (
    !assetId ||
    !revision ||
    !contentDigest ||
    !mimeType ||
    !mediaKind ||
    !generation ||
    !contentLocator.ok ||
    !isWorkspaceFileContentLocator(contentLocator.locator) ||
    contentLocator.locator.selector !== undefined
  ) {
    return invalidLifecycle('Generated asset lifecycle structure is invalid.');
  }
  if (revision !== createGeneratedAssetRevision(assetId, contentDigest)) {
    return invalidLifecycle('Generated asset lifecycle revision does not match its identity.');
  }
  return {
    ok: true,
    lifecycle: {
      assetId,
      revision,
      contentDigest,
      mediaKind,
      mimeType,
      contentLocator: contentLocator.locator,
      generation,
    },
  };
}

export function isGeneratedAssetRevisionRef(value: unknown): value is GeneratedAssetRevisionRef {
  return validateGeneratedAssetRevisionRef(value).ok;
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`Generated asset lifecycle requires non-empty ${field}.`);
  }
}

function createGeneratedAssetRevision(assetId: string, contentDigest: string): string {
  return `rev_${hashStableValue({ assetId, contentDigest })}`;
}

function readGenerationLineage(value: unknown): GeneratedAssetGenerationLineage | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, GENERATION_KEYS)) return undefined;
  const operationId = readNonEmptyString(value['operationId']);
  const runId = readOptionalNonEmptyString(value['runId']);
  const providerId = readOptionalNonEmptyString(value['providerId']);
  const modelId = readOptionalNonEmptyString(value['modelId']);
  const workflowStage = readWorkflowStage(value['workflowStage']);
  if (
    !operationId ||
    runId === null ||
    providerId === null ||
    modelId === null ||
    workflowStage === null
  ) {
    return undefined;
  }
  return {
    operationId,
    ...(runId ? { runId } : {}),
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(workflowStage ? { workflowStage } : {}),
  };
}

function readWorkflowStage(value: unknown): GeneratedAssetWorkflowStageRef | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasOnlyKeys(value, WORKFLOW_STAGE_KEYS)) return null;
  const stageId = readNonEmptyString(value['stageId']);
  const workflowId = readOptionalNonEmptyString(value['workflowId']);
  if (!stageId || workflowId === null) return null;
  return {
    stageId,
    ...(workflowId ? { workflowId } : {}),
  };
}

function readGeneratedAssetMediaKind(value: unknown): GeneratedAssetMediaKind | undefined {
  switch (value) {
    case 'image':
    case 'audio':
    case 'video':
    case 'file':
      return value;
    default:
      return undefined;
  }
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readOptionalNonEmptyString(value: unknown): string | undefined | null {
  return value === undefined ? undefined : (readNonEmptyString(value) ?? null);
}

function invalidLifecycle(diagnostic: string): GeneratedAssetRevisionRefValidationResult {
  return { ok: false, diagnostic };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

const LIFECYCLE_KEYS = new Set([
  'assetId',
  'revision',
  'contentDigest',
  'mediaKind',
  'mimeType',
  'contentLocator',
  'generation',
]);
const GENERATION_KEYS = new Set(['operationId', 'runId', 'providerId', 'modelId', 'workflowStage']);
const WORKFLOW_STAGE_KEYS = new Set(['stageId', 'workflowId']);
