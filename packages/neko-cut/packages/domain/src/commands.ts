import {
  clipPlaybackRate,
  createLinkedAudioClip,
  createTrack,
  linearTimeWarp,
  splitClipIdentity,
  timeRange,
} from './document';
import {
  readClipIdentity,
  readEditState,
  readProjectProfile,
  readTrackIdentity,
  withAudioSettings,
  withClipIdentity,
  withEditState,
  withProjectProfile,
  withTrackIdentity,
} from './metadata';
import type {
  CutAudioSettings,
  OtioClip,
  OtioGap,
  OtioTimeline,
  OtioTrack,
  OtioTrackItem,
  OtioTrackKind,
} from './types';

export type CutCommand =
  | {
      readonly type: 'set-project-canvas';
      readonly profile: string;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly type: 'link-media';
      readonly clipId: string;
      readonly name: string;
      readonly targetUrl: string;
      readonly durationFrames: number;
      readonly availableDurationFrames?: number;
      readonly rate: number;
      readonly trackId: string;
    }
  | {
      readonly type: 'add-track';
      readonly trackId: string;
      readonly trackKind: Exclude<OtioTrackKind, 'Video'>;
      readonly name: string;
    }
  | { readonly type: 'remove-track'; readonly trackId: string }
  | { readonly type: 'rename-track'; readonly trackId: string; readonly name: string }
  | { readonly type: 'move-track'; readonly trackId: string; readonly toIndex: number }
  | { readonly type: 'relink-media'; readonly clipId: string; readonly targetUrl: string }
  | {
      readonly type: 'split';
      readonly clipId: string;
      readonly offsetFrames: number;
      readonly rightClipId: string;
    }
  | {
      readonly type: 'trim';
      readonly clipId: string;
      readonly startDeltaFrames: number;
      readonly endDeltaFrames: number;
    }
  | {
      readonly type: 'move-item';
      readonly fromTrackId: string;
      readonly fromIndex: number;
      readonly toTrackId: string;
      readonly toIndex: number;
    }
  | {
      readonly type: 'place-clip';
      readonly clipId: string;
      readonly toTrackId: string;
      readonly timelineStartFrames: number;
      readonly rate: number;
      readonly overlapPolicy: 'reject' | 'insert';
    }
  | { readonly type: 'rename-clip'; readonly clipId: string; readonly name: string }
  | {
      readonly type: 'set-clip-duration';
      readonly clipId: string;
      readonly durationFrames: number;
      readonly rate: number;
    }
  | { readonly type: 'set-playback-rate'; readonly clipId: string; readonly playbackRate: number }
  | { readonly type: 'ripple-delete'; readonly clipId: string }
  | {
      readonly type: 'insert-gap';
      readonly trackId: string;
      readonly index: number;
      readonly durationFrames: number;
      readonly rate: number;
    }
  | { readonly type: 'remove-gap'; readonly trackId: string; readonly itemIndex: number }
  | {
      readonly type: 'set-audio';
      readonly clipId: string;
      readonly settings: CutAudioSettings;
    }
  | { readonly type: 'set-clip-enabled'; readonly clipId: string; readonly enabled: boolean }
  | { readonly type: 'set-track-enabled'; readonly trackId: string; readonly enabled: boolean }
  | { readonly type: 'set-track-muted'; readonly trackId: string; readonly muted: boolean }
  | { readonly type: 'set-clip-locked'; readonly clipId: string; readonly locked: boolean }
  | { readonly type: 'set-track-locked'; readonly trackId: string; readonly locked: boolean }
  | {
      readonly type: 'duplicate-clip';
      readonly clipId: string;
      readonly duplicateClipId: string;
      readonly duplicateLinkedClipId?: string;
    }
  | {
      readonly type: 'clone-clip-at-time';
      readonly clipId: string;
      readonly duplicateClipId: string;
      readonly timelineStartFrames: number;
      readonly duplicateLinkedClipId?: string;
      readonly linkedTimelineStartFrames?: number;
      readonly rate: number;
    }
  | {
      readonly type: 'duplicate-track';
      readonly trackId: string;
      readonly duplicateTrackId: string;
      readonly duplicateClipIds: readonly string[];
    }
  | {
      readonly type: 'separate-audio';
      readonly videoClipId: string;
      readonly audioClipId: string;
      readonly audioTrackId: string;
    }
  | { readonly type: 'unseparate-audio'; readonly videoClipId: string }
  | { readonly type: 'append-route'; readonly items: readonly CutRouteAppendItem[] };

export type CutRouteAppendItem =
  | {
      readonly kind: 'media';
      readonly clipId: string;
      readonly name: string;
      readonly targetUrl: string;
      readonly durationFrames: number;
      readonly rate: number;
    }
  | {
      readonly kind: 'gap';
      readonly durationFrames: number;
      readonly rate: number;
    };

export class CutCommandError extends Error {
  readonly code:
    | 'clip-not-found'
    | 'track-not-found'
    | 'track-limit'
    | 'incompatible-track'
    | 'invalid-command'
    | 'identity-conflict'
    | 'linked-clip-required'
    | 'locked';

  constructor(code: CutCommandError['code'], message: string) {
    super(message);
    this.name = 'CutCommandError';
    this.code = code;
  }
}

export function applyCutCommand(document: OtioTimeline, command: CutCommand): OtioTimeline {
  assertCommandUnlocked(document, command);
  switch (command.type) {
    case 'set-project-canvas':
      return setProjectCanvas(document, command);
    case 'link-media':
      return linkMedia(document, command);
    case 'add-track':
      return addTrack(document, command);
    case 'remove-track':
      return removeTrack(document, command.trackId);
    case 'rename-track':
      return renameTrack(document, command.trackId, command.name);
    case 'move-track':
      return moveTrack(document, command.trackId, command.toIndex);
    case 'relink-media':
      return mapClipAndLinked(document, command.clipId, (clip) => ({
        ...clip,
        media_reference: { ...clip.media_reference, target_url: command.targetUrl },
      }));
    case 'split':
      return splitClip(document, command);
    case 'trim':
      return trimClip(document, command);
    case 'move-item':
      return moveItem(document, command);
    case 'place-clip':
      return placeClip(document, command);
    case 'rename-clip':
      return renameClip(document, command.clipId, command.name);
    case 'set-clip-duration':
      return setClipDuration(document, command);
    case 'set-playback-rate':
      return setPlaybackRate(document, command.clipId, command.playbackRate);
    case 'ripple-delete':
      return rippleDelete(document, command.clipId);
    case 'insert-gap':
      return insertGap(document, command);
    case 'remove-gap':
      return removeGap(document, command.trackId, command.itemIndex);
    case 'set-audio':
      return setAudio(document, command.clipId, command.settings);
    case 'set-clip-enabled':
      return setClipEnabled(document, command.clipId, command.enabled);
    case 'set-track-enabled':
      return setTrackEnabled(document, command.trackId, command.enabled);
    case 'set-track-muted':
      return setTrackMuted(document, command.trackId, command.muted);
    case 'set-clip-locked':
      return setClipLocked(document, command.clipId, command.locked);
    case 'set-track-locked':
      return setTrackLocked(document, command.trackId, command.locked);
    case 'duplicate-clip':
      return duplicateClip(document, command);
    case 'clone-clip-at-time':
      return cloneClipAtTime(document, command);
    case 'duplicate-track':
      return duplicateTrack(document, command);
    case 'separate-audio':
      return separateAudio(
        document,
        command.videoClipId,
        command.audioClipId,
        command.audioTrackId,
      );
    case 'unseparate-audio':
      return unseparateAudio(document, command.videoClipId);
    case 'append-route':
      return appendRoute(document, command.items);
  }
}

