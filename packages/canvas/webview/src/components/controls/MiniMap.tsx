/**
 * MiniMap - Mini map component
 * Shows a bird's eye view of the canvas with current viewport indicator
 */

import { useMemo, useCallback, useRef } from 'react';
import type { CanonicalCanvasNodeType, CanvasNode, CanvasViewport } from '@neko/canvas-domain';
import { getTopLevelCanvasNodes } from '../../utils/canvasOrganization';

// =============================================================================
// Types
// =============================================================================

export interface MiniMapProps {
  nodes: CanvasNode[];
  viewport: CanvasViewport;
  containerWidth: number;
  containerHeight: number;
  onViewportChange: (viewport: Partial<CanvasViewport>) => void;
  width?: number;
  height?: number;
}

export interface MiniMapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MiniMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MiniMapGeometry {
  bounds: MiniMapBounds;
  scale: number;
  viewportRect: MiniMapRect;
}

interface MiniMapNodeStyle {
  fill: string;
  opacity?: number;
  radius?: number;
}

type MiniMapNodeStyleRegistry = Readonly<Record<CanonicalCanvasNodeType, MiniMapNodeStyle>>;

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 150;
const PADDING = 20;
const CONTENT_INSET = 10;
const DEFAULT_NODE_OPACITY = 0.8;
const DEFAULT_NODE_RADIUS = 1;

// =============================================================================
// Helpers
// =============================================================================

function calculateBounds(
  nodes: readonly CanvasNode[],
  visibleCanvasRect: MiniMapRect | undefined,
): MiniMapBounds {
  if (nodes.length === 0 && !visibleCanvasRect) {
    return {
      minX: -500,
      minY: -500,
      maxX: 500,
      maxY: 500,
      width: 1000,
      height: 1000,
    };
  }

  let minX = visibleCanvasRect?.x ?? Infinity;
  let minY = visibleCanvasRect?.y ?? Infinity;
  let maxX = visibleCanvasRect ? visibleCanvasRect.x + visibleCanvasRect.width : -Infinity;
  let maxY = visibleCanvasRect ? visibleCanvasRect.y + visibleCanvasRect.height : -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }

  // Add some padding
  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function resolveMiniMapGeometry({
  nodes,
  viewport,
  containerWidth,
  containerHeight,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: Pick<
  MiniMapProps,
  'nodes' | 'viewport' | 'containerWidth' | 'containerHeight' | 'width' | 'height'
>): MiniMapGeometry {
  const visibleCanvasRect =
    containerWidth > 0 && containerHeight > 0
      ? {
          x: -viewport.pan.x / viewport.zoom,
          y: -viewport.pan.y / viewport.zoom,
          width: containerWidth / viewport.zoom,
          height: containerHeight / viewport.zoom,
        }
      : undefined;
  const bounds = calculateBounds(nodes, visibleCanvasRect);
  const scaleX = (width - CONTENT_INSET * 2) / bounds.width;
  const scaleY = (height - CONTENT_INSET * 2) / bounds.height;
  const scale = Math.min(scaleX, scaleY, 1);

  const viewportRect = visibleCanvasRect
    ? {
        x: (visibleCanvasRect.x - bounds.minX) * scale + CONTENT_INSET,
        y: (visibleCanvasRect.y - bounds.minY) * scale + CONTENT_INSET,
        width: visibleCanvasRect.width * scale,
        height: visibleCanvasRect.height * scale,
      }
    : { x: CONTENT_INSET, y: CONTENT_INSET, width: 0, height: 0 };

  return { bounds, scale, viewportRect };
}

export function createBuiltInMiniMapNodeStyleRegistry(): MiniMapNodeStyleRegistry {
  return {
    media: { fill: '#4ec9b0' },
    markdown: { fill: '#dcdcaa' },
    group: { fill: '#569cd6' },
    generation: { fill: '#f59e0b' },
    job: { fill: '#c586c0' },
    file: { fill: '#ef4444' },
    'canvas-embed': { fill: '#ce9178' },
  };
}

export function resolveMiniMapNodeStyle(
  registry: MiniMapNodeStyleRegistry,
  nodeType: CanonicalCanvasNodeType,
): MiniMapNodeStyle {
  return registry[nodeType];
}

const MINI_MAP_NODE_STYLE_REGISTRY = createBuiltInMiniMapNodeStyleRegistry();

// =============================================================================
// Component
// =============================================================================

export function MiniMap({
  nodes,
  viewport,
  containerWidth,
  containerHeight,
  onViewportChange,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: MiniMapProps) {
  const miniMapRef = useRef<HTMLDivElement>(null);

  // Filter out container-managed children; containers expose compact summaries.
  const visibleNodes = useMemo(() => getTopLevelCanvasNodes(nodes), [nodes]);

  // Nodes and the visible Canvas viewport share one world-space projection.
  const { bounds, scale, viewportRect } = useMemo(
    () =>
      resolveMiniMapGeometry({
        nodes: visibleNodes,
        viewport,
        containerWidth,
        containerHeight,
        width,
        height,
      }),
    [visibleNodes, viewport, containerWidth, containerHeight, width, height],
  );

  // Handle click on minimap to pan
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = miniMapRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Click position relative to the shared projected content area.
      const clickX = e.clientX - rect.left - CONTENT_INSET;
      const clickY = e.clientY - rect.top - CONTENT_INSET;

      // Convert minimap pixel → canvas coordinate
      const canvasX = clickX / scale + bounds.minX;
      const canvasY = clickY / scale + bounds.minY;

      // Pan so that canvasX/Y appears at the center of the screen:
      //   screenPos = canvasPos * zoom + pan  →  pan = screenCenter - canvasPos * zoom
      const newPanX = containerWidth / 2 - canvasX * viewport.zoom;
      const newPanY = containerHeight / 2 - canvasY * viewport.zoom;

      onViewportChange({
        pan: { x: newPanX, y: newPanY },
      });
    },
    [scale, bounds, containerWidth, containerHeight, viewport.zoom, onViewportChange],
  );

  return (
    <div
      ref={miniMapRef}
      className="minimap-card relative cursor-pointer"
      style={{
        width,
        height,
      }}
      onClick={handleClick}
    >
      {/* Content layer */}
      <svg width={width} height={height}>
        {/* Background */}
        <rect width={width} height={height} fill="var(--canvas-bg)" />

        {/* Nodes */}
        <g transform={`translate(${CONTENT_INSET}, ${CONTENT_INSET})`}>
          {visibleNodes.map((node) => {
            const x = (node.position.x - bounds.minX) * scale;
            const y = (node.position.y - bounds.minY) * scale;
            const w = node.size.width * scale;
            const h = node.size.height * scale;
            const nodeStyle = resolveMiniMapNodeStyle(MINI_MAP_NODE_STYLE_REGISTRY, node.type);

            return (
              <rect
                key={node.id}
                x={x}
                y={y}
                width={Math.max(w, 2)}
                height={Math.max(h, 2)}
                fill={nodeStyle.fill}
                opacity={nodeStyle.opacity ?? DEFAULT_NODE_OPACITY}
                rx={nodeStyle.radius ?? DEFAULT_NODE_RADIUS}
              />
            );
          })}
        </g>

        {/* Viewport indicator */}
        <rect
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          fill="none"
          stroke="var(--node-selected)"
          strokeWidth={2}
          opacity={0.8}
        />
      </svg>

      {/* Label */}
      <div
        className="absolute bottom-1 left-2 text-[10px] pointer-events-none"
        style={{ color: 'var(--toolbar-fg-secondary)' }}
      >
        {Math.round(viewport.zoom * 100)}%
      </div>
    </div>
  );
}
