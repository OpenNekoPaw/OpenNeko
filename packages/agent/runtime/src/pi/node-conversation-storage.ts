import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const CANONICAL_CONVERSATION_COLUMNS = [
  'workspace_id',
  'conversation_id',
  'title',
  'active_branch_id',
  'created_at',
  'updated_at',
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
    assertExistingConversationTableIsCanonical(database);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
    `);
    initializePiConversationTables(database);
    return { database, databasePath, sessionsRoot };
  } catch (error) {
    database.close();
    throw error;
  }
}

export function initializePiConversationTables(database: DatabaseSync): void {
  assertExistingConversationTableIsCanonical(database);
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
      lease_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pi_turn_checkpoints (
      conversation_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      pi_session_id TEXT NOT NULL,
      leaf_id TEXT,
      writer_lease_id TEXT NOT NULL,
      terminal_state TEXT NOT NULL CHECK(terminal_state IN ('completed', 'cancelled', 'failed')),
      committed_at TEXT NOT NULL,
      PRIMARY KEY(conversation_id, turn_id),
      FOREIGN KEY(conversation_id, branch_id) REFERENCES pi_branches(conversation_id, branch_id)
        ON DELETE CASCADE
    );
  `);
  assertCanonicalConversationTable(database);
}

function assertExistingConversationTableIsCanonical(database: DatabaseSync): void {
  const table = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get('pi_conversations');
  if (table !== undefined) assertCanonicalConversationTable(database);
}

function assertCanonicalConversationTable(database: DatabaseSync): void {
  const columns = database
    .prepare(`PRAGMA table_info(pi_conversations)`)
    .all()
    .map((row) => readColumnName(row));
  if (
    columns.length !== CANONICAL_CONVERSATION_COLUMNS.length ||
    columns.some((column, index) => column !== CANONICAL_CONVERSATION_COLUMNS[index])
  ) {
    throw new Error(`Pi conversation table contract is unsupported: ${columns.join(', ')}.`);
  }
}

function readColumnName(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('name' in value) ||
    typeof value.name !== 'string'
  ) {
    throw new TypeError('Pi conversation table column name must be text.');
  }
  return value.name;
}
