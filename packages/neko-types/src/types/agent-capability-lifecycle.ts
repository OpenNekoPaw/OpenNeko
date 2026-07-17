import type { DocumentArchiveResourceRef } from './document-reading';
import { isDocumentArchiveResourceRef } from './document-reading';
import type { ResourceRef } from './resource-cache';
import { isResourceRef } from './resource-cache';
import type {
  ToolQueryBeforeMutateGuidance,
  ToolSafetyKind,
  ToolTargetRequirements,
} from './tool-planning';

export const AGENT_CAPABILITY_LIFECYCLE_PHASES = [
  'describe',
  'validate',
  'review',
  'apply',
  'execute',
] as const;

export type AgentCapabilityLifecyclePhase = (typeof AGENT_CAPABILITY_LIFECYCLE_PHASES)[number];

export const AGENT_CAPABILITY_INVOCATION_STATUSES = [
  'described',
  'validated',
  'needs-review',
  'waiting-approval',
  'applied',
  'executed',
  'blocked',
] as const;

export type AgentCapabilityInvocationStatus = (typeof AGENT_CAPABILITY_INVOCATION_STATUSES)[number];

export const AGENT_CAPABILITY_DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const;

export type AgentCapabilityLifecycleDiagnosticSeverity =
  (typeof AGENT_CAPABILITY_DIAGNOSTIC_SEVERITIES)[number];

export const AGENT_CAPABILITY_LIFECYCLE_RISKS = ['low', 'medium', 'high', 'destructive'] as const;

export type AgentCapabilityLifecycleRisk = (typeof AGENT_CAPABILITY_LIFECYCLE_RISKS)[number];

export const AGENT_CAPABILITY_ARTIFACT_REF_KINDS = [
  'artifact',
  'node',
  'resource',
  'document-resource',
  'generated-asset',
  'project-path',
] as const;

export type AgentCapabilityArtifactRefKind = (typeof AGENT_CAPABILITY_ARTIFACT_REF_KINDS)[number];

export const AGENT_CAPABILITY_APPROVAL_SOURCES = [
  'user-confirmation',
  'creation-apply',
  'tool-confirmation',
  'policy',
] as const;

export type AgentCapabilityApprovalSource = (typeof AGENT_CAPABILITY_APPROVAL_SOURCES)[number];

export interface AgentCapabilitySchemaRef {
  readonly id: string;
  readonly version?: number;
}

export interface AgentCapabilityLifecycleDescriptor {
  readonly capabilityId: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly description: string;
  readonly phases: readonly AgentCapabilityLifecyclePhase[];
  readonly inputSchema: AgentCapabilitySchemaRef;
  readonly resultSchema: AgentCapabilitySchemaRef;
  readonly accepts?: readonly string[];
  readonly produces?: readonly string[];
  readonly risk: AgentCapabilityLifecycleRisk;
  readonly requiresApproval: boolean;
  readonly safetyKind?: ToolSafetyKind;
  readonly targetRequirements?: ToolTargetRequirements;
  readonly queryBeforeMutate?: ToolQueryBeforeMutateGuidance;
}

export interface AgentCapabilityLifecycleTargetRef {
  readonly packageId?: string;
  readonly projectId?: string;
  readonly canvasId?: string;
  readonly nodeId?: string;
  readonly containerId?: string;
  readonly slotId?: string;
  readonly fieldPath?: string;
  readonly insertionPoint?: {
    readonly x: number;
    readonly y: number;
  };
}

export interface AgentCapabilityApprovalContext {
  readonly source: AgentCapabilityApprovalSource;
  readonly approvalId?: string;
  readonly approvedAt?: number;
  readonly approvedBy?: string;
  readonly creationId?: string;
  readonly iterationId?: string;
  readonly profileId?: string;
  readonly stageId?: string;
  readonly toolCallId?: string;
}

