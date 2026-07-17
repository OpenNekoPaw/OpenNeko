import type {
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityCandidateIdentityBasis,
  CreativeEntityCandidateProvenance,
  CreativeEntityCandidateStatus,
  CreativeEntityKind,
  CreativeEntityOperationResult,
  CreativeEntityQuery,
  CreativeEntityRef,
  CreativeEntityStatus,
  EntityAssetBinding,
  EntityAssetBindingRole,
  VisualIdentityDraft,
} from './creative-entity-asset-composition';
import {
  isCreativeEntityCandidateStatus,
  isCreativeEntityCandidateIdentityBasis,
  isCreativeEntityKind,
  isCreativeEntityRef,
  isEntityAssetBinding,
  isEntityAssetBindingRole,
  isVisualIdentityDraft,
} from './creative-entity-asset-composition';

export const ENTITY_FACADE_COMMANDS = {
  inspectEntity: 'neko.entity.inspectEntity',
  getEntity: 'neko.entity.getEntity',
  getEntityDetail: 'neko.entity.getEntityDetail',
  listEntities: 'neko.entity.listEntities',
  listBindings: 'neko.entity.listBindings',
  findEntitiesByAsset: 'neko.entity.findEntitiesByAsset',
  resolveByName: 'neko.entity.resolveByName',
  listCandidates: 'neko.entity.listCandidates',
  proposeCandidate: 'neko.entity.proposeCandidate',
  confirmCandidate: 'neko.entity.confirmCandidate',
  rejectCandidate: 'neko.entity.rejectCandidate',
  dismissCandidate: 'neko.entity.dismissCandidate',
  mergeCandidate: 'neko.entity.mergeCandidate',
  bindAsset: 'neko.entity.bindAsset',
  unbindAsset: 'neko.entity.unbindAsset',
  markBindingOrphaned: 'neko.entity.markBindingOrphaned',
  restoreBinding: 'neko.entity.restoreBinding',
  archiveBinding: 'neko.entity.archiveBinding',
  upsertVisualDraft: 'neko.entity.upsertVisualDraft',
  nameCandidate: 'neko.entity.nameCandidate',
  renameEntity: 'neko.entity.renameEntity',
  addAlias: 'neko.entity.addAlias',
  removeAlias: 'neko.entity.removeAlias',
  updateMetadata: 'neko.entity.updateMetadata',
  setDefaultBinding: 'neko.entity.setDefaultBinding',
  triggerBindingWidgetAction: 'neko.entity.triggerBindingWidgetAction',
} as const;

export type EntityFacadeCommand =
  (typeof ENTITY_FACADE_COMMANDS)[keyof typeof ENTITY_FACADE_COMMANDS];

export const ENTITY_FACADE_SHORT_METADATA_KEYS = [
  'appearanceSummary',
  'visualSummary',
  'appearanceNotes',
] as const;

export type EntityFacadeShortMetadataKey = (typeof ENTITY_FACADE_SHORT_METADATA_KEYS)[number];

export const ENTITY_BINDING_WIDGET_ACTIONS = [
  'confirm-candidate',
  'bind-asset',
  'unbind-asset',
  'archive-binding',
  'name-candidate',
  'rename-entity',
  'add-alias',
  'remove-alias',
  'update-metadata',
  'set-default-binding',
] as const;

export type EntityBindingWidgetAction = (typeof ENTITY_BINDING_WIDGET_ACTIONS)[number];

export type EntityBindingWidgetHostSurface =
  | 'canvas'
  | 'sketch'
  | 'model'
  | 'puppet'
  | 'story'
  | 'agent'
  | 'assets'
  | 'dashboard'
  | 'inspector'
  | 'treeview'
  | 'overlay'
  | 'command-palette';

export interface EntityFacadeProjectContext {
  readonly projectRoot?: string;
  readonly contextUri?: string;
}

export interface EntityFacadeInspectEntityRequest extends EntityFacadeProjectContext {
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly context?: EntityBindingWidgetHostContext;
  readonly reveal?: boolean;
}

