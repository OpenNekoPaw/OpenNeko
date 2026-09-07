import {
  contentLocatorKey,
  normalizeWorkspaceContentPath,
  validateContentLocator,
  type ContentLocator,
} from '@neko/content-domain';
import { isHostProjectedRuntimeValue } from '@neko/content-domain';
import type {
  GeneratedAsset,
  GeneratedAssetMediaKind,
  GenerationRecipe,
  GenerationRecipePurpose,
} from '@neko/generation-domain';
import type { GenerationJobSnapshot } from '@neko/generation-domain/job';
import { isCanvasMaterialGenerationContext, type CanvasMaterialGenerationContext } from './canvas';
import {
  isCanvasGenerationEvidence,
  type CanvasGenerationEvidence,
  type CanvasGenerationJobRef,
} from './canvas-material-contracts';
import { hashStableValue } from '@neko/shared';
import {
  isCanvasGenerationProjectionSnapshot,
  type CanvasGenerationProjectionInputMaterial,
  type CanvasGenerationProjectionSnapshot,
} from '../canvas-generation-projection';

export const CANVAS_DEFAULT_DOCUMENT_PATH = 'neko/boards/workspace.nkc' as const;

export type CanvasWorkspaceProjectionKind =
  'markdown' | 'file-reference' | 'generation-job' | GeneratedAssetMediaKind;
export type CanvasWorkspaceArtifactRole = 'source' | 'analysis' | 'output';
export type CanvasWorkspaceDeliveryHost = 'desktop' | 'headless';
export type CanvasWorkspaceDeliveryState =
  'queued' | 'claimed' | 'projected' | 'noop' | 'blocked' | 'conflict' | 'discarded';

export interface CanvasWorkspaceProjectionTarget {
  readonly workspaceId: string;
  /** Stable local workspace URI selected by the Host session. */
  readonly workspaceUri: string;
  readonly canvasId: string;
  readonly documentUri: string;
}

export interface CanvasWorkspaceDeliveryProcess {
  readonly deliveryId: string;
  readonly sourceHost: CanvasWorkspaceDeliveryHost;
  readonly createdAt: string;
  readonly taskId?: string;
  readonly operationId?: string;
  readonly runId?: string;
}

export interface CanvasWorkspaceProjectionProvenance {
  readonly deliveryId: string;
  readonly artifactId: string;
  readonly contentFingerprint: string;
  readonly kind: CanvasWorkspaceProjectionKind;
  readonly role: CanvasWorkspaceArtifactRole;
  readonly sourceId: string;
  readonly sourceArtifactIds?: readonly string[];
  readonly referenceLocators?: readonly ContentLocator[];
  readonly taskId?: string;
  readonly operationId?: string;
  readonly runId?: string;
  readonly createdAt: string;
}

interface CanvasWorkspaceProjectionArtifactBase {
  readonly provenance: CanvasWorkspaceProjectionProvenance;
}

export interface CanvasWorkspaceArtifactDimensions {
  readonly width: number;
  readonly height: number;
}

export type CanvasWorkspaceMarkdownProjectionArtifact = CanvasWorkspaceProjectionArtifactBase & {
  readonly kind: 'markdown';
  readonly title: string;
  readonly markdown: string;
};

export type CanvasWorkspaceResourceProjectionArtifact = CanvasWorkspaceProjectionArtifactBase & {
  readonly kind: Exclude<CanvasWorkspaceProjectionKind, 'markdown' | 'generation-job'>;
  readonly title: string;
  readonly mimeType?: string;
  readonly contentLocator: ContentLocator;
  readonly generation?: CanvasGenerationEvidence;
  /** Portable intrinsic pixel dimensions used to size newly projected image nodes. */
  readonly intrinsicDimensions?: CanvasWorkspaceArtifactDimensions;
};

export type CanvasWorkspaceGenerationJobProjectionArtifact =
  CanvasWorkspaceProjectionArtifactBase & {
    readonly kind: 'generation-job';
    readonly title: string;
    readonly snapshot: CanvasGenerationProjectionSnapshot;
  };

export type CanvasWorkspaceProjectionArtifact =
  | CanvasWorkspaceMarkdownProjectionArtifact
  | CanvasWorkspaceResourceProjectionArtifact
  | CanvasWorkspaceGenerationJobProjectionArtifact;

export interface CanvasWorkspaceProjectionRequest {
  readonly target: CanvasWorkspaceProjectionTarget;
  readonly process: CanvasWorkspaceDeliveryProcess;
  readonly artifacts: readonly CanvasWorkspaceProjectionArtifact[];
}

export interface CanvasWorkspaceDeliveryBatch {
  readonly process: CanvasWorkspaceDeliveryProcess;
  readonly artifacts: readonly CanvasWorkspaceProjectionArtifact[];
}

export interface CanvasWorkspaceProjectionResolvedTarget {
  readonly canvasId: string;
  readonly documentUri: string;
}

export type CanvasWorkspaceProjectionDiagnosticCode =
  | 'workspace-required'
  | 'invalid-canvas-target'
  | 'invalid-canvas-extension'
  | 'missing-projection-identity'
  | 'duplicate-artifact-identity'
  | 'invalid-artifact-relation'
  | 'unsupported-projection-kind'
  | 'invalid-content-locator'
  | 'runtime-value-forbidden'
  | 'delivery-ledger-unavailable'
  | 'delivery-claim-conflict'
  | 'stale-writer'
  | 'projection-conflict'
  | 'projection-write-failed';

