import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlVideoClient } from './HtmlVideoClient';

describe('HtmlVideoClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('assigns the authorized URL directly without fetch or MediaSource', async () => {
    const fetch = vi.fn();
    const mediaSource = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('MediaSource', mediaSource);
    const video = createVideoStub();
    const client = new HtmlVideoClient({
      video,
      descriptor: createDescriptor(2.5),
      playbackRate: 1.25,
    });

    await client.connect();

    expect(video.src).toBe('http://127.0.0.1:1234/video');
    expect(video.playbackRate).toBe(1.25);
    expect(video.currentTime).toBe(2.5);
    expect(fetch).not.toHaveBeenCalled();
    expect(mediaSource).not.toHaveBeenCalled();
  });

  it('warms the muted decoder and restores the descriptor origin before playback', async () => {
    const video = createVideoStub();
    const client = new HtmlVideoClient({
      video,
      descriptor: createDescriptor(2.5),
      playbackRate: 1,
    });
    await client.connect();

    await client.primeForSynchronizedStart();

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    expect(video.currentTime).toBe(2.5);
  });

  it('loads an origin-zero frame without relying on a redundant seek event', async () => {
    const video = createVideoStub();
    const client = new HtmlVideoClient({
      video,
      descriptor: createDescriptor(0),
      playbackRate: 1,
    });

    await client.connect();

    expect(video.currentTime).toBe(0);
    expect(video.readyState).toBe(2);
  });

  it('projects the source origin as a zero-based Clip clock and seeks without replacing src', async () => {
    const video = createVideoStub();
    const client = new HtmlVideoClient({
      video,
      descriptor: createDescriptor(2.5),
      playbackRate: 1,
    });
    await client.connect();
    const sourceUrl = video.src;

    client.seek(4);

    expect(video.currentTime).toBe(6.5);
    expect(client.currentTimeSeconds).toBe(4);
    expect(video.src).toBe(sourceUrl);
    expect(video.load).toHaveBeenCalledTimes(1);
  });

  it('rejects non-loopback descriptors before mutating the element', async () => {
    const video = createVideoStub();
    const client = new HtmlVideoClient({
      video,
      descriptor: {
        ...createDescriptor(0),
        url: 'https://example.com/video.mp4',
      },
      playbackRate: 1,
    });

    await expect(client.connect()).rejects.toThrow('Invalid Cut HTML video descriptor');
    expect(video.load).not.toHaveBeenCalled();
  });

  it('clears the native source on disposal', async () => {
    const video = createVideoStub();
    const client = new HtmlVideoClient({
      video,
      descriptor: createDescriptor(0),
      playbackRate: 1,
    });
    await client.connect();

    client.dispose();

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledTimes(2);
  });
});

function createVideoStub(): HTMLVideoElement {
  class VideoStub extends EventTarget {
    defaultMuted = false;
    error: MediaError | null = null;
    muted = false;
    playbackRate = 1;
    playsInline = false;
    src = '';
    private mediaTime = 0;
    private mediaReadyState = 0;
    private frameSequence = 0;

    readonly load = vi.fn(() => {
      queueMicrotask(() => {
        this.mediaReadyState = 1;
        this.dispatchEvent(new Event('loadedmetadata'));
        queueMicrotask(() => {
          this.mediaReadyState = 2;
          this.dispatchEvent(new Event('loadeddata'));
        });
      });
    });
    readonly pause = vi.fn();
    readonly play = vi.fn(async () => {
      this.mediaTime += 0.1;
      queueMicrotask(() => this.dispatchEvent(new Event('timeupdate')));
    });
    readonly removeAttribute = vi.fn();
    readonly requestVideoFrameCallback = vi.fn((callback: VideoFrameRequestCallback) => {
      this.frameSequence += 1;
      queueMicrotask(() => callback(performance.now(), {} as VideoFrameCallbackMetadata));
      return this.frameSequence;
    });
    readonly cancelVideoFrameCallback = vi.fn();

    get currentTime() {
      return this.mediaTime;
    }

    set currentTime(value: number) {
      this.mediaTime = value;
      this.mediaReadyState = 2;
      queueMicrotask(() => {
        this.dispatchEvent(new Event('seeked'));
        this.dispatchEvent(new Event('loadeddata'));
      });
    }

    get readyState() {
      return this.mediaReadyState;
    }
  }
  return new VideoStub() as unknown as HTMLVideoElement;
}

function createDescriptor(mediaTimeOriginSeconds: number) {
  return {
    version: 1 as const,
    transport: 'http' as const,
    url: 'http://127.0.0.1:1234/video',
    mimeType: 'video/mp4; codecs="avc1.4d0020"',
    mediaTimeOriginSeconds,
    durationSeconds: 10,
  };
}
