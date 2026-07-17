import {
  isCacheOrRuntimeOnlyContentRef,
  isContentSourceRef,
  type ContentSourceRef,
} from './content-access';
import {
  isResourceRef,
  isResourceVariantRef,
  type ResourceRef,
  type ResourceVariantRef,
} from './resource-cache';

export const CREATIVE_AI_INVOCATION_SCHEMA_VERSION = 1 as const;

export type CreativeAiInvocationSchemaVersion = typeof CREATIVE_AI_INVOCATION_SCHEMA_VERSION;

export const CREATIVE_AI_INVOCATION_DOMAINS = [
  'agent-internal',
  'external-creative-package',
] as const;

export type CreativeAiInvocationDomain = (typeof CREATIVE_AI_INVOCATION_DOMAINS)[number];

export const CREATIVE_AI_INVOCATION_MODES = [
  'generate',
  'optimize',
  'edit',
  'retry',
  'batch',
] as const;

export type CreativeAiInvocationMode = (typeof CREATIVE_AI_INVOCATION_MODES)[number];

export const CREATIVE_AI_WRITEBACK_KINDS = ['none', 'candidate', 'mutating'] as const;

export type CreativeAiWritebackKind = (typeof CREATIVE_AI_WRITEBACK_KINDS)[number];

export const CREATIVE_AI_BATCH_ATOMICITIES = ['per-target', 'atomic'] as const;

export type CreativeAiBatchAtomicity = (typeof CREATIVE_AI_BATCH_ATOMICITIES)[number];

export const CREATIVE_AI_REF_KINDS = [
  'document',
  'selection',
  'canvas',
  'canvas-node',
  'canvas-field',
  'canvas-connection',
  'canvas-block',
  'sketch-layer',
  'cut-track',
  'cut-clip',
  'story-scene',
  'story-block',
  'asset',
  'generated-asset',
  'candidate-target',
  'batch',
  'custom',
] as const;

export type CreativeAiRefKind = (typeof CREATIVE_AI_REF_KINDS)[number] | (string & {});

export const CREATIVE_AI_ROUTING_REASONS = [
  'recent-associated-conversation',
  'created-new-background-conversation',
  'selected-agent-conversation',
  'user-selected-conversation',
] as const;

export type CreativeAiRoutingReason = (typeof CREATIVE_AI_ROUTING_REASONS)[number];

export const CREATIVE_AI_LIFECYCLE_ACTIONS = [
  'archive',
  'restore',
  'delete',
  'stop-and-archive',
  'stop-and-delete',
] as const;

export type ConversationLifecycleAction = (typeof CREATIVE_AI_LIFECYCLE_ACTIONS)[number];

export const CREATIVE_AI_CONVERSATION_STATES = [
  'active',
  'archived',
  'deleted',
  'unavailable',
] as const;

export type CreativeAiConversationState = (typeof CREATIVE_AI_CONVERSATION_STATES)[number];

export const CREATIVE_AI_RUN_STATUSES = [
  'accepted',
  'running',
  'completed',
  'cancelled',
  'failed',
  'stale-target',
  'apply-failed',
] as const;

export type CreativeAiRunStatus = (typeof CREATIVE_AI_RUN_STATUSES)[number];

export const CREATIVE_AI_WORK_ITEM_STATUSES = [
  'queued',
  'running',
  'completed',
  'cancelled',
  'failed',
  'stale-target',
  'apply-failed',
  'generated-observation',
] as const;

export type CreativeAiWorkItemStatus = (typeof CREATIVE_AI_WORK_ITEM_STATUSES)[number];

export const CREATIVE_AI_LANE_KINDS = ['image', 'audio', 'video', 'text', 'judge'] as const;

export type CreativeAiLaneKind = (typeof CREATIVE_AI_LANE_KINDS)[number];

export const CREATIVE_AI_PROMOTION_ACTORS = ['user', 'judge'] as const;

export type CreativeAiPromotionActor = (typeof CREATIVE_AI_PROMOTION_ACTORS)[number];

export const CREATIVE_AI_PROMOTION_OUTCOMES = [
  'promoted',
  'stale-target',
  'judge-rejected',
  'candidate-missing',
  'target-missing',
  'idempotent',
  'failed',
] as const;

export type CreativeAiPromotionOutcome = (typeof CREATIVE_AI_PROMOTION_OUTCOMES)[number];

export const CREATIVE_AI_OUTPUT_REF_KINDS = [
  'resource',
  'resource-variant',
  'content',
  'generated-asset',
  'text',
  'structured-data',
] as const;

export type CreativeAiOutputRefKind = (typeof CREATIVE_AI_OUTPUT_REF_KINDS)[number];

export const CREATIVE_AI_DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const;

export type CreativeAiDiagnosticSeverity = (typeof CREATIVE_AI_DIAGNOSTIC_SEVERITIES)[number];

export interface CreativeAiDiagnostic {
  readonly severity: CreativeAiDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly target?: string;
  readonly expected?: unknown;
  readonly received?: unknown;
  readonly retryable?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreativeAiValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly diagnostics: readonly CreativeAiDiagnostic[];
}

export type CreativeAiRevision = string | number;

export interface CreativeAiDocumentRef {
  readonly kind: 'nk-document';
  readonly packageId: string;
  readonly documentId?: string;
  readonly projectRelativePath?: string;
  readonly variablePath?: string;
  readonly format?: string;
  readonly label?: string;
}

