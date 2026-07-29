import { describe, expect, it, vi } from 'vitest';
import type { IToolsMediaRuntime } from '../../../contracts/IMediaRuntimeService';
import type { IHandlerContext } from './types';
import { handleStartStreaming, handleStopStreaming } from './StreamingController';

function createContext(runtime: IToolsMediaRuntime): IHandlerContext {
  return {
    webview: {} as IHandlerContext['webview'],
    fileUri: { fsPath: '/workspace/current.mp4' } as IHandlerContext['fileUri'],
    previousUri: { fsPath: '/workspace/previous.mp4' } as IHandlerContext['previousUri'],
    diffService: {} as IHandlerContext['diffService'],
    mediaRuntime: runtime,
    scheduler: {} as IHandlerContext['scheduler'],
    tempFileService: {} as IHandlerContext['tempFileService'],
    requestState: {
      previousFilePath: null,
      fetchPromise: null,
    } as IHandlerContext['requestState'],
    sessionId: 'session-1',
    currentRequestId: null,
    isDisposed: false,
    lastDiffResult: {
      mediaType: 'video',
      similarity: 0.5,
      details: {
        duration: { current: 10, previous: 10 },
        resolution: {
          current: { width: 1920, height: 1080 },
          previous: { width: 1920, height: 1080 },
        },
        fps: { current: 24, previous: 24 },
        codec: { current: 'h264', previous: 'h264' },
        keyframeDiffs: [],
        audioTrackChanged: false,
      },
    },
    lastRef: 'HEAD',
    timeRange: {},
    currentStreamId: null,
    previousStreamId: null,
    currentAudioStreamId: null,
    previousAudioStreamId: null,
    videoStreamGeneration: 0,
    videoStreamAbortController: null,
    currentAudioOnlyStreamId: null,
    previousAudioOnlyStreamId: null,
    audioStreamGeneration: 0,
    audioStreamAbortController: null,
    seekDebounceTimer: null,
    pendingSeekCompletion: null,
    activeFrameExtractions: 0,
    sendMessage: vi.fn(),
    requireMediaRuntime: () => runtime,
  };
}

function createRuntime(): IToolsMediaRuntime {
  return {
    probe: vi.fn(),
    captureFrame: vi.fn(),
    generateWaveform: vi.fn(),
    prepareVideo: vi.fn(),
    startPcm: vi.fn(async () => {
      throw new Error('no audio track');
    }),
    stop: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function preparedVideo(sessionId: string) {
  return {
    sessionId,
    video: {
      version: 1 as const,
      transport: 'http' as const,
      url: `http://127.0.0.1/${sessionId}`,
      mimeType: 'video/mp4',
      preparationProfile: 'h264-mp4-direct' as const,
      durationSeconds: 10,
    },
  };
}

describe('StreamingController', () => {
  it('cleans a partially prepared pair and reports the startup failure', async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.prepareVideo)
      .mockResolvedValueOnce(preparedVideo('current-session'))
      .mockRejectedValueOnce(new Error('previous prepare failed'));
    const context = createContext(runtime);

    await handleStartStreaming(context, 'request-1');

    expect(runtime.stop).toHaveBeenCalledWith('current-session');
    expect(context.currentStreamId).toBeNull();
    expect(context.sendMessage).toHaveBeenCalledWith({
      requestId: 'request-1',
      type: 'mediaDiff:streamError',
      error: 'previous prepare failed',
    });
    expect(vi.mocked(runtime.prepareVideo).mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
  });

  it('aborts the target startup generation before stopping owned sessions', async () => {
    const runtime = createRuntime();
    const context = createContext(runtime);
    const controller = new AbortController();
    context.videoStreamAbortController = controller;
    context.currentStreamId = 'current-session';
    context.previousStreamId = 'previous-session';

    await handleStopStreaming(context, 'request-stop');

    expect(controller.signal.aborted).toBe(true);
    expect(runtime.stop).toHaveBeenCalledWith('current-session');
    expect(runtime.stop).toHaveBeenCalledWith('previous-session');
    expect(context.sendMessage).toHaveBeenCalledWith({
      requestId: 'request-stop',
      type: 'mediaDiff:streamConfig',
      payload: null,
    });
  });

  it('fails visibly when an owned runtime session cannot be stopped', async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.stop).mockRejectedValueOnce(new Error('runtime stop failed'));
    const context = createContext(runtime);
    context.currentStreamId = 'current-session';

    await expect(handleStopStreaming(context, 'request-stop')).rejects.toThrow(
      'Failed to stop one or more media runtime sessions.',
    );

    expect(context.currentStreamId).toBeNull();
    expect(context.sendMessage).not.toHaveBeenCalled();
  });
});