export interface CanvasWorkspaceProjectionDiagnostic {
  readonly code: CanvasWorkspaceProjectionDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export function createSafeCanvasWorkspaceProjectionDiagnostic(
  code: CanvasWorkspaceProjectionDiagnosticCode,
): CanvasWorkspaceProjectionDiagnostic {
  const messages: Readonly<Record<CanvasWorkspaceProjectionDiagnosticCode, string>> = {
    'workspace-required': 'Canvas delivery requires one resolved workspace.',
    'invalid-canvas-target': 'Canvas delivery target is invalid.',
    'invalid-canvas-extension': 'The Canvas extension cannot accept Canvas delivery.',
    'missing-projection-identity': 'Canvas delivery identity is incomplete.',
    'duplicate-artifact-identity': 'Canvas delivery contains duplicate artifact identity.',
    'invalid-artifact-relation': 'Canvas delivery contains an invalid creative-content relation.',
    'unsupported-projection-kind': 'Canvas delivery contains an unsupported artifact kind.',
    'invalid-content-locator': 'Canvas delivery contains an invalid durable content locator.',
    'runtime-value-forbidden': 'Canvas delivery contains a forbidden runtime-only value.',
    'delivery-ledger-unavailable': 'Canvas delivery state is unavailable.',
    'delivery-claim-conflict': 'Canvas delivery is queued behind another writer.',
    'stale-writer': 'Canvas writer ownership changed before the delivery completed.',
    'projection-conflict': 'Canvas has user changes that cannot be overwritten safely.',
    'projection-write-failed': 'Canvas could not be updated; durable artifacts remain available.',
  };
  return { code, severity: 'error', message: messages[code] };
}

export interface CanvasWorkspaceProjectionResult {
  readonly deliveryId?: string;
  readonly status: Exclude<CanvasWorkspaceDeliveryState, 'discarded'>;
  readonly target?: CanvasWorkspaceProjectionResolvedTarget;
  readonly nodeIds?: readonly string[];
  readonly connectionIds?: readonly string[];
  readonly artifactRoleCounts?: Readonly<Record<CanvasWorkspaceArtifactRole, number>>;
  readonly writerLeaseId?: string;
  readonly diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[];
}

export interface CanvasWorkspaceDeliveryClaim {
  readonly holderId: string;
  readonly leaseId: string;
  readonly expiresAt: number;
}

export interface CanvasWorkspaceDeliveryReceipt {
  readonly deliveryId: string;
  readonly state: Extract<
    CanvasWorkspaceDeliveryState,
    'projected' | 'noop' | 'blocked' | 'conflict'
  >;
  readonly artifactIdentities: readonly {
    readonly artifactId: string;
    readonly contentFingerprint: string;
    readonly role: CanvasWorkspaceArtifactRole;
  }[];
  readonly target?: CanvasWorkspaceProjectionResolvedTarget;
  readonly nodeIds?: readonly string[];
  readonly connectionIds?: readonly string[];
  readonly writerLeaseId: string;
  readonly diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[];
  readonly completedAt: number;
}

export interface CreateGeneratedAssetWorkspaceDeliveryTarget {
  readonly workspaceId: string;
  readonly workspaceUri: string;
  readonly canvasId: string;
  readonly documentUri: string;
  readonly sourceHost: CanvasWorkspaceDeliveryHost;
  readonly jobRef: CanvasGenerationJobRef;
}

export interface CreateGenerationJobWorkspaceDeliveryTarget {
  readonly workspaceId: string;
  readonly workspaceUri: string;
  readonly canvasId: string;
  readonly documentUri: string;
  readonly sourceHost: CanvasWorkspaceDeliveryHost;
  /** Exact owning Tool operation identity; never inferred from an active Canvas. */
  readonly operationId: string;
}

export function createGenerationJobWorkspaceDeliveryRequest(
  snapshot: GenerationJobSnapshot,
  target: CreateGenerationJobWorkspaceDeliveryTarget,
): CanvasWorkspaceProjectionRequest {
  const projection = projectGenerationJobSnapshot(snapshot);
  const contentFingerprint = hashStableValue({
    ref: projection.ref,
    phase: projection.phase,
    recipe: projection.recipe,
    inputMaterials: projection.inputMaterials,
    submissionId: projection.submissionId,
    recipeInputFingerprint: projection.recipeInputFingerprint,
    summary: projection.summary,
    resultLocators: projection.resultLocators,
    failure: projection.failure,
  });
  const deliveryId = `generation-job:${hashStableValue({
    operationId: target.operationId,
    contentFingerprint,
  })}`;
  const createdAt = new Date(snapshot.updatedAt).toISOString();
  return {
    target: {
      workspaceId: target.workspaceId,
      workspaceUri: target.workspaceUri,
      canvasId: target.canvasId,
      documentUri: target.documentUri,
    },
    process: {
      deliveryId,
      sourceHost: target.sourceHost,
      operationId: target.operationId,
      createdAt,
    },
    artifacts: [
      {
        kind: 'generation-job',
        title: projection.title,
        snapshot: projection,
        provenance: {
          deliveryId,
          artifactId: `generation-job:${snapshot.ref.jobId}`,
          contentFingerprint,
          kind: 'generation-job',
          role: 'output',
          sourceId: snapshot.ref.jobId,
          operationId: target.operationId,
          createdAt,
        },
      },
    ],
  };
}

export function createGeneratedAssetWorkspaceDeliveryRequest(
  asset: GeneratedAsset,
  target: CreateGeneratedAssetWorkspaceDeliveryTarget,
): CanvasWorkspaceProjectionRequest {
  return createGeneratedAssetsWorkspaceDeliveryRequest([asset], target);
}

export function createGeneratedAssetsWorkspaceDeliveryRequest(
  assets: readonly GeneratedAsset[],
  target: CreateGeneratedAssetWorkspaceDeliveryTarget,
): CanvasWorkspaceProjectionRequest {
  const batch = createGeneratedAssetsWorkspaceDeliveryBatch(
    assets,
    target.sourceHost,
    target.jobRef,
  );
  return {
    target: {
      workspaceId: target.workspaceId,
      workspaceUri: target.workspaceUri,
      canvasId: target.canvasId,
      documentUri: target.documentUri,
    },
    ...batch,
  };
}

export function createGeneratedAssetsWorkspaceDeliveryBatch(
  assets: readonly GeneratedAsset[],
  sourceHost: CanvasWorkspaceDeliveryHost,
  jobRef: CanvasGenerationJobRef,
): CanvasWorkspaceDeliveryBatch {
  const [firstAsset] = assets;
  if (!firstAsset) throw new Error('Generated output delivery requires at least one asset.');
  for (const asset of assets) {
    if (!asset.lifecycle) {
      throw new Error(`Generated output ${asset.id} has no durable lifecycle reference.`);
    }
    if (asset.lifecycle.generation.operationId !== jobRef.jobId) {
      throw new Error(
        `Generated output ${asset.id} does not belong to Generation Job ${jobRef.jobId}.`,
      );
    }
  }
  const identities = assets.map((asset) => ({
    assetId: asset.id,
    contentFingerprint: requireGeneratedAssetLifecycle(asset).revision,
  }));
  const deliveryId = `generated-output-batch:${hashGeneratedAssetIdentities(identities)}`;
  const operationId = sharedString(
    assets.map((asset) => requireGeneratedAssetLifecycle(asset).generation.operationId),
  );
  const runId = sharedString(
    assets.map((asset) => requireGeneratedAssetLifecycle(asset).generation.runId),
  );
  const createdAt = assets.reduce(
    (latest, asset) => (asset.generatedAt > latest ? asset.generatedAt : latest),
    firstAsset.generatedAt,
  );
  return {
    process: {
      deliveryId,
      sourceHost,
      ...(operationId ? { operationId } : {}),
      ...(runId ? { runId } : {}),
      createdAt,
    },
    artifacts: assets.map((asset) => {
      const lifecycle = requireGeneratedAssetLifecycle(asset);
      const generationContext = createCanvasMaterialGenerationContext(asset);
      if (!generationContext) {
        throw new Error(`Generated output ${asset.id} has no portable generation summary.`);
      }
      return {
        kind: lifecycle.mediaKind,
        title: asset.prompt?.trim() || `Generated ${lifecycle.mediaKind}`,
        mimeType: asset.mimeType,
        contentLocator: lifecycle.contentLocator,
        generation: { jobRef, summary: generationContext },
        provenance: {
          deliveryId,
          artifactId: asset.id,
          contentFingerprint: lifecycle.revision,
          kind: lifecycle.mediaKind,
          role: 'output' as const,
          sourceId: asset.id,
          operationId: lifecycle.generation.operationId,
          ...(lifecycle.generation.runId ? { runId: lifecycle.generation.runId } : {}),
          createdAt: asset.generatedAt,
        },
      };
    }),
  };
}

function hashGeneratedAssetIdentities(
  identities: readonly { readonly assetId: string; readonly contentFingerprint: string }[],
): string {
  return hashStableValue(
    identities
      .map(({ assetId, contentFingerprint }) => ({ assetId, contentFingerprint }))
      .sort((left, right) =>
        `${left.assetId}:${left.contentFingerprint}`.localeCompare(
          `${right.assetId}:${right.contentFingerprint}`,
        ),
      ),
  ).slice(0, 32);
}

function requireGeneratedAssetLifecycle(
  asset: GeneratedAsset,
): NonNullable<GeneratedAsset['lifecycle']> {
  if (!asset.lifecycle) {
    throw new Error(`Generated output ${asset.id} has no durable lifecycle reference.`);
  }
  return asset.lifecycle;
}

function sharedString(values: readonly (string | undefined)[]): string | undefined {
  const present = values.filter((value): value is string => typeof value === 'string');
  if (present.length !== values.length || present.length === 0) return undefined;
  return present.every((value) => value === present[0]) ? present[0] : undefined;
}

function createCanvasMaterialGenerationContext(
  asset: GeneratedAsset,
): CanvasMaterialGenerationContext | undefined {
  const prompt = asset.prompt?.trim();
  const model = asset.model?.trim();
  const sourceNodeId = asset.sourceNodeId?.trim();
  const shared = {
    ...(prompt ? { prompt } : {}),
    ...(model ? { model } : {}),
    ...(sourceNodeId ? { sourceNodeId } : {}),
    ...(asset.generatedAt.trim() ? { generatedAt: asset.generatedAt.trim() } : {}),
  };
  const context: CanvasMaterialGenerationContext =
    asset.type === 'generated-image'
      ? {
          ...shared,
          ...(asset.ratio.trim() ? { aspectRatio: asset.ratio.trim() } : {}),
          ...(asset.width > 0 ? { width: asset.width } : {}),
          ...(asset.height > 0 ? { height: asset.height } : {}),
        }
      : asset.type === 'generated-video'
        ? {
            ...shared,
            ...(asset.width > 0 ? { width: asset.width } : {}),
            ...(asset.height > 0 ? { height: asset.height } : {}),
            ...(asset.duration > 0 ? { duration: asset.duration } : {}),
          }
        : asset.type === 'generated-audio'
          ? { ...shared, ...(asset.duration > 0 ? { duration: asset.duration } : {}) }
          : shared;
  return isCanvasMaterialGenerationContext(context) ? context : undefined;
}

function projectGenerationJobSnapshot(
  snapshot: GenerationJobSnapshot,
): CanvasGenerationProjectionSnapshot {
  const jobRequest = snapshot.request;
  const request = jobRequest.request;
  const recipe = generationRecipe(jobRequest);
  const parameters: CanvasMaterialGenerationContext = (() => {
    switch (snapshot.request.generationType) {
      case 'prompt':
        return {};
      case 'text-to-image':
      case 'image-to-image':
      case 'image-edit':
        return {
          ...(snapshot.request.request.aspectRatio
            ? { aspectRatio: snapshot.request.request.aspectRatio }
            : {}),
          ...(snapshot.request.request.width ? { width: snapshot.request.request.width } : {}),
          ...(snapshot.request.request.height ? { height: snapshot.request.request.height } : {}),
        };
      case 'text-to-video':
      case 'image-to-video':
      case 'video-to-video':
      case 'video-edit':
        return {
          ...(snapshot.request.request.aspectRatio
            ? { aspectRatio: snapshot.request.request.aspectRatio }
            : {}),
          ...(snapshot.request.request.duration
            ? { duration: snapshot.request.request.duration }
            : {}),
        };
      case 'text-to-audio':
        return snapshot.request.request.duration
          ? { duration: snapshot.request.request.duration }
          : {};
    }
  })();
  const summary: CanvasMaterialGenerationContext = {
    prompt: request.prompt,
    model: `${snapshot.request.providerId}/${snapshot.request.modelId}`,
    generatedAt: new Date(snapshot.createdAt).toISOString(),
    ...parameters,
  };
  return {
    ref: snapshot.ref,
    ...(snapshot.retryOf ? { retryOf: snapshot.retryOf } : {}),
    ...(snapshot.regenerateOf ? { regenerateOf: snapshot.regenerateOf } : {}),
    phase: snapshot.phase,
    title: generationJobTitle(snapshot),
    inputNodeIds: [],
    inputMaterials: generationInputMaterials(snapshot.request),
    mediaKind: generationMediaKind(snapshot.request.generationType),
    summary,
    recipe,
    ...(snapshot.submissionId ? { submissionId: snapshot.submissionId } : {}),
    recipeInputFingerprint: hashStableValue({ recipe, request: snapshot.request }),
    ...(snapshot.resultLocators ? { resultLocators: snapshot.resultLocators } : {}),
    ...(snapshot.failure ? { failure: snapshot.failure } : {}),
  };
}

function generationRecipe(request: GenerationJobSnapshot['request']): GenerationRecipe {
  const model = {
    purpose: generationRecipePurpose(request.generationType),
    providerId: request.providerId,
    modelId: request.modelId,
  } as const;
  switch (request.generationType) {
    case 'prompt':
      return {
        kind: 'prompt',
        prompt: request.request.prompt,
        model,
        ...(request.request.temperature !== undefined
          ? { temperature: request.request.temperature }
          : {}),
        ...(request.request.maxOutputTokens !== undefined
          ? { maxOutputTokens: request.request.maxOutputTokens }
          : {}),
      };
    case 'text-to-image':
    case 'image-to-image':
    case 'image-edit':
      return {
        kind: 'image',
        prompt: request.request.prompt,
        model,
        ...(request.request.negativePrompt !== undefined
          ? { negativePrompt: request.request.negativePrompt }
          : {}),
        ...(request.request.width !== undefined ? { width: request.request.width } : {}),
        ...(request.request.height !== undefined ? { height: request.request.height } : {}),
        ...(request.request.aspectRatio !== undefined
          ? { aspectRatio: request.request.aspectRatio }
          : {}),
        ...(request.request.count !== undefined ? { count: request.request.count } : {}),
        ...(request.request.quality !== undefined ? { quality: request.request.quality } : {}),
        ...(request.request.style !== undefined ? { style: request.request.style } : {}),
      };
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return {
        kind: 'video',
        prompt: request.request.prompt,
        model,
        ...(request.request.negativePrompt !== undefined
          ? { negativePrompt: request.request.negativePrompt }
          : {}),
        ...(request.request.duration !== undefined ? { duration: request.request.duration } : {}),
        ...(request.request.resolution !== undefined
          ? { resolution: request.request.resolution }
          : {}),
        ...(request.request.fps !== undefined ? { fps: request.request.fps } : {}),
        ...(request.request.aspectRatio !== undefined
          ? { aspectRatio: request.request.aspectRatio }
          : {}),
        ...(request.request.generateAudio !== undefined
          ? { generateAudio: request.request.generateAudio }
          : {}),
        ...(request.request.motionStrength !== undefined
          ? { motionStrength: request.request.motionStrength }
          : {}),
        ...(request.request.cameraMovement !== undefined
          ? { cameraMovement: request.request.cameraMovement }
          : {}),
        ...(request.request.cameraAngle !== undefined
          ? { cameraAngle: request.request.cameraAngle }
          : {}),
        ...(request.request.shotScale !== undefined
          ? { shotScale: request.request.shotScale }
          : {}),
        ...(request.request.editInstruction !== undefined
          ? { editInstruction: request.request.editInstruction }
          : {}),
      };
    case 'text-to-audio':
      return {
        kind: 'audio',
        prompt: request.request.prompt,
        model,
        ...(request.request.negativePrompt !== undefined
          ? { negativePrompt: request.request.negativePrompt }
          : {}),
        ...(request.request.duration !== undefined ? { duration: request.request.duration } : {}),
        ...(request.request.format !== undefined ? { format: request.request.format } : {}),
      };
  }
}

function generationInputMaterials(
  request: GenerationJobSnapshot['request'],
): readonly CanvasGenerationProjectionInputMaterial[] {
  switch (request.generationType) {
    case 'image-to-image':
    case 'image-edit':
      return request.request.referenceImageLocator
        ? [{ locator: request.request.referenceImageLocator, mediaKind: 'image' }]
        : [];
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return deduplicateInputMaterials(
        (request.request.inputs ?? []).map((input) => ({
          locator: input.locator,
          mediaKind: input.type,
        })),
      );
    case 'prompt':
    case 'text-to-image':
    case 'text-to-video':
    case 'text-to-audio':
      return [];
  }
}

function deduplicateInputMaterials(
  inputs: readonly CanvasGenerationProjectionInputMaterial[],
): readonly CanvasGenerationProjectionInputMaterial[] {
  const byLocator = new Map<string, CanvasGenerationProjectionInputMaterial>();
  for (const input of inputs) {
    const key = contentLocatorKey(input.locator);
    const existing = byLocator.get(key);
    if (existing && existing.mediaKind !== input.mediaKind) {
      throw new Error(`Generation input "${key}" has conflicting media kinds.`);
    }
    byLocator.set(key, input);
  }
  return [...byLocator.values()];
}

function generationRecipePurpose(
  generationType: GenerationJobSnapshot['request']['generationType'],
): GenerationRecipePurpose {
  if (generationType === 'prompt') return 'canvas.prompt';
  if (
    generationType === 'text-to-image' ||
    generationType === 'image-to-image' ||
    generationType === 'image-edit'
  ) {
    return 'image.generate';
  }
  if (
    generationType === 'text-to-video' ||
    generationType === 'image-to-video' ||
    generationType === 'video-to-video' ||
    generationType === 'video-edit'
  ) {
    return 'video.generate';
  }
  return 'audio.generate';
}

function generationJobTitle(snapshot: GenerationJobSnapshot): string {
  const model = `${snapshot.request.providerId}/${snapshot.request.modelId}`;
  switch (snapshot.request.generationType) {
    case 'prompt':
      return `Generate document · ${model}`;
    case 'text-to-image':
    case 'image-to-image':
    case 'image-edit':
      return `Generate image · ${model}`;
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return `Generate video · ${model}`;
    case 'text-to-audio':
      return `Generate audio · ${model}`;
  }
}

function generationMediaKind(
  generationType: GenerationJobSnapshot['request']['generationType'],
): CanvasGenerationProjectionSnapshot['mediaKind'] {
  if (generationType === 'prompt') return 'document';
  if (
    generationType === 'text-to-image' ||
    generationType === 'image-to-image' ||
    generationType === 'image-edit'
  ) {
    return 'image';
  }
  if (
    generationType === 'text-to-video' ||
    generationType === 'image-to-video' ||
    generationType === 'video-to-video' ||
    generationType === 'video-edit'
  ) {
    return 'video';
  }
  return 'audio';
}

const PROJECTION_KINDS = new Set<string>([
  'markdown',
  'file-reference',
  'generation-job',
  'image',
  'audio',
  'video',
  'file',
]);

const ARTIFACT_ROLES = new Set<string>(['source', 'analysis', 'output']);

const RUNTIME_KEYS = new Set([
  'assetMembership',
  'base64',
  'cachePath',
  'canvasData',
  'dataUrl',
  'localPath',
  'processHandle',
  'providerUrl',
  'rawCanvas',
  'renderUri',
  'token',
  'webviewUri',
]);

type ArtifactRecord = Record<string, unknown> & {
  readonly provenance: Record<string, unknown>;
};

export function resolveDefaultCanvasDocumentUri(workspaceUri: string): string {
  return resolveCanvasDocumentUri(workspaceUri, CANVAS_DEFAULT_DOCUMENT_PATH);
}

export function resolveCanvasDocumentUri(workspaceUri: string, canvasId: string): string {
  const workspaceUrl = parseLocalFileUri(workspaceUri);
  if (!workspaceUrl) {
    throw new Error('Canvas target requires a local file workspace URI.');
  }
  if (
    normalizeWorkspaceContentPath(canvasId) !== canvasId ||
    !canvasId.toLowerCase().endsWith('.nkc')
  ) {
    throw new Error('Canvas target requires a normalized Workspace-relative .nkc identity.');
  }
  const pathname = workspaceUrl.pathname.endsWith('/')
    ? workspaceUrl.pathname
    : `${workspaceUrl.pathname}/`;
  const encodedCanvasId = canvasId.split('/').map(encodeURIComponent).join('/');
  return new URL(
    encodedCanvasId,
    `${workspaceUrl.protocol}//${workspaceUrl.host}${pathname}`,
  ).toString();
}

export function isCanvasWorkspaceProjectionRequest(
  value: unknown,
): value is CanvasWorkspaceProjectionRequest {
  if (!isRecord(value)) return false;
  const target = value['target'];
  const process = value['process'];
  const artifacts = value['artifacts'];
  if (!isRecord(target) || !isRecord(process) || !Array.isArray(artifacts)) return false;
  if (
    typeof target['workspaceId'] !== 'string' ||
    typeof target['workspaceUri'] !== 'string' ||
    typeof target['canvasId'] !== 'string' ||
    typeof target['documentUri'] !== 'string'
  ) {
    return false;
  }
  if (
    typeof process['deliveryId'] !== 'string' ||
    typeof process['sourceHost'] !== 'string' ||
    typeof process['createdAt'] !== 'string'
  ) {
    return false;
  }
  return artifacts.every((artifact) => {
    if (!isRecord(artifact) || !isRecord(artifact['provenance'])) return false;
    const provenance = artifact['provenance'];
    const contentLocator =
      artifact['kind'] === 'markdown' || artifact['kind'] === 'generation-job'
        ? undefined
        : validateContentLocator(artifact['contentLocator']);
    return (
      typeof artifact['kind'] === 'string' &&
      typeof artifact['title'] === 'string' &&
      (artifact['kind'] === 'markdown'
        ? typeof artifact['markdown'] === 'string'
        : artifact['kind'] === 'generation-job'
          ? isCanvasGenerationProjectionSnapshot(artifact['snapshot']) &&
            artifact['contentLocator'] === undefined
          : contentLocator?.ok === true &&
            (artifact['generation'] === undefined ||
              isCanvasGenerationEvidence(artifact['generation'])) &&
            artifact['resourceRef'] === undefined &&
            artifact['documentResourceRef'] === undefined &&
            artifact['localPath'] === undefined) &&
      typeof provenance['deliveryId'] === 'string' &&
      typeof provenance['artifactId'] === 'string' &&
      typeof provenance['contentFingerprint'] === 'string' &&
      typeof provenance['kind'] === 'string' &&
      typeof provenance['role'] === 'string' &&
      typeof provenance['sourceId'] === 'string' &&
      (provenance['referenceLocators'] === undefined ||
        (Array.isArray(provenance['referenceLocators']) &&
          provenance['referenceLocators'].every(
            (locator) => validateContentLocator(locator).ok,
          ))) &&
      (provenance['sourceArtifactIds'] === undefined ||
        (Array.isArray(provenance['sourceArtifactIds']) &&
          provenance['sourceArtifactIds'].every((sourceId) => typeof sourceId === 'string'))) &&
      typeof provenance['createdAt'] === 'string'
    );
  });
}

export function validateCanvasWorkspaceProjectionRequest(
  request: CanvasWorkspaceProjectionRequest,
): readonly CanvasWorkspaceProjectionDiagnostic[] {
  const diagnostics: CanvasWorkspaceProjectionDiagnostic[] = [];
  if (!isRecord(request)) {
    return [diagnostic('workspace-required', 'Canvas delivery must be an object.')];
  }
  if (!isRecord(request.target)) {
    diagnostics.push(
      diagnostic('workspace-required', 'Canvas projection requires a target object.', ['target']),
    );
  }
  if (!isRecord(request.process)) {
    diagnostics.push(
      diagnostic(
        'missing-projection-identity',
        'Canvas projection requires a delivery process object.',
        ['process'],
      ),
    );
  }
  if (!Array.isArray(request.artifacts)) {
    diagnostics.push(
      diagnostic('missing-projection-identity', 'Canvas delivery artifacts must be an array.', [
        'artifacts',
      ]),
    );
  }
  if (
    !isRecord(request.target) ||
    !isRecord(request.process) ||
    !Array.isArray(request.artifacts)
  ) {
    visitForbiddenValues(request, [], diagnostics);
    return diagnostics;
  }
  if (!isNonEmptyString(request.target.workspaceId)) {
    diagnostics.push(
      diagnostic('workspace-required', 'Canvas projection requires a stable workspace identity.', [
        'target',
        'workspaceId',
      ]),
    );
  }
  if (!parseLocalFileUri(request.target.workspaceUri)) {
    diagnostics.push(
      diagnostic(
        'workspace-required',
        'Canvas projection requires one explicit local workspace URI.',
        ['target', 'workspaceUri'],
      ),
    );
  }
  let expectedDocumentUri: string | undefined;
  try {
    expectedDocumentUri = resolveCanvasDocumentUri(
      request.target.workspaceUri,
      request.target.canvasId,
    );
  } catch (error) {
    diagnostics.push(
      diagnostic(
        'invalid-canvas-target',
        error instanceof Error ? error.message : 'Canvas target identity is invalid.',
        ['target', 'canvasId'],
      ),
    );
  }
  if (!parseLocalFileUri(request.target.documentUri)) {
    diagnostics.push(
      diagnostic('invalid-canvas-target', 'Canvas target must be a durable local file URI.', [
        'target',
        'documentUri',
      ]),
    );
  } else if (!uriPathname(request.target.documentUri)?.toLowerCase().endsWith('.nkc')) {
    diagnostics.push(
      diagnostic('invalid-canvas-extension', 'Canvas target must end with .nkc.', [
        'target',
        'documentUri',
      ]),
    );
  } else if (
    expectedDocumentUri !== undefined &&
    request.target.documentUri !== expectedDocumentUri
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-canvas-target',
        'Canvas document URI must match its Workspace-relative identity.',
        ['target', 'documentUri'],
      ),
    );
  }

  for (const key of ['deliveryId', 'createdAt'] as const) {
    if (!isNonEmptyString(request.process[key])) {
      diagnostics.push(
        diagnostic('missing-projection-identity', `Canvas delivery ${key} is required.`, [
          'process',
          key,
        ]),
      );
    }
  }
  if (!['desktop', 'headless'].includes(request.process.sourceHost)) {
    diagnostics.push(
      diagnostic('missing-projection-identity', 'Canvas delivery sourceHost is invalid.', [
        'process',
        'sourceHost',
      ]),
    );
  }
  if (!Array.isArray(request.artifacts) || request.artifacts.length === 0) {
    diagnostics.push(
      diagnostic('missing-projection-identity', 'Canvas delivery requires at least one artifact.', [
        'artifacts',
      ]),
    );
  }

  const identities = new Set<string>();
  request.artifacts.forEach((artifact, index) => {
    if (!isArtifactRecord(artifact)) {
      diagnostics.push(
        diagnostic(
          'missing-projection-identity',
          'Canvas artifact must be an object with provenance.',
          ['artifacts', index],
        ),
      );
      return;
    }
    validateArtifact(request, artifact, index, identities, diagnostics);
  });
  if (
    request.artifacts.some((artifact) => artifact.kind === 'generation-job') &&
    request.artifacts.length !== 1
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-artifact-relation',
        'Generation Job snapshots require an isolated Canvas delivery batch.',
        ['artifacts'],
      ),
    );
  }
  validateArtifactRelations(request.artifacts, diagnostics);

  visitForbiddenValues(request, [], diagnostics);
  return diagnostics;
}

