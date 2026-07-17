import { describe, expect, it } from 'vitest';
import type { Task } from '@neko/shared';
import {
  buildBackgroundTaskFailureUpdateView,
  createBackgroundTaskViewFromToolResultData,
  filterTasksForConversation,
  getTaskConversationId,
  getTaskResultUrl,
  matchesTaskConversation,
  mergeBackgroundTaskProgressView,
  toBackgroundTaskView,
  toBackgroundTaskViewStatus,
  toBackgroundTaskViewType,
} from '../task-view-projector';

describe('task view projector', () => {
  it('filters tasks by the conversation id carried in payload', () => {
    const taskA = createTask({ id: 'task-a', payload: { conversationId: 'conv-a' } });
    const taskB = createTask({ id: 'task-b', payload: { conversationId: 'conv-b' } });

    expect(getTaskConversationId(taskA)).toBe('conv-a');
    expect(matchesTaskConversation(taskA, 'conv-a')).toBe(true);
    expect(matchesTaskConversation(taskB, 'conv-a')).toBe(false);
    expect(filterTasksForConversation([taskA, taskB], 'conv-a')).toEqual([taskA]);
  });

  it('uses the authoritative task scope instead of media request metadata', () => {
    const task = createTask({
      scope: taskScope('task-1', 'conv-media'),
      payload: {
        request: {
          prompt: 'Generate a cat image',
          metadata: { conversationId: 'payload-conversation-must-not-own-task' },
        },
      },
    });

    expect(getTaskConversationId(task)).toBe('conv-media');
    expect(matchesTaskConversation(task, 'conv-media')).toBe(true);
  });

  it('projects the webview display DTO without extension-owned business rules', () => {
    const createdAt = Date.UTC(2026, 0, 1, 0, 0, 0);
    const updatedAt = Date.UTC(2026, 0, 1, 0, 1, 0);
    const task = createTask({
      id: 'task-1',
      status: 'running',
      progress: 45,
      createdAt,
      updatedAt,
      payload: {
        prompt: 'Generate a cat image',
        providerId: 'openai',
        providerName: 'OpenAI',
        conversationId: 'conv-1',
      },
    });

    expect(toBackgroundTaskView(task)).toEqual({
      scope: taskScope('task-1'),
      id: 'task-1',
      type: 'image',
      name: 'Generate a cat image',
      prompt: 'Generate a cat image',
      providerId: 'openai',
      providerName: 'OpenAI',
      status: 'processing',
      progress: 45,
      createdAt: new Date(createdAt).toISOString(),
      updatedAt: new Date(updatedAt).toISOString(),
      result: undefined,
      error: undefined,
    });
  });

  it('keeps the existing display name fallback order', () => {
    const longPrompt = 'A'.repeat(60);

    expect(toBackgroundTaskView(createTask({ payload: { prompt: longPrompt } })).name).toBe(
      `${'A'.repeat(47)}...`,
    );
    expect(toBackgroundTaskView(createTask({ payload: { name: 'Named task' } })).name).toBe(
      'Named task',
    );
    expect(toBackgroundTaskView(createTask({ payload: { content: 'IDC task label' } })).name).toBe(
      'IDC task label',
    );
    expect(toBackgroundTaskView(createTask({ type: 'image_generation', payload: {} })).name).toBe(
      'Image Generation',
    );
  });

  it('normalizes task type and status for the current webview task schema', () => {
    expect(toBackgroundTaskViewType(createTask({ type: 'video_generation' }))).toBe('video');
    expect(toBackgroundTaskViewType(createTask({ type: 'audio_generation' }))).toBe('audio');
    expect(
      toBackgroundTaskViewType(createTask({ type: 'custom', payload: { type: 'music' } })),
    ).toBe('audio');
    expect(
      toBackgroundTaskViewType(createTask({ type: 'custom', payload: { type: 'video-edit' } })),
    ).toBe('video');

    expect(toBackgroundTaskViewStatus('pending')).toBe('queued');
    expect(toBackgroundTaskViewStatus('running')).toBe('processing');
    expect(toBackgroundTaskViewStatus('completed')).toBe('completed');
    expect(toBackgroundTaskViewStatus('failed')).toBe('failed');
    expect(toBackgroundTaskViewStatus('cancelled')).toBe('cancelled');
  });

  it('ignores legacy local paths and uses persisted public result urls', () => {
    const task = createTask({
      output: {
        data: {
          localPaths: ['/tmp/a.png', '/tmp/b.png'],
          urls: ['https://old.example/a.png'],
          thumbnailUrl: 'https://old.example/thumb.png',
          width: 1024,
        },
      },
    });

    expect(toBackgroundTaskView(task).result).toEqual({
      urls: ['https://old.example/a.png'],
      thumbnailUrl: 'https://old.example/thumb.png',
      width: 1024,
    });
  });

  it('does not expose legacy local paths when no public result url exists', () => {
    const task = createTask({
      output: {
        data: {
          localPaths: ['/tmp/a.png'],
          urls: ['/workspace/.neko/.cache/generated/a.png'],
          thumbnailUrl: '/workspace/.neko/.cache/generated/a.png',
        },
      },
    });

    expect(toBackgroundTaskView(task).result).toBeUndefined();
  });

  it('does not expose webview render URIs as durable task results', () => {
    const task = createTask({
      output: {
        data: {
          urls: ['webview-uri:/workspace/neko/generated/image/a.png'],
          thumbnailUrl: 'vscode-webview://rendered-thumbnail.png',
        },
      },
    });

    expect(getTaskResultUrl(task)).toBeUndefined();
    expect(toBackgroundTaskView(task).result).toBeUndefined();
  });

  it('extracts the primary result url from task output data', () => {
    expect(
      getTaskResultUrl(
        createTask({
          output: { data: { urls: ['https://example.test/a.png'] } },
        }),
      ),
    ).toBe('https://example.test/a.png');
    expect(
      getTaskResultUrl(
        createTask({
          output: { data: { url: 'https://example.test/single.png' } },
        }),
      ),
    ).toBe('https://example.test/single.png');
    expect(
      getTaskResultUrl(
        createTask({
          output: {
            data: {
              urls: ['/workspace/.neko/.cache/generated/a.png', 'generated-assets/asset-1.png'],
            },
          },
        }),
      ),
    ).toBe('generated-assets/asset-1.png');
    expect(
      getTaskResultUrl(
        createTask({
          output: { data: { url: '/workspace/.neko/.cache/generated/a.png' } },
        }),
      ),
    ).toBeUndefined();
    expect(getTaskResultUrl(createTask({ output: { data: 'not-object' } }))).toBeUndefined();
  });

  it('projects background task tool result data into the initial task view', () => {
    expect(
      createBackgroundTaskViewFromToolResultData(
        {
          backgroundMode: true,
          taskId: 'task-1',
          taskScope: taskScope('task-1'),
          type: 'video',
          message: 'Generate a cinematic city flythrough',
          routedTo: { provider: 'runway' },
        },
        { now: () => Date.UTC(2026, 0, 1, 0, 0, 0) },
      ),
    ).toEqual({
      scope: taskScope('task-1'),
      id: 'task-1',
      type: 'video',
      name: 'Generate a cinematic city flythrough',
      prompt: 'Generate a cinematic city flythrough',
      providerId: 'runway',
      providerName: 'runway',
      status: 'queued',
      progress: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('merges media progress patches into the full background task view', () => {
    const created = createBackgroundTaskViewFromToolResultData(
      {
        backgroundMode: true,
        taskId: 'task-1',
        taskScope: taskScope('task-1'),
        type: 'video',
        message: 'Generate a cinematic city flythrough',
        routedTo: { provider: 'runway' },
      },
      { now: () => Date.UTC(2026, 0, 1, 0, 0, 0) },
    );

    expect(created).not.toBeNull();
    expect(
      mergeBackgroundTaskProgressView(created!, {
        id: 'task-1',
        status: 'completed',
        progress: 100,
        result: {
          urls: ['generated-assets/video-1.mp4'],
          thumbnailUrl: 'generated-assets/video-1.mp4',
        },
        updatedAt: '2026-01-01T00:00:02.000Z',
      }),
    ).toEqual({
      ...created,
      status: 'completed',
      progress: 100,
      result: {
        urls: ['generated-assets/video-1.mp4'],
        thumbnailUrl: 'generated-assets/video-1.mp4',
      },
      updatedAt: '2026-01-01T00:00:02.000Z',
    });
  });

  it('strips generated asset paths including nested storyboard shot paths', () => {
    const task = createTask({
      output: {
        data: {
          urls: ['generated-assets/storyboard-1.json'],
          assets: [
            {
              id: 'storyboard-1',
              type: 'generated-storyboard',
              path: '/workspace/.neko/.cache/generated/storyboard/storyboard-1.json',
              mimeType: 'application/json',
              generatedAt: '2026-01-01T00:00:00.000Z',
              renderUri: 'webview://storyboard-1',
              scenes: [
                {
                  sceneIndex: 1,
                  heading: 'INT. ROOM - DAY',
                  shots: [
                    {
                      id: 'shot-1',
                      type: 'generated-image',
                      path: '/workspace/.neko/.cache/generated/image/shot-1.png',
                      mimeType: 'image/png',
                      generatedAt: '2026-01-01T00:00:00.000Z',
                      width: 1024,
                      height: 1024,
                      ratio: '1:1',
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    expect(JSON.stringify(toBackgroundTaskView(task).result)).not.toContain('.neko/.cache');
    expect(toBackgroundTaskView(task).result?.assets?.[0]).toMatchObject({
      id: 'storyboard-1',
      type: 'generated-storyboard',
      scenes: [
        {
          shots: [
            {
              id: 'shot-1',
              type: 'generated-image',
            },
          ],
        },
      ],
    });
  });

  it('projects retry failure updates without host-owned display logic', () => {
    const task = createTask({
      id: 'task-1',
      payload: {
        prompt: 'Generate a cat image',
        providerId: 'openai',
        conversationId: 'conv-1',
      },
    });

    expect(
      buildBackgroundTaskFailureUpdateView(task, new Error('quota exceeded'), {
        now: () => Date.UTC(2026, 0, 1, 0, 0, 3),
      }),
    ).toEqual({
      scope: taskScope('task-1'),
      id: 'task-1',
      type: 'image',
      name: 'Generate a cat image',
      prompt: 'Generate a cat image',
      providerId: 'openai',
      providerName: '',
      status: 'failed',
      progress: 100,
      createdAt: new Date(1000).toISOString(),
      updatedAt: '2026-01-01T00:00:03.000Z',
      result: undefined,
      error: 'Retry failed: quota exceeded',
    });
  });

  it('ignores progress patches for another task id', () => {
    const task = createBackgroundTaskViewFromToolResultData({
      backgroundMode: true,
      taskId: 'task-1',
      taskScope: taskScope('task-1'),
      type: 'image',
      message: 'Generate a cat',
    });

    expect(task).not.toBeNull();
    expect(
      mergeBackgroundTaskProgressView(task!, {
        id: 'task-2',
        status: 'completed',
        progress: 100,
      }),
    ).toEqual(task);
  });

  it('ignores non-background tool result data for task creation', () => {
    expect(createBackgroundTaskViewFromToolResultData({ taskId: 'task-1' })).toBeNull();
    expect(createBackgroundTaskViewFromToolResultData({ backgroundMode: true })).toBeNull();
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