export interface AgentCapabilityInvocationProvenance {
  readonly source?: 'agent' | 'webview' | 'tool' | 'user' | 'plugin';
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly toolCallId?: string;
  readonly creationId?: string;
  readonly iterationId?: string;
  readonly label?: string;
}

export interface AgentCapabilityInvocationInput {
  readonly capabilityId: string;
  readonly phase: AgentCapabilityLifecyclePhase;
  readonly payload?: unknown;
  readonly target?: AgentCapabilityLifecycleTargetRef;
  readonly approval?: AgentCapabilityApprovalContext;
  readonly provenance?: AgentCapabilityInvocationProvenance;
}

export interface AgentCapabilityArtifactRef {
  readonly kind: AgentCapabilityArtifactRefKind;
  readonly id?: string;
  readonly packageId?: string;
  readonly artifactKind?: string;
  readonly profile?: string;
  readonly title?: string;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly assetRef?: {
    readonly id: string;
    readonly provider?: string;
    readonly kind?: string;
  };
  readonly projectPath?: string;
}

export interface AgentCapabilityAction {
  readonly actionId: string;
  readonly label?: string;
  readonly capabilityId: string;
  readonly phase: AgentCapabilityLifecyclePhase;
  readonly requiresApproval: boolean;
  readonly sourceRef?: AgentCapabilityArtifactRef;
  readonly target?: AgentCapabilityLifecycleTargetRef;
  readonly payload?: unknown;
}

export interface AgentCapabilityLifecycleDiagnostic {
  readonly severity: AgentCapabilityLifecycleDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly fieldKey?: string;
  readonly token?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface AgentCapabilityInvocationResult {
  readonly capabilityId: string;
  readonly phase: AgentCapabilityLifecyclePhase;
  readonly status: AgentCapabilityInvocationStatus;
  readonly diagnostics: readonly AgentCapabilityLifecycleDiagnostic[];
  readonly reviewArtifact?: AgentCapabilityArtifactRef;
  readonly changedRefs?: readonly AgentCapabilityArtifactRef[];
  readonly actions?: readonly AgentCapabilityAction[];
  readonly data?: unknown;
}

const RUNTIME_ONLY_RESOURCE_PATTERNS: readonly RegExp[] = [
  /^vscode-webview:\/\//i,
  /^vscode-webview-resource:\/\//i,
  /^blob:/i,
  /^file:/i,
  /^data:/i,
  /^https?:\/\/127\.0\.0\.1(?::|\/)/i,
  /^https?:\/\/localhost(?::|\/)/i,
  /(?:^|\/)\.neko\/\.cache(?:\/|$)/i,
  /^\/tmp(?:\/|$)/i,
  /^\/var\/folders(?:\/|$)/i,
];

export function isAgentCapabilityLifecyclePhase(
  value: unknown,
): value is AgentCapabilityLifecyclePhase {
  return includesString(AGENT_CAPABILITY_LIFECYCLE_PHASES, value);
}

export function isAgentCapabilityInvocationStatus(
  value: unknown,
): value is AgentCapabilityInvocationStatus {
  return includesString(AGENT_CAPABILITY_INVOCATION_STATUSES, value);
}

export function isAgentCapabilityLifecycleDiagnosticSeverity(
  value: unknown,
): value is AgentCapabilityLifecycleDiagnosticSeverity {
  return includesString(AGENT_CAPABILITY_DIAGNOSTIC_SEVERITIES, value);
}

export function isAgentCapabilityLifecycleRisk(
  value: unknown,
): value is AgentCapabilityLifecycleRisk {
  return includesString(AGENT_CAPABILITY_LIFECYCLE_RISKS, value);
}

export function isAgentCapabilityArtifactRefKind(
  value: unknown,
): value is AgentCapabilityArtifactRefKind {
  return includesString(AGENT_CAPABILITY_ARTIFACT_REF_KINDS, value);
}

export function isAgentCapabilityApprovalSource(
  value: unknown,
): value is AgentCapabilityApprovalSource {
  return includesString(AGENT_CAPABILITY_APPROVAL_SOURCES, value);
}

export function isAgentCapabilityLifecycleDescriptor(
  value: unknown,
): value is AgentCapabilityLifecycleDescriptor {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['capabilityId']) &&
    isNonEmptyString(value['providerId']) &&
    isNonEmptyString(value['displayName']) &&
    isNonEmptyString(value['description']) &&
    Array.isArray(value['phases']) &&
    value['phases'].length > 0 &&
    value['phases'].every(isAgentCapabilityLifecyclePhase) &&
    isAgentCapabilitySchemaRef(value['inputSchema']) &&
    isAgentCapabilitySchemaRef(value['resultSchema']) &&
    optionalStringArray(value['accepts']) &&
    optionalStringArray(value['produces']) &&
    isAgentCapabilityLifecycleRisk(value['risk']) &&
    typeof value['requiresApproval'] === 'boolean' &&
    optionalToolSafetyKind(value['safetyKind']) &&
    optionalToolTargetRequirements(value['targetRequirements']) &&
    optionalQueryBeforeMutate(value['queryBeforeMutate'])
  );
}

