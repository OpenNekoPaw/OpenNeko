export const AGENT_CONVERSATION_CONTEXT_VERSION = 1 as const;

export interface AssistantSpaceProjection {
  readonly schemaVersion: typeof AGENT_CONVERSATION_CONTEXT_VERSION;
  readonly assistantSpaceId: string;
  readonly label: string;
}

export type AgentResourceGrantKind = 'file' | 'directory' | 'microphone';

export interface AgentResourceGrant {
  readonly schemaVersion: typeof AGENT_CONVERSATION_CONTEXT_VERSION;
  readonly resourceGrantId: string;
  readonly assistantSpaceId: string;
  readonly kind: AgentResourceGrantKind;
  readonly label: string;
}

export interface AgentScratchArtifactRef {
  readonly schemaVersion: typeof AGENT_CONVERSATION_CONTEXT_VERSION;
  readonly scratchArtifactId: string;
  readonly assistantSpaceId: string;
  readonly conversationId: string;
  readonly label: string;
  readonly mediaType?: string;
  readonly state: 'recoverable' | 'published';
}

export type AgentConversationContext =
  | {
      readonly schemaVersion: typeof AGENT_CONVERSATION_CONTEXT_VERSION;
      readonly kind: 'assistant';
      readonly assistantSpaceId: string;
      readonly baseGrantIds: readonly string[];
    }
  | {
      readonly schemaVersion: typeof AGENT_CONVERSATION_CONTEXT_VERSION;
      readonly kind: 'workspace';
      readonly workspaceId: string;
      readonly workspaceGrantId: string;
    };

export class AgentConversationContextError extends Error {
  readonly code:
    | 'invalid-agent-conversation-context'
    | 'unsupported-agent-conversation-context-version'
    | 'unresolved-agent-conversation-context-migration';

  constructor(code: AgentConversationContextError['code'], message: string) {
    super(message);
    this.name = 'AgentConversationContextError';
    this.code = code;
  }
}

export function parseAssistantSpaceProjection(value: unknown): AssistantSpaceProjection {
  const record = requireRecord(value, 'Assistant Space projection must be an object.');
  requireVersion(record['schemaVersion']);
  requireExactKeys(record, ['schemaVersion', 'assistantSpaceId', 'label'], 'Assistant Space');
  return {
    schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
    assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    label: requireIdentity(record['label'], 'Assistant Space label'),
  };
}

export function parseAgentResourceGrant(value: unknown): AgentResourceGrant {
  const record = requireRecord(value, 'Agent Resource grant must be an object.');
  requireVersion(record['schemaVersion']);
  requireExactKeys(
    record,
    ['schemaVersion', 'resourceGrantId', 'assistantSpaceId', 'kind', 'label'],
    'Agent Resource grant',
  );
  const kind = record['kind'];
  if (kind !== 'file' && kind !== 'directory' && kind !== 'microphone') {
    throw invalid(`Unknown Agent Resource grant kind '${String(kind)}'.`);
  }
  return {
    schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
    resourceGrantId: requireIdentity(record['resourceGrantId'], 'Agent Resource grant'),
    assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    kind,
    label: requireIdentity(record['label'], 'Agent Resource grant label'),
  };
}

export function parseAgentScratchArtifactRef(value: unknown): AgentScratchArtifactRef {
  const record = requireRecord(value, 'Agent Scratch artifact ref must be an object.');
  requireVersion(record['schemaVersion']);
  requireAllowedKeys(
    record,
    [
      'schemaVersion',
      'scratchArtifactId',
      'assistantSpaceId',
      'conversationId',
      'label',
      'mediaType',
      'state',
    ],
    ['schemaVersion', 'scratchArtifactId', 'assistantSpaceId', 'conversationId', 'label', 'state'],
    'Agent Scratch artifact ref',
  );
  const state = record['state'];
  if (state !== 'recoverable' && state !== 'published') {
    throw invalid(`Unknown Agent Scratch artifact state '${String(state)}'.`);
  }
  const mediaType = record['mediaType'];
  if (mediaType !== undefined && (typeof mediaType !== 'string' || mediaType.trim().length === 0)) {
    throw invalid('Agent Scratch artifact media type must be a non-empty string.');
  }
  return {
    schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
    scratchArtifactId: requireIdentity(record['scratchArtifactId'], 'Agent Scratch artifact'),
    assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    conversationId: requireIdentity(record['conversationId'], 'Agent Conversation'),
    label: requireIdentity(record['label'], 'Agent Scratch artifact label'),
    ...(mediaType === undefined ? {} : { mediaType }),
    state,
  };
}

export function parseAgentConversationContext(value: unknown): AgentConversationContext {
  const record = requireRecord(value, 'Agent Conversation context must be an object.');
  requireVersion(record['schemaVersion']);
  const kind = record['kind'];
  if (kind === 'assistant') {
    requireExactKeys(
      record,
      ['schemaVersion', 'kind', 'assistantSpaceId', 'baseGrantIds'],
      'Assistant Conversation context',
    );
    return {
      schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
      kind,
      assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
      baseGrantIds: requireIdentityArray(record['baseGrantIds'], 'Assistant Resource grants'),
    };
  }
  if (kind === 'workspace') {
    requireExactKeys(
      record,
      ['schemaVersion', 'kind', 'workspaceId', 'workspaceGrantId'],
      'Workspace Conversation context',
    );
    return {
      schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
      kind,
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    };
  }
  throw invalid(`Unknown Agent Conversation context kind '${String(kind)}'.`);
}

export function migrateAgentConversationContext(input: {
  readonly storedContext?: unknown;
  readonly exactWorkspaceIdentity?: {
    readonly workspaceId: string;
    readonly workspaceGrantId: string;
  };
}): AgentConversationContext {
  if (input.storedContext !== undefined) return parseAgentConversationContext(input.storedContext);
  if (!input.exactWorkspaceIdentity) {
    throw new AgentConversationContextError(
      'unresolved-agent-conversation-context-migration',
      'Legacy Agent conversation has no exact persisted Workspace identity.',
    );
  }
  return parseAgentConversationContext({
    schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
    kind: 'workspace',
    ...input.exactWorkspaceIdentity,
  });
}

function requireVersion(value: unknown): void {
  if (value !== AGENT_CONVERSATION_CONTEXT_VERSION) {
    throw new AgentConversationContextError(
      'unsupported-agent-conversation-context-version',
      `Unsupported Agent Conversation context version '${String(value)}'.`,
    );
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(message);
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${label} identity is required.`);
  }
  return value;
}

function requireIdentityArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw invalid(`${label} must be an array.`);
  const identities = value.map((entry) => requireIdentity(entry, label));
  if (new Set(identities).size !== identities.length) {
    throw invalid(`${label} must not contain duplicates.`);
  }
  return identities;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  requireAllowedKeys(record, keys, keys, label);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw invalid(`${label} contains unknown field '${unknown}'.`);
  const missing = requiredKeys.find((key) => !(key in record));
  if (missing) throw invalid(`${label} is missing field '${missing}'.`);
}

function invalid(message: string): AgentConversationContextError {
  return new AgentConversationContextError('invalid-agent-conversation-context', message);
}
