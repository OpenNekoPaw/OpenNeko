import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MediaTurnBridge } from './mediaTurnBridge';
import type { MediaTask } from '@neko/platform';
import {
  createGeneratedAssetRevisionRef,
  type GeneratedAsset,
  type ResourceRef,
  type Task,
} from '@neko/shared';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('MediaTurnBridge', () => {
  it('forwards stable 3D reference controls to the selected image request', async () => {
    const created = createMediaTask({ status: 'pending', progress: 0 });
    const poseRef = resourceRef('pose');
    const generateImage = vi.fn().mockResolvedValue(created);
    const bridge = new MediaTurnBridge({
      platform: {
        media: {
          generateImage,
          getTask: vi.fn().mockResolvedValue(undefined),
          onProgress: vi.fn().mockReturnValue(vi.fn()),
        },
      } as never,
      mediaDeliveryHost: {
        createTaskView: vi.fn(async () => ({
          id: 'task-1',
          type: 'image',
          status: 'pending',
          progress: 0,
          providerId: 'fal',
          modelId: 'flux-control',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          request: { prompt: 'match pose' },
        })),
      } as never,
    });

    await bridge.execute({
      webview: createWebview(),
      conversationId: 'conv-1',
      prompt: 'match pose',
      mediaModel: { providerId: 'fal', modelId: 'flux-control', category: 'image' },
      threeReferenceControls: {
        appearanceReferences: [],
        controlImage: {
          imageRef: poseRef,
          mode: 'pose',
          identity: { sessionId: 'pose-session', revision: 1 },
        },
      },
    });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'fal',
        modelId: 'flux-control',
        controlImageRef: poseRef,
        controlMode: 'pose',
      }),
    );
  });

  it('posts stream completion and idle phase after a direct media task reaches a terminal state', async () => {
    const created = createMediaTask({ status: 'pending', progress: 0 });
    const completed = createMediaTask({ status: 'completed', progress: 100 });
    const media = {
      generateImage: vi.fn().mockResolvedValue(created),
      getTask: vi.fn().mockResolvedValue(completed),
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    };
    const webview = createWebview();
    const bridge = new MediaTurnBridge({
      platform: { media } as never,
      mediaDeliveryHost: {
        createTaskView: vi.fn(async (_webview: vscode.Webview, task: MediaTask) => ({
          id: task.id,
          type: 'image',
          status: task.status,
          progress: task.progress,
          providerId: task.providerId,
          modelId: task.modelId,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          request: { prompt: task.request.prompt },
        })),
      } as never,
      now: () => 123,
    });

    await bridge.execute({
      webview,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'openai', modelId: 'gpt-image-1', category: 'image' },
    });

    const messages = webview.postMessage.mock.calls.map((call) => call[0]);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'mediaTaskProgress',
          conversationId: 'conv-1',
          workItem: expect.objectContaining({ id: 'task-1', status: 'completed' }),
        }),
        { type: 'streamComplete', conversationId: 'conv-1', messageId: 'media-turn:task-1' },
        { type: 'agentPhase', conversationId: 'conv-1', phase: 'idle', timestamp: 123 },
      ]),
    );
  });

  it('projects direct terminal media tasks to task-result observation coordinator', async () => {
    const created = createMediaTask({ status: 'pending', progress: 0 });
    const completed = createMediaTask({ status: 'completed', progress: 100 });
    const handleTerminalTask = vi.fn(async () => undefined);
    const media = {
      generateImage: vi.fn().mockResolvedValue(created),
      getTask: vi.fn().mockResolvedValue(completed),
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    };
    const webview = createWebview();
    const bridge = new MediaTurnBridge({
      platform: { media } as never,
      mediaDeliveryHost: {
        createTaskView: vi.fn(async (_webview: vscode.Webview, task: MediaTask) => ({
          id: task.id,
          type: 'image',
          status: task.status,
          progress: task.progress,
          providerId: task.providerId,
          modelId: task.modelId,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          request: { prompt: task.request.prompt },
        })),
      } as never,
      taskResultObservations: { handleTerminalTask },
    });

    await bridge.execute({
      webview,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'openai', modelId: 'gpt-image-1', category: 'image' },
    });

    expect(handleTerminalTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        status: 'completed',
        lifecycle: expect.objectContaining({ ownerConversationId: 'conv-1' }),
      }),
      { source: 'media-task' },
    );
  });

  it('passes saved generated asset resource refs to direct task-result observations', async () => {
    const created = createMediaTask({ status: 'pending', progress: 0 });
    const completed = createMediaTask({ status: 'completed', progress: 100 });
    const localPath = '/workspace/neko/generated/image/asset-1.png';
    const asset = createGeneratedImageAsset(localPath);
    const handleTerminalTask = vi.fn(async () => undefined);
    const media = {
      generateImage: vi.fn().mockResolvedValue(created),
      getTask: vi.fn().mockResolvedValue(completed),
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    };
    const webview = createWebview();
    const bridge = new MediaTurnBridge({
      platform: { media } as never,
      mediaDeliveryHost: {
        createTaskView: vi.fn(async (_webview: vscode.Webview, task: MediaTask) => ({
          id: task.id,
          type: 'image',
          status: task.status,
          progress: task.progress,
          providerId: task.providerId,
          modelId: task.modelId,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          request: { prompt: task.request.prompt },
        })),
        createTaskViewDelivery: vi.fn(async (_webview: vscode.Webview, task: MediaTask) => ({
          view: {
            id: task.id,
            type: 'image',
            status: task.status,
            progress: task.progress,
            providerId: task.providerId,
            modelId: task.modelId,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            request: { prompt: task.request.prompt },
          },
          deliveryPlan: {
            resultUrls: ['generated-assets/asset-1.png'],
            thumbnailUrl: 'generated-assets/asset-1.png',
            hostOutputPaths: [localPath],
            generatedAssets: [asset],
            shouldPersistResultUrls: true,
            shouldUnsubscribe: true,
          },
        })),
      } as never,
      taskResultObservations: { handleTerminalTask },
    });

    await bridge.execute({
      webview,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'openai', modelId: 'gpt-image-1', category: 'image' },
    });

    const observedTask = handleTerminalTask.mock.calls[0]?.[0] as Task;
    const data = observedTask.output?.data as {
      readonly assets?: readonly Array<Record<string, unknown>>;
      readonly hostOutputPaths?: readonly string[];
    };
    expect(data.hostOutputPaths).toEqual([localPath]);
    expect(data.assets?.[0]).toMatchObject({
      id: 'asset-1',
      localPath,
      resourceRef: {
        provider: 'generated-asset',
        kind: 'generated',
        source: {
          kind: 'generated-asset',
          generatedAssetId: 'asset-1',
          metadata: { contentDigest: 'sha256:image', mimeType: 'image/png' },
        },
      },
    });
  });

  it('keeps direct generation independent from legacy Board routing', async () => {
    const created = createMediaTask({ status: 'pending', progress: 0 });
    const completed = createMediaTask({ status: 'completed', progress: 100 });
    const asset = createGeneratedImageAsset('/workspace/neko/generated/image/asset-1.png');
    const generateImage = vi.fn().mockResolvedValue(created);
    const bridge = new MediaTurnBridge({
      platform: {
        media: {
          generateImage,
          getTask: vi.fn().mockResolvedValue(completed),
          onProgress: vi.fn().mockReturnValue(vi.fn()),
        },
      } as never,
      mediaDeliveryHost: {
        createTaskView: vi.fn(async (_webview: vscode.Webview, task: MediaTask) => ({
          id: task.id,
          type: 'image',
          status: task.status,
          progress: task.progress,
          providerId: task.providerId,
          modelId: task.modelId,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          request: { prompt: task.request.prompt },
        })),
        createTaskViewDelivery: vi.fn(async (_webview: vscode.Webview, task: MediaTask) => ({
          view: {
            id: task.id,
            type: 'image',
            status: task.status,
            progress: task.progress,
            providerId: task.providerId,
            modelId: task.modelId,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            request: { prompt: task.request.prompt },
          },
          deliveryPlan: {
            resultUrls: ['generated-assets/asset-1.png'],
            hostOutputPaths: [asset.path],
            generatedAssets: [asset],
            shouldPersistResultUrls: true,
            shouldUnsubscribe: true,
          },
        })),
      } as never,
      generateMessageId: () => 'run:1',
    });

    await bridge.execute({
      webview: createWebview(),
      conversationId: 'conv-1',
      prompt: 'generate a cat image',
      mediaModel: { providerId: 'openai', modelId: 'gpt-image-1', category: 'image' },
    });

    expect(generateImage).toHaveBeenCalledOnce();
    expect(JSON.stringify(bridge)).not.toContain('canvasBoardWork');
  });
});

