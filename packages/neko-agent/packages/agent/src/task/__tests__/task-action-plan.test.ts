import { describe, expect, it } from 'vitest';
import type { Task, TaskRunScope } from '@neko/shared';
import {
  buildCancelTaskActionPlan,
  buildClearCompletedTaskPlan,
  buildRemoveTaskActionPlan,
  buildRetryTaskActionPlan,
  buildTaskResultOpenPlan,
  buildViewTaskResultActionPlan,
} from '../task-action-plan';

describe('task action plan', () => {
  it('plans task-manager cancellation for tasks owned by the conversation', () => {
    expect(
      buildCancelTaskActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({ id: 'task-1', payload: { conversationId: 'conv-1' } }),
      }),
    ).toEqual({
      kind: 'cancel-task-manager',
      taskId: 'task-1',
      conversationId: 'conv-1',
    });
  });

  it('falls back to media cancellation when task-manager storage has no task', () => {
    expect(
      buildCancelTaskActionPlan({
        taskId: 'media-1',
        conversationId: 'conv-1',
        media: { id: 'media-1', conversationId: 'conv-1' },
      }),
    ).toEqual({
      kind: 'cancel-media',
      taskId: 'media-1',
      conversationId: 'conv-1',
    });
  });

  it('rejects actions for resources from another conversation', () => {
    expect(
      buildCancelTaskActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({ id: 'task-1', payload: { conversationId: 'conv-2' } }),
      }),
    ).toEqual({
      kind: 'reject',
      reason: 'wrong-conversation',
      taskId: 'task-1',
      conversationId: 'conv-1',
      taskConversationId: 'conv-2',
    });
  });

  it('allows retry only for failed or cancelled task-manager tasks', () => {
    const failed = createTask({
      id: 'task-1',
      status: 'failed',
      payload: { conversationId: 'conv-1' },
    });
    const running = createTask({
      id: 'task-2',
      status: 'running',
      payload: { conversationId: 'conv-1' },
    });

    expect(
      buildRetryTaskActionPlan({ taskId: 'task-1', conversationId: 'conv-1', task: failed }),
    ).toEqual({
      kind: 'retry-task-manager',
      taskId: 'task-1',
      conversationId: 'conv-1',
      input: failed.input,
    });
    expect(
      buildRetryTaskActionPlan({ taskId: 'task-2', conversationId: 'conv-1', task: running }),
    ).toEqual({
      kind: 'reject',
      reason: 'invalid-status',
      taskId: 'task-2',
      conversationId: 'conv-1',
      taskConversationId: 'conv-1',
    });
  });

  it('plans remove effects for task-manager and media resources', () => {
    expect(
      buildRemoveTaskActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({ id: 'task-1', payload: { conversationId: 'conv-1' } }),
      }),
    ).toEqual({
      kind: 'remove',
      taskId: 'task-1',
      conversationId: 'conv-1',
      deleteTaskManager: true,
      deleteMedia: true,
    });

    expect(
      buildRemoveTaskActionPlan({
        taskId: 'media-1',
        conversationId: 'conv-1',
        media: { id: 'media-1', conversationId: 'conv-1' },
      }),
    ).toEqual({
      kind: 'remove',
      taskId: 'media-1',
      conversationId: 'conv-1',
      deleteTaskManager: false,
      deleteMedia: true,
    });
  });

  it('prefers task-manager result url over media provider urls', () => {
    expect(
      buildViewTaskResultActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({
          id: 'task-1',
          payload: { conversationId: 'conv-1' },
          output: { data: { urls: ['generated-assets/asset-1.png'] } },
        }),
        media: {
          id: 'task-1',
          conversationId: 'conv-1',
          resultUrl: 'https://media.example/result.png',
        },
      }),
    ).toEqual({
      kind: 'open-url',
      taskId: 'task-1',
      conversationId: 'conv-1',
      url: 'generated-assets/asset-1.png',
    });

    expect(
      buildViewTaskResultActionPlan({
        taskId: 'task-2',
        conversationId: 'conv-1',
        task: createTask({
          id: 'task-2',
          payload: { conversationId: 'conv-1' },
          output: { data: { urls: ['neko/generated/image/result.png'] } },
        }),
      }),
    ).toEqual({
      kind: 'open-url',
      taskId: 'task-2',
      conversationId: 'conv-1',
      url: 'neko/generated/image/result.png',
    });
  });

  it('does not open provider URLs as VSCode task results', () => {
    expect(
      buildViewTaskResultActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({
          id: 'task-1',
          payload: { conversationId: 'conv-1' },
          output: { data: { url: 'https://task.example/result.png' } },
        }),
        media: {
          id: 'task-1',
          conversationId: 'conv-1',
          resultUrl: 'https://media.example/result.png',
        },
      }),
    ).toEqual({
      kind: 'noop',
      reason: 'no-result',
      taskId: 'task-1',
      conversationId: 'conv-1',
    });
  });

  it('falls back to generated media refs when task-manager storage has no result', () => {
    expect(
      buildViewTaskResultActionPlan({
        taskId: 'media-1',
        conversationId: 'conv-1',
        media: {
          id: 'media-1',
          conversationId: 'conv-1',
          resultUrl: 'generated-assets/asset-1.png',
        },
      }),
    ).toEqual({
      kind: 'open-url',
      taskId: 'media-1',
      conversationId: 'conv-1',
      url: 'generated-assets/asset-1.png',
    });
  });

  it('falls back to the displayed result ref when storage has only provider urls', () => {
    expect(
      buildViewTaskResultActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({
          id: 'task-1',
          payload: { conversationId: 'conv-1' },
          output: { data: { url: 'https://task.example/result.png' } },
        }),
        media: {
          id: 'task-1',
          conversationId: 'conv-1',
          resultUrl: 'https://media.example/result.png',
        },
        resultRef: 'generated-assets/asset-1.png',
      }),
    ).toEqual({
      kind: 'open-url',
      taskId: 'task-1',
      conversationId: 'conv-1',
      url: 'generated-assets/asset-1.png',
    });
  });

  it('rejects displayed result refs outside generated asset roots', () => {
    expect(
      buildViewTaskResultActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        resultRef: 'README.md',
      }),
    ).toEqual({
      kind: 'noop',
      reason: 'no-result',
      taskId: 'task-1',
      conversationId: 'conv-1',
    });
  });

  it('does not treat local or cache paths as view-result URLs', () => {
    expect(
      buildViewTaskResultActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({
          id: 'task-1',
          payload: { conversationId: 'conv-1' },
          output: { data: { url: '/workspace/.neko/.cache/generated/result.png' } },
        }),
        media: {
          id: 'task-1',
          conversationId: 'conv-1',
          resultUrl: '/workspace/.neko/.cache/generated/result.png',
        },
      }),
    ).toEqual({
      kind: 'noop',
      reason: 'no-result',
      taskId: 'task-1',
      conversationId: 'conv-1',
    });
  });

  it('does not treat webview render URIs as view-result URLs', () => {
    expect(
      buildViewTaskResultActionPlan({
        taskId: 'task-1',
        conversationId: 'conv-1',
        task: createTask({
          id: 'task-1',
          payload: { conversationId: 'conv-1' },
          output: { data: { urls: ['webview-uri:/workspace/neko/generated/image/result.png'] } },
        }),
        media: {
          id: 'task-1',
          conversationId: 'conv-1',
          resultUrl: 'webview-uri:/workspace/neko/generated/image/result.png',
        },
      }),
    ).toEqual({
      kind: 'noop',
      reason: 'no-result',
      taskId: 'task-1',
      conversationId: 'conv-1',
    });
  });

  it('filters clear-completed candidates by conversation id', () => {
    expect(
      buildClearCompletedTaskPlan({
        conversationId: 'conv-1',
        tasks: [
          createTask({ id: 'task-1', payload: { conversationId: 'conv-1' } }),
          createTask({ id: 'task-2', payload: { conversationId: 'conv-2' } }),
        ],
      }),
    ).toEqual({ conversationId: 'conv-1', taskIds: ['task-1'] });
  });

  it('plans host open effects for task result URLs', () => {
    expect(buildTaskResultOpenPlan('/repo/output.png')).toEqual({
      kind: 'open-file',
      filePath: '/repo/output.png',
    });
    expect(buildTaskResultOpenPlan('file:///repo/output%20file.png')).toEqual({
      kind: 'open-file',
      filePath: '/repo/output file.png',
    });
    expect(buildTaskResultOpenPlan('https://example.test/output.png')).toEqual({
      kind: 'open-external',
      url: 'https://example.test/output.png',
    });
  });
});

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
