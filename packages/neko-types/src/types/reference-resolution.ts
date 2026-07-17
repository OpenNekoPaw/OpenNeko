import type { CanvasNode, CanvasNodeType } from './canvas';
import type {
  ArtifactMediaItem,
  ArtifactResourceRef,
  CompositeArtifact,
  CompositeArtifactBlock,
  GenericTable,
  GenericTableCell,
} from './composite-artifact';
import type { ShotImagePrepPlan } from './shot-image-prep';
import type { StoryboardMediaRef, StoryboardMediaRole, StoryboardTable } from './storyboard-table';

export const REFERENCE_DESCRIPTOR_SCHEMA_VERSION = 1 as const;
export const REFERENCE_DESCRIPTOR_KIND = 'reference-descriptor' as const;

export const REFERENCE_SOURCE_KINDS = [
  'canvas-node',
  'canvas-document',
  'composite-artifact',
  'generic-table',
  'shot-image-prep-plan',
  'character-memory',
  'storyboard-table',
] as const;

export const REFERENCE_ROLES = [
  'source',
  'source-panel',
  'reference',
  'subject',
  'character-reference',
  'scene-reference',
  'style',
  'mask',
  'layout',
  'previous-shot',
  'keyframe',
  'thumbnail',
  'derived',
  'output',
  'voice',
  'semantic-range',
] as const;

export const REFERENCE_MODALITIES = [
  'image',
  'video',
  'audio',
  'text',
  'model',
  'document',
  'resource',
  'entity',
  'unknown',
] as const;

export const REFERENCE_KINDS = [
  'resource',
  'document-resource',
  'storyboard-media',
  'canvas-node',
  'entity',
  'character',
  'scene',
  'visual-occurrence',
  'semantic-range',
  'generated-asset',
  'artifact-block',
  'table-cell',
  'custom',
] as const;

export const REFERENCE_DIAGNOSTIC_CODES = [
  'invalid-root',
  'missing-required-field',
  'invalid-required-field',
  'invalid-source-kind',
  'invalid-role',
  'invalid-modality',
  'invalid-reference-kind',
  'invalid-confidence',
  'invalid-payload',
  'non-serializable-value',
  'oversized-payload',
  'reference-unresolved',
  'reference-unsafe-runtime-handle',
  'reference-needs-review',
  'entity-representation-missing',
  'provider-input-unavailable',
  'reference-conflict',
  'cost-estimate-required',
  'reference-transitional-field',
] as const;

export const REFERENCE_DIAGNOSTIC_SEVERITIES = ['error', 'warning', 'info'] as const;

export const REFERENCE_PURPOSES = [
  'collection',
  'validation',
  'preview',
  'provider-input',
  'metadata',
  'dry-run',
  'estimate',
  'persistence',
  'backfill',
] as const;

export const REFERENCE_PHASES = [
  'collect',
  'validate',
  'preflight',
  'materialize',
  'execute',
  'backfill',
  'persist',
] as const;

export const REFERENCE_TARGET_CAPABILITIES = [
  'CanvasPreview',
  'GenerateImage',
  'TransformImage',
  'GenerateVideo',
  'TTS',
  'ASR',
  'OCR',
  'Perception',
] as const;

export const REFERENCE_PROVIDER_INPUT_KINDS = [
  'image-uri',
  'image-base64',
  'mask-uri',
  'ip-adapter-ref',
  'video-keyframe-uri',
  'audio-uri',
  'text',
  'model-ref',
  'resource-uri',
] as const;

export const REFERENCE_RESOLUTION_STATUSES = [
  'resolved',
  'unresolved',
  'partial',
  'skipped',
] as const;

export type ReferenceSourceKind = (typeof REFERENCE_SOURCE_KINDS)[number];
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];
export type ReferenceModality = (typeof REFERENCE_MODALITIES)[number];
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export type ReferenceDiagnosticCode = (typeof REFERENCE_DIAGNOSTIC_CODES)[number];
export type ReferenceDiagnosticSeverity = (typeof REFERENCE_DIAGNOSTIC_SEVERITIES)[number];
export type ReferencePurpose = (typeof REFERENCE_PURPOSES)[number];
export type ReferencePhase = (typeof REFERENCE_PHASES)[number];
export type ReferenceBuiltInTargetCapability = (typeof REFERENCE_TARGET_CAPABILITIES)[number];
export type ReferenceTargetCapability = ReferenceBuiltInTargetCapability | (string & {});
export type ReferenceProviderInputKind = (typeof REFERENCE_PROVIDER_INPUT_KINDS)[number];
export type ReferenceResolutionStatus = (typeof REFERENCE_RESOLUTION_STATUSES)[number];

export type ReferencePathSegment = string | number;

export type ReferenceJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ReferenceJsonValue[]
  | { readonly [key: string]: ReferenceJsonValue };

export type ReferenceJsonRecord = {
  readonly [key: string]: ReferenceJsonValue;
};

export interface ReferenceResourcePayload {
  readonly type: 'resource';
  readonly resourceRef: ReferenceJsonValue;
  readonly mediaType?: ReferenceModality;
}

export interface ReferencePathPayload {
  readonly type: 'path';
  readonly path: string;
  readonly pathKind?: 'workspace-relative' | 'variable' | 'transitional';
}

export interface ReferenceCanvasNodePayload {
  readonly type: 'canvas-node';
  readonly nodeId: string;
  readonly nodeType?: CanvasNodeType;
  readonly slotId?: string;
  readonly portId?: string;
  readonly cellId?: string;
}

export interface ReferenceEntityPayload {
  readonly type: 'entity';
  readonly entityId: string;
  readonly entityKind: string;
  readonly representationId?: string;
  readonly assetRefs?: readonly ReferenceJsonValue[];
}

export interface ReferenceGeneratedAssetPayload {
  readonly type: 'generated-asset';
  readonly assetId: string;
  readonly variantId?: string;
  readonly outputRole?: string;
}

export interface ReferenceSemanticRangePayload {
  readonly type: 'semantic-range';
  readonly indexId?: string;
  readonly sourceRef?: ReferenceJsonValue;
  readonly range?: ReferenceJsonRecord;
}

export interface ReferenceArtifactPayload {
  readonly type: 'artifact';
  readonly artifactId?: string;
  readonly blockId?: string;
  readonly tableId?: string;
  readonly rowId?: string;
  readonly columnId?: string;
  readonly cellPath?: readonly ReferencePathSegment[];
}

export interface ReferenceCustomPayload {
  readonly type: 'custom';
  readonly data: ReferenceJsonRecord;
}

export type ReferenceDescriptorPayload =
  | ReferenceResourcePayload
  | ReferencePathPayload
  | ReferenceCanvasNodePayload
  | ReferenceEntityPayload
  | ReferenceGeneratedAssetPayload
  | ReferenceSemanticRangePayload
  | ReferenceArtifactPayload
  | ReferenceCustomPayload;

export interface ReferenceLineage {
  readonly sourceReferenceIds?: readonly string[];
  readonly sourceObjectIds?: readonly string[];
  readonly promptId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly taskId?: string;
  readonly toolCallId?: string;
  readonly costEstimateId?: string;
  readonly metadata?: ReferenceJsonRecord;
}

export interface ReferenceDescriptor {
  readonly schemaVersion: typeof REFERENCE_DESCRIPTOR_SCHEMA_VERSION;
  readonly kind: typeof REFERENCE_DESCRIPTOR_KIND;
  readonly referenceId: string;
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly referenceKind: ReferenceKind;
  readonly role: ReferenceRole;
  readonly modality: ReferenceModality;
  readonly payload: ReferenceDescriptorPayload;
  readonly confidence?: number;
  readonly needsReview?: boolean;
  readonly lineage?: ReferenceLineage;
  readonly diagnostics?: readonly ReferenceDiagnostic[];
  readonly metadata?: ReferenceJsonRecord;
}

export interface ReferenceDiagnosticContext {
  readonly targetCapability?: ReferenceTargetCapability;
  readonly purpose?: ReferencePurpose;
  readonly phase?: ReferencePhase;
}

export interface ReferenceDiagnostic {
  readonly severity: ReferenceDiagnosticSeverity;
  readonly code: ReferenceDiagnosticCode;
  readonly path: readonly ReferencePathSegment[];
  readonly message: string;
  readonly targetCapability?: ReferenceTargetCapability;
  readonly purpose?: ReferencePurpose;
  readonly phase?: ReferencePhase;
  readonly expected?: string;
  readonly actual?: ReferenceJsonValue;
  readonly details?: ReferenceJsonRecord;
}

export interface CreateReferenceDiagnosticInput extends ReferenceDiagnosticContext {
  readonly code: ReferenceDiagnosticCode;
  readonly path?: readonly ReferencePathSegment[];
  readonly message?: string;
  readonly expected?: string;
  readonly actual?: ReferenceJsonValue;
  readonly details?: ReferenceJsonRecord;
  readonly severity?: ReferenceDiagnosticSeverity;
}

export interface ReferenceValidationOptions extends ReferenceDiagnosticContext {
  readonly maxSerializedBytes?: number;
  readonly maxDepth?: number;
  readonly maxDiagnostics?: number;
}

export interface ReferenceValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly ReferenceDiagnostic[];
}

export interface ReferenceContributorManifest {
  readonly contributorId: string;
  readonly packageName: string;
  readonly sourceKinds: readonly ReferenceSourceKind[];
  readonly nodeTypes?: readonly CanvasNodeType[];
  readonly artifactBlockKinds?: readonly string[];
  readonly tableProfiles?: readonly string[];
  readonly producedRoles?: readonly ReferenceRole[];
  readonly supportedModalities?: readonly ReferenceModality[];
  readonly description?: string;
}

export interface ReferenceCollectionContext {
  readonly projectRoot?: string;
  readonly targetCapability?: ReferenceTargetCapability;
  readonly purpose?: ReferencePurpose;
  readonly phase?: ReferencePhase;
  readonly metadata?: ReferenceJsonRecord;
}

