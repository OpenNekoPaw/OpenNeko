import { useEffect, useMemo, useState, type RefObject } from 'react';
import type {
  CutClipRepresentationRequest,
  CutClipRepresentationResult,
  TimelineView,
} from '@neko-cut/domain';
import { TRACK_HEADER_WIDTH } from '../components/Timeline/timelineMath';
import { useCutOtioController } from '../controllers/CutOtioControllerContext';
import { representationKey, useCutPresentationStore } from '../stores/cut-presentation-store';

export type ClipRepresentationState = CutClipRepresentationResult | { readonly status: 'loading' };

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
    () => buildRequests(input.view, visibleRange, input.pixelsPerSecond),
    [input.pixelsPerSecond, input.view, visibleRange.end, visibleRange.start],
  );

  useEffect(() => {
    if (!input.view || requests.length === 0) return;
    const missing = requests.filter(
      (request) =>
        !received.has(representationKey(input.view!.revision, request.clipId, request.kind)),
    );
    if (missing.length === 0) return;
    const timer = window.setTimeout(() => controller.requestRepresentations(missing), 80);
    return () => window.clearTimeout(timer);
  }, [controller, input.view, received, requests]);

  return useMemo(() => {
    const states = new Map<string, ClipRepresentationState>();
    const view = input.view;
    if (!view) return states;
    for (const request of requests) {
      states.set(
        request.clipId,
        received.get(representationKey(view.revision, request.clipId, request.kind)) ?? {
          status: 'loading',
        },
      );
    }
    return states;
  }, [input.view, received, requests]);
}

function buildRequests(
  view: TimelineView | undefined,
  visibleRange: { readonly start: number; readonly end: number },
  pixelsPerSecond: number,
): readonly CutClipRepresentationRequest[] {
  if (!view) return [];
  const result: CutClipRepresentationRequest[] = [];
  for (const track of view.tracks) {
    if (track.kind === 'Subtitle') continue;
    for (const item of track.items) {
      if (
        item.kind !== 'clip' ||
        item.startSeconds + item.durationSeconds < visibleRange.start ||
        item.startSeconds > visibleRange.end
      )
        continue;
      if (track.kind === 'Video') {
        result.push({
          clipId: item.clipId,
          kind: 'thumbnail',
          sampleCount: Math.max(
            1,
            Math.min(8, Math.ceil((item.durationSeconds * pixelsPerSecond) / 96)),
          ),
        });
      } else {
        result.push({
          clipId: item.clipId,
          kind: 'waveform',
          peaksPerSecond: Math.max(1, Math.min(100, Math.round(pixelsPerSecond / 3))),
        });
      }
      if (result.length === 24) return result;
    }
  }
  return result;
}
