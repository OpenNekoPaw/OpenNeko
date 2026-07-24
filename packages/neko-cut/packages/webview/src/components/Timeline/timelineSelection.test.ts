import { describe, expect, it } from 'vitest';
import type { TimelineView } from '@neko-cut/domain';
import { collectClipSelectionsInBox, orderClipLayoutsForMove } from './timelineSelection';

describe('Timeline box selection', () => {
  it('selects every Clip intersecting the content-space rectangle across Tracks', () => {
    const view = fixtureView();

    expect(
      collectClipSelectionsInBox(view, {
        leftSeconds: 1,
        rightSeconds: 5,
        topTrackIndex: 0,
        bottomTrackIndex: 1,
      }),
    ).toEqual([
      { kind: 'clip', trackId: 'video', clipId: 'video-1' },
      { kind: 'clip', trackId: 'audio', clipId: 'audio-1' },
    ]);
  });

  it('moves right-to-left when shifting right so adjacent Clips do not block one another', () => {
    const layouts = [
      { clipId: 'first', trackId: 'video', startSeconds: 0 },
      { clipId: 'second', trackId: 'video', startSeconds: 3 },
    ];
    expect(orderClipLayoutsForMove(layouts, 2).map(({ clipId }) => clipId)).toEqual([
      'second',
      'first',
    ]);
    expect(orderClipLayoutsForMove(layouts, -2).map(({ clipId }) => clipId)).toEqual([
      'first',
      'second',
    ]);
  });
});

function fixtureView(): TimelineView {
  const clip = {
    kind: 'clip' as const,
    name: 'Clip',
    targetUrl: '../media/source.mp4',
    sourceStartSeconds: 0,
    playbackRate: 1,
    enabled: true,
    locked: false,
    audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
  };
  return {
    documentUri: 'file:///workspace/cut.otio',
    sessionId: 'session-1',
    revision: 1,
    name: 'Cut',
    durationSeconds: 8,
    tracks: [
      {
        trackId: 'video',
        name: 'Video',
        kind: 'Video',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [
          { ...clip, clipId: 'video-1', startSeconds: 0, durationSeconds: 3 },
          { ...clip, clipId: 'video-2', startSeconds: 6, durationSeconds: 2 },
        ],
      },
      {
        trackId: 'audio',
        name: 'Audio',
        kind: 'Audio',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [{ ...clip, clipId: 'audio-1', startSeconds: 4, durationSeconds: 2 }],
      },
    ],
  };
}
