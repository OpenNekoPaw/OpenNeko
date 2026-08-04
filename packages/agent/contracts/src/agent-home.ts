export const AGENT_HOME_PROJECTION_VERSION = 1 as const;

export interface AgentHomeAttentionProjection {
  readonly needsInput: number;
  readonly needsReview: number;
  readonly running: number;
}

export type AgentHomeAttentionStatus = 'none' | 'needs-input' | 'needs-review' | 'running';

export type AgentHomeActivityKind =
  | 'conversation-updated'
  | 'turn-running'
  | 'turn-completed'
  | 'turn-cancelled'
  | 'turn-failed'
  | 'tool-confirmation-required';

export type AgentConversationOwnerRef =
  | {
      readonly kind: 'assistant';
      readonly assistantSpaceId: string;
    }
  | {
      readonly kind: 'workspace';
      readonly workspaceId: string;
    }
  | {
      readonly kind: 'character';
      readonly characterId: string;
      readonly characterRunId: string;
    }
  | {
      readonly kind: 'room';
      readonly roomId: string;
      readonly roomRunId: string;
    };

export interface AgentHomeNavigationIdentity {
  readonly conversationId: string;
  readonly owner: AgentConversationOwnerRef;
}

export interface AgentHomeActivitySummary {
  readonly kind: AgentHomeActivityKind;
  readonly occurredAt: string;
  readonly turnId?: string;
  readonly runId?: string;
  readonly toolCallId?: string;
  readonly generationJob?: {
    readonly jobId: string;
    readonly revision: number;
    readonly phase: string;
  };
}

export interface AgentHomeConversationSummary {
  readonly navigation: AgentHomeNavigationIdentity;
  readonly groupedProjectId?: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly attention: AgentHomeAttentionStatus;
  readonly lastActivity: AgentHomeActivitySummary;
}

export interface AgentHomeProjection {
  readonly schemaVersion: typeof AGENT_HOME_PROJECTION_VERSION;
  readonly revision: number;
  readonly conversations: readonly AgentHomeConversationSummary[];
  readonly attention: AgentHomeAttentionProjection;
}

export class AgentHomeContractError extends Error {
  readonly code: 'invalid-agent-home-projection' | 'unsupported-agent-home-projection-version';

  constructor(code: AgentHomeContractError['code'], message: string) {
    super(message);
    this.name = 'AgentHomeContractError';
    this.code = code;
  }
}

export function parseAgentConversationOwnerRef(value: unknown): AgentConversationOwnerRef {
  const record = requireRecord(value, 'Agent Conversation owner must be an object.');
  const kind = record['kind'];
  if (kind === 'assistant') {
    requireExactKeys(record, ['kind', 'assistantSpaceId'], 'Assistant Conversation owner');
    return Object.freeze({
      kind,
      assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
    });
  }
  if (kind === 'workspace') {
    requireExactKeys(record, ['kind', 'workspaceId'], 'Workspace Conversation owner');
    return Object.freeze({
      kind,
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    });
  }
  if (kind === 'character') {
    requireExactKeys(
      record,
      ['kind', 'characterId', 'characterRunId'],
      'Character Conversation owner',
    );
    return Object.freeze({
      kind,
      characterId: requireIdentity(record['characterId'], 'Character'),
      characterRunId: requireIdentity(record['characterRunId'], 'Character Run'),
    });
  }
  if (kind === 'room') {
    requireExactKeys(record, ['kind', 'roomId', 'roomRunId'], 'Room Conversation owner');
    return Object.freeze({
      kind,
      roomId: requireIdentity(record['roomId'], 'Room'),
      roomRunId: requireIdentity(record['roomRunId'], 'Room Run'),
    });
  }
  throw invalid(`Unknown Agent Conversation owner kind '${String(kind)}'.`);
}

export function parseAgentHomeNavigationIdentity(value: unknown): AgentHomeNavigationIdentity {
  const record = requireRecord(value, 'Agent Home navigation identity must be an object.');
  requireExactKeys(record, ['conversationId', 'owner'], 'Agent Home navigation identity');
  return Object.freeze({
    conversationId: requireIdentity(record['conversationId'], 'Agent Conversation'),
    owner: parseAgentConversationOwnerRef(record['owner']),
  });
}

export function parseAgentHomeConversationSummary(value: unknown): AgentHomeConversationSummary {
  const record = requireRecord(value, 'Agent Home conversation summary must be an object.');
  requireAllowedKeys(
    record,
    ['navigation', 'groupedProjectId', 'title', 'updatedAt', 'attention', 'lastActivity'],
    ['navigation', 'title', 'updatedAt', 'attention', 'lastActivity'],
    'Agent Home conversation summary',
  );
  const groupedProjectId = record['groupedProjectId'];
  return Object.freeze({
    navigation: parseAgentHomeNavigationIdentity(record['navigation']),
    ...(groupedProjectId === undefined
      ? {}
      : { groupedProjectId: requireIdentity(groupedProjectId, 'Grouped Project') }),
    title: requireIdentity(record['title'], 'Agent Conversation title'),
    updatedAt: requireIsoDateString(record['updatedAt'], 'Agent Conversation updatedAt'),
    attention: parseAttention(record['attention']),
    lastActivity: parseActivity(record['lastActivity']),
  });
}

