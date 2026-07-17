// =============================================================================
// ClipboardSlice Tests
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import type { ProjectData } from '../../../types';
import type { EditOperation } from '@neko/shared';
import type { ClipboardSlice } from '../clipboardSlice';

// Mock vscodeApi to prevent @neko/shared/vscode resolution failure in test environment
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

import { createClipboardSlice } from '../clipboardSlice';

// -- Test helpers ----------------------------------------------------------

function createTestProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Test Project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

function createProjectWithElements(): ProjectData {
  return createTestProject({
    tracks: [
      {
        id: 'video-track',
        name: 'Video Track',
        type: 'media',
        elements: [
          {
            id: 'elem-v1',
            type: 'media',
            name: 'Video Clip 1',
            src: '/video1.mp4',
            startTime: 0,
            duration: 10,
            trimStart: 1,
            trimEnd: 2,
            transform: {},
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          } as any,
          {
            id: 'elem-v2',
            type: 'media',
            name: 'Video Clip 2',
            src: '/video2.mp4',
            startTime: 10,
            duration: 5,
            trimStart: 0,
            trimEnd: 0,
            transform: {},
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          } as any,
        ],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      } as any,
      {
        id: 'audio-track',
        name: 'Audio Track',
        type: 'audio',
        elements: [
          {
            id: 'elem-a1',
            type: 'audio',
            name: 'Audio Clip',
            src: '/audio.mp3',
            startTime: 0,
            duration: 15,
            trimStart: 0,
            trimEnd: 0,
            transform: {},
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          } as any,
        ],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      } as any,
    ],
  });
}

interface TestStore extends ClipboardSlice {
  project: ProjectData | null;
  selectedElements: Array<{ trackId: string; elementId: string }>;
  rippleEditingEnabled: boolean;
  dispatch: (op: EditOperation) => void;
  dispatchBatch: (ops: EditOperation[]) => void;
}

function createTestStore(
  project: ProjectData | null = null,
  selectedElements: Array<{ trackId: string; elementId: string }> = [],
) {
  const dispatchMock = vi.fn();
  const dispatchBatchMock = vi.fn();
  const store = create<TestStore>()((set, get, storeApi) => ({
    project,
    selectedElements,
    rippleEditingEnabled: false,
    dispatch: dispatchMock,
    dispatchBatch: dispatchBatchMock,
    ...createClipboardSlice(set as any, get as any, storeApi as any),
  }));
  return { store, dispatchMock, dispatchBatchMock };
}

// -- Tests -----------------------------------------------------------------

