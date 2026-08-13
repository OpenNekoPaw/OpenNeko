import type { AgentContextPayload } from './agent-context';

export const CHARACTER_CREATOR_BUILTIN_IDENTITY = {
  name: 'character-creator',
  source: { kind: 'builtin' },
} as const;

export interface CharacterCreationHandoffIntent {
  readonly kind: 'character-creation';
  readonly intentId: string;
  readonly skill: typeof CHARACTER_CREATOR_BUILTIN_IDENTITY;
  readonly prompt: string;
  readonly references: readonly AgentContextPayload[];
  readonly returnTarget: { readonly kind: 'character-management' };
}

export function createCharacterCreationHandoffIntent(input: {
  readonly intentId: string;
  readonly prompt?: string;
  readonly references?: readonly AgentContextPayload[];
}): CharacterCreationHandoffIntent {
  return parseCharacterCreationHandoffIntent({
    kind: 'character-creation',
    intentId: input.intentId,
    skill: CHARACTER_CREATOR_BUILTIN_IDENTITY,
    prompt: input.prompt ?? '',
    references: input.references ?? [],
    returnTarget: { kind: 'character-management' },
  });
}

export function parseCharacterCreationHandoffIntent(
  value: unknown,
): CharacterCreationHandoffIntent {
  const record = requireRecord(value, 'Character creation handoff');
  requireExactKeys(
    record,
    ['kind', 'intentId', 'skill', 'prompt', 'references', 'returnTarget'],
    'Character creation handoff',
  );
  if (record['kind'] !== 'character-creation') {
    throw new Error("Character creation handoff kind must be 'character-creation'.");
  }
  const skill = requireRecord(record['skill'], 'Character creation handoff Skill');
  requireExactKeys(skill, ['name', 'source'], 'Character creation handoff Skill');
  const source = requireRecord(skill['source'], 'Character creation handoff Skill source');
  requireExactKeys(source, ['kind'], 'Character creation handoff Skill source');
  if (
    skill['name'] !== CHARACTER_CREATOR_BUILTIN_IDENTITY.name ||
    source['kind'] !== CHARACTER_CREATOR_BUILTIN_IDENTITY.source.kind
  ) {
    throw new Error('Character creation handoff requires the exact builtin Character Creator.');
  }
  const returnTarget = requireRecord(
    record['returnTarget'],
    'Character creation handoff return target',
  );
  requireExactKeys(returnTarget, ['kind'], 'Character creation handoff return target');
  if (returnTarget['kind'] !== 'character-management') {
    throw new Error('Character creation handoff return target must be Character Management.');
  }
  if (!Array.isArray(record['references'])) {
    throw new Error('Character creation handoff references must be an array.');
  }
  return {
    kind: 'character-creation',
    intentId: requireIdentity(record['intentId'], 'Character creation handoff'),
    skill: CHARACTER_CREATOR_BUILTIN_IDENTITY,
    prompt: requireString(record['prompt'], 'Character creation handoff prompt'),
    references: record['references'].map(parseContextPayload),
    returnTarget: { kind: 'character-management' },
  };
}

function parseContextPayload(value: unknown): AgentContextPayload {
  const record = requireRecord(value, 'Character creation handoff reference');
  requireAllowedKeys(
    record,
    ['type', 'id', 'label', 'summary', 'data', 'intent'],
    'Character creation handoff reference',
  );
  if (!('data' in record)) {
    throw new Error('Character creation handoff reference data is required.');
  }
  const type = record['type'];
  if (
    type !== 'canvas-node' &&
    type !== 'cut-clip' &&
    type !== 'story-selection' &&
    type !== 'character' &&
    type !== 'scene' &&
    type !== 'asset' &&
    type !== 'media' &&
    type !== 'entity' &&
    type !== 'sketch-layer' &&
    type !== '3d-reference' &&
    type !== 'audio-clip' &&
    type !== 'file' &&
    type !== 'image' &&
    type !== 'document-selection' &&
    type !== 'canvas-storyboard-action-intent'
  ) {
    throw new Error(`Unknown Character creation reference type '${String(type)}'.`);
  }
  const intent = record['intent'];
  if (intent !== undefined && typeof intent !== 'string') {
    throw new Error('Character creation handoff reference intent must be a string.');
  }
  return {
    type,
    id: requireIdentity(record['id'], 'Character creation handoff reference'),
    label: requireIdentity(record['label'], 'Character creation handoff reference label'),
    summary: requireString(record['summary'], 'Character creation handoff reference summary'),
    data: structuredClone(record['data']),
    ...(intent === undefined ? {} : { intent }),
  };
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const supported = new Set(keys);
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !supported.has(key))
  ) {
    throw new Error(`${label} contains unsupported or missing fields.`);
  }
}

function requireAllowedKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const supported = new Set(keys);
  if (Object.keys(record).some((key) => !supported.has(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}
