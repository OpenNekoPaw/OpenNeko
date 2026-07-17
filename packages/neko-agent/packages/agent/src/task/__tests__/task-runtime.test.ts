import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import type { AgentMediaTaskView } from '@neko-agent/types';
import type { Task, TaskRunScope, TaskStatus } from '@neko/shared';
import {
  runCancelTaskRuntime,
  runClearCompletedTasksRuntime,
  runRemoveTaskRuntime,
  runRetryTaskRuntime,
  runSendTasksRuntime,
  runViewTaskResultRuntime,
  type TaskRuntimeEffects,
  type TaskRuntimeMediaGateway,
  type TaskRuntimeTaskManager,
} from '../task-runtime';

describe('task runtime', () => {
  let taskManager: MockTaskManager;
  let media: MockMediaGateway;
  let postMessage: MockPostMessage;
  let openTaskResult: MockOpenTaskResult;
  let onRejectedAction: MockRejectedAction;
  let onRetryFailed: MockRetryFailed;
  let onHostPrivateLeaseDiagnostic: MockHostPrivateLeaseDiagnostic;
  let effects: TaskRuntimeEffects;

  beforeEach(() => {
    taskManager = createTaskManager();
    media = createMediaGateway();
    postMessage = vi.fn<MockPostMessage>();
    openTaskResult = vi.fn<MockOpenTaskResult>();
    onRejectedAction = vi.fn<MockRejectedAction>();
    onRetryFailed = vi.fn<MockRetryFailed>();
    onHostPrivateLeaseDiagnostic = vi.fn<MockHostPrivateLeaseDiagnostic>();
    effects = {
      postMessage,
      openTaskResult,
      onRejectedAction,
      onRetryFailed,
      onHostPrivateLeaseDiagnostic,
    };
  });

  it('sends conversation-scoped task views', async () => {
    taskManager.list.mockResolvedValue([
      createTask({ id: 'task-1', payload: { conversationId: 'conv-1', prompt: 'Generate cat' } }),
      createTask({ id: 'task-2', payload: { conversationId: 'conv-2', prompt: 'Other task' } }),
    ]);

    const result = await runSendTasksRuntime(
      { conversationId: 'conv-1' },
      { taskManager },
      effects,
    );

    expect(result).toEqual({ kind: 'tasks-sent', conversationId: 'conv-1', taskIds: ['task-1'] });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'tasksUpdated',
      conversationId: 'conv-1',
      workItems: [
        expect.objectContaining({
          id: 'task-1',
          kind: 'tool-background-task',
          task: expect.objectContaining({
            type: 'image',
            name: 'Generate cat',
          }),
        }),
      ],
    });
  });

  it('cancels media tasks when task-manager storage has no task', async () => {
    taskManager.get.mockResolvedValue(undefined);
    media.getCandidate.mockResolvedValue({ id: 'media-1', conversationId: 'conv-1' });
    media.cancelTask.mockResolvedValue(createMediaTaskView({ id: 'media-1', status: 'cancelled' }));

    const result = await runCancelTaskRuntime(
      { scope: taskScope('media-1'), taskId: 'media-1', conversationId: 'conv-1' },
      { taskManager, media },
      effects,
    );

    expect(result.kind).toBe('cancelled-media');
    expect(taskManager.cancel).not.toHaveBeenCalled();
    expect(media.cancelTask).toHaveBeenCalledWith(taskScope('media-1'));
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mediaTaskProgress',
        conversationId: 'conv-1',
        workItem: expect.objectContaining({
          id: 'media-1',
          kind: 'media-task',
          status: 'cancelled',
        }),
      }),
    );
  });

  it('rejects task live controls when another host owns a private lease', async () => {
    const diagnostic = {
      code: 'hostPrivateLease' as const,
      taskId: 'task-1',
      ownerSurface: 'extension' as const,
      requestingSurface: 'tui' as const,
      control: 'cancel' as const,
      message: 'Task is owned by Extension',
    };

    const result = await runCancelTaskRuntime(
      { scope: taskScope('task-1'), taskId: 'task-1', conversationId: 'conv-1' },
      {
        taskManager,
        hostPrivateLeaseGuard: {
          getDiagnostic: vi.fn().mockResolvedValue(diagnostic),
        },
      },
      effects,
    );

    expect(result).toEqual({
      kind: 'host-private-lease',
      conversationId: 'conv-1',
      taskId: 'task-1',
    });
    expect(taskManager.get).not.toHaveBeenCalled();
    expect(taskManager.cancel).not.toHaveBeenCalled();
    expect(onHostPrivateLeaseDiagnostic).toHaveBeenCalledWith(diagnostic);
  });

  it('projects retry failures through the shared task schema', async () => {
    const task = createTask({
      id: 'task-1',
      status: 'failed',
      payload: { conversationId: 'conv-1', prompt: 'Generate cat' },
    });
    taskManager.get.mockResolvedValue(task);
    taskManager.submit.mockRejectedValue(new Error('quota exceeded'));

    const result = await runRetryTaskRuntime(
      { scope: taskScope('task-1'), taskId: 'task-1', conversationId: 'conv-1' },
      { taskManager },
      effects,
    );

    expect(result.kind).toBe('retry-failed');
    expect(onRetryFailed).toHaveBeenCalledWith({
      taskId: 'task-1',
      conversationId: 'conv-1',
      error: expect.any(Error),
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'taskUpdated',
        conversationId: 'conv-1',
        workItem: expect.objectContaining({
          id: 'task-1',
          kind: 'tool-background-task',
          status: 'failed',
          error: 'Retry failed: quota exceeded',
        }),
      }),
    );
  });

  it('removes task-manager and media records for the owning conversation', async () => {
    taskManager.get.mockResolvedValue(
      createTask({ id: 'task-1', payload: { conversationId: 'conv-1' } }),
    );

    const result = await runRemoveTaskRuntime(
      { scope: taskScope('task-1'), taskId: 'task-1', conversationId: 'conv-1' },
      { taskManager, media },
      effects,
    );

    expect(result.kind).toBe('removed');
    expect(taskManager.delete).toHaveBeenCalledWith(taskScope('task-1'));
    expect(media.deleteTask).toHaveBeenCalledWith(taskScope('task-1'));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'taskRemoved',
      taskScope: taskScope('task-1'),
      conversationId: 'conv-1',
      taskId: 'task-1',
    });
  });

  it('does not open provider result URLs through the VSCode view action', async () => {
    taskManager.get.mockResolvedValue(
      createTask({
        id: 'task-1',
        payload: { conversationId: 'conv-1' },
        output: { data: { url: 'https://example.test/output.png' } },
      }),
    );

    const result = await runViewTaskResultRuntime(
      { scope: taskScope('task-1'), taskId: 'task-1', conversationId: 'conv-1' },
      { taskManager },
      effects,
    );

    expect(result.kind).toBe('noop');
    expect(openTaskResult).not.toHaveBeenCalled();
  });

  it('opens displayed result refs when persisted storage has only provider URLs', async () => {
    taskManager.get.mockResolvedValue(
      createTask({
        id: 'task-1',
        payload: { conversationId: 'conv-1' },
        output: { data: { url: 'https://example.test/output.png' } },
      }),
    );

    const result = await runViewTaskResultRuntime(
      {
        scope: taskScope('task-1'),
        taskId: 'task-1',
        conversationId: 'conv-1',
        resultRef: 'generated-assets/asset-1.png',
      },
      { taskManager },
      effects,
    );

    expect(result.kind).toBe('opened-result');
    expect(openTaskResult).toHaveBeenCalledWith({
      kind: 'open-external',
      url: 'generated-assets/asset-1.png',
    });
  });

  it('clears completed, failed, and cancelled tasks for one conversation then refreshes', async () => {
    taskManager.list.mockImplementation((status?: TaskStatus) => {
      if (status === 'completed') {
        return Promise.resolve([
          createTask({ id: 'done-1', payload: { conversationId: 'conv-1' } }),
        ]);
      }
      if (status === 'failed') {
        return Promise.resolve([
          createTask({ id: 'failed-1', status: 'failed', payload: { conversationId: 'conv-1' } }),
          createTask({ id: 'failed-2', status: 'failed', payload: { conversationId: 'conv-2' } }),
        ]);
      }
      if (status === 'cancelled') {
        return Promise.resolve([
          createTask({
            id: 'cancelled-1',
            status: 'cancelled',
            payload: { conversationId: 'conv-1' },
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await runClearCompletedTasksRuntime(
      { conversationId: 'conv-1' },
      { taskManager, media },
      effects,
    );

    expect(result).toEqual({
      kind: 'cleared-completed',
      conversationId: 'conv-1',
      taskIds: ['done-1', 'failed-1', 'cancelled-1'],
    });
    expect(taskManager.delete).toHaveBeenCalledWith(taskScope('done-1'));
    expect(taskManager.delete).toHaveBeenCalledWith(taskScope('failed-1'));
    expect(taskManager.delete).toHaveBeenCalledWith(taskScope('cancelled-1'));
    expect(taskManager.delete).not.toHaveBeenCalledWith(taskScope('failed-2', 'conv-2'));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'tasksUpdated',
      conversationId: 'conv-1',
      workItems: [],
    });
  });
});

type MockTaskManager = Mocked<TaskRuntimeTaskManager>;
type MockMediaGateway = Mocked<TaskRuntimeMediaGateway>;
type MockPostMessage = TaskRuntimeEffects['postMessage'];
type MockOpenTaskResult = NonNullable<TaskRuntimeEffects['openTaskResult']>;
type MockRejectedAction = NonNullable<TaskRuntimeEffects['onRejectedAction']>;
type MockRetryFailed = NonNullable<TaskRuntimeEffects['onRetryFailed']>;
type MockHostPrivateLeaseDiagnostic = NonNullable<
  TaskRuntimeEffects['onHostPrivateLeaseDiagnostic']
>;

function createTaskManager(): MockTaskManager & TaskRuntimeTaskManager {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(true),
    submit: vi.fn().mockResolvedValue(taskScope('retry-task-1')),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function createMediaGateway(): MockMediaGateway & TaskRuntimeMediaGateway {
  return {
    getCandidate: vi.fn().mockResolvedValue(undefined),
    cancelTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
  };
}

function createTask(overrides: Partial<Task> & { payload?: Record<string, unknown> } = {}): Task {
  const id = overrides.id ?? 'task-1';
  const payload = overrides.payload ?? { conversationId: 'conv-1' };
  const input = overrides.input ?? {
    type: overrides.type ?? 'image_generation',
    payload,
  };
  const conversationId =
    overrides.scope?.conversationId ??
    (typeof payload.conversationId === 'string' ? payload.conversationId : 'conv-1');

  return {
    scope: overrides.scope ?? taskScope(id, conversationId),
    id,
    type: overrides.type ?? input.type,
    status: overrides.status ?? 'completed',
    input,
    output: overrides.output,
    progress: overrides.progress ?? 100,
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 2000,
    error: overrides.error,
  };
}

function createMediaTaskView(
  overrides: Partial<AgentMediaTaskView> & { id: string },
): AgentMediaTaskView {
  return {
    scope: overrides.scope ?? taskScope(overrides.id),
    id: overrides.id,
    type: overrides.type ?? 'image',
    status: overrides.status ?? 'running',
    progress: overrides.progress ?? 0,
    providerId: overrides.providerId ?? 'provider',
    modelId: overrides.modelId ?? 'model',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    request: overrides.request ?? { prompt: 'Generate cat' },
    outputs: overrides.outputs,
    result: overrides.result,
    error: overrides.error,
  };
}

function taskScope(childRunId: string, conversationId = 'conv-1'): TaskRunScope {
  const runId = `run:${conversationId}`;
  return {
    conversationId,
    runId,
    parentRunId: runId,
    childRunId,
    childKind: 'task',
  };
}
