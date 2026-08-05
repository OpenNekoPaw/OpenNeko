import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const RESOURCE_CACHE_TABLES = [
  `CREATE TABLE IF NOT EXISTS resource_cache_entries (
    partition_key TEXT NOT NULL,
    partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
    workspace_id TEXT,
    resource_id TEXT NOT NULL,
    entry_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_accessed_at TEXT,
    PRIMARY KEY (partition_key, resource_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    CHECK (
      (partition_scope = 'global' AND workspace_id IS NULL) OR
      (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS resource_cache_entries_partition_access_idx
    ON resource_cache_entries(partition_key, last_accessed_at, updated_at)`,
  `CREATE TABLE IF NOT EXISTS resource_cache_variants (
    partition_key TEXT NOT NULL,
    partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
    workspace_id TEXT,
    resource_id TEXT NOT NULL,
    variant_key TEXT NOT NULL,
    variant_json TEXT NOT NULL,
    status TEXT NOT NULL,
    role TEXT NOT NULL,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    last_accessed_at TEXT,
    pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
    session_active INTEGER NOT NULL CHECK (session_active IN (0, 1)),
    promoted INTEGER NOT NULL CHECK (promoted IN (0, 1)),
    rebuildable INTEGER NOT NULL CHECK (rebuildable IN (0, 1)),
    PRIMARY KEY (partition_key, resource_id, variant_key),
    FOREIGN KEY (partition_key, resource_id)
      REFERENCES resource_cache_entries(partition_key, resource_id) ON DELETE CASCADE,
    CHECK (
      (partition_scope = 'global' AND workspace_id IS NULL) OR
      (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS resource_cache_variants_gc_idx
    ON resource_cache_variants(
      partition_key, rebuildable, pinned, session_active, promoted, last_accessed_at
    )`,
] as const;

export function initializeResourceCacheTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'cache',
    operation: 'initialize-resource-cache-tables',
    statements: RESOURCE_CACHE_TABLES,
  });
}
