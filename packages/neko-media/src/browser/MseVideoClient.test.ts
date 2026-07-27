import { describe, expect, it, vi } from 'vitest';
import { MseVideoClient } from './MseVideoClient';

describe('MseVideoClient synchronized start', () => {
  it('warms the muted decoder and restores the descriptor origin before playback', async () => {
    const events: string[] = [];
    const pendingFrames: Array<() => void> = [];
    let currentTime = 3;
    const video = {
      play: vi.fn(async () => {
        events.push('play');
        currentTime = 0.12;
      }),
      pause: vi.fn(() => {
        events.push('pause');
      }),
      requestVideoFrameCallback: vi.fn((callback: () => void) => {
        pendingFrames.push(callback);
        return pendingFrames.length;
      }),
      get currentTime() {
        return currentTime;
      },
      set currentTime(value: number) {
        currentTime = value;
      },
    } as unknown as HTMLVideoElement;
    const client = new MseVideoClient({
      video,
      descriptor: {
        version: 1,
        transport: 'http-mse',
        mimeType: 'video/mp4; codecs="avc1.4d0020"',
        preparationProfile: 'h264-fragmented-mp4-copy',
        mediaTimeOriginSeconds: 0,
        durationSeconds: 10,
        segments: [
          {
            index: 0,
            startTimeSeconds: 0,
            endTimeSeconds: 10,
            url: 'http://127.0.0.1:1234/video',
          },
        ],
      },
      playbackRate: 1,
    });

    let primed = false;
    const prime = client.primeForSynchronizedStart().then(() => {
      primed = true;
    });
    await Promise.resolve();

    expect(primed).toBe(false);
    pendingFrames.shift()?.();
    await Promise.resolve();
    expect(primed).toBe(false);
    expect(video.currentTime).toBe(0);
    pendingFrames.shift()?.();
    await prime;

    expect(events).toEqual(['play', 'pause']);
    expect(video.currentTime).toBe(0);
  });

  it('projects a GOP pre-roll origin as zero-based playback clock time', () => {
    const video = { currentTime: 2.75 } as HTMLVideoElement;
    const client = new MseVideoClient({
      video,
      descriptor: {
        version: 1,
        transport: 'http-mse',
        mimeType: 'video/mp4; codecs="avc1.4d0020"',
        preparationProfile: 'h264-fragmented-mp4-copy',
        mediaTimeOriginSeconds: 2.5,
        durationSeconds: 10,
        segments: [
          {
            index: 0,
            startTimeSeconds: 0,
            endTimeSeconds: 12.5,
            url: 'http://127.0.0.1:1234/video',
          },
        ],
      },
      playbackRate: 1,
    });

    expect(client.currentTimeSeconds).toBeCloseTo(0.25);
  });

  it('seeks inside the prepared GOP interval without replacing the media source', () => {
    const video = { currentTime: 2.5, pause: vi.fn() } as unknown as HTMLVideoElement;
    const client = new MseVideoClient({
      video,
      descriptor: {
        version: 1,
        transport: 'http-mse',
        mimeType: 'video/mp4; codecs="avc1.4d0020"',
        preparationProfile: 'h264-fragmented-mp4-copy',
        mediaTimeOriginSeconds: 2.5,
        durationSeconds: 10,
        segments: [
          {
            index: 0,
            startTimeSeconds: 0,
            endTimeSeconds: 12.5,
            url: 'http://127.0.0.1:1234/video',
          },
        ],
      },
      playbackRate: 1,
    });

    client.pause();
    client.seek(4);

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(6.5);
    expect(client.currentTimeSeconds).toBe(4);
  });
});