export interface EntityFacadeGetEntityRequest extends EntityFacadeProjectContext {
  readonly entityRef?: CreativeEntityRef;
  readonly entityId?: string;
}

export interface EntityFacadeGetEntityDetailRequest extends EntityFacadeProjectContext {
  readonly entityRef: CreativeEntityRef;
}

export interface EntityFacadeEntityDetailResult {
  readonly entity?: CreativeEntity;
  readonly candidates: readonly CreativeEntityCandidate[];
  readonly bindings: readonly EntityAssetBinding[];
  readonly visualDrafts: readonly VisualIdentityDraft[];
}

export interface EntityFacadeListEntitiesRequest extends EntityFacadeProjectContext {
  readonly query?: CreativeEntityQuery;
}

export interface EntityFacadeListBindingsRequest extends EntityFacadeProjectContext {
  readonly entityRef?: CreativeEntityRef;
  readonly assetRef?: string;
}

export interface EntityFacadeTreeItem {
  readonly id: string;
  readonly label: string;
  readonly kind: CreativeEntityKind;
  readonly status: CreativeEntityStatus | CreativeEntityCandidateStatus;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly summary?: string;
  readonly aliases?: readonly string[];
  readonly defaultBindingRoles?: readonly EntityAssetBindingRole[];
}

export interface EntityFacadeAssetReverseLookupRequest extends EntityFacadeProjectContext {
  readonly assetRef: string;
}

export interface EntityFacadeAssetReverseLookupItem {
  readonly entityRef: CreativeEntityRef;
  readonly label: string;
  readonly role: EntityAssetBindingRole;
  readonly bindingId: string;
  readonly status: EntityAssetBinding['status'];
  readonly availability?: EntityAssetBinding['availability'];
  readonly isDefault?: boolean;
}

export interface EntityFacadeAssetReverseLookupResult {
  readonly assetRef: string;
  readonly entities: readonly EntityFacadeAssetReverseLookupItem[];
}

export interface EntityFacadeResolveByNameRequest extends EntityFacadeProjectContext {
  readonly name: string;
  readonly kind?: CreativeEntityKind;
}

export interface EntityFacadeListCandidatesRequest extends EntityFacadeProjectContext {
  readonly status?: CreativeEntityCandidateStatus;
}

export interface EntityFacadeProposeCandidateRequest extends EntityFacadeProjectContext {
  readonly candidate: EntityFacadeCandidateInput;
}

export interface EntityFacadeCandidateInput {
  readonly id?: string;
  readonly kind: CreativeEntityKind;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly identityBasis?: CreativeEntityCandidateIdentityBasis;
  readonly confidence?: number;
  readonly provenance: readonly CreativeEntityCandidateProvenance[];
  readonly sourceRefs?: readonly string[];
  readonly suggestedRequirements?: CreativeEntityCandidate['suggestedRequirements'];
  readonly metadata?: Record<string, unknown>;
}

