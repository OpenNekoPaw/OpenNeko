import {
  AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES,
  parseAgentWebviewToHostMessage,
  type AgentHostRouteUnavailableDiagnostic,
  type AgentHostToWebviewMessage,
  type AgentWebviewToHostMessage,
} from '@neko-agent/types';

export const DESKTOP_AGENT_CONTRACT_VERSION = 1 as const;

export const DESKTOP_AGENT_CHANNELS = {
  bootstrapGet: 'openneko:desktop:agent:bootstrap:get',
  messageSend: 'openneko:desktop:agent:message:send',
  messageEvent: 'openneko:desktop:agent:message:event',
} as const;

export const DESKTOP_AGENT_RUNTIME_REQUIREMENTS = [
  'pi-runtime',
  'conversation-effects',
  'config-effects',
  'skill-effects',
  'content-effects',
  'projection-effects',
] as const;

export type DesktopAgentRuntimeRequirement =
  (typeof DESKTOP_AGENT_RUNTIME_REQUIREMENTS)[number];

export interface DesktopAgentViewIdentity {
  readonly projectId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
}

export interface DesktopAgentConnectionIdentity extends DesktopAgentViewIdentity {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workspaceId: string;
  readonly rendererEpoch: number;
  readonly connectionId: string;
}

export interface DesktopAgentBootstrapRequest extends DesktopAgentViewIdentity {
  readonly schemaVersion: typeof DESKTOP_AGENT_CONTRACT_VERSION;
  readonly requestId: string;
}

export interface DesktopAgentReadyBootstrapProjection {
  readonly schemaVersion: typeof DESKTOP_AGENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'ready';
  readonly connection: DesktopAgentConnectionIdentity;
}

export interface DesktopAgentUnavailableDiagnostic {
  readonly code: 'desktop-agent-capability-unavailable';
  readonly severity: 'error';
  readonly missingRequirements: readonly DesktopAgentRuntimeRequirement[];
  readonly message: string;
}

export interface DesktopAgentUnavailableBootstrapProjection {
  readonly schemaVersion: typeof DESKTOP_AGENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'unavailable';
  readonly diagnostic: DesktopAgentUnavailableDiagnostic;
}

export type DesktopAgentBootstrapProjection =
  | DesktopAgentReadyBootstrapProjection
  | DesktopAgentUnavailableBootstrapProjection;

export interface DesktopAgentMessageRequest {
  readonly schemaVersion: typeof DESKTOP_AGENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly connection: DesktopAgentConnectionIdentity;
  readonly message: AgentWebviewToHostMessage;
}

export interface DesktopAgentAcceptedMessageResult {
  readonly schemaVersion: typeof DESKTOP_AGENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'accepted';
}

export interface DesktopAgentUnavailableMessageResult {
  readonly schemaVersion: typeof DESKTOP_AGENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'unavailable';
  readonly diagnostic: AgentHostRouteUnavailableDiagnostic;
}

export type DesktopAgentMessageResult =
  | DesktopAgentAcceptedMessageResult
  | DesktopAgentUnavailableMessageResult;

export interface DesktopAgentMessageEvent {
  readonly schemaVersion: typeof DESKTOP_AGENT_CONTRACT_VERSION;
  readonly connection: DesktopAgentConnectionIdentity;
  readonly sequence: number;
  readonly message: AgentHostToWebviewMessage;
}

export interface OpenNekoDesktopAgentBridge {
  readonly agent: {
    getBootstrap(
      projectId: string,
      viewId: string,
      viewEpoch: number,
    ): Promise<DesktopAgentBootstrapProjection>;
    send(message: AgentWebviewToHostMessage): void;
    subscribe(listener: (message: AgentHostToWebviewMessage) => void): () => void;
  };
}

export class DesktopAgentContractError extends Error {
  constructor(
    readonly code:
      | 'invalid-desktop-agent-payload'
      | 'unsupported-desktop-agent-version'
      | 'desktop-agent-request-mismatch'
      | 'desktop-agent-identity-mismatch'
      | 'desktop-agent-stale-renderer-epoch'
      | 'desktop-agent-stale-view-epoch',
    message: string,
  ) {
    super(message);
    this.name = 'DesktopAgentContractError';
  }
}

