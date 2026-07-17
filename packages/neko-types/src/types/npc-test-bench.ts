import type { EntityAssetBindingRole } from './creative-entity-asset-composition';
import {
  isCreativeEntityRef,
  isEntityAssetBindingRole,
  type CreativeEntityRef,
} from './creative-entity-asset-composition';
import {
  isDashboardCharacterRoleWorkflowAction,
  isDashboardCharacterRoleWorkflowScopeRef,
  isDashboardCreativeEntityRef,
  type DashboardCharacterRoleWorkflowAction,
  type DashboardCharacterRoleWorkflowScopeRef,
  type DashboardCreativeEntityRef,
} from './dashboard-creative-entity';

export const NPC_TEST_BENCH_AS_SLASH_COMMAND_NAME = 'as';
export const NPC_TEST_BENCH_AS_SLASH_COMMAND = '/as';
export const NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND_NAME = 'exit-as';
export const NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND = '/exit-as';
export const NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND = 'neko.agent.characterDialogue';
export const NEKO_AGENT_EMBODY_CHARACTER_COMMAND = 'neko.agent.embodyCharacter';
export const NPC_TRANSCRIPT_ARTIFACT_VERSION = 1;
export const CHARACTER_ROLE_TEST_ARTIFACT_DIR = '.neko/character-tests';

export type NpcTestMode = 'roleplay' | 'consult';
export type NpcProfileSparsity = 'thin' | 'partial' | 'rich';
export type NpcProfileFactAuthority = 'confirmed' | 'suggested';
export type NpcProfileFactSource =
  | 'registry'
  | 'asset-metadata'
  | 'visual-draft'
  | 'relationship-graph'
  | 'occurrence-index'
  | 'script-extraction'
  | 'agent-inferred'
  | 'user-supplement';
export type NpcProfileEnrichmentMode = 'ask' | 'skip' | 'auto' | 'manual';
export type NpcTestBenchLaunchSource = 'slash-command' | 'dashboard' | 'story' | 'canvas' | 'asset';
export type NpcAgentWorkflowLaunchSource = 'dashboard' | 'agent' | 'story' | 'canvas' | 'asset';

export type NpcTranscriptMessageRole = 'user' | 'npc' | 'system' | 'evaluator';
export type NpcEvaluationDimension =
  | 'persona-consistency'
  | 'dialogue-voice-fit'
  | 'knowledge-boundary'
  | 'relationship-coverage'
  | 'profile-improvement';
export type NpcEvaluationSeverity = 'info' | 'warning' | 'error';
export type NpcEvaluationSuggestionKind =
  | 'entity-metadata'
  | 'relationship'
  | 'profile-fact'
  | 'knowledge-boundary'
  | 'dialogue-sample';
export type NpcEvaluationSuggestionStatus = 'suggested' | 'accepted' | 'rejected' | 'applied';

export type NpcSerializableValue =
  | string
  | number
  | boolean
  | null
  | readonly NpcSerializableValue[]
  | { readonly [key: string]: NpcSerializableValue };

export interface NpcProfileFact<TValue = NpcSerializableValue> {
  readonly key: string;
  readonly value: TValue;
  readonly source: NpcProfileFactSource;
  readonly authority: NpcProfileFactAuthority;
  readonly confidence?: number;
  readonly label?: string;
  readonly sourceRef?: string;
  readonly providerId?: string;
  readonly observedAt?: string;
  readonly metadata?: Readonly<Record<string, NpcSerializableValue>>;
}

export interface NpcProfileRelationshipValue {
  readonly name: string;
  readonly relation: string;
  readonly entityRef?: CreativeEntityRef;
  readonly summary?: string;
}

export interface NpcProfileRepresentationBinding {
  readonly role: EntityAssetBindingRole;
  readonly assetRef: string;
  readonly isDefault?: boolean;
  readonly sourceRef?: string;
  readonly summary?: string;
}

export interface NpcProfileSparsityScore {
  readonly level: NpcProfileSparsity;
  readonly score: number;
  readonly confirmedFactCount: number;
  readonly suggestedFactCount: number;
  readonly relationshipCount: number;
  readonly dialogueSampleCount: number;
  readonly missingFactKeys?: readonly string[];
}

export interface NpcProfileSource {
  readonly entityRef: CreativeEntityRef;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly facts: readonly NpcProfileFact[];
  readonly sparsity: NpcProfileSparsity;
  readonly sparsityScore?: NpcProfileSparsityScore;
  readonly dialogueSamples?: readonly string[];
  readonly sceneAppearances?: readonly string[];
  readonly relationships?: readonly NpcProfileFact<NpcProfileRelationshipValue>[];
  readonly representationBindings?: readonly NpcProfileRepresentationBinding[];
  readonly userSupplements?: string;
}

