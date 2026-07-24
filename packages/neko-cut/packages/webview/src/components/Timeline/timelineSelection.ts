import type { TimelineView } from '@neko-cut/domain';
import type { CutPresentationClipSelection } from '../../stores/cut-presentation-store';

export interface TimelineSelectionBox {
  readonly leftSeconds: number;
  readonly rightSeconds: number;
  readonly topTrackIndex: number;
  readonly bottomTrackIndex: number;
}

export interface TimelineClipLayout {
  readonly clipId: string;
  readonly trackId: string;
  readonly startSeconds: number;
}

export function collectClipSelectionsInBox(
  view: TimelineView,
  box: TimelineSelectionBox,
): readonly CutPresentationClipSelection[] {
  const left = Math.min(box.leftSeconds, box.rightSeconds);
  const right = Math.max(box.leftSeconds, box.rightSeconds);
  const top = Math.max(0, Math.min(box.topTrackIndex, box.bottomTrackIndex));
  const bottom = Math.min(
    view.tracks.length - 1,
    Math.max(box.topTrackIndex, box.bottomTrackIndex),
  );
  return view.tracks.slice(top, bottom + 1).flatMap((track) =>
    track.items.flatMap((item) => {
      if (
        item.kind !== 'clip' ||
        item.startSeconds >= right ||
        item.startSeconds + item.durationSeconds <= left
      ) {
        return [];
      }
      return [{ kind: 'clip' as const, trackId: track.trackId, clipId: item.clipId }];
    }),
  );
}

export function collectIndependentClipIds(
  view: TimelineView | undefined,
  clipIds: readonly string[],
): readonly string[] {
  if (!view) return [];
  const clips = indexClips(view);
  const selected = new Set(clipIds);
  const consumed = new Set<string>();
  return clipIds.filter((clipId) => {
    if (consumed.has(clipId) || !clips.has(clipId)) return false;
    consumed.add(clipId);
    const clip = clips.get(clipId)!;
    const linkedId = clip.linkedAudioClipId ?? clip.linkedVideoClipId;
    if (linkedId && selected.has(linkedId)) consumed.add(linkedId);
    return true;
  });
}

export function collectLinkedClipIds(
  view: TimelineView | undefined,
  clipIds: readonly string[],
): readonly string[] {
  if (!view) return [];
  const clips = indexClips(view);
  const expanded = new Set<string>();
  for (const clipId of clipIds) {
    const clip = clips.get(clipId);
    if (!clip) continue;
    expanded.add(clipId);
    const linkedId = clip.linkedAudioClipId ?? clip.linkedVideoClipId;
    if (linkedId && clips.has(linkedId)) expanded.add(linkedId);
  }
  return [...expanded];
}

export function collectSelectedClipLayouts(
  view: TimelineView | undefined,
  clipIds: readonly string[],
): readonly TimelineClipLayout[] {
  if (!view) return [];
  const selected = new Set(clipIds);
  return view.tracks.flatMap((track) =>
    track.items.flatMap((item) =>
      item.kind === 'clip' && selected.has(item.clipId)
        ? [{ clipId: item.clipId, trackId: track.trackId, startSeconds: item.startSeconds }]
        : [],
    ),
  );
}

export function orderClipLayoutsForMove(
  layouts: readonly TimelineClipLayout[],
  deltaSeconds: number,
): readonly TimelineClipLayout[] {
  return [...layouts].sort((left, right) =>
    deltaSeconds > 0
      ? right.startSeconds - left.startSeconds
      : left.startSeconds - right.startSeconds,
  );
}

function indexClips(view: TimelineView) {
  return new Map(
    view.tracks.flatMap((track) =>
      track.items.flatMap((item) => (item.kind === 'clip' ? [[item.clipId, item] as const] : [])),
    ),
  );
}
