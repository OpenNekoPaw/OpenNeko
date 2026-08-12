import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const SEARCH_PROJECTION_TABLES = [
  `CREATE TABLE IF NOT EXISTS search_documents (
    partition_key TEXT NOT NULL,
    partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
    workspace_id TEXT,
    document_id TEXT NOT NULL,
    search_partition TEXT NOT NULL,
    item_kind TEXT NOT NULL,
    label TEXT NOT NULL,
    search_text TEXT NOT NULL,
    freshness TEXT NOT NULL,
    document_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (partition_key, document_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    CHECK (
      (partition_scope = 'global' AND workspace_id IS NULL) OR
      (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS search_documents_partition_kind_idx
    ON search_documents(partition_key, search_partition, item_kind, updated_at)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
    label,
    search_text,
    content='search_documents',
    content_rowid='rowid',
    tokenize='unicode61'
  )`,
  `CREATE TRIGGER IF NOT EXISTS search_documents_ai AFTER INSERT ON search_documents BEGIN
    INSERT INTO search_documents_fts(rowid, label, search_text)
    VALUES (new.rowid, new.label, new.search_text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS search_documents_ad AFTER DELETE ON search_documents BEGIN
    INSERT INTO search_documents_fts(search_documents_fts, rowid, label, search_text)
    VALUES ('delete', old.rowid, old.label, old.search_text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS search_documents_au AFTER UPDATE ON search_documents BEGIN
    INSERT INTO search_documents_fts(search_documents_fts, rowid, label, search_text)
    VALUES ('delete', old.rowid, old.label, old.search_text);
    INSERT INTO search_documents_fts(rowid, label, search_text)
    VALUES (new.rowid, new.label, new.search_text);
  END`,
  `CREATE TABLE IF NOT EXISTS semantic_sources (
    partition_key TEXT NOT NULL,
    partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
    workspace_id TEXT,
    source_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    source_ref_json TEXT NOT NULL,
    source_fingerprint TEXT NOT NULL,
    provider_json TEXT NOT NULL,
    coverage_json TEXT NOT NULL,
    freshness TEXT NOT NULL,
    index_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (partition_key, source_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    CHECK (
      (partition_scope = 'global' AND workspace_id IS NULL) OR
      (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS semantic_sources_partition_asset_idx
    ON semantic_sources(partition_key, asset_id, freshness, updated_at)`,
  `CREATE TABLE IF NOT EXISTS resource_usage_projections (
    partition_key TEXT NOT NULL,
    partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
    workspace_id TEXT,
    projection_id TEXT NOT NULL,
    source_owner_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_owner_id TEXT NOT NULL,
    target_resource_id TEXT NOT NULL,
    availability TEXT NOT NULL CHECK (availability IN (
      'available',
      'needs-attention',
      'unavailable'
    )),
    freshness TEXT NOT NULL CHECK (freshness IN ('fresh', 'stale', 'rebuilding')),
    source_fingerprint TEXT NOT NULL,
    projection_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (partition_key, source_owner_id, source_id, projection_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    CHECK (
      (partition_scope = 'global' AND workspace_id IS NULL) OR
      (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS resource_usage_projections_source_idx
    ON resource_usage_projections(partition_key, source_owner_id, source_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS resource_usage_projections_target_idx
    ON resource_usage_projections(partition_key, target_owner_id, target_resource_id, updated_at)`,
] as const;

export function initializeSearchProjectionTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'cache',
    operation: 'initialize-search-projection-tables',
    statements: SEARCH_PROJECTION_TABLES,
  });
}
