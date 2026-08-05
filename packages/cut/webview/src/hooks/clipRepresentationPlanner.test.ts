import { describe, expect, it } from 'vitest';
import type { TimelineView } from '@neko/cut-domain';
import { buildClipRepresentationRequests } from './clipRepresentationPlanner';

describe('Cut Clip representation planner', () => {
  it('plans bounded visible time tiles instead of one stretched representation for a long Clip', () => {
    const requests = buildClipRepresentationRequests(longClipView, { start: 5, end: 15 }, 160);
    const thumbnails = requests.filter((request) => request.kind === 'thumbnail');

    expect(thumbnails.length).toBeGreaterThan(1);
    expect(thumbnails.length).toBeLessThanOrEqual(24);
    expect(thumbnails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clipId: 'long-video',
          kind: 'thumbnail',
          density: expect.any(Number),
          tileIndex: expect.any(Number),
        }),
      ]),
    );
    expect(thumbnails.map((request) => request.tileIndex).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, tileIndex) => tileIndex),
    );
    expect(
      thumbnails.every((request) => !Object.prototype.hasOwnProperty.call(request, 'sampleCount')),
    ).toBe(true);
  });

  it('keeps requests stable while zoom remains in one density layer', () => {
    const first = thumbnailRequests(
      buildClipRepresentationRequests(longClipView, { start: 20, end: 30 }, 140),
    );
    const second = thumbnailRequests(
      buildClipRepresentationRequests(longClipView, { start: 20, end: 30 }, 170),
    );

    expect(new Set(first.map((request) => request.density))).toEqual(new Set([128]));
    expect(second).toEqual(first);
  });

  it('changes layers at a zoom boundary and reuses overlapping tiles while scrolling', () => {
    const lowDensity = thumbnailRequests(
      buildClipRepresentationRequests(longClipView, { start: 20, end: 30 }, 80),
    );
    const highDensity = thumbnailRequests(
      buildClipRepresentationRequests(longClipView, { start: 20, end: 30 }, 160),
    );
    expect(new Set(lowDensity.map((request) => request.density))).toEqual(new Set([64]));
    expect(new Set(highDensity.map((request) => request.density))).toEqual(new Set([128]));

    const scrolled = thumbnailRequests(
      buildClipRepresentationRequests(longClipView, { start: 25, end: 35 }, 160),
    );
    const initialKeys = new Set(highDensity.map(tileKey));
    const reused = scrolled.filter((request) => initialKeys.has(tileKey(request)));
    const missing = scrolled.filter((request) => !initialKeys.has(tileKey(request)));

    expect(reused.length).toBeGreaterThan(0);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(scrolled.length);
  });
});

function thumbnailRequests(requests: ReturnType<typeof buildClipRepresentationRequests>) {
  return requests.filter((request) => request.kind === 'thumbnail');
}

function tileKey(request: ReturnType<typeof thumbnailRequests>[number]): string {
  return `${request.clipId}:${request.density}:${request.tileIndex}`;
}

const longClipView: TimelineView = {
  documentUri: 'file:///workspace/project.otio',
  sessionId: 'session-1',
  name: 'Long Clip',
  durationSeconds: 126.6,
  tracks: [
    {
      trackId: 'video-1',
      name: 'Video 1',
      kind: 'Video',
      enabled: true,
      locked: false,
      audioMuted: false,
      items: [
        {
          kind: 'clip',
          clipId: 'long-video',
          name: '720P.mp4',
          targetUrl: '../720P.mp4',
          startSeconds: 0,
          durationSeconds: 126.6,
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
        },
      ],
    },
  ],
};
