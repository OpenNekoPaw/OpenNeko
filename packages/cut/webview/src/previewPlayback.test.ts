import { describe, expect, it, vi } from 'vitest';
import {
  advancePreviewPlayback,
  applyPreviewPlaybackAdvance,
  finishPreviewPlaybackSegment,
  previewPreparationLeadSeconds,
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

  it('uses a longer preparation lead for transcoded preview segments', () => {
    expect(
      advancePreviewPlayback(
        {
          timelineStartSeconds: 0,
          wallStartMilliseconds: 0,
          segmentEndSeconds: 10,
          timelineEndSeconds: 20,
          preparationLeadSeconds: 5,
        },
        5_100,
      ),
    ).toEqual({
      kind: 'prepare-next',
      playheadSeconds: 5.1,
      nextSegmentStartSeconds: 10,
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

  it('activates at the edit boundary when a finite media clock ends within one scheduler tick', () => {
    expect(
      advancePreviewPlayback(
        {
          timelineStartSeconds: 0,
          wallStartMilliseconds: 0,
          segmentEndSeconds: 5.03,
          timelineEndSeconds: 10,
          mediaClock: { sourceStartSeconds: 0, playbackRate: 1 },
        },
        100_000,
        5,
        5,
      ),
    ).toEqual({ kind: 'segment-boundary', playheadSeconds: 5.03 });
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

describe('previewPreparationLeadSeconds', () => {
  it('uses short native lead for direct files and longer Host preparation lead otherwise', () => {
    expect(previewPreparationLeadSeconds('h264-mp4-direct')).toBe(0.5);
    expect(previewPreparationLeadSeconds('h264-mp4-remux')).toBe(2);
    expect(previewPreparationLeadSeconds('h264-sdr-transcode')).toBe(5);
    expect(previewPreparationLeadSeconds('vp8-webm-direct')).toBe(0.5);
  });
});

describe('shouldAcceptPreviewReady', () => {
  it('rejects mismatched requests and readiness after transport stops', () => {
    expect(shouldAcceptPreviewReady('request-3', 'request-3', true)).toBe(true);
    expect(shouldAcceptPreviewReady('request-2', 'request-3', true)).toBe(false);
    expect(shouldAcceptPreviewReady('request-3', 'request-3', false)).toBe(false);
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
