/**
 * Shape Operations Slice
 * 管理形状图层的增删改操作
 *
 * 已迁移到 EditOperation 系统：所有操作通过 dispatch shape.* 操作提交。
 *
 * 职责:
 * - 形状实例 CRUD (add, update, remove, duplicate)
 * - 形状属性操作 (style, visibility, locking)
 * - 形状排序 (z-index)
 * - 形状变换 (transform)
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineTrack } from '../../types';
import type { ShapeElement, TimelineElement as BaseTimelineElement } from '@neko/shared';
import type { Shape, ShapeInstance, ShapeStyle, ShapeType } from '../../types/shape';
import type { EditOperation } from '@neko/shared';
import {
  createShapeInstance,
  cloneShapeInstance,
  createRectangleShape,
  createEllipseShape,
  createPolygonShape,
  createStarShape,
  createLineShape,
  createBezierShape,
  createDefaultShapeStyle,
} from '../../types/shape';
import { generateId } from '../../utils';
import { CENTERED_TRANSFORM } from '@neko/shared';
import { createMeta } from '../utils/operation-helpers';

// =============================================================================
// UI-extended ShapeElement (engine ShapeElement + multi-shape layers)
// =============================================================================

/**
 * Webview-extended ShapeElement with multi-shape layer support.
 * The `shapes` field is UI-only and not part of the engine model.
 */
interface WebviewShapeElement extends ShapeElement {
  shapes: ShapeInstance[];
}

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface DispatchDependency {
  dispatch: (op: EditOperation) => void;
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 根据形状类型创建默认形状
 */
function createShapeByType(shapeType: ShapeType): Shape {
  switch (shapeType) {
    case 'rectangle':
      return createRectangleShape();
    case 'ellipse':
      return createEllipseShape();
    case 'polygon':
      return createPolygonShape(6); // 六边形
    case 'star':
      return createStarShape();
    case 'line':
      return createLineShape();
    case 'bezier':
      return createBezierShape();
    default:
      return createRectangleShape();
  }
}

/**
 * 查找包含指定形状的元素和轨道
 */
function findShapeLocation(
  project: ProjectData,
  shapeId: string,
): { track: TimelineTrack; element: WebviewShapeElement; shapeIndex: number } | null {
  for (const track of project.tracks) {
    if (track.type !== 'shape') continue;

    for (const element of track.elements) {
      // Type guard for ShapeElement
      if (!('shapes' in element)) continue;

      const shapeElement = element as unknown as WebviewShapeElement;
      const shapeIndex = shapeElement.shapes.findIndex((s: ShapeInstance) => s.id === shapeId);
      if (shapeIndex !== -1) {
        return { track, element: shapeElement, shapeIndex };
      }
    }
  }
  return null;
}

/**
 * 查找形状元素
 */
function findShapeElement(
  project: ProjectData,
  trackId: string,
  elementId: string,
): WebviewShapeElement | null {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || track.type !== 'shape') return null;

  const element = track.elements.find((e) => e.id === elementId);
  if (!element || !('shapes' in element)) return null;

  return element as unknown as WebviewShapeElement;
}

// =============================================================================
// Slice 接口
// =============================================================================

export interface ShapeOpsSlice {
  // 形状元素操作
  /** 添加形状元素到轨道 */
  addShapeElement: (trackId: string, startTime?: number, duration?: number) => string;

  // 形状实例操作
  /** 添加形状到元素 */
  addShape: (trackId: string, elementId: string, shapeType: ShapeType, name?: string) => string;
  /** 删除形状 */
  removeShape: (trackId: string, elementId: string, shapeId: string) => void;
  /** 复制形状 */
  duplicateShape: (trackId: string, elementId: string, shapeId: string) => string | null;
  /** 更新形状属性 */
  updateShape: (
    trackId: string,
    elementId: string,
    shapeId: string,
    updates: Partial<ShapeInstance>,
  ) => void;
  /** 更新形状几何 */
  updateShapeGeometry: (
    trackId: string,
    elementId: string,
    shapeId: string,
    shape: Partial<Shape>,
  ) => void;
  /** 更新形状样式 */
  updateShapeStyle: (
    trackId: string,
    elementId: string,
    shapeId: string,
    style: Partial<ShapeStyle>,
  ) => void;

