import type {
  CreativeEntityChangedRef,
  CreativeEntityKind,
  CreativeEntityStatus,
  EntityAssetBindingRole,
  EntityAssetBindingAvailability,
  EntityAssetBindingSource,
  EntityAssetBindingStatus,
  EntityAssetRequirementSource,
  EntityAssetRequirementStatus,
  MissingRepresentationAction,
  RepresentationKind,
  VisualIdentityDraftSource,
  VisualIdentityDraftStatus,
} from './creative-entity-asset-composition';
import {
  ENTITY_ASSET_BINDING_ROLES,
  isCreativeEntityChangedRef,
  isRepresentationKind,
} from './creative-entity-asset-composition';
import {
  isAbsoluteLocalRef,
  normalizeDashboardLocalRef,
  type DashboardDisposableLike,
} from './dashboard-task';
import type { ProjectIndexFreshness } from './project-cache-search';
import { isProjectIndexFreshness } from './project-cache-search';
import type {
  CharacterMemoryDimension,
  CharacterMemoryReviewStatus,
  CharacterObservationSource,
} from './character-memory';
import {
  CHARACTER_MEMORY_OBSERVATION_SOURCES,
  CHARACTER_MEMORY_REVIEW_STATUSES,
} from './character-memory';
import type { EntityMemoryContributionReviewPolicy } from './media-semantic-index';
import { ENTITY_MEMORY_CONTRIBUTION_REVIEW_POLICIES } from './media-semantic-index';

export const DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION = 1;

export const DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND =
  'neko.story.getDashboardCreativeEntitySource';

export const DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND =
  'neko.entity.getDashboardCreativeEntitySource';

export const DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND = 'neko.dashboard.getCreativeEntityState';

export type DashboardCreativeEntityKind = CreativeEntityKind | 'action';

export type DashboardCreativeEntityLifecycleStatus = CreativeEntityStatus | 'merged' | 'unknown';

export type DashboardCreativeEntitySourceKind =
  'registry' | 'script' | 'asset' | 'generated' | 'requirement' | 'mixed';

export type DashboardCreativeEntityAction =
  | 'open-source'
  | 'show-detail'
  | 'confirm-candidate'
  | 'edit-aliases'
  | 'bind-existing'
  | 'review-drafts'
  | 'handle-requirement'
  | 'generate-material'
  | 'import-material'
  | 'dismiss-requirement'
  | 'show-representation-package'
  | 'apply-sync-suggestion'
  | 'ignore-sync-suggestion'
  | 'rebind-orphaned-binding'
  | 'locate-binding-source'
  | 'archive-binding'
  | 'cleanup-suggested-orphan'
  | 'character-dialogue'
  | 'embody-character'
  | 'accept-memory-review'
  | 'reject-memory-review'
  | 'mark-memory-conflict'
  | 'supersede-memory-review'
  | 'refresh';

export type DashboardEntityMemoryReviewAction =
  | 'accept-memory-review'
  | 'reject-memory-review'
  | 'mark-memory-conflict'
  | 'supersede-memory-review';

export type DashboardCharacterRoleWorkflowAction = 'embody-character';

export type DashboardCharacterRoleWorkflowScopeKind =
  | 'project'
  | 'story-scene'
  | 'story-document'
  | 'occurrence'
  | 'interaction-path'
  | 'validation-artifact';

export type DashboardCharacterRoleWorkflowResultKind =
  'agent-conversation' | 'structured-report' | 'suggestions' | 'delegated-command';

export type DashboardCreativeEntityEventType = 'added' | 'updated' | 'removed' | 'refreshed';

export type DashboardCreativeEntityOccurrenceSource =
  | 'registry'
  | 'script'
  | 'canvas'
  | 'canvas-comment'
  | 'canvas-container'
  | 'canvas-text'
  | 'asset'
  | 'generated-asset';

export type DashboardCreativeEntityOccurrenceRole = 'definition' | 'reference';

export type DashboardCreativeEntitySyncSuggestionKind =
  'asset-metadata' | 'generated-asset-registration' | 'binding-mismatch';

export type DashboardCreativeEntitySyncSuggestionStatus =
  'suggested' | 'applied' | 'ignored' | 'unavailable';

export interface DashboardCreativeEntityRef {
  readonly source: string;
  readonly sourceEntityId: string;
  readonly entityId?: string;
  readonly entityKind: DashboardCreativeEntityKind;
  readonly projectRoot?: string;
  readonly workspaceFolder?: string;
}

export interface DashboardCreativeEntitySourceStatus {
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly available: boolean;
  readonly freshness: ProjectIndexFreshness;
  readonly entityCount?: number;
  readonly updatedAt?: string;
  readonly error?: string;
}

export interface DashboardCreativeEntitySourceRequest {
  readonly projectRoot?: string;
  readonly contextFilePath?: string;
  readonly contextUri?: string;
}

export interface DashboardCreativeEntityActionDescriptor {
  readonly id: DashboardCreativeEntityAction;
  readonly label: string;
  readonly disabled?: boolean;
  readonly reason?: string;
}

export interface DashboardCharacterRoleWorkflowScopeRef {
  readonly kind: DashboardCharacterRoleWorkflowScopeKind;
  readonly source: string;
  readonly ref: string;
  readonly label?: string;
}

