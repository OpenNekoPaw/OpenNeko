/**
 * Canvas Operation Bridge — 在 canvasStore 操作时生成 EditOperation
 *
 * 桥接层：在 canvasStore mutation 时生成 EditOperation 并同步到 Extension。
 * 保持现有 historyStore 快照式 undo/redo 不变，同时为 dirty 标记和 AI/source 标注提供统一协议。
 */

import { create } from 'zustand';
import type { CanvasNode, CanvasConnection, CanvasNodeUpdateOperation } from '@neko/shared';
import type { EditOperation, OperationMeta, OperationSource } from '@neko/shared';
import { getGlobalVSCodeApi } from '../utils/vscode';

// =============================================================================
// Extension Sync
// =============================================================================

function postMessage(message: Record<string, unknown>): void {
  const vscode = getGlobalVSCodeApi();
  if (vscode) {
    vscode.postMessage(message);
  }
}

function syncOperationToExtension(op: EditOperation): void {
  postMessage({ type: 'operationApplied', operation: op });
}

// =============================================================================
// Meta Helper
// =============================================================================

let counter = 0;

function createMeta(source: OperationSource = 'user', description?: string): OperationMeta {
  return {
    id: `canvas-op-${Date.now()}-${++counter}`,
    timestamp: Date.now(),
    source,
    description,
  };
}

// =============================================================================
// Store
// =============================================================================

export interface CanvasOperationStore {
  operationSourceOverride: OperationSource | null;

  /** 记录操作（由 canvasStore 的 action 调用） */
  recordOperation: (op: EditOperation) => void;
  /** Temporarily override operation source within a synchronous mutation boundary */
  withOperationSource: <T>(source: OperationSource, run: () => T) => T;

  // =========================================================================
  // Convenience builders — 构建 CanvasOperation 并记录
  // =========================================================================

  recordNodeAdd: (node: CanvasNode) => void;
  recordNodeRemove: (nodeId: string, node: CanvasNode, connections: CanvasConnection[]) => void;
  recordNodeUpdate: (
    nodeId: string,
    updates: CanvasNodeUpdateOperation['payload']['updates'],
    before: CanvasNodeUpdateOperation['before']['updates'],
  ) => void;
  recordNodeReorder: (nodeId: string, newZIndex: number, oldZIndex: number) => void;
  recordNodeGroup: (groupNode: CanvasNode, childIds: string[]) => void;
  recordNodeUngroup: (groupId: string, groupNode: CanvasNode, childIds: string[]) => void;
  recordConnectionAdd: (connection: CanvasConnection) => void;
  recordConnectionRemove: (connectionId: string, connection: CanvasConnection) => void;
  recordDirty: (description: string) => void;
}

export const useCanvasOperationStore = create<CanvasOperationStore>((set, get) => ({
  operationSourceOverride: null,

  recordOperation: (op) => {
    const { operationSourceOverride } = get();
    const nextOperation = operationSourceOverride
      ? {
          ...op,
          meta: {
            ...op.meta,
            source: operationSourceOverride,
          },
        }
      : op;
    syncOperationToExtension(nextOperation);
  },

  withOperationSource: (source, run) => {
    const previous = get().operationSourceOverride;
    set({ operationSourceOverride: source });
    try {
      return run();
    } finally {
      set({ operationSourceOverride: previous });
    }
  },

  recordNodeAdd: (node) => {
    get().recordOperation({
      type: 'canvas.node.add',
      meta: createMeta('user', `Add node: ${node.type}`),
      payload: { node },
    });
  },

  recordNodeRemove: (nodeId, node, connections) => {
    const index = 0; // index not critical for audit
    get().recordOperation({
      type: 'canvas.node.remove',
      meta: createMeta('user', `Remove node: ${node.type}`),
      payload: { nodeId },
      before: { node, connections, index },
    });
  },

  recordNodeUpdate: (nodeId, updates, before) => {
    get().recordOperation({
      type: 'canvas.node.update',
      meta: createMeta('user', 'Update node'),
      payload: { nodeId, updates },
      before: { updates: before },
    });
  },

  recordNodeReorder: (nodeId, newZIndex, oldZIndex) => {
    get().recordOperation({
      type: 'canvas.node.reorder',
      meta: createMeta('user', 'Reorder node'),
      payload: { nodeId, newZIndex },
      before: { oldZIndex },
    });
  },

  recordNodeGroup: (groupNode, childIds) => {
    get().recordOperation({
      type: 'canvas.node.group',
      meta: createMeta('user', 'Group nodes'),
      payload: { groupNode, childIds },
    });
  },

  recordNodeUngroup: (groupId, groupNode, childIds) => {
    get().recordOperation({
      type: 'canvas.node.ungroup',
      meta: createMeta('user', 'Ungroup nodes'),
      payload: { groupId },
      before: { groupNode, childIds },
    });
  },

  recordConnectionAdd: (connection) => {
    get().recordOperation({
      type: 'canvas.connection.add',
      meta: createMeta('user', 'Add connection'),
      payload: { connection },
    });
  },

  recordConnectionRemove: (connectionId, connection) => {
    get().recordOperation({
      type: 'canvas.connection.remove',
      meta: createMeta('user', 'Remove connection'),
      payload: { connectionId },
      before: { connection },
    });
  },

  recordDirty: (description) => {
    get().recordOperation({
      type: 'batch',
      meta: createMeta('user', description),
      payload: { operations: [] },
    });
  },
}));
