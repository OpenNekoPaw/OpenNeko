import {
  readAudioSettings,
  readClipIdentity,
  readEditState,
  readProjectProfile,
  readTrackIdentity,
} from './metadata';
import { clipPlaybackRate } from './document';
import type { OtioTimeline, OtioTrackKind } from './types';

export interface TimelineView {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly revision: number;
  readonly name: string;
  readonly profile?: ReturnType<typeof readProjectProfile>;
  readonly tracks: readonly TimelineTrackView[];
  readonly durationSeconds: number;
}

export interface TimelineTrackView {
  readonly trackId: string;
  readonly name: string;
  readonly kind: OtioTrackKind;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly audioMuted: boolean;
  readonly items: readonly TimelineItemView[];
}

export type TimelineItemView = TimelineClipView | TimelineGapView;

export interface TimelineClipView {
  readonly kind: 'clip';
  readonly clipId: string;
  readonly name: string;
  readonly targetUrl: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly sourceStartSeconds: number;
  readonly sourceAvailableStartSeconds?: number;
  readonly sourceAvailableDurationSeconds?: number;
  readonly playbackRate: number;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly linkedAudioClipId?: string;
  readonly linkedVideoClipId?: string;
  readonly audio: {
    readonly muted: boolean;
    readonly gainDb: number;
    readonly fadeInSeconds: number;
    readonly fadeOutSeconds: number;
  };
}

export interface TimelineGapView {
  readonly kind: 'gap';
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export function resolveTimelinePlaybackEndSeconds(view: TimelineView): number {
  return view.tracks
    .filter(
      (track) =>
        track.enabled && (track.kind === 'Video' || (track.kind === 'Audio' && !track.audioMuted)),
    )
    .flatMap((track) =>
      track.items.filter(
        (item): item is TimelineClipView =>
          item.kind === 'clip' && item.enabled && (track.kind !== 'Audio' || !item.audio.muted),
      ),
    )
    .reduce(
      (endSeconds, clip) => Math.max(endSeconds, clip.startSeconds + clip.durationSeconds),
      0,
    );
}

export function projectTimelineView(input: {
  readonly document: OtioTimeline;
  readonly documentUri: string;
  readonly sessionId: string;
  readonly revision: number;
}): TimelineView {
  let maxDuration = 0;
  const tracks = input.document.tracks.children.map((track) => {
    const trackIdentity = readTrackIdentity(track.metadata);
    if (!trackIdentity) throw new Error(`Track ${track.name} does not have a stable trackId.`);
    let cursor = 0;
    const items = track.children.map((item): TimelineItemView => {
      const sourceDurationSeconds =
        item.source_range.duration.value / item.source_range.duration.rate;
      const playbackRate = item.OTIO_SCHEMA === 'Clip.2' ? clipPlaybackRate(item) : 1;
      const durationSeconds = sourceDurationSeconds / playbackRate;
      const startSeconds = cursor;
      cursor += durationSeconds;
      if (item.OTIO_SCHEMA === 'Gap.1') {
        return { kind: 'gap', startSeconds, durationSeconds };
      }
      const identity = readClipIdentity(item.metadata);
      if (!identity) {
        throw new Error(`Clip ${item.name} does not have a stable clipId.`);
      }
      const audio = readAudioSettings(item.metadata);
      const editState = readEditState(item.metadata);
      return {
        kind: 'clip',
        clipId: identity.clipId,
        name: item.name,
        targetUrl: item.media_reference.target_url,
        startSeconds,
        durationSeconds,
        sourceStartSeconds: item.source_range.start_time.value / item.source_range.start_time.rate,
        enabled: item.enabled !== false,
        locked: editState.locked,
        ...(item.media_reference.available_range
          ? {
              sourceAvailableStartSeconds:
                item.media_reference.available_range.start_time.value /
                item.media_reference.available_range.start_time.rate,
              sourceAvailableDurationSeconds:
                item.media_reference.available_range.duration.value /
                item.media_reference.available_range.duration.rate,
            }
          : {}),
        playbackRate,
        ...(identity.linkedAudioClipId ? { linkedAudioClipId: identity.linkedAudioClipId } : {}),
        ...(identity.linkedVideoClipId ? { linkedVideoClipId: identity.linkedVideoClipId } : {}),
        audio: {
          muted: audio?.muted ?? false,
          gainDb: audio?.gainDb ?? 0,
          fadeInSeconds: audio?.fadeInSeconds ?? 0,
          fadeOutSeconds: audio?.fadeOutSeconds ?? 0,
        },
      };
    });
    maxDuration = Math.max(maxDuration, cursor);
    return {
      trackId: trackIdentity.trackId,
      name: track.name,
      kind: track.kind,
      enabled: track.enabled !== false,
      locked: readEditState(track.metadata).locked,
      audioMuted: readAudioSettings(track.metadata)?.muted ?? false,
      items,
    };
  });
  const profile = readProjectProfile(input.document.metadata);
  return {
    documentUri: input.documentUri,
    sessionId: input.sessionId,
    revision: input.revision,
    name: input.document.name,
    ...(profile ? { profile } : {}),
    tracks,
    durationSeconds: maxDuration,
  };
}