export interface CreativeAiRefBase {
  readonly kind: CreativeAiRefKind;
  readonly packageId: string;
  readonly id: string;
  readonly documentRef?: CreativeAiDocumentRef;
  readonly entityId?: string;
  readonly fieldPath?: string;
  readonly resourceRef?: ResourceRef;
  readonly resourceVariantRef?: ResourceVariantRef;
  readonly contentRef?: ContentSourceRef;
  readonly label?: string;
  readonly revision?: CreativeAiRevision;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreativeAiSourceRef extends CreativeAiRefBase {
  readonly role?: 'source' | 'context' | 'selection' | 'batch-source';
  readonly childRefs?: readonly CreativeAiSourceRef[];
}

export interface CreativeAiTargetRef extends CreativeAiRefBase {
  readonly role?: 'target' | 'candidate-target' | 'batch-target';
  readonly candidateOnly?: boolean;
  readonly childRefs?: readonly CreativeAiTargetRef[];
}

export interface CreativeAiWritebackPolicy {
  readonly kind: CreativeAiWritebackKind;
  readonly atomicity?: CreativeAiBatchAtomicity;
  readonly requiresRevisionMatch?: boolean;
}

export interface CreativeAiRoutingHint {
  readonly associationKey?: string;
  readonly requestedConversationId?: string;
  readonly allowCreateBackgroundConversation?: boolean;
  readonly userSelectedConversationId?: string;
}

export interface AgentInternalInvocation {
  readonly schemaVersion: CreativeAiInvocationSchemaVersion;
  readonly domain: 'agent-internal';
  readonly invocationId: string;
  readonly conversationId: string;
  readonly intent: string;
  readonly mode: CreativeAiInvocationMode;
  readonly sourceRef?: CreativeAiSourceRef;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef?: CreativeAiTargetRef;
  readonly writeback?: CreativeAiWritebackPolicy;
  readonly messageId?: string;
  readonly idempotencyKey?: string;
  readonly requestedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExternalCreativeAiInvocation {
  readonly schemaVersion: CreativeAiInvocationSchemaVersion;
  readonly domain: 'external-creative-package';
  readonly invocationId: string;
  readonly sourcePackage: string;
  readonly documentRef?: CreativeAiDocumentRef;
  readonly sourceRef: CreativeAiSourceRef;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef?: CreativeAiTargetRef;
  readonly intent: string;
  readonly mode: CreativeAiInvocationMode;
  readonly writeback: CreativeAiWritebackPolicy;
  readonly documentRevision?: CreativeAiRevision;
  readonly targetRevision?: CreativeAiRevision;
  readonly routing?: CreativeAiRoutingHint;
  readonly idempotencyKey: string;
  readonly requestedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CreativeAiInvocation = AgentInternalInvocation | ExternalCreativeAiInvocation;

export interface CreativeAiRoutingDecision {
  readonly conversationId: string;
  readonly domain: CreativeAiInvocationDomain;
  readonly routingReason: CreativeAiRoutingReason;
  readonly associationKey?: string;
  readonly sourcePackage?: string;
  readonly conversationState?: CreativeAiConversationState;
  readonly diagnostics: readonly CreativeAiDiagnostic[];
}

export interface CreativeAiModelSnapshotRef {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelRevision?: string;
  readonly capabilityId?: string;
  readonly capabilityRevision?: string;
}

export interface CreativeAiWorkItemSnapshot {
  readonly workItemId: string;
  readonly status: CreativeAiWorkItemStatus;
  readonly laneKind?: CreativeAiLaneKind;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef?: CreativeAiTargetRef;
  readonly parentWorkItemId?: string;
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
}

export interface CreativeAiLaneSnapshot {
  readonly laneKind: CreativeAiLaneKind;
  readonly maxActive: number;
  readonly activeCount: number;
  readonly queuedCount: number;
  readonly runningCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly cancelledCount?: number;
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
}

export interface CreativeAiRunAggregateSnapshot {
  readonly runId: string;
  readonly totalCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly runningCount: number;
  readonly queuedCount: number;
  readonly lanes?: readonly CreativeAiLaneSnapshot[];
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
}

export interface CreativeAiRunSnapshot {
  readonly schemaVersion: CreativeAiInvocationSchemaVersion;
  readonly runId: string;
  readonly conversationId: string;
  readonly invocationId: string;
  readonly invocationDomain: CreativeAiInvocationDomain;
  readonly sourcePackage: string;
  readonly associationKey?: string;
  readonly routingReason: CreativeAiRoutingReason;
  readonly sourceRef: CreativeAiSourceRef;
  readonly documentRef?: CreativeAiDocumentRef;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef?: CreativeAiTargetRef;
  readonly intent: string;
  readonly mode: CreativeAiInvocationMode;
  readonly writeback: CreativeAiWritebackPolicy;
  readonly documentRevision?: CreativeAiRevision;
  readonly targetRevision?: CreativeAiRevision;
  readonly modelSnapshot?: CreativeAiModelSnapshotRef;
  readonly idempotencyKey: string;
  readonly status: CreativeAiRunStatus;
  readonly workItems?: readonly CreativeAiWorkItemSnapshot[];
  readonly aggregate?: CreativeAiRunAggregateSnapshot;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
}

export interface ConversationLifecycleCommand {
  readonly schemaVersion: CreativeAiInvocationSchemaVersion;
  readonly commandId: string;
  readonly conversationId: string;
  readonly action: ConversationLifecycleAction;
  readonly expectedState?: CreativeAiConversationState;
  readonly activeRunIds?: readonly string[];
  readonly reason?: string;
  readonly requestedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreativeAiOutputRef {
  readonly kind: CreativeAiOutputRefKind;
  readonly id: string;
  readonly resourceRef?: ResourceRef;
  readonly resourceVariantRef?: ResourceVariantRef;
  readonly contentRef?: ContentSourceRef;
  readonly generatedAssetId?: string;
  readonly mimeType?: string;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreativeAiApplyRequest {
  readonly schemaVersion: CreativeAiInvocationSchemaVersion;
  readonly requestId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly workItemId?: string;
  readonly sourcePackage: string;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef?: CreativeAiTargetRef;
  readonly outputRefs: readonly CreativeAiOutputRef[];
  readonly writeback: CreativeAiWritebackPolicy;
  readonly targetRevision?: CreativeAiRevision;
  readonly idempotencyKey: string;
  readonly requestedAt?: string;
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
}

export interface CreativeAiCandidateApplyRequest extends CreativeAiApplyRequest {
  readonly candidateTargetRef: CreativeAiTargetRef;
  readonly writeback: CreativeAiWritebackPolicy & { readonly kind: 'candidate' };
}

export interface CreativeAiCandidatePromotionRequest {
  readonly schemaVersion: CreativeAiInvocationSchemaVersion;
  readonly requestId: string;
  readonly sourcePackage: string;
  readonly targetRef: CreativeAiTargetRef;
  readonly candidateTargetRef: CreativeAiTargetRef;
  readonly targetRevision: CreativeAiRevision;
  readonly candidateRevision?: CreativeAiRevision;
  readonly runId?: string;
  readonly workItemId?: string;
  readonly conversationId?: string;
  readonly outputRefs?: readonly CreativeAiOutputRef[];
  readonly actor: CreativeAiPromotionActor;
  readonly judgeWorkItemId?: string;
  readonly judgeResultRef?: CreativeAiOutputRef;
  readonly idempotencyKey: string;
  readonly requestedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreativeAiCandidatePromotionResult {
  readonly ok: boolean;
  readonly outcome: CreativeAiPromotionOutcome;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef?: CreativeAiTargetRef;
  readonly appliedOutputRefs?: readonly CreativeAiOutputRef[];
  readonly diagnostics: readonly CreativeAiDiagnostic[];
  readonly idempotencyKey?: string;
}

const RUNTIME_ONLY_IDENTITY_PATTERNS: readonly RegExp[] = [
  /^vscode-webview:\/\//i,
  /^vscode-resource:\/\//i,
  /^vscode-webview-resource:\/\//i,
  /^blob:/i,
  /^object:/i,
  /^data:/i,
  /^file:/i,
  /^provider-runtime:/i,
  /^runtime:/i,
  /^engine-token:/i,
  /^https?:\/\/127\.0\.0\.1(?::|\/)/i,
  /^https?:\/\/localhost(?::|\/)/i,
  /(?:^|\/)\.neko\/\.cache(?:\/|$)/i,
  /(?:^|\\)\.neko\\\.cache(?:\\|$)/i,
  /^\/tmp(?:\/|$)/i,
  /^\/var\/folders(?:\/|$)/i,
  /^\/private\/var\/folders(?:\/|$)/i,
  /(?:^|\\)AppData\\Local\\Temp(?:\\|$)/i,
];

export function isCreativeAiInvocationMode(value: unknown): value is CreativeAiInvocationMode {
  return includesString(CREATIVE_AI_INVOCATION_MODES, value);
}

export function isCreativeAiWritebackKind(value: unknown): value is CreativeAiWritebackKind {
  return includesString(CREATIVE_AI_WRITEBACK_KINDS, value);
}

export function isCreativeAiBatchAtomicity(value: unknown): value is CreativeAiBatchAtomicity {
  return includesString(CREATIVE_AI_BATCH_ATOMICITIES, value);
}

export function isCreativeAiRoutingReason(value: unknown): value is CreativeAiRoutingReason {
  return includesString(CREATIVE_AI_ROUTING_REASONS, value);
}

export function isConversationLifecycleAction(
  value: unknown,
): value is ConversationLifecycleAction {
  return includesString(CREATIVE_AI_LIFECYCLE_ACTIONS, value);
}

export function isCreativeAiConversationState(
  value: unknown,
): value is CreativeAiConversationState {
  return includesString(CREATIVE_AI_CONVERSATION_STATES, value);
}

export function isCreativeAiRunStatus(value: unknown): value is CreativeAiRunStatus {
  return includesString(CREATIVE_AI_RUN_STATUSES, value);
}

export function isCreativeAiWorkItemStatus(value: unknown): value is CreativeAiWorkItemStatus {
  return includesString(CREATIVE_AI_WORK_ITEM_STATUSES, value);
}

export function isCreativeAiLaneKind(value: unknown): value is CreativeAiLaneKind {
  return includesString(CREATIVE_AI_LANE_KINDS, value);
}

export function isCreativeAiPromotionActor(value: unknown): value is CreativeAiPromotionActor {
  return includesString(CREATIVE_AI_PROMOTION_ACTORS, value);
}

export function isCreativeAiPromotionOutcome(value: unknown): value is CreativeAiPromotionOutcome {
  return includesString(CREATIVE_AI_PROMOTION_OUTCOMES, value);
}

export function isCreativeAiOutputRefKind(value: unknown): value is CreativeAiOutputRefKind {
  return includesString(CREATIVE_AI_OUTPUT_REF_KINDS, value);
}

export function isCreativeAiDiagnosticSeverity(
  value: unknown,
): value is CreativeAiDiagnosticSeverity {
  return includesString(CREATIVE_AI_DIAGNOSTIC_SEVERITIES, value);
}

export function isAgentInternalInvocation(value: unknown): value is AgentInternalInvocation {
  return validateAgentInternalInvocation(value).valid;
}

export function isExternalCreativeAiInvocation(
  value: unknown,
): value is ExternalCreativeAiInvocation {
  return validateExternalCreativeAiInvocation(value).valid;
}

export function isCreativeAiInvocation(value: unknown): value is CreativeAiInvocation {
  if (!isRecord(value)) return false;
  if (value['domain'] === 'agent-internal') return isAgentInternalInvocation(value);
  if (value['domain'] === 'external-creative-package') return isExternalCreativeAiInvocation(value);
  return false;
}

export function isCreativeAiSourceRef(value: unknown): value is CreativeAiSourceRef {
  return validateCreativeAiSourceRef(value).valid;
}

export function isCreativeAiTargetRef(value: unknown): value is CreativeAiTargetRef {
  return validateCreativeAiTargetRef(value).valid;
}

export function isCreativeAiRoutingDecision(value: unknown): value is CreativeAiRoutingDecision {
  return validateCreativeAiRoutingDecision(value).valid;
}

export function isCreativeAiRunSnapshot(value: unknown): value is CreativeAiRunSnapshot {
  return validateCreativeAiRunSnapshot(value).valid;
}

export function isConversationLifecycleCommand(
  value: unknown,
): value is ConversationLifecycleCommand {
  return validateConversationLifecycleCommand(value).valid;
}

export function isCreativeAiApplyRequest(value: unknown): value is CreativeAiApplyRequest {
  return validateCreativeAiApplyRequest(value).valid;
}

export function isCreativeAiCandidateApplyRequest(
  value: unknown,
): value is CreativeAiCandidateApplyRequest {
  return validateCreativeAiCandidateApplyRequest(value).valid;
}

export function isCreativeAiCandidatePromotionRequest(
  value: unknown,
): value is CreativeAiCandidatePromotionRequest {
  return validateCreativeAiCandidatePromotionRequest(value).valid;
}

export function isCreativeAiLaneSnapshot(value: unknown): value is CreativeAiLaneSnapshot {
  return validateCreativeAiLaneSnapshot(value).valid;
}

export function isCreativeAiRunAggregateSnapshot(
  value: unknown,
): value is CreativeAiRunAggregateSnapshot {
  return validateCreativeAiRunAggregateSnapshot(value).valid;
}

export function validateAgentInternalInvocation(
  value: unknown,
): CreativeAiValidationResult<AgentInternalInvocation> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidRootResult('creative-ai-invalid-agent-internal-invocation');
  }

  validateSchemaVersion(value['schemaVersion'], diagnostics);
  validateLiteral(
    value['domain'],
    'agent-internal',
    'domain',
    diagnostics,
    'creative-ai-invalid-invocation-domain',
  );
  requireStableString(value['invocationId'], 'invocationId', diagnostics);
  requireStableString(
    value['conversationId'],
    'conversationId',
    diagnostics,
    'creative-ai-missing-conversation-id',
  );
  requireStableString(value['intent'], 'intent', diagnostics);
  validateMode(value['mode'], diagnostics);
  validateOptionalSourceRef(value['sourceRef'], 'sourceRef', diagnostics);
  validateOptionalTargetRef(value['targetRef'], 'targetRef', diagnostics);
  validateOptionalTargetRef(value['candidateTargetRef'], 'candidateTargetRef', diagnostics);
  validateOptionalWriteback(value['writeback'], 'writeback', diagnostics);
  validateOptionalStableString(value['messageId'], 'messageId', diagnostics);
  validateOptionalStableString(value['idempotencyKey'], 'idempotencyKey', diagnostics);
  validateOptionalStableString(value['requestedAt'], 'requestedAt', diagnostics);
  validateOptionalRecord(value['metadata'], 'metadata', diagnostics);
  validateMutatingTargetRequirement(value, diagnostics);

  return validationResult(value, diagnostics);
}

export function validateExternalCreativeAiInvocation(
  value: unknown,
): CreativeAiValidationResult<ExternalCreativeAiInvocation> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidRootResult('creative-ai-invalid-external-invocation');
  }

  validateSchemaVersion(value['schemaVersion'], diagnostics);
  validateLiteral(
    value['domain'],
    'external-creative-package',
    'domain',
    diagnostics,
    'creative-ai-invalid-invocation-domain',
  );
  requireStableString(value['invocationId'], 'invocationId', diagnostics);
  requireStableString(
    value['sourcePackage'],
    'sourcePackage',
    diagnostics,
    'creative-ai-missing-source-package',
  );
  validateOptionalDocumentRef(value['documentRef'], 'documentRef', diagnostics);
  if (value['sourceRef'] === undefined) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-missing-source-ref',
        'External creative AI invocation must include sourceRef.',
        'sourceRef',
      ),
    );
  } else {
    validateNestedDiagnostics(validateCreativeAiSourceRef(value['sourceRef']), diagnostics);
  }
  validateOptionalTargetRef(value['targetRef'], 'targetRef', diagnostics);
  validateOptionalTargetRef(value['candidateTargetRef'], 'candidateTargetRef', diagnostics);
  requireStableString(value['intent'], 'intent', diagnostics);
  validateMode(value['mode'], diagnostics);
  validateWriteback(value['writeback'], 'writeback', diagnostics);
  validateOptionalRevision(value['documentRevision'], 'documentRevision', diagnostics);
  validateOptionalRevision(value['targetRevision'], 'targetRevision', diagnostics);
  validateOptionalRoutingHint(value['routing'], 'routing', diagnostics);
  requireStableString(
    value['idempotencyKey'],
    'idempotencyKey',
    diagnostics,
    'creative-ai-missing-idempotency-key',
  );
  validateOptionalStableString(value['requestedAt'], 'requestedAt', diagnostics);
  validateOptionalRecord(value['metadata'], 'metadata', diagnostics);
  validateAssociationIdentity(value, diagnostics);
  validateMutatingTargetRequirement(value, diagnostics);

  return validationResult(value, diagnostics);
}

