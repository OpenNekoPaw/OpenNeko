import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type PerceptionEvidenceEntry,
} from '@neko/shared';
import type {
  MediaProbePort,
  PerceptionClientPort,
  PerceptionPipelinePorts,
  PerceptualAssetPort,
  PerceptualAssetResolverPort,
} from '../contracts';
import { PerceptionPipeline } from '../perception-pipeline';
import { PerceptionPolicyResolver } from '../perception-policy-resolver';
import { PerceiveTool } from '../perceive-tool';

describe('PerceptionPolicyResolver', () => {
  it('selects completion/reference/demand timing from context', () => {
    const resolver = new PerceptionPolicyResolver();

    expect(
      resolver.resolve({
        isWorkflow: true,
        hasNextStep: true,
        modality: 'image',
        userExplicitRequest: false,
      }),
    ).toMatchObject({ timing: 'on-completion', layers: [0, 1] });
    expect(
      resolver.resolve({
        isWorkflow: true,
        hasNextStep: false,
        modality: 'video',
        userExplicitRequest: false,
      }),
    ).toMatchObject({ timing: 'on-reference', layers: [0, 1] });
    expect(
      resolver.resolve({
        isWorkflow: false,
        hasNextStep: false,
        modality: 'audio',
        userExplicitRequest: true,
      }),
    ).toMatchObject({ timing: 'on-completion', layers: [0, 1, 2] });
  });
});

