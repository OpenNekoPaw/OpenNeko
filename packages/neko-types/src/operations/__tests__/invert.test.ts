// =============================================================================
// invertOperation 测试
// =============================================================================

import { describe, it, expect } from 'vitest';
import { invertOperation } from '../invert';
import type {
  EditOperation,
  TrackAddOperation,
  TrackRemoveOperation,
  TrackUpdateOperation,
  TrackReorderOperation,
  TrackToggleOperation,
  ElementAddOperation,
  ElementRemoveOperation,
  ElementMoveOperation,
  ElementUnlinkAudioOperation,
  ElementLinkAudioOperation,
  ElementUpdateOperation,
  ShapeRemoveOperation,
  ShapeAddOperation,
  ShapeReorderOperation,
  KeyframeRemoveOperation,
  KeyframeAddOperation,
  BatchOperation,
  ProjectUpdateOperation,
} from '../types';
import {
  createTestTrack,
  createTestMediaElement,
  createTestAudioElement,
  createTestShapeInstance,
  createMeta,
} from './test-helpers';

describe('invertOperation', () => {
  const meta = createMeta();

  describe('track operations', () => {
    it('track.add → track.remove', () => {
      const track = createTestTrack({ id: 't1' });
      const op: EditOperation = {
        type: 'track.add',
        meta,
        payload: { track },
      };

      const inv = invertOperation(op) as TrackRemoveOperation;
      expect(inv.type).toBe('track.remove');
      expect(inv.payload.trackId).toBe('t1');
    });

    it('track.remove → track.add', () => {
      const track = createTestTrack({ id: 't1' });
      const op: EditOperation = {
        type: 'track.remove',
        meta,
        payload: { trackId: 't1' },
        before: { track, index: 2 },
      };

      const inv = invertOperation(op) as TrackAddOperation;
      expect(inv.type).toBe('track.add');
      expect(inv.payload.track.id).toBe('t1');
      expect(inv.payload.index).toBe(2);
    });

    it('track.update → track.update with swapped before/payload', () => {
      const op: EditOperation = {
        type: 'track.update',
        meta,
        payload: { trackId: 't1', updates: { name: 'New' } },
        before: { updates: { name: 'Old' } },
      };

      const inv = invertOperation(op) as TrackUpdateOperation;
      expect(inv.type).toBe('track.update');
      expect(inv.payload.updates.name).toBe('Old');
      expect(inv.before.updates.name).toBe('New');
    });

    it('track.reorder → track.reorder with swapped indices', () => {
      const op: EditOperation = {
        type: 'track.reorder',
        meta,
        payload: { trackId: 't1', fromIndex: 0, toIndex: 2 },
      };

      const inv = invertOperation(op) as TrackReorderOperation;
      expect(inv.type).toBe('track.reorder');
      expect(inv.payload.fromIndex).toBe(2);
      expect(inv.payload.toIndex).toBe(0);
    });

    it('track.toggle → track.toggle (self-inverse)', () => {
      const op: EditOperation = {
        type: 'track.toggle',
        meta,
        payload: { trackId: 't1', field: 'muted' },
        before: { value: false },
      };

      const inv = invertOperation(op) as TrackToggleOperation;
      expect(inv.type).toBe('track.toggle');
      expect(inv.before.value).toBe(true);
    });
  });

  describe('element operations', () => {
    it('element.add → element.remove', () => {
      const elem = createTestMediaElement({ id: 'e1' });
      const op: EditOperation = {
        type: 'element.add',
        meta,
        payload: { trackId: 't1', element: elem },
      };

      const inv = invertOperation(op) as ElementRemoveOperation;
      expect(inv.type).toBe('element.remove');
      expect(inv.payload.elementId).toBe('e1');
    });

    it('element.remove → element.add', () => {
      const elem = createTestMediaElement({ id: 'e1' });
      const op: EditOperation = {
        type: 'element.remove',
        meta,
        payload: { trackId: 't1', elementId: 'e1' },
        before: { element: elem, index: 0 },
      };

      const inv = invertOperation(op) as ElementAddOperation;
      expect(inv.type).toBe('element.add');
      expect(inv.payload.element.id).toBe('e1');
      expect(inv.payload.index).toBe(0);
    });

    it('element.move → element.move with swapped tracks', () => {
      const op: EditOperation = {
        type: 'element.move',
        meta,
        payload: { fromTrackId: 't1', toTrackId: 't2', elementId: 'e1' },
        before: { fromIndex: 0 },
      };

      const inv = invertOperation(op) as ElementMoveOperation;
      expect(inv.type).toBe('element.move');
      expect(inv.payload.fromTrackId).toBe('t2');
      expect(inv.payload.toTrackId).toBe('t1');
    });

    it('element.linkAudio → element.unlinkAudio', () => {
      const audioElem = createTestAudioElement({ id: 'a1' });
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

      const inv = invertOperation(op) as ElementUnlinkAudioOperation;
      expect(inv.type).toBe('element.unlinkAudio');
      expect(inv.before.linkedAudioId).toBe('a1');
    });

    it('element.unlinkAudio → element.linkAudio', () => {
      const audioElem = createTestAudioElement({ id: 'a1' });
      const op: EditOperation = {
        type: 'element.unlinkAudio',
        meta,
        payload: { videoTrackId: 'vt1', videoElementId: 'v1' },
        before: {
          linkedAudioId: 'a1',
          audioTrackId: 'at1',
          audioElement: audioElem,
        },
      };

      const inv = invertOperation(op) as ElementLinkAudioOperation;
      expect(inv.type).toBe('element.linkAudio');
      expect(inv.payload.audioElement.id).toBe('a1');
    });
  });

  describe('split operations', () => {
    it('element.splitAt → batch(remove right + update left)', () => {
      const rightElem = createTestMediaElement({ id: 'e1-right', duration: 10 });
      const op: EditOperation = {
        type: 'element.splitAt',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          splitPoint: 5,
          rightElement: rightElem,
        },
        before: { trimEnd: 0 },
      };

      const inv = invertOperation(op) as BatchOperation;
      expect(inv.type).toBe('batch');
      expect(inv.payload.operations).toHaveLength(2);
      expect(inv.payload.operations[0]!.type).toBe('element.remove');
      expect(inv.payload.operations[1]!.type).toBe('element.update');
    });

    it('element.splitKeepLeft → element.update', () => {
      const op: EditOperation = {
        type: 'element.splitKeepLeft',
        meta,
        payload: { trackId: 't1', elementId: 'e1', splitPoint: 5, newName: 'Left' },
        before: { trimEnd: 0, name: 'Original' },
      };

      const inv = invertOperation(op) as ElementUpdateOperation;
      expect(inv.type).toBe('element.update');
      expect(inv.payload.updates.trimEnd).toBe(0);
      expect(inv.payload.updates.name).toBe('Original');
    });

    it('element.splitKeepRight → element.update', () => {
      const op: EditOperation = {
        type: 'element.splitKeepRight',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          splitPoint: 5,
          newStartTime: 5,
          newName: 'Right',
        },
        before: { startTime: 0, trimStart: 0, name: 'Original' },
      };

      const inv = invertOperation(op) as ElementUpdateOperation;
      expect(inv.type).toBe('element.update');
      expect(inv.payload.updates.startTime).toBe(0);
      expect(inv.payload.updates.trimStart).toBe(0);
      expect(inv.payload.updates.name).toBe('Original');
    });
  });

  describe('shape operations', () => {
    it('shape.add → shape.remove', () => {
      const shape = createTestShapeInstance({ id: 's1' });
      const op: EditOperation = {
        type: 'shape.add',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shape },
      };

      const inv = invertOperation(op) as ShapeRemoveOperation;
      expect(inv.type).toBe('shape.remove');
      expect(inv.payload.shapeId).toBe('s1');
    });

    it('shape.remove → shape.add', () => {
      const shape = createTestShapeInstance({ id: 's1' });
      const op: EditOperation = {
        type: 'shape.remove',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1' },
        before: { shape, index: 0 },
      };

      const inv = invertOperation(op) as ShapeAddOperation;
      expect(inv.type).toBe('shape.add');
      expect(inv.payload.shape.id).toBe('s1');
    });

    it('shape.reorder → shape.reorder with swapped indices', () => {
      const op: EditOperation = {
        type: 'shape.reorder',
        meta,
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1', fromIndex: 0, toIndex: 2 },
      };

      const inv = invertOperation(op) as ShapeReorderOperation;
      expect(inv.type).toBe('shape.reorder');
      expect(inv.payload.fromIndex).toBe(2);
      expect(inv.payload.toIndex).toBe(0);
    });
  });

  describe('keyframe operations', () => {
    it('keyframe.add → keyframe.remove', () => {
      const op: EditOperation = {
        type: 'keyframe.add',
        meta,
        payload: {
          trackId: 't1',
          elementId: 'e1',
          target: { kind: 'transform', property: 'x' },
          keyframe: { time: 0, value: 0.5, easing: 'linear' as const },
        },
      };

      const inv = invertOperation(op) as KeyframeRemoveOperation;
      expect(inv.type).toBe('keyframe.remove');
      expect(inv.payload.keyframeTime).toBe(0);
    });

    it('keyframe.remove → keyframe.add', () => {
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

      const inv = invertOperation(op) as KeyframeAddOperation;
      expect(inv.type).toBe('keyframe.add');
      expect(inv.payload.keyframe.time).toBe(0);
    });
  });

  describe('clipboard operations', () => {
    it('clipboard.paste → batch of removes', () => {
      const elem1 = createTestMediaElement({ id: 'e1' });
      const elem2 = createTestMediaElement({ id: 'e2' });
      const op: EditOperation = {
        type: 'clipboard.paste',
        meta,
        payload: {
          items: [
            { trackId: 't1', element: elem1 },
            { trackId: 't2', element: elem2 },
          ],
        },
      };

      const inv = invertOperation(op) as BatchOperation;
      // 逆序删除
      expect(inv.payload.operations[0]!.type).toBe('element.remove');
      expect((inv.payload.operations[0]! as ElementRemoveOperation).payload.elementId).toBe('e2');
      expect(inv.payload.operations[1]!.type).toBe('element.remove');
      expect((inv.payload.operations[1]! as ElementRemoveOperation).payload.elementId).toBe('e1');
    });
  });

  describe('project operations', () => {
    it('project.update → project.update with swapped before/payload', () => {
      const op: EditOperation = {
        type: 'project.update',
        meta,
        payload: { updates: { name: 'New Name' } },
        before: { updates: { name: 'Old Name' } },
      };

      const inv = invertOperation(op) as ProjectUpdateOperation;
      expect(inv.type).toBe('project.update');
      expect(inv.payload.updates.name).toBe('Old Name');
      expect(inv.before.updates.name).toBe('New Name');
    });
  });

  describe('batch operations', () => {
    it('should reverse order and invert each operation', () => {
      const op: EditOperation = {
        type: 'batch',
        meta,
        payload: {
          operations: [
            {
              type: 'track.add',
              meta,
              payload: { track: createTestTrack({ id: 't1' }) },
            },
            {
              type: 'track.add',
              meta,
              payload: { track: createTestTrack({ id: 't2' }) },
            },
          ],
        },
      };

      const inv = invertOperation(op) as BatchOperation;
      expect(inv.type).toBe('batch');
      expect(inv.payload.operations).toHaveLength(2);
      // 逆序
      expect(inv.payload.operations[0]!.type).toBe('track.remove');
      expect((inv.payload.operations[0]! as TrackRemoveOperation).payload.trackId).toBe('t2');
      expect(inv.payload.operations[1]!.type).toBe('track.remove');
      expect((inv.payload.operations[1]! as TrackRemoveOperation).payload.trackId).toBe('t1');
    });
  });
});
