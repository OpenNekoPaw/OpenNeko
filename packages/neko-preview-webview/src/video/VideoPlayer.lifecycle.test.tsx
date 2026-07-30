// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, {
  AudioContext: class {
    readonly state = 'running';

    resume(): Promise<void> {
      return Promise.resolve();
    }

    close(): Promise<void> {
      return Promise.resolve();
    }
  },
});

const messageHandlers = vi.hoisted(() => new Set<(message: unknown) => void>());
const pause = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());
const play = vi.hoisted(() => vi.fn(async () => undefined));
const postMessage = vi.hoisted(() => vi.fn());
const readyMessages = vi.hoisted(() => vi.fn());
const pcmClients = vi.hoisted(() => ({
  instances: [] as Array<{
    readonly options: { readonly onPlaybackEnd?: () => void };
    readonly dispose: ReturnType<typeof vi.fn>;
  }>,
  connectBehaviors: [] as Array<() => Promise<void>>,
}));
const videoControls = vi.hoisted(() => ({
  onSeek: undefined as ((time: number) => void) | undefined,
  onTogglePlay: undefined as (() => void) | undefined,
}));

vi.mock('@neko/media/browser', () => ({
  PcmAudioClient: class {
    readonly dispose = vi.fn();
    readonly isClockReady = false;

    constructor(readonly options: { readonly onPlaybackEnd?: () => void }) {
      pcmClients.instances.push(this);
    }

    connect(): Promise<void> {
      return pcmClients.connectBehaviors.shift()?.() ?? Promise.resolve();
    }

    getCurrentTime(): number {
      return 0;
    }

    pause(): Promise<void> {
      return Promise.resolve();
    }

    resume(): Promise<void> {
      return Promise.resolve();
    }

    setVolume(): void {}
  },
}));

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../shared/useHostMessage', () => ({
  useExtensionMessage: (handler: (message: unknown) => void) => {
    messageHandlers.clear();
    messageHandlers.add(handler);
  },
  useHostReady: (message: unknown) => {
    readyMessages(message);
    return { postMessage };
  },
}));

vi.mock('./VideoControls', () => ({
  VideoControls: (props: { onSeek: (time: number) => void; onTogglePlay: () => void }) => {
    videoControls.onSeek = props.onSeek;
    videoControls.onTogglePlay = props.onTogglePlay;
    return <div data-testid="video-controls" />;
  },
}));

