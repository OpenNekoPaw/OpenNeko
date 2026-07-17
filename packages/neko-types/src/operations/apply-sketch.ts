// =============================================================================
// applySketchOperation — 绘画图层/笔画操作应用
// =============================================================================

import type {
  SketchOperation,
  SketchLayerSnapshot,
  SketchLayerAddOperation,
  SketchLayerRemoveOperation,
  SketchLayerUpdateOperation,
  SketchLayerMoveOperation,
  SketchLayerDuplicateOperation,
  SketchLayerGroupOperation,
  SketchLayerUngroupOperation,
  SketchCanvasUpdateOperation,
} from './types';
import { OperationError } from './errors';

/** Sketch 文档数据结构 */
export interface SketchDocumentData {
  width: number;
  height: number;
  dpi: number;
  backgroundColor: string;
  layers: SketchLayerSnapshot[];
}

// =============================================================================
// 图层树辅助函数
// =============================================================================

/** 在图层树中查找并移除指定图层，返回 [新树, 被移除的图层, 父ID, 索引] */
function removeLayerFromTree(
  layers: SketchLayerSnapshot[],
  layerId: string,
  parentId?: string,
): {
  layers: SketchLayerSnapshot[];
  removed: SketchLayerSnapshot;
  parentId?: string;
  index: number;
} | null {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i]!.id === layerId) {
      const removed = layers[i]!;
      const newLayers = [...layers];
      newLayers.splice(i, 1);
      return { layers: newLayers, removed, parentId, index: i };
    }
    if (layers[i]!.children.length > 0) {
      const result = removeLayerFromTree(layers[i]!.children, layerId, layers[i]!.id);
      if (result) {
        const newLayers = [...layers];
        newLayers[i] = { ...newLayers[i]!, children: result.layers };
        return {
          layers: newLayers,
          removed: result.removed,
          parentId: result.parentId,
          index: result.index,
        };
      }
    }
  }
  return null;
}

/** 在图层树中指定位置插入图层 */
function insertLayerInTree(
  layers: SketchLayerSnapshot[],
  layer: SketchLayerSnapshot,
  parentId?: string,
  index?: number,
): SketchLayerSnapshot[] {
  if (!parentId) {
    const newLayers = [...layers];
    const idx = index ?? newLayers.length;
    newLayers.splice(idx, 0, layer);
    return newLayers;
  }
  return layers.map((l) => {
    if (l.id === parentId) {
      const children = [...l.children];
      const idx = index ?? children.length;
      children.splice(idx, 0, layer);
      return { ...l, children };
    }
    if (l.children.length > 0) {
      return { ...l, children: insertLayerInTree(l.children, layer, parentId, index) };
    }
    return l;
  });
}

/** 在图层树中更新指定图层 */
function updateLayerInTree(
  layers: SketchLayerSnapshot[],
  layerId: string,
  updates: Partial<SketchLayerSnapshot>,
): SketchLayerSnapshot[] {
  return layers.map((l) => {
    if (l.id === layerId) return { ...l, ...updates };
    if (l.children.length > 0) {
      return { ...l, children: updateLayerInTree(l.children, layerId, updates) };
    }
    return l;
  });
}

// =============================================================================
// Apply
// =============================================================================

export function applySketchOperation(
  data: SketchDocumentData,
  op: SketchOperation,
): SketchDocumentData {
  switch (op.type) {
    case 'sketch.layer.add': {
      const addOp = op as SketchLayerAddOperation;
      return {
        ...data,
        layers: insertLayerInTree(
          data.layers,
          addOp.payload.layer,
          addOp.payload.parentId,
          addOp.payload.index,
        ),
      };
    }

    case 'sketch.layer.remove': {
      const removeOp = op as SketchLayerRemoveOperation;
      const result = removeLayerFromTree(data.layers, removeOp.payload.layerId);
      if (!result) throw OperationError.layerNotFound(removeOp.payload.layerId);
      return { ...data, layers: result.layers };
    }

    case 'sketch.layer.update': {
      const updateOp = op as SketchLayerUpdateOperation;
      return {
        ...data,
        layers: updateLayerInTree(data.layers, updateOp.payload.layerId, updateOp.payload.updates),
      };
    }

    case 'sketch.layer.move': {
      const moveOp = op as SketchLayerMoveOperation;
      const removeResult = removeLayerFromTree(data.layers, moveOp.payload.layerId);
      if (!removeResult) throw OperationError.layerNotFound(moveOp.payload.layerId);
      return {
        ...data,
        layers: insertLayerInTree(
          removeResult.layers,
          removeResult.removed,
          moveOp.payload.targetParentId,
          moveOp.payload.targetIndex,
        ),
      };
    }

    case 'sketch.layer.duplicate': {
      const dupOp = op as SketchLayerDuplicateOperation;
      // Insert after source layer at same level
      return { ...data, layers: insertLayerInTree(data.layers, dupOp.payload.newLayer) };
    }

    case 'sketch.layer.group': {
      const groupOp = op as SketchLayerGroupOperation;
      // Remove children from tree, add group node with children
      let layers = data.layers;
      const children: SketchLayerSnapshot[] = [];
      for (const childId of groupOp.payload.childIds) {
        const result = removeLayerFromTree(layers, childId);
        if (result) {
          layers = result.layers;
          children.push(result.removed);
        }
      }
      const groupLayer = { ...groupOp.payload.groupLayer, children };
      return { ...data, layers: insertLayerInTree(layers, groupLayer) };
    }

    case 'sketch.layer.ungroup': {
      const ungroupOp = op as SketchLayerUngroupOperation;
      const result = removeLayerFromTree(data.layers, ungroupOp.payload.groupId);
      if (!result) throw OperationError.layerNotFound(ungroupOp.payload.groupId);
      // Insert children at group's position
      let layers = result.layers;
      for (let i = 0; i < result.removed.children.length; i++) {
        layers = insertLayerInTree(
          layers,
          result.removed.children[i]!,
          result.parentId,
          result.index + i,
        );
      }
      return { ...data, layers };
    }

    case 'sketch.stroke.apply': {
      // Stroke apply is a pixel-level operation — the actual pixel data is handled
      // by the WebGL renderer. This operation is recorded for undo/redo tracking only.
      // The apply function returns data unchanged; the webview applies pixels directly.
      return data;
    }

    case 'sketch.canvas.update': {
      const updateOp = op as SketchCanvasUpdateOperation;
      return { ...data, ...updateOp.payload.updates };
    }

    default:
      throw OperationError.invalidOperation(
        `Unknown sketch operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}
