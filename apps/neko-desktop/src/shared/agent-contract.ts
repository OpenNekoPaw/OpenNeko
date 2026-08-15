import {
  AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES,
  parseAgentWebviewToHostMessage,
  type AgentHostRouteUnavailableDiagnostic,
  type AgentHostToWebviewMessage,
  type AgentWebviewToHostMessage,
  type DesktopAgentConnectionIdentity,
  type DesktopAssistantAgentViewIdentity,
  type DesktopAgentViewIdentity,
} from '@neko/agent-contracts';

export const DESKTOP_AGENT_CHANNELS = {
  bootstrapGet: 'openneko:desktop:agent:bootstrap:get',
  connectionDetach: 'openneko:desktop:agent:connection:detach',
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

export type DesktopAgentRuntimeRequirement = (typeof DESKTOP_AGENT_RUNTIME_REQUIREMENTS)[number];

export interface DesktopWorkspaceAgentBootstrapRequest extends DesktopAgentViewIdentity {
  readonly requestId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly conversationId?: string;
}

export interface DesktopAssistantAgentBootstrapRequest extends DesktopAssistantAgentViewIdentity {
  readonly requestId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly conversationId: string;
}

export type DesktopAgentBootstrapRequest =
  DesktopWorkspaceAgentBootstrapRequest | DesktopAssistantAgentBootstrapRequest;

export interface DesktopAgentReadyBootstrapProjection {
  readonly requestId: string;
  readonly status: 'ready';
  readonly connection: DesktopAgentConnectionIdentity;
}

export interface DesktopAgentRuntimeUnavailableDiagnostic {
  readonly code: 'desktop-agent-capability-unavailable';
  readonly severity: 'error';
  readonly missingRequirements: readonly DesktopAgentRuntimeRequirement[];
  readonly message: string;
}

export interface DesktopAgentConversationUnavailableDiagnostic {
  readonly code: 'desktop-agent-conversation-unavailable';
  readonly severity: 'error';
  readonly conversationId: string;
  readonly fieldNames: readonly string[];
  readonly message: string;
}

export type DesktopAgentUnavailableDiagnostic =
  DesktopAgentRuntimeUnavailableDiagnostic | DesktopAgentConversationUnavailableDiagnostic;

export interface DesktopAgentUnavailableBootstrapProjection {
  readonly requestId: string;
  readonly status: 'unavailable';
  readonly diagnostic: DesktopAgentUnavailableDiagnostic;
}

export type DesktopAgentBootstrapProjection =
  DesktopAgentReadyBootstrapProjection | DesktopAgentUnavailableBootstrapProjection;

export interface DesktopAgentMessageRequest {
  readonly requestId: string;
  readonly connection: DesktopAgentConnectionIdentity;
  readonly message: AgentWebviewToHostMessage;
}

export interface DesktopAgentDetachRequest {
  readonly requestId: string;
  readonly connection: DesktopAgentConnectionIdentity;
}

export interface DesktopAgentDetachResult {
  readonly requestId: string;
  readonly status: 'detached';
}

export interface DesktopAgentAcceptedMessageResult {
  readonly requestId: string;
  readonly status: 'accepted';
}

export interface DesktopAgentUnavailableMessageResult {
  readonly requestId: string;
  readonly status: 'unavailable';
  readonly diagnostic:
    AgentHostRouteUnavailableDiagnostic | DesktopAgentConversationUnavailableDiagnostic;
}

export type DesktopAgentMessageResult =
  DesktopAgentAcceptedMessageResult | DesktopAgentUnavailableMessageResult;

export interface DesktopAgentMessageEvent {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly sequence: number;
  readonly message: AgentHostToWebviewMessage;
}

export interface DesktopAgentConnectionDetachedEvent {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly sequence: number;
  readonly status: 'detached';
}

export type DesktopAgentEvent = DesktopAgentMessageEvent | DesktopAgentConnectionDetachedEvent;

export interface OpenNekoDesktopAgentBridge {
  readonly agent: {
    getBootstrap(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      projectId: string,
      viewId: string,
      conversationId?: string,
    ): Promise<DesktopAgentBootstrapProjection>;
    getAssistantBootstrap(
      workbenchInstanceId: string,
      agentSurfaceId: string,
      assistantSpaceId: string,
      conversationId: string,
      viewId: string,
    ): Promise<DesktopAgentBootstrapProjection>;
    detach(connection: DesktopAgentConnectionIdentity): Promise<void>;
    send(connection: DesktopAgentConnectionIdentity, message: AgentWebviewToHostMessage): void;
    subscribe(
      connection: DesktopAgentConnectionIdentity,
      listener: (message: AgentHostToWebviewMessage) => void,
    ): () => void;
  };
}

export class DesktopAgentContractError extends Error {
  constructor(
    readonly code:
      | 'invalid-desktop-agent-payload'
      | 'desktop-agent-request-mismatch'
      | 'desktop-agent-identity-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'DesktopAgentContractError';
  }
}

export function createDesktopAgentBootstrapRequest(
  requestId: string,
  workbenchInstanceId: string,
  agentSurfaceId: string,
  projectId: string,
  viewId: string,
  conversationId?: string,
): DesktopAgentBootstrapRequest {
  return {
    requestId: requireNonEmptyString(requestId, 'Desktop Agent bootstrap requestId is required.'),
    workbenchInstanceId: requireNonEmptyString(
      workbenchInstanceId,
      'Desktop Agent Workbench instance identity is required.',
    ),
    agentSurfaceId: requireNonEmptyString(
      agentSurfaceId,
      'Desktop Agent Surface identity is required.',
    ),
    projectId: requireNonEmptyString(projectId, 'Desktop Agent Project identity is required.'),
    viewId: requireNonEmptyString(viewId, 'Desktop Agent View identity is required.'),
    ...(conversationId === undefined
      ? {}
      : {
          conversationId: requireNonEmptyString(
            conversationId,
            'Desktop Agent Conversation identity is required.',
          ),
        }),
  };
}

export function createDesktopAssistantAgentBootstrapRequest(
  requestId: string,
  workbenchInstanceId: string,
  agentSurfaceId: string,
  assistantSpaceId: string,
  conversationId: string,
  viewId: string,
): DesktopAssistantAgentBootstrapRequest {
  return {
    requestId: requireNonEmptyString(requestId, 'Desktop Agent bootstrap requestId is required.'),
    workbenchInstanceId: requireNonEmptyString(
      workbenchInstanceId,
      'Desktop Agent Workbench instance identity is required.',
    ),
    agentSurfaceId: requireNonEmptyString(
      agentSurfaceId,
      'Desktop Agent Surface identity is required.',
    ),
    assistantSpaceId: requireNonEmptyString(
      assistantSpaceId,
      'Desktop Agent Assistant Space identity is required.',
    ),
    conversationId: requireNonEmptyString(
      conversationId,
      'Desktop Agent Conversation identity is required.',
    ),
    viewId: requireNonEmptyString(viewId, 'Desktop Agent View identity is required.'),
  };
}

export function parseDesktopAgentBootstrapRequest(value: unknown): DesktopAgentBootstrapRequest {
  const record = requireRecord(value, 'Desktop Agent bootstrap request must be an object.');
  if ('assistantSpaceId' in record) {
    requireExactKeys(
      record,
      [
        'requestId',
        'workbenchInstanceId',
        'agentSurfaceId',
        'assistantSpaceId',
        'conversationId',
        'viewId',
      ],
      'Desktop Assistant Agent bootstrap request',
    );
    return createDesktopAssistantAgentBootstrapRequest(
      requireNonEmptyString(record['requestId'], 'Desktop Agent bootstrap requestId is required.'),
      requireNonEmptyString(
        record['workbenchInstanceId'],
        'Desktop Agent Workbench instance identity is required.',
      ),
      requireNonEmptyString(
        record['agentSurfaceId'],
        'Desktop Agent Surface identity is required.',
      ),
      requireNonEmptyString(
        record['assistantSpaceId'],
        'Desktop Agent Assistant Space identity is required.',
      ),
      requireNonEmptyString(
        record['conversationId'],
        'Desktop Agent Conversation identity is required.',
      ),
      requireNonEmptyString(record['viewId'], 'Desktop Agent bootstrap View identity is required.'),
    );
  }
  requireExactKeys(
    record,
    [
      'requestId',
      'workbenchInstanceId',
      'agentSurfaceId',
      'projectId',
      'viewId',
      ...('conversationId' in record ? ['conversationId'] : []),
    ],
    'Desktop Workspace Agent bootstrap request',
  );
  return createDesktopAgentBootstrapRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Agent bootstrap requestId is required.'),
    requireNonEmptyString(
      record['workbenchInstanceId'],
      'Desktop Agent Workbench instance identity is required.',
    ),
    requireNonEmptyString(record['agentSurfaceId'], 'Desktop Agent Surface identity is required.'),
    requireNonEmptyString(
      record['projectId'],
      'Desktop Agent bootstrap Project identity is required.',
    ),
    requireNonEmptyString(record['viewId'], 'Desktop Agent bootstrap View identity is required.'),
    'conversationId' in record
      ? requireNonEmptyString(
          record['conversationId'],
          'Desktop Agent Conversation identity is required.',
        )
      : undefined,
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
    requestId: requireNonEmptyString(requestId, 'Desktop Agent message requestId is required.'),
    connection: parseConnectionIdentity(connection),
    message: parsedMessage,
  };
}

