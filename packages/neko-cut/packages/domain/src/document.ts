import {
  readClipIdentity,
  readTrackIdentity,
  withAudioSettings,
  withClipIdentity,
  withTrackIdentity,
} from './metadata';
import type {
  CutClipIdFactory,
  CutProjectProfile,
  OtioClip,
  OtioLinearTimeWarp,
  OtioRationalTime,
  OtioTimeRange,
  OtioTimeline,
  OtioTrack,
  OtioTrackKind,
  CutTrackIdFactory,
} from './types';

export const CUT_DEFAULT_EDIT_RATE = 30;
export const CUT_MIN_PLAYBACK_RATE = 0.25;
export const CUT_MAX_PLAYBACK_RATE = 4;

export function clipPlaybackRate(clip: OtioClip): number {
  return clip.effects?.[0]?.time_scalar ?? 1;
}

export function linearTimeWarp(playbackRate: number): readonly OtioLinearTimeWarp[] {
  if (
    !Number.isFinite(playbackRate) ||
    playbackRate < CUT_MIN_PLAYBACK_RATE ||
    playbackRate > CUT_MAX_PLAYBACK_RATE
  ) {
    throw new Error(
      `Clip playback rate must be between ${CUT_MIN_PLAYBACK_RATE} and ${CUT_MAX_PLAYBACK_RATE}.`,
    );
  }
  return playbackRate === 1
    ? []
    : [
        {
          OTIO_SCHEMA: 'LinearTimeWarp.1',
          name: 'Constant Speed',
          effect_name: 'LinearTimeWarp',
          time_scalar: playbackRate,
          metadata: {},
        },
      ];
}

export function createOtioTimeline(name: string, profile: CutProjectProfile): OtioTimeline {
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name,
    global_start_time: null,
    metadata: { openneko: { cut: { ...profile } } },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      metadata: {},
      effects: [],
      markers: [],
      children: [createTrack('Video', 'Video 1', 'video-1')],
    },
  };
}

export function createTrack(kind: OtioTrackKind, name: string, trackId: string): OtioTrack {
  return {
    OTIO_SCHEMA: 'Track.1',
    name,
    kind,
    children: [],
    metadata: withTrackIdentity({}, { trackId }),
    enabled: true,
    effects: [],
    markers: [],
  };
}

export function assignMissingTrackIds(
  document: OtioTimeline,
  createTrackId: CutTrackIdFactory,
): { readonly document: OtioTimeline; readonly changed: boolean } {
  let changed = false;
  const used = new Set<string>();
  const children = document.tracks.children.map((track) => {
    const identity = readTrackIdentity(track.metadata);
    if (identity && !used.has(identity.trackId)) {
      used.add(identity.trackId);
      return track;
    }
    const trackId = nextUniqueId(createTrackId, used, 'Track');
    used.add(trackId);
    changed = true;
    return { ...track, metadata: withTrackIdentity(track.metadata, { trackId }) };
  });
  return changed
    ? { document: { ...document, tracks: { ...document.tracks, children } }, changed }
    : { document, changed };
}

export function rationalTime(value: number, rate: number): OtioRationalTime {
  return { OTIO_SCHEMA: 'RationalTime.1', value, rate };
}

export function timeRange(startValue: number, durationValue: number, rate: number): OtioTimeRange {
  return {
    OTIO_SCHEMA: 'TimeRange.1',
    start_time: rationalTime(startValue, rate),
    duration: rationalTime(durationValue, rate),
  };
}

export function assignMissingClipIds(
  document: OtioTimeline,
  createClipId: CutClipIdFactory,
): { readonly document: OtioTimeline; readonly changed: boolean } {
  let changed = false;
  const used = new Set<string>();
  const children = document.tracks.children.map((track) => ({
    ...track,
    children: track.children.map((item) => {
      if (item.OTIO_SCHEMA !== 'Clip.2') return item;
      const identity = readClipIdentity(item.metadata);
      if (identity && !used.has(identity.clipId)) {
        used.add(identity.clipId);
        return item;
      }
      const clipId = nextUniqueId(createClipId, used, 'Clip');
      used.add(clipId);
      changed = true;
      return { ...item, metadata: withClipIdentity(item.metadata, { clipId }) };
    }),
  }));
  return changed
    ? { document: { ...document, tracks: { ...document.tracks, children } }, changed }
    : { document, changed };
}

export function createLinkedAudioClip(
  videoClip: OtioClip,
  audioClipId: string,
): { readonly videoClip: OtioClip; readonly audioClip: OtioClip } {
  const videoIdentity = readClipIdentity(videoClip.metadata);
  if (!videoIdentity) throw new Error('Video Clip must have a stable clipId before separation.');
  if (videoIdentity.linkedAudioClipId || videoIdentity.linkedVideoClipId) {
    throw new Error('Video Clip is already linked.');
  }
  const linkedVideo: OtioClip = {
    ...videoClip,
    metadata: withClipIdentity(videoClip.metadata, {
      clipId: videoIdentity.clipId,
      linkedAudioClipId: audioClipId,
    }),
  };
  const audioClip: OtioClip = {
    ...videoClip,
    name: `${videoClip.name} Audio`,
    media_reference: { ...videoClip.media_reference },
    source_range: {
      ...videoClip.source_range,
      start_time: { ...videoClip.source_range.start_time },
      duration: { ...videoClip.source_range.duration },
    },
    metadata: withAudioSettings(
      withClipIdentity(removeOpenNekoLink(videoClip.metadata), {
        clipId: audioClipId,
        linkedVideoClipId: videoIdentity.clipId,
      }),
      { muted: false, gainDb: 0 },
    ),
  };
  return { videoClip: linkedVideo, audioClip };
}

export function splitClipIdentity(
  clip: OtioClip,
  rightClipId: string,
): { readonly left: OtioClip; readonly right: OtioClip } {
  const identity = readClipIdentity(clip.metadata);
  if (!identity) throw new Error('Clip must have a stable clipId before split.');
  if (identity.linkedAudioClipId || identity.linkedVideoClipId) {
    throw new Error('Linked Clips must be split through the coupled document command.');
  }
  return {
    left: clip,
    right: {
      ...clip,
      metadata: withClipIdentity(clip.metadata, { clipId: rightClipId }),
    },
  };
}

function nextUniqueId(createId: () => string, used: ReadonlySet<string>, label: string): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = createId();
    if (candidate.length > 0 && !used.has(candidate)) return candidate;
  }
  throw new Error(`${label} ID factory did not produce a unique non-empty identifier.`);
}

function removeOpenNekoLink(
  metadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const openneko = metadata['openneko'];
  if (!isRecord(openneko)) return metadata;
  const { link: _link, ...rest } = openneko;
  return { ...metadata, openneko: rest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
