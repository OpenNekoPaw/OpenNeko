import type { LocalMetadataStore } from '../contracts';
import { initializeLocalMetadataTables } from '../table-initialization';

const AGENT_STATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS tasks (
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
  `CREATE INDEX IF NOT EXISTS tasks_workspace_status_updated_idx
    ON tasks(workspace_id, status, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS task_checkpoints (
    task_key TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    PRIMARY KEY (workspace_id, task_key),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS task_checkpoints_workspace_updated_idx
    ON task_checkpoints(workspace_id, updated_at DESC)`,
] as const;

export function initializeAgentStateTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-agent-state-tables',
    statements: AGENT_STATE_TABLES,
  });
}
