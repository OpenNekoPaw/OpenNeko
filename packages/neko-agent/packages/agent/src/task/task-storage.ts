import {
  formatTaskRunScope,
  type ITaskStorage,
  type SerializableTask,
  type TaskRunScope,
} from '@neko/shared';
import { requirePersistedTaskRunScope } from '../runtime/persisted-child-run-ownership';
import { buildTaskStorageCleanupPlan, filterRecoverableTasks } from './task-storage-policy';

export class MemoryTaskStorage implements ITaskStorage {
  private readonly tasks = new Map<string, SerializableTask>();

  async save(task: SerializableTask): Promise<void> {
    this.tasks.set(formatTaskRunScope(task.scope), { ...task });
  }

  async load(scope: TaskRunScope): Promise<SerializableTask | undefined> {
    const task = this.tasks.get(formatTaskRunScope(scope));
    return task ? { ...task } : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    return filterRecoverableTasks([...this.tasks.values()]);
  }

  async loadAll(): Promise<SerializableTask[]> {
    return [...this.tasks.values()].map((task) => ({ ...task }));
  }

  async delete(scope: TaskRunScope): Promise<void> {
    this.tasks.delete(formatTaskRunScope(scope));
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const plan = buildTaskStorageCleanupPlan({
      tasks: [...this.tasks.values()],
      olderThanMs,
    });
    for (const task of plan.removed) {
      this.tasks.delete(formatTaskRunScope(task.scope));
    }
    return plan.removed.length;
  }
}

export function parseSerializableTaskRecord(value: unknown, source: string): SerializableTask {
  const localId = isRecord(value) && typeof value['id'] === 'string' ? value['id'] : undefined;
  const scope = requirePersistedTaskRunScope({
    value: isRecord(value) ? value['scope'] : undefined,
    recordKind: 'task',
    source,
    recordIndex: 0,
    ...(localId ? { localId } : {}),
  });
  if (!isSerializableTask(value)) {
    throw new Error(`${source} does not contain a valid serializable task`);
  }
  return { ...value, scope };
}

function isSerializableTask(value: unknown): value is SerializableTask {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['type'] === 'string' &&
    typeof value['status'] === 'string' &&
    isRecord(value['input']) &&
    typeof value['progress'] === 'number' &&
    Number.isFinite(value['progress']) &&
    typeof value['createdAt'] === 'number' &&
    Number.isFinite(value['createdAt']) &&
    typeof value['updatedAt'] === 'number' &&
    Number.isFinite(value['updatedAt'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