export interface DashboardCharacterRoleWorkflowActionPayload {
  readonly entityRef?: DashboardCreativeEntityRef;
  readonly scopes?: readonly DashboardCharacterRoleWorkflowScopeRef[];
  readonly prompt?: string;
}

export interface DashboardCharacterRoleWorkflowActionResult {
  readonly kind: DashboardCharacterRoleWorkflowResultKind;
  readonly command?: string;
  readonly conversationId?: string;
  readonly reportId?: string;
  readonly artifactRef?: string;
}

export interface DashboardCreativeEntityRow {
  readonly ref: DashboardCreativeEntityRef;
  readonly label: string;
  readonly kind: DashboardCreativeEntityKind;
  readonly status: DashboardCreativeEntityLifecycleStatus;
  readonly sourceKind: DashboardCreativeEntitySourceKind;
  readonly aliases?: readonly string[];
  readonly summary?: string;
  readonly occurrenceCount?: number;
  readonly defaultBindingRoles?: readonly EntityAssetBindingRole[];
  readonly missingRepresentationKinds?: readonly RepresentationKind[];
  readonly visualDraftCount?: number;
  readonly syncSuggestionCount?: number;
  readonly orphanedBindingCount?: number;
  readonly freshness: ProjectIndexFreshness;
  readonly actions: readonly DashboardCreativeEntityActionDescriptor[];
  readonly searchText: string;
  readonly updatedAt?: string;
}

export interface DashboardCreativeEntityOccurrenceRef {
  readonly source: DashboardCreativeEntityOccurrenceSource;
  readonly role: DashboardCreativeEntityOccurrenceRole;
  readonly label: string;
  readonly location: string;
  readonly detail?: string;
}

export interface DashboardCreativeEntityRelationshipSummary {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly strength: string;
  readonly provenance: string;
  readonly confidence?: number;
}

export interface DashboardCreativeEntityBindingSummary {
  readonly id: string;
  readonly role: EntityAssetBindingRole;
  readonly assetRef: string;
  readonly preview?: DashboardCreativeEntityBindingPreview;
  readonly status: EntityAssetBindingStatus;
  readonly availability: EntityAssetBindingAvailability;
  readonly orphanedAt?: string;
  readonly source: EntityAssetBindingSource;
  readonly isDefault: boolean;
  readonly confidence?: number;
  readonly updatedAt: string;
}

export type DashboardCreativeEntityBindingPreviewKind = 'image' | 'model';

export interface DashboardCreativeEntityBindingPreview {
  readonly kind: DashboardCreativeEntityBindingPreviewKind;
  readonly uri: string;
  readonly label?: string;
  readonly thumbnailUri?: string;
  readonly mimeType?: string;
}

export interface DashboardCreativeEntityRequirementSummary {
  readonly id: string;
  readonly entityId: string;
  readonly entityKind: DashboardCreativeEntityKind;
  readonly source: EntityAssetRequirementSource;
  readonly sourceRef: string;
  readonly requiredKinds: readonly RepresentationKind[];
  readonly status: EntityAssetRequirementStatus;
  readonly actions: readonly MissingRepresentationAction[];
}

export interface DashboardCreativeEntityVisualDraftSummary {
  readonly id: string;
  readonly characterId: string;
  readonly source: VisualIdentityDraftSource;
  readonly prompt: string;
  readonly generatedAssetIds: readonly string[];
  readonly selectedAssetId?: string;
  readonly status: VisualIdentityDraftStatus;
  readonly factCount: number;
}

export interface DashboardCreativeEntitySyncSuggestion {
  readonly id: string;
  readonly kind: DashboardCreativeEntitySyncSuggestionKind;
  readonly status: DashboardCreativeEntitySyncSuggestionStatus;
  readonly entityRef: DashboardCreativeEntityRef;
  readonly targetRef: string;
  readonly fields: readonly string[];
  readonly reason: string;
  readonly ownerSource: string;
  readonly readonlyTarget?: boolean;
}

export interface DashboardEntityMemoryReviewItem {
  readonly reviewId: string;
  readonly contributionId?: string;
  readonly observationId?: string;
  readonly entityRef: DashboardCreativeEntityRef;
  readonly sourcePackage: string;
  readonly sourceLabel?: string;
  readonly sourceKind: CharacterObservationSource;
  readonly reviewPolicy: EntityMemoryContributionReviewPolicy;
  readonly reviewStatus: Exclude<CharacterMemoryReviewStatus, 'accepted'>;
  readonly dimensions: readonly (CharacterMemoryDimension | (string & {}))[];
  readonly summary: string;
  readonly evidenceText?: string;
  readonly confidence?: number;
  readonly createdAt?: string;
  readonly actions: readonly DashboardEntityMemoryReviewAction[];
}