export interface ReferenceCollectionInput {
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly source: unknown;
  readonly context: ReferenceCollectionContext;
}

export interface ReferenceContributor {
  readonly manifest: ReferenceContributorManifest;
  collect(input: ReferenceCollectionInput): readonly ReferenceDescriptor[];
}

export interface ReferencePreviewProjection {
  readonly projectionId: string;
  readonly referenceId: string;
  readonly uri?: string;
  readonly label?: string;
  readonly mediaType?: ReferenceModality;
  readonly metadata?: ReferenceJsonRecord;
}

export interface ReferenceProviderInput {
  readonly inputId: string;
  readonly referenceId: string;
  readonly inputKind: ReferenceProviderInputKind;
  readonly value: string | ReferenceJsonRecord;
  readonly metadata?: ReferenceJsonRecord;
}

export interface ReferenceMaterializationRequest {
  readonly requestId: string;
  readonly purpose: Extract<ReferencePurpose, 'preview' | 'provider-input' | 'metadata'>;
  readonly references: readonly ReferenceDescriptor[];
  readonly targetCapability?: ReferenceTargetCapability;
  readonly providerId?: string;
  readonly inputKinds?: readonly ReferenceProviderInputKind[];
  readonly dryRun?: boolean;
  readonly metadata?: ReferenceJsonRecord;
}

export interface ReferenceMaterializationResult {
  readonly requestId: string;
  readonly status: ReferenceResolutionStatus;
  readonly previews?: readonly ReferencePreviewProjection[];
  readonly providerInputs?: readonly ReferenceProviderInput[];
  readonly diagnostics: readonly ReferenceDiagnostic[];
  readonly metadata?: ReferenceJsonRecord;
}

export interface ReferenceBatchResolvePolicy {
  readonly maxConcurrency?: number;
  readonly timeoutMs?: number;
  readonly dryRun?: boolean;
  readonly estimateOnly?: boolean;
  readonly allowPartial?: boolean;
  readonly cancellationTokenId?: string;
}

export interface ReferenceBatchResolveRequest extends Omit<
  ReferenceMaterializationRequest,
  'requestId'
> {
  readonly batchId: string;
  readonly policy?: ReferenceBatchResolvePolicy;
}

export interface ReferenceBatchItemResult {
  readonly referenceId: string;
  readonly status: ReferenceResolutionStatus;
  readonly preview?: ReferencePreviewProjection;
  readonly providerInputs?: readonly ReferenceProviderInput[];
  readonly diagnostics: readonly ReferenceDiagnostic[];
  readonly cacheKey?: string;
}

export interface ReferenceBatchResolveSummary {
  readonly total: number;
  readonly resolved: number;
  readonly unresolved: number;
  readonly partial: number;
  readonly skipped: number;
  readonly deduplicated: number;
}

export interface ReferenceBatchResolveResult {
  readonly batchId: string;
  readonly status: ReferenceResolutionStatus;
  readonly items: readonly ReferenceBatchItemResult[];
  readonly summary: ReferenceBatchResolveSummary;
  readonly diagnostics: readonly ReferenceDiagnostic[];
}

export interface ReferenceResolverService {
  materialize(request: ReferenceMaterializationRequest): Promise<ReferenceMaterializationResult>;
  resolveBatch(request: ReferenceBatchResolveRequest): Promise<ReferenceBatchResolveResult>;
}

export interface ReferenceResolverHooks {
  readonly materializePreview?: (
    reference: ReferenceDescriptor,
    request: ReferenceMaterializationRequest | ReferenceBatchResolveRequest,
  ) => Promise<ReferencePreviewProjection | undefined> | ReferencePreviewProjection | undefined;
  readonly materializeProviderInputs?: (
    reference: ReferenceDescriptor,
    request: ReferenceMaterializationRequest | ReferenceBatchResolveRequest,
  ) =>
    | Promise<readonly ReferenceProviderInput[] | undefined>
    | readonly ReferenceProviderInput[]
    | undefined;
  readonly buildCacheKey?: (
    reference: ReferenceDescriptor,
    request: ReferenceMaterializationRequest | ReferenceBatchResolveRequest,
  ) => string;
  readonly now?: () => number;
}

export interface ReferenceProjectionOptions extends ReferenceCollectionContext {
  readonly includeRuntimeFields?: boolean;
}

export interface ReferenceCollectionResult {
  readonly descriptors: readonly ReferenceDescriptor[];
  readonly diagnostics: readonly ReferenceDiagnostic[];
}

export interface ReferenceSummaryGroup {
  readonly role: ReferenceRole;
  readonly modality: ReferenceModality;
  readonly count: number;
  readonly blockedCount: number;
  readonly warningCount: number;
  readonly sourceIds: readonly string[];
  readonly labels?: readonly string[];
}

export interface ReferenceSummary {
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly total: number;
  readonly blockedCount: number;
  readonly warningCount: number;
  readonly groups: readonly ReferenceSummaryGroup[];
  readonly diagnostics: readonly ReferenceDiagnostic[];
}

export const CANVAS_NODE_REFERENCE_CONTRIBUTOR_MANIFEST: ReferenceContributorManifest = {
  contributorId: 'neko-canvas:canvas-node-reference-contributor',
  packageName: 'neko-canvas',
  sourceKinds: ['canvas-node'],
  nodeTypes: ['shot', 'gallery', 'media', 'document', 'storyboard', 'entity', 'generated-asset'],
  producedRoles: [
    'source',
    'reference',
    'subject',
    'style',
    'mask',
    'keyframe',
    'output',
    'thumbnail',
  ],
  supportedModalities: ['image', 'video', 'audio', 'document', 'entity', 'resource'],
  description: 'Projects stable Canvas node reference fields into ReferenceDescriptor values.',
};

export const SHOT_IMAGE_PREP_REFERENCE_CONTRIBUTOR_MANIFEST: ReferenceContributorManifest = {
  contributorId: 'neko-agent:shot-image-prep-reference-contributor',
  packageName: 'neko-agent',
  sourceKinds: ['shot-image-prep-plan'],
  producedRoles: [
    'source',
    'source-panel',
    'mask',
    'subject',
    'layout',
    'style',
    'keyframe',
    'output',
  ],
  supportedModalities: ['image', 'resource', 'entity'],
  description: 'Projects ShotImagePrepPlan stable refs into ReferenceDescriptor values.',
};

export const ARTIFACT_REFERENCE_CONTRIBUTOR_MANIFEST: ReferenceContributorManifest = {
  contributorId: 'neko-agent:artifact-reference-contributor',
  packageName: 'neko-agent',
  sourceKinds: ['composite-artifact', 'generic-table'],
  artifactBlockKinds: ['media', 'gallery', 'comparison', 'timeline', 'table'],
  producedRoles: ['reference', 'source', 'keyframe', 'output'],
  supportedModalities: ['image', 'video', 'audio', 'document', 'resource', 'unknown'],
  description: 'Projects CompositeArtifact and GenericTable resource payloads into references.',
};

export const STORYBOARD_TABLE_REFERENCE_CONTRIBUTOR_MANIFEST: ReferenceContributorManifest = {
  contributorId: 'neko-agent:storyboard-table-reference-contributor',
  packageName: 'neko-agent',
  sourceKinds: ['storyboard-table'],
  producedRoles: ['source', 'reference', 'mask', 'output', 'thumbnail', 'derived'],
  supportedModalities: ['image', 'video', 'resource'],
  description: 'Projects StoryboardTable media refs into ReferenceDescriptor values.',
};

export const BUILT_IN_REFERENCE_CONTRIBUTORS: readonly ReferenceContributor[] = [
  {
    manifest: CANVAS_NODE_REFERENCE_CONTRIBUTOR_MANIFEST,
    collect: (input) =>
      input.sourceKind === 'canvas-node'
        ? collectReferencesFromCanvasNode(input.source, input.context).descriptors
        : [],
  },
  {
    manifest: SHOT_IMAGE_PREP_REFERENCE_CONTRIBUTOR_MANIFEST,
    collect: (input) =>
      input.sourceKind === 'shot-image-prep-plan'
        ? collectReferencesFromShotImagePrepPlan(input.source, input.context).descriptors
        : [],
  },
  {
    manifest: ARTIFACT_REFERENCE_CONTRIBUTOR_MANIFEST,
    collect: (input) => {
      if (input.sourceKind === 'generic-table') {
        return collectReferencesFromGenericTable(input.source, input.context).descriptors;
      }
      if (input.sourceKind === 'composite-artifact') {
        return collectReferencesFromCompositeArtifact(input.source, input.context).descriptors;
      }
      return [];
    },
  },
  {
    manifest: STORYBOARD_TABLE_REFERENCE_CONTRIBUTOR_MANIFEST,
    collect: (input) =>
      input.sourceKind === 'storyboard-table'
        ? collectReferencesFromStoryboardTable(input.source, input.context).descriptors
        : [],
  },
];

export class DefaultReferenceResolverService implements ReferenceResolverService {
  private readonly previewCache = new Map<string, ReferencePreviewProjection>();
  private readonly providerInputCache = new Map<string, readonly ReferenceProviderInput[]>();

  constructor(private readonly hooks: ReferenceResolverHooks = {}) {}

  async materialize(
    request: ReferenceMaterializationRequest,
  ): Promise<ReferenceMaterializationResult> {
    const batch = await this.resolveBatch({
      batchId: request.requestId,
      purpose: request.purpose,
      references: request.references,
      targetCapability: request.targetCapability,
      providerId: request.providerId,
      inputKinds: request.inputKinds,
      dryRun: request.dryRun,
      metadata: request.metadata,
      policy: { dryRun: request.dryRun, allowPartial: true },
    });

    return {
      requestId: request.requestId,
      status: batch.status,
      previews: batch.items.flatMap((item) => (item.preview ? [item.preview] : [])),
      providerInputs: batch.items.flatMap((item) => item.providerInputs ?? []),
      diagnostics: batch.diagnostics,
      metadata: {
        total: batch.summary.total,
        resolved: batch.summary.resolved,
        unresolved: batch.summary.unresolved,
        partial: batch.summary.partial,
        skipped: batch.summary.skipped,
        deduplicated: batch.summary.deduplicated,
      },
    };
  }

