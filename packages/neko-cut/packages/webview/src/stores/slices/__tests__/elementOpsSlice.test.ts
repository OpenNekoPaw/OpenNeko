// =============================================================================
// ElementOpsSlice Tests
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import type { ProjectData, TrackType } from '../../../types';
import type { EditOperation } from '@neko/shared';
import type { ElementOpsSlice } from '../elementOpsSlice';

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

// Mock mediaProxyFactory to avoid Extension Host dependency
vi.mock('../../../services/mediaProxyFactory', () => ({
  getMediaProxy: vi.fn(() => ({
    probeMediaInfo: vi.fn().mockResolvedValue({ hasAudio: false }),
    extractSubtitles: vi.fn().mockResolvedValue([]),
  })),
}));

import { createElementOpsSlice } from '../elementOpsSlice';

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

function createProjectWithMediaTrack(): ProjectData {
  return createTestProject({
    tracks: [
      {
        id: 'media-track',
        name: 'Media Track',
        type: 'media',
        elements: [
          {
            id: 'elem-1',
            type: 'media',
            name: 'Clip 1',
            src: '/video.mp4',
            startTime: 0,
            duration: 10,
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
          {
            id: 'elem-2',
            type: 'media',
            name: 'Clip 2',
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
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      } as any,
    ],
  });
}

interface TestStore extends ElementOpsSlice {
  project: ProjectData | null;
  dispatch: (op: EditOperation) => void;
  dispatchBatch: (ops: EditOperation[]) => void;
  rippleEditingEnabled: boolean;
  addTrack: (type: TrackType, name?: string) => string;
}

function createTestStore(project: ProjectData | null = null) {
  const dispatchMock = vi.fn();
  const dispatchBatchMock = vi.fn();
  const addTrackMock = vi.fn().mockReturnValue('new-track-id');
  const store = create<TestStore>()((set, get, storeApi) => ({
    project,
    dispatch: dispatchMock,
    dispatchBatch: dispatchBatchMock,
    rippleEditingEnabled: false,
    addTrack: addTrackMock,
    ...createElementOpsSlice(set as any, get as any, storeApi as any),
  }));
  return { store, dispatchMock, dispatchBatchMock, addTrackMock };
}

// -- Tests -----------------------------------------------------------------

describe('elementOpsSlice', () => {
  describe('addElement', () => {
    it('should dispatch element.add operation', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      const elementData = {
        type: 'media' as const,
        name: 'New Clip',
        src: '/new.mp4',
        startTime: 15,
        duration: 5,
        trimStart: 0,
        trimEnd: 0,
        transform: {},
        opacity: 1,
        blendMode: 'normal' as const,
        effects: [],
        muted: false,
        hidden: false,
        locked: false,
      };

      store.getState().addElement('media-track', elementData as any);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('element.add');
      expect((op.payload as any).trackId).toBe('media-track');
      expect((op.payload as any).element.name).toBe('New Clip');
    });

    it('should return generated element ID', () => {
      const { store } = createTestStore(createProjectWithMediaTrack());
      const id = store.getState().addElement('media-track', {
        type: 'media',
        name: 'Test',
        src: '/v.mp4',
        startTime: 0,
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
      } as any);

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should return empty string when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      const id = store.getState().addElement('track', {} as any);
      expect(id).toBe('');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should assign a unique ID to the element', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().addElement('media-track', {
        type: 'media',
        name: 'A',
        src: '/a.mp4',
        startTime: 0,
        duration: 1,
        trimStart: 0,
        trimEnd: 0,
        transform: {},
        opacity: 1,
        blendMode: 'normal',
        effects: [],
        muted: false,
        hidden: false,
        locked: false,
      } as any);
      const id1 = (dispatchMock.mock.calls[0]![0] as any).payload.element.id;

      store.getState().addElement('media-track', {
        type: 'media',
        name: 'B',
        src: '/b.mp4',
        startTime: 0,
        duration: 1,
        trimStart: 0,
        trimEnd: 0,
        transform: {},
        opacity: 1,
        blendMode: 'normal',
        effects: [],
        muted: false,
        hidden: false,
        locked: false,
      } as any);
      const id2 = (dispatchMock.mock.calls[1]![0] as any).payload.element.id;

      expect(id1).not.toBe(id2);
    });
  });

  describe('addMediaElement', () => {
    it('should dispatch element.add to specified track', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().addMediaElement('media-track', '/new.mp4', 'New Video', 10);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('element.add');
      expect((op.payload as any).trackId).toBe('media-track');
    });

    it('should find existing media track when trackId is null', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().addMediaElement(null, '/new.mp4', 'New Video', 10);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).trackId).toBe('media-track');
    });

    it('should create new track when no media track exists and trackId is null', () => {
      const projectNoMedia = createTestProject({
        tracks: [
          {
            id: 'text-track',
            name: 'Text Track',
            type: 'text',
            elements: [],
            muted: false,
            locked: false,
            hidden: false,
            isMain: false,
          } as any,
        ],
      });
      const { store, dispatchBatchMock } = createTestStore(projectNoMedia);
      store.getState().addMediaElement(null, '/new.mp4', 'New Video', 10);

      // Should dispatch batch (track.add + element.add)
      expect(dispatchBatchMock).toHaveBeenCalledTimes(1);
      const ops = dispatchBatchMock.mock.calls[0]![0] as EditOperation[];
      expect(ops).toHaveLength(2);
      expect(ops[0]!.type).toBe('track.add');
      expect(ops[1]!.type).toBe('element.add');
    });

    it('should create element with correct media properties', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().addMediaElement('media-track', '/video.mp4', 'My Video', 15, 5);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const element = (op.payload as any).element;
      expect(element.type).toBe('media');
      expect(element.src).toBe('/video.mp4');
      expect(element.name).toBe('My Video');
      expect(element.duration).toBe(15);
      expect(element.startTime).toBe(5);
      expect(element.trimStart).toBe(0);
      expect(element.trimEnd).toBe(0);
      expect(element.opacity).toBe(1);
    });

    it('should default startTime to 0', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().addMediaElement('media-track', '/v.mp4', 'V', 10);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).element.startTime).toBe(0);
    });

    it('should return empty string when project is null', () => {
      const { store } = createTestStore(null);
      const id = store.getState().addMediaElement('track', '/v.mp4', 'V', 10);
      expect(id).toBe('');
    });
  });

  describe('removeElement', () => {
    it('should dispatch element.remove operation', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().removeElement('media-track', 'elem-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('element.remove');
      expect((op.payload as any).trackId).toBe('media-track');
      expect((op.payload as any).elementId).toBe('elem-1');
    });

    it('should include before data with element and index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().removeElement('media-track', 'elem-1');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.element.id).toBe('elem-1');
      expect((op as any).before.index).toBe(0);
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().removeElement('nonexistent', 'elem-1');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when element not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().removeElement('media-track', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().removeElement('track', 'elem');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should include rippleAffected when rippleEditing is enabled', () => {
      const project = createProjectWithMediaTrack();
      const { store, dispatchMock } = createTestStore(project);
      store.setState({ rippleEditingEnabled: true });

      store.getState().removeElement('media-track', 'elem-1');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      // elem-2 starts at 10, elem-1 ends at 10, so elem-2.startTime >= removedEnd
      expect((op as any).before.rippleAffected).toBeDefined();
    });
  });

  describe('updateElement', () => {
    it('should directly update element in project via set()', () => {
      const project = createProjectWithMediaTrack();
      const { store } = createTestStore(project);

      store.getState().updateElement('media-track', 'elem-1', { startTime: 5 });

      const updated = store.getState().project!;
      const track = updated.tracks.find((t) => t.id === 'media-track');
      const elem = track!.elements.find((e) => e.id === 'elem-1');
      expect(elem!.startTime).toBe(5);
    });

    it('should not use dispatch (no history for real-time ops)', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().updateElement('media-track', 'elem-1', { startTime: 5 });
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should preserve other elements in the track', () => {
      const { store } = createTestStore(createProjectWithMediaTrack());
      store.getState().updateElement('media-track', 'elem-1', { name: 'Renamed' });

      const track = store.getState().project!.tracks.find((t) => t.id === 'media-track')!;
      expect(track.elements).toHaveLength(2);
      expect(track.elements.find((e) => e.id === 'elem-2')!.name).toBe('Clip 2');
    });

    it('should do nothing when project is null', () => {
      const { store } = createTestStore(null);
      store.getState().updateElement('track', 'elem', { startTime: 5 });
      expect(store.getState().project).toBeNull();
    });

    it('should reset trims when new duration is too small', () => {
      const project = createProjectWithMediaTrack();
      // Add element with trims
      const track = project.tracks[0]!;
      (track.elements[0] as any).duration = 10;
      (track.elements[0] as any).trimStart = 3;
      (track.elements[0] as any).trimEnd = 3;

      const { store } = createTestStore(project);
      // Update duration to something that would make effective duration < 0.1
      store.getState().updateElement('media-track', 'elem-1', { duration: 6 });

      const elem = store.getState().project!.tracks[0]!.elements[0]!;
      // 3 + 3 >= 6 - 0.1, so trims should be reset
      expect(elem.trimStart).toBe(0);
      expect(elem.trimEnd).toBe(0);
    });
  });

  describe('moveElement', () => {
    it('should dispatch element.move operation', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().moveElement('media-track', 'audio-track', 'elem-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('element.move');
      expect((op.payload as any).fromTrackId).toBe('media-track');
      expect((op.payload as any).toTrackId).toBe('audio-track');
      expect((op.payload as any).elementId).toBe('elem-1');
    });

    it('should include before data with fromIndex', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().moveElement('media-track', 'audio-track', 'elem-2');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.fromIndex).toBe(1);
    });

    it('should not dispatch when source track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().moveElement('nonexistent', 'audio-track', 'elem-1');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when element not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().moveElement('media-track', 'audio-track', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().moveElement('t1', 't2', 'elem');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('toggleElementHidden', () => {
    it('should dispatch element.toggle with field "hidden"', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().toggleElementHidden('media-track', 'elem-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('element.toggle');
      expect((op.payload as any).field).toBe('hidden');
      expect((op as any).before.value).toBe(false);
    });

    it('should not dispatch when element not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().toggleElementHidden('media-track', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('toggleElementMuted', () => {
    it('should dispatch element.toggle with field "muted"', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().toggleElementMuted('media-track', 'elem-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('element.toggle');
      expect((op.payload as any).field).toBe('muted');
      expect((op as any).before.value).toBe(false);
    });

    it('should not dispatch when element not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithMediaTrack());
      store.getState().toggleElementMuted('media-track', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().toggleElementMuted('track', 'elem');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });
});