export interface DashboardCreativeEntityDetail {
  readonly ref: DashboardCreativeEntityRef;
  readonly label: string;
  readonly kind: DashboardCreativeEntityKind;
  readonly status: DashboardCreativeEntityLifecycleStatus;
  readonly sourceKind: DashboardCreativeEntitySourceKind;
  readonly aliases: readonly string[];
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
  readonly relationships: readonly DashboardCreativeEntityRelationshipSummary[];
  readonly occurrences: readonly DashboardCreativeEntityOccurrenceRef[];
  readonly bindings: readonly DashboardCreativeEntityBindingSummary[];
  readonly defaults: readonly DashboardCreativeEntityBindingSummary[];
  readonly requirements: readonly DashboardCreativeEntityRequirementSummary[];
  readonly visualDrafts: readonly DashboardCreativeEntityVisualDraftSummary[];
  readonly syncSuggestions: readonly DashboardCreativeEntitySyncSuggestion[];
  readonly memoryReviews?: readonly DashboardEntityMemoryReviewItem[];
  readonly freshness: ProjectIndexFreshness;
  readonly actions: readonly DashboardCreativeEntityActionDescriptor[];
}

export interface DashboardCreativeEntitySnapshot {
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly status: DashboardCreativeEntitySourceStatus;
  readonly rows: readonly DashboardCreativeEntityRow[];
  readonly freshness: ProjectIndexFreshness;
  readonly updatedAt: string;
}

export interface DashboardCreativeEntityEvent {
  readonly type: DashboardCreativeEntityEventType;
  readonly source: string;
  readonly ref?: DashboardCreativeEntityRef;
  readonly row?: DashboardCreativeEntityRow;
  readonly changedRefs?: readonly CreativeEntityChangedRef[];
  readonly freshness: ProjectIndexFreshness;
}

export interface DashboardCreativeEntityActionRequest {
  readonly source: string;
  readonly ref?: DashboardCreativeEntityRef;
  readonly action: DashboardCreativeEntityAction;
  readonly suggestionId?: string;
  readonly requirementId?: string;
  readonly memoryReviewId?: string;
  readonly role?: EntityAssetBindingRole;
  readonly payload?: Record<string, unknown>;
}

export interface DashboardCreativeEntityActionResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly refresh?: boolean;
  readonly ref?: DashboardCreativeEntityRef;
  readonly characterRoleWorkflow?: DashboardCharacterRoleWorkflowActionResult;
}

export interface DashboardCreativeEntitySourceCapabilities {
  readonly detail?: boolean;
  readonly actions?: readonly DashboardCreativeEntityAction[];
  readonly syncSuggestions?: boolean;
  readonly memoryReviews?: boolean;
}

export interface DashboardCreativeEntitySource {
  readonly contractVersion: typeof DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION;
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly capabilities?: DashboardCreativeEntitySourceCapabilities;
  getSnapshot(): Promise<DashboardCreativeEntitySnapshot>;
  getDetail(ref: DashboardCreativeEntityRef): Promise<DashboardCreativeEntityDetail | undefined>;
  executeAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult>;
  onDidChangeEntity(
    listener: (event: DashboardCreativeEntityEvent) => void,
  ): DashboardDisposableLike;
}

export interface DashboardCreativeEntityState {
  readonly statuses: readonly DashboardCreativeEntitySourceStatus[];
  readonly rows: readonly DashboardCreativeEntityRow[];
  readonly selectedRef?: DashboardCreativeEntityRef;
  readonly detail?: DashboardCreativeEntityDetail;
}

export const DASHBOARD_CREATIVE_ENTITY_KINDS: readonly DashboardCreativeEntityKind[] = [
  'character',
  'scene',
  'object',
  'location',
  'style',
  'action',
] as const;

export const DASHBOARD_CREATIVE_ENTITY_LIFECYCLE_STATUSES: readonly DashboardCreativeEntityLifecycleStatus[] =
  ['candidate', 'confirmed', 'deprecated', 'merged', 'unknown'] as const;

export const DASHBOARD_CREATIVE_ENTITY_SOURCE_KINDS: readonly DashboardCreativeEntitySourceKind[] =
  ['registry', 'script', 'asset', 'generated', 'requirement', 'mixed'] as const;

export const DASHBOARD_CREATIVE_ENTITY_ACTIONS: readonly DashboardCreativeEntityAction[] = [
  'open-source',
  'show-detail',
  'confirm-candidate',
  'edit-aliases',
  'bind-existing',
  'review-drafts',
  'handle-requirement',
  'generate-material',
  'import-material',
  'dismiss-requirement',
  'show-representation-package',
  'apply-sync-suggestion',
  'ignore-sync-suggestion',
  'rebind-orphaned-binding',
  'locate-binding-source',
  'archive-binding',
  'cleanup-suggested-orphan',
  'character-dialogue',
  'embody-character',
  'accept-memory-review',
  'reject-memory-review',
  'mark-memory-conflict',
  'supersede-memory-review',
  'refresh',
] as const;

export const DASHBOARD_ENTITY_MEMORY_REVIEW_ACTIONS: readonly DashboardEntityMemoryReviewAction[] =
  [
    'accept-memory-review',
    'reject-memory-review',
    'mark-memory-conflict',
    'supersede-memory-review',
  ] as const;

export const DASHBOARD_CHARACTER_ROLE_WORKFLOW_ACTIONS: readonly DashboardCharacterRoleWorkflowAction[] =
  ['embody-character'] as const;

export const DASHBOARD_CHARACTER_ROLE_WORKFLOW_SCOPE_KINDS: readonly DashboardCharacterRoleWorkflowScopeKind[] =
  [
    'project',
    'story-scene',
    'story-document',
    'occurrence',
    'interaction-path',
    'validation-artifact',
  ] as const;

