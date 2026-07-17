import { describe, expect, it } from 'vitest';
import type { TaskRecoveryInfo, TaskRunScope } from '@neko/shared';
import { MemoryTaskRecoveryStorage } from '../task-recovery-storage';

describe('Task recovery storage authority', () => {
  it('keeps Host-private memory recovery available', async () => {
    const storage = new MemoryTaskRecoveryStorage();
    const info = createRecovery('memory-task');
    await storage.save(info);

    await expect(storage.load(info.scope)).resolves.toEqual(info);
  });
});

function createRecovery(taskId: string): TaskRecoveryInfo {
  return {
    scope: taskScope(taskId),
    taskId,
    externalTaskId: 'provider-task',
    providerId: 'provider',
    taskType: 'custom',
    payload: {},
    createdAt: 1,
    updatedAt: 2,
  };
}

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-task-recovery',
    runId: 'run-task-recovery',
    parentRunId: 'run-task-recovery',
    childRunId,
    childKind: 'task',
  };
}
