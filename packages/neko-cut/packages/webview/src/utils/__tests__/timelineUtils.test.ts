import { describe, it, expect } from 'vitest';
import {
  rangesOverlap,
  timeRangesOverlap,
  isTimeInRange,
  findNonOverlappingPosition,
  findNonOverlappingPositionWithPending,
  calculateEffectiveDuration,
  calculateElementEndTime,
  getTrackDuration,
  getProjectDuration,
  formatTime,
  formatTimeShort,
  parseTime,
  snapToFrame,
  timeToFrames,
  framesToTime,
} from '../timelineUtils';

// =============================================================================
// Range overlap detection
// =============================================================================

describe('rangesOverlap', () => {
  it('returns true for overlapping ranges', () => {
    expect(rangesOverlap(0, 10, 5, 15)).toBe(true);
  });

  it('returns true when one range contains the other', () => {
    expect(rangesOverlap(0, 20, 5, 10)).toBe(true);
    expect(rangesOverlap(5, 10, 0, 20)).toBe(true);
  });

  it('returns true for identical ranges', () => {
    expect(rangesOverlap(5, 10, 5, 10)).toBe(true);
  });

  it('returns false for adjacent ranges (end1 == start2)', () => {
    expect(rangesOverlap(0, 5, 5, 10)).toBe(false);
  });

  it('returns false for adjacent ranges (end2 == start1)', () => {
    expect(rangesOverlap(5, 10, 0, 5)).toBe(false);
  });

  it('returns false for disjoint ranges', () => {
    expect(rangesOverlap(0, 3, 7, 10)).toBe(false);
    expect(rangesOverlap(7, 10, 0, 3)).toBe(false);
  });

  it('handles zero-length range inside another range', () => {
    // rangesOverlap(5, 5, 0, 10): start1(5) < end2(10) && end1(5) > start2(0) => true
    expect(rangesOverlap(5, 5, 0, 10)).toBe(true);
    // rangesOverlap(0, 10, 5, 5): start1(0) < end2(5) && end1(10) > start2(5) => true
    expect(rangesOverlap(0, 10, 5, 5)).toBe(true);
  });

  it('handles two zero-length ranges at the same point', () => {
    // rangesOverlap(5, 5, 5, 5): start1(5) < end2(5) is false => false
    expect(rangesOverlap(5, 5, 5, 5)).toBe(false);
  });

  it('handles zero-length range at boundary of another', () => {
    // rangesOverlap(0, 0, 0, 10): start1(0) < end2(10) && end1(0) > start2(0) => false
    expect(rangesOverlap(0, 0, 0, 10)).toBe(false);
    // rangesOverlap(10, 10, 0, 10): start1(10) < end2(10) is false => false
    expect(rangesOverlap(10, 10, 0, 10)).toBe(false);
  });

  it('handles negative values', () => {
    expect(rangesOverlap(-10, -5, -7, 0)).toBe(true);
    expect(rangesOverlap(-10, -5, 0, 5)).toBe(false);
  });

  it('handles very large values', () => {
    expect(rangesOverlap(0, 1e12, 5e11, 1.5e12)).toBe(true);
    expect(rangesOverlap(0, 1e12, 2e12, 3e12)).toBe(false);
  });
});

