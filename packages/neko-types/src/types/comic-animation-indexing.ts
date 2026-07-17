// =============================================================================
// Comic-to-Animation Incremental Indexing Contracts
//
// Shared, host-agnostic contracts for comic/media evidence indexing, visual
// occurrences, continuity snapshots, local perception capability facets, and
// batch approval plans. Durable records store stable refs only.
// =============================================================================

import type {
  ArtifactDiagnostic,
  ArtifactJsonRecord,
  ArtifactJsonValue,
  CompositeArtifact,
  CompositeArtifactBlock,
  GenericTable,
  GenericTableCell,
  GenericTableColumn,
  GenericTableRow,
} from './composite-artifact';
import type {
  CharacterMemoryJsonRecord,
  CharacterMemoryJsonValue,
  CharacterMemoryPathSegment,
  CharacterMemorySourceRange,
  CharacterMemorySourceRef,
} from './character-memory';
import type { CreativeEntityRef } from './creative-entity-asset-composition';
import type { MediaBoundingBox } from './media-semantic-index';
import type { PerceptionCard, PerceptionEvidenceEntry } from './perception-card';
import type { CharacterReferenceRef, ShotReferenceBundle } from './shot-image-prep';
import type { StoryboardMediaRef } from './storyboard-table';

export const COMIC_ANIMATION_INDEXING_SCHEMA_VERSION = 1 as const;
export const INDEXED_RANGE_STATE_KIND = 'indexed-range-state' as const;
export const VISUAL_OCCURRENCE_KIND = 'visual-occurrence' as const;
export const PLOT_EVENT_KIND = 'plot-event' as const;
export const CHARACTER_STATE_CHANGE_KIND = 'character-state-change' as const;
export const CONTINUITY_CONSTRAINT_KIND = 'continuity-constraint' as const;
export const STORY_CONTINUITY_SNAPSHOT_KIND = 'story-continuity-snapshot' as const;
export const BATCH_EXECUTION_PLAN_KIND = 'batch-execution-plan' as const;

export const COMIC_ANIMATION_INDEX_TASKS = [
  'ocr',
  'asr',
  'subtitle',
  'panel-detection',
  'reading-order',
  'speech-balloon-mask',
  'visual-occurrence',
  'embedding',
  'vlm-review',
] as const;

export const INDEX_TASK_STATUSES = [
  'pending',
  'queued',
  'running',
  'complete',
  'partial',
  'stale',
  'failed',
  'skipped',
  'needs-review',
] as const;

export const INDEXED_RANGE_STATUSES = [
  'pending',
  'partial',
  'complete',
  'stale',
  'failed',
  'skipped',
  'needs-review',
] as const;

export const INDEX_RANGE_KINDS = ['asset', 'page', 'panel', 'frame', 'time', 'bbox'] as const;

export const PERCEPTION_CAPABILITY_SOURCES = [
  'builtin',
  'local',
  'engine',
  'plugin',
  'mcp',
  'cloud',
] as const;

export const PERCEPTION_MEDIA_KINDS = [
  'image',
  'comic',
  'document-page',
  'video-frame',
  'audio',
  'subtitle',
] as const;

export const PERCEPTION_EXECUTION_MODES = ['sync-light', 'async-local', 'async-cloud'] as const;

export const PERCEPTION_DEVICE_TIERS = ['light', 'medium', 'high'] as const;

export const PERCEPTION_CACHE_POLICIES = ['required', 'recommended', 'none'] as const;

export const PERCEPTION_CONFIDENCE_KINDS = ['provider-score', 'heuristic', 'none'] as const;

export const COMIC_ANIMATION_REVIEW_STATES = [
  'candidate',
  'needs-review',
  'accepted',
  'rejected',
  'conflict',
] as const;

export const CHARACTER_STATE_CHANGE_DIMENSIONS = [
  'appearance',
  'outfit',
  'injury',
  'location',
  'knowledge',
  'relationship',
  'goal',
  'emotion',
  'voice',
  'ability',
  'occupation',
  'age',
  'species',
  'gender',
  'other',
] as const;

export const CONTINUITY_CONSTRAINT_TYPES = [
  'blocking',
  'warning',
  'preference',
  'open-question',
] as const;

export const STORY_CONTINUITY_INCLUDE_FLAGS = [
  'plot-events',
  'character-states',
  'constraints',
  'unresolved-questions',
  'diagnostics',
] as const;

export const BATCH_EXECUTION_TARGET_DOMAINS = [
  'asset-indexing',
  'shot-image-prep',
  'video-generation',
  'voice-generation',
] as const;

export const BATCH_EXECUTION_PLAN_STATUSES = [
  'planned',
  'needs-approval',
  'approved',
  'queued',
  'running',
  'succeeded',
  'failed',
  'partial',
  'cancelled',
  'skipped',
] as const;

export const BATCH_EXECUTION_ITEM_STATUSES = [
  'planned',
  'needs-approval',
  'approved',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
] as const;

export const BATCH_EXECUTION_FAILURE_POLICIES = [
  'stop-on-first-failure',
  'continue',
  'continue-approved-only',
] as const;

export const BATCH_EXECUTION_COST_STATES = ['known', 'unknown', 'unavailable'] as const;

export const BATCH_EXECUTION_RETRY_REASONS = [
  'provider-timeout',
  'rate-limit',
  'transient-error',
] as const;

export type ComicAnimationIndexTask = (typeof COMIC_ANIMATION_INDEX_TASKS)[number];
export type IndexTaskStatus = (typeof INDEX_TASK_STATUSES)[number];
export type IndexedRangeStatus = (typeof INDEXED_RANGE_STATUSES)[number];
export type IndexRangeKind = (typeof INDEX_RANGE_KINDS)[number];
export type PerceptionCapabilitySource = (typeof PERCEPTION_CAPABILITY_SOURCES)[number];
export type PerceptionMediaKind = (typeof PERCEPTION_MEDIA_KINDS)[number];
export type PerceptionExecutionMode = (typeof PERCEPTION_EXECUTION_MODES)[number];
export type PerceptionDeviceTier = (typeof PERCEPTION_DEVICE_TIERS)[number];
export type PerceptionCachePolicy = (typeof PERCEPTION_CACHE_POLICIES)[number];
export type PerceptionConfidenceKind = (typeof PERCEPTION_CONFIDENCE_KINDS)[number];
export type ComicAnimationReviewState = (typeof COMIC_ANIMATION_REVIEW_STATES)[number];
export type CharacterStateChangeDimension =
  (typeof CHARACTER_STATE_CHANGE_DIMENSIONS)[number] | (string & {});
export type ContinuityConstraintType = (typeof CONTINUITY_CONSTRAINT_TYPES)[number];
export type StoryContinuityIncludeFlag = (typeof STORY_CONTINUITY_INCLUDE_FLAGS)[number];
export type BatchExecutionBuiltInTargetDomain = (typeof BATCH_EXECUTION_TARGET_DOMAINS)[number];
export type BatchExecutionTargetDomain = BatchExecutionBuiltInTargetDomain | `${string}.${string}`;
export type BatchExecutionPlanStatus = (typeof BATCH_EXECUTION_PLAN_STATUSES)[number];
export type BatchExecutionItemStatus = (typeof BATCH_EXECUTION_ITEM_STATUSES)[number];
export type BatchExecutionFailurePolicy = (typeof BATCH_EXECUTION_FAILURE_POLICIES)[number];
export type BatchExecutionCostState = (typeof BATCH_EXECUTION_COST_STATES)[number];
export type BatchExecutionRetryReason = (typeof BATCH_EXECUTION_RETRY_REASONS)[number];

export type ComicAnimationJsonValue = CharacterMemoryJsonValue;
export type ComicAnimationJsonRecord = CharacterMemoryJsonRecord;
export type ComicAnimationPathSegment = CharacterMemoryPathSegment;

export type ComicAnimationDiagnosticCode =
  | 'invalid-root'
  | 'invalid-schema-version'
  | 'invalid-kind'
  | 'missing-required-field'
  | 'invalid-required-field'
  | 'invalid-status'
  | 'invalid-task'
  | 'invalid-range-kind'
  | 'invalid-source-ref'
  | 'invalid-bounding-box'
  | 'invalid-confidence'
  | 'invalid-provider-facet'
  | 'invalid-policy'
  | 'invalid-domain'
  | 'provider-unavailable'
  | 'device-tier-mismatch'
  | 'cost-unknown'
  | 'low-confidence'
  | 'conflict'
  | 'non-serializable-value'
  | 'unsafe-runtime-handle'
  | 'oversized-payload';

