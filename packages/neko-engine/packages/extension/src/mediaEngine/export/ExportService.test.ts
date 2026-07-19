import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportService, type ExportConfig, type TrackLayer } from './ExportService';

const mockState = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../base/logger', () => ({
  getLogger: vi.fn(() => mockState.logger),
}));

describe('ExportService', () => {
  const engine = {
    dispatchAction: vi.fn(),
    getTaskProgress: vi.fn(),
    cancelTask: vi.fn(),
  };

  const frameProvider = {
    getFrameData: vi.fn(),
  };

  const config: ExportConfig = {
    outputPath: '/tmp/output.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 2,
    includeAudio: true,
    audioSources: [
      {
        path: '/tmp/music.wav',
        startTime: 0,
        duration: 2,
        trimStart: 0.25,
        volume: 0.8,
      },
    ],
  };

  const layers: TrackLayer[] = [
    {
      id: 'layer-1',
      type: 'video',
      startTime: 0,
      duration: 2,
      source: '/tmp/input.mp4',
      zIndex: 1,
      opacity: 0.9,
      transform: {
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0,
        anchorY: 0,
      },
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T00:00:00Z'));

    engine.dispatchAction.mockReset();
    engine.getTaskProgress.mockReset();
    engine.cancelTask.mockReset();
    frameProvider.getFrameData.mockReset();
    mockState.logger.info.mockReset();
    mockState.logger.warn.mockReset();
    mockState.logger.error.mockReset();
  });

  it('dispatches timelines:export and resolves via task polling', async () => {
    engine.dispatchAction.mockResolvedValue(
      JSON.stringify({ status: 'ok', data: { jobId: 'job-123' } }),
    );
    engine.getTaskProgress
      .mockResolvedValueOnce(
        JSON.stringify({
          status: 'ok',
          data: {
            status: 'running',
            progress: 25,
            performanceStats: { currentFps: 24 },
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          status: 'ok',
          data: {
            status: 'completed',
            progress: 100,
            outputPath: '/tmp/output.mp4',
          },
        }),
      );

    const service = new ExportService();
    service.initializeWithEngine(engine as never);
    const progressCallback = vi.fn();

    const exportPromise = service.export(config, layers, frameProvider, progressCallback);
    await vi.advanceTimersByTimeAsync(400);

    await expect(exportPromise).resolves.toMatchObject({
      success: true,
      outputPath: '/tmp/output.mp4',
      framesRendered: 60,
    });

    expect(engine.dispatchAction).toHaveBeenCalledTimes(1);
    expect(engine.dispatchAction).toHaveBeenCalledWith(
      'timelines',
      'export',
      null,
      expect.any(String),
    );

    const dispatchCall = engine.dispatchAction.mock.calls[0];
    expect(dispatchCall).toBeDefined();
    if (!dispatchCall) {
      throw new Error('Expected timelines:export to dispatch exactly once');
    }
    const requestJson = dispatchCall[3];
    expect(requestJson).toEqual(expect.any(String));
    if (typeof requestJson !== 'string') {
      throw new Error('Expected timelines:export to dispatch a JSON request');
    }
    const request = JSON.parse(requestJson);

    expect(request).toMatchObject({
      outputPath: '/tmp/output.mp4',
      settings: {
        width: 1920,
        height: 1080,
        fps: 30,
        includeAudio: true,
        audioSampleRate: 48000,
        audioChannels: 2,
        container: 'mp4',
      },
      timeline: {
        duration: 2,
        tracks: [
          expect.objectContaining({
            id: 'layer-1',
            type: 'video',
            source: '/tmp/input.mp4',
            zIndex: 1,
            opacity: 0.9,
          }),
        ],
        audioTracks: [
          {
            source: '/tmp/music.wav',
            startTime: 0,
            duration: 2,
            trimStart: 0.25,
            volume: 0.8,
          },
        ],
      },
    });
    expect(request.jobId).toBe('export_1775606400000');

    expect(progressCallback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        currentFrame: 0,
        totalFrames: 60,
        percentage: 0,
        phase: 'initializing',
      }),
    );
    expect(progressCallback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        currentFrame: 15,
        totalFrames: 60,
        percentage: 25,
        phase: 'rendering',
        performanceStats: { currentFps: 24 },
      }),
    );
    expect(progressCallback).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        currentFrame: 60,
        totalFrames: 60,
        percentage: 100,
        phase: 'finalizing',
      }),
    );
  });

  it('returns a structured error when export dispatch fails', async () => {
    engine.dispatchAction.mockResolvedValue(
      JSON.stringify({
        status: 'error',
        error: { message: 'dispatch failed' },
      }),
    );

    const service = new ExportService();
    service.initializeWithEngine(engine as never);

    await expect(service.export(config, layers, frameProvider)).resolves.toEqual({
      success: false,
      error: 'dispatch failed',
    });
    expect(engine.getTaskProgress).not.toHaveBeenCalled();
  });

  it('settles the pending export promise when cancel is requested', async () => {
    engine.dispatchAction.mockResolvedValue(
      JSON.stringify({ status: 'ok', data: { jobId: 'job-cancel' } }),
    );

    const service = new ExportService();
    service.initializeWithEngine(engine as never);

    const exportPromise = service.export(config, layers, frameProvider);
    await Promise.resolve();
    await service.cancel();

    await expect(exportPromise).resolves.toEqual({
      success: false,
      error: 'Export cancelled',
    });
    expect(engine.cancelTask).toHaveBeenCalledWith('job-cancel');
  });
});