describe('timeRangesOverlap', () => {
  it('returns true for overlapping TimeRange objects', () => {
    const r1 = { startTime: 0, duration: 10 };
    const r2 = { startTime: 5, duration: 10 };
    expect(timeRangesOverlap(r1, r2)).toBe(true);
  });

  it('returns false for adjacent TimeRange objects', () => {
    const r1 = { startTime: 0, duration: 5 };
    const r2 = { startTime: 5, duration: 5 };
    expect(timeRangesOverlap(r1, r2)).toBe(false);
  });

  it('returns false for disjoint TimeRange objects', () => {
    const r1 = { startTime: 0, duration: 3 };
    const r2 = { startTime: 7, duration: 3 };
    expect(timeRangesOverlap(r1, r2)).toBe(false);
  });

  it('returns true when one range fully contains the other', () => {
    const r1 = { startTime: 0, duration: 20 };
    const r2 = { startTime: 5, duration: 5 };
    expect(timeRangesOverlap(r1, r2)).toBe(true);
    expect(timeRangesOverlap(r2, r1)).toBe(true);
  });

  it('treats zero-duration range inside another as overlapping', () => {
    // timeRangesOverlap delegates to rangesOverlap(5, 5, 0, 10) which is true
    const r1 = { startTime: 5, duration: 0 };
    const r2 = { startTime: 0, duration: 10 };
    expect(timeRangesOverlap(r1, r2)).toBe(true);
  });
});

describe('isTimeInRange', () => {
  const range = { startTime: 5, duration: 10 };

  it('returns true for time at the start boundary', () => {
    expect(isTimeInRange(5, range)).toBe(true);
  });

  it('returns false for time at the end boundary (exclusive)', () => {
    expect(isTimeInRange(15, range)).toBe(false);
  });

  it('returns true for time inside the range', () => {
    expect(isTimeInRange(10, range)).toBe(true);
  });

  it('returns false for time before the range', () => {
    expect(isTimeInRange(4, range)).toBe(false);
  });

  it('returns false for time after the range', () => {
    expect(isTimeInRange(16, range)).toBe(false);
  });

  it('handles zero-duration range', () => {
    const zeroDuration = { startTime: 5, duration: 0 };
    expect(isTimeInRange(5, zeroDuration)).toBe(false);
  });

  it('handles negative start times', () => {
    const negRange = { startTime: -5, duration: 10 };
    expect(isTimeInRange(-3, negRange)).toBe(true);
    expect(isTimeInRange(4, negRange)).toBe(true);
    expect(isTimeInRange(5, negRange)).toBe(false);
  });
});

// =============================================================================
// Position calculation
// =============================================================================

describe('findNonOverlappingPosition', () => {
  it('returns desired start for an empty track', () => {
    expect(findNonOverlappingPosition([], 5, 10)).toBe(5);
  });

  it('returns desired start when no overlap exists', () => {
    const elements = [{ startTime: 0, duration: 3 }];
    expect(findNonOverlappingPosition(elements, 5, 2)).toBe(5);
  });

  it('pushes past a single overlapping element', () => {
    const elements = [{ startTime: 3, duration: 5 }];
    // Desired [4, 7) overlaps with [3, 8)
    expect(findNonOverlappingPosition(elements, 4, 3)).toBe(8);
  });

  it('pushes past multiple consecutive overlapping elements', () => {
    const elements = [
      { startTime: 0, duration: 5 },
      { startTime: 5, duration: 5 },
      { startTime: 10, duration: 5 },
    ];
    // Desired start 3 with duration 3: overlaps [0,5), pushed to 5,
    // then overlaps [5,10), pushed to 10, then overlaps [10,15), pushed to 15
    expect(findNonOverlappingPosition(elements, 3, 3)).toBe(15);
  });

  it('finds a gap between elements', () => {
    const elements = [
      { startTime: 0, duration: 3 },
      { startTime: 10, duration: 5 },
    ];
    // Duration 2 starting at 5 fits in gap [3, 10)
    expect(findNonOverlappingPosition(elements, 5, 2)).toBe(5);
  });

  it('handles unsorted input correctly', () => {
    const elements = [
      { startTime: 10, duration: 5 },
      { startTime: 0, duration: 5 },
    ];
    // Desired start 3 with duration 4: overlaps [0,5), pushed to 5;
    // [5, 9) does not overlap [10, 15), stays at 5
    expect(findNonOverlappingPosition(elements, 3, 4)).toBe(5);
  });

  it('handles desired start of zero', () => {
    const elements = [{ startTime: 0, duration: 5 }];
    expect(findNonOverlappingPosition(elements, 0, 3)).toBe(5);
  });

  it('handles zero-duration insertion', () => {
    const elements = [{ startTime: 5, duration: 5 }];
    // Zero-duration at 5: rangesOverlap(5,5,5,10) = false, stays at 5
    expect(findNonOverlappingPosition(elements, 5, 0)).toBe(5);
  });
});