describe('Preview VideoPlayer native playback lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    messageHandlers.clear();
    pause.mockClear();
    load.mockClear();
    play.mockClear();
    postMessage.mockClear();
    readyMessages.mockClear();
    pcmClients.instances.length = 0;
    pcmClients.connectBehaviors.length = 0;
    videoControls.onSeek = undefined;
    videoControls.onTogglePlay = undefined;
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type) =>
      type.includes('video/mp4') && (type.includes('av01') || type.includes('vp09'))
        ? 'probably'
        : '',
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(3);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    messageHandlers.clear();
  });

  it('attaches the tokenized HTTP descriptor to a native video element and releases it', async () => {
    await act(async () => root.render(<VideoPlayer />));
    expect(readyMessages).toHaveBeenCalledWith({
      type: 'ready',
      nativeVideoCapabilities: { version: 1, av1Mp4: false, vp9Mp4: true },
    });
    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 640,
          height: 360,
          fps: 24,
          duration: 10,
          codec: 'h264',
          format: 'mp4',
          hasAudio: false,
        },
        displayName: 'fixture.mp4',
      },
    });
    await emit({
      type: 'preview:playbackReady',
      payload: {
        video: {
          version: 1,
          transport: 'http',
          url: 'http://127.0.0.1:4567/media/token',
          mimeType: 'video/mp4',
          preparationProfile: 'h264-mp4-direct',
          durationSeconds: 10,
        },
        startTime: 2,
        playbackRate: 1,
      },
    });

    await vi.waitFor(() => {
      expect(host.querySelector('video')?.src).toBe('http://127.0.0.1:4567/media/token');
    });
    const video = host.querySelector('video');
    expect(video?.muted).toBe(true);
    expect(play).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });

  it('keeps playback available when optional poster capture fails', async () => {
    await act(async () => root.render(<VideoPlayer />));
    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 3840,
          height: 2160,
          fps: 24,
          duration: 100,
          codec: 'av1',
          format: 'mp4',
          hasAudio: false,
        },
        displayName: '4K.mp4',
      },
    });
    await emit({
      type: 'preview:operationFailed',
      payload: {
        operation: 'captureFrame',
        code: 'hdr-poster-unavailable',
        message:
          'HDR frame capture would require a CPU video-filter/readback path and is disabled.',
      },
    });

    const notice = host.querySelector('[role="status"]');
    expect(notice?.textContent).toContain('preview.video.hdrPosterUnavailableTitle');
    expect(notice?.textContent).toContain('preview.video.hdrPosterUnavailableDescription');
    expect(host.textContent).not.toContain('CPU video-filter/readback');
    expect(host.querySelector('video')).not.toBeNull();
    expect(host.querySelector('button')).not.toBeNull();
    expect(host.querySelector('[data-testid="video-controls"]')).not.toBeNull();
  });

  it('does not request poster capture before the Host selects a playback route', async () => {
    await act(async () => root.render(<VideoPlayer />));
    postMessage.mockClear();

    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 3840,
          height: 2160,
          fps: 24,
          duration: 100,
          codec: 'av1',
          format: 'mp4',
          hasAudio: false,
        },
        displayName: '4K.mp4',
      },
    });

    expect(postMessage).not.toHaveBeenCalledWith({ type: 'preview:captureFrame', time: 0 });
  });

  it('keeps the player mounted and localizes an unavailable AV1 hardware decoder', async () => {
    await act(async () => root.render(<VideoPlayer />));
    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 3840,
          height: 2160,
          fps: 24,
          duration: 100,
          codec: 'av1',
          format: 'mp4',
          hasAudio: true,
        },
        displayName: '4K.mp4',
      },
    });
    await emit({
      type: 'preview:operationFailed',
      payload: {
        operation: 'captureFrame',
        code: 'hdr-poster-unavailable',
        message:
          'HDR frame capture would require a CPU video-filter/readback path and is disabled.',
      },
    });
    await emit({
      type: 'preview:operationFailed',
      payload: {
        operation: 'playback',
        code: 'hardware-decoder-unavailable',
        message: 'Media runtime is unavailable for AV1 VideoToolbox decoder.',
      },
    });

    const notice = host.querySelector('[role="alert"]');
    expect(notice?.textContent).toContain('preview.video.hardwareDecoderUnavailableTitle');
    expect(notice?.textContent).toContain('preview.video.hardwareDecoderUnavailableDescription');
    expect(host.textContent).not.toContain('Media runtime is unavailable');
    expect(host.querySelector('video')).not.toBeNull();
    expect(host.querySelector('[data-testid="video-controls"]')).not.toBeNull();
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it('keeps the video element mounted while a playing seek replaces its source', async () => {
    await act(async () => root.render(<VideoPlayer />));
    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 640,
          height: 360,
          fps: 24,
          duration: 10,
          codec: 'h264',
          format: 'mp4',
          hasAudio: false,
        },
        displayName: 'fixture.mp4',
      },
    });
    await emit({
      type: 'preview:playbackReady',
      payload: {
        video: {
          version: 1,
          transport: 'http',
          url: 'http://127.0.0.1:4567/media/token',
          mimeType: 'video/mp4',
          preparationProfile: 'h264-mp4-direct',
          durationSeconds: 10,
        },
        startTime: 0,
        playbackRate: 1,
      },
    });

    const video = host.querySelector('video');
    expect(video).not.toBeNull();
    await act(async () => videoControls.onSeek?.(6));
    expect(host.querySelector('video')).toBe(video);
    expect(video?.src).toBe('http://127.0.0.1:4567/media/token');
    video?.removeAttribute('src');
    await act(async () => video?.dispatchEvent(new Event('error')));

    expect(host.querySelector('video')).toBe(video);
    expect(postMessage).toHaveBeenCalledWith({ type: 'preview:seek', time: 6, speed: 1 });
    expect(
      postMessage.mock.calls.filter(([message]) => message.type === 'preview:seek'),
    ).toHaveLength(1);
  });

  it('replaces a spent PCM generation after EOF without reloading the video source', async () => {
    await act(async () => root.render(<VideoPlayer />));
    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 3840,
          height: 2160,
          fps: 24,
          duration: 100,
          codec: 'av1',
          format: 'mp4',
          hasAudio: true,
        },
        displayName: '4K.mp4',
      },
    });
    await act(async () => videoControls.onTogglePlay?.());
    postMessage.mockClear();
    await emit({
      type: 'preview:playbackReady',
      payload: {
        video: {
          version: 1,
          transport: 'http',
          url: 'http://127.0.0.1:4567/media/stable-video-token',
          mimeType: 'video/mp4',
          preparationProfile: 'av1-mp4-direct',
          durationSeconds: 100,
        },
        audio: {
          version: 1,
          transport: 'http',
          protocol: 'neko-pcm-f32le-v1',
          streamUrl: 'http://127.0.0.1:4567/media/pcm-generation-1',
          sampleRate: 48_000,
          channels: 2,
        },
        startTime: 0,
        playbackRate: 1,
      },
    });

    const video = host.querySelector('video');
    await vi.waitFor(() => expect(pcmClients.instances).toHaveLength(1));
    const loadCount = load.mock.calls.length;
    await act(async () => pcmClients.instances[0]?.options.onPlaybackEnd?.());

    expect(pcmClients.instances[0]?.dispose).toHaveBeenCalledOnce();
    postMessage.mockClear();
    await act(async () => videoControls.onTogglePlay?.());

    expect(postMessage).toHaveBeenCalledWith({
      type: 'preview:play',
      startTime: 0,
      speed: 1,
    });
    expect(postMessage).not.toHaveBeenCalledWith({ type: 'preview:resume' });
    expect(host.querySelector('video')).toBe(video);
    expect(video?.src).toBe('http://127.0.0.1:4567/media/stable-video-token');
    expect(load).toHaveBeenCalledTimes(loadCount);
  });

  it('keeps the player mounted when a superseded PCM connection rejects', async () => {
    const firstConnection = deferred<void>();
    pcmClients.connectBehaviors.push(
      () => firstConnection.promise,
      () => Promise.resolve(),
    );
    await act(async () => root.render(<VideoPlayer />));
    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 3840,
          height: 2160,
          fps: 24,
          duration: 100,
          codec: 'av1',
          format: 'mp4',
          hasAudio: true,
        },
        displayName: '4K.mp4',
      },
    });
    await act(async () => videoControls.onTogglePlay?.());
    const video = host.querySelector('video');
    const descriptor = {
      version: 1 as const,
      transport: 'http' as const,
      url: 'http://127.0.0.1:4567/media/stable-video-token',
      mimeType: 'video/mp4',
      preparationProfile: 'av1-mp4-direct' as const,
      durationSeconds: 100,
    };
    await emit({
      type: 'preview:playbackReady',
      payload: {
        video: descriptor,
        audio: pcmDescriptor('generation-1'),
        startTime: 0,
        playbackRate: 1,
      },
    });
    await vi.waitFor(() => expect(pcmClients.instances).toHaveLength(1));
    await emit({
      type: 'preview:playbackReady',
      payload: {
        video: descriptor,
        audio: pcmDescriptor('generation-2'),
        startTime: 20,
        playbackRate: 1,
      },
    });
    await vi.waitFor(() => expect(pcmClients.instances).toHaveLength(2));

    firstConnection.reject(new Error('superseded PCM request was aborted'));
    await act(async () => Promise.resolve());

    expect(host.querySelector('video')).toBe(video);
    expect(host.textContent).not.toContain('superseded PCM request was aborted');
    expect(video?.src).toBe(descriptor.url);
    expect(pcmClients.instances[0]?.dispose).toHaveBeenCalled();
  });
});

async function emit(message: unknown): Promise<void> {
  await act(async () => {
    for (const handler of messageHandlers) handler(message);
    await Promise.resolve();
  });
}

function pcmDescriptor(generation: string) {
  return {
    version: 1 as const,
    transport: 'http' as const,
    protocol: 'neko-pcm-f32le-v1' as const,
    streamUrl: `http://127.0.0.1:4567/media/pcm-${generation}`,
    sampleRate: 48_000,
    channels: 2,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