export function isAgentCapabilityInvocationInput(
  value: unknown,
): value is AgentCapabilityInvocationInput {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['capabilityId']) &&
    isAgentCapabilityLifecyclePhase(value['phase']) &&
    (value['target'] === undefined || isAgentCapabilityLifecycleTargetRef(value['target'])) &&
    (value['approval'] === undefined || isAgentCapabilityApprovalContext(value['approval'])) &&
    (value['provenance'] === undefined ||
      isAgentCapabilityInvocationProvenance(value['provenance']))
  );
}

export function isAgentCapabilityInvocationResult(
  value: unknown,
): value is AgentCapabilityInvocationResult {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['capabilityId']) &&
    isAgentCapabilityLifecyclePhase(value['phase']) &&
    isAgentCapabilityInvocationStatus(value['status']) &&
    Array.isArray(value['diagnostics']) &&
    value['diagnostics'].every(isAgentCapabilityLifecycleDiagnostic) &&
    (value['reviewArtifact'] === undefined ||
      isAgentCapabilityArtifactRef(value['reviewArtifact'])) &&
    optionalArtifactRefArray(value['changedRefs']) &&
    (value['actions'] === undefined ||
      (Array.isArray(value['actions']) && value['actions'].every(isAgentCapabilityAction)))
  );
}

export function validateAgentCapabilityLifecycleDescriptor(
  value: unknown,
): readonly AgentCapabilityLifecycleDiagnostic[] {
  const diagnostics: AgentCapabilityLifecycleDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-descriptor',
        'Agent capability lifecycle descriptor must be an object.',
      ),
    ];
  }
  pushRequiredStringDiagnostic(diagnostics, value['capabilityId'], 'capabilityId');
  pushRequiredStringDiagnostic(diagnostics, value['providerId'], 'providerId');
  pushRequiredStringDiagnostic(diagnostics, value['displayName'], 'displayName');
  pushRequiredStringDiagnostic(diagnostics, value['description'], 'description');
  if (
    !Array.isArray(value['phases']) ||
    value['phases'].length === 0 ||
    !value['phases'].every(isAgentCapabilityLifecyclePhase)
  ) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-phases',
        'Agent capability lifecycle descriptor must include supported lifecycle phases.',
        'phases',
      ),
    );
  }
  if (!isAgentCapabilitySchemaRef(value['inputSchema'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-input-schema',
        'Agent capability lifecycle descriptor must include an input schema id.',
        'inputSchema',
      ),
    );
  }
  if (!isAgentCapabilitySchemaRef(value['resultSchema'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-result-schema',
        'Agent capability lifecycle descriptor must include a result schema id.',
        'resultSchema',
      ),
    );
  }
  validateOptionalStringArray(diagnostics, value['accepts'], 'accepts');
  validateOptionalStringArray(diagnostics, value['produces'], 'produces');
  if (!isAgentCapabilityLifecycleRisk(value['risk'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-risk',
        'Agent capability lifecycle descriptor risk is invalid.',
        'risk',
      ),
    );
  }
  if (typeof value['requiresApproval'] !== 'boolean') {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-approval',
        'Agent capability lifecycle descriptor requiresApproval must be boolean.',
        'requiresApproval',
      ),
    );
  }
  if (!optionalToolSafetyKind(value['safetyKind'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-safety-kind',
        'Agent capability lifecycle descriptor safetyKind is invalid.',
        'safetyKind',
      ),
    );
  }
  return diagnostics;
}

