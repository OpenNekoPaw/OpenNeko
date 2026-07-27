import { describe, expect, it, vi } from 'vitest';
import { MseVideoClient } from './MseVideoClient';

describe('MseVideoClient synchronized start', () => {
  it('warms the muted decoder and restores the descriptor origin before playback', async () => {
    const events: string[] = [];
    const video = {
      currentTime: 3,
      play: vi.fn(async () => {
        events.push('play');
      }),
      pause: vi.fn(() => {
        events.push('pause');
      }),
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

    await client.primeForSynchronizedStart();

    expect(events).toEqual(['play', 'pause']);
    expect(video.currentTime).toBe(0);
  });
});
