import {
  parseAgentEntryTargetBinding,
  type AgentCharacterDialogueLaunchBinding,
} from './agent-entry-intent';

export interface CharacterDialogueHandoffIntent {
  readonly kind: 'character-dialogue';
  readonly intentId: string;
  readonly label: string;
  readonly binding: AgentCharacterDialogueLaunchBinding;
}

export function createCharacterDialogueHandoffIntent(input: {
  readonly intentId: string;
  readonly label: string;
  readonly characterProjectId: string;
  readonly characterVersionId: string;
}): CharacterDialogueHandoffIntent {
  return parseCharacterDialogueHandoffIntent({
    kind: 'character-dialogue',
    intentId: input.intentId,
    label: input.label,
    binding: {
      kind: 'character-dialogue',
      mode: 'companion',
      participants: [
        {
          characterProjectId: input.characterProjectId,
          characterVersionId: input.characterVersionId,
        },
      ],
    },
  });
}

export function parseCharacterDialogueHandoffIntent(
  value: unknown,
): CharacterDialogueHandoffIntent {
  const record = requireRecord(value, 'Character Dialogue handoff');
  requireExactKeys(record, ['kind', 'intentId', 'label', 'binding']);
  if (record['kind'] !== 'character-dialogue') {
    throw new Error("Character Dialogue handoff kind must be 'character-dialogue'.");
  }
  const binding = parseAgentEntryTargetBinding(record['binding']);
  if (binding.kind !== 'character-dialogue' || binding.mode !== 'companion') {
    throw new Error('Character Dialogue handoff requires an exact Companion binding.');
  }
  if (binding.participants.length !== 1) {
    throw new Error('Character Dialogue handoff requires exactly one CharacterVersion.');
  }
  return {
    kind: 'character-dialogue',
    intentId: requireIdentity(record['intentId'], 'Character Dialogue handoff'),
    label: requireIdentity(record['label'], 'Character Dialogue handoff label'),
    binding,
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
): void {
  const supported = new Set(keys);
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !supported.has(key))
  ) {
    throw new Error('Character Dialogue handoff contains unsupported or missing fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}
