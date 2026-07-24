import { describe, expect, it, vi } from 'vitest';
import {
  advancePreviewPlayback,
  applyPreviewPlaybackAdvance,
  finishPreviewPlaybackSegment,
  shouldAcceptPreviewReady,
} from './previewPlayback';

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

  it('prepares the next media segment before the current Clip boundary', () => {
    expect(
      advancePreviewPlayback(
        {
          timelineStartSeconds: 1,
          wallStartMilliseconds: 1_000,
          segmentEndSeconds: 4,
          timelineEndSeconds: 8,
        },
        3_550,
      ),
    ).toEqual({
      kind: 'prepare-next',
      playheadSeconds: 3.55,
      nextSegmentStartSeconds: 4,
    });
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

  it('uses media PTS instead of wall time while a real stream is active', () => {
    const segment = {
      timelineStartSeconds: 4,
      wallStartMilliseconds: 10_000,
      segmentEndSeconds: 8,
      timelineEndSeconds: 8,
      mediaClock: { sourceStartSeconds: 10, playbackRate: 2 },
    };

    expect(advancePreviewPlayback(segment, 100_000)).toEqual({
      kind: 'continue',
      playheadSeconds: 4,
    });
    expect(advancePreviewPlayback(segment, 100_000, 12)).toEqual({
      kind: 'continue',
      playheadSeconds: 5,
    });
  });

  it('holds the current boundary while the replacement media clock is not ready', () => {
    const segment = {
      timelineStartSeconds: 4,
      wallStartMilliseconds: 10_000,
      segmentEndSeconds: 8,
      timelineEndSeconds: 8,
      mediaClock: { sourceStartSeconds: 10, playbackRate: 1 },
    };

    expect(advancePreviewPlayback(segment, 100_000, undefined, 7.5)).toEqual({
      kind: 'continue',
      playheadSeconds: 7.5,
    });
    expect(advancePreviewPlayback(segment, 100_000, 9.5, 7.5)).toEqual({
      kind: 'continue',
      playheadSeconds: 7.5,
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

describe('shouldAcceptPreviewReady', () => {
  it('rejects stale generations and readiness after transport stops', () => {
    expect(shouldAcceptPreviewReady(3, 3, true)).toBe(true);
    expect(shouldAcceptPreviewReady(2, 3, true)).toBe(false);
    expect(shouldAcceptPreviewReady(3, 3, false)).toBe(false);
  });
});

describe('applyPreviewPlaybackAdvance', () => {
  it('activates the prepared segment without starting the legacy boundary path', () => {
    const seek = vi.fn();
    const prepareNextSegment = vi.fn();
    const activateNextSegment = vi.fn();
    const stopAtTimelineEnd = vi.fn();

    applyPreviewPlaybackAdvance(
      { kind: 'segment-boundary', playheadSeconds: 4 },
      { seek, prepareNextSegment, activateNextSegment, stopAtTimelineEnd },
    );

    expect(seek).toHaveBeenCalledOnce();
    expect(seek).toHaveBeenCalledWith(4);
    expect(prepareNextSegment).not.toHaveBeenCalled();
    expect(activateNextSegment).toHaveBeenCalledOnce();
    expect(activateNextSegment).toHaveBeenCalledWith(4);
    expect(stopAtTimelineEnd).not.toHaveBeenCalled();
  });

  it('prepares without ending the active segment', () => {
    const seek = vi.fn();
    const prepareNextSegment = vi.fn();
    const activateNextSegment = vi.fn();
    const stopAtTimelineEnd = vi.fn();

    applyPreviewPlaybackAdvance(
      { kind: 'prepare-next', playheadSeconds: 3.55, nextSegmentStartSeconds: 4 },
      { seek, prepareNextSegment, activateNextSegment, stopAtTimelineEnd },
    );

    expect(seek).toHaveBeenCalledWith(3.55);
    expect(prepareNextSegment).toHaveBeenCalledWith(4);
    expect(activateNextSegment).not.toHaveBeenCalled();
    expect(stopAtTimelineEnd).not.toHaveBeenCalled();
  });

  it('stops the Host exactly once at the Timeline end', () => {
    const seek = vi.fn();
    const prepareNextSegment = vi.fn();
    const activateNextSegment = vi.fn();
    const stopAtTimelineEnd = vi.fn();

    applyPreviewPlaybackAdvance(
      { kind: 'timeline-end', playheadSeconds: 8 },
      { seek, prepareNextSegment, activateNextSegment, stopAtTimelineEnd },
    );

    expect(seek).toHaveBeenCalledOnce();
    expect(seek).toHaveBeenCalledWith(8);
    expect(prepareNextSegment).not.toHaveBeenCalled();
    expect(activateNextSegment).not.toHaveBeenCalled();
    expect(stopAtTimelineEnd).toHaveBeenCalledOnce();
  });
});
