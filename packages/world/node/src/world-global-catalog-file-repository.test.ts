import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorldGlobalCatalogFileRepository } from './world-global-catalog-file-repository';

describe('WorldGlobalCatalogFileRepository', () => {
  it('atomically creates and appends immutable versions with an exact Workspace link', async () => {
    const repository = new WorldGlobalCatalogFileRepository(await root());
    await repository.commitCatalog(commit('version-1'));
    await repository.commitCatalog({
      ...commit('version-2', ['version-1', 'version-2']),
      expectedCurrentWorldVersionId: 'version-1',
    });

    const catalog = await repository.readCatalog();
    expect(catalog.worlds[0]).toMatchObject({
      currentWorldVersionId: 'version-2',
      worldVersionIds: ['version-1', 'version-2'],
    });
    expect(catalog.links[0]?.lastSyncedWorldVersionId).toBe('version-2');
  });

  it('rejects stale CAS and isolates a damaged sibling aggregate', async () => {
    const workspace = await root();
    const repository = new WorldGlobalCatalogFileRepository(workspace);
    await repository.commitCatalog(commit('version-1'));
    await expect(
      repository.commitCatalog({
        ...commit('version-2', ['version-1', 'version-2']),
        expectedCurrentWorldVersionId: 'wrong-version',
      }),
    ).rejects.toThrow('changed before commit');
    const directory = join(workspace, 'neko/global-worlds');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'damaged.json'), '{', 'utf8');
    const catalog = await repository.readCatalog();
    expect(catalog.worlds).toHaveLength(1);
    expect(catalog.diagnostics).toHaveLength(1);
  });
});

function commit(versionId: string, history: readonly string[] = [versionId]) {
  return {
    world: {
      globalWorldId: 'global-world-1',
      title: 'Archive City',
      currentWorldVersionId: versionId,
      worldVersionIds: history,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
    version: {
      worldVersionId: versionId,
      globalWorldId: 'global-world-1',
      label: versionId,
      definition: {
        background: '',
        worldBook: [],
        locations: [],
        organizations: [],
        rules: [],
        initialFacts: [],
      },
      acceptedSourceRefIds: [],
      publishedAt: '2026-08-15T00:00:00.000Z',
    },
    link: {
      worldProjectId: 'world-project-1',
      globalWorldId: 'global-world-1',
      lastSyncedWorldVersionId: versionId,
    },
  };
}

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'neko-global-world-'));
}
