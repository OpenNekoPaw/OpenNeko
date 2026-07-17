import { describe, expect, it } from 'vitest';
import type { SerializableTask, TaskRunScope } from '@neko/shared';
import { MemoryTaskStorage } from '../task-storage';

describe('Task storage authority', () => {
  it('keeps Host-private memory storage available', async () => {
    const storage = new MemoryTaskStorage();
    const task = createTask('memory-task');
    await storage.save(task);

    await expect(storage.load(task.scope)).resolves.toEqual(task);
  });
});

function createTask(id: string): SerializableTask {
  return {
    scope: taskScope(id),
    id,
    type: 'custom',
    status: 'pending',
    input: { type: 'custom', payload: {} },
    progress: 0,
    createdAt: 1,
    updatedAt: 2,
  };
}

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-task-storage',
    runId: 'run-task-storage',
    parentRunId: 'run-task-storage',
    childRunId,
    childKind: 'task',
  };
}
