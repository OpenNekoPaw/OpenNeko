// =============================================================================
// Roundtrip 测试 — 验证 apply(apply(project, op), invert(op)) ≈ project
//
// 对每种操作验证幂等性：apply → invert → apply 后状态恢复
// =============================================================================

import { describe, it, expect } from 'vitest';
import { applyOperation } from '../apply';
import { invertOperation } from '../invert';
import type { EditOperation } from '../types';
import type { ProjectData } from '../../types/project';
import {
  createTestProject,
  createTestTrack,
  createTestMediaElement,
  createTestAudioElement,
  createTestShapeElement,
  createTestShapeInstance,
  createMeta,
  createWebviewElement,
} from './test-helpers';

/**
 * 验证 roundtrip：apply op → apply invert(op) → 状态恢复
 */
function assertRoundtrip(project: ProjectData, op: EditOperation) {
  const after = applyOperation(project, op);
  const inv = invertOperation(op);
  const restored = applyOperation(after, inv);

  // 深度比较（忽略引用）
  expect(JSON.parse(JSON.stringify(restored))).toEqual(JSON.parse(JSON.stringify(project)));
}

/**
 * 验证序列化一致性：JSON.parse(JSON.stringify(op)) === op
 */
function assertSerializable(op: EditOperation) {
  const serialized = JSON.stringify(op);
  const deserialized = JSON.parse(serialized);
  expect(deserialized).toEqual(op);
}

