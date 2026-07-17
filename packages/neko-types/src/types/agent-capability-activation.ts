/**
 * Agent Capability Activation Contracts
 *
 * Host-agnostic DTOs for explicit capability activation and activation progress
 * reporting. These contracts describe how a capability becomes active; they do
 * not describe prompt content and must stay usable by Extension, Webview, CLI,
 * and runtime tests without importing runtime internals.
 */

export const AGENT_CAPABILITY_ACTIVATION_SOURCES = ['user-explicit', 'agent-tool'] as const;

export type AgentCapabilityActivationSource = (typeof AGENT_CAPABILITY_ACTIVATION_SOURCES)[number];

export const AGENT_CAPABILITY_ACTIVATION_TARGETS = ['skill', 'execution-mode'] as const;

export type AgentCapabilityActivationTarget = (typeof AGENT_CAPABILITY_ACTIVATION_TARGETS)[number];

export const AGENT_CAPABILITY_ACTIVATION_ACTIONS = [
  'activate',
  'deactivate',
  'set',
  'resume',
] as const;

export type AgentCapabilityActivationAction = (typeof AGENT_CAPABILITY_ACTIVATION_ACTIONS)[number];

export const AGENT_CAPABILITY_ACTIVATION_REQUESTERS = ['user', 'agent'] as const;

export type AgentCapabilityActivationRequester =
  (typeof AGENT_CAPABILITY_ACTIVATION_REQUESTERS)[number];

export const AGENT_CAPABILITY_ACTIVATION_PROGRESS_STEPS = [
  'requested',
  'validated',
  'loaded',
  'prepared',
  'record-created',
  'projected',
  'active',
  'failed',
] as const;

export type AgentCapabilityActivationProgressStep =
  (typeof AGENT_CAPABILITY_ACTIVATION_PROGRESS_STEPS)[number];

export type AgentCapabilityActivationProgressStatus =
  'pending' | 'running' | 'succeeded' | 'failed';

export type AgentCapabilityActivationDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface AgentCapabilityActivationDiagnostic {
  readonly severity: AgentCapabilityActivationDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface AgentCapabilityActivationIntent {
  readonly id: string;
  readonly conversationId: string;
  readonly source: AgentCapabilityActivationSource;
  readonly target: AgentCapabilityActivationTarget;
  readonly action: AgentCapabilityActivationAction;
  readonly name: string;
  readonly requestedBy: AgentCapabilityActivationRequester;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: number;
}

export interface AgentCapabilityActivationProvenance {
  readonly intentId: string;
  readonly source: AgentCapabilityActivationSource;
  readonly target: AgentCapabilityActivationTarget;
  readonly action: AgentCapabilityActivationAction;
  readonly requestedBy: AgentCapabilityActivationRequester;
  readonly reason?: string;
  readonly toolCallId?: string;
  readonly messageId?: string;
}

export interface AgentCapabilityActivationProgressEvent {
  readonly id: string;
  readonly activationId: string;
  readonly conversationId: string;
  readonly target: AgentCapabilityActivationTarget;
  readonly action: AgentCapabilityActivationAction;
  readonly name: string;
  readonly step: AgentCapabilityActivationProgressStep;
  readonly status: AgentCapabilityActivationProgressStatus;
  readonly source: AgentCapabilityActivationSource;
  readonly requestedBy: AgentCapabilityActivationRequester;
  readonly reason?: string;
  readonly recordId?: string;
  readonly diagnostics?: readonly AgentCapabilityActivationDiagnostic[];
  readonly metadata?: Record<string, unknown>;
  readonly at: number;
}

export interface AgentCapabilityActivationResult {
  readonly ok: boolean;
  readonly intent: AgentCapabilityActivationIntent;
  readonly recordIds?: readonly string[];
  readonly diagnostics: readonly AgentCapabilityActivationDiagnostic[];
  readonly events: readonly AgentCapabilityActivationProgressEvent[];
}

export function isAgentCapabilityActivationSource(
  value: unknown,
): value is AgentCapabilityActivationSource {
  return includesString(AGENT_CAPABILITY_ACTIVATION_SOURCES, value);
}

export function isAgentCapabilityActivationTarget(
  value: unknown,
): value is AgentCapabilityActivationTarget {
  return includesString(AGENT_CAPABILITY_ACTIVATION_TARGETS, value);
}

export function isAgentCapabilityActivationAction(
  value: unknown,
): value is AgentCapabilityActivationAction {
  return includesString(AGENT_CAPABILITY_ACTIVATION_ACTIONS, value);
}

export function isAgentCapabilityActivationRequester(
  value: unknown,
): value is AgentCapabilityActivationRequester {
  return includesString(AGENT_CAPABILITY_ACTIVATION_REQUESTERS, value);
}

export function isAgentCapabilityActivationProgressStep(
  value: unknown,
): value is AgentCapabilityActivationProgressStep {
  return includesString(AGENT_CAPABILITY_ACTIVATION_PROGRESS_STEPS, value);
}

export function isAgentCapabilityActivationIntent(
  value: unknown,
): value is AgentCapabilityActivationIntent {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['conversationId']) &&
    isAgentCapabilityActivationSource(value['source']) &&
    isAgentCapabilityActivationTarget(value['target']) &&
    isAgentCapabilityActivationAction(value['action']) &&
    isNonEmptyString(value['name']) &&
    isAgentCapabilityActivationRequester(value['requestedBy']) &&
    (value['reason'] === undefined || typeof value['reason'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata'])) &&
    typeof value['createdAt'] === 'number'
  );
}

export function isAgentCapabilityActivationProgressEvent(
  value: unknown,
): value is AgentCapabilityActivationProgressEvent {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['activationId']) &&
    isNonEmptyString(value['conversationId']) &&
    isAgentCapabilityActivationTarget(value['target']) &&
    isAgentCapabilityActivationAction(value['action']) &&
    isNonEmptyString(value['name']) &&
    isAgentCapabilityActivationProgressStep(value['step']) &&
    isActivationProgressStatus(value['status']) &&
    isAgentCapabilityActivationSource(value['source']) &&
    isAgentCapabilityActivationRequester(value['requestedBy']) &&
    (value['reason'] === undefined || typeof value['reason'] === 'string') &&
    (value['recordId'] === undefined || typeof value['recordId'] === 'string') &&
    (value['metadata'] === undefined || isRecord(value['metadata'])) &&
    (value['diagnostics'] === undefined ||
      (Array.isArray(value['diagnostics']) &&
        value['diagnostics'].every(isAgentCapabilityActivationDiagnostic))) &&
    typeof value['at'] === 'number'
  );
}

