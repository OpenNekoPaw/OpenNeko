import { describe, expect, it } from 'vitest';
import type { AgentBackgroundTask, SubAgentWorkItem } from '@neko-agent/types';
import {
  projectAgentWorkItemStatus,
  projectAgentWorkItemSteps,
  projectBackgroundTaskBatch,
  projectBackgroundTaskCard,
  projectBackgroundTaskResultContent,
  projectSubAgentCard,
} from '../work-item-presenter';

describe('work-item-presenter', () => {
  it('projects task and step status semantics for UI surfaces', () => {
    expect(projectAgentWorkItemStatus('processing')).toEqual({
      isActive: true,
      isCompleted: false,
      isFailed: false,
      tone: 'info',
    });
    expect(projectAgentWorkItemStatus('cancelled')).toMatchObject({
      isFailed: true,
      tone: 'danger',
    });

    expect(
      projectBackgroundTaskBatch([
        { ...createBackgroundTask('queued', 'q'), status: 'queued', progress: 0 },
        { ...createBackgroundTask('done', 'd'), status: 'completed', progress: 100 },
        { ...createBackgroundTask('failed', 'f'), status: 'failed', progress: 100 },
      ]),
    ).toMatchObject({
      stats: { queued: 1, processing: 0, completed: 1, failed: 1 },
      totalProgress: 67,
      allCompleted: false,
      allFailed: false,
      hasActive: true,
      taskType: 'image',
      tone: 'info',
      titleKey: 'tasks.batchImageGeneration',
      showProgress: true,
      showCancelAll: true,
      badges: [
        {
          status: 'completed',
          count: 1,
          tone: 'success',
          iconKind: 'completed',
          labelKey: 'tasks.status.completed',
          animate: false,
        },
        {
          status: 'queued',
          count: 1,
          tone: 'warning',
          iconKind: 'queued',
          labelKey: 'tasks.status.queued',
          animate: false,
        },
        {
          status: 'failed',
          count: 1,
          tone: 'danger',
          iconKind: 'failed',
          labelKey: 'tasks.status.failed',
          animate: false,
        },
      ],
      rows: [
        expect.objectContaining({
          index: 0,
          promptPreview: 'q',
          statusDisplay: '0%',
          statusTone: 'info',
          showViewResult: false,
        }),
        expect.objectContaining({
          index: 1,
          promptPreview: 'd',
          statusDisplay: 'completed',
          statusTone: 'success',
          showViewResult: true,
        }),
        expect.objectContaining({
          index: 2,
          promptPreview: 'f',
          statusDisplay: 'failed',
          statusTone: 'danger',
          showViewResult: false,
        }),
      ],
    });

    expect(
      projectAgentWorkItemSteps(
        [
          {
            id: 'step-1',
            name: 'One',
            status: 'completed',
            startTime: 1000,
            endTime: 3500,
          },
          { id: 'step-2', name: 'Two', status: 'running', message: 'Working' },
        ],
        'step-2',
      ),
    ).toMatchObject({
      currentStepIndex: 1,
      completedSteps: 1,
      currentStepName: 'Two',
      rows: [
        {
          step: expect.objectContaining({ id: 'step-1' }),
          index: 0,
          isCurrent: false,
          iconKind: 'completed',
          tone: 'success',
          animate: false,
          durationSeconds: 3,
          showDuration: true,
          showMessage: false,
        },
        {
          step: expect.objectContaining({ id: 'step-2' }),
          index: 1,
          isCurrent: true,
          iconKind: 'running',
          tone: 'info',
          animate: true,
          durationSeconds: null,
          showDuration: false,
          showMessage: true,
        },
      ],
    });
  });

  it('projects batch media type titles and terminal batch state', () => {
    expect(
      projectBackgroundTaskBatch([
        {
          ...createBackgroundTask('audio-1', 'voice line'),
          type: 'audio',
          status: 'completed',
          progress: 100,
        },
      ]),
    ).toMatchObject({
      taskType: 'audio',
      titleKey: 'tasks.batchAudioGeneration',
      tone: 'success',
      allCompleted: true,
      allFailed: false,
      showProgress: false,
      showCancelAll: false,
    });

    expect(
      projectBackgroundTaskBatch([
        {
          ...createBackgroundTask('video-1', 'shot'),
          type: 'video',
          status: 'cancelled',
          progress: 15,
        },
      ]),
    ).toMatchObject({
      taskType: 'video',
      titleKey: 'tasks.batchVideoGeneration',
      tone: 'danger',
      allCompleted: false,
      allFailed: true,
      badges: [
        expect.objectContaining({
          status: 'failed',
          count: 1,
          labelKey: 'tasks.status.failed',
        }),
      ],
      rows: [
        expect.objectContaining({
          statusDisplay: 'failed',
          statusTone: 'danger',
          showViewResult: false,
        }),
      ],
    });
  });

  it('projects single background task card display semantics', () => {
    expect(
      projectBackgroundTaskCard({
        ...createBackgroundTask('video-1', 'shot'),
        type: 'video',
        status: 'processing',
        progress: 45,
        eta: 30,
        steps: [{ id: 'step-1', name: 'Render', status: 'running' }],
        result: { urls: ['webview://video.mp4'] },
      }),
    ).toMatchObject({
      status: {
        isActive: true,
        isCompleted: false,
        isFailed: false,
        tone: 'info',
      },
      tone: 'info',
      taskType: 'video',
      titleKey: 'tasks.videoGeneration',
      progressLabel: '45%',
      progressBarPercent: 45,
      showProgressLabel: true,
      showProgressBar: true,
      useIndeterminateProgress: false,
      showCancel: true,
      showRetry: false,
      showViewResult: false,
      showCollapsedError: false,
      showExpandedError: false,
      showSteps: true,
      showResultPreview: false,
      showEta: true,
      etaSeconds: 30,
      providerName: 'model-1',
    });

    expect(
      projectBackgroundTaskCard({
        ...createBackgroundTask('audio-1', 'voice line'),
        type: 'audio',
        status: 'queued',
        progress: 0,
      }),
    ).toMatchObject({
      taskType: 'audio',
      titleKey: 'tasks.audioGeneration',
      progressLabel: null,
      showProgressLabel: false,
      showProgressBar: true,
      useIndeterminateProgress: true,
      showCancel: true,
      showEta: false,
      etaSeconds: null,
    });

    expect(
      projectBackgroundTaskCard({
        ...createBackgroundTask('image-1', 'cat'),
        status: 'completed',
        result: { urls: ['webview://cat.png'] },
      }),
    ).toMatchObject({
      taskType: 'image',
      titleKey: 'tasks.imageGeneration',
      tone: 'success',
      showProgressBar: false,
      showCancel: false,
      showRetry: false,
      showViewResult: true,
      showResultPreview: true,
    });

    expect(
      projectBackgroundTaskCard({
        ...createBackgroundTask('failed-1', 'cat'),
        status: 'failed',
        progress: 100,
        error: 'boom',
      }),
    ).toMatchObject({
      tone: 'danger',
      showProgressBar: false,
      showCancel: false,
      showRetry: true,
      showViewResult: false,
      showCollapsedError: true,
      showExpandedError: true,
      showResultPreview: false,
    });
  });

  it('projects background task results into rich content data', () => {
    expect(
      projectBackgroundTaskResultContent({
        ...createBackgroundTask('video-1', 'Render shot'),
        type: 'video',
        name: 'Render shot',
        result: {
          urls: ['webview://video.mp4'],
          thumbnailUrl: 'webview://poster.jpg',
          duration: 12,
        },
      }),
    ).toMatchObject({
      contentKind: 'video',
      contentData: {
        src: 'webview://video.mp4',
        poster: 'webview://poster.jpg',
        title: 'Render shot',
      },
      displayDuration: 12,
      mediaType: 'video',
    });

    expect(
      projectBackgroundTaskResultContent({
        ...createBackgroundTask('image-1', 'Render stills'),
        result: {
          urls: ['webview://a.png', 'webview://b.png'],
        },
      }),
    ).toMatchObject({
      contentKind: 'image-grid',
      contentData: {
        urls: ['webview://a.png', 'webview://b.png'],
        name: 'Render stills',
      },
      mediaType: 'image',
    });
  });

  it('prefers generated asset metadata for background task result projection', () => {
    expect(
      projectBackgroundTaskResultContent({
        ...createBackgroundTask('image-1', 'Render asset'),
        result: {
          urls: ['webview://remote.png'],
          width: 512,
          height: 512,
          assets: [
            {
              id: 'asset-1',
              type: 'generated-image',
              renderUri: 'webview://asset.png',
              assetRef: {
                assetId: 'asset-1',
                uri: 'generated-assets/asset-1.png',
                mimeType: 'image/png',
              },
              mimeType: 'image/png',
              generatedAt: '2026-01-01T00:00:00.000Z',
              width: 1024,
              height: 768,
              ratio: '4:3',
            },
          ],
        },
      }),
    ).toMatchObject({
      contentKind: 'image',
      contentData: {
        src: 'webview://asset.png',
        localPath: 'generated-assets/asset-1.png',
        name: 'Render asset',
      },
      displayWidth: 1024,
      displayHeight: 768,
    });
  });

  it('projects panoramic image results as lightweight delegated cards', () => {
    expect(
      projectBackgroundTaskResultContent({
        ...createBackgroundTask('image-360', 'Render skybox'),
        result: {
          urls: ['webview://skybox_360.jpg'],
          thumbnailUrl: 'webview://skybox-fov.jpg',
        },
      }),
    ).toMatchObject({
      contentKind: 'panoramic-image',
      contentData: {
        src: 'webview://skybox-fov.jpg',
        kind: 'image',
      },
    });
  });

  it('projects panoramic video results as lightweight delegated cards', () => {
    expect(
      projectBackgroundTaskResultContent({
        ...createBackgroundTask('video-360', 'Render tour'),
        type: 'video',
        result: {
          urls: ['webview://tour_360.mp4'],
          thumbnailUrl: 'webview://tour-poster.jpg',
        },
      }),
    ).toMatchObject({
      contentKind: 'panoramic-video',
      contentData: {
        src: 'webview://tour-poster.jpg',
        kind: 'video',
      },
    });
  });

  it('does not serialize runtime preview state into panoramic delegated cards', () => {
    const projection = projectBackgroundTaskResultContent({
      ...createBackgroundTask('image-360-runtime', 'Render skybox'),
      result: {
        urls: ['blob:runtime-preview'],
        thumbnailUrl: 'webview://skybox-fov.jpg',
      },
    });
    const serialized = JSON.stringify(projection.contentData);

    expect(serialized).not.toContain('blob:runtime-preview');
    expect(serialized).not.toContain('streamId');
    expect(serialized).not.toContain('yawDeg');
    expect(serialized).not.toContain('pitchDeg');
    expect(serialized).not.toContain('fovDeg');
    expect(projection).toMatchObject({
      contentKind: 'image',
      contentData: {
        src: 'webview://skybox-fov.jpg',
        name: 'Render skybox',
      },
    });
  });

  it('projects subagent card display semantics', () => {
    const item: SubAgentWorkItem = {
      ...createSubAgentWorkItem('sub-1', 'tool-1'),
      title: 'Review script',
      summary: 'Reviewing continuity and pacing',
      progress: 25,
      steps: [{ id: 'step-1', name: 'Read script', status: 'running' }],
      currentStepId: 'step-1',
      children: ['sub-child'],
      subAgent: {
        parentAgentId: 'parent-a',
        type: 'reviewer',
        runMode: 'background',
        modelTier: 'fast',
        response: 'Looks consistent.',
      },
    };

    expect(projectSubAgentCard(item)).toEqual({
      status: {
        isActive: true,
        isCompleted: false,
        isFailed: false,
        tone: 'info',
      },
      tone: 'info',
      typeLabel: 'reviewer',
      progressLabel: '25%',
      progressBarPercent: 25,
      showProgressLabel: true,
      showProgressBar: true,
      showSummary: true,
      showSteps: true,
      showChildren: true,
      showError: false,
      showResponse: true,
      metaBadges: [
        { label: 'status', value: 'processing' },
        { label: 'mode', value: 'background' },
        { label: 'model', value: 'fast' },
      ],
      childIds: ['sub-child'],
      parentAgentId: 'parent-a',
    });

    const failed = {
      ...createSubAgentWorkItem('sub-2', null),
      status: 'failed' as const,
      progress: 0,
      error: 'boom',
      subAgent: {
        parentAgentId: 'parent-a',
      },
    };

    expect(projectSubAgentCard(failed)).toMatchObject({
      tone: 'danger',
      typeLabel: 'subagent',
      progressLabel: null,
      progressBarPercent: 8,
      showProgressLabel: false,
      showProgressBar: false,
      showError: true,
      showResponse: false,
      metaBadges: [{ label: 'status', value: 'failed' }],
      childIds: [],
    });
  });
});

function taskScope(childRunId: string) {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task' as const,
  };
}

function createBackgroundTask(id: string, prompt: string): AgentBackgroundTask {
  return {
    scope: taskScope(id),
    id,
    type: 'image',
    name: prompt,
    prompt,
    providerId: 'provider-1',
    providerName: 'model-1',
    status: 'processing',
    progress: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
  };
}

function createSubAgentWorkItem(id: string, parentToolCallId: string | null): SubAgentWorkItem {
  return {
    scope: {
      conversationId: 'conv-1',
      runId: 'run-1',
      parentRunId: 'parent-a',
      childRunId: id,
      childKind: 'subagent',
    },
    id,
    conversationId: 'conv-1',
    kind: 'subagent',
    parentMessageId: 'msg-1',
    parentToolCallId,
    title: 'SubAgent',
    status: 'processing',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    subAgent: {
      parentAgentId: 'parent-a',
    },
  };
}
