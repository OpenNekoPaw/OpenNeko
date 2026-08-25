import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type GlobalCharacterCatalog,
} from '../contracts';
import { CharacterFoundationService, type CharacterRuntimeCatalog } from '../application';

describe('CharacterFoundationService global catalog', () => {
  it('projects immutable global versions in linear history order', async () => {
    const service = createService(globalCatalog());

    await expect(service.getConversationLaunchCatalog()).resolves.toEqual({
      targets: [
        expect.objectContaining({
          characterVersionId: 'character-version-1',
          displayName: 'Lin',
          lineage: expect.objectContaining({ isHead: false, state: 'declared-root' }),
        }),
        expect.objectContaining({
          characterVersionId: 'character-version-2',
          displayName: 'Lin',
          lineage: expect.objectContaining({ isHead: true, state: 'linked' }),
        }),
      ],
      diagnostics: [],
    });
  });

  it('combines global versions with runtime history without mutable Projects', async () => {
    const service = createService(globalCatalog());
    await expect(service.getSnapshot()).resolves.toMatchObject({
      character: {
        globalCharacters: [expect.objectContaining({ globalCharacterId: 'global-character-lin' })],
        versions: [
          expect.objectContaining({ characterVersionId: 'character-version-1' }),
          expect.objectContaining({ characterVersionId: 'character-version-2' }),
        ],
        characterRuns: [],
      },
    });
  });
});

function createService(global: GlobalCharacterCatalog): CharacterFoundationService {
  return new CharacterFoundationService({
    globalCatalog: { readCatalog: async () => global },
    runtime: { readRuntimeCatalog: async () => emptyRuntimeCatalog() },
  });
}

function globalCatalog(): GlobalCharacterCatalog {
  const definition = {
    summary: 'An archivist.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
  return {
    characters: [
      {
        globalCharacterId: 'global-character-lin',
        displayName: 'Lin',
        currentCharacterVersionId: 'character-version-2',
        characterVersionIds: ['character-version-1', 'character-version-2'],
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
      },
    ],
    versions: [
      {
        globalCharacterId: 'global-character-lin',
        characterVersionId: 'character-version-1',
        label: 'Lin 1',
        definition,
        acceptedEvidenceIds: [],
        publishedAt: '2026-08-11T00:00:00.000Z',
      },
      {
        globalCharacterId: 'global-character-lin',
        characterVersionId: 'character-version-2',
        label: 'Lin 2',
        definition,
        acceptedEvidenceIds: [],
        publishedAt: '2026-08-12T00:00:00.000Z',
      },
    ],
    links: [],
    diagnostics: [],
  };
}

function emptyRuntimeCatalog(): CharacterRuntimeCatalog {
  return {
    relationships: [],
    characterRuns: [],
    dialogueRuns: [],
    rooms: [],
    roomRuns: [],
    storylines: [],
    storylineDrafts: [],
    storylineVersions: [],
    companionContinuities: [],
    presentationConfigurations: [],
    diagnostics: [],
  };
}
