import { describe, expect, it, vi } from 'vitest';
import {
  EngineAvStreamLifecycle,
  type EngineAvAudioStreamClient,
  type EngineAvFrameScheduler,
  type EngineAvVideoStreamClient,
} from '../EngineAvStreamLifecycle';
import type { AudioStreamStats, H264StreamClientStats, FrameSchedulerStats } from '../index';

describe('EngineAvStreamLifecycle', () => {
  it('starts video-only streams and disposes them', async () => {
    const events: string[] = [];
    const video = createVideoClient(events, 'video');
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: () => video,
      },
    });

    await lifecycle.start({
      video: { websocketUrl: 'ws://video', width: 1280, height: 720 },
    });

    expect(events).toEqual(['video.connect']);
    expect(lifecycle.getSnapshot().videoClient).toBe(video);

    lifecycle.dispose();

    expect(events).toEqual(['video.connect', 'video.dispose']);
  });

  it('can schedule video-only streams when requested by the caller', async () => {
    const events: string[] = [];
    let videoConfig: { onFrame?: (frame: VideoFrame) => void } | undefined;
    const scheduler = createScheduler(events, 'scheduler');
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: (config) => {
          videoConfig = config;
          return createVideoClient(events, 'video');
        },
        createFrameScheduler: () => scheduler,
      },
    });

    await lifecycle.start({
      video: { websocketUrl: 'ws://video', width: 1280, height: 720 },
      schedulerMode: 'video',
    });
    const frame = {} as VideoFrame;
    videoConfig?.onFrame?.(frame);

    expect(lifecycle.getSnapshot().scheduler).toBe(scheduler);
    expect(scheduler.enqueue).toHaveBeenCalledWith(frame);
  });

  it('can leave frame routing to caller policy while still owning scheduler lifecycle', async () => {
    const events: string[] = [];
    let videoConfig: { onFrame?: (frame: VideoFrame) => void } | undefined;
    const onFrame = vi.fn();
    const scheduler = createScheduler(events, 'scheduler');
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: (config) => {
          videoConfig = config;
          return createVideoClient(events, 'video');
        },
        createFrameScheduler: () => scheduler,
      },
    });

    await lifecycle.start({
      video: { websocketUrl: 'ws://video', width: 1280, height: 720, onFrame },
      schedulerMode: 'video',
      videoFrameRoute: 'callback',
    });
    const frame = {} as VideoFrame;
    videoConfig?.onFrame?.(frame);

    expect(lifecycle.getSnapshot().scheduler).toBe(scheduler);
    expect(onFrame).toHaveBeenCalledWith(frame);
    expect(scheduler.enqueue).not.toHaveBeenCalled();
  });

  it('starts audio and video with a scheduler and reports clients', async () => {
    const events: string[] = [];
    const video = createVideoClient(events, 'video');
    const audio = createAudioClient(events, 'audio');
    const scheduler = createScheduler(events, 'scheduler');
    const onClientsChanged = vi.fn();
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: () => video,
        createAudioClient: () => audio,
        createFrameScheduler: () => scheduler,
      },
      callbacks: { onClientsChanged },
    });

    await lifecycle.start({
      video: { websocketUrl: 'ws://video', width: 1280, height: 720 },
      audio: { websocketUrl: 'ws://audio' },
      fps: 30,
    });

    expect(events).toEqual(['video.connect', 'audio.connect']);
    expect(lifecycle.getSnapshot()).toMatchObject({
      videoClient: video,
      audioClient: audio,
      scheduler,
    });
    expect(onClientsChanged).toHaveBeenCalledWith({
      videoClient: video,
      audioClient: audio,
      scheduler,
    });
  });

  it('does not block video connection on a slow audio connection', async () => {
    const events: string[] = [];
    let releaseAudio: (() => void) | undefined;
    const video = createVideoClient(events, 'video');
    const audio = {
      ...createAudioClient(events, 'audio'),
      async connect() {
        events.push('audio.connect:start');
        await new Promise<void>((resolve) => {
          releaseAudio = resolve;
        });
        events.push('audio.connect:done');
      },
    };
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: () => video,
        createAudioClient: () => audio,
      },
    });

    const started = lifecycle.start({
      video: { websocketUrl: 'ws://video', width: 1280, height: 720 },
      audio: { websocketUrl: 'ws://audio' },
    });
    await Promise.resolve();

    expect(events).toEqual(['video.connect', 'audio.connect:start']);

    releaseAudio?.();
    await started;

    expect(events).toEqual(['video.connect', 'audio.connect:start', 'audio.connect:done']);
  });

  it('replaces descriptors and disposes old clients before starting new ones', async () => {
    const events: string[] = [];
    const firstVideo = createVideoClient(events, 'firstVideo');
    const firstAudio = createAudioClient(events, 'firstAudio');
    const firstScheduler = createScheduler(events, 'firstScheduler');
    const secondVideo = createVideoClient(events, 'secondVideo');
    const secondAudio = createAudioClient(events, 'secondAudio');
    const secondScheduler = createScheduler(events, 'secondScheduler');
    let videoRun = 0;
    let audioRun = 0;
    let schedulerRun = 0;
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: () => (videoRun++ === 0 ? firstVideo : secondVideo),
        createAudioClient: () => (audioRun++ === 0 ? firstAudio : secondAudio),
        createFrameScheduler: () => (schedulerRun++ === 0 ? firstScheduler : secondScheduler),
      },
    });

    await lifecycle.start({
      video: { websocketUrl: 'ws://video-1', width: 1280, height: 720 },
      audio: { websocketUrl: 'ws://audio-1' },
    });
    await lifecycle.start({
      video: { websocketUrl: 'ws://video-2', width: 1280, height: 720 },
      audio: { websocketUrl: 'ws://audio-2' },
    });

    expect(events).toEqual([
      'firstVideo.connect',
      'firstAudio.connect',
      'firstScheduler.dispose',
      'firstVideo.dispose',
      'firstAudio.dispose',
      'secondVideo.connect',
      'secondAudio.connect',
    ]);
  });

  it('chains connection, error, and stream-end callbacks', async () => {
    let videoConfig:
      | {
          onConnectionChange?: (connected: boolean) => void;
          onError?: (error: Error) => void;
          onStreamEnd?: () => void;
        }
      | undefined;
    const descriptorConnection = vi.fn();
    const descriptorError = vi.fn();
    const descriptorEnd = vi.fn();
    const lifecycleConnection = vi.fn();
    const lifecycleError = vi.fn();
    const lifecycleEnd = vi.fn();

    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: (config) => {
          videoConfig = config;
          return createVideoClient([], 'video');
        },
      },
      callbacks: {
        onVideoConnectionChange: lifecycleConnection,
        onError: lifecycleError,
        onStreamEnd: lifecycleEnd,
      },
    });

    await lifecycle.start({
      video: {
        websocketUrl: 'ws://video',
        width: 1,
        height: 1,
        onConnectionChange: descriptorConnection,
        onError: descriptorError,
        onStreamEnd: descriptorEnd,
      },
    });
    const error = new Error('network');

    videoConfig?.onConnectionChange?.(true);
    videoConfig?.onError?.(error);
    videoConfig?.onStreamEnd?.();

    expect(descriptorConnection).toHaveBeenCalledWith(true);
    expect(lifecycleConnection).toHaveBeenCalledWith(true);
    expect(descriptorError).toHaveBeenCalledWith(error);
    expect(lifecycleError).toHaveBeenCalledWith(error);
    expect(descriptorEnd).toHaveBeenCalledTimes(1);
    expect(lifecycleEnd).toHaveBeenCalledWith('video');
  });

  it('ignores callbacks from a client replaced by a newer stream generation', async () => {
    const videoConfigs: Array<{
      onFrame?: (frame: VideoFrame) => void;
      onConnectionChange?: (connected: boolean) => void;
      onError?: (error: Error) => void;
      onStreamEnd?: () => void;
    }> = [];
    const onFrame = vi.fn();
    const onConnectionChange = vi.fn();
    const onError = vi.fn();
    const onStreamEnd = vi.fn();
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: (config) => {
          videoConfigs.push(config);
          return createVideoClient([], `video-${videoConfigs.length}`);
        },
      },
      callbacks: { onVideoConnectionChange: onConnectionChange, onError, onStreamEnd },
    });

    await lifecycle.start({
      video: {
        websocketUrl: 'ws://video-1',
        width: 1,
        height: 1,
        onFrame,
      },
    });
    await lifecycle.start({
      video: {
        websocketUrl: 'ws://video-2',
        width: 1,
        height: 1,
        onFrame,
      },
    });

    const staleFrame = { close: vi.fn() } as unknown as VideoFrame;
    videoConfigs[0]?.onFrame?.(staleFrame);
    videoConfigs[0]?.onConnectionChange?.(false);
    videoConfigs[0]?.onError?.(new Error('stale failure'));
    videoConfigs[0]?.onStreamEnd?.();

    expect(staleFrame.close).toHaveBeenCalledOnce();
    expect(onFrame).not.toHaveBeenCalled();
    expect(onConnectionChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onStreamEnd).not.toHaveBeenCalled();

    const activeFrame = { close: vi.fn() } as unknown as VideoFrame;
    videoConfigs[1]?.onFrame?.(activeFrame);
    videoConfigs[1]?.onConnectionChange?.(true);
    videoConfigs[1]?.onError?.(new Error('active failure'));
    videoConfigs[1]?.onStreamEnd?.();

    expect(onFrame).toHaveBeenCalledWith(activeFrame);
    expect(activeFrame.close).not.toHaveBeenCalled();
    expect(onConnectionChange).toHaveBeenCalledWith(true);
    expect(onError).toHaveBeenCalledWith(new Error('active failure'));
    expect(onStreamEnd).toHaveBeenCalledWith('video');
  });

  it('rejects a pending start after a newer stream generation replaces it', async () => {
    let releaseFirstConnection: (() => void) | undefined;
    let run = 0;
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: () => {
          run += 1;
          if (run > 1) return createVideoClient([], 'active-video');
          return {
            ...createVideoClient([], 'stale-video'),
            async connect() {
              await new Promise<void>((resolve) => {
                releaseFirstConnection = resolve;
              });
            },
          };
        },
      },
    });

    const staleStart = lifecycle.start({
      video: { websocketUrl: 'ws://video-1', width: 1, height: 1 },
    });
    await Promise.resolve();
    const activeSnapshot = await lifecycle.start({
      video: { websocketUrl: 'ws://video-2', width: 1, height: 1 },
    });
    releaseFirstConnection?.();

    await expect(staleStart).rejects.toThrow(
      'Engine AV stream generation 1 was superseded before startup.',
    );
    expect(activeSnapshot.descriptor?.video?.websocketUrl).toBe('ws://video-2');
    expect(lifecycle.getSnapshot()).toBeDefined();
    expect(lifecycle.getSnapshot().descriptor).toBe(activeSnapshot.descriptor);
  });

  it('reports stats from active clients', async () => {
    const lifecycle = new EngineAvStreamLifecycle({
      factories: {
        createVideoClient: () => createVideoClient([], 'video'),
        createAudioClient: () => createAudioClient([], 'audio'),
        createFrameScheduler: () => createScheduler([], 'scheduler'),
      },
    });

    await lifecycle.start({
      video: { websocketUrl: 'ws://video', width: 1, height: 1 },
      audio: { websocketUrl: 'ws://audio' },
    });

    expect(lifecycle.getStats()).toMatchObject({
      h264: { packetsReceived: 1 },
      audio: { packetsReceived: 2 },
      scheduler: { rendered: 3 },
    });
  });
});

