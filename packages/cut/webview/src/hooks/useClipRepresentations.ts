import { useEffect, useMemo, useState, type RefObject } from 'react';
import type {
  CutClipRepresentationRequest,
  CutClipRepresentationResult,
  CutThumbnailDensity,
  TimelineView,
} from '@neko/cut-domain';
import { TRACK_HEADER_WIDTH } from '../components/Timeline/timelineMath';
import { useCutOtioController } from '../controllers/CutOtioControllerContext';
import { representationKey, useCutPresentationStore } from '../stores/cut-presentation-store';
import { buildClipRepresentationRequests } from './clipRepresentationPlanner';

type ThumbnailRequest = Extract<CutClipRepresentationRequest, { readonly kind: 'thumbnail' }>;
type ThumbnailResult = Extract<CutClipRepresentationResult, { readonly kind: 'thumbnail' }>;
type WaveformResult = Extract<CutClipRepresentationResult, { readonly kind: 'waveform' }>;

export type ThumbnailTileState =
  ThumbnailResult | (ThumbnailRequest & { readonly status: 'loading' });

export interface ThumbnailClipRepresentationState {
  readonly kind: 'thumbnail';
  readonly status: 'loading' | 'ready' | 'partial' | 'unavailable';
  readonly density: CutThumbnailDensity;
  readonly tiles: readonly ThumbnailTileState[];
}

export type ClipRepresentationState =
  | ThumbnailClipRepresentationState
  | WaveformResult
  | (Extract<CutClipRepresentationRequest, { readonly kind: 'waveform' }> & {
      readonly status: 'loading';
    });

export function useClipRepresentations(input: {
  readonly view?: TimelineView;
  readonly pixelsPerSecond: number;
  readonly timelineRef: RefObject<HTMLDivElement>;
}): ReadonlyMap<string, ClipRepresentationState> {
  const controller = useCutOtioController();
  const received = useCutPresentationStore((state) => state.representations);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  useEffect(() => {
    const element = input.timelineRef.current;
    if (!element) return;
    const update = () => {
      const start = Math.max(0, element.scrollLeft - TRACK_HEADER_WIDTH) / input.pixelsPerSecond;
      const end =
        start + Math.max(0, element.clientWidth - TRACK_HEADER_WIDTH) / input.pixelsPerSecond;
      setVisibleRange({ start, end });
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [input.pixelsPerSecond, input.timelineRef]);

  const requests = useMemo(
    () => buildClipRepresentationRequests(input.view, visibleRange, input.pixelsPerSecond),
    [input.pixelsPerSecond, input.view, visibleRange.end, visibleRange.start],
  );

  useEffect(() => {
    if (!input.view || requests.length === 0) return;
    const missing = requests.filter((request) => !received.has(representationKey(request)));
    if (missing.length === 0) return;
    const timer = window.setTimeout(() => controller.requestRepresentations(missing), 80);
    return () => window.clearTimeout(timer);
  }, [controller, input.view, received, requests]);

  return useMemo(() => {
    const states = new Map<string, ClipRepresentationState>();
    const view = input.view;
    if (!view) return states;
    const thumbnailTiles = new Map<string, ThumbnailTileState[]>();
    for (const request of requests) {
      const result = received.get(representationKey(request));
      if (request.kind === 'thumbnail') {
        const tiles = thumbnailTiles.get(request.clipId) ?? [];
        const tile =
          result?.kind === 'thumbnail'
            ? result
            : ({ ...request, status: 'loading' } satisfies ThumbnailTileState);
        tiles.push(tile);
        thumbnailTiles.set(request.clipId, tiles);
        continue;
      }
      states.set(
        request.clipId,
        result?.kind === 'waveform' ? result : { ...request, status: 'loading' },
      );
    }
    for (const [clipId, tiles] of thumbnailTiles) {
      const firstTile = tiles[0];
      if (!firstTile) {
        throw new Error(`Thumbnail tile group ${clipId} is empty.`);
      }
      const readyCount = tiles.filter((tile) => tile.status === 'ready').length;
      const unavailableCount = tiles.filter((tile) => tile.status === 'unavailable').length;
      states.set(clipId, {
        kind: 'thumbnail',
        status:
          readyCount === tiles.length
            ? 'ready'
            : readyCount > 0
              ? 'partial'
              : unavailableCount === tiles.length
                ? 'unavailable'
                : 'loading',
        density: firstTile.density,
        tiles,
      });
    }
    return states;
  }, [input.view, received, requests]);
}
