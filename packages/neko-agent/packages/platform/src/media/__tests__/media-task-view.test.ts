import { describe, expect, it } from 'vitest';
import {
  createMediaTaskView,
  createMediaTaskProgressView,
  getMediaTaskConversationId,
  matchesMediaTaskConversation,
  toMediaBackgroundTaskStatus,
  toMediaBackgroundTaskType,
} from '../media-task-view';

describe('media task view helpers', () => {
  it('maps media generation types to background task types', () => {
    expect(toMediaBackgroundTaskType('text-to-image')).toBe('image');
    expect(toMediaBackgroundTaskType('image-edit')).toBe('image');
    expect(toMediaBackgroundTaskType('text-to-video')).toBe('video');
    expect(toMediaBackgroundTaskType('video-edit')).toBe('video');
    expect(toMediaBackgroundTaskType('text-to-music')).toBe('audio');
  });

  it('maps media task status to background task status', () => {
    expect(toMediaBackgroundTaskStatus('pending')).toBe('queued');
    expect(toMediaBackgroundTaskStatus('processing')).toBe('processing');
    expect(toMediaBackgroundTaskStatus('completed')).toBe('completed');
  });

  it('reads conversation id from media task metadata', () => {
    const task = {
      request: { prompt: 'cat', metadata: { conversationId: 'conv-1' } },
    };

    expect(getMediaTaskConversationId(task as any)).toBe('conv-1');
    expect(matchesMediaTaskConversation(task as any, 'conv-1')).toBe(true);
    expect(matchesMediaTaskConversation(task as any, 'conv-2')).toBe(false);
  });

  it('projects media task progress into a background task update view', () => {
    expect(
      createMediaTaskProgressView({
        task: {
          id: 'task-1',
          type: 'text-to-video',
          status: 'completed',
          progress: 100,
          providerId: 'runway',
          modelId: 'gen-3',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:01.000Z'),
          request: {
            prompt: 'cat',
            metadata: { characterIds: ['char_linxia'], sourceNodeId: 'node-1' },
          },
          error: undefined,
        } as any,
        urls: ['webview://video.mp4'],
        thumbnailUrl: 'webview://thumb.jpg',
        assets: [
          {
            id: 'asset-1',
            type: 'generated-video',
            mimeType: 'video/mp4',
            generatedAt: '2026-01-01T00:00:00.000Z',
            characterIds: ['char_linxia'],
            sourceNodeId: 'node-1',
            renderUri: 'webview://video.mp4',
          } as any,
        ],
        now: () => new Date('2026-01-01T00:00:02.000Z'),
      }),
    ).toEqual({
      id: 'task-1',
      type: 'video',
      status: 'completed',
      progress: 100,
      result: {
        urls: ['webview://video.mp4'],
        thumbnailUrl: 'webview://thumb.jpg',
        assets: [
          {
            id: 'asset-1',
            type: 'generated-video',
            mimeType: 'video/mp4',
            generatedAt: '2026-01-01T00:00:00.000Z',
            characterIds: ['char_linxia'],
            sourceNodeId: 'node-1',
            renderUri: 'webview://video.mp4',
          },
        ],
      },
      error: undefined,
      updatedAt: '2026-01-01T00:00:02.000Z',
    });
  });

  it('projects a raw media task into the webview-safe task schema', () => {
    expect(
      createMediaTaskView({
        id: 'task-1',
        type: 'text-to-video',
        status: 'completed',
        progress: 100,
        providerId: 'runway',
        modelId: 'gen-3',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        request: { prompt: 'cinematic cat' },
        outputs: [
          {
            type: 'video',
            url: 'https://example.test/video.mp4',
            width: 1280,
            height: 720,
            duration: 5,
            thumbnailUrl: 'https://example.test/thumb.jpg',
          },
        ],
      } as any),
    ).toEqual({
      id: 'task-1',
      type: 'video',
      status: 'completed',
      progress: 100,
      providerId: 'runway',
      modelId: 'gen-3',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      outputs: [
        {
          url: 'https://example.test/video.mp4',
          width: 1280,
          height: 720,
          duration: 5,
          thumbnailUrl: 'https://example.test/thumb.jpg',
        },
      ],
      request: { prompt: 'cinematic cat' },
    });
  });

  it('preserves a non-retryable provider failure for the webview', () => {
    const view = createMediaTaskView({
      id: 'task-ambiguous',
      type: 'text-to-image',
      status: 'failed',
      progress: 100,
      providerId: 'newapi',
      modelId: 'gpt-image-2',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:01.000Z'),
      request: { prompt: 'cat' },
      error: {
        code: 'NEWAPI_IMAGE_OUTCOME_UNKNOWN',
        message: 'Provider outcome is unknown.',
        retryable: false,
      },
    } as any);

    expect(view.error).toEqual({
      code: 'NEWAPI_IMAGE_OUTCOME_UNKNOWN',
      message: 'Provider outcome is unknown.',
      retryable: false,
    });
  });

  it('projects finalized media result into the webview-safe task schema', () => {
    expect(
      createMediaTaskView(
        {
          id: 'task-1',
          type: 'text-to-image',
          status: 'completed',
          progress: 100,
          providerId: 'openai',
          modelId: 'gpt-image-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:01.000Z'),
          request: { prompt: 'cat' },
          outputs: [{ type: 'image', url: 'https://remote.test/image.png' }],
        } as any,
        {
          urls: ['webview://local-image.png'],
          thumbnailUrl: 'webview://local-image.png',
          assets: [
            {
              id: 'asset-1',
              type: 'generated-image',
              mimeType: 'image/png',
              generatedAt: '2026-01-01T00:00:00.000Z',
              characterIds: ['char_linxia'],
              renderUri: 'webview://local-image.png',
            } as any,
          ],
        },
      ),
    ).toMatchObject({
      id: 'task-1',
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

  it('filters managed cache paths from raw outputs and result urls', () => {
    const view = createMediaTaskView(
      {
        id: 'task-1',
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        request: { prompt: 'cat' },
        outputs: [{ type: 'image', url: '/repo/.neko/.cache/generated/image.png' }],
      } as any,
      {
        urls: ['/repo/.neko/.cache/generated/image.png'],
        thumbnailUrl: '/repo/.neko/.cache/generated/image.png',
        assets: [
          {
            id: 'asset-1',
            type: 'generated-image',
            mimeType: 'image/png',
            generatedAt: '2026-01-01T00:00:00.000Z',
            renderUri: 'webview://local-image.png',
          } as any,
        ],
      },
    );

    expect(view.outputs).toBeUndefined();
    expect(view.result).toMatchObject({
      urls: [],
      assets: [{ id: 'asset-1', renderUri: 'webview://local-image.png' }],
    });
    expect(JSON.stringify(view)).not.toContain('.neko/.cache');
  });
});
