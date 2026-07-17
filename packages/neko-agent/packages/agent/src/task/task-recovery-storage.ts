import {
  formatTaskRunScope,
  isTaskType,
  type ITaskRecoveryStorage,
  type TaskRecoveryInfo,
  type TaskRunScope,
} from '@neko/shared';
import { requirePersistedTaskRunScope } from '../runtime/persisted-child-run-ownership';

export class MemoryTaskRecoveryStorage implements ITaskRecoveryStorage {
  private readonly infos = new Map<string, TaskRecoveryInfo>();

  async save(info: TaskRecoveryInfo): Promise<void> {
    this.infos.set(formatTaskRunScope(info.scope), { ...info });
  }

  async load(scope: TaskRunScope): Promise<TaskRecoveryInfo | undefined> {
    const info = this.infos.get(formatTaskRunScope(scope));
    return info ? { ...info } : undefined;
  }

  async loadAll(): Promise<TaskRecoveryInfo[]> {
    return [...this.infos.values()].map((info) => ({ ...info }));
  }

  async delete(scope: TaskRunScope): Promise<void> {
    this.infos.delete(formatTaskRunScope(scope));
  }

  async clear(): Promise<void> {
    this.infos.clear();
  }
}

export function parseTaskRecoveryInfoRecord(value: unknown, source: string): TaskRecoveryInfo {
  if (!isRecord(value)) {
    throw new Error(`${source} does not contain valid task recovery info`);
  }
  const taskId = typeof value['taskId'] === 'string' ? value['taskId'] : undefined;
  const scope = requirePersistedTaskRunScope({
    value: value['scope'],
    recordKind: 'task-recovery',
    source,
    recordIndex: 0,
    ...(taskId ? { localId: taskId } : {}),
  });
  if (
    !taskId ||
    typeof value['externalTaskId'] !== 'string' ||
    typeof value['providerId'] !== 'string' ||
    !isTaskType(value['taskType']) ||
    !isRecord(value['payload']) ||
    typeof value['createdAt'] !== 'number' ||
    !Number.isFinite(value['createdAt']) ||
    typeof value['updatedAt'] !== 'number' ||
    !Number.isFinite(value['updatedAt'])
  ) {
    throw new Error(`${source} does not contain valid task recovery info`);
  }
  return {
    scope,
    taskId,
    externalTaskId: value['externalTaskId'],
    providerId: value['providerId'],
    taskType: value['taskType'],
    payload: { ...value['payload'] },
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
