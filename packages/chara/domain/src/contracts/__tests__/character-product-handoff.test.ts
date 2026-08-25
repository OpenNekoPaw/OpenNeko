import { describe, expect, it } from 'vitest';
import {
  createCharacterProductHandoffs,
  parseCharacterProductHandoff,
} from '../character-product-handoff';

describe('Character product handoffs', () => {
  it('provides Character and Studio targets without inventing a CharacterVersion', () => {
    expect(
      createCharacterProductHandoffs({
        characterProjectId: 'character-project-1',
        authoringAuthority: { kind: 'project', projectId: 'project-1' },
      }),
    ).toEqual([
      { kind: 'open-character', characterProjectId: 'character-project-1' },
      {
        kind: 'open-character-studio',
        characterProjectId: 'character-project-1',
        authority: { kind: 'project', projectId: 'project-1' },
      },
    ]);
  });

  it('provides interaction only for an exact CharacterVersion', () => {
    expect(
      createCharacterProductHandoffs({
        characterProjectId: 'character-project-1',
        authoringAuthority: { kind: 'project', projectId: 'project-1' },
        characterVersionId: 'character-version-1',
      }),
    ).toContainEqual({
      kind: 'start-character-interaction',
      characterProjectId: 'character-project-1',
      characterVersionId: 'character-version-1',
    });
    for (const characterVersionId of ['latest', 'current', 'head']) {
      expect(() =>
        createCharacterProductHandoffs({
          characterProjectId: 'character-project-1',
          authoringAuthority: { kind: 'project', projectId: 'project-1' },
          characterVersionId,
        }),
      ).toThrow('exact CharacterVersion identity');
    }
  });

  it('rejects missing or copied interaction fields at the contract boundary', () => {
    expect(() =>
      parseCharacterProductHandoff({
        kind: 'start-character-interaction',
        characterProjectId: 'character-project-1',
      }),
    ).toThrow();
    expect(() =>
      parseCharacterProductHandoff({
        kind: 'start-character-interaction',
        characterProjectId: 'character-project-1',
        characterVersionId: 'character-version-1',
        character: { displayName: 'copied' },
      }),
    ).toThrow();
    expect(() =>
      parseCharacterProductHandoff({
        kind: 'open-character-studio',
        characterProjectId: 'character-project-1',
      }),
    ).toThrow();
    expect(() =>
      parseCharacterProductHandoff({
        kind: 'open-character-studio',
        characterProjectId: 'character-project-1',
        authority: { kind: 'standalone-library', library: 'character' },
      }),
    ).toThrow('Unknown Character Studio handoff authority: standalone-library');
  });
});
