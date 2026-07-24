import { describe, expect, it, vi } from 'vitest';
import { createConversationProjectionStore } from '@neko/agent/runtime';
import { createGeneratedAssetRevisionRef, type GeneratedAsset } from '@neko/shared';
import type {
  GenerationJobPort,
  GenerationJobSnapshot,
  SubmitGenerationJobInput,
} from '@neko/generation';

import { MediaTurnBridge } from './mediaTurnBridge';

describe('MediaTurnBridge', () => {
  it('waits for the terminal generation result, delivers it, and projects one completed turn', async () => {
    const jobs = createGenerationJobs();
    const asset = generatedImage();
    const resolveGenerationResult = vi.fn(() => ({ path: asset.path, asset }));
    const toWebviewMediaUri = vi.fn(() => 'webview://generated/image.png');
    const projection = createConversationProjectionStore('conv-1');
    const bridge = new MediaTurnBridge({
      generationJobs: jobs,
      resolveGenerationResult,
      mediaDeliveryHost: { toWebviewMediaUri },
      getConversationProjection: () => projection,
      now: () => 100,
    });

    await bridge.execute({
      webview: {} as never,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
    });

    expect(jobs.submitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'image-provider',
        modelId: 'image-model',
        generationType: 'text-to-image',
        request: expect.objectContaining({
          prompt: 'cat',
          providerId: 'image-provider',
          modelId: 'image-model',
          metadata: expect.objectContaining({
            operationId: expect.any(String),
            source: 'direct-media-webview',
            conversationId: 'conv-1',
          }),
        }),
      }),
    );
    expect(jobs.observeGeneration).toHaveBeenCalledWith(
      { kind: 'generation', jobId: 'generation-1' },
      1,
    );
    expect(resolveGenerationResult).toHaveBeenCalledWith(asset.lifecycle?.resourceRef);
    expect(toWebviewMediaUri).toHaveBeenCalledWith({}, asset.path);
    expect(projection.snapshot()).toMatchObject({
      conversationId: 'conv-1',
      projectionVersion: 3,
      turns: [
        {
          completion: { status: 'completed', completedAt: 100 },
          items: [
            {
              kind: 'assistant_text',
              status: 'complete',
              payload: {
                content: '[Generated image](webview://generated/image.png)',
                format: 'markdown',
              },
            },
          ],
        },
      ],
    });
  });

  it('submits generated resources to the Workspace Board after durable delivery', async () => {
    const asset = generatedImage();
    const deliverBatch = vi.fn(async () => []);
    const bridge = new MediaTurnBridge({
      generationJobs: createGenerationJobs(),
      resolveGenerationResult: () => ({ path: asset.path, asset }),
      mediaDeliveryHost: {
        toWebviewMediaUri: () => 'generated-assets/generated-1.png',
      },
      getConversationProjection: () => createConversationProjectionStore('conv-1'),
      workspaceBoardProjection: { deliverBatch },
    });

    await bridge.execute({
      webview: {} as never,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
    });

    expect(deliverBatch).toHaveBeenCalledOnce();
  });

  it('fails visibly when the Job, result, or Timeline owner is unavailable', async () => {
    const bridge = new MediaTurnBridge({
      mediaDeliveryHost: { toWebviewMediaUri: vi.fn() },
    });

    await expect(
      bridge.execute({
        webview: {} as never,
        conversationId: 'conv-1',
        prompt: 'cat',
        mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
      }),
    ).rejects.toThrow('requires Generation Job, result resolver, and Timeline projection owners');
  });
});

function createGenerationJobs(): GenerationJobPort {
  const ref = { kind: 'generation' as const, jobId: 'generation-1' };
  const request: SubmitGenerationJobInput = {
    lifecycleMode: 'linked',
    generationType: 'text-to-image',
    providerId: 'image-provider',
    modelId: 'image-model',
    request: {
      prompt: 'cat',
      providerId: 'image-provider',
      modelId: 'image-model',
    },
  };
  const initial: GenerationJobSnapshot = {
    ref,
    lifecycleMode: 'linked',
    phase: 'pending',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    request,
    progress: { stage: 'queued', percent: 0 },
  };
  const running: GenerationJobSnapshot = {
    ...initial,
    phase: 'running',
    revision: 2,
    updatedAt: 2,
    progress: { stage: 'waiting-provider', percent: 45 },
  };
  const terminal: GenerationJobSnapshot = {
    ...running,
    phase: 'succeeded',
    revision: 3,
    updatedAt: 3,
    progress: { stage: 'completed', percent: 100 },
    resultRefs: [generatedImage().lifecycle!.resourceRef],
  };
  return {
    submitGeneration: vi.fn(async () => initial),
    describeGeneration: vi.fn(async () => terminal),
    observeGeneration: vi.fn(async function* () {
      yield running;
      yield terminal;
    }),
    cancelGeneration: vi.fn(),
    retryGeneration: vi.fn(),
    reconcileGeneration: vi.fn(),
  };
}

function generatedImage(): GeneratedAsset {
  return {
    type: 'generated-image',
    id: 'generated-1',
    path: 'generated-assets/generated-1.png',
    mimeType: 'image/png',
    generatedAt: '2026-07-24T00:00:00.000Z',
    lifecycle: createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:generated-1',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { operationId: 'operation-generated-1' },
    }),
    width: 1024,
    height: 1024,
    ratio: '1:1',
  };
}