  // 形状可见性和锁定
  /** 切换形状可见性 */
  toggleShapeVisibility: (trackId: string, elementId: string, shapeId: string) => void;
  /** 切换形状锁定状态 */
  toggleShapeLocked: (trackId: string, elementId: string, shapeId: string) => void;

  // 形状排序
  /** 移动形状到指定层级 */
  moveShapeToIndex: (trackId: string, elementId: string, shapeId: string, newIndex: number) => void;
  /** 上移形状 */
  moveShapeUp: (trackId: string, elementId: string, shapeId: string) => void;
  /** 下移形状 */
  moveShapeDown: (trackId: string, elementId: string, shapeId: string) => void;
  /** 移到顶层 */
  moveShapeToTop: (trackId: string, elementId: string, shapeId: string) => void;
  /** 移到底层 */
  moveShapeToBottom: (trackId: string, elementId: string, shapeId: string) => void;

  // 快捷操作
  /** 通过形状ID查找并更新 */
  updateShapeById: (shapeId: string, updates: Partial<ShapeInstance>) => void;
  /** 通过形状ID删除 */
  removeShapeById: (shapeId: string) => void;
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createShapeOpsSlice: StateCreator<
  ShapeOpsSlice & ProjectDependency & DispatchDependency,
  [],
  [],
  ShapeOpsSlice
> = (_set, get) => ({
  addShapeElement: (trackId, startTime = 0, duration = 5) => {
    const { project, dispatch } = get();
    if (!project) return '';

    const elementId = generateId();
    const shapeElement: WebviewShapeElement = {
      id: elementId,
      type: 'shape',
      name: 'Shape Layer',
      startTime,
      duration,
      trimStart: 0,
      trimEnd: 0,
      transform: CENTERED_TRANSFORM,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      muted: false,
      hidden: false,
      locked: false,
      shapeType: 'rectangle',
      fill: '#4a90d9',
      stroke: '#333333',
      strokeWidth: 2,
      shapes: [],
    };

    dispatch({
      type: 'shape.addElement',
      meta: createMeta('user', 'Add Shape Layer'),
      payload: {
        trackId,
        element: shapeElement as BaseTimelineElement,
      },
    });

    return elementId;
  },

  addShape: (trackId, elementId, shapeType, name) => {
    const { project, dispatch } = get();
    if (!project) return '';

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return '';

    const shape = createShapeByType(shapeType);
    const shapeInstance = createShapeInstance(
      shape,
      name || `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)}`,
      createDefaultShapeStyle(),
    );

    // Set zIndex to current max + 1
    const maxZIndex = shapeElement.shapes.reduce((max, s) => Math.max(max, s.zIndex), -1);
    shapeInstance.zIndex = maxZIndex + 1;

    dispatch({
      type: 'shape.add',
      meta: createMeta('user', `Add ${shapeType}`),
      payload: {
        trackId,
        elementId,
        shape: shapeInstance,
      },
    });

    return shapeInstance.id;
  },

  removeShape: (trackId, elementId, shapeId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shapeIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
    if (shapeIndex === -1) return;
    const shape = shapeElement.shapes[shapeIndex]!;

    dispatch({
      type: 'shape.remove',
      meta: createMeta('user'),
      payload: { trackId, elementId, shapeId },
      before: {
        shape,
        index: shapeIndex,
      },
    });
  },

  duplicateShape: (trackId, elementId, shapeId) => {
    const { project, dispatch } = get();
    if (!project) return null;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return null;

    const originalShape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!originalShape) return null;

    const clonedShape = cloneShapeInstance(originalShape);
    clonedShape.name = `${originalShape.name} (Copy)`;
    // 偏移位置
    if ('centerX' in clonedShape.shape) {
      (clonedShape.shape as { centerX: number }).centerX += 5;
      (clonedShape.shape as { centerY: number }).centerY += 5;
    }

    dispatch({
      type: 'shape.duplicate',
      meta: createMeta('user', `Duplicate ${originalShape.name}`),
      payload: {
        trackId,
        elementId,
        newShape: clonedShape,
      },
    });

    return clonedShape.id;
  },

  updateShape: (trackId, elementId, shapeId, updates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    // Build before from existing shape
    const shapeRecord = shape as unknown as Record<string, unknown>;
    const beforeUpdates: Partial<ShapeInstance> = {};
    const beforeRecord = beforeUpdates as unknown as Record<string, unknown>;
    for (const key of Object.keys(updates)) {
      beforeRecord[key] = shapeRecord[key];
    }

    dispatch({
      type: 'shape.update',
      meta: createMeta('user'),
      payload: { trackId, elementId, shapeId, updates },
      before: { updates: beforeUpdates },
    });
  },

  updateShapeGeometry: (trackId, elementId, shapeId, shapeUpdates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    // Build before from existing shape geometry
    const shapeRecord = shape.shape as unknown as Record<string, unknown>;
    const beforeShape: Partial<Shape> = {};
    const beforeRecord = beforeShape as unknown as Record<string, unknown>;
    for (const key of Object.keys(shapeUpdates)) {
      beforeRecord[key] = shapeRecord[key];
    }

    dispatch({
      type: 'shape.updateGeometry',
      meta: createMeta('user'),
      payload: { trackId, elementId, shapeId, shape: shapeUpdates },
      before: { shape: beforeShape },
    });
  },

  updateShapeStyle: (trackId, elementId, shapeId, styleUpdates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    // Build before from existing style
    const beforeStyle: Partial<ShapeStyle> = {};
    if (styleUpdates.fill) beforeStyle.fill = shape.style.fill;
    if (styleUpdates.stroke) beforeStyle.stroke = shape.style.stroke;
    if (styleUpdates.shadow) beforeStyle.shadow = shape.style.shadow;

    dispatch({
      type: 'shape.updateStyle',
      meta: createMeta('user'),
      payload: { trackId, elementId, shapeId, style: styleUpdates },
      before: { style: beforeStyle },
    });
  },

  toggleShapeVisibility: (trackId, elementId, shapeId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    dispatch({
      type: 'shape.toggle',
      meta: createMeta('user'),
      payload: { trackId, elementId, shapeId, field: 'visible' },
      before: { value: shape.visible },
    });
  },

  toggleShapeLocked: (trackId, elementId, shapeId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    dispatch({
      type: 'shape.toggle',
      meta: createMeta('user'),
      payload: { trackId, elementId, shapeId, field: 'locked' },
      before: { value: shape.locked },
    });
  },

  moveShapeToIndex: (trackId, elementId, shapeId, newIndex) => {
    const { project, dispatch } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const currentIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
    if (currentIndex === -1 || currentIndex === newIndex) return;

    dispatch({
      type: 'shape.reorder',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        shapeId,
        fromIndex: currentIndex,
        toIndex: newIndex,
      },
    });
  },

