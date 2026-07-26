// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pcmMock = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn(),
}));

vi.mock('@neko/media/browser', () => ({
  PcmAudioClient: class {
    readonly isClockReady = false;
    readonly connect = pcmMock.connect;
    readonly dispose = pcmMock.dispose;
    readonly pause = vi.fn().mockResolvedValue(undefined);
    readonly resume = vi.fn().mockResolvedValue(undefined);

    getCurrentTime(): number {
      return 0;
    }
  },
}));

describe('narrative preview media runtime', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_METADATA,
    );
    class AudioContextMock {
      readonly state = 'running';
      readonly close = vi.fn().mockResolvedValue(undefined);
      readonly resume = vi.fn().mockResolvedValue(undefined);
    }
    Object.assign(globalThis, { AudioContext: AudioContextMock });
  });

  afterEach(() => {
    window.__nekoNarrativePreviewMediaRuntime?.dispose('surface-a');
    document.body.replaceChildren();
    pcmMock.connect.mockClear();
    pcmMock.dispose.mockClear();
    vi.restoreAllMocks();
  });

  it('formats mounted media time labels through the shared media formatter', async () => {
    await import('./narrativePreviewMediaRuntime');
    const container = document.createElement('div');
    document.body.appendChild(container);

    window.__nekoNarrativePreviewMediaRuntime?.mount({
      surfaceId: 'surface-a',
      container,
      mediaType: 'video',
      startTime: 65.678,
      duration: 3661.2,
    });

    expect(container.querySelector('.neko-preview-media-time')?.textContent).toBe('1:05 / 1:01:01');
  });

  it('connects tokenized HTTP video and PCM descriptors, then disposes PCM', async () => {
    await import('./narrativePreviewMediaRuntime');
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.__nekoNarrativePreviewMediaRuntime?.mount({
      surfaceId: 'surface-a',
      container,
      mediaType: 'video',
      duration: 10,
    });

    window.__nekoNarrativePreviewMediaRuntime?.handleHostMessage({
      type: 'media:streamReady',
      nodeId: 'surface-a',
      video: {
        version: 1,
        transport: 'http',
        url: 'http://127.0.0.1:3000/file/video',
        mimeType: 'video/mp4',
        preparationProfile: 'h264-mp4-direct',
        durationSeconds: 10,
      },
      audio: {
        version: 1,
        transport: 'http',
        protocol: 'neko-pcm-f32le-v1',
        streamUrl: 'http://127.0.0.1:3000/pcm/audio',
        sampleRate: 48_000,
        channels: 2,
      },
      mediaInfo: { duration: 10, width: 640, height: 360, fps: 24 },
      startTime: 0,
      playbackRate: 1,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(pcmMock.connect).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLVideoElement>('video')?.src).toBe(
      'http://127.0.0.1:3000/file/video',
    );

    window.__nekoNarrativePreviewMediaRuntime?.dispose('surface-a');
    expect(pcmMock.dispose).toHaveBeenCalled();
  });
});
