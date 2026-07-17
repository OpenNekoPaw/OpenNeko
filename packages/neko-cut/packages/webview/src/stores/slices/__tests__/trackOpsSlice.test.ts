// =============================================================================
// TrackOpsSlice Tests
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import type { ProjectData } from '../../../types';
import type { EditOperation } from '@neko/shared';
import type { TrackOpsSlice } from '../trackOpsSlice';

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

import { createTrackOpsSlice } from '../trackOpsSlice';

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

function createProjectWithTracks(): ProjectData {
  return createTestProject({
    tracks: [
      {
        id: 'track-0',
        name: 'Video Track',
        type: 'media',
        elements: [
          {
            id: 'e1',
            type: 'media',
            name: 'Clip',
            src: '/v.mp4',
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
        ],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      } as any,
      {
        id: 'track-1',
        name: 'Audio Track',
        type: 'audio',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      } as any,
      {
        id: 'track-2',
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
}

interface TestStore extends TrackOpsSlice {
  project: ProjectData | null;
  dispatch: (op: EditOperation) => void;
}

function createTestStore(project: ProjectData | null = null) {
  const dispatchMock = vi.fn();
  const store = create<TestStore>()((set, get, storeApi) => ({
    project,
    dispatch: dispatchMock,
    ...createTrackOpsSlice(set as any, get as any, storeApi as any),
  }));
  return { store, dispatchMock };
}

// -- Tests -----------------------------------------------------------------

describe('trackOpsSlice', () => {
  describe('addTrack', () => {
    it('should dispatch track.add operation', () => {
      const { store, dispatchMock } = createTestStore(createTestProject());
      store.getState().addTrack('video');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('track.add');
      expect((op.payload as any).track.type).toBe('video');
    });

    it('should use default name for video track', () => {
      const { store, dispatchMock } = createTestStore(createTestProject());
      store.getState().addTrack('video');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).track.name).toBe('Video Track');
    });

    it('should use default name for audio track', () => {
      const { store, dispatchMock } = createTestStore(createTestProject());
      store.getState().addTrack('audio');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).track.name).toBe('Audio Track');
    });

    it('should use default name for text track', () => {
      const { store, dispatchMock } = createTestStore(createTestProject());
      store.getState().addTrack('text');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).track.name).toBe('Text Track');
    });

    it('should use custom name when provided', () => {
      const { store, dispatchMock } = createTestStore(createTestProject());
      store.getState().addTrack('video', 'My Custom Track');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).track.name).toBe('My Custom Track');
    });

    it('should return generated track ID', () => {
      const { store } = createTestStore(createTestProject());
      const trackId = store.getState().addTrack('video');
      expect(trackId).toBeTruthy();
      expect(typeof trackId).toBe('string');
    });

    it('should return empty string when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      const trackId = store.getState().addTrack('video');
      expect(trackId).toBe('');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should create track with correct default properties', () => {
      const { store, dispatchMock } = createTestStore(createTestProject());
      store.getState().addTrack('media');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const track = (op.payload as any).track;
      expect(track.elements).toEqual([]);
      expect(track.muted).toBe(false);
      expect(track.locked).toBe(false);
      expect(track.hidden).toBe(false);
      expect(track.isMain).toBe(false);
    });

    it('should support all track types', () => {
      const trackTypes = [
        'video',
        'media',
        'text',
        'audio',
        'subtitle',
        'shape',
        'effect',
      ] as const;
      for (const type of trackTypes) {
        const { store, dispatchMock } = createTestStore(createTestProject());
        store.getState().addTrack(type);
        const op = dispatchMock.mock.calls[0]![0] as EditOperation;
        expect((op.payload as any).track.type).toBe(type);
      }
    });
  });

  describe('removeTrack', () => {
    it('should dispatch track.remove with correct trackId', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().removeTrack('track-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('track.remove');
      expect((op.payload as any).trackId).toBe('track-1');
    });

    it('should include before data with track and index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().removeTrack('track-1');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.index).toBe(1);
      expect((op as any).before.track.id).toBe('track-1');
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().removeTrack('nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().removeTrack('track-1');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('updateTrack', () => {
    it('should dispatch track.update with updates', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().updateTrack('track-0', { name: 'Renamed Track' });

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('track.update');
      expect((op.payload as any).trackId).toBe('track-0');
      expect((op.payload as any).updates.name).toBe('Renamed Track');
    });

    it('should include before data for updated fields', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().updateTrack('track-0', { name: 'Renamed' });

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.updates.name).toBe('Video Track');
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().updateTrack('nonexistent', { name: 'New' });
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().updateTrack('track-0', { name: 'New' });
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('reorderTracks', () => {
    it('should dispatch track.reorder', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTracks(0, 2);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('track.reorder');
      expect((op.payload as any).fromIndex).toBe(0);
      expect((op.payload as any).toIndex).toBe(2);
    });

    it('should not dispatch when source equals target', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTracks(1, 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().reorderTracks(0, 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when sourceIndex has no track', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTracks(99, 0);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('reorderTrack', () => {
    it('should dispatch track.reorder with clamped index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTrack('track-0', 2);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('track.reorder');
      expect((op.payload as any).fromIndex).toBe(0);
      expect((op.payload as any).toIndex).toBe(2);
    });

    it('should clamp to max index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTrack('track-0', 100);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      // 3 tracks, max index is 2
      expect((op.payload as any).toIndex).toBe(2);
    });

    it('should clamp to 0 minimum', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTrack('track-2', -5);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).toIndex).toBe(0);
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTrack('nonexistent', 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when already at target index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().reorderTrack('track-1', 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('moveTrackUp', () => {
    it('should dispatch reorder from index to index-1', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().moveTrackUp('track-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).fromIndex).toBe(1);
      expect((op.payload as any).toIndex).toBe(0);
    });

    it('should not dispatch when track is already at top (index 0)', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().moveTrackUp('track-0');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().moveTrackUp('nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().moveTrackUp('track-1');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('moveTrackDown', () => {
    it('should dispatch reorder from index to index+1', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().moveTrackDown('track-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).fromIndex).toBe(1);
      expect((op.payload as any).toIndex).toBe(2);
    });

    it('should not dispatch when track is already at bottom', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().moveTrackDown('track-2');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().moveTrackDown('nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().moveTrackDown('track-1');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('toggleTrackLocked', () => {
    it('should dispatch track.toggle with field "locked"', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().toggleTrackLocked('track-0');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('track.toggle');
      expect((op.payload as any).trackId).toBe('track-0');
      expect((op.payload as any).field).toBe('locked');
    });

    it('should include before value', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().toggleTrackLocked('track-0');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.value).toBe(false);
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().toggleTrackLocked('nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().toggleTrackLocked('track-0');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('toggleTrackHidden', () => {
    it('should dispatch track.toggle with field "hidden"', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().toggleTrackHidden('track-0');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('track.toggle');
      expect((op.payload as any).trackId).toBe('track-0');
      expect((op.payload as any).field).toBe('hidden');
    });

    it('should include before value', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().toggleTrackHidden('track-0');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.value).toBe(false);
    });

    it('should not dispatch when track not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithTracks());
      store.getState().toggleTrackHidden('nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });
});
