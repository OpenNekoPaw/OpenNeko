import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterProject,
} from '@neko/chara/contracts';
import type { CharacterAuthoringCatalog } from '@neko/chara/application';
import type { ProjectEntityManagementProjection } from '@neko/entity-domain';
import type { WorldAuthoringCatalog } from '@neko/world/application';
import type { WorldProject } from '@neko/world/contracts';
import {
  PROJECT_REFERENCE_OWNER_KINDS,
  projectDependencySnapshot,
  type ProjectEntityCharacterAssociationFact,
} from './contracts';
import {
  deriveProjectDependencySnapshot,
  projectContentProjection,
  projectEntityCharacterHandoffs,
  projectEntityCharacterResourceProjections,
  projectPublicationReadiness,
  projectResourceUsageProjections,
  ProjectContentService,
  ProjectAuthoringNavigationService,
  ProjectLocalAuthoringService,
} from './application';

const projectId = 'content:workspace-1';
const association: ProjectEntityCharacterAssociationFact = {
  projectId,
  entityId: 'entity-rin',
  characterProjectId: 'character-rin',
};

describe('Project fact projections', () => {
  it('derives Character and World membership from exact owner catalogs', () => {
    const characters = characterCatalog([
      character('character-rin', 'Rin'),
      character('character-mika', 'Mika'),
    ]);
    const worlds = worldCatalog([world('world-home', 'Home')]);
    const associationProjections = projectEntityCharacterResourceProjections({
      projectId,
      associations: [association],
      characters,
    });

    const projection = projectContentProjection({
      projectId,
      associations: { associations: [association], diagnostics: [] },
      characters,
      characterAssociations: associationProjections,
      worlds,
      entities: {
        projectId,
        projections: [
          entity('entity-rin', 'character', 'Rin'),
          entity('entity-station', 'scene', 'Station'),
        ],
        diagnostics: [],
      },
    });

    expect(projection.characters).toEqual([
      expect.objectContaining({
        characterProjectId: 'character-rin',
        entityId: 'entity-rin',
        availability: 'available',
      }),
      expect.objectContaining({
        characterProjectId: 'character-mika',
        availability: 'needs-attention',
      }),
    ]);
    expect(projection.worlds).toEqual([
      expect.objectContaining({ worldProjectId: 'world-home', availability: 'available' }),
    ]);
    expect(projection.elements).toEqual([
      expect.objectContaining({ entityId: 'entity-station', availability: 'available' }),
    ]);
    expect(
      projectEntityCharacterHandoffs({
        projectId,
        associations: [association],
        entityId: 'entity-rin',
      }),
    ).toEqual([
      { kind: 'open-character', characterProjectId: 'character-rin' },
      {
        kind: 'open-character-studio',
        characterProjectId: 'character-rin',
        authority: { kind: 'project', projectId },
      },
    ]);
  });

  it('keeps invalid association and World rows local beside valid siblings', () => {
    const characters = characterCatalog([character('character-rin', 'Rin')]);
    const worlds = worldCatalog(
      [world('world-home', 'Home')],
      [
        {
          recordKind: 'world-project',
          recordId: 'world-invalid',
          message: 'Invalid World record.',
        },
      ],
    );
    const projection = projectContentProjection({
      projectId,
      associations: {
        associations: [association],
        diagnostics: [
          {
            code: 'project-entity-character-association-invalid',
            projectId,
            recordName: 'invalid-row',
            message: 'Invalid association record.',
          },
        ],
      },
      characters,
      characterAssociations: projectEntityCharacterResourceProjections({
        projectId,
        associations: [association],
        characters,
      }),
      worlds,
      entities: {
        projectId,
        projections: [entity('entity-rin', 'character', 'Rin')],
        diagnostics: [],
      },
    });

    expect(projection.characters[0]).toMatchObject({ availability: 'available' });
    expect(projection.worlds).toEqual([
      expect.objectContaining({ worldProjectId: 'world-home', availability: 'available' }),
      expect.objectContaining({ worldProjectId: 'world-invalid', availability: 'needs-attention' }),
    ]);
    expect(projection.diagnostics).toContainEqual(
      expect.objectContaining({ recordId: 'invalid-row' }),
    );
  });

  it('derives exact dependencies and blocks only completeness-dependent readiness claims', () => {
    const characters = characterCatalog([
      {
        ...character('character-rin', 'Rin'),
        draftBasisCharacterVersionId: 'character-version-base',
      },
    ]);
    const dependencies = deriveProjectDependencySnapshot({
      projectId,
      characters,
      worlds: worldCatalog([]),
      content: {
        owners: [
          {
            ownerKind: 'canvas',
            ownerId: 'board.nkc',
            sourceFingerprint: 'sha256:board',
            references: [
              { kind: 'media-library', libraryName: 'Footage', relativePath: 'shots/a.mov' },
              {
                kind: 'package-resource',
                packageId: 'asset-rin',
                revision: 'published',
                resourcePath: 'portrait.png',
              },
            ],
          },
        ],
        coveredOwnerKinds: ['canvas', 'cut'],
        diagnostics: [],
      },
    });
    expect(dependencies.coverage).toBe('incomplete');
    expect(dependencies.missingOwnerKinds).toEqual(['entity-representation']);
    expect(dependencies.dependencies.map((item) => item.dependency.kind)).toEqual([
      'asset-revision',
      'character-version',
      'media-library',
      'package-resource',
    ]);
    expect(projectPublicationReadiness({ items: [], dependencies })).toEqual({
      ready: false,
      unavailableIdentities: [],
      incompleteOwnerKinds: ['entity-representation'],
    });
  });

  it('aggregates Asset pins and owner-qualified resource usage without persisting a summary', () => {
    const dependencies = projectDependencySnapshot({
      projectId,
      owners: [
        {
          ownerKind: 'canvas',
          ownerId: 'board.nkc',
          sourceFingerprint: 'sha256:board',
          references: [{ kind: 'asset-revision', assetId: 'asset-rin', revision: 'published' }],
        },
      ],
      coverage: {
        expectedOwnerKinds: PROJECT_REFERENCE_OWNER_KINDS,
        coveredOwnerKinds: PROJECT_REFERENCE_OWNER_KINDS,
      },
    });
    const usage = projectResourceUsageProjections({
      projectId,
      localTargets: [
        { kind: 'character-project', characterProjectId: 'character-rin' },
        { kind: 'world-project', worldProjectId: 'world-home' },
      ],
      dependencies: dependencies.dependencies.map((item) => item.dependency),
      associations: [association],
      sourceFingerprint: 'sha256:derived-inputs',
      updatedAt: '2026-08-13T00:00:00.000Z',
      availability: () => 'available',
    });
    expect(usage.map((item) => item.target.ownerId)).toEqual([
      'asset',
      'character-project',
      'project-entity',
      'world-project',
    ]);
  });
});

