import {
  AGENT_CONVERSATION_CONTEXT_VERSION,
  parseAgentConversationContext,
  type AgentConversationContext,
} from './agent-conversation-context';

export interface AgentDraftSubmitInput {
  readonly schemaVersion: typeof AGENT_CONVERSATION_CONTEXT_VERSION;
  readonly target: AgentDraftSubmitTarget;
  readonly messageText: string;
  readonly resourceGrantIds: readonly string[];
  readonly configuration: {
    readonly providerId: string;
    readonly modelId: string;
    readonly executionMode: 'plan' | 'ask' | 'auto';
  };
}

export type AgentDraftSubmitTarget =
  | {
      readonly kind: 'automatic-assistant';
      readonly draftId: string;
    }
  | {
      readonly kind: 'bound-context';
      readonly context: AgentConversationContext;
    };

export interface AgentDraftSubmitProjection {
  readonly schemaVersion: typeof AGENT_CONVERSATION_CONTEXT_VERSION;
  readonly conversationId: string;
  readonly turnId: string;
  readonly turnStatus: 'pending' | 'running' | 'failed';
  readonly diagnostic?: string;
}

export function parseAgentDraftSubmitInput(value: unknown): AgentDraftSubmitInput {
  const record = requireRecord(value, 'Agent draft submit input must be an object.');
  requireVersion(record['schemaVersion']);
  requireExactKeys(
    record,
    ['schemaVersion', 'target', 'messageText', 'resourceGrantIds', 'configuration'],
    'Agent draft submit input',
  );
  const configuration = requireRecord(
    record['configuration'],
    'Agent draft submit configuration must be an object.',
  );
  requireExactKeys(
    configuration,
    ['providerId', 'modelId', 'executionMode'],
    'Agent draft submit configuration',
  );
  const executionMode = configuration['executionMode'];
  if (executionMode !== 'plan' && executionMode !== 'ask' && executionMode !== 'auto') {
    throw new Error(`Unknown Agent draft execution mode '${String(executionMode)}'.`);
  }
  return {
    schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
    target: parseTarget(record['target']),
    messageText: requireIdentity(record['messageText'], 'message'),
    resourceGrantIds: requireIdentityArray(record['resourceGrantIds'], 'Resource grant'),
    configuration: {
      providerId: requireIdentity(configuration['providerId'], 'Provider'),
      modelId: requireIdentity(configuration['modelId'], 'Model'),
      executionMode,
    },
  };
}

function parseTarget(value: unknown): AgentDraftSubmitTarget {
  const record = requireRecord(value, 'Agent draft submit target must be an object.');
  if (record['kind'] === 'automatic-assistant') {
    requireExactKeys(record, ['kind', 'draftId'], 'Automatic Assistant draft target');
    return {
      kind: 'automatic-assistant',
      draftId: requireIdentity(record['draftId'], 'Draft'),
    };
  }
  if (record['kind'] === 'bound-context') {
    requireExactKeys(record, ['kind', 'context'], 'Bound Agent draft target');
    return { kind: 'bound-context', context: parseAgentConversationContext(record['context']) };
  }
  throw new Error(`Unknown Agent draft submit target '${String(record['kind'])}'.`);
}

export function parseAgentDraftSubmitProjection(value: unknown): AgentDraftSubmitProjection {
  const record = requireRecord(value, 'Agent draft submit projection must be an object.');
  requireVersion(record['schemaVersion']);
  const allowed = ['schemaVersion', 'conversationId', 'turnId', 'turnStatus', 'diagnostic'];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown)
    throw new Error(`Agent draft submit projection contains unknown field '${unknown}'.`);
  for (const required of ['schemaVersion', 'conversationId', 'turnId', 'turnStatus']) {
    if (!(required in record)) {
      throw new Error(`Agent draft submit projection is missing field '${required}'.`);
    }
  }
  const turnStatus = record['turnStatus'];
  if (turnStatus !== 'pending' && turnStatus !== 'running' && turnStatus !== 'failed') {
    throw new Error(`Unknown Agent draft turn status '${String(turnStatus)}'.`);
  }
  const diagnostic = record['diagnostic'];
  if (
    diagnostic !== undefined &&
    (typeof diagnostic !== 'string' || diagnostic.trim().length === 0)
  ) {
    throw new Error('Agent draft submit diagnostic must be a non-empty string.');
  }
  return {
    schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
    conversationId: requireIdentity(record['conversationId'], 'Conversation'),
    turnId: requireIdentity(record['turnId'], 'Turn'),
    turnStatus,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

function requireVersion(value: unknown): void {
  if (value !== AGENT_CONVERSATION_CONTEXT_VERSION) {
    throw new Error(`Unsupported Agent draft submit version '${String(value)}'.`);
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent draft ${label} identity is required.`);
  }
  return value;
}

function requireIdentityArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Agent draft ${label} list must be an array.`);
  const identities = value.map((entry) => requireIdentity(entry, label));
  if (new Set(identities).size !== identities.length) {
    throw new Error(`Agent draft ${label} list must not contain duplicates.`);
  }
  return identities;
}
