import { createHash } from 'node:crypto';
import { mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const LEGACY_MIGRATION_ID = 'agent-pi-metadata-sqlite-v1';
const CANONICAL_CONVERSATION_COLUMNS = [
  'workspace_id:TEXT:1:0',
  'conversation_id:TEXT:0:1',
  'title:TEXT:1:0',
  'active_branch_id:TEXT:1:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;
const EMBEDDED_CONTEXT_CONVERSATION_COLUMNS = [
  'context_schema_version:INTEGER:1:0',
  'context_kind:TEXT:1:0',
  'context_id:TEXT:1:0',
  'project_id:TEXT:0:0',
  'workspace_id:TEXT:0:0',
  'conversation_id:TEXT:0:1',
  'title:TEXT:1:0',
  'active_branch_id:TEXT:1:0',
  'created_at:TEXT:1:0',
  'updated_at:TEXT:1:0',
] as const;
const PI_TABLES = [
  'pi_conversations',
  'pi_branches',
  'pi_execution_leases',
  'pi_turn_checkpoints',
] as const;

export interface NodePiConversationStorage {
  readonly database: DatabaseSync;
  readonly databasePath: string;
  readonly sessionsRoot: string;
}

export async function openNodePiConversationStorage(
  userDataRoot: string,
): Promise<NodePiConversationStorage> {
  const sessionsRoot = join(userDataRoot, 'agent', 'pi', 'sessions');
  await mkdir(sessionsRoot, { recursive: true });
  const sqlite = await import('node:sqlite');
  const databasePath = join(userDataRoot, 'neko.db');
  const database = new sqlite.DatabaseSync(databasePath, {
    enableForeignKeyConstraints: true,
    timeout: 5_000,
  });
  try {
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
    `);
    migratePiConversationSchema(database);
    await migrateLegacyPiConversationStorage(database, userDataRoot);
    return { database, databasePath, sessionsRoot };
  } catch (error) {
    database.close();
    throw error;
  }
}

export function migratePiConversationSchema(database: DatabaseSync): void {
  migrateEmbeddedConversationContextTable(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS pi_conversations (
      workspace_id TEXT NOT NULL,
      conversation_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      active_branch_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pi_conversations_workspace_updated
      ON pi_conversations(workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS pi_branches (
      conversation_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      parent_branch_id TEXT,
      state TEXT NOT NULL CHECK(state IN ('active', 'historical')),
      pi_session_id TEXT NOT NULL UNIQUE,
      pi_session_created_at TEXT NOT NULL,
      pi_session_cwd TEXT NOT NULL,
      pi_session_path TEXT NOT NULL,
      pi_parent_session_path TEXT,
      pi_metadata_json TEXT,
      leaf_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(conversation_id, branch_id),
      FOREIGN KEY(conversation_id) REFERENCES pi_conversations(conversation_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pi_execution_leases (
      conversation_id TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pi_turn_checkpoints (
      conversation_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      pi_session_id TEXT NOT NULL,
      leaf_id TEXT,
      writer_epoch INTEGER NOT NULL,
      terminal_state TEXT NOT NULL CHECK(terminal_state IN ('completed', 'cancelled', 'failed')),
      committed_at TEXT NOT NULL,
      PRIMARY KEY(conversation_id, turn_id),
      FOREIGN KEY(conversation_id, branch_id) REFERENCES pi_branches(conversation_id, branch_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pi_storage_authority_migrations (
      migration_id TEXT PRIMARY KEY,
      source_digest TEXT NOT NULL,
      completed_at TEXT NOT NULL
    ) STRICT;
  `);
}

function migrateEmbeddedConversationContextTable(database: DatabaseSync): void {
  const shape = readTableShape(database, 'pi_conversations');
  if (shape === undefined || sameShape(shape, CANONICAL_CONVERSATION_COLUMNS)) return;
  if (!sameShape(shape, EMBEDDED_CONTEXT_CONVERSATION_COLUMNS)) {
    throw new Error(`Pi conversation table schema is unsupported: ${shape.join(', ')}.`);
  }
  const invalidRows = database
    .prepare(
      `SELECT COUNT(*) AS count
         FROM pi_conversations
        WHERE context_schema_version <> 1
           OR context_kind NOT IN ('scratch', 'workspace-authoring')
           OR typeof(context_id) <> 'text'
           OR length(trim(context_id)) = 0
           OR typeof(conversation_id) <> 'text'
           OR length(trim(conversation_id)) = 0
           OR typeof(title) <> 'text'
           OR length(trim(title)) = 0
           OR typeof(active_branch_id) <> 'text'
           OR length(trim(active_branch_id)) = 0
           OR typeof(created_at) <> 'text'
           OR length(trim(created_at)) = 0
           OR typeof(updated_at) <> 'text'
           OR length(trim(updated_at)) = 0
           OR (context_kind = 'scratch' AND (project_id IS NOT NULL OR workspace_id IS NOT NULL))
           OR (context_kind = 'workspace-authoring' AND
               (project_id IS NULL OR workspace_id IS NULL OR workspace_id <> context_id))`,
    )
    .get();
  if (readInteger(invalidRows, 'count') !== 0) {
    throw new Error('Retired Pi conversation context table contains invalid rows.');
  }

  const foreignKeysEnabled = readPragmaInteger(database, 'foreign_keys') === 1;
  if (foreignKeysEnabled) database.exec('PRAGMA foreign_keys = OFF');
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      CREATE TABLE pi_conversations__canonical (
        workspace_id TEXT NOT NULL,
        conversation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        active_branch_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO pi_conversations__canonical (
        workspace_id, conversation_id, title, active_branch_id, created_at, updated_at
      )
      SELECT COALESCE(workspace_id, context_id), conversation_id, title, active_branch_id,
             created_at, updated_at
        FROM pi_conversations;
      DROP TABLE pi_conversations;
      ALTER TABLE pi_conversations__canonical RENAME TO pi_conversations;
      CREATE INDEX pi_conversations_workspace_updated
        ON pi_conversations(workspace_id, updated_at DESC);
    `);
    const violations = database.prepare('PRAGMA foreign_key_check').all();
    if (violations.length > 0) {
      throw new Error('Pi conversation table migration violates foreign-key integrity.');
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  } finally {
    if (foreignKeysEnabled) database.exec('PRAGMA foreign_keys = ON');
  }
}

function readTableShape(database: DatabaseSync, table: string): readonly string[] | undefined {
  const record = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  if (record === undefined) return undefined;
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => {
      const name = readString(row, 'name');
      const type = readString(row, 'type').toUpperCase();
      const notNull = readInteger(row, 'notnull');
      const primaryKey = readInteger(row, 'pk');
      return `${name}:${type}:${notNull}:${primaryKey}`;
    });
}

function sameShape(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((entry, index) => entry === expected[index])
  );
}

function readPragmaInteger(database: DatabaseSync, pragma: 'foreign_keys'): number {
  return readInteger(database.prepare(`PRAGMA ${pragma}`).get(), pragma);
}

async function migrateLegacyPiConversationStorage(
  database: DatabaseSync,
  userDataRoot: string,
): Promise<void> {
  const legacyPath = join(userDataRoot, 'agent', 'pi', 'metadata.sqlite');
  if (!(await isFile(legacyPath))) return;

  database.prepare('ATTACH DATABASE ? AS legacy_pi').run(legacyPath);
  let digest: string;
  try {
    digest = digestPiTables(database, 'legacy_pi');
    const marker = database
      .prepare('SELECT source_digest FROM pi_storage_authority_migrations WHERE migration_id = ?')
      .get(LEGACY_MIGRATION_ID);
    if (marker !== undefined) {
      const sourceDigest = readString(marker, 'source_digest');
      if (sourceDigest !== digest) {
        throw new Error('Legacy Pi metadata changed after canonical migration committed.');
      }
    } else {
      assertCanonicalPiTablesEmpty(database);
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(`
          INSERT INTO pi_conversations SELECT * FROM legacy_pi.pi_conversations;
          INSERT INTO pi_branches SELECT * FROM legacy_pi.pi_branches;
          INSERT INTO pi_execution_leases SELECT * FROM legacy_pi.pi_execution_leases;
          INSERT INTO pi_turn_checkpoints SELECT * FROM legacy_pi.pi_turn_checkpoints;
        `);
        database
          .prepare(
            `INSERT INTO pi_storage_authority_migrations
              (migration_id, source_digest, completed_at) VALUES (?, ?, ?)`,
          )
          .run(LEGACY_MIGRATION_ID, digest, new Date().toISOString());
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      const canonicalDigest = digestPiTables(database, 'main');
      if (canonicalDigest !== digest) {
        throw new Error('Canonical Pi metadata verification failed after migration commit.');
      }
    }
  } finally {
    database.exec('DETACH DATABASE legacy_pi');
  }

  await archiveLegacyDatabase(legacyPath);
}

function digestPiTables(database: DatabaseSync, namespace: 'main' | 'legacy_pi'): string {
  const hash = createHash('sha256');
  for (const table of PI_TABLES) {
    let rows: readonly unknown[];
    try {
      rows = database.prepare(`SELECT * FROM ${namespace}.${table} ORDER BY rowid`).all();
    } catch (cause) {
      throw new Error(`Legacy Pi metadata is missing or cannot read ${table}.`, { cause });
    }
    hash.update(table);
    hash.update(
      JSON.stringify(rows, (_key, value) => (typeof value === 'bigint' ? `${value}n` : value)),
    );
  }
  return hash.digest('hex');
}

function assertCanonicalPiTablesEmpty(database: DatabaseSync): void {
  for (const table of PI_TABLES) {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM main.${table}`).get();
    const count = readInteger(row, 'count');
    if (count !== 0) {
      throw new Error(
        `Canonical Pi metadata already contains ${table} rows without a migration marker.`,
      );
    }
  }
}

async function archiveLegacyDatabase(legacyPath: string): Promise<void> {
  const archivePath = `${legacyPath}.migrated-v1`;
  if (await isFile(archivePath)) {
    throw new Error(`Legacy Pi metadata archive already exists: ${archivePath}`);
  }
  await rename(legacyPath, archivePath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${legacyPath}${suffix}`;
    if (await isFile(sidecar)) await rename(sidecar, `${archivePath}${suffix}`);
  }
}

function readString(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== 'string') {
    throw new TypeError(`SQLite row ${key} must be text.`);
  }
  return value[key];
}

function readInteger(value: unknown, key: string): number {
  if (!isRecord(value)) throw new TypeError(`SQLite row ${key} must be an integer.`);
  const field = value[key];
  if (typeof field === 'bigint') return Number(field);
  if (typeof field === 'number' && Number.isSafeInteger(field)) return field;
  throw new TypeError(`SQLite row ${key} must be an integer.`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function isFile(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}
