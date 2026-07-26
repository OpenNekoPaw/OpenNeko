// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HtmlVideoDescriptor, PcmStreamDescriptor } from '@neko/media';
import { InlineAudioPlayer } from './InlineAudioPlayer';
import { InlineVideoPlayer } from './InlineVideoPlayer';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const pcmMock = vi.hoisted(() => ({
  instances: [] as Array<{
    options: { onPlaybackEnd?: () => void };
    prepare: ReturnType<typeof vi.fn>;
    startAt: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('@neko/media/browser', () => ({
  PcmAudioClient: class {
    private started = false;
    readonly prepare = vi.fn().mockResolvedValue(undefined);
    readonly startAt = vi.fn().mockImplementation(async () => {
      this.started = true;
    });
    readonly dispose = vi.fn();
    readonly pause = vi.fn().mockResolvedValue(undefined);
    readonly resume = vi.fn().mockResolvedValue(undefined);
    readonly setVolume = vi.fn();

    constructor(readonly options: { onPlaybackEnd?: () => void }) {
      pcmMock.instances.push(this);
    }

    get isClockReady(): boolean {
      return this.started;
    }

    getCurrentTime(): number {
      return 0;
    }
  },
}));

vi.mock('@neko/ui/creative', () => ({
  ProgressBar: () => <div data-testid="progress-bar" />,
}));

vi.mock('@neko/ui/icons', () => ({
  PauseIcon: () => <span data-icon="pause" />,
  PlayIcon: () => <span data-icon="play" />,
  VolumeIcon: () => <span data-icon="volume" />,
  VolumeOffIcon: () => <span data-icon="volume-off" />,
}));

const audioDescriptor: PcmStreamDescriptor = {
  version: 1,
  transport: 'http',
  protocol: 'neko-pcm-f32le-v1',
  streamUrl: 'http://127.0.0.1:3000/pcm/token',
  sampleRate: 48_000,
  channels: 2,
};
const videoDescriptor: HtmlVideoDescriptor = {
  version: 1,
  transport: 'http',
  url: 'http://127.0.0.1:3000/file/token',
  mimeType: 'video/mp4',
  preparationProfile: 'h264-mp4-direct',
  durationSeconds: 2,
};

describe('Inline media players', () => {
  let host: HTMLDivElement;
  let root: Root;
  let scheduledFrame: FrameRequestCallback | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    pcmMock.instances.length = 0;
    scheduledFrame = undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_METADATA,
    );
    class AudioContextMock {
      readonly currentTime = 0;
      readonly state = 'running';
      readonly close = vi.fn().mockResolvedValue(undefined);
      readonly resume = vi.fn().mockResolvedValue(undefined);
    }
    Object.assign(globalThis, { AudioContext: AudioContextMock });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('waits for a user gesture before starting PCM and completes after playback ends', async () => {
    const onStop = vi.fn();
    const onEnded = vi.fn();
    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audio={audioDescriptor}
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

    expect(pcmMock.instances).toHaveLength(0);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[title="Play"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pcmMock.instances[0]?.prepare).toHaveBeenCalledTimes(1);
    expect(pcmMock.instances[0]?.startAt).toHaveBeenCalledWith(0.1);
    await act(async () => pcmMock.instances[0]?.options.onPlaybackEnd?.());
    expect(onStop).toHaveBeenCalledWith(2);
    expect(onEnded).toHaveBeenCalledWith(2);
  });

  it('starts tokenized video and its PCM master clock only after a user gesture', async () => {
    const onStop = vi.fn();
    const onEnded = vi.fn();
    await act(async () => {
      root.render(
        <InlineVideoPlayer
          video={videoDescriptor}
          audio={audioDescriptor}
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

    const video = host.querySelector('video');
    expect(video?.getAttribute('src')).toBeNull();
    expect(pcmMock.instances).toHaveLength(0);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[title="Play"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(video?.src).toBe(videoDescriptor.url);
    expect(video?.muted).toBe(true);
    expect(pcmMock.instances[0]?.prepare).toHaveBeenCalledTimes(1);
    expect(pcmMock.instances[0]?.startAt).toHaveBeenCalledWith(0.1);
    expect(scheduledFrame).toBeDefined();
    expect(onEnded).not.toHaveBeenCalled();
  });
});
