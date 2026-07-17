// =============================================================================
// applyCanvasOperation — 画布节点/连线操作应用
// =============================================================================

import type {
  CanvasOperation,
  CanvasNodeAddOperation,
  CanvasNodeRemoveOperation,
  CanvasNodeUpdateOperation,
  CanvasNodeReorderOperation,
  CanvasNodeGroupOperation,
  CanvasNodeUngroupOperation,
  CanvasConnectionAddOperation,
  CanvasConnectionRemoveOperation,
} from './types';
import type { CanvasData, CanvasNode } from '../types/canvas';
import { OperationError } from './errors';

export function applyCanvasOperation(data: CanvasData, op: CanvasOperation): CanvasData {
  switch (op.type) {
    case 'canvas.node.add': {
      const addOp = op as CanvasNodeAddOperation;
      return { ...data, nodes: [...data.nodes, addOp.payload.node] };
    }

    case 'canvas.node.remove': {
      const removeOp = op as CanvasNodeRemoveOperation;
      const nodeId = removeOp.payload.nodeId;
      return {
        ...data,
        nodes: data.nodes.filter((n) => n.id !== nodeId),
        connections: data.connections.filter((c) => c.sourceId !== nodeId && c.targetId !== nodeId),
      };
    }

    case 'canvas.node.update': {
      const updateOp = op as CanvasNodeUpdateOperation;
      const nodes = data.nodes.map((n) =>
        n.id === updateOp.payload.nodeId
          ? ({ ...n, ...updateOp.payload.updates } as CanvasNode)
          : n,
      );
      return { ...data, nodes };
    }

    case 'canvas.node.reorder': {
      const reorderOp = op as CanvasNodeReorderOperation;
      const nodes = data.nodes.map((n) =>
        n.id === reorderOp.payload.nodeId
          ? ({ ...n, zIndex: reorderOp.payload.newZIndex } as CanvasNode)
          : n,
      );
      return { ...data, nodes };
    }

    case 'canvas.node.group': {
      const groupOp = op as CanvasNodeGroupOperation;
      // Add group node, update children's parent reference if needed
      return { ...data, nodes: [...data.nodes, groupOp.payload.groupNode] };
    }

    case 'canvas.node.ungroup': {
      const ungroupOp = op as CanvasNodeUngroupOperation;
      return {
        ...data,
        nodes: data.nodes.filter((n) => n.id !== ungroupOp.payload.groupId),
      };
    }

    case 'canvas.connection.add': {
      const addOp = op as CanvasConnectionAddOperation;
      return { ...data, connections: [...data.connections, addOp.payload.connection] };
    }

    case 'canvas.connection.remove': {
      const removeOp = op as CanvasConnectionRemoveOperation;
      return {
        ...data,
        connections: data.connections.filter((c) => c.id !== removeOp.payload.connectionId),
      };
    }

    default:
      throw OperationError.invalidOperation(
        `Unknown canvas operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}