export function createDesktopAgentDetachRequest(
  requestId: string,
  connection: DesktopAgentConnectionIdentity,
): DesktopAgentDetachRequest {
  return {
    requestId: requireNonEmptyString(requestId, 'Desktop Agent detach requestId is required.'),
    connection: parseConnectionIdentity(connection),
  };
}

export function parseDesktopAgentDetachRequest(value: unknown): DesktopAgentDetachRequest {
  const record = requireRecord(value, 'Desktop Agent detach request must be an object.');
  requireExactKeys(record, ['requestId', 'connection'], 'Desktop Agent detach request');
  return createDesktopAgentDetachRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Agent detach requestId is required.'),
    parseConnectionIdentity(record['connection']),
  );
}

export function parseDesktopAgentDetachResult(
  value: unknown,
  expectedRequestId?: string,
): DesktopAgentDetachResult {
  const record = requireRecord(value, 'Desktop Agent detach result must be an object.');
  const requestId = requireExpectedRequestId(record, expectedRequestId);
  requireExactKeys(record, ['requestId', 'status'], 'Desktop Agent detach result');
  if (record['status'] !== 'detached') {
    throw invalidPayload('Desktop Agent detach result status must be detached.');
  }
  return { requestId, status: 'detached' };
}

export function parseDesktopAgentMessageRequest(value: unknown): DesktopAgentMessageRequest {
  const record = requireRecord(value, 'Desktop Agent message request must be an object.');
  requireExactKeys(record, ['requestId', 'connection', 'message'], 'Desktop Agent message request');
  return createDesktopAgentMessageRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Agent message requestId is required.'),
    parseConnectionIdentity(record['connection']),
    record['message'],
  );
}

