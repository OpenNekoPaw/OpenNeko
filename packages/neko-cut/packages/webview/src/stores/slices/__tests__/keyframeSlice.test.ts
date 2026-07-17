// =============================================================================
// KeyframeSlice Tests
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import type { ProjectData } from '../../../types';
import type { EditOperation } from '@neko/shared';
import type { KeyframeSlice } from '../keyframeSlice';

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

import { createKeyframeSlice } from '../keyframeSlice';
import { createDefaultElementTransform } from '../../../types/animation';

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

function createProjectWithAnimatableElement(): ProjectData {
  const animTransform = createDefaultElementTransform();
  // Add some keyframes to the x property
  animTransform.x.keyframes = [
    { id: 'kf-1', time: 0, value: 0.2, easing: 'linear' },
    { id: 'kf-2', time: 1.5, value: 0.8, easing: 'ease-in-out' },
  ];

  return createTestProject({
    tracks: [
      {
        id: 'track-1',
        name: 'Video Track',
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
            effects: [
              {
                id: 'effect-1',
                type: 'blur',
                enabled: true,
                parameters: { radius: 5 },
                animatedParameters: {
                  radius: {
                    baseValue: 5,
                    keyframes: [
                      { id: 'ekf-1', time: 0, value: 0, easing: 'linear' },
                      { id: 'ekf-2', time: 2, value: 10, easing: 'linear' },
                    ],
                  },
                },
              },
            ],
            muted: false,
            hidden: false,
            locked: false,
            // Editor-extended fields
            animTransform,
            masks: [
              {
                id: 'mask-1',
                type: 'rectangle',
                name: 'Mask 1',
                shape: {
                  type: 'rectangle',
                  centerX: 50,
                  centerY: 50,
                  width: 100,
                  height: 100,
                  rotation: 0,
                  cornerRadius: 0,
                },
                inverted: false,
                feather: 0,
                expansion: 0,
                opacity: 1,
                enabled: true,
                animation: {
                  feather: {
                    baseValue: 0,
                    keyframes: [{ id: 'mkf-1', time: 0, value: 0, easing: 'linear' }],
                  },
                  shapeKeyframes: [
                    {
                      id: 'skf-1',
                      time: 0,
                      shape: {
                        type: 'rectangle',
                        centerX: 50,
                        centerY: 50,
                        width: 100,
                        height: 100,
                        rotation: 0,
                        cornerRadius: 0,
                      },
                      easing: 'linear',
                    },
                  ],
                },
              },
            ],
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

interface TestStore extends KeyframeSlice {
  project: ProjectData | null;
  dispatch: (op: EditOperation) => void;
}

function createTestStore(project: ProjectData | null = null) {
  const dispatchMock = vi.fn();
  const store = create<TestStore>()((set, get, storeApi) => ({
    project,
    dispatch: dispatchMock,
    ...createKeyframeSlice(set as any, get as any, storeApi as any),
  }));
  return { store, dispatchMock };
}

// -- Tests -----------------------------------------------------------------

describe('keyframeSlice', () => {
  describe('addKeyframe', () => {
    it('should dispatch keyframe.add for transform property', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addKeyframe('track-1', 'elem-1', 'transform.x', 0.5, 0.5);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.add');
      expect((op.payload as any).target.kind).toBe('transform');
      expect((op.payload as any).target.property).toBe('transform.x');
    });

    it('should create keyframe with correct time and value', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addKeyframe('track-1', 'elem-1', 'x', 2.0, 0.3);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const kf = (op.payload as any).keyframe;
      expect(kf.time).toBe(2.0);
      expect(kf.value).toBe(0.3);
      expect(kf.easing).toBe('linear');
    });

    it('should generate unique keyframe ID', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addKeyframe('track-1', 'elem-1', 'x', 1.0, 0.5);
      store.getState().addKeyframe('track-1', 'elem-1', 'x', 2.0, 0.7);

      const id1 = (dispatchMock.mock.calls[0]![0] as any).payload.keyframe.id;
      const id2 = (dispatchMock.mock.calls[1]![0] as any).payload.keyframe.id;
      expect(id1).not.toBe(id2);
    });

    it('should parse "x" as transform.x shorthand', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addKeyframe('track-1', 'elem-1', 'x', 1.0, 0.5);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).target.property).toBe('x');
    });

    it('should not dispatch for non-transform properties', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addKeyframe('track-1', 'elem-1', 'audio.volume', 1.0, 0.5);

      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().addKeyframe('track-1', 'elem-1', 'x', 1.0, 0.5);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when element not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addKeyframe('track-1', 'nonexistent', 'x', 1.0, 0.5);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('removeKeyframe', () => {
    it('should dispatch keyframe.remove for existing keyframe', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeKeyframe('track-1', 'elem-1', 'x', 0);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.remove');
      expect((op.payload as any).keyframeId).toBe('kf-1');
    });

    it('should include before data with keyframe and index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeKeyframe('track-1', 'elem-1', 'x', 0);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.keyframe.id).toBe('kf-1');
      expect((op as any).before.index).toBe(0);
    });

    it('should not dispatch when keyframe not found at time', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeKeyframe('track-1', 'elem-1', 'x', 99.0);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should match keyframe within tolerance (0.01s)', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      // kf-1 is at time 0, searching with very close value
      store.getState().removeKeyframe('track-1', 'elem-1', 'x', 0.005);
      expect(dispatchMock).toHaveBeenCalledTimes(1);
    });

    it('should not dispatch for non-transform root', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeKeyframe('track-1', 'elem-1', 'audio.volume', 0);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('updateKeyframe', () => {
    it('should dispatch keyframe.update with new time and value', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateKeyframe('track-1', 'elem-1', 'x', 0, 0.5, 0.6);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.update');
      expect((op.payload as any).updates.time).toBe(0.5);
      expect((op.payload as any).updates.value).toBe(0.6);
    });

    it('should include before data with old time and value', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateKeyframe('track-1', 'elem-1', 'x', 0, 0.5, 0.6);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.updates.time).toBe(0);
      expect((op as any).before.updates.value).toBe(0.2);
    });

    it('should not dispatch when keyframe not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateKeyframe('track-1', 'elem-1', 'x', 99, 1.0, 0.5);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().updateKeyframe('t', 'e', 'x', 0, 1, 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('addEffectKeyframe', () => {
    it('should dispatch keyframe.add with effect target', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addEffectKeyframe('track-1', 'elem-1', 'effect-1', 'radius', 3.0, 15);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.add');
      expect((op.payload as any).target.kind).toBe('effect');
      expect((op.payload as any).target.effectId).toBe('effect-1');
      expect((op.payload as any).target.paramKey).toBe('radius');
    });

    it('should not dispatch when effect not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addEffectKeyframe('track-1', 'elem-1', 'nonexistent', 'radius', 1, 5);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when element has no effects', () => {
      const project = createTestProject({
        tracks: [
          {
            id: 't1',
            name: 'T',
            type: 'media',
            elements: [
              {
                id: 'e1',
                type: 'media',
                name: 'C',
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
        ],
      });
      const { store, dispatchMock } = createTestStore(project);
      store.getState().addEffectKeyframe('t1', 'e1', 'eff', 'param', 0, 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('removeEffectKeyframe', () => {
    it('should dispatch keyframe.remove with effect target', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeEffectKeyframe('track-1', 'elem-1', 'effect-1', 'radius', 'ekf-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.remove');
      expect((op.payload as any).keyframeId).toBe('ekf-1');
    });

    it('should include before data', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeEffectKeyframe('track-1', 'elem-1', 'effect-1', 'radius', 'ekf-1');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.keyframe.id).toBe('ekf-1');
    });

    it('should not dispatch when keyframe ID not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store
        .getState()
        .removeEffectKeyframe('track-1', 'elem-1', 'effect-1', 'radius', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('updateEffectKeyframe', () => {
    it('should dispatch keyframe.update with effect target', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateEffectKeyframe('track-1', 'elem-1', 'effect-1', 'radius', 'ekf-1', {
        time: 0.5,
        value: 3,
      });

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.update');
      expect((op.payload as any).updates.time).toBe(0.5);
      expect((op.payload as any).updates.value).toBe(3);
    });

    it('should include before data with old values', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateEffectKeyframe('track-1', 'elem-1', 'effect-1', 'radius', 'ekf-1', {
        value: 3,
      });

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.updates.value).toBe(0);
    });
  });

  describe('addMaskPropertyKeyframe', () => {
    it('should dispatch keyframe.add with maskProperty target', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addMaskPropertyKeyframe('track-1', 'elem-1', 'mask-1', 'feather', 1.0, 5);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.add');
      expect((op.payload as any).target.kind).toBe('maskProperty');
      expect((op.payload as any).target.maskId).toBe('mask-1');
      expect((op.payload as any).target.property).toBe('feather');
    });

    it('should not dispatch when mask not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().addMaskPropertyKeyframe('track-1', 'elem-1', 'nonexistent', 'feather', 1, 5);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when element has no masks', () => {
      const project = createTestProject({
        tracks: [
          {
            id: 't1',
            name: 'T',
            type: 'media',
            elements: [
              {
                id: 'e1',
                type: 'media',
                name: 'C',
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
        ],
      });
      const { store, dispatchMock } = createTestStore(project);
      store.getState().addMaskPropertyKeyframe('t1', 'e1', 'm1', 'feather', 0, 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('removeMaskPropertyKeyframe', () => {
    it('should dispatch keyframe.remove for mask property', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store
        .getState()
        .removeMaskPropertyKeyframe('track-1', 'elem-1', 'mask-1', 'feather', 'mkf-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.remove');
      expect((op.payload as any).keyframeId).toBe('mkf-1');
    });

    it('should not dispatch when keyframe not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store
        .getState()
        .removeMaskPropertyKeyframe('track-1', 'elem-1', 'mask-1', 'feather', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('addMaskShapeKeyframe', () => {
    it('should dispatch keyframe.add with maskShape target', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      const shape = {
        type: 'rectangle' as const,
        centerX: 100,
        centerY: 100,
        width: 200,
        height: 200,
        rotation: 0,
        cornerRadius: 0,
      };
      store.getState().addMaskShapeKeyframe('track-1', 'elem-1', 'mask-1', 2.0, shape);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.add');
      expect((op.payload as any).target.kind).toBe('maskShape');
      expect((op.payload as any).target.maskId).toBe('mask-1');
    });

    it('should not dispatch when mask not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      const shape = {
        type: 'rectangle' as const,
        centerX: 0,
        centerY: 0,
        width: 10,
        height: 10,
        rotation: 0,
        cornerRadius: 0,
      };
      store.getState().addMaskShapeKeyframe('track-1', 'elem-1', 'nonexistent', 1.0, shape);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('removeMaskShapeKeyframe', () => {
    it('should dispatch keyframe.remove for mask shape', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeMaskShapeKeyframe('track-1', 'elem-1', 'mask-1', 'skf-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.remove');
      expect((op.payload as any).keyframeId).toBe('skf-1');
    });

    it('should not dispatch when keyframe not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().removeMaskShapeKeyframe('track-1', 'elem-1', 'mask-1', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('updateMaskShapeKeyframe', () => {
    it('should dispatch keyframe.update for mask shape', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateMaskShapeKeyframe('track-1', 'elem-1', 'mask-1', 'skf-1', {
        time: 1.0,
      });

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('keyframe.update');
      expect((op.payload as any).updates.time).toBe(1.0);
    });

    it('should include before data', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateMaskShapeKeyframe('track-1', 'elem-1', 'mask-1', 'skf-1', {
        time: 1.0,
      });

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.updates.time).toBe(0);
    });

    it('should not dispatch when keyframe not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithAnimatableElement());
      store.getState().updateMaskShapeKeyframe('track-1', 'elem-1', 'mask-1', 'nonexistent', {
        time: 1.0,
      });
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });
});
