export type AgentTurnCapabilityAvailability = 'configured' | 'none';

export interface AgentTurnCapabilityConstraint {
  readonly owner: {
    readonly kind: 'assistant' | 'workspace' | 'character' | 'room' | 'world';
    readonly id: string;
  };
  readonly skills: AgentTurnCapabilityAvailability;
  readonly tools: AgentTurnCapabilityAvailability;
  readonly references: AgentTurnCapabilityAvailability;
}

export const CONFIGURED_AGENT_TURN_CAPABILITIES: AgentTurnCapabilityConstraint = Object.freeze({
  owner: Object.freeze({ kind: 'assistant', id: 'agent-standard' }),
  skills: 'configured',
  tools: 'configured',
  references: 'configured',
});

export function parseAgentTurnCapabilityConstraint(value: unknown): AgentTurnCapabilityConstraint {
  const record = requireRecord(value, 'Agent turn capability constraint must be an object.');
  requireExactKeys(
    record,
    ['owner', 'skills', 'tools', 'references'],
    'Agent turn capability constraint',
  );
  const owner = requireRecord(record['owner'], 'Agent turn capability owner must be an object.');
  requireExactKeys(owner, ['kind', 'id'], 'Agent turn capability owner');
  const kind = owner['kind'];
  if (
    kind !== 'assistant' &&
    kind !== 'workspace' &&
    kind !== 'character' &&
    kind !== 'room' &&
    kind !== 'world'
  ) {
    throw new Error(`Unknown Agent turn capability owner kind '${String(kind)}'.`);
  }
  return {
    owner: { kind, id: requireIdentity(owner['id'], 'Agent turn capability owner') },
    skills: requireAvailability(record['skills'], 'Skills'),
    tools: requireAvailability(record['tools'], 'Tools'),
    references: requireAvailability(record['references'], 'references'),
  };
}

function requireAvailability(value: unknown, label: string): AgentTurnCapabilityAvailability {
  if (value === 'configured' || value === 'none') return value;
  throw new Error(`Agent turn ${label} availability must be 'configured' or 'none'.`);
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
  const expected = new Set(keys);
  const unexpected = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in record));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`${label} must use the canonical fields ${keys.join(', ')}.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity must be a non-empty string.`);
  }
  return value;
}
