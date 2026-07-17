import type { LocalMetadataMigration } from '../contracts';

export const AGENT_STATE_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'agent-state',
    version: 1,
    name: 'tasks-and-task-checkpoints',
    checksum: 'sha256:agent-state-tasks-checkpoints-v1',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE tasks (
        task_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL CHECK (created_at >= 0),
        updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
        PRIMARY KEY (workspace_id, task_key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
      ) STRICT`,
      `CREATE INDEX tasks_workspace_status_updated_idx
        ON tasks(workspace_id, status, updated_at DESC)`,
      `CREATE TABLE task_checkpoints (
        task_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
        PRIMARY KEY (workspace_id, task_key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
      ) STRICT`,
      `CREATE INDEX task_checkpoints_workspace_updated_idx
        ON task_checkpoints(workspace_id, updated_at DESC)`,
    ],
  },
];
