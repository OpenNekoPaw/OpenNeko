/**
 * InfiniteCanvas - Main canvas component
 * Provides infinite pan/zoom canvas with grid background
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasNode, CanvasConnection, CanvasViewport as ViewportType } from '@neko/shared';
import { CanvasGrid } from './CanvasGrid';
import { CanvasViewport } from './CanvasViewport';
import { renderCanvasNode } from './nodes';
import type { NodeRendererRegistry } from './nodes';
import type {
  ScriptIndexRuntimeState,
  TextDocumentRuntimeProjection,
} from './nodes/nodeRendererTypes';
import type { NodeTypeDescriptorRegistry } from './nodes/nodeTypeDescriptor';
import { ConnectionLayer, InlineConnectionEditor } from './connections';
import { useViewportTransform } from '../hooks/useViewportTransform';
import { useViewportCulling } from '../hooks/useViewportCulling';
import { useConnectionDrag } from '../hooks/useConnectionDrag';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import { useThrottledCanvasViewport } from '../hooks/useThrottledCanvasViewport';
import { projectCanvasNodeRenderPlan } from '../utils/canvasOrganization';
import { createBuiltInWebviewSubsystemRegistry } from '../subsystems';
import {
  resolveCanvasRenderRefreshDecision,
  type CanvasInteractionPhase,
} from '../utils/renderRefreshTiering';
import { SelectionContextToolbar } from './selection/SelectionContextToolbar';
import { SelectionMaterialGenerationBar } from './selection/SelectionMaterialGenerationBar';
import { resolveCanvasDropContainer } from '../utils/containerMembership';

// =============================================================================
// Types
// =============================================================================

export interface InfiniteCanvasProps {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: ViewportType;
  selectedNodeIds: string[];
  selectedConnectionIds?: string[];
  onViewportChange: (viewport: Partial<ViewportType>) => void;
  onNodeSelect?: (nodeId: string, multi: boolean) => void;
  /** Called on mouseup when node drag ends (final position + history) */
  onNodeMove?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called on mouseup when node resize ends */
  onNodeResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onNodeUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  /** Called on mouseup when node rotation ends */
  onNodeRotateEnd?: (nodeId: string, rotation: number) => void;
  onConnectionSelect?: (connectionId: string) => void;
  onConnectionUpdate?: (connectionId: string, updates: Partial<CanvasConnection>) => void;
  onConnectionStart?: (nodeId: string, handleId: string) => void;
  onConnectionComplete?: (
    sourceNodeId: string,
    sourceHandleId: string,
    targetNodeId: string,
    targetHandleId: string,
  ) => void;
  onConnectionCancel?: () => void;
  onCanvasClick?: () => void;
  /** Called when marquee selection completes */
  onMarqueeSelect?: (nodeIds: string[], additive: boolean) => void;
  /** 是否启用视口裁剪（默认启用） */
  enableCulling?: boolean;
  /** Hand tool: left-drag pans canvas instead of marquee-selecting */
  isPanMode?: boolean;
  /** Spacebar-hold pan mode, owned by the Canvas root keyboard dispatcher. */
  isSpacePanActive?: boolean;
  /** Background grid visibility, controlled by Canvas settings. */
  isGridVisible?: boolean;

  // ── ScriptNode callbacks ───────────────────────────────────────────────────
  /** Called to load scene TOC from neko-story */
  onScriptLoadScenes?: (nodeId: string, scriptPath: string) => void;
  scriptIndexStates?: Readonly<Record<string, ScriptIndexRuntimeState>>;
  /** Called when user opens a script file */
  onScriptOpen?: (scriptPath: string) => void;
  /** Called when user navigates to a linked SceneGroupNode */
  onScriptNavigateToScene?: (linkedSceneGroupId: string) => void;

  // ── DocumentNode callbacks ─────────────────────────────────────────────────
  /** Called when user opens a document */
  onDocumentOpen?: (docPath: string) => void;
  onDocumentLoadText?: (nodeId: string, docPath: string, docType: 'markdown' | 'text') => void;
  documentTextProjections?: Readonly<Record<string, TextDocumentRuntimeProjection>>;
  /** Called when user opens an embedded canvas */
  onCanvasEmbedOpen?: (canvasPath: string) => void;

  // ── ModelNode callbacks ────────────────────────────────────────────────────
  /** Called to check if a model is installed */
  onModelCheckInstalled?: (nodeId: string, modelPath: string) => void;
  /** Called to remove a child node from its container */
  onRemoveContainerChild?: (containerId: string, childId: string) => void;
  expandedNodeId?: string | null;
}

// =============================================================================
// Component
// =============================================================================