function validateArtifactRelations(
  artifacts: readonly CanvasWorkspaceProjectionArtifact[],
  diagnostics: CanvasWorkspaceProjectionDiagnostic[],
): void {
  const artifactIds = new Set<string>();
  let relationsValid = true;
  artifacts.forEach((artifact, index) => {
    const artifactId = artifact.provenance.artifactId;
    if (!isNonEmptyString(artifactId)) return;
    if (artifactIds.has(artifactId)) {
      relationsValid = false;
      diagnostics.push(
        diagnostic(
          'invalid-artifact-relation',
          'Canvas artifact identities must be unique within one relation batch.',
          ['artifacts', index, 'provenance', 'artifactId'],
        ),
      );
    }
    artifactIds.add(artifactId);
  });

  artifacts.forEach((artifact, index) => {
    const sourceArtifactIds = artifact.provenance.sourceArtifactIds;
    const referenceLocators = artifact.provenance.referenceLocators;
    if (
      referenceLocators !== undefined &&
      (!Array.isArray(referenceLocators) ||
        referenceLocators.some((locator) => !validateContentLocator(locator).ok))
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-content-locator',
          'Canvas document references require canonical content locators.',
          ['artifacts', index, 'provenance', 'referenceLocators'],
        ),
      );
    }
    if (sourceArtifactIds === undefined) return;
    const path = ['artifacts', index, 'provenance', 'sourceArtifactIds'] as const;
    if (!Array.isArray(sourceArtifactIds)) {
      relationsValid = false;
      diagnostics.push(
        diagnostic(
          'invalid-artifact-relation',
          'Canvas artifact sourceArtifactIds must be an array of stable artifact identities.',
          path,
        ),
      );
      return;
    }

    const seen = new Set<string>();
    sourceArtifactIds.forEach((sourceArtifactId, sourceIndex) => {
      if (!isNonEmptyString(sourceArtifactId)) {
        relationsValid = false;
        diagnostics.push(
          diagnostic(
            'invalid-artifact-relation',
            'Canvas artifact relation requires a non-empty source artifact identity.',
            [...path, sourceIndex],
          ),
        );
        return;
      }
      if (sourceArtifactId === artifact.provenance.artifactId) {
        relationsValid = false;
        diagnostics.push(
          diagnostic('invalid-artifact-relation', 'Canvas artifact cannot derive from itself.', [
            ...path,
            sourceIndex,
          ]),
        );
      }
      if (!artifactIds.has(sourceArtifactId)) {
        relationsValid = false;
        diagnostics.push(
          diagnostic(
            'invalid-artifact-relation',
            'Canvas artifact relation must resolve within the delivery batch.',
            [...path, sourceIndex],
          ),
        );
      }
      if (seen.has(sourceArtifactId)) {
        relationsValid = false;
        diagnostics.push(
          diagnostic(
            'invalid-artifact-relation',
            'Canvas artifact relation cannot repeat one source identity.',
            [...path, sourceIndex],
          ),
        );
      }
      seen.add(sourceArtifactId);
    });
  });

  if (!relationsValid) return;
  const pending = new Map(
    artifacts.map((artifact) => [
      artifact.provenance.artifactId,
      artifact.provenance.sourceArtifactIds ?? [],
    ]),
  );
  const resolved = new Set<string>();
  while (pending.size > 0) {
    const next = [...pending].find(([, sourceIds]) =>
      sourceIds.every((sourceId) => resolved.has(sourceId)),
    );
    if (!next) {
      diagnostics.push(
        diagnostic(
          'invalid-artifact-relation',
          'Canvas artifact relations must not contain a dependency cycle.',
          ['artifacts'],
        ),
      );
      return;
    }
    pending.delete(next[0]);
    resolved.add(next[0]);
  }
}