  async resolveBatch(request: ReferenceBatchResolveRequest): Promise<ReferenceBatchResolveResult> {
    const seen = new Map<string, ReferenceDescriptor>();
    let deduplicated = 0;
    for (const reference of request.references) {
      const key = getReferenceDescriptorKey(reference);
      if (seen.has(key)) {
        deduplicated += 1;
        continue;
      }
      seen.set(key, reference);
    }

    const uniqueReferences = Array.from(seen.values());
    const concurrency = Math.max(1, request.policy?.maxConcurrency ?? uniqueReferences.length ?? 1);
    const items: ReferenceBatchItemResult[] = [];
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < uniqueReferences.length) {
        const reference = uniqueReferences[cursor];
        cursor += 1;
        if (!reference) continue;
        items.push(await this.resolveOne(reference, request));
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, uniqueReferences.length) }, () => worker()),
    );

    const orderedItems = uniqueReferences.map((reference) => {
      const item = items.find((candidate) => candidate.referenceId === reference.referenceId);
      return item ?? unresolvedBatchItem(reference, request, 'Reference was not resolved.');
    });
    const diagnostics = orderedItems.flatMap((item) => item.diagnostics);
    const summary = summarizeBatch(orderedItems, deduplicated);

    return {
      batchId: request.batchId,
      status: batchStatus(summary),
      items: orderedItems,
      summary,
      diagnostics,
    };
  }

  private async resolveOne(
    reference: ReferenceDescriptor,
    request: ReferenceBatchResolveRequest,
  ): Promise<ReferenceBatchItemResult> {
    const validation = validateReferenceDescriptor(reference, {
      purpose: request.purpose,
      targetCapability: request.targetCapability,
      phase: request.dryRun || request.policy?.dryRun ? 'preflight' : 'materialize',
    });
    if (!validation.ok) {
      return {
        referenceId: reference.referenceId,
        status: 'unresolved',
        diagnostics: validation.diagnostics,
        cacheKey: this.cacheKey(reference, request),
      };
    }

    if (request.dryRun || request.policy?.dryRun || request.policy?.estimateOnly) {
      return {
        referenceId: reference.referenceId,
        status: 'skipped',
        diagnostics: [],
        cacheKey: this.cacheKey(reference, request),
      };
    }

    if (request.purpose === 'preview') {
      const preview = await this.resolvePreview(reference, request);
      return preview
        ? {
            referenceId: reference.referenceId,
            status: 'resolved',
            preview,
            diagnostics: [],
            cacheKey: this.cacheKey(reference, request),
          }
        : unresolvedBatchItem(reference, request, 'Preview projection could not be materialized.');
    }

    if (request.purpose === 'provider-input') {
      const providerInputs = await this.resolveProviderInputs(reference, request);
      return providerInputs.length > 0
        ? {
            referenceId: reference.referenceId,
            status: 'resolved',
            providerInputs,
            diagnostics: [],
            cacheKey: this.cacheKey(reference, request),
          }
        : unresolvedBatchItem(reference, request, 'Provider input could not be materialized.');
    }

    return {
      referenceId: reference.referenceId,
      status: 'skipped',
      diagnostics: [],
      cacheKey: this.cacheKey(reference, request),
    };
  }

  private async resolvePreview(
    reference: ReferenceDescriptor,
    request: ReferenceBatchResolveRequest,
  ): Promise<ReferencePreviewProjection | undefined> {
    const cacheKey = this.cacheKey(reference, request);
    const cached = this.previewCache.get(cacheKey);
    if (cached) return cached;

    const hooked = await this.hooks.materializePreview?.(reference, request);
    const preview = hooked ?? defaultPreviewProjection(reference);
    if (preview) this.previewCache.set(cacheKey, preview);
    return preview;
  }

  private async resolveProviderInputs(
    reference: ReferenceDescriptor,
    request: ReferenceBatchResolveRequest,
  ): Promise<readonly ReferenceProviderInput[]> {
    const cacheKey = this.cacheKey(reference, request);
    const cached = this.providerInputCache.get(cacheKey);
    if (cached) return cached;

    const hooked = await this.hooks.materializeProviderInputs?.(reference, request);
    const providerInputs = hooked ?? defaultProviderInputs(reference, request);
    this.providerInputCache.set(cacheKey, providerInputs);
    return providerInputs;
  }

  private cacheKey(
    reference: ReferenceDescriptor,
    request: ReferenceMaterializationRequest | ReferenceBatchResolveRequest,
  ): string {
    return (
      this.hooks.buildCacheKey?.(reference, request) ??
      [
        getReferenceDescriptorKey(reference),
        request.purpose,
        request.targetCapability ?? '',
        request.providerId ?? '',
        (request.inputKinds ?? []).join(','),
      ].join('|')
    );
  }
}

export function createReferenceDiagnostic(
  input: CreateReferenceDiagnosticInput,
): ReferenceDiagnostic {
  const severity = input.severity ?? referenceDiagnosticSeverity(input);
  const message = input.message ?? defaultReferenceDiagnosticMessage(input.code);
  return {
    severity,
    code: input.code,
    path: input.path ?? [],
    message,
    ...(input.targetCapability ? { targetCapability: input.targetCapability } : {}),
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.phase ? { phase: input.phase } : {}),
    ...(input.expected ? { expected: input.expected } : {}),
    ...(input.actual !== undefined ? { actual: input.actual } : {}),
    ...(input.details ? { details: input.details } : {}),
  };
}