export interface NpcTestBenchLaunchRequest {
  readonly entityRef: CreativeEntityRef;
  readonly dashboardRef?: DashboardCreativeEntityRef;
  readonly mode?: NpcTestMode;
  readonly enrichment?: NpcProfileEnrichmentMode;
  readonly source?: NpcTestBenchLaunchSource;
  readonly projectRoot?: string;
  readonly initialUserMessage?: string;
  readonly userSupplements?: string;
}

export interface NpcAgentWorkflowRequest {
  readonly workflow: DashboardCharacterRoleWorkflowAction;
  readonly entityRef: CreativeEntityRef;
  readonly dashboardRef?: DashboardCreativeEntityRef;
  readonly scopes?: readonly DashboardCharacterRoleWorkflowScopeRef[];
  readonly prompt?: string;
  readonly source?: NpcAgentWorkflowLaunchSource;
  readonly projectRoot?: string;
}

export interface NpcTranscriptMessage {
  readonly id: string;
  readonly role: NpcTranscriptMessageRole;
  readonly content: string;
  readonly createdAt: string;
  readonly turnIndex?: number;
  readonly speakerName?: string;
  readonly metadata?: Readonly<Record<string, NpcSerializableValue>>;
}

export interface NpcEvaluationScore {
  readonly dimension: NpcEvaluationDimension;
  readonly score: number;
  readonly summary?: string;
}

export interface NpcEvaluationFinding {
  readonly id: string;
  readonly dimension: NpcEvaluationDimension;
  readonly severity: NpcEvaluationSeverity;
  readonly message: string;
  readonly transcriptMessageIds?: readonly string[];
  readonly factKeys?: readonly string[];
}

export type NpcEvaluationSuggestionApplyTarget =
  | {
      readonly kind: 'entity-metadata';
      readonly entityRef: CreativeEntityRef;
      readonly metadataKey: string;
    }
  | {
      readonly kind: 'relationship';
      readonly from: CreativeEntityRef;
      readonly to: CreativeEntityRef;
      readonly relationshipType: string;
    }
  | {
      readonly kind: 'profile-fact';
      readonly entityRef: CreativeEntityRef;
      readonly factKey: string;
    };

export interface NpcEvaluationSuggestion {
  readonly id: string;
  readonly kind: NpcEvaluationSuggestionKind;
  readonly status: NpcEvaluationSuggestionStatus;
  readonly title: string;
  readonly rationale: string;
  readonly proposedValue: NpcSerializableValue;
  readonly applyTarget: NpcEvaluationSuggestionApplyTarget;
  readonly authority: 'suggested';
  readonly requiresUserConfirmation: true;
  readonly confidence?: number;
  readonly sourceFindingIds?: readonly string[];
  readonly transcriptMessageIds?: readonly string[];
}

export interface NpcEvaluationReport {
  readonly version: typeof NPC_TRANSCRIPT_ARTIFACT_VERSION;
  readonly createdAt: string;
  readonly entityRef: CreativeEntityRef;
  readonly summary: string;
  readonly scores: readonly NpcEvaluationScore[];
  readonly findings: readonly NpcEvaluationFinding[];
  readonly suggestions: readonly NpcEvaluationSuggestion[];
  readonly evaluatorModelId?: string;
}

export interface NpcTranscriptArtifact {
  readonly version: typeof NPC_TRANSCRIPT_ARTIFACT_VERSION;
  readonly createdAt: string;
  readonly entityRef: CreativeEntityRef;
  readonly mode: NpcTestMode;
  readonly profileSnapshot: NpcProfileSource;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly evaluation?: NpcEvaluationReport;
  readonly profileHash?: string;
  readonly sessionId?: string;
}

