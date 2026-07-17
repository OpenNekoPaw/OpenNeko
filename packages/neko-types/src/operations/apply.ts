// =============================================================================
// applyOperation — 操作应用入口
// =============================================================================

import type { ProjectData } from '../types/project';
import type { CanvasData } from '../types/canvas';
import type {
  EditOperation,
  TrackOperation,
  ElementOperation,
  ElementSplitOperation,
  ClipboardPasteOperation,
  ProjectUpdateOperation,
  BatchOperation,
  CanvasOperation,
  SketchOperation,
  AudioOperation,
  TrackMixOperation,
} from './types';
import { applyTrackOperation } from './apply-track';
import { applyElementOperation, applyElementSplitOperation } from './apply-element';
import { applyShapeOperation } from './apply-shape';
import { applyKeyframeOperation } from './apply-keyframe';
import { applyCanvasOperation } from './apply-canvas';
import { applySketchOperation, type SketchDocumentData } from './apply-sketch';
import { applyAudioOperation, type AudioProjectData } from './apply-audio';
import { applyTrackMixOperation } from './apply-track-mix';
import { updateTrackInProject } from './helpers';
import { OperationError } from './errors';

/**
 * 将 EditOperation 应用到数据，返回新数据（不可变）
 *
 * 支持 ProjectData（neko-cut）、CanvasData（neko-canvas）、
 * SketchDocumentData（neko-sketch）、AudioProjectData（neko-audio）
 *
 * AudioProjectData 支持 TrackOperation / ElementOperation / AudioOperation
 *
 * @throws OperationError 当目标不存在或操作无效时
 */
export function applyOperation(data: ProjectData, op: EditOperation): ProjectData;
export function applyOperation(data: CanvasData, op: CanvasOperation): CanvasData;
export function applyOperation(data: SketchDocumentData, op: SketchOperation): SketchDocumentData;
export function applyOperation(
  data: AudioProjectData,
  op:
    | AudioOperation
    | TrackMixOperation
    | TrackOperation
    | ElementOperation
    | ElementSplitOperation
    | BatchOperation,
): AudioProjectData;
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

    // Sketch operations
    case 'sketch.layer.add':
    case 'sketch.layer.remove':
    case 'sketch.layer.update':
    case 'sketch.layer.move':
    case 'sketch.layer.duplicate':
    case 'sketch.layer.group':
    case 'sketch.layer.ungroup':
    case 'sketch.stroke.apply':
    case 'sketch.canvas.update':
      return applySketchOperation(data as SketchDocumentData, op);

    // Audio operations
    case 'audio.effect.add':
    case 'audio.effect.remove':
    case 'audio.effect.update':
    case 'audio.effect.toggle':
    case 'audio.effect.move':
    case 'audio.marker.add':
    case 'audio.marker.remove':
    case 'audio.marker.update':
    case 'audio.setBpm':
    case 'audio.setTimeSignature':
    case 'audio.setMasterVolume':
      return applyAudioOperation(data as AudioProjectData, op);

    // Track mix operations
    case 'track.mix.setVolume':
    case 'track.mix.setPan':
    case 'track.mix.setSolo':
    case 'track.mix.effect.add':
    case 'track.mix.effect.remove':
    case 'track.mix.effect.update':
    case 'track.mix.effect.move':
    case 'track.mix.setAutomation':
      return applyTrackMixOperation(data as AudioProjectData, op);

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
