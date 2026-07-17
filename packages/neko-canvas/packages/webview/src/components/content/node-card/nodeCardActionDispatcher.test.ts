import { describe, expect, it, vi } from 'vitest';
import type { CanvasConnection, CanvasData, CanvasNode } from '@neko/shared';
import {
  CONTAINER_ACTION_DISPATCHER,
  NODE_CARD_ACTION_DISPATCHER,
  type ContainerActionContext,
  type NodeCardActionContext,
} from './index';
import type { CanvasStore } from '../../../stores/canvasStore';
import type { ClipboardStore } from '../../../stores/clipboardStore';
import type { HistoryStore } from '../../../stores/historyStore';

describe('node card action dispatcher', () => {
  it('removes a child through parent-scoped container removal', () => {
    const canvasStore = createCanvasStore();
    const ctx = createNodeActionContext({
      node: createNode('shot-1', 'shot'),
      parentNodeId: 'scene-1',
      canvasStore,
    });

    NODE_CARD_ACTION_DISPATCHER.remove(ctx);

    expect(canvasStore.removeChildFromContainer).toHaveBeenCalledWith('scene-1', 'shot-1');
  });

  it('opens media preview only when an asset path exists', () => {
    const postMessage = vi.fn();

    NODE_CARD_ACTION_DISPATCHER['open-media-preview'](
      createNodeActionContext({
        node: createNode('media-1', 'media', { assetPath: 'assets/ref.png', mediaType: 'image' }),
        postMessage,
      }),
    );
    NODE_CARD_ACTION_DISPATCHER['open-media-preview'](
      createNodeActionContext({
        node: createNode('empty-media', 'media', { assetPath: '' }),
        postMessage,
      }),
    );

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'openMediaPreview',
      assetPath: 'assets/ref.png',
      nodeId: 'media-1',
      mediaType: 'image',
    });
  });

  it('passes document resource refs when opening document-linked media', () => {
    const postMessage = vi.fn();
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'image/page-1.jpg',
      versionPolicy: 'versioned-export' as const,
    };

    NODE_CARD_ACTION_DISPATCHER['open-media-preview'](
      createNodeActionContext({
        node: createNode('media-doc', 'media', {
          assetPath: '',
          runtimeAssetPath: 'https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg',
          mediaType: 'image',
          documentResourceRef,
        }),
        postMessage,
      }),
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'openMediaPreview',
      assetPath: 'https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg',
      nodeId: 'media-doc',
      mediaType: 'image',
      documentResourceRef,
    });
  });

  it('passes unified resource refs when opening resource-linked media', () => {
    const postMessage = vi.fn();
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'image/page-1.jpg',
      versionPolicy: 'versioned-export' as const,
    };
    const resourceRef = {
      id: 'res_page_1',
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source: { kind: 'document' as const, filePath: '${BOOKS}/comic.epub' },
      locator: { kind: 'document' as const, entryPath: 'image/page-1.jpg' },
      fingerprint: { strategy: 'provider' as const, value: 'page-1' },
    };

    NODE_CARD_ACTION_DISPATCHER['open-media-preview'](
      createNodeActionContext({
        node: createNode('media-doc', 'media', {
          assetPath: '',
          runtimeAssetPath: 'https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg',
          mediaType: 'image',
          documentResourceRef,
          resourceRef,
        }),
        postMessage,
      }),
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'openMediaPreview',
      assetPath: 'https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg',
      nodeId: 'media-doc',
      mediaType: 'image',
      documentResourceRef,
      resourceRef,
    });
  });

  it('dispatches image edit and AssetLibrary promotion with stable material identity', () => {
    const postMessage = vi.fn();
    const node = createNode('media-1', 'media', {
      assetPath: 'assets/ref.png',
      mediaType: 'image',
    });
    const ctx = createNodeActionContext({ node, postMessage });

    NODE_CARD_ACTION_DISPATCHER['edit-media'](ctx);
    NODE_CARD_ACTION_DISPATCHER['save-to-asset-library'](ctx);

    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'editCanvasImage',
      nodeId: 'media-1',
      assetPath: 'assets/ref.png',
      mediaType: 'image',
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'saveCanvasMaterialToAssetLibrary',
      nodeId: 'media-1',
      assetPath: 'assets/ref.png',
      mediaType: 'image',
    });
  });

  it('duplicates by using clipboard, history, canvas data write, and selection flow', () => {
    const source = createNode('shot-1', 'shot');
    const duplicate = createNode('shot-2', 'shot');
    const canvasData = createCanvasData([source], []);
    const canvasStore = createCanvasStore(canvasData);
    const historyStore = createHistoryStore();
    const clipboardStore = createClipboardStore({ nodes: [duplicate], connections: [] });

    NODE_CARD_ACTION_DISPATCHER.duplicate(
      createNodeActionContext({
        node: source,
        canvasStore,
        historyStore,
        clipboardStore,
      }),
    );

    expect(clipboardStore.duplicate).toHaveBeenCalledWith(['shot-1'], [source], []);
    expect(historyStore.pushState).toHaveBeenCalledWith(canvasData);
    expect(canvasStore.setCanvasData).toHaveBeenCalledWith({
      ...canvasData,
      nodes: [source, duplicate],
      connections: [],
    });
    expect(canvasStore.selectNodes).toHaveBeenCalledWith(['shot-2']);
  });
});