export const DASHBOARD_CHARACTER_ROLE_WORKFLOW_RESULT_KINDS: readonly DashboardCharacterRoleWorkflowResultKind[] =
  ['agent-conversation', 'structured-report', 'suggestions', 'delegated-command'] as const;

export const DASHBOARD_CREATIVE_ENTITY_EVENT_TYPES: readonly DashboardCreativeEntityEventType[] = [
  'added',
  'updated',
  'removed',
  'refreshed',
] as const;

export const DASHBOARD_CREATIVE_ENTITY_SYNC_SUGGESTION_KINDS: readonly DashboardCreativeEntitySyncSuggestionKind[] =
  ['asset-metadata', 'generated-asset-registration', 'binding-mismatch'] as const;

export const DASHBOARD_CREATIVE_ENTITY_SYNC_SUGGESTION_STATUSES: readonly DashboardCreativeEntitySyncSuggestionStatus[] =
  ['suggested', 'applied', 'ignored', 'unavailable'] as const;

export function isDashboardCreativeEntityKind(
  value: unknown,
): value is DashboardCreativeEntityKind {
  return includesString(DASHBOARD_CREATIVE_ENTITY_KINDS, value);
}

export function isDashboardCreativeEntityLifecycleStatus(
  value: unknown,
): value is DashboardCreativeEntityLifecycleStatus {
  return includesString(DASHBOARD_CREATIVE_ENTITY_LIFECYCLE_STATUSES, value);
}

export function isDashboardCreativeEntitySourceKind(
  value: unknown,
): value is DashboardCreativeEntitySourceKind {
  return includesString(DASHBOARD_CREATIVE_ENTITY_SOURCE_KINDS, value);
}

export function isDashboardCreativeEntityAction(
  value: unknown,
): value is DashboardCreativeEntityAction {
  return includesString(DASHBOARD_CREATIVE_ENTITY_ACTIONS, value);
}

export function isDashboardEntityMemoryReviewAction(
  value: unknown,
): value is DashboardEntityMemoryReviewAction {
  return includesString(DASHBOARD_ENTITY_MEMORY_REVIEW_ACTIONS, value);
}

export function isDashboardCharacterRoleWorkflowAction(
  value: unknown,
): value is DashboardCharacterRoleWorkflowAction {
  return includesString(DASHBOARD_CHARACTER_ROLE_WORKFLOW_ACTIONS, value);
}

export function isDashboardCharacterRoleWorkflowScopeKind(
  value: unknown,
): value is DashboardCharacterRoleWorkflowScopeKind {
  return includesString(DASHBOARD_CHARACTER_ROLE_WORKFLOW_SCOPE_KINDS, value);
}

export function isDashboardCharacterRoleWorkflowResultKind(
  value: unknown,
): value is DashboardCharacterRoleWorkflowResultKind {
  return includesString(DASHBOARD_CHARACTER_ROLE_WORKFLOW_RESULT_KINDS, value);
}

export function isDashboardCreativeEntityEventType(
  value: unknown,
): value is DashboardCreativeEntityEventType {
  return includesString(DASHBOARD_CREATIVE_ENTITY_EVENT_TYPES, value);
}

export function isDashboardCreativeEntitySyncSuggestionKind(
  value: unknown,
): value is DashboardCreativeEntitySyncSuggestionKind {
  return includesString(DASHBOARD_CREATIVE_ENTITY_SYNC_SUGGESTION_KINDS, value);
}

export function isDashboardCreativeEntitySyncSuggestionStatus(
  value: unknown,
): value is DashboardCreativeEntitySyncSuggestionStatus {
  return includesString(DASHBOARD_CREATIVE_ENTITY_SYNC_SUGGESTION_STATUSES, value);
}

export function isDashboardCreativeEntityRef(value: unknown): value is DashboardCreativeEntityRef {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['source']) &&
    isNonEmptyString(value['sourceEntityId']) &&
    (value['entityId'] === undefined || typeof value['entityId'] === 'string') &&
    isDashboardCreativeEntityKind(value['entityKind']) &&
    (value['projectRoot'] === undefined || isSafeDashboardEntityRef(value['projectRoot'])) &&
    (value['workspaceFolder'] === undefined || isSafeDashboardEntityRef(value['workspaceFolder']))
  );
}

export function isSafeDashboardEntityRef(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (isCacheSchemaRef(value)) return false;
  if (isAssetLikeRef(value)) return true;
  if (isOpaqueSafeEntityRef(value)) return true;
  return normalizeDashboardLocalRef(value) !== undefined;
}

export function isDashboardCreativeEntitySourceStatus(
  value: unknown,
): value is DashboardCreativeEntitySourceStatus {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['source']) &&
    (value['sourceDisplayName'] === undefined || typeof value['sourceDisplayName'] === 'string') &&
    typeof value['available'] === 'boolean' &&
    isProjectIndexFreshness(value['freshness']) &&
    (value['entityCount'] === undefined || isNonNegativeNumber(value['entityCount'])) &&
    (value['updatedAt'] === undefined || typeof value['updatedAt'] === 'string') &&
    (value['error'] === undefined || typeof value['error'] === 'string')
  );
}