export function validateCreativeAiSourceRef(
  value: unknown,
): CreativeAiValidationResult<CreativeAiSourceRef> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  validateCreativeAiRefBase(value, diagnostics, 'sourceRef');
  if (isRecord(value)) {
    validateOptionalChildSourceRefs(value['childRefs'], 'childRefs', diagnostics);
  }
  return validationResult(value, diagnostics);
}

export function validateCreativeAiTargetRef(
  value: unknown,
): CreativeAiValidationResult<CreativeAiTargetRef> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  validateCreativeAiRefBase(value, diagnostics, 'targetRef');
  if (isRecord(value)) {
    validateOptionalChildTargetRefs(value['childRefs'], 'childRefs', diagnostics);
    if (value['candidateOnly'] !== undefined && typeof value['candidateOnly'] !== 'boolean') {
      diagnostics.push(
        diagnostic(
          'error',
          'creative-ai-invalid-boolean',
          'Creative AI target candidateOnly must be boolean.',
          'candidateOnly',
        ),
      );
    }
  }
  return validationResult(value, diagnostics);
}

export function validateCreativeAiRoutingDecision(
  value: unknown,
): CreativeAiValidationResult<CreativeAiRoutingDecision> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidRootResult('creative-ai-invalid-routing-decision');
  }

  requireStableString(
    value['conversationId'],
    'conversationId',
    diagnostics,
    'creative-ai-missing-conversation-id',
  );
  if (!isCreativeAiInvocationDomain(value['domain'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-routing-domain',
        'Creative AI routing decision domain is invalid.',
        'domain',
      ),
    );
  }
  if (!isCreativeAiRoutingReason(value['routingReason'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-routing-reason',
        'Creative AI routing decision reason is invalid.',
        'routingReason',
      ),
    );
  }
  validateOptionalStableString(value['associationKey'], 'associationKey', diagnostics);
  validateOptionalStableString(value['sourcePackage'], 'sourcePackage', diagnostics);
  if (
    value['conversationState'] !== undefined &&
    !isCreativeAiConversationState(value['conversationState'])
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-conversation-state',
        'Creative AI conversation state is invalid.',
        'conversationState',
      ),
    );
  }
  validateDiagnosticsArray(value['diagnostics'], 'diagnostics', diagnostics);

  return validationResult(value, diagnostics);
}

