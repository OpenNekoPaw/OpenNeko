// =============================================================================
// invertOperation — 生成逆操作（纯函数，仅依赖操作自身的 before 数据）
//
// 对称规则：
// - add ↔ remove
// - update 用 before 覆盖
// - reorder 交换 from/to
// - toggle 自身即逆操作
// - batch 逆序 + 逐项 invert
// =============================================================================

import type {
  EditOperation,
  OperationMeta,
  TrackAddOperation,
  TrackRemoveOperation,
  TrackUpdateOperation,
  TrackReorderOperation,
  TrackToggleOperation,
  ElementAddOperation,
  ElementRemoveOperation,
  ElementUpdateOperation,
  ElementMoveOperation,
  ElementToggleOperation,
  ElementLinkAudioOperation,
  ElementUnlinkAudioOperation,
  ElementSplitAtOperation,
  ElementSplitKeepLeftOperation,
  ElementSplitKeepRightOperation,
  ShapeAddElementOperation,
  ShapeAddOperation,
  ShapeRemoveOperation,
  ShapeDuplicateOperation,
  ShapeUpdateOperation,
  ShapeUpdateGeometryOperation,
  ShapeUpdateStyleOperation,
  ShapeToggleOperation,
  ShapeReorderOperation,
  KeyframeAddOperation,
  KeyframeRemoveOperation,
  KeyframeUpdateOperation,
  ClipboardPasteOperation,
  ProjectUpdateOperation,
  BatchOperation,
  // Canvas
  CanvasNodeAddOperation,
  CanvasNodeRemoveOperation,
  CanvasNodeUpdateOperation,
  CanvasNodeReorderOperation,
  CanvasNodeGroupOperation,
  CanvasNodeUngroupOperation,
  CanvasConnectionAddOperation,
  CanvasConnectionRemoveOperation,
  // Sketch
  SketchLayerAddOperation,
  SketchLayerRemoveOperation,
  SketchLayerUpdateOperation,
  SketchLayerMoveOperation,
  SketchLayerDuplicateOperation,
  SketchLayerGroupOperation,
  SketchLayerUngroupOperation,
  SketchStrokeApplyOperation,
  SketchCanvasUpdateOperation,
  // Audio
  AudioEffectAddOperation,
  AudioEffectRemoveOperation,
  AudioEffectUpdateOperation,
  AudioEffectToggleOperation,
  AudioEffectMoveOperation,
  AudioMarkerAddOperation,
  AudioMarkerRemoveOperation,
  AudioMarkerUpdateOperation,
  AudioSetBpmOperation,
  AudioSetTimeSignatureOperation,
  AudioSetMasterVolumeOperation,
  TrackMixOperation,
} from './types';
import { invertTrackMixOperation } from './apply-track-mix';

/**
 * 创建逆操作的 meta（标记来源为 undo）
 */
function invertMeta(meta: OperationMeta): OperationMeta {
  return {
    ...meta,
    id: `inv-${meta.id}`,
    timestamp: Date.now(),
    source: 'undo',
    description: meta.description ? `Undo: ${meta.description}` : undefined,
  };
}

/**
 * 生成操作的逆操作
 *
 * 逆操作利用原操作中的 before 数据，不需要访问 ProjectData。
 * apply(project, op) → newProject
 * apply(newProject, invert(op)) → project（幂等性）
 */
