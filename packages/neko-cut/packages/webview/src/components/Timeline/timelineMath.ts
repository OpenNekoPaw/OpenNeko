import type { TimelineClipView, TimelineItemView } from '@neko-cut/domain';

export const TRACK_HEADER_WIDTH = 112;
export const MIN_PIXELS_PER_SECOND = 12;
export const MAX_PIXELS_PER_SECOND = 400;

const RULER_STEPS_SECONDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600] as const;

export interface RulerTick {
  readonly seconds: number;
  readonly major: boolean;
  readonly label?: string;
}

export function clampTimelineTime(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.max(0, duration), value));
}

export function timelineTimeFromClientX(
  clientX: number,
  contentLeft: number,
  pixelsPerSecond: number,
  duration: number,
): number {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) return 0;
  return clampTimelineTime((clientX - contentLeft) / pixelsPerSecond, duration);
}

export function quantizeTimelineTime(value: number, frameSeconds: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(frameSeconds) || frameSeconds <= 0) return 0;
  return Math.max(0, Math.round(value / frameSeconds) * frameSeconds);
}

export function quantizeTimelineDelta(value: number, frameSeconds: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(frameSeconds) || frameSeconds <= 0) return 0;
  return Math.round(value / frameSeconds) * frameSeconds;
}

export function retainTimelineCanvasDuration(
  previousDuration: number | undefined,
  projectedDuration: number,
  minimumDuration = 10,
): number {
  return Math.max(minimumDuration, previousDuration ?? 0, projectedDuration);
}

export function snapTimelineTime(
  value: number,
  targets: readonly number[],
  frameSeconds: number,
  pixelsPerSecond: number,
  thresholdPixels = 8,
): number {
  const quantized = quantizeTimelineTime(value, frameSeconds);
  if (pixelsPerSecond <= 0 || thresholdPixels < 0) return quantized;
  const thresholdSeconds = thresholdPixels / pixelsPerSecond;
  let nearest = quantized;
  let nearestDistance = thresholdSeconds + Number.EPSILON;
  for (const target of targets) {
    const quantizedTarget = quantizeTimelineTime(target, frameSeconds);
    const distance = Math.abs(quantizedTarget - quantized);
    if (distance < nearestDistance) {
      nearest = quantizedTarget;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function buildRulerTicks(duration: number, pixelsPerSecond: number): readonly RulerTick[] {
  if (duration <= 0 || pixelsPerSecond <= 0) return [{ seconds: 0, major: true, label: '00:00' }];
  const minorStep =
    RULER_STEPS_SECONDS.find((candidate) => candidate * pixelsPerSecond >= 12) ??
    RULER_STEPS_SECONDS[RULER_STEPS_SECONDS.length - 1];
  const majorEvery = Math.max(1, Math.ceil(72 / (minorStep * pixelsPerSecond)));
  const count = Math.ceil(duration / minorStep);
  const ticks: RulerTick[] = [];
  for (let index = 0; index <= count; index += 1) {
    const seconds = Math.min(duration, index * minorStep);
    const major = index % majorEvery === 0;
    ticks.push({
      seconds,
      major,
      ...(major ? { label: formatRulerTime(seconds) } : {}),
    });
  }
  return ticks;
}

export function findTimelineInsertionIndex(
  items: readonly TimelineItemView[],
  targetSeconds: number,
): number {
  const index = items.findIndex(
    (item) => targetSeconds < item.startSeconds + item.durationSeconds / 2,
  );
  return index === -1 ? items.length : index;
}

export function readClipTrimCapacity(clip: TimelineClipView): {
  readonly startExtensionSeconds: number;
  readonly endExtensionSeconds: number;
} {
  if (
    clip.sourceAvailableStartSeconds === undefined ||
    clip.sourceAvailableDurationSeconds === undefined
  ) {
    return { startExtensionSeconds: 0, endExtensionSeconds: 0 };
  }
  const availableStart = clip.sourceAvailableStartSeconds;
  const availableEnd = availableStart + clip.sourceAvailableDurationSeconds;
  const currentSourceEnd = clip.sourceStartSeconds + clip.durationSeconds * clip.playbackRate;
  return {
    startExtensionSeconds: Math.max(
      0,
      (clip.sourceStartSeconds - availableStart) / clip.playbackRate,
    ),
    endExtensionSeconds: Math.max(0, (availableEnd - currentSourceEnd) / clip.playbackRate),
  };
}

function formatRulerTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
}
