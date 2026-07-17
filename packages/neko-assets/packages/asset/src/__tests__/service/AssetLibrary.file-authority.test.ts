import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout, resolveStorageLayout } from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  ENTITY_ASSET_PROJECTION_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { AssetLibrary } from '../../service/AssetLibrary';
import { JsonFileStorage, type IFileSystem } from '../../storage/JsonFileStorage';

const WORKSPACE_ID = '36967dfd-e6db-4bce-bf37-4db2ebd5371d';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('AssetLibrary project fact authority', () => {
  it('reopens asset facts from library.json after the SQLite graph projection is cleared', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-asset-file-authority-'));
    temporaryDirectories.push(homedir);
    const projectRoot = join(homedir, 'workspace');
    const libraryPath = resolveStorageLayout(projectRoot, homedir).project.facts.assetLibrary;
    const files = createMemoryFileSystem();
    const storage = new JsonFileStorage({
      filePath: libraryPath,
      fs: files,
      autoSaveDelay: 60_000,
    });
    const library = new AssetLibrary({ storage });
    await library.initialize();
    const entity = await library.createEntity({
      name: 'Rin portrait',
      category: 'character',
      tags: ['portrait', 'confirmed'],
    });
    const variant = await library.addVariant(entity.id, {
      name: 'Default',
      attributes: { view: 'front' },
    });
    const file = await library.addFile(variant.id, 'media/rin-portrait.png', {
      purpose: 'main',
    });
    await library.flush();
    storage.dispose();

    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
    await metadataStore.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T08:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'entity-asset-projection',
    };
    await metadataStore.repositories.entityAssetProjections.replaceSource({
      partition,
      sourceId: 'asset-library',
      records: [
        {
          projectionId: `asset:${entity.id}`,
          kind: 'asset-graph-node',
          sourceId: 'asset-library',
          assetRef: `project://assets/${entity.id}`,
          freshness: 'fresh',
          value: {
            id: `asset:${entity.id}`,
            kind: 'asset',
            refId: `project://assets/${entity.id}`,
            label: 'Rin portrait',
          },
          updatedAt: '2026-07-13T08:01:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T08:01:00.000Z',
    });
    await metadataStore.repositories.cacheMaintenance.clearPartition({
      table: 'entity_asset_projections',
      partition,
      reason: 'rebuild',
      updatedAt: '2026-07-13T08:02:00.000Z',
    });
    await metadataStore.dispose();

    const reopenedStorage = new JsonFileStorage({ filePath: libraryPath, fs: files });
    const reopened = new AssetLibrary({ storage: reopenedStorage });
    await reopened.initialize();

    await expect(reopened.getEntity(entity.id)).resolves.toMatchObject({
      id: entity.id,
      name: 'Rin portrait',
      tags: ['portrait', 'confirmed'],
      variants: [
        expect.objectContaining({
          id: variant.id,
          files: [
            expect.objectContaining({
              id: file.id,
              path: 'media/rin-portrait.png',
              purpose: 'main',
            }),
          ],
        }),
      ],
    });
    expect(files.readText(libraryPath)).toContain('Rin portrait');
    reopenedStorage.dispose();
  });
});

function createMemoryFileSystem(): IFileSystem & { readText(filePath: string): string } {
  const files = new Map<string, string>();
  return {
    readFile: async (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`Missing file: ${filePath}`);
      return content;
    },
    writeFile: async (filePath, content) => {
      files.set(filePath, content);
    },
    exists: async (filePath) => files.has(filePath),
    mkdir: async () => undefined,
    readText: (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`Missing file: ${filePath}`);
      return content;
    },
  };
}
