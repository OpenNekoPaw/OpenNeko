// =============================================================================
// Helpers — 不可变更新辅助函数
// =============================================================================

import type { TimelineTrack } from '../types/timelineTrack';
import type { TimelineElement } from '../types/element';
import type { ShapeInstance } from '../types/shape';
import type { WebviewElement } from './webview-types';
import type { OperationMeta, OperationSource } from './types';
import { OperationError } from './errors';

// =============================================================================
// HasTracks — 泛型约束，任何包含 tracks 字段的数据结构
// =============================================================================

/** Any retained data structure that contains a timeline tracks array. */
export interface HasTracks {
  tracks: TimelineTrack[];
}

/**
 * 创建操作元数据
 */
export function createMeta(source: OperationSource = 'user', description?: string): OperationMeta {
  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    source,
    description,
  };
}

/**
 * 查找 track，找不到则抛出 OperationError
 */
export function findTrack<T extends HasTracks>(
  data: T,
  trackId: string,
): { track: TimelineTrack; index: number } {
  const index = data.tracks.findIndex((t) => t.id === trackId);
  if (index === -1) throw OperationError.trackNotFound(trackId);
  return { track: data.tracks[index]!, index };
}

/**
 * 查找 element，找不到则抛出 OperationError
 */
export function findElement(
  track: TimelineTrack,
  elementId: string,
): { element: TimelineElement; index: number } {
  const index = track.elements.findIndex((e) => e.id === elementId);
  if (index === -1) throw OperationError.elementNotFound(elementId, track.id);
  return { element: track.elements[index]!, index };
}

/**
 * 在 shapes 数组中查找 shape（WebviewShapeElement 扩展字段）
 */
export function findShape(
  shapes: ShapeInstance[],
  shapeId: string,
): { shape: ShapeInstance; index: number } {
  const index = shapes.findIndex((s) => s.id === shapeId);
  if (index === -1) throw OperationError.shapeNotFound(shapeId);
  return { shape: shapes[index]!, index };
}

/**
 * 不可变更新 track — 返回新数据。
 */
export function updateTrackInProject<T extends HasTracks>(
  data: T,
  trackId: string,
  updater: (track: TimelineTrack) => TimelineTrack,
): T {
  const { index } = findTrack(data, trackId);
  const newTracks = [...data.tracks];
  newTracks[index] = updater(newTracks[index]!);
  return { ...data, tracks: newTracks };
}

/**
 * 不可变更新 element — 返回新数据。
 */
export function updateElementInProject<T extends HasTracks>(
  data: T,
  trackId: string,
  elementId: string,
  updater: (element: TimelineElement) => TimelineElement,
): T {
  return updateTrackInProject(data, trackId, (track) => {
    const { index } = findElement(track, elementId);
    const newElements = [...track.elements];
    newElements[index] = updater(newElements[index]!);
    return { ...track, elements: newElements };
  });
}

/**
 * 不可变更新 shape — 返回新数据
 * 注意：shapes 是 WebviewShapeElement 的 UI 扩展字段
 */
export function updateShapeInProject<T extends HasTracks>(
  data: T,
  trackId: string,
  elementId: string,
  shapeId: string,
  updater: (shape: ShapeInstance) => ShapeInstance,
): T {
  return updateElementInProject(data, trackId, elementId, (element) => {
    const shapes: ShapeInstance[] = (element as WebviewElement).shapes ?? [];
    const { index } = findShape(shapes, shapeId);
    const newShapes = [...shapes];
    newShapes[index] = updater(newShapes[index]!);
    return { ...element, shapes: newShapes } as WebviewElement;
  });
}

/**
 * 获取 element 的 shapes 数组（安全访问）
 */
export function getShapes(element: TimelineElement): ShapeInstance[] {
  return (element as WebviewElement).shapes ?? [];
}

/**
 * 设置 element 的 shapes 数组
 */
export function setShapes(element: TimelineElement, shapes: ShapeInstance[]): TimelineElement {
  return { ...element, shapes } as WebviewElement;
}

/**
 * 提取对象中指定 keys 的子集（用于构建 before 快照）
 */
export function pickKeys<T extends Record<string, unknown>>(
  obj: T,
  updates: Partial<T>,
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(updates) as Array<keyof T>) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * 数组 splice 移动（不可变）
 */
export function arrayMove<T>(arr: readonly T[], fromIndex: number, toIndex: number): T[] {
  const result = [...arr];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item!);
  return result;
}