export function createDesktopAgentBootstrapRequest(
  requestId: string,
  projectId: string,
  viewId: string,
  viewEpoch: number,
): DesktopAgentBootstrapRequest {
  return {
    schemaVersion: DESKTOP_AGENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Agent bootstrap requestId is required.'),
    projectId: requireNonEmptyString(projectId, 'Desktop Agent Project identity is required.'),
    viewId: requireNonEmptyString(viewId, 'Desktop Agent View identity is required.'),
    viewEpoch: requirePositiveInteger(
      viewEpoch,
      'Desktop Agent View epoch must be a positive integer.',
    ),
  };
}

export function parseDesktopAgentBootstrapRequest(
  value: unknown,
): DesktopAgentBootstrapRequest {
  const record = requireRecord(value, 'Desktop Agent bootstrap request must be an object.');
  requireVersion(record['schemaVersion']);
  return createDesktopAgentBootstrapRequest(
    requireNonEmptyString(
      record['requestId'],
      'Desktop Agent bootstrap requestId is required.',
    ),
    requireNonEmptyString(
      record['projectId'],
      'Desktop Agent bootstrap Project identity is required.',
    ),
    requireNonEmptyString(
      record['viewId'],
      'Desktop Agent bootstrap View identity is required.',
    ),
    requirePositiveInteger(
      record['viewEpoch'],
      'Desktop Agent bootstrap View epoch must be a positive integer.',
    ),
  );
}

export function createDesktopAgentMessageRequest(
  requestId: string,
  connection: DesktopAgentConnectionIdentity,
  message: unknown,
): DesktopAgentMessageRequest {
  const parsedMessage = parseAgentWebviewToHostMessage(message);
  if (!parsedMessage) {
    throw invalidPayload('Desktop Agent message is not a valid Agent Webview-to-Host message.');
  }
  return {
    schemaVersion: DESKTOP_AGENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Agent message requestId is required.'),
    connection: parseConnectionIdentity(connection),
    message: parsedMessage,
  };
}

export function parseDesktopAgentMessageRequest(value: unknown): DesktopAgentMessageRequest {
  const record = requireRecord(value, 'Desktop Agent message request must be an object.');
  requireVersion(record['schemaVersion']);
  return createDesktopAgentMessageRequest(
    requireNonEmptyString(
      record['requestId'],
      'Desktop Agent message requestId is required.',
    ),
    parseConnectionIdentity(record['connection']),
    record['message'],
  );
}

export function parseDesktopAgentBootstrapProjection(
  value: unknown,
  expectedRequestId?: string,
): DesktopAgentBootstrapProjection {
  const record = requireRecord(value, 'Desktop Agent bootstrap projection must be an object.');
  requireVersion(record['schemaVersion']);
  const requestId = requireExpectedRequestId(record, expectedRequestId);
  if (record['status'] === 'ready') {
    return {
      schemaVersion: DESKTOP_AGENT_CONTRACT_VERSION,
      requestId,
      status: 'ready',
      connection: parseConnectionIdentity(record['connection']),
    };
  }
  if (record['status'] === 'unavailable') {
    return {
      schemaVersion: DESKTOP_AGENT_CONTRACT_VERSION,
      requestId,
      status: 'unavailable',
      diagnostic: parseUnavailableDiagnostic(record['diagnostic']),
    };
  }
  throw invalidPayload('Desktop Agent bootstrap status must be ready or unavailable.');
}