describe('clipboardSlice', () => {
  describe('initial state', () => {
    it('should start with clipboard = null', () => {
      const { store } = createTestStore();
      expect(store.getState().clipboard).toBeNull();
    });
  });

  describe('copySelected', () => {
    it('should copy selected elements to clipboard', () => {
      const { store } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();

      const clipboard = store.getState().clipboard;
      expect(clipboard).not.toBeNull();
      expect(clipboard!.items).toHaveLength(1);
      expect(clipboard!.items[0]!.trackType).toBe('media');
      expect(clipboard!.items[0]!.element.name).toBe('Video Clip 1');
    });

    it('should strip element ID from clipboard items', () => {
      const { store } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();

      const item = store.getState().clipboard!.items[0]!;
      expect('id' in item.element).toBe(false);
    });

    it('should copy multiple selected elements', () => {
      const { store } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
        { trackId: 'audio-track', elementId: 'elem-a1' },
      ]);

      store.getState().copySelected();

      const clipboard = store.getState().clipboard;
      expect(clipboard!.items).toHaveLength(2);
    });

    it('should preserve track type information', () => {
      const { store } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
        { trackId: 'audio-track', elementId: 'elem-a1' },
      ]);

      store.getState().copySelected();

      const items = store.getState().clipboard!.items;
      const trackTypes = items.map((i) => i.trackType);
      expect(trackTypes).toContain('media');
      expect(trackTypes).toContain('audio');
    });

    it('should do nothing when project is null', () => {
      const { store } = createTestStore(null, [{ trackId: 'track', elementId: 'elem' }]);

      store.getState().copySelected();

      expect(store.getState().clipboard).toBeNull();
    });

    it('should do nothing when no elements selected', () => {
      const { store } = createTestStore(createProjectWithElements(), []);

      store.getState().copySelected();

      expect(store.getState().clipboard).toBeNull();
    });

    it('should skip non-existent elements gracefully', () => {
      const { store } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
        { trackId: 'video-track', elementId: 'nonexistent' },
      ]);

      store.getState().copySelected();

      expect(store.getState().clipboard!.items).toHaveLength(1);
    });

    it('should override previous clipboard content', () => {
      const { store } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();
      expect(store.getState().clipboard!.items[0]!.element.name).toBe('Video Clip 1');

      // Update selection and copy again
      store.setState({
        selectedElements: [{ trackId: 'video-track', elementId: 'elem-v2' }],
      });
      store.getState().copySelected();
      expect(store.getState().clipboard!.items[0]!.element.name).toBe('Video Clip 2');
    });
  });

  describe('pasteAtTime', () => {
    it('should dispatch clipboard.paste operation', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();
      store.getState().pasteAtTime(20);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('clipboard.paste');
    });

    it('should assign new IDs to pasted elements', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();
      store.getState().pasteAtTime(20);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const items = (op.payload as any).items;
      expect(items[0].element.id).not.toBe('elem-v1');
    });

    it('should do nothing when clipboard is empty', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithElements());

      store.getState().pasteAtTime(20);

      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should do nothing when project is null', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();
      store.setState({ project: null });
      store.getState().pasteAtTime(20);

      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should paste at specified time offset', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();
      store.getState().pasteAtTime(25);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const items = (op.payload as any).items;
      // The element's startTime should be at or after the paste time
      expect(items[0].element.startTime).toBeGreaterThanOrEqual(25);
    });

    it('should paste multiple elements preserving relative timing', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
        { trackId: 'video-track', elementId: 'elem-v2' },
      ]);

      store.getState().copySelected();
      store.getState().pasteAtTime(30);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const items = (op.payload as any).items;
      expect(items).toHaveLength(2);
      // Second element should be after first (relative offset preserved)
      expect(items[1].element.startTime).toBeGreaterThan(items[0].element.startTime);
    });

    it('should dispatch ripple shifts before paste when ripple editing is enabled', () => {
      const { store, dispatchMock, dispatchBatchMock } = createTestStore(
        createProjectWithElements(),
        [{ trackId: 'video-track', elementId: 'elem-v1' }],
      );

      store.getState().copySelected();
      store.setState({ rippleEditingEnabled: true });
      store.getState().pasteAtTime(10);

      expect(dispatchMock).not.toHaveBeenCalled();
      expect(dispatchBatchMock).toHaveBeenCalledTimes(1);

      const ops = dispatchBatchMock.mock.calls[0]![0] as EditOperation[];
      expect(ops).toHaveLength(2);
      expect(ops[0]!.type).toBe('element.update');
      expect(ops[1]!.type).toBe('clipboard.paste');

      const rippleOp = ops[0]!;
      expect(rippleOp.payload).toMatchObject({
        trackId: 'video-track',
        elementId: 'elem-v2',
        updates: {
          startTime: 17,
        },
      });

      const pasteOp = ops[1]!;
      const items = (pasteOp.payload as { items: Array<{ element: { startTime: number } }> }).items;
      expect(items[0]!.element.startTime).toBe(10);
    });
  });

  describe('clearClipboard', () => {
    it('should clear clipboard contents', () => {
      const { store } = createTestStore(createProjectWithElements(), [
        { trackId: 'video-track', elementId: 'elem-v1' },
      ]);

      store.getState().copySelected();
      expect(store.getState().clipboard).not.toBeNull();

      store.getState().clearClipboard();
      expect(store.getState().clipboard).toBeNull();
    });

    it('should be safe to call when clipboard is already null', () => {
      const { store } = createTestStore();
      store.getState().clearClipboard();
      expect(store.getState().clipboard).toBeNull();
    });
  });
});