describe('PerceptionPipeline', () => {
  it('creates Layer 0 image cards through host-independent ports', async () => {
    const ports = createPorts({ modality: 'image', probe: { width: 640, height: 360 } });
    const pipeline = new PerceptionPipeline(ports, { now: () => 10 });

    const result = await pipeline.perceive({
      asset: { assetId: 'asset-1' },
      policy: { timing: 'on-completion', layers: [0], reason: 'test' },
    });

    expect(ports.resolver.resolve).toHaveBeenCalledWith({ assetId: 'asset-1' });
    expect(ports.mediaProbe.probe).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'asset-1', resolvedPath: '/tmp/asset-1' }),
    );
    expect(result.card).toMatchObject({
      version: 1,
      assetId: 'asset-1',
      modality: 'image',
      layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
      structural: {
        format: 'png',
        mimeType: 'image/png',
        byteSize: 10,
        width: 640,
        height: 360,
      },
    });
  });

  it('records video and audio structural metadata', async () => {
    const video = await new PerceptionPipeline(
      createPorts({
        modality: 'video',
        mimeType: 'video/mp4',
        probe: { format: 'mp4', durationMs: 1200, frameRate: 24 },
      }),
      { now: () => 10 },
    ).perceive({
      asset: { assetId: 'video-1' },
      policy: { timing: 'on-completion', layers: [0], reason: 'test' },
    });
    const audio = await new PerceptionPipeline(
      createPorts({
        modality: 'audio',
        mimeType: 'audio/wav',
        probe: { format: 'wav', durationMs: 900, channels: 2, sampleRate: 48000 },
      }),
      { now: () => 11 },
    ).perceive({
      asset: { assetId: 'audio-1' },
      policy: { timing: 'on-completion', layers: [0], reason: 'test' },
    });

    expect(video.card.structural).toMatchObject({ durationMs: 1200, frameRate: 24 });
    expect(audio.card.structural).toMatchObject({
      durationMs: 900,
      channels: 2,
      sampleRate: 48000,
    });
  });

  it('composes Layer 1 evidence without card-level confidence', async () => {
    const pipeline = new PerceptionPipeline(
      createPorts({
        modality: 'video',
        perceptionClient: {
          describe: vi.fn(
            async () =>
              ({
                kind: 'description',
                confidence: 0.9,
                value: 'A rainy street.',
              }) satisfies PerceptionEvidenceEntry,
          ),
          transcribe: vi.fn(
            async () =>
              ({
                kind: 'transcript',
                confidence: 0.8,
                value: 'ambient rain',
              }) satisfies PerceptionEvidenceEntry,
          ),
          detectShots: vi.fn(
            async () =>
              ({
                kind: 'shot-boundaries',
                confidence: 0.7,
                value: [{ startMs: 0, endMs: 1000 }],
              }) satisfies PerceptionEvidenceEntry,
          ),
        },
      }),
      { now: () => 12 },
    );

    const result = await pipeline.perceive({
      asset: { assetId: 'video-1' },
      policy: { timing: 'on-completion', layers: [0, 1], reason: 'test' },
    });

    expect(result.card.layerStatus.layer1).toBe('complete');
    expect(result.card.semantic?.evidences).toEqual([
      expect.objectContaining({ kind: 'description', confidence: 0.9 }),
      expect.objectContaining({ kind: 'transcript', confidence: 0.8 }),
      expect.objectContaining({ kind: 'shot-boundaries', confidence: 0.7 }),
    ]);
    expect(result.card).not.toHaveProperty('confidence');
  });

  it('preserves perception client method receiver context', async () => {
    class ReceiverBoundClient implements PerceptionClientPort {
      private readonly label = 'receiver-bound visual evidence';

      async describe(): Promise<PerceptionEvidenceEntry> {
        return {
          kind: 'description',
          confidence: 0.9,
          value: this.label,
        };
      }
    }

    const pipeline = new PerceptionPipeline(
      createPorts({
        modality: 'image',
        perceptionClient: new ReceiverBoundClient(),
      }),
      { now: () => 12 },
    );

    const result = await pipeline.perceive({
      asset: { assetId: 'image-1' },
      policy: { timing: 'on-demand', layers: [0, 1], reason: 'test' },
    });

    expect(result.card.semantic?.evidences).toEqual([
      expect.objectContaining({ value: 'receiver-bound visual evidence' }),
    ]);
  });

  it('adds Layer 2 perceptual refs and emits backfill through sink', async () => {
    const applyBackfill = vi.fn();
    const pipeline = new PerceptionPipeline(
      createPorts({
        modality: 'video',
        perceptualAsset: {
          createThumbnail: vi.fn(async () => ({
            assetId: 'thumb-1',
            uri: '${WORKSPACE}/thumb.png',
            mimeType: 'image/png',
          })),
          extractKeyframes: vi.fn(async () => [
            {
              assetId: 'key-1',
              uri: '${WORKSPACE}/key-1.png',
              mimeType: 'image/png',
              timestampMs: 0,
            },
          ]),
        },
        backfillSink: { applyBackfill },
      }),
      { now: () => 13 },
    );

    const result = await pipeline.perceive({
      asset: { assetId: 'video-1' },
      sourceToolCallId: 'call-1',
      policy: { timing: 'on-demand', layers: [0, 1, 2], reason: 'test' },
    });

    expect(result.card.perceptual).toMatchObject({
      thumbnailRef: { assetId: 'thumb-1' },
      keyframeRefs: [expect.objectContaining({ assetId: 'key-1' })],
    });
    expect(applyBackfill).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: 'call-1',
        perceptionCards: [result.card],
      }),
    );
  });

  it('marks low-confidence evidence with retry diagnostics', async () => {
    const describe = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'description', confidence: 0.2, value: 'unclear' })
      .mockResolvedValueOnce({ kind: 'description', confidence: 0.3, value: 'still unclear' });
    const pipeline = new PerceptionPipeline(
      createPorts({
        modality: 'image',
        perceptionClient: { describe },
      }),
      { now: () => 14, retryPolicy: { minConfidence: 0.5, maxRetries: 1 } },
    );

    const result = await pipeline.perceive({
      asset: { assetId: 'asset-1' },
      policy: { timing: 'on-demand', layers: [0, 1], reason: 'test' },
    });

    expect(describe).toHaveBeenCalledTimes(2);
    expect(result.card.semantic?.evidences[0]).toEqual(
      expect.objectContaining({
        confidence: 0.3,
        diagnostics: expect.objectContaining({
          retryCount: 1,
          retryReason: 'low-confidence',
        }),
      }),
    );
  });

  it('keeps successful Layer 1 evidence when another client method fails', async () => {
    const pipeline = new PerceptionPipeline(
      createPorts({
        modality: 'video',
        perceptionClient: {
          describe: vi.fn(async () => {
            throw new Error('describe failed');
          }),
          transcribe: vi.fn(
            async () =>
              ({
                kind: 'transcript',
                confidence: 0.8,
                value: 'usable transcript',
              }) satisfies PerceptionEvidenceEntry,
          ),
          detectShots: vi.fn(
            async () =>
              ({
                kind: 'shot-boundaries',
                confidence: 0.7,
                value: [{ startMs: 0, endMs: 1000 }],
              }) satisfies PerceptionEvidenceEntry,
          ),
        },
      }),
      { now: () => 15 },
    );

    const result = await pipeline.perceive({
      asset: { assetId: 'video-1' },
      policy: { timing: 'on-completion', layers: [0, 1], reason: 'test' },
    });

    expect(result.card.layerStatus.layer1).toBe('complete');
    expect(result.card.semantic?.evidences).toEqual([
      expect.objectContaining({ kind: 'transcript' }),
      expect.objectContaining({ kind: 'shot-boundaries' }),
    ]);
  });

  it('fails visibly when every Layer 1 client method rejects', async () => {
    const pipeline = new PerceptionPipeline(
      createPorts({
        modality: 'image',
        perceptionClient: {
          describe: vi.fn(async () => {
            throw new Error('image understanding model is not configured');
          }),
        },
      }),
      { now: () => 16 },
    );

    await expect(
      pipeline.perceive({
        asset: { assetId: 'image-1' },
        policy: { timing: 'on-demand', layers: [0, 1], reason: 'test' },
      }),
    ).rejects.toThrow('image understanding model is not configured');
  });

  it('keeps successful Layer 2 refs when another derived asset method fails', async () => {
    const pipeline = new PerceptionPipeline(
      createPorts({
        modality: 'video',
        perceptualAsset: {
          createThumbnail: vi.fn(async () => {
            throw new Error('thumbnail failed');
          }),
          extractKeyframes: vi.fn(async () => [
            {
              assetId: 'key-1',
              uri: '${WORKSPACE}/key-1.png',
              mimeType: 'image/png',
            },
          ]),
        },
      }),
      { now: () => 17 },
    );

    const result = await pipeline.perceive({
      asset: { assetId: 'video-1' },
      policy: { timing: 'on-demand', layers: [0, 2], reason: 'test' },
    });

    expect(result.card.layerStatus.layer2).toBe('complete');
    expect(result.card.perceptual).toEqual({
      keyframeRefs: [expect.objectContaining({ assetId: 'key-1' })],
    });
  });

  it('keeps original provider-loadable video refs for native video understanding', async () => {
    const pipeline = new PerceptionPipeline(createPorts({ modality: 'video' }), { now: () => 18 });

    const result = await pipeline.perceive({
      asset: {
        assetId: 'video-1',
        ref: {
          assetId: 'video-1',
          uri: '${WORKSPACE}/scene.mp4',
          mimeType: 'video/mp4',
        },
      },
      policy: { timing: 'on-demand', layers: [0, 2], reason: 'test' },
    });

    expect(result.card.layerStatus.layer2).toBe('complete');
    expect(result.card.perceptual).toEqual({
      multiViewRefs: [
        {
          assetId: 'video-1',
          uri: '${WORKSPACE}/scene.mp4',
          mimeType: 'video/mp4',
        },
      ],
    });
  });

  it('keeps original provider-loadable image refs for native image understanding', async () => {
    const pipeline = new PerceptionPipeline(
      createPorts({ modality: 'image', mimeType: 'image/png' }),
      { now: () => 19 },
    );

    const result = await pipeline.perceive({
      asset: {
        assetId: 'image-1',
        ref: {
          assetId: 'image-1',
          uri: '${WORKSPACE}/frame.png',
          mimeType: 'image/png',
        },
      },
      policy: { timing: 'on-demand', layers: [0, 2], reason: 'test' },
    });

    expect(result.card.layerStatus.layer2).toBe('complete');
    expect(result.card.perceptual).toEqual({
      thumbnailRef: {
        assetId: 'image-1',
        uri: '${WORKSPACE}/frame.png',
        mimeType: 'image/png',
      },
    });
  });
});

