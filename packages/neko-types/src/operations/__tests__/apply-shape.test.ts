// =============================================================================
// Shape Operations 测试
// =============================================================================

import { describe, it, expect } from 'vitest';
import { applyOperation } from '../apply';
import type { WebviewElement } from '../webview-types';
import type { RectangleShape } from '../../types/shape';
import {
  createTestProject,
  createTestTrack,
  createTestShapeElement,
  createTestShapeInstance,
  createMeta,
  createWebviewElement,
} from './test-helpers';

describe('apply-shape', () => {
  function createShapeProject() {
    const shape1 = createTestShapeInstance({ id: 's1', zIndex: 0 });
    const shape2 = createTestShapeInstance({ id: 's2', zIndex: 1 });
    const elem = createWebviewElement(createTestShapeElement({ id: 'e1' }), {
      shapes: [shape1, shape2],
    });
    const track = createTestTrack({ id: 't1', type: 'shape', elements: [elem] });
    return { project: createTestProject({ tracks: [track] }), shape1, shape2, elem };
  }

  function getShapes(project: ReturnType<typeof createTestProject>, trackIdx = 0, elemIdx = 0) {
    return (project.tracks[trackIdx]!.elements[elemIdx]! as WebviewElement).shapes ?? [];
  }

  describe('shape.addElement', () => {
    it('should add shape element to track', () => {
      const track = createTestTrack({ id: 't1', type: 'shape' });
      const project = createTestProject({ tracks: [track] });
      const elem = createTestShapeElement({ id: 'se1' });

      const result = applyOperation(project, {
        type: 'shape.addElement',
        meta: createMeta(),
        payload: { trackId: 't1', element: elem },
      });

      expect(result.tracks[0]!.elements).toHaveLength(1);
      expect(result.tracks[0]!.elements[0]!.id).toBe('se1');
    });
  });

  describe('shape.add', () => {
    it('should add shape instance to element', () => {
      const { project } = createShapeProject();
      const newShape = createTestShapeInstance({ id: 's3' });

      const result = applyOperation(project, {
        type: 'shape.add',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', shape: newShape },
      });

      const shapes = getShapes(result);
      expect(shapes).toHaveLength(3);
      expect(shapes[2]!.id).toBe('s3');
    });
  });

  describe('shape.remove', () => {
    it('should remove shape instance', () => {
      const { project, shape1 } = createShapeProject();

      const result = applyOperation(project, {
        type: 'shape.remove',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1' },
        before: { shape: shape1, index: 0 },
      });

      const shapes = getShapes(result);
      expect(shapes).toHaveLength(1);
      expect(shapes[0]!.id).toBe('s2');
    });
  });

  describe('shape.duplicate', () => {
    it('should duplicate shape with offset', () => {
      const { project, shape1 } = createShapeProject();
      const dup = createTestShapeInstance({ id: 's1-dup' });

      const result = applyOperation(project, {
        type: 'shape.duplicate',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', newShape: dup },
      });

      const shapes = getShapes(result);
      expect(shapes).toHaveLength(3);
      expect(shapes[2]!.id).toBe('s1-dup');
    });
  });

  describe('shape.update', () => {
    it('should update shape instance fields', () => {
      const { project } = createShapeProject();

      const result = applyOperation(project, {
        type: 'shape.update',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1', updates: { name: 'Renamed' } },
        before: { updates: { name: 'Test Shape' } },
      });

      const shapes = getShapes(result);
      expect(shapes[0]!.name).toBe('Renamed');
    });
  });

  describe('shape.updateGeometry', () => {
    it('should update shape geometry', () => {
      const { project } = createShapeProject();

      const result = applyOperation(project, {
        type: 'shape.updateGeometry',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          shapeId: 's1',
          shape: { centerX: 75, centerY: 75 },
        },
        before: { shape: { centerX: 50, centerY: 50 } },
      });

      const shapes = getShapes(result);
      const rect = shapes[0]!.shape as RectangleShape;
      expect(rect.centerX).toBe(75);
      expect(rect.centerY).toBe(75);
    });
  });

  describe('shape.updateStyle', () => {
    it('should deep merge style', () => {
      const { project } = createShapeProject();

      const result = applyOperation(project, {
        type: 'shape.updateStyle',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          shapeId: 's1',
          style: { fill: { type: 'solid' as const, color: '#ff0000', opacity: 1 } },
        },
        before: { style: { fill: { type: 'solid' as const, color: '#4a90d9', opacity: 1 } } },
      });

      const shapes = getShapes(result);
      expect(shapes[0]!.style.fill.color).toBe('#ff0000');
      // 其他 fill 字段保持不变
      expect(shapes[0]!.style.fill.opacity).toBe(1);
    });
  });

  describe('shape.toggle', () => {
    it('should toggle visibility', () => {
      const { project } = createShapeProject();

      const result = applyOperation(project, {
        type: 'shape.toggle',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1', field: 'visible' },
        before: { value: true },
      });

      const shapes = getShapes(result);
      expect(shapes[0]!.visible).toBe(false);
    });
  });

  describe('shape.reorder', () => {
    it('should reorder shapes and recalculate zIndex', () => {
      const { project } = createShapeProject();

      const result = applyOperation(project, {
        type: 'shape.reorder',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', shapeId: 's1', fromIndex: 0, toIndex: 1 },
      });

      const shapes = getShapes(result);
      expect(shapes[0]!.id).toBe('s2');
      expect(shapes[1]!.id).toBe('s1');
      expect(shapes[0]!.zIndex).toBe(0);
      expect(shapes[1]!.zIndex).toBe(1);
    });
  });
});
