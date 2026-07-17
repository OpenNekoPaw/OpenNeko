import type { EditOperation } from '@neko/shared';
import type { TimelineElement } from '../../types';
import { createMeta } from '../../stores/utils/operation-helpers';

export function buildTrimToPlayheadUpdates(
  element: TimelineElement,
  currentTime: number,
): Partial<TimelineElement> | null {
  const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
  const elementEnd = element.startTime + effectiveDuration;

  if (currentTime <= element.startTime || currentTime >= elementEnd) {
    return null;
  }

  return {
    trimEnd: element.trimEnd + (elementEnd - currentTime),
  };
}

export function collectTimelineRippleOps(
  trackId: string,
  elements: TimelineElement[],
  elementId: string,
  originalEnd: number,
  delta: number,
): EditOperation[] {
  if (delta === 0) return [];

  return elements
    .filter((candidate) => candidate.id !== elementId && candidate.startTime >= originalEnd)
    .map((candidate) => ({
      type: 'element.update' as const,
      meta: createMeta('system', 'Ripple edit'),
      payload: {
        trackId,
        elementId: candidate.id,
        updates: {
          startTime: Math.max(0, candidate.startTime + delta),
        },
      },
      before: {
        updates: {
          startTime: candidate.startTime,
        },
      },
    }));
}
