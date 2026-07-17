// =============================================================================
// Keyframe Operations 测试
// =============================================================================

import { describe, it, expect } from 'vitest';
import { applyOperation } from '../apply';
import type { Keyframe } from '../../types/keyframe';
import type { WebviewElement } from '../webview-types';
import {
  createTestProject,
  createTestTrack,
  createTestMediaElement,
  createMeta,
  createWebviewElement,
} from './test-helpers';

describe('apply-keyframe', () => {
  function createKeyframeProject() {
    const elem = createWebviewElement(createTestMediaElement({ id: 'e1' }), {
      animTransform: {
        x: { baseValue: 0.5, keyframes: [{ time: 0, value: 0.5, easing: 'linear' as const }] },
      },
      masks: [
        {
          id: 'mask1',
          name: 'Mask 1',
          enabled: true,
          shape: {
            type: 'rectangle' as const,
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
          opacity: 100,
          blendMode: 'add' as const,
          order: 0,
          animation: {
            feather: {
              baseValue: 0,
              keyframes: [{ id: 'kf-m1', time: 0, value: 0, easing: 'linear' as const }],
            },
            shapeKeyframes: [
              {
                id: 'kf-ms1',
                time: 0,
                shape: {
                  type: 'rectangle' as const,
                  centerX: 50,
                  centerY: 50,
                  width: 100,
                  height: 100,
                  rotation: 0,
                  cornerRadius: 0,
                },
                easing: 'linear' as const,
              },
            ],
          },
        },
      ],
    });
    // effects are on the base element — set them via spread after webview wrapping
    const elemWithEffects: WebviewElement = {
      ...elem,
      effects: [
        {
          id: 'fx1',
          type: 'blur',
          enabled: true,
          parameters: { radius: 5 },
          animatedParameters: {
            radius: {
              baseValue: 5,
              keyframes: [{ id: 'kf-fx1', time: 0, value: 5, easing: 'linear' as const }],
            },
          },
          order: 0,
        },
      ],
    };
    const track = createTestTrack({ id: 't1', elements: [elemWithEffects] });
    return createTestProject({ tracks: [track] });
  }

  function getEl(project: ReturnType<typeof createTestProject>): WebviewElement {
    return project.tracks[0]!.elements[0]! as WebviewElement;
  }

  describe('keyframe.add — transform', () => {
    it('should add keyframe to transform property', () => {
      const project = createKeyframeProject();
      const kf: Keyframe = { time: 1, value: 0.8, easing: 'ease-in' };

      const result = applyOperation(project, {
        type: 'keyframe.add',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframe: kf,
        },
      });

      const animTransform = getEl(result).animTransform!;
      expect(animTransform['x']!.keyframes).toHaveLength(2);
      expect(animTransform['x']!.keyframes[1]!.time).toBe(1);
      expect(animTransform['x']!.keyframes[1]!.value).toBe(0.8);
    });

    it('should insert keyframe in sorted order', () => {
      const project = createKeyframeProject();
      const kf: Keyframe = { time: -0.5, value: 0.2, easing: 'linear' };

      const result = applyOperation(project, {
        type: 'keyframe.add',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframe: kf,
        },
      });

      const keyframes = getEl(result).animTransform!['x']!.keyframes;
      expect(keyframes[0]!.time).toBe(-0.5);
      expect(keyframes[1]!.time).toBe(0);
    });
  });

  describe('keyframe.remove — transform', () => {
    it('should remove keyframe by time', () => {
      const project = createKeyframeProject();

      const result = applyOperation(project, {
        type: 'keyframe.remove',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframeTime: 0,
        },
        before: {
          keyframe: { time: 0, value: 0.5, easing: 'linear' },
          index: 0,
        },
      });

      const keyframes = getEl(result).animTransform!['x']!.keyframes;
      expect(keyframes).toHaveLength(0);
    });
  });

  describe('keyframe.update — transform', () => {
    it('should update keyframe value', () => {
      const project = createKeyframeProject();

      const result = applyOperation(project, {
        type: 'keyframe.update',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframeTime: 0,
          updates: { value: 0.9 },
        },
        before: { updates: { value: 0.5 } },
      });

      const keyframes = getEl(result).animTransform!['x']!.keyframes;
      expect(keyframes[0]!.value).toBe(0.9);
    });
  });

  describe('keyframe — effect', () => {
    it('should add effect keyframe', () => {
      const project = createKeyframeProject();

      const result = applyOperation(project, {
        type: 'keyframe.add',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'effect', effectId: 'fx1', paramKey: 'radius' },
          keyframe: { id: 'kf-fx2', time: 2, value: 10, easing: 'linear' as const },
        },
      });

      const params = getEl(result).effects[0]!.animatedParameters!['radius']!;
      expect(params.keyframes).toHaveLength(2);
    });

    it('should remove effect keyframe by id', () => {
      const project = createKeyframeProject();

      const result = applyOperation(project, {
        type: 'keyframe.remove',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'effect', effectId: 'fx1', paramKey: 'radius' },
          keyframeId: 'kf-fx1',
        },
        before: {
          keyframe: { id: 'kf-fx1', time: 0, value: 5, easing: 'linear' },
          index: 0,
        },
      });

      const params = getEl(result).effects[0]!.animatedParameters!['radius']!;
      expect(params.keyframes).toHaveLength(0);
    });
  });

  describe('keyframe — maskProperty', () => {
    it('should add mask property keyframe', () => {
      const project = createKeyframeProject();

      const result = applyOperation(project, {
        type: 'keyframe.add',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'maskProperty', maskId: 'mask1', property: 'feather' },
          keyframe: { id: 'kf-m2', time: 1, value: 10, easing: 'linear' as const },
        },
      });

      const feather = getEl(result).masks![0]!.animation!.feather!;
      expect(feather.keyframes).toHaveLength(2);
    });
  });

  describe('keyframe — maskShape', () => {
    it('should add mask shape keyframe', () => {
      const project = createKeyframeProject();

      const result = applyOperation(project, {
        type: 'keyframe.add',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'maskShape', maskId: 'mask1' },
          keyframe: {
            id: 'kf-ms2',
            time: 2,
            shape: {
              type: 'rectangle' as const,
              centerX: 60,
              centerY: 60,
              width: 80,
              height: 80,
              rotation: 0,
              cornerRadius: 0,
            },
            easing: 'linear' as const,
          },
        },
      });

      const shapeKfs = getEl(result).masks![0]!.animation!.shapeKeyframes!;
      expect(shapeKfs).toHaveLength(2);
      expect(shapeKfs[1]!.time).toBe(2);
    });

    it('should remove mask shape keyframe by id', () => {
      const project = createKeyframeProject();

      const result = applyOperation(project, {
        type: 'keyframe.remove',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'maskShape', maskId: 'mask1' },
          keyframeId: 'kf-ms1',
        },
        before: {
          keyframe: {
            id: 'kf-ms1',
            time: 0,
            shape: {
              type: 'rectangle' as const,
              centerX: 50,
              centerY: 50,
              width: 100,
              height: 100,
              rotation: 0,
              cornerRadius: 0,
            },
            easing: 'linear' as const,
          },
          index: 0,
        },
      });

      const shapeKfs = getEl(result).masks![0]!.animation!.shapeKeyframes!;
      expect(shapeKfs).toHaveLength(0);
    });
  });
});
