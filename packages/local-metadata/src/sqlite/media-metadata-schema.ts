import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const MEDIA_METADATA_TABLES = [
  `CREATE TABLE IF NOT EXISTS media_metadata (
    partition_key TEXT NOT NULL,
    partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
    workspace_id TEXT,
    source_key TEXT NOT NULL,
    source_mtime_ms REAL NOT NULL CHECK (source_mtime_ms >= 0),
    metadata_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (partition_key, source_key),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    CHECK (
      (partition_scope = 'global' AND workspace_id IS NULL) OR
      (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS media_metadata_partition_updated_idx
    ON media_metadata(partition_key, updated_at)`,
] as const;

export function initializeMediaMetadataTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'cache',
    operation: 'initialize-media-metadata-tables',
    statements: MEDIA_METADATA_TABLES,
  });
}
