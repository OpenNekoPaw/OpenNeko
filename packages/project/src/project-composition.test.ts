import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  createProjectAuthoringCatalogHostRequest,
  createProjectAuthoringNavigationHostRequest,
  parseContentProjectComposition,
  parseProjectAuthoringCatalogHostResult,
  parseProjectAuthoringNavigationHostResult,
  type ContentProjectComposition,
} from './contracts';
import { ProjectCompositionService } from './application/project-composition-service';
import { ProjectAuthoringNavigationService } from './application/project-authoring-navigation-service';
import {
  projectAuthoringNavigation,
  projectTargetTree,
} from './application/project-target-projection';
import { InMemoryProjectCompositionRepository } from './testing';

describe('Content Project composition', () => {
  it('parses one canonical shape without internal generation fields', () => {
    const composition = fixture();
    expect(parseContentProjectComposition(composition)).toEqual(composition);
    expect(() => parseContentProjectComposition({ ...composition, schemaVersion: 1 })).toThrow(
      'unknown or missing fields',
    );
  });

  it('accepts only WorldExperienceVersion as a formal World dependency', () => {
    expect(() =>
      parseContentProjectComposition({
        ...fixture(),
        dependencies: [{ kind: 'world-version', worldVersionId: 'world-version-1' }],
      }),
    ).toThrow('Unknown Project publication dependency kind');
  });

  it('rejects duplicate exact target and dependency identities', () => {
    const target = { kind: 'character-project' as const, characterProjectId: 'character-1' };
    expect(() =>
      parseContentProjectComposition({ ...fixture(), localTargets: [target, target] }),
    ).toThrow('unique exact identities');
    const dependency = {
      kind: 'character-version' as const,
      characterVersionId: 'character-version-1',
    };
    expect(() =>
      parseContentProjectComposition({ ...fixture(), dependencies: [dependency, dependency] }),
    ).toThrow('unique exact identities');
  });

  it('mutates membership and dependencies through one repository path', async () => {
    const repository = new InMemoryProjectCompositionRepository();
    const service = new ProjectCompositionService(repository);
    await service.create('content-project-1');
    await service.addLocalTarget('content-project-1', {
      kind: 'character-project',
      characterProjectId: 'character-1',
    });
    const bound = await service.bindDependency('content-project-1', {
      kind: 'world-experience-version',
      worldExperienceVersionId: 'experience-1',
    });
    expect(bound.localTargets).toHaveLength(1);
    expect(bound.dependencies).toHaveLength(1);
    await expect(
      service.addLocalTarget('content-project-1', {
        kind: 'character-project',
        characterProjectId: 'character-1',
      }),
    ).rejects.toMatchObject({ code: 'project-local-target-already-linked' });
  });

  it('keeps unavailable and unlinked targets visible without changing composition', () => {
    const composition = parseContentProjectComposition({
      ...fixture(),
      localTargets: [{ kind: 'character-project', characterProjectId: 'character-1' }],
      dependencies: [
        { kind: 'world-experience-version', worldExperienceVersionId: 'experience-1' },
      ],
    });
    const projection = projectTargetTree({
      composition,
      localTargetResolutions: [],
      dependencyResolutions: [],
      discoveredLocalTargets: [{ kind: 'world-project', worldProjectId: 'world-unlinked' }],
    });
    expect(projection.map((item) => item.kind)).toEqual([
      'local-target',
      'external-dependency',
      'unlinked-local-target',
    ]);
    expect(projection.every((item) => item.diagnostic !== undefined)).toBe(true);
    expect(composition.localTargets).toHaveLength(1);
  });

  it('projects Content, local targets, and external dependencies as exact navigation refs', () => {
    const composition = parseContentProjectComposition({
      ...fixture(),
      localTargets: [{ kind: 'character-project', characterProjectId: 'character-1' }],
      dependencies: [
        { kind: 'world-experience-version', worldExperienceVersionId: 'world-experience-1' },
      ],
    });
    const navigation = projectAuthoringNavigation({
      composition,
      content: { identity: 'content-project:content-project-1', label: 'Story' },
      localTargetResolutions: [{ identity: 'character-project:character-1', label: 'Lead' }],
      dependencyResolutions: [
        {
          identity: 'world-experience-version:world-experience-1',
          label: 'Published world',
        },
      ],
      snapshots: [
        {
          owner: 'character',
          targetIdentity: 'character-project:character-1',
          snapshotId: 'snapshot:character-1',
        },
      ],
    });

    expect(navigation.map((item) => item.kind)).toEqual([
      'authoring-target',
      'authoring-target',
      'external-dependency',
    ]);
    expect(navigation[1]).toMatchObject({
      identity: 'character-project:character-1',
      snapshot: { snapshotId: 'snapshot:character-1' },
    });
    expect(navigation[2]).toMatchObject({ readOnly: true });
    expect(JSON.stringify(navigation)).not.toContain('definition');
  });

  it('rejects a Content resolution from another Project', () => {
    expect(() =>
      projectAuthoringNavigation({
        composition: parseContentProjectComposition(fixture()),
        content: { identity: 'content-project:other' },
        localTargetResolutions: [],
        dependencyResolutions: [],
      }),
    ).toThrow("does not match 'content-project:content-project-1'");
  });

  it('encodes the sender-bound Project authoring navigation host contract', () => {
    const request = createProjectAuthoringNavigationHostRequest({
      requestId: 'request-1',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
      binding: {
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        contentProjectId: 'content-project-1',
      },
    });
    expect(request.operation).toBe('navigation-get');
    expect(
      parseProjectAuthoringNavigationHostResult(
        {
          requestId: 'request-1',
          workspaceId: 'workspace-1',
          contentProjectId: 'content-project-1',
          navigation: [
            {
              kind: 'authoring-target',
              target: { kind: 'content-project', contentProjectId: 'content-project-1' },
              identity: 'content-project:content-project-1',
              label: 'Story',
            },
          ],
        },
        'request-1',
      ).navigation,
    ).toHaveLength(1);
    expect(() =>
      parseProjectAuthoringNavigationHostResult(
        {
          requestId: 'request-1',
          workspaceId: 'workspace-1',
          contentProjectId: 'content-project-1',
          navigation: [
            {
              kind: 'authoring-target',
              target: { kind: 'content-project', contentProjectId: 'content-project-other' },
              identity: 'content-project:content-project-1',
              label: 'Wrong',
              snapshot: {
                owner: 'content',
                targetIdentity: 'content-project:content-project-1',
                snapshotId: 'snapshot-1',
              },
            },
          ],
        },
        'request-1',
      ),
    ).toThrow('does not match its exact target ref');
  });

  it('encodes one read-only aggregate catalog without raw Workspace paths', () => {
    const request = createProjectAuthoringCatalogHostRequest({
      requestId: 'catalog-request-1',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
    });
    expect(request).toEqual({
      requestId: 'catalog-request-1',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
      operation: 'catalog-get',
    });
    const result = parseProjectAuthoringCatalogHostResult(
      {
        requestId: request.requestId,
        projects: [
          {
            workspaceId: 'workspace-1',
            contentProjectId: 'content-project-1',
            label: 'Story',
            navigation: [
              {
                kind: 'authoring-target',
                target: { kind: 'world-project', worldProjectId: 'world-1' },
                identity: 'world-project:world-1',
                label: 'Cinder Sea',
              },
            ],
          },
        ],
        diagnostics: [{ contentProjectId: 'content-project-2', message: 'Unavailable.' }],
      },
      request.requestId,
    );
    expect(result.projects[0]?.navigation[0]).toMatchObject({
      target: { kind: 'world-project', worldProjectId: 'world-1' },
    });
    expect(JSON.stringify(result)).not.toContain('workspacePath');
  });
});

