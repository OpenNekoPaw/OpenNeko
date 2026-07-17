import type { LocalMetadataMigration } from '../contracts';

export const SEARCH_PROJECTION_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'search-projection',
    version: 1,
    name: 'search-documents-and-fts',
    checksum: 'sha256:search-documents-fts-v1',
    ownership: 'cache',
    destructive: false,
    statements: [
      `CREATE TABLE search_documents (
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
      `CREATE INDEX search_documents_partition_kind_idx
        ON search_documents(partition_key, search_partition, item_kind, updated_at)`,
      `CREATE VIRTUAL TABLE search_documents_fts USING fts5(
        label,
        search_text,
        content='search_documents',
        content_rowid='rowid',
        tokenize='unicode61'
      )`,
      `CREATE TRIGGER search_documents_ai AFTER INSERT ON search_documents BEGIN
        INSERT INTO search_documents_fts(rowid, label, search_text)
        VALUES (new.rowid, new.label, new.search_text);
      END`,
      `CREATE TRIGGER search_documents_ad AFTER DELETE ON search_documents BEGIN
        INSERT INTO search_documents_fts(search_documents_fts, rowid, label, search_text)
        VALUES ('delete', old.rowid, old.label, old.search_text);
      END`,
      `CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents BEGIN
        INSERT INTO search_documents_fts(search_documents_fts, rowid, label, search_text)
        VALUES ('delete', old.rowid, old.label, old.search_text);
        INSERT INTO search_documents_fts(rowid, label, search_text)
        VALUES (new.rowid, new.label, new.search_text);
      END`,
    ],
  },
  {
    namespace: 'search-projection',
    version: 2,
    name: 'semantic-sources-and-evidence',
    checksum: 'sha256:semantic-sources-evidence-v2',
    ownership: 'cache',
    destructive: false,
    statements: [
      `CREATE TABLE semantic_sources (
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
      `CREATE INDEX semantic_sources_partition_asset_idx
        ON semantic_sources(partition_key, asset_id, freshness, updated_at)`,
      `CREATE TABLE semantic_evidence (
        partition_key TEXT NOT NULL,
        partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
        workspace_id TEXT,
        source_id TEXT NOT NULL,
        evidence_kind TEXT NOT NULL CHECK (
          evidence_kind IN ('text-segment', 'entity-mention', 'semantic-tag', 'perception-ref')
        ),
        evidence_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        evidence_json TEXT NOT NULL,
        PRIMARY KEY (partition_key, source_id, evidence_kind, evidence_id),
        FOREIGN KEY (partition_key, source_id)
          REFERENCES semantic_sources(partition_key, source_id) ON DELETE CASCADE,
        CHECK (
          (partition_scope = 'global' AND workspace_id IS NULL) OR
          (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
        )
      ) STRICT`,
      `CREATE INDEX semantic_evidence_partition_source_idx
        ON semantic_evidence(partition_key, source_id, ordinal)`,
    ],
  },
];
