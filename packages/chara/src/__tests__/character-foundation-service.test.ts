import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '../contracts';
import { CharacterFoundationService, type CharacterDurableCatalog } from '../application';

describe('CharacterFoundationService conversation launch catalog', () => {
  it('projects published CharacterVersions and isolates an orphan publication', async () => {
    const catalog = createCatalog();
    const service = new CharacterFoundationService({
      characterCatalog: { readCatalog: async () => catalog },
    });

    await expect(service.getConversationLaunchCatalog()).resolves.toEqual({
      targets: [
        {
          characterProjectId: 'character-project-lin',
          characterVersionId: 'character-version-lin',
          displayName: 'Lin',
          versionLabel: 'Published Lin',
          storylines: [
            {
              characterStorylineVersionId: 'storyline-version-lin',
              label: 'Archive arc',
            },
          ],
        },
      ],
      diagnostics: [
        {
          characterVersionId: 'character-version-orphan',
          message:
            "CharacterVersion 'character-version-orphan' references unavailable CharacterProject 'character-project-missing'.",
        },
      ],
    });
  });
});

function createCatalog(): CharacterDurableCatalog {
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
    projects: [
      {
        characterProjectId: 'character-project-lin',
        displayName: 'Lin',
        draft: definition,
        evidence: [],
        candidates: [],
        reviewStatus: 'ready',
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-11T00:00:00.000Z',
      },
    ],
    versions: [
      {
        characterProjectId: 'character-project-lin',
        characterVersionId: 'character-version-lin',
        label: 'Published Lin',
        definition,
        acceptedEvidenceIds: [],
        publishedAt: '2026-08-11T00:00:00.000Z',
      },
      {
        characterProjectId: 'character-project-missing',
        characterVersionId: 'character-version-orphan',
        label: 'Orphan',
        definition,
        acceptedEvidenceIds: [],
        publishedAt: '2026-08-11T00:00:00.000Z',
      },
    ],
    storylineVersions: [
      {
        characterStorylineVersionId: 'storyline-version-lin',
        characterVersionId: 'character-version-lin',
        label: 'Archive arc',
        premise: 'An archive opens.',
        desire: 'Protect it.',
        conflict: 'It must be shared.',
        growthArc: 'Trust a witness.',
        stages: [{ stageId: 'stage-one', title: 'Guarded', description: 'Keeps distance.' }],
        turningPoints: [],
        constraints: [],
        acceptedEvidenceIds: [],
        publishedAt: '2026-08-11T00:00:00.000Z',
      },
    ],
    relationships: [],
    characterRuns: [],
    dialogueRuns: [],
    rooms: [],
    roomRuns: [],
    storylineRuns: [],
    storylineObservationCandidates: [],
    memoryScopes: [],
    presentationConfigurations: [],
    diagnostics: [],
  };
}