function validateArtifact(
  request: CanvasWorkspaceProjectionRequest,
  artifact: ArtifactRecord,
  index: number,
  identities: Set<string>,
  diagnostics: CanvasWorkspaceProjectionDiagnostic[],
): void {
  const path = ['artifacts', index] as const;
  const provenance = artifact.provenance;
  for (const key of [
    'deliveryId',
    'artifactId',
    'contentFingerprint',
    'sourceId',
    'createdAt',
  ] as const) {
    if (!isNonEmptyString(provenance[key])) {
      diagnostics.push(
        diagnostic('missing-projection-identity', `Canvas artifact ${key} is required.`, [
          ...path,
          'provenance',
          key,
        ]),
      );
    }
  }
  if (provenance.deliveryId !== request.process.deliveryId) {
    diagnostics.push(
      diagnostic(
        'missing-projection-identity',
        'Canvas artifact deliveryId must match the enclosing delivery.',
        [...path, 'provenance', 'deliveryId'],
      ),
    );
  }
  if (
    !isProjectionKind(provenance['kind']) ||
    !isProjectionKind(artifact['kind']) ||
    provenance['kind'] !== artifact['kind']
  ) {
    diagnostics.push(
      diagnostic(
        'unsupported-projection-kind',
        'Canvas artifact kind must be supported and match provenance.',
        [...path, 'kind'],
      ),
    );
  }
  if (!isArtifactRole(provenance['role'])) {
    diagnostics.push(
      diagnostic('missing-projection-identity', 'Canvas artifact role is invalid.', [
        ...path,
        'provenance',
        'role',
      ]),
    );
  }
  const artifactId = provenance['artifactId'];
  const contentFingerprint = provenance['contentFingerprint'];
  if (typeof artifactId === 'string' && typeof contentFingerprint === 'string') {
    const identity = `${artifactId}:${contentFingerprint}`;
    if (identities.has(identity)) {
      diagnostics.push(
        diagnostic(
          'duplicate-artifact-identity',
          'Canvas delivery contains a duplicate artifact identity.',
          [...path, 'provenance'],
        ),
      );
    }
    identities.add(identity);
  }

  if (artifact['kind'] !== 'markdown' && artifact['kind'] !== 'generation-job') {
    const locator = validateContentLocator(artifact['contentLocator']);
    if (
      locator.ok &&
      artifact['generation'] !== undefined &&
      !isCanvasGenerationEvidence(artifact['generation'])
    ) {
      diagnostics.push(
        diagnostic(
          'missing-projection-identity',
          'Generated output projection requires immutable Generation Job evidence.',
          [...path, 'generation'],
        ),
      );
    }
  }
  if (
    artifact['kind'] !== 'markdown' &&
    artifact['kind'] !== 'generation-job' &&
    artifact['intrinsicDimensions'] !== undefined &&
    !isCanvasWorkspaceArtifactDimensions(artifact['intrinsicDimensions'])
  ) {
    diagnostics.push(
      diagnostic(
        'runtime-value-forbidden',
        'Canvas artifact dimensions must contain positive finite pixel dimensions.',
        [...path, 'intrinsicDimensions'],
      ),
    );
  }
  if (artifact.kind === 'markdown') {
    if (!isNonEmptyString(artifact['title']) || !isNonEmptyString(artifact['markdown'])) {
      diagnostics.push(
        diagnostic(
          'missing-projection-identity',
          'Markdown projection requires a title and non-empty content.',
          path,
        ),
      );
    }
  } else if (artifact.kind === 'generation-job') {
    if (
      !isNonEmptyString(artifact['title']) ||
      !isCanvasGenerationProjectionSnapshot(artifact['snapshot'])
    ) {
      diagnostics.push(
        diagnostic(
          'missing-projection-identity',
          'Generation Job projection requires a title and canonical snapshot.',
          path,
        ),
      );
    }
    if (artifact['contentLocator'] !== undefined) {
      diagnostics.push(
        diagnostic(
          'invalid-content-locator',
          'Generation Job projection must not expose a result ContentLocator before settlement.',
          [...path, 'contentLocator'],
        ),
      );
    }
  } else if (
    artifact['resourceRef'] !== undefined ||
    artifact['documentResourceRef'] !== undefined ||
    artifact['localPath'] !== undefined
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-content-locator',
        'Canvas file and media artifacts require contentLocator.',
        path,
      ),
    );
  } else {
    const locator = validateContentLocator(artifact['contentLocator']);
    if (!locator.ok) {
      diagnostics.push(
        diagnostic(
          'invalid-content-locator',
          artifact['contentLocator'] === undefined
            ? 'File and media projection requires exactly one contentLocator.'
            : locator.diagnostics.map((entry) => entry.message).join('; '),
          [...path, 'contentLocator'],
        ),
      );
    }
  }
}