export function parseDesktopAgentBootstrapProjection(
  value: unknown,
  expectedRequestId?: string,
): DesktopAgentBootstrapProjection {
  const record = requireRecord(value, 'Desktop Agent bootstrap projection must be an object.');
  const requestId = requireExpectedRequestId(record, expectedRequestId);
  if (record['status'] === 'ready') {
    requireExactKeys(
      record,
      ['requestId', 'status', 'connection'],
      'Desktop Agent ready bootstrap projection',
    );
    return {
      requestId,
      status: 'ready',
      connection: parseConnectionIdentity(record['connection']),
    };
  }
  if (record['status'] === 'unavailable') {
    requireExactKeys(
      record,
      ['requestId', 'status', 'diagnostic'],
      'Desktop Agent unavailable bootstrap projection',
    );
    return {
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
  const requestId = requireExpectedRequestId(record, expectedRequestId);
  if (record['status'] === 'accepted') {
    requireExactKeys(record, ['requestId', 'status'], 'Desktop Agent accepted message result');
    return {
      requestId,
      status: 'accepted',
    };
  }
  if (record['status'] === 'unavailable') {
    requireExactKeys(
      record,
      ['requestId', 'status', 'diagnostic'],
      'Desktop Agent unavailable message result',
    );
    const diagnostic = requireRecord(
      record['diagnostic'],
      'Desktop Agent route diagnostic is required.',
    );
    if (diagnostic['code'] === 'desktop-agent-conversation-unavailable') {
      const conversationDiagnostic = parseUnavailableDiagnostic(diagnostic);
      if (conversationDiagnostic.code !== 'desktop-agent-conversation-unavailable') {
        throw invalidPayload('Desktop Agent Conversation diagnostic code is invalid.');
      }
      return {
        requestId,
        status: 'unavailable',
        diagnostic: conversationDiagnostic,
      };
    }
    const messageType = requireAgentMessageType(diagnostic['messageType']);
    const support = diagnostic['support'];
    const code = diagnostic['code'];
    if (
      (support !== 'unsupported' && support !== 'host-inapplicable') ||
      (code !== 'agent-host-route-unsupported' && code !== 'agent-host-route-inapplicable') ||
      (support === 'unsupported' && code !== 'agent-host-route-unsupported') ||
      (support === 'host-inapplicable' && code !== 'agent-host-route-inapplicable')
    ) {
      throw invalidPayload('Desktop Agent route diagnostic support is invalid.');
    }
    const owner = diagnostic['owner'];
    if (owner !== undefined && owner !== 'P1.4' && owner !== 'P1.6' && owner !== 'Phase 3') {
      throw invalidPayload('Desktop Agent route diagnostic owner is invalid.');
    }
    return {
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

export function parseDesktopAgentEvent(value: unknown): DesktopAgentEvent {
  const record = requireRecord(value, 'Desktop Agent event must be an object.');
  const connection = parseConnectionIdentity(record['connection']);
  const sequence = requirePositiveInteger(
    record['sequence'],
    'Desktop Agent event sequence must be a positive integer.',
  );
  if (record['status'] === 'detached') {
    requireExactKeys(
      record,
      ['connection', 'sequence', 'status'],
      'Desktop Agent connection detached event',
    );
    return { connection, sequence, status: 'detached' };
  }
  requireExactKeys(record, ['connection', 'sequence', 'message'], 'Desktop Agent message event');
  const message = record['message'];
  if (!isAgentHostToWebviewMessage(message)) {
    throw invalidPayload('Desktop Agent event message type is invalid.');
  }
  return {
    connection,
    sequence,
    message,
  };
}

export function parseDesktopAgentConnectionIdentity(
  value: unknown,
): DesktopAgentConnectionIdentity {
  const record = requireRecord(value, 'Desktop Agent connection identity is required.');
  const common = {
    applicationInstanceId: requireNonEmptyString(
      record['applicationInstanceId'],
      'Desktop Agent application instance identity is required.',
    ),
    windowId: requireNonEmptyString(
      record['windowId'],
      'Desktop Agent Window identity is required.',
    ),
    workbenchInstanceId: requireNonEmptyString(
      record['workbenchInstanceId'],
      'Desktop Agent Workbench instance identity is required.',
    ),
    agentSurfaceId: requireNonEmptyString(
      record['agentSurfaceId'],
      'Desktop Agent Surface identity is required.',
    ),
    workspaceId: requireNonEmptyString(
      record['workspaceId'],
      'Desktop Agent Workspace identity is required.',
    ),
    viewId: requireNonEmptyString(record['viewId'], 'Desktop Agent View identity is required.'),
    connectionId: requireNonEmptyString(
      record['connectionId'],
      'Desktop Agent connection identity is required.',
    ),
  };
  if ('assistantSpaceId' in record) {
    requireExactKeys(
      record,
      [
        'applicationInstanceId',
        'windowId',
        'workbenchInstanceId',
        'agentSurfaceId',
        'assistantSpaceId',
        'workspaceId',
        'viewId',
        'connectionId',
      ],
      'Desktop Assistant Agent connection identity',
    );
    return {
      ...common,
      assistantSpaceId: requireNonEmptyString(
        record['assistantSpaceId'],
        'Desktop Agent Assistant Space identity is required.',
      ),
    };
  }
  requireExactKeys(
    record,
    [
      'applicationInstanceId',
      'windowId',
      'workbenchInstanceId',
      'agentSurfaceId',
      'projectId',
      'workspaceId',
      'viewId',
      'connectionId',
    ],
    'Desktop Workspace Agent connection identity',
  );
  return {
    ...common,
    projectId: requireNonEmptyString(
      record['projectId'],
      'Desktop Agent Project identity is required.',
    ),
  };
}

const parseConnectionIdentity = parseDesktopAgentConnectionIdentity;

function parseUnavailableDiagnostic(value: unknown): DesktopAgentUnavailableDiagnostic {
  const record = requireRecord(value, 'Desktop Agent unavailable diagnostic is required.');
  if (record['code'] === 'desktop-agent-capability-unavailable') {
    requireExactKeys(
      record,
      ['code', 'severity', 'missingRequirements', 'message'],
      'Desktop Agent runtime unavailable diagnostic',
    );
    const missingRequirements = requireArray(
      record['missingRequirements'],
      'Desktop Agent missing requirements must be an array.',
    ).map(requireRuntimeRequirement);
    return {
      code: record['code'],
      severity: requireErrorSeverity(record['severity']),
      missingRequirements,
      message: requireNonEmptyString(
        record['message'],
        'Desktop Agent unavailable diagnostic message is required.',
      ),
    };
  }
  if (record['code'] === 'desktop-agent-conversation-unavailable') {
    requireExactKeys(
      record,
      ['code', 'severity', 'conversationId', 'fieldNames', 'message'],
      'Desktop Agent Conversation unavailable diagnostic',
    );
    const fieldNames = requireArray(
      record['fieldNames'],
      'Desktop Agent unavailable Conversation fields must be an array.',
    ).map((fieldName) =>
      requireNonEmptyString(
        fieldName,
        'Desktop Agent unavailable Conversation field name is required.',
      ),
    );
    if (fieldNames.length === 0 || new Set(fieldNames).size !== fieldNames.length) {
      throw invalidPayload(
        'Desktop Agent unavailable Conversation fields must be unique and non-empty.',
      );
    }
    return {
      code: record['code'],
      severity: requireErrorSeverity(record['severity']),
      conversationId: requireNonEmptyString(
        record['conversationId'],
        'Desktop Agent unavailable Conversation identity is required.',
      ),
      fieldNames,
      message: requireNonEmptyString(
        record['message'],
        'Desktop Agent unavailable Conversation diagnostic message is required.',
      ),
    };
  }
  throw invalidPayload('Desktop Agent unavailable diagnostic code is invalid.');
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

function requireRuntimeRequirement(value: unknown): DesktopAgentRuntimeRequirement {
  if (!isRuntimeRequirement(value)) {
    throw invalidPayload(`Unknown Desktop Agent runtime requirement '${String(value)}'.`);
  }
  return value;
}

function requireAgentMessageType(value: unknown): AgentWebviewToHostMessage['type'] {
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

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw invalidPayload(`${label} contains unsupported fields.`);
  }
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
  'agentInputCatalog',
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
  Exclude<AgentHostToWebviewMessage['type'], (typeof AGENT_HOST_TO_WEBVIEW_MESSAGE_TYPES)[number]>
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
