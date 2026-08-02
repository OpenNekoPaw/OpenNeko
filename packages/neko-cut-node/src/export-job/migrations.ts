import type { LocalMetadataMigration } from '@neko/local-metadata';

// The schema is shared by all Node-based Cut Hosts.

export const EXPORT_JOB_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'cut-export-jobs',
    version: 1,
    name: 'versioned-cut-export-job-snapshots',
    checksum: 'sha256:cut-export-jobs-versioned-snapshots-v1',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE cut_export_jobs (
        workspace_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK (
          phase IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome-unknown')
        ),
        revision INTEGER NOT NULL CHECK (revision > 0),
        snapshot_version INTEGER NOT NULL CHECK (snapshot_version = 1),
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL CHECK (created_at >= 0),
        updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
        PRIMARY KEY (workspace_id, job_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
      ) STRICT`,
      `CREATE INDEX cut_export_jobs_workspace_phase_updated_idx
        ON cut_export_jobs(workspace_id, phase, updated_at DESC)`,
    ],
  },
];