export function validateCanvasWorkspaceProjectionResult(
  result: CanvasWorkspaceProjectionResult,
): readonly CanvasWorkspaceProjectionDiagnostic[] {
  const diagnostics: CanvasWorkspaceProjectionDiagnostic[] = [];
  if ((result.status === 'blocked' || result.status === 'conflict') && result.target) {
    diagnostics.push(
      diagnostic(
        'invalid-canvas-target',
        'Blocked Canvas projection results must not expose a writable target.',
        ['target'],
      ),
    );
  }
  if ((result.status === 'projected' || result.status === 'noop') && !result.target) {
    diagnostics.push(
      diagnostic(
        'invalid-canvas-target',
        'Successful Canvas projection results require a resolved target.',
        ['target'],
      ),
    );
  }
  return diagnostics;
}

function visitForbiddenValues(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasWorkspaceProjectionDiagnostic[],
): void {
  if (typeof value === 'string') {
    if (isRuntimeValue(value)) {
      diagnostics.push(
        diagnostic(
          'runtime-value-forbidden',
          'Canvas projection contracts must not contain runtime or cache identities.',
          path,
        ),
      );
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitForbiddenValues(entry, [...path, index], diagnostics));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (RUNTIME_KEYS.has(key)) {
      diagnostics.push(
        diagnostic(
          'runtime-value-forbidden',
          `Canvas projection contracts must not contain runtime field ${key}.`,
          [...path, key],
        ),
      );
      continue;
    }
    visitForbiddenValues(entry, [...path, key], diagnostics);
  }
}