export function validateAgentCapabilityInvocationInput(
  value: unknown,
): readonly AgentCapabilityLifecycleDiagnostic[] {
  const diagnostics: AgentCapabilityLifecycleDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-invocation',
        'Agent capability invocation input must be an object.',
      ),
    ];
  }
  pushRequiredStringDiagnostic(diagnostics, value['capabilityId'], 'capabilityId');
  if (!isAgentCapabilityLifecyclePhase(value['phase'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-phase',
        'Agent capability invocation phase is invalid.',
        'phase',
      ),
    );
  }
  if (value['target'] !== undefined && !isAgentCapabilityLifecycleTargetRef(value['target'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-target',
        'Agent capability invocation target is invalid.',
        'target',
      ),
    );
  }
  if (value['approval'] !== undefined && !isAgentCapabilityApprovalContext(value['approval'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-approval-context',
        'Agent capability invocation approval context is invalid.',
        'approval',
      ),
    );
  }
  if (
    value['provenance'] !== undefined &&
    !isAgentCapabilityInvocationProvenance(value['provenance'])
  ) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-provenance',
        'Agent capability invocation provenance is invalid.',
        'provenance',
      ),
    );
  }
  return diagnostics;
}

export function validateAgentCapabilityInvocationResult(
  value: unknown,
): readonly AgentCapabilityLifecycleDiagnostic[] {
  const diagnostics: AgentCapabilityLifecycleDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-result',
        'Agent capability invocation result must be an object.',
      ),
    ];
  }
  pushRequiredStringDiagnostic(diagnostics, value['capabilityId'], 'capabilityId');
  if (!isAgentCapabilityLifecyclePhase(value['phase'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-result-phase',
        'Agent capability invocation result phase is invalid.',
        'phase',
      ),
    );
  }
  if (!isAgentCapabilityInvocationStatus(value['status'])) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-status',
        'Agent capability invocation result status is invalid.',
        'status',
      ),
    );
  }
  if (
    !Array.isArray(value['diagnostics']) ||
    !value['diagnostics'].every(isAgentCapabilityLifecycleDiagnostic)
  ) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-diagnostics',
        'Agent capability invocation result diagnostics are invalid.',
        'diagnostics',
      ),
    );
  }
  validateArtifactRefField(diagnostics, value['reviewArtifact'], 'reviewArtifact');
  validateArtifactRefArrayField(diagnostics, value['changedRefs'], 'changedRefs');
  if (
    value['actions'] !== undefined &&
    (!Array.isArray(value['actions']) || !value['actions'].every(isAgentCapabilityAction))
  ) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-actions',
        'Agent capability invocation result actions are invalid.',
        'actions',
      ),
    );
  }
  return diagnostics;
}

export function createAgentCapabilityLifecycleDiagnostic(
  severity: AgentCapabilityLifecycleDiagnosticSeverity,
  code: string,
  message: string,
  fieldKey?: string,
): AgentCapabilityLifecycleDiagnostic {
  return {
    severity,
    code,
    message,
    ...(fieldKey ? { fieldKey } : {}),
  };
}

