import { describe, expect, it, vi } from 'vitest';
import { parseWorldProject } from '@neko/world/contracts';
import {
  WorldGlobalCatalogService,
  type WorldGlobalCatalogRepository,
} from './world-global-catalog-service';

describe('WorldGlobalCatalogService', () => {
  it('creates a global World and first version without a Workspace link', async () => {
    const repository = repositoryFixture();
    const receipt = await serviceFixture(repository).createGlobal({
      globalWorldId: 'global-world-assistant',
      worldVersionId: 'world-version-assistant',
      title: 'Archive City',
      label: 'v1',
      definition: worldDefinition(),
    });

    expect(receipt.worldVersion.globalWorldId).toBe('global-world-assistant');
    expect(repository.commitGlobalCatalog).toHaveBeenCalledWith(
      expect.not.objectContaining({ link: expect.anything() }),
      undefined,
    );
    expect(repository.commitCatalog).not.toHaveBeenCalled();
  });

  it('creates one global World and exact immutable first version', async () => {
    const repository = repositoryFixture();
    const service = serviceFixture(repository);

    const receipt = await service.synchronize({
      worldProjectId: 'world-project-1',
      globalWorldId: 'global-world-1',
      worldVersionId: 'world-version-1',
      label: 'v1',
    });

    expect(receipt.globalWorld.worldVersionIds).toEqual(['world-version-1']);
    expect(receipt.link).toEqual({
      worldProjectId: 'world-project-1',
      globalWorldId: 'global-world-1',
      lastSyncedWorldVersionId: 'world-version-1',
    });
    expect(repository.commitCatalog).toHaveBeenCalledOnce();
  });

  it('rejects a stale base without mutating the repository', async () => {
    const repository = repositoryFixture({
      worlds: [
        {
          globalWorldId: 'global-world-1',
          title: 'Neko World',
          currentWorldVersionId: 'world-version-2',
          worldVersionIds: ['world-version-2'],
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      versions: [worldVersion('world-version-2')],
      links: [],
      diagnostics: [],
    });
    const service = serviceFixture(repository);

    await expect(
      service.synchronize({
        worldProjectId: 'world-project-1',
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-3',
        label: 'v3',
        lastSyncedWorldVersionId: 'world-version-1',
      }),
    ).rejects.toMatchObject({ code: 'global-world-stale-base' });
    expect(repository.commitCatalog).not.toHaveBeenCalled();
  });

  it('prepares a fresh Workspace World from one exact global version', async () => {
    const sourceVersion = worldVersion('world-version-2');
    const repository = repositoryFixture({
      worlds: [
        {
          globalWorldId: 'global-world-1',
          title: 'Neko World',
          currentWorldVersionId: sourceVersion.worldVersionId,
          worldVersionIds: [sourceVersion.worldVersionId],
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      versions: [sourceVersion],
      links: [],
      diagnostics: [],
    });

    await expect(
      serviceFixture(repository).prepareWorkspaceCopy({
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-2',
        worldProjectId: 'world-project-copy',
      }),
    ).resolves.toMatchObject({
      worldProjectId: 'world-project-copy',
      title: 'Neko World',
      draft: sourceVersion.definition,
      sourceRefs: [],
    });
    expect(repository.commitCatalog).not.toHaveBeenCalled();
    expect(repository.commitGlobalCatalog).not.toHaveBeenCalled();
  });

  it('imports one exact version without creating a Workspace link', async () => {
    const repository = repositoryFixture();
    const receipt = await serviceFixture(repository).importVersion({
      target: { kind: 'new', globalWorldId: 'global-world-imported' },
      title: 'Imported World',
      worldVersion: worldVersion('world-version-imported'),
    });

    expect(receipt.globalWorld.worldVersionIds).toEqual(['world-version-imported']);
    expect(repository.commitGlobalCatalog).toHaveBeenCalledWith(
      expect.not.objectContaining({ link: expect.anything() }),
      undefined,
    );
    expect(repository.commitCatalog).not.toHaveBeenCalled();
  });
});

function serviceFixture(repository: WorldGlobalCatalogRepository) {
  return new WorldGlobalCatalogService({
    repository,
    workspace: { readProject: async () => worldProject() },
    now: () => '2026-08-15T01:00:00.000Z',
  });
}

function repositoryFixture(
  catalog: Awaited<ReturnType<WorldGlobalCatalogRepository['readCatalog']>> = {
    worlds: [],
    versions: [],
    links: [],
    diagnostics: [],
  },
): WorldGlobalCatalogRepository {
  return {
    readCatalog: vi.fn(async () => structuredClone(catalog)),
    commitCatalog: vi.fn(async () => undefined),
    commitGlobalCatalog: vi.fn(async () => undefined),
  };
}

function worldProject() {
  return parseWorldProject({
    worldProjectId: 'world-project-1',
    title: 'Neko World',
    draft: worldDefinition(),
    sourceRefs: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  });
}

function worldVersion(worldVersionId: string) {
  return {
    worldVersionId,
    globalWorldId: 'global-world-1',
    label: worldVersionId,
    definition: worldDefinition(),
    acceptedSourceRefIds: [],
    publishedAt: '2026-08-15T00:00:00.000Z',
  };
}

function worldDefinition() {
  return {
    background: '',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}