  moveShapeUp: (trackId, elementId, shapeId) => {
    const { project } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const currentIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
    if (currentIndex === -1 || currentIndex >= shapeElement.shapes.length - 1) return;

    get().moveShapeToIndex(trackId, elementId, shapeId, currentIndex + 1);
  },

  moveShapeDown: (trackId, elementId, shapeId) => {
    const { project } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const currentIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
    if (currentIndex <= 0) return;

    get().moveShapeToIndex(trackId, elementId, shapeId, currentIndex - 1);
  },

  moveShapeToTop: (trackId, elementId, shapeId) => {
    const { project } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    get().moveShapeToIndex(trackId, elementId, shapeId, shapeElement.shapes.length - 1);
  },

  moveShapeToBottom: (trackId, elementId, shapeId) => {
    get().moveShapeToIndex(trackId, elementId, shapeId, 0);
  },

  updateShapeById: (shapeId, updates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const location = findShapeLocation(project, shapeId);
    if (!location) return;

    const shape = location.element.shapes[location.shapeIndex]!;
    const shapeRecord = shape as unknown as Record<string, unknown>;
    const beforeUpdates: Partial<ShapeInstance> = {};
    const beforeRecord = beforeUpdates as unknown as Record<string, unknown>;
    for (const key of Object.keys(updates)) {
      beforeRecord[key] = shapeRecord[key];
    }

    dispatch({
      type: 'shape.update',
      meta: createMeta('user'),
      payload: {
        trackId: location.track.id,
        elementId: location.element.id,
        shapeId,
        updates,
      },
      before: { updates: beforeUpdates },
    });
  },

  removeShapeById: (shapeId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const location = findShapeLocation(project, shapeId);
    if (!location) return;

    const shape = location.element.shapes[location.shapeIndex]!;

    dispatch({
      type: 'shape.remove',
      meta: createMeta('user'),
      payload: {
        trackId: location.track.id,
        elementId: location.element.id,
        shapeId,
      },
      before: {
        shape,
        index: location.shapeIndex,
      },
    });
  },
});