export function validateCreativeAiRunSnapshot(
  value: unknown,
): CreativeAiValidationResult<CreativeAiRunSnapshot> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidRootResult('creative-ai-invalid-run-snapshot');
  }

  validateSchemaVersion(value['schemaVersion'], diagnostics);
  requireStableString(value['runId'], 'runId', diagnostics);
  requireStableString(
    value['conversationId'],
    'conversationId',
    diagnostics,
    'creative-ai-missing-conversation-id',
  );
  requireStableString(value['invocationId'], 'invocationId', diagnostics);
  if (!isCreativeAiInvocationDomain(value['invocationDomain'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-invocation-domain',
        'Creative AI run snapshot invocation domain is invalid.',
        'invocationDomain',
      ),
    );
  }
  requireStableString(
    value['sourcePackage'],
    'sourcePackage',
    diagnostics,
    'creative-ai-missing-source-package',
  );
  validateOptionalStableString(value['associationKey'], 'associationKey', diagnostics);
  if (!isCreativeAiRoutingReason(value['routingReason'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-routing-reason',
        'Creative AI run snapshot routing reason is invalid.',
        'routingReason',
      ),
    );
  }
  if (value['sourceRef'] === undefined) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-missing-source-ref',
        'Creative AI run snapshot must include sourceRef.',
        'sourceRef',
      ),
    );
  } else {
    validateNestedDiagnostics(validateCreativeAiSourceRef(value['sourceRef']), diagnostics);
  }
  validateOptionalDocumentRef(value['documentRef'], 'documentRef', diagnostics);
  validateOptionalTargetRef(value['targetRef'], 'targetRef', diagnostics);
  validateOptionalTargetRef(value['candidateTargetRef'], 'candidateTargetRef', diagnostics);
  requireStableString(value['intent'], 'intent', diagnostics);
  validateMode(value['mode'], diagnostics);
  validateWriteback(value['writeback'], 'writeback', diagnostics);
  validateOptionalRevision(value['documentRevision'], 'documentRevision', diagnostics);
  validateOptionalRevision(value['targetRevision'], 'targetRevision', diagnostics);
  validateOptionalModelSnapshot(value['modelSnapshot'], 'modelSnapshot', diagnostics);
  requireStableString(
    value['idempotencyKey'],
    'idempotencyKey',
    diagnostics,
    'creative-ai-missing-idempotency-key',
  );
  if (!isCreativeAiRunStatus(value['status'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-run-status',
        'Creative AI run snapshot status is invalid.',
        'status',
      ),
    );
  }
  validateOptionalWorkItemSnapshots(value['workItems'], 'workItems', diagnostics);
  validateOptionalRunAggregateSnapshot(value['aggregate'], 'aggregate', diagnostics);
  requireStableString(value['createdAt'], 'createdAt', diagnostics);
  validateOptionalStableString(value['updatedAt'], 'updatedAt', diagnostics);
  validateOptionalDiagnosticsArray(value['diagnostics'], 'diagnostics', diagnostics);
  validateMutatingTargetRequirement(value, diagnostics);

  return validationResult(value, diagnostics);
}

