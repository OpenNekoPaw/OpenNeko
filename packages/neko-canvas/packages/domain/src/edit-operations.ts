import type { CanvasConnection, CanvasNode } from '@neko/shared';

export type CanvasOperationSource = 'user' | 'ai' | 'system' | 'undo' | 'redo';

export interface CanvasOperationMeta {
  readonly id: string;
  readonly timestamp: number;
  readonly source: CanvasOperationSource;
  readonly description?: string;
}

export type CanvasEditOperation =
  | {
      readonly type: 'canvas.node.add';
      readonly meta: CanvasOperationMeta;
      readonly payload: { readonly node: CanvasNode };
    }
  | {
      readonly type: 'canvas.node.remove';
      readonly meta: CanvasOperationMeta;
      readonly payload: { readonly nodeId: string };
      readonly before: {
        readonly node: CanvasNode;
        readonly connections: readonly CanvasConnection[];
        readonly index: number;
      };
    }
  | CanvasNodeUpdateOperation
  | {
      readonly type: 'canvas.node.reorder';
      readonly meta: CanvasOperationMeta;
      readonly payload: { readonly nodeId: string; readonly newZIndex: number };
      readonly before: { readonly oldZIndex: number };
    }
  | {
      readonly type: 'canvas.node.group';
      readonly meta: CanvasOperationMeta;
      readonly payload: {
        readonly groupNode: CanvasNode;
        readonly childIds: readonly string[];
      };
    }
  | {
      readonly type: 'canvas.node.ungroup';
      readonly meta: CanvasOperationMeta;
      readonly payload: { readonly groupId: string };
      readonly before: {
        readonly groupNode: CanvasNode;
        readonly childIds: readonly string[];
      };
    }
  | {
      readonly type: 'canvas.connection.add';
      readonly meta: CanvasOperationMeta;
      readonly payload: { readonly connection: CanvasConnection };
    }
  | {
      readonly type: 'canvas.connection.remove';
      readonly meta: CanvasOperationMeta;
      readonly payload: { readonly connectionId: string };
      readonly before: { readonly connection: CanvasConnection };
    }
  | CanvasBatchOperation;

export interface CanvasNodeUpdateOperation {
  readonly type: 'canvas.node.update';
  readonly meta: CanvasOperationMeta;
  readonly payload: {
    readonly nodeId: string;
    readonly updates: Partial<Omit<CanvasNode, 'id' | 'type'>>;
  };
  readonly before: {
    readonly updates: Partial<Omit<CanvasNode, 'id' | 'type'>>;
  };
}

export interface CanvasBatchOperation {
  readonly type: 'batch';
  readonly meta: CanvasOperationMeta;
  readonly payload: { readonly operations: readonly CanvasEditOperation[] };
}
