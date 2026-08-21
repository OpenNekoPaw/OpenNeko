/**
 * InfiniteCanvas - Main canvas component
 * Provides infinite pan/zoom canvas with grid background
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { ContentLocator } from '@neko/content';
import type {
  CanvasNode,
  CanvasConnection,
  CanvasViewport as ViewportType,
} from '@neko/canvas-domain';
import { CanvasGrid } from './CanvasGrid';
import { CanvasViewport } from './CanvasViewport';
import { renderCanvasNode } from './nodes';
import type { NodeRendererRegistry } from './nodes';
import { ConnectionLayer, InlineConnectionEditor } from './connections';
import { useViewportTransform } from '../hooks/useViewportTransform';
import { useViewportCulling } from '../hooks/useViewportCulling';
import { useConnectionDrag } from '../hooks/useConnectionDrag';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import { useThrottledCanvasViewport } from '../hooks/useThrottledCanvasViewport';
import { projectCanvasNodeRenderPlan } from '../utils/canvasOrganization';
import { createCoreNodeTypeDescriptors } from './nodes/coreNodeTypeDescriptors';
import { createCoreNodeRendererRegistry } from './nodes/coreNodeRenderers';
import {
  resolveCanvasRenderRefreshDecision,
  type CanvasInteractionPhase,
} from '../utils/renderRefreshTiering';
import { SelectionContextToolbar } from './selection/SelectionContextToolbar';
import {
  CanvasFullscreenPreviewOverlay,
  resolveCanvasFullscreenPreviewRequest,
  type CanvasFullscreenPreviewRequest,
} from './selection/CanvasImagePreviewOverlay';
import { CanvasMarkdownEditorOverlay } from './selection/CanvasMarkdownEditorOverlay';
import {
  resolveGenerationSelectionSafePan,
  SelectionGenerationInputPanel,
} from './selection/SelectionGenerationInputPanel';
import { SelectionMaterialGenerationBar } from './selection/SelectionMaterialGenerationBar';
import { resolveCanvasDropContainer } from '../utils/containerMembership';
import {
  validateCanvasConnectionDraft,
  type CanvasConnectionMutationResult,
} from '../utils/canvasConnectionAuthoring';

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
  onConnectionUpdate?: (
    connectionId: string,
    updates: Partial<CanvasConnection>,
  ) => CanvasConnectionMutationResult;
  onConnectionComplete?: (
    connection: Omit<CanvasConnection, 'id'>,
  ) => CanvasConnectionMutationResult;
  onConnectionCancel?: () => void;
  onConnectionStateChange?: (isConnecting: boolean) => void;
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

  /** Called when user opens a referenced file. */
  onDocumentOpen?: (locator: ContentLocator) => void;
  /** Called when user opens an embedded canvas. */
  onCanvasEmbedOpen?: (canvasPath: string) => void;
  /** Reports whether the Canvas-owned modal preview currently owns input. */
  onFullscreenPreviewOpenChange?: (open: boolean) => void;
}

