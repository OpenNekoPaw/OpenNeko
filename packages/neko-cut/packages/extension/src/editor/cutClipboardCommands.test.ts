import { describe, expect, it } from 'vitest';
import type { TimelineClipView, TimelineTrackView, TimelineView } from '@neko-cut/domain';
import { buildDuplicateClipCommands, buildPasteClipCommands } from './cutClipboardCommands';

describe('Cut Host clipboard command planning', () => {
  it('pastes multiple Clip locators at one relative timeline origin and duplicates links once', () => {
    const ids = idFactory('new-video', 'new-audio', 'new-title');

    expect(
      buildPasteClipCommands(
        fixtureView(),
        [
          { trackId: 'video', clipId: 'video-1' },
          { trackId: 'audio', clipId: 'audio-1' },
          { trackId: 'subtitle', clipId: 'title-1' },
        ],
        10,
        ids,
      ),
    ).toEqual([
      {
        type: 'clone-clip-at-time',
        clipId: 'video-1',
        duplicateClipId: 'new-video',
        duplicateLinkedClipId: 'new-audio',
        timelineStartFrames: 300,
        linkedTimelineStartFrames: 300,
        rate: 30,
      },
      {
        type: 'clone-clip-at-time',
        clipId: 'title-1',
        duplicateClipId: 'new-title',
        timelineStartFrames: 420,
        rate: 30,
      },
    ]);
  });

  it('keeps identities Host-owned and rejects stale locators', () => {
    expect(
      buildDuplicateClipCommands(
        fixtureView(),
        ['video-1', 'audio-1'],
        idFactory('copy-video', 'copy-audio'),
      ),
    ).toEqual([
      {
        type: 'duplicate-clip',
        clipId: 'video-1',
        duplicateClipId: 'copy-video',
        duplicateLinkedClipId: 'copy-audio',
      },
    ]);
    expect(() =>
      buildPasteClipCommands(
        fixtureView(),
        [{ trackId: 'video', clipId: 'missing' }],
        0,
        idFactory('unused'),
      ),
    ).toThrowError('Clipboard Clip missing is unavailable.');
  });
});

function fixtureView(): TimelineView {
  return {
    documentUri: 'file:///workspace/cut.otio',
    sessionId: 'session-1',
    revision: 3,
    name: 'Cut',
    durationSeconds: 8,
    profile: {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    },
    tracks: [
      track('video', 'Video', [clip('video-1', 2, { linkedAudioClipId: 'audio-1' })]),
      track('audio', 'Audio', [clip('audio-1', 2, { linkedVideoClipId: 'video-1' })]),
      track('subtitle', 'Subtitle', [clip('title-1', 6)]),
    ],
  };
}

function track(
  trackId: string,
  kind: TimelineTrackView['kind'],
  items: readonly TimelineClipView[],
): TimelineTrackView {
  return {
    trackId,
    name: kind,
    kind,
    enabled: true,
    locked: false,
    audioMuted: false,
    items,
  };
}

function clip(
  clipId: string,
  startSeconds: number,
  link: Pick<TimelineClipView, 'linkedAudioClipId' | 'linkedVideoClipId'> = {},
): TimelineClipView {
  return {
    kind: 'clip',
    clipId,
    name: clipId,
    targetUrl: `media/${clipId}.mp4`,
    startSeconds,
    durationSeconds: 1,
    sourceStartSeconds: 0,
    playbackRate: 1,
    enabled: true,
    locked: false,
    audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
    ...link,
  };
}

function idFactory(...ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (!id) throw new Error('Unexpected ID allocation.');
    index += 1;
    return id;
  };
}