function setProjectCanvas(
  document: OtioTimeline,
  command: Extract<CutCommand, { readonly type: 'set-project-canvas' }>,
): OtioTimeline {
  const current = readProjectProfile(document.metadata);
  if (!current) {
    throw new CutCommandError(
      'invalid-command',
      'Cut project Canvas requires an existing project profile.',
    );
  }
  if (
    command.profile.trim().length === 0 ||
    !isSupportedCanvasDimension(command.width) ||
    !isSupportedCanvasDimension(command.height)
  ) {
    throw new CutCommandError(
      'invalid-command',
      'Cut project Canvas profile must have a name and integer dimensions from 16 through 8192.',
    );
  }
  return {
    ...document,
    metadata: withProjectProfile(document.metadata, {
      ...current,
      profile: command.profile,
      width: command.width,
      height: command.height,
    }),
  };
}

function isSupportedCanvasDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 16 && value <= 8192;
}

function assertCommandUnlocked(document: OtioTimeline, command: CutCommand): void {
  switch (command.type) {
    case 'set-project-canvas':
    case 'set-clip-enabled':
    case 'set-track-enabled':
    case 'set-track-muted':
    case 'set-clip-locked':
    case 'set-track-locked':
    case 'add-track':
      return;
    case 'link-media':
    case 'insert-gap':
    case 'remove-gap':
    case 'remove-track':
    case 'rename-track':
      assertTrackUnlocked(document, command.trackId);
      return;
    case 'move-track':
      assertTrackUnlocked(document, command.trackId);
      return;
    case 'move-item': {
      assertTrackUnlocked(document, command.fromTrackId);
      assertTrackUnlocked(document, command.toTrackId);
      const source = findTrack(document, command.fromTrackId)?.track.children[command.fromIndex];
      if (source?.OTIO_SCHEMA === 'Clip.2') {
        const clipId = readClipIdentity(source.metadata)?.clipId;
        if (clipId) assertClipUnlocked(document, clipId, false);
      }
      return;
    }
    case 'place-clip':
      assertClipUnlocked(document, command.clipId, true);
      assertTrackUnlocked(document, command.toTrackId);
      return;
    case 'duplicate-clip': {
      const location = findClip(document, command.clipId);
      if (!location) {
        throw new CutCommandError('clip-not-found', `Clip ${command.clipId} was not found.`);
      }
      const track = document.tracks.children[location.trackIndex];
      if (!track) {
        throw new CutCommandError('track-not-found', 'Duplicate source Track is missing.');
      }
      const trackId = readTrackIdentity(track.metadata)?.trackId;
      if (trackId) assertTrackUnlocked(document, trackId);
      return;
    }
    case 'clone-clip-at-time': {
      const source = findClip(document, command.clipId);
      if (!source) {
        throw new CutCommandError('clip-not-found', `Clip ${command.clipId} was not found.`);
      }
      const sourceTrack = document.tracks.children[source.trackIndex];
      if (!sourceTrack) {
        throw new CutCommandError('track-not-found', 'Clone source Track is missing.');
      }
      const sourceTrackId = readTrackIdentity(sourceTrack.metadata)?.trackId;
      if (sourceTrackId) assertTrackUnlocked(document, sourceTrackId);
      const sourceIdentity = readClipIdentity(source.clip.metadata);
      const linkedId = sourceIdentity?.linkedAudioClipId ?? sourceIdentity?.linkedVideoClipId;
      if (linkedId) {
        const linked = findClip(document, linkedId);
        const linkedTrack = linked ? document.tracks.children[linked.trackIndex] : undefined;
        if (!linked || !linkedTrack) {
          throw new CutCommandError(
            'linked-clip-required',
            `Linked Clip ${linkedId} was not found.`,
          );
        }
        const linkedTrackId = readTrackIdentity(linkedTrack.metadata)?.trackId;
        if (linkedTrackId) assertTrackUnlocked(document, linkedTrackId);
      }
      return;
    }
    case 'duplicate-track':
      return;
    case 'separate-audio':
      assertClipUnlocked(document, command.videoClipId, true);
      if (findTrack(document, command.audioTrackId)) {
        assertTrackUnlocked(document, command.audioTrackId);
      }
      return;
    case 'unseparate-audio':
      assertClipUnlocked(document, command.videoClipId, true);
      return;
    case 'append-route': {
      const videoTrack = document.tracks.children.find((track) => track.kind === 'Video');
      const trackId = videoTrack ? readTrackIdentity(videoTrack.metadata)?.trackId : undefined;
      if (trackId) assertTrackUnlocked(document, trackId);
      return;
    }
    case 'relink-media':
    case 'split':
    case 'trim':
    case 'rename-clip':
    case 'set-clip-duration':
    case 'set-playback-rate':
    case 'ripple-delete':
    case 'set-audio':
      assertClipUnlocked(document, command.clipId, true);
      return;
  }
}

function assertTrackUnlocked(document: OtioTimeline, trackId: string): void {
  const location = findTrack(document, trackId);
  if (!location) {
    throw new CutCommandError('track-not-found', `Track ${trackId} was not found.`);
  }
  if (readEditState(location.track.metadata).locked) {
    throw new CutCommandError('locked', `Track ${trackId} is locked.`);
  }
}

function assertClipUnlocked(document: OtioTimeline, clipId: string, includeLinked: boolean): void {
  const location = findClip(document, clipId);
  if (!location) {
    throw new CutCommandError('clip-not-found', `Clip ${clipId} was not found.`);
  }
  const track = document.tracks.children[location.trackIndex];
  if (!track) throw new CutCommandError('track-not-found', 'Clip owner Track is missing.');
  if (readEditState(track.metadata).locked || readEditState(location.clip.metadata).locked) {
    throw new CutCommandError('locked', `Clip ${clipId} or its Track is locked.`);
  }
  if (!includeLinked) return;
  const identity = readClipIdentity(location.clip.metadata);
  const linkedId = identity?.linkedAudioClipId ?? identity?.linkedVideoClipId;
  if (linkedId) assertClipUnlocked(document, linkedId, false);
}

