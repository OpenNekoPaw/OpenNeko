import { describe, expect, it } from 'vitest';
import {
  buildGeneratedMediaAssets,
  computeAspectRatioLabel,
  createStableGeneratedOutputId,
  inferGeneratedMediaMimeType,
  toStableGeneratedAssetUri,
} from '../media-generated-asset';

describe('media generated asset helpers', () => {
  it('infers media mime types from file extensions', () => {
    expect(inferGeneratedMediaMimeType('/tmp/a.png')).toBe('image/png');
    expect(inferGeneratedMediaMimeType('/tmp/a.mp4')).toBe('video/mp4');
    expect(inferGeneratedMediaMimeType('/tmp/a.unknown')).toBe('application/octet-stream');
  });

  it('computes simplified aspect ratio labels', () => {
    expect(computeAspectRatioLabel(1920, 1080)).toBe('16:9');
    expect(computeAspectRatioLabel(1024, 1024)).toBe('1:1');
  });

  it('builds generated image assets with lineage metadata', () => {
    const assetId = createStableGeneratedOutputId('task-1', 0, 'sha256:image');
    expect(
      buildGeneratedMediaAssets({
        hostOutputPaths: ['/tmp/image.png'],
        contentDigests: ['sha256:image'],
        taskId: 'task-1',
        providerId: 'openai',
        outputs: [
          { type: 'image', url: 'https://example.test/image.png', width: 768, height: 512 },
        ],
        taskType: 'image',
        prompt: 'A cat',
        model: 'flux',
        request: {
          operation: 'generate',
          metadata: {
            runId: 'run-1',
            workflowId: 'workflow-1',
            workflowStageId: 'shot-generation',
            sourceNodeId: 'node-1',
            characterIds: ['char-1', ''],
          },
        },
        now: () => '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual([
      {
        id: assetId,
        path: '/tmp/image.png',
        mimeType: 'image/png',
        generatedAt: '2026-01-01T00:00:00.000Z',
        prompt: 'A cat',
        model: 'flux',
        sourceNodeId: 'node-1',
        characterIds: ['char-1'],
        lifecycle: expect.objectContaining({
          assetId,
          contentDigest: 'sha256:image',
          mediaKind: 'image',
          generation: {
            taskId: 'task-1',
            runId: 'run-1',
            operationId: 'generate',
            providerId: 'openai',
            modelId: 'flux',
            workflowStage: { workflowId: 'workflow-1', stageId: 'shot-generation' },
          },
        }),
        assetRef: {
          assetId,
          uri: `generated-assets/${assetId}.png`,
          mimeType: 'image/png',
        },
        type: 'generated-image',
        width: 768,
        height: 512,
        ratio: '3:2',
      },
    ]);
  });

  it('builds generated video and audio assets with safe defaults', () => {
    expect(
      buildGeneratedMediaAssets({
        hostOutputPaths: ['/tmp/video.mp4'],
        contentDigests: ['sha256:video'],
        taskId: 'task-video',
        outputs: [{ type: 'video', url: 'https://example.test/video.mp4' }],
        taskType: 'video',
        now: () => '2026-01-01T00:00:00.000Z',
      })[0],
    ).toEqual(
      expect.objectContaining({
        type: 'generated-video',
        width: 1280,
        height: 720,
        duration: 0,
        fps: 24,
      }),
    );

    expect(
      buildGeneratedMediaAssets({
        hostOutputPaths: ['/tmp/audio.mp3'],
        contentDigests: ['sha256:audio'],
        taskId: 'task-audio',
        outputs: [{ type: 'audio', url: 'https://example.test/audio.mp3' }],
        taskType: 'audio',
        now: () => '2026-01-01T00:00:00.000Z',
      })[0],
    ).toEqual(
      expect.objectContaining({
        type: 'generated-audio',
        duration: 0,
        sampleRate: 44100,
        channels: 2,
      }),
    );
  });

  it('normalizes generated asset paths through one stable URI helper', () => {
    expect(toStableGeneratedAssetUri('/repo/.neko/.cache/generated/image.png')).toBe(
      'generated-assets/image.png',
    );
    expect(toStableGeneratedAssetUri('/repo/.neko/.cache/generated/image.png', 'asset-1')).toBe(
      'generated-assets/asset-1.png',
    );
    expect(toStableGeneratedAssetUri('/repo/.neko/generated/image.png')).toBe(
      'generated-assets/image.png',
    );
    expect(toStableGeneratedAssetUri('/tmp/image.png')).toBe('generated-assets/image.png');
  });
});