describe('roundtrip', () => {
  const meta = createMeta();

  describe('track operations', () => {
    it('track.add roundtrip', () => {
      const project = createTestProject({ tracks: [createTestTrack({ id: 'existing' })] });
      const newTrack = createTestTrack({ id: 't-new' });
      const op: EditOperation = {
        type: 'track.add',
        meta,
        payload: { track: newTrack, index: 0 },
      };
      assertRoundtrip(project, op);
      assertSerializable(op);
    });

    it('track.remove roundtrip', () => {
      const t1 = createTestTrack({ id: 't1' });
      const t2 = createTestTrack({ id: 't2' });
      const project = createTestProject({ tracks: [t1, t2] });
      const op: EditOperation = {
        type: 'track.remove',
        meta,
        payload: { trackId: 't1' },
        before: { track: t1, index: 0 },
      };
      assertRoundtrip(project, op);
    });

    it('track.update roundtrip', () => {
      const t1 = createTestTrack({ id: 't1', name: 'Old', muted: false });
      const project = createTestProject({ tracks: [t1] });
      const op: EditOperation = {
        type: 'track.update',
        meta,
        payload: { trackId: 't1', updates: { name: 'New', muted: true } },
        before: { updates: { name: 'Old', muted: false } },
      };
      assertRoundtrip(project, op);
    });

    it('track.reorder roundtrip', () => {
      const t1 = createTestTrack({ id: 't1' });
      const t2 = createTestTrack({ id: 't2' });
      const t3 = createTestTrack({ id: 't3' });
      const project = createTestProject({ tracks: [t1, t2, t3] });
      const op: EditOperation = {
        type: 'track.reorder',
        meta,
        payload: { trackId: 't1', fromIndex: 0, toIndex: 2 },
      };
      assertRoundtrip(project, op);
    });

    it('track.toggle roundtrip', () => {
      const t1 = createTestTrack({ id: 't1', muted: false });
      const project = createTestProject({ tracks: [t1] });
      const op: EditOperation = {
        type: 'track.toggle',
        meta,
        payload: { trackId: 't1', field: 'muted' },
        before: { value: false },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('element operations', () => {
    it('element.add roundtrip', () => {
      const track = createTestTrack({ id: 't1' });
      const project = createTestProject({ tracks: [track] });
      const elem = createTestMediaElement({ id: 'e1' });
      const op: EditOperation = {
        type: 'element.add',
        meta,
        payload: { trackId: 't1', element: elem },
      };
      assertRoundtrip(project, op);
    });

    it('element.remove roundtrip', () => {
      const e1 = createTestMediaElement({ id: 'e1' });
      const e2 = createTestMediaElement({ id: 'e2', startTime: 5 });
      const track = createTestTrack({ id: 't1', elements: [e1, e2] });
      const project = createTestProject({ tracks: [track] });
      const op: EditOperation = {
        type: 'element.remove',
        meta,
        payload: { trackId: 't1', elementId: 'e1' },
        before: { element: e1, index: 0 },
      };
      assertRoundtrip(project, op);
    });

    it('element.update roundtrip', () => {
      const e1 = createTestMediaElement({ id: 'e1', name: 'Old', startTime: 0 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });
      const op: EditOperation = {
        type: 'element.update',
        meta,
        payload: { trackId: 't1', elementId: 'e1', updates: { name: 'New', startTime: 5 } },
        before: { updates: { name: 'Old', startTime: 0 } },
      };
      assertRoundtrip(project, op);
    });

    it('element.move roundtrip', () => {
      const e1 = createTestMediaElement({ id: 'e1' });
      const t1 = createTestTrack({ id: 't1', elements: [e1] });
      const t2 = createTestTrack({ id: 't2' });
      const project = createTestProject({ tracks: [t1, t2] });
      const op: EditOperation = {
        type: 'element.move',
        meta,
        payload: { fromTrackId: 't1', toTrackId: 't2', elementId: 'e1' },
        before: { fromIndex: 0 },
      };
      assertRoundtrip(project, op);
    });

    it('element.toggle roundtrip', () => {
      const e1 = createTestMediaElement({ id: 'e1', hidden: false });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });
      const op: EditOperation = {
        type: 'element.toggle',
        meta,
        payload: { trackId: 't1', elementId: 'e1', field: 'hidden' },
        before: { value: false },
      };
      assertRoundtrip(project, op);
    });

    it('element.linkAudio roundtrip', () => {
      const videoElem = createTestMediaElement({ id: 'v1' });
      const videoTrack = createTestTrack({ id: 'vt1', elements: [videoElem] });
      const audioTrack = createTestTrack({ id: 'at1', type: 'audio' });
      const project = createTestProject({ tracks: [videoTrack, audioTrack] });

      const audioElem = createTestAudioElement({ id: 'a1', linkedVideoId: 'v1' });
      const op: EditOperation = {
        type: 'element.linkAudio',
        meta,
        payload: {
          videoTrackId: 'vt1',
          videoElementId: 'v1',
          audioTrackId: 'at1',
          audioElement: audioElem,
        },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('split operations', () => {
    it('element.splitKeepLeft roundtrip', () => {
      const e1 = createTestMediaElement({ id: 'e1', name: 'Original', duration: 10, trimEnd: 0 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });
      const op: EditOperation = {
        type: 'element.splitKeepLeft',
        meta,
        payload: { trackId: 't1', elementId: 'e1', splitPoint: 5, newName: 'Original (left)' },
        before: { trimEnd: 0, name: 'Original' },
      };
      assertRoundtrip(project, op);
    });

    it('element.splitKeepRight roundtrip', () => {
      const e1 = createTestMediaElement({ id: 'e1', name: 'Original', startTime: 0, trimStart: 0 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });
      const op: EditOperation = {
        type: 'element.splitKeepRight',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          splitPoint: 5,
          newStartTime: 5,
          newName: 'Original (right)',
        },
        before: { startTime: 0, trimStart: 0, name: 'Original' },
      };
      assertRoundtrip(project, op);
    });

    it('element.splitAt roundtrip', () => {
      const e1 = createTestMediaElement({ id: 'e1', duration: 10, trimEnd: 0 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });

      const rightElement = createTestMediaElement({
        id: 'e1-right',
        startTime: 5,
        trimStart: 5,
        trimEnd: 0,
        duration: 10,
      });

      const op: EditOperation = {
        type: 'element.splitAt',
        meta,
        payload: { trackId: 't1', elementId: 'e1', splitPoint: 5, rightElement },
        before: { trimEnd: 0 },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('shape operations', () => {
    function createShapeProject() {
      const shape1 = createTestShapeInstance({ id: 's1', zIndex: 0 });
      const shape2 = createTestShapeInstance({ id: 's2', zIndex: 1 });
      const elem = createWebviewElement(createTestShapeElement({ id: 'e1' }), {
        shapes: [shape1, shape2],
      });
      const track = createTestTrack({ id: 't1', type: 'shape', elements: [elem] });
      return { project: createTestProject({ tracks: [track] }), shape1, shape2 };
    }

    it('shape.add roundtrip', () => {
      const { project } = createShapeProject();
      const newShape = createTestShapeInstance({ id: 's3' });
      const op: EditOperation = {
        type: 'shape.add',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shape: newShape },
      };
      assertRoundtrip(project, op);
    });

    it('shape.remove roundtrip', () => {
      const { project, shape1 } = createShapeProject();
      const op: EditOperation = {
        type: 'shape.remove',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1' },
        before: { shape: shape1, index: 0 },
      };
      assertRoundtrip(project, op);
    });

    it('shape.update roundtrip', () => {
      const { project } = createShapeProject();
      const op: EditOperation = {
        type: 'shape.update',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1', updates: { name: 'Renamed' } },
        before: { updates: { name: 'Test Shape' } },
      };
      assertRoundtrip(project, op);
    });

    it('shape.updateGeometry roundtrip', () => {
      const { project } = createShapeProject();
      const op: EditOperation = {
        type: 'shape.updateGeometry',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1', shape: { centerX: 75 } },
        before: { shape: { centerX: 50 } },
      };
      assertRoundtrip(project, op);
    });

    it('shape.updateStyle roundtrip', () => {
      const { project } = createShapeProject();
      const op: EditOperation = {
        type: 'shape.updateStyle',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          shapeId: 's1',
          style: { fill: { type: 'solid', color: '#ff0000', opacity: 1 } },
        },
        before: {
          style: { fill: { type: 'solid', color: '#4a90d9', opacity: 1 } },
        },
      };
      assertRoundtrip(project, op);
    });

    it('shape.toggle roundtrip', () => {
      const { project } = createShapeProject();
      const op: EditOperation = {
        type: 'shape.toggle',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1', field: 'visible' },
        before: { value: true },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('keyframe operations', () => {
    function createKeyframeProject() {
      const elem = createWebviewElement(createTestMediaElement({ id: 'e1' }), {
        animTransform: {
          x: { baseValue: 0.5, keyframes: [{ time: 0, value: 0.5, easing: 'linear' as const }] },
        },
      });
      const track = createTestTrack({ id: 't1', elements: [elem] });
      return createTestProject({ tracks: [track] });
    }

    it('keyframe.add roundtrip', () => {
      const project = createKeyframeProject();
      const op: EditOperation = {
        type: 'keyframe.add',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframe: { time: 1, value: 0.8, easing: 'ease-in' as const },
        },
      };
      assertRoundtrip(project, op);
    });

    it('keyframe.remove roundtrip', () => {
      const project = createKeyframeProject();
      const kf = { time: 0, value: 0.5, easing: 'linear' as const };
      const op: EditOperation = {
        type: 'keyframe.remove',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframeTime: 0,
        },
        before: { keyframe: kf, index: 0 },
      };
      assertRoundtrip(project, op);
    });

    it('keyframe.update roundtrip', () => {
      const project = createKeyframeProject();
      const op: EditOperation = {
        type: 'keyframe.update',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframeTime: 0,
          updates: { value: 0.9 },
        },
        before: { updates: { value: 0.5 } },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('clipboard operations', () => {
    it('clipboard.paste roundtrip', () => {
      const track = createTestTrack({ id: 't1' });
      const project = createTestProject({ tracks: [track] });
      const elem = createTestMediaElement({ id: 'paste-1' });
      const op: EditOperation = {
        type: 'clipboard.paste',
        meta,
        payload: {
          items: [{ trackId: 't1', element: elem }],
        },
      };
      assertRoundtrip(project, op);
    });

    it('clipboard.paste with new track roundtrip', () => {
      const project = createTestProject({ tracks: [] });
      const newTrack = createTestTrack({ id: 't-new' });
      const elem = createTestMediaElement({ id: 'paste-1' });
      const op: EditOperation = {
        type: 'clipboard.paste',
        meta,
        payload: {
          items: [{ trackId: 't-new', element: elem, newTrack }],
        },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('project operations', () => {
    it('project.update roundtrip', () => {
      const project = createTestProject({ name: 'Old', fps: 30 });
      const op: EditOperation = {
        type: 'project.update',
        meta,
        payload: { updates: { name: 'New', fps: 60 } },
        before: { updates: { name: 'Old', fps: 30 } },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('batch operations', () => {
    it('batch roundtrip', () => {
      const t1 = createTestTrack({ id: 't1', name: 'Track 1' });
      const project = createTestProject({ tracks: [t1] });

      const op: EditOperation = {
        type: 'batch',
        meta,
        payload: {
          operations: [
            {
              type: 'track.update',
              meta,
              payload: { trackId: 't1', updates: { name: 'Renamed' } },
              before: { updates: { name: 'Track 1' } },
            },
            {
              type: 'track.add',
              meta,
              payload: { track: createTestTrack({ id: 't2' }) },
            },
          ],
        },
      };
      assertRoundtrip(project, op);
    });
  });

  describe('serialization', () => {
    it('all operation types should be JSON serializable', () => {
      const track = createTestTrack({ id: 't1' });
      const elem = createTestMediaElement({ id: 'e1' });
      const shape = createTestShapeInstance({ id: 's1' });

      const operations: EditOperation[] = [
        { type: 'track.add', meta, payload: { track } },
        { type: 'track.remove', meta, payload: { trackId: 't1' }, before: { track, index: 0 } },
        {
          type: 'track.update',
          meta,
          payload: { trackId: 't1', updates: { name: 'X' } },
          before: { updates: { name: 'Y' } },
        },
        { type: 'track.reorder', meta, payload: { trackId: 't1', fromIndex: 0, toIndex: 1 } },
        {
          type: 'track.toggle',
          meta,
          payload: { trackId: 't1', field: 'muted' },
          before: { value: false },
        },
        { type: 'element.add', meta, payload: { trackId: 't1', element: elem } },
        {
          type: 'element.remove',
          meta,
          payload: { trackId: 't1', elementId: 'e1' },
          before: { element: elem, index: 0 },
        },
        {
          type: 'element.toggle',
          meta,
          payload: { trackId: 't1', elementId: 'e1', field: 'hidden' },
          before: { value: false },
        },
        { type: 'shape.add', meta, payload: { trackId: 't1', elementId: 'e1', shape } },
        {
          type: 'shape.remove',
          meta,
          payload: { trackId: 't1', elementId: 'e1', shapeId: 's1' },
          before: { shape, index: 0 },
        },
        {
          type: 'project.update',
          meta,
          payload: { updates: { name: 'X' } },
          before: { updates: { name: 'Y' } },
        },
      ];

      for (const op of operations) {
        assertSerializable(op);
      }
    });
  });
});