export function isDashboardCreativeEntitySourceRequest(
  value: unknown,
): value is DashboardCreativeEntitySourceRequest {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    (value['projectRoot'] === undefined || isNonEmptyString(value['projectRoot'])) &&
    (value['contextFilePath'] === undefined || isNonEmptyString(value['contextFilePath'])) &&
    (value['contextUri'] === undefined || isNonEmptyString(value['contextUri']))
  );
}

export function isDashboardCreativeEntityActionDescriptor(
  value: unknown,
): value is DashboardCreativeEntityActionDescriptor {
  if (!isRecord(value)) return false;
  return (
    isDashboardCreativeEntityAction(value['id']) &&
    isNonEmptyString(value['label']) &&
    (value['disabled'] === undefined || typeof value['disabled'] === 'boolean') &&
    (value['reason'] === undefined || typeof value['reason'] === 'string')
  );
}

export function isDashboardCharacterRoleWorkflowScopeRef(
  value: unknown,
): value is DashboardCharacterRoleWorkflowScopeRef {
  if (!isRecord(value)) return false;
  return (
    isDashboardCharacterRoleWorkflowScopeKind(value['kind']) &&
    isNonEmptyString(value['source']) &&
    isSafeDashboardEntityRef(value['ref']) &&
    (value['label'] === undefined || typeof value['label'] === 'string')
  );
}

export function isDashboardCharacterRoleWorkflowActionPayload(
  value: unknown,
): value is DashboardCharacterRoleWorkflowActionPayload {
  if (!isRecord(value)) return false;
  return (
    (value['entityRef'] === undefined || isDashboardCreativeEntityRef(value['entityRef'])) &&
    (value['scopes'] === undefined ||
      (Array.isArray(value['scopes']) &&
        value['scopes'].every(isDashboardCharacterRoleWorkflowScopeRef))) &&
    (value['prompt'] === undefined || typeof value['prompt'] === 'string')
  );
}

export function isDashboardCharacterRoleWorkflowActionResult(
  value: unknown,
): value is DashboardCharacterRoleWorkflowActionResult {
  if (!isRecord(value)) return false;
  return (
    isDashboardCharacterRoleWorkflowResultKind(value['kind']) &&
    (value['command'] === undefined || isNonEmptyString(value['command'])) &&
    (value['conversationId'] === undefined || isNonEmptyString(value['conversationId'])) &&
    (value['reportId'] === undefined || isNonEmptyString(value['reportId'])) &&
    (value['artifactRef'] === undefined || isSafeDashboardEntityRef(value['artifactRef']))
  );
}

export function isDashboardCreativeEntityRow(value: unknown): value is DashboardCreativeEntityRow {
  if (!isRecord(value)) return false;
  return (
    isDashboardCreativeEntityRef(value['ref']) &&
    isNonEmptyString(value['label']) &&
    isDashboardCreativeEntityKind(value['kind']) &&
    isDashboardCreativeEntityLifecycleStatus(value['status']) &&
    isDashboardCreativeEntitySourceKind(value['sourceKind']) &&
    isOptionalStringArray(value['aliases']) &&
    (value['summary'] === undefined || typeof value['summary'] === 'string') &&
    (value['occurrenceCount'] === undefined || isNonNegativeNumber(value['occurrenceCount'])) &&
    isOptionalBindingRoleArray(value['defaultBindingRoles']) &&
    isOptionalRepresentationKindArray(value['missingRepresentationKinds']) &&
    (value['visualDraftCount'] === undefined || isNonNegativeNumber(value['visualDraftCount'])) &&
    (value['syncSuggestionCount'] === undefined ||
      isNonNegativeNumber(value['syncSuggestionCount'])) &&
    (value['orphanedBindingCount'] === undefined ||
      isNonNegativeNumber(value['orphanedBindingCount'])) &&
    isProjectIndexFreshness(value['freshness']) &&
    Array.isArray(value['actions']) &&
    value['actions'].every(isDashboardCreativeEntityActionDescriptor) &&
    typeof value['searchText'] === 'string' &&
    (value['updatedAt'] === undefined || typeof value['updatedAt'] === 'string')
  );
}

export function isDashboardCreativeEntityOccurrenceRef(
  value: unknown,
): value is DashboardCreativeEntityOccurrenceRef {
  if (!isRecord(value)) return false;
  return (
    isOccurrenceSource(value['source']) &&
    (value['role'] === 'definition' || value['role'] === 'reference') &&
    isNonEmptyString(value['label']) &&
    isSafeDashboardEntityRef(value['location']) &&
    (value['detail'] === undefined || typeof value['detail'] === 'string')
  );
}

export function isDashboardCreativeEntityBindingSummary(
  value: unknown,
): value is DashboardCreativeEntityBindingSummary {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isEntityAssetBindingRole(value['role']) &&
    isSafeDashboardAssetRef(value['assetRef']) &&
    (value['preview'] === undefined || isDashboardCreativeEntityBindingPreview(value['preview'])) &&
    isBindingStatus(value['status']) &&
    isBindingAvailability(value['availability']) &&
    (value['orphanedAt'] === undefined || typeof value['orphanedAt'] === 'string') &&
    isBindingSource(value['source']) &&
    typeof value['isDefault'] === 'boolean' &&
    (value['confidence'] === undefined || isConfidence(value['confidence'])) &&
    typeof value['updatedAt'] === 'string'
  );
}

