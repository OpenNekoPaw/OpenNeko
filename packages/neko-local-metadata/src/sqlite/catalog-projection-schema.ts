import type { LocalMetadataMigration } from '../contracts';

export const CATALOG_PROJECTION_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'catalog-projection',
    version: 1,
    name: 'skill-command-processor-descriptors',
    checksum: 'sha256:skill-command-processor-descriptors-v1',
    ownership: 'cache',
    destructive: false,
    statements: [
      `CREATE TABLE catalog_items (
        partition_key TEXT NOT NULL,
        partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
        workspace_id TEXT,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('skill', 'command', 'processor')),
        source_scope TEXT NOT NULL CHECK (source_scope IN (
          'builtin', 'personal', 'project', 'market', 'plugin', 'extension'
        )),
        catalog_id TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        root_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        diagnostic_codes_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (partition_key, item_kind, catalog_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        CHECK (
          (partition_scope = 'global' AND workspace_id IS NULL) OR
          (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
        )
      ) STRICT`,
      `CREATE INDEX catalog_items_source_idx
        ON catalog_items(partition_key, item_kind, source_scope, name)`,
    ],
  },
];
