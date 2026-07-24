import type { CutCommand, TimelineView } from '@neko-cut/domain';

export interface CutClipLocator {
  readonly trackId: string;
  readonly clipId: string;
}

type ClipProjection = Extract<TimelineView['tracks'][number]['items'][number], { kind: 'clip' }>;

interface ResolvedClip {
  readonly clip: ClipProjection;
  readonly trackId: string;
}

export function buildPasteClipCommands(
  view: TimelineView,
  locators: readonly unknown[],
  timelineStartSeconds: number,
  createClipId: () => string,
): readonly CutCommand[] {
  if (locators.length === 0) throw new Error('Cut Clip clipboard is empty.');
  const clipsById = indexClips(view);
  const selected = locators.map((locator) => {
    if (!isClipLocator(locator)) {
      throw new Error('Cut Clip clipboard contains an invalid locator.');
    }
    const resolved = clipsById.get(locator.clipId);
    if (!resolved || resolved.trackId !== locator.trackId) {
      throw new Error(`Clipboard Clip ${locator.clipId} is unavailable.`);
    }
    return resolved;
  });
  const expanded = selected.flatMap((resolved) => {
    const linkedId = linkedClipId(resolved.clip);
    const linked = linkedId ? clipsById.get(linkedId) : undefined;
    return linked ? [resolved, linked] : [resolved];
  });
  const earliestStart = Math.min(...expanded.map(({ clip }) => clip.startSeconds));
  const rate = view.profile
    ? view.profile.editRateNumerator / view.profile.editRateDenominator
    : 30;
  const processed = new Set<string>();
  const commands: CutCommand[] = [];
  for (const resolved of selected) {
    if (processed.has(resolved.clip.clipId)) continue;
    const duplicateClipId = createClipId();
    const linkedId = linkedClipId(resolved.clip);
    const linked = linkedId ? clipsById.get(linkedId) : undefined;
    const duplicateLinkedClipId = linked ? createClipId() : undefined;
    commands.push({
      type: 'clone-clip-at-time',
      clipId: resolved.clip.clipId,
      duplicateClipId,
      timelineStartFrames: relativeTimelineStartFrames(
        resolved,
        timelineStartSeconds,
        earliestStart,
        rate,
      ),
      ...(duplicateLinkedClipId ? { duplicateLinkedClipId } : {}),
      ...(linked
        ? {
            linkedTimelineStartFrames: relativeTimelineStartFrames(
              linked,
              timelineStartSeconds,
              earliestStart,
              rate,
            ),
          }
        : {}),
      rate,
    });
    processed.add(resolved.clip.clipId);
    if (linked && duplicateLinkedClipId) {
      processed.add(linked.clip.clipId);
    }
  }
  return commands;
}

export function buildDuplicateClipCommands(
  view: TimelineView,
  clipIds: readonly string[],
  createClipId: () => string,
): readonly CutCommand[] {
  const clips = indexClips(view);
  const processed = new Set<string>();
  return clipIds.flatMap((clipId) => {
    if (processed.has(clipId)) return [];
    const resolved = clips.get(clipId);
    if (!resolved) throw new Error(`Clip ${clipId} is unavailable.`);
    const linkedId = linkedClipId(resolved.clip);
    if (linkedId && !clips.has(linkedId)) {
      throw new Error(`Linked Clip ${linkedId} is unavailable.`);
    }
    processed.add(clipId);
    if (linkedId) processed.add(linkedId);
    return [
      {
        type: 'duplicate-clip' as const,
        clipId,
        duplicateClipId: createClipId(),
        ...(linkedId ? { duplicateLinkedClipId: createClipId() } : {}),
      },
    ];
  });
}

function indexClips(view: TimelineView): ReadonlyMap<string, ResolvedClip> {
  return new Map(
    view.tracks.flatMap((track) =>
      track.items.flatMap((item) =>
        item.kind === 'clip'
          ? [[item.clipId, { clip: item, trackId: track.trackId }] as const]
          : [],
      ),
    ),
  );
}

function relativeTimelineStartFrames(
  resolved: ResolvedClip,
  timelineStartSeconds: number,
  earliestStart: number,
  rate: number,
): number {
  return Math.round((timelineStartSeconds + resolved.clip.startSeconds - earliestStart) * rate);
}

function linkedClipId(clip: ClipProjection): string | undefined {
  return clip.linkedAudioClipId ?? clip.linkedVideoClipId;
}

function isClipLocator(value: unknown): value is CutClipLocator {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'trackId') === 'string' &&
    typeof Reflect.get(value, 'clipId') === 'string'
  );
}