type CanvasFullscreenSurface =
  | {
      readonly kind: 'preview';
      readonly request: CanvasFullscreenPreviewRequest;
    }
  | {
      readonly kind: 'markdown-editor';
      readonly nodeId: string;
    };

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
  onConnectionComplete,
  onConnectionCancel,
  onConnectionStateChange,
  onCanvasClick,
  onMarqueeSelect,
  enableCulling = true,
  isPanMode = false,
  isSpacePanActive = false,
  onDocumentOpen,
  onCanvasEmbedOpen,
  onFullscreenPreviewOpenChange,
  isGridVisible = true,
}: InfiniteCanvasProps) {
  const [generationInputLayout, setGenerationInputLayout] = useState<{
    readonly nodeId: string;
    readonly height: number;
  }>();
  const [fullscreenSurface, setFullscreenSurface] = useState<CanvasFullscreenSurface>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [transformingNodeIds, setTransformingNodeIds] = useState<readonly string[]>([]);
  const [dragPreview, setDragPreview] = useState<{
    readonly nodeId: string;
    readonly position: { readonly x: number; readonly y: number };
  } | null>(null);
  const frozenVisibleNodeIdsRef = useRef<readonly string[] | null>(null);
  const renderPlan = useMemo(() => projectCanvasNodeRenderPlan(nodes), [nodes]);

  useEffect(() => {
    onFullscreenPreviewOpenChange?.(fullscreenSurface !== undefined);
  }, [fullscreenSurface, onFullscreenPreviewOpenChange]);

  useEffect(() => () => onFullscreenPreviewOpenChange?.(false), [onFullscreenPreviewOpenChange]);

  // Viewport transform hook
  const { state: viewportState, handlers: viewportHandlers } = useViewportTransform({
    viewport,
    onViewportChange,
    containerRef,
    isPanMode,
    isSpacePanActive,
    disabled: fullscreenSurface !== undefined,
  });

  // Connection drag hook - enables drag-to-connect with mouse-follow preview
  const {
    pendingConnection,
    isConnecting: isDraggingConnection,
    targetState: connectionTargetState,
    startConnection: startDragConnection,
  } = useConnectionDrag({
    viewport,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    nodes,
    onConnectionComplete,
    validateConnection: (connection) =>
      validateCanvasConnectionDraft(nodes, connections, connection),
    onConnectionCancel,
    onConnectionStateChange,
    enabled: fullscreenSurface === undefined,
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
    enabled:
      fullscreenSurface === undefined &&
      !viewportState.isPanning &&
      !isDraggingConnection &&
      !isPanMode,
  });

  useEffect(() => {
    if (transformingNodeIds.length > 0 || isMarqueeSelecting) return;
    const selectedNode =
      selectedNodeIds.length === 1
        ? nodes.find(
            (candidate): candidate is Extract<CanvasNode, { type: 'generation' }> =>
              candidate.id === selectedNodeIds[0] && candidate.type === 'generation',
          )
        : undefined;
    if (!selectedNode) return;

    const safePan = resolveGenerationSelectionSafePan(
      selectedNode,
      viewport,
      containerSize,
      generationInputLayout?.nodeId === selectedNode.id ? generationInputLayout.height : undefined,
    );
    if (safePan) onViewportChange({ pan: safePan });
  }, [
    containerSize,
    generationInputLayout,
    isMarqueeSelecting,
    nodes,
    onViewportChange,
    selectedNodeIds,
    transformingNodeIds.length,
    viewport,
  ]);

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
    () => [...renderPlan.expandedSpatialContainerIds],
    [renderPlan.expandedSpatialContainerIds],
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

  const interactionNodes = useMemo(
    () =>
      dragPreview
        ? nodes.map((node) =>
            node.id === dragPreview.nodeId ? { ...node, position: dragPreview.position } : node,
          )
        : nodes,
    [dragPreview, nodes],
  );
  const openFullscreenPreview = useCallback(
    (nodeId: string, outputId?: string) => {
      const node = interactionNodes.find((candidate) => candidate.id === nodeId);
      if (!node) throw new Error(`Canvas preview resource node "${nodeId}" is not rendered.`);
      const request = resolveCanvasFullscreenPreviewRequest(node, outputId);
      if (!request) {
        throw new Error(`Canvas node "${nodeId}" does not expose an preview resource.`);
      }
      setFullscreenSurface({ kind: 'preview', request });
    },
    [interactionNodes],
  );
  const openMarkdownEditor = useCallback(
    (nodeId: string) => {
      if (!onNodeUpdateData) {
        throw new Error('Canvas Markdown editing requires the node update owner.');
      }
      const node = interactionNodes.find((candidate) => candidate.id === nodeId);
      if (!node || node.type !== 'markdown') {
        throw new Error(`Canvas Markdown node "${nodeId}" is not rendered.`);
      }
      setFullscreenSurface({ kind: 'markdown-editor', nodeId });
    },
    [interactionNodes, onNodeUpdateData],
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
      const bounds = container.getBoundingClientRect();
      setContainerSize({
        width: bounds.width || container.clientWidth,
        height: bounds.height || container.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    let resizeFrame: number | undefined;
    const updateSizeAfterWindowResize = (): void => {
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = undefined;
        updateSize();
      });
    };
    window.addEventListener('resize', updateSizeAfterWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSizeAfterWindowResize);
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    };
  }, []);

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
      data-canvas-zoom-detail={viewport.zoom < 0.55 ? 'distant' : 'readable'}
      data-canvas-interaction-suspended={fullscreenSurface ? 'true' : undefined}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: getCursor() }}
      {...getKeyboardBoundaryMetadata({
        scope: 'viewport',
        ownerId: 'canvas-viewport',
        priority: 0,
      })}
      tabIndex={-1}
      onMouseDown={(e) => {
        if (fullscreenSurface) return;
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
        if (fullscreenSurface) return;
        viewportHandlers.onMouseMove(e);
        marqueeHandlers.onMouseMove(e);
      }}
      onMouseUp={(e) => {
        if (fullscreenSurface) return;
        viewportHandlers.onMouseUp();
        marqueeHandlers.onMouseUp(e);
      }}
      onMouseLeave={() => {
        if (!fullscreenSurface) viewportHandlers.onMouseLeave();
      }}
      onContextMenu={(event) => {
        if (!fullscreenSurface) viewportHandlers.onContextMenu(event);
      }}
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
            onConnectionUpdate?.(connectionId, updates) ?? {
              ok: false,
              reason: 'missing-connection',
            }
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

          return renderNode(CORE_NODE_RENDERERS, {
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
            onFullscreenPreview: openFullscreenPreview,
            onMarkdownEdit: onNodeUpdateData ? openMarkdownEditor : undefined,
            onConnectionStart: startDragConnection,
            isConnecting: isDraggingConnection,
            connectionTargetState,
            interactionRenderMode: renderRefreshDecision.shouldUseHeavyContentShell
              ? 'shell'
              : 'full',
            onDocumentOpen,
            onCanvasEmbedOpen,
            selectedNodeIds,
            nodeTypeDescriptors: CORE_NODE_TYPE_DESCRIPTORS,
          });
        })}
      </CanvasViewport>

      <SelectionContextToolbar
        nodes={interactionNodes}
        selectedNodeIds={selectedNodeIds}
        viewport={viewport}
        viewportSize={containerSize}
        onMarkdownEdit={onNodeUpdateData ? openMarkdownEditor : undefined}
        hidden={
          fullscreenSurface !== undefined ||
          (transformingNodeIds.length > 0 && !dragPreview) ||
          isMarqueeSelecting
        }
      />
      <SelectionGenerationInputPanel
        nodes={interactionNodes}
        connections={connections}
        selectedNodeIds={selectedNodeIds}
        viewport={viewport}
        viewportSize={containerSize}
        hidden={
          fullscreenSurface !== undefined ||
          (transformingNodeIds.length > 0 && !dragPreview) ||
          isMarqueeSelecting
        }
        onLayoutMeasure={setGenerationInputLayout}
      />
      <SelectionMaterialGenerationBar
        nodes={nodes}
        selectedNodeIds={selectedNodeIds}
        viewport={viewport}
        viewportSize={containerSize}
        hidden={
          fullscreenSurface !== undefined || transformingNodeIds.length > 0 || isMarqueeSelecting
        }
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
      {fullscreenSurface?.kind === 'preview' ? (
        <CanvasFullscreenPreviewOverlay
          request={fullscreenSurface.request}
          onClose={() => setFullscreenSurface(undefined)}
        />
      ) : fullscreenSurface?.kind === 'markdown-editor' && onNodeUpdateData ? (
        <CanvasMarkdownEditorOverlay
          nodeId={fullscreenSurface.nodeId}
          node={nodes.find(
            (candidate): candidate is Extract<CanvasNode, { type: 'markdown' }> =>
              candidate.id === fullscreenSurface.nodeId && candidate.type === 'markdown',
          )}
          onUpdateData={onNodeUpdateData}
          onClose={() => setFullscreenSurface(undefined)}
        />
      ) : null}
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

const CORE_NODE_RENDERERS = createCoreNodeRendererRegistry();
const CORE_NODE_TYPE_DESCRIPTORS = createCoreNodeTypeDescriptors();
