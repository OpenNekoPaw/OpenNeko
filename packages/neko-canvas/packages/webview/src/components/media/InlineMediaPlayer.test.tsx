// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineAudioPlayer } from './InlineAudioPlayer';
import { InlineVideoPlayer } from './InlineVideoPlayer';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type StreamEndCallback = (kind: 'video' | 'audio') => void;

const lifecycleMock = vi.hoisted(() => ({
  callbacks: [] as Array<{ onStreamEnd?: StreamEndCallback }>,
  start: vi.fn<(descriptor: unknown) => Promise<unknown>>(),
  stop: vi.fn<() => void>(),
  audioPause: vi.fn<() => void>(),
  audioResume: vi.fn<() => void>(),
  videoFlush: vi.fn<() => void>(),
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
    setLocale('en');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    lifecycleMock.callbacks.length = 0;
    lifecycleMock.start.mockClear();
    lifecycleMock.stop.mockClear();
    lifecycleMock.audioPause.mockClear();
    lifecycleMock.audioResume.mockClear();
    lifecycleMock.videoFlush.mockClear();
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

  it('renders the canonical audio playback controls without waveform bars', async () => {
    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audioStreamUrl="ws://audio"
          duration={2}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    expect(host.querySelectorAll('[class~="w-1.5"]')).toHaveLength(0);
    expect(host.querySelector('[data-testid="progress-bar"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[title="Pause"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[title="Mute"]')).not.toBeNull();
  });

  it('renders the Canvas node audio layout as one waveform card surface', async () => {
    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audioStreamUrl="ws://audio"
          duration={185}
          audioLayout="node-card"
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    expect(host.querySelector('[data-testid="canvas-audio-waveform"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-audio-node-controls"]')).not.toBeNull();
    expect(host.querySelector('.canvas-audio-transport')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[title="Pause"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[title="Mute"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[title="Download"]')).toBeNull();
  });

  it.each([
    {
      kind: 'audio',
      render: (state: 'playing' | 'paused', requestId: string) => (
        <InlineAudioPlayer
          audioStreamUrl="ws://audio"
          duration={185}
          playbackState={state}
          playbackRequestId={requestId}
          playbackStartTime={0}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={() => undefined}
        />
      ),
    },
    {
      kind: 'video',
      render: (state: 'playing' | 'paused', requestId: string) => (
        <InlineVideoPlayer
          videoStreamUrl="ws://video"
          audioStreamUrl="ws://audio"
          width={320}
          height={180}
          fps={24}
          duration={26}
          playbackState={state}
          playbackRequestId={requestId}
          playbackStartTime={0}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={() => undefined}
        />
      ),
    },
  ])(
    'keeps controlled $kind playback aligned with the session across mount and state changes',
    async ({ render }) => {
      await act(async () => {
        root.render(render('paused', 'request-1'));
        await Promise.resolve();
      });

      expect(host.querySelector<HTMLButtonElement>('button[title="Play"]')).not.toBeNull();
      expect(lifecycleMock.audioPause).toHaveBeenCalled();

      await act(async () => {
        root.render(render('playing', 'request-2'));
      });

      expect(host.querySelector<HTMLButtonElement>('button[title="Pause"]')).not.toBeNull();
      expect(lifecycleMock.audioResume).toHaveBeenCalled();

      const pauseCallsBeforeFinalTransition = lifecycleMock.audioPause.mock.calls.length;
      await act(async () => {
        root.render(render('paused', 'request-3'));
      });

      expect(host.querySelector<HTMLButtonElement>('button[title="Play"]')).not.toBeNull();
      expect(lifecycleMock.audioPause).toHaveBeenCalledTimes(pauseCallsBeforeFinalTransition + 1);
    },
  );

  it.each([
    {
      kind: 'audio',
      streamKind: 'audio' as const,
      render: (
        state: 'playing' | 'paused',
        onStop: (currentTime: number) => void,
        onEnded: (currentTime: number) => void,
      ) => (
        <InlineAudioPlayer
          audioStreamUrl="ws://audio"
          duration={185}
          playbackState={state}
          playbackRequestId={`audio-${state}`}
          playbackStartTime={4}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={onStop}
          onEnded={onEnded}
        />
      ),
    },
    {
      kind: 'video',
      streamKind: 'video' as const,
      render: (
        state: 'playing' | 'paused',
        onStop: (currentTime: number) => void,
        onEnded: (currentTime: number) => void,
      ) => (
        <InlineVideoPlayer
          videoStreamUrl="ws://video"
          audioStreamUrl="ws://audio"
          width={320}
          height={180}
          fps={24}
          duration={26}
          playbackState={state}
          playbackRequestId={`video-${state}`}
          playbackStartTime={4}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={onStop}
          onEnded={onEnded}
        />
      ),
    },
  ])(
    'does not treat a controlled $kind stream closure during pause as playback completion',
    async ({ render, streamKind }) => {
      const onStop = vi.fn<(currentTime: number) => void>();
      const onEnded = vi.fn<(currentTime: number) => void>();

      await act(async () => {
        root.render(render('playing', onStop, onEnded));
        await Promise.resolve();
      });
      await act(async () => {
        root.render(render('paused', onStop, onEnded));
      });
      await act(async () => {
        lifecycleMock.callbacks[0]?.onStreamEnd?.(streamKind);
      });

      expect(onStop).not.toHaveBeenCalled();
      expect(onEnded).not.toHaveBeenCalled();
      expect(host.querySelector<HTMLButtonElement>('button[title="Play"]')).not.toBeNull();
    },
  );

  it.each([
    {
      kind: 'audio',
      streamKind: 'audio' as const,
      render: (onStop: (currentTime: number) => void, onEnded: (currentTime: number) => void) => (
        <InlineAudioPlayer
          audioStreamUrl="ws://audio"
          duration={185}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={onStop}
          onEnded={onEnded}
        />
      ),
    },
    {
      kind: 'video',
      streamKind: 'video' as const,
      render: (onStop: (currentTime: number) => void, onEnded: (currentTime: number) => void) => (
        <InlineVideoPlayer
          videoStreamUrl="ws://video"
          audioStreamUrl="ws://audio"
          width={320}
          height={180}
          fps={24}
          duration={26}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={onStop}
          onEnded={onEnded}
        />
      ),
    },
  ])(
    'keeps a locally paused Canvas $kind node out of the completion path',
    async ({ render, streamKind }) => {
      const onStop = vi.fn<(currentTime: number) => void>();
      const onEnded = vi.fn<(currentTime: number) => void>();

      await act(async () => {
        root.render(render(onStop, onEnded));
        await Promise.resolve();
      });
      act(() => {
        host.querySelector<HTMLButtonElement>('button[title="Pause"]')?.click();
      });
      await act(async () => {
        lifecycleMock.callbacks[0]?.onStreamEnd?.(streamKind);
      });

      expect(onStop).not.toHaveBeenCalled();
      expect(onEnded).not.toHaveBeenCalled();
      expect(host.querySelector<HTMLButtonElement>('button[title="Play"]')).not.toBeNull();
    },
  );

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

  it('localizes media playback controls', async () => {
    setLocale('zh-cn');

    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audioStreamUrl="ws://audio"
          duration={2}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    const playbackButton = host.querySelector<HTMLButtonElement>('button[title="暂停"]');
    const muteButton = host.querySelector<HTMLButtonElement>('button[title="静音"]');
    expect(playbackButton?.getAttribute('aria-label')).toBe('暂停');
    expect(muteButton?.getAttribute('aria-label')).toBe('静音');

    act(() => {
      playbackButton?.click();
      muteButton?.click();
    });

    expect(playbackButton?.title).toBe('播放');
    expect(playbackButton?.getAttribute('aria-label')).toBe('播放');
    expect(muteButton?.title).toBe('取消静音');
    expect(muteButton?.getAttribute('aria-label')).toBe('取消静音');
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
    pause: lifecycleMock.audioPause,
    resume: lifecycleMock.audioResume,
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
    flush: lifecycleMock.videoFlush,
    switchClock: vi.fn<(newMasterClockUs: number) => void>(),
    dispose: vi.fn<() => void>(),
    getStats: vi.fn<() => null>().mockReturnValue(null),
  };
}