export const NPC_TEST_MODES: readonly NpcTestMode[] = ['roleplay', 'consult'] as const;
export const NPC_PROFILE_SPARSITY_LEVELS: readonly NpcProfileSparsity[] = [
  'thin',
  'partial',
  'rich',
] as const;
export const NPC_PROFILE_FACT_AUTHORITIES: readonly NpcProfileFactAuthority[] = [
  'confirmed',
  'suggested',
] as const;
export const NPC_PROFILE_FACT_SOURCES: readonly NpcProfileFactSource[] = [
  'registry',
  'asset-metadata',
  'visual-draft',
  'relationship-graph',
  'occurrence-index',
  'script-extraction',
  'agent-inferred',
  'user-supplement',
] as const;
export const NPC_PROFILE_ENRICHMENT_MODES: readonly NpcProfileEnrichmentMode[] = [
  'ask',
  'skip',
  'auto',
  'manual',
] as const;
export const NPC_TEST_BENCH_LAUNCH_SOURCES: readonly NpcTestBenchLaunchSource[] = [
  'slash-command',
  'dashboard',
  'story',
  'canvas',
  'asset',
] as const;
export const NPC_AGENT_WORKFLOW_LAUNCH_SOURCES: readonly NpcAgentWorkflowLaunchSource[] = [
  'dashboard',
  'agent',
  'story',
  'canvas',
  'asset',
] as const;
export const NPC_TRANSCRIPT_MESSAGE_ROLES: readonly NpcTranscriptMessageRole[] = [
  'user',
  'npc',
  'system',
  'evaluator',
] as const;
export const NPC_EVALUATION_DIMENSIONS: readonly NpcEvaluationDimension[] = [
  'persona-consistency',
  'dialogue-voice-fit',
  'knowledge-boundary',
  'relationship-coverage',
  'profile-improvement',
] as const;
export const NPC_EVALUATION_SEVERITIES: readonly NpcEvaluationSeverity[] = [
  'info',
  'warning',
  'error',
] as const;
export const NPC_EVALUATION_SUGGESTION_KINDS: readonly NpcEvaluationSuggestionKind[] = [
  'entity-metadata',
  'relationship',
  'profile-fact',
  'knowledge-boundary',
  'dialogue-sample',
] as const;
export const NPC_EVALUATION_SUGGESTION_STATUSES: readonly NpcEvaluationSuggestionStatus[] = [
  'suggested',
  'accepted',
  'rejected',
  'applied',
] as const;

export function isNpcTestMode(value: unknown): value is NpcTestMode {
  return includesString(NPC_TEST_MODES, value);
}

export function isNpcProfileSparsity(value: unknown): value is NpcProfileSparsity {
  return includesString(NPC_PROFILE_SPARSITY_LEVELS, value);
}

export function isNpcProfileFactSource(value: unknown): value is NpcProfileFactSource {
  return includesString(NPC_PROFILE_FACT_SOURCES, value);
}

export function isNpcProfileFactAuthority(value: unknown): value is NpcProfileFactAuthority {
  return includesString(NPC_PROFILE_FACT_AUTHORITIES, value);
}

export function isNpcProfileEnrichmentMode(value: unknown): value is NpcProfileEnrichmentMode {
  return includesString(NPC_PROFILE_ENRICHMENT_MODES, value);
}

export function isNpcTestBenchLaunchSource(value: unknown): value is NpcTestBenchLaunchSource {
  return includesString(NPC_TEST_BENCH_LAUNCH_SOURCES, value);
}

export function isNpcAgentWorkflowLaunchSource(
  value: unknown,
): value is NpcAgentWorkflowLaunchSource {
  return includesString(NPC_AGENT_WORKFLOW_LAUNCH_SOURCES, value);
}

export function isNpcSerializableValue(value: unknown): value is NpcSerializableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isNpcSerializableValue);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(isNpcSerializableValue);
}

export function isNpcProfileFact(value: unknown): value is NpcProfileFact {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['key']) &&
    isNpcSerializableValue(value['value']) &&
    isNpcProfileFactSource(value['source']) &&
    isNpcProfileFactAuthority(value['authority']) &&
    isOptionalConfidence(value['confidence']) &&
    (value['label'] === undefined || typeof value['label'] === 'string') &&
    (value['sourceRef'] === undefined || typeof value['sourceRef'] === 'string') &&
    (value['providerId'] === undefined || typeof value['providerId'] === 'string') &&
    (value['observedAt'] === undefined || typeof value['observedAt'] === 'string') &&
    (value['metadata'] === undefined || isNpcSerializableRecord(value['metadata']))
  );
}

export function isNpcProfileRelationshipValue(
  value: unknown,
): value is NpcProfileRelationshipValue {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['name']) &&
    isNonEmptyString(value['relation']) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['summary'] === undefined || typeof value['summary'] === 'string')
  );
}

export function isNpcProfileRelationshipFact(
  value: unknown,
): value is NpcProfileFact<NpcProfileRelationshipValue> {
  return isNpcProfileFact(value) && isNpcProfileRelationshipValue(value.value);
}

export function isNpcProfileRepresentationBinding(
  value: unknown,
): value is NpcProfileRepresentationBinding {
  if (!isRecord(value)) return false;
  return (
    isEntityAssetBindingRole(value['role']) &&
    isNonEmptyString(value['assetRef']) &&
    (value['isDefault'] === undefined || typeof value['isDefault'] === 'boolean') &&
    (value['sourceRef'] === undefined || typeof value['sourceRef'] === 'string') &&
    (value['summary'] === undefined || typeof value['summary'] === 'string')
  );
}

