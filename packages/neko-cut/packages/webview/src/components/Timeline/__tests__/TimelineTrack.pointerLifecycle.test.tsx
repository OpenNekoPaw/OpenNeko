// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineTrack } from '../TimelineTrack';
import type { ProjectData, TimelineElement, TimelineTrack as TrackType } from '../../../types';

type StoreState = {
  project: ProjectData | null;
  selectedElements: Array<{ trackId: string; elementId: string }>;
  currentTime: number;
  rippleEditingEnabled: boolean;
  showClipThumbnails: boolean;
  snappingEnabled: boolean;
  selectElement: (trackId: string, elementId: string, multi?: boolean) => void;
  updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => void;
  dispatch: (operation: unknown) => void;
  dispatchBatch: (operations: unknown[]) => void;
  pushOperation: (operation: unknown) => void;
  setSnapIndicatorTime: (time: number | null) => void;
  setDragTargetTrackId: (trackId: string | null) => void;
  moveElement: (fromTrackId: string, toTrackId: string, elementId: string) => void;
  removeElement: (trackId: string, elementId: string) => void;
  splitAtPlayhead: (trackId: string, elementId: string) => void;
  splitAndKeepLeft: (trackId: string, elementId: string) => void;
  splitAndKeepRight: (trackId: string, elementId: string) => void;
  toggleElementHidden: (trackId: string, elementId: string) => void;
  toggleElementMuted: (trackId: string, elementId: string) => void;
  copySelected: () => void;
  pasteAtTime: (time: number) => void;
  separateVideoAudio: (trackId: string, elementId: string) => Promise<{ success: boolean }>;
  unseparateVideoAudio: (trackId: string, elementId: string) => void;
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const storeMock = vi.hoisted(() => {
  let state: StoreState;
  const subscribers = new Set<() => void>();
  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };

  return {
    getState: () => state,
    replaceState: (next: StoreState) => {
      state = next;
      notify();
    },
    setState: (partial: Partial<StoreState>) => {
      state = { ...state, ...partial };
      notify();
    },
    subscribe: (subscriber: () => void) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
});

vi.mock('../../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../stores/editor-store', async () => {
  const ReactModule = await import('react');

  function useEditorStore<T>(selector?: (state: StoreState) => T): T | StoreState {
    const [, forceRender] = ReactModule.useReducer((count: number) => count + 1, 0);
    ReactModule.useEffect(() => {
      const unsubscribe = storeMock.subscribe(forceRender);
      return () => {
        unsubscribe();
      };
    }, []);
    const state = storeMock.getState();
    return selector ? selector(state) : state;
  }

  useEditorStore.getState = storeMock.getState;
  useEditorStore.setState = storeMock.setState;

  return { useEditorStore };
});

vi.mock('../TimelineElementContent', () => ({
  TimelineElementContent: () => <div data-testid="timeline-element-content" />,
}));

vi.mock('../../KeyframeIndicator', () => ({
  KeyframeIndicator: () => <div data-testid="keyframe-indicator" />,
}));

const setPointerCaptureSpy = vi.fn();
const releasePointerCaptureSpy = vi.fn();
const hasPointerCaptureSpy = vi.fn(() => true);
const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;

describe('TimelineTrack pointer lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setPointerCaptureSpy.mockClear();
    releasePointerCaptureSpy.mockClear();
    hasPointerCaptureSpy.mockClear();

    HTMLElement.prototype.setPointerCapture = setPointerCaptureSpy;
    HTMLElement.prototype.releasePointerCapture = releasePointerCaptureSpy;
    HTMLElement.prototype.hasPointerCapture = hasPointerCaptureSpy;

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    storeMock.replaceState(createStoreState());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
    HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
    HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
    vi.restoreAllMocks();
  });

  it('releases dragging on window pointerup and ignores later pointer movement', () => {
    renderTrack();
    const element = getTimelineElement();

    act(() => {
      element.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, pointerId: 9 }));
    });
    expect(element.className).toContain('cursor-grabbing');

    act(() => {
      window.dispatchEvent(createPointerEvent('pointermove', { clientX: 160, pointerId: 9 }));
    });
    expect(currentElement().startTime).toBe(3);

    act(() => {
      window.dispatchEvent(createPointerEvent('pointerup', { clientX: 160, pointerId: 9 }));
    });
    expect(host.querySelector<HTMLElement>('.timeline-element')?.className).not.toContain(
      'cursor-grabbing',
    );
    expect(releasePointerCaptureSpy).toHaveBeenCalledWith(9);
    expect(storeMock.getState().pushOperation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(createPointerEvent('pointermove', { clientX: 240, pointerId: 9 }));
    });
    expect(currentElement().startTime).toBe(3);
  });

  it('commits dragging on webview blur so the clip does not stick or lose saved data', () => {
    renderTrack();
    const element = getTimelineElement();

    act(() => {
      element.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100, pointerId: 12 }));
    });
    act(() => {
      window.dispatchEvent(createPointerEvent('pointermove', { clientX: 140, pointerId: 12 }));
    });
    expect(currentElement().startTime).toBe(2);

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(host.querySelector<HTMLElement>('.timeline-element')?.className).not.toContain(
      'cursor-grabbing',
    );
    expect(storeMock.getState().pushOperation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(createPointerEvent('pointermove', { clientX: 220, pointerId: 12 }));
    });
    expect(currentElement().startTime).toBe(2);
  });

  function renderTrack() {
    act(() => {
      root.render(
        <TimelineTrack
          track={createTrack([currentElement()])}
          index={0}
          zoomLevel={1}
          pixelsPerSecond={20}
          trackHeight={48}
          selectedElements={storeMock.getState().selectedElements}
          sortedTracks={[createTrack([currentElement()])]}
        />,
      );
    });
  }

  function getTimelineElement(): HTMLElement {
    const element = host.querySelector<HTMLElement>('.timeline-element');
    expect(element).not.toBeNull();
    return element!;
  }
});

