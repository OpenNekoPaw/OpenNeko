import { describe, expect, it } from 'vitest';
import type { TimelineItemView } from '@neko-cut/domain';
import {
  buildRulerTicks,
  clampTimelineTime,
  findTimelineInsertionIndex,
  quantizeTimelineDelta,
  quantizeTimelineTime,
  readClipTrimCapacity,
  retainTimelineCanvasDuration,
  snapTimelineTime,
  timelineTimeFromClientX,
  TRACK_HEADER_WIDTH,
} from './timelineMath';

const items: readonly TimelineItemView[] = [
  { kind: 'gap', startSeconds: 0, durationSeconds: 2 },
  {
    kind: 'clip',
    clipId: 'clip-1',
    name: 'clip.mp4',
    targetUrl: '../clip.mp4',
    startSeconds: 2,
    durationSeconds: 4,
    sourceStartSeconds: 0,
    playbackRate: 1,
    enabled: true,
    locked: false,
    audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
  },
];

describe('timeline presentation math', () => {
  it('keeps negative frame deltas so a trimmed edge can be extended again', () => {
    expect(quantizeTimelineDelta(-0.049, 1 / 30)).toBeCloseTo(-1 / 30);
  });

  it('retains the timeline canvas extent when an edge trim shortens the document', () => {
    expect(retainTimelineCanvasDuration(45, 30)).toBe(45);
    expect(retainTimelineCanvasDuration(45, 60)).toBe(60);
    expect(retainTimelineCanvasDuration(undefined, 4)).toBe(10);
  });

  it('derives independent start/end extension from a non-zero available range', () => {
    const clip = items[1];
    if (!clip || clip.kind !== 'clip') throw new Error('Clip fixture missing.');
    expect(
      readClipTrimCapacity({
        ...clip,
        sourceAvailableStartSeconds: 5,
        sourceAvailableDurationSeconds: 20,
        sourceStartSeconds: 8,
        durationSeconds: 4,
        playbackRate: 2,
      }),
    ).toEqual({ startExtensionSeconds: 1.5, endExtensionSeconds: 4.5 });
  });

  it('clamps pointer positions to the temporary timeline range', () => {
    expect(timelineTimeFromClientX(150, 50, 20, 12)).toBe(5);
    // A scrolled Track row already exposes its scroll offset through its client rect.
    const scrolledRowLeft = -80;
    expect(
      timelineTimeFromClientX(
        scrolledRowLeft + TRACK_HEADER_WIDTH + 100,
        scrolledRowLeft + TRACK_HEADER_WIDTH,
        20,
        12,
      ),
    ).toBe(5);
    expect(timelineTimeFromClientX(10, 50, 20, 12)).toBe(0);
    expect(clampTimelineTime(20, 12)).toBe(12);
  });

  it('builds adaptive major and minor ruler ticks', () => {
    const dense = buildRulerTicks(10, 120);
    const sparse = buildRulerTicks(120, 12);
    expect(dense.length).toBeGreaterThan(sparse.length / 12);
    expect(dense.some((tick) => tick.major && tick.label)).toBe(true);
    expect(dense.some((tick) => !tick.major)).toBe(true);
  });

  it('maps a drop time to the nearest sequential insertion boundary', () => {
    expect(findTimelineInsertionIndex(items, 0.5)).toBe(0);
    expect(findTimelineInsertionIndex(items, 2.5)).toBe(1);
    expect(findTimelineInsertionIndex(items, 5.5)).toBe(2);
  });

  it('quantizes to project frames and snaps within a screen-space threshold', () => {
    expect(quantizeTimelineTime(1.018, 1 / 30)).toBeCloseTo(1.033333, 5);
    expect(snapTimelineTime(1.96, [0, 2, 5], 1 / 30, 100)).toBe(2);
    expect(snapTimelineTime(1.8, [2], 1 / 30, 100)).toBeCloseTo(1.8, 5);
  });
});
