import type { LocalMetadataMigration } from '@neko/shared';

export const GENERATION_JOB_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'generation-jobs',
    version: 1,
    name: 'versioned-generation-job-snapshots',
    checksum: 'sha256:generation-jobs-versioned-snapshots-v1',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE generation_jobs (
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
      `CREATE INDEX generation_jobs_workspace_phase_updated_idx
        ON generation_jobs(workspace_id, phase, updated_at DESC)`,
    ],
  },
  {
    namespace: 'generation-jobs',
    version: 2,
    name: 'explicit-generation-job-lifecycle-mode',
    checksum: 'sha256:generation-jobs-explicit-lifecycle-mode-v2',
    ownership: 'state',
    destructive: false,
    statements: [
      'DROP INDEX generation_jobs_workspace_phase_updated_idx',
      'ALTER TABLE generation_jobs RENAME TO generation_jobs_v1',
      `CREATE TABLE generation_jobs (
        workspace_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK (
          phase IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome-unknown')
        ),
        revision INTEGER NOT NULL CHECK (revision > 0),
        snapshot_version INTEGER NOT NULL CHECK (snapshot_version = 2),
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL CHECK (created_at >= 0),
        updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
        PRIMARY KEY (workspace_id, job_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
      ) STRICT`,
      `INSERT INTO generation_jobs (
        workspace_id, job_id, phase, revision, snapshot_version,
        snapshot_json, created_at, updated_at
      )
      SELECT
        workspace_id, job_id, phase, revision, 2,
        json_set(snapshot_json, '$.lifecycleMode', 'detached'),
        created_at, updated_at
      FROM generation_jobs_v1`,
      'DROP TABLE generation_jobs_v1',
      `CREATE INDEX generation_jobs_workspace_phase_updated_idx
        ON generation_jobs(workspace_id, phase, updated_at DESC)`,
    ],
  },
];