export function isNpcProfileSparsityScore(value: unknown): value is NpcProfileSparsityScore {
  if (!isRecord(value)) return false;
  return (
    isNpcProfileSparsity(value['level']) &&
    isUnitScore(value['score']) &&
    isNonNegativeInteger(value['confirmedFactCount']) &&
    isNonNegativeInteger(value['suggestedFactCount']) &&
    isNonNegativeInteger(value['relationshipCount']) &&
    isNonNegativeInteger(value['dialogueSampleCount']) &&
    (value['missingFactKeys'] === undefined || isStringArray(value['missingFactKeys']))
  );
}

export function isNpcProfileSource(value: unknown): value is NpcProfileSource {
  if (!isRecord(value)) return false;
  return (
    isCreativeEntityRef(value['entityRef']) &&
    isNonEmptyString(value['displayName']) &&
    Array.isArray(value['aliases']) &&
    value['aliases'].every((alias) => typeof alias === 'string') &&
    Array.isArray(value['facts']) &&
    value['facts'].every(isNpcProfileFact) &&
    isNpcProfileSparsity(value['sparsity']) &&
    (value['sparsityScore'] === undefined || isNpcProfileSparsityScore(value['sparsityScore'])) &&
    (value['dialogueSamples'] === undefined || isStringArray(value['dialogueSamples'])) &&
    (value['sceneAppearances'] === undefined || isStringArray(value['sceneAppearances'])) &&
    (value['relationships'] === undefined ||
      (Array.isArray(value['relationships']) &&
        value['relationships'].every(isNpcProfileRelationshipFact))) &&
    (value['representationBindings'] === undefined ||
      (Array.isArray(value['representationBindings']) &&
        value['representationBindings'].every(isNpcProfileRepresentationBinding))) &&
    (value['userSupplements'] === undefined || typeof value['userSupplements'] === 'string')
  );
}

export function isNpcTestBenchLaunchRequest(value: unknown): value is NpcTestBenchLaunchRequest {
  if (!isRecord(value)) return false;
  return (
    isCreativeEntityRef(value['entityRef']) &&
    (value['dashboardRef'] === undefined || isDashboardCreativeEntityRef(value['dashboardRef'])) &&
    (value['mode'] === undefined || isNpcTestMode(value['mode'])) &&
    (value['enrichment'] === undefined || isNpcProfileEnrichmentMode(value['enrichment'])) &&
    (value['source'] === undefined || isNpcTestBenchLaunchSource(value['source'])) &&
    (value['projectRoot'] === undefined || isNonEmptyString(value['projectRoot'])) &&
    (value['initialUserMessage'] === undefined ||
      typeof value['initialUserMessage'] === 'string') &&
    (value['userSupplements'] === undefined || typeof value['userSupplements'] === 'string')
  );
}

export function isNpcAgentWorkflowRequest(value: unknown): value is NpcAgentWorkflowRequest {
  if (!isRecord(value)) return false;
  return (
    isDashboardCharacterRoleWorkflowAction(value['workflow']) &&
    isCreativeEntityRef(value['entityRef']) &&
    (value['dashboardRef'] === undefined || isDashboardCreativeEntityRef(value['dashboardRef'])) &&
    (value['scopes'] === undefined ||
      (Array.isArray(value['scopes']) &&
        value['scopes'].every(isDashboardCharacterRoleWorkflowScopeRef))) &&
    (value['prompt'] === undefined || typeof value['prompt'] === 'string') &&
    (value['source'] === undefined || isNpcAgentWorkflowLaunchSource(value['source'])) &&
    (value['projectRoot'] === undefined || isNonEmptyString(value['projectRoot']))
  );
}

export function isNpcTranscriptMessage(value: unknown): value is NpcTranscriptMessage {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    includesString(NPC_TRANSCRIPT_MESSAGE_ROLES, value['role']) &&
    typeof value['content'] === 'string' &&
    isNonEmptyString(value['createdAt']) &&
    (value['turnIndex'] === undefined || isNonNegativeInteger(value['turnIndex'])) &&
    (value['speakerName'] === undefined || typeof value['speakerName'] === 'string') &&
    (value['metadata'] === undefined || isNpcSerializableRecord(value['metadata']))
  );
}

