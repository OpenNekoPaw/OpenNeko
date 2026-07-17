import type { LocalMetadataMigration } from '../contracts';

export const M1_LOCAL_METADATA_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'core',
    version: 1,
    name: 'm1-workspaces-projections-conversations',
    checksum: 'sha256:m1-core-workspaces-projections-conversations-v1',
    ownership: 'system',
    destructive: false,
    statements: [
      `CREATE TABLE workspaces (
        workspace_id TEXT PRIMARY KEY NOT NULL,
        current_locator_kind TEXT NOT NULL CHECK (current_locator_kind IN ('relative', 'variable')),
        current_locator_value TEXT NOT NULL,
        locator_history_json TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        orphaned_at TEXT
      ) STRICT`,
      `CREATE TABLE projection_versions (
        partition_key TEXT PRIMARY KEY NOT NULL,
        partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
        workspace_id TEXT,
        domain TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        freshness TEXT NOT NULL CHECK (freshness IN ('fresh', 'stale', 'rebuilding')),
        diagnostic TEXT,
        updated_at TEXT NOT NULL,
        CHECK (
          (partition_scope = 'global' AND workspace_id IS NULL) OR
          (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
        )
      ) STRICT`,
      `CREATE TABLE conversations (
        conversation_id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT,
        journal_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('vscode', 'tui', 'agent', 'import')),
        model TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
      `CREATE INDEX conversations_workspace_updated_idx
        ON conversations(workspace_id, updated_at DESC)`,
    ],
  },
];