export function parseDesktopAgentMessageResult(
  value: unknown,
  expectedRequestId?: string,
): DesktopAgentMessageResult {
  const record = requireRecord(value, 'Desktop Agent message result must be an object.');
  requireVersion(record['schemaVersion']);
  const requestId = requireExpectedRequestId(record, expectedRequestId);
  if (record['status'] === 'accepted') {
    return {
      schemaVersion: DESKTOP_AGENT_CONTRACT_VERSION,
      requestId,
      status: 'accepted',
    };
  }
  if (record['status'] === 'unavailable') {
    const diagnostic = requireRecord(
      record['diagnostic'],
      'Desktop Agent route diagnostic is required.',
    );
    const messageType = requireAgentMessageType(diagnostic['messageType']);
    const support = diagnostic['support'];
    const code = diagnostic['code'];
    if (
      (support !== 'unsupported' && support !== 'host-inapplicable') ||
      (code !== 'agent-host-route-unsupported' &&
        code !== 'agent-host-route-inapplicable') ||
      (support === 'unsupported' && code !== 'agent-host-route-unsupported') ||
      (support === 'host-inapplicable' && code !== 'agent-host-route-inapplicable')
    ) {
      throw invalidPayload('Desktop Agent route diagnostic support is invalid.');
    }
    const owner = diagnostic['owner'];
    if (
      owner !== undefined &&
      owner !== 'P1.4' &&
      owner !== 'P1.6' &&
      owner !== 'Phase 3'
    ) {
      throw invalidPayload('Desktop Agent route diagnostic owner is invalid.');
    }
    return {
      schemaVersion: DESKTOP_AGENT_CONTRACT_VERSION,
      requestId,
      status: 'unavailable',
      diagnostic: {
        code,
        severity: requireErrorSeverity(diagnostic['severity']),
        hostKind: requireElectronHostKind(diagnostic['hostKind']),
        messageType,
        support,
        ...(owner === undefined ? {} : { owner }),
        message: requireNonEmptyString(
          diagnostic['message'],
          'Desktop Agent route diagnostic message is required.',
        ),
      },
    };
  }
  throw invalidPayload('Desktop Agent message result status is invalid.');
}

export function parseDesktopAgentMessageEvent(value: unknown): DesktopAgentMessageEvent {
  const record = requireRecord(value, 'Desktop Agent message event must be an object.');
  requireVersion(record['schemaVersion']);
  const message = record['message'];
  if (!isAgentHostToWebviewMessage(message)) {
    throw invalidPayload('Desktop Agent event message type is invalid.');
  }
  return {
    schemaVersion: DESKTOP_AGENT_CONTRACT_VERSION,
    connection: parseConnectionIdentity(record['connection']),
    sequence: requirePositiveInteger(
      record['sequence'],
      'Desktop Agent event sequence must be a positive integer.',
    ),
    message,
  };
}

function parseConnectionIdentity(value: unknown): DesktopAgentConnectionIdentity {
  const record = requireRecord(value, 'Desktop Agent connection identity is required.');
  return {
    applicationInstanceId: requireNonEmptyString(
      record['applicationInstanceId'],
      'Desktop Agent application instance identity is required.',
    ),
    windowId: requireNonEmptyString(
      record['windowId'],
      'Desktop Agent Window identity is required.',
    ),
    projectId: requireNonEmptyString(
      record['projectId'],
      'Desktop Agent Project identity is required.',
    ),
    workspaceId: requireNonEmptyString(
      record['workspaceId'],
      'Desktop Agent Workspace identity is required.',
    ),
    viewId: requireNonEmptyString(
      record['viewId'],
      'Desktop Agent View identity is required.',
    ),
    viewEpoch: requirePositiveInteger(
      record['viewEpoch'],
      'Desktop Agent View epoch must be a positive integer.',
    ),
    rendererEpoch: requirePositiveInteger(
      record['rendererEpoch'],
      'Desktop Agent renderer epoch must be a positive integer.',
    ),
    connectionId: requireNonEmptyString(
      record['connectionId'],
      'Desktop Agent connection identity is required.',
    ),
  };
}

function parseUnavailableDiagnostic(value: unknown): DesktopAgentUnavailableDiagnostic {
  const record = requireRecord(value, 'Desktop Agent unavailable diagnostic is required.');
  if (record['code'] !== 'desktop-agent-capability-unavailable') {
    throw invalidPayload('Desktop Agent unavailable diagnostic code is invalid.');
  }
  const missingRequirements = requireArray(
    record['missingRequirements'],
    'Desktop Agent missing requirements must be an array.',
  ).map(requireRuntimeRequirement);
  return {
    code: 'desktop-agent-capability-unavailable',
    severity: requireErrorSeverity(record['severity']),
    missingRequirements,
    message: requireNonEmptyString(
      record['message'],
      'Desktop Agent unavailable diagnostic message is required.',
    ),
  };
}