function appendRoute(document: OtioTimeline, items: readonly CutRouteAppendItem[]): OtioTimeline {
  if (items.length === 0) {
    throw new CutCommandError('invalid-command', 'A Canvas route must contain at least one item.');
  }
  const identities = new Set<string>();
  const children = items.map((item): OtioTrackItem => {
    assertPositive(item.durationFrames, 'durationFrames');
    assertPositive(item.rate, 'rate');
    if (item.kind === 'gap') {
      return {
        OTIO_SCHEMA: 'Gap.1',
        name: 'Gap',
        source_range: timeRange(0, item.durationFrames, item.rate),
        metadata: {},
        effects: [],
        markers: [],
      };
    }
    if (identities.has(item.clipId)) {
      throw new CutCommandError('identity-conflict', `Duplicate route Clip ID ${item.clipId}.`);
    }
    identities.add(item.clipId);
    assertIdentityAvailable(document, item.clipId);
    return {
      OTIO_SCHEMA: 'Clip.2',
      name: item.name,
      media_reference: {
        OTIO_SCHEMA: 'ExternalReference.1',
        target_url: item.targetUrl,
        available_range: timeRange(0, item.durationFrames, item.rate),
        metadata: {},
      },
      source_range: timeRange(0, item.durationFrames, item.rate),
      metadata: withAudioSettings(withClipIdentity({}, { clipId: item.clipId }), {
        muted: false,
      }),
      enabled: true,
      effects: [],
      markers: [],
    };
  });
  return updateOnlyTrackOfKind(document, 'Video', (track) => ({
    ...track,
    children: [...track.children, ...children],
  }));
}

function linkMedia(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'link-media' }>,
): OtioTimeline {
  assertPositive(command.durationFrames, 'durationFrames');
  assertPositive(command.rate, 'rate');
  assertIdentityAvailable(document, command.clipId);
  const location = findTrack(document, command.trackId);
  if (!location) {
    throw new CutCommandError('track-not-found', `Track ${command.trackId} was not found.`);
  }
  const kind = location.track.kind;
  const clip: OtioClip = {
    OTIO_SCHEMA: 'Clip.2',
    name: command.name,
    media_reference: {
      OTIO_SCHEMA: 'ExternalReference.1',
      target_url: command.targetUrl,
      available_range: timeRange(
        0,
        command.availableDurationFrames ?? command.durationFrames,
        command.rate,
      ),
      metadata: {},
    },
    source_range: timeRange(0, command.durationFrames, command.rate),
    metadata:
      kind === 'Subtitle'
        ? withClipIdentity({}, { clipId: command.clipId })
        : withAudioSettings(withClipIdentity({}, { clipId: command.clipId }), {
            muted: false,
            ...(kind === 'Audio' ? { gainDb: 0 } : {}),
          }),
    enabled: true,
    effects: [],
    markers: [],
  };
  return updateTrackById(document, command.trackId, (track) => ({
    ...track,
    children: [...track.children, clip],
  }));
}

function splitClip(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'split' }>,
): OtioTimeline {
  assertIdentityAvailable(document, command.rightClipId);
  const location = findClip(document, command.clipId);
  if (!location)
    throw new CutCommandError('clip-not-found', `Clip ${command.clipId} was not found.`);
  const duration = location.clip.source_range.duration.value;
  const sourceOffsetFrames = projectFramesToSourceFrames(
    document,
    location.clip,
    command.offsetFrames,
  );
  if (sourceOffsetFrames <= 0 || sourceOffsetFrames >= duration) {
    throw new CutCommandError('invalid-command', 'Split offset must be inside the Clip range.');
  }
  const split = splitClipIdentity(location.clip, command.rightClipId);
  const rate = location.clip.source_range.duration.rate;
  const left: OtioClip = {
    ...split.left,
    source_range: {
      ...split.left.source_range,
      duration: { ...split.left.source_range.duration, value: sourceOffsetFrames },
    },
  };
  const right: OtioClip = {
    ...split.right,
    source_range: {
      ...split.right.source_range,
      start_time: {
        ...split.right.source_range.start_time,
        value: split.right.source_range.start_time.value + sourceOffsetFrames,
        rate,
      },
      duration: {
        ...split.right.source_range.duration,
        value: duration - sourceOffsetFrames,
        rate,
      },
    },
  };
  return replaceTrackItems(document, location.trackIndex, location.itemIndex, [left, right]);
}

function trimClip(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'trim' }>,
): OtioTimeline {
  if (!Number.isInteger(command.startDeltaFrames) || !Number.isInteger(command.endDeltaFrames)) {
    throw new CutCommandError('invalid-command', 'Trim deltas must use whole project frames.');
  }
  return mapClipAndLinked(document, command.clipId, (clip) => {
    const boundedClip = preserveCurrentSourceAsAvailableRange(clip);
    const sourceStartDeltaFrames = projectFramesToSourceFrames(
      document,
      boundedClip,
      command.startDeltaFrames,
    );
    const sourceEndDeltaFrames = projectFramesToSourceFrames(
      document,
      boundedClip,
      command.endDeltaFrames,
    );
    const nextDuration =
      boundedClip.source_range.duration.value - sourceStartDeltaFrames - sourceEndDeltaFrames;
    if (nextDuration <= 0) {
      throw new CutCommandError('invalid-command', 'Trim must leave a positive Clip duration.');
    }
    const nextStart = boundedClip.source_range.start_time.value + sourceStartDeltaFrames;
    if (nextStart < 0) {
      throw new CutCommandError('invalid-command', 'Trim cannot move before the media start.');
    }
    assertWithinAvailableRange(boundedClip, nextStart, nextDuration);
    return {
      ...boundedClip,
      source_range: {
        ...boundedClip.source_range,
        start_time: { ...boundedClip.source_range.start_time, value: nextStart },
        duration: { ...boundedClip.source_range.duration, value: nextDuration },
      },
    };
  });
}

function renameClip(document: OtioTimeline, clipId: string, name: string): OtioTimeline {
  const normalized = name.trim();
  if (normalized.length === 0) {
    throw new CutCommandError('invalid-command', 'Clip name cannot be empty.');
  }
  return mapClip(document, clipId, (clip) => ({ ...clip, name: normalized }));
}

function setPlaybackRate(
  document: OtioTimeline,
  clipId: string,
  playbackRate: number,
): OtioTimeline {
  const location = findClip(document, clipId);
  if (!location) throw new CutCommandError('clip-not-found', `Clip ${clipId} was not found.`);
  if (document.tracks.children[location.trackIndex]?.kind === 'Subtitle') {
    throw new CutCommandError('incompatible-track', 'Subtitle Clips do not support speed.');
  }
  let effects: OtioClip['effects'];
  try {
    effects = linearTimeWarp(playbackRate);
  } catch (error) {
    throw new CutCommandError(
      'invalid-command',
      error instanceof Error ? error.message : String(error),
    );
  }
  return mapClipAndLinked(document, clipId, (clip) => ({ ...clip, effects }));
}

