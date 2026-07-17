import { describe, expect, it, vi } from 'vitest';
import type { TimelineElement } from '../../../types';
import { buildTrimToPlayheadUpdates, collectTimelineRippleOps } from '../timelineTrimActions';

vi.mock('../../../utils/vscodeApi', () => ({
  postMessage: vi.fn(),
  getVSCodeAPI: vi.fn(),
  isVSCodeContext: vi.fn().mockReturnValue(false),
  getState: vi.fn(),
  setState: vi.fn(),
  sendRequest: vi.fn(),
  cancelRequest: vi.fn(),
  getPendingRequestCount: vi.fn().mockReturnValue(0),
  vscodeApi: null,
  sendMessage: vi.fn(),
}));

function createElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip',
    src: 'clip.mp4',
    duration: 10,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    ...overrides,
  } as TimelineElement;
}

describe('timelineTrimActions', () => {
  it('builds trim-end updates when playhead is inside the element', () => {
    const element = createElement();

    expect(buildTrimToPlayheadUpdates(element, 6)).toEqual({
      trimEnd: 4,
    });
  });

  it('returns null when playhead is outside the element range', () => {
    const element = createElement();

    expect(buildTrimToPlayheadUpdates(element, 10)).toBeNull();
  });

  it('collects ripple shifts for later elements after trim-shortening', () => {
    const ops = collectTimelineRippleOps(
      'track-1',
      [
        createElement({ id: 'element-1', startTime: 0, duration: 10 }),
        createElement({ id: 'element-2', startTime: 10, duration: 5 }),
        createElement({ id: 'element-3', startTime: 18, duration: 4 }),
      ],
      'element-1',
      10,
      -4,
    );

    expect(ops).toHaveLength(2);
    expect(ops[0]!.payload).toMatchObject({
      trackId: 'track-1',
      elementId: 'element-2',
      updates: {
        startTime: 6,
      },
    });
    expect(ops[1]!.payload).toMatchObject({
      trackId: 'track-1',
      elementId: 'element-3',
      updates: {
        startTime: 14,
      },
    });
  });
});