export function isDashboardCreativeEntityBindingPreview(
  value: unknown,
): value is DashboardCreativeEntityBindingPreview {
  if (!isRecord(value)) return false;
  return (
    (value['kind'] === 'image' || value['kind'] === 'model') &&
    isSafeDashboardPreviewUri(value['uri']) &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    (value['thumbnailUri'] === undefined || isSafeDashboardPreviewUri(value['thumbnailUri'])) &&
    (value['mimeType'] === undefined || typeof value['mimeType'] === 'string')
  );
}

export function isDashboardCreativeEntityRequirementSummary(
  value: unknown,
): value is DashboardCreativeEntityRequirementSummary {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['entityId']) &&
    isDashboardCreativeEntityKind(value['entityKind']) &&
    isRequirementSource(value['source']) &&
    isSafeDashboardEntityRef(value['sourceRef']) &&
    Array.isArray(value['requiredKinds']) &&
    value['requiredKinds'].every(isRepresentationKind) &&
    isRequirementStatus(value['status']) &&
    Array.isArray(value['actions']) &&
    value['actions'].every(isMissingRepresentationAction)
  );
}

export function isDashboardCreativeEntityVisualDraftSummary(
  value: unknown,
): value is DashboardCreativeEntityVisualDraftSummary {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['characterId']) &&
    isVisualDraftSource(value['source']) &&
    typeof value['prompt'] === 'string' &&
    Array.isArray(value['generatedAssetIds']) &&
    value['generatedAssetIds'].every((id) => typeof id === 'string') &&
    (value['selectedAssetId'] === undefined || typeof value['selectedAssetId'] === 'string') &&
    isVisualDraftStatus(value['status']) &&
    isNonNegativeNumber(value['factCount'])
  );
}

export function isDashboardCreativeEntitySyncSuggestion(
  value: unknown,
): value is DashboardCreativeEntitySyncSuggestion {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isDashboardCreativeEntitySyncSuggestionKind(value['kind']) &&
    isDashboardCreativeEntitySyncSuggestionStatus(value['status']) &&
    isDashboardCreativeEntityRef(value['entityRef']) &&
    isSafeDashboardAssetRef(value['targetRef']) &&
    Array.isArray(value['fields']) &&
    value['fields'].every(isNonEmptyString) &&
    isNonEmptyString(value['reason']) &&
    isNonEmptyString(value['ownerSource']) &&
    (value['readonlyTarget'] === undefined || typeof value['readonlyTarget'] === 'boolean')
  );
}

export function isDashboardEntityMemoryReviewItem(
  value: unknown,
): value is DashboardEntityMemoryReviewItem {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['reviewId']) &&
    (value['contributionId'] === undefined || isNonEmptyString(value['contributionId'])) &&
    (value['observationId'] === undefined || isNonEmptyString(value['observationId'])) &&
    isDashboardCreativeEntityRef(value['entityRef']) &&
    isNonEmptyString(value['sourcePackage']) &&
    (value['sourceLabel'] === undefined || typeof value['sourceLabel'] === 'string') &&
    isObservationSource(value['sourceKind']) &&
    isContributionReviewPolicy(value['reviewPolicy']) &&
    isReviewableMemoryStatus(value['reviewStatus']) &&
    Array.isArray(value['dimensions']) &&
    value['dimensions'].every(isNonEmptyString) &&
    isNonEmptyString(value['summary']) &&
    (value['evidenceText'] === undefined || typeof value['evidenceText'] === 'string') &&
    (value['confidence'] === undefined || isConfidence(value['confidence'])) &&
    (value['createdAt'] === undefined || typeof value['createdAt'] === 'string') &&
    Array.isArray(value['actions']) &&
    value['actions'].every(isDashboardEntityMemoryReviewAction)
  );
}

export function isDashboardCreativeEntityDetail(
  value: unknown,
): value is DashboardCreativeEntityDetail {
  if (!isRecord(value)) return false;
  return (
    isDashboardCreativeEntityRef(value['ref']) &&
    isNonEmptyString(value['label']) &&
    isDashboardCreativeEntityKind(value['kind']) &&
    isDashboardCreativeEntityLifecycleStatus(value['status']) &&
    isDashboardCreativeEntitySourceKind(value['sourceKind']) &&
    Array.isArray(value['aliases']) &&
    value['aliases'].every((alias) => typeof alias === 'string') &&
    (value['description'] === undefined || typeof value['description'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata'])) &&
    Array.isArray(value['relationships']) &&
    value['relationships'].every(isDashboardCreativeEntityRelationshipSummary) &&
    Array.isArray(value['occurrences']) &&
    value['occurrences'].every(isDashboardCreativeEntityOccurrenceRef) &&
    Array.isArray(value['bindings']) &&
    value['bindings'].every(isDashboardCreativeEntityBindingSummary) &&
    Array.isArray(value['defaults']) &&
    value['defaults'].every(isDashboardCreativeEntityBindingSummary) &&
    Array.isArray(value['requirements']) &&
    value['requirements'].every(isDashboardCreativeEntityRequirementSummary) &&
    Array.isArray(value['visualDrafts']) &&
    value['visualDrafts'].every(isDashboardCreativeEntityVisualDraftSummary) &&
    Array.isArray(value['syncSuggestions']) &&
    value['syncSuggestions'].every(isDashboardCreativeEntitySyncSuggestion) &&
    (value['memoryReviews'] === undefined ||
      (Array.isArray(value['memoryReviews']) &&
        value['memoryReviews'].every(isDashboardEntityMemoryReviewItem))) &&
    isProjectIndexFreshness(value['freshness']) &&
    Array.isArray(value['actions']) &&
    value['actions'].every(isDashboardCreativeEntityActionDescriptor)
  );
}

export function isDashboardCreativeEntitySnapshot(
  value: unknown,
): value is DashboardCreativeEntitySnapshot {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['source']) &&
    (value['sourceDisplayName'] === undefined || typeof value['sourceDisplayName'] === 'string') &&
    isDashboardCreativeEntitySourceStatus(value['status']) &&
    Array.isArray(value['rows']) &&
    value['rows'].every(isDashboardCreativeEntityRow) &&
    isProjectIndexFreshness(value['freshness']) &&
    typeof value['updatedAt'] === 'string'
  );
}

