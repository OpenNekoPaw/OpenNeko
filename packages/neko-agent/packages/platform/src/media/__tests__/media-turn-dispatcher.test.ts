import { describe, expect, it, vi } from 'vitest';
import { observeMediaTaskProgress, runMediaTurn, submitMediaTurn } from '../media-turn-dispatcher';
import type { ResourceRef, TaskRunScope } from '@neko/shared';
import type { MediaTask, MediaProgressCallback } from '../types';

describe('submitMediaTurn', () => {
  it('dispatches image turns to image generation', async () => {
    const media = createMediaServiceMock();
    media.generateImage.mockResolvedValue({ id: 'image-task' });

    await expect(
      submitMediaTurn(media, {
        prompt: 'cat',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      }),
    ).resolves.toEqual({ id: 'image-task' });

    expect(media.generateImage).toHaveBeenCalledWith({
      prompt: 'cat',
      providerId: 'flux',
      modelId: 'flux-pro',
    });
  });

  it('preserves conversation id in request metadata', async () => {
    const media = createMediaServiceMock();
    media.generateImage.mockResolvedValue({ id: 'image-task' });

    await submitMediaTurn(media, {
      prompt: 'cat',
      mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      conversationId: 'conv-1',
      metadata: { source: 'chat' },
    });

    expect(media.generateImage).toHaveBeenCalledWith({
      prompt: 'cat',
      providerId: 'flux',
      modelId: 'flux-pro',
      metadata: { source: 'chat', conversationId: 'conv-1' },
    });
  });

  it('maps stable 3D reference roles into an image request without generic fallback', async () => {
    const media = createMediaServiceMock();
    media.generateImage.mockResolvedValue({ id: 'image-task' });
    const poseRef = resourceRef('pose');
    const appearanceRef = resourceRef('appearance');
    const panoramaRef = resourceRef('panorama');

    await submitMediaTurn(media, {
      prompt: 'character in scene',
      mediaModel: { providerId: 'fal', modelId: 'flux-control', category: 'image' },
      threeReferenceControls: {
        appearanceReferences: [
          {
            imageRef: appearanceRef,
            sourceRef: resourceRef('source-model'),
            identity: { sessionId: 'appearance-session', revision: 1 },
          },
        ],
        controlImage: {
          imageRef: poseRef,
          mode: 'pose',
          identity: { sessionId: 'pose-session', revision: 2 },
        },
        camera: {
          value: {
            cameraId: 'front',
            position: { x: 0, y: 1, z: 3 },
            target: { x: 0, y: 1, z: 0 },
            fieldOfViewDeg: 45,
            aspectRatio: 1,
          },
          identity: { sessionId: 'camera-session', revision: 3 },
        },
        panorama: {
          imageRef: panoramaRef,
          orientation: { yawDeg: 10, pitchDeg: 0, fieldOfViewDeg: 70 },
          identity: { sessionId: 'panorama-session', revision: 4 },
        },
      },
    });

    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        controlImageRef: poseRef,
        controlMode: 'pose',
        ipAdapterRefs: [{ imageRef: appearanceRef, mode: 'subject' }],
        cameraReference: expect.objectContaining({
          identity: { sessionId: 'camera-session', revision: 3 },
        }),
        panoramaReference: expect.objectContaining({ imageRef: panoramaRef }),
      }),
    );
    const request = media.generateImage.mock.calls[0]?.[0];
    expect(request).not.toHaveProperty('referenceImageUrl');
    expect(request).not.toHaveProperty('referenceImageBase64');
  });

  it('rejects 3D controls on non-image direct turns before submission', async () => {
    const media = createMediaServiceMock();
    await expect(
      submitMediaTurn(media, {
        prompt: 'animate',
        mediaModel: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
        threeReferenceControls: {
          appearanceReferences: [],
          controlImage: {
            imageRef: resourceRef('pose'),
            mode: 'pose',
            identity: { sessionId: 'pose-session', revision: 1 },
          },
        },
      }),
    ).rejects.toThrow('not supported for video turns');
    expect(media.generateVideo).not.toHaveBeenCalled();
  });

  it('dispatches video turns to video generation', async () => {
    const media = createMediaServiceMock();
    media.generateVideo.mockResolvedValue({ id: 'video-task' });

    await submitMediaTurn(media, {
      prompt: 'cat running',
      mediaModel: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
    });

    expect(media.generateVideo).toHaveBeenCalledWith({
      prompt: 'cat running',
      providerId: 'runway',
      modelId: 'gen-4',
    });
  });

  it('dispatches music turns to audio generation with isMusic', async () => {
    const media = createMediaServiceMock();
    media.generateAudio.mockResolvedValue({ id: 'music-task' });

    await submitMediaTurn(media, {
      prompt: 'lofi loop',
      mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'music' },
    });

    expect(media.generateAudio).toHaveBeenCalledWith({
      prompt: 'lofi loop',
      providerId: 'suno',
      modelId: 'chirp',
      isMusic: true,
    });
  });
});

