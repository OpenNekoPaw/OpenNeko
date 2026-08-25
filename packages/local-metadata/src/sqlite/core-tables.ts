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
] as const;

export function initializeCoreLocalMetadataTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'system',
    operation: 'initialize-core-local-metadata-tables',
    statements: CORE_TABLES,
  });
}
