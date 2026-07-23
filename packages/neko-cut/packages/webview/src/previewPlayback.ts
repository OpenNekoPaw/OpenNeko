export interface PreviewPlaybackSegment {
  readonly timelineStartSeconds: number;
  readonly wallStartMilliseconds: number;
  readonly segmentEndSeconds: number;
  readonly timelineEndSeconds: number;
}

export type PreviewPlaybackAdvance =
  | { readonly kind: 'continue'; readonly playheadSeconds: number }
  | { readonly kind: 'segment-boundary'; readonly playheadSeconds: number }
  | { readonly kind: 'timeline-end'; readonly playheadSeconds: number };

export function advancePreviewPlayback(
  segment: PreviewPlaybackSegment,
  wallNowMilliseconds: number,
): PreviewPlaybackAdvance {
  const elapsedSeconds = Math.max(0, (wallNowMilliseconds - segment.wallStartMilliseconds) / 1000);
  const nextSeconds = segment.timelineStartSeconds + elapsedSeconds;
  if (nextSeconds >= segment.timelineEndSeconds) {
    return { kind: 'timeline-end', playheadSeconds: segment.timelineEndSeconds };
  }
  if (nextSeconds >= segment.segmentEndSeconds) {
    return { kind: 'segment-boundary', playheadSeconds: segment.segmentEndSeconds };
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