function setClipDuration(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'set-clip-duration' }>,
): OtioTimeline {
  if (!Number.isInteger(command.durationFrames) || command.durationFrames <= 0) {
    throw new CutCommandError(
      'invalid-command',
      'Clip duration must use positive whole project frames.',
    );
  }
  assertPositive(command.rate, 'rate');
  return mapClipAndLinked(document, command.clipId, (clip) => {
    const boundedClip = preserveCurrentSourceAsAvailableRange(clip);
    const sourceDurationFrames = Math.round(
      (command.durationFrames / command.rate) *
        clipPlaybackRate(boundedClip) *
        boundedClip.source_range.duration.rate,
    );
    if (sourceDurationFrames <= 0) {
      throw new CutCommandError('invalid-command', 'Clip duration is below one source frame.');
    }
    assertWithinAvailableRange(
      boundedClip,
      boundedClip.source_range.start_time.value,
      sourceDurationFrames,
    );
    return {
      ...boundedClip,
      source_range: {
        ...boundedClip.source_range,
        duration: { ...boundedClip.source_range.duration, value: sourceDurationFrames },
      },
    };
  });
}

function placeClip(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'place-clip' }>,
): OtioTimeline {
  if (!Number.isInteger(command.timelineStartFrames) || command.timelineStartFrames < 0) {
    throw new CutCommandError(
      'invalid-command',
      'Clip placement must use non-negative whole project frames.',
    );
  }
  assertPositive(command.rate, 'rate');
  const source = findClip(document, command.clipId);
  const target = findTrack(document, command.toTrackId);
  if (!source) {
    throw new CutCommandError('clip-not-found', `Clip ${command.clipId} was not found.`);
  }
  if (!target) {
    throw new CutCommandError('track-not-found', `Track ${command.toTrackId} was not found.`);
  }
  const sourceTrack = document.tracks.children[source.trackIndex];
  if (!sourceTrack) throw new CutCommandError('track-not-found', 'Clip source Track is missing.');
  if (sourceTrack.kind !== target.track.kind) {
    throw new CutCommandError(
      'incompatible-track',
      `Cannot place ${sourceTrack.kind} content on a ${target.track.kind} Track.`,
    );
  }

  const clipDurationFrames = itemTimelineFrames(source.clip, command.rate);
  const overlap =
    command.overlapPolicy === 'insert'
      ? findPlacementOverlap(
          target.track.children,
          sourceTrack === target.track ? source.clip : undefined,
          command.timelineStartFrames,
          clipDurationFrames,
          command.rate,
        )
      : undefined;
  if (overlap) {
    const tracks = [...document.tracks.children];
    const sourceChildren = [...sourceTrack.children];
    sourceChildren.splice(source.itemIndex, 1);
    tracks[source.trackIndex] = {
      ...sourceTrack,
      children: normalizeGaps(sourceChildren, command.rate),
    };

    const currentTarget = tracks[target.trackIndex];
    if (!currentTarget) throw new CutCommandError('track-not-found', 'Target Track is missing.');
    const targetChildren = [...currentTarget.children];
    const anchorIndex = targetChildren.indexOf(overlap.anchor);
    if (anchorIndex < 0) {
      throw new CutCommandError(
        'invalid-command',
        'The overlapped Clip is no longer present on the target Track.',
      );
    }
    targetChildren.splice(anchorIndex + (overlap.insertAfter ? 1 : 0), 0, source.clip);
    tracks[target.trackIndex] = {
      ...currentTarget,
      children: normalizeGaps(targetChildren, command.rate),
    };
    return { ...document, tracks: { ...document.tracks, children: tracks } };
  }

  const tracks = [...document.tracks.children];
  const sourceChildren = [...sourceTrack.children];
  sourceChildren.splice(source.itemIndex, 1, createGap(clipDurationFrames, command.rate));
  tracks[source.trackIndex] = {
    ...sourceTrack,
    children: normalizeGaps(sourceChildren, command.rate),
  };

  const currentTarget = tracks[target.trackIndex];
  if (!currentTarget) throw new CutCommandError('track-not-found', 'Target Track is missing.');
  tracks[target.trackIndex] = {
    ...currentTarget,
    children: insertClipAtTime(
      currentTarget.children,
      source.clip,
      command.timelineStartFrames,
      clipDurationFrames,
      command.rate,
    ),
  };
  return { ...document, tracks: { ...document.tracks, children: tracks } };
}

function findPlacementOverlap(
  children: readonly OtioTrackItem[],
  excludedClip: OtioClip | undefined,
  startFrames: number,
  durationFrames: number,
  rate: number,
): { readonly anchor: OtioClip; readonly insertAfter: boolean } | undefined {
  const endFrames = startFrames + durationFrames;
  let cursor = 0;
  for (const item of children) {
    const itemDuration = itemTimelineFrames(item, rate);
    const itemEnd = cursor + itemDuration;
    if (
      item.OTIO_SCHEMA === 'Clip.2' &&
      item !== excludedClip &&
      startFrames < itemEnd &&
      endFrames > cursor
    ) {
      return {
        anchor: item,
        insertAfter: startFrames >= cursor + itemDuration / 2,
      };
    }
    cursor = itemEnd;
  }
  return undefined;
}

function insertClipAtTime(
  children: readonly OtioTrackItem[],
  clip: OtioClip,
  startFrames: number,
  durationFrames: number,
  rate: number,
): readonly OtioTrackItem[] {
  let cursor = 0;
  for (let index = 0; index < children.length; index += 1) {
    const item = children[index];
    if (!item) continue;
    const itemDuration = itemTimelineFrames(item, rate);
    const end = cursor + itemDuration;
    if (
      item.OTIO_SCHEMA === 'Gap.1' &&
      startFrames >= cursor &&
      startFrames + durationFrames <= end
    ) {
      const before = startFrames - cursor;
      const after = end - startFrames - durationFrames;
      const replacements: OtioTrackItem[] = [
        ...(before > 0 ? [createGap(before, rate)] : []),
        clip,
        ...(after > 0 ? [createGap(after, rate)] : []),
      ];
      const result = [...children];
      result.splice(index, 1, ...replacements);
      return normalizeGaps(result, rate);
    }
    cursor = end;
  }
  if (startFrames < cursor) {
    throw new CutCommandError(
      'invalid-command',
      'Clip placement would overlap another Clip on the target Track.',
    );
  }
  return normalizeGaps(
    [...children, ...(startFrames > cursor ? [createGap(startFrames - cursor, rate)] : []), clip],
    rate,
  );
}

function normalizeGaps(children: readonly OtioTrackItem[], rate: number): readonly OtioTrackItem[] {
  const result: OtioTrackItem[] = [];
  for (const item of children) {
    if (item.OTIO_SCHEMA !== 'Gap.1') {
      result.push(item);
      continue;
    }
    const duration = itemTimelineFrames(item, rate);
    if (duration <= 0) continue;
    const previous = result[result.length - 1];
    if (previous?.OTIO_SCHEMA === 'Gap.1') {
      result[result.length - 1] = createGap(itemTimelineFrames(previous, rate) + duration, rate);
    } else {
      result.push(createGap(duration, rate));
    }
  }
  return result;
}