export interface EntityFacadeConfirmCandidateRequest extends EntityFacadeProjectContext {
  readonly candidateId: string;
  readonly kind?: CreativeEntityKind;
  readonly entityId?: string;
  readonly displayName?: string;
  readonly aliases?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface EntityFacadeCandidateActionRequest extends EntityFacadeProjectContext {
  readonly candidateId: string;
}

export interface EntityFacadeNameCandidateRequest extends EntityFacadeCandidateActionRequest {
  readonly name: string;
  readonly aliases?: readonly string[];
}

export interface EntityFacadeMergeCandidateRequest extends EntityFacadeProjectContext {
  readonly candidateId: string;
  readonly entityRef?: CreativeEntityRef;
  readonly entityId?: string;
  readonly asAlias?: boolean;
}

export interface EntityFacadeUpsertBindingRequest extends EntityFacadeProjectContext {
  readonly binding: EntityAssetBinding;
}

export interface EntityFacadeUnbindAssetRequest extends EntityFacadeProjectContext {
  readonly bindingId: string;
}

export interface EntityFacadeBindingLifecycleRequest extends EntityFacadeProjectContext {
  readonly bindingIds: readonly string[];
  readonly orphanedAt?: string;
}

export interface EntityFacadeUpsertVisualDraftRequest extends EntityFacadeProjectContext {
  readonly draft: VisualIdentityDraft;
}

export interface EntityFacadeRenameEntityRequest extends EntityFacadeProjectContext {
  readonly entityRef: CreativeEntityRef;
  readonly canonicalName?: string;
  readonly keepPreviousAsAlias?: boolean;
  readonly interactive?: boolean;
}

export interface EntityFacadeAliasRequest extends EntityFacadeProjectContext {
  readonly entityRef: CreativeEntityRef;
  readonly alias?: string;
  readonly interactive?: boolean;
}

export interface EntityFacadeUpdateMetadataRequest extends EntityFacadeProjectContext {
  readonly entityRef: CreativeEntityRef;
  readonly metadata: Partial<Record<EntityFacadeShortMetadataKey, string | null>>;
}

export interface EntityFacadeSetDefaultBindingRequest extends EntityFacadeProjectContext {
  readonly binding?: EntityAssetBinding;
  readonly entityRef?: CreativeEntityRef;
  readonly interactive?: boolean;
}

export interface EntityFacadeCommandError {
  readonly code:
    | 'invalid-request'
    | 'missing-project'
    | 'not-found'
    | 'duplicate-name'
    | 'unsupported-edit'
    | 'cancelled';
  readonly message: string;
  readonly diagnostics?: readonly string[];
}

export interface EntityBindingWidgetHostContext extends EntityFacadeProjectContext {
  readonly surface: EntityBindingWidgetHostSurface;
  readonly sourceRef?: string;
  readonly nodeId?: string;
  readonly assetRef?: string;
}

export interface EntityBindingWidgetTriggerRequest extends EntityFacadeProjectContext {
  readonly context: EntityBindingWidgetHostContext;
  readonly action: EntityBindingWidgetAction;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly assetRef?: string;
  readonly role?: EntityAssetBindingRole;
  readonly payload?: Record<string, unknown>;
}

export type EntityFacadeWriteResult = CreativeEntityOperationResult | EntityFacadeCommandError;

export function isEntityFacadeInspectEntityRequest(
  value: unknown,
): value is EntityFacadeInspectEntityRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['candidateId'] === undefined || isNonEmptyString(value['candidateId'])) &&
    (value['context'] === undefined || isEntityBindingWidgetHostContext(value['context'])) &&
    (value['reveal'] === undefined || typeof value['reveal'] === 'boolean') &&
    (isCreativeEntityRef(value['entityRef']) || isNonEmptyString(value['candidateId']))
  );
}

export function isEntityFacadeGetEntityRequest(
  value: unknown,
): value is EntityFacadeGetEntityRequest {
  if (!isRecord(value) || !isEntityFacadeProjectContext(value)) return false;
  return (
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['entityId'] === undefined || isNonEmptyString(value['entityId']))
  );
}

export function isEntityFacadeGetEntityDetailRequest(
  value: unknown,
): value is EntityFacadeGetEntityDetailRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isCreativeEntityRef(value['entityRef'])
  );
}

export function isEntityFacadeListEntitiesRequest(
  value: unknown,
): value is EntityFacadeListEntitiesRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isOptionalCreativeEntityQuery(value['query'])
  );
}

export function isEntityFacadeListBindingsRequest(
  value: unknown,
): value is EntityFacadeListBindingsRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['assetRef'] === undefined || isNonEmptyString(value['assetRef']))
  );
}

export function isEntityFacadeTreeItem(value: unknown): value is EntityFacadeTreeItem {
  return (
    isRecord(value) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['label']) &&
    isCreativeEntityKind(value['kind']) &&
    isEntityFacadeTreeItemStatus(value['status']) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['candidateId'] === undefined || isNonEmptyString(value['candidateId'])) &&
    (value['summary'] === undefined || typeof value['summary'] === 'string') &&
    isOptionalStringArray(value['aliases']) &&
    (value['defaultBindingRoles'] === undefined ||
      (Array.isArray(value['defaultBindingRoles']) &&
        value['defaultBindingRoles'].every(isEntityAssetBindingRole))) &&
    (isCreativeEntityRef(value['entityRef']) || isNonEmptyString(value['candidateId']))
  );
}