export function InfiniteCanvas({
  nodes,
  connections,
  viewport,
  selectedNodeIds,
  selectedConnectionIds = [],
  onViewportChange,
  onNodeSelect,
  onNodeMove,
  onNodeResizeEnd,
  onNodeUpdateData,
  onNodeRotateEnd,
  onConnectionSelect,
  onConnectionUpdate,
  onConnectionStart,
  onConnectionComplete,
  onConnectionCancel,
  onCanvasClick,
  onMarqueeSelect,
  enableCulling = true,
  isPanMode = false,
  isSpacePanActive = false,
  onScriptLoadScenes,
  scriptIndexStates,
  onScriptOpen,
  onScriptNavigateToScene,
  onDocumentOpen,
  onDocumentLoadText,
  documentTextProjections,
  onCanvasEmbedOpen,
  onModelCheckInstalled,
  onRemoveContainerChild,
  expandedNodeId,
  isGridVisible = true,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const webviewSubsystemRegistryRef = useRef(createBuiltInWebviewSubsystemRegistry());
  const [nodeRendererRegistry, setNodeRendererRegistry] = useState<NodeRendererRegistry>({});
  const [nodeTypeDescriptorRegistry, setNodeTypeDescriptorRegistry] =
    useState<NodeTypeDescriptorRegistry>(() =>
      webviewSubsystemRegistryRef.current.getCoreNodeTypeDescriptors(),
    );
  const [transformingNodeIds, setTransformingNodeIds] = useState<readonly string[]>([]);
  const [dragPreview, setDragPreview] = useState<{
    readonly nodeId: string;
    readonly position: { readonly x: number; readonly y: number };
  } | null>(null);
  const frozenVisibleNodeIdsRef = useRef<readonly string[] | null>(null);
  const activeSubsystemKey = webviewSubsystemRegistryRef.current
    .getActiveSubsystems({ nodes })
    .join('|');
  const renderPlan = useMemo(() => projectCanvasNodeRenderPlan(nodes), [nodes]);

  // Viewport transform hook
  const { state: viewportState, handlers: viewportHandlers } = useViewportTransform({
    viewport,
    onViewportChange,
    containerRef,
    isPanMode,
    isSpacePanActive,
  });

  // Connection drag hook - enables drag-to-connect with mouse-follow preview
  const {
    pendingConnection,
    isConnecting: isDraggingConnection,
    startConnection: startDragConnection,
  } = useConnectionDrag({
    viewport,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onConnectionStart,
    onConnectionComplete,
    onConnectionCancel,
  });

  // Marquee selection hook
  const {
    marqueeRect,
    isSelecting: isMarqueeSelecting,
    handlers: marqueeHandlers,
  } = useMarqueeSelect({
    viewport,
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    nodes: [...renderPlan.nodes],
    onSelect: onMarqueeSelect,
    enabled: !viewportState.isPanning && !isDraggingConnection && !isPanMode,
  });

  const interactionPhase: CanvasInteractionPhase =
    transformingNodeIds.length > 0
      ? 'transforming'
      : viewportState.isPanning
        ? 'fast-viewport'
        : 'idle';
  const renderRefreshDecision = useMemo(
    () =>
      resolveCanvasRenderRefreshDecision({
        nodes,
        connections,
        phase: interactionPhase,
      }),
    [connections, interactionPhase, nodes],
  );
  const cullingViewport = useThrottledCanvasViewport(viewport, {
    enabled: renderRefreshDecision.shouldThrottleViewportProjection,
    intervalMs: 80,
  });

  // Viewport culling - 只渲染可见节点
  const { visibleNodes, culledCount, totalCount } = useViewportCulling({
    nodes: [...renderPlan.nodes],
    viewport: cullingViewport,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    enabled: enableCulling,
  });
  const renderedNodes = useMemo(() => {
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    return renderPlan.nodes.filter((node) => visibleNodeIds.has(node.id));
  }, [renderPlan.nodes, visibleNodes]);
  const renderedNodeIds = useMemo(() => renderedNodes.map((node) => node.id), [renderedNodes]);

  useEffect(() => {
    if (!renderRefreshDecision.shouldFreezeConnectionProjection) {
      frozenVisibleNodeIdsRef.current = null;
      return;
    }

    frozenVisibleNodeIdsRef.current ??= renderedNodeIds;
  }, [renderRefreshDecision.shouldFreezeConnectionProjection, renderedNodeIds]);

  const connectionVisibleNodeIds = renderRefreshDecision.shouldFreezeConnectionProjection
    ? (frozenVisibleNodeIdsRef.current ?? renderedNodeIds)
    : renderedNodeIds;
  const expandedContainerIds = useMemo(
    () => [
      ...renderPlan.expandedSpatialContainerIds,
      ...(expandedNodeId && !renderPlan.expandedSpatialContainerIds.has(expandedNodeId)
        ? [expandedNodeId]
        : []),
    ],
    [expandedNodeId, renderPlan.expandedSpatialContainerIds],
  );

  const handleTransformStart = useCallback((nodeId: string) => {
    setTransformingNodeIds((current) =>
      current.includes(nodeId) ? current : [...current, nodeId],
    );
  }, []);

  const handleTransformEnd = useCallback((nodeId: string) => {
    setTransformingNodeIds((current) => current.filter((id) => id !== nodeId));
    setDragPreview((current) => (current?.nodeId === nodeId ? null : current));
  }, []);

  const handleNodeDrag = useCallback(
    (nodeId: string, position: { x: number; y: number }) => setDragPreview({ nodeId, position }),
    [],
  );

  const dropTargetPreview = useMemo(() => {
    if (!dragPreview) return undefined;
    const movedNodes = nodes.map((node) =>
      node.id === dragPreview.nodeId ? { ...node, position: dragPreview.position } : node,
    );
    const movedNode = movedNodes.find((node) => node.id === dragPreview.nodeId);
    if (!movedNode) return undefined;
    const resolution = resolveCanvasDropContainer(movedNodes, movedNode.id, {
      movingSubtree: Boolean(movedNode.container),
    });
    return resolution.targetContainerId
      ? movedNodes.find((node) => node.id === resolution.targetContainerId)
      : undefined;
  }, [dragPreview, nodes]);

  const handleNodeMoveEnd = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      handleTransformEnd(nodeId);
      onNodeMove?.(nodeId, position);
    },
    [handleTransformEnd, onNodeMove],
  );

  const handleNodeResizeEnd = useCallback(
    (
      nodeId: string,
      size: { width: number; height: number },
      position: { x: number; y: number },
    ) => {
      handleTransformEnd(nodeId);
      onNodeResizeEnd?.(nodeId, size, position);
    },
    [handleTransformEnd, onNodeResizeEnd],
  );

  const handleNodeRotateEnd = useCallback(
    (nodeId: string, rotation: number) => {
      handleTransformEnd(nodeId);
      onNodeRotateEnd?.(nodeId, rotation);
    },
    [handleTransformEnd, onNodeRotateEnd],
  );

  // Update container size on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    webviewSubsystemRegistryRef.current
      .loadForCanvas({ nodes })
      .then((registrations) => {
        if (cancelled) return;

        const nextRegistry: NodeRendererRegistry = {};
        for (const registration of registrations) {
          Object.assign(nextRegistry, registration.nodeRenderers);
        }
        setNodeRendererRegistry(nextRegistry);
        setNodeTypeDescriptorRegistry({
          ...webviewSubsystemRegistryRef.current.getCoreNodeTypeDescriptors(),
          ...Object.assign(
            {},
            ...registrations.map((registration) => registration.nodeTypeDescriptors),
          ),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setNodeRendererRegistry({});
          setNodeTypeDescriptorRegistry(
            webviewSubsystemRegistryRef.current.getCoreNodeTypeDescriptors(),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSubsystemKey, nodes]);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle clicks on the canvas itself, not on nodes
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).hasAttribute('data-canvas-viewport-layer') ||
        (e.target as HTMLElement).closest('[data-canvas-background]')
      ) {
        containerRef.current?.focus();
        onCanvasClick?.();
      }
    },
    [onCanvasClick],
  );

  // Cursor style based on state
  const getCursor = () => {
    if (viewportState.isPanning) return 'grabbing';
    if (isDraggingConnection) return 'crosshair';
    if (isMarqueeSelecting) return 'crosshair';
    if (isPanMode || isSpacePanActive) return 'grab';
    return 'default';
  };

  return (
    <div
      ref={containerRef}
      data-canvas-viewport-root="true"
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: getCursor() }}
      {...getKeyboardBoundaryMetadata({
        scope: 'viewport',
        ownerId: 'canvas-viewport',
        priority: 0,
      })}
      tabIndex={-1}
      onMouseDown={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).hasAttribute('data-canvas-viewport-layer') ||
          (e.target as HTMLElement).closest('[data-canvas-background]')
        ) {
          e.currentTarget.focus();
        }
        viewportHandlers.onMouseDown(e);
        marqueeHandlers.onMouseDown(e);
        handleCanvasClick(e);
      }}
      onMouseMove={(e) => {
        viewportHandlers.onMouseMove(e);
        marqueeHandlers.onMouseMove(e);
      }}
      onMouseUp={(e) => {
        viewportHandlers.onMouseUp();
        marqueeHandlers.onMouseUp(e);
      }}
      onMouseLeave={viewportHandlers.onMouseLeave}
      onContextMenu={viewportHandlers.onContextMenu}
    >
      {isGridVisible && (
        <CanvasGrid viewport={viewport} width={containerSize.width} height={containerSize.height} />
      )}

      {/* Viewport transform layer */}
      <CanvasViewport viewport={viewport}>
        {/* Connection layer with pending connection preview */}
        <ConnectionLayer
          connections={connections}
          nodes={nodes}
          selectedConnectionIds={selectedConnectionIds}
          visibleNodeIds={connectionVisibleNodeIds}
          expandedContainerIds={expandedContainerIds}
          pendingConnection={pendingConnection}
          freezeProjection={renderRefreshDecision.shouldFreezeConnectionProjection}
          onConnectionSelect={onConnectionSelect}
        />

        <InlineConnectionEditor
          connection={
            selectedConnectionIds.length === 1
              ? (connections.find((connection) => connection.id === selectedConnectionIds[0]) ??
                null)
              : null
          }
          nodes={nodes}
          onUpdateConnection={(connectionId, updates) =>
            onConnectionUpdate?.(connectionId, updates)
          }
        />

        {dropTargetPreview && (
          <div
            className="canvas-drop-target-preview"
            data-canvas-drop-target-preview={dropTargetPreview.id}
            style={{
              left: dropTargetPreview.position.x,
              top: dropTargetPreview.position.y,
              width: dropTargetPreview.size.width,
              height: dropTargetPreview.size.height,
            }}
          />
        )}

        {/* Node layer - 使用裁剪后的可见节点; container-managed children are summarized by containers */}
        {renderedNodes.map((node) => {
          const isSelected = selectedNodeIds.includes(node.id);

          return renderNode(nodeRendererRegistry, {
            node,
            allNodes: nodes,
            viewport,
            isSelected,
            containerRef: containerRef as React.RefObject<HTMLElement | null>,
            onSelect: onNodeSelect,
            onTransformStart: handleTransformStart,
            onDrag: handleNodeDrag,
            onMove: handleNodeMoveEnd,
            onResizeEnd: handleNodeResizeEnd,
            onRotateEnd: handleNodeRotateEnd,
            onUpdateData: onNodeUpdateData,
            onConnectionStart: startDragConnection,
            interactionRenderMode: renderRefreshDecision.shouldUseHeavyContentShell
              ? 'shell'
              : 'full',
            onScriptLoadScenes,
            scriptIndexState: scriptIndexStates?.[node.id],
            onScriptOpen,
            onScriptNavigateToScene,
            onDocumentOpen,
            onDocumentLoadText,
            documentTextProjection: documentTextProjections?.[node.id],
            onCanvasEmbedOpen,
            onModelCheckInstalled,
            onRemoveContainerChild,
            isExpanded: expandedNodeId === node.id,
            selectedNodeIds,
            nodeTypeDescriptors: nodeTypeDescriptorRegistry,
          });
        })}
      </CanvasViewport>

      <SelectionContextToolbar
        nodes={nodes}
        selectedNodeIds={selectedNodeIds}
        viewport={viewport}
        viewportSize={containerSize}
        hidden={transformingNodeIds.length > 0 || isMarqueeSelecting}
      />
      <SelectionMaterialGenerationBar
        nodes={nodes}
        selectedNodeIds={selectedNodeIds}
        viewport={viewport}
        viewportSize={containerSize}
        hidden={transformingNodeIds.length > 0 || isMarqueeSelecting}
      />

      {/* Marquee selection rectangle */}
      {marqueeRect && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: marqueeRect.x - (containerRef.current?.getBoundingClientRect().left ?? 0),
            top: marqueeRect.y - (containerRef.current?.getBoundingClientRect().top ?? 0),
            width: marqueeRect.width,
            height: marqueeRect.height,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.6)',
            borderRadius: 2,
          }}
        />
      )}

      {/* Canvas info overlay */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 pointer-events-none">
        {enableCulling && culledCount > 0 ? (
          <span>
            {visibleNodes.length} visible / {totalCount} total ({culledCount} culled)
          </span>
        ) : renderRefreshDecision.shouldThrottleViewportProjection ? (
          <span>{nodes.length} nodes | throttled viewport projection</span>
        ) : (
          <span>
            {nodes.length} nodes | {connections.length} connections
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function renderNode(
  registry: NodeRendererRegistry,
  context: Parameters<typeof renderCanvasNode>[1],
): React.ReactNode {
  return renderCanvasNode(registry, context);
}
