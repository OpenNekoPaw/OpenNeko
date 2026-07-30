import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { M1_LOCAL_METADATA_MIGRATIONS } from '../sqlite';
import type { LocalMetadataMigration } from '../contracts';

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

  it('repairs an applied v2 migration without quarantining later Desktop conversations', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-applied-v2-conversation-migration-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const initialMigration = M1_LOCAL_METADATA_MIGRATIONS[0];
    if (!initialMigration) throw new Error('Core v1 metadata migration is missing.');

    const initial = createNodeSqliteLocalMetadataStore({ homedir });
    await initial.open({ databasePath, busyTimeoutMs: 1_000 });
    await initial.migrateNamespace([initialMigration]);
    await initial.dispose();

    const legacyDatabase = new DatabaseSync(databasePath);
    insertConversation(legacyDatabase, {
      conversationId: 'legacy-vscode-conversation',
      journalId: 'legacy-vscode-journal',
      source: 'vscode',
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    legacyDatabase.close();

    const appliedV2 = createNodeSqliteLocalMetadataStore({ homedir });
    await appliedV2.open({ databasePath, busyTimeoutMs: 1_000 });
    await appliedV2.migrateNamespace([initialMigration, PREVIOUSLY_APPLIED_V2_MIGRATION]);
    await appliedV2.dispose();

    const postV2Database = new DatabaseSync(databasePath);
    const appliedAt = readStringColumn(
      postV2Database
        .prepare(
          `SELECT applied_at
           FROM schema_migrations
          WHERE namespace = 'core' AND version = 2`,
        )
        .get(),
      'applied_at',
    );
    insertConversation(postV2Database, {
      conversationId: 'desktop-conversation',
      journalId: 'desktop-journal',
      source: 'desktop',
      createdAt: appliedAt,
    });
    postV2Database.close();

    const current = createNodeSqliteLocalMetadataStore({ homedir });
    await current.open({ databasePath, busyTimeoutMs: 1_000 });
    await current.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await expect(
      current.repositories.conversations.get('legacy-vscode-conversation'),
    ).resolves.toBeNull();
    await expect(
      current.repositories.conversations.get('desktop-conversation'),
    ).resolves.toMatchObject({
      journalId: 'desktop-journal',
      source: 'desktop',
    });
    await current.dispose();

    const preservedDatabase = new DatabaseSync(databasePath, { readOnly: true });
    const preservedLegacy = preservedDatabase
      .prepare(
        `SELECT conversation_id, source
           FROM conversations_pre_desktop_v2
          WHERE conversation_id = ?`,
      )
      .get('legacy-vscode-conversation');
    preservedDatabase.close();
    expect(preservedLegacy).toEqual({
      conversation_id: 'legacy-vscode-conversation',
      source: 'desktop',
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

const PREVIOUSLY_APPLIED_V2_MIGRATION: LocalMetadataMigration = {
  namespace: 'core',
  version: 2,
  name: 'desktop-conversation-sources',
  checksum: 'sha256:core-desktop-conversation-sources-v2',
  ownership: 'system',
  destructive: false,
  statements: [
    'ALTER TABLE conversations RENAME TO conversations_removed_host_sources',
    'DROP INDEX conversations_workspace_updated_idx',
    `CREATE TABLE conversations (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT,
      journal_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('desktop', 'agent', 'import')),
      model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT`,
    `INSERT INTO conversations (
      conversation_id,
      workspace_id,
      journal_id,
      title,
      source,
      model,
      created_at,
      updated_at
    )
    SELECT
      conversation_id,
      workspace_id,
      journal_id,
      title,
      CASE WHEN source IN ('vscode', 'tui') THEN 'desktop' ELSE source END,
      model,
      created_at,
      updated_at
    FROM conversations_removed_host_sources`,
    'DROP TABLE conversations_removed_host_sources',
    `CREATE INDEX conversations_workspace_updated_idx
      ON conversations(workspace_id, updated_at DESC)`,
  ],
};

function insertConversation(
  database: DatabaseSync,
  input: {
    readonly conversationId: string;
    readonly journalId: string;
    readonly source: 'vscode' | 'tui' | 'desktop' | 'agent' | 'import';
    readonly createdAt: string;
  },
): void {
  database
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
      input.conversationId,
      null,
      input.journalId,
      input.conversationId,
      input.source,
      null,
      input.createdAt,
      input.createdAt,
    );
}

function readStringColumn(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Expected SQLite row containing '${key}'.`);
  }
  const column = Reflect.get(value, key);
  if (typeof column !== 'string') {
    throw new Error(`Expected SQLite string column '${key}'.`);
  }
  return column;
}