export interface ComicAnimationDiagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'suggestion';
  readonly code: ComicAnimationDiagnosticCode;
  readonly path: readonly ComicAnimationPathSegment[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: ComicAnimationJsonValue;
  readonly details?: ComicAnimationJsonRecord;
}

export interface ComicAnimationValidationOptions {
  readonly maxSerializedBytes?: number;
  readonly maxDiagnostics?: number;
  readonly requireStableRefs?: boolean;
}

export interface ComicAnimationValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly ComicAnimationDiagnostic[];
}

export interface IndexedRangeRef {
  readonly rangeId: string;
  readonly sourceRef: CharacterMemorySourceRef;
  readonly rangeKind: IndexRangeKind;
  readonly range?: CharacterMemorySourceRange;
  readonly boundingBox?: MediaBoundingBox;
  readonly assetHash?: string;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface IndexTaskState {
  readonly taskId: string;
  readonly task: ComicAnimationIndexTask;
  readonly status: IndexTaskStatus;
  readonly providerId?: string;
  readonly modelVersion?: string;
  readonly sourceHash?: string;
  readonly confidence?: number;
  readonly cacheKey?: string;
  readonly evidenceRefs?: readonly string[];
  readonly staleReason?: string;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly queuedAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface IndexedRangeState {
  readonly schemaVersion: typeof COMIC_ANIMATION_INDEXING_SCHEMA_VERSION;
  readonly kind: typeof INDEXED_RANGE_STATE_KIND;
  readonly rangeId: string;
  readonly assetId: string;
  readonly rangeRef: IndexedRangeRef;
  readonly status: IndexedRangeStatus;
  readonly tasks: readonly IndexTaskState[];
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly updatedAt?: string;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface VisualOccurrence {
  readonly schemaVersion: typeof COMIC_ANIMATION_INDEXING_SCHEMA_VERSION;
  readonly kind: typeof VISUAL_OCCURRENCE_KIND;
  readonly occurrenceId: string;
  readonly sourceRef: CharacterMemorySourceRef;
  readonly range?: CharacterMemorySourceRange;
  readonly boundingBox?: MediaBoundingBox;
  readonly cropRef?: StoryboardMediaRef;
  readonly maskRefs?: readonly StoryboardMediaRef[];
  readonly candidateEntityRefs?: readonly CreativeEntityRef[];
  readonly candidateIds?: readonly string[];
  readonly appearanceText?: string;
  readonly providerId?: string;
  readonly modelVersion?: string;
  readonly confidence?: number;
  readonly reviewState?: ComicAnimationReviewState;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface PerceptionCapabilityFacet {
  readonly providerId: string;
  readonly source: PerceptionCapabilitySource;
  readonly tasks: readonly ComicAnimationIndexTask[];
  readonly supportedMediaKinds: readonly PerceptionMediaKind[];
  readonly executionMode: PerceptionExecutionMode;
  readonly deviceTier: PerceptionDeviceTier;
  readonly defaultConcurrency: number;
  readonly cachePolicy: PerceptionCachePolicy;
  readonly confidenceKind: PerceptionConfidenceKind;
  readonly approvalRequired?: boolean;
  readonly providerVersion?: string;
  readonly modelVersion?: string;
  readonly unavailableReason?: string;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface StoryPositionRef {
  readonly chapterId?: string;
  readonly sceneId?: string;
  readonly shotId?: string;
  readonly pageId?: string;
  readonly panelId?: string;
  readonly timeMs?: number;
  readonly orderIndex?: number;
}

export interface PlotEvent {
  readonly schemaVersion: typeof COMIC_ANIMATION_INDEXING_SCHEMA_VERSION;
  readonly kind: typeof PLOT_EVENT_KIND;
  readonly eventId: string;
  readonly summary: string;
  readonly storyPosition: StoryPositionRef;
  readonly orderIndex: number;
  readonly sourceRef: CharacterMemorySourceRef;
  readonly participantRefs?: readonly CreativeEntityRef[];
  readonly evidenceRefs?: readonly string[];
  readonly confidence?: number;
  readonly reviewState?: ComicAnimationReviewState;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface CharacterStateChange {
  readonly schemaVersion: typeof COMIC_ANIMATION_INDEXING_SCHEMA_VERSION;
  readonly kind: typeof CHARACTER_STATE_CHANGE_KIND;
  readonly changeId: string;
  readonly characterRef: CreativeEntityRef;
  readonly dimension: CharacterStateChangeDimension;
  readonly storyPosition?: StoryPositionRef;
  readonly orderIndex?: number;
  readonly before?: ComicAnimationJsonValue;
  readonly after?: ComicAnimationJsonValue;
  readonly note?: string;
  readonly sourceRef: CharacterMemorySourceRef;
  readonly evidenceRefs?: readonly string[];
  readonly confidence?: number;
  readonly reviewState?: ComicAnimationReviewState;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface ContinuityConstraint {
  readonly schemaVersion: typeof COMIC_ANIMATION_INDEXING_SCHEMA_VERSION;
  readonly kind: typeof CONTINUITY_CONSTRAINT_KIND;
  readonly constraintId: string;
  readonly type: ContinuityConstraintType;
  readonly message: string;
  readonly appliesTo?: StoryPositionRef;
  readonly entityRefs?: readonly CreativeEntityRef[];
  readonly sourceRef?: CharacterMemorySourceRef;
  readonly evidenceRefs?: readonly string[];
  readonly active?: boolean;
  readonly confidence?: number;
  readonly reviewState?: ComicAnimationReviewState;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface StoryContinuityLookbackLimit {
  readonly boundary?: 'scene' | 'chapter' | 'project';
  readonly maxEvents?: number;
  readonly maxCharacterStates?: number;
  readonly maxConstraints?: number;
}

export interface StoryContinuityQuery {
  readonly queryId?: string;
  readonly storyPosition?: StoryPositionRef;
  readonly characterRefs?: readonly CreativeEntityRef[];
  readonly locationRefs?: readonly CreativeEntityRef[];
  readonly include?: readonly StoryContinuityIncludeFlag[];
  readonly lookbackLimit?: StoryContinuityLookbackLimit;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface StoryContinuitySnapshot {
  readonly schemaVersion: typeof COMIC_ANIMATION_INDEXING_SCHEMA_VERSION;
  readonly kind: typeof STORY_CONTINUITY_SNAPSHOT_KIND;
  readonly snapshotId: string;
  readonly query: StoryContinuityQuery;
  readonly events: readonly PlotEvent[];
  readonly characterStates: readonly CharacterStateChange[];
  readonly constraints: readonly ContinuityConstraint[];
  readonly unresolvedQuestions?: readonly string[];
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly limitsApplied?: StoryContinuityLookbackLimit;
  readonly generatedAt?: string;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface BatchExecutionApprovalPolicy {
  readonly requiresApproval: boolean;
  readonly approvalId?: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly reason?: string;
}

export interface BatchExecutionRetryPolicy {
  readonly maxAttempts: number;
  readonly retryOn: readonly BatchExecutionRetryReason[];
}

export interface BatchExecutionBudgetLimit {
  readonly maxEstimatedCost?: number;
  readonly maxEstimatedTokens?: number;
  readonly maxItems?: number;
}

export interface BatchExecutionPolicy {
  readonly maxConcurrency: number;
  readonly retryPolicy?: BatchExecutionRetryPolicy;
  readonly failurePolicy: BatchExecutionFailurePolicy;
  readonly budgetLimit?: BatchExecutionBudgetLimit;
  readonly allowCancellation?: boolean;
}

export interface BatchExecutionCostEstimate {
  readonly estimateState: BatchExecutionCostState;
  readonly providerId?: string;
  readonly estimatedCost?: number;
  readonly estimatedTokens?: number;
  readonly estimatedDurationMs?: number;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
}

export interface BatchExecutionItem {
  readonly itemId: string;
  readonly targetRef: string;
  readonly capabilityId: string;
  readonly status: BatchExecutionItemStatus;
  readonly providerId?: string;
  readonly requiredDeviceTier?: PerceptionDeviceTier;
  readonly costEstimate?: BatchExecutionCostEstimate;
  readonly inputRefs?: readonly string[];
  readonly outputRefs?: readonly string[];
  readonly retryCount?: number;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface BatchExecutionPlan {
  readonly schemaVersion: typeof COMIC_ANIMATION_INDEXING_SCHEMA_VERSION;
  readonly kind: typeof BATCH_EXECUTION_PLAN_KIND;
  readonly planId: string;
  readonly sourceArtifactRefs?: readonly string[];
  readonly targetDomain: BatchExecutionTargetDomain;
  readonly items: readonly BatchExecutionItem[];
  readonly approvalPolicy: BatchExecutionApprovalPolicy;
  readonly executionPolicy: BatchExecutionPolicy;
  readonly costEstimate?: BatchExecutionCostEstimate;
  readonly status: BatchExecutionPlanStatus;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface ProjectPerceptionCardToIndexedRangeStateInput {
  readonly card: PerceptionCard;
  readonly sourceRef: CharacterMemorySourceRef;
  readonly rangeKind?: IndexRangeKind;
  readonly range?: CharacterMemorySourceRange;
  readonly tasks?: readonly ComicAnimationIndexTask[];
  readonly rangeId?: string;
  readonly updatedAt?: string;
}

export interface ProjectVisualOccurrenceFromEvidenceInput {
  readonly occurrenceId: string;
  readonly sourceRef: CharacterMemorySourceRef;
  readonly range?: CharacterMemorySourceRange;
  readonly boundingBox?: MediaBoundingBox;
  readonly cropRef?: StoryboardMediaRef;
  readonly maskRefs?: readonly StoryboardMediaRef[];
  readonly candidateEntityRefs?: readonly CreativeEntityRef[];
  readonly candidateIds?: readonly string[];
  readonly appearanceText?: string;
  readonly providerId?: string;
  readonly modelVersion?: string;
  readonly confidence?: number;
  readonly facet?: PerceptionCapabilityFacet;
  readonly metadata?: ComicAnimationJsonRecord;
}

export interface PerceptionCapabilityDiagnosticContext {
  readonly availableProviderIds?: readonly string[];
  readonly currentDeviceTier?: PerceptionDeviceTier;
  readonly requireConfidenceForAutoBinding?: boolean;
}

export function isComicAnimationIndexTask(value: unknown): value is ComicAnimationIndexTask {
  return includesString(COMIC_ANIMATION_INDEX_TASKS, value);
}

export function isIndexTaskStatus(value: unknown): value is IndexTaskStatus {
  return includesString(INDEX_TASK_STATUSES, value);
}

export function isIndexedRangeStatus(value: unknown): value is IndexedRangeStatus {
  return includesString(INDEXED_RANGE_STATUSES, value);
}

export function isIndexRangeKind(value: unknown): value is IndexRangeKind {
  return includesString(INDEX_RANGE_KINDS, value);
}

export function isPerceptionCapabilitySource(value: unknown): value is PerceptionCapabilitySource {
  return includesString(PERCEPTION_CAPABILITY_SOURCES, value);
}

export function isPerceptionMediaKind(value: unknown): value is PerceptionMediaKind {
  return includesString(PERCEPTION_MEDIA_KINDS, value);
}

export function isPerceptionExecutionMode(value: unknown): value is PerceptionExecutionMode {
  return includesString(PERCEPTION_EXECUTION_MODES, value);
}

export function isPerceptionDeviceTier(value: unknown): value is PerceptionDeviceTier {
  return includesString(PERCEPTION_DEVICE_TIERS, value);
}

export function isPerceptionCachePolicy(value: unknown): value is PerceptionCachePolicy {
  return includesString(PERCEPTION_CACHE_POLICIES, value);
}

export function isPerceptionConfidenceKind(value: unknown): value is PerceptionConfidenceKind {
  return includesString(PERCEPTION_CONFIDENCE_KINDS, value);
}

export function isComicAnimationReviewState(value: unknown): value is ComicAnimationReviewState {
  return includesString(COMIC_ANIMATION_REVIEW_STATES, value);
}

export function isContinuityConstraintType(value: unknown): value is ContinuityConstraintType {
  return includesString(CONTINUITY_CONSTRAINT_TYPES, value);
}

export function isStoryContinuityIncludeFlag(value: unknown): value is StoryContinuityIncludeFlag {
  return includesString(STORY_CONTINUITY_INCLUDE_FLAGS, value);
}

export function isBatchExecutionTargetDomain(value: unknown): value is BatchExecutionTargetDomain {
  return (
    includesString(BATCH_EXECUTION_TARGET_DOMAINS, value) ||
    (typeof value === 'string' && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value))
  );
}

export function isBatchExecutionPlanStatus(value: unknown): value is BatchExecutionPlanStatus {
  return includesString(BATCH_EXECUTION_PLAN_STATUSES, value);
}

export function isBatchExecutionItemStatus(value: unknown): value is BatchExecutionItemStatus {
  return includesString(BATCH_EXECUTION_ITEM_STATUSES, value);
}

export function isBatchExecutionFailurePolicy(
  value: unknown,
): value is BatchExecutionFailurePolicy {
  return includesString(BATCH_EXECUTION_FAILURE_POLICIES, value);
}

export function isBatchExecutionCostState(value: unknown): value is BatchExecutionCostState {
  return includesString(BATCH_EXECUTION_COST_STATES, value);
}

export function perceptionFacetRequiresReview(facet: PerceptionCapabilityFacet): boolean {
  return facet.approvalRequired === true || facet.confidenceKind === 'none';
}

export function reviewStateForPerceptionOutput(
  facet: PerceptionCapabilityFacet,
  confidence?: number,
): ComicAnimationReviewState {
  if (facet.confidenceKind === 'none') return 'needs-review';
  if (confidence === undefined) return facet.approvalRequired ? 'needs-review' : 'candidate';
  if (confidence >= 0.85 && !facet.approvalRequired) return 'candidate';
  if (confidence >= 0.55) return 'needs-review';
  return 'needs-review';
}

export function createLocalPerceptionCapabilityFacet(input: {
  readonly providerId: string;
  readonly source?: Extract<PerceptionCapabilitySource, 'builtin' | 'local' | 'engine'>;
  readonly tasks: readonly ComicAnimationIndexTask[];
  readonly supportedMediaKinds: readonly PerceptionMediaKind[];
  readonly deviceTier?: PerceptionDeviceTier;
  readonly defaultConcurrency?: number;
  readonly confidenceKind?: PerceptionConfidenceKind;
  readonly cachePolicy?: PerceptionCachePolicy;
  readonly approvalRequired?: boolean;
  readonly providerVersion?: string;
  readonly modelVersion?: string;
}): PerceptionCapabilityFacet {
  return {
    providerId: input.providerId,
    source: input.source ?? 'local',
    tasks: input.tasks,
    supportedMediaKinds: input.supportedMediaKinds,
    executionMode: input.deviceTier === 'light' ? 'sync-light' : 'async-local',
    deviceTier: input.deviceTier ?? 'light',
    defaultConcurrency: input.defaultConcurrency ?? 1,
    cachePolicy: input.cachePolicy ?? 'recommended',
    confidenceKind: input.confidenceKind ?? 'provider-score',
    ...(input.approvalRequired !== undefined ? { approvalRequired: input.approvalRequired } : {}),
    ...(input.providerVersion ? { providerVersion: input.providerVersion } : {}),
    ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
  };
}

export function createLocalOcrPerceptionCapabilityFacet(
  providerId = 'local.ocr',
): PerceptionCapabilityFacet {
  return createLocalPerceptionCapabilityFacet({
    providerId,
    source: 'engine',
    tasks: ['ocr'],
    supportedMediaKinds: ['image', 'comic', 'document-page', 'video-frame'],
    deviceTier: 'light',
    defaultConcurrency: 2,
    confidenceKind: 'provider-score',
    cachePolicy: 'required',
  });
}

export function createLocalPanelDetectionPerceptionCapabilityFacet(
  providerId = 'local.panel-detection',
): PerceptionCapabilityFacet {
  return createLocalPerceptionCapabilityFacet({
    providerId,
    source: 'engine',
    tasks: ['panel-detection'],
    supportedMediaKinds: ['comic', 'image'],
    deviceTier: 'medium',
    defaultConcurrency: 1,
    confidenceKind: 'heuristic',
    cachePolicy: 'required',
  });
}

export function createLocalReadingOrderPerceptionCapabilityFacet(
  providerId = 'local.reading-order',
): PerceptionCapabilityFacet {
  return createLocalPerceptionCapabilityFacet({
    providerId,
    source: 'builtin',
    tasks: ['reading-order'],
    supportedMediaKinds: ['comic', 'document-page'],
    deviceTier: 'light',
    defaultConcurrency: 4,
    confidenceKind: 'heuristic',
    cachePolicy: 'recommended',
  });
}

export function createLocalSpeechBalloonMaskPerceptionCapabilityFacet(
  providerId = 'local.speech-balloon-mask',
): PerceptionCapabilityFacet {
  return createLocalPerceptionCapabilityFacet({
    providerId,
    source: 'engine',
    tasks: ['speech-balloon-mask'],
    supportedMediaKinds: ['comic', 'image'],
    deviceTier: 'medium',
    defaultConcurrency: 1,
    confidenceKind: 'provider-score',
    cachePolicy: 'required',
    approvalRequired: true,
  });
}

export function diagnosePerceptionCapabilityFacet(
  facet: PerceptionCapabilityFacet,
  context: PerceptionCapabilityDiagnosticContext = {},
): readonly ComicAnimationDiagnostic[] {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  const availableProviderIds = context.availableProviderIds
    ? new Set(context.availableProviderIds)
    : undefined;
  if (availableProviderIds && !availableProviderIds.has(facet.providerId)) {
    diagnostics.push(
      diagnostic(
        'warning',
        'provider-unavailable',
        ['providerId'],
        'Perception provider is not available in the current context.',
        {
          actual: facet.providerId,
          details: facet.unavailableReason ? { reason: facet.unavailableReason } : undefined,
        },
      ),
    );
  }
  if (
    context.currentDeviceTier &&
    compareDeviceTier(facet.deviceTier, context.currentDeviceTier) > 0
  ) {
    diagnostics.push(
      diagnostic(
        'warning',
        'device-tier-mismatch',
        ['deviceTier'],
        'Perception provider requires a higher device tier than the current context.',
        {
          expected: `<= ${context.currentDeviceTier}`,
          actual: facet.deviceTier,
        },
      ),
    );
  }
  if (context.requireConfidenceForAutoBinding && facet.confidenceKind === 'none') {
    diagnostics.push(
      diagnostic(
        'info',
        'low-confidence',
        ['confidenceKind'],
        'Confidence-less perception output must stay on the review path.',
        {
          actual: facet.confidenceKind,
        },
      ),
    );
  }
  return diagnostics;
}

export function projectPerceptionCardToIndexedRangeState(
  input: ProjectPerceptionCardToIndexedRangeStateInput,
): IndexedRangeState {
  const tasks = input.tasks ?? perceptionCardTasks(input.card);
  const rangeId = input.rangeId ?? `${input.card.assetId}:${input.rangeKind ?? 'asset'}`;
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: INDEXED_RANGE_STATE_KIND,
    rangeId,
    assetId: input.card.assetId,
    rangeRef: {
      rangeId,
      sourceRef: input.sourceRef,
      rangeKind: input.rangeKind ?? 'asset',
      ...(input.range ? { range: input.range } : {}),
    },
    status: tasks.length === 0 ? 'pending' : 'partial',
    tasks: tasks.map((task, index) => ({
      taskId: `${rangeId}:${task}:${index}`,
      task,
      status: taskStatusFromPerceptionCard(input.card, task),
      providerId: 'perception-card',
      confidence: confidenceForTask(input.card.semantic?.evidences, task),
      evidenceRefs: [`perception-card:${input.card.assetId}:${input.card.createdAt}`],
    })),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

export function projectVisualOccurrenceFromEvidence(
  input: ProjectVisualOccurrenceFromEvidenceInput,
): VisualOccurrence {
  const reviewState = input.facet
    ? reviewStateForPerceptionOutput(input.facet, input.confidence)
    : input.confidence !== undefined && input.confidence < 0.85
      ? 'needs-review'
      : 'candidate';
  const diagnostics = input.facet
    ? diagnosePerceptionCapabilityFacet(input.facet, {
        requireConfidenceForAutoBinding: true,
      })
    : [];
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: VISUAL_OCCURRENCE_KIND,
    occurrenceId: input.occurrenceId,
    sourceRef: input.sourceRef,
    ...(input.range ? { range: input.range } : {}),
    ...(input.boundingBox ? { boundingBox: input.boundingBox } : {}),
    ...(input.cropRef ? { cropRef: input.cropRef } : {}),
    ...(input.maskRefs ? { maskRefs: input.maskRefs } : {}),
    ...(input.candidateEntityRefs ? { candidateEntityRefs: input.candidateEntityRefs } : {}),
    ...(input.candidateIds ? { candidateIds: input.candidateIds } : {}),
    ...(input.appearanceText ? { appearanceText: input.appearanceText } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    reviewState,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function projectVisualOccurrencesToShotReferenceBundle(
  occurrences: readonly VisualOccurrence[],
): ShotReferenceBundle {
  const characterRefs = occurrences.flatMap((occurrence): readonly CharacterReferenceRef[] => {
    const entityRef = occurrence.candidateEntityRefs?.[0];
    if (!entityRef || entityRef.entityKind !== 'character') return [];
    return [
      {
        entityRef,
        role: 'appearance',
        ...(occurrence.cropRef ? { assetRefs: [occurrence.cropRef] } : {}),
        confidence: occurrence.confidence,
      },
    ];
  });
  const styleRefs = occurrences.flatMap((occurrence) =>
    occurrence.cropRef ? [occurrence.cropRef] : [],
  );
  return {
    ...(characterRefs.length > 0 ? { characterRefs } : {}),
    ...(styleRefs.length > 0 ? { styleRefs } : {}),
    continuityNotes: occurrences.flatMap((occurrence) =>
      occurrence.appearanceText ? [occurrence.appearanceText] : [],
    ),
  };
}

export function buildComicAnimationReviewArtifact(input: {
  readonly artifactId: string;
  readonly title?: string;
  readonly visualOccurrences?: readonly VisualOccurrence[];
  readonly continuitySnapshot?: StoryContinuitySnapshot;
  readonly batchPlan?: BatchExecutionPlan;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
}): CompositeArtifact {
  const blocks: CompositeArtifactBlock[] = [];
  if (input.visualOccurrences && input.visualOccurrences.length > 0) {
    blocks.push({
      blockId: 'visual-occurrences',
      kind: 'table',
      title: 'Visual Occurrences',
      table: buildVisualOccurrenceReviewTable(input.visualOccurrences),
    });
  }
  if (input.continuitySnapshot) {
    blocks.push({
      blockId: 'continuity-diagnostics',
      kind: 'table',
      title: 'Continuity Diagnostics',
      table: buildContinuityDiagnosticsReviewTable(input.continuitySnapshot),
    });
  }
  if (input.batchPlan) {
    blocks.push({
      blockId: 'batch-execution',
      kind: 'table',
      title: 'Batch Execution',
      table: buildBatchExecutionReviewTable(input.batchPlan),
    });
  }
  if (input.diagnostics && input.diagnostics.length > 0) {
    blocks.push({
      blockId: 'diagnostics',
      kind: 'diagnostic',
      diagnostics: input.diagnostics.map(toArtifactDiagnostic),
    });
  }
  return {
    schemaVersion: 1,
    kind: 'composite-artifact',
    artifactId: input.artifactId,
    profile: 'comic-animation-review',
    title: input.title ?? 'Comic Animation Review',
    blocks,
    diagnostics: input.diagnostics?.map(toArtifactDiagnostic),
  };
}

export function buildVisualOccurrenceReviewTable(
  occurrences: readonly VisualOccurrence[],
  options: { readonly tableId?: string; readonly title?: string } = {},
): GenericTable {
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: options.tableId ?? 'visual-occurrence-review',
    profile: 'comic-visual-occurrence-review',
    title: options.title ?? 'Visual Occurrence Review',
    columns: visualOccurrenceReviewColumns(),
    rows: occurrences.map(projectVisualOccurrenceToRow),
  };
}

export function buildBatchExecutionReviewTable(
  plan: BatchExecutionPlan,
  options: { readonly tableId?: string; readonly title?: string } = {},
): GenericTable {
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: options.tableId ?? `${plan.planId}-review`,
    profile: 'batch-execution-review',
    title: options.title ?? 'Batch Execution Review',
    columns: batchExecutionReviewColumns(),
    rows: plan.items.map(projectBatchItemToRow),
  };
}

export function buildContinuityDiagnosticsReviewTable(
  snapshot: StoryContinuitySnapshot,
  options: { readonly tableId?: string; readonly title?: string } = {},
): GenericTable {
  const rows: GenericTableRow[] = [
    ...snapshot.constraints.map(projectContinuityConstraintToRow),
    ...(snapshot.diagnostics ?? []).map(projectContinuityDiagnosticToRow),
    ...(snapshot.unresolvedQuestions ?? []).map(projectUnresolvedQuestionToRow),
  ];
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: options.tableId ?? `${snapshot.snapshotId}-continuity-review`,
    profile: 'story-continuity-diagnostics-review',
    title: options.title ?? 'Story Continuity Diagnostics',
    columns: continuityDiagnosticsReviewColumns(),
    rows,
  };
}

export function validateIndexedRangeState(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validateIndexedRangeStateValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateVisualOccurrence(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validateVisualOccurrenceValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validatePerceptionCapabilityFacet(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validatePerceptionCapabilityFacetValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validatePlotEvent(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validatePlotEventValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateCharacterStateChange(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validateCharacterStateChangeValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateContinuityConstraint(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validateContinuityConstraintValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateStoryContinuitySnapshot(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validateStoryContinuitySnapshotValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateBatchExecutionPlan(
  value: unknown,
  options: ComicAnimationValidationOptions = {},
): ComicAnimationValidationResult {
  const diagnostics: ComicAnimationDiagnostic[] = [];
  validateBatchExecutionPlanValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function isIndexedRangeState(value: unknown): value is IndexedRangeState {
  return validateIndexedRangeState(value).ok;
}

export function isVisualOccurrence(value: unknown): value is VisualOccurrence {
  return validateVisualOccurrence(value).ok;
}

export function isPerceptionCapabilityFacet(value: unknown): value is PerceptionCapabilityFacet {
  return validatePerceptionCapabilityFacet(value).ok;
}

export function isBatchExecutionPlan(value: unknown): value is BatchExecutionPlan {
  return validateBatchExecutionPlan(value).ok;
}

function validateIndexedRangeStateValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Indexed range state must be an object.'),
    );
    return;
  }
  validateEnvelope(value, path, INDEXED_RANGE_STATE_KIND, diagnostics);
  requireString(value['rangeId'], [...path, 'rangeId'], diagnostics);
  requireString(value['assetId'], [...path, 'assetId'], diagnostics);
  validateIndexedRangeRef(value['rangeRef'], [...path, 'rangeRef'], diagnostics, options);
  validateStatus(value['status'], [...path, 'status'], isIndexedRangeStatus, diagnostics);
  validateRequiredArray(value['tasks'], [...path, 'tasks'], diagnostics, (item, itemPath) =>
    validateIndexTaskState(item, itemPath, diagnostics, options),
  );
  validateDiagnostics(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateIndexedRangeRef(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(missing(path, 'rangeRef'));
    return;
  }
  requireString(value['rangeId'], [...path, 'rangeId'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, options);
  if (!isIndexRangeKind(value['rangeKind'])) {
    diagnostics.push(
      diagnostic('error', 'invalid-range-kind', [...path, 'rangeKind'], 'Unsupported range kind.', {
        expected: INDEX_RANGE_KINDS.join(', '),
        actual: diagnosticValue(value['rangeKind']),
      }),
    );
  }
  validateBoundingBox(value['boundingBox'], [...path, 'boundingBox'], diagnostics);
}

function validateIndexTaskState(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, 'object', value));
    return;
  }
  requireString(value['taskId'], [...path, 'taskId'], diagnostics);
  if (!isComicAnimationIndexTask(value['task'])) {
    diagnostics.push(
      diagnostic('error', 'invalid-task', [...path, 'task'], 'Unsupported index task.', {
        expected: COMIC_ANIMATION_INDEX_TASKS.join(', '),
        actual: diagnosticValue(value['task']),
      }),
    );
  }
  validateStatus(value['status'], [...path, 'status'], isIndexTaskStatus, diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateStringArray(value['evidenceRefs'], [...path, 'evidenceRefs'], diagnostics);
  validateDiagnostics(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateVisualOccurrenceValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Visual occurrence must be an object.'),
    );
    return;
  }
  validateEnvelope(value, path, VISUAL_OCCURRENCE_KIND, diagnostics);
  requireString(value['occurrenceId'], [...path, 'occurrenceId'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, options);
  validateBoundingBox(value['boundingBox'], [...path, 'boundingBox'], diagnostics);
  validateStableStoryboardMediaRef(value['cropRef'], [...path, 'cropRef'], diagnostics);
  validateArray(value['maskRefs'], [...path, 'maskRefs'], diagnostics, (item, itemPath) =>
    validateStableStoryboardMediaRef(item, itemPath, diagnostics),
  );
  validateCreativeEntityRefs(
    value['candidateEntityRefs'],
    [...path, 'candidateEntityRefs'],
    diagnostics,
  );
  validateStringArray(value['candidateIds'], [...path, 'candidateIds'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  if (value['reviewState'] !== undefined && !isComicAnimationReviewState(value['reviewState'])) {
    diagnostics.push(
      invalid(
        [...path, 'reviewState'],
        COMIC_ANIMATION_REVIEW_STATES.join(', '),
        value['reviewState'],
      ),
    );
  }
  validateDiagnostics(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validatePerceptionCapabilityFacetValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Perception capability facet must be an object.'),
    );
    return;
  }
  requireString(value['providerId'], [...path, 'providerId'], diagnostics);
  if (!isPerceptionCapabilitySource(value['source'])) {
    diagnostics.push(
      invalid(
        [...path, 'source'],
        PERCEPTION_CAPABILITY_SOURCES.join(', '),
        value['source'],
        'invalid-provider-facet',
      ),
    );
  }
  validateRequiredArray(value['tasks'], [...path, 'tasks'], diagnostics, (item, itemPath) => {
    if (!isComicAnimationIndexTask(item)) {
      diagnostics.push(
        invalid(itemPath, COMIC_ANIMATION_INDEX_TASKS.join(', '), item, 'invalid-task'),
      );
    }
  });
  validateRequiredArray(
    value['supportedMediaKinds'],
    [...path, 'supportedMediaKinds'],
    diagnostics,
    (item, itemPath) => {
      if (!isPerceptionMediaKind(item)) {
        diagnostics.push(
          invalid(itemPath, PERCEPTION_MEDIA_KINDS.join(', '), item, 'invalid-provider-facet'),
        );
      }
    },
  );
  if (!isPerceptionExecutionMode(value['executionMode'])) {
    diagnostics.push(
      invalid(
        [...path, 'executionMode'],
        PERCEPTION_EXECUTION_MODES.join(', '),
        value['executionMode'],
        'invalid-provider-facet',
      ),
    );
  }
  if (!isPerceptionDeviceTier(value['deviceTier'])) {
    diagnostics.push(
      invalid(
        [...path, 'deviceTier'],
        PERCEPTION_DEVICE_TIERS.join(', '),
        value['deviceTier'],
        'invalid-provider-facet',
      ),
    );
  }
  if (!isPositiveInteger(value['defaultConcurrency'])) {
    diagnostics.push(
      invalid(
        [...path, 'defaultConcurrency'],
        'positive integer',
        value['defaultConcurrency'],
        'invalid-provider-facet',
      ),
    );
  }
  if (!isPerceptionCachePolicy(value['cachePolicy'])) {
    diagnostics.push(
      invalid(
        [...path, 'cachePolicy'],
        PERCEPTION_CACHE_POLICIES.join(', '),
        value['cachePolicy'],
        'invalid-provider-facet',
      ),
    );
  }
  if (!isPerceptionConfidenceKind(value['confidenceKind'])) {
    diagnostics.push(
      invalid(
        [...path, 'confidenceKind'],
        PERCEPTION_CONFIDENCE_KINDS.join(', '),
        value['confidenceKind'],
        'invalid-provider-facet',
      ),
    );
  }
  validateSerializable(value, path, diagnostics, options);
}

function validatePlotEventValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic('error', 'invalid-root', path, 'Plot event must be an object.'));
    return;
  }
  validateEnvelope(value, path, PLOT_EVENT_KIND, diagnostics);
  requireString(value['eventId'], [...path, 'eventId'], diagnostics);
  requireString(value['summary'], [...path, 'summary'], diagnostics);
  validateStoryPosition(value['storyPosition'], [...path, 'storyPosition'], diagnostics);
  if (typeof value['orderIndex'] !== 'number' || !Number.isFinite(value['orderIndex'])) {
    diagnostics.push(invalid([...path, 'orderIndex'], 'finite number', value['orderIndex']));
  }
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, options);
  validateCreativeEntityRefs(value['participantRefs'], [...path, 'participantRefs'], diagnostics);
  validateStringArray(value['evidenceRefs'], [...path, 'evidenceRefs'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateCharacterStateChangeValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Character state change must be an object.'),
    );
    return;
  }
  validateEnvelope(value, path, CHARACTER_STATE_CHANGE_KIND, diagnostics);
  requireString(value['changeId'], [...path, 'changeId'], diagnostics);
  validateCreativeEntityRef(
    value['characterRef'],
    [...path, 'characterRef'],
    diagnostics,
    'character',
  );
  requireString(value['dimension'], [...path, 'dimension'], diagnostics);
  validateStoryPosition(value['storyPosition'], [...path, 'storyPosition'], diagnostics, true);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, options);
  validateStringArray(value['evidenceRefs'], [...path, 'evidenceRefs'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateContinuityConstraintValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Continuity constraint must be an object.'),
    );
    return;
  }
  validateEnvelope(value, path, CONTINUITY_CONSTRAINT_KIND, diagnostics);
  requireString(value['constraintId'], [...path, 'constraintId'], diagnostics);
  if (!isContinuityConstraintType(value['type'])) {
    diagnostics.push(
      invalid([...path, 'type'], CONTINUITY_CONSTRAINT_TYPES.join(', '), value['type']),
    );
  }
  requireString(value['message'], [...path, 'message'], diagnostics);
  validateStoryPosition(value['appliesTo'], [...path, 'appliesTo'], diagnostics, true);
  validateCreativeEntityRefs(value['entityRefs'], [...path, 'entityRefs'], diagnostics);
  if (value['sourceRef'] !== undefined) {
    validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, options);
  }
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateStoryContinuitySnapshotValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Story continuity snapshot must be an object.'),
    );
    return;
  }
  validateEnvelope(value, path, STORY_CONTINUITY_SNAPSHOT_KIND, diagnostics);
  requireString(value['snapshotId'], [...path, 'snapshotId'], diagnostics);
  validateStoryContinuityQuery(value['query'], [...path, 'query'], diagnostics);
  validateRequiredArray(value['events'], [...path, 'events'], diagnostics, (item, itemPath) =>
    validatePlotEventValue(item, itemPath, diagnostics, options),
  );
  validateRequiredArray(
    value['characterStates'],
    [...path, 'characterStates'],
    diagnostics,
    (item, itemPath) => validateCharacterStateChangeValue(item, itemPath, diagnostics, options),
  );
  validateRequiredArray(
    value['constraints'],
    [...path, 'constraints'],
    diagnostics,
    (item, itemPath) => validateContinuityConstraintValue(item, itemPath, diagnostics, options),
  );
  validateStringArray(value['unresolvedQuestions'], [...path, 'unresolvedQuestions'], diagnostics);
  validateDiagnostics(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateBatchExecutionPlanValue(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Batch execution plan must be an object.'),
    );
    return;
  }
  validateEnvelope(value, path, BATCH_EXECUTION_PLAN_KIND, diagnostics);
  requireString(value['planId'], [...path, 'planId'], diagnostics);
  if (!isBatchExecutionTargetDomain(value['targetDomain'])) {
    diagnostics.push(
      invalid(
        [...path, 'targetDomain'],
        'built-in or namespaced domain',
        value['targetDomain'],
        'invalid-domain',
      ),
    );
  }
  validateRequiredArray(value['items'], [...path, 'items'], diagnostics, (item, itemPath) =>
    validateBatchExecutionItem(item, itemPath, diagnostics, options),
  );
  validateApprovalPolicy(value['approvalPolicy'], [...path, 'approvalPolicy'], diagnostics);
  validateExecutionPolicy(value['executionPolicy'], [...path, 'executionPolicy'], diagnostics);
  validateCostEstimate(value['costEstimate'], [...path, 'costEstimate'], diagnostics);
  validateStatus(value['status'], [...path, 'status'], isBatchExecutionPlanStatus, diagnostics);
  validateStringArray(value['sourceArtifactRefs'], [...path, 'sourceArtifactRefs'], diagnostics);
  validateDiagnostics(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateBatchPolicyDiagnostics(value, path, diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateBatchExecutionItem(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, 'object', value));
    return;
  }
  requireString(value['itemId'], [...path, 'itemId'], diagnostics);
  requireString(value['targetRef'], [...path, 'targetRef'], diagnostics);
  requireString(value['capabilityId'], [...path, 'capabilityId'], diagnostics);
  validateStatus(value['status'], [...path, 'status'], isBatchExecutionItemStatus, diagnostics);
  if (
    value['requiredDeviceTier'] !== undefined &&
    !isPerceptionDeviceTier(value['requiredDeviceTier'])
  ) {
    diagnostics.push(
      invalid(
        [...path, 'requiredDeviceTier'],
        PERCEPTION_DEVICE_TIERS.join(', '),
        value['requiredDeviceTier'],
      ),
    );
  }
  validateCostEstimate(value['costEstimate'], [...path, 'costEstimate'], diagnostics);
  validateStringArray(value['inputRefs'], [...path, 'inputRefs'], diagnostics);
  validateStringArray(value['outputRefs'], [...path, 'outputRefs'], diagnostics);
  validateDiagnostics(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateEnvelope(
  value: Readonly<Record<string, unknown>>,
  path: readonly ComicAnimationPathSegment[],
  kind: string,
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (value['schemaVersion'] !== COMIC_ANIMATION_INDEXING_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-schema-version',
        [...path, 'schemaVersion'],
        'Invalid schema version.',
        {
          expected: String(COMIC_ANIMATION_INDEXING_SCHEMA_VERSION),
          actual: diagnosticValue(value['schemaVersion']),
        },
      ),
    );
  }
  if (value['kind'] !== kind) {
    diagnostics.push(
      diagnostic('error', 'invalid-kind', [...path, 'kind'], 'Invalid record kind.', {
        expected: kind,
        actual: diagnosticValue(value['kind']),
      }),
    );
  }
}

function validateSourceRef(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(missing(path, 'sourceRef'));
    return;
  }
  requireString(value['kind'], [...path, 'kind'], diagnostics);
  validateSerializable(value, path, diagnostics, options);
}

function validateStableStoryboardMediaRef(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, 'object', value));
    return;
  }
  requireString(value['refId'], [...path, 'refId'], diagnostics);
  validateSerializable(value, path, diagnostics, {});
}

function validateBoundingBox(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, 'object', value, 'invalid-bounding-box'));
    return;
  }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const item = value[key];
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      diagnostics.push(invalid([...path, key], 'finite number', item, 'invalid-bounding-box'));
    }
  }
  const width = value['width'];
  const height = value['height'];
  if (typeof width === 'number' && width <= 0) {
    diagnostics.push(invalid([...path, 'width'], 'positive number', width, 'invalid-bounding-box'));
  }
  if (typeof height === 'number' && height <= 0) {
    diagnostics.push(
      invalid([...path, 'height'], 'positive number', height, 'invalid-bounding-box'),
    );
  }
}

