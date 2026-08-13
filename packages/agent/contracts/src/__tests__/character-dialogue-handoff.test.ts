import { describe, expect, it } from 'vitest';
import {
  createCharacterDialogueHandoffIntent,
  parseCharacterDialogueHandoffIntent,
} from '../character-dialogue-handoff';

describe('Character Dialogue handoff', () => {
  it('binds one exact CharacterVersion without latest-version inference', () => {
    const handoff = createCharacterDialogueHandoffIntent({
      intentId: 'character-dialogue:1',
      label: 'Rin',
      characterProjectId: 'character-project:rin',
      characterVersionId: 'character-version:rin-2',
    });

    expect(parseCharacterDialogueHandoffIntent(handoff)).toEqual(handoff);
    expect(handoff.binding.participants).toEqual([
      {
        characterProjectId: 'character-project:rin',
        characterVersionId: 'character-version:rin-2',
      },
    ]);
  });

  it('rejects rooms and malformed or ambiguous selections', () => {
    expect(() =>
      parseCharacterDialogueHandoffIntent({
        kind: 'character-dialogue',
        intentId: 'character-dialogue:1',
        label: 'Rin',
        binding: {
          kind: 'character-dialogue',
          mode: 'companion',
          participants: [],
        },
      }),
    ).toThrow('at least one participant');
    expect(() =>
      parseCharacterDialogueHandoffIntent({
        kind: 'character-dialogue',
        intentId: 'character-dialogue:1',
        label: 'Rin',
        binding: {
          kind: 'character-dialogue',
          mode: 'narrative',
          participants: [
            {
              characterProjectId: 'character-project:rin',
              characterVersionId: 'character-version:rin-2',
            },
          ],
        },
      }),
    ).toThrow('exact Companion binding');
  });
});
