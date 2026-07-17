import { describe, expect, it } from 'vitest';
import { projectShotCharacterEntityReference } from './shotEntityReference';

describe('projectShotCharacterEntityReference', () => {
  it('marks confirmed entity refs with orphaned default representations as broken', () => {
    expect(
      projectShotCharacterEntityReference({
        characterName: 'Rin',
        entityRef: { entityId: 'char-rin', entityKind: 'character' },
        defaultRepresentation: {
          role: 'portrait',
          assetRef: 'project://assets/rin-portrait',
          availability: 'orphaned',
        },
      }),
    ).toEqual({
      state: 'orphaned',
      label: 'Broken',
      title: 'Rin is linked to char-rin, but the default representation is unavailable.',
      entityRef: { entityId: 'char-rin', entityKind: 'character' },
    });
  });
});
