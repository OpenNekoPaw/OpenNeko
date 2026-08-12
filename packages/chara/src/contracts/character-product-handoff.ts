import { requireExactRecord, requireIdentity } from './codec';

export type CharacterProductHandoff =
  | {
      readonly kind: 'open-character';
      readonly characterProjectId: string;
    }
  | {
      readonly kind: 'open-character-studio';
      readonly characterProjectId: string;
    }
  | {
      readonly kind: 'start-character-interaction';
      readonly characterProjectId: string;
      readonly characterVersionId: string;
    };

export function createCharacterProductHandoffs(input: {
  readonly characterProjectId: string;
  readonly characterVersionId?: string;
}): readonly CharacterProductHandoff[] {
  const characterProjectId = requireIdentity(
    input.characterProjectId,
    'Character product handoff CharacterProject',
  );
  return [
    { kind: 'open-character', characterProjectId },
    { kind: 'open-character-studio', characterProjectId },
    ...(input.characterVersionId === undefined
      ? []
      : [
          {
            kind: 'start-character-interaction' as const,
            characterProjectId,
            characterVersionId: requireExactCharacterVersionId(input.characterVersionId),
          },
        ]),
  ];
}

export function parseCharacterProductHandoff(value: unknown): CharacterProductHandoff {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Character product handoff must be an object.');
  }
  const kind = (value as Readonly<Record<string, unknown>>)['kind'];
  if (kind === 'open-character' || kind === 'open-character-studio') {
    const record = requireExactRecord(
      value,
      ['kind', 'characterProjectId'],
      'Character product handoff',
    );
    return {
      kind,
      characterProjectId: requireIdentity(
        record['characterProjectId'],
        'Character product handoff CharacterProject',
      ),
    };
  }
  if (kind === 'start-character-interaction') {
    const record = requireExactRecord(
      value,
      ['kind', 'characterProjectId', 'characterVersionId'],
      'Character product handoff',
    );
    return {
      kind,
      characterProjectId: requireIdentity(
        record['characterProjectId'],
        'Character product handoff CharacterProject',
      ),
      characterVersionId: requireExactCharacterVersionId(record['characterVersionId']),
    };
  }
  throw new Error(`Unknown Character product handoff kind: ${String(kind)}`);
}

function requireExactCharacterVersionId(value: unknown): string {
  const characterVersionId = requireIdentity(value, 'Character product handoff CharacterVersion');
  if (
    characterVersionId === 'latest' ||
    characterVersionId === 'current' ||
    characterVersionId === 'head'
  ) {
    throw new Error('Character product handoff requires an exact CharacterVersion identity.');
  }
  return characterVersionId;
}