function createGap(durationFrames: number, rate: number): OtioGap {
  return {
    OTIO_SCHEMA: 'Gap.1',
    name: 'Gap',
    source_range: timeRange(0, durationFrames, rate),
    metadata: {},
    effects: [],
    markers: [],
  };
}

function itemTimelineFrames(item: OtioTrackItem, rate: number): number {
  const sourceSeconds = item.source_range.duration.value / item.source_range.duration.rate;
  const playbackRate = item.OTIO_SCHEMA === 'Clip.2' ? clipPlaybackRate(item) : 1;
  return Math.round((sourceSeconds / playbackRate) * rate);
}

function projectFramesToSourceFrames(
  document: OtioTimeline,
  clip: OtioClip,
  projectFrames: number,
): number {
  const profile = readProjectProfile(document.metadata);
  const projectRate = profile
    ? profile.editRateNumerator / profile.editRateDenominator
    : clip.source_range.duration.rate;
  return Math.round(
    (projectFrames / projectRate) * clipPlaybackRate(clip) * clip.source_range.duration.rate,
  );
}

function assertWithinAvailableRange(
  clip: OtioClip,
  startFrames: number,
  durationFrames: number,
): void {
  const available = clip.media_reference.available_range;
  if (!available) return;
  const availableRate = available.duration.rate;
  const startSeconds = startFrames / clip.source_range.start_time.rate;
  const endSeconds = startSeconds + durationFrames / clip.source_range.duration.rate;
  const availableStartSeconds = available.start_time.value / available.start_time.rate;
  const availableEndSeconds = availableStartSeconds + available.duration.value / availableRate;
  if (startSeconds < availableStartSeconds || endSeconds > availableEndSeconds + 1e-9) {
    throw new CutCommandError('invalid-command', 'Clip range exceeds the media available range.');
  }
}

function preserveCurrentSourceAsAvailableRange(clip: OtioClip): OtioClip {
  if (clip.media_reference.available_range) return clip;
  return {
    ...clip,
    media_reference: {
      ...clip.media_reference,
      available_range: {
        OTIO_SCHEMA: clip.source_range.OTIO_SCHEMA,
        start_time: { ...clip.source_range.start_time },
        duration: { ...clip.source_range.duration },
      },
    },
  };
}

function addTrack(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'add-track' }>,
): OtioTimeline {
  if (command.trackId.length === 0 || findTrack(document, command.trackId)) {
    throw new CutCommandError(
      'identity-conflict',
      `Track ID ${command.trackId || '<empty>'} is unavailable.`,
    );
  }
  assertTrackCapacity(document, command.trackKind);
  return {
    ...document,
    tracks: {
      ...document.tracks,
      children: [
        ...document.tracks.children,
        createTrack(command.trackKind, command.name, command.trackId),
      ],
    },
  };
}

function removeTrack(document: OtioTimeline, trackId: string): OtioTimeline {
  const location = findTrack(document, trackId);
  if (!location) throw new CutCommandError('track-not-found', `Track ${trackId} was not found.`);
  if (location.track.kind === 'Video') {
    throw new CutCommandError('invalid-command', 'The required Video Track cannot be removed.');
  }
  const removedClipIds = new Set(
    location.track.children.flatMap((item) => {
      if (item.OTIO_SCHEMA !== 'Clip.2') return [];
      const clipId = readClipIdentity(item.metadata)?.clipId;
      return clipId ? [clipId] : [];
    }),
  );
  const children = document.tracks.children
    .filter((_, index) => index !== location.trackIndex)
    .map((track) => ({
      ...track,
      children: track.children.map((item) => {
        if (item.OTIO_SCHEMA !== 'Clip.2') return item;
        const identity = readClipIdentity(item.metadata);
        const linkedId = identity?.linkedAudioClipId ?? identity?.linkedVideoClipId;
        if (!identity || !linkedId || !removedClipIds.has(linkedId)) return item;
        return {
          ...item,
          metadata: withClipIdentity(removeLink(item.metadata), { clipId: identity.clipId }),
        };
      }),
    }));
  return {
    ...document,
    tracks: {
      ...document.tracks,
      children,
    },
  };
}

function renameTrack(document: OtioTimeline, trackId: string, name: string): OtioTimeline {
  const normalized = name.trim();
  if (normalized.length === 0) {
    throw new CutCommandError('invalid-command', 'Track name cannot be empty.');
  }
  return updateTrackById(document, trackId, (track) => ({ ...track, name: normalized }));
}

function moveTrack(document: OtioTimeline, trackId: string, toIndex: number): OtioTimeline {
  const location = findTrack(document, trackId);
  if (!location) throw new CutCommandError('track-not-found', `Track ${trackId} was not found.`);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= document.tracks.children.length) {
    throw new CutCommandError('invalid-command', 'Track destination index is outside the Stack.');
  }
  if (toIndex === location.trackIndex) return document;
  const children = [...document.tracks.children];
  const [track] = children.splice(location.trackIndex, 1);
  if (!track) throw new CutCommandError('track-not-found', `Track ${trackId} was not found.`);
  children.splice(toIndex, 0, track);
  return { ...document, tracks: { ...document.tracks, children } };
}

function moveItem(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'move-item' }>,
): OtioTimeline {
  const from = findTrack(document, command.fromTrackId);
  const to = findTrack(document, command.toTrackId);
  if (!from || !to) {
    throw new CutCommandError('track-not-found', 'Move source or target Track was not found.');
  }
  if (from.track.kind !== to.track.kind) {
    throw new CutCommandError(
      'incompatible-track',
      `Cannot move ${from.track.kind} content to a ${to.track.kind} Track.`,
    );
  }
  if (
    !Number.isInteger(command.fromIndex) ||
    command.fromIndex < 0 ||
    command.fromIndex >= from.track.children.length ||
    !Number.isInteger(command.toIndex) ||
    command.toIndex < 0 ||
    command.toIndex > to.track.children.length
  ) {
    throw new CutCommandError('invalid-command', 'Move indexes are outside the Track.');
  }
  const tracks = [...document.tracks.children];
  const sourceChildren = [...from.track.children];
  const [item] = sourceChildren.splice(command.fromIndex, 1);
  if (!item) throw new CutCommandError('invalid-command', 'Move source item is missing.');
  if (from.trackIndex === to.trackIndex) {
    const adjustedIndex =
      command.toIndex > command.fromIndex ? command.toIndex - 1 : command.toIndex;
    sourceChildren.splice(adjustedIndex, 0, item);
    tracks[from.trackIndex] = { ...from.track, children: sourceChildren };
  } else {
    const targetChildren = [...to.track.children];
    targetChildren.splice(command.toIndex, 0, item);
    tracks[from.trackIndex] = { ...from.track, children: sourceChildren };
    tracks[to.trackIndex] = { ...to.track, children: targetChildren };
  }
  return { ...document, tracks: { ...document.tracks, children: tracks } };
}

