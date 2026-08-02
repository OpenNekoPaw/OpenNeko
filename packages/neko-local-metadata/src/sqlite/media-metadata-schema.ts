import type { LocalMetadataMigration } from '../contracts';

export const MEDIA_METADATA_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'media-metadata',
    version: 1,
    name: 'media-probe-metadata',
    checksum: 'sha256:media-probe-metadata-v1',
    ownership: 'cache',
    destructive: false,
    statements: [
      `CREATE TABLE media_metadata (
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
      `CREATE INDEX media_metadata_partition_updated_idx
        ON media_metadata(partition_key, updated_at)`,
    ],
  },
];
