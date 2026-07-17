/**
 * useMarqueeSelect - Hook for rectangular marquee (box) selection
 * Allows selecting multiple nodes by dragging a selection rectangle on empty canvas area.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasNode, CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface MarqueeRect {
  /** Top-left x in screen coordinates */
  x: number;
  /** Top-left y in screen coordinates */
  y: number;
  width: number;
  height: number;
}

export interface UseMarqueeSelectOptions {
  viewport: CanvasViewport;
  containerRef: React.RefObject<HTMLElement | null>;
  nodes: CanvasNode[];
  /** Called with IDs of nodes intersecting the selection rectangle */
  onSelect?: (nodeIds: string[], additive: boolean) => void;
  /** Disable marquee selection (e.g. when panning) */
  enabled?: boolean;
}

export interface UseMarqueeSelectReturn {
  /** Current marquee rectangle in screen coordinates (null when not selecting) */
  marqueeRect: MarqueeRect | null;
  isSelecting: boolean;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
  };
}

// =============================================================================
// Helpers
// =============================================================================

/** Minimum drag distance (pixels) before marquee activates */
const MIN_DRAG_DISTANCE = 5;

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Check if two AABBs intersect */
function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Convert screen rect to canvas coordinates */
function screenRectToCanvas(
  rect: MarqueeRect,
  containerRect: DOMRect,
  viewport: CanvasViewport,
): Rect {
  const x1 = (rect.x - containerRect.left - viewport.pan.x) / viewport.zoom;
  const y1 = (rect.y - containerRect.top - viewport.pan.y) / viewport.zoom;
  const x2 = (rect.x + rect.width - containerRect.left - viewport.pan.x) / viewport.zoom;
  const y2 = (rect.y + rect.height - containerRect.top - viewport.pan.y) / viewport.zoom;
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

/** Get node AABB in canvas coordinates */
function getNodeRect(node: CanvasNode): Rect {
  return {
    minX: node.position.x,
    minY: node.position.y,
    maxX: node.position.x + node.size.width,
    maxY: node.position.y + node.size.height,
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useMarqueeSelect({
  viewport,
  containerRef,
  nodes,
  onSelect,
  enabled = true,
}: UseMarqueeSelectOptions): UseMarqueeSelectReturn {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const isAdditiveRef = useRef(false);
  const activatedRef = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      // Only respond to left-click on empty canvas background
      if (e.button !== 0) return;

      // Check if click is on a node or control — if so, skip
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-node-id]') ||
        target.closest('[data-port-id]') ||
        target.closest('.connection-group') ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea')
      ) {
        return;
      }

      startRef.current = { x: e.clientX, y: e.clientY };
      isAdditiveRef.current = e.shiftKey;
      activatedRef.current = false;
    },
    [enabled],
  );

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!startRef.current) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    // Don't activate until minimum drag distance
    if (!activatedRef.current) {
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DRAG_DISTANCE) return;
      activatedRef.current = true;
      setIsSelecting(true);
    }

    const x = Math.min(startRef.current.x, e.clientX);
    const y = Math.min(startRef.current.y, e.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);

    setMarqueeRect({ x, y, width, height });
  }, []);

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!startRef.current) return;

      if (activatedRef.current && marqueeRect) {
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const selectionCanvasRect = screenRectToCanvas(marqueeRect, containerRect, viewport);

          const intersectedIds = nodes
            .filter((node) => rectsIntersect(selectionCanvasRect, getNodeRect(node)))
            .map((node) => node.id);

          if (intersectedIds.length > 0 || !isAdditiveRef.current) {
            onSelect?.(intersectedIds, e.shiftKey || isAdditiveRef.current);
          }
        }
      }

      startRef.current = null;
      activatedRef.current = false;
      setIsSelecting(false);
      setMarqueeRect(null);
    },
    [marqueeRect, containerRef, viewport, nodes, onSelect],
  );

  // Clean up on unmount or when selection is interrupted
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (startRef.current && activatedRef.current) {
        startRef.current = null;
        activatedRef.current = false;
        setIsSelecting(false);
        setMarqueeRect(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return {
    marqueeRect,
    isSelecting,
    handlers: { onMouseDown, onMouseMove, onMouseUp },
  };
}
