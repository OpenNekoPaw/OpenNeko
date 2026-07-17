import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CATALOG_PROJECTION_MIGRATIONS,
  ENTITY_ASSET_PROJECTION_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  SEARCH_PROJECTION_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { runLocalMetadataAdapterContract } from '@neko/shared/local-metadata/testing';
import { resolveGlobalStorageLayout } from '@neko/shared';
import { createBunSqliteLocalMetadataStore } from '../bun-sqlite-local-metadata-store';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';
const temporaryDirectories: string[] = [];

async function createTemporaryHome(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'neko-bun-sqlite-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('bun:sqlite local metadata store', () => {
  it('passes the shared local metadata adapter contract', async () => {
    await runLocalMetadataAdapterContract({
      sourceHome: await createTemporaryHome(),
      backupHome: await createTemporaryHome(),
      createStore: (homedir) => createBunSqliteLocalMetadataStore({ homedir }),
    });
  });

  it('opens the canonical database, migrates M1, and persists a workspace', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createBunSqliteLocalMetadataStore({ homedir });

    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });

    expect(await store.repositories.workspaces.get(WORKSPACE_ID)).toMatchObject({
      workspaceId: WORKSPACE_ID,
      currentLocator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      orphanedAt: null,
    });

    await store.dispose();
  });

  it('classifies a corrupt database as an integrity failure', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    await mkdir(join(homedir, '.neko'), { recursive: true });
    await writeFile(layout.database, 'not a sqlite database', 'utf8');
    const store = createBunSqliteLocalMetadataStore({ homedir });

    await expect(
      store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 }),
    ).rejects.toMatchObject({
      code: 'metadata-integrity-failed',
      operation: 'open-bun-sqlite',
    });
  });

  it('migrates Search, Entity/Asset, and catalog projection tables through bun:sqlite', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createBunSqliteLocalMetadataStore({ homedir });
    const searchPartition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'project-search',
    };

    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await store.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
    await store.migrateNamespace(CATALOG_PROJECTION_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await store.repositories.searchDocuments.replaceSearchPartition({
      partition: searchPartition,
      searchPartition: 'media-library',
      documents: [
        {
          documentId: 'media:cat-walk',
          partition: 'media-library',
          kind: 'media',
          label: 'Cat walk.mp4',
          source: {
            partition: 'media-library',
            sourceId: '${MEDIA}/Cat walk.mp4',
            filePath: '${MEDIA}/Cat walk.mp4',
          },
          fileKey: '${MEDIA}/Cat walk.mp4',
          searchText: 'Cat walk video',
          freshness: 'fresh',
          updatedAt: '2026-07-13T05:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T05:00:00.000Z',
    });

    expect(
      await store.repositories.searchDocuments.query({
        partition: searchPartition,
        text: 'cat walk',
        limit: 10,
      }),
    ).toEqual([expect.objectContaining({ documentId: 'media:cat-walk' })]);
    expect(
      await store.repositories.semanticProjections.list({
        scope: 'workspace',
        workspaceId: WORKSPACE_ID,
        domain: 'semantic-projection',
      }),
    ).toEqual([]);
    const entityPartition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'entity-asset-projection',
    };
    await store.repositories.entityAssetProjections.replaceSource({
      partition: entityPartition,
      sourceId: 'neko-entity-facts',
      records: [
        {
          projectionId: 'binding:rin-portrait',
          kind: 'binding-availability',
          sourceId: 'neko-entity-facts',
          entityId: 'char_rin',
          assetRef: 'project://assets/rin.png',
          freshness: 'fresh',
          value: {
            bindingId: 'binding:rin-portrait',
            entityId: 'char_rin',
            entityKind: 'character',
            assetRef: 'project://assets/rin.png',
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
          },
          updatedAt: '2026-07-13T05:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T05:00:00.000Z',
    });
    expect(
      await store.repositories.entityAssetProjections.list({
        partition: entityPartition,
        assetRef: 'project://assets/rin.png',
      }),
    ).toEqual([expect.objectContaining({ entityId: 'char_rin' })]);
    const catalogPartition = {
      scope: 'global' as const,
      workspaceId: null,
      domain: 'catalog',
    };
    await store.repositories.catalogItems.replaceSlice({
      partition: catalogPartition,
      kind: 'processor',
      source: 'personal',
      items: [
        {
          catalogId: 'personal-processors:waveform',
          kind: 'processor',
          source: 'personal',
          name: 'waveform',
          displayName: 'Waveform Processor',
          description: null,
          version: '1.0.0',
          rootId: 'personal-processors',
          relativePath: 'waveform.neko-processor.json',
          fingerprint: 'sha256:waveform-v1',
          enabled: true,
          diagnosticCodes: [],
          updatedAt: '2026-07-13T05:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T05:00:00.000Z',
    });
    expect(await store.repositories.catalogItems.list({ partition: catalogPartition })).toEqual([
      expect.objectContaining({ kind: 'processor', name: 'waveform' }),
    ]);

    await store.dispose();
  });
});
