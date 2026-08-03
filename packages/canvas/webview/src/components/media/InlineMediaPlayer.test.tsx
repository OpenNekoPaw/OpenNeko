// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HtmlAudioDescriptor, HtmlVideoDescriptor } from '@neko/media';
import { InlineAudioPlayer } from './InlineAudioPlayer';
import { InlineVideoPlayer } from './InlineVideoPlayer';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@neko/ui/creative', () => ({
  ProgressBar: () => <div data-testid="progress-bar" />,
}));

vi.mock('@neko/ui/icons', () => ({
  PauseIcon: () => <span data-icon="pause" />,
  PlayIcon: () => <span data-icon="play" />,
  VolumeIcon: () => <span data-icon="volume" />,
  VolumeOffIcon: () => <span data-icon="volume-off" />,
}));

const audioDescriptor: HtmlAudioDescriptor = {
  version: 1,
  url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  mimeType: 'audio/wav',
  durationSeconds: 2,
};
const videoDescriptor: HtmlVideoDescriptor = {
  version: 1,
  url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  mimeType: 'video/mp4',
  preparationProfile: 'h264-mp4-direct',
  durationSeconds: 2,
};

describe('Inline media players', () => {
  let host: HTMLDivElement;
  let root: Root;
  let scheduledFrame: FrameRequestCallback | undefined;
  let play: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setLocale('en');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    scheduledFrame = undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_METADATA,
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('uses native audio after a user gesture and completes on media end', async () => {
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

    const audio = host.querySelector('audio');
    expect(audio?.src).toBe(audioDescriptor.url);
    expect(play).not.toHaveBeenCalled();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[title="Play"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => audio?.dispatchEvent(new Event('ended')));
    expect(onStop).toHaveBeenCalledWith(2);
    expect(onEnded).toHaveBeenCalledWith(2);
  });

  it('starts tokenized native video with embedded audio only after a user gesture', async () => {
    const onStop = vi.fn();
    const onEnded = vi.fn();
    await act(async () => {
      root.render(
        <InlineVideoPlayer
          video={videoDescriptor}
          hasAudio
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
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[title="Play"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(video?.src).toBe(videoDescriptor.url);
    expect(video?.muted).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
    expect(scheduledFrame).toBeDefined();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('reports one manual playback intent to the owning controlled surface', async () => {
    const onPlaybackInteraction = vi.fn();
    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audio={audioDescriptor}
          duration={2}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={() => undefined}
          onPlaybackInteraction={onPlaybackInteraction}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[title="Play"]')?.click();
      await Promise.resolve();
    });

    expect(onPlaybackInteraction).toHaveBeenCalledTimes(1);
    expect(onPlaybackInteraction).toHaveBeenCalledWith('playing', 0);
    expect(play).not.toHaveBeenCalled();
  });

  it('starts prepared native audio without a redundant initial seek', async () => {
    const onSeek = vi.fn();
    await act(async () => {
      root.render(
        <React.StrictMode>
          <InlineAudioPlayer
            audio={audioDescriptor}
            duration={2}
            startTime={0.75}
            playbackState="playing"
            playbackRequestId="audio-request-1"
            playbackStartTime={0.75}
            onPause={() => undefined}
            onResume={() => undefined}
            onSeek={onSeek}
            onStop={() => undefined}
          />
        </React.StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSeek).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
  });

  it('starts a prepared video stream without replacing it through a redundant initial seek', async () => {
    const onSeek = vi.fn();
    await act(async () => {
      root.render(
        <React.StrictMode>
          <InlineVideoPlayer
            video={videoDescriptor}
            hasAudio
            width={320}
            height={180}
            fps={24}
            duration={2}
            startTime={0.75}
            playbackState="playing"
            playbackRequestId="video-request-1"
            playbackStartTime={0.75}
            onPause={() => undefined}
            onResume={() => undefined}
            onSeek={onSeek}
            onStop={() => undefined}
          />
        </React.StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSeek).not.toHaveBeenCalled();
    expect(host.querySelector('video')?.src).toBe(videoDescriptor.url);
    expect(play).toHaveBeenCalled();
  });

  it('preserves the Canvas node-card UI on the native audio path', async () => {
    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audio={audioDescriptor}
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
    expect(host.querySelector<HTMLButtonElement>('button[title="Play"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[title="Mute"]')).not.toBeNull();
  });

  it('localizes native media controls without starting playback on mount', async () => {
    setLocale('zh-cn');
    await act(async () => {
      root.render(
        <InlineAudioPlayer
          audio={audioDescriptor}
          duration={2}
          onPause={() => undefined}
          onResume={() => undefined}
          onSeek={() => undefined}
          onStop={() => undefined}
        />,
      );
      await Promise.resolve();
    });

    expect(play).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLButtonElement>('button[title="播放"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[title="静音"]')).not.toBeNull();
  });
});
