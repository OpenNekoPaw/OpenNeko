import { describe, expect, it, vi } from 'vitest';
import {
  finalizeCompletedMediaTaskOutputs,
  getMediaTaskPrimaryOutputUrl,
} from '../media-task-result';
import { createStableGeneratedOutputId } from '../media-generated-asset';
import type { MediaTask } from '../types';

describe('media-task-result', () => {
  it('returns the first output URL as primary URL', () => {
    expect(
      getMediaTaskPrimaryOutputUrl({
        outputs: [
          { type: 'image', url: '' },
          { type: 'image', url: 'https://example.com/image.png' },
        ],
      }),
    ).toBe('https://example.com/image.png');
  });

  it('keeps remote outputs when task is not completed', async () => {
    const result = await finalizeCompletedMediaTaskOutputs({
      task: makeTask({ status: 'processing' }),
      taskType: 'image',
      outputDir: '/repo/.neko/.cache/generated',
      saveOutputs: vi.fn(),
      computeContentDigest: vi.fn().mockResolvedValue('sha256:image'),
    });

    expect(result.resultUrls).toEqual(['https://example.com/image.png']);
    expect(result.thumbnailUrl).toBe('https://example.com/image.png');
    expect(result.hostOutputPaths).toEqual([]);
    expect(result.generatedAssets).toEqual([]);
  });

  it('saves completed outputs and registers generated assets', async () => {
    const saveOutputs = vi.fn().mockResolvedValue(['/repo/.neko/.cache/generated/image.png']);
    const assetIndex = { add: vi.fn(), remove: vi.fn() };
    const task = makeTask({ status: 'completed' });
    const assetId = createStableGeneratedOutputId('task-1', 0, 'sha256:image');

    const result = await finalizeCompletedMediaTaskOutputs({
      task,
      taskType: 'image',
      outputDir: '/repo/.neko/.cache/generated',
      saveOutputs,
      assetIndex,
      computeContentDigest: vi.fn().mockResolvedValue('sha256:image'),
    });

    expect(saveOutputs).toHaveBeenCalledWith(task.scope, '/repo/.neko/.cache/generated', {
      transcodeFile: undefined,
    });
    expect(result.resultUrls).toEqual([`generated-assets/${assetId}.png`]);
    expect(result.thumbnailUrl).toBe(`generated-assets/${assetId}.png`);
    expect(result.hostOutputPaths).toEqual(['/repo/.neko/.cache/generated/image.png']);
    expect(result.generatedAssets).toHaveLength(1);
    expect(result.generatedAssets[0]?.assetRef).toEqual({
      assetId,
      uri: `generated-assets/${assetId}.png`,
      mimeType: 'image/png',
    });
    expect(assetIndex.add).toHaveBeenCalledWith(
      expect.objectContaining({
        id: assetId,
        path: '/repo/.neko/.cache/generated/image.png',
        type: 'generated-image',
        lifecycle: expect.objectContaining({
          assetId,
          contentDigest: 'sha256:image',
          generation: expect.objectContaining({ taskId: 'task-1', providerId: 'openai' }),
        }),
      }),
    );
  });

  it('fails visibly when completed outputs cannot be persisted', async () => {
    const warn = vi.fn();
    const assetIndex = { add: vi.fn(), remove: vi.fn() };

    await expect(
      finalizeCompletedMediaTaskOutputs({
        task: makeTask({ status: 'completed' }),
        taskType: 'image',
        outputDir: '/repo/neko/generated/image',
        saveOutputs: vi.fn().mockRejectedValue(new Error('download failed')),
        assetIndex,
        logger: { warn },
      }),
    ).rejects.toThrow('download failed');
    expect(warn).toHaveBeenCalled();
  });

  it('rolls back indexed entries when a later output cannot be indexed', async () => {
    const firstId = createStableGeneratedOutputId('task-1', 0, 'sha256:first');
    const assetIndex = {
      add: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('index failed')),
      remove: vi.fn().mockResolvedValue(true),
    };

    await expect(
      finalizeCompletedMediaTaskOutputs({
        task: makeTask({
          outputs: [
            { type: 'image', url: 'https://example.com/first.png' },
            { type: 'image', url: 'https://example.com/second.png' },
          ],
        }),
        taskType: 'image',
        outputDir: '/repo/neko/generated/image',
        saveOutputs: vi
          .fn()
          .mockResolvedValue([
            '/repo/neko/generated/image/first.png',
            '/repo/neko/generated/image/second.png',
          ]),
        assetIndex,
        computeContentDigest: vi
          .fn()
          .mockResolvedValueOnce('sha256:first')
          .mockResolvedValueOnce('sha256:second'),
      }),
    ).rejects.toThrow('index failed');

    expect(assetIndex.remove).toHaveBeenCalledWith(firstId);
  });
});

function makeTask(overrides: Partial<MediaTask> = {}): MediaTask {
  return {
    id: 'task-1',
    type: 'text-to-image',
    status: 'completed',
    progress: 100,
    providerId: 'openai',
    modelId: 'gpt-image',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:01.000Z'),
    outputs: [
      {
        type: 'image',
        url: 'https://example.com/image.png',
        width: 1024,
        height: 1024,
        mimeType: 'image/png',
      },
    ],
    request: { prompt: 'cat' },
    ...overrides,
    scope:
      overrides.scope ??
      ({
        conversationId: 'conv-1',
        runId: 'run-1',
        parentRunId: 'run-1',
        childRunId: overrides.id ?? 'task-1',
        childKind: 'task',
      } as const),
  };
}
