// =============================================================================
// ProjectSlice Tests
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ProjectSlice } from '../projectSlice';
import { createProjectSlice } from '../projectSlice';
import type { ProjectData } from '../../../types';

// -- Test helpers ----------------------------------------------------------

function createTestStore() {
  return create<ProjectSlice>()((set, get, store) => ({
    ...createProjectSlice(set, get, store),
  }));
}

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
        id: 'track1',
        name: 'Video Track',
        type: 'media',
        elements: [
          {
            id: 'elem1',
            type: 'media',
            name: 'Clip 1',
            src: '/video.mp4',
            startTime: 0,
            duration: 10,
            trimStart: 1,
            trimEnd: 2,
            transform: {
              x: { baseValue: 0, keyframes: [] },
              y: { baseValue: 0, keyframes: [] },
              scaleX: { baseValue: 1, keyframes: [] },
              scaleY: { baseValue: 1, keyframes: [] },
              rotation: { baseValue: 0, keyframes: [] },
              anchorX: { baseValue: 0.5, keyframes: [] },
              anchorY: { baseValue: 0.5, keyframes: [] },
            },
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          } as any,
          {
            id: 'elem2',
            type: 'media',
            name: 'Clip 2',
            src: '/video2.mp4',
            startTime: 7,
            duration: 5,
            trimStart: 0,
            trimEnd: 0,
            transform: {
              x: { baseValue: 0, keyframes: [] },
              y: { baseValue: 0, keyframes: [] },
              scaleX: { baseValue: 1, keyframes: [] },
              scaleY: { baseValue: 1, keyframes: [] },
              rotation: { baseValue: 0, keyframes: [] },
              anchorX: { baseValue: 0.5, keyframes: [] },
              anchorY: { baseValue: 0.5, keyframes: [] },
            },
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

// -- Tests -----------------------------------------------------------------

describe('projectSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('should start with project = null', () => {
      expect(store.getState().project).toBeNull();
    });

    it('should start with projectRoot = null', () => {
      expect(store.getState().projectRoot).toBeNull();
    });
  });

  describe('setProject', () => {
    it('should set the project data', () => {
      const project = createTestProject();
      store.getState().setProject(project);
      expect(store.getState().project).toEqual(project);
    });

    it('should set project with projectRoot', () => {
      const project = createTestProject();
      store.getState().setProject(project, '/path/to/project');
      expect(store.getState().project).toEqual(project);
      expect(store.getState().projectRoot).toBe('/path/to/project');
    });

    it('should preserve existing projectRoot when not provided', () => {
      const project1 = createTestProject({ name: 'First' });
      store.getState().setProject(project1, '/path/to/project');

      const project2 = createTestProject({ name: 'Second' });
      store.getState().setProject(project2);
      expect(store.getState().project!.name).toBe('Second');
      expect(store.getState().projectRoot).toBe('/path/to/project');
    });

    it('should override projectRoot when explicitly provided', () => {
      store.getState().setProject(createTestProject(), '/old/path');
      store.getState().setProject(createTestProject(), '/new/path');
      expect(store.getState().projectRoot).toBe('/new/path');
    });

    it('should replace existing project entirely', () => {
      store.getState().setProject(createTestProject({ name: 'First', fps: 24 }));
      store.getState().setProject(createTestProject({ name: 'Second', fps: 60 }));
      expect(store.getState().project!.name).toBe('Second');
      expect(store.getState().project!.fps).toBe(60);
    });
  });

  describe('updateProject', () => {
    it('should update project name', () => {
      store.getState().setProject(createTestProject({ name: 'Old Name' }));
      store.getState().updateProject({ name: 'New Name' });
      expect(store.getState().project!.name).toBe('New Name');
    });

    it('should update project fps', () => {
      store.getState().setProject(createTestProject({ fps: 30 }));
      store.getState().updateProject({ fps: 60 });
      expect(store.getState().project!.fps).toBe(60);
    });

    it('should update resolution', () => {
      store.getState().setProject(createTestProject());
      store.getState().updateProject({ resolution: { width: 3840, height: 2160 } });
      expect(store.getState().project!.resolution).toEqual({ width: 3840, height: 2160 });
    });

    it('should do nothing when project is null', () => {
      store.getState().updateProject({ name: 'New Name' });
      expect(store.getState().project).toBeNull();
    });

    it('should preserve unmodified fields', () => {
      store.getState().setProject(
        createTestProject({
          name: 'My Project',
          fps: 30,
          resolution: { width: 1920, height: 1080 },
        }),
      );
      store.getState().updateProject({ name: 'Renamed' });
      expect(store.getState().project!.fps).toBe(30);
      expect(store.getState().project!.resolution).toEqual({ width: 1920, height: 1080 });
    });

    it('should support partial resolution updates via spread', () => {
      store.getState().setProject(createTestProject());
      const current = store.getState().project!;
      store.getState().updateProject({
        resolution: { ...current.resolution, width: 2560 },
      });
      expect(store.getState().project!.resolution.width).toBe(2560);
      expect(store.getState().project!.resolution.height).toBe(1080);
    });
  });

  describe('getTotalDuration', () => {
    it('should return 0 when project is null', () => {
      expect(store.getState().getTotalDuration()).toBe(0);
    });

    it('should return 0 for empty project (no tracks)', () => {
      store.getState().setProject(createTestProject());
      expect(store.getState().getTotalDuration()).toBe(0);
    });

    it('should calculate duration from element endTime', () => {
      store.getState().setProject(createProjectWithElements());
      // Clip 1: startTime=0, duration=10, trimStart=1, trimEnd=2 → endTime = 0 + 10 - 1 - 2 = 7
      // Clip 2: startTime=7, duration=5, trimStart=0, trimEnd=0 → endTime = 7 + 5 - 0 - 0 = 12
      expect(store.getState().getTotalDuration()).toBe(12);
    });

    it('should handle single element', () => {
      store.getState().setProject(
        createTestProject({
          tracks: [
            {
              id: 't1',
              name: 'Track',
              type: 'media',
              elements: [
                {
                  id: 'e1',
                  type: 'media',
                  name: 'Clip',
                  src: '/v.mp4',
                  startTime: 5,
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
              isMain: false,
            } as any,
          ],
        }),
      );
      // endTime = 5 + 10 - 0 - 0 = 15
      expect(store.getState().getTotalDuration()).toBe(15);
    });

    it('should return max endTime across multiple tracks', () => {
      store.getState().setProject(
        createTestProject({
          tracks: [
            {
              id: 't1',
              name: 'T1',
              type: 'media',
              elements: [
                {
                  id: 'e1',
                  type: 'media',
                  name: 'C1',
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
                } as any,
              ],
              muted: false,
              locked: false,
              hidden: false,
              isMain: false,
            } as any,
            {
              id: 't2',
              name: 'T2',
              type: 'audio',
              elements: [
                {
                  id: 'e2',
                  type: 'audio',
                  name: 'A1',
                  src: '/a.mp3',
                  startTime: 3,
                  duration: 20,
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
        }),
      );
      // T1: endTime = 5, T2: endTime = 23
      expect(store.getState().getTotalDuration()).toBe(23);
    });
  });
});