export function parseAgentHomeProjection(value: unknown): AgentHomeProjection {
  const record = requireRecord(value, 'Agent Home projection must be an object.');
  requireExactKeys(
    record,
    ['schemaVersion', 'revision', 'conversations', 'attention'],
    'Agent Home projection',
  );
  if (record['schemaVersion'] !== AGENT_HOME_PROJECTION_VERSION) {
    throw new AgentHomeContractError(
      'unsupported-agent-home-projection-version',
      `Unsupported Agent Home projection version '${String(record['schemaVersion'])}'.`,
    );
  }
  const conversations = requireArray(record['conversations'], 'Agent Home conversations').map(
    parseAgentHomeConversationSummary,
  );
  const identities = conversations.map((conversation) => conversation.navigation.conversationId);
  if (new Set(identities).size !== identities.length) {
    throw invalid('Agent Home projection contains duplicate Conversation identities.');
  }
  const attention = requireRecord(record['attention'], 'Agent Home attention must be an object.');
  requireExactKeys(attention, ['needsInput', 'needsReview', 'running'], 'Agent Home attention');
  return Object.freeze({
    schemaVersion: AGENT_HOME_PROJECTION_VERSION,
    revision: requireNonNegativeInteger(record['revision'], 'Agent Home revision'),
    conversations: Object.freeze(conversations),
    attention: Object.freeze({
      needsInput: requireNonNegativeInteger(attention['needsInput'], 'needsInput'),
      needsReview: requireNonNegativeInteger(attention['needsReview'], 'needsReview'),
      running: requireNonNegativeInteger(attention['running'], 'running'),
    }),
  });
}

export function isSameAgentConversationOwner(
  left: AgentConversationOwnerRef,
  right: AgentConversationOwnerRef,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'assistant':
      return right.kind === 'assistant' && left.assistantSpaceId === right.assistantSpaceId;
    case 'workspace':
      return right.kind === 'workspace' && left.workspaceId === right.workspaceId;
    case 'character':
      return (
        right.kind === 'character' &&
        left.characterId === right.characterId &&
        left.characterRunId === right.characterRunId
      );
    case 'room':
      return (
        right.kind === 'room' && left.roomId === right.roomId && left.roomRunId === right.roomRunId
      );
  }
}

function parseActivity(value: unknown): AgentHomeActivitySummary {
  const record = requireRecord(value, 'Agent Home activity must be an object.');
  requireAllowedKeys(
    record,
    ['kind', 'occurredAt', 'turnId', 'runId', 'toolCallId', 'generationJob'],
    ['kind', 'occurredAt'],
    'Agent Home activity',
  );
  const kind = record['kind'];
  if (
    kind !== 'conversation-updated' &&
    kind !== 'turn-running' &&
    kind !== 'turn-completed' &&
    kind !== 'turn-cancelled' &&
    kind !== 'turn-failed' &&
    kind !== 'tool-confirmation-required'
  ) {
    throw invalid(`Unknown Agent Home activity kind '${String(kind)}'.`);
  }
  const generationJobValue = record['generationJob'];
  let generationJob: AgentHomeActivitySummary['generationJob'];
  if (generationJobValue !== undefined) {
    const job = requireRecord(generationJobValue, 'Generation Job summary must be an object.');
    requireExactKeys(job, ['jobId', 'revision', 'phase'], 'Generation Job summary');
    generationJob = Object.freeze({
      jobId: requireIdentity(job['jobId'], 'Generation Job'),
      revision: requireNonNegativeInteger(job['revision'], 'Generation Job revision'),
      phase: requireIdentity(job['phase'], 'Generation Job phase'),
    });
  }
  return Object.freeze({
    kind,
    occurredAt: requireIsoDateString(record['occurredAt'], 'Agent Home activity occurredAt'),
    ...optionalIdentity(record, 'turnId', 'Agent Turn'),
    ...optionalIdentity(record, 'runId', 'Agent Run'),
    ...optionalIdentity(record, 'toolCallId', 'Agent Tool Call'),
    ...(generationJob === undefined ? {} : { generationJob }),
  });
}

function parseAttention(value: unknown): AgentHomeAttentionStatus {
  if (
    value !== 'none' &&
    value !== 'needs-input' &&
    value !== 'needs-review' &&
    value !== 'running'
  ) {
    throw invalid(`Unknown Agent Home attention status '${String(value)}'.`);
  }
  return value;
}

function optionalIdentity(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): Readonly<Record<string, string>> {
  const value = record[key];
  return value === undefined ? {} : { [key]: requireIdentity(value, label) };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalid(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalid(`${label} must be an array.`);
  return value;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${label} identity is required.`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalid(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireIsoDateString(value: unknown, label: string): string {
  const source = requireIdentity(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(source)) {
    throw invalid(`${label} must be an ISO timestamp.`);
  }
  return source;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  requireAllowedKeys(record, keys, keys, label);
}

function requireAllowedKeys(
  record: Readonly<Record<string, unknown>>,
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

function invalid(message: string): AgentHomeContractError {
  return new AgentHomeContractError('invalid-agent-home-projection', message);
}
