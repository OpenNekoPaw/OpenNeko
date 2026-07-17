import { describe, expect, it, vi } from 'vitest';
import {
  buildMediaTaskProgressViewDelivery,
  buildMediaTaskViewDelivery,
} from '../media-task-progress-view';
import { createStableGeneratedOutputId } from '../media-generated-asset';
import type { MediaTask } from '../types';

describe('buildMediaTaskProgressViewDelivery', () => {
  it('finalizes completed outputs and projects a webview-safe progress view', async () => {
    const assetId = createStableGeneratedOutputId('task-1', 0, 'sha256:video');
    const assetIndex = { add: vi.fn(), remove: vi.fn() };
    const saveOutputs = vi.fn().mockResolvedValue(['/repo/neko/generated/video/video.mp4']);

    const delivery = await buildMediaTaskProgressViewDelivery({
      task: createMediaTask(),
      taskType: 'video',
      outputDir: '/repo/neko/generated/video',
      workspaceRoot: '/repo',
      showSaveNotification: true,
      saveOutputs,
      assetIndex,
      computeContentDigest: vi.fn().mockResolvedValue('sha256:video'),
      resolveResultUrl: (url) =>
        url.startsWith('generated-assets/')
          ? `webview://media/task-1/${url.split('/').pop()}`
          : undefined,
      toViewAsset: ({ path: _path, ...asset }) => ({
        ...asset,
        renderUri: `webview://generated/${asset.id}`,
      }),
      now: () => new Date('2026-01-01T00:00:02.000Z'),
    });

    expect(delivery).toEqual({
      view: {
        scope: createMediaTask().scope,
        id: 'task-1',
        type: 'video',
        status: 'completed',
        progress: 100,
        result: {
          urls: [`webview://media/task-1/${assetId}.mp4`],
          thumbnailUrl: `webview://media/task-1/${assetId}.mp4`,
          assets: [
            expect.objectContaining({
              id: assetId,
              characterIds: ['char_linxia'],
              sourceNodeId: 'node-shot-1',
              renderUri: `webview://generated/${assetId}`,
            }),
          ],
        },
        error: undefined,
        updatedAt: '2026-01-01T00:00:02.000Z',
      },
      deliveryPlan: expect.objectContaining({
        resultUrls: [`generated-assets/${assetId}.mp4`],
        thumbnailUrl: `generated-assets/${assetId}.mp4`,
        hostOutputPaths: ['/repo/neko/generated/video/video.mp4'],
        shouldPersistResultUrls: true,
        shouldUnsubscribe: true,
        notification: expect.objectContaining({
          filePath: '/repo/neko/generated/video/video.mp4',
          displayRef: `generated-assets/${assetId}.mp4`,
          message: `Video saved as generated-assets/${assetId}.mp4`,
        }),
      }),
    });
    expect(delivery.deliveryPlan.notification?.message).not.toContain('.neko/.cache/generated');
    expect(saveOutputs).toHaveBeenCalledWith(
      createMediaTask().scope,
      '/repo/neko/generated/video',
      {
        transcodeFile: undefined,
      },
    );
    expect(assetIndex.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: assetId, path: '/repo/neko/generated/video/video.mp4' }),
    );
    expect(JSON.stringify(delivery.view.result?.assets)).not.toContain('.neko/.cache/generated');
    expect(delivery.view.result?.assets?.[0]).not.toHaveProperty('path');
  });

  it('projects finalized outputs into a full media task view', async () => {
    const assetId = createStableGeneratedOutputId('task-1', 0, 'sha256:video');
    await expect(
      buildMediaTaskViewDelivery({
        task: createMediaTask(),
        taskType: 'video',
        outputDir: '/repo/neko/generated/video',
        workspaceRoot: '/repo',
        saveOutputs: vi.fn().mockResolvedValue(['/repo/neko/generated/video/video.mp4']),
        assetIndex: { add: vi.fn(), remove: vi.fn() },
        computeContentDigest: vi.fn().mockResolvedValue('sha256:video'),
        resolveResultUrl: (url) =>
          url.startsWith('generated-assets/')
            ? `webview://media/task-1/${url.split('/').pop()}`
            : undefined,
        toViewAsset: ({ path: _path, ...asset }) => ({
          ...asset,
          renderUri: `webview://generated/${asset.id}`,
        }),
      }),
    ).resolves.toEqual({
      view: expect.objectContaining({
        id: 'task-1',
        type: 'video',
        status: 'completed',
        result: {
          urls: [`webview://media/task-1/${assetId}.mp4`],
          thumbnailUrl: `webview://media/task-1/${assetId}.mp4`,
          assets: [
            expect.objectContaining({
              id: assetId,
              characterIds: ['char_linxia'],
              renderUri: `webview://generated/${assetId}`,
            }),
          ],
        },
      }),
      deliveryPlan: expect.objectContaining({
        resultUrls: [`generated-assets/${assetId}.mp4`],
        shouldPersistResultUrls: true,
      }),
    });
  });

  it('omits renderable URLs and assets when host projection fails', async () => {
    const assetId = createStableGeneratedOutputId('task-1', 0, 'sha256:video');
    const delivery = await buildMediaTaskProgressViewDelivery({
      task: createMediaTask(),
      taskType: 'video',
      outputDir: '/repo/neko/generated/video',
      workspaceRoot: '/repo',
      saveOutputs: vi.fn().mockResolvedValue(['/repo/neko/generated/video/video.mp4']),
      assetIndex: { add: vi.fn(), remove: vi.fn() },
      computeContentDigest: vi.fn().mockResolvedValue('sha256:video'),
      resolveResultUrl: () => undefined,
      toViewAsset: () => undefined,
    });

    expect(delivery).toMatchObject({
      view: {
        id: 'task-1',
        result: undefined,
      },
      deliveryPlan: {
        resultUrls: [`generated-assets/${assetId}.mp4`],
      },
    });
    expect(delivery.view.result).toBeUndefined();
    expect(JSON.stringify(delivery.view)).not.toContain('renderUri');
    expect(JSON.stringify(delivery.view)).not.toContain('.neko/.cache/generated');
  });
});

function createMediaTask(): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    scope: {
      conversationId: 'conv-1',
      runId: 'run-1',
      parentRunId: 'run-1',
      childRunId: 'task-1',
      childKind: 'task',
    },
    id: 'task-1',
    type: 'text-to-video',
    status: 'completed',
    progress: 100,
    providerId: 'runway',
    modelId: 'gen-4',
    createdAt: now,
    updatedAt: now,
    request: {
      prompt: 'city flythrough',
      metadata: { characterIds: ['char_linxia'], sourceNodeId: 'node-shot-1' },
    },
    outputs: [
      {
        type: 'video',
        url: 'https://remote.test/video.mp4',
        width: 1280,
        height: 720,
        duration: 5,
      },
    ],
  };
}