function rippleDelete(document: OtioTimeline, clipId: string): OtioTimeline {
  const location = findClip(document, clipId);
  if (!location) throw new CutCommandError('clip-not-found', `Clip ${clipId} was not found.`);
  const identity = readClipIdentity(location.clip.metadata);
  const linkedId = identity?.linkedAudioClipId ?? identity?.linkedVideoClipId;
  const ids = new Set([clipId, ...(linkedId ? [linkedId] : [])]);
  let removed = 0;
  const children = document.tracks.children.map((track) => ({
    ...track,
    children: track.children.filter((item) => {
      if (item.OTIO_SCHEMA !== 'Clip.2') return true;
      const itemId = readClipIdentity(item.metadata)?.clipId;
      if (!itemId || !ids.has(itemId)) return true;
      removed += 1;
      return false;
    }),
  }));
  if (removed === 0) throw new CutCommandError('clip-not-found', `Clip ${clipId} was not found.`);
  return { ...document, tracks: { ...document.tracks, children } };
}

function insertGap(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'insert-gap' }>,
): OtioTimeline {
  assertPositive(command.durationFrames, 'durationFrames');
  assertPositive(command.rate, 'rate');
  const gap: OtioGap = {
    OTIO_SCHEMA: 'Gap.1',
    name: 'Gap',
    source_range: timeRange(0, command.durationFrames, command.rate),
    metadata: {},
    effects: [],
    markers: [],
  };
  return updateTrackById(document, command.trackId, (track) => {
    if (
      !Number.isInteger(command.index) ||
      command.index < 0 ||
      command.index > track.children.length
    ) {
      throw new CutCommandError('invalid-command', 'Gap index is outside the Track.');
    }
    const children = [...track.children];
    children.splice(command.index, 0, gap);
    return { ...track, children };
  });
}

function removeGap(document: OtioTimeline, trackId: string, itemIndex: number): OtioTimeline {
  return updateTrackById(document, trackId, (track) => {
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= track.children.length) {
      throw new CutCommandError('invalid-command', 'Gap index is outside the Track.');
    }
    if (track.children[itemIndex]?.OTIO_SCHEMA !== 'Gap.1') {
      throw new CutCommandError('invalid-command', 'Selected Track item is not a Gap.');
    }
    return {
      ...track,
      children: track.children.filter((_, index) => index !== itemIndex),
    };
  });
}

function separateAudio(
  document: OtioTimeline,
  videoClipId: string,
  audioClipId: string,
  audioTrackId: string,
): OtioTimeline {
  assertIdentityAvailable(document, audioClipId);
  const location = findClip(document, videoClipId);
  if (!location || document.tracks.children[location.trackIndex]?.kind !== 'Video') {
    throw new CutCommandError('clip-not-found', `Video Clip ${videoClipId} was not found.`);
  }
  const linked = createLinkedAudioClip(location.clip, audioClipId);
  let next = replaceTrackItems(document, location.trackIndex, location.itemIndex, [
    linked.videoClip,
  ]);
  if (!findTrack(next, audioTrackId)) {
    assertTrackCapacity(next, 'Audio');
    next = {
      ...next,
      tracks: {
        ...next.tracks,
        children: [
          ...next.tracks.children,
          createTrack(
            'Audio',
            `Audio ${next.tracks.children.filter((track) => track.kind === 'Audio').length + 1}`,
            audioTrackId,
          ),
        ],
      },
    };
  }
  const target = findTrack(next, audioTrackId);
  if (target?.track.kind !== 'Audio') {
    throw new CutCommandError('incompatible-track', 'Separated audio requires an Audio Track.');
  }
  next = updateTrackById(next, audioTrackId, (track) => ({
    ...track,
    children: [...track.children, linked.audioClip],
  }));
  return next;
}

function unseparateAudio(document: OtioTimeline, videoClipId: string): OtioTimeline {
  const location = findClip(document, videoClipId);
  if (!location)
    throw new CutCommandError('clip-not-found', `Video Clip ${videoClipId} was not found.`);
  const identity = readClipIdentity(location.clip.metadata);
  if (!identity?.linkedAudioClipId) {
    throw new CutCommandError('linked-clip-required', 'Video Clip does not have linked audio.');
  }
  const videoMetadata = removeLink(location.clip.metadata);
  const video: OtioClip = {
    ...location.clip,
    metadata: withClipIdentity(videoMetadata, { clipId: identity.clipId }),
  };
  let next = replaceTrackItems(document, location.trackIndex, location.itemIndex, [video]);
  next = removeClipOnly(next, identity.linkedAudioClipId);
  return next;
}

function mapClip(
  document: OtioTimeline,
  clipId: string,
  update: (clip: OtioClip) => OtioClip,
): OtioTimeline {
  const location = findClip(document, clipId);
  if (!location) throw new CutCommandError('clip-not-found', `Clip ${clipId} was not found.`);
  return replaceTrackItems(document, location.trackIndex, location.itemIndex, [
    update(location.clip),
  ]);
}

function mapClipAndLinked(
  document: OtioTimeline,
  clipId: string,
  update: (clip: OtioClip) => OtioClip,
): OtioTimeline {
  const location = findClip(document, clipId);
  if (!location) throw new CutCommandError('clip-not-found', `Clip ${clipId} was not found.`);
  const identity = readClipIdentity(location.clip.metadata);
  const linkedId = identity?.linkedAudioClipId ?? identity?.linkedVideoClipId;
  const next = mapClip(document, clipId, update);
  return linkedId ? mapClip(next, linkedId, update) : next;
}

function setAudio(
  document: OtioTimeline,
  clipId: string,
  settings: CutAudioSettings,
): OtioTimeline {
  const location = findClip(document, clipId);
  if (!location) throw new CutCommandError('clip-not-found', `Clip ${clipId} was not found.`);
  if (document.tracks.children[location.trackIndex]?.kind === 'Subtitle') {
    throw new CutCommandError(
      'incompatible-track',
      'Subtitle Clips do not support audio settings.',
    );
  }
  const durationSeconds =
    location.clip.source_range.duration.value /
    location.clip.source_range.duration.rate /
    clipPlaybackRate(location.clip);
  if (
    typeof settings.muted !== 'boolean' ||
    (settings.gainDb !== undefined &&
      (!Number.isFinite(settings.gainDb) || settings.gainDb < -60 || settings.gainDb > 24)) ||
    (settings.fadeInSeconds !== undefined &&
      (!Number.isFinite(settings.fadeInSeconds) ||
        settings.fadeInSeconds < 0 ||
        settings.fadeInSeconds > durationSeconds)) ||
    (settings.fadeOutSeconds !== undefined &&
      (!Number.isFinite(settings.fadeOutSeconds) ||
        settings.fadeOutSeconds < 0 ||
        settings.fadeOutSeconds > durationSeconds))
  ) {
    throw new CutCommandError('invalid-command', 'Audio settings are outside supported bounds.');
  }
  return replaceTrackItems(document, location.trackIndex, location.itemIndex, [
    {
      ...location.clip,
      metadata: withAudioSettings(location.clip.metadata, settings),
    },
  ]);
}

function setClipEnabled(document: OtioTimeline, clipId: string, enabled: boolean): OtioTimeline {
  return mapClip(document, clipId, (clip) => ({ ...clip, enabled }));
}

