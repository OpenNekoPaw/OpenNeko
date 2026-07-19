import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { M1_LOCAL_METADATA_MIGRATIONS } from '../sqlite';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('removed product data preservation', () => {
  it('keeps old Market table bytes without exposing an active repository', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-removed-product-data-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;

    const initial = createNodeSqliteLocalMetadataStore({ homedir });
    await initial.open({ databasePath, busyTimeoutMs: 1_000 });
    await initial.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await initial.dispose();

    const legacyDatabase = new DatabaseSync(databasePath);
    legacyDatabase.exec(`CREATE TABLE market_installations (
      package_id TEXT PRIMARY KEY NOT NULL,
      install_location TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT`);
    legacyDatabase
      .prepare(
        `INSERT INTO market_installations (
          package_id, install_location, receipt_json, updated_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .run('@example/legacy-pack', '${HOME}/.neko/market/legacy-pack', '{"opaque":true}', 1);
    legacyDatabase.close();

    const current = createNodeSqliteLocalMetadataStore({ homedir });
    await current.open({ databasePath, busyTimeoutMs: 1_000 });
    expect(Object.hasOwn(current.repositories, 'marketInstallations')).toBe(false);
    await current.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await current.dispose();

    const preservedDatabase = new DatabaseSync(databasePath, { readOnly: true });
    const row = preservedDatabase
      .prepare(
        `SELECT package_id, install_location, receipt_json, updated_at
           FROM market_installations`,
      )
      .get();
    preservedDatabase.close();

    expect(row).toEqual({
      package_id: '@example/legacy-pack',
      install_location: '${HOME}/.neko/market/legacy-pack',
      receipt_json: '{"opaque":true}',
      updated_at: 1,
    });
  });
});