describe('Project application services', () => {
  it('builds target navigation from owner membership and fixed reference readers', async () => {
    const service = new ProjectAuthoringNavigationService({
      characters: {
        readAuthoringCatalog: async () => characterCatalog([character('character-rin', 'Rin')]),
      },
      worlds: { readAuthoringCatalog: async () => worldCatalog([world('world-home', 'Home')]) },
      references: {
        readReferences: async () => ({
          owners: [
            {
              ownerKind: 'canvas',
              ownerId: 'board.nkc',
              sourceFingerprint: 'sha256:board',
              references: [
                { kind: 'media-library', libraryName: 'Footage', relativePath: 'shots/a.mov' },
              ],
            },
          ],
          coveredOwnerKinds: ['canvas', 'cut', 'entity-representation'],
          diagnostics: [],
        }),
      },
    });

    await expect(service.read({ projectId })).resolves.toEqual([
      expect.objectContaining({
        kind: 'authoring-target',
        identity: 'character-project:character-rin',
      }),
      expect.objectContaining({ kind: 'authoring-target', identity: 'world-project:world-home' }),
      expect.objectContaining({
        kind: 'external-dependency',
        identity: 'media-library:Footage:shots/a.mov',
        diagnostic: expect.stringContaining('exact owner availability reader'),
      }),
    ]);
  });

  it('reads each exact Project owner once without a composition repository', async () => {
    const associations = { list: vi.fn(async () => ({ associations: [], diagnostics: [] })) };
    const characters = { readAuthoringCatalog: vi.fn(async () => characterCatalog([])) };
    const worlds = { readAuthoringCatalog: vi.fn(async () => worldCatalog([])) };
    const entities = {
      readProjectContentEntities: vi.fn(async () => ({
        projectId,
        projections: [],
        diagnostics: [],
      })),
    };
    await expect(
      new ProjectContentService({ associations, characters, worlds, entities }).read(projectId),
    ).resolves.toMatchObject({
      projectId,
      characters: [],
      worlds: [],
    });
    expect(associations.list).toHaveBeenCalledTimes(1);
    expect(characters.readAuthoringCatalog).toHaveBeenCalledTimes(1);
    expect(worlds.readAuthoringCatalog).toHaveBeenCalledTimes(1);
    expect(entities.readProjectContentEntities).toHaveBeenCalledTimes(1);
  });

  it('prepares owner facts and commits each Project-local target once', async () => {
    const commitCharacter = vi.fn(async () => undefined);
    const commitWorld = vi.fn(async () => undefined);
    const entityDocument = {
      projectId,
      entities: [
        {
          entityId: 'entity-rin',
          kind: 'character' as const,
          names: { canonical: 'Rin', display: 'Rin', aliases: [] },
          representations: [],
          lifecycle: { state: 'active' as const },
          createdAt: '2026-08-13T00:00:00.000Z',
          updatedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
    };
    const service = new ProjectLocalAuthoringService({
      characters: {
        prepareProject: vi.fn(async () => character('character-rin', 'Rin')),
        prepareWorkspaceCopy: vi.fn(async () => character('character-rin', 'Rin')),
      },
      commit: { commitCharacter, commitWorld },
      entities: {
        prepareCharacterEntity: vi.fn(),
        readCharacterEntityDocument: vi.fn(async () => entityDocument),
      },
      worlds: {
        prepareProject: vi.fn(async () => world('world-home', 'Home')),
        prepareWorkspaceCopy: vi.fn(async () => world('world-home', 'Home')),
      },
      now: () => '2026-08-13T00:00:00.000Z',
    });
    await service.createCharacter(
      { workspaceId: 'workspace-1', projectId },
      {
        characterProjectId: 'character-rin',
        displayName: 'Rin',
        draft: character('character-rin', 'Rin').draft,
        sources: { evidence: [], assetRepresentations: [] },
      },
      { kind: 'existing', entityId: 'entity-rin' },
    );
    await service.createWorld(
      { workspaceId: 'workspace-1', projectId },
      { worldProjectId: 'world-home', title: 'Home', draft: world('world-home', 'Home').draft },
    );
    expect(commitCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        association,
        entityDocument: { previous: entityDocument },
        membership: {
          projectId,
          target: { kind: 'character-project', characterProjectId: 'character-rin' },
        },
      }),
      undefined,
    );
    expect(commitWorld).toHaveBeenCalledWith(
      expect.objectContaining({
        membership: { projectId, target: { kind: 'world-project', worldProjectId: 'world-home' } },
      }),
      undefined,
    );
  });
});

