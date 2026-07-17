/**
 * useNodeRotate - Hook for node rotation interactions
 * Handles mouse-based node rotation with angle snapping.
 * Calculates angle from mouse position relative to node center.
 */

import { useState, useEffect, useRef } from 'react';
import { useDrag } from '@neko/ui/hooks';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface UseNodeRotateOptions {
  nodeId: string;
  initialRotation: number;
  /** Node center in canvas coordinates (for angle calculation) */
  nodeCenter: { x: number; y: number };
  viewport: CanvasViewport;
  /** Container element for coordinate conversion */
  containerRef: React.RefObject<HTMLElement | null>;
  onRotate?: (nodeId: string, rotation: number) => void;
  onRotateEnd?: (nodeId: string, rotation: number) => void;
  disabled?: boolean;
}

export interface UseNodeRotateReturn {
  rotation: number;
  isRotating: boolean;
  startRotate: (e: React.MouseEvent) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Snap angle step when Shift is held (degrees) */
const SNAP_STEP = 15;

// =============================================================================
// Helpers
// =============================================================================

/** Convert screen coordinates to canvas coordinates */
function screenToCanvas(
  screenX: number,
  screenY: number,
  containerRect: DOMRect,
  viewport: CanvasViewport,
): { x: number; y: number } {
  return {
    x: (screenX - containerRect.left - viewport.pan.x) / viewport.zoom,
    y: (screenY - containerRect.top - viewport.pan.y) / viewport.zoom,
  };
}

/** Calculate angle in degrees from center to point (0° = up, clockwise) */
function angleBetween(center: { x: number; y: number }, point: { x: number; y: number }): number {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  // atan2 returns -π..π with 0 pointing right; convert to 0° = up, clockwise
  const radians = Math.atan2(dx, -dy);
  const degrees = (radians * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/** Snap angle to nearest step */
function snapAngle(angle: number, step: number): number {
  return Math.round(angle / step) * step;
}

// =============================================================================
// Context
// =============================================================================

interface RotateCtx {
  startAngle: number;
  startRotation: number;
  nodeCenter: { x: number; y: number };
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeRotate({
  nodeId,
  initialRotation,
  nodeCenter,
  viewport,
  containerRef,
  onRotate,
  onRotateEnd,
  disabled = false,
}: UseNodeRotateOptions): UseNodeRotateReturn {
  const [rotation, setRotation] = useState(initialRotation);
  const latestRotationRef = useRef(initialRotation);

  const updateRotation = (nextRotation: number) => {
    latestRotationRef.current = nextRotation;
    setRotation(nextRotation);
  };

  const { isDragging: isRotating, bindDrag } = useDrag<RotateCtx>({
    onStart: (e) => {
      if (disabled) return undefined;
      const container = containerRef.current;
      if (!container) return undefined;

      const rect = container.getBoundingClientRect();
      const mouseCanvas = screenToCanvas(e.clientX, e.clientY, rect, viewport);
      const mouseAngle = angleBetween(nodeCenter, mouseCanvas);

      return {
        startAngle: mouseAngle,
        startRotation: rotation,
        nodeCenter: { ...nodeCenter },
      };
    },
    onMove: (e, ctx) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseCanvas = screenToCanvas(e.clientX, e.clientY, rect, viewport);
      const currentAngle = angleBetween(ctx.nodeCenter, mouseCanvas);

      let delta = currentAngle - ctx.startAngle;
      // Normalize delta to -180..180
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      let newRotation = ctx.startRotation + delta;

      // Shift key: snap to 15° increments
      if (e.shiftKey) {
        newRotation = snapAngle(newRotation, SNAP_STEP);
      }

      // Normalize to 0..360
      newRotation = ((newRotation % 360) + 360) % 360;

      updateRotation(newRotation);
      onRotate?.(nodeId, newRotation);
    },
    onEnd: () => {
      onRotateEnd?.(nodeId, latestRotationRef.current);
    },
  });

  // Sync from external updates when not rotating
  useEffect(() => {
    if (!isRotating) {
      updateRotation(initialRotation);
    }
  }, [initialRotation, isRotating]);

  return {
    rotation,
    isRotating,
    startRotate: bindDrag.onMouseDown,
  };
}
