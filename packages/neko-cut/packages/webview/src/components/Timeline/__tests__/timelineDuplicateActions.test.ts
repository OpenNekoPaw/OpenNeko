import { describe, expect, it, vi } from 'vitest';
import type { ProjectData, TimelineElement } from '../../../types';
import { getDuplicateInsertTime } from '../timelineDuplicateActions';

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

function createProject(elements: TimelineElement[]): ProjectData {
  return {
    version: '2.0',
    name: 'Project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Track 1',
        type: 'media',
        elements,
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      },
    ],
  };
}

describe('timelineDuplicateActions', () => {
  it('uses the end of the current selection when duplicating multiple elements', () => {
    const project = createProject([
      createElement({ id: 'element-1', startTime: 0, duration: 4 }),
      createElement({ id: 'element-2', startTime: 6, duration: 5, trimEnd: 1 }),
    ]);

    expect(
      getDuplicateInsertTime(
        project,
        [
          { trackId: 'track-1', elementId: 'element-1' },
          { trackId: 'track-1', elementId: 'element-2' },
        ],
        project.tracks[0]!.elements[0]!,
      ),
    ).toBe(10);
  });

  it('falls back to the clicked element when selection lookup fails', () => {
    const fallbackElement = createElement({ startTime: 3, duration: 8, trimEnd: 2 });

    expect(
      getDuplicateInsertTime(
        createProject([createElement()]),
        [{ trackId: 'missing', elementId: 'missing' }],
        fallbackElement,
      ),
    ).toBe(9);
  });
});