export function isDashboardCreativeEntityEvent(
  value: unknown,
): value is DashboardCreativeEntityEvent {
  if (!isRecord(value)) return false;
  return (
    isDashboardCreativeEntityEventType(value['type']) &&
    isNonEmptyString(value['source']) &&
    (value['ref'] === undefined || isDashboardCreativeEntityRef(value['ref'])) &&
    (value['row'] === undefined || isDashboardCreativeEntityRow(value['row'])) &&
    (value['changedRefs'] === undefined ||
      (Array.isArray(value['changedRefs']) &&
        value['changedRefs'].every(isCreativeEntityChangedRef))) &&
    isProjectIndexFreshness(value['freshness'])
  );
}

export function isDashboardCreativeEntityActionRequest(
  value: unknown,
): value is DashboardCreativeEntityActionRequest {
  if (!isRecord(value)) return false;
  const action = value['action'];
  const payload = value['payload'];
  return (
    isNonEmptyString(value['source']) &&
    (value['ref'] === undefined || isDashboardCreativeEntityRef(value['ref'])) &&
    isDashboardCreativeEntityAction(action) &&
    (value['suggestionId'] === undefined || isNonEmptyString(value['suggestionId'])) &&
    (value['requirementId'] === undefined || isNonEmptyString(value['requirementId'])) &&
    (value['memoryReviewId'] === undefined || isNonEmptyString(value['memoryReviewId'])) &&
    (value['role'] === undefined || isEntityAssetBindingRole(value['role'])) &&
    (payload === undefined ||
      (isDashboardCharacterRoleWorkflowAction(action)
        ? isDashboardCharacterRoleWorkflowActionPayload(payload)
        : isRecord(payload)))
  );
}

export function isDashboardCreativeEntityActionResult(
  value: unknown,
): value is DashboardCreativeEntityActionResult {
  if (!isRecord(value)) return false;
  return (
    typeof value['ok'] === 'boolean' &&
    (value['message'] === undefined || typeof value['message'] === 'string') &&
    (value['refresh'] === undefined || typeof value['refresh'] === 'boolean') &&
    (value['ref'] === undefined || isDashboardCreativeEntityRef(value['ref'])) &&
    (value['characterRoleWorkflow'] === undefined ||
      isDashboardCharacterRoleWorkflowActionResult(value['characterRoleWorkflow']))
  );
}

export function isDashboardCreativeEntitySourceCapabilities(
  value: unknown,
): value is DashboardCreativeEntitySourceCapabilities {
  if (!isRecord(value)) return false;
  return (
    (value['detail'] === undefined || typeof value['detail'] === 'boolean') &&
    (value['syncSuggestions'] === undefined || typeof value['syncSuggestions'] === 'boolean') &&
    (value['memoryReviews'] === undefined || typeof value['memoryReviews'] === 'boolean') &&
    (value['actions'] === undefined ||
      (Array.isArray(value['actions']) && value['actions'].every(isDashboardCreativeEntityAction)))
  );
}

export function isDashboardCreativeEntitySource(
  value: unknown,
): value is DashboardCreativeEntitySource {
  if (!isRecord(value)) return false;
  return (
    value['contractVersion'] === DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION &&
    isNonEmptyString(value['source']) &&
    (value['sourceDisplayName'] === undefined || typeof value['sourceDisplayName'] === 'string') &&
    (value['capabilities'] === undefined ||
      isDashboardCreativeEntitySourceCapabilities(value['capabilities'])) &&
    typeof value['getSnapshot'] === 'function' &&
    typeof value['getDetail'] === 'function' &&
    typeof value['executeAction'] === 'function' &&
    typeof value['onDidChangeEntity'] === 'function'
  );
}

export function isDashboardCreativeEntityState(
  value: unknown,
): value is DashboardCreativeEntityState {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value['statuses']) &&
    value['statuses'].every(isDashboardCreativeEntitySourceStatus) &&
    Array.isArray(value['rows']) &&
    value['rows'].every(isDashboardCreativeEntityRow) &&
    (value['selectedRef'] === undefined || isDashboardCreativeEntityRef(value['selectedRef'])) &&
    (value['detail'] === undefined || isDashboardCreativeEntityDetail(value['detail']))
  );
}

