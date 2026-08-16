import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  getKeyboardBoundaryMetadata,
  useFocusedWebviewRoot,
  useReportWebviewKeyboardEditable,
  useReportWebviewKeyboardFocus,
} from '@neko/ui/keyboard';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import {
  resolveCanvasGenerationNodeDefaultSize,
  validateCanvasBoardRef,
} from '@neko/canvas-domain';
import type { CanvasDroppedAsset, ProjectedCanvasStatus } from '@neko/canvas-domain';
import type { ContentLocator } from '@neko/content';
import type {
  CanvasBoardNavigationDiagnostic,
  CanvasBoardRef,
  CanvasConnection,
  CanvasData,
  CanvasViewport,
} from '@neko/canvas-domain';
import { createCanvasAgentActiveContext } from './utils/canvasAgentOperations';
import {
  useCanvasStoreApi,
  usePlaybackStoreApi,
  useScopedCanvasStore as useCanvasStore,
  useScopedPlaybackStore as usePlaybackStore,
  useScopedRuntimeViewportStore as useRuntimeViewportStore,
} from './stores/canvasStoreScope';
import { InfiniteCanvas, ZoomControls, MiniMap } from './components';
import { ContextMenu } from './components/common/ContextMenu';
import { CanvasToolbar } from './components/toolbar/CanvasToolbar';
import { PlaybackWorkspace } from './components/playback/PlaybackWorkspace';
import { MIN_ZOOM, MAX_ZOOM } from './hooks';
import { useCanvasHostMessages } from './hooks/useCanvasHostMessages';
import { useNodeHelpers } from './hooks/useNodeHelpers';
import { useClipboard } from './hooks/useClipboard';
import {
  useCanvasKeyboardController,
  type CanvasKeyboardState,
} from './hooks/useCanvasKeyboardController';
import { useKeyboardActions } from './hooks/useKeyboardActions';
import {
  createCanvasProjectSourceAddClient,
  type CanvasProjectSourceAddClient,
} from './hooks/useDragDrop';
import { useDragDrop } from './hooks/useDragDrop';
import { useContextMenu } from './hooks/useContextMenu';
import { useThrottledCanvasViewport } from './hooks/useThrottledCanvasViewport';
import { buildCanvasNode } from './utils/nodeFactory';
import {
  getCanvasAddAction,
  type CanvasAddActionId,
  type CanvasAddSourceModeId,
} from './utils/canvasAddActions';
import type { CanvasWebviewHostPort } from './host-runtime';
import { DEFAULT_RUNTIME_VIEWPORT } from './stores/runtimeViewportStore';
import {
  screenToCanvas as screenToCanvasMath,
  getViewportCenter as getViewportCenterMath,
} from './utils/viewportMath';
import {
  createViewportSnapshotPolicy,
  type ViewportSnapshotPolicy,
} from './utils/viewportSnapshotPolicy';
import {
  createCanvasViewportSnapshotKey,
  readCanvasViewportSnapshot,
  writeCanvasViewportSnapshot,
} from './utils/viewportWebviewState';
import { resolveCanvasRenderRefreshDecision } from './utils/renderRefreshTiering';
import { t } from './i18n';
import { getLogger } from './utils/logger';
import type { CanvasConnectionMutationResult } from './utils/canvasConnectionAuthoring';
import { centerNodeAt } from './utils/nodeSizing';
import { findFreePosition } from './utils/containerLayout';

// =============================================================================
// Constants & Host API
// =============================================================================

const DEFAULT_CANVAS_DATA: CanvasData = {
  name: 'Untitled Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [],
  connections: [],
};

const logger = getLogger('CanvasApp');

// =============================================================================
// Component
// =============================================================================

/**
 * Canvas App - Main application component (orchestrator)
 */
export interface CanvasAppProps {
  readonly host: CanvasWebviewHostPort;
}

