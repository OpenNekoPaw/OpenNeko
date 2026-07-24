import { describe, expect, it } from 'vitest';
import type { TimelineClipView, TimelineView } from '@neko-cut/domain';
import { resolvePreviewPlaybackEnd, resolvePreviewSelection } from './previewSelection';

function clip(
  clipId: string,
  startSeconds: number,
  muted = false,
  enabled = true,
): TimelineClipView {
  return {
    kind: 'clip',
    clipId,
    name: `${clipId}.mp4`,
    targetUrl: `../${clipId}.mp4`,
    startSeconds,
    durationSeconds: 4,
    sourceStartSeconds: 0,
    enabled,
    locked: false,
    playbackRate: 1,
    audio: { muted, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
  };
}

const view: TimelineView = {
  documentUri: 'file:///workspace/project.otio',
  sessionId: 'session-1',
  revision: 3,
  name: 'project',
  durationSeconds: 8,
  tracks: [
    {
      trackId: 'video-1',
      name: 'Video 1',
      kind: 'Video',
      enabled: true,
      locked: false,
      audioMuted: false,
      items: [clip('video-a', 0), clip('video-b', 4)],
    },
    {
      trackId: 'audio-1',
      name: 'Audio 1',
      kind: 'Audio',
      enabled: true,
      locked: false,
      audioMuted: false,
      items: [clip('audio-a', 0), clip('audio-b', 4, true)],
    },
    {
      trackId: 'audio-2',
      name: 'Audio 2',
      kind: 'Audio',
      enabled: true,
      locked: false,
      audioMuted: false,
      items: [clip('audio-c', 0)],
    },
  ],
};

describe('resolvePreviewSelection', () => {
  it('stops at the last enabled media input instead of a trailing Gap', () => {
    const trailingGap: TimelineView = {
      ...view,
      durationSeconds: 51.5,
      tracks: [
        {
          ...view.tracks[0]!,
          items: [
            { ...clip('video-final', 0), durationSeconds: 26.9 },
            { kind: 'gap', startSeconds: 26.9, durationSeconds: 24.6 },
          ],
        },
        {
          ...view.tracks[1]!,
          items: [{ kind: 'gap', startSeconds: 0, durationSeconds: 39.2 }],
        },
      ],
    };

    expect(resolvePreviewPlaybackEnd(trailingGap)).toBe(26.9);
  });

  it('includes an enabled audio-only tail in the playback end', () => {
    const audioTail: TimelineView = {
      ...view,
      durationSeconds: 12,
      tracks: [
        { ...view.tracks[0]!, items: [clip('video', 0)] },
        { ...view.tracks[1]!, items: [clip('audio-tail', 6)] },
      ],
    };

    expect(resolvePreviewPlaybackEnd(audioTail)).toBe(10);
  });

  it('resolves active Video and every unmuted Audio Clip from timeline time', () => {
    const selection = resolvePreviewSelection(view, 2);
    expect(selection.videoClip?.clipId).toBe('video-a');
    expect(selection.audioClips.map((item) => item.clipId)).toEqual(['audio-a', 'audio-c']);
    expect(selection.segmentEndSeconds).toBe(4);
  });

  it('projects the next Video Clip and its bounded playback segment after a boundary', () => {
    const selection = resolvePreviewSelection(view, 4);
    expect(selection.videoClip?.clipId).toBe('video-b');
    expect(selection.segmentEndSeconds).toBe(8);
  });

  it('does not depend on a selected Clip identity', () => {
    expect(resolvePreviewSelection(view, 0).timelineTimeSeconds).toBe(0);
  });

  it('allows audio-only playback without an active Video Clip', () => {
    const audioOnly: TimelineView = {
      ...view,
      durationSeconds: 4,
      tracks: view.tracks.filter((track) => track.kind === 'Audio'),
    };

    const selection = resolvePreviewSelection(audioOnly, 2);

    expect(selection.videoClip).toBeUndefined();
    expect(selection.audioClips.map((item) => item.clipId)).toEqual(['audio-a', 'audio-c']);
    expect(selection.segmentEndSeconds).toBe(4);
  });

  it('excludes disabled Clips and Tracks from preview selection', () => {
    const disabled: TimelineView = {
      ...view,
      tracks: [
        {
          ...view.tracks[0]!,
          items: [clip('video-disabled', 0, false, false)],
        },
        {
          ...view.tracks[1]!,
          enabled: false,
        },
        view.tracks[2]!,
      ],
    };

    const selection = resolvePreviewSelection(disabled, 2);

    expect(selection.videoClip).toBeUndefined();
    expect(selection.audioClips.map((item) => item.clipId)).toEqual(['audio-c']);
  });

  it('keeps muted Video visible while suppressing Track audio contributions', () => {
    const mutedTracks: TimelineView = {
      ...view,
      tracks: [
        { ...view.tracks[0]!, audioMuted: true },
        { ...view.tracks[1]!, audioMuted: true },
        view.tracks[2]!,
      ],
    };

    const selection = resolvePreviewSelection(mutedTracks, 2);

    expect(selection.videoClip?.clipId).toBe('video-a');
    expect(selection.videoAudioMuted).toBe(true);
    expect(selection.audioClips.map((item) => item.clipId)).toEqual(['audio-c']);
  });

  it('returns a streamless segment for a gap before the next media boundary', () => {
    const gapThenVideo: TimelineView = {
      ...view,
      durationSeconds: 8,
      tracks: [
        {
          trackId: 'video-gap',
          name: 'Video',
          kind: 'Video',
          enabled: true,
          locked: false,
          audioMuted: false,
          items: [clip('later-video', 4)],
        },
      ],
    };

    const selection = resolvePreviewSelection(gapThenVideo, 2);

    expect(selection.videoClip).toBeUndefined();
    expect(selection.audioClips).toEqual([]);
    expect(selection.segmentEndSeconds).toBe(4);
  });

  it('fails visibly for invalid time and the final enabled media end', () => {
    expect(() => resolvePreviewSelection(view, 8)).toThrowError(
      'Cut preview timeline time must be before the final enabled media end.',
    );
    expect(() => resolvePreviewSelection(view, -1)).toThrowError(
      'Cut preview timeline time must be a non-negative finite number.',
    );
  });
});