function validateCreativeEntityRefs(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  validateArray(value, path, diagnostics, (item, itemPath) =>
    validateCreativeEntityRef(item, itemPath, diagnostics),
  );
}

function validateCreativeEntityRef(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  expectedKind?: string,
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, 'CreativeEntityRef', value));
    return;
  }
  requireString(value['entityId'], [...path, 'entityId'], diagnostics);
  requireString(value['entityKind'], [...path, 'entityKind'], diagnostics);
  if (expectedKind && value['entityKind'] !== expectedKind) {
    diagnostics.push(invalid([...path, 'entityKind'], expectedKind, value['entityKind']));
  }
}

function validateStoryPosition(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  optional = false,
): void {
  if (value === undefined && optional) return;
  if (!isRecord(value)) {
    diagnostics.push(optional ? invalid(path, 'object', value) : missing(path, 'storyPosition'));
    return;
  }
  if (
    value['orderIndex'] !== undefined &&
    (typeof value['orderIndex'] !== 'number' || !Number.isFinite(value['orderIndex']))
  ) {
    diagnostics.push(invalid([...path, 'orderIndex'], 'finite number', value['orderIndex']));
  }
}

function validateStoryContinuityQuery(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missing(path, 'query'));
    return;
  }
  validateStoryPosition(value['storyPosition'], [...path, 'storyPosition'], diagnostics, true);
  validateCreativeEntityRefs(value['characterRefs'], [...path, 'characterRefs'], diagnostics);
  validateCreativeEntityRefs(value['locationRefs'], [...path, 'locationRefs'], diagnostics);
  validateArray(value['include'], [...path, 'include'], diagnostics, (item, itemPath) => {
    if (!isStoryContinuityIncludeFlag(item)) {
      diagnostics.push(invalid(itemPath, STORY_CONTINUITY_INCLUDE_FLAGS.join(', '), item));
    }
  });
}

