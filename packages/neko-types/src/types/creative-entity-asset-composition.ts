// =============================================================================
// Creative Entity Asset Composition
//
// Shared contracts for composing creative entities with project, shared, or
// external asset representations.
// =============================================================================

import type { ProjectIndexFreshness } from './project-cache-search';
import type { CharacterMemorySourceRange } from './character-memory';
import type { DocumentLocator } from './document-reading';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';
import {
  type EntityRepresentationRole,
  type EntityRepresentationTarget,
} from './entity-representation-binding';

export {
  CREATIVE_ENTITY_KINDS,
  isCreativeEntityKind,
  type CreativeEntityKind,
} from './creative-entity-identity';

export type CreativeEntityStatus = 'candidate' | 'confirmed' | 'deprecated';

export interface CreativeEntity {
  readonly id: string;
  readonly kind: CreativeEntityKind;
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly aliases: readonly string[];
  readonly status: CreativeEntityStatus;
  readonly metadata?: Record<string, unknown>;
}

export interface CreativeEntityQuery {
  readonly kind?: CreativeEntityKind;
  readonly status?: CreativeEntityStatus;
  readonly text?: string;
}

export interface CreativeEntityRegistry {
  list(query?: CreativeEntityQuery): readonly CreativeEntity[] | Promise<readonly CreativeEntity[]>;
  get(id: string): CreativeEntity | undefined | Promise<CreativeEntity | undefined>;
  resolveByName(
    name: string,
    kind?: CreativeEntityKind,
  ): CreativeEntity | undefined | Promise<CreativeEntity | undefined>;
}

export interface CreativeEntityRef {
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly projectRoot?: string;
  readonly source?: string;
}

export type CreativeEntitySourceKind =
  | 'registry'
  | 'candidate'
  | 'story'
  | 'canvas'
  | 'asset'
  | 'agent'
  | 'document'
  | 'importer'
  | 'generated';

