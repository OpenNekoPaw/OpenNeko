export type WorldCreationEntry = 'blank' | 'world-bible';

export interface WorldCreationHandoffIntent {
  readonly kind: 'world-creation';
  readonly intentId: string;
  readonly entry: WorldCreationEntry;
}

export function createWorldCreationHandoffIntent(input: {
  readonly intentId: string;
  readonly entry: WorldCreationEntry;
}): WorldCreationHandoffIntent {
  return parseWorldCreationHandoffIntent({
    kind: 'world-creation',
    intentId: input.intentId,
    entry: input.entry,
  });
}

export function parseWorldCreationHandoffIntent(value: unknown): WorldCreationHandoffIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('World creation handoff must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const supported = new Set(['kind', 'intentId', 'entry']);
  if (
    Object.keys(record).length !== supported.size ||
    Object.keys(record).some((key) => !supported.has(key))
  ) {
    throw new Error('World creation handoff contains unsupported or missing fields.');
  }
  if (record['kind'] !== 'world-creation') {
    throw new Error("World creation handoff kind must be 'world-creation'.");
  }
  const intentId = requireIdentity(record['intentId'], 'World creation handoff');
  const entry = record['entry'];
  if (entry !== 'blank' && entry !== 'world-bible') {
    throw new Error(`World creation entry '${String(entry)}' is unsupported.`);
  }
  return { kind: 'world-creation', intentId, entry };
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}