describe('PerceiveTool', () => {
  it('orchestrates aggregate on-demand perception', async () => {
    const pipeline = {
      perceive: vi.fn(async () => ({
        card: {
          version: 1 as const,
          assetId: 'asset-1',
          modality: 'image' as const,
          createdAt: 1,
          layerStatus: {
            layer0: 'complete' as const,
            layer1: 'complete' as const,
            layer2: 'skipped' as const,
          },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      })),
    };
    const tool = new PerceiveTool({ pipeline, now: () => 20 });

    const result = await tool.execute({
      assetId: 'asset-1',
      depth: 1,
      focus: 'visual',
      ref: {
        assetId: 'asset-1',
        uri: '${WORKSPACE}/asset.png',
        mimeType: 'image/png',
      },
    });

    expect(pipeline.perceive).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: {
          assetId: 'asset-1',
          ref: {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/asset.png',
            mimeType: 'image/png',
          },
        },
        focus: 'visual',
        policy: expect.objectContaining({ timing: 'on-demand', layers: [0, 1] }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        perceptionCards: [expect.objectContaining({ assetId: 'asset-1' })],
      }),
    );
  });

  it('preserves a canonical content locator in an explicit perception ref', async () => {
    const pipeline = {
      perceive: vi.fn(async () => ({
        card: {
          version: 1 as const,
          assetId: 'asset-1',
          modality: 'image' as const,
          createdAt: 1,
          layerStatus: {
            layer0: 'complete' as const,
            layer1: 'complete' as const,
            layer2: 'skipped' as const,
          },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      })),
    };
    const tool = new PerceiveTool({ pipeline, now: () => 20 });
    const contentLocator = {
      kind: 'document-entry',
      source: { kind: 'workspace-file', path: 'book.epub' },
      entryPath: 'OPS/images/page.png',
    };

    await tool.execute({
      assetId: 'asset-1',
      depth: 1,
      ref: {
        assetId: 'asset-1',
        uri: 'content:document-entry',
        mimeType: 'image/png',
        contentLocator,
      },
    });

    expect(pipeline.perceive).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: {
          assetId: 'asset-1',
          ref: expect.objectContaining({ contentLocator }),
        },
      }),
    );
  });

  it('rejects model-authored understanding model overrides', async () => {
    const pipeline = {
      perceive: vi.fn(async () => ({
        card: {
          version: 1 as const,
          assetId: 'asset-1',
          modality: 'image' as const,
          createdAt: 1,
          layerStatus: {
            layer0: 'complete' as const,
            layer1: 'complete' as const,
            layer2: 'skipped' as const,
          },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      })),
    };
    const tool = new PerceiveTool({ pipeline, now: () => 20 });

    await expect(
      tool.execute({
        assetId: 'asset-1',
        depth: 1,
        options: {
          understandingModels: {
            image: { providerId: 'google', modelId: 'gemini-image-understand' },
          },
        },
      }),
    ).rejects.toThrow('legacy-perception-model-override-rejected');
    expect(pipeline.perceive).not.toHaveBeenCalled();
  });

  it('rejects legacy runtime metadata understanding model overrides', async () => {
    const pipeline = {
      perceive: vi.fn(async () => ({
        card: {
          version: 1 as const,
          assetId: 'asset-1',
          modality: 'image' as const,
          createdAt: 1,
          layerStatus: {
            layer0: 'complete' as const,
            layer1: 'complete' as const,
            layer2: 'skipped' as const,
          },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      })),
    };
    const tool = new PerceiveTool({ pipeline, now: () => 20 });

    await expect(
      tool.execute(
        {
          assetId: 'asset-1',
          depth: 1,
        },
        {
          metadata: {
            understandingModels: {
              image: { providerId: 'google', modelId: 'gemini-image-understand' },
            },
          },
        },
      ),
    ).rejects.toThrow('legacy-perception-model-override-rejected');
    expect(pipeline.perceive).not.toHaveBeenCalled();
  });

  it('preserves unified ResourceRef identity in explicit perception refs', async () => {
    const pipeline = {
      perceive: vi.fn(async () => ({
        card: {
          version: 1 as const,
          assetId: 'asset-1',
          modality: 'image' as const,
          createdAt: 1,
          layerStatus: {
            layer0: 'complete' as const,
            layer1: 'complete' as const,
            layer2: 'skipped' as const,
          },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      })),
    };
    const resourceRef = createResourceRef({
      id: 'res-generated-1',
      scope: 'project',
      provider: 'generated-asset',
      kind: 'generated',
      source: {
        kind: 'generated-asset',
        generatedAssetId: 'generated-1',
        filePath: '${WORKSPACE}/neko/generated/image/task_1_0.png',
      },
      locator: { kind: 'generated-asset', assetId: 'generated-1' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'generated-1',
        providerId: 'generated-asset',
      }),
    });
    const tool = new PerceiveTool({ pipeline, now: () => 20 });

    await tool.execute({
      assetId: 'asset-1',
      depth: 1,
      ref: {
        assetId: 'asset-1',
        uri: 'generated-assets/non-existent-display-label.png',
        mimeType: 'image/png',
        resourceRef,
      },
    });

    expect(pipeline.perceive).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: {
          assetId: 'asset-1',
          ref: expect.objectContaining({ resourceRef }),
        },
      }),
    );
  });

  it('accepts explicit refs when a model includes an incomplete resourceRef hint', async () => {
    const pipeline = {
      perceive: vi.fn(async () => ({
        card: {
          version: 1 as const,
          assetId: 'generated-1',
          modality: 'image' as const,
          createdAt: 1,
          layerStatus: {
            layer0: 'complete' as const,
            layer1: 'complete' as const,
            layer2: 'skipped' as const,
          },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      })),
    };
    const tool = new PerceiveTool({ pipeline, now: () => 20 });

    const result = await tool.execute({
      assetId: 'generated-1',
      depth: 1,
      ref: {
        assetId: 'generated-1',
        uri: 'neko/generated/image/task_1_0.png',
        mimeType: 'image/png',
        resourceRef: {
          kind: 'generated',
          source: { kind: 'generated-asset', generatedAssetId: 'generated-1' },
          locator: { kind: 'generated-asset', assetId: 'generated-1' },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(pipeline.perceive).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: {
          assetId: 'generated-1',
          ref: {
            assetId: 'generated-1',
            uri: 'neko/generated/image/task_1_0.png',
            mimeType: 'image/png',
          },
        },
      }),
    );
  });
});