describe('findNonOverlappingPositionWithPending', () => {
  it('considers both existing and pending elements', () => {
    const existing = [{ startTime: 0, duration: 5 }];
    const pending = [{ startTime: 5, duration: 5 }];
    // [0,5) existing + [5,10) pending, desired start 3 with duration 3
    expect(findNonOverlappingPositionWithPending(existing, pending, 3, 3)).toBe(10);
  });

  it('works with empty pending list', () => {
    const existing = [{ startTime: 0, duration: 5 }];
    expect(findNonOverlappingPositionWithPending(existing, [], 3, 3)).toBe(5);
  });

  it('works with empty existing list', () => {
    const pending = [{ startTime: 0, duration: 5 }];
    expect(findNonOverlappingPositionWithPending([], pending, 3, 3)).toBe(5);
  });
});

// =============================================================================
// Duration calculation
// =============================================================================

describe('calculateEffectiveDuration', () => {
  it('returns full duration when no trimming', () => {
    expect(calculateEffectiveDuration(10, 0, 0)).toBe(10);
  });

  it('subtracts trim start', () => {
    expect(calculateEffectiveDuration(10, 3, 0)).toBe(7);
  });

  it('subtracts trim end', () => {
    expect(calculateEffectiveDuration(10, 0, 4)).toBe(6);
  });

  it('subtracts both trims', () => {
    expect(calculateEffectiveDuration(10, 2, 3)).toBe(5);
  });

  it('clamps to zero when trims exceed duration', () => {
    expect(calculateEffectiveDuration(5, 3, 4)).toBe(0);
    expect(calculateEffectiveDuration(5, 10, 0)).toBe(0);
  });

  it('handles zero duration', () => {
    expect(calculateEffectiveDuration(0, 0, 0)).toBe(0);
  });
});

describe('calculateElementEndTime', () => {
  it('returns startTime + effective duration', () => {
    expect(calculateElementEndTime(5, 10, 0, 0)).toBe(15);
  });

  it('accounts for trim start and end', () => {
    expect(calculateElementEndTime(5, 10, 2, 3)).toBe(10);
  });

  it('returns startTime when fully trimmed', () => {
    expect(calculateElementEndTime(5, 10, 5, 5)).toBe(5);
  });
});

// =============================================================================
// Track / project duration
// =============================================================================

describe('getTrackDuration', () => {
  it('returns 0 for empty elements list', () => {
    expect(getTrackDuration([])).toBe(0);
  });

  it('returns end time of a single element', () => {
    const elements = [{ startTime: 5, duration: 10 }];
    expect(getTrackDuration(elements)).toBe(15);
  });

  it('returns the furthest end time among multiple elements', () => {
    const elements = [
      { startTime: 0, duration: 5 },
      { startTime: 3, duration: 10 },
      { startTime: 1, duration: 2 },
    ];
    expect(getTrackDuration(elements)).toBe(13);
  });

  it('respects trimStart and trimEnd', () => {
    const elements = [{ startTime: 0, duration: 20, trimStart: 5, trimEnd: 5 }];
    // effective duration = 20 - 5 - 5 = 10, endTime = 0 + 10 = 10
    expect(getTrackDuration(elements)).toBe(10);
  });

  it('defaults trim values to 0 when not provided', () => {
    const elements = [{ startTime: 2, duration: 8 }];
    expect(getTrackDuration(elements)).toBe(10);
  });

  it('handles elements with zero duration', () => {
    const elements = [
      { startTime: 5, duration: 0 },
      { startTime: 0, duration: 3 },
    ];
    expect(getTrackDuration(elements)).toBe(5);
  });
});

