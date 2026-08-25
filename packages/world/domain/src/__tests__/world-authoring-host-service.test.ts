import type { WorldProject, WorldVersion } from '@neko/world-domain/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { WorldAuthoringService } from '../application/world-authoring-service';
import { WorldAuthoringHostService } from '../application/world-authoring-host-service';

describe('WorldAuthoringHostService', () => {
  it('projects only the exact project record, publications, and local diagnostics', async () => {
    const project = worldProject('world-1');
    const version = worldVersion('world-1', 'version-1');
    const service = createService({
      projects: [project, worldProject('world-2')],
      versions: [version, worldVersion('world-2', 'version-2')],
      diagnostics: [
        { recordKind: 'world-version', recordId: 'version-1', message: 'Review note' },
        { recordKind: 'world-project', recordId: 'world-2', message: 'Sibling failure' },
      ],
    });

    await expect(service.getSnapshot('world-1')).resolves.toEqual({
      project,
      versions: [version],
      diagnostics: [
        {
          owner: 'world',
          recordKind: 'world-version',
          recordId: 'version-1',
          message: 'Review note',
        },
      ],
    });
  });

  it('rejects a catalog from another Content Project without reading an active target', async () => {
    const service = createService({
      scope: { kind: 'project', projectId: 'project-other' },
      projects: [worldProject('world-1')],
    });

    await expect(service.getSnapshot('world-1')).rejects.toThrow(
      'does not match its exact authority',
    );
  });

  it('delegates an exact authoring command and then reloads the canonical snapshot', async () => {
    const updateDraft = vi.fn(async () => worldProject('world-1'));
    const service = createService({ projects: [worldProject('world-1')] }, { updateDraft });
    const draft = definition();

    const snapshot = await service.execute({
      operation: 'world-project-update-draft',
      input: { worldProjectId: 'world-1', draft },
    });

    expect(updateDraft).toHaveBeenCalledWith({ worldProjectId: 'world-1', draft }, undefined);
    expect(snapshot.project.worldProjectId).toBe('world-1');
  });
});

function createService(
  catalog: Partial<
    Awaited<
      ReturnType<
        import('../application/world-durable-catalog').WorldAuthoringCatalogPort['readAuthoringCatalog']
      >
    >
  >,
  authoringMethods: Partial<WorldAuthoringService> = {},
): WorldAuthoringHostService {
  const authoring = {
    updateDraft: vi.fn(),
    setReviewStatus: vi.fn(),
    publish: vi.fn(),
    ...authoringMethods,
  } as unknown as WorldAuthoringService;
  return new WorldAuthoringHostService({
    scope: { kind: 'project', projectId: 'project-1' },
    catalog: {
      readAuthoringCatalog: async () => ({
        scope: { kind: 'project', projectId: 'project-1' },
        projects: [],
        versions: [],
        diagnostics: [],
        ...catalog,
      }),
    },
    authoring,
  });
}

function definition() {
  return {
    background: 'World',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}

function worldProject(worldProjectId: string): WorldProject {
  return {
    worldProjectId,
    title: worldProjectId,
    draft: definition(),
    sourceRefs: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  };
}

function worldVersion(worldProjectId: string, worldVersionId: string): WorldVersion {
  return {
    worldVersionId,
    worldProjectId,
    label: worldVersionId,
    definition: definition(),
    acceptedSourceRefIds: [],
    publishedAt: '2026-08-11T00:00:00.000Z',
  };
}