export function isEntityFacadeAssetReverseLookupRequest(
  value: unknown,
): value is EntityFacadeAssetReverseLookupRequest {
  return (
    isRecord(value) && isEntityFacadeProjectContext(value) && isNonEmptyString(value['assetRef'])
  );
}

export function isEntityFacadeAssetReverseLookupItem(
  value: unknown,
): value is EntityFacadeAssetReverseLookupItem {
  return (
    isRecord(value) &&
    isCreativeEntityRef(value['entityRef']) &&
    isNonEmptyString(value['label']) &&
    isEntityAssetBindingRole(value['role']) &&
    isNonEmptyString(value['bindingId']) &&
    (value['status'] === 'suggested' ||
      value['status'] === 'confirmed' ||
      value['status'] === 'rejected') &&
    (value['availability'] === undefined ||
      value['availability'] === 'active' ||
      value['availability'] === 'orphaned' ||
      value['availability'] === 'archived') &&
    (value['isDefault'] === undefined || typeof value['isDefault'] === 'boolean')
  );
}

export function isEntityFacadeAssetReverseLookupResult(
  value: unknown,
): value is EntityFacadeAssetReverseLookupResult {
  return (
    isRecord(value) &&
    isNonEmptyString(value['assetRef']) &&
    Array.isArray(value['entities']) &&
    value['entities'].every(isEntityFacadeAssetReverseLookupItem)
  );
}

export function isEntityFacadeResolveByNameRequest(
  value: unknown,
): value is EntityFacadeResolveByNameRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isNonEmptyString(value['name']) &&
    (value['kind'] === undefined || isCreativeEntityKind(value['kind']))
  );
}

export function isEntityFacadeListCandidatesRequest(
  value: unknown,
): value is EntityFacadeListCandidatesRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    (value['status'] === undefined || isCreativeEntityCandidateStatus(value['status']))
  );
}

export function isEntityFacadeProposeCandidateRequest(
  value: unknown,
): value is EntityFacadeProposeCandidateRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isEntityFacadeCandidateInput(value['candidate'])
  );
}

export function isEntityFacadeConfirmCandidateRequest(
  value: unknown,
): value is EntityFacadeConfirmCandidateRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isNonEmptyString(value['candidateId']) &&
    (value['kind'] === undefined || isCreativeEntityKind(value['kind'])) &&
    (value['entityId'] === undefined || isNonEmptyString(value['entityId'])) &&
    (value['displayName'] === undefined || typeof value['displayName'] === 'string') &&
    isOptionalStringArray(value['aliases']) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

export function isEntityFacadeCandidateActionRequest(
  value: unknown,
): value is EntityFacadeCandidateActionRequest {
  return (
    isRecord(value) && isEntityFacadeProjectContext(value) && isNonEmptyString(value['candidateId'])
  );
}

export function isEntityFacadeNameCandidateRequest(
  value: unknown,
): value is EntityFacadeNameCandidateRequest {
  return (
    isRecord(value) &&
    isEntityFacadeCandidateActionRequest(value) &&
    isNonEmptyString(value['name']) &&
    isOptionalStringArray(value['aliases'])
  );
}

export function isEntityFacadeMergeCandidateRequest(
  value: unknown,
): value is EntityFacadeMergeCandidateRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isNonEmptyString(value['candidateId']) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['entityId'] === undefined || isNonEmptyString(value['entityId'])) &&
    (value['asAlias'] === undefined || typeof value['asAlias'] === 'boolean')
  );
}

export function isEntityFacadeUpsertBindingRequest(
  value: unknown,
): value is EntityFacadeUpsertBindingRequest {
  return (
    isRecord(value) && isEntityFacadeProjectContext(value) && isEntityAssetBinding(value['binding'])
  );
}

export function isEntityFacadeUnbindAssetRequest(
  value: unknown,
): value is EntityFacadeUnbindAssetRequest {
  return (
    isRecord(value) && isEntityFacadeProjectContext(value) && isNonEmptyString(value['bindingId'])
  );
}

