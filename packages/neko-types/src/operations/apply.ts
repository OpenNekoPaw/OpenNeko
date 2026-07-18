// =============================================================================
// applyOperation — 操作应用入口
// =============================================================================

import type { ProjectData } from '../types/project';
import type { CanvasData } from '../types/canvas';
import type {
  EditOperation,
  ClipboardPasteOperation,
  ProjectUpdateOperation,
  BatchOperation,
  CanvasOperation,
} from './types';
import { applyTrackOperation } from './apply-track';
import { applyElementOperation, applyElementSplitOperation } from './apply-element';
import { applyShapeOperation } from './apply-shape';
import { applyKeyframeOperation } from './apply-keyframe';
import { applyCanvasOperation } from './apply-canvas';
import { updateTrackInProject } from './helpers';
import { OperationError } from './errors';

/**
 * 将 EditOperation 应用到数据，返回新数据（不可变）
 *
 * 支持 ProjectData（neko-cut）和 CanvasData（neko-canvas）。
 *
 * @throws OperationError 当目标不存在或操作无效时
 */
export function applyOperation(data: ProjectData, op: EditOperation): ProjectData;
export function applyOperation(data: CanvasData, op: CanvasOperation): CanvasData;
export function applyOperation(data: unknown, op: EditOperation): unknown {
  switch (op.type) {
    // Track operations
    case 'track.add':
    case 'track.remove':
    case 'track.update':
    case 'track.reorder':
    case 'track.toggle':
      return applyTrackOperation(data as ProjectData, op);

    // Element operations
    case 'element.add':
    case 'element.remove':
    case 'element.update':
    case 'element.move':
    case 'element.toggle':
    case 'element.linkAudio':
    case 'element.unlinkAudio':
      return applyElementOperation(data as ProjectData, op);

    // Element split operations
    case 'element.splitAt':
    case 'element.splitKeepLeft':
    case 'element.splitKeepRight':
      return applyElementSplitOperation(data as ProjectData, op);

    // Shape operations
    case 'shape.addElement':
    case 'shape.add':
    case 'shape.remove':
    case 'shape.duplicate':
    case 'shape.update':
    case 'shape.updateGeometry':
    case 'shape.updateStyle':
    case 'shape.toggle':
    case 'shape.reorder':
      return applyShapeOperation(data as ProjectData, op);

    // Keyframe operations
    case 'keyframe.add':
    case 'keyframe.remove':
    case 'keyframe.update':
      return applyKeyframeOperation(data as ProjectData, op);

    // Clipboard paste
    case 'clipboard.paste':
      return applyClipboardPaste(data as ProjectData, op);

    // Project update
    case 'project.update':
      return applyProjectUpdate(data as ProjectData, op);

    // Canvas operations
    case 'canvas.node.add':
    case 'canvas.node.remove':
    case 'canvas.node.update':
    case 'canvas.node.reorder':
    case 'canvas.node.group':
    case 'canvas.node.ungroup':
    case 'canvas.connection.add':
    case 'canvas.connection.remove':
      return applyCanvasOperation(data as CanvasData, op);

    // Batch
    case 'batch':
      return applyBatch(data, op);

    default:
      throw OperationError.invalidOperation(
        `Unknown operation type: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}

function applyClipboardPaste(project: ProjectData, op: ClipboardPasteOperation): ProjectData {
  let result = project;
  for (const item of op.payload.items) {
    // 如果需要创建新 track
    if (item.newTrack) {
      result = { ...result, tracks: [...result.tracks, item.newTrack] };
    }
    // 添加元素到 track
    result = updateTrackInProject(result, item.trackId, (track) => ({
      ...track,
      elements: [...track.elements, item.element],
    }));
  }
  return result;
}

function applyProjectUpdate(project: ProjectData, op: ProjectUpdateOperation): ProjectData {
  return { ...project, ...op.payload.updates };
}

function applyBatch(data: unknown, op: BatchOperation): unknown {
  return op.payload.operations.reduce(
    (current, childOp) => applyOperation(current as unknown as ProjectData, childOp),
    data,
  );
}