function validateApprovalPolicy(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missing(path, 'approvalPolicy'));
    return;
  }
  if (typeof value['requiresApproval'] !== 'boolean') {
    diagnostics.push(
      invalid(
        [...path, 'requiresApproval'],
        'boolean',
        value['requiresApproval'],
        'invalid-policy',
      ),
    );
  }
}

function validateExecutionPolicy(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missing(path, 'executionPolicy'));
    return;
  }
  if (!isPositiveInteger(value['maxConcurrency'])) {
    diagnostics.push(
      invalid(
        [...path, 'maxConcurrency'],
        'positive integer',
        value['maxConcurrency'],
        'invalid-policy',
      ),
    );
  }
  if (!isBatchExecutionFailurePolicy(value['failurePolicy'])) {
    diagnostics.push(
      invalid(
        [...path, 'failurePolicy'],
        BATCH_EXECUTION_FAILURE_POLICIES.join(', '),
        value['failurePolicy'],
        'invalid-policy',
      ),
    );
  }
  const retryPolicy = value['retryPolicy'];
  if (retryPolicy !== undefined) {
    if (!isRecord(retryPolicy)) {
      diagnostics.push(invalid([...path, 'retryPolicy'], 'object', retryPolicy, 'invalid-policy'));
    } else {
      if (!Number.isInteger(retryPolicy['maxAttempts']) || Number(retryPolicy['maxAttempts']) < 0) {
        diagnostics.push(
          invalid(
            [...path, 'retryPolicy', 'maxAttempts'],
            'non-negative integer',
            retryPolicy['maxAttempts'],
            'invalid-policy',
          ),
        );
      }
      validateArray(
        retryPolicy['retryOn'],
        [...path, 'retryPolicy', 'retryOn'],
        diagnostics,
        (item, itemPath) => {
          if (!includesString(BATCH_EXECUTION_RETRY_REASONS, item)) {
            diagnostics.push(
              invalid(itemPath, BATCH_EXECUTION_RETRY_REASONS.join(', '), item, 'invalid-policy'),
            );
          }
        },
      );
    }
  }
}