export interface CreativeEntitySourceMetadata {
  readonly sourceId: string;
  readonly sourceKind: CreativeEntitySourceKind;
  readonly sourceRef?: string;
  readonly providerId?: string;
  readonly freshness?: ProjectIndexFreshness;
  readonly updatedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export type CreativeEntityCandidateStatus =
  'open' | 'confirmed' | 'rejected' | 'dismissed' | 'merged';

export type CreativeEntityCandidateIdentityBasis =
  'user-named' | 'placeholder' | 'visual' | 'asset';

export interface CreativeEntityCandidateProvenance {
  readonly providerId: string;
  readonly sourceKind: CreativeEntitySourceKind;
  readonly sourceRef?: string;
  readonly label?: string;
  readonly confidence?: number;
  readonly observedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CreativeEntityCandidate {
  readonly id: string;
  readonly kind: CreativeEntityKind;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly status: CreativeEntityCandidateStatus;
  readonly identityBasis: CreativeEntityCandidateIdentityBasis;
  readonly confidence?: number;
  readonly provenance: readonly CreativeEntityCandidateProvenance[];
  readonly sourceRefs: readonly string[];
  readonly suggestedRequirements?: readonly EntityAssetRequirement[];
  readonly resolvedEntityRef?: CreativeEntityRef;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CreativeEntityCandidateFile {
  readonly version: 1;
  readonly candidates: readonly CreativeEntityCandidate[];
}

export type CreativeEntityLifecycleAction =
  | 'create'
  | 'confirm-candidate'
  | 'reject-candidate'
  | 'dismiss-candidate'
  | 'merge-candidate'
  | 'name-candidate'
  | 'rename'
  | 'update-display-name'
  | 'add-alias'
  | 'remove-alias'
  | 'update-metadata'
  | 'deprecate'
  | 'reactivate'
  | 'merge'
  | 'bind'
  | 'rebind'
  | 'unbind'
  | 'set-default-binding'
  | 'mark-binding-orphaned'
  | 'archive-binding'
  | 'update-requirement'
  | 'update-visual-draft'
  | 'apply-sync-suggestion'
  | 'ignore-sync-suggestion';

export interface CreativeEntityChangedRef {
  readonly kind:
    'entity' | 'candidate' | 'binding' | 'requirement' | 'visual-draft' | 'provider' | 'store';
  readonly id: string;
  readonly entityRef?: CreativeEntityRef;
  readonly factRef?: string;
}

export interface CreativeEntityChangeEvent {
  readonly projectRoot: string;
  readonly reason: CreativeEntityLifecycleAction | 'provider-refresh' | 'store-refresh';
  readonly changedRefs: readonly CreativeEntityChangedRef[];
  readonly generation: number;
  readonly freshness: ProjectIndexFreshness;
  readonly updatedAt: string;
  readonly source?: CreativeEntitySourceMetadata;
}

export interface CreativeEntityOperationResult {
  readonly ok: boolean;
  readonly action: CreativeEntityLifecycleAction;
  readonly projectRoot: string;
  readonly affectedEntityRefs: readonly CreativeEntityRef[];
  readonly changedRefs: readonly CreativeEntityChangedRef[];
  readonly generation: number;
  readonly freshness: ProjectIndexFreshness;
  readonly updatedAt: string;
  readonly message?: string;
}

export interface CreativeEntityMergeResult extends CreativeEntityOperationResult {
  readonly survivingEntityRef: CreativeEntityRef;
  readonly mergedEntityRefs: readonly CreativeEntityRef[];
}

export interface ProjectCreativeEntityFile {
  readonly version: 1;
  readonly kind: Exclude<CreativeEntityKind, 'character'>;
  readonly entities: readonly CreativeEntity[];
}

export interface CreativeEntityProviderStatus {
  readonly providerId: string;
  readonly sourceKind: CreativeEntitySourceKind;
  readonly available: boolean;
  readonly freshness: ProjectIndexFreshness;
  readonly updatedAt?: string;
  readonly error?: string;
}

export interface CreativeEntityOccurrenceProjection {
  readonly occurrenceId?: string;
  readonly mentionId?: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly label: string;
  readonly source: CreativeEntitySourceMetadata;
  readonly role: 'definition' | 'reference';
  readonly location: string;
  readonly detail?: string;
  readonly locator?: DocumentLocator;
  readonly range?: CharacterMemorySourceRange;
  readonly sourceFingerprint?: string;
}

export interface CreativeEntityRelationshipProjection {
  readonly from: CreativeEntityRef;
  readonly to: CreativeEntityRef;
  readonly type: string;
  readonly strength?: string;
  readonly source: CreativeEntitySourceMetadata;
  readonly confidence?: number;
}

export interface CreativeEntityRepresentationHint {
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly representation: EntityRepresentationTarget;
  readonly roles: readonly EntityRepresentationRole[];
  readonly source: CreativeEntitySourceMetadata;
  readonly confidence?: number;
  readonly reason?: string;
}

export interface CreativeEntitySyncSuggestion {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly targetRef: string;
  readonly fields: readonly string[];
  readonly reason: string;
  readonly source: CreativeEntitySourceMetadata;
  readonly readonlyTarget?: boolean;
}

export type RepresentationKind =
  'portrait' | 'reference' | 'live2d' | 'live3d' | 'voice' | 'motion' | 'video';

export type RepresentationTarget = 'canvas' | 'agent' | 'cut';

export interface RepresentationResolveRequest {
  readonly entityId: string;
  readonly target: RepresentationTarget;
  readonly preferredKind?: RepresentationKind;
  readonly fallbackOrder?: readonly RepresentationKind[];
  readonly allowFallback?: boolean;
}

export interface ResolvedRepresentationFile {
  readonly role: RepresentationFileRole;
  readonly assetRef: string;
  readonly fileId?: string;
  readonly path?: string;
  readonly mediaType?: string;
}

export interface AssetFederationSemantics {
  readonly capabilities?: readonly string[];
  readonly files?: readonly ResolvedRepresentationFile[];
  readonly metadata?: Record<string, unknown>;
}

export interface AssetFederationCapabilityProvider {
  describeAsset(ref: ResolvedAssetRef): Promise<AssetFederationSemantics | undefined>;
}

export type RepresentationResolveResult =
  | {
      readonly status: 'resolved';
      readonly entityId: string;
      readonly assetRef: string;
      readonly assetEntityId?: string;
      readonly resolvedKind: RepresentationKind;
      readonly fallback: boolean;
      readonly role: EntityRepresentationRole | RepresentationKind;
      readonly files: readonly ResolvedRepresentationFile[];
      readonly capabilities: readonly string[];
    }
  | {
      readonly status: 'missing-representation';
      readonly entityId: string;
      readonly missingKinds: readonly RepresentationKind[];
      readonly suggestedActions: readonly MissingRepresentationAction[];
    };

export type MissingRepresentationAction = 'generate' | 'import' | 'bind-existing' | 'dismiss';

export const DEFAULT_REPRESENTATION_FALLBACKS: Readonly<
  Record<RepresentationTarget, readonly RepresentationKind[]>
> = {
  canvas: ['portrait', 'reference', 'live2d', 'live3d'],
  agent: ['reference', 'portrait', 'live2d', 'live3d'],
  cut: ['video', 'live2d', 'live3d', 'portrait'],
} as const;

export type AssetRefScheme = 'project' | 'shared' | 'external';

export interface ParsedAssetRef {
  readonly scheme: AssetRefScheme;
  readonly raw: string;
  readonly authority?: string;
  readonly path: string;
  readonly version?: string;
  /** Source-specific qualifiers such as variant, channel, entitlement hint, or rendition. */
  readonly query?: Record<string, string>;
}

export interface AssetRefValidation {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface ResolvedAssetRef {
  readonly ref: string;
  /** Parsed URI scheme from the original reference. */
  readonly scheme: AssetRefScheme;
  /** Resolved backend after aliases, mirrors, local forks, or redirects. */
  readonly source: AssetRefScheme;
  readonly readonly: boolean;
  readonly assetEntityId?: string;
  readonly uri?: string;
  readonly localPath?: string;
  readonly capabilities?: readonly string[];
}

export interface AssetRefResolver {
  parse(ref: string): ParsedAssetRef;
  validate(ref: string): AssetRefValidation;
  resolve(ref: string): Promise<ResolvedAssetRef>;
}

export type WellKnownVisualFactKey =
  | 'hair'
  | 'outfit'
  | 'age'
  | 'style'
  | 'expression'
  | 'body'
  | 'accessory'
  | 'skin_tone'
  | 'eye_color'
  | 'height'
  | 'scar';

export type VisualFactKey = WellKnownVisualFactKey | (string & {});

export interface VisualFactSuggestion {
  readonly key: VisualFactKey;
  readonly value: string;
  readonly confidence?: number;
  readonly accepted?: boolean;
}

export type VisualIdentityDraftSource = 'story' | 'canvas' | 'agent';

export type VisualIdentityDraftStatus = 'drafting' | 'selected' | 'applied' | 'discarded';

export interface VisualIdentityDraft {
  readonly id: string;
  readonly characterId: string;
  readonly source: VisualIdentityDraftSource;
  readonly prompt: string;
  readonly generatedAssetIds: readonly string[];
  readonly selectedAssetId?: string;
  readonly extractedVisualFacts?: readonly VisualFactSuggestion[];
  readonly status: VisualIdentityDraftStatus;
}

export interface VisualIdentityDraftFile {
  readonly version: 1;
  readonly drafts: readonly VisualIdentityDraft[];
}

export type EntityAssetRequirementSource = 'story' | 'canvas' | 'agent';

export type EntityAssetRequirementStatus =
  'missing' | 'suggested' | 'generated' | 'bound' | 'dismissed';

export interface EntityAssetRequirement {
  readonly id: string;
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly source: EntityAssetRequirementSource;
  readonly sourceRef: string;
  readonly requiredKinds: readonly RepresentationKind[];
  readonly status: EntityAssetRequirementStatus;
}

export interface EntityAssetRequirementFile {
  readonly version: 1;
  readonly requirements: readonly EntityAssetRequirement[];
}

export type RepresentationFileRole =
  | 'main'
  | 'model'
  | 'texture'
  | 'rig'
  | 'skeleton'
  | 'physics'
  | 'expression'
  | 'motion'
  | 'material'
  | 'voice'
  | 'lipsync'
  | 'thumbnail'
  | 'calibration'
  | 'tracking-profile'
  | 'source';

export const REPRESENTATION_KINDS: readonly RepresentationKind[] = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
  'video',
] as const;

export const ASSET_REF_SCHEMES: readonly AssetRefScheme[] = [
  'project',
  'shared',
  'external',
] as const;

export const WELL_KNOWN_VISUAL_FACT_KEYS: readonly WellKnownVisualFactKey[] = [
  'hair',
  'outfit',
  'age',
  'style',
  'expression',
  'body',
  'accessory',
  'skin_tone',
  'eye_color',
  'height',
  'scar',
] as const;

export const REPRESENTATION_FILE_ROLES: readonly RepresentationFileRole[] = [
  'main',
  'model',
  'texture',
  'rig',
  'skeleton',
  'physics',
  'expression',
  'motion',
  'material',
  'voice',
  'lipsync',
  'thumbnail',
  'calibration',
  'tracking-profile',
  'source',
] as const;

export const CREATIVE_ENTITY_SOURCE_KINDS: readonly CreativeEntitySourceKind[] = [
  'registry',
  'candidate',
  'story',
  'canvas',
  'asset',
  'agent',
  'document',
  'importer',
  'generated',
] as const;

export const CREATIVE_ENTITY_CANDIDATE_STATUSES: readonly CreativeEntityCandidateStatus[] = [
  'open',
  'confirmed',
  'rejected',
  'dismissed',
  'merged',
] as const;

export const CREATIVE_ENTITY_CANDIDATE_IDENTITY_BASES: readonly CreativeEntityCandidateIdentityBasis[] =
  ['user-named', 'placeholder', 'visual', 'asset'] as const;

export const CREATIVE_ENTITY_LIFECYCLE_ACTIONS: readonly CreativeEntityLifecycleAction[] = [
  'create',
  'confirm-candidate',
  'reject-candidate',
  'dismiss-candidate',
  'merge-candidate',
  'name-candidate',
  'rename',
  'update-display-name',
  'add-alias',
  'remove-alias',
  'update-metadata',
  'deprecate',
  'reactivate',
  'merge',
  'bind',
  'rebind',
  'unbind',
  'set-default-binding',
  'mark-binding-orphaned',
  'archive-binding',
  'update-requirement',
  'update-visual-draft',
  'apply-sync-suggestion',
  'ignore-sync-suggestion',
] as const;

export function isCreativeEntityStatus(value: unknown): value is CreativeEntityStatus {
  return value === 'candidate' || value === 'confirmed' || value === 'deprecated';
}

export function isCreativeEntitySourceKind(value: unknown): value is CreativeEntitySourceKind {
  return includesString(CREATIVE_ENTITY_SOURCE_KINDS, value);
}

export function isCreativeEntityCandidateStatus(
  value: unknown,
): value is CreativeEntityCandidateStatus {
  return includesString(CREATIVE_ENTITY_CANDIDATE_STATUSES, value);
}

export function isCreativeEntityCandidateIdentityBasis(
  value: unknown,
): value is CreativeEntityCandidateIdentityBasis {
  return includesString(CREATIVE_ENTITY_CANDIDATE_IDENTITY_BASES, value);
}

export function isCreativeEntityLifecycleAction(
  value: unknown,
): value is CreativeEntityLifecycleAction {
  return includesString(CREATIVE_ENTITY_LIFECYCLE_ACTIONS, value);
}

export function isRepresentationKind(value: unknown): value is RepresentationKind {
  return includesString(REPRESENTATION_KINDS, value);
}

export function isAssetRefScheme(value: unknown): value is AssetRefScheme {
  return includesString(ASSET_REF_SCHEMES, value);
}

export function isRepresentationFileRole(value: unknown): value is RepresentationFileRole {
  return includesString(REPRESENTATION_FILE_ROLES, value);
}

export function isCreativeEntity(value: unknown): value is CreativeEntity {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isCreativeEntityKind(value['kind']) &&
    typeof value['canonicalName'] === 'string' &&
    (value['displayName'] === undefined || typeof value['displayName'] === 'string') &&
    Array.isArray(value['aliases']) &&
    value['aliases'].every((alias) => typeof alias === 'string') &&
    isCreativeEntityStatus(value['status']) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

export function isCreativeEntityRef(value: unknown): value is CreativeEntityRef {
  if (!isRecord(value)) return false;
  return (
    typeof value['entityId'] === 'string' &&
    isCreativeEntityKind(value['entityKind']) &&
    (value['projectRoot'] === undefined || typeof value['projectRoot'] === 'string') &&
    (value['source'] === undefined || typeof value['source'] === 'string')
  );
}

export function isCreativeEntitySourceMetadata(
  value: unknown,
): value is CreativeEntitySourceMetadata {
  if (!isRecord(value)) return false;
  return (
    typeof value['sourceId'] === 'string' &&
    isCreativeEntitySourceKind(value['sourceKind']) &&
    (value['sourceRef'] === undefined || typeof value['sourceRef'] === 'string') &&
    (value['providerId'] === undefined || typeof value['providerId'] === 'string') &&
    (value['freshness'] === undefined || isProjectIndexFreshnessValue(value['freshness'])) &&
    (value['updatedAt'] === undefined || typeof value['updatedAt'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

export function isCreativeEntityCandidateProvenance(
  value: unknown,
): value is CreativeEntityCandidateProvenance {
  if (!isRecord(value)) return false;
  return (
    typeof value['providerId'] === 'string' &&
    isCreativeEntitySourceKind(value['sourceKind']) &&
    (value['sourceRef'] === undefined || typeof value['sourceRef'] === 'string') &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    (value['confidence'] === undefined || isConfidence(value['confidence'])) &&
    (value['observedAt'] === undefined || typeof value['observedAt'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

export function isCreativeEntityCandidate(value: unknown): value is CreativeEntityCandidate {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isCreativeEntityKind(value['kind']) &&
    typeof value['name'] === 'string' &&
    isCreativeEntityCandidateStatus(value['status']) &&
    (value['identityBasis'] === undefined ||
      isCreativeEntityCandidateIdentityBasis(value['identityBasis'])) &&
    (value['confidence'] === undefined || isConfidence(value['confidence'])) &&
    (value['aliases'] === undefined ||
      (Array.isArray(value['aliases']) &&
        value['aliases'].every((alias) => typeof alias === 'string'))) &&
    Array.isArray(value['provenance']) &&
    value['provenance'].every((item) => isCreativeEntityCandidateProvenance(item)) &&
    Array.isArray(value['sourceRefs']) &&
    value['sourceRefs'].every((item) => typeof item === 'string') &&
    (value['suggestedRequirements'] === undefined ||
      (Array.isArray(value['suggestedRequirements']) &&
        value['suggestedRequirements'].every((item) => isEntityAssetRequirement(item)))) &&
    (value['resolvedEntityRef'] === undefined || isCreativeEntityRef(value['resolvedEntityRef'])) &&
    (value['createdAt'] === undefined || typeof value['createdAt'] === 'string') &&
    (value['updatedAt'] === undefined || typeof value['updatedAt'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

export function isCreativeEntityCandidateFile(
  value: unknown,
): value is CreativeEntityCandidateFile {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    Array.isArray(value['candidates']) &&
    value['candidates'].every((candidate) => isCreativeEntityCandidate(candidate))
  );
}

export function isProjectCreativeEntityFile(value: unknown): value is ProjectCreativeEntityFile {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    isCreativeEntityKind(value['kind']) &&
    value['kind'] !== 'character' &&
    Array.isArray(value['entities']) &&
    value['entities'].every((entity) => isCreativeEntity(entity) && entity.kind === value['kind'])
  );
}

export function isCreativeEntityChangedRef(value: unknown): value is CreativeEntityChangedRef {
  if (!isRecord(value)) return false;
  return (
    isCreativeEntityChangedRefKind(value['kind']) &&
    typeof value['id'] === 'string' &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['factRef'] === undefined || typeof value['factRef'] === 'string')
  );
}

export function isCreativeEntityChangeEvent(value: unknown): value is CreativeEntityChangeEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value['projectRoot'] === 'string' &&
    isCreativeEntityChangeReason(value['reason']) &&
    Array.isArray(value['changedRefs']) &&
    value['changedRefs'].every((ref) => isCreativeEntityChangedRef(ref)) &&
    typeof value['generation'] === 'number' &&
    isProjectIndexFreshnessValue(value['freshness']) &&
    typeof value['updatedAt'] === 'string' &&
    (value['source'] === undefined || isCreativeEntitySourceMetadata(value['source']))
  );
}

export function isCreativeEntityOperationResult(
  value: unknown,
): value is CreativeEntityOperationResult {
  if (!isRecord(value)) return false;
  return (
    typeof value['ok'] === 'boolean' &&
    isCreativeEntityLifecycleAction(value['action']) &&
    typeof value['projectRoot'] === 'string' &&
    Array.isArray(value['affectedEntityRefs']) &&
    value['affectedEntityRefs'].every((ref) => isCreativeEntityRef(ref)) &&
    Array.isArray(value['changedRefs']) &&
    value['changedRefs'].every((ref) => isCreativeEntityChangedRef(ref)) &&
    typeof value['generation'] === 'number' &&
    isProjectIndexFreshnessValue(value['freshness']) &&
    typeof value['updatedAt'] === 'string' &&
    (value['message'] === undefined || typeof value['message'] === 'string')
  );
}

export function isCreativeEntityProviderStatus(
  value: unknown,
): value is CreativeEntityProviderStatus {
  if (!isRecord(value)) return false;
  return (
    typeof value['providerId'] === 'string' &&
    isCreativeEntitySourceKind(value['sourceKind']) &&
    typeof value['available'] === 'boolean' &&
    isProjectIndexFreshnessValue(value['freshness']) &&
    (value['updatedAt'] === undefined || typeof value['updatedAt'] === 'string') &&
    (value['error'] === undefined || typeof value['error'] === 'string')
  );
}

export function withCreativeEntityCandidateDefaults(
  candidate: CreativeEntityCandidate,
): CreativeEntityCandidate {
  return {
    ...candidate,
    identityBasis: candidate.identityBasis ?? 'user-named',
  };
}

export function withCreativeEntityCandidateFileDefaults(
  file: CreativeEntityCandidateFile,
): CreativeEntityCandidateFile {
  return {
    version: 1,
    candidates: file.candidates.map((candidate) => withCreativeEntityCandidateDefaults(candidate)),
  };
}

export function isVisualIdentityDraftFile(value: unknown): value is VisualIdentityDraftFile {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    Array.isArray(value['drafts']) &&
    value['drafts'].every((draft) => isVisualIdentityDraft(draft))
  );
}

export function isEntityAssetRequirementFile(value: unknown): value is EntityAssetRequirementFile {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    Array.isArray(value['requirements']) &&
    value['requirements'].every((requirement) => isEntityAssetRequirement(requirement))
  );
}

export function isVisualIdentityDraft(value: unknown): value is VisualIdentityDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['characterId'] === 'string' &&
    isVisualIdentityDraftSource(value['source']) &&
    typeof value['prompt'] === 'string' &&
    Array.isArray(value['generatedAssetIds']) &&
    value['generatedAssetIds'].every((item) => typeof item === 'string') &&
    isVisualIdentityDraftStatus(value['status'])
  );
}

function isEntityAssetRequirement(value: unknown): value is EntityAssetRequirement {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['entityId'] === 'string' &&
    isCreativeEntityKind(value['entityKind']) &&
    isEntityAssetRequirementSource(value['source']) &&
    typeof value['sourceRef'] === 'string' &&
    Array.isArray(value['requiredKinds']) &&
    value['requiredKinds'].every((kind) => isRepresentationKind(kind)) &&
    isEntityAssetRequirementStatus(value['status'])
  );
}

function isVisualIdentityDraftSource(value: unknown): value is VisualIdentityDraftSource {
  return value === 'story' || value === 'canvas' || value === 'agent';
}

function isVisualIdentityDraftStatus(value: unknown): value is VisualIdentityDraftStatus {
  return (
    value === 'drafting' || value === 'selected' || value === 'applied' || value === 'discarded'
  );
}

function isEntityAssetRequirementSource(value: unknown): value is EntityAssetRequirementSource {
  return value === 'story' || value === 'canvas' || value === 'agent';
}

function isEntityAssetRequirementStatus(value: unknown): value is EntityAssetRequirementStatus {
  return (
    value === 'missing' ||
    value === 'suggested' ||
    value === 'generated' ||
    value === 'bound' ||
    value === 'dismissed'
  );
}

function isCreativeEntityChangedRefKind(value: unknown): value is CreativeEntityChangedRef['kind'] {
  return (
    value === 'entity' ||
    value === 'candidate' ||
    value === 'binding' ||
    value === 'requirement' ||
    value === 'visual-draft' ||
    value === 'provider' ||
    value === 'store'
  );
}

function isCreativeEntityChangeReason(
  value: unknown,
): value is CreativeEntityChangeEvent['reason'] {
  return (
    isCreativeEntityLifecycleAction(value) ||
    value === 'provider-refresh' ||
    value === 'store-refresh'
  );
}

function isProjectIndexFreshnessValue(value: unknown): value is ProjectIndexFreshness {
  return (
    value === 'fresh' ||
    value === 'stale' ||
    value === 'building' ||
    value === 'partial' ||
    value === 'failed'
  );
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