function requireExpectedRequestId(
  record: Readonly<Record<string, unknown>>,
  expectedRequestId?: string,
): string {
  const requestId = requireNonEmptyString(
    record['requestId'],
    'Desktop Agent response requestId is required.',
  );
  if (expectedRequestId !== undefined && requestId !== expectedRequestId) {
    throw new DesktopAgentContractError(
      'desktop-agent-request-mismatch',
      `Desktop Agent response '${requestId}' does not match request '${expectedRequestId}'.`,
    );
  }
  return requestId;
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_AGENT_CONTRACT_VERSION) {
    throw new DesktopAgentContractError(
      'unsupported-desktop-agent-version',
      `Unsupported Desktop Agent contract version '${String(value)}'.`,
    );
  }
}

function requireRuntimeRequirement(value: unknown): DesktopAgentRuntimeRequirement {
  if (!isRuntimeRequirement(value)) {
    throw invalidPayload(`Unknown Desktop Agent runtime requirement '${String(value)}'.`);
  }
  return value;
}

function requireAgentMessageType(
  value: unknown,
): AgentWebviewToHostMessage['type'] {
  if (!isAgentWebviewToHostMessageType(value)) {
    throw invalidPayload(`Unknown Desktop Agent route '${String(value)}'.`);
  }
  return value;
}

function requireElectronHostKind(value: unknown): 'electron' {
  if (value !== 'electron') {
    throw invalidPayload('Desktop Agent route diagnostic hostKind must be electron.');
  }
  return value;
}

function requireErrorSeverity(value: unknown): 'error' {
  if (value !== 'error') {
    throw invalidPayload('Desktop Agent diagnostic severity must be error.');
  }
  return value;
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalidPayload(message);
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw invalidPayload(message);
  }
  return value;
}

const AGENT_HOST_TO_WEBVIEW_MESSAGE_TYPES = [
  'messageQueued',
  'messageQueueSnapshot',
  'queuedMessageEditRequested',
  'messageQueueError',
  'agentPhase',
  'agentStateSnapshot',
  'error',
  'globalError',
  'sessionDiagnostic',
  'historyCleared',
  'conversationList',
  'activeConversation',
  'conversationSnapshot',
  'settingsData',
  'projectFiles',
  'configState',
  'configChanged',
  'settingsUpdated',
  'modelAdded',
  'modelRemoved',
  'pluginCommands',
  'pluginsAvailable',
  'subagentEvent',
  'tabState',
  'slashCommandResult',
  'agentCapabilityLifecycleResult',
  'agentCapabilityActivationProgress',
  'characterDialogueSessionStarted',
  'characterDialogueSessionExited',
  'embodyCharacterSessionStarted',
  'embodyCharacterSessionExited',
  'skillsList',
  'contextTokenCount',
  'compressionResult',
  'compressionError',
  'externalMessage',
  'prefillInput',
  'injectContext',
  'ambientCanvasUpdate',
  'projectionEndpointReady',
  'projectionSnapshot',
  'projectionPatch',
  'projectionDetach',
  'projectionProtocolDiagnostic',
] as const satisfies readonly AgentHostToWebviewMessage['type'][];

type AssertNever<Value extends never> = Value;
export type DesktopAgentHostMessageTypeCoverage = AssertNever<
  Exclude<
    AgentHostToWebviewMessage['type'],
    (typeof AGENT_HOST_TO_WEBVIEW_MESSAGE_TYPES)[number]
  >
>;

function isAgentHostToWebviewMessage(value: unknown): value is AgentHostToWebviewMessage {
  if (!isRecord(value)) return false;
  const type = Reflect.get(value, 'type');
  return (
    typeof type === 'string' &&
    AGENT_HOST_TO_WEBVIEW_MESSAGE_TYPES.some((messageType) => messageType === type)
  );
}

function isRuntimeRequirement(value: unknown): value is DesktopAgentRuntimeRequirement {
  return (
    typeof value === 'string' &&
    DESKTOP_AGENT_RUNTIME_REQUIREMENTS.some((requirement) => requirement === value)
  );
}

function isAgentWebviewToHostMessageType(
  value: unknown,
): value is AgentWebviewToHostMessage['type'] {
  return (
    typeof value === 'string' &&
    AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES.some((messageType) => messageType === value)
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPayload(message: string): DesktopAgentContractError {
  return new DesktopAgentContractError('invalid-desktop-agent-payload', message);
}