export function validateReferenceDescriptor(
  value: unknown,
  options: ReferenceValidationOptions = {},
): ReferenceValidationResult {
  const diagnostics: ReferenceDiagnostic[] = [];
  validateReferenceDescriptorValue(value, [], diagnostics, options);
  return { ok: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'), diagnostics };
}

export function isReferenceSourceKind(value: unknown): value is ReferenceSourceKind {
  return typeof value === 'string' && REFERENCE_SOURCE_KINDS.includes(value as ReferenceSourceKind);
}

export function isReferenceRole(value: unknown): value is ReferenceRole {
  return typeof value === 'string' && REFERENCE_ROLES.includes(value as ReferenceRole);
}

export function isReferenceModality(value: unknown): value is ReferenceModality {
  return typeof value === 'string' && REFERENCE_MODALITIES.includes(value as ReferenceModality);
}

export function isReferenceKind(value: unknown): value is ReferenceKind {
  return typeof value === 'string' && REFERENCE_KINDS.includes(value as ReferenceKind);
}

export function isReferenceDescriptor(value: unknown): value is ReferenceDescriptor {
  return validateReferenceDescriptor(value).ok;
}

export function isReferenceJsonValue(value: unknown): value is ReferenceJsonValue {
  return validateReferenceJsonValue(value, 0, Number.POSITIVE_INFINITY);
}

export function getReferenceDescriptorKey(reference: ReferenceDescriptor): string {
  return [
    reference.sourceKind,
    reference.sourceId,
    reference.referenceKind,
    reference.role,
    reference.modality,
    stableStringify(reference.payload),
  ].join('|');
}

export function collectReferencesWithContributors(
  input: ReferenceCollectionInput,
  contributors: readonly ReferenceContributor[] = BUILT_IN_REFERENCE_CONTRIBUTORS,
): ReferenceCollectionResult {
  const descriptors: ReferenceDescriptor[] = [];
  for (const contributor of contributors) {
    if (!contributor.manifest.sourceKinds.includes(input.sourceKind)) continue;
    descriptors.push(...contributor.collect(input));
  }
  if (descriptors.length > 0) {
    return { descriptors, diagnostics: [] };
  }
  return {
    descriptors,
    diagnostics: [
      createReferenceDiagnostic({
        code: 'reference-needs-review',
        message: `No reference contributor is registered for ${input.sourceKind}.`,
        purpose: input.context.purpose ?? 'collection',
        phase: input.context.phase ?? 'collect',
      }),
    ],
  };
}

export function summarizeReferenceDescriptors(input: {
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly descriptors: readonly ReferenceDescriptor[];
  readonly diagnostics?: readonly ReferenceDiagnostic[];
}): ReferenceSummary {
  const groups = new Map<string, ReferenceDescriptor[]>();
  for (const descriptor of input.descriptors) {
    const key = `${descriptor.role}:${descriptor.modality}`;
    const current = groups.get(key) ?? [];
    current.push(descriptor);
    groups.set(key, current);
  }
  const summaryGroups = Array.from(groups.values()).map((descriptors) =>
    summarizeReferenceGroup(descriptors),
  );
  const diagnostics = [
    ...(input.diagnostics ?? []),
    ...input.descriptors.flatMap((descriptor) => descriptor.diagnostics ?? []),
  ];

  return {
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    total: input.descriptors.length,
    blockedCount: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
    groups: summaryGroups,
    diagnostics,
  };
}

export function summarizeReferencesFromCanvasNode(
  source: unknown,
  options: ReferenceProjectionOptions = {},
): ReferenceSummary {
  const sourceId = isCanvasNodeLike(source) ? source.id : '';
  const collected = collectReferencesFromCanvasNode(source, options);
  return summarizeReferenceDescriptors({
    sourceKind: 'canvas-node',
    sourceId,
    descriptors: collected.descriptors,
    diagnostics: collected.diagnostics,
  });
}

export function collectReferencesFromCanvasNode(
  source: unknown,
  options: ReferenceProjectionOptions = {},
): ReferenceCollectionResult {
  if (!isCanvasNodeLike(source)) {
    return invalidSourceResult('Canvas node reference source must be a CanvasNode-like object.');
  }
  const descriptors: ReferenceDescriptor[] = [];
  const diagnostics: ReferenceDiagnostic[] = [];
  const data = isRecord(source.data) ? source.data : {};
  const sourceId = source.id;

  const referenceResourceRef = data['referenceResourceRef'];
  if (referenceResourceRef !== undefined) {
    descriptors.push(
      createResourceDescriptor({
        referenceId: `${sourceId}:referenceResourceRef`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'reference',
        modality: inferModalityFromUnknown(referenceResourceRef, 'resource'),
        resourceRef: referenceResourceRef,
        metadata: { field: 'referenceResourceRef' },
      }),
    );
  }

  const referenceImageResourceRef = data['referenceImageResourceRef'];
  if (referenceImageResourceRef !== undefined) {
    descriptors.push(
      createResourceDescriptor({
        referenceId: `${sourceId}:referenceImageResourceRef`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'reference',
        modality: 'image',
        resourceRef: referenceImageResourceRef,
        metadata: { field: 'referenceImageResourceRef' },
      }),
    );
  }

  const referenceImagePath = data['referenceImagePath'];
  if (typeof referenceImagePath === 'string' && referenceImagePath.trim().length > 0) {
    descriptors.push(
      createPathDescriptor({
        referenceId: `${sourceId}:referenceImagePath`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'reference',
        modality: 'image',
        path: referenceImagePath,
        metadata: { field: 'referenceImagePath' },
      }),
    );
    diagnostics.push(
      createReferenceDiagnostic({
        code: 'reference-transitional-field',
        path: ['data', 'referenceImagePath'],
        purpose: options.purpose ?? 'collection',
        phase: options.phase ?? 'collect',
      }),
    );
  }

  const runtimeReferenceImagePath = data['runtimeReferenceImagePath'];
  if (
    typeof runtimeReferenceImagePath === 'string' &&
    runtimeReferenceImagePath.trim().length > 0
  ) {
    diagnostics.push(
      createReferenceDiagnostic({
        code: 'reference-unsafe-runtime-handle',
        path: ['data', 'runtimeReferenceImagePath'],
        message: 'runtimeReferenceImagePath is a runtime projection and must not be persisted.',
        purpose: options.purpose ?? 'validation',
        phase: options.phase ?? 'validate',
      }),
    );
    if (options.includeRuntimeFields) {
      descriptors.push(
        createPathDescriptor({
          referenceId: `${sourceId}:runtimeReferenceImagePath`,
          sourceKind: 'canvas-node',
          sourceId,
          role: 'reference',
          modality: 'image',
          path: runtimeReferenceImagePath,
          metadata: { field: 'runtimeReferenceImagePath', runtimeOnly: true },
        }),
      );
    }
  }

  const referenceRefs = data['referenceRefs'];
  if (Array.isArray(referenceRefs)) {
    referenceRefs.forEach((ref, index) => {
      if (typeof ref !== 'string' || ref.trim().length === 0) return;
      descriptors.push(
        createCanvasNodeDescriptor({
          referenceId: `${sourceId}:referenceRefs:${index}`,
          sourceKind: 'canvas-node',
          sourceId,
          role: 'reference',
          modality: 'image',
          nodeId: ref,
          metadata: { field: 'referenceRefs', index },
        }),
      );
    });
  }

  const generatedAsset = data['generatedAsset'];
  if (isRecord(generatedAsset) && typeof generatedAsset['id'] === 'string') {
    descriptors.push(
      createGeneratedAssetDescriptor({
        referenceId: `${sourceId}:generatedAsset`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'output',
        modality: 'image',
        assetId: generatedAsset['id'],
        metadata: { field: 'generatedAsset' },
      }),
    );
  }

  const generatedVideoAsset = data['generatedVideoAsset'];
  if (isRecord(generatedVideoAsset) && typeof generatedVideoAsset['id'] === 'string') {
    descriptors.push(
      createGeneratedAssetDescriptor({
        referenceId: `${sourceId}:generatedVideoAsset`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'output',
        modality: 'video',
        assetId: generatedVideoAsset['id'],
        metadata: { field: 'generatedVideoAsset' },
      }),
    );
  }

  if (source.type === 'media') {
    projectMediaNodeReferences(data, sourceId, descriptors);
  } else if (source.type === 'gallery') {
    projectGalleryNodeReferences(source.container, data, sourceId, descriptors);
  } else if (source.type === 'document') {
    projectDocumentNodeReferences(data, sourceId, descriptors);
  } else if (source.type === 'storyboard') {
    descriptors.push(
      createCanvasNodeDescriptor({
        referenceId: `${sourceId}:storyboard`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'semantic-range',
        modality: 'text',
        nodeId: sourceId,
        metadata: { nodeType: source.type },
      }),
    );
  } else if (source.type === 'entity') {
    projectRegisteredEntityNodeReferences(data, sourceId, descriptors);
  } else if (source.type === 'generated-asset') {
    projectRegisteredGeneratedAssetNodeReferences(data, sourceId, descriptors);
  }

  return { descriptors, diagnostics };
}

export function collectReferencesFromShotImagePrepPlan(
  source: unknown,
  options: ReferenceProjectionOptions = {},
): ReferenceCollectionResult {
  if (!isShotImagePrepPlanLike(source)) {
    return invalidSourceResult(
      'Shot image prep reference source must be a ShotImagePrepPlan-like object.',
    );
  }
  const plan = source as Pick<
    ShotImagePrepPlan,
    'planId' | 'sourceMediaRefs' | 'maskRefs' | 'referenceBundle' | 'outputMediaRefs'
  >;
  const descriptors: ReferenceDescriptor[] = [];
  const sourceId = plan.planId;
  plan.sourceMediaRefs.forEach((ref, index) => {
    descriptors.push(
      storyboardMediaRefToDescriptor(ref, {
        referenceId: `${sourceId}:sourceMediaRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: ref.role === 'mask' ? 'mask' : 'source',
      }),
    );
  });
  plan.maskRefs?.forEach((ref, index) => {
    descriptors.push(
      storyboardMediaRefToDescriptor(ref, {
        referenceId: `${sourceId}:maskRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: 'mask',
      }),
    );
  });
  plan.outputMediaRefs?.forEach((ref, index) => {
    descriptors.push(
      storyboardMediaRefToDescriptor(ref, {
        referenceId: `${sourceId}:outputMediaRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: 'output',
      }),
    );
  });

  const bundle = plan.referenceBundle;
  bundle?.sourcePanelRefs?.forEach((ref, index) => {
    descriptors.push(
      storyboardMediaRefToDescriptor(ref, {
        referenceId: `${sourceId}:referenceBundle:sourcePanelRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: 'source-panel',
      }),
    );
  });
  bundle?.styleRefs?.forEach((ref, index) => {
    descriptors.push(
      storyboardMediaRefToDescriptor(ref, {
        referenceId: `${sourceId}:referenceBundle:styleRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: 'style',
      }),
    );
  });
  bundle?.previousShotRefs?.forEach((ref, index) => {
    descriptors.push(
      storyboardMediaRefToDescriptor(ref, {
        referenceId: `${sourceId}:referenceBundle:previousShotRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: 'previous-shot',
      }),
    );
  });
  bundle?.characterRefs?.forEach((ref, index) => {
    descriptors.push(
      createEntityDescriptor({
        referenceId: `${sourceId}:referenceBundle:characterRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: 'subject',
        modality: 'entity',
        entityId: ref.entityRef.entityId,
        entityKind: ref.entityRef.entityKind,
        assetRefs: ref.assetRefs?.map(
          (assetRef) => jsonValue(storyboardMediaRefPayload(assetRef)) ?? null,
        ),
        confidence: ref.confidence,
        metadata: compactJsonRecord({
          refRole: ref.role ?? 'identity',
          memoryObservationIds: jsonArray(ref.memoryObservationIds),
        }),
      }),
    );
  });
  bundle?.sceneRefs?.forEach((ref, index) => {
    descriptors.push(
      createEntityDescriptor({
        referenceId: `${sourceId}:referenceBundle:sceneRefs:${index}`,
        sourceKind: 'shot-image-prep-plan',
        sourceId,
        role: 'layout',
        modality: 'entity',
        entityId: ref.entityRef.entityId,
        entityKind: ref.entityRef.entityKind,
        assetRefs: ref.assetRefs?.map(
          (assetRef) => jsonValue(storyboardMediaRefPayload(assetRef)) ?? null,
        ),
        confidence: ref.confidence,
        metadata: compactJsonRecord({
          refRole: ref.role ?? 'layout',
          semanticIndexRefs: jsonArray(ref.semanticIndexRefs),
        }),
      }),
    );
  });

  return {
    descriptors,
    diagnostics: options.includeRuntimeFields ? [] : validateDescriptors(descriptors, options),
  };
}

export function collectReferencesFromGenericTable(
  source: unknown,
  options: ReferenceProjectionOptions = {},
): ReferenceCollectionResult {
  if (!isGenericTableLike(source)) {
    return invalidSourceResult(
      'Generic table reference source must be a GenericTable-like object.',
    );
  }
  const table = source as Pick<GenericTable, 'tableId' | 'rows'>;
  const descriptors: ReferenceDescriptor[] = [];
  for (const row of table.rows) {
    for (const [columnId, cell] of Object.entries(row.cells)) {
      descriptors.push(
        ...projectGenericTableCell(cell, {
          tableId: table.tableId,
          rowId: row.rowId,
          columnId,
          sourceKind: 'generic-table',
          sourceId: `${table.tableId}:${row.rowId}:${columnId}`,
        }),
      );
    }
  }
  return { descriptors, diagnostics: validateDescriptors(descriptors, options) };
}

export function collectReferencesFromCompositeArtifact(
  source: unknown,
  options: ReferenceProjectionOptions = {},
): ReferenceCollectionResult {
  if (!isCompositeArtifactLike(source)) {
    return invalidSourceResult(
      'Composite artifact reference source must be a CompositeArtifact-like object.',
    );
  }
  const artifact = source as Pick<CompositeArtifact, 'artifactId' | 'blocks'>;
  const descriptors: ReferenceDescriptor[] = [];
  for (const block of artifact.blocks) {
    descriptors.push(
      ...projectCompositeBlockReferences(block, {
        artifactId: artifact.artifactId,
        sourceKind: 'composite-artifact',
        sourceId: `${artifact.artifactId}:${block.blockId}`,
      }),
    );
  }
  return { descriptors, diagnostics: validateDescriptors(descriptors, options) };
}

export function collectReferencesFromStoryboardTable(
  source: unknown,
  options: ReferenceProjectionOptions = {},
): ReferenceCollectionResult {
  if (!isStoryboardTableLike(source)) {
    return invalidSourceResult(
      'Storyboard table reference source must be a StoryboardTable-like object.',
    );
  }
  const table = source as Pick<StoryboardTable, 'title' | 'scenes'>;
  const descriptors: ReferenceDescriptor[] = [];
  for (const scene of table.scenes) {
    for (const shot of scene.shots) {
      const shotId = shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`;
      const mediaRefs = [
        ...(shot.sourceMediaRefs ?? []),
        ...(shot.mediaRefs ?? []),
        ...(shot.generatedMediaRefs ?? []),
      ];
      mediaRefs.forEach((ref, index) => {
        descriptors.push(
          storyboardMediaRefToDescriptor(ref, {
            referenceId: `${scene.sceneId}:${shotId}:mediaRefs:${index}:${ref.refId}`,
            sourceKind: 'storyboard-table',
            sourceId: `${table.title}:${scene.sceneId}:${shotId}`,
            role: storyboardRoleToReferenceRole(ref.role),
          }),
        );
      });
    }
  }
  return { descriptors, diagnostics: validateDescriptors(descriptors, options) };
}

export function isUnsafeReferenceRuntimeHandle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(?:blob|data|file|vscode-resource):/i.test(trimmed)) return true;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(trimmed)) return true;
  if (/^\/(?!\$\{)/.test(trimmed)) return true;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
  if (/[/\\](?:\.neko[/\\]\.cache|\.cache)(?:[/\\]|$)/.test(trimmed)) return true;
  return false;
}

function validateReferenceDescriptorValue(
  value: unknown,
  path: readonly ReferencePathSegment[],
  diagnostics: ReferenceDiagnostic[],
  options: ReferenceValidationOptions,
): void {
  if (!isRecord(value)) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-root',
      path,
      message: 'Reference descriptor must be an object.',
      expected: 'object',
    });
    return;
  }

  if (value['schemaVersion'] !== REFERENCE_DESCRIPTOR_SCHEMA_VERSION) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-required-field',
      path: [...path, 'schemaVersion'],
      expected: String(REFERENCE_DESCRIPTOR_SCHEMA_VERSION),
      actual: toReferenceJsonValue(value['schemaVersion']),
    });
  }

  if (value['kind'] !== REFERENCE_DESCRIPTOR_KIND) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-required-field',
      path: [...path, 'kind'],
      expected: REFERENCE_DESCRIPTOR_KIND,
      actual: toReferenceJsonValue(value['kind']),
    });
  }

  validateRequiredString(value, 'referenceId', path, diagnostics, options);
  validateRequiredString(value, 'sourceId', path, diagnostics, options);

  if (!isReferenceSourceKind(value['sourceKind'])) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-source-kind',
      path: [...path, 'sourceKind'],
      expected: REFERENCE_SOURCE_KINDS.join(' | '),
      actual: toReferenceJsonValue(value['sourceKind']),
    });
  }

  if (!isReferenceKind(value['referenceKind'])) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-reference-kind',
      path: [...path, 'referenceKind'],
      expected: REFERENCE_KINDS.join(' | '),
      actual: toReferenceJsonValue(value['referenceKind']),
    });
  }

  if (!isReferenceRole(value['role'])) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-role',
      path: [...path, 'role'],
      expected: REFERENCE_ROLES.join(' | '),
      actual: toReferenceJsonValue(value['role']),
    });
  }

  if (!isReferenceModality(value['modality'])) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-modality',
      path: [...path, 'modality'],
      expected: REFERENCE_MODALITIES.join(' | '),
      actual: toReferenceJsonValue(value['modality']),
    });
  }

  validatePayload(value['payload'], [...path, 'payload'], diagnostics, options);

  const confidence = value['confidence'];
  if (
    confidence !== undefined &&
    (typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  ) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-confidence',
      path: [...path, 'confidence'],
      expected: 'number between 0 and 1',
      actual: toReferenceJsonValue(confidence),
    });
  }

  validateOptionalSerializable(value['lineage'], [...path, 'lineage'], diagnostics, options);
  validateOptionalSerializable(
    value['diagnostics'],
    [...path, 'diagnostics'],
    diagnostics,
    options,
  );
  validateOptionalSerializable(value['metadata'], [...path, 'metadata'], diagnostics, options);
  validateSerializedSize(value, path, diagnostics, options);
}

