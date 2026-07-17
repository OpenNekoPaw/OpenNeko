import { describe, expect, it } from 'vitest';
import type { AgentBackgroundTask, SubAgentWorkItem } from '@neko-agent/types';
import {
  isTaskWorkItem,
  projectAgentWorkItemsToTodo,
  projectBackgroundTaskToWorkItem,
  projectBackgroundTasksToWorkItems,
  projectMediaTaskToBackgroundTask,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
} from '@neko-agent/types';

describe('work-item-projector', () => {
  it('projects media tasks to background task views', () => {
    expect(
      projectMediaTaskToBackgroundTask({
        id: 'task-1',
        type: 'video',
        status: 'processing',
        progress: 42,
        providerId: 'provider-1',
        modelId: 'model-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: '2026-01-01T00:00:01.000Z',
        outputs: [{ url: 'webview://video.mp4', duration: 3 }],
        request: { prompt: 'A short cinematic scene' },
      }),
    ).toEqual({
      id: 'task-1',
      type: 'video',
      name: 'A short cinematic scene',
      prompt: 'A short cinematic scene',
      providerId: 'provider-1',
      providerName: 'model-1',
      status: 'processing',
      progress: 42,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      result: {
        urls: ['webview://video.mp4'],
        thumbnailUrl: undefined,
        width: undefined,
        height: undefined,
        duration: 3,
      },
      error: undefined,
    });
  });

  it('projects task protocol payloads to unified work items', () => {
    const task = {
      id: 'task-1',
      type: 'image' as const,
      name: 'Generate cat',
      prompt: 'cat',
      providerId: 'provider-1',
      providerName: 'model-1',
      status: 'processing' as const,
      progress: 40,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    };

    expect(
      projectBackgroundTaskToWorkItem({
        conversationId: 'conv-1',
        task,
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
      }),
    ).toMatchObject({
      id: 'task-1',
      conversationId: 'conv-1',
      kind: 'tool-background-task',
      parentMessageId: 'msg-1',
      parentToolCallId: 'tool-1',
      task,
    });

    expect(
      projectBackgroundTasksToWorkItems({
        conversationId: 'conv-1',
        tasks: [task],
      }),
    ).toHaveLength(1);
  });

  it('classifies task work items without treating subagents as tasks', () => {
    const task = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: createBackgroundTask('task-1', 'Generate cat'),
    });
    const subAgent = createSubAgentWorkItem('sub-1', 'tool-1');

    expect(isTaskWorkItem(task)).toBe(true);
    expect(isTaskWorkItem({ ...task, kind: 'media-task' })).toBe(true);
    expect(isTaskWorkItem(subAgent)).toBe(false);
  });

  it('prefers finalized media task result over raw provider outputs', () => {
    expect(
      projectMediaTaskToBackgroundTask({
        id: 'task-1',
        type: 'image',
        status: 'completed',
        progress: 100,
        providerId: 'provider-1',
        modelId: 'model-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        outputs: [{ url: 'https://remote.test/image.png', width: 1024, height: 1024 }],
        result: {
          urls: ['webview://local-image.png'],
          thumbnailUrl: 'webview://local-image.png',
          assets: [
            {
              id: 'asset-1',
              type: 'generated-image',
              renderUri: 'webview://local-image.png',
            } as any,
          ],
        },
        request: { prompt: 'A cat' },
      }),
    ).toMatchObject({
      result: {
        urls: ['webview://local-image.png'],
        thumbnailUrl: 'webview://local-image.png',
        assets: [
          {
            id: 'asset-1',
            renderUri: 'webview://local-image.png',
          },
        ],
      },
    });
  });

  it('projects media task payloads directly to media work items', () => {
    const item = projectMediaTaskToWorkItem({
      conversationId: 'conv-1',
      task: {
        id: 'task-1',
        type: 'video',
        status: 'completed',
        progress: 100,
        providerId: 'provider-1',
        modelId: 'model-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        outputs: [{ url: 'webview://video.mp4', duration: 3 }],
        request: { prompt: 'A short cinematic scene' },
      },
    });

    expect(item).toMatchObject({
      id: 'task-1',
      conversationId: 'conv-1',
      kind: 'media-task',
      status: 'completed',
      result: { urls: ['webview://video.mp4'], duration: 3 },
      task: {
        type: 'video',
        providerName: 'model-1',
      },
    });
  });

  it('projects subagent events to unified work items', () => {
    expect(
      projectSubAgentEventToWorkItem({
        type: 'started',
        subAgentId: 'sub-1',
        parentAgentId: 'parent-1',
        conversationId: 'conv-1',
        data: {
          description: 'Review implementation',
          subagentType: 'reviewer',
          runMode: 'background',
          modelTier: 'fast',
          parentMessageId: 'msg-1',
          parentToolCallId: 'tool-1',
        },
        timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
      }),
    ).toMatchObject({
      id: 'sub-1',
      conversationId: 'conv-1',
      kind: 'subagent',
      parentMessageId: 'msg-1',
      parentToolCallId: 'tool-1',
      title: 'Review implementation',
      status: 'processing',
      progress: 5,
      subAgent: {
        parentAgentId: 'parent-1',
        type: 'reviewer',
        runMode: 'background',
        modelTier: 'fast',
      },
    });
  });

  it('projects bounded near-term TODO rows without copying task step graphs', () => {
    const running = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: {
        ...createBackgroundTask('task-running', 'Render current shot'),
        status: 'processing',
        progress: 40,
        steps: [
          { id: 'shot-1', name: 'Shot 1', status: 'running' },
          { id: 'shot-2', name: 'Shot 2', status: 'running' },
        ],
      },
    });
    const blocked = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: {
        ...createBackgroundTask('task-blocked', 'Render blocked shot'),
        status: 'failed',
        error: 'Missing reference',
      },
    });
    const pending = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: { ...createBackgroundTask('task-pending', 'Prepare audio'), status: 'queued' },
    });
    const completedWithoutResult = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: createBackgroundTask('task-completed', 'Inspect source'),
    });
    const otherConversation = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-2',
      task: createBackgroundTask('task-other', 'Unrelated'),
    });

    const projection = projectAgentWorkItemsToTodo({
      conversationId: 'conv-1',
      items: [completedWithoutResult, pending, otherConversation, blocked, running],
      maxItems: 4,
    });

    expect(projection).toEqual([
      expect.objectContaining({
        content: 'Render current shot',
        status: 'in_progress',
        sourceWorkItemId: 'task-running',
      }),
      expect.objectContaining({ content: 'Render blocked shot', status: 'blocked' }),
      expect.objectContaining({ content: 'Prepare audio', status: 'pending' }),
      expect.objectContaining({ content: 'Inspect source', status: 'completed' }),
    ]);
    expect(projection).toHaveLength(4);
    expect(projection.filter((item) => item.sourceWorkItemId === running.id)).toHaveLength(1);
    expect(projection.some((item) => item.content === 'Shot 1')).toBe(false);
    expect(completedWithoutResult.result).toBeUndefined();
  });

  it('keeps TODO projection disposable and rejects invalid bounds', () => {
    const source = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: { ...createBackgroundTask('task-1', 'Generate frame'), status: 'processing' },
    });
    const input = { conversationId: 'conv-1', items: [source] } as const;

    const first = projectAgentWorkItemsToTodo(input);
    const rebuilt = projectAgentWorkItemsToTodo(input);

    expect(rebuilt).toEqual(first);
    expect(rebuilt).not.toBe(first);
    expect(source.status).toBe('processing');
    expect(() => projectAgentWorkItemsToTodo({ ...input, maxItems: 0 })).toThrow(
      'TODO projection limit must be a positive safe integer',
    );
  });

  it('bounds TODO projection and exposes at most one in-progress item', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      projectBackgroundTaskToWorkItem({
        conversationId: 'conv-1',
        task: {
          ...createBackgroundTask(`task-${index}`, `Render shot ${index}`),
          status: 'processing',
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        },
      }),
    );

    const projection = projectAgentWorkItemsToTodo({
      conversationId: 'conv-1',
      items,
    });

    expect(projection).toHaveLength(6);
    expect(projection.filter((item) => item.status === 'in_progress')).toHaveLength(1);
    expect(projection.filter((item) => item.status === 'pending')).toHaveLength(5);
    expect(projection[0]).toMatchObject({
      content: 'Render shot 7',
      status: 'in_progress',
    });
  });
});

function createSubAgentWorkItem(id: string, parentToolCallId: string | null): SubAgentWorkItem {
  return {
    id,
    conversationId: 'conv-a',
    kind: 'subagent',
    parentMessageId: 'msg-a',
    parentToolCallId,
    title: id,
    status: 'processing',
    progress: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subAgent: {
      parentAgentId: 'parent-a',
    },
  };
}

function createBackgroundTask(id: string, prompt: string): AgentBackgroundTask {
  return {
    id,
    type: 'image',
    name: prompt,
    prompt,
    providerId: 'provider-1',
    providerName: 'model-1',
    status: 'completed',
    progress: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
