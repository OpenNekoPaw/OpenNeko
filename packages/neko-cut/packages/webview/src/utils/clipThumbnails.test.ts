import { describe, expect, it } from 'vitest';
import type { TimelineElement } from '../types';
import {
  buildClipThumbnailRequests,
  getClipSourceTimeAtDisplayTime,
  getClipThumbnailTimelineRange,
} from './clipThumbnails';

function createElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip',
    src: 'clip.mp4',
    duration: 10,
    startTime: 20,
    trimStart: 2,
    trimEnd: 3,
    transform: {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  } as TimelineElement;
}

describe('clipThumbnails', () => {
  it('maps timeline display positions to trimmed source times', () => {
    const element = createElement();

    expect(getClipSourceTimeAtDisplayTime(element, 0)).toBe(2);
    expect(getClipSourceTimeAtDisplayTime(element, 2.5)).toBe(4.5);
    expect(getClipSourceTimeAtDisplayTime(element, 5)).toBe(6.999);
  });

  it('maps speed-adjusted clips to source media time', () => {
    const element = createElement({
      duration: 7,
      trimStart: 1,
      trimEnd: 1,
      speed: {
        speed: 2,
        reverse: false,
        preservePitch: true,
      },
    });

    expect(getClipSourceTimeAtDisplayTime(element, 0)).toBe(1);
    expect(getClipSourceTimeAtDisplayTime(element, 2.5)).toBe(6);
    expect(getClipSourceTimeAtDisplayTime(element, 5)).toBe(10.999);
  });

  it('does not apply speed twice when duration already stores timeline length', () => {
    const element = createElement({
      duration: 5,
      trimStart: 0,
      trimEnd: 0,
      speed: {
        speed: 2,
        reverse: false,
        preservePitch: true,
      },
    });

    expect(getClipSourceTimeAtDisplayTime(element, 0)).toBe(0);
    expect(getClipSourceTimeAtDisplayTime(element, 2.5)).toBe(5);
    expect(getClipSourceTimeAtDisplayTime(element, 5)).toBe(9.999);
  });

  it('maps reverse clips from source end to source start', () => {
    const element = createElement({
      speed: {
        speed: 1,
        reverse: true,
        preservePitch: true,
      },
    });

    expect(getClipSourceTimeAtDisplayTime(element, 0)).toBe(6.999);
    expect(getClipSourceTimeAtDisplayTime(element, 2.5)).toBe(4.5);
    expect(getClipSourceTimeAtDisplayTime(element, 5)).toBe(2);
  });

  it('builds viewport-buffered requests in display time while preserving source time', () => {
    const element = createElement();
    const range = getClipThumbnailTimelineRange(
      { startTime: 21.1, endTime: 22.2 },
      element.startTime,
      5,
      1,
    );

    expect(range).toEqual({ startTime: 0, endTime: 3 });
    expect(buildClipThumbnailRequests(element, range, 1)).toEqual([
      { key: '0:2', displayTime: 0, sourceTime: 2, displayDuration: 1 },
      { key: '1:3', displayTime: 1, sourceTime: 3, displayDuration: 1 },
      { key: '2:4', displayTime: 2, sourceTime: 4, displayDuration: 1 },
    ]);
  });
});
