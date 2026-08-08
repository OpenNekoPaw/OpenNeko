export interface AssistantSpaceProjection {
  readonly assistantSpaceId: string;
  readonly label: string;
}

export type AgentResourceGrantKind = 'file' | 'directory' | 'microphone';

export interface AgentResourceGrant {
  readonly resourceGrantId: string;
  readonly assistantSpaceId: string;
  readonly kind: AgentResourceGrantKind;
  readonly label: string;
}

export interface AgentScratchArtifactRef {
  readonly scratchArtifactId: string;
  readonly assistantSpaceId: string;
  readonly conversationId: string;
  readonly label: string;
  readonly mediaType?: string;
  readonly state: 'recoverable' | 'published';
}

export class AgentConversationResourceContractError extends Error {
  readonly code: 'invalid-agent-conversation-resource-contract';

  constructor(code: AgentConversationResourceContractError['code'], message: string) {
    super(message);
    this.name = 'AgentConversationResourceContractError';
    this.code = code;
  }
}

export function parseAssistantSpaceProjection(value: unknown): AssistantSpaceProjection {
  const record = requireRecord(value, 'Assistant Space projection must be an object.');
  requireExactKeys(record, ['assistantSpaceId', 'label'], 'Assistant Space');
  return {
    assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    label: requireIdentity(record['label'], 'Assistant Space label'),
  };
}

export function parseAgentResourceGrant(value: unknown): AgentResourceGrant {
  const record = requireRecord(value, 'Agent Resource grant must be an object.');
  requireExactKeys(
    record,
    ['resourceGrantId', 'assistantSpaceId', 'kind', 'label'],
    'Agent Resource grant',
  );
  const kind = record['kind'];
  if (kind !== 'file' && kind !== 'directory' && kind !== 'microphone') {
    throw invalid(`Unknown Agent Resource grant kind '${String(kind)}'.`);
  }
  return {
    resourceGrantId: requireIdentity(record['resourceGrantId'], 'Agent Resource grant'),
    assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    kind,
    label: requireIdentity(record['label'], 'Agent Resource grant label'),
  };
}

export function parseAgentScratchArtifactRef(value: unknown): AgentScratchArtifactRef {
  const record = requireRecord(value, 'Agent Scratch artifact ref must be an object.');
  requireAllowedKeys(
    record,
    ['scratchArtifactId', 'assistantSpaceId', 'conversationId', 'label', 'mediaType', 'state'],
    ['scratchArtifactId', 'assistantSpaceId', 'conversationId', 'label', 'state'],
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
    scratchArtifactId: requireIdentity(record['scratchArtifactId'], 'Agent Scratch artifact'),
    assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    conversationId: requireIdentity(record['conversationId'], 'Agent Conversation'),
    label: requireIdentity(record['label'], 'Agent Scratch artifact label'),
    ...(mediaType === undefined ? {} : { mediaType }),
    state,
  };
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

function invalid(message: string): AgentConversationResourceContractError {
  return new AgentConversationResourceContractError(
    'invalid-agent-conversation-resource-contract',
    message,
  );
}