function projectMediaNodeReferences(
  data: Readonly<Record<string, unknown>>,
  sourceId: string,
  descriptors: ReferenceDescriptor[],
): void {
  const resourceRef = data['resourceRef'];
  if (resourceRef !== undefined) {
    descriptors.push(
      createResourceDescriptor({
        referenceId: `${sourceId}:resourceRef`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'source',
        modality: inferModalityFromUnknown(resourceRef, readMediaType(data['mediaType'])),
        resourceRef,
        metadata: { field: 'resourceRef' },
      }),
    );
  }
  const documentResourceRef = data['documentResourceRef'];
  if (documentResourceRef !== undefined) {
    descriptors.push(
      createResourceDescriptor({
        referenceId: `${sourceId}:documentResourceRef`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'source',
        modality: inferModalityFromUnknown(documentResourceRef, readMediaType(data['mediaType'])),
        resourceRef: documentResourceRef,
        metadata: { field: 'documentResourceRef' },
      }),
    );
  }
  const assetPath = data['assetPath'];
  if (typeof assetPath === 'string' && assetPath.trim().length > 0) {
    descriptors.push(
      createPathDescriptor({
        referenceId: `${sourceId}:assetPath`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'source',
        modality: readMediaType(data['mediaType']),
        path: assetPath,
        metadata: { field: 'assetPath' },
      }),
    );
  }
}

function summarizeReferenceGroup(
  descriptors: readonly ReferenceDescriptor[],
): ReferenceSummaryGroup {
  const first = descriptors[0];
  const diagnostics = descriptors.flatMap((descriptor) => descriptor.diagnostics ?? []);
  return {
    role: first?.role ?? 'reference',
    modality: first?.modality ?? 'unknown',
    count: descriptors.length,
    blockedCount: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
    sourceIds: Array.from(new Set(descriptors.map((descriptor) => descriptor.sourceId))),
    labels: Array.from(
      new Set(
        descriptors.flatMap((descriptor) => {
          const label = descriptor.metadata?.['label'];
          return typeof label === 'string' && label.trim().length > 0 ? [label] : [];
        }),
      ),
    ),
  };
}

function projectGalleryNodeReferences(
  container: unknown,
  data: Readonly<Record<string, unknown>>,
  sourceId: string,
  descriptors: ReferenceDescriptor[],
): void {
  const referenceAssetId = isRecord(data['characterProfile'])
    ? data['characterProfile']['referenceAssetId']
    : undefined;
  if (typeof referenceAssetId === 'string' && referenceAssetId.trim().length > 0) {
    descriptors.push(
      createGeneratedAssetDescriptor({
        referenceId: `${sourceId}:characterProfile:referenceAssetId`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'subject',
        modality: 'image',
        assetId: referenceAssetId,
        metadata: { field: 'characterProfile.referenceAssetId' },
      }),
    );
  }
  const placements = isRecord(container) ? container['childPlacements'] : undefined;
  if (!isRecord(placements)) return;
  Object.entries(placements).forEach(([placementId, placement], index) => {
    if (!isRecord(placement)) return;
    const childId = readStringFromKeys(placement, ['childId']) ?? placementId;
    if (!childId) return;
    const metadata = isRecord(placement['metadata']) ? placement['metadata'] : undefined;
    descriptors.push(
      createCanvasNodeDescriptor({
        referenceId: `${sourceId}:childPlacements:${placementId}`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'reference',
        modality: 'image',
        nodeId: childId,
        metadata: compactJsonRecord({
          field: 'container.childPlacements',
          placementId,
          slotId: placement['slotId'],
          order: placement['order'],
          index,
          label: metadata?.['label'],
        }),
      }),
    );
  });
}

function projectDocumentNodeReferences(
  data: Readonly<Record<string, unknown>>,
  sourceId: string,
  descriptors: ReferenceDescriptor[],
): void {
  const docPath = data['docPath'];
  if (typeof docPath === 'string' && docPath.trim().length > 0) {
    descriptors.push(
      createPathDescriptor({
        referenceId: `${sourceId}:docPath`,
        sourceKind: 'canvas-node',
        sourceId,
        role: 'source',
        modality: 'document',
        path: docPath,
        metadata: compactJsonRecord({
          field: 'docPath',
          docType: typeof data['docType'] === 'string' ? data['docType'] : undefined,
        }),
      }),
    );
  }
}

function projectRegisteredEntityNodeReferences(
  data: Readonly<Record<string, unknown>>,
  sourceId: string,
  descriptors: ReferenceDescriptor[],
): void {
  const entityId = readStringFromKeys(data, ['entityId', 'id']);
  const entityKind = readStringFromKeys(data, ['entityKind', 'kind']);
  if (!entityId || !entityKind) return;
  descriptors.push(
    createEntityDescriptor({
      referenceId: `${sourceId}:entity`,
      sourceKind: 'canvas-node',
      sourceId,
      role: entityKind === 'character' ? 'subject' : 'reference',
      modality: 'entity',
      entityId,
      entityKind,
      metadata: { field: 'data' },
    }),
  );
}

function projectRegisteredGeneratedAssetNodeReferences(
  data: Readonly<Record<string, unknown>>,
  sourceId: string,
  descriptors: ReferenceDescriptor[],
): void {
  const assetId = readStringFromKeys(data, ['assetId', 'id', 'generatedAssetId']);
  if (!assetId) return;
  descriptors.push(
    createGeneratedAssetDescriptor({
      referenceId: `${sourceId}:generated-asset`,
      sourceKind: 'canvas-node',
      sourceId,
      role: 'output',
      modality: inferModalityFromUnknown(data, 'resource'),
      assetId,
      metadata: { field: 'data' },
    }),
  );
}

