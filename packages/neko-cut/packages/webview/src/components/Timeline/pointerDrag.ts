import type {
  OtioTrackKind,
  TimelineItemView,
  TimelineTrackView,
  TimelineView,
} from '@neko-cut/domain';
import {
  findTimelineInsertionIndex,
  snapTimelineTime,
  timelineTimeFromClientX,
} from './timelineMath';

export interface TimelinePointerDragSource {
  readonly clipId: string;
  readonly trackId: string;
  readonly trackKind: OtioTrackKind;
  readonly itemIndex: number;
}

export interface TimelinePointerDragPreview {
  readonly source: TimelinePointerDragSource;
  readonly targetTrackId: string;
  readonly compatible: boolean;
  readonly toIndex: number;
  readonly pointerTimeSeconds: number;
  readonly insertionTimeSeconds: number;
}

export function buildTimelinePointerDragPreview(input: {
  readonly source: TimelinePointerDragSource;
  readonly targetTrack: TimelineTrackView;
  readonly clientX: number;
  readonly contentLeft: number;
  readonly grabOffsetSeconds?: number;
  readonly pixelsPerSecond: number;
  readonly duration: number;
  readonly frameSeconds: number;
  readonly snapTargets: readonly number[];
}): TimelinePointerDragPreview {
  const pointerTimeSeconds = snapTimelineTime(
    Math.max(
      0,
      timelineTimeFromClientX(
        input.clientX,
        input.contentLeft,
        input.pixelsPerSecond,
        input.duration,
      ) - (input.grabOffsetSeconds ?? 0),
    ),
    input.snapTargets,
    input.frameSeconds,
    input.pixelsPerSecond,
  );
  const toIndex = findTimelineInsertionIndex(input.targetTrack.items, pointerTimeSeconds);
  return {
    source: input.source,
    targetTrackId: input.targetTrack.trackId,
    compatible: input.source.trackKind === input.targetTrack.kind,
    toIndex,
    pointerTimeSeconds,
    insertionTimeSeconds: readInsertionTime(input.targetTrack.items, toIndex),
  };
}

export function isNoopTimelineMove(preview: TimelinePointerDragPreview): boolean {
  return (
    preview.source.trackId === preview.targetTrackId &&
    (preview.toIndex === preview.source.itemIndex ||
      preview.toIndex === preview.source.itemIndex + 1)
  );
}

export function isNoopTimelinePlacement(
  preview: TimelinePointerDragPreview,
  view: TimelineView | undefined,
): boolean {
  if (preview.source.trackId !== preview.targetTrackId) return false;
  const source = view?.tracks
    .find((track) => track.trackId === preview.source.trackId)
    ?.items.find((item) => item.kind === 'clip' && item.clipId === preview.source.clipId);
  return Boolean(
    source &&
    source.kind === 'clip' &&
    Math.abs(source.startSeconds - preview.pointerTimeSeconds) < 1e-9,
  );
}

export function readTimelineEdgeScrollDelta(input: {
  readonly clientX: number;
  readonly viewportLeft: number;
  readonly viewportRight: number;
  readonly threshold?: number;
  readonly maximumStep?: number;
}): number {
  const threshold = input.threshold ?? 48;
  const maximumStep = input.maximumStep ?? 18;
  if (threshold <= 0 || maximumStep <= 0) return 0;
  const leftDistance = input.clientX - input.viewportLeft;
  if (leftDistance < threshold) {
    return -maximumStep * Math.max(0, Math.min(1, (threshold - leftDistance) / threshold));
  }
  const rightDistance = input.viewportRight - input.clientX;
  if (rightDistance < threshold) {
    return maximumStep * Math.max(0, Math.min(1, (threshold - rightDistance) / threshold));
  }
  return 0;
}

function readInsertionTime(items: readonly TimelineItemView[], toIndex: number): number {
  const target = items[toIndex];
  if (target) return target.startSeconds;
  const last = items[items.length - 1];
  return last ? last.startSeconds + last.durationSeconds : 0;
}