export function validateConversationLifecycleCommand(
  value: unknown,
): CreativeAiValidationResult<ConversationLifecycleCommand> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidRootResult('creative-ai-invalid-lifecycle-command');
  }

  validateSchemaVersion(value['schemaVersion'], diagnostics);
  requireStableString(value['commandId'], 'commandId', diagnostics);
  requireStableString(
    value['conversationId'],
    'conversationId',
    diagnostics,
    'creative-ai-missing-conversation-id',
  );
  if (!isConversationLifecycleAction(value['action'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-lifecycle-action',
        'Conversation lifecycle command action is invalid.',
        'action',
      ),
    );
  }
  if (
    value['expectedState'] !== undefined &&
    !isCreativeAiConversationState(value['expectedState'])
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-conversation-state',
        'Conversation lifecycle command expectedState is invalid.',
        'expectedState',
      ),
    );
  }
  validateOptionalStableStringArray(value['activeRunIds'], 'activeRunIds', diagnostics);
  validateOptionalStableString(value['reason'], 'reason', diagnostics);
  validateOptionalStableString(value['requestedAt'], 'requestedAt', diagnostics);
  validateOptionalRecord(value['metadata'], 'metadata', diagnostics);

  return validationResult(value, diagnostics);
}

export function validateCreativeAiApplyRequest(
  value: unknown,
): CreativeAiValidationResult<CreativeAiApplyRequest> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidRootResult('creative-ai-invalid-apply-request');
  }

  validateSchemaVersion(value['schemaVersion'], diagnostics);
  requireStableString(value['requestId'], 'requestId', diagnostics);
  requireStableString(
    value['conversationId'],
    'conversationId',
    diagnostics,
    'creative-ai-missing-conversation-id',
  );
  requireStableString(value['runId'], 'runId', diagnostics);
  validateOptionalStableString(value['workItemId'], 'workItemId', diagnostics);
  requireStableString(
    value['sourcePackage'],
    'sourcePackage',
    diagnostics,
    'creative-ai-missing-source-package',
  );
  validateOptionalTargetRef(value['targetRef'], 'targetRef', diagnostics);
  validateOptionalTargetRef(value['candidateTargetRef'], 'candidateTargetRef', diagnostics);
  validateOutputRefs(value['outputRefs'], 'outputRefs', diagnostics);
  validateWriteback(value['writeback'], 'writeback', diagnostics);
  validateOptionalRevision(value['targetRevision'], 'targetRevision', diagnostics);
  requireStableString(
    value['idempotencyKey'],
    'idempotencyKey',
    diagnostics,
    'creative-ai-missing-idempotency-key',
  );
  validateOptionalStableString(value['requestedAt'], 'requestedAt', diagnostics);
  validateOptionalDiagnosticsArray(value['diagnostics'], 'diagnostics', diagnostics);
  validateMutatingTargetRequirement(value, diagnostics);

  return validationResult(value, diagnostics);
}

export function validateCreativeAiCandidateApplyRequest(
  value: unknown,
): CreativeAiValidationResult<CreativeAiCandidateApplyRequest> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  const base = validateCreativeAiApplyRequest(value);
  diagnostics.push(...base.diagnostics);
  if (isRecord(value)) {
    if (value['candidateTargetRef'] === undefined) {
      diagnostics.push(
        diagnostic(
          'error',
          'creative-ai-missing-candidate-target-ref',
          'Creative AI candidate apply request must include candidateTargetRef.',
          'candidateTargetRef',
        ),
      );
    }
    const writeback = value['writeback'];
    if (!isRecord(writeback) || writeback['kind'] !== 'candidate') {
      diagnostics.push(
        diagnostic(
          'error',
          'creative-ai-invalid-writeback-kind',
          'Creative AI candidate apply request writeback kind must be candidate.',
          'writeback.kind',
          'candidate',
          isRecord(writeback) ? writeback['kind'] : undefined,
        ),
      );
    }
  }

  return validationResult(value, diagnostics);
}

export function validateCreativeAiCandidatePromotionRequest(
  value: unknown,
): CreativeAiValidationResult<CreativeAiCandidatePromotionRequest> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return invalidRootResult('creative-ai-invalid-candidate-promotion-request');
  }

  validateSchemaVersion(value['schemaVersion'], diagnostics);
  requireStableString(value['requestId'], 'requestId', diagnostics);
  requireStableString(
    value['sourcePackage'],
    'sourcePackage',
    diagnostics,
    'creative-ai-missing-source-package',
  );
  if (value['targetRef'] === undefined) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-missing-target-ref',
        'Creative AI candidate promotion request must include targetRef.',
        'targetRef',
      ),
    );
  } else {
    validateOptionalTargetRef(value['targetRef'], 'targetRef', diagnostics);
  }
  if (value['candidateTargetRef'] === undefined) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-missing-candidate-target-ref',
        'Creative AI candidate promotion request must include candidateTargetRef.',
        'candidateTargetRef',
      ),
    );
  } else {
    validateOptionalTargetRef(value['candidateTargetRef'], 'candidateTargetRef', diagnostics);
  }
  requireRevision(value['targetRevision'], 'targetRevision', diagnostics);
  validateOptionalRevision(value['candidateRevision'], 'candidateRevision', diagnostics);
  validateOptionalStableString(value['runId'], 'runId', diagnostics);
  validateOptionalStableString(value['workItemId'], 'workItemId', diagnostics);
  validateOptionalStableString(value['conversationId'], 'conversationId', diagnostics);
  validateOptionalOutputRefs(value['outputRefs'], 'outputRefs', diagnostics);
  if (!isCreativeAiPromotionActor(value['actor'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-promotion-actor',
        'Creative AI candidate promotion actor is invalid.',
        'actor',
      ),
    );
  }
  validateOptionalStableString(value['judgeWorkItemId'], 'judgeWorkItemId', diagnostics);
  if (value['judgeResultRef'] !== undefined) {
    validateOutputRef(value['judgeResultRef'], 'judgeResultRef', diagnostics);
  }
  requireStableString(
    value['idempotencyKey'],
    'idempotencyKey',
    diagnostics,
    'creative-ai-missing-idempotency-key',
  );
  validateOptionalStableString(value['requestedAt'], 'requestedAt', diagnostics);
  validateOptionalRecord(value['metadata'], 'metadata', diagnostics);

  return validationResult(value, diagnostics);
}

export function validateCreativeAiLaneSnapshot(
  value: unknown,
): CreativeAiValidationResult<CreativeAiLaneSnapshot> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  validateLaneSnapshot(value, 'lane', diagnostics);
  return validationResult(value, diagnostics);
}

export function validateCreativeAiRunAggregateSnapshot(
  value: unknown,
): CreativeAiValidationResult<CreativeAiRunAggregateSnapshot> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  validateRunAggregateSnapshot(value, 'aggregate', diagnostics);
  return validationResult(value, diagnostics);
}

export function createCreativeAiDiagnostic(
  severity: CreativeAiDiagnosticSeverity,
  code: string,
  message: string,
  target?: string,
): CreativeAiDiagnostic {
  return diagnostic(severity, code, message, target);
}