function setTrackEnabled(document: OtioTimeline, trackId: string, enabled: boolean): OtioTimeline {
  return updateTrackById(document, trackId, (track) => ({ ...track, enabled }));
}

function setTrackMuted(document: OtioTimeline, trackId: string, muted: boolean): OtioTimeline {
  return updateTrackById(document, trackId, (track) => ({
    ...track,
    metadata: withAudioSettings(track.metadata, { muted }),
  }));
}

function setClipLocked(document: OtioTimeline, clipId: string, locked: boolean): OtioTimeline {
  return mapClip(document, clipId, (clip) => ({
    ...clip,
    metadata: withEditState(clip.metadata, { locked }),
  }));
}

function setTrackLocked(document: OtioTimeline, trackId: string, locked: boolean): OtioTimeline {
  return updateTrackById(document, trackId, (track) => ({
    ...track,
    metadata: withEditState(track.metadata, { locked }),
  }));
}

function duplicateClip(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'duplicate-clip' }>,
): OtioTimeline {
  assertIdentityAvailable(document, command.duplicateClipId);
  const source = findClip(document, command.clipId);
  if (!source) {
    throw new CutCommandError('clip-not-found', `Clip ${command.clipId} was not found.`);
  }
  const sourceIdentity = readClipIdentity(source.clip.metadata);
  if (!sourceIdentity) {
    throw new CutCommandError('invalid-command', `Clip ${command.clipId} has no stable identity.`);
  }
  const linkedId = sourceIdentity.linkedAudioClipId ?? sourceIdentity.linkedVideoClipId;
  if (!linkedId) {
    const duplicate = cloneClipWithIdentity(source.clip, { clipId: command.duplicateClipId });
    return insertClipAfter(document, source.trackIndex, source.itemIndex, duplicate);
  }
  if (!command.duplicateLinkedClipId) {
    throw new CutCommandError(
      'linked-clip-required',
      'Duplicating linked media requires a new identity for both Clips.',
    );
  }
  assertIdentityAvailable(document, command.duplicateLinkedClipId);
  const linked = findClip(document, linkedId);
  if (!linked) {
    throw new CutCommandError('linked-clip-required', `Linked Clip ${linkedId} was not found.`);
  }
  const sourceIsVideo = sourceIdentity.linkedAudioClipId !== undefined;
  const duplicateSource = cloneClipWithIdentity(source.clip, {
    clipId: command.duplicateClipId,
    ...(sourceIsVideo
      ? { linkedAudioClipId: command.duplicateLinkedClipId }
      : { linkedVideoClipId: command.duplicateLinkedClipId }),
  });
  const duplicateLinked = cloneClipWithIdentity(linked.clip, {
    clipId: command.duplicateLinkedClipId,
    ...(sourceIsVideo
      ? { linkedVideoClipId: command.duplicateClipId }
      : { linkedAudioClipId: command.duplicateClipId }),
  });
  const withSource = insertClipAfter(
    document,
    source.trackIndex,
    source.itemIndex,
    duplicateSource,
  );
  return insertClipAfter(withSource, linked.trackIndex, linked.itemIndex, duplicateLinked);
}

function cloneClipAtTime(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'clone-clip-at-time' }>,
): OtioTimeline {
  assertTimelineStart(command.timelineStartFrames, command.rate);
  assertIdentityAvailable(document, command.duplicateClipId);
  const source = findClip(document, command.clipId);
  if (!source) {
    throw new CutCommandError('clip-not-found', `Clip ${command.clipId} was not found.`);
  }
  const sourceIdentity = readClipIdentity(source.clip.metadata);
  if (!sourceIdentity) {
    throw new CutCommandError('invalid-command', `Clip ${command.clipId} has no stable identity.`);
  }
  const linkedId = sourceIdentity.linkedAudioClipId ?? sourceIdentity.linkedVideoClipId;
  if (!linkedId) {
    if (
      command.duplicateLinkedClipId !== undefined ||
      command.linkedTimelineStartFrames !== undefined
    ) {
      throw new CutCommandError(
        'invalid-command',
        'An unlinked Clip cannot allocate linked clone placement.',
      );
    }
    return insertCloneAtTime(
      document,
      source.trackIndex,
      cloneClipWithIdentity(source.clip, { clipId: command.duplicateClipId }),
      command.timelineStartFrames,
      command.rate,
    );
  }
  if (
    command.duplicateLinkedClipId === undefined ||
    command.linkedTimelineStartFrames === undefined
  ) {
    throw new CutCommandError(
      'linked-clip-required',
      'Cloning linked media requires identity and placement for both Clips.',
    );
  }
  assertTimelineStart(command.linkedTimelineStartFrames, command.rate);
  assertIdentityAvailable(document, command.duplicateLinkedClipId);
  const linked = findClip(document, linkedId);
  if (!linked) {
    throw new CutCommandError('linked-clip-required', `Linked Clip ${linkedId} was not found.`);
  }
  const sourceIsVideo = sourceIdentity.linkedAudioClipId !== undefined;
  const duplicateSource = cloneClipWithIdentity(source.clip, {
    clipId: command.duplicateClipId,
    ...(sourceIsVideo
      ? { linkedAudioClipId: command.duplicateLinkedClipId }
      : { linkedVideoClipId: command.duplicateLinkedClipId }),
  });
  const duplicateLinked = cloneClipWithIdentity(linked.clip, {
    clipId: command.duplicateLinkedClipId,
    ...(sourceIsVideo
      ? { linkedVideoClipId: command.duplicateClipId }
      : { linkedAudioClipId: command.duplicateClipId }),
  });
  const withSource = insertCloneAtTime(
    document,
    source.trackIndex,
    duplicateSource,
    command.timelineStartFrames,
    command.rate,
  );
  return insertCloneAtTime(
    withSource,
    linked.trackIndex,
    duplicateLinked,
    command.linkedTimelineStartFrames,
    command.rate,
  );
}

function insertCloneAtTime(
  document: OtioTimeline,
  trackIndex: number,
  clip: OtioClip,
  timelineStartFrames: number,
  rate: number,
): OtioTimeline {
  const tracks = [...document.tracks.children];
  const track = tracks[trackIndex];
  if (!track) {
    throw new CutCommandError('track-not-found', 'Clone target Track is missing.');
  }
  tracks[trackIndex] = {
    ...track,
    children: insertClipAtTime(
      track.children,
      clip,
      timelineStartFrames,
      itemTimelineFrames(clip, rate),
      rate,
    ),
  };
  return { ...document, tracks: { ...document.tracks, children: tracks } };
}

function assertTimelineStart(timelineStartFrames: number, rate: number): void {
  if (!Number.isInteger(timelineStartFrames) || timelineStartFrames < 0) {
    throw new CutCommandError(
      'invalid-command',
      'Clip clone placement must use non-negative whole project frames.',
    );
  }
  assertPositive(rate, 'rate');
}

