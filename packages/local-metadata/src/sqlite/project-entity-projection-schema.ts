import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const PROJECT_ENTITY_PROJECTION_TABLES = [
  `CREATE TABLE IF NOT EXISTS project_entity_projections (
    partition_key TEXT NOT NULL,
    partition_scope TEXT NOT NULL CHECK (partition_scope IN ('global', 'workspace')),
    workspace_id TEXT,
    projection_kind TEXT NOT NULL CHECK (projection_kind IN (
      'entity-occurrence',
      'entity-relationship',
      'entity-candidate',
      'binding-availability'
    )),
    projection_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    entity_id TEXT,
    related_entity_id TEXT,
    candidate_id TEXT,
    freshness TEXT NOT NULL CHECK (freshness IN ('fresh', 'stale', 'rebuilding')),
    projection_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (partition_key, projection_kind, projection_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    CHECK (
      (partition_scope = 'global' AND workspace_id IS NULL) OR
      (partition_scope = 'workspace' AND workspace_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS project_entity_projections_source_idx
    ON project_entity_projections(partition_key, source_id, projection_kind, updated_at)`,
  `CREATE INDEX IF NOT EXISTS project_entity_projections_entity_idx
    ON project_entity_projections(partition_key, entity_id, related_entity_id, projection_kind)`,
] as const;

export function initializeProjectEntityProjectionTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'cache',
    operation: 'initialize-project-entity-projection-tables',
    statements: PROJECT_ENTITY_PROJECTION_TABLES,
  });
}
