import type { CutPreviewPreparationProfile } from '@neko/cut-domain';

export interface PreviewPlaybackSegment {
  readonly timelineStartSeconds: number;
  readonly wallStartMilliseconds: number;
  readonly segmentEndSeconds: number;
  readonly timelineEndSeconds: number;
  readonly preparationLeadSeconds?: number;
  readonly mediaClock?: {
    readonly sourceStartSeconds: number;
    readonly playbackRate: number;
  };
}

const DEFAULT_PREVIEW_PREPARE_LEAD_SECONDS = 0.5;
const MEDIA_BOUNDARY_TOLERANCE_SECONDS = 0.05;

export function previewPreparationLeadSeconds(
  profile: CutPreviewPreparationProfile | undefined,
): number {
  switch (profile) {
    case 'h264-sdr-transcode':
      return 5;
    case 'h264-mp4-remux':
      return 2;
    case 'h264-mp4-direct':
    case 'vp8-webm-direct':
    case undefined:
      return DEFAULT_PREVIEW_PREPARE_LEAD_SECONDS;
  }
}

export type PreviewPlaybackAdvance =
  | { readonly kind: 'continue'; readonly playheadSeconds: number }
  | {
      readonly kind: 'prepare-next';
      readonly playheadSeconds: number;
      readonly nextSegmentStartSeconds: number;
    }
  | { readonly kind: 'segment-boundary'; readonly playheadSeconds: number }
  | { readonly kind: 'timeline-end'; readonly playheadSeconds: number };

export function advancePreviewPlayback(
  segment: PreviewPlaybackSegment,
  wallNowMilliseconds: number,
  mediaTimeSeconds?: number,
  currentTimelineTimeSeconds = segment.timelineStartSeconds,
): PreviewPlaybackAdvance {
  const heldTimelineTimeSeconds = Math.min(
    Math.max(currentTimelineTimeSeconds, segment.timelineStartSeconds),
    Math.min(segment.segmentEndSeconds, segment.timelineEndSeconds),
  );
  const elapsedSeconds = segment.mediaClock
    ? mediaTimeSeconds === undefined || mediaTimeSeconds < segment.mediaClock.sourceStartSeconds
      ? heldTimelineTimeSeconds - segment.timelineStartSeconds
      : Math.max(
          0,
          (mediaTimeSeconds - segment.mediaClock.sourceStartSeconds) /
            segment.mediaClock.playbackRate,
        )
    : Math.max(0, (wallNowMilliseconds - segment.wallStartMilliseconds) / 1000);
  const nextSeconds = segment.timelineStartSeconds + elapsedSeconds;
  if (nextSeconds + MEDIA_BOUNDARY_TOLERANCE_SECONDS >= segment.timelineEndSeconds) {
    return { kind: 'timeline-end', playheadSeconds: segment.timelineEndSeconds };
  }
  if (nextSeconds + MEDIA_BOUNDARY_TOLERANCE_SECONDS >= segment.segmentEndSeconds) {
    return { kind: 'segment-boundary', playheadSeconds: segment.segmentEndSeconds };
  }
  if (
    segment.segmentEndSeconds < segment.timelineEndSeconds &&
    nextSeconds >=
      segment.segmentEndSeconds -
        (segment.preparationLeadSeconds ?? DEFAULT_PREVIEW_PREPARE_LEAD_SECONDS)
  ) {
    return {
      kind: 'prepare-next',
      playheadSeconds: nextSeconds,
      nextSegmentStartSeconds: segment.segmentEndSeconds,
    };
  }
  return { kind: 'continue', playheadSeconds: nextSeconds };
}

export function finishPreviewPlaybackSegment(
  segment: PreviewPlaybackSegment,
): Exclude<PreviewPlaybackAdvance, { kind: 'continue' }> {
  return segment.segmentEndSeconds >= segment.timelineEndSeconds
    ? { kind: 'timeline-end', playheadSeconds: segment.timelineEndSeconds }
    : { kind: 'segment-boundary', playheadSeconds: segment.segmentEndSeconds };
}

export function shouldAcceptPreviewReady(
  readyRequestId: string,
  requestedRequestId: string | undefined,
  playing: boolean,
): boolean {
  return playing && readyRequestId === requestedRequestId;
}

export function applyPreviewPlaybackAdvance(
  advance: Exclude<PreviewPlaybackAdvance, { kind: 'continue' }>,
  actions: {
    readonly seek: (playheadSeconds: number) => void;
    readonly prepareNextSegment: (playheadSeconds: number) => void;
    readonly activateNextSegment: (playheadSeconds: number) => void;
    readonly stopAtTimelineEnd: () => void;
  },
): void {
  actions.seek(advance.playheadSeconds);
  if (advance.kind === 'prepare-next') {
    actions.prepareNextSegment(advance.nextSegmentStartSeconds);
    return;
  }
  if (advance.kind === 'segment-boundary') {
    actions.activateNextSegment(advance.playheadSeconds);
    return;
  }
  actions.stopAtTimelineEnd();
}
