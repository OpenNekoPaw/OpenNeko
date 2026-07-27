import type {
  CutClipRepresentationRequest,
  CutThumbnailDensity,
  TimelineView,
} from '@neko-cut/domain';
import { CUT_THUMBNAIL_DENSITIES, CUT_THUMBNAIL_TILE_WIDTH } from '@neko-cut/domain';

const MAX_REQUESTS = 24;
const VIEWPORT_OVERSCAN_RATIO = 0.5;

export function buildClipRepresentationRequests(
  view: TimelineView | undefined,
  visibleRange: { readonly start: number; readonly end: number },
  pixelsPerSecond: number,
): readonly CutClipRepresentationRequest[] {
  if (!view || visibleRange.end <= visibleRange.start) return [];
  const waveformRequests: CutClipRepresentationRequest[] = [];
  const thumbnailRequests: {
    readonly request: Extract<CutClipRepresentationRequest, { readonly kind: 'thumbnail' }>;
    readonly distanceFromViewportCenter: number;
  }[] = [];
  const density = selectThumbnailDensity(pixelsPerSecond);
  const tileDurationSeconds = CUT_THUMBNAIL_TILE_WIDTH / density;
  const visibleDuration = visibleRange.end - visibleRange.start;
  const overscanSeconds = visibleDuration * VIEWPORT_OVERSCAN_RATIO;
  const thumbnailRange = {
    start: Math.max(0, visibleRange.start - overscanSeconds),
    end: visibleRange.end + overscanSeconds,
  };
  const viewportCenter = (visibleRange.start + visibleRange.end) / 2;

  for (const track of view.tracks) {
    if (track.kind === 'Subtitle') continue;
    for (const item of track.items) {
      if (item.kind !== 'clip') continue;
      if (track.kind === 'Video') {
        const clipStart = item.startSeconds;
        const clipEnd = item.startSeconds + item.durationSeconds;
        const rangeStart = Math.max(clipStart, thumbnailRange.start);
        const rangeEnd = Math.min(clipEnd, thumbnailRange.end);
        if (rangeEnd <= rangeStart) continue;
        const firstTileIndex = Math.floor(rangeStart / tileDurationSeconds);
        const lastTileIndex = Math.ceil(rangeEnd / tileDurationSeconds) - 1;
        for (let tileIndex = firstTileIndex; tileIndex <= lastTileIndex; tileIndex += 1) {
          const tileCenter = (tileIndex + 0.5) * tileDurationSeconds;
          thumbnailRequests.push({
            request: {
              clipId: item.clipId,
              kind: 'thumbnail',
              density,
              tileIndex,
            },
            distanceFromViewportCenter: Math.abs(tileCenter - viewportCenter),
          });
        }
      } else if (
        item.startSeconds + item.durationSeconds > visibleRange.start &&
        item.startSeconds < visibleRange.end
      ) {
        waveformRequests.push({
          clipId: item.clipId,
          kind: 'waveform',
          peaksPerSecond: Math.max(1, Math.min(100, Math.round(pixelsPerSecond / 3))),
        });
      }
    }
  }
  thumbnailRequests.sort(
    (left, right) =>
      left.distanceFromViewportCenter - right.distanceFromViewportCenter ||
      left.request.tileIndex - right.request.tileIndex ||
      left.request.clipId.localeCompare(right.request.clipId),
  );
  const remaining = Math.max(0, MAX_REQUESTS - waveformRequests.length);
  return [
    ...waveformRequests.slice(0, MAX_REQUESTS),
    ...thumbnailRequests.slice(0, remaining).map(({ request }) => request),
  ];
}

function selectThumbnailDensity(pixelsPerSecond: number): CutThumbnailDensity {
  const normalized = Number.isFinite(pixelsPerSecond)
    ? Math.max(CUT_THUMBNAIL_DENSITIES[0], pixelsPerSecond)
    : CUT_THUMBNAIL_DENSITIES[0];
  return CUT_THUMBNAIL_DENSITIES.reduce((closest, candidate) =>
    Math.abs(Math.log2(candidate / normalized)) < Math.abs(Math.log2(closest / normalized))
      ? candidate
      : closest,
  );
}