function projectGenericTableCell(
  cell: GenericTableCell,
  context: {
    readonly tableId: string;
    readonly rowId: string;
    readonly columnId: string;
    readonly sourceKind: ReferenceSourceKind;
    readonly sourceId: string;
  },
): readonly ReferenceDescriptor[] {
  const referenceId = `${context.tableId}:${context.rowId}:${context.columnId}`;
  if (cell.type === 'resource-ref') {
    return [
      artifactResourceRefToDescriptor(cell.value, {
        referenceId,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
        role: 'reference',
      }),
    ];
  }
  if (cell.type === 'media-preview') {
    return [
      artifactMediaItemToDescriptor(cell.value, {
        referenceId,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
        role: 'reference',
      }),
    ];
  }
  if (cell.type === 'json') {
    return projectJsonReferencePayload(cell.value, {
      referenceId,
      sourceKind: context.sourceKind,
      sourceId: context.sourceId,
    });
  }
  return [];
}

function projectCompositeBlockReferences(
  block: CompositeArtifactBlock,
  context: {
    readonly artifactId: string;
    readonly sourceKind: ReferenceSourceKind;
    readonly sourceId: string;
  },
): readonly ReferenceDescriptor[] {
  switch (block.kind) {
    case 'media':
      return [
        artifactMediaItemToDescriptor(block.media, {
          referenceId: `${context.artifactId}:${block.blockId}:media`,
          sourceKind: context.sourceKind,
          sourceId: context.sourceId,
          role: block.role ? roleFromString(block.role) : 'reference',
        }),
      ];
    case 'gallery':
      return block.items.map((item, index) =>
        artifactMediaItemToDescriptor(item, {
          referenceId: `${context.artifactId}:${block.blockId}:gallery:${index}`,
          sourceKind: context.sourceKind,
          sourceId: context.sourceId,
          role: block.role ? roleFromString(block.role) : 'reference',
        }),
      );
    case 'comparison':
      return block.candidates.flatMap((candidate, index) =>
        candidate.media
          ? [
              artifactMediaItemToDescriptor(candidate.media, {
                referenceId: `${context.artifactId}:${block.blockId}:comparison:${index}`,
                sourceKind: context.sourceKind,
                sourceId: context.sourceId,
                role: 'reference',
              }),
            ]
          : [],
      );
    case 'timeline':
      return block.cues.flatMap((cue, index) =>
        cue.resourceRef
          ? [
              artifactResourceRefToDescriptor(cue.resourceRef, {
                referenceId: `${context.artifactId}:${block.blockId}:timeline:${index}`,
                sourceKind: context.sourceKind,
                sourceId: context.sourceId,
                role: 'keyframe',
              }),
            ]
          : [],
      );
    case 'table':
      return collectReferencesFromGenericTable(block.table).descriptors;
    case 'domain':
      return projectJsonReferencePayload(block.payload, {
        referenceId: `${context.artifactId}:${block.blockId}:domain`,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
      });
    case 'text':
    case 'diagnostic':
      return [];
  }
}

function projectJsonReferencePayload(
  value: unknown,
  context: {
    readonly referenceId: string;
    readonly sourceKind: ReferenceSourceKind;
    readonly sourceId: string;
  },
): readonly ReferenceDescriptor[] {
  if (!isRecord(value)) return [];
  const resourceRef = value['resourceRef'] ?? value['resource'];
  if (resourceRef !== undefined) {
    return [
      createResourceDescriptor({
        referenceId: `${context.referenceId}:resource`,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
        role: roleFromString(value['role']),
        modality: inferModalityFromUnknown(resourceRef, 'resource'),
        resourceRef,
      }),
    ];
  }
  const assetId = readStringFromKeys(value, ['assetId', 'generatedAssetId']);
  if (assetId) {
    return [
      createGeneratedAssetDescriptor({
        referenceId: `${context.referenceId}:asset`,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
        role: roleFromString(value['role']),
        modality: inferModalityFromUnknown(value, 'resource'),
        assetId,
      }),
    ];
  }
  return [];
}

function artifactMediaItemToDescriptor(
  item: ArtifactMediaItem,
  context: {
    readonly referenceId: string;
    readonly sourceKind: ReferenceSourceKind;
    readonly sourceId: string;
    readonly role: ReferenceRole;
  },
): ReferenceDescriptor {
  return artifactResourceRefToDescriptor(item.resourceRef, {
    ...context,
    modality: artifactMediaTypeToModality(item.mediaType),
    metadata: compactJsonRecord({
      itemId: item.itemId,
      label: item.label,
      mimeType: item.mimeType,
    }),
  });
}

function artifactResourceRefToDescriptor(
  ref: ArtifactResourceRef,
  context: {
    readonly referenceId: string;
    readonly sourceKind: ReferenceSourceKind;
    readonly sourceId: string;
    readonly role: ReferenceRole;
    readonly modality?: ReferenceModality;
    readonly metadata?: ReferenceJsonRecord;
  },
): ReferenceDescriptor {
  switch (ref.kind) {
    case 'canvas-node':
      return createCanvasNodeDescriptor({
        referenceId: context.referenceId,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
        role: context.role,
        modality: context.modality ?? 'resource',
        nodeId: ref.canvasNodeId,
        metadata: compactJsonRecord({
          outputId: ref.outputId,
          ...context.metadata,
        }),
      });
    case 'generated-asset':
      return createGeneratedAssetDescriptor({
        referenceId: context.referenceId,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
        role: context.role,
        modality: context.modality ?? 'resource',
        assetId: ref.assetId,
        variantId: ref.assetVersion,
        metadata: compactJsonRecord({
          resourceRef: jsonValue(ref.resourceRef),
          ...context.metadata,
        }),
      });
    default:
      return createResourceDescriptor({
        referenceId: context.referenceId,
        sourceKind: context.sourceKind,
        sourceId: context.sourceId,
        role: context.role,
        modality: context.modality ?? 'resource',
        resourceRef: ref,
        metadata: context.metadata,
      });
  }
}

function storyboardMediaRefToDescriptor(
  ref: StoryboardMediaRef,
  context: {
    readonly referenceId: string;
    readonly sourceKind: ReferenceSourceKind;
    readonly sourceId: string;
    readonly role: ReferenceRole;
  },
): ReferenceDescriptor {
  return {
    schemaVersion: REFERENCE_DESCRIPTOR_SCHEMA_VERSION,
    kind: REFERENCE_DESCRIPTOR_KIND,
    referenceId: context.referenceId,
    sourceKind: context.sourceKind,
    sourceId: context.sourceId,
    referenceKind: storyboardLocatorToReferenceKind(ref),
    role: context.role,
    modality: storyboardMediaRefToModality(ref),
    payload: storyboardMediaRefPayload(ref),
    metadata: compactJsonRecord({
      storyboardRefId: ref.refId,
      storyboardRole: ref.role,
      label: ref.label,
      mimeType: ref.mimeType,
      refMetadata: jsonValue(ref.metadata),
    }),
  };
}

function storyboardMediaRefPayload(ref: StoryboardMediaRef): ReferenceDescriptorPayload {
  switch (ref.locator.type) {
    case 'canvas-node':
      return {
        type: 'canvas-node',
        nodeId: ref.locator.canvasNodeId,
        ...(ref.locator.outputId ? { slotId: ref.locator.outputId } : {}),
      };
    case 'asset':
      return {
        type: 'generated-asset',
        assetId: ref.locator.assetId,
        ...(ref.locator.assetVersion ? { variantId: ref.locator.assetVersion } : {}),
      };
    case 'workspace-path':
      return {
        type: 'path',
        path: ref.locator.path,
        pathKind: pathKindFor(ref.locator.path),
      };
    case 'tool-result':
      return {
        type: 'custom',
        data: compactJsonRecord({
          locatorType: ref.locator.type,
          toolCallId: ref.locator.toolCallId,
          assetIndex: ref.locator.assetIndex,
          taskId: ref.locator.taskId,
        }),
      };
    case 'story-source':
      return {
        type: 'custom',
        data: compactJsonRecord({
          locatorType: ref.locator.type,
          storyId: ref.locator.storyId,
          sceneId: ref.locator.sceneId,
          frameIndex: ref.locator.frameIndex,
        }),
      };
  }
}

