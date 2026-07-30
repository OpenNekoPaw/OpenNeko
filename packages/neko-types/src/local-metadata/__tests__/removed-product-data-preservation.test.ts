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
  it('isolates retired host conversations without importing them into Desktop state', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-conversation-source-migration-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const initialMigration = M1_LOCAL_METADATA_MIGRATIONS[0];
    if (!initialMigration) throw new Error('Core v1 metadata migration is missing.');

    const initial = createNodeSqliteLocalMetadataStore({ homedir });
    await initial.open({ databasePath, busyTimeoutMs: 1_000 });
    await initial.migrateNamespace([initialMigration]);
    await initial.dispose();

    const legacyDatabase = new DatabaseSync(databasePath);
    legacyDatabase
      .prepare(
        `INSERT INTO conversations (
          conversation_id,
          workspace_id,
          journal_id,
          title,
          source,
          model,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'legacy-conversation',
        null,
        'legacy-journal',
        'Preserved conversation',
        'vscode',
        null,
        '2026-07-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      );
    legacyDatabase
      .prepare(
        `INSERT INTO conversations (
          conversation_id,
          workspace_id,
          journal_id,
          title,
          source,
          model,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'agent-conversation',
        null,
        'agent-journal',
        'Agent conversation',
        'agent',
        null,
        '2026-07-02T00:00:00.000Z',
        '2026-07-02T00:00:00.000Z',
      );
    legacyDatabase.close();

    const current = createNodeSqliteLocalMetadataStore({ homedir });
    await current.open({ databasePath, busyTimeoutMs: 1_000 });
    await current.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await expect(current.repositories.conversations.get('legacy-conversation')).resolves.toBeNull();
    await expect(
      current.repositories.conversations.get('agent-conversation'),
    ).resolves.toMatchObject({
      journalId: 'agent-journal',
      title: 'Agent conversation',
      source: 'agent',
    });
    await current.dispose();

    const preservedDatabase = new DatabaseSync(databasePath, { readOnly: true });
    const retiredRow = preservedDatabase
      .prepare(
        `SELECT conversation_id, journal_id, title, source
           FROM retired_host_conversations_v1
          WHERE conversation_id = ?`,
      )
      .get('legacy-conversation');
    preservedDatabase.close();

    expect(retiredRow).toEqual({
      conversation_id: 'legacy-conversation',
      journal_id: 'legacy-journal',
      title: 'Preserved conversation',
      source: 'vscode',
    });
  });

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
