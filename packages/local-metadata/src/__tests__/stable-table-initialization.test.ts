import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { initializeCoreLocalMetadataTables } from '../sqlite/m1-schema';
import { initializeResourceCacheTables } from '../sqlite/resource-cache-schema';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('stable local metadata table initialization', () => {
  it('is idempotent and does not create a schema registry', async () => {
    const store = await openStore();

    await initializeCoreLocalMetadataTables(store);
    await initializeCoreLocalMetadataTables(store);
    const names = await readTableNames(store);

    expect(names).toEqual(expect.arrayContaining(['conversations', 'workspaces']));
    expect(names).not.toContain('projection_versions');
    expect(names).not.toContain(['schema_', 'migra', 'tions'].join(''));
    await store.dispose();
  });

  it('does not delete existing cache rows when tables are initialized again', async () => {
    const store = await openStore();
    await initializeCoreLocalMetadataTables(store);
    await initializeResourceCacheTables(store);
    await store.transaction(
      { mode: 'cache-write', ownership: 'cache', operation: 'seed-cache-initialization-row' },
      ({ sql }) =>
        sql.run(
          `INSERT INTO resource_cache_entries(
             partition_key, partition_scope, workspace_id, resource_id, entry_json,
             status, created_at, updated_at, last_accessed_at
           ) VALUES (?, 'global', NULL, ?, ?, 'ready', ?, ?, NULL)`,
          ['global:cache', 'resource-1', '{"id":"resource-1"}', '2026-08-05', '2026-08-05'],
        ),
    );

    await initializeResourceCacheTables(store);
    const rows = await store.transaction(
      { mode: 'read', ownership: 'cache', operation: 'verify-cache-initialization-row' },
      ({ sql }) => sql.all('SELECT resource_id, entry_json FROM resource_cache_entries'),
    );

    expect(rows).toEqual([{ resource_id: 'resource-1', entry_json: '{"id":"resource-1"}' }]);
    await store.dispose();
  });
});

async function openStore() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-stable-tables-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  return store;
}

async function readTableNames(
  store: ReturnType<typeof createNodeSqliteLocalMetadataStore>,
): Promise<readonly unknown[]> {
  const rows = await store.transaction(
    { mode: 'read', ownership: 'system', operation: 'read-stable-table-names' },
    ({ sql }) => sql.all(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`),
  );
  return rows.map((row) => row['name']);
}
