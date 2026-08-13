import { describe, expect, it } from 'vitest';
import {
  parseCharacterVersionReference,
  parseCharacterVersionReferenceInventory,
} from '../character-version-reference';

describe('CharacterVersion reference contracts', () => {
  it('accepts an owner-qualified exact reference inventory', () => {
    expect(
      parseCharacterVersionReferenceInventory({
        characterVersionId: 'version-a',
        coverage: 'complete',
        references: [
          {
            ownerKind: 'agent',
            referenceKind: 'conversation',
            referenceId: 'conversation-a',
            characterVersionId: 'version-a',
          },
        ],
        diagnostics: [],
      }),
    ).toEqual(expect.objectContaining({ characterVersionId: 'version-a', coverage: 'complete' }));
  });

  it('rejects unknown fields, mixed versions and contradictory coverage', () => {
    expect(() =>
      parseCharacterVersionReference({
        ownerKind: 'agent',
        referenceKind: 'conversation',
        referenceId: 'conversation-a',
        characterVersionId: 'version-a',
        latest: true,
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseCharacterVersionReference({
        ownerKind: 'agent',
        referenceKind: 'project-dependency',
        referenceId: 'project-a:canvas:board-a',
        characterVersionId: 'version-a',
      }),
    ).toThrow("not owned by 'agent'");
    expect(() =>
      parseCharacterVersionReferenceInventory({
        characterVersionId: 'version-a',
        coverage: 'complete',
        references: [
          {
            ownerKind: 'agent',
            referenceKind: 'conversation',
            referenceId: 'conversation-a',
            characterVersionId: 'version-b',
          },
        ],
        diagnostics: [],
      }),
    ).toThrow('another version');
    expect(() =>
      parseCharacterVersionReferenceInventory({
        characterVersionId: 'version-a',
        coverage: 'complete',
        references: [],
        diagnostics: [{ ownerKind: 'project', message: 'Unavailable.' }],
      }),
    ).toThrow('coverage must match');
  });
});
