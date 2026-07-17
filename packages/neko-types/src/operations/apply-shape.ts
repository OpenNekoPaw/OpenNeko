// =============================================================================
// Apply Shape Operations — 形状操作的 apply 实现
// =============================================================================

import type { ProjectData } from '../types/project';

import type { ShapeOperation } from './types';
import {
  updateTrackInProject,
  updateElementInProject,
  updateShapeInProject,
  getShapes,
  setShapes,
  arrayMove,
} from './helpers';

export function applyShapeOperation(project: ProjectData, op: ShapeOperation): ProjectData {
  switch (op.type) {
    case 'shape.addElement': {
      const { trackId, element, index } = op.payload;
      return updateTrackInProject(project, trackId, (track) => {
        const newElements = [...track.elements];
        if (index !== undefined) {
          newElements.splice(index, 0, element);
        } else {
          newElements.push(element);
        }
        return { ...track, elements: newElements };
      });
    }

    case 'shape.add': {
      const { trackId, elementId, shape, index } = op.payload;
      return updateElementInProject(project, trackId, elementId, (element) => {
        const shapes = getShapes(element);
        const newShapes = [...shapes];
        if (index !== undefined && index >= 0 && index <= newShapes.length) {
          newShapes.splice(index, 0, shape);
        } else {
          newShapes.push(shape);
        }
        return setShapes(element, newShapes);
      });
    }

    case 'shape.remove': {
      const { trackId, elementId, shapeId } = op.payload;
      return updateElementInProject(project, trackId, elementId, (element) => {
        const shapes = getShapes(element);
        return setShapes(
          element,
          shapes.filter((s) => s.id !== shapeId),
        );
      });
    }

    case 'shape.duplicate': {
      const { trackId, elementId, newShape } = op.payload;
      return updateElementInProject(project, trackId, elementId, (element) => {
        const shapes = getShapes(element);
        return setShapes(element, [...shapes, newShape]);
      });
    }

    case 'shape.update': {
      const { trackId, elementId, shapeId, updates } = op.payload;
      return updateShapeInProject(project, trackId, elementId, shapeId, (shape) => ({
        ...shape,
        ...updates,
      }));
    }

    case 'shape.updateGeometry': {
      const { trackId, elementId, shapeId, shape: shapeUpdates } = op.payload;
      return updateShapeInProject(project, trackId, elementId, shapeId, (shape) => ({
        ...shape,
        shape: { ...shape.shape, ...shapeUpdates } as typeof shape.shape,
      }));
    }

    case 'shape.updateStyle': {
      const { trackId, elementId, shapeId, style: styleUpdates } = op.payload;
      return updateShapeInProject(project, trackId, elementId, shapeId, (shape) => ({
        ...shape,
        style: {
          fill: styleUpdates.fill
            ? { ...shape.style.fill, ...styleUpdates.fill }
            : shape.style.fill,
          stroke: styleUpdates.stroke
            ? { ...shape.style.stroke, ...styleUpdates.stroke }
            : shape.style.stroke,
          shadow: styleUpdates.shadow
            ? { ...shape.style.shadow, ...styleUpdates.shadow }
            : shape.style.shadow,
        },
      }));
    }

    case 'shape.toggle': {
      const { trackId, elementId, shapeId, field } = op.payload;
      return updateShapeInProject(project, trackId, elementId, shapeId, (shape) => ({
        ...shape,
        [field]: !shape[field],
      }));
    }

    case 'shape.reorder': {
      const { trackId, elementId, fromIndex, toIndex } = op.payload;
      return updateElementInProject(project, trackId, elementId, (element) => {
        const shapes = getShapes(element);
        const reordered = arrayMove(shapes, fromIndex, toIndex);
        // 重新计算 zIndex
        const withZIndex = reordered.map((s, i) => ({ ...s, zIndex: i }));
        return setShapes(element, withZIndex);
      });
    }
  }
}
