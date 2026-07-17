import {
  formatTaskRunScope,
  type ITaskRecoveryStorage,
  type ITaskStorage,
  type LocalMetadataStore,
  type SerializableTask,
  type TaskRecoveryInfo,
  type TaskRunScope,
} from '@neko/shared';
import { buildTaskStorageCleanupPlan, RECOVERABLE_TASK_STATUSES } from './task-storage-policy';
import { parseTaskRecoveryInfoRecord } from './task-recovery-storage';
import { parseSerializableTaskRecord } from './task-storage';

export interface SqliteTaskStorageOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceId: string;
  readonly now?: () => number;
}

export class SqliteTaskStorage implements ITaskStorage {
  constructor(private readonly options: SqliteTaskStorageOptions) {}

  async save(task: SerializableTask): Promise<void> {
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'save-agent-task' },
      async ({ repositories }) => {
        await repositories.tasks.upsert({
          workspaceId: this.options.workspaceId,
          taskKey: formatTaskRunScope(task.scope),
          taskId: task.id,
          status: task.status,
          payload: task,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        });
        await incrementTaskRevision(repositories, this.options.workspaceId, task.updatedAt);
      },
    );
  }

  async load(scope: TaskRunScope): Promise<SerializableTask | undefined> {
    const task = await this.options.metadataStore.repositories.tasks.get(
      this.options.workspaceId,
      formatTaskRunScope(scope),
    );
    return task
      ? parseSerializableTaskRecord(task.payload, `sqlite-task:${task.taskKey}`)
      : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    const tasks = await this.options.metadataStore.repositories.tasks.list({
      workspaceId: this.options.workspaceId,
      statuses: RECOVERABLE_TASK_STATUSES,
    });
    return tasks.map((task) =>
      parseSerializableTaskRecord(task.payload, `sqlite-task:${task.taskKey}`),
    );
  }

  async loadAll(): Promise<SerializableTask[]> {
    const tasks = await this.options.metadataStore.repositories.tasks.list({
      workspaceId: this.options.workspaceId,
      statuses: null,
    });
    return tasks.map((task) =>
      parseSerializableTaskRecord(task.payload, `sqlite-task:${task.taskKey}`),
    );
  }

  async delete(scope: TaskRunScope): Promise<void> {
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'delete-agent-task' },
      async ({ repositories }) => {
        const deleted = await repositories.tasks.delete(
          this.options.workspaceId,
          formatTaskRunScope(scope),
        );
        if (deleted) {
          await incrementTaskRevision(repositories, this.options.workspaceId, this.now());
        }
      },
    );
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const plan = buildTaskStorageCleanupPlan({ tasks: await this.loadAll(), olderThanMs });
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'cleanup-agent-tasks' },
      async ({ repositories }) => {
        for (const task of plan.removed) {
          await repositories.tasks.delete(this.options.workspaceId, formatTaskRunScope(task.scope));
        }
        if (plan.removed.length > 0) {
          await incrementTaskRevision(repositories, this.options.workspaceId, this.now());
        }
      },
    );
    return plan.removed.length;
  }

  private now(): number {
    return (this.options.now ?? (() => Date.now()))();
  }
}

export class SqliteTaskRecoveryStorage implements ITaskRecoveryStorage {
  constructor(private readonly options: SqliteTaskStorageOptions) {}

  async save(info: TaskRecoveryInfo): Promise<void> {
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'save-agent-task-checkpoint' },
      async ({ repositories }) => {
        await repositories.taskCheckpoints.upsert({
          workspaceId: this.options.workspaceId,
          taskKey: formatTaskRunScope(info.scope),
          taskId: info.taskId,
          payload: info,
          updatedAt: info.updatedAt,
        });
        await incrementTaskRevision(repositories, this.options.workspaceId, info.updatedAt);
      },
    );
  }

  async load(scope: TaskRunScope): Promise<TaskRecoveryInfo | undefined> {
    const checkpoint = await this.options.metadataStore.repositories.taskCheckpoints.get(
      this.options.workspaceId,
      formatTaskRunScope(scope),
    );
    return checkpoint
      ? parseTaskRecoveryInfoRecord(
          checkpoint.payload,
          `sqlite-task-checkpoint:${checkpoint.taskKey}`,
        )
      : undefined;
  }

  async loadAll(): Promise<TaskRecoveryInfo[]> {
    const checkpoints = await this.options.metadataStore.repositories.taskCheckpoints.list(
      this.options.workspaceId,
    );
    return checkpoints.map((checkpoint) =>
      parseTaskRecoveryInfoRecord(
        checkpoint.payload,
        `sqlite-task-checkpoint:${checkpoint.taskKey}`,
      ),
    );
  }

  async delete(scope: TaskRunScope): Promise<void> {
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'delete-agent-task-checkpoint' },
      async ({ repositories }) => {
        const deleted = await repositories.taskCheckpoints.delete(
          this.options.workspaceId,
          formatTaskRunScope(scope),
        );
        if (deleted) {
          await incrementTaskRevision(repositories, this.options.workspaceId, this.now());
        }
      },
    );
  }

  async clear(): Promise<void> {
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'clear-agent-task-checkpoints' },
      async ({ repositories }) => {
        const deleted = await repositories.taskCheckpoints.clearWorkspace(this.options.workspaceId);
        if (deleted > 0) {
          await incrementTaskRevision(repositories, this.options.workspaceId, this.now());
        }
      },
    );
  }

  private now(): number {
    return (this.options.now ?? (() => Date.now()))();
  }
}

async function incrementTaskRevision(
  repositories: LocalMetadataStore['repositories'],
  workspaceId: string,
  updatedAt: number,
): Promise<void> {
  await repositories.projectionVersions.increment({
    partition: { scope: 'workspace', workspaceId, domain: 'tasks' },
    freshness: 'fresh',
    diagnostic: null,
    updatedAt: new Date(updatedAt).toISOString(),
  });
}