function validateCostEstimate(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, 'object', value));
    return;
  }
  if (!isBatchExecutionCostState(value['estimateState'])) {
    diagnostics.push(
      invalid(
        [...path, 'estimateState'],
        BATCH_EXECUTION_COST_STATES.join(', '),
        value['estimateState'],
      ),
    );
  }
  for (const key of ['estimatedCost', 'estimatedTokens', 'estimatedDurationMs'] as const) {
    const item = value[key];
    if (item !== undefined && (typeof item !== 'number' || !Number.isFinite(item) || item < 0)) {
      diagnostics.push(invalid([...path, key], 'non-negative finite number', item));
    }
  }
}

function validateBatchPolicyDiagnostics(
  value: Readonly<Record<string, unknown>>,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  const approvalPolicy = isRecord(value['approvalPolicy']) ? value['approvalPolicy'] : undefined;
  const costEstimate = isRecord(value['costEstimate']) ? value['costEstimate'] : undefined;
  if (
    costEstimate?.['estimateState'] === 'unknown' &&
    approvalPolicy?.['requiresApproval'] !== true
  ) {
    diagnostics.push(
      diagnostic(
        'warning',
        'cost-unknown',
        [...path, 'costEstimate'],
        'Unknown batch cost should require explicit approval.',
      ),
    );
  }
}

