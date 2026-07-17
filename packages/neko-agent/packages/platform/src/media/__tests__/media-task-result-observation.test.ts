import { describe, expect, it } from 'vitest';
import { normalizeAgentTaskResultObservation } from '@neko/agent';
import { createGeneratedAssetRevisionRef, type GeneratedAsset } from '@neko/shared';
import type { MediaTask } from '../types';
import { toMediaTaskResultObservationTask } from '../media-task-result-observation';

describe('media task result observation projection', () => {
  it('returns generated asset refs and host-local save paths for completed outputs', () => {
    const localPath = '/workspace/neko/generated/image/asset-1.png';
    const asset: GeneratedAsset = {
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
          workflowStage: { workflowId: 'workflow-1', stageId: 'shot-generation' },
        },
      }),
    };

    const task = toMediaTaskResultObservationTask({
      conversationId: 'conv-1',
      taskId: 'task-1',
      progress: 100,
      mediaTask: createMediaTask(),
      deliveryPlan: {
        resultUrls: ['generated-assets/asset-1.png'],
        thumbnailUrl: 'generated-assets/asset-1.png',
        hostOutputPaths: [localPath],
        generatedAssets: [asset],
        shouldPersistResultUrls: true,
        shouldUnsubscribe: true,
      },
    });

    const data = task.output?.data as {
      readonly hostOutputPaths?: readonly string[];
      readonly assets?: ReadonlyArray<Record<string, unknown>>;
    };
    const projectedAsset = data.assets?.[0];

    expect(data.hostOutputPaths).toEqual([localPath]);
    expect(projectedAsset).toMatchObject({
      id: 'asset-1',
      mimeType: 'image/png',
      label: 'generated-assets/asset-1.png',
      localPath,
      assetRef: {
        assetId: 'asset-1',
        uri: 'generated-assets/asset-1.png',
        mimeType: 'image/png',
      },
      revision: expect.stringMatching(/^rev_/),
      contentDigest: 'sha256:image',
      generationLineage: {
        taskId: 'task-1',
        runId: 'run-1',
        providerId: 'openai',
        modelId: 'gpt-image-1',
        workflowStage: { workflowId: 'workflow-1', stageId: 'shot-generation' },
      },
      resourceRef: {
        scope: 'project',
        provider: 'generated-asset',
        kind: 'generated',
        source: {
          kind: 'generated-asset',
          generatedAssetId: 'asset-1',
          metadata: {
            contentDigest: 'sha256:image',
            mimeType: 'image/png',
          },
        },
        locator: {
          kind: 'generated-asset',
          assetId: 'asset-1',
        },
      },
    });

    const observation = normalizeAgentTaskResultObservation({
      task,
      source: 'media-task',
    });
    expect(observation.resultRefs).toEqual([
      expect.objectContaining({
        kind: 'resource',
        id: expect.any(String),
        resourceRef: expect.objectContaining({
          provider: 'generated-asset',
          kind: 'generated',
        }),
      }),
    ]);
    expect(observation.resultRefs).not.toContainEqual(
      expect.objectContaining({ kind: 'asset', id: 'asset-1' }),
    );
  });

  it('rejects path-only generated assets instead of rebuilding durable identity from a host path', () => {
    const pathOnlyAsset: GeneratedAsset = {
      id: 'asset-path-only',
      type: 'generated-image',
      path: '/workspace/.neko/.cache/generated/image.png',
      mimeType: 'image/png',
      generatedAt: '2026-01-01T00:00:00.000Z',
      width: 1024,
      height: 1024,
      ratio: '1:1',
    };

    expect(() =>
      toMediaTaskResultObservationTask({
        conversationId: 'conv-1',
        taskId: 'task-1',
        progress: 100,
        mediaTask: createMediaTask(),
        assets: [pathOnlyAsset],
      }),
    ).toThrow('missing revision-bound lifecycle identity');
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
    type: 'text-to-image',
    status: 'completed',
    progress: 100,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    request: {
      prompt: 'cat',
      metadata: {
        conversationId: 'conv-1',
        runId: 'run-1',
        runStartedAt: 101,
        workflowId: 'workflow-1',
        workflowStageId: 'shot-generation',
      },
    },
    outputs: [{ type: 'image', url: 'https://example.test/image.png', mimeType: 'image/png' }],
  };
}
