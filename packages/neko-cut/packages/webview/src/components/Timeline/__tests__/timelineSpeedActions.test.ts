import { describe, expect, it } from 'vitest';
import type { TimelineElement } from '../../../types';
import { buildTimelineReverseUpdates, buildTimelineSpeedUpdates } from '../timelineSpeedActions';

function createElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip',
    src: 'clip.mp4',
    duration: 12,
    startTime: 0,
    trimStart: 1,
    trimEnd: 1,
    ...overrides,
  } as TimelineElement;
}

describe('timelineSpeedActions', () => {
  it('recomputes duration from source media length when applying a speed preset', () => {
    const element = createElement();

    expect(buildTimelineSpeedUpdates(element, 2)).toEqual({
      duration: 7,
      speed: {
        speed: 2,
        preservePitch: true,
        reverse: false,
      },
    });
  });

  it('preserves reverse state when resetting playback speed to 1x', () => {
    const element = createElement({
      duration: 7,
      speed: {
        speed: 2,
        preservePitch: false,
        reverse: true,
      },
    });

    expect(buildTimelineSpeedUpdates(element, 1)).toEqual({
      duration: 12,
      speed: {
        speed: 1,
        preservePitch: false,
        reverse: true,
      },
    });
  });

  it('toggles reverse without changing duration', () => {
    const element = createElement({
      speed: {
        speed: 0.5,
        preservePitch: true,
        reverse: false,
      },
    });

    expect(buildTimelineReverseUpdates(element)).toEqual({
      speed: {
        speed: 0.5,
        preservePitch: true,
        reverse: true,
      },
    });
  });
});
