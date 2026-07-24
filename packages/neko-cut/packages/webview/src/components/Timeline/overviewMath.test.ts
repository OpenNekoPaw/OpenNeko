import { describe, expect, it } from 'vitest';
import {
  readOverviewRange,
  readOverviewScrollLeft,
  readOverviewViewport,
  toOverviewPercent,
} from './overviewMath';

describe('timeline overview geometry', () => {
  it('projects the real scroll viewport into percentages', () => {
    expect(readOverviewViewport({ scrollLeft: 400, clientWidth: 500, scrollWidth: 2_000 })).toEqual(
      { leftPercent: 20, widthPercent: 25 },
    );
  });

  it('centers and clamps pointer navigation in the scrollable timeline', () => {
    expect(readOverviewScrollLeft({ pointerRatio: 0, clientWidth: 500, scrollWidth: 2_000 })).toBe(
      0,
    );
    expect(
      readOverviewScrollLeft({ pointerRatio: 0.5, clientWidth: 500, scrollWidth: 2_000 }),
    ).toBe(750);
    expect(readOverviewScrollLeft({ pointerRatio: 1, clientWidth: 500, scrollWidth: 2_000 })).toBe(
      1_500,
    );
  });

  it('projects and clamps timeline time', () => {
    expect(toOverviewPercent(5, 20)).toBe(25);
    expect(toOverviewPercent(30, 20)).toBe(100);
    expect(toOverviewPercent(-1, 20)).toBe(0);
  });

  it('clips each overview item to the visible timeline range', () => {
    expect(
      readOverviewRange({ startSeconds: 18, durationSeconds: 5, timelineSeconds: 20 }),
    ).toEqual({ leftPercent: 90, widthPercent: 10 });
    expect(
      readOverviewRange({ startSeconds: -2, durationSeconds: 5, timelineSeconds: 20 }),
    ).toEqual({ leftPercent: 0, widthPercent: 15 });
  });
});