export function isRuntimeOnlyCreativeAiIdentityValue(value: string): boolean {
  const normalized = value.trim();
  return RUNTIME_ONLY_IDENTITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function validateCreativeAiRefBase(
  value: unknown,
  diagnostics: CreativeAiDiagnostic[],
  targetLabel: string,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-ref',
        `Creative AI ${targetLabel} must be an object.`,
        targetLabel,
      ),
    );
    return;
  }

  requireStableString(value['kind'], `${targetLabel}.kind`, diagnostics);
  requireStableString(
    value['packageId'],
    `${targetLabel}.packageId`,
    diagnostics,
    'creative-ai-missing-source-package',
  );
  requireStableString(value['id'], `${targetLabel}.id`, diagnostics);
  validateOptionalDocumentRef(value['documentRef'], `${targetLabel}.documentRef`, diagnostics);
  validateOptionalStableString(value['entityId'], `${targetLabel}.entityId`, diagnostics);
  validateOptionalStableString(value['fieldPath'], `${targetLabel}.fieldPath`, diagnostics);
  validateOptionalResourceRef(value['resourceRef'], `${targetLabel}.resourceRef`, diagnostics);
  validateOptionalResourceVariantRef(
    value['resourceVariantRef'],
    `${targetLabel}.resourceVariantRef`,
    diagnostics,
  );
  validateOptionalContentRef(value['contentRef'], `${targetLabel}.contentRef`, diagnostics);
  validateOptionalStableString(value['label'], `${targetLabel}.label`, diagnostics);
  validateOptionalRevision(value['revision'], `${targetLabel}.revision`, diagnostics);
  validateOptionalRecord(value['metadata'], `${targetLabel}.metadata`, diagnostics);
}

function validateOptionalChildSourceRefs(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-source-children',
        'Creative AI source childRefs must be an array.',
        target,
      ),
    );
    return;
  }
  for (const [index, child] of value.entries()) {
    const result = validateCreativeAiSourceRef(child);
    pushNestedDiagnostics(result.diagnostics, `${target}[${index}]`, diagnostics);
  }
}

function validateOptionalChildTargetRefs(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-target-children',
        'Creative AI target childRefs must be an array.',
        target,
      ),
    );
    return;
  }
  for (const [index, child] of value.entries()) {
    const result = validateCreativeAiTargetRef(child);
    pushNestedDiagnostics(result.diagnostics, `${target}[${index}]`, diagnostics);
  }
}

function validateSchemaVersion(value: unknown, diagnostics: CreativeAiDiagnostic[]): void {
  if (value !== CREATIVE_AI_INVOCATION_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-unsupported-schema-version',
        'Creative AI invocation schemaVersion is unsupported.',
        'schemaVersion',
        CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
        value,
      ),
    );
  }
}

function validateMode(value: unknown, diagnostics: CreativeAiDiagnostic[]): void {
  if (!isCreativeAiInvocationMode(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-mode',
        'Creative AI invocation mode is invalid.',
        'mode',
      ),
    );
  }
}

function validateLiteral(
  value: unknown,
  expected: string,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
  code: string,
): void {
  if (value !== expected) {
    diagnostics.push(
      diagnostic(
        'error',
        code,
        `Creative AI field ${target} must be ${expected}.`,
        target,
        expected,
        value,
      ),
    );
  }
}

function validateWriteback(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-writeback',
        'Creative AI writeback policy must be an object.',
        target,
      ),
    );
    return;
  }
  if (!isCreativeAiWritebackKind(value['kind'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-writeback-kind',
        'Creative AI writeback kind is invalid.',
        `${target}.kind`,
      ),
    );
  }
  if (value['atomicity'] !== undefined && !isCreativeAiBatchAtomicity(value['atomicity'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-batch-atomicity',
        'Creative AI writeback atomicity is invalid.',
        `${target}.atomicity`,
      ),
    );
  }
  if (
    value['requiresRevisionMatch'] !== undefined &&
    typeof value['requiresRevisionMatch'] !== 'boolean'
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-boolean',
        'Creative AI writeback requiresRevisionMatch must be boolean.',
        `${target}.requiresRevisionMatch`,
      ),
    );
  }
}

function validateOptionalWriteback(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  validateWriteback(value, target, diagnostics);
}

function validateAssociationIdentity(
  value: Readonly<Record<string, unknown>>,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value['documentRef'] !== undefined) return;
  const routing = value['routing'];
  if (isRecord(routing) && isStableString(routing['associationKey'])) return;
  const sourceRef = value['sourceRef'];
  if (isRecord(sourceRef) && sourceRef['documentRef'] !== undefined) return;

  diagnostics.push(
    diagnostic(
      'error',
      'creative-ai-missing-association-identity',
      'External creative AI invocation must include documentRef, sourceRef.documentRef, or routing.associationKey.',
      'documentRef',
    ),
  );
}

function validateMutatingTargetRequirement(
  value: Readonly<Record<string, unknown>>,
  diagnostics: CreativeAiDiagnostic[],
): void {
  const writeback = value['writeback'];
  if (!isRecord(writeback) || writeback['kind'] !== 'mutating') return;
  if (value['targetRef'] !== undefined || value['candidateTargetRef'] !== undefined) return;

  diagnostics.push(
    diagnostic(
      'error',
      'creative-ai-missing-target-ref',
      'Mutating creative AI invocation must include targetRef or candidateTargetRef.',
      'targetRef',
    ),
  );
}

function validateOptionalSourceRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  pushRefDiagnostics(
    validateCreativeAiSourceRef(value).diagnostics,
    'sourceRef',
    target,
    diagnostics,
  );
}

function validateOptionalTargetRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  pushRefDiagnostics(
    validateCreativeAiTargetRef(value).diagnostics,
    'targetRef',
    target,
    diagnostics,
  );
}

function validateOptionalDocumentRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-document-ref',
        'Creative AI documentRef must be an object.',
        target,
      ),
    );
    return;
  }
  validateLiteral(
    value['kind'],
    'nk-document',
    `${target}.kind`,
    diagnostics,
    'creative-ai-invalid-document-ref-kind',
  );
  requireStableString(value['packageId'], `${target}.packageId`, diagnostics);
  validateOptionalStableString(value['documentId'], `${target}.documentId`, diagnostics);
  validateOptionalStablePath(
    value['projectRelativePath'],
    `${target}.projectRelativePath`,
    diagnostics,
  );
  validateOptionalStableVariablePath(value['variablePath'], `${target}.variablePath`, diagnostics);
  validateOptionalStableString(value['format'], `${target}.format`, diagnostics);
  validateOptionalStableString(value['label'], `${target}.label`, diagnostics);

  if (
    value['documentId'] === undefined &&
    value['projectRelativePath'] === undefined &&
    value['variablePath'] === undefined
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-missing-document-identity',
        'Creative AI documentRef must include documentId, projectRelativePath, or variablePath.',
        target,
      ),
    );
  }
}

function validateOptionalRoutingHint(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-routing-hint',
        'Creative AI routing hint must be an object.',
        target,
      ),
    );
    return;
  }
  validateOptionalStableString(value['associationKey'], `${target}.associationKey`, diagnostics);
  validateOptionalStableString(
    value['requestedConversationId'],
    `${target}.requestedConversationId`,
    diagnostics,
  );
  validateOptionalStableString(
    value['userSelectedConversationId'],
    `${target}.userSelectedConversationId`,
    diagnostics,
  );
  if (
    value['allowCreateBackgroundConversation'] !== undefined &&
    typeof value['allowCreateBackgroundConversation'] !== 'boolean'
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-boolean',
        'Creative AI routing allowCreateBackgroundConversation must be boolean.',
        `${target}.allowCreateBackgroundConversation`,
      ),
    );
  }
}