function parseLocalFileUri(value: string | undefined): URL | undefined {
  if (!isNonEmptyString(value)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'file:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  return isRecord(value) && isRecord(value['provenance']);
}

function isCanvasWorkspaceArtifactDimensions(
  value: unknown,
): value is CanvasWorkspaceArtifactDimensions {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'width' && key !== 'height')) {
    return false;
  }
  return (
    typeof value['width'] === 'number' &&
    Number.isFinite(value['width']) &&
    value['width'] > 0 &&
    typeof value['height'] === 'number' &&
    Number.isFinite(value['height']) &&
    value['height'] > 0
  );
}

function isProjectionKind(value: unknown): value is CanvasWorkspaceProjectionKind {
  return typeof value === 'string' && PROJECTION_KINDS.has(value);
}

function isArtifactRole(value: unknown): value is CanvasWorkspaceArtifactRole {
  return typeof value === 'string' && ARTIFACT_ROLES.has(value);
}

function uriPathname(value: string): string | undefined {
  return parseLocalFileUri(value)?.pathname;
}

function isRuntimeValue(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, '/');
  return (
    normalized.split('/').some((segment) => segment.startsWith('.')) ||
    isHostProjectedRuntimeValue(normalized) ||
    /^(?:render|preview):/i.test(normalized)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function diagnostic(
  code: CanvasWorkspaceProjectionDiagnosticCode,
  message: string,
  path?: readonly (string | number)[],
): CanvasWorkspaceProjectionDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    ...(path ? { path } : {}),
  };
}