function createResourceDescriptor(input: {
  readonly referenceId: string;
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly role: ReferenceRole;
  readonly modality: ReferenceModality;
  readonly resourceRef: unknown;
  readonly metadata?: ReferenceJsonRecord;
}): ReferenceDescriptor {
  return {
    schemaVersion: REFERENCE_DESCRIPTOR_SCHEMA_VERSION,
    kind: REFERENCE_DESCRIPTOR_KIND,
    referenceId: input.referenceId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    referenceKind: 'resource',
    role: input.role,
    modality: input.modality,
    payload: {
      type: 'resource',
      resourceRef: jsonValue(input.resourceRef) ?? null,
      mediaType: input.modality,
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function createPathDescriptor(input: {
  readonly referenceId: string;
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly role: ReferenceRole;
  readonly modality: ReferenceModality;
  readonly path: string;
  readonly metadata?: ReferenceJsonRecord;
}): ReferenceDescriptor {
  return {
    schemaVersion: REFERENCE_DESCRIPTOR_SCHEMA_VERSION,
    kind: REFERENCE_DESCRIPTOR_KIND,
    referenceId: input.referenceId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    referenceKind: 'resource',
    role: input.role,
    modality: input.modality,
    payload: {
      type: 'path',
      path: input.path,
      pathKind: pathKindFor(input.path),
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function createCanvasNodeDescriptor(input: {
  readonly referenceId: string;
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly role: ReferenceRole;
  readonly modality: ReferenceModality;
  readonly nodeId: string;
  readonly metadata?: ReferenceJsonRecord;
}): ReferenceDescriptor {
  return {
    schemaVersion: REFERENCE_DESCRIPTOR_SCHEMA_VERSION,
    kind: REFERENCE_DESCRIPTOR_KIND,
    referenceId: input.referenceId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    referenceKind: 'canvas-node',
    role: input.role,
    modality: input.modality,
    payload: {
      type: 'canvas-node',
      nodeId: input.nodeId,
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function createGeneratedAssetDescriptor(input: {
  readonly referenceId: string;
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly role: ReferenceRole;
  readonly modality: ReferenceModality;
  readonly assetId: string;
  readonly variantId?: string;
  readonly metadata?: ReferenceJsonRecord;
}): ReferenceDescriptor {
  return {
    schemaVersion: REFERENCE_DESCRIPTOR_SCHEMA_VERSION,
    kind: REFERENCE_DESCRIPTOR_KIND,
    referenceId: input.referenceId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    referenceKind: 'generated-asset',
    role: input.role,
    modality: input.modality,
    payload: {
      type: 'generated-asset',
      assetId: input.assetId,
      ...(input.variantId ? { variantId: input.variantId } : {}),
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function createEntityDescriptor(input: {
  readonly referenceId: string;
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly role: ReferenceRole;
  readonly modality: ReferenceModality;
  readonly entityId: string;
  readonly entityKind: string;
  readonly representationId?: string;
  readonly assetRefs?: readonly ReferenceJsonValue[];
  readonly confidence?: number;
  readonly metadata?: ReferenceJsonRecord;
}): ReferenceDescriptor {
  return {
    schemaVersion: REFERENCE_DESCRIPTOR_SCHEMA_VERSION,
    kind: REFERENCE_DESCRIPTOR_KIND,
    referenceId: input.referenceId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    referenceKind: 'entity',
    role: input.role,
    modality: input.modality,
    payload: {
      type: 'entity',
      entityId: input.entityId,
      entityKind: input.entityKind,
      ...(input.representationId ? { representationId: input.representationId } : {}),
      ...(input.assetRefs ? { assetRefs: input.assetRefs } : {}),
    },
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function validateDescriptors(
  descriptors: readonly ReferenceDescriptor[],
  options: ReferenceValidationOptions,
): readonly ReferenceDiagnostic[] {
  return descriptors.flatMap(
    (descriptor) => validateReferenceDescriptor(descriptor, options).diagnostics,
  );
}

function invalidSourceResult(message: string): ReferenceCollectionResult {
  return {
    descriptors: [],
    diagnostics: [
      createReferenceDiagnostic({
        code: 'invalid-root',
        message,
        purpose: 'collection',
        phase: 'collect',
      }),
    ],
  };
}

function defaultPreviewProjection(
  reference: ReferenceDescriptor,
): ReferencePreviewProjection | undefined {
  switch (reference.payload.type) {
    case 'path':
      return {
        projectionId: `${reference.referenceId}:preview`,
        referenceId: reference.referenceId,
        uri: reference.payload.path,
        mediaType: reference.modality,
      };
    case 'resource':
      return {
        projectionId: `${reference.referenceId}:preview`,
        referenceId: reference.referenceId,
        label: reference.referenceId,
        mediaType: reference.modality,
        metadata: { resourceRef: reference.payload.resourceRef },
      };
    case 'generated-asset':
      return {
        projectionId: `${reference.referenceId}:preview`,
        referenceId: reference.referenceId,
        label: reference.payload.assetId,
        mediaType: reference.modality,
        metadata: compactJsonRecord({
          assetId: reference.payload.assetId,
          variantId: reference.payload.variantId,
        }),
      };
    case 'canvas-node':
      return {
        projectionId: `${reference.referenceId}:preview`,
        referenceId: reference.referenceId,
        label: reference.payload.nodeId,
        mediaType: reference.modality,
        metadata: compactJsonRecord({
          nodeId: reference.payload.nodeId,
          slotId: reference.payload.slotId,
          portId: reference.payload.portId,
          cellId: reference.payload.cellId,
        }),
      };
    case 'entity':
    case 'semantic-range':
    case 'artifact':
    case 'custom':
      return undefined;
  }
}

function defaultProviderInputs(
  reference: ReferenceDescriptor,
  request: ReferenceBatchResolveRequest,
): readonly ReferenceProviderInput[] {
  const requestedKinds = request.inputKinds;
  const preferredKind = preferredProviderInputKind(reference, requestedKinds);
  if (!preferredKind) return [];

  switch (reference.payload.type) {
    case 'path':
      return [
        {
          inputId: `${reference.referenceId}:${preferredKind}`,
          referenceId: reference.referenceId,
          inputKind: preferredKind,
          value: reference.payload.path,
        },
      ];
    case 'generated-asset':
      return [
        {
          inputId: `${reference.referenceId}:${preferredKind}`,
          referenceId: reference.referenceId,
          inputKind: preferredKind,
          value: compactJsonRecord({
            assetId: reference.payload.assetId,
            variantId: reference.payload.variantId,
          }),
        },
      ];
    case 'resource':
      return [
        {
          inputId: `${reference.referenceId}:${preferredKind}`,
          referenceId: reference.referenceId,
          inputKind: preferredKind,
          value: compactJsonRecord({
            resourceRef: reference.payload.resourceRef,
          }),
        },
      ];
    case 'canvas-node':
      return [
        {
          inputId: `${reference.referenceId}:${preferredKind}`,
          referenceId: reference.referenceId,
          inputKind: preferredKind,
          value: compactJsonRecord({
            nodeId: reference.payload.nodeId,
            slotId: reference.payload.slotId,
          }),
        },
      ];
    case 'entity':
    case 'semantic-range':
    case 'artifact':
    case 'custom':
      return [];
  }
}

function preferredProviderInputKind(
  reference: ReferenceDescriptor,
  requestedKinds: readonly ReferenceProviderInputKind[] | undefined,
): ReferenceProviderInputKind | undefined {
  const candidates: readonly ReferenceProviderInputKind[] =
    reference.role === 'mask'
      ? ['mask-uri']
      : reference.role === 'keyframe' || reference.modality === 'video'
        ? ['video-keyframe-uri', 'image-uri']
        : reference.modality === 'audio'
          ? ['audio-uri']
          : reference.modality === 'text'
            ? ['text']
            : ['image-uri', 'image-base64', 'ip-adapter-ref', 'resource-uri'];
  if (!requestedKinds || requestedKinds.length === 0) return candidates[0];
  return candidates.find((candidate) => requestedKinds.includes(candidate));
}

function unresolvedBatchItem(
  reference: ReferenceDescriptor,
  request: ReferenceBatchResolveRequest,
  message: string,
): ReferenceBatchItemResult {
  return {
    referenceId: reference.referenceId,
    status: 'unresolved',
    diagnostics: [
      createReferenceDiagnostic({
        code:
          request.purpose === 'provider-input'
            ? 'provider-input-unavailable'
            : 'reference-unresolved',
        message,
        targetCapability: request.targetCapability,
        purpose: request.purpose,
        phase: request.dryRun || request.policy?.dryRun ? 'preflight' : 'materialize',
      }),
    ],
  };
}

function summarizeBatch(
  items: readonly ReferenceBatchItemResult[],
  deduplicated: number,
): ReferenceBatchResolveSummary {
  return {
    total: items.length + deduplicated,
    resolved: items.filter((item) => item.status === 'resolved').length,
    unresolved: items.filter((item) => item.status === 'unresolved').length,
    partial: items.filter((item) => item.status === 'partial').length,
    skipped: items.filter((item) => item.status === 'skipped').length,
    deduplicated,
  };
}

function batchStatus(summary: ReferenceBatchResolveSummary): ReferenceResolutionStatus {
  if (summary.unresolved > 0 && summary.resolved > 0) return 'partial';
  if (summary.unresolved > 0) return 'unresolved';
  if (summary.partial > 0) return 'partial';
  if (summary.resolved > 0) return 'resolved';
  return 'skipped';
}

function isCanvasNodeLike(value: unknown): value is Pick<CanvasNode, 'id' | 'type'> & {
  readonly data?: unknown;
  readonly container?: unknown;
} {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['type'] === 'string';
}

function isShotImagePrepPlanLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['planId'] === 'string' &&
    Array.isArray(value['sourceMediaRefs'])
  );
}

function isGenericTableLike(value: unknown): value is Pick<GenericTable, 'tableId' | 'rows'> {
  return isRecord(value) && typeof value['tableId'] === 'string' && Array.isArray(value['rows']);
}

function isCompositeArtifactLike(
  value: unknown,
): value is Pick<CompositeArtifact, 'artifactId' | 'blocks'> {
  return (
    isRecord(value) && typeof value['artifactId'] === 'string' && Array.isArray(value['blocks'])
  );
}

function isStoryboardTableLike(value: unknown): value is Pick<StoryboardTable, 'title' | 'scenes'> {
  return isRecord(value) && typeof value['title'] === 'string' && Array.isArray(value['scenes']);
}

function roleFromString(value: unknown): ReferenceRole {
  return isReferenceRole(value) ? value : 'reference';
}

function storyboardRoleToReferenceRole(role: StoryboardMediaRole): ReferenceRole {
  switch (role) {
    case 'source':
      return 'source';
    case 'reference':
      return 'reference';
    case 'generated':
      return 'output';
    case 'derived':
      return 'derived';
    case 'thumbnail':
      return 'thumbnail';
    case 'mask':
      return 'mask';
  }
}

function storyboardMediaRefToModality(ref: StoryboardMediaRef): ReferenceModality {
  if (ref.mimeType?.startsWith('video/')) return 'video';
  if (ref.mimeType?.startsWith('audio/')) return 'audio';
  if (ref.mimeType?.startsWith('text/')) return 'text';
  if (ref.role === 'mask' || ref.mimeType?.startsWith('image/')) return 'image';
  return 'resource';
}

function storyboardLocatorToReferenceKind(ref: StoryboardMediaRef): ReferenceKind {
  switch (ref.locator.type) {
    case 'canvas-node':
      return 'canvas-node';
    case 'asset':
      return 'generated-asset';
    case 'workspace-path':
      return 'resource';
    case 'tool-result':
      return 'custom';
    case 'story-source':
      return 'custom';
  }
}

function artifactMediaTypeToModality(mediaType: ArtifactMediaItem['mediaType']): ReferenceModality {
  switch (mediaType) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'document':
      return 'document';
  }
  return 'unknown';
}

function inferModalityFromUnknown(value: unknown, fallback: ReferenceModality): ReferenceModality {
  if (typeof value === 'string') return fallback;
  if (!isRecord(value)) return fallback;
  const mediaType = value['mediaType'] ?? value['kind'];
  if (mediaType === 'image' || mediaType === 'media' || mediaType === 'preview') return 'image';
  if (mediaType === 'video') return 'video';
  if (mediaType === 'audio') return 'audio';
  if (mediaType === 'document') return 'document';
  if (typeof value['mimeType'] === 'string') {
    if (value['mimeType'].startsWith('image/')) return 'image';
    if (value['mimeType'].startsWith('video/')) return 'video';
    if (value['mimeType'].startsWith('audio/')) return 'audio';
  }
  return fallback;
}

function readMediaType(value: unknown): ReferenceModality {
  switch (value) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return 'resource';
  }
}

function pathKindFor(path: string): ReferencePathPayload['pathKind'] {
  if (path.startsWith('${')) return 'variable';
  if (/^(?:\.{0,2}\/)?[^/]/.test(path)) return 'workspace-relative';
  return 'transitional';
}

function readStringFromKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function jsonArray(value: readonly string[] | undefined): ReferenceJsonValue | undefined {
  return value ? [...value] : undefined;
}

function jsonValue(value: unknown): ReferenceJsonValue | undefined {
  return isReferenceJsonValue(value) ? value : undefined;
}

function compactJsonRecord(record: Readonly<Record<string, unknown>>): ReferenceJsonRecord {
  const compacted: Record<string, ReferenceJsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    const json = jsonValue(value);
    if (json !== undefined) {
      compacted[key] = json;
    }
  }
  return compacted;
}

function validatePayload(
  value: unknown,
  path: readonly ReferencePathSegment[],
  diagnostics: ReferenceDiagnostic[],
  options: ReferenceValidationOptions,
): void {
  if (!isRecord(value)) {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-payload',
      path,
      expected: 'object payload',
      actual: toReferenceJsonValue(value),
    });
    return;
  }

  const type = value['type'];
  if (typeof type !== 'string') {
    pushDiagnostic(diagnostics, options, {
      code: 'invalid-payload',
      path: [...path, 'type'],
      expected: 'payload type',
      actual: toReferenceJsonValue(type),
    });
  }

  validateSerializableValue(value, path, diagnostics, options, 0);
}

function validateOptionalSerializable(
  value: unknown,
  path: readonly ReferencePathSegment[],
  diagnostics: ReferenceDiagnostic[],
  options: ReferenceValidationOptions,
): void {
  if (value !== undefined) {
    validateSerializableValue(value, path, diagnostics, options, 0);
  }
}

function validateRequiredString(
  record: Readonly<Record<string, unknown>>,
  field: string,
  path: readonly ReferencePathSegment[],
  diagnostics: ReferenceDiagnostic[],
  options: ReferenceValidationOptions,
): void {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    pushDiagnostic(diagnostics, options, {
      code: value === undefined ? 'missing-required-field' : 'invalid-required-field',
      path: [...path, field],
      expected: 'non-empty string',
      actual: toReferenceJsonValue(value),
    });
  }
}

function validateSerializableValue(
  value: unknown,
  path: readonly ReferencePathSegment[],
  diagnostics: ReferenceDiagnostic[],
  options: ReferenceValidationOptions,
  depth: number,
): void {
  const maxDepth = options.maxDepth ?? 32;
  if (depth > maxDepth) {
    pushDiagnostic(diagnostics, options, {
      code: 'non-serializable-value',
      path,
      message: 'Value exceeds maximum serialization depth.',
      expected: `depth <= ${maxDepth}`,
    });
    return;
  }

  if (value === null || typeof value === 'boolean') return;

  if (typeof value === 'string') {
    if (isUnsafeReferenceRuntimeHandle(value)) {
      pushDiagnostic(diagnostics, options, {
        code: 'reference-unsafe-runtime-handle',
        path,
        actual: value,
      });
    }
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      pushDiagnostic(diagnostics, options, {
        code: 'non-serializable-value',
        path,
        expected: 'finite number',
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateSerializableValue(item, [...path, index], diagnostics, options, depth + 1),
    );
    return;
  }

  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      validateSerializableValue(item, [...path, key], diagnostics, options, depth + 1);
    }
    return;
  }

  pushDiagnostic(diagnostics, options, {
    code: 'non-serializable-value',
    path,
    expected: 'JSON serializable value',
  });
}

function validateSerializedSize(
  value: unknown,
  path: readonly ReferencePathSegment[],
  diagnostics: ReferenceDiagnostic[],
  options: ReferenceValidationOptions,
): void {
  const maxSerializedBytes = options.maxSerializedBytes;
  if (!maxSerializedBytes) return;

  const serialized = safeJsonStringify(value);
  if (serialized === undefined) {
    pushDiagnostic(diagnostics, options, {
      code: 'non-serializable-value',
      path,
      expected: 'JSON serializable value',
    });
    return;
  }

  if (serialized.length > maxSerializedBytes) {
    pushDiagnostic(diagnostics, options, {
      code: 'oversized-payload',
      path,
      expected: `<= ${maxSerializedBytes} bytes`,
      actual: serialized.length,
    });
  }
}

function pushDiagnostic(
  diagnostics: ReferenceDiagnostic[],
  context: ReferenceDiagnosticContext & { readonly maxDiagnostics?: number },
  input: CreateReferenceDiagnosticInput,
): void {
  if (context.maxDiagnostics !== undefined && diagnostics.length >= context.maxDiagnostics) {
    return;
  }
  diagnostics.push(
    createReferenceDiagnostic({
      targetCapability: context.targetCapability,
      purpose: context.purpose,
      phase: context.phase,
      ...input,
    }),
  );
}

function referenceDiagnosticSeverity(
  input: Pick<CreateReferenceDiagnosticInput, 'code' | 'targetCapability' | 'purpose' | 'phase'>,
): ReferenceDiagnosticSeverity {
  switch (input.code) {
    case 'invalid-root':
    case 'missing-required-field':
    case 'invalid-required-field':
    case 'invalid-source-kind':
    case 'invalid-role':
    case 'invalid-modality':
    case 'invalid-reference-kind':
    case 'invalid-confidence':
    case 'invalid-payload':
    case 'non-serializable-value':
    case 'oversized-payload':
    case 'reference-unresolved':
    case 'reference-unsafe-runtime-handle':
    case 'provider-input-unavailable':
      return 'error';
    case 'entity-representation-missing':
      return isExecutionPreflight(input) ? 'error' : 'warning';
    case 'reference-conflict':
      return isExecutionPreflight(input) ? 'error' : 'warning';
    case 'cost-estimate-required':
    case 'reference-needs-review':
      return 'warning';
    case 'reference-transitional-field':
      return input.purpose === 'provider-input' ? 'warning' : 'info';
  }
}

function isExecutionPreflight(
  input: Pick<CreateReferenceDiagnosticInput, 'targetCapability' | 'purpose' | 'phase'>,
): boolean {
  if (input.purpose === 'provider-input') return true;
  if (input.phase === 'preflight' || input.phase === 'execute') {
    return (
      input.targetCapability === 'GenerateImage' ||
      input.targetCapability === 'TransformImage' ||
      input.targetCapability === 'GenerateVideo' ||
      input.targetCapability === 'TTS'
    );
  }
  return false;
}

function defaultReferenceDiagnosticMessage(code: ReferenceDiagnosticCode): string {
  switch (code) {
    case 'invalid-root':
      return 'Reference descriptor must be an object.';
    case 'missing-required-field':
      return 'Reference descriptor is missing a required field.';
    case 'invalid-required-field':
      return 'Reference descriptor has an invalid required field.';
    case 'invalid-source-kind':
      return 'Reference descriptor has an unsupported source kind.';
    case 'invalid-role':
      return 'Reference descriptor has an unsupported role.';
    case 'invalid-modality':
      return 'Reference descriptor has an unsupported modality.';
    case 'invalid-reference-kind':
      return 'Reference descriptor has an unsupported reference kind.';
    case 'invalid-confidence':
      return 'Reference descriptor confidence must be between 0 and 1.';
    case 'invalid-payload':
      return 'Reference descriptor payload is invalid.';
    case 'non-serializable-value':
      return 'Reference descriptor contains a non-serializable value.';
    case 'oversized-payload':
      return 'Reference descriptor exceeds the allowed serialized size.';
    case 'reference-unresolved':
      return 'Stable reference could not be resolved.';
    case 'reference-unsafe-runtime-handle':
      return 'Reference contains an unsafe runtime handle.';
    case 'reference-needs-review':
      return 'Reference requires review before execution.';
    case 'entity-representation-missing':
      return 'Entity reference has no usable representation for this purpose.';
    case 'provider-input-unavailable':
      return 'Provider input could not be materialized from the reference.';
    case 'reference-conflict':
      return 'Reference conflicts with another reference or identity.';
    case 'cost-estimate-required':
      return 'Cost estimate is required before batch execution.';
    case 'reference-transitional-field':
      return 'Reference was projected from a transitional field.';
  }
}

function validateReferenceJsonValue(
  value: unknown,
  depth: number,
  maxDepth: number,
): value is ReferenceJsonValue {
  if (depth > maxDepth) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => validateReferenceJsonValue(item, depth + 1, maxDepth));
  }
  if (isRecord(value)) {
    return Object.values(value).every((item) =>
      validateReferenceJsonValue(item, depth + 1, maxDepth),
    );
  }
  return false;
}

function toReferenceJsonValue(value: unknown): ReferenceJsonValue | undefined {
  return isReferenceJsonValue(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] ?? null)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