export function isEntityFacadeBindingLifecycleRequest(
  value: unknown,
): value is EntityFacadeBindingLifecycleRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    Array.isArray(value['bindingIds']) &&
    value['bindingIds'].length > 0 &&
    value['bindingIds'].every(isNonEmptyString) &&
    (value['orphanedAt'] === undefined || typeof value['orphanedAt'] === 'string')
  );
}

export function isEntityFacadeUpsertVisualDraftRequest(
  value: unknown,
): value is EntityFacadeUpsertVisualDraftRequest {
  return (
    isRecord(value) && isEntityFacadeProjectContext(value) && isVisualIdentityDraft(value['draft'])
  );
}

export function isEntityFacadeRenameEntityRequest(
  value: unknown,
): value is EntityFacadeRenameEntityRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isCreativeEntityRef(value['entityRef']) &&
    (value['canonicalName'] === undefined || typeof value['canonicalName'] === 'string') &&
    (value['keepPreviousAsAlias'] === undefined ||
      typeof value['keepPreviousAsAlias'] === 'boolean') &&
    (value['interactive'] === undefined || typeof value['interactive'] === 'boolean')
  );
}

export function isEntityFacadeAliasRequest(value: unknown): value is EntityFacadeAliasRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isCreativeEntityRef(value['entityRef']) &&
    (value['alias'] === undefined || typeof value['alias'] === 'string') &&
    (value['interactive'] === undefined || typeof value['interactive'] === 'boolean')
  );
}

export function isEntityFacadeUpdateMetadataRequest(
  value: unknown,
): value is EntityFacadeUpdateMetadataRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isCreativeEntityRef(value['entityRef']) &&
    isShortMetadataPatch(value['metadata'])
  );
}

export function isEntityFacadeSetDefaultBindingRequest(
  value: unknown,
): value is EntityFacadeSetDefaultBindingRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    (value['binding'] === undefined || isEntityAssetBinding(value['binding'])) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['interactive'] === undefined || typeof value['interactive'] === 'boolean') &&
    (value['binding'] !== undefined || value['entityRef'] !== undefined)
  );
}

export function isEntityBindingWidgetHostContext(
  value: unknown,
): value is EntityBindingWidgetHostContext {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isEntityBindingWidgetHostSurface(value['surface']) &&
    (value['sourceRef'] === undefined || typeof value['sourceRef'] === 'string') &&
    (value['nodeId'] === undefined || typeof value['nodeId'] === 'string') &&
    (value['assetRef'] === undefined || typeof value['assetRef'] === 'string')
  );
}

export function isEntityBindingWidgetTriggerRequest(
  value: unknown,
): value is EntityBindingWidgetTriggerRequest {
  return (
    isRecord(value) &&
    isEntityFacadeProjectContext(value) &&
    isEntityBindingWidgetHostContext(value['context']) &&
    isEntityBindingWidgetAction(value['action']) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['candidateId'] === undefined || isNonEmptyString(value['candidateId'])) &&
    (value['assetRef'] === undefined || typeof value['assetRef'] === 'string') &&
    (value['role'] === undefined || isEntityAssetBindingRole(value['role'])) &&
    (value['payload'] === undefined || isRecord(value['payload']))
  );
}

export function isEntityFacadeCommandError(value: unknown): value is EntityFacadeCommandError {
  return (
    isRecord(value) &&
    isEntityFacadeErrorCode(value['code']) &&
    typeof value['message'] === 'string' &&
    (value['diagnostics'] === undefined ||
      (Array.isArray(value['diagnostics']) &&
        value['diagnostics'].every((item) => typeof item === 'string')))
  );
}

function isEntityFacadeProjectContext(value: Record<string, unknown>): boolean {
  return (
    (value['projectRoot'] === undefined || typeof value['projectRoot'] === 'string') &&
    (value['contextUri'] === undefined || typeof value['contextUri'] === 'string')
  );
}

