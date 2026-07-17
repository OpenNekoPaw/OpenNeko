import { describe, expect, it, vi } from 'vitest';
import { resolveCharacterBindingsForNames } from '../types/character-registry';

describe('resolveCharacterBindingsForNames', () => {
  it('prefers resolver-backed bindings and only falls back for unresolved names', async () => {
    const fallbackLoader = vi.fn(async (names: readonly string[]) => {
      expect(names).toEqual(['BOB']);
      return {
        BOB: 'char_bob',
      };
    });

    const characterResolver = {
      resolveCharacter(name: string) {
        if (name === 'ALICE') {
          return {
            record: {
              id: 'char_alice',
            },
          };
        }

        return undefined;
      },
    };

    await expect(
      resolveCharacterBindingsForNames(['ALICE', 'BOB'], {
        uriOrPath: '/workspace/story.fountain',
        characterResolver,
        fallbackLoader,
      }),
    ).resolves.toEqual({
      ALICE: 'char_alice',
      BOB: 'char_bob',
    });

    expect(fallbackLoader).toHaveBeenCalledTimes(1);
  });
});
