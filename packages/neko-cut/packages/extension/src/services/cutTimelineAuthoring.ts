import type { ProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import { CENTERED_TRANSFORM } from '@neko/shared';

export type CutTimelineClipMediaType = 'image' | 'video' | 'audio';

export interface AddCutTimelineClipRequest {
  readonly projectData: ProjectData;
  readonly sourcePath: string;
  readonly name: string;
  readonly mediaType: CutTimelineClipMediaType;
  readonly duration?: number;
  readonly startTime?: number;
  readonly trackId?: string;
  readonly trackIndex?: number;
  readonly createId?: () => string;
}

export interface AddCutTimelineClipResult {
  readonly projectData: ProjectData;
  readonly trackId: string;
  readonly elementId: string;
  readonly createdTrack: boolean;
  readonly sourcePath: string;
  readonly mediaType: CutTimelineClipMediaType;
  readonly startTime: number;
  readonly duration: number;
}

const DEFAULT_GENERATED_IMAGE_DURATION_SECONDS = 3;
const DEFAULT_GENERATED_MEDIA_DURATION_SECONDS = 10;

export function addCutTimelineClip(request: AddCutTimelineClipRequest): AddCutTimelineClipResult {
  const tracks = request.projectData.tracks.map((track) => ({
    ...track,
    elements: [...track.elements],
  }));
  const targetTrackType = request.mediaType === 'audio' ? 'audio' : 'media';
  const target = resolveTargetTrack({
    tracks,
    trackId: request.trackId,
    trackIndex: request.trackIndex,
    trackType: targetTrackType,
    createId: request.createId ?? createAuthoringId,
  });
  if (target.createdTrack) {
    tracks.push(target.track);
  }

  const duration = request.duration ?? getDefaultDuration(request.mediaType);
  const startTime = request.startTime ?? getProjectTotalDuration(request.projectData);
  const elementId = (request.createId ?? createAuthoringId)();
  const element = createTimelineClipElement({
    id: elementId,
    sourcePath: request.sourcePath,
    name: request.name,
    mediaType: request.mediaType,
    duration,
    startTime,
  });

  target.track.elements.push(element);

  return {
    projectData: {
      ...request.projectData,
      tracks,
    },
    trackId: target.track.id,
    elementId,
    createdTrack: target.createdTrack,
    sourcePath: request.sourcePath,
    mediaType: request.mediaType,
    startTime,
    duration,
  };
}

function resolveTargetTrack(input: {
  readonly tracks: TimelineTrack[];
  readonly trackType: TimelineTrack['type'];
  readonly trackId?: string;
  readonly trackIndex?: number;
  readonly createId: () => string;
}): { readonly track: TimelineTrack; readonly createdTrack: boolean } {
  const explicitTrack = input.trackId
    ? input.tracks.find((track) => track.id === input.trackId && track.type === input.trackType)
    : undefined;
  if (explicitTrack) return { track: explicitTrack, createdTrack: false };

  const indexedTrack =
    input.trackIndex !== undefined
      ? input.tracks[input.trackIndex]?.type === input.trackType
        ? input.tracks[input.trackIndex]
        : undefined
      : undefined;
  if (indexedTrack) return { track: indexedTrack, createdTrack: false };

  const existingTrack = input.tracks.find((track) => track.type === input.trackType);
  if (existingTrack) return { track: existingTrack, createdTrack: false };

  return {
    createdTrack: true,
    track: {
      id: input.createId(),
      name: input.trackType === 'audio' ? 'Audio Track' : 'Media Track',
      type: input.trackType,
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: false,
    },
  };
}

function createTimelineClipElement(input: {
  readonly id: string;
  readonly sourcePath: string;
  readonly name: string;
  readonly mediaType: CutTimelineClipMediaType;
  readonly duration: number;
  readonly startTime: number;
}): TimelineElement {
  const base = {
    id: input.id,
    src: input.sourcePath,
    name: input.name,
    duration: input.duration,
    startTime: input.startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: CENTERED_TRANSFORM,
    opacity: 1,
    blendMode: 'normal' as const,
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
  if (input.mediaType === 'audio') {
    return {
      ...base,
      type: 'audio',
    };
  }
  return {
    ...base,
    type: 'media',
    mediaType: input.mediaType,
  };
}

function getProjectTotalDuration(projectData: ProjectData): number {
  let maxEnd = 0;
  for (const track of projectData.tracks) {
    for (const element of track.elements) {
      const endTime = element.startTime + element.duration - element.trimStart - element.trimEnd;
      if (endTime > maxEnd) maxEnd = endTime;
    }
  }
  return maxEnd;
}

function getDefaultDuration(mediaType: CutTimelineClipMediaType): number {
  return mediaType === 'image'
    ? DEFAULT_GENERATED_IMAGE_DURATION_SECONDS
    : DEFAULT_GENERATED_MEDIA_DURATION_SECONDS;
}

function createAuthoringId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