describe('container action dispatcher', () => {
  it('assigns selected shot children through scene action context', () => {
    const scene = createNode('scene-1', 'scene');
    const shot = createNode('shot-1', 'shot');
    const canvasStore = createCanvasStore(createCanvasData([scene, shot], []));

    CONTAINER_ACTION_DISPATCHER['assign-selected-children'](
      createContainerActionContext({
        node: scene,
        canvasStore,
        selection: { nodeIds: ['shot-1'] },
      }),
    );

    expect(canvasStore.assignShotsToScene).toHaveBeenCalledWith('scene-1', ['shot-1'], true);
  });

  it('sends existing batch generate payload', () => {
    const postMessage = vi.fn();
    const scene = createNode('scene-1', 'scene');
    const shot = createNode('shot-1', 'shot');

    CONTAINER_ACTION_DISPATCHER['batch-generate'](
      createContainerActionContext({
        node: scene,
        childNodes: [shot],
        postMessage,
      }),
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'sendToAgent',
      nodeIds: ['shot-1'],
      action: 'batch',
    });
  });

  it('updates table row and column data through typed actions', () => {
    const table = createNode('table-1', 'table', { rowCount: 2, columnCount: 3 });
    const canvasStore = createCanvasStore(createCanvasData([table], []));
    const ctx = createContainerActionContext({ node: table, canvasStore });

    CONTAINER_ACTION_DISPATCHER['add-row'](ctx);
    CONTAINER_ACTION_DISPATCHER['remove-column'](ctx);

    expect(canvasStore.updateNodeData).toHaveBeenCalledWith('table-1', {
      rowCount: 3,
      columnCount: 3,
    });
    expect(canvasStore.updateNodeData).toHaveBeenCalledWith('table-1', {
      rowCount: 2,
      columnCount: 2,
    });
  });
});

function createNode(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown> = {},
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 80 },
    zIndex: 1,
    data,
  } as CanvasNode;
}

function createCanvasData(nodes: CanvasNode[], connections: CanvasConnection[]): CanvasData {
  return {
    version: '1.0',
    name: 'Test',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes,
    connections,
  };
}

function createNodeActionContext(
  overrides: Partial<NodeCardActionContext> & { node: CanvasNode },
): NodeCardActionContext {
  return {
    nodeId: overrides.node.id,
    node: overrides.node,
    parentNodeId: overrides.parentNodeId,
    canvasStore: overrides.canvasStore ?? createCanvasStore(),
    historyStore: overrides.historyStore ?? createHistoryStore(),
    clipboardStore: overrides.clipboardStore ?? createClipboardStore(null),
    postMessage: overrides.postMessage ?? vi.fn(),
  };
}

function createContainerActionContext(
  overrides: Partial<ContainerActionContext> & { node: CanvasNode },
): ContainerActionContext {
  return {
    containerId: overrides.node.id,
    node: overrides.node,
    childNodes: overrides.childNodes ?? [],
    selection: overrides.selection ?? { nodeIds: [] },
    canvasStore: overrides.canvasStore ?? createCanvasStore(),
    postMessage: overrides.postMessage ?? vi.fn(),
  };
}

function createCanvasStore(canvasData: CanvasData | null = null): CanvasStore {
  return {
    canvasData,
    selection: { nodeIds: [], connectionIds: [] },
    isConnecting: false,
    pendingConnectionSource: null,
    activePlayingNodeId: null,
    expandedNodeId: null,
    generationPanelState: { visible: false, nodeId: null },
    contentOverlayState: { visible: false, nodeId: null },
    openGenerationPanel: vi.fn(),
    closeGenerationPanel: vi.fn(),
    openContentOverlay: vi.fn(),
    closeContentOverlay: vi.fn(),
    setCanvasData: vi.fn(),
    updateCanvasData: vi.fn(),
    setPlaybackEntry: vi.fn(),
    addNode: vi.fn(),
    addNodes: vi.fn(),
    updateNode: vi.fn(),
    updateNodeData: vi.fn(),
    removeNode: vi.fn(),
    moveNodeEnd: vi.fn(),
    resizeNodeEnd: vi.fn(),
    rotateNodeEnd: vi.fn(),
    assignShotsToScene: vi.fn(),
    reorderSceneShots: vi.fn(),
    autoLayoutSceneShots: vi.fn(),
    detachShotFromScene: vi.fn(),
    updateNodePorts: vi.fn(),
    reorderNode: vi.fn(),
    removeChildFromContainer: vi.fn(),
    groupNodes: vi.fn(),
    ungroupNodes: vi.fn(),
    arrangeGroup: vi.fn(),
    fitGroupToContent: vi.fn(),
    setGroupCollapsed: vi.fn(),
    addConnection: vi.fn(),
    updateConnection: vi.fn(),
    removeConnection: vi.fn(),
    startConnection: vi.fn(),
    completeConnection: vi.fn(),
    cancelConnection: vi.fn(),
    deriveSuccessorNode: vi.fn(),
    deriveNode: vi.fn(),
    createComposite: vi.fn(),
    updateBlock: vi.fn(),
    extractStructuredContent: vi.fn(),
    applyAgentContent: vi.fn(),
    upsertNarrativeProductionBinding: vi.fn(),
    selectNode: vi.fn(),
    selectConnection: vi.fn(),
    selectNodes: vi.fn(),
    clearSelection: vi.fn(),
    deleteSelected: vi.fn(),
    setActivePlayingNode: vi.fn(),
    setExpandedNodeId: vi.fn(),
    toggleExpandedNode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  };
}

function createHistoryStore(): HistoryStore {
  return {
    undoStack: [],
    redoStack: [],
    maxHistory: 50,
    canUndo: vi.fn(),
    canRedo: vi.fn(),
    pushState: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
  };
}

function createClipboardStore(
  duplicateResult: { nodes: CanvasNode[]; connections: CanvasConnection[] } | null,
): ClipboardStore {
  return {
    clipboard: null,
    canPaste: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    duplicate: vi.fn(() => duplicateResult),
    clear: vi.fn(),
  };
}