export function CanvasApp({ host: hostPort }: CanvasAppProps) {
  const canOpenHostExport = hostPort.supportsMessage('canvasAction');
  const canOpenHostPlayback = hostPort.supportsMessage('preview:resolveResource');
  const canOpenBoardRef = hostPort.supportsMessage('openCanvasBoardRef');
  const canvasStoreApi = useCanvasStoreApi();
  const playbackStoreApi = usePlaybackStoreApi();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [canvasContainerElement, setCanvasContainerElement] = useState<HTMLDivElement | null>(null);

  // Interaction tool: select/marquee by default, hand tool pans on drag.
  const [interactionTool, setInteractionTool] = useState<'select' | 'pan'>('select');
  const [isSpacePanActive, setIsSpacePanActive] = useState(false);
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const isHudVisible = true;
  const isGridVisible = true;
  // Minimap width tracks ZoomControls width for alignment
  const zoomControlsRef = useRef<HTMLDivElement | null>(null);
  const [zoomControlsElement, setZoomControlsElement] = useState<HTMLDivElement | null>(null);
  const [miniMapWidth, setMiniMapWidth] = useState(200);
  const handleFullscreenPreviewOpenChange = useCallback((open: boolean) => {
    setIsFullscreenPreviewOpen(open);
    if (open) setIsSpacePanActive(false);
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const { isKeyboardFocused, isKeyboardFocusedRef, setKeyboardFocused } = useFocusedWebviewRoot(
    rootRef,
    hostPort ? false : true,
  );
  useReportWebviewKeyboardFocus(rootRef, hostPort);
  useReportWebviewKeyboardEditable(hostPort);

  const canvasData = useCanvasStore((state) => state.canvasData);
  const selection = useCanvasStore((state) => state.selection);
  const setCanvasData = useCanvasStore((state) => state.setCanvasData);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const selectConnection = useCanvasStore((state) => state.selectConnection);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const addNode = useCanvasStore((state) => state.addNode);
  const updateConnection = useCanvasStore((state) => state.updateConnection);
  const deleteSelected = useCanvasStore((state) => state.deleteSelected);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const moveNodeEnd = useCanvasStore((state) => state.moveNodeEnd);
  const resizeNodeEnd = useCanvasStore((state) => state.resizeNodeEnd);
  const rotateNodeEnd = useCanvasStore((state) => state.rotateNodeEnd);
  const selectNodes = useCanvasStore((state) => state.selectNodes);
  const groupNodes = useCanvasStore((state) => state.groupNodes);
  const ungroupNodes = useCanvasStore((state) => state.ungroupNodes);
  const playbackWorkspaceVisible = usePlaybackStore((state) => state.playbackSession.visible);
  const revealPlaybackWorkspace = usePlaybackStore((state) => state.revealPlaybackWorkspace);
  const hidePlaybackWorkspace = usePlaybackStore((state) => state.hidePlaybackWorkspace);
  const viewport = useRuntimeViewportStore((state) => state.viewport);
  const setViewport = useRuntimeViewportStore((state) => state.setViewport);
  const zoomCanvas = useRuntimeViewportStore((state) => state.zoomCanvas);
  const resetViewport = useRuntimeViewportStore((state) => state.resetViewport);
  const seedViewportFromDocument = useRuntimeViewportStore(
    (state) => state.seedViewportFromDocument,
  );
  const viewportSnapshotPolicyRef = useRef<ViewportSnapshotPolicy | null>(null);
  const canvasProjectSourceAddClientRef = useRef<CanvasProjectSourceAddClient | null>(null);

  // Derive computed values from canvasData
  const nodes = canvasData?.nodes ?? [];
  const connections = canvasData?.connections ?? [];
  const hasCanvasData = canvasData !== null;
  const selectedNodeIds = selection.nodeIds;
  const selectedConnectionIds = selection.connectionIds;
  const isPanMode = interactionTool === 'pan';
  const setCanvasContainerRef = useCallback((element: HTMLDivElement | null) => {
    canvasContainerRef.current = element;
    setCanvasContainerElement(element);
  }, []);
  const setZoomControlsRef = useCallback((element: HTMLDivElement | null) => {
    zoomControlsRef.current = element;
    setZoomControlsElement(element);
  }, []);
  const togglePanMode = useCallback(
    () => setInteractionTool((tool) => (tool === 'pan' ? 'select' : 'pan')),
    [],
  );
  const selectInteractionTool = useCallback(() => setInteractionTool('select'), []);
  const handleZoomIn = useCallback(() => {
    zoomCanvas(Math.min(viewport.zoom * 1.2, MAX_ZOOM));
  }, [viewport.zoom, zoomCanvas]);
  const handleZoomOut = useCallback(() => {
    zoomCanvas(Math.max(viewport.zoom / 1.2, MIN_ZOOM));
  }, [viewport.zoom, zoomCanvas]);
  const nodeTypeSummary = useMemo(
    () =>
      nodes.reduce<Record<string, number>>((summary, node) => {
        summary[node.type] = (summary[node.type] ?? 0) + 1;
        return summary;
      }, {}),
    [nodes],
  );

  // =========================================================================
  // Container size tracking  (moved after useCanvasHostMessages — see below)
  // =========================================================================

  // =========================================================================
  // Coordinate conversion (wrapping pure utils with container ref)
  // =========================================================================

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const container = canvasContainerRef.current;
      if (!container) return { x: 0, y: 0 };
      return screenToCanvasMath(screenX, screenY, viewport, container.getBoundingClientRect());
    },
    [viewport],
  );

  const getViewportCenter = useCallback(
    () => getViewportCenterMath(containerSize.width, containerSize.height, viewport),
    [containerSize, viewport],
  );

  // =========================================================================
  // Report action to extension
  // =========================================================================

  const reportAction = useCallback(
    (action: string, label: string, detail?: string, data?: unknown) => {
      if (!hostPort) return;
      hostPort.postMessage({ type: 'canvasAction', action, label, detail, data });
    },
    [],
  );

  const isComposingRef = useRef(false);
  const projectionRequestIdRef = useRef(0);
  const projectionResolversRef = useRef(
    new Map<
      number,
      {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
      }
    >(),
  );

  const requestProjectionWriteBack = useCallback(
    (changes: unknown[]): Promise<unknown> => {
      if (!hostPort || !canvasData?.projected) {
        return Promise.reject(new Error('Projected Canvas is not active'));
      }
      const source = (canvasData as { projectionSource?: unknown }).projectionSource;
      const requestId = ++projectionRequestIdRef.current;
      return new Promise((resolve, reject) => {
        projectionResolversRef.current.set(requestId, { resolve, reject });
        hostPort.postMessage({
          type: 'projection.writeBack',
          _requestId: requestId,
          source,
          changes,
        });
        setTimeout(() => {
          const pending = projectionResolversRef.current.get(requestId);
          if (pending) {
            projectionResolversRef.current.delete(requestId);
            pending.reject(new Error('Projection write-back timeout'));
          }
        }, 30000);
      });
    },
    [canvasData],
  );

  // =========================================================================
  // Node helpers
  // =========================================================================

  const { addImportedMarkdownAt, addMediaAt, addFileAt, addCanvasEmbedAt } = useNodeHelpers({
    addNode,
    nodeCount: nodes.length,
    reportAction,
  });

  // =========================================================================
  // Clipboard
  // =========================================================================

  const { handleCopy, handleCut, handlePaste, handlePasteInPlace, handleDuplicate } = useClipboard({
    selectedNodeIds,
    nodes,
    connections,
    deleteSelected,
  });

  const handleDropAssets = useCallback(
    (assets: CanvasDroppedAsset[], position?: { x: number; y: number }) => {
      const pos = position ?? dropPositionRef.current ?? getViewportCenter();
      assets.forEach((asset, i) => {
        const offset = i * 30;
        const dropPos = { x: pos.x + offset, y: pos.y + offset };
        switch (asset.kind) {
          case 'media':
            addMediaAt(dropPos, asset.mediaType, asset.path, asset.name, {
              contentLocator: asset.contentLocator,
              ...(asset.runtimeAssetPath ? { runtimeAssetPath: asset.runtimeAssetPath } : {}),
            });
            break;
          case 'text':
            addImportedMarkdownAt(dropPos, asset);
            break;
          case 'file':
            addFileAt(dropPos, asset.path, asset.title, asset.contentLocator);
            break;
          case 'canvas':
            addCanvasEmbedAt(dropPos, asset.path, asset.title);
            break;
        }
      });
      dropPositionRef.current = null;
    },
    [addCanvasEmbedAt, addFileAt, addImportedMarkdownAt, addMediaAt, getViewportCenter],
  );

  const getCanvasProjectSourceAddClient = useCallback(() => {
    if (!hostPort) return null;
    const existing = canvasProjectSourceAddClientRef.current;
    if (existing) return existing;
    const client = createCanvasProjectSourceAddClient(hostPort);
    canvasProjectSourceAddClientRef.current = client;
    return client;
  }, []);

  const requestCanvasFilePickerSource = useCallback(
    (
      actionId: CanvasAddActionId,
      sourceMode: Exclude<CanvasAddSourceModeId, 'create'>,
      position: { x: number; y: number },
    ) => {
      const action = getCanvasAddAction(actionId);
      if (action.mode !== 'source') {
        throw new Error(`Canvas add action "${actionId}" does not bind a source`);
      }
      if (!action.sourceKind) {
        throw new Error(`Canvas source action "${actionId}" has no source kind`);
      }
      void hostPort
        .requestSource(action.sourceKind, sourceMode, position)
        .catch((error: unknown) => {
          logger.warn('Canvas file-picker add-source failed', error);
        });
    },
    [hostPort],
  );

  const addActionAt = useCallback(
    (
      actionId: CanvasAddActionId,
      position: { x: number; y: number },
      sourceMode?: CanvasAddSourceModeId,
    ) => {
      const action = getCanvasAddAction(actionId);
      if (action.mode === 'generation') {
        if (!action.generationKind) {
          throw new Error(`Canvas generation action "${actionId}" has no Generation kind`);
        }
        const nodeSize = resolveCanvasGenerationNodeDefaultSize(action.generationKind);
        const preferredPosition = centerNodeAt(position, nodeSize);
        const nodePosition = findFreePosition({
          preferred: {
            x: Math.round(preferredPosition.x / 20) * 20,
            y: Math.round(preferredPosition.y / 20) * 20,
          },
          size: nodeSize,
          nodes: canvasData?.nodes ?? [],
        });
        void hostPort
          .createGenerationNode(action.generationKind, nodePosition)
          .catch((error: unknown) => {
            logger.warn('Canvas Generation node creation failed', error);
          });
        return;
      }
      if (action.mode === 'source') {
        if (!sourceMode) {
          throw new Error(`Canvas source action "${actionId}" requires an explicit source mode`);
        }
        if (!action.sourceKind) {
          throw new Error(`Canvas source action "${actionId}" has no source kind`);
        }
        if (sourceMode === 'create')
          throw new Error('Source actions cannot create Generation Nodes.');
        requestCanvasFilePickerSource(actionId, sourceMode, position);
        return;
      }
      throw new Error(`Direct creation is not supported for Canvas action "${action.id}"`);
    },
    [canvasData?.nodes, requestCanvasFilePickerSource, hostPort],
  );

  const handleSelectAddAction = useCallback(
    (actionId: CanvasAddActionId, sourceMode?: CanvasAddSourceModeId) => {
      addActionAt(actionId, getViewportCenter(), sourceMode);
    },
    [addActionAt, getViewportCenter],
  );
  const authoringCapabilities = hostPort.getAuthoringCapabilities();
  const availableGenerationKinds = authoringCapabilities.generationKinds;

  // =========================================================================
  // Drag & Drop
  // =========================================================================

  const {
    isDragOver,
    dropPositionRef,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useDragDrop({
    hostPort,
    screenToCanvas,
    addMediaAt,
    onDropAssets: handleDropAssets,
    addSourceClient: getCanvasProjectSourceAddClient() ?? undefined,
    projectContent: hostPort.projectContent,
  });

  // =========================================================================
  // Host messages
  // =========================================================================

  const { isReady, loadDiagnostic, keyboardActionRef } = useCanvasHostMessages({
    hostPort,
    defaultCanvasData: DEFAULT_CANVAS_DATA,
    setCanvasData,
    onRevealPlaybackWorkspace: ({ routeId, currentUnitId }) => {
      revealPlaybackWorkspace({
        routeId,
        currentUnitId,
        focusOwner: 'preview',
      });
    },
    onCanvasDataLoaded: (data) => {
      const documentKey = createCanvasViewportSnapshotKey(hostPort.documentId);
      seedViewportFromDocument(
        documentKey,
        readCanvasViewportSnapshot(hostPort, documentKey) ??
          data.viewport ??
          DEFAULT_RUNTIME_VIEWPORT,
      );
    },
    onHostPresentation: (presentation) => {
      setViewport(presentation.viewport);
      selectNodes([...presentation.selectedNodeIds]);
    },
    onProjectionStatus: (status: ProjectedCanvasStatus) => {
      const state = canvasStoreApi.getState();
      if (!state.canvasData) return;
      state.updateCanvasData(
        {
          projectionStatus: {
            ...((state.canvasData as { projectionStatus?: ProjectedCanvasStatus })
              .projectionStatus ?? { state: 'clean' }),
            ...status,
          },
        } as Partial<CanvasData>,
        { dirty: false },
      );
    },
    onProjectionSourceChanged: () => {
      const state = canvasStoreApi.getState();
      if (!state.canvasData?.projected) return;
      state.updateCanvasData(
        {
          projectionStatus: {
            ...((state.canvasData as { projectionStatus?: ProjectedCanvasStatus })
              .projectionStatus ?? { state: 'clean' }),
            state: 'source-changed',
            updatedAt: Date.now(),
          },
        } as Partial<CanvasData>,
        { dirty: false },
      );
    },
    onKeyboardFocusChange: setKeyboardFocused,
    isKeyboardFocusedRef,
    isComposingRef,
    getNodes: (type) => {
      const allNodes = canvasStoreApi.getState().canvasData?.nodes ?? [];
      return type ? allNodes.filter((n) => n.type === type) : allNodes;
    },
    getNode: (id) => canvasStoreApi.getState().canvasData?.nodes.find((n) => n.id === id),
    updateNode: (id, data) => canvasStoreApi.getState().updateNodeData(id, data),
    createNode: (nodeSpec) => {
      const currentNodes = canvasStoreApi.getState().canvasData?.nodes ?? [];
      const node = buildCanvasNode({
        type: nodeSpec.type,
        position: nodeSpec.position,
        data: nodeSpec.data,
        zIndex: currentNodes.length,
      });
      return canvasStoreApi.getState().addNode(node);
    },
    deriveNode: (request) => canvasStoreApi.getState().deriveNode(request),
    createConnection: (request) => {
      if (!request.sourceId || !request.targetId) {
        throw new Error('Connection sourceId and targetId are required');
      }
      const result = canvasStoreApi.getState().addConnection({
        sourceId: request.sourceId,
        targetId: request.targetId,
        type: request.type ?? 'reference',
        ...(request.label ? { label: request.label } : {}),
        sourceEndpoint: request.sourceEndpoint ?? { nodeId: request.sourceId, scope: 'node' },
        targetEndpoint: request.targetEndpoint ?? { nodeId: request.targetId, scope: 'node' },
      });
      if (!result.ok) {
        throw new Error(`Canvas connection rejected: ${result.reason}`);
      }
      const connectionId = result.connectionId;
      const connection = canvasStoreApi
        .getState()
        .canvasData?.connections.find((item) => item.id === connectionId);
      return { connectionId, connection };
    },
    createComposite: (request) => canvasStoreApi.getState().createComposite(request),
    reorderGroupChildren: (groupId, childIds, autoLayout) =>
      canvasStoreApi.getState().reorderGroupChildren(groupId, childIds, autoLayout),
    updateBlock: (request) => canvasStoreApi.getState().updateBlock(request),
    extractStructuredContent: (request) =>
      canvasStoreApi.getState().extractStructuredContent(request),
    getActiveContext: (request) => {
      const state = canvasStoreApi.getState();
      return createCanvasAgentActiveContext({
        nodes: state.canvasData?.nodes ?? [],
        connections: state.canvasData?.connections ?? [],
        canvasData: state.canvasData
          ? {
              name: state.canvasData.name,
              creativeScope: state.canvasData.creativeScope,
              relatedBoards: state.canvasData.relatedBoards,
            }
          : undefined,
        selectedNodeIds: state.selection.nodeIds,
        viewport: state.canvasData?.viewport,
        insertionPoint: getViewportCenter(),
        request,
      });
    },
    applyAgentContent: (payload) => canvasStoreApi.getState().applyAgentContent(payload),
  });

  // =========================================================================
  // Container size tracking
  // Must be after useCanvasHostMessages so isReady is available.
  // The playback workspace can hide and remount the canvas pane, so observers
  // follow the actual DOM elements rather than only the initial ready state.
  // =========================================================================

  useEffect(() => {
    const container = canvasContainerElement;
    if (!container) {
      setContainerSize({ width: 0, height: 0 });
      return;
    }
    const updateSize = () => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [canvasContainerElement]);

  // Track ZoomControls width so MiniMap stays aligned
  useEffect(() => {
    if (!isHudVisible) return;
    const el = zoomControlsElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setMiniMapWidth(el.offsetWidth));
    ro.observe(el);
    setMiniMapWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [isHudVisible, zoomControlsElement]);

  const minimapRefreshDecision = useMemo(
    () =>
      resolveCanvasRenderRefreshDecision({
        nodes,
        connections,
        phase: isHudVisible ? 'fast-viewport' : 'idle',
      }),
    [connections, isHudVisible, nodes],
  );
  const minimapViewport = useThrottledCanvasViewport(viewport, {
    enabled: minimapRefreshDecision.shouldThrottleViewportProjection,
    intervalMs: 100,
  });

  const handleDocumentOpen = useCallback(
    (locator: ContentLocator) => {
      void hostPort.previewResource(locator);
    },
    [hostPort],
  );

  const handleCanvasEmbedOpen = useCallback(
    (canvasPath: string) => {
      void hostPort.previewResource({ kind: 'workspace-file', path: canvasPath });
    },
    [hostPort],
  );

  const handleCanvasBoardRefOpen = useCallback(
    (ref: CanvasBoardRef) => {
      hostPort.postMessage({ type: 'openCanvasBoardRef', ref });
    },
    [hostPort],
  );

  // =========================================================================
  // Context menu
  // =========================================================================

  const handleGroup = useCallback(() => {
    if (selectedNodeIds.length >= 2) {
      groupNodes(selectedNodeIds);
    }
  }, [selectedNodeIds, groupNodes]);

  const handleUngroup = useCallback(() => {
    if (selectedNodeIds.length === 1) {
      ungroupNodes(selectedNodeIds[0]!);
    }
  }, [selectedNodeIds, ungroupNodes]);

  const { contextMenu, setContextMenu, handleContextMenu, closeContextMenu } = useContextMenu({
    selectedNodeIds,
    nodes,
    screenToCanvas,
    addActionAt,
    handleFitContent,
    handleResetViewport,
    handlePaste,
    handlePasteInPlace,
    handleGroup,
    handleUngroup,
    undo,
    redo,
  });

  // =========================================================================
  // Keyboard actions
  // =========================================================================

  const { handleKeyboardAction } = useKeyboardActions({
    hostPort,
    selectedNodeIds,
    selectedConnectionIds,
    nodes,
    contextMenu,
    setContextMenu: () => setContextMenu(null),
    selectNode,
    selectConnection,
    deleteSelected,
    clearSelection,
    resetViewport,
    undo,
    redo,
    handleCopy,
    handleCut,
    handlePaste,
    handlePasteInPlace,
    handleDuplicate,
    reportAction,
    isKeyboardFocusedRef,
    isComposingRef,
  });

  const keyboardState = useMemo<CanvasKeyboardState>(
    () => ({
      canGroupSelection: selectedNodeIds.length >= 2,
      canUngroupSelection:
        selectedNodeIds.length === 1 &&
        nodes.some((node) => node.id === selectedNodeIds[0] && node.type === 'group'),
      canDeleteSelection: selectedNodeIds.length > 0 || selectedConnectionIds.length > 0,
      hasNodes: nodes.length > 0,
      isKeyboardFocused,
      isModalPreviewOpen: isFullscreenPreviewOpen,
    }),
    [isFullscreenPreviewOpen, isKeyboardFocused, nodes, selectedConnectionIds, selectedNodeIds],
  );

  useCanvasKeyboardController({
    state: keyboardState,
    onDeleteSelected: () => handleKeyboardAction('deleteSelected'),
    onEscape: () => handleKeyboardAction('escape'),
    onSelectAll: () => handleKeyboardAction('selectAll'),
    onUndo: () => handleKeyboardAction('undo'),
    onRedo: () => handleKeyboardAction('redo'),
    onSave: () => hostPort?.postMessage({ type: 'requestSave' }),
    onCopy: () => handleKeyboardAction('copy'),
    onCut: () => handleKeyboardAction('cut'),
    onPaste: () => handleKeyboardAction('paste'),
    onPasteInPlace: () => handleKeyboardAction('pasteInPlace'),
    onDuplicate: () => handleKeyboardAction('duplicate'),
    onGroup: handleGroup,
    onSelectMode: selectInteractionTool,
    onSpacePanStart: () => setIsSpacePanActive(true),
    onSpacePanEnd: () => setIsSpacePanActive(false),
    onTogglePanMode: togglePanMode,
    onUngroup: handleUngroup,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
  });

  // Keep ref in sync with latest handler (for Host message dispatch)
  keyboardActionRef.current = isFullscreenPreviewOpen ? () => undefined : handleKeyboardAction;

  useEffect(() => {
    if (!hasCanvasData) {
      viewportSnapshotPolicyRef.current?.cancel();
      viewportSnapshotPolicyRef.current = null;
      return;
    }

    const documentKey = createCanvasViewportSnapshotKey(hostPort.documentId);
    viewportSnapshotPolicyRef.current?.cancel();
    viewportSnapshotPolicyRef.current = createViewportSnapshotPolicy({
      writer: {
        writeSnapshot: (snapshot) => writeCanvasViewportSnapshot(hostPort, documentKey, snapshot),
      },
    });

    return () => {
      viewportSnapshotPolicyRef.current?.flush('close');
      viewportSnapshotPolicyRef.current = null;
    };
  }, [hasCanvasData, hostPort]);

  useEffect(() => {
    viewportSnapshotPolicyRef.current?.schedule(viewport);
  }, [viewport]);

  useEffect(() => {
    if (!hostPort) return;
    const flushViewportSnapshot = () => viewportSnapshotPolicyRef.current?.flush('blur');
    window.addEventListener('blur', flushViewportSnapshot);
    return () => window.removeEventListener('blur', flushViewportSnapshot);
  }, [hostPort]);

  // =========================================================================
  // Sync status to extension
  // =========================================================================

  const lastSyncRef = useRef<string>('');
  useEffect(() => {
    if (!hostPort) return;
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as { type?: unknown; _requestId?: unknown; error?: unknown };
      if (message.type !== '_response' || typeof message._requestId !== 'number') return;
      const pending = projectionResolversRef.current.get(message._requestId);
      if (!pending) return;
      projectionResolversRef.current.delete(message._requestId);
      if (typeof message.error === 'string') {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(event.data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useLayoutEffect(() => {
    if (!hostPort || !canvasData) return;
    const projectionStatus = (canvasData as { projectionStatus?: ProjectedCanvasStatus })
      .projectionStatus;
    const canvasSnapshotFingerprint = JSON.stringify({
      name: canvasData.name,
      nodes: canvasData.nodes,
      connections: canvasData.connections,
    });
    const fingerprint = `${canvasSnapshotFingerprint}:${selectedNodeIds.join(',')}:${projectionStatus?.state ?? 'none'}:${projectionStatus?.message ?? ''}`;
    if (fingerprint === lastSyncRef.current) return;
    lastSyncRef.current = fingerprint;
    hostPort.postMessage({
      type: 'canvasStatus',
      data: {
        name: canvasData.name,
        nodes: canvasData.nodes,
        connections: canvasData.connections,
        viewport,
        _selection: { nodeIds: selectedNodeIds },
        nodeTypeSummary,
        projectionStatus,
      },
    });
  }, [nodes.length, connections.length, selectedNodeIds, canvasData, nodeTypeSummary]);

  const projectionHealthKey = canvasData?.projected
    ? JSON.stringify((canvasData as { projectionSource?: unknown }).projectionSource ?? null)
    : '';

  useEffect(() => {
    if (!projectionHealthKey) return;
    void requestProjectionWriteBack([]).then(
      () => {
        canvasStoreApi.getState().updateCanvasData(
          {
            projectionStatus: { state: 'clean', updatedAt: Date.now() },
          } as Partial<CanvasData>,
          { dirty: false },
        );
      },
      (error) => {
        canvasStoreApi.getState().updateCanvasData(
          {
            projectionStatus: {
              state: 'writeback-error',
              message: error instanceof Error ? error.message : String(error),
              updatedAt: Date.now(),
            },
          } as Partial<CanvasData>,
          { dirty: false },
        );
      },
    );
  }, [projectionHealthKey, requestProjectionWriteBack]);

  // =========================================================================
  // Notify extension of selection changes for ambient agent context
  // =========================================================================

  const lastSelectionRef = useRef<string>('');
  useEffect(() => {
    if (!hostPort || !canvasData) return;
    const selKey = selectedNodeIds.join(',');
    if (selKey === lastSelectionRef.current) return;
    lastSelectionRef.current = selKey;
    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
    hostPort.postMessage({ type: 'selectionChange', nodes: selectedNodes });
  }, [selectedNodeIds, nodes, canvasData]);

  // =========================================================================
  // Viewport & node event handlers (thin wrappers)
  // =========================================================================

  const handleViewportChange = useCallback(
    (partial: Partial<CanvasViewport>) => setViewport(partial),
    [setViewport],
  );
  const handleNodeSelect = useCallback(
    (nodeId: string, multi: boolean) => selectNode(nodeId, multi),
    [selectNode],
  );
  const handleCanvasClick = useCallback(() => {
    setContextMenu(null);
    clearSelection();
  }, [clearSelection, setContextMenu]);
  const handleNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => moveNodeEnd(nodeId, position),
    [moveNodeEnd],
  );
  const handleNodeResizeEnd = useCallback(
    (nodeId: string, size: { width: number; height: number }, position: { x: number; y: number }) =>
      resizeNodeEnd(nodeId, size, position),
    [resizeNodeEnd],
  );
  const handleNodeRotateEnd = useCallback(
    (nodeId: string, rotation: number) => rotateNodeEnd(nodeId, rotation),
    [rotateNodeEnd],
  );
  const handleConnectionSelect = useCallback(
    (connectionId: string) => selectConnection(connectionId),
    [selectConnection],
  );
  const handleNodeUpdateData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => updateNodeData(nodeId, data),
    [updateNodeData],
  );
  const handleConnectionComplete = useCallback(
    (connection: Omit<CanvasConnection, 'id'>): CanvasConnectionMutationResult =>
      canvasStoreApi.getState().addConnection(connection),
    [],
  );
  const handleMarqueeSelect = useCallback(
    (nodeIds: string[], additive: boolean) => {
      if (additive) {
        // Merge with existing selection
        const existing = new Set(selection.nodeIds);
        for (const id of nodeIds) existing.add(id);
        selectNodes(Array.from(existing));
      } else {
        selectNodes(nodeIds);
      }
    },
    [selection.nodeIds, selectNodes],
  );

  // =========================================================================
  // Zoom handlers
  // =========================================================================

  const handleZoomTo = useCallback((zoom: number) => zoomCanvas(zoom), [zoomCanvas]);

  function handleFitContent() {
    if (nodes.length === 0) {
      resetViewport();
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.size.width);
      maxY = Math.max(maxY, node.position.y + node.size.height);
    }
    const contentWidth = maxX - minX + 100;
    const contentHeight = maxY - minY + 100;
    const scaleX = containerSize.width / contentWidth;
    const scaleY = containerSize.height / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setViewport({
      zoom: newZoom,
      pan: {
        x: containerSize.width / 2 - centerX * newZoom,
        y: containerSize.height / 2 - centerY * newZoom,
      },
    });
  }

  function handleResetViewport() {
    resetViewport();
  }

  const handleTogglePlaybackWorkspace = useCallback(() => {
    if (playbackStoreApi.getState().playbackSession.visible) {
      hidePlaybackWorkspace();
    } else {
      revealPlaybackWorkspace({ focusOwner: 'route' });
    }
    reportAction('togglePlaybackWorkspace', 'overlay');
  }, [hidePlaybackWorkspace, reportAction, revealPlaybackWorkspace]);

  // =========================================================================
  // Render
  // =========================================================================

  if (loadDiagnostic) {
    return (
      <main
        className="canvas-load-diagnostic flex h-screen flex-col items-center justify-center gap-3 px-8 text-center"
        role="alert"
        data-testid="canvas-load-diagnostic"
        data-diagnostic-code={loadDiagnostic.code}
        style={{ backgroundColor: 'var(--canvas-bg)', color: 'var(--toolbar-fg)' }}
      >
        <h1 className="text-base font-semibold">{t('loadError.title')}</h1>
        <p className="max-w-xl text-sm" style={{ color: 'var(--toolbar-fg-secondary)' }}>
          {loadDiagnostic.message}
        </p>
        <code className="text-xs" style={{ color: 'var(--error-fg, #f14c4c)' }}>
          {loadDiagnostic.code}
        </code>
      </main>
    );
  }

  if (!isReady) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: 'var(--canvas-bg)' }}
      >
        <div style={{ color: 'var(--toolbar-fg-secondary)' }}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="canvas-workbench-root"
      data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
    >
      <CreativeWorkbenchShell
        className="canvas-workbench-shell"
        bodyClassName="canvas-workbench-body"
        mainClassName="canvas-main-panel"
        mainKind="canvas"
        main={
          <PlaybackWorkspace
            className="canvas-main-surface"
            canvasPane={
              <div
                ref={setCanvasContainerRef}
                className="canvas-main-surface-inner"
                style={{ backgroundColor: 'var(--canvas-bg)' }}
                {...getKeyboardBoundaryMetadata({
                  scope: 'editor',
                  ownerId: 'canvas-editor',
                  priority: 0,
                })}
                tabIndex={-1}
                onContextMenu={handleContextMenu}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {canvasData && canOpenBoardRef && (
                  <CanvasBoardNavigationBar
                    canvasData={canvasData}
                    onOpenBoardRef={handleCanvasBoardRefOpen}
                  />
                )}
                <InfiniteCanvas
                  nodes={nodes}
                  connections={connections}
                  viewport={viewport}
                  selectedNodeIds={selectedNodeIds}
                  selectedConnectionIds={selectedConnectionIds}
                  onViewportChange={handleViewportChange}
                  onNodeSelect={handleNodeSelect}
                  onNodeMove={handleNodeMove}
                  onNodeResizeEnd={handleNodeResizeEnd}
                  onNodeRotateEnd={handleNodeRotateEnd}
                  onNodeUpdateData={handleNodeUpdateData}
                  onConnectionSelect={handleConnectionSelect}
                  onConnectionComplete={handleConnectionComplete}
                  onConnectionStateChange={setIsConnecting}
                  onCanvasClick={handleCanvasClick}
                  onMarqueeSelect={handleMarqueeSelect}
                  onDocumentOpen={handleDocumentOpen}
                  onCanvasEmbedOpen={handleCanvasEmbedOpen}
                  onFullscreenPreviewOpenChange={handleFullscreenPreviewOpenChange}
                  onConnectionUpdate={updateConnection}
                  isPanMode={isPanMode}
                  isSpacePanActive={isSpacePanActive}
                  isGridVisible={isGridVisible}
                />

                <div className="canvas-floating-toolbar-host" data-canvas-toolbar-host="bottom">
                  <CanvasToolbar
                    onUndo={undo}
                    onRedo={redo}
                    isSelectMode={interactionTool === 'select'}
                    onSelectTool={selectInteractionTool}
                    onSelectAddAction={handleSelectAddAction}
                    availableSourceModes={authoringCapabilities.sourceModes}
                    availableGenerationKinds={availableGenerationKinds}
                    playbackWorkspaceVisible={
                      canOpenHostPlayback ? playbackWorkspaceVisible : undefined
                    }
                    onTogglePlaybackWorkspace={
                      canOpenHostPlayback ? handleTogglePlaybackWorkspace : undefined
                    }
                    onOpenExport={
                      canOpenHostExport
                        ? () => {
                            reportAction('openExport', t('toolbar.export'));
                          }
                        : undefined
                    }
                    onOpenPackage={
                      canOpenHostExport
                        ? () => {
                            reportAction(
                              'openPackage',
                              t('toolbar.package'),
                              undefined,
                              canvasData,
                            );
                          }
                        : undefined
                    }
                    isPanMode={isPanMode}
                    onTogglePanMode={togglePanMode}
                  />
                </div>

                {nodes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center" style={{ color: 'var(--toolbar-fg-secondary)' }}>
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        className="mx-auto mb-3 opacity-40"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M12 8v8" />
                        <path d="M8 12h8" />
                      </svg>
                      <p className="text-sm opacity-60">{t('empty.hint')}</p>
                      <p className="text-xs opacity-40 mt-1">{t('empty.zoom')}</p>
                    </div>
                  </div>
                )}

                {isHudVisible && (
                  <div
                    id="canvas-hud-controls"
                    className="canvas-hud-controls absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2"
                  >
                    <MiniMap
                      nodes={nodes}
                      viewport={minimapViewport}
                      containerWidth={containerSize.width}
                      containerHeight={containerSize.height}
                      onViewportChange={handleViewportChange}
                      width={miniMapWidth}
                      height={Math.round(miniMapWidth * 0.7)}
                    />

                    <div ref={setZoomControlsRef}>
                      <ZoomControls
                        zoom={viewport.zoom}
                        onZoomIn={handleZoomIn}
                        onZoomOut={handleZoomOut}
                        onZoomTo={handleZoomTo}
                        onFitContent={handleFitContent}
                        onResetViewport={handleResetViewport}
                      />
                    </div>
                  </div>
                )}

                {contextMenu && (
                  <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenu.items}
                    onClose={closeContextMenu}
                  />
                )}

                {isDragOver && (
                  <div
                    className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
                    style={{
                      backgroundColor: 'rgba(0, 120, 212, 0.08)',
                      border: '2px dashed var(--node-selected)',
                      borderRadius: 4,
                    }}
                  >
                    <div
                      className="px-4 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--toolbar-bg)',
                        color: 'var(--toolbar-fg)',
                        border: '1px solid var(--toolbar-border)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      }}
                    >
                      {t('canvas.dropHint')}
                    </div>
                  </div>
                )}

                {isConnecting && (
                  <div
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded text-xs pointer-events-none animate-pulse"
                    style={{
                      backgroundColor: 'var(--toolbar-bg)',
                      color: 'var(--toolbar-fg)',
                      border: '1px solid var(--toolbar-border)',
                    }}
                  >
                    {t('status.connecting')}
                  </div>
                )}
              </div>
            }
          />
        }
      />
    </div>
  );
}