function validateStatus<T extends string>(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  guard: (input: unknown) => input is T,
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (!guard(value)) {
    diagnostics.push(invalid(path, 'supported status', value, 'invalid-status'));
  }
}

function validateOptionalConfidence(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    diagnostics.push(invalid(path, 'number between 0 and 1', value, 'invalid-confidence'));
  }
}

function validateDiagnostics(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  validateArray(value, path, diagnostics, (item, itemPath) => {
    if (!isRecord(item)) {
      diagnostics.push(invalid(itemPath, 'diagnostic object', item));
      return;
    }
    requireString(item['code'], [...itemPath, 'code'], diagnostics);
    requireString(item['message'], [...itemPath, 'message'], diagnostics);
  });
}

function validateStringArray(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  validateArray(value, path, diagnostics, (item, itemPath) => {
    if (typeof item !== 'string') diagnostics.push(invalid(itemPath, 'string', item));
  });
}

function validateArray(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  validateItem: (item: unknown, path: readonly ComicAnimationPathSegment[]) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, 'array', value));
    return;
  }
  value.forEach((item, index) => validateItem(item, [...path, index]));
}

function validateRequiredArray(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  validateItem: (item: unknown, path: readonly ComicAnimationPathSegment[]) => void,
): void {
  if (value === undefined) {
    diagnostics.push(missing(path, String(path[path.length - 1] ?? 'array')));
    return;
  }
  validateArray(value, path, diagnostics, validateItem);
}