function characterCatalog(
  projects: readonly CharacterProject[],
  diagnostics: CharacterAuthoringCatalog['diagnostics'] = [],
): CharacterAuthoringCatalog {
  return {
    scope: { kind: 'project', projectId },
    projects,
    versions: [],
    authoringTestSnapshots: [],
    diagnostics,
  };
}

function worldCatalog(
  projects: readonly WorldProject[],
  diagnostics: WorldAuthoringCatalog['diagnostics'] = [],
): WorldAuthoringCatalog {
  return {
    scope: { kind: 'project', projectId },
    projects,
    versions: [],
    diagnostics,
  };
}

function character(characterProjectId: string, displayName: string): CharacterProject {
  return {
    characterProjectId,
    displayName,
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
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  };
}

function world(worldProjectId: string, title: string): WorldProject {
  return {
    worldProjectId,
    title,
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
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  };
}

function entity(
  entityId: string,
  kind: 'character' | 'scene',
  canonical: string,
): ProjectEntityManagementProjection {
  return {
    projectionId: `entity:${entityId}`,
    status: 'confirmed',
    entity: {
      entityId,
      kind,
      names: { canonical, aliases: [] },
      representations: [],
      lifecycle: { state: 'active' },
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
    bindingAvailability: [],
    sourceOwners: ['project-entity'],
  };
}
