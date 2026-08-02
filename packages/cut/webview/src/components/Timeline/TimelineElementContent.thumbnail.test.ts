import { describe, expect, it } from 'vitest';
import type { TimelineClipView } from '@neko/cut-domain';
import { thumbnailTileLayout } from './TimelineElementContent';

describe('Timeline thumbnail tile layout', () => {
  it('positions a tile at its timeline offset without stretching it across the Clip', () => {
    expect(thumbnailTileLayout(clip, 64, 3, 1600)).toEqual({
      left: 400,
      width: 400,
    });
  });

  it('clips boundary tiles and excludes tiles outside the Clip', () => {
    expect(thumbnailTileLayout({ ...clip, startSeconds: 6 }, 64, 2, 1600)).toEqual({
      left: 0,
      width: 240,
    });
    expect(thumbnailTileLayout(clip, 64, 1, 1600)).toBeUndefined();
  });
});

const clip: TimelineClipView = {
  kind: 'clip',
  clipId: 'clip-1',
  name: 'Clip',
  targetUrl: '../clip.mp4',
  startSeconds: 5,
  durationSeconds: 10,
  sourceStartSeconds: 0,
  playbackRate: 1,
  enabled: true,
  locked: false,
  audio: {
    muted: false,
    gainDb: 0,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  },
};