export function isNpcEvaluationScore(value: unknown): value is NpcEvaluationScore {
  if (!isRecord(value)) return false;
  return (
    includesString(NPC_EVALUATION_DIMENSIONS, value['dimension']) &&
    isUnitScore(value['score']) &&
    (value['summary'] === undefined || typeof value['summary'] === 'string')
  );
}

export function isNpcEvaluationFinding(value: unknown): value is NpcEvaluationFinding {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    includesString(NPC_EVALUATION_DIMENSIONS, value['dimension']) &&
    includesString(NPC_EVALUATION_SEVERITIES, value['severity']) &&
    isNonEmptyString(value['message']) &&
    (value['transcriptMessageIds'] === undefined || isStringArray(value['transcriptMessageIds'])) &&
    (value['factKeys'] === undefined || isStringArray(value['factKeys']))
  );
}

export function isNpcEvaluationSuggestion(value: unknown): value is NpcEvaluationSuggestion {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    includesString(NPC_EVALUATION_SUGGESTION_KINDS, value['kind']) &&
    includesString(NPC_EVALUATION_SUGGESTION_STATUSES, value['status']) &&
    isNonEmptyString(value['title']) &&
    isNonEmptyString(value['rationale']) &&
    isNpcSerializableValue(value['proposedValue']) &&
    isNpcEvaluationSuggestionApplyTarget(value['applyTarget']) &&
    value['authority'] === 'suggested' &&
    value['requiresUserConfirmation'] === true &&
    isOptionalConfidence(value['confidence']) &&
    (value['sourceFindingIds'] === undefined || isStringArray(value['sourceFindingIds'])) &&
    (value['transcriptMessageIds'] === undefined || isStringArray(value['transcriptMessageIds']))
  );
}

export function isNpcEvaluationReport(value: unknown): value is NpcEvaluationReport {
  if (!isRecord(value)) return false;
  return (
    value['version'] === NPC_TRANSCRIPT_ARTIFACT_VERSION &&
    isNonEmptyString(value['createdAt']) &&
    isCreativeEntityRef(value['entityRef']) &&
    isNonEmptyString(value['summary']) &&
    Array.isArray(value['scores']) &&
    value['scores'].every(isNpcEvaluationScore) &&
    Array.isArray(value['findings']) &&
    value['findings'].every(isNpcEvaluationFinding) &&
    Array.isArray(value['suggestions']) &&
    value['suggestions'].every(isNpcEvaluationSuggestion) &&
    (value['evaluatorModelId'] === undefined || typeof value['evaluatorModelId'] === 'string')
  );
}

export function isNpcTranscriptArtifact(value: unknown): value is NpcTranscriptArtifact {
  if (!isRecord(value)) return false;
  return (
    value['version'] === NPC_TRANSCRIPT_ARTIFACT_VERSION &&
    isNonEmptyString(value['createdAt']) &&
    isCreativeEntityRef(value['entityRef']) &&
    isNpcTestMode(value['mode']) &&
    isNpcProfileSource(value['profileSnapshot']) &&
    isSameEntityRef(value['entityRef'], value['profileSnapshot'].entityRef) &&
    Array.isArray(value['transcript']) &&
    value['transcript'].every(isNpcTranscriptMessage) &&
    (value['evaluation'] === undefined || isNpcEvaluationReport(value['evaluation'])) &&
    (value['profileHash'] === undefined || isNonEmptyString(value['profileHash'])) &&
    (value['sessionId'] === undefined || isNonEmptyString(value['sessionId']))
  );
}

function isNpcEvaluationSuggestionApplyTarget(
  value: unknown,
): value is NpcEvaluationSuggestionApplyTarget {
  if (!isRecord(value)) return false;
  if (value['kind'] === 'entity-metadata') {
    return isCreativeEntityRef(value['entityRef']) && isNonEmptyString(value['metadataKey']);
  }
  if (value['kind'] === 'relationship') {
    return (
      isCreativeEntityRef(value['from']) &&
      isCreativeEntityRef(value['to']) &&
      isNonEmptyString(value['relationshipType'])
    );
  }
  if (value['kind'] === 'profile-fact') {
    return isCreativeEntityRef(value['entityRef']) && isNonEmptyString(value['factKey']);
  }
  return false;
}

function isSameEntityRef(left: unknown, right: unknown): boolean {
  return (
    isCreativeEntityRef(left) &&
    isCreativeEntityRef(right) &&
    left.entityId === right.entityId &&
    left.entityKind === right.entityKind
  );
}

function isNpcSerializableRecord(
  value: unknown,
): value is Readonly<Record<string, NpcSerializableValue>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isNpcSerializableValue);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isUnitScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isOptionalConfidence(value: unknown): boolean {
  return value === undefined || isUnitScore(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
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
