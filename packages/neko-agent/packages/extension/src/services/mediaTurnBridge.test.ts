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
    const deliverBatch = vi.fn(async () => [
      {
        version: 2 as const,
        deliveryId: 'generated-output-batch:1',
        status: 'projected' as const,
        nodeIds: ['generated-node-1'],
        diagnostics: [],
      },
    ]);
    const projection = createConversationProjectionStore('conv-1');
    const checkpointExternalTurn = vi.fn(async () => undefined);
    const projectedItems: Record<string, unknown>[] = [];
    projection.subscribe((patch) => {
      for (const operation of patch.operations) {
        if (operation.operation === 'snapshot' && operation.item.kind === 'tool_call') {
          const progress = operation.item.payload.progress?.data;
          if (isGenerationJobProjection(progress)) projectedItems.push(progress);
        }
      }
    });
    const bridge = new MediaTurnBridge({
      generationJobs: jobs,
      resolveGenerationResult,
      getConversationProjection: () => projection,
      workspaceBoardProjection: { deliverBatch },
      checkpointExternalTurn,
      now: () => 100,
    });

    await bridge.execute({
      webview: {} as never,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
      userMessage: { id: 'user-1', content: 'cat', timestamp: 10 },
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
    expect(resolveGenerationResult).toHaveBeenCalledWith(asset.lifecycle?.contentLocator);
    expect(projectedItems).toMatchObject([
      { kind: 'generation-job', jobId: 'generation-1', revision: 1, phase: 'pending' },
      { kind: 'generation-job', jobId: 'generation-1', revision: 2, phase: 'running' },
      { kind: 'generation-job', jobId: 'generation-1', revision: 3, phase: 'succeeded' },
    ]);
    expect(deliverBatch).toHaveBeenCalledOnce();
    expect(checkpointExternalTurn).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      turnId: 'direct-media:generation-1',
      terminalState: 'completed',
      messages: [
        {
          role: 'user',
          content: 'cat',
          timestamp: 10,
        },
        expect.objectContaining({
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'generation-1',
              name: 'GenerateImage',
              arguments: {
                prompt: 'cat',
                providerId: 'image-provider',
                modelId: 'image-model',
              },
            },
          ],
          stopReason: 'toolUse',
        }),
        {
          role: 'toolResult',
          toolCallId: 'generation-1',
          toolName: 'GenerateImage',
          content: [{ type: 'text', text: 'Image generation completed.' }],
          details: {
            generationJob: expect.objectContaining({
              jobId: 'generation-1',
              phase: 'succeeded',
            }),
            outputs: [
              {
                type: 'image',
                contentLocator: asset.lifecycle?.contentLocator,
              },
            ],
            boardDelivery: {
              status: 'projected',
              nodeIds: ['generated-node-1'],
              diagnostics: [],
            },
          },
          isError: false,
          timestamp: 100,
        },
      ],
    });
    expect(projection.snapshot()).toMatchObject({
      conversationId: 'conv-1',
      projectionVersion: 3,
      turns: [
        {
          completion: { status: 'completed', completedAt: 100 },
          items: [
            {
              kind: 'tool_call',
              status: 'succeeded',
              payload: {
                displayName: 'Image generation',
                toolCall: {
                  name: 'GenerateImage',
                  arguments: {
                    prompt: 'cat',
                    providerId: 'image-provider',
                    modelId: 'image-model',
                  },
                  result: {
                    success: true,
                    data: {
                      generationJob: {
                        jobId: 'generation-1',
                        revision: 3,
                        phase: 'succeeded',
                        stage: 'completed',
                        percent: 100,
                      },
                      outputs: [
                        {
                          type: 'image',
                          contentLocator: asset.lifecycle?.contentLocator,
                        },
                      ],
                      boardDelivery: {
                        status: 'projected',
                        nodeIds: ['generated-node-1'],
                        diagnostics: [],
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    });
  });

  it('keeps local success visible and reports a blocked Workspace Board delivery', async () => {
    const asset = generatedImage();
    const projection = createConversationProjectionStore('conv-1');
    const bridge = new MediaTurnBridge({
      generationJobs: createGenerationJobs(),
      resolveGenerationResult: () => ({ path: asset.path, asset }),
      getConversationProjection: () => projection,
      workspaceBoardProjection: {
        deliverBatch: vi.fn(async () => [
          {
            version: 2,
            status: 'blocked',
            diagnostics: [
              {
                code: 'workspace-required',
                severity: 'error',
                message: 'Canvas delivery requires one resolved workspace.',
              },
            ],
          },
        ]),
      },
      checkpointExternalTurn: vi.fn(async () => undefined),
    });

    await bridge.execute({
      webview: {} as never,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
      userMessage: { id: 'user-1', content: 'cat', timestamp: 10 },
    });

    expect(projection.snapshot().turns[0]?.items[0]).toMatchObject({
      status: 'succeeded',
      payload: {
        toolCall: {
          result: {
            success: true,
            data: {
              boardDelivery: {
                status: 'blocked',
                diagnostics: [
                  {
                    code: 'workspace-required',
                    message: 'Canvas delivery requires one resolved workspace.',
                  },
                ],
              },
            },
          },
        },
      },
    });
  });

  it('submits generated resources to the Workspace Board after durable delivery', async () => {
    const asset = generatedImage();
    const deliverBatch = vi.fn(async () => [
      {
        version: 2 as const,
        deliveryId: 'generated-output-batch:1',
        status: 'projected' as const,
        nodeIds: ['generated-node-1'],
        diagnostics: [],
      },
    ]);
    const bridge = new MediaTurnBridge({
      generationJobs: createGenerationJobs(),
      resolveGenerationResult: () => ({ path: asset.path, asset }),
      getConversationProjection: () => createConversationProjectionStore('conv-1'),
      workspaceBoardProjection: { deliverBatch },
      checkpointExternalTurn: vi.fn(async () => undefined),
    });

    await bridge.execute({
      webview: {} as never,
      conversationId: 'conv-1',
      prompt: 'cat',
      mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
      userMessage: { id: 'user-1', content: 'cat', timestamp: 10 },
    });

    expect(deliverBatch).toHaveBeenCalledOnce();
  });

  it('fails visibly when the Job, result, or Timeline owner is unavailable', async () => {
    const bridge = new MediaTurnBridge({
      workspaceBoardProjection: { deliverBatch: vi.fn() },
    });

    await expect(
      bridge.execute({
        webview: {} as never,
        conversationId: 'conv-1',
        prompt: 'cat',
        mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
        userMessage: { id: 'user-1', content: 'cat', timestamp: 10 },
      }),
    ).rejects.toThrow(
      'requires Generation Job, result resolver, Timeline projection, and Pi transcript owners',
    );
  });

  it('does not report a completed turn when the Pi transcript checkpoint fails', async () => {
    const asset = generatedImage();
    const projection = createConversationProjectionStore('conv-1');
    const bridge = new MediaTurnBridge({
      generationJobs: createGenerationJobs(),
      resolveGenerationResult: () => ({ path: asset.path, asset }),
      getConversationProjection: () => projection,
      workspaceBoardProjection: {
        deliverBatch: vi.fn(async () => [
          {
            version: 2,
            status: 'queued',
            diagnostics: [],
          },
        ]),
      },
      checkpointExternalTurn: vi.fn(async () => {
        throw new Error('checkpoint unavailable');
      }),
    });

    await expect(
      bridge.execute({
        webview: {} as never,
        conversationId: 'conv-1',
        prompt: 'cat',
        mediaModel: { providerId: 'image-provider', modelId: 'image-model', category: 'image' },
        userMessage: { id: 'user-1', content: 'cat', timestamp: 10 },
      }),
    ).rejects.toThrow('checkpoint unavailable');

    expect(projection.snapshot().turns[0]?.completion).toBeUndefined();
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
    resultLocators: [generatedImage().lifecycle!.contentLocator],
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
      contentPath: 'generated-assets/generated-1.png',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { operationId: 'operation-generated-1' },
    }),
    width: 1024,
    height: 1024,
    ratio: '1:1',
  };
}

function isGenerationJobProjection(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jobId' in value &&
    'revision' in value &&
    'phase' in value
  );
}