function createVideoClient(events: string[], name: string): EngineAvVideoStreamClient {
  return {
    async connect() {
      events.push(`${name}.connect`);
    },
    dispose() {
      events.push(`${name}.dispose`);
    },
    getStats(): H264StreamClientStats {
      return {
        packetsReceived: 1,
        framesDecoded: 0,
        framesDropped: 0,
        framesDroppedBeforeDecode: 0,
        isConnected: true,
        isDecoderReady: true,
        avgDecodeTimeMs: 0,
        avgLatencyMs: 0,
        decodeQueueDepth: 0,
        hardwareAcceleration: false,
      };
    },
  };
}

function createAudioClient(events: string[], name: string): EngineAvAudioStreamClient {
  return {
    isClockReady: true,
    async connect() {
      events.push(`${name}.connect`);
    },
    dispose() {
      events.push(`${name}.dispose`);
    },
    getStats(): AudioStreamStats {
      return {
        packetsReceived: 2,
        isConnected: true,
        isClockReady: true,
        currentPtsSeconds: 1,
        prebuffering: false,
        driftMs: 0,
      };
    },
    getCurrentTime: () => 1,
    getAudioContext: () => null,
    getGainNode: () => null,
    setVolume: vi.fn(),
    setClockPlaybackRate: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    fadeOut: vi.fn(async () => {}),
    resetClock: vi.fn(),
  };
}

function createScheduler(events: string[], name: string): EngineAvFrameScheduler {
  return {
    enqueue: vi.fn(),
    schedule: vi.fn(() => ({ action: 'wait' as const, skipped: 0, deltaUs: 0 })),
    flush: vi.fn(),
    switchClock: vi.fn(),
    dispose() {
      events.push(`${name}.dispose`);
    },
    getStats(): FrameSchedulerStats {
      return {
        enqueued: 0,
        rendered: 3,
        skipped: 0,
        backpressure: 0,
        queueLength: 0,
        lastSyncDelta: 0,
        syncThresholdUs: 0,
        avOffsetUs: 0,
      };
    },
  };
}
