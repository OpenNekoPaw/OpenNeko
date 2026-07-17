// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineAudioPlayer } from './InlineAudioPlayer';
import { InlineVideoPlayer } from './InlineVideoPlayer';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type StreamEndCallback = (kind: 'video' | 'audio') => void;

const lifecycleMock = vi.hoisted(() => ({
  callbacks: [] as Array<{ onStreamEnd?: StreamEndCallback }>,
  start: vi.fn<(descriptor: unknown) => Promise<unknown>>(),
  stop: vi.fn<() => void>(),
}));

vi.mock('@neko/neko-client', () => {
  class EngineAvStreamLifecycle {
    private readonly callbacks: {
      onClientsChanged?: (clients: unknown) => void;
      onStreamEnd?: StreamEndCallback;
    };

    constructor(
      options: {
        readonly callbacks?: {
          readonly onClientsChanged?: (clients: unknown) => void;
          readonly onStreamEnd?: StreamEndCallback;
        };
      } = {},
    ) {
      this.callbacks = options.callbacks ?? {};
      lifecycleMock.callbacks.push(this.callbacks);
    }

    async start(descriptor: unknown): Promise<unknown> {
      lifecycleMock.start(descriptor);
      this.callbacks.onClientsChanged?.({
        videoClient: createVideoClient(),
        audioClient: createAudioClient(),
        scheduler: createScheduler(),
      });
      return {
        descriptor,
        videoClient: createVideoClient(),
        audioClient: createAudioClient(),
        scheduler: createScheduler(),
      };
    }

    stop(): void {
      lifecycleMock.stop();
    }
  }

  return {
    EngineAvStreamLifecycle,
    formatTime: (time: number) => String(Math.round(time)),
  };
});

vi.mock('@neko/ui/creative', () => ({
  ProgressBar: () => <div data-testid="progress-bar" />,
}));

vi.mock('@neko/ui/icons', () => ({
  PauseIcon: ({ size = 16 }: { size?: number }) => <span data-icon="pause">{size}</span>,
  PlayIcon: ({ size = 16 }: { size?: number }) => <span data-icon="play">{size}</span>,
  VolumeIcon: ({ size = 16 }: { size?: number }) => <span data-icon="volume">{size}</span>,
  VolumeOffIcon: ({ size = 16 }: { size?: number }) => <span data-icon="volume-off">{size}</span>,
}));

describe('Inline media players', () => {
  let host: HTMLDivElement;
  let root: Root;
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
  let cancelAnimationFrameSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    lifecycleMock.callbacks.length = 0;
    lifecycleMock.start.mockClear();
    lifecycleMock.stop.mockClear();
    requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);
    cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('completes route-controlled audio playback when the engine audio stream ends', async () => {
    const onStop = vi.fn<(currentTime: number) => void>();
    const onEnded = vi.fn<(currentTime: number) => void>();

    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audioStreamUrl="ws://audio"
          duration={2}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={onStop}
          onEnded={onEnded}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      lifecycleMock.callbacks[0]?.onStreamEnd?.('audio');
      lifecycleMock.callbacks[0]?.onStreamEnd?.('audio');
    });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith(2);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(2);
  });

  it('waits for video stream end before completing video playback when audio ends first', async () => {
    const onStop = vi.fn<(currentTime: number) => void>();
    const onEnded = vi.fn<(currentTime: number) => void>();

    await act(async () => {
      root.render(
        <InlineVideoPlayer
          videoStreamUrl="ws://video"
          audioStreamUrl="ws://audio"
          width={320}
          height={180}
          fps={24}
          duration={2}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={onStop}
          onEnded={onEnded}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      lifecycleMock.callbacks[0]?.onStreamEnd?.('audio');
    });

    expect(onEnded).not.toHaveBeenCalled();

    await act(async () => {
      lifecycleMock.callbacks[0]?.onStreamEnd?.('video');
      lifecycleMock.callbacks[0]?.onStreamEnd?.('video');
    });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith(2);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(2);
  });
});

function createAudioClient() {
  return {
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dispose: vi.fn<() => void>(),
    getStats: vi.fn<() => Record<string, unknown>>().mockReturnValue({}),
    getCurrentTime: vi.fn<() => number>().mockReturnValue(0),
    isClockReady: false,
    getAudioContext: vi.fn<() => null>().mockReturnValue(null),
    getGainNode: vi.fn<() => null>().mockReturnValue(null),
    setVolume: vi.fn<(volume: number) => void>(),
    setClockPlaybackRate: vi.fn<(rate: number) => void>(),
    pause: vi.fn<() => void>(),
    resume: vi.fn<() => void>(),
    fadeOut: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    resetClock: vi.fn<() => void>(),
  };
}

function createVideoClient() {
  return {
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dispose: vi.fn<() => void>(),
    getStats: vi.fn<() => { framesDecoded: number }>().mockReturnValue({ framesDecoded: 1 }),
  };
}

function createScheduler() {
  return {
    enqueue: vi.fn<(frame: VideoFrame) => void>(),
    schedule: vi.fn<() => { action: 'wait'; delayMs: number }>().mockReturnValue({
      action: 'wait',
      delayMs: 0,
    }),
    flush: vi.fn<() => void>(),
    switchClock: vi.fn<(newMasterClockUs: number) => void>(),
    dispose: vi.fn<() => void>(),
    getStats: vi.fn<() => null>().mockReturnValue(null),
  };
}
