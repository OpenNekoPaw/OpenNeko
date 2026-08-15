import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterProject,
  parseCharacterVersion,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import type { CharacterDurableCatalog } from './character-durable-catalog';
import { CharacterManagementService } from './character-management-service';
import { CharacterVersionReferenceInventoryService } from './character-version-reference-service';

const now = '2026-08-13T00:00:00.000Z';
const project = parseCharacterProject({
  characterProjectId: 'character-a',
  displayName: 'A',
  draft: definition(),
  draftBasisCharacterVersionId: 'version-child',
  evidence: [],
  candidates: [],
  reviewStatus: 'ready',
  createdAt: now,
  updatedAt: now,
});
const versions = [version('version-root'), version('version-child')];

describe('Character management projection', () => {
  it('projects placement, bounded lineage, Storyline count and exact owner inventory', async () => {
    const service = createService({
      readLineage: async () => ({
        characterProjectId: project.characterProjectId,
        relations: [
          { characterVersionId: 'version-root', parentCharacterVersionIds: [] },
          { characterVersionId: 'version-child', parentCharacterVersionIds: ['version-root'] },
        ],
      }),
    });
    await expect(service.readDetails()).resolves.toEqual([
      expect.objectContaining({
        characterProjectId: 'character-a',
        placement: { kind: 'project', projectId: 'project-a' },
        storylineCount: 1,
        lineage: expect.objectContaining({
          status: 'available',
          rootCount: 1,
          headCount: 1,
          unlinkedCount: 0,
        }),
        referenceInventories: [
          expect.objectContaining({ characterVersionId: 'version-root', coverage: 'complete' }),
          expect.objectContaining({ characterVersionId: 'version-child', coverage: 'complete' }),
        ],
      }),
    ]);
  });

  it('keeps a corrupt lineage visible without forging an unlinked graph', async () => {
    const service = createService({
      readLineage: async () => {
        throw new Error('lineage.json is invalid.');
      },
    });
    const [detail] = await service.readDetails();
    expect(detail?.lineage).toEqual({
      status: 'unavailable',
      message: 'lineage.json is invalid.',
    });
    expect(detail?.referenceInventories).toHaveLength(2);
  });
});

function createService(lineage: {
  readLineage: () => Promise<
    | {
        readonly characterProjectId: string;
        readonly relations: readonly {
          readonly characterVersionId: string;
          readonly parentCharacterVersionIds: readonly string[];
        }[];
      }
    | undefined
  >;
}) {
  const catalog: CharacterDurableCatalog = {
    projects: [project],
    versions,
    relationships: [],
    characterRuns: [],
    dialogueRuns: [],
    rooms: [],
    roomRuns: [],
    storylines: [
      {
        characterStorylineId: 'storyline-a',
        characterProjectId: project.characterProjectId,
        displayName: 'Story',
        createdAt: now,
        updatedAt: now,
      },
    ],
    storylineDrafts: [],
    storylineVersions: [],
    companionContinuities: [],
    presentationConfigurations: [],
    diagnostics: [],
  };
  const emptyReader = (ownerKind: 'chara' | 'agent' | 'project') => ({
    ownerKind,
    readReferences: async () => [],
  });
  return new CharacterManagementService({
    catalog: { readCatalog: async () => catalog },
    lineage: { readLineage: lineage.readLineage, saveLineage: async () => undefined },
    references: new CharacterVersionReferenceInventoryService({
      chara: emptyReader('chara'),
      agent: emptyReader('agent'),
      project: emptyReader('project'),
    }),
    placement: { kind: 'project', projectId: 'project-a' },
  });
}

function version(characterVersionId: string) {
  return parseCharacterVersion({
    characterVersionId,
    characterProjectId: project.characterProjectId,
    label: characterVersionId,
    definition: definition(),
    acceptedEvidenceIds: [],
    publishedAt: now,
  });
}

function definition() {
  return {
    summary: 'Summary',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}