function createPorts(input: {
  readonly modality: 'image' | 'video' | 'audio' | 'data';
  readonly mimeType?: string;
  readonly probe?: Partial<Awaited<ReturnType<MediaProbePort['probe']>>>;
  readonly perceptionClient?: PerceptionClientPort;
  readonly perceptualAsset?: PerceptualAssetPort;
  readonly backfillSink?: PerceptionPipelinePorts['backfillSink'];
}): PerceptionPipelinePorts & {
  readonly resolver: PerceptualAssetResolverPort & { resolve: ReturnType<typeof vi.fn> };
  readonly mediaProbe: MediaProbePort & { probe: ReturnType<typeof vi.fn> };
} {
  const mimeType = input.mimeType ?? `${input.modality}/png`;
  return {
    resolver: {
      resolve: vi.fn(async (selector) => ({
        assetId: selector.assetId,
        ...(selector.ref ? { ref: selector.ref, uri: selector.ref.uri } : {}),
        modality: input.modality,
        mimeType,
        resolvedPath: `/tmp/${selector.assetId}`,
        cacheKey: `cache:${selector.assetId}`,
      })),
    },
    mediaProbe: {
      probe: vi.fn(async () => ({
        format: input.probe?.format ?? 'png',
        mimeType,
        byteSize: 10,
        ...input.probe,
      })),
    },
    ...(input.perceptionClient ? { perceptionClient: input.perceptionClient } : {}),
    ...(input.perceptualAsset ? { perceptualAsset: input.perceptualAsset } : {}),
    ...(input.backfillSink ? { backfillSink: input.backfillSink } : {}),
  };
}