function validateSerializable(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): void {
  if (!isJsonValue(value)) {
    diagnostics.push(
      diagnostic('error', 'non-serializable-value', path, 'Value must be JSON serializable.'),
    );
    return;
  }
  const unsafe = findUnsafeRuntimeHandle(value);
  if (unsafe) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsafe-runtime-handle',
        [...path, ...unsafe.path],
        'Runtime-only handles are not durable refs.',
        {
          actual: unsafe.value,
        },
      ),
    );
  }
  const maxBytes = options.maxSerializedBytes;
  if (maxBytes !== undefined && jsonByteLength(value) > maxBytes) {
    diagnostics.push(
      diagnostic(
        'error',
        'oversized-payload',
        path,
        'Serialized payload exceeds the configured size limit.',
        {
          expected: `<= ${maxBytes} bytes`,
        },
      ),
    );
  }
}

function visualOccurrenceReviewColumns(): readonly GenericTableColumn[] {
  return [
    { columnId: 'occurrenceId', label: 'Occurrence', cellType: 'string', required: true },
    { columnId: 'candidate', label: 'Candidate', cellType: 'string' },
    { columnId: 'appearance', label: 'Appearance', cellType: 'string' },
    { columnId: 'confidence', label: 'Confidence', cellType: 'number' },
    { columnId: 'status', label: 'Status', cellType: 'status' },
    { columnId: 'diagnostics', label: 'Diagnostics', cellType: 'diagnostic' },
  ];
}

function batchExecutionReviewColumns(): readonly GenericTableColumn[] {
  return [
    { columnId: 'itemId', label: 'Item', cellType: 'string', required: true },
    { columnId: 'capabilityId', label: 'Capability', cellType: 'string', required: true },
    { columnId: 'providerId', label: 'Provider', cellType: 'string' },
    { columnId: 'status', label: 'Status', cellType: 'status', required: true },
    { columnId: 'cost', label: 'Cost', cellType: 'number' },
    { columnId: 'diagnostics', label: 'Diagnostics', cellType: 'diagnostic' },
  ];
}

function continuityDiagnosticsReviewColumns(): readonly GenericTableColumn[] {
  return [
    { columnId: 'refId', label: 'Ref', cellType: 'string', required: true },
    { columnId: 'kind', label: 'Kind', cellType: 'enum', required: true },
    {
      columnId: 'severity',
      label: 'Severity',
      cellType: 'enum',
      enumValues: ['blocking', 'warning', 'preference', 'open-question', 'diagnostic'],
    },
    { columnId: 'message', label: 'Message', cellType: 'string', required: true },
    { columnId: 'confidence', label: 'Confidence', cellType: 'number' },
    { columnId: 'diagnostics', label: 'Diagnostics', cellType: 'diagnostic' },
  ];
}

function projectVisualOccurrenceToRow(occurrence: VisualOccurrence): GenericTableRow {
  const cells: Record<string, GenericTableCell> = {
    occurrenceId: { type: 'string', value: occurrence.occurrenceId },
    status: { type: 'status', value: occurrence.reviewState ?? 'candidate' },
  };
  const candidate = occurrence.candidateEntityRefs?.[0];
  if (candidate) cells['candidate'] = { type: 'string', value: candidate.entityId };
  if (occurrence.appearanceText)
    cells['appearance'] = { type: 'string', value: occurrence.appearanceText };
  if (occurrence.confidence !== undefined)
    cells['confidence'] = { type: 'number', value: occurrence.confidence };
  if (occurrence.diagnostics?.[0]) {
    cells['diagnostics'] = {
      type: 'diagnostic',
      value: toArtifactDiagnostic(occurrence.diagnostics[0]),
    };
  }
  return {
    rowId: occurrence.occurrenceId,
    cells,
    diagnostics: occurrence.diagnostics?.map(toArtifactDiagnostic),
  };
}

function projectBatchItemToRow(item: BatchExecutionItem): GenericTableRow {
  const cells: Record<string, GenericTableCell> = {
    itemId: { type: 'string', value: item.itemId },
    capabilityId: { type: 'string', value: item.capabilityId },
    status: { type: 'status', value: item.status },
  };
  if (item.providerId) cells['providerId'] = { type: 'string', value: item.providerId };
  if (item.costEstimate?.estimatedCost !== undefined) {
    cells['cost'] = { type: 'number', value: item.costEstimate.estimatedCost };
  }
  if (item.diagnostics?.[0]) {
    cells['diagnostics'] = { type: 'diagnostic', value: toArtifactDiagnostic(item.diagnostics[0]) };
  }
  return {
    rowId: item.itemId,
    cells,
    diagnostics: item.diagnostics?.map(toArtifactDiagnostic),
  };
}

