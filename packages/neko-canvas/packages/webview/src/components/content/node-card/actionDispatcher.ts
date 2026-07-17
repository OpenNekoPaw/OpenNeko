import type {
  ContainerActionDispatcher,
  ContainerActionId,
  NodeCardActionDispatcher,
  NodeCardActionId,
} from './types';
import {
  readDocumentPath,
  readDocumentResourceRef,
  readRecord,
  readRenderableAssetPath,
  readResourceRef,
  readString,
} from './utils';

export const NODE_CARD_ACTION_DISPATCHER: NodeCardActionDispatcher = {
  remove: (ctx) => {
    if (!ctx.parentNodeId) {
      return;
    }
    ctx.canvasStore.removeChildFromContainer(ctx.parentNodeId, ctx.nodeId);
  },

  generate: (ctx) => {
    const prompt = readString(ctx.node.data, 'visualDescription') ?? '';
    ctx.canvasStore.openGenerationPanel(ctx.nodeId, ctx.parentNodeId, prompt);
  },

  'open-media-preview': (ctx) => {
    const assetPath = readRenderableAssetPath(ctx.node);
    if (!assetPath) {
      return;
    }
    const documentResourceRef = readDocumentResourceRef(ctx.node);
    const resourceRef = readResourceRef(ctx.node);

    ctx.postMessage({
      type: 'openMediaPreview',
      assetPath,
      mediaType: readString(ctx.node.data, 'mediaType'),
      ...(documentResourceRef ? { documentResourceRef } : {}),
      ...(resourceRef ? { resourceRef } : {}),
    });
  },

  'open-content-overlay': (ctx) => {
    ctx.canvasStore.openContentOverlay(ctx.nodeId);
  },

  edit: (ctx) => {
    ctx.canvasStore.selectNodes([ctx.nodeId]);
  },

  duplicate: (ctx) => {
    const canvasData = ctx.canvasStore.canvasData;
    if (!canvasData) {
      return;
    }

    const result = ctx.clipboardStore.duplicate(
      [ctx.nodeId],
      canvasData.nodes,
      canvasData.connections,
    );
    if (!result) {
      return;
    }

    ctx.historyStore.pushState(canvasData);
    ctx.canvasStore.setCanvasData({
      ...canvasData,
      nodes: [...canvasData.nodes, ...result.nodes],
      connections: [...canvasData.connections, ...result.connections],
    });
    ctx.canvasStore.selectNodes(result.nodes.map((node) => node.id));
  },

  'open-in-editor': (ctx) => {
    const docPath = readDocumentPath(ctx.node);
    if (!docPath) {
      return;
    }

    ctx.postMessage({ type: 'openDocument', docPath });
  },
};

export const CONTAINER_ACTION_DISPATCHER: ContainerActionDispatcher = {
  'assign-selected-children': (ctx) => {
    const assignableIds = ctx.selection.nodeIds.filter((nodeId) => nodeId !== ctx.containerId);
    if (assignableIds.length === 0) {
      return;
    }

    switch (ctx.node.type) {
      case 'scene': {
        const shotIds = assignableIds.filter((nodeId) =>
          ctx.canvasStore.canvasData?.nodes.some(
            (node) => node.id === nodeId && node.type === 'shot',
          ),
        );
        if (shotIds.length > 0) {
          ctx.canvasStore.assignShotsToScene(ctx.containerId, shotIds, true);
        }
        return;
      }
      default:
        return;
    }
  },

  'auto-layout': (ctx) => {
    if (ctx.node.type === 'scene') {
      ctx.canvasStore.autoLayoutSceneShots(ctx.containerId);
    }
  },

  'batch-generate': (ctx) => {
    if (ctx.childNodes.length === 0) {
      return;
    }

    ctx.postMessage({
      type: 'sendToAgent',
      nodeIds: ctx.childNodes.map((node) => node.id),
      action: 'batch',
    });
  },

  'add-row': (ctx) => {
    updateTableDimension(ctx, 'rowCount', 1);
  },

  'add-column': (ctx) => {
    updateTableDimension(ctx, 'columnCount', 1);
  },

  'remove-row': (ctx) => {
    updateTableDimension(ctx, 'rowCount', -1);
  },

  'remove-column': (ctx) => {
    updateTableDimension(ctx, 'columnCount', -1);
  },
  'arrange-stable': (ctx) => ctx.canvasStore.arrangeGroup(ctx.containerId, 'stable'),
  'arrange-name': (ctx) => ctx.canvasStore.arrangeGroup(ctx.containerId, 'name'),
  'arrange-type': (ctx) => ctx.canvasStore.arrangeGroup(ctx.containerId, 'type'),
  'arrange-created': (ctx) => ctx.canvasStore.arrangeGroup(ctx.containerId, 'created'),
  'fit-to-content': (ctx) => ctx.canvasStore.fitGroupToContent(ctx.containerId),
  'collapse-group': (ctx) => ctx.canvasStore.setGroupCollapsed(ctx.containerId, true),
  'expand-group': (ctx) => ctx.canvasStore.setGroupCollapsed(ctx.containerId, false),
};

export function dispatchNodeCardAction(
  dispatcher: NodeCardActionDispatcher,
  actionId: NodeCardActionId,
  ctx: Parameters<NodeCardActionDispatcher[NodeCardActionId]>[0],
): void {
  dispatcher[actionId](ctx);
}

export function dispatchContainerAction(
  dispatcher: ContainerActionDispatcher,
  actionId: ContainerActionId,
  ctx: Parameters<ContainerActionDispatcher[ContainerActionId]>[0],
): void {
  dispatcher[actionId](ctx);
}

function updateTableDimension(
  ctx: Parameters<ContainerActionDispatcher['add-row']>[0],
  key: 'rowCount' | 'columnCount',
  delta: number,
): void {
  if (ctx.node.type !== 'table') {
    return;
  }

  const data = readRecord(ctx.node.data);
  const current = typeof data[key] === 'number' ? data[key] : 1;
  const nextValue = Math.max(1, current + delta);
  if (nextValue === current) {
    return;
  }

  // updateNodeData records history inside canvasStore; pushing here would duplicate undo entries.
  ctx.canvasStore.updateNodeData(ctx.node.id, {
    ...data,
    [key]: nextValue,
  });
}