export function isRuntimeOnlyAgentCapabilityResourceValue(value: string): boolean {
  const normalized = value.trim();
  return RUNTIME_ONLY_RESOURCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isAgentCapabilitySchemaRef(value: unknown): value is AgentCapabilitySchemaRef {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value['id']) && optionalNumber(value['version']);
}

function isAgentCapabilityLifecycleTargetRef(
  value: unknown,
): value is AgentCapabilityLifecycleTargetRef {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['packageId']) &&
    optionalString(value['projectId']) &&
    optionalString(value['canvasId']) &&
    optionalString(value['nodeId']) &&
    optionalString(value['containerId']) &&
    optionalString(value['slotId']) &&
    optionalString(value['fieldPath']) &&
    (value['insertionPoint'] === undefined || isPoint(value['insertionPoint']))
  );
}

function isAgentCapabilityApprovalContext(value: unknown): value is AgentCapabilityApprovalContext {
  if (!isRecord(value)) return false;
  return (
    isAgentCapabilityApprovalSource(value['source']) &&
    optionalString(value['approvalId']) &&
    optionalNumber(value['approvedAt']) &&
    optionalString(value['approvedBy']) &&
    optionalString(value['creationId']) &&
    optionalString(value['iterationId']) &&
    optionalString(value['profileId']) &&
    optionalString(value['stageId']) &&
    optionalString(value['toolCallId'])
  );
}

function isAgentCapabilityInvocationProvenance(
  value: unknown,
): value is AgentCapabilityInvocationProvenance {
  if (!isRecord(value)) return false;
  return (
    (value['source'] === undefined ||
      value['source'] === 'agent' ||
      value['source'] === 'webview' ||
      value['source'] === 'tool' ||
      value['source'] === 'user' ||
      value['source'] === 'plugin') &&
    optionalString(value['conversationId']) &&
    optionalString(value['messageId']) &&
    optionalString(value['toolCallId']) &&
    optionalString(value['creationId']) &&
    optionalString(value['iterationId']) &&
    optionalString(value['label'])
  );
}

function isAgentCapabilityArtifactRef(value: unknown): value is AgentCapabilityArtifactRef {
  if (!isRecord(value) || !isAgentCapabilityArtifactRefKind(value['kind'])) return false;
  return (
    optionalString(value['id']) &&
    optionalString(value['packageId']) &&
    optionalString(value['artifactKind']) &&
    optionalString(value['profile']) &&
    optionalString(value['title']) &&
    (value['resourceRef'] === undefined || isResourceRef(value['resourceRef'])) &&
    (value['documentResourceRef'] === undefined ||
      isDocumentArchiveResourceRef(value['documentResourceRef'])) &&
    (value['assetRef'] === undefined || isAgentCapabilityAssetRef(value['assetRef'])) &&
    optionalStablePath(value['projectPath']) &&
    artifactRefHasRequiredIdentity(value)
  );
}

function isAgentCapabilityAssetRef(
  value: unknown,
): value is NonNullable<AgentCapabilityArtifactRef['assetRef']> {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    optionalString(value['provider']) &&
    optionalString(value['kind'])
  );
}

function isAgentCapabilityAction(value: unknown): value is AgentCapabilityAction {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['actionId']) &&
    optionalString(value['label']) &&
    isNonEmptyString(value['capabilityId']) &&
    isAgentCapabilityLifecyclePhase(value['phase']) &&
    typeof value['requiresApproval'] === 'boolean' &&
    (value['sourceRef'] === undefined || isAgentCapabilityArtifactRef(value['sourceRef'])) &&
    (value['target'] === undefined || isAgentCapabilityLifecycleTargetRef(value['target']))
  );
}

function isAgentCapabilityLifecycleDiagnostic(
  value: unknown,
): value is AgentCapabilityLifecycleDiagnostic {
  if (!isRecord(value)) return false;
  return (
    isAgentCapabilityLifecycleDiagnosticSeverity(value['severity']) &&
    isNonEmptyString(value['code']) &&
    isNonEmptyString(value['message']) &&
    optionalString(value['fieldKey']) &&
    optionalString(value['token']) &&
    optionalNumber(value['line']) &&
    optionalNumber(value['column'])
  );
}

