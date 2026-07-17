/**
 * useNodeResize - Hook for node resize interactions
 * Handles mouse-based node resizing with canvas coordinate conversion.
 * Supports 8 resize handles (corners + edges).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDrag } from '@neko/ui/hooks';
import type { CanvasViewport } from '@neko/shared';
import { DEFAULT_NODE_MIN_SIZE } from '../utils/nodeSizing';

// =============================================================================
// Types
// =============================================================================

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface UseNodeResizeOptions {
  nodeId: string;
  initialSize: { width: number; height: number };
  initialPosition: { x: number; y: number };
  viewport: CanvasViewport;
  minWidth?: number;
  minHeight?: number;
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  disabled?: boolean;
}

export interface UseNodeResizeReturn {
  size: { width: number; height: number };
  position: { x: number; y: number };
  isResizing: boolean;
  startResize: (handle: ResizeHandle, e: React.MouseEvent) => void;
}

// =============================================================================
// Context
// =============================================================================

interface ResizeCtx {
  handle: ResizeHandle;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startPosX: number;
  startPosY: number;
  zoom: number;
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeResize({
  nodeId,
  initialSize,
  initialPosition,
  viewport,
  minWidth = DEFAULT_NODE_MIN_SIZE.width,
  minHeight = DEFAULT_NODE_MIN_SIZE.height,
  onResize,
  onResizeEnd,
  disabled = false,
}: UseNodeResizeOptions): UseNodeResizeReturn {
  const [size, setSize] = useState(initialSize);
  const [position, setPosition] = useState(initialPosition);

  const pendingHandleRef = useRef<ResizeHandle | null>(null);
  const latestPreviewRef = useRef({ size: initialSize, position: initialPosition });

  const updatePreview = useCallback(
    (nextSize: { width: number; height: number }, nextPosition: { x: number; y: number }) => {
      latestPreviewRef.current = { size: nextSize, position: nextPosition };
      setSize(nextSize);
      setPosition(nextPosition);
    },
    [],
  );

  const { isDragging: isResizing, bindDrag } = useDrag<ResizeCtx>({
    onStart: (e) => {
      if (disabled || !pendingHandleRef.current) return undefined;
      return {
        handle: pendingHandleRef.current,
        startX: e.clientX,
        startY: e.clientY,
        startW: size.width,
        startH: size.height,
        startPosX: position.x,
        startPosY: position.y,
        zoom: viewport.zoom,
      };
    },
    onMove: (e, ctx) => {
      const dx = (e.clientX - ctx.startX) / ctx.zoom;
      const dy = (e.clientY - ctx.startY) / ctx.zoom;

      let newW = ctx.startW;
      let newH = ctx.startH;
      let newX = ctx.startPosX;
      let newY = ctx.startPosY;

      // Horizontal
      if (ctx.handle.includes('e')) {
        newW = Math.max(minWidth, ctx.startW + dx);
      } else if (ctx.handle.includes('w')) {
        const dw = Math.min(dx, ctx.startW - minWidth);
        newW = ctx.startW - dw;
        newX = ctx.startPosX + dw;
      }

      // Vertical
      if (ctx.handle.includes('s')) {
        newH = Math.max(minHeight, ctx.startH + dy);
      } else if (ctx.handle.includes('n')) {
        const dh = Math.min(dy, ctx.startH - minHeight);
        newH = ctx.startH - dh;
        newY = ctx.startPosY + dh;
      }

      const newSize = { width: newW, height: newH };
      const newPos = { x: newX, y: newY };
      updatePreview(newSize, newPos);
      onResize?.(nodeId, newSize, newPos);
    },
    onEnd: () => {
      pendingHandleRef.current = null;
      const latest = latestPreviewRef.current;
      onResizeEnd?.(nodeId, latest.size, latest.position);
    },
  });

  // Sync from external updates when not resizing
  useEffect(() => {
    if (!isResizing) {
      updatePreview(initialSize, initialPosition);
    }
  }, [initialSize, initialPosition, isResizing, updatePreview]);

  const startResize = useCallback(
    (handle: ResizeHandle, e: React.MouseEvent) => {
      if (disabled) return;
      pendingHandleRef.current = handle;
      bindDrag.onMouseDown(e);
    },
    [disabled, bindDrag],
  );

  return { size, position, isResizing, startResize };
}
