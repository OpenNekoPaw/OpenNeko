export type CharacterCreationEntry = 'blank' | 'character-kit';

export interface CharacterCreationHandoffIntent {
  readonly kind: 'character-creation';
  readonly intentId: string;
  readonly entry: CharacterCreationEntry;
}

export function createCharacterCreationHandoffIntent(input: {
  readonly intentId: string;
  readonly entry: CharacterCreationEntry;
}): CharacterCreationHandoffIntent {
  return parseCharacterCreationHandoffIntent({
    kind: 'character-creation',
    intentId: input.intentId,
    entry: input.entry,
  });
}

export function parseCharacterCreationHandoffIntent(
  value: unknown,
): CharacterCreationHandoffIntent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Character creation handoff must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const supported = new Set(['kind', 'intentId', 'entry']);
  if (
    Object.keys(record).length !== supported.size ||
    Object.keys(record).some((key) => !supported.has(key))
  ) {
    throw new Error('Character creation handoff contains unsupported or missing fields.');
  }
  if (record['kind'] !== 'character-creation') {
    throw new Error("Character creation handoff kind must be 'character-creation'.");
  }
  const intentId = requireIdentity(record['intentId'], 'Character creation handoff');
  const entry = record['entry'];
  if (entry !== 'blank' && entry !== 'character-kit') {
    throw new Error(`Character creation entry '${String(entry)}' is unsupported.`);
  }
  return { kind: 'character-creation', intentId, entry };
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}