function projectContinuityConstraintToRow(constraint: ContinuityConstraint): GenericTableRow {
  const cells: Record<string, GenericTableCell> = {
    refId: { type: 'string', value: constraint.constraintId },
    kind: { type: 'enum', value: 'constraint' },
    severity: { type: 'enum', value: constraint.type },
    message: { type: 'string', value: constraint.message },
  };
  if (constraint.confidence !== undefined) {
    cells['confidence'] = { type: 'number', value: constraint.confidence };
  }
  if (constraint.diagnostics?.[0]) {
    cells['diagnostics'] = {
      type: 'diagnostic',
      value: toArtifactDiagnostic(constraint.diagnostics[0]),
    };
  }
  return {
    rowId: constraint.constraintId,
    cells,
    status: constraint.type === 'blocking' ? 'blocked' : 'needs-review',
    diagnostics: constraint.diagnostics?.map(toArtifactDiagnostic),
  };
}

function projectContinuityDiagnosticToRow(
  diagnosticValue: ComicAnimationDiagnostic,
  index: number,
): GenericTableRow {
  return {
    rowId: `diagnostic-${index}`,
    cells: {
      refId: { type: 'string', value: `diagnostic-${index}` },
      kind: { type: 'enum', value: 'diagnostic' },
      severity: { type: 'enum', value: 'diagnostic' },
      message: { type: 'string', value: diagnosticValue.message },
      diagnostics: { type: 'diagnostic', value: toArtifactDiagnostic(diagnosticValue) },
    },
    diagnostics: [toArtifactDiagnostic(diagnosticValue)],
  };
}

function projectUnresolvedQuestionToRow(question: string, index: number): GenericTableRow {
  return {
    rowId: `question-${index}`,
    cells: {
      refId: { type: 'string', value: `question-${index}` },
      kind: { type: 'enum', value: 'unresolved-question' },
      severity: { type: 'enum', value: 'open-question' },
      message: { type: 'string', value: question },
    },
    status: 'needs-review',
  };
}

function toArtifactDiagnostic(diagnosticValue: ComicAnimationDiagnostic): ArtifactDiagnostic {
  return {
    severity: diagnosticValue.severity,
    code: mapDiagnosticCodeToArtifactCode(diagnosticValue.code),
    path: diagnosticValue.path,
    message: diagnosticValue.message,
    ...(diagnosticValue.expected ? { expected: diagnosticValue.expected } : {}),
    ...(diagnosticValue.actual !== undefined
      ? { actual: diagnosticValue.actual as ArtifactJsonValue }
      : {}),
    ...(diagnosticValue.details ? { details: diagnosticValue.details as ArtifactJsonRecord } : {}),
  };
}

function mapDiagnosticCodeToArtifactCode(
  code: ComicAnimationDiagnosticCode,
): ArtifactDiagnostic['code'] {
  switch (code) {
    case 'invalid-root':
    case 'invalid-kind':
    case 'missing-required-field':
    case 'non-serializable-value':
    case 'unsafe-runtime-handle':
      return code;
    case 'invalid-status':
    case 'oversized-payload':
      return 'invalid-required-field';
    default:
      return 'invalid-required-field';
  }
}

function perceptionCardTasks(card: PerceptionCard): readonly ComicAnimationIndexTask[] {
  const tasks: ComicAnimationIndexTask[] = [];
  if (card.semantic?.evidences.some((evidence) => evidence.kind === 'transcript'))
    tasks.push('asr');
  if (
    card.semantic?.evidences.some(
      (evidence) => evidence.kind === 'description' || evidence.kind === 'tags',
    )
  ) {
    tasks.push('vlm-review');
  }
  return tasks;
}

function taskStatusFromPerceptionCard(
  card: PerceptionCard,
  task: ComicAnimationIndexTask,
): IndexTaskStatus {
  if (
    task === 'asr' &&
    card.semantic?.evidences.some((evidence) => evidence.kind === 'transcript')
  ) {
    return 'complete';
  }
  if (task === 'vlm-review' && card.semantic?.evidences.length) return 'complete';
  return 'pending';
}

function confidenceForTask(
  evidences: readonly PerceptionEvidenceEntry[] | undefined,
  task: ComicAnimationIndexTask,
): number | undefined {
  const matched = evidences?.filter((evidence) => {
    if (task === 'asr') return evidence.kind === 'transcript';
    if (task === 'vlm-review') return evidence.kind === 'description' || evidence.kind === 'tags';
    return false;
  });
  if (!matched || matched.length === 0) return undefined;
  return Math.max(...matched.map((evidence) => evidence.confidence));
}

function compareDeviceTier(required: PerceptionDeviceTier, current: PerceptionDeviceTier): number {
  return deviceTierRank(required) - deviceTierRank(current);
}

function deviceTierRank(tier: PerceptionDeviceTier): number {
  switch (tier) {
    case 'light':
      return 0;
    case 'medium':
      return 1;
    case 'high':
      return 2;
  }
}

function diagnostic(
  severity: ComicAnimationDiagnostic['severity'],
  code: ComicAnimationDiagnosticCode,
  path: readonly ComicAnimationPathSegment[],
  message: string,
  extra: Omit<ComicAnimationDiagnostic, 'severity' | 'code' | 'path' | 'message'> = {},
): ComicAnimationDiagnostic {
  return { severity, code, path, message, ...extra };
}

function missing(
  path: readonly ComicAnimationPathSegment[],
  field: string,
): ComicAnimationDiagnostic {
  return diagnostic('error', 'missing-required-field', path, `Missing required field ${field}.`);
}

function invalid(
  path: readonly ComicAnimationPathSegment[],
  expected: string,
  actual: unknown,
  code: ComicAnimationDiagnosticCode = 'invalid-required-field',
): ComicAnimationDiagnostic {
  return diagnostic('error', code, path, `Invalid field at ${formatPath(path)}.`, {
    expected,
    actual: diagnosticValue(actual),
  });
}

function requireString(
  value: unknown,
  path: readonly ComicAnimationPathSegment[],
  diagnostics: ComicAnimationDiagnostic[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    diagnostics.push(invalid(path, 'non-empty string', value));
  }
}

function validationResult(
  diagnostics: readonly ComicAnimationDiagnostic[],
  options: ComicAnimationValidationOptions,
): ComicAnimationValidationResult {
  const limited = diagnostics.slice(0, options.maxDiagnostics ?? 128);
  return {
    ok: !limited.some((item) => item.severity === 'error'),
    diagnostics: limited,
  };
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}

function isJsonValue(
  value: unknown,
  seen: ReadonlySet<object> = new Set(),
): value is ComicAnimationJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen));
  if (!isRecord(value)) return false;
  if (seen.has(value)) return false;
  const nextSeen = new Set(seen);
  nextSeen.add(value);
  return Object.values(value).every((item) => isJsonValue(item, nextSeen));
}

function diagnosticValue(value: unknown): ComicAnimationJsonValue | undefined {
  if (isJsonValue(value)) return value;
  if (value === undefined) return undefined;
  return String(value);
}

function findUnsafeRuntimeHandle(
  value: ComicAnimationJsonValue,
  path: readonly ComicAnimationPathSegment[] = [],
): { readonly path: readonly ComicAnimationPathSegment[]; readonly value: string } | undefined {
  if (typeof value === 'string') {
    return isUnsafeRuntimeHandle(value) ? { path, value } : undefined;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findUnsafeRuntimeHandle(item, [...path, index]);
      if (found) return found;
    }
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const found = findUnsafeRuntimeHandle(item, [...path, key]);
      if (found) return found;
    }
  }
  return undefined;
}

function isUnsafeRuntimeHandle(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('object:') ||
    normalized.startsWith('vscode-resource:') ||
    normalized.startsWith('vscode-webview-resource:') ||
    normalized.startsWith('vscode-webview://') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('https://localhost') ||
    normalized.startsWith('http://127.0.0.1') ||
    normalized.startsWith('https://127.0.0.1')
  ) {
    return true;
  }
  if (/^[a-z]:\\/i.test(value)) return true;
  if (value.startsWith('/') && !value.startsWith('${')) return true;
  if (normalized.includes('/.neko/.cache/')) return true;
  return false;
}

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function formatPath(path: readonly ComicAnimationPathSegment[]): string {
  return path.length === 0 ? '<root>' : path.join('.');
}
