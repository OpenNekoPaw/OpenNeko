import { describe, expect, it, vi } from 'vitest';
import type { Task, TaskRunScope } from '@neko/shared';
import {
  shouldCancelForInterruption,
  TaskLifecycleCoordinator,
  type TaskLifecycleInterruptionEvent,
} from './taskLifecycleCoordinator';

describe('TaskLifecycleCoordinator', () => {
  it('cancels only foreground token-active tasks owned by the interrupted conversation', async () => {
    const listeners = new Set<(event: TaskLifecycleInterruptionEvent) => void>();
    const cancel = vi.fn(async () => undefined);
    const coordinator = new TaskLifecycleCoordinator({
      interruptions: {
        onDidConversationInterrupted: (listener) => {
          listeners.add(listener);
          return { dispose: () => listeners.delete(listener) };
        },
      },
      tasks: {
        list: vi.fn(async () => [
          createTask('token-task', 'conv-1', 'token-active', 'cancel-with-agent'),
          createTask('external-task', 'conv-1', 'external-wait', 'detach-and-continue'),
          createTask('finalize-task', 'conv-1', 'local-finalize', 'finish-critical-step'),
          createTask('other-conversation', 'conv-2', 'token-active', 'cancel-with-agent'),
        ]),
      },
      taskCancellation: { cancel },
    });

    for (const listener of listeners) {
      listener({ conversationId: 'conv-1', reason: 'user-stop' });
    }
    await Promise.resolve();
    await Promise.resolve();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(taskScope('token-task', 'conv-1'));

    coordinator.dispose();
  });

  it('uses task.scope as owner authority when lifecycle owner metadata conflicts', () => {
    const task = createTask('task-1', 'conv-1', 'token-active', 'cancel-with-agent', 'conv-2');

    expect(
      shouldCancelForInterruption(task, { conversationId: 'conv-1', reason: 'user-stop' }),
    ).toBe(true);
    expect(
      shouldCancelForInterruption(task, { conversationId: 'conv-2', reason: 'user-stop' }),
    ).toBe(false);
  });

  it('keeps interruption policy as shared task metadata, not coordinator defaults', () => {
    expect(
      shouldCancelForInterruption(
        createTask('task-1', 'conv-1', 'external-wait', 'cancel-with-agent'),
        { conversationId: 'conv-1', reason: 'user-stop' },
      ),
    ).toBe(false);
    expect(
      shouldCancelForInterruption(
        createTask('task-2', 'conv-1', 'token-active', 'detach-and-continue'),
        { conversationId: 'conv-1', reason: 'user-stop' },
      ),
    ).toBe(false);
  });
});

function createTask(
  id: string,
  conversationId: string,
  costPhase: Task['lifecycle']['costPhase'],
  interruptPolicy: Task['lifecycle']['interruptPolicy'],
  lifecycleOwnerConversationId = conversationId,
): Task {
  return {
    scope: taskScope(id, conversationId),
    id,
    type: 'custom',
    status: 'running',
    input: { type: 'custom', payload: {} },
    progress: 20,
    createdAt: 1,
    updatedAt: 2,
    lifecycle: {
      ownerConversationId: lifecycleOwnerConversationId,
      runMode: 'foreground',
      costPhase,
      interruptPolicy,
      recoverPolicy: 'retry-executor',
    },
  };
}

function taskScope(childRunId: string, conversationId: string): TaskRunScope {
  const runId = `run:${conversationId}`;
  return {
    conversationId,
    runId,
    parentRunId: runId,
    childRunId,
    childKind: 'task',
  };
}
