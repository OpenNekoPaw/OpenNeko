import { describe, expect, it } from 'vitest';
import { createVideoSeekGate, shouldAcceptVideoFrameAfterSeek } from './videoPlayback';

describe('video seek gate', () => {
  it('accepts frames when no seek gate is active', () => {
    expect(shouldAcceptVideoFrameAfterSeek(10_000_000, null)).toBe(true);
  });

  it('rejects stale frames before the seek target', () => {
    expect(
      shouldAcceptVideoFrameAfterSeek(2_000_000, {
        minFrameTimeSeconds: 12.4,
        maxFrameTimeSeconds: 12.75,
      }),
    ).toBe(false);
  });

  it('rejects stale frames after a backward seek target', () => {
    expect(
      shouldAcceptVideoFrameAfterSeek(30_000_000, {
        minFrameTimeSeconds: 12.4,
        maxFrameTimeSeconds: 12.75,
      }),
    ).toBe(false);
  });

  it('accepts the first frame inside the post-seek target window', () => {
    expect(
      shouldAcceptVideoFrameAfterSeek(12_450_000, {
        minFrameTimeSeconds: 12.4,
        maxFrameTimeSeconds: 12.75,
      }),
    ).toBe(true);
  });

  it('converts UI time into the video PTS timeline using the scheduler offset', () => {
    const gate = createVideoSeekGate(12.5, { avOffsetUs: 10_000_000 }, 30);

    expect(gate.minFrameTimeSeconds).toBeCloseTo(2.4);
    expect(gate.maxFrameTimeSeconds).toBeCloseTo(2.75);
  });
});