export function createAgentCapabilityActivationIntent(input: {
  readonly conversationId: string;
  readonly source: AgentCapabilityActivationSource;
  readonly target: AgentCapabilityActivationTarget;
  readonly action: AgentCapabilityActivationAction;
  readonly name: string;
  readonly requestedBy: AgentCapabilityActivationRequester;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: number;
  readonly id?: string;
}): AgentCapabilityActivationIntent {
  return {
    id:
      input.id ??
      `capability:${input.conversationId}:${input.target}:${input.action}:${input.name}:${input.createdAt}`,
    conversationId: input.conversationId,
    source: input.source,
    target: input.target,
    action: input.action,
    name: input.name,
    requestedBy: input.requestedBy,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    createdAt: input.createdAt,
  };
}

export function createAgentCapabilityActivationProgressEvent(input: {
  readonly intent: AgentCapabilityActivationIntent;
  readonly step: AgentCapabilityActivationProgressStep;
  readonly status: AgentCapabilityActivationProgressStatus;
  readonly at: number;
  readonly recordId?: string;
  readonly diagnostics?: readonly AgentCapabilityActivationDiagnostic[];
  readonly metadata?: Record<string, unknown>;
  readonly id?: string;
}): AgentCapabilityActivationProgressEvent {
  return {
    id: input.id ?? `${input.intent.id}:${input.step}:${input.at}`,
    activationId: input.intent.id,
    conversationId: input.intent.conversationId,
    target: input.intent.target,
    action: input.intent.action,
    name: input.intent.name,
    step: input.step,
    status: input.status,
    source: input.intent.source,
    requestedBy: input.intent.requestedBy,
    ...(input.intent.reason !== undefined ? { reason: input.intent.reason } : {}),
    ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
    ...(input.diagnostics !== undefined ? { diagnostics: input.diagnostics } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    at: input.at,
  };
}

function isAgentCapabilityActivationDiagnostic(
  value: unknown,
): value is AgentCapabilityActivationDiagnostic {
  if (!isRecord(value)) return false;
  return (
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    isNonEmptyString(value['code']) &&
    isNonEmptyString(value['message']) &&
    (value['details'] === undefined || isRecord(value['details']))
  );
}

function isActivationProgressStatus(
  value: unknown,
): value is AgentCapabilityActivationProgressStatus {
  return value === 'pending' || value === 'running' || value === 'succeeded' || value === 'failed';
}

function includesString<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