function duplicateTrack(
  document: OtioTimeline,
  command: Extract<CutCommand, { type: 'duplicate-track' }>,
): OtioTimeline {
  const source = findTrack(document, command.trackId);
  if (!source) {
    throw new CutCommandError('track-not-found', `Track ${command.trackId} was not found.`);
  }
  if (source.track.kind === 'Video') {
    throw new CutCommandError('track-limit', 'The fixed Video Track cannot be duplicated.');
  }
  if (findTrack(document, command.duplicateTrackId) || command.duplicateTrackId.length === 0) {
    throw new CutCommandError(
      'identity-conflict',
      `Track ID ${command.duplicateTrackId || '<empty>'} is unavailable.`,
    );
  }
  assertTrackCapacity(document, source.track.kind);
  const sourceClips = source.track.children.filter(
    (item): item is OtioClip => item.OTIO_SCHEMA === 'Clip.2',
  );
  if (sourceClips.length !== command.duplicateClipIds.length) {
    throw new CutCommandError(
      'invalid-command',
      'Track duplication requires one new identity for every Clip.',
    );
  }
  const duplicateIds = new Set(command.duplicateClipIds);
  if (
    duplicateIds.size !== command.duplicateClipIds.length ||
    command.duplicateClipIds.some((clipId) => clipId.length === 0 || findClip(document, clipId))
  ) {
    throw new CutCommandError(
      'identity-conflict',
      'Track duplication Clip identities must be new and unique.',
    );
  }
  let clipIndex = 0;
  const duplicate: OtioTrack = {
    ...source.track,
    name: `${source.track.name} Copy`,
    metadata: withEditState(
      withTrackIdentity(source.track.metadata, { trackId: command.duplicateTrackId }),
      { locked: false },
    ),
    children: source.track.children.map((item) => {
      if (item.OTIO_SCHEMA !== 'Clip.2') return item;
      const clipId = command.duplicateClipIds[clipIndex];
      clipIndex += 1;
      if (!clipId) {
        throw new CutCommandError('invalid-command', 'Duplicate Clip identity is missing.');
      }
      return cloneClipWithIdentity(item, { clipId });
    }),
  };
  const children = [...document.tracks.children];
  children.splice(source.trackIndex + 1, 0, duplicate);
  return { ...document, tracks: { ...document.tracks, children } };
}

function cloneClipWithIdentity(
  clip: OtioClip,
  identity: Parameters<typeof withClipIdentity>[1],
): OtioClip {
  return {
    ...clip,
    metadata: withEditState(withClipIdentity(removeLink(clip.metadata), identity), {
      locked: false,
    }),
  };
}

function insertClipAfter(
  document: OtioTimeline,
  trackIndex: number,
  itemIndex: number,
  clip: OtioClip,
): OtioTimeline {
  const tracks = [...document.tracks.children];
  const track = tracks[trackIndex];
  if (!track) throw new CutCommandError('track-not-found', 'Duplicate target Track is missing.');
  const children = [...track.children];
  children.splice(itemIndex + 1, 0, clip);
  tracks[trackIndex] = { ...track, children };
  return { ...document, tracks: { ...document.tracks, children: tracks } };
}

function updateOnlyTrackOfKind(
  document: OtioTimeline,
  kind: OtioTrackKind,
  update: (track: OtioTrack) => OtioTrack,
): OtioTimeline {
  const index = document.tracks.children.findIndex((track) => track.kind === kind);
  const tracks = [...document.tracks.children];
  if (index < 0) throw new CutCommandError('track-not-found', `Required ${kind} Track is missing.`);
  const track = tracks[index];
  if (!track) throw new CutCommandError('invalid-command', 'Track index became invalid.');
  tracks[index] = update(track);
  return { ...document, tracks: { ...document.tracks, children: tracks } };
}

function updateTrackById(
  document: OtioTimeline,
  trackId: string,
  update: (track: OtioTrack) => OtioTrack,
): OtioTimeline {
  const location = findTrack(document, trackId);
  if (!location) throw new CutCommandError('track-not-found', `Track ${trackId} was not found.`);
  const tracks = [...document.tracks.children];
  tracks[location.trackIndex] = update(location.track);
  return { ...document, tracks: { ...document.tracks, children: tracks } };
}

function findTrack(
  document: OtioTimeline,
  trackId: string,
): { readonly track: OtioTrack; readonly trackIndex: number } | undefined {
  const trackIndex = document.tracks.children.findIndex(
    (track) => readTrackIdentity(track.metadata)?.trackId === trackId,
  );
  const track = document.tracks.children[trackIndex];
  return track ? { track, trackIndex } : undefined;
}

function assertTrackCapacity(document: OtioTimeline, kind: Exclude<OtioTrackKind, 'Video'>): void {
  const kindCount = document.tracks.children.filter((track) => track.kind === kind).length;
  const kindLimit = kind === 'Audio' ? 3 : 1;
  if (document.tracks.children.length >= 5 || kindCount >= kindLimit) {
    throw new CutCommandError(
      'track-limit',
      `Cut allows at most ${kindLimit} ${kind} Track${kindLimit === 1 ? '' : 's'} and five Tracks total.`,
    );
  }
}

function replaceTrackItems(
  document: OtioTimeline,
  trackIndex: number,
  itemIndex: number,
  replacements: readonly OtioTrackItem[],
): OtioTimeline {
  const tracks = [...document.tracks.children];
  const track = tracks[trackIndex];
  if (!track) throw new CutCommandError('invalid-command', 'Track index became invalid.');
  const children = [...track.children];
  children.splice(itemIndex, 1, ...replacements);
  tracks[trackIndex] = { ...track, children };
  return { ...document, tracks: { ...document.tracks, children: tracks } };
}

function removeClipOnly(document: OtioTimeline, clipId: string): OtioTimeline {
  const location = findClip(document, clipId);
  if (!location)
    throw new CutCommandError('clip-not-found', `Linked Clip ${clipId} was not found.`);
  return replaceTrackItems(document, location.trackIndex, location.itemIndex, []);
}

function findClip(
  document: OtioTimeline,
  clipId: string,
):
  { readonly clip: OtioClip; readonly trackIndex: number; readonly itemIndex: number } | undefined {
  for (let trackIndex = 0; trackIndex < document.tracks.children.length; trackIndex += 1) {
    const track = document.tracks.children[trackIndex];
    if (!track) continue;
    for (let itemIndex = 0; itemIndex < track.children.length; itemIndex += 1) {
      const item = track.children[itemIndex];
      if (item?.OTIO_SCHEMA === 'Clip.2' && readClipIdentity(item.metadata)?.clipId === clipId) {
        return { clip: item, trackIndex, itemIndex };
      }
    }
  }
  return undefined;
}

function assertIdentityAvailable(document: OtioTimeline, clipId: string): void {
  if (clipId.length === 0 || findClip(document, clipId)) {
    throw new CutCommandError(
      'identity-conflict',
      `Clip ID ${clipId || '<empty>'} is unavailable.`,
    );
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new CutCommandError('invalid-command', `${name} must be positive.`);
  }
}

function removeLink(
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
