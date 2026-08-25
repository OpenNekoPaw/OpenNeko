import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type GlobalCharacterCatalog,
} from '@neko/chara-domain/contracts';
import type { GlobalWorldCatalog } from '@neko/world-domain/contracts';
import {
  createProjectCompositionProjection,
  type ProjectCharacterCatalogProjection,
  type ProjectWorldCatalogProjection,
} from './project-composition-service';

const projectId = 'project-1';

describe('Project composition service', () => {
  it('projects mixed local objects and exact global references', () => {
    const projection = createProjectCompositionProjection({
      projectId,
      content: [
        {
          documentId: 'documents/novel.md',
          label: 'Novel',
          updatedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      characters: characterCatalog(),
      worlds: worldCatalog(),
      targets: [
        { kind: 'character-project', characterProjectId: 'character-project-local' },
        { kind: 'world-project', worldProjectId: 'world-project-local' },
      ],
      references: [
        {
          kind: 'character-version',
          globalCharacterId: 'global-character-aster',
          characterVersionId: 'character-version-global',
        },
        {
          kind: 'world-version',
          globalWorldId: 'global-world-sea',
          worldVersionId: 'world-version-global',
        },
      ],
      globalCharacters: globalCharacterCatalog(),
      globalWorlds: globalWorldCatalog(),
    });

    expect(projection.content).toHaveLength(1);
    expect(projection.characters).toHaveLength(1);
    expect(projection.worlds).toHaveLength(1);
    expect(projection.globalCharacters).toEqual([
      expect.objectContaining({ label: 'Global Aster', versionLabel: 'Global Aster' }),
    ]);
    expect(projection.globalWorlds).toEqual([
      expect.objectContaining({ label: 'Global Sea', versionLabel: 'Global Sea' }),
    ]);
    expect(projection.characters[0]).toMatchObject({
      updatedAt: '2026-08-14T00:00:00.000Z',
    });
    expect(projection.content[0]).toMatchObject({ updatedAt: '2026-08-12T00:00:00.000Z' });
    expect(projection.diagnostics).toEqual([]);
  });

  it('keeps an unavailable exact reference visible without affecting siblings', () => {
    const projection = createProjectCompositionProjection({
      projectId,
      content: [],
      characters: characterCatalog(),
      worlds: worldCatalog(),
      targets: [
        { kind: 'character-project', characterProjectId: 'character-project-local' },
        { kind: 'world-project', worldProjectId: 'world-project-local' },
      ],
      references: [
        {
          kind: 'character-version',
          globalCharacterId: 'global-character-aster',
          characterVersionId: 'missing-version',
        },
        {
          kind: 'character-version',
          globalCharacterId: 'global-character-other',
          characterVersionId: 'character-version-global',
        },
        {
          kind: 'world-version',
          globalWorldId: 'global-world-sea',
          worldVersionId: 'world-version-global',
        },
      ],
      globalCharacters: globalCharacterCatalog(),
      globalWorlds: globalWorldCatalog(),
    });

    expect(projection.globalCharacters[0]).toMatchObject({
      identity: 'character-version:global-character-aster:missing-version',
      diagnostic: expect.stringContaining('missing-version'),
    });
    expect(projection.globalCharacters[1]).toMatchObject({
      identity: 'character-version:global-character-other:character-version-global',
      diagnostic: expect.stringContaining('global-character-other'),
    });
    expect(projection.globalWorlds[0]).not.toHaveProperty('diagnostic');
    expect(projection.characters).toHaveLength(1);
    expect(projection.diagnostics).toHaveLength(2);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({ code: 'global-version-unavailable' }),
      expect.objectContaining({ code: 'global-version-unavailable' }),
    ]);
  });
});

function characterCatalog(): ProjectCharacterCatalogProjection {
  return {
    projects: [
      {
        characterProjectId: 'character-project-local',
        displayName: 'Aster',
        draft: {
          summary: '',
          backgroundStory: createEmptyCharacterBackgroundStory(),
          originSetting: createEmptyCharacterOriginSetting(),
          canon: [],
          knowledgeBoundary: [],
          behaviorPolicy: [],
          expressionPolicy: [],
          representationRefs: [],
        },
        evidence: [],
        candidates: [],
        reviewStatus: 'draft',
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    versions: [],
    diagnostics: [],
  };
}

function worldCatalog(): ProjectWorldCatalogProjection {
  return {
    projects: [
      {
        worldProjectId: 'world-project-local',
        title: 'Cinder Sea',
        draft: {
          background: '',
          worldBook: [],
          locations: [],
          organizations: [],
          rules: [],
          initialFacts: [],
        },
        sourceRefs: [],
        reviewStatus: 'draft',
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    versions: [],
    diagnostics: [],
  };
}

function globalCharacterCatalog(): GlobalCharacterCatalog {
  return {
    characters: [
      {
        globalCharacterId: 'global-character-aster',
        displayName: 'Global Aster',
        currentCharacterVersionId: 'character-version-global',
        characterVersionIds: ['character-version-global'],
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    versions: [
      {
        characterVersionId: 'character-version-global',
        globalCharacterId: 'global-character-aster',
        label: 'Global Aster',
        definition: characterCatalog().projects[0]!.draft,
        acceptedEvidenceIds: [],
        publishedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    links: [],
    diagnostics: [],
  };
}

function globalWorldCatalog(): GlobalWorldCatalog {
  return {
    worlds: [
      {
        globalWorldId: 'global-world-sea',
        title: 'Global Sea',
        currentWorldVersionId: 'world-version-global',
        worldVersionIds: ['world-version-global'],
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    versions: [
      {
        worldVersionId: 'world-version-global',
        globalWorldId: 'global-world-sea',
        label: 'Global Sea',
        definition: worldCatalog().projects[0]!.draft,
        acceptedSourceRefIds: [],
        publishedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    links: [],
    diagnostics: [],
  };
}