function createWebview(): vscode.Webview & {
  postMessage: ReturnType<typeof vi.fn>;
} {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: { toString(): string }) => uri),
  } as unknown as vscode.Webview & { postMessage: ReturnType<typeof vi.fn> };
}

function createMediaTask(input: {
  readonly status: MediaTask['status'];
  readonly progress: number;
}): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    scope: taskScope('task-1'),
    id: 'task-1',
    type: 'text-to-image',
    status: input.status,
    progress: input.progress,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    createdAt: now,
    updatedAt: now,
    request: {
      prompt: 'cat',
      metadata: { conversationId: 'conv-1', runId: 'run-1', runStartedAt: 101 },
    },
    outputs:
      input.status === 'completed'
        ? [{ type: 'image', url: 'https://example.test/image.png', mimeType: 'image/png' }]
        : [],
  };
}

function taskScope(childRunId: string) {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task' as const,
  };
}

function createGeneratedImageAsset(localPath: string): GeneratedAsset {
  return {
    id: 'asset-1',
    type: 'generated-image',
    path: localPath,
    mimeType: 'image/png',
    generatedAt: '2026-01-01T00:00:00.000Z',
    prompt: 'cat',
    model: 'gpt-image-1',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    assetRef: {
      assetId: 'asset-1',
      uri: 'generated-assets/asset-1.png',
      mimeType: 'image/png',
    },
    lifecycle: createGeneratedAssetRevisionRef({
      assetId: 'asset-1',
      contentDigest: 'sha256:image',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: {
        taskId: 'task-1',
        runId: 'run-1',
        providerId: 'openai',
        modelId: 'gpt-image-1',
      },
    }),
  };
}

function resourceRef(id: string): ResourceRef {
  return {
    id: `preview:${id}`,
    scope: 'project',
    provider: 'preview-asset',
    kind: 'preview',
    source: { kind: 'preview-asset', previewAssetId: id },
    locator: { kind: 'preview-asset', assetId: id },
    fingerprint: { strategy: 'provider', value: `preview:${id}` },
  };
}