function artifactRefHasRequiredIdentity(value: Readonly<Record<string, unknown>>): boolean {
  switch (value['kind']) {
    case 'resource':
      return isResourceRef(value['resourceRef']);
    case 'document-resource':
      return isDocumentArchiveResourceRef(value['documentResourceRef']);
    case 'generated-asset':
      return isAgentCapabilityAssetRef(value['assetRef']);
    case 'project-path':
      return typeof value['projectPath'] === 'string' && value['projectPath'].trim().length > 0;
    case 'artifact':
    case 'node':
      return typeof value['id'] === 'string' && value['id'].trim().length > 0;
    default:
      return false;
  }
}

function validateArtifactRefField(
  diagnostics: AgentCapabilityLifecycleDiagnostic[],
  value: unknown,
  fieldKey: string,
): void {
  if (value === undefined) return;
  if (!isAgentCapabilityArtifactRef(value)) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-artifact-ref',
        'Agent capability artifact reference is invalid or contains runtime-only identity.',
        fieldKey,
      ),
    );
  }
}

function validateArtifactRefArrayField(
  diagnostics: AgentCapabilityLifecycleDiagnostic[],
  value: unknown,
  fieldKey: string,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every(isAgentCapabilityArtifactRef)) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-artifact-refs',
        'Agent capability artifact references are invalid or contain runtime-only identity.',
        fieldKey,
      ),
    );
  }
}

function optionalArtifactRefArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isAgentCapabilityArtifactRef));
}

function optionalStablePath(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      value.trim().length > 0 &&
      !isRuntimeOnlyAgentCapabilityResourceValue(value))
  );
}

function optionalToolSafetyKind(value: unknown): value is ToolSafetyKind | undefined {
  return (
    value === undefined ||
    value === 'read-only-query' ||
    value === 'non-destructive-mutation' ||
    value === 'destructive-mutation' ||
    value === 'confirmation-gated'
  );
}

function optionalToolTargetRequirements(
  value: unknown,
): value is ToolTargetRequirements | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    optionalStringArray(value['required']) &&
    (value['allowedFallbacks'] === undefined ||
      (Array.isArray(value['allowedFallbacks']) &&
        value['allowedFallbacks'].every(
          (item) =>
            item === 'selection' || item === 'viewport-insertion' || item === 'explicit-user-input',
        ))) &&
    optionalStringArray(value['confirmationModes'])
  );
}

function optionalQueryBeforeMutate(
  value: unknown,
): value is ToolQueryBeforeMutateGuidance | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value['preferredQueryTools']) &&
    value['preferredQueryTools'].every(isNonEmptyString) &&
    optionalString(value['reason'])
  );
}

function validateOptionalStringArray(
  diagnostics: AgentCapabilityLifecycleDiagnostic[],
  value: unknown,
  fieldKey: string,
): void {
  if (value !== undefined && !optionalStringArray(value)) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-invalid-string-array',
        'Agent capability lifecycle descriptor field must be an array of non-empty strings.',
        fieldKey,
      ),
    );
  }
}

function pushRequiredStringDiagnostic(
  diagnostics: AgentCapabilityLifecycleDiagnostic[],
  value: unknown,
  fieldKey: string,
): void {
  if (!isNonEmptyString(value)) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-missing-required-string',
        'Agent capability lifecycle field must be a non-empty string.',
        fieldKey,
      ),
    );
  }
}

function optionalStringArray(value: unknown): value is readonly string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isNonEmptyString));
}

function isPoint(value: unknown): value is { readonly x: number; readonly y: number } {
  if (!isRecord(value)) return false;
  return typeof value['x'] === 'number' && typeof value['y'] === 'number';
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
