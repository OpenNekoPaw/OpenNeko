import { describe, expect, it } from 'vitest';
import type { TimelineTrackView } from '@neko-cut/domain';
import {
  buildTimelinePointerDragPreview,
  isNoopTimelineMove,
  isNoopTimelinePlacement,
  readTimelineEdgeScrollDelta,
} from './pointerDrag';

const videoTrack: TimelineTrackView = {
  trackId: 'video-1',
  name: 'Video 1',
  kind: 'Video',
  enabled: true,
  locked: false,
  audioMuted: false,
  items: [
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
  ],
};

describe('timeline pointer drag', () => {
  it('projects a pointer to a frame-snapped compatible insertion boundary', () => {
    const preview = buildTimelinePointerDragPreview({
      source: { clipId: 'clip-1', trackId: 'video-1', trackKind: 'Video', itemIndex: 1 },
      targetTrack: videoTrack,
      clientX: 251,
      contentLeft: 50,
      pixelsPerSecond: 100,
      duration: 6,
      frameSeconds: 1 / 30,
      snapTargets: [0, 2, 6],
    });

    expect(preview).toMatchObject({
      targetTrackId: 'video-1',
      compatible: true,
      toIndex: 1,
      pointerTimeSeconds: 2,
      insertionTimeSeconds: 2,
    });
    expect(isNoopTimelineMove(preview)).toBe(true);
  });

  it('marks cross-kind targets incompatible without changing the insertion preview', () => {
    const preview = buildTimelinePointerDragPreview({
      source: { clipId: 'clip-1', trackId: 'video-1', trackKind: 'Video', itemIndex: 1 },
      targetTrack: { ...videoTrack, trackId: 'audio-1', kind: 'Audio' },
      clientX: 500,
      contentLeft: 0,
      pixelsPerSecond: 100,
      duration: 6,
      frameSeconds: 1 / 30,
      snapTargets: [],
    });

    expect(preview.compatible).toBe(false);
    expect(isNoopTimelineMove(preview)).toBe(false);
  });

  it('distinguishes an absolute time placement from reorder-only insertion', () => {
    const preview = buildTimelinePointerDragPreview({
      source: { clipId: 'clip-1', trackId: 'video-1', trackKind: 'Video', itemIndex: 1 },
      targetTrack: videoTrack,
      clientX: 451,
      contentLeft: 50,
      pixelsPerSecond: 100,
      duration: 6,
      frameSeconds: 1 / 30,
      snapTargets: [],
    });
    const view = {
      documentUri: 'file:///workspace/demo.otio',
      sessionId: 'session-1',
      revision: 1,
      name: 'Demo',
      durationSeconds: 6,
      tracks: [videoTrack],
    };

    expect(preview.pointerTimeSeconds).toBe(4);
    expect(isNoopTimelineMove(preview)).toBe(true);
    expect(isNoopTimelinePlacement(preview, view)).toBe(false);
  });

  it('preserves the pointer grab offset instead of jumping the Clip start to the cursor', () => {
    const preview = buildTimelinePointerDragPreview({
      source: { clipId: 'clip-1', trackId: 'video-1', trackKind: 'Video', itemIndex: 1 },
      targetTrack: videoTrack,
      clientX: 550,
      contentLeft: 50,
      grabOffsetSeconds: 1.5,
      pixelsPerSecond: 100,
      duration: 6,
      frameSeconds: 0.5,
      snapTargets: [],
    });

    expect(preview.pointerTimeSeconds).toBe(3.5);
  });

  it('computes bounded horizontal edge auto-scroll steps', () => {
    expect(
      readTimelineEdgeScrollDelta({ clientX: 10, viewportLeft: 0, viewportRight: 500 }),
    ).toBeLessThan(0);
    expect(readTimelineEdgeScrollDelta({ clientX: 250, viewportLeft: 0, viewportRight: 500 })).toBe(
      0,
    );
    expect(
      readTimelineEdgeScrollDelta({ clientX: 490, viewportLeft: 0, viewportRight: 500 }),
    ).toBeGreaterThan(0);
  });
});
