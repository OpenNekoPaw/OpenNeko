import {
  parseCharacterVersionLineage,
  parseCharacterVersionRelation,
} from '../character-version-lineage';
import { describe, expect, it } from 'vitest';

describe('CharacterVersion lineage contracts', () => {
  it('parses declared roots and one-parent branches', () => {
    const lineage = parseCharacterVersionLineage({
      characterProjectId: 'character-project-a',
      relations: [
        { characterVersionId: 'version-root', parentCharacterVersionIds: [] },
        {
          characterVersionId: 'version-left',
          parentCharacterVersionIds: ['version-root'],
          changeSummary: 'Left branch',
        },
        {
          characterVersionId: 'version-right',
          parentCharacterVersionIds: ['version-root'],
        },
      ],
    });

    expect(lineage.relations).toHaveLength(3);
    expect(lineage.relations[0]?.parentCharacterVersionIds).toEqual([]);
    expect(lineage.relations[1]?.changeSummary).toBe('Left branch');
  });

  it.each([
    {
      label: 'duplicate child',
      relations: [
        { characterVersionId: 'version-a', parentCharacterVersionIds: [] },
        { characterVersionId: 'version-a', parentCharacterVersionIds: [] },
      ],
      message: /duplicate identity/u,
    },
    {
      label: 'duplicate parent',
      relations: [
        {
          characterVersionId: 'version-a',
          parentCharacterVersionIds: ['version-root', 'version-root'],
        },
      ],
      message: /duplicate identity/u,
    },
    {
      label: 'self parent',
      relations: [
        {
          characterVersionId: 'version-a',
          parentCharacterVersionIds: ['version-a'],
        },
      ],
      message: /cannot parent itself/u,
    },
    {
      label: 'cycle',
      relations: [
        { characterVersionId: 'version-a', parentCharacterVersionIds: ['version-b'] },
        { characterVersionId: 'version-b', parentCharacterVersionIds: ['version-a'] },
      ],
      message: /contains a cycle/u,
    },
  ])('rejects $label', ({ relations, message }) => {
    expect(() =>
      parseCharacterVersionLineage({ characterProjectId: 'character-project-a', relations }),
    ).toThrow(message);
  });

  it('rejects multiple parents until an explicit merge workflow exists', () => {
    expect(() =>
      parseCharacterVersionRelation({
        characterVersionId: 'version-merge',
        parentCharacterVersionIds: ['version-left', 'version-right'],
      }),
    ).toThrow(/without an explicit merge workflow/u);
  });

  it('rejects internal format generations', () => {
    const forbiddenField = ['schema', 'Version'].join('');
    expect(() =>
      parseCharacterVersionLineage({
        characterProjectId: 'character-project-a',
        relations: [],
        [forbiddenField]: 1,
      }),
    ).toThrow(/unsupported fields/u);
  });
});