describe('getProjectDuration', () => {
  it('returns 0 for empty tracks array', () => {
    expect(getProjectDuration([])).toBe(0);
  });

  it('returns 0 when all tracks are empty', () => {
    expect(getProjectDuration([{ elements: [] }, { elements: [] }])).toBe(0);
  });

  it('returns the longest track duration', () => {
    const tracks = [
      { elements: [{ startTime: 0, duration: 10 }] },
      { elements: [{ startTime: 0, duration: 20 }] },
      { elements: [{ startTime: 5, duration: 5 }] },
    ];
    expect(getProjectDuration(tracks)).toBe(20);
  });

  it('considers trims in duration calculation', () => {
    const tracks = [
      { elements: [{ startTime: 0, duration: 30, trimStart: 10, trimEnd: 10 }] },
      { elements: [{ startTime: 0, duration: 15 }] },
    ];
    // Track 0: effective = 10, end = 10
    // Track 1: effective = 15, end = 15
    expect(getProjectDuration(tracks)).toBe(15);
  });
});

// =============================================================================
// Time formatting
// =============================================================================

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toBe('00:00:00.000');
  });

  it('formats seconds with milliseconds', () => {
    expect(formatTime(1.5)).toBe('00:00:01.500');
  });

  it('formats minutes', () => {
    expect(formatTime(90)).toBe('00:01:30.000');
  });

  it('formats hours', () => {
    expect(formatTime(3661.123)).toBe('01:01:01.123');
  });

  it('hides milliseconds when showMilliseconds is false', () => {
    expect(formatTime(5.999, false)).toBe('00:00:05');
  });

  it('pads single-digit values', () => {
    expect(formatTime(3723.007)).toBe('01:02:03.007');
  });

  it('handles large values', () => {
    // 100 hours
    expect(formatTime(360000)).toBe('100:00:00.000');
  });

  it('truncates generic media milliseconds to the canonical three digits', () => {
    expect(formatTime(1.9999)).toBe('00:00:01.999');
  });
});

describe('formatTimeShort', () => {
  it('formats zero', () => {
    expect(formatTimeShort(0)).toBe('00:00');
  });

  it('formats seconds only', () => {
    expect(formatTimeShort(45)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeShort(125)).toBe('02:05');
  });

  it('truncates sub-second values', () => {
    expect(formatTimeShort(59.9)).toBe('00:59');
  });

  it('handles large minute values', () => {
    expect(formatTimeShort(3600)).toBe('60:00');
  });
});

describe('parseTime', () => {
  it('parses HH:MM:SS format', () => {
    expect(parseTime('01:02:03')).toBe(3723);
  });

  it('parses HH:MM:SS.mmm format', () => {
    expect(parseTime('01:02:03.456')).toBe(3723.456);
  });

  it('parses MM:SS format', () => {
    expect(parseTime('02:30')).toBe(150);
  });

  it('parses plain number string', () => {
    expect(parseTime('42.5')).toBe(42.5);
  });

  it('returns 0 for invalid input', () => {
    expect(parseTime('invalid')).toBe(0);
  });

  it('pads short milliseconds (e.g., .5 -> 500ms)', () => {
    expect(parseTime('00:00:01.5')).toBe(1.5);
  });

  it('handles zero values', () => {
    expect(parseTime('00:00:00.000')).toBe(0);
    expect(parseTime('00:00')).toBe(0);
  });

  describe('round-trip with formatTime', () => {
    const testValues = [0, 1.5, 60, 3661.123, 7200];

    for (const value of testValues) {
      it(`round-trips ${value}s`, () => {
        const formatted = formatTime(value);
        const parsed = parseTime(formatted);
        expect(parsed).toBeCloseTo(value, 3);
      });
    }
  });

  describe('round-trip with formatTimeShort', () => {
    const testValues = [0, 45, 125, 3600];

    for (const value of testValues) {
      it(`round-trips ${value}s (short format)`, () => {
        const formatted = formatTimeShort(value);
        const parsed = parseTime(formatted);
        expect(parsed).toBe(value);
      });
    }
  });
});