function validateOptionalModelSnapshot(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-model-snapshot',
        'Creative AI model snapshot must be an object.',
        target,
      ),
    );
    return;
  }
  validateOptionalStableString(value['providerId'], `${target}.providerId`, diagnostics);
  validateOptionalStableString(value['modelId'], `${target}.modelId`, diagnostics);
  validateOptionalStableString(value['modelRevision'], `${target}.modelRevision`, diagnostics);
  validateOptionalStableString(value['capabilityId'], `${target}.capabilityId`, diagnostics);
  validateOptionalStableString(
    value['capabilityRevision'],
    `${target}.capabilityRevision`,
    diagnostics,
  );
}

function validateOptionalWorkItemSnapshots(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-work-items',
        'Creative AI run snapshot workItems must be an array.',
        target,
      ),
    );
    return;
  }

  for (const [index, item] of value.entries()) {
    validateWorkItemSnapshot(item, `${target}[${index}]`, diagnostics);
  }
}

function validateWorkItemSnapshot(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-work-item',
        'Creative AI work item snapshot must be an object.',
        target,
      ),
    );
    return;
  }
  requireStableString(value['workItemId'], `${target}.workItemId`, diagnostics);
  if (!isCreativeAiWorkItemStatus(value['status'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-work-item-status',
        'Creative AI work item status is invalid.',
        `${target}.status`,
      ),
    );
  }
  if (value['laneKind'] !== undefined && !isCreativeAiLaneKind(value['laneKind'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-lane-kind',
        'Creative AI work item lane kind is invalid.',
        `${target}.laneKind`,
      ),
    );
  }
  validateOptionalTargetRef(value['targetRef'], `${target}.targetRef`, diagnostics);
  validateOptionalTargetRef(
    value['candidateTargetRef'],
    `${target}.candidateTargetRef`,
    diagnostics,
  );
  validateOptionalStableString(
    value['parentWorkItemId'],
    `${target}.parentWorkItemId`,
    diagnostics,
  );
  validateOptionalDiagnosticsArray(value['diagnostics'], `${target}.diagnostics`, diagnostics);
}

function validateOptionalRunAggregateSnapshot(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  validateRunAggregateSnapshot(value, target, diagnostics);
}

function validateRunAggregateSnapshot(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-run-aggregate',
        'Creative AI run aggregate snapshot must be an object.',
        target,
      ),
    );
    return;
  }
  requireStableString(value['runId'], `${target}.runId`, diagnostics);
  validateNonNegativeInteger(value['totalCount'], `${target}.totalCount`, diagnostics);
  validateNonNegativeInteger(value['completedCount'], `${target}.completedCount`, diagnostics);
  validateNonNegativeInteger(value['failedCount'], `${target}.failedCount`, diagnostics);
  validateNonNegativeInteger(value['runningCount'], `${target}.runningCount`, diagnostics);
  validateNonNegativeInteger(value['queuedCount'], `${target}.queuedCount`, diagnostics);
  validateOptionalLaneSnapshots(value['lanes'], `${target}.lanes`, diagnostics);
  validateOptionalDiagnosticsArray(value['diagnostics'], `${target}.diagnostics`, diagnostics);
}

function validateOptionalLaneSnapshots(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-lanes',
        'Creative AI lanes must be an array.',
        target,
      ),
    );
    return;
  }
  for (const [index, lane] of value.entries()) {
    validateLaneSnapshot(lane, `${target}[${index}]`, diagnostics);
  }
}

function validateLaneSnapshot(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-lane-snapshot',
        'Creative AI lane snapshot must be an object.',
        target,
      ),
    );
    return;
  }
  if (!isCreativeAiLaneKind(value['laneKind'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-lane-kind',
        'Creative AI lane kind is invalid.',
        `${target}.laneKind`,
      ),
    );
  }
  validateNonNegativeInteger(value['maxActive'], `${target}.maxActive`, diagnostics);
  validateNonNegativeInteger(value['activeCount'], `${target}.activeCount`, diagnostics);
  validateNonNegativeInteger(value['queuedCount'], `${target}.queuedCount`, diagnostics);
  validateNonNegativeInteger(value['runningCount'], `${target}.runningCount`, diagnostics);
  validateNonNegativeInteger(value['completedCount'], `${target}.completedCount`, diagnostics);
  validateNonNegativeInteger(value['failedCount'], `${target}.failedCount`, diagnostics);
  validateOptionalNonNegativeInteger(
    value['cancelledCount'],
    `${target}.cancelledCount`,
    diagnostics,
  );
  validateOptionalDiagnosticsArray(value['diagnostics'], `${target}.diagnostics`, diagnostics);
}

function validateOutputRefs(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-output-refs',
        'Creative AI apply request must include at least one output ref.',
        target,
      ),
    );
    return;
  }

  for (const [index, output] of value.entries()) {
    validateOutputRef(output, `${target}[${index}]`, diagnostics);
  }
}

function validateOptionalOutputRefs(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  validateOutputRefs(value, target, diagnostics);
}

function validateOutputRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-output-ref',
        'Creative AI output ref must be an object.',
        target,
      ),
    );
    return;
  }
  if (!isCreativeAiOutputRefKind(value['kind'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-output-ref-kind',
        'Creative AI output ref kind is invalid.',
        `${target}.kind`,
      ),
    );
  }
  requireStableString(value['id'], `${target}.id`, diagnostics);
  validateOptionalResourceRef(value['resourceRef'], `${target}.resourceRef`, diagnostics);
  validateOptionalResourceVariantRef(
    value['resourceVariantRef'],
    `${target}.resourceVariantRef`,
    diagnostics,
  );
  validateOptionalContentRef(value['contentRef'], `${target}.contentRef`, diagnostics);
  validateOptionalStableString(
    value['generatedAssetId'],
    `${target}.generatedAssetId`,
    diagnostics,
  );
  validateOptionalStableString(value['mimeType'], `${target}.mimeType`, diagnostics);
  validateOptionalStableString(value['label'], `${target}.label`, diagnostics);
  validateOptionalRecord(value['metadata'], `${target}.metadata`, diagnostics);

  if (!hasOutputIdentity(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-missing-output-identity',
        'Creative AI output ref must include stable resourceRef, resourceVariantRef, contentRef, generatedAssetId, text id, or structured-data id.',
        target,
      ),
    );
  }
}

function hasOutputIdentity(value: Readonly<Record<string, unknown>>): boolean {
  if (isResourceRef(value['resourceRef']))
    return !isCacheOrRuntimeOnlyContentRef(value['resourceRef']);
  if (isResourceVariantRef(value['resourceVariantRef'])) {
    return !isCacheOrRuntimeOnlyContentRef(value['resourceVariantRef'].resource);
  }
  if (isContentSourceRef(value['contentRef'])) {
    return !isCacheOrRuntimeOnlyContentRef(value['contentRef']);
  }
  if (isStableString(value['generatedAssetId'])) return true;
  return value['kind'] === 'text' || value['kind'] === 'structured-data';
}

function validateOptionalResourceRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isResourceRef(value) || isCacheOrRuntimeOnlyContentRef(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-runtime-only-identity',
        'Creative AI resourceRef must be a durable resource identity.',
        target,
      ),
    );
  }
}

function validateOptionalResourceVariantRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isResourceVariantRef(value) || isCacheOrRuntimeOnlyContentRef(value.resource)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-runtime-only-identity',
        'Creative AI resourceVariantRef must be a durable resource identity.',
        target,
      ),
    );
  }
}

function validateOptionalContentRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isContentSourceRef(value) || isCacheOrRuntimeOnlyContentRef(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-runtime-only-identity',
        'Creative AI contentRef must be a durable content identity.',
        target,
      ),
    );
  }
}

function validateDiagnosticsArray(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!Array.isArray(value) || !value.every(isCreativeAiDiagnostic)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-diagnostics',
        'Creative AI diagnostics must be an array of diagnostics.',
        target,
      ),
    );
  }
}

function validateOptionalDiagnosticsArray(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  validateDiagnosticsArray(value, target, diagnostics);
}

function isCreativeAiDiagnostic(value: unknown): value is CreativeAiDiagnostic {
  if (!isRecord(value)) return false;
  return (
    isCreativeAiDiagnosticSeverity(value['severity']) &&
    isStableString(value['code']) &&
    isStableString(value['message']) &&
    optionalStableString(value['target']) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function validateOptionalRevision(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value === 'number') return;
  validateStableString(value, target, diagnostics);
}

function requireRevision(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (typeof value === 'number') return;
  if (isStableString(value)) return;
  diagnostics.push(
    diagnostic(
      'error',
      'creative-ai-missing-revision',
      'Creative AI revision is required.',
      target,
    ),
  );
}

function validateOptionalNonNegativeInteger(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  validateNonNegativeInteger(value, target, diagnostics);
}

function validateNonNegativeInteger(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-count',
        'Creative AI count must be a non-negative integer.',
        target,
      ),
    );
  }
}

function validateOptionalStableStringArray(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-string-array',
        'Creative AI field must be an array of stable strings.',
        target,
      ),
    );
    return;
  }
  for (const [index, item] of value.entries()) {
    validateStableString(item, `${target}[${index}]`, diagnostics);
  }
}

function validateOptionalStableString(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  validateStableString(value, target, diagnostics);
}

function requireStableString(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
  missingCode = 'creative-ai-missing-required-string',
): void {
  if (!isStableString(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        typeof value === 'string' && isRuntimeOnlyCreativeAiIdentityValue(value)
          ? 'creative-ai-runtime-only-identity'
          : missingCode,
        'Creative AI field must be a non-empty stable string.',
        target,
      ),
    );
  }
}

function validateStableString(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isStableString(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        typeof value === 'string' && isRuntimeOnlyCreativeAiIdentityValue(value)
          ? 'creative-ai-runtime-only-identity'
          : 'creative-ai-invalid-stable-string',
        'Creative AI field must be a stable string.',
        target,
      ),
    );
  }
}

function validateOptionalStablePath(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isStablePath(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        typeof value === 'string' && isRuntimeOnlyCreativeAiIdentityValue(value)
          ? 'creative-ai-runtime-only-identity'
          : 'creative-ai-invalid-stable-path',
        'Creative AI path must be project-relative and durable.',
        target,
      ),
    );
  }
}

function validateOptionalStableVariablePath(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isStableVariablePath(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        typeof value === 'string' && isRuntimeOnlyCreativeAiIdentityValue(value)
          ? 'creative-ai-runtime-only-identity'
          : 'creative-ai-invalid-variable-path',
        'Creative AI variable path must start with ${VAR}/ and be durable.',
        target,
      ),
    );
  }
}

function validateOptionalRecord(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value !== undefined && !isRecord(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'creative-ai-invalid-record',
        'Creative AI field must be an object.',
        target,
      ),
    );
  }
}

function validationResult<T>(value: unknown, diagnostics: readonly CreativeAiDiagnostic[]) {
  return {
    valid: diagnostics.every((item) => item.severity !== 'error'),
    ...(diagnostics.every((item) => item.severity !== 'error') ? { value: value as T } : {}),
    diagnostics,
  } satisfies CreativeAiValidationResult<T>;
}

function invalidRootResult<T>(code: string): CreativeAiValidationResult<T> {
  return {
    valid: false,
    diagnostics: [diagnostic('error', code, 'Creative AI payload must be an object.')],
  };
}

function validateNestedDiagnostics(
  result: CreativeAiValidationResult<unknown>,
  diagnostics: CreativeAiDiagnostic[],
): void {
  diagnostics.push(...result.diagnostics);
}

function pushNestedDiagnostics(
  nestedDiagnostics: readonly CreativeAiDiagnostic[],
  prefix: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  for (const nested of nestedDiagnostics) {
    diagnostics.push({
      ...nested,
      target: nested.target ? `${prefix}.${nested.target}` : prefix,
    });
  }
}

function pushRefDiagnostics(
  nestedDiagnostics: readonly CreativeAiDiagnostic[],
  rootLabel: string,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  for (const nested of nestedDiagnostics) {
    const nestedTarget = nested.target;
    if (!nestedTarget || target === rootLabel) {
      diagnostics.push(nested);
      continue;
    }

    const suffix =
      nestedTarget === rootLabel
        ? ''
        : nestedTarget.startsWith(`${rootLabel}.`)
          ? nestedTarget.slice(rootLabel.length + 1)
          : nestedTarget;
    diagnostics.push({
      ...nested,
      target: suffix ? `${target}.${suffix}` : target,
    });
  }
}

function diagnostic(
  severity: CreativeAiDiagnosticSeverity,
  code: string,
  message: string,
  target?: string,
  expected?: unknown,
  received?: unknown,
): CreativeAiDiagnostic {
  return {
    severity,
    code,
    message,
    ...(target ? { target } : {}),
    ...(expected !== undefined ? { expected } : {}),
    ...(received !== undefined ? { received } : {}),
  };
}

function isCreativeAiInvocationDomain(value: unknown): value is CreativeAiInvocationDomain {
  return includesString(CREATIVE_AI_INVOCATION_DOMAINS, value);
}

function isStableString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !isRuntimeOnlyCreativeAiIdentityValue(value)
  );
}

function optionalStableString(value: unknown): value is string | undefined {
  return value === undefined || isStableString(value);
}

function isStablePath(value: unknown): value is string {
  if (!isStableString(value)) return false;
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false;
  return !value.startsWith('../') && !value.includes('/../') && !value.includes('\\..\\');
}

function isStableVariablePath(value: unknown): value is string {
  if (!isStableString(value)) return false;
  if (!/^\$\{[A-Z0-9_]+\}[\\/]/.test(value)) return false;
  return !value.includes('/../') && !value.includes('\\..\\');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