function createStoreState(): StoreState {
  const element = createElement();
  const track = createTrack([element]);

  return {
    project: createProject([track]),
    selectedElements: [{ trackId: track.id, elementId: element.id }],
    currentTime: 0,
    rippleEditingEnabled: false,
    showClipThumbnails: false,
    snappingEnabled: false,
    selectElement: vi.fn(),
    updateElement: vi.fn((trackId, elementId, updates) => {
      const project = storeMock.getState().project;
      if (!project) return;

      storeMock.setState({
        project: {
          ...project,
          tracks: project.tracks.map((candidateTrack) =>
            candidateTrack.id === trackId
              ? {
                  ...candidateTrack,
                  elements: candidateTrack.elements.map((candidateElement) =>
                    candidateElement.id === elementId
                      ? ({ ...candidateElement, ...updates } as TimelineElement)
                      : candidateElement,
                  ),
                }
              : candidateTrack,
          ),
        },
      });
    }),
    dispatch: vi.fn(),
    dispatchBatch: vi.fn(),
    pushOperation: vi.fn(),
    setSnapIndicatorTime: vi.fn(),
    setDragTargetTrackId: vi.fn(),
    moveElement: vi.fn(),
    removeElement: vi.fn(),
    splitAtPlayhead: vi.fn(),
    splitAndKeepLeft: vi.fn(),
    splitAndKeepRight: vi.fn(),
    toggleElementHidden: vi.fn(),
    toggleElementMuted: vi.fn(),
    copySelected: vi.fn(),
    pasteAtTime: vi.fn(),
    separateVideoAudio: vi.fn(() => Promise.resolve({ success: true })),
    unseparateVideoAudio: vi.fn(),
  };
}

function createProject(tracks: TrackType[]): ProjectData {
  return {
    version: '2.0',
    name: 'Pointer lifecycle test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks,
  };
}

function createTrack(elements: TimelineElement[]): TrackType {
  return {
    id: 'track-1',
    name: 'Video',
    type: 'media',
    elements,
    muted: false,
    locked: false,
    hidden: false,
    isMain: true,
  };
}

function createElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip',
    src: 'clip.mp4',
    duration: 8,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  } as TimelineElement;
}

function currentElement(): TimelineElement {
  return storeMock.getState().project!.tracks[0]!.elements[0]!;
}

function createPointerEvent(
  type: string,
  init: Pick<PointerEventInit, 'clientX' | 'clientY' | 'pointerId'>,
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY: 16,
    ...init,
  });
}
