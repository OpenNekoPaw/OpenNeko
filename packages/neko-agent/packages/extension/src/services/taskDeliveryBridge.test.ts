import { describe, expect, it, vi } from 'vitest';
import type { DashboardTask } from '@neko/shared/types/dashboard-task';
import { StateTaskDeliveryCursorStorage, TaskDeliveryBridge } from './taskDeliveryBridge';

describe('TaskDeliveryBridge', () => {
  it('replays terminal tasks after the persisted cursor', async () => {
    const projectionSource = {
      getSnapshot: vi.fn(async () => [
        createTask({ taskId: 'neko-agent:task-1', status: 'done', completedAt: 10 }),
        createTask({ taskId: 'neko-agent:task-2', status: 'running', completedAt: undefined }),
        createTask({ taskId: 'neko-agent:task-3', status: 'error', completedAt: 20 }),
      ]),
    };
    const cursors = new Map<string, { updatedAt: number; taskId: string }>();
    const bridge = new TaskDeliveryBridge({
      projectionSource,
      cursorStorage: {
        load: (conversationId) => cursors.get(conversationId),
        save: (conversationId, cursor) => {
          cursors.set(conversationId, cursor);
        },
      },
    });
    const target = { postMessage: vi.fn(async () => true) };

    await expect(bridge.replayConversation('conv-1', target)).resolves.toBe(2);
    await expect(bridge.replayConversation('conv-1', target)).resolves.toBe(0);

    expect(target.postMessage).toHaveBeenCalledTimes(2);
    expect(cursors.get('conv-1')).toEqual({ updatedAt: 20, taskId: 'neko-agent:task-3' });
  });

  it('persists cursors in state storage', async () => {
    const state = new Map<string, unknown>();
    const storage = new StateTaskDeliveryCursorStorage('key', {
      get: (key, fallback) => (state.get(key) as never) ?? fallback,
      update: (key, value) => {
        state.set(key, value);
      },
    });

    await storage.save('conv-1', { updatedAt: 10, taskId: 'task-1' });

    expect(storage.load('conv-1')).toEqual({ updatedAt: 10, taskId: 'task-1' });
  });
});

function createTask(overrides: Partial<DashboardTask> & { taskId: string }): DashboardTask {
  return {
    taskId: overrides.taskId,
    source: 'neko-agent',
    sourceTaskId: overrides.taskId.replace('neko-agent:', ''),
    kind: 'media-task',
    title: 'Task',
    status: overrides.status ?? 'done',
    progress: overrides.progress ?? 100,
    actions: [],
    startedAt: overrides.startedAt ?? 1,
    completedAt: overrides.completedAt,
    conversationId: overrides.conversationId ?? 'conv-1',
  };
}
