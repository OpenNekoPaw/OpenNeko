import {
  collectCharacterLoreEvidenceIds,
  parseCharacterBackgroundStory,
  parseCharacterOriginSetting,
  parseCharacterRunRef,
  parseCharacterVersionRef,
} from '../character-lore-storyline-memory';
import { describe, expect, it } from 'vitest';

describe('Character lore contracts', () => {
  it('keeps reviewed BackgroundStory and OriginSetting as non-runnable Character lore', () => {
    const backgroundStory = parseCharacterBackgroundStory({
      overview: 'Lin grew up among archivists.',
      origins: [lore('origin-a', 'Raised by the archive keeper.')],
      personalHistory: [],
      formativeEvents: [lore('event-a', 'Returned a forbidden key.')],
      establishedRelationships: [],
    });
    const originSetting = parseCharacterOriginSetting({
      overview: 'A city that records every promise.',
      eras: [lore('era-a', 'The late registry era.')],
      cultures: [],
      socialEnvironment: [],
      importantPlaces: [],
      organizations: [],
      believedRules: [lore('rule-a', 'Lin believes every promise leaves a trace.')],
    });

    expect(backgroundStory.formativeEvents[0]?.evidenceIds).toEqual(['evidence-a']);
    expect(originSetting.believedRules).toHaveLength(1);
    expect(collectCharacterLoreEvidenceIds({ backgroundStory, originSetting })).toEqual([
      'evidence-a',
      'evidence-a',
      'evidence-a',
      'evidence-a',
    ]);
    expect(() =>
      parseCharacterOriginSetting({
        ...originSetting,
        worldRunId: 'world-run-illegal',
      }),
    ).toThrow(/unsupported fields.*worldRunId/u);
  });

  it('parses exact CharacterVersion and CharacterRun references without memory ownership', () => {
    expect(parseCharacterVersionRef({ characterVersionId: 'character-version-a' })).toEqual({
      characterVersionId: 'character-version-a',
    });
    expect(
      parseCharacterRunRef({
        characterVersionId: 'character-version-a',
        characterRunId: 'character-run-a',
      }),
    ).toEqual({
      characterVersionId: 'character-version-a',
      characterRunId: 'character-run-a',
    });
    expect(() =>
      parseCharacterRunRef({
        characterVersionId: 'character-version-a',
        characterRunId: 'character-run-a',
        characterMemoryScopeId: 'obsolete-memory-scope',
      }),
    ).toThrow(/unsupported fields.*characterMemoryScopeId/u);
  });
});

function lore(loreEntryId: string, statement: string) {
  return { loreEntryId, statement, evidenceIds: ['evidence-a'] };
}