function isEntityFacadeCandidateInput(value: unknown): value is EntityFacadeCandidateInput {
  return (
    isRecord(value) &&
    (value['id'] === undefined || isNonEmptyString(value['id'])) &&
    isCreativeEntityKind(value['kind']) &&
    isNonEmptyString(value['name']) &&
    isOptionalStringArray(value['aliases']) &&
    (value['identityBasis'] === undefined ||
      isCreativeEntityCandidateIdentityBasis(value['identityBasis'])) &&
    (value['confidence'] === undefined || isUnitNumber(value['confidence'])) &&
    Array.isArray(value['provenance']) &&
    value['provenance'].every((item) => isCreativeEntityCandidateProvenance(item)) &&
    (value['sourceRefs'] === undefined ||
      (Array.isArray(value['sourceRefs']) &&
        value['sourceRefs'].every((item) => typeof item === 'string'))) &&
    (value['suggestedRequirements'] === undefined ||
      Array.isArray(value['suggestedRequirements'])) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isCreativeEntityCandidateProvenance(
  value: unknown,
): value is CreativeEntityCandidateProvenance {
  return (
    isRecord(value) &&
    isNonEmptyString(value['providerId']) &&
    (value['sourceKind'] === 'registry' ||
      value['sourceKind'] === 'candidate' ||
      value['sourceKind'] === 'story' ||
      value['sourceKind'] === 'canvas' ||
      value['sourceKind'] === 'asset' ||
      value['sourceKind'] === 'agent' ||
      value['sourceKind'] === 'document' ||
      value['sourceKind'] === 'importer' ||
      value['sourceKind'] === 'generated') &&
    (value['sourceRef'] === undefined || typeof value['sourceRef'] === 'string') &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    (value['confidence'] === undefined || isUnitNumber(value['confidence'])) &&
    (value['observedAt'] === undefined || typeof value['observedAt'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isOptionalCreativeEntityQuery(value: unknown): value is CreativeEntityQuery | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    (value['kind'] === undefined || isCreativeEntityKind(value['kind'])) &&
    (value['status'] === undefined ||
      value['status'] === 'candidate' ||
      value['status'] === 'confirmed' ||
      value['status'] === 'deprecated') &&
    (value['text'] === undefined || typeof value['text'] === 'string')
  );
}

function isShortMetadataPatch(
  value: unknown,
): value is Partial<Record<EntityFacadeShortMetadataKey, string | null>> {
  if (!isRecord(value)) return false;
  const allowed = new Set<string>(ENTITY_FACADE_SHORT_METADATA_KEYS);
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) return false;
    if (item !== null && typeof item !== 'string') return false;
  }
  return true;
}

export function isEntityBindingWidgetAction(value: unknown): value is EntityBindingWidgetAction {
  return (
    value === 'confirm-candidate' ||
    value === 'bind-asset' ||
    value === 'unbind-asset' ||
    value === 'archive-binding' ||
    value === 'name-candidate' ||
    value === 'rename-entity' ||
    value === 'add-alias' ||
    value === 'remove-alias' ||
    value === 'update-metadata' ||
    value === 'set-default-binding'
  );
}

function isEntityFacadeTreeItemStatus(
  value: unknown,
): value is CreativeEntityStatus | CreativeEntityCandidateStatus {
  return (
    value === 'candidate' ||
    value === 'confirmed' ||
    value === 'deprecated' ||
    isCreativeEntityCandidateStatus(value)
  );
}

function isEntityBindingWidgetHostSurface(value: unknown): value is EntityBindingWidgetHostSurface {
  return (
    value === 'canvas' ||
    value === 'sketch' ||
    value === 'model' ||
    value === 'puppet' ||
    value === 'story' ||
    value === 'agent' ||
    value === 'assets' ||
    value === 'dashboard' ||
    value === 'inspector' ||
    value === 'treeview' ||
    value === 'overlay' ||
    value === 'command-palette'
  );
}

function isEntityFacadeErrorCode(value: unknown): value is EntityFacadeCommandError['code'] {
  return (
    value === 'invalid-request' ||
    value === 'missing-project' ||
    value === 'not-found' ||
    value === 'duplicate-name' ||
    value === 'unsupported-edit' ||
    value === 'cancelled'
  );
}

function isOptionalStringArray(value: unknown): value is readonly string[] | undefined {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
