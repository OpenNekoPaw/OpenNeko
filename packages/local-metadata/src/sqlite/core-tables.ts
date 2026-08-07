import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const CORE_TABLES = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id TEXT PRIMARY KEY NOT NULL,
    current_locator_kind TEXT NOT NULL CHECK (current_locator_kind IN ('relative', 'variable')),
    current_locator_value TEXT NOT NULL,
    locator_history_json TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    orphaned_at TEXT
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS conversations (
    conversation_id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT,
    journal_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('desktop', 'agent', 'import')),
    model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS conversations_workspace_updated_idx
    ON conversations(workspace_id, updated_at DESC)`,
] as const;

export function initializeCoreLocalMetadataTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'system',
    operation: 'initialize-core-local-metadata-tables',
    statements: CORE_TABLES,
  });
}