describe('Project authoring navigation service', () => {
  it('projects Content, linked Character and World targets, and exact external dependencies', async () => {
    const service = createNavigationService({
      composition: {
        contentProjectId: 'content-project-1',
        localTargets: [
          { kind: 'character-project', characterProjectId: 'character-1' },
          { kind: 'world-project', worldProjectId: 'world-1' },
        ],
        dependencies: [
          { kind: 'character-version', characterVersionId: 'character-version-1' },
          {
            kind: 'world-experience-version',
            worldExperienceVersionId: 'world-experience-1',
          },
        ],
      },
    });

    const navigation = await service.read({
      contentProjectId: 'content-project-1',
      contentLabel: 'Story',
    });

    expect(navigation.map((item) => item.identity)).toEqual([
      'content-project:content-project-1',
      'character-project:character-1',
      'world-project:world-1',
      'character-version:character-version-1',
      'world-experience-version:world-experience-1',
    ]);
    expect(navigation[3]).toMatchObject({
      kind: 'external-dependency',
      label: 'Character publication',
      readOnly: true,
      sourceStudioTarget: {
        kind: 'character-studio',
        characterProjectId: 'character-1',
      },
    });
    expect(navigation[4]).toMatchObject({
      kind: 'external-dependency',
      diagnostic: "WorldExperienceVersion 'world-experience-1' is unavailable.",
      readOnly: true,
    });
  });

  it('isolates an invalid linked target while retaining valid siblings and unlinked records', async () => {
    const service = createNavigationService({
      composition: {
        contentProjectId: 'content-project-1',
        localTargets: [
          { kind: 'character-project', characterProjectId: 'character-invalid' },
          { kind: 'world-project', worldProjectId: 'world-1' },
        ],
        dependencies: [],
      },
      characterDiagnostics: [
        {
          recordKind: 'character-project',
          recordId: 'character-invalid',
          message: 'Character record cannot decode.',
        },
      ],
    });

    const navigation = await service.read({
      contentProjectId: 'content-project-1',
      contentLabel: 'Story',
    });

    expect(
      navigation.find((item) => item.identity === 'character-project:character-invalid'),
    ).toMatchObject({ diagnostic: 'Character record cannot decode.' });
    expect(navigation.find((item) => item.identity === 'world-project:world-1')).toMatchObject({
      kind: 'authoring-target',
      label: 'Local world',
    });
    expect(
      navigation.find((item) => item.identity === 'character-project:character-1'),
    ).toMatchObject({ kind: 'unlinked-local-target' });
  });

  it('keeps a missing Character publication dependency unavailable without selecting another version', async () => {
    const service = createNavigationService({
      composition: {
        contentProjectId: 'content-project-1',
        localTargets: [],
        dependencies: [
          { kind: 'character-version', characterVersionId: 'character-version-missing' },
        ],
      },
    });

    await expect(
      service.read({ contentProjectId: 'content-project-1', contentLabel: 'Story' }),
    ).resolves.toContainEqual(
      expect.objectContaining({
        identity: 'character-version:character-version-missing',
        diagnostic: "CharacterVersion 'character-version-missing' is unavailable.",
      }),
    );
  });

  it('rejects Character and World catalogs from another scope', async () => {
    const service = createNavigationService({
      characterScope: { kind: 'content-project', contentProjectId: 'content-project-other' },
    });

    await expect(
      service.read({ contentProjectId: 'content-project-1', contentLabel: 'Story' }),
    ).rejects.toThrow(
      "Character authoring catalog does not match Content Project 'content-project-1'.",
    );
  });
});

