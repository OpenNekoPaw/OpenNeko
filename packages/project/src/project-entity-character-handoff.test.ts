import { describe, expect, it } from 'vitest';
import { parseContentProjectComposition } from './contracts';
import { projectEntityCharacterHandoffs } from './application/project-entity-character-handoff';

describe('Project Entity Character handoffs', () => {
  const composition = parseContentProjectComposition({
    contentProjectId: 'content-project-1',
    localTargets: [{ kind: 'character-project', characterProjectId: 'character-project-1' }],
    dependencies: [],
    entityCharacterAssociations: [
      { entityId: 'entity-character-1', characterProjectId: 'character-project-1' },
    ],
  });

  it('projects Chara-owned open targets only from the exact Project association', () => {
    expect(projectEntityCharacterHandoffs({ composition, entityId: 'entity-character-1' })).toEqual(
      [
        { kind: 'open-character', characterProjectId: 'character-project-1' },
        { kind: 'open-character-studio', characterProjectId: 'character-project-1' },
      ],
    );
  });

  it('adds Start Interaction only with the caller-selected exact CharacterVersion', () => {
    expect(
      projectEntityCharacterHandoffs({
        composition,
        entityId: 'entity-character-1',
        characterVersionId: 'character-version-7',
      }),
    ).toContainEqual({
      kind: 'start-character-interaction',
      characterProjectId: 'character-project-1',
      characterVersionId: 'character-version-7',
    });
  });

  it('does not infer by name, current Project or latest CharacterVersion', () => {
    expect(() => projectEntityCharacterHandoffs({ composition, entityId: 'Rin' })).toThrow(
      'has no CharacterProject association',
    );
    expect(() =>
      projectEntityCharacterHandoffs({
        composition,
        entityId: 'entity-character-1',
        characterVersionId: 'latest',
      }),
    ).toThrow('exact CharacterVersion identity');
  });

  it('keeps an unrelated valid association usable when another Entity is missing', () => {
    expect(() =>
      projectEntityCharacterHandoffs({ composition, entityId: 'entity-missing' }),
    ).toThrow();
    expect(
      projectEntityCharacterHandoffs({ composition, entityId: 'entity-character-1' }),
    ).toHaveLength(2);
  });
});
