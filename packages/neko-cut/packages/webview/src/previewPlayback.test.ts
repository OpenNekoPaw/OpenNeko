import { describe, expect, it } from 'vitest';
import { advancePreviewPlayback, finishPreviewPlaybackSegment } from './previewPlayback';

describe('advancePreviewPlayback', () => {
  it('requests a media-segment switch exactly at the next Clip boundary', () => {
    expect(
      advancePreviewPlayback(
        {
          timelineStartSeconds: 1,
          wallStartMilliseconds: 1_000,
          segmentEndSeconds: 4,
          timelineEndSeconds: 8,
        },
        4_050,
      ),
    ).toEqual({ kind: 'segment-boundary', playheadSeconds: 4 });
  });

  it('advances normally inside a segment and stops at the timeline end', () => {
    const segment = {
      timelineStartSeconds: 4,
      wallStartMilliseconds: 10_000,
      segmentEndSeconds: 8,
      timelineEndSeconds: 8,
    };
    expect(advancePreviewPlayback(segment, 11_500)).toEqual({
      kind: 'continue',
      playheadSeconds: 5.5,
    });
    expect(advancePreviewPlayback(segment, 14_100)).toEqual({
      kind: 'timeline-end',
      playheadSeconds: 8,
    });
  });

  it('maps primary stream completion to a next segment or the timeline end', () => {
    expect(
      finishPreviewPlaybackSegment({
        timelineStartSeconds: 2,
        wallStartMilliseconds: 0,
        segmentEndSeconds: 4,
        timelineEndSeconds: 9,
      }),
    ).toEqual({ kind: 'segment-boundary', playheadSeconds: 4 });
    expect(
      finishPreviewPlaybackSegment({
        timelineStartSeconds: 4,
        wallStartMilliseconds: 0,
        segmentEndSeconds: 9,
        timelineEndSeconds: 9,
      }),
    ).toEqual({ kind: 'timeline-end', playheadSeconds: 9 });
  });
});