describe('runMediaTurn', () => {
  it('delivers task creation and subscribed progress for the same conversation', async () => {
    const media = createMediaServiceMock();
    const created = createMediaTask({ id: 'task-1', status: 'pending', progress: 0 });
    const progress = createMediaTask({ id: 'task-1', status: 'processing', progress: 50 });
    media.generateImage.mockResolvedValue(created);
    media.getTask.mockResolvedValue(progress);

    const onTaskCreated = vi.fn();
    const onTaskProgress = vi.fn();
    await runMediaTurn({
      media,
      prompt: 'cat',
      mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      conversationId: 'conv-1',
      createTaskView: (task) => ({ id: task.id, status: task.status }),
      onTaskCreated,
      onTaskProgress,
    });

    expect(onTaskCreated).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      task: { id: 'task-1', status: 'pending' },
      mediaTask: created,
    });
    expect(onTaskProgress).not.toHaveBeenCalled();

    media.emitProgress(progress);
    await Promise.resolve();

    expect(onTaskProgress).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      task: { id: 'task-1', status: 'processing' },
      mediaTask: progress,
    });
  });

  it('delivers terminal current snapshot after subscribing', async () => {
    const media = createMediaServiceMock();
    const created = createMediaTask({ id: 'task-1', status: 'pending', progress: 0 });
    const completed = createMediaTask({ id: 'task-1', status: 'completed', progress: 100 });
    media.generateImage.mockResolvedValue(created);
    media.getTask.mockResolvedValue(completed);

    const onTaskProgress = vi.fn();

    await runMediaTurn({
      media,
      prompt: 'cat',
      mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      conversationId: 'conv-1',
      createTaskView: (task) => ({ id: task.id, status: task.status }),
      onTaskCreated: vi.fn(),
      onTaskProgress,
    });

    expect(onTaskProgress).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      task: { id: 'task-1', status: 'completed' },
      mediaTask: completed,
    });
    expect(media.unsubscribeProgress).toHaveBeenCalledTimes(1);
  });

  it('ignores progress snapshots from a different conversation', async () => {
    const media = createMediaServiceMock();
    const created = createMediaTask({ id: 'task-1', status: 'pending', progress: 0 });
    const foreign = createMediaTask({
      id: 'task-1',
      status: 'completed',
      progress: 100,
      conversationId: 'conv-2',
    });
    media.generateImage.mockResolvedValue(created);
    media.getTask.mockResolvedValue(undefined);

    const onTaskProgress = vi.fn();
    const onIgnoredConversationTask = vi.fn();
    await runMediaTurn({
      media,
      prompt: 'cat',
      mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      conversationId: 'conv-1',
      createTaskView: (task) => ({ id: task.id, status: task.status }),
      onTaskCreated: vi.fn(),
      onTaskProgress,
      onIgnoredConversationTask,
    });

    media.emitProgress(foreign);
    await Promise.resolve();

    expect(onTaskProgress).not.toHaveBeenCalled();
    expect(onIgnoredConversationTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      conversationId: 'conv-1',
      mediaTask: foreign,
    });
  });
});

describe('observeMediaTaskProgress', () => {
  it('delivers progress and unsubscribes after the first terminal update', async () => {
    const media = createMediaServiceMock();
    const onTaskProgress = vi.fn();

    observeMediaTaskProgress({
      media,
      taskScope: createMediaTask({ id: 'task-1' }).scope,
      conversationId: 'conv-1',
      createTaskView: (task) => ({ id: task.id, status: task.status }),
      onTaskProgress,
    });

    const completed = createMediaTask({ id: 'task-1', status: 'completed', progress: 100 });
    media.emitProgress(completed);
    media.emitProgress(completed);
    await Promise.resolve();
    await Promise.resolve();

    expect(onTaskProgress).toHaveBeenCalledTimes(1);
    expect(media.unsubscribeProgress).toHaveBeenCalledTimes(1);
  });

  it('can unsubscribe when an observed task belongs to a different conversation', async () => {
    const media = createMediaServiceMock();
    const onIgnoredConversationTask = vi.fn();

    observeMediaTaskProgress({
      media,
      taskScope: createMediaTask({ id: 'task-1' }).scope,
      conversationId: 'conv-1',
      createTaskView: (task) => ({ id: task.id, status: task.status }),
      onTaskProgress: vi.fn(),
      onIgnoredConversationTask,
      unsubscribeOnIgnoredConversation: true,
    });

    const foreign = createMediaTask({
      id: 'task-1',
      status: 'processing',
      progress: 50,
      conversationId: 'conv-2',
    });
    media.emitProgress(foreign);
    await Promise.resolve();

    expect(onIgnoredConversationTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      conversationId: 'conv-1',
      mediaTask: foreign,
    });
    expect(media.unsubscribeProgress).toHaveBeenCalledTimes(1);
  });
});

function createMediaServiceMock() {
  const progressCallbacks: MediaProgressCallback[] = [];
  const unsubscribeProgress = vi.fn();
  return {
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
    generateAudio: vi.fn(),
    getTask: vi.fn().mockResolvedValue(undefined),
    onProgress: vi.fn((_taskScope: TaskRunScope, callback: MediaProgressCallback) => {
      progressCallbacks.push(callback);
      return unsubscribeProgress;
    }),
    unsubscribeProgress,
    emitProgress: (task: MediaTask) => {
      for (const callback of progressCallbacks) {
        callback(task);
      }
    },
  };
}

function createMediaTask(
  overrides: {
    id?: string;
    status?: MediaTask['status'];
    progress?: number;
    conversationId?: string;
  } = {},
): MediaTask {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const id = overrides.id ?? 'task-1';
  const conversationId = overrides.conversationId ?? 'conv-1';
  return {
    scope: {
      conversationId,
      runId: `run-${conversationId}`,
      parentRunId: `run-${conversationId}`,
      childRunId: id,
      childKind: 'task',
    },
    id,
    type: 'text-to-image',
    status: overrides.status ?? 'pending',
    progress: overrides.progress ?? 0,
    providerId: 'flux',
    modelId: 'flux-pro',
    createdAt: now,
    updatedAt: now,
    request: {
      prompt: 'cat',
      metadata: {
        conversationId,
        runId: `run-${conversationId}`,
      },
    },
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