// =============================================================================
// Frame rate conversion
// =============================================================================

describe('snapToFrame', () => {
  it('snaps time to nearest frame at 24 fps', () => {
    const snapped = snapToFrame(1.0, 24);
    expect(snapped).toBeCloseTo(1.0, 6);
  });

  it('snaps to nearest frame boundary at 24 fps', () => {
    // 1 frame at 24fps = 1/24 ~= 0.04167
    const snapped = snapToFrame(0.05, 24);
    // round(0.05 * 24) = round(1.2) = 1, then 1/24
    expect(snapped).toBeCloseTo(1 / 24, 6);
  });

  it('snaps at 30 fps', () => {
    const snapped = snapToFrame(0.5, 30);
    expect(snapped).toBeCloseTo(0.5, 6); // 0.5 * 30 = 15 frames exactly
  });

  it('snaps at 60 fps', () => {
    const snapped = snapToFrame(0.017, 60);
    // round(0.017 * 60) = round(1.02) = 1, then 1/60
    expect(snapped).toBeCloseTo(1 / 60, 6);
  });

  it('handles zero time', () => {
    expect(snapToFrame(0, 24)).toBe(0);
    expect(snapToFrame(0, 30)).toBe(0);
    expect(snapToFrame(0, 60)).toBe(0);
  });

  it('handles negative time', () => {
    const snapped = snapToFrame(-1.0, 24);
    expect(snapped).toBeCloseTo(-1.0, 6);
  });

  it('handles very large time', () => {
    const snapped = snapToFrame(86400, 24); // 24 hours
    expect(snapped).toBeCloseTo(86400, 6);
  });
});

describe('timeToFrames', () => {
  it('converts 1 second to frames at 24 fps', () => {
    expect(timeToFrames(1.0, 24)).toBe(24);
  });

  it('converts 1 second to frames at 30 fps', () => {
    expect(timeToFrames(1.0, 30)).toBe(30);
  });

  it('converts 1 second to frames at 60 fps', () => {
    expect(timeToFrames(1.0, 60)).toBe(60);
  });

  it('rounds to nearest frame', () => {
    // 0.5 frames at 24fps -> round(0.5*24) = round(12) = 12
    expect(timeToFrames(0.5, 24)).toBe(12);
  });

  it('handles zero time', () => {
    expect(timeToFrames(0, 24)).toBe(0);
  });

  it('handles sub-frame time', () => {
    // 0.01s at 24fps -> round(0.24) = 0
    expect(timeToFrames(0.01, 24)).toBe(0);
  });

  it('handles large time values', () => {
    expect(timeToFrames(3600, 24)).toBe(86400);
  });
});

describe('framesToTime', () => {
  it('converts frames to time at 24 fps', () => {
    expect(framesToTime(24, 24)).toBe(1.0);
  });

  it('converts frames to time at 30 fps', () => {
    expect(framesToTime(30, 30)).toBe(1.0);
  });

  it('converts frames to time at 60 fps', () => {
    expect(framesToTime(60, 60)).toBe(1.0);
  });

  it('converts single frame', () => {
    expect(framesToTime(1, 24)).toBeCloseTo(1 / 24, 6);
    expect(framesToTime(1, 30)).toBeCloseTo(1 / 30, 6);
    expect(framesToTime(1, 60)).toBeCloseTo(1 / 60, 6);
  });

  it('handles zero frames', () => {
    expect(framesToTime(0, 24)).toBe(0);
  });

  it('round-trips with timeToFrames', () => {
    for (const fps of [24, 30, 60]) {
      for (const frames of [0, 1, 12, 48, 100, 1000]) {
        const time = framesToTime(frames, fps);
        const backToFrames = timeToFrames(time, fps);
        expect(backToFrames).toBe(frames);
      }
    }
  });
});
