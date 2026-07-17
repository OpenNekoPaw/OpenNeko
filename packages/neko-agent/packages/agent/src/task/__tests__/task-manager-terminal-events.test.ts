import { describe, expect, it, vi } from 'vitest';
import type { SerializableTask, TaskRunScope } from '@neko/shared';
import { TaskManager } from '../task-manager';

describe('TaskManager terminal task events', () => {
  it('notifies terminal task subscribers when an external task becomes terminal', async () => {
    const manager = new TaskManager({ cleanupIntervalMs: 0 });
    const listener = vi.fn();
    manager.onTerminalTask(listener);

    await manager.upsertExternalTask(createTask({ status: 'completed' }));

    expect(listener).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: 'task-1' }),
      scope: taskScope('task-1'),
    });
    await manager.dispose();
  });

  it('replays existing terminal tasks when requested', async () => {
    const manager = new TaskManager({ cleanupIntervalMs: 0 });
    await manager.upsertExternalTask(createTask({ status: 'failed', error: 'boom' }));
    const listener = vi.fn();

    manager.onTerminalTask(listener, { replayExisting: true });

    expect(listener).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: 'task-1', status: 'failed' }),
      scope: taskScope('task-1'),
    });
    await manager.dispose();
  });

  it('uses authoritative task scope when lifecycle run metadata is missing', async () => {
    const manager = new TaskManager({ cleanupIntervalMs: 0 });
    const listener = vi.fn();
    manager.onTerminalTask(listener);

    await manager.upsertExternalTask(
      createTask({
        status: 'completed',
        lifecycle: {
          ownerConversationId: 'conv-1',
          runMode: 'background',
          costPhase: 'idle',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'snapshot-only',
        },
      }),
    );

    expect(listener).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: 'task-1' }),
      scope: taskScope('task-1'),
    });
    await manager.dispose();
  });
});

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}

function createTask(overrides: Partial<SerializableTask> = {}): SerializableTask {
  const id = overrides.id ?? 'task-1';
  return {
    scope: overrides.scope ?? taskScope(id),
    id,
    type: 'image_generation',
    status: 'completed',
    input: {
      type: 'image_generation',
      payload: {},
    },
    progress: 100,
    createdAt: 10,
    updatedAt: 20,
    lifecycle: {
      ownerConversationId: 'conv-1',
      ownerRunId: 'run-1',
      ownerRunStartedAt: 101,
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'snapshot-only',
    },
    ...overrides,
  };
}
