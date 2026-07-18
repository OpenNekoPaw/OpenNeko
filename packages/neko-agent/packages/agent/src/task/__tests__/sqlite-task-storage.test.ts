import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatTaskRunScope,
  resolveGlobalStorageLayout,
  type SerializableTask,
  type TaskRecoveryInfo,
  type TaskRunScope,
} from '@neko/shared';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import { SqliteTaskRecoveryStorage, SqliteTaskStorage } from '../sqlite-task-storage';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('SQLite Agent task storage', () => {
  it('persists serializable tasks and minimal recovery checkpoints by workspace', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-agent-task-sqlite-'));
    temporaryDirectories.push(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(AGENT_STATE_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const taskStorage = new SqliteTaskStorage({ metadataStore: store, workspaceId: WORKSPACE_ID });
    const recoveryStorage = new SqliteTaskRecoveryStorage({
      metadataStore: store,
      workspaceId: WORKSPACE_ID,
    });
    const scope = taskScope('task-1');
    const task: SerializableTask = {
      scope,
      id: 'task-1',
      type: 'custom',
      status: 'running',
      input: { type: 'custom', payload: { prompt: 'render' } },
      progress: 40,
      createdAt: 1_752_364_800_000,
      updatedAt: 1_752_368_400_000,
    };
    const recovery: TaskRecoveryInfo = {
      scope,
      taskId: 'task-1',
      externalTaskId: 'provider-task-1',
      providerId: 'runway',
      taskType: 'custom',
      payload: { prompt: 'render' },
      createdAt: 1_752_364_800_000,
      updatedAt: 1_752_368_400_000,
    };

    await taskStorage.save(task);
    await recoveryStorage.save(recovery);
    await store.repositories.tasks.upsert({
      workspaceId: WORKSPACE_ID,
      taskKey: 'system:canvas-board-delivery:delivery-1',
      taskId: 'delivery-1',
      status: 'queued',
      payload: { kind: 'canvas-workspace-board-delivery' },
      createdAt: 1_752_364_800_000,
      updatedAt: 1_752_368_400_000,
    });
    await store.repositories.taskCheckpoints.upsert({
      workspaceId: WORKSPACE_ID,
      taskKey: 'system:canvas-board-delivery:delivery-1',
      taskId: 'delivery-1',
      payload: { kind: 'canvas-workspace-board-delivery' },
      updatedAt: 1_752_368_400_000,
    });

    await expect(taskStorage.load(scope)).resolves.toEqual(task);
    await expect(taskStorage.loadPending()).resolves.toEqual([task]);
    await expect(recoveryStorage.load(scope)).resolves.toEqual(recovery);
    await expect(taskStorage.loadAll()).resolves.toEqual([task]);
    await expect(recoveryStorage.loadAll()).resolves.toEqual([recovery]);
    await expect(
      store.repositories.tasks.get(WORKSPACE_ID, formatTaskRunScope(scope)),
    ).resolves.toMatchObject({
      taskId: 'task-1',
      status: 'running',
    });
    await expect(
      store.readPartitionRevision({
        scope: 'workspace',
        workspaceId: WORKSPACE_ID,
        domain: 'tasks',
      }),
    ).resolves.toMatchObject({ revision: 2, freshness: 'fresh' });

    await recoveryStorage.clear();
    await expect(
      store.repositories.taskCheckpoints.get(
        WORKSPACE_ID,
        'system:canvas-board-delivery:delivery-1',
      ),
    ).resolves.toBeDefined();
    await taskStorage.delete(scope);
    await expect(taskStorage.load(scope)).resolves.toBeUndefined();
    await expect(recoveryStorage.load(scope)).resolves.toBeUndefined();

    await store.dispose();
  });
});

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-task-storage',
    runId: 'run-task-storage',
    parentRunId: 'run-task-storage',
    childRunId,
    childKind: 'task',
  };
}
