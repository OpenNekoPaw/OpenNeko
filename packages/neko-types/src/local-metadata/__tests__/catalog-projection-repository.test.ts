import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { CATALOG_PROJECTION_MIGRATIONS, M1_LOCAL_METADATA_MIGRATIONS } from '../sqlite';

const temporaryDirectories: string[] = [];
const WORKSPACE_ID = '58f5db7f-65ea-4f50-97b8-7f9ed117fe1b';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Catalog projection repository', () => {
  it('round-trips a descriptor-only project Skill catalog slice', async () => {
    const { store } = await openCatalogStore();
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'catalog',
    };
    const descriptor = {
      catalogId: 'project-agent-skills:storyboard',
      kind: 'skill' as const,
      source: 'project' as const,
      name: 'storyboard',
      displayName: 'storyboard',
      description: 'Create a storyboard from a validated creative brief.',
      version: null,
      rootId: 'project-agent-skills',
      relativePath: 'storyboard',
      fingerprint: 'sha256:storyboard-v1',
      enabled: true,
      diagnosticCodes: [],
      updatedAt: '2026-07-13T08:00:00.000Z',
    };

    await store.repositories.catalogItems.replaceSlice({
      partition,
      kind: 'skill',
      source: 'project',
      items: [descriptor],
      updatedAt: descriptor.updatedAt,
    });

    await expect(store.repositories.catalogItems.list({ partition })).resolves.toEqual([
      descriptor,
    ]);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 1,
      freshness: 'fresh',
    });
    await store.dispose();
  });

  it('replaces one kind/source slice without deleting sibling catalog slices', async () => {
    const { store } = await openCatalogStore();
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'catalog',
    };
    const updatedAt = '2026-07-13T08:30:00.000Z';
    await store.repositories.catalogItems.replaceSlice({
      partition,
      kind: 'skill',
      source: 'project',
      items: [
        {
          catalogId: 'project-agent-skills:storyboard',
          kind: 'skill',
          source: 'project',
          name: 'storyboard',
          displayName: 'storyboard',
          description: 'Create a storyboard.',
          version: null,
          rootId: 'project-agent-skills',
          relativePath: 'storyboard',
          fingerprint: 'sha256:storyboard-v1',
          enabled: true,
          diagnosticCodes: [],
          updatedAt,
        },
      ],
      updatedAt,
    });
    await store.repositories.catalogItems.replaceSlice({
      partition,
      kind: 'command',
      source: 'project',
      items: [
        {
          catalogId: 'project-neko-commands:review',
          kind: 'command',
          source: 'project',
          name: 'review',
          displayName: '/review',
          description: 'Review the current project.',
          version: null,
          rootId: 'project-neko-commands',
          relativePath: 'review.md',
          fingerprint: 'sha256:review-v1',
          enabled: true,
          diagnosticCodes: [],
          updatedAt,
        },
      ],
      updatedAt,
    });

    await store.repositories.catalogItems.replaceSlice({
      partition,
      kind: 'skill',
      source: 'project',
      items: [],
      updatedAt: '2026-07-13T08:31:00.000Z',
    });

    await expect(store.repositories.catalogItems.list({ partition })).resolves.toEqual([
      expect.objectContaining({ kind: 'command', name: 'review' }),
    ]);
    await store.dispose();
  });

  it('creates only explicit descriptor columns without source content storage', async () => {
    const { databasePath, store } = await openCatalogStore();
    await store.dispose();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const columns = database
      .prepare("SELECT name FROM pragma_table_info('catalog_items') ORDER BY cid")
      .all()
      .flatMap((row) => (typeof row['name'] === 'string' ? [row['name']] : []));
    database.close();

    expect(columns).toEqual([
      'partition_key',
      'partition_scope',
      'workspace_id',
      'item_kind',
      'source_scope',
      'catalog_id',
      'name',
      'display_name',
      'description',
      'version',
      'root_id',
      'relative_path',
      'fingerprint',
      'enabled',
      'diagnostic_codes_json',
      'updated_at',
    ]);
  });

  it('rejects project descriptors in the global catalog partition', async () => {
    const { store } = await openCatalogStore();

    await expect(
      store.repositories.catalogItems.replaceSlice({
        partition: { scope: 'global', workspaceId: null, domain: 'catalog' },
        kind: 'skill',
        source: 'project',
        items: [],
        updatedAt: '2026-07-13T09:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: 'metadata-transaction-failed',
      operation: 'replace-catalog-slice',
    });
    await store.dispose();
  });

  it('clears catalog cache rows through the allowlisted partition cleanup path', async () => {
    const { store } = await openCatalogStore();
    const partition = { scope: 'global' as const, workspaceId: null, domain: 'catalog' };
    const updatedAt = '2026-07-13T09:30:00.000Z';
    await store.repositories.catalogItems.replaceSlice({
      partition,
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
          updatedAt,
        },
      ],
      updatedAt,
    });

    await expect(
      store.repositories.cacheMaintenance.clearPartition({
        table: 'catalog_items',
        partition,
        reason: 'rebuild',
        updatedAt: '2026-07-13T09:31:00.000Z',
      }),
    ).resolves.toEqual({ deletedRows: 1 });
    await expect(store.repositories.catalogItems.list({ partition })).resolves.toEqual([]);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      freshness: 'stale',
      diagnostic: 'cache-cleared:rebuild',
    });
    await store.dispose();
  });
});

async function openCatalogStore() {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-catalog-projection-'));
  temporaryDirectories.push(homedir);
  const databasePath = resolveGlobalStorageLayout(homedir).database;
  const store = createNodeSqliteLocalMetadataStore({ homedir });
  await store.open({ databasePath, busyTimeoutMs: 1_000 });
  await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await store.migrateNamespace(CATALOG_PROJECTION_MIGRATIONS);
  await store.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-13T00:00:00.000Z',
  });
  return { databasePath, store };
}
