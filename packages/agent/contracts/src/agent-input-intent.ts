export type AgentDraftInputIntent =
  | { readonly kind: 'message'; readonly text: string }
  | {
      readonly kind: 'command';
      readonly catalogEntryId: string;
      readonly commandId: string;
      readonly handlerId: string;
      readonly args?: string;
    }
  | {
      readonly kind: 'skill';
      readonly catalogEntryId: string;
      readonly skillName: string;
      readonly activationId: string;
      readonly args?: string;
    };

export type AgentInputInvocationIntent = Exclude<
  AgentDraftInputIntent,
  { readonly kind: 'message' }
>;

export function parseAgentInputInvocationIntent(value: unknown): AgentInputInvocationIntent {
  const intent = parseAgentDraftInputIntent(value);
  if (intent.kind === 'message') {
    throw new Error('Agent input invocation cannot be an ordinary message.');
  }
  return intent;
}

export interface AgentInputReferenceReceipt {
  readonly catalogEntryId: string;
  readonly referenceId: string;
  readonly ownerKind: 'assistant' | 'workspace' | 'character' | 'room' | 'world';
  readonly ownerId: string;
  readonly bindingReceiptId?: string;
}

export function parseAgentDraftInputIntent(value: unknown): AgentDraftInputIntent {
  const record = requireRecord(value, 'Agent Draft input intent must be an object.');
  if (record['kind'] === 'message') {
    requireExactKeys(record, ['kind', 'text'], 'Agent message input intent');
    return { kind: 'message', text: requireIdentity(record['text'], 'message') };
  }
  if (record['kind'] === 'command') {
    requireInvocationKeys(record, ['kind', 'catalogEntryId', 'commandId', 'handlerId']);
    return {
      kind: 'command',
      catalogEntryId: requireIdentity(record['catalogEntryId'], 'catalog entry'),
      commandId: requireIdentity(record['commandId'], 'command'),
      handlerId: requireIdentity(record['handlerId'], 'command handler'),
      ...parseOptionalArgs(record['args']),
    };
  }
  if (record['kind'] === 'skill') {
    requireInvocationKeys(record, ['kind', 'catalogEntryId', 'skillName', 'activationId']);
    return {
      kind: 'skill',
      catalogEntryId: requireIdentity(record['catalogEntryId'], 'catalog entry'),
      skillName: requireIdentity(record['skillName'], 'Skill'),
      activationId: requireIdentity(record['activationId'], 'Skill selection'),
      ...parseOptionalArgs(record['args']),
    };
  }
  throw new Error(`Unknown Agent Draft input intent '${String(record['kind'])}'.`);
}

export function parseAgentInputReferenceReceipt(value: unknown): AgentInputReferenceReceipt {
  const record = requireRecord(value, 'Agent input reference receipt must be an object.');
  requireAllowedKeys(
    record,
    ['catalogEntryId', 'referenceId', 'ownerKind', 'ownerId', 'bindingReceiptId'],
    ['catalogEntryId', 'referenceId', 'ownerKind', 'ownerId'],
    'Agent input reference receipt',
  );
  const ownerKind = parseReferenceOwnerKind(record['ownerKind']);
  return {
    catalogEntryId: requireIdentity(record['catalogEntryId'], 'catalog entry'),
    referenceId: requireIdentity(record['referenceId'], 'reference'),
    ownerKind,
    ownerId: requireIdentity(record['ownerId'], 'reference owner'),
    ...(record['bindingReceiptId'] === undefined
      ? {}
      : { bindingReceiptId: requireIdentity(record['bindingReceiptId'], 'binding receipt') }),
  };
}

function parseReferenceOwnerKind(value: unknown): AgentInputReferenceReceipt['ownerKind'] {
  if (
    value !== 'assistant' &&
    value !== 'workspace' &&
    value !== 'character' &&
    value !== 'room' &&
    value !== 'world'
  ) {
    throw new Error(`Unknown Agent reference owner '${String(value)}'.`);
  }
  return value;
}

function requireInvocationKeys(record: Record<string, unknown>, required: readonly string[]): void {
  requireAllowedKeys(record, [...required, 'args'], required, 'Agent invocation input intent');
}

function parseOptionalArgs(value: unknown): { readonly args?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'string') throw new Error('Agent invocation args must be a string.');
  return value.length === 0 ? {} : { args: value };
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
  requireAllowedKeys(record, keys, keys, label);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field '${unknown}'.`);
  const missing = requiredKeys.find((key) => !(key in record));
  if (missing) throw new Error(`${label} is missing field '${missing}'.`);
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent Draft ${label} identity is required.`);
  }
  return value;
}