export function invertOperation(op: EditOperation): EditOperation {
  const meta = invertMeta(op.meta);

  switch (op.type) {
    // =========================================================================
    // Track Operations
    // =========================================================================

    case 'track.add': {
      // add → remove（需要知道被添加 track 的信息）
      const addOp = op as TrackAddOperation;
      return {
        type: 'track.remove',
        meta,
        payload: { trackId: addOp.payload.track.id },
        before: {
          track: addOp.payload.track,
          index: addOp.payload.index ?? -1, // -1 表示末尾，apply 时需处理
        },
      };
    }

    case 'track.remove': {
      // remove → add（恢复到原位置）
      const removeOp = op as TrackRemoveOperation;
      return {
        type: 'track.add',
        meta,
        payload: {
          track: removeOp.before.track,
          index: removeOp.before.index,
        },
      };
    }

    case 'track.update': {
      // update → update（用 before 覆盖）
      const updateOp = op as TrackUpdateOperation;
      return {
        type: 'track.update',
        meta,
        payload: {
          trackId: updateOp.payload.trackId,
          updates: updateOp.before.updates,
        },
        before: {
          updates: updateOp.payload.updates,
        },
      };
    }

    case 'track.reorder': {
      // reorder → reorder（交换 from/to）
      const reorderOp = op as TrackReorderOperation;
      return {
        type: 'track.reorder',
        meta,
        payload: {
          trackId: reorderOp.payload.trackId,
          fromIndex: reorderOp.payload.toIndex,
          toIndex: reorderOp.payload.fromIndex,
        },
      };
    }

    case 'track.toggle': {
      // toggle 自身即逆操作
      const toggleOp = op as TrackToggleOperation;
      return {
        type: 'track.toggle',
        meta,
        payload: toggleOp.payload,
        before: { value: !toggleOp.before.value },
      };
    }

    case 'track.mix.setVolume':
    case 'track.mix.setPan':
    case 'track.mix.setSolo':
    case 'track.mix.effect.add':
    case 'track.mix.effect.remove':
    case 'track.mix.effect.update':
    case 'track.mix.effect.move':
    case 'track.mix.setAutomation':
      return invertTrackMixOperation(op as TrackMixOperation, meta);

    // =========================================================================
    // Element Operations
    // =========================================================================

    case 'element.add': {
      const addOp = op as ElementAddOperation;
      return {
        type: 'element.remove',
        meta,
        payload: {
          trackId: addOp.payload.trackId,
          elementId: addOp.payload.element.id,
        },
        before: {
          element: addOp.payload.element,
          index: addOp.payload.index ?? -1,
        },
      };
    }

    case 'element.remove': {
      const removeOp = op as ElementRemoveOperation;
      return {
        type: 'element.add',
        meta,
        payload: {
          trackId: removeOp.payload.trackId,
          element: removeOp.before.element,
          index: removeOp.before.index,
        },
      };
    }

    case 'element.update': {
      const updateOp = op as ElementUpdateOperation;
      return {
        type: 'element.update',
        meta,
        payload: {
          trackId: updateOp.payload.trackId,
          elementId: updateOp.payload.elementId,
          updates: updateOp.before.updates,
        },
        before: {
          updates: updateOp.payload.updates,
        },
      };
    }

    case 'element.move': {
      const moveOp = op as ElementMoveOperation;
      return {
        type: 'element.move',
        meta,
        payload: {
          fromTrackId: moveOp.payload.toTrackId,
          toTrackId: moveOp.payload.fromTrackId,
          elementId: moveOp.payload.elementId,
        },
        before: {
          fromIndex: 0, // 移回时追加到末尾，原始索引已在 before 中
        },
      };
    }

    case 'element.toggle': {
      const toggleOp = op as ElementToggleOperation;
      return {
        type: 'element.toggle',
        meta,
        payload: toggleOp.payload,
        before: { value: !toggleOp.before.value },
      };
    }

    case 'element.linkAudio': {
      // linkAudio → unlinkAudio
      const linkOp = op as ElementLinkAudioOperation;
      return {
        type: 'element.unlinkAudio',
        meta,
        payload: {
          videoTrackId: linkOp.payload.videoTrackId,
          videoElementId: linkOp.payload.videoElementId,
        },
        before: {
          linkedAudioId: linkOp.payload.audioElement.id,
          audioTrackId: linkOp.payload.audioTrackId,
          audioElement: linkOp.payload.audioElement,
          audioTrack: linkOp.payload.audioTrack,
          audioTrackIndex: linkOp.payload.audioTrack
            ? undefined // 新创建的 track 在末尾
            : undefined,
        },
      };
    }

    case 'element.unlinkAudio': {
      // unlinkAudio → linkAudio
      const unlinkOp = op as ElementUnlinkAudioOperation;
      return {
        type: 'element.linkAudio',
        meta,
        payload: {
          videoTrackId: unlinkOp.payload.videoTrackId,
          videoElementId: unlinkOp.payload.videoElementId,
          audioTrackId: unlinkOp.before.audioTrackId,
          audioElement: unlinkOp.before.audioElement,
          audioTrack: unlinkOp.before.audioTrack,
        },
      };
    }

    // =========================================================================
    // Element Split Operations
    // =========================================================================

    case 'element.splitAt': {
      // splitAt 逆操作：删除右半部分 + 恢复左半部分的 trimEnd
      const splitOp = op as ElementSplitAtOperation;
      return {
        type: 'batch',
        meta,
        payload: {
          operations: [
            // 1. 删除右半部分
            {
              type: 'element.remove',
              meta,
              payload: {
                trackId: splitOp.payload.trackId,
                elementId: splitOp.payload.rightElement.id,
              },
              before: {
                element: splitOp.payload.rightElement,
                index: -1,
              },
            } as EditOperation,
            // 2. 恢复左半部分的 trimEnd
            {
              type: 'element.update',
              meta,
              payload: {
                trackId: splitOp.payload.trackId,
                elementId: splitOp.payload.elementId,
                updates: { trimEnd: splitOp.before.trimEnd },
              },
              before: {
                updates: {
                  trimEnd: splitOp.payload.rightElement.duration - splitOp.payload.splitPoint,
                },
              },
            } as EditOperation,
          ],
        },
      };
    }

    case 'element.splitKeepLeft': {
      const splitOp = op as ElementSplitKeepLeftOperation;
      return {
        type: 'element.update',
        meta,
        payload: {
          trackId: splitOp.payload.trackId,
          elementId: splitOp.payload.elementId,
          updates: {
            trimEnd: splitOp.before.trimEnd,
            name: splitOp.before.name,
          },
        },
        before: {
          updates: {
            trimEnd: 0, // 将由 apply 计算
            name: splitOp.payload.newName,
          },
        },
      };
    }

    case 'element.splitKeepRight': {
      const splitOp = op as ElementSplitKeepRightOperation;
      return {
        type: 'element.update',
        meta,
        payload: {
          trackId: splitOp.payload.trackId,
          elementId: splitOp.payload.elementId,
          updates: {
            startTime: splitOp.before.startTime,
            trimStart: splitOp.before.trimStart,
            name: splitOp.before.name,
          },
        },
        before: {
          updates: {
            startTime: splitOp.payload.newStartTime,
            trimStart: splitOp.payload.splitPoint,
            name: splitOp.payload.newName,
          },
        },
      };
    }

    // =========================================================================
    // Shape Operations
    // =========================================================================

    case 'shape.addElement': {
      const addOp = op as ShapeAddElementOperation;
      return {
        type: 'element.remove',
        meta,
        payload: {
          trackId: addOp.payload.trackId,
          elementId: addOp.payload.element.id,
        },
        before: {
          element: addOp.payload.element,
          index: addOp.payload.index ?? -1,
        },
      };
    }

    case 'shape.add': {
      const addOp = op as ShapeAddOperation;
      return {
        type: 'shape.remove',
        meta,
        payload: {
          trackId: addOp.payload.trackId,
          elementId: addOp.payload.elementId,
          shapeId: addOp.payload.shape.id,
        },
        before: {
          shape: addOp.payload.shape,
          index: -1,
        },
      };
    }

    case 'shape.remove': {
      const removeOp = op as ShapeRemoveOperation;
      return {
        type: 'shape.add',
        meta,
        payload: {
          trackId: removeOp.payload.trackId,
          elementId: removeOp.payload.elementId,
          shape: removeOp.before.shape,
          index: removeOp.before.index,
        },
      };
    }

    case 'shape.duplicate': {
      const dupOp = op as ShapeDuplicateOperation;
      return {
        type: 'shape.remove',
        meta,
        payload: {
          trackId: dupOp.payload.trackId,
          elementId: dupOp.payload.elementId,
          shapeId: dupOp.payload.newShape.id,
        },
        before: {
          shape: dupOp.payload.newShape,
          index: -1,
        },
      };
    }

    case 'shape.update': {
      const updateOp = op as ShapeUpdateOperation;
      return {
        type: 'shape.update',
        meta,
        payload: {
          trackId: updateOp.payload.trackId,
          elementId: updateOp.payload.elementId,
          shapeId: updateOp.payload.shapeId,
          updates: updateOp.before.updates,
        },
        before: {
          updates: updateOp.payload.updates,
        },
      };
    }

    case 'shape.updateGeometry': {
      const updateOp = op as ShapeUpdateGeometryOperation;
      return {
        type: 'shape.updateGeometry',
        meta,
        payload: {
          trackId: updateOp.payload.trackId,
          elementId: updateOp.payload.elementId,
          shapeId: updateOp.payload.shapeId,
          shape: updateOp.before.shape,
        },
        before: {
          shape: updateOp.payload.shape,
        },
      };
    }

    case 'shape.updateStyle': {
      const updateOp = op as ShapeUpdateStyleOperation;
      return {
        type: 'shape.updateStyle',
        meta,
        payload: {
          trackId: updateOp.payload.trackId,
          elementId: updateOp.payload.elementId,
          shapeId: updateOp.payload.shapeId,
          style: updateOp.before.style,
        },
        before: {
          style: updateOp.payload.style,
        },
      };
    }

    case 'shape.toggle': {
      const toggleOp = op as ShapeToggleOperation;
      return {
        type: 'shape.toggle',
        meta,
        payload: toggleOp.payload,
        before: { value: !toggleOp.before.value },
      };
    }

    case 'shape.reorder': {
      const reorderOp = op as ShapeReorderOperation;
      return {
        type: 'shape.reorder',
        meta,
        payload: {
          ...reorderOp.payload,
          fromIndex: reorderOp.payload.toIndex,
          toIndex: reorderOp.payload.fromIndex,
        },
      };
    }

    // =========================================================================
    // Keyframe Operations
    // =========================================================================

    case 'keyframe.add': {
      const addOp = op as KeyframeAddOperation;
      return {
        type: 'keyframe.remove',
        meta,
        payload: {
          trackId: addOp.payload.trackId,
          elementId: addOp.payload.elementId,
          target: addOp.payload.target,
          keyframeId: 'id' in addOp.payload.keyframe ? addOp.payload.keyframe.id : undefined,
          keyframeTime: addOp.payload.keyframe.time,
        },
        before: {
          keyframe: addOp.payload.keyframe,
          index: -1,
        },
      };
    }

    case 'keyframe.remove': {
      const removeOp = op as KeyframeRemoveOperation;
      return {
        type: 'keyframe.add',
        meta,
        payload: {
          trackId: removeOp.payload.trackId,
          elementId: removeOp.payload.elementId,
          target: removeOp.payload.target,
          keyframe: removeOp.before.keyframe,
        },
      };
    }

    case 'keyframe.update': {
      const updateOp = op as KeyframeUpdateOperation;
      return {
        type: 'keyframe.update',
        meta,
        payload: {
          trackId: updateOp.payload.trackId,
          elementId: updateOp.payload.elementId,
          target: updateOp.payload.target,
          keyframeId: updateOp.payload.keyframeId,
          keyframeTime: updateOp.payload.keyframeTime,
          updates: updateOp.before.updates,
        },
        before: {
          updates: updateOp.payload.updates,
        },
      };
    }

    // =========================================================================
    // Clipboard Operations
    // =========================================================================

    case 'clipboard.paste': {
      // paste 逆操作：batch 删除所有粘贴的元素（+ 删除新建的 track）
      const pasteOp = op as ClipboardPasteOperation;
      const ops: EditOperation[] = [];

      // 逆序删除
      for (let i = pasteOp.payload.items.length - 1; i >= 0; i--) {
        const item = pasteOp.payload.items[i]!;
        ops.push({
          type: 'element.remove',
          meta,
          payload: {
            trackId: item.trackId,
            elementId: item.element.id,
          },
          before: {
            element: item.element,
            index: -1,
          },
        });
        // 如果创建了新 track，也删除
        if (item.newTrack) {
          ops.push({
            type: 'track.remove',
            meta,
            payload: { trackId: item.newTrack.id },
            before: {
              track: item.newTrack,
              index: -1,
            },
          });
        }
      }

      return {
        type: 'batch',
        meta,
        payload: { operations: ops },
      };
    }

    // =========================================================================
    // Project Operations
    // =========================================================================

    case 'project.update': {
      const updateOp = op as ProjectUpdateOperation;
      return {
        type: 'project.update',
        meta,
        payload: { updates: updateOp.before.updates },
        before: { updates: updateOp.payload.updates },
      };
    }

    // =========================================================================
    // Canvas Operations
    // =========================================================================

    case 'canvas.node.add': {
      const addOp = op as CanvasNodeAddOperation;
      return {
        type: 'canvas.node.remove',
        meta,
        payload: { nodeId: addOp.payload.node.id },
        before: { node: addOp.payload.node, connections: [], index: 0 },
      };
    }

    case 'canvas.node.remove': {
      const removeOp = op as CanvasNodeRemoveOperation;
      return {
        type: 'canvas.node.add',
        meta,
        payload: { node: removeOp.before.node },
      };
    }

    case 'canvas.node.update': {
      const updateOp = op as CanvasNodeUpdateOperation;
      return {
        type: 'canvas.node.update',
        meta,
        payload: { nodeId: updateOp.payload.nodeId, updates: updateOp.before.updates },
        before: { updates: updateOp.payload.updates },
      };
    }

    case 'canvas.node.reorder': {
      const reorderOp = op as CanvasNodeReorderOperation;
      return {
        type: 'canvas.node.reorder',
        meta,
        payload: { nodeId: reorderOp.payload.nodeId, newZIndex: reorderOp.before.oldZIndex },
        before: { oldZIndex: reorderOp.payload.newZIndex },
      };
    }

    case 'canvas.node.group': {
      const groupOp = op as CanvasNodeGroupOperation;
      return {
        type: 'canvas.node.ungroup',
        meta,
        payload: { groupId: groupOp.payload.groupNode.id },
        before: { groupNode: groupOp.payload.groupNode, childIds: groupOp.payload.childIds },
      };
    }

    case 'canvas.node.ungroup': {
      const ungroupOp = op as CanvasNodeUngroupOperation;
      return {
        type: 'canvas.node.group',
        meta,
        payload: { groupNode: ungroupOp.before.groupNode, childIds: ungroupOp.before.childIds },
      };
    }

    case 'canvas.connection.add': {
      const addOp = op as CanvasConnectionAddOperation;
      return {
        type: 'canvas.connection.remove',
        meta,
        payload: { connectionId: addOp.payload.connection.id },
        before: { connection: addOp.payload.connection },
      };
    }

    case 'canvas.connection.remove': {
      const removeOp = op as CanvasConnectionRemoveOperation;
      return {
        type: 'canvas.connection.add',
        meta,
        payload: { connection: removeOp.before.connection },
      };
    }

    // =========================================================================
    // Sketch Operations
    // =========================================================================

    case 'sketch.layer.add': {
      const addOp = op as SketchLayerAddOperation;
      return {
        type: 'sketch.layer.remove',
        meta,
        payload: { layerId: addOp.payload.layer.id },
        before: {
          layer: addOp.payload.layer,
          parentId: addOp.payload.parentId,
          index: addOp.payload.index ?? 0,
        },
      };
    }

    case 'sketch.layer.remove': {
      const removeOp = op as SketchLayerRemoveOperation;
      return {
        type: 'sketch.layer.add',
        meta,
        payload: {
          layer: removeOp.before.layer,
          parentId: removeOp.before.parentId,
          index: removeOp.before.index,
        },
      };
    }

    case 'sketch.layer.update': {
      const updateOp = op as SketchLayerUpdateOperation;
      return {
        type: 'sketch.layer.update',
        meta,
        payload: { layerId: updateOp.payload.layerId, updates: updateOp.before.updates },
        before: { updates: updateOp.payload.updates },
      };
    }

    case 'sketch.layer.move': {
      const moveOp = op as SketchLayerMoveOperation;
      return {
        type: 'sketch.layer.move',
        meta,
        payload: {
          layerId: moveOp.payload.layerId,
          targetParentId: moveOp.before.parentId,
          targetIndex: moveOp.before.index,
        },
        before: { parentId: moveOp.payload.targetParentId, index: moveOp.payload.targetIndex },
      };
    }

    case 'sketch.layer.duplicate': {
      const dupOp = op as SketchLayerDuplicateOperation;
      return {
        type: 'sketch.layer.remove',
        meta,
        payload: { layerId: dupOp.payload.newLayer.id },
        before: { layer: dupOp.payload.newLayer, index: 0 },
      };
    }

    case 'sketch.layer.group': {
      const groupOp = op as SketchLayerGroupOperation;
      return {
        type: 'sketch.layer.ungroup',
        meta,
        payload: { groupId: groupOp.payload.groupLayer.id },
        before: { groupLayer: groupOp.payload.groupLayer, childIds: groupOp.payload.childIds },
      };
    }

    case 'sketch.layer.ungroup': {
      const ungroupOp = op as SketchLayerUngroupOperation;
      return {
        type: 'sketch.layer.group',
        meta,
        payload: { groupLayer: ungroupOp.before.groupLayer, childIds: ungroupOp.before.childIds },
      };
    }

    case 'sketch.stroke.apply': {
      const strokeOp = op as SketchStrokeApplyOperation;
      return {
        type: 'sketch.stroke.apply',
        meta,
        payload: { layerId: strokeOp.payload.layerId, regionAfter: strokeOp.before.regionBefore },
        before: { regionBefore: strokeOp.payload.regionAfter },
      };
    }

    case 'sketch.canvas.update': {
      const updateOp = op as SketchCanvasUpdateOperation;
      return {
        type: 'sketch.canvas.update',
        meta,
        payload: { updates: updateOp.before.updates },
        before: { updates: updateOp.payload.updates },
      };
    }

    // =========================================================================
    // Audio Operations
    // =========================================================================

    case 'audio.effect.add': {
      const addOp = op as AudioEffectAddOperation;
      return {
        type: 'audio.effect.remove',
        meta,
        payload: { effectId: addOp.payload.effect.id },
        before: {
          effect: addOp.payload.effect,
          index: addOp.payload.index ?? -1,
        },
      };
    }

    case 'audio.effect.remove': {
      const removeOp = op as AudioEffectRemoveOperation;
      return {
        type: 'audio.effect.add',
        meta,
        payload: { effect: removeOp.before.effect, index: removeOp.before.index },
      };
    }

    case 'audio.effect.update': {
      const updateOp = op as AudioEffectUpdateOperation;
      return {
        type: 'audio.effect.update',
        meta,
        payload: { effectId: updateOp.payload.effectId, updates: updateOp.before.updates },
        before: { updates: updateOp.payload.updates },
      };
    }

    case 'audio.effect.toggle': {
      const toggleOp = op as AudioEffectToggleOperation;
      return {
        type: 'audio.effect.toggle',
        meta,
        payload: toggleOp.payload,
        before: { value: !toggleOp.before.value },
      };
    }

    case 'audio.effect.move': {
      const moveOp = op as AudioEffectMoveOperation;
      return {
        type: 'audio.effect.move',
        meta,
        payload: {
          effectId: moveOp.payload.effectId,
          fromIndex: moveOp.payload.toIndex,
          toIndex: moveOp.payload.fromIndex,
        },
      };
    }

    case 'audio.setBpm': {
      const bpmOp = op as AudioSetBpmOperation;
      return {
        type: 'audio.setBpm',
        meta,
        payload: bpmOp.before.bpm === undefined ? {} : { bpm: bpmOp.before.bpm },
        before: { bpm: bpmOp.payload.bpm },
      };
    }

    case 'audio.setTimeSignature': {
      const signatureOp = op as AudioSetTimeSignatureOperation;
      return {
        type: 'audio.setTimeSignature',
        meta,
        payload: {
          numerator: signatureOp.before.numerator,
          denominator: signatureOp.before.denominator,
        },
        before: {
          numerator: signatureOp.payload.numerator,
          denominator: signatureOp.payload.denominator,
        },
      };
    }

    case 'audio.setMasterVolume': {
      const volumeOp = op as AudioSetMasterVolumeOperation;
      return {
        type: 'audio.setMasterVolume',
        meta,
        payload:
          volumeOp.before.masterVolume === undefined
            ? {}
            : { masterVolume: volumeOp.before.masterVolume },
        before: { masterVolume: volumeOp.payload.masterVolume },
      };
    }

    case 'audio.marker.add': {
      const addOp = op as AudioMarkerAddOperation;
      return {
        type: 'audio.marker.remove',
        meta,
        payload: { markerId: addOp.payload.marker.id },
        before: { marker: addOp.payload.marker },
      };
    }

    case 'audio.marker.remove': {
      const removeOp = op as AudioMarkerRemoveOperation;
      return {
        type: 'audio.marker.add',
        meta,
        payload: { marker: removeOp.before.marker },
      };
    }

    case 'audio.marker.update': {
      const updateOp = op as AudioMarkerUpdateOperation;
      return {
        type: 'audio.marker.update',
        meta,
        payload: { markerId: updateOp.payload.markerId, updates: updateOp.before.updates },
        before: { updates: updateOp.payload.updates },
      };
    }

    // =========================================================================
    // Batch Operation
    // =========================================================================

    case 'batch': {
      const batchOp = op as BatchOperation;
      return {
        type: 'batch',
        meta,
        payload: {
          operations: [...batchOp.payload.operations].reverse().map(invertOperation),
        },
      };
    }
  }
}
