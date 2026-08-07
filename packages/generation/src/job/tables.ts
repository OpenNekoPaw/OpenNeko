import { initializeLocalMetadataTables, type LocalMetadataStore } from '@neko/local-metadata';

const GENERATION_JOB_TABLES = [
  `CREATE TABLE IF NOT EXISTS generation_jobs (
    workspace_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (
      phase IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome-unknown')
    ),
    snapshot_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    PRIMARY KEY (workspace_id, job_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS generation_jobs_workspace_phase_updated_idx
    ON generation_jobs(workspace_id, phase, updated_at DESC)`,
] as const;

export function initializeGenerationJobTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-generation-job-tables',
    statements: GENERATION_JOB_TABLES,
  });
}
