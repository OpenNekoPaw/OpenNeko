import { describe, expect, it, vi } from 'vitest';
import {
  createInlineVideoSeekGate,
  resetInlineVideoPlaybackForSeek,
  shouldAcceptInlineVideoFrameAfterSeek,
} from './inlineVideoPlayback';

describe('resetInlineVideoPlaybackForSeek', () => {
  it('resets video decoder, scheduler, audio clock, and local clock state on seek', () => {
    const flush = vi.fn();
    const resetDecoder = vi.fn();
    const resetClock = vi.fn();
    const currentTimeRef = { current: 1 };
    const playStartTimeRef = { current: 1 };
    const playWallTimeRef = { current: 100 };
    const clockSourceRef = { current: 'audio' as const };

    resetInlineVideoPlaybackForSeek({
      time: 12.5,
      now: () => 250,
      clock: {
        currentTimeRef,
        playStartTimeRef,
        playWallTimeRef,
        clockSourceRef,
      },
      pipeline: {
        scheduler: { flush },
        videoClient: { resetDecoder },
        audioClient: { resetClock },
      },
    });

    expect(currentTimeRef.current).toBe(12.5);
    expect(playStartTimeRef.current).toBe(12.5);
    expect(playWallTimeRef.current).toBe(250);
    expect(clockSourceRef.current).toBe('wall');
    expect(flush).toHaveBeenCalledTimes(1);
    expect(resetDecoder).toHaveBeenCalledTimes(1);
    expect(resetClock).toHaveBeenCalledTimes(1);
  });
});

describe('shouldAcceptInlineVideoFrameAfterSeek', () => {
  it('accepts all frames when no seek gate is active', () => {
    expect(shouldAcceptInlineVideoFrameAfterSeek(1_000_000, null)).toBe(true);
  });

  it('drops stale frames until the stream reaches the seek target', () => {
    expect(
      shouldAcceptInlineVideoFrameAfterSeek(2_000_000, {
        minFrameTimeSeconds: 12.4,
        maxFrameTimeSeconds: 12.75,
      }),
    ).toBe(false);
    expect(
      shouldAcceptInlineVideoFrameAfterSeek(12_450_000, {
        minFrameTimeSeconds: 12.4,
        maxFrameTimeSeconds: 12.75,
      }),
    ).toBe(true);
  });

  it('drops stale frames from a later position after a backward seek', () => {
    expect(
      shouldAcceptInlineVideoFrameAfterSeek(30_000_000, {
        minFrameTimeSeconds: 12.4,
        maxFrameTimeSeconds: 12.75,
      }),
    ).toBe(false);
  });
});

describe('createInlineVideoSeekGate', () => {
  it('translates the UI seek time into the video PTS timeline', () => {
    const gate = createInlineVideoSeekGate(12.5, { avOffsetUs: 10_000_000 }, 30);

    expect(gate.minFrameTimeSeconds).toBeCloseTo(2.4);
    expect(gate.maxFrameTimeSeconds).toBeCloseTo(2.75);
  });
});