export function toDashboardCreativeEntityId(ref: DashboardCreativeEntityRef): string {
  if (ref.entityId && ref.entityKind !== 'action' && !ref.sourceEntityId.startsWith('candidate:')) {
    return `entity:${ref.entityKind}:${ref.entityId}`;
  }
  return `${ref.source}:${ref.sourceEntityId}`;
}

export function normalizeDashboardEntityLocalRef(ref: string): string | undefined {
  if (isCacheSchemaRef(ref)) return undefined;
  if (isAssetLikeRef(ref)) return ref;
  return normalizeDashboardLocalRef(ref);
}

export function isSafeDashboardAssetRef(ref: unknown): ref is string {
  if (typeof ref !== 'string' || ref.trim().length === 0) return false;
  if (isCacheSchemaRef(ref)) return false;
  if (isAssetLikeRef(ref)) return true;
  if (/^https?:\/\//i.test(ref)) return true;
  return !isAbsoluteLocalRef(ref);
}

export function isSafeDashboardPreviewUri(ref: unknown): ref is string {
  if (typeof ref !== 'string' || ref.trim().length === 0) return false;
  if (isCacheSchemaRef(ref)) return false;
  if (isAbsoluteLocalRef(ref)) return false;
  return /^(https?|vscode-webview-resource|vscode-resource|data|blob):/i.test(ref);
}

function isDashboardCreativeEntityRelationshipSummary(
  value: unknown,
): value is DashboardCreativeEntityRelationshipSummary {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['from']) &&
    isNonEmptyString(value['to']) &&
    isNonEmptyString(value['type']) &&
    isNonEmptyString(value['strength']) &&
    isNonEmptyString(value['provenance']) &&
    (value['confidence'] === undefined || isConfidence(value['confidence']))
  );
}

function isAssetLikeRef(value: string): boolean {
  return (
    /^(project|market|shared|external|generated):\/\//.test(value) || /^\$\{[^}]+}\//.test(value)
  );
}

function isOpaqueSafeEntityRef(value: string): boolean {
  if (/^file:/i.test(value)) return false;
  if (isCacheSchemaRef(value)) return false;
  return /^[a-z][a-z0-9+.-]*:\/\/.+/i.test(value);
}

function isCacheSchemaRef(value: string): boolean {
  return /(?:^|\/)\.neko\/\.cache(?:\/|$)/i.test(value.replace(/\\/g, '/'));
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isString));
}

function isOptionalBindingRoleArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isEntityAssetBindingRole));
}

function isOptionalRepresentationKindArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isRepresentationKind));
}

function isOccurrenceSource(value: unknown): value is DashboardCreativeEntityOccurrenceSource {
  return (
    value === 'registry' ||
    value === 'script' ||
    value === 'canvas' ||
    value === 'canvas-comment' ||
    value === 'canvas-container' ||
    value === 'canvas-text' ||
    value === 'asset' ||
    value === 'generated-asset'
  );
}

function isEntityAssetBindingRole(value: unknown): value is EntityAssetBindingRole {
  return (
    typeof value === 'string' &&
    ENTITY_ASSET_BINDING_ROLES.includes(value as EntityAssetBindingRole)
  );
}

function isBindingStatus(value: unknown): value is EntityAssetBindingStatus {
  return value === 'suggested' || value === 'confirmed' || value === 'rejected';
}

function isBindingAvailability(value: unknown): value is EntityAssetBindingAvailability {
  return value === 'active' || value === 'orphaned' || value === 'archived';
}

function isBindingSource(value: unknown): value is EntityAssetBindingSource {
  return (
    value === 'user' ||
    value === 'importer' ||
    value === 'story' ||
    value === 'canvas' ||
    value === 'agent' ||
    value === 'matcher'
  );
}

function isRequirementSource(value: unknown): value is EntityAssetRequirementSource {
  return value === 'story' || value === 'canvas' || value === 'agent' || value === 'live';
}

function isRequirementStatus(value: unknown): value is EntityAssetRequirementStatus {
  return (
    value === 'missing' ||
    value === 'suggested' ||
    value === 'generated' ||
    value === 'bound' ||
    value === 'dismissed'
  );
}

function isVisualDraftSource(value: unknown): value is VisualIdentityDraftSource {
  return value === 'story' || value === 'canvas' || value === 'agent';
}

function isVisualDraftStatus(value: unknown): value is VisualIdentityDraftStatus {
  return (
    value === 'drafting' || value === 'selected' || value === 'applied' || value === 'discarded'
  );
}

function isObservationSource(value: unknown): value is CharacterObservationSource {
  return includesString(CHARACTER_MEMORY_OBSERVATION_SOURCES, value);
}

function isContributionReviewPolicy(value: unknown): value is EntityMemoryContributionReviewPolicy {
  return includesString(ENTITY_MEMORY_CONTRIBUTION_REVIEW_POLICIES, value);
}

function isReviewableMemoryStatus(
  value: unknown,
): value is Exclude<CharacterMemoryReviewStatus, 'accepted'> {
  return includesString(CHARACTER_MEMORY_REVIEW_STATUSES, value) && value !== 'accepted';
}

function isMissingRepresentationAction(value: unknown): value is MissingRepresentationAction {
  return (
    value === 'generate' || value === 'import' || value === 'bind-existing' || value === 'dismiss'
  );
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