function fixture(): ContentProjectComposition {
  return { contentProjectId: 'content-project-1', localTargets: [], dependencies: [] };
}

function createNavigationService(options?: {
  readonly composition?: ContentProjectComposition;
  readonly characterScope?:
    | { readonly kind: 'standalone-library' }
    | { readonly kind: 'content-project'; readonly contentProjectId: string };
  readonly characterDiagnostics?: readonly {
    readonly recordKind: 'character-project';
    readonly recordId: string;
    readonly message: string;
  }[];
}): ProjectAuthoringNavigationService {
  return new ProjectAuthoringNavigationService({
    composition: new InMemoryProjectCompositionRepository(options?.composition ?? fixture()),
    characters: {
      async readAuthoringCatalog() {
        return {
          scope: options?.characterScope ?? {
            kind: 'content-project' as const,
            contentProjectId: 'content-project-1',
          },
          projects: [
            {
              characterProjectId: 'character-1',
              displayName: 'Local character',
              draft: characterDefinition(),
              evidence: [],
              candidates: [],
              reviewStatus: 'draft' as const,
              createdAt: '2026-08-11T00:00:00.000Z',
              updatedAt: '2026-08-11T00:00:00.000Z',
            },
          ],
          versions: [
            {
              characterVersionId: 'character-version-1',
              characterProjectId: 'character-1',
              label: 'Character publication',
              definition: characterDefinition(),
              acceptedEvidenceIds: [],
              publishedAt: '2026-08-11T00:00:00.000Z',
            },
          ],
          authoringTestSnapshots: [],
          diagnostics: options?.characterDiagnostics ?? [],
        };
      },
    },
    worlds: {
      async readAuthoringCatalog() {
        return {
          scope: { kind: 'content-project' as const, contentProjectId: 'content-project-1' },
          projects: [
            {
              worldProjectId: 'world-1',
              title: 'Local world',
              draft: worldDefinition(),
              sourceRefs: [],
              reviewStatus: 'draft' as const,
              createdAt: '2026-08-11T00:00:00.000Z',
              updatedAt: '2026-08-11T00:00:00.000Z',
            },
          ],
          versions: [],
          diagnostics: [],
        };
      },
    },
  });
}

function characterDefinition() {
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

function worldDefinition() {
  return {
    background: 'Background',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}
