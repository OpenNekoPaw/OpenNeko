import {
  resolveTimelinePlaybackEndSeconds,
  type TimelineClipView,
  type TimelineView,
} from '@neko-cut/domain';

export interface CutPreviewSelection {
  readonly timelineTimeSeconds: number;
  readonly videoClip?: TimelineClipView;
  readonly videoAudioMuted: boolean;
  readonly audioClips: readonly TimelineClipView[];
  readonly segmentEndSeconds: number;
  readonly playbackEndSeconds: number;
}

export const resolvePreviewPlaybackEnd = resolveTimelinePlaybackEndSeconds;

export function resolvePreviewSelection(
  view: TimelineView,
  timelineTimeSeconds: number,
): CutPreviewSelection {
  if (!Number.isFinite(timelineTimeSeconds) || timelineTimeSeconds < 0) {
    throw new Error('Cut preview timeline time must be a non-negative finite number.');
  }
  const playbackEndSeconds = resolveTimelinePlaybackEndSeconds(view);
  if (timelineTimeSeconds >= playbackEndSeconds) {
    throw new Error('Cut preview timeline time must be before the final enabled media end.');
  }
  const videoTrack = view.tracks.find((track) => track.enabled && track.kind === 'Video');
  const videoClip = activeClips(view, 'Video', timelineTimeSeconds)[0];
  return {
    timelineTimeSeconds,
    ...(videoClip ? { videoClip } : {}),
    videoAudioMuted: videoTrack?.audioMuted ?? false,
    audioClips: activeClips(view, 'Audio', timelineTimeSeconds).filter((clip) => !clip.audio.muted),
    segmentEndSeconds: nextInputBoundary(view, timelineTimeSeconds, playbackEndSeconds),
    playbackEndSeconds,
  };
}

function nextInputBoundary(
  view: TimelineView,
  timelineTimeSeconds: number,
  playbackEndSeconds: number,
): number {
  const boundary = view.tracks
    .filter(
      (track) =>
        track.enabled && (track.kind === 'Video' || (track.kind === 'Audio' && !track.audioMuted)),
    )
    .flatMap((track) => track.items)
    .filter((item) => item.kind !== 'clip' || item.enabled)
    .flatMap((item) => [item.startSeconds, item.startSeconds + item.durationSeconds])
    .filter((candidate) => candidate > timelineTimeSeconds)
    .reduce((nearest, candidate) => Math.min(nearest, candidate), playbackEndSeconds);
  if (boundary <= timelineTimeSeconds) {
    throw new Error('Cut preview segment does not have a future media boundary.');
  }
  return boundary;
}

function activeClips(
  view: TimelineView,
  kind: 'Video' | 'Audio',
  timelineTimeSeconds: number,
): readonly TimelineClipView[] {
  return view.tracks
    .filter(
      (track) => track.enabled && track.kind === kind && (kind !== 'Audio' || !track.audioMuted),
    )
    .flatMap((track) => track.items)
    .filter(
      (item): item is TimelineClipView =>
        item.kind === 'clip' &&
        item.enabled &&
        item.startSeconds <= timelineTimeSeconds &&
        timelineTimeSeconds < item.startSeconds + item.durationSeconds,
    );
}