function CanvasBoardNavigationBar({
  canvasData,
  onOpenBoardRef,
}: {
  canvasData: CanvasData;
  onOpenBoardRef: (ref: CanvasBoardRef) => void;
}) {
  const relatedBoards = canvasData.relatedBoards ?? [];
  const diagnostics = relatedBoards.flatMap((board) =>
    validateCanvasBoardRef(board.ref).map((diagnostic) => ({
      ...diagnostic,
      boardId: board.boardId,
      role: board.role,
    })),
  );

  if (relatedBoards.length === 0) return null;

  return (
    <div className="canvas-board-navigation-bar pointer-events-none absolute left-3 right-3 z-20 flex min-w-0 flex-wrap items-center gap-2">
      {relatedBoards.slice(0, 6).map((board, index) => {
        const boardDiagnostics = validateCanvasBoardRef(board.ref);
        const disabled = boardDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
        const label = board.label || board.scope?.title || board.boardId || board.role;
        return (
          <button
            key={`${board.boardId ?? board.role}:${index}`}
            type="button"
            className="pointer-events-auto min-w-0 max-w-[180px] truncate rounded-md border border-[var(--toolbar-border)] bg-[var(--toolbar-bg)] px-2 py-1 text-xs text-[var(--toolbar-fg)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            title={
              disabled ? boardDiagnostics.map((diagnostic) => diagnostic.message).join('\n') : label
            }
            onClick={(event) => {
              event.stopPropagation();
              onOpenBoardRef(board.ref);
            }}
          >
            {label}
          </button>
        );
      })}

      {diagnostics.length > 0 && <CanvasBoardDiagnostics diagnostics={diagnostics} />}
    </div>
  );
}

function CanvasBoardDiagnostics({
  diagnostics,
}: {
  diagnostics: readonly CanvasBoardNavigationDiagnostic[];
}) {
  return (
    <div
      className="pointer-events-auto rounded-md border border-[var(--color-warning-border)] bg-[var(--toolbar-bg)] px-2 py-1 text-[10px] text-[var(--toolbar-fg-secondary)] shadow-sm"
      title={diagnostics.map((diagnostic) => diagnostic.message).join('\n')}
    >
      {t('scopeNavigation.issueCount', { count: diagnostics.length })}
    </div>
  );
}
