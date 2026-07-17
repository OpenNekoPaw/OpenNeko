/**
 * useViewportTransform - Viewport transformation hook
 * Handles pan (drag and wheel) and explicit modifier-wheel zoom operations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type React from 'react';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Constants
// =============================================================================

/** 最小缩放比例 (5%) */
export const MIN_ZOOM = 0.05;
/** 最大缩放比例 (1600%) */
export const MAX_ZOOM = 16;
/** 滚轮缩放灵敏度 */
const ZOOM_WHEEL_SENSITIVITY = 0.001;
const RIGHT_BUTTON = 2;
const RIGHT_DRAG_THRESHOLD_PX = 4;
const WHEEL_LINE_HEIGHT_PX = 16;

// =============================================================================
// Types
// =============================================================================

export interface ViewportTransformState {
  isPanning: boolean;
  startPan: { x: number; y: number };
  startViewport: CanvasViewport;
}

export interface UseViewportTransformOptions {
  viewport: CanvasViewport;
  onViewportChange: (viewport: Partial<CanvasViewport>) => void;
  containerRef: React.RefObject<HTMLElement | null>;
  minZoom?: number;
  maxZoom?: number;
  /** When true, left-button drag pans the canvas (hand tool mode) */
  isPanMode?: boolean;
  /** When true, left-button drag temporarily pans the canvas while Space is held. */
  isSpacePanActive?: boolean;
}

export interface UseViewportTransformReturn {
  state: ViewportTransformState;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
  panTo: (position: { x: number; y: number }) => void;
  zoomTo: (zoom: number, center?: { x: number; y: number }) => void;
  fitContent: (
    bounds: { x: number; y: number; width: number; height: number },
    containerSize: { width: number; height: number },
  ) => void;
  resetViewport: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useViewportTransform(
  options: UseViewportTransformOptions,
): UseViewportTransformReturn {
  const {
    viewport,
    onViewportChange,
    containerRef,
    minZoom = MIN_ZOOM,
    maxZoom = MAX_ZOOM,
    isPanMode = false,
    isSpacePanActive = false,
  } = options;

  // State
  const [state, setState] = useState<ViewportTransformState>({
    isPanning: false,
    startPan: { x: 0, y: 0 },
    startViewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  });
  const rightPanStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressContextMenuRef = useRef(false);

  // Mouse down - start panning
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Pan with: right/middle mouse button, space + left click, or hand tool mode.
      const shouldPan =
        e.button === RIGHT_BUTTON ||
        e.button === 1 ||
        (e.button === 0 && (isSpacePanActive || isPanMode));

      if (!shouldPan) return;

      e.preventDefault();

      if (e.button === RIGHT_BUTTON) {
        rightPanStartRef.current = { x: e.clientX, y: e.clientY };
        suppressContextMenuRef.current = false;
      } else {
        rightPanStartRef.current = null;
      }

      setState({
        isPanning: true,
        startPan: { x: e.clientX, y: e.clientY },
        startViewport: { ...viewport },
      });
    },
    [viewport, isPanMode, isSpacePanActive],
  );

  // Mouse move - update pan
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!state.isPanning) return;

      const deltaX = e.clientX - state.startPan.x;
      const deltaY = e.clientY - state.startPan.y;

      const rightPanStart = rightPanStartRef.current;
      if (
        rightPanStart &&
        Math.hypot(e.clientX - rightPanStart.x, e.clientY - rightPanStart.y) >=
          RIGHT_DRAG_THRESHOLD_PX
      ) {
        suppressContextMenuRef.current = true;
      }

      onViewportChange({
        pan: {
          x: state.startViewport.pan.x + deltaX,
          y: state.startViewport.pan.y + deltaY,
        },
      });
    },
    [state.isPanning, state.startPan, state.startViewport, onViewportChange],
  );

  // Mouse up - end panning
  const onMouseUp = useCallback(() => {
    if (state.isPanning) {
      setState((prev) => ({ ...prev, isPanning: false }));
    }
  }, [state.isPanning]);

  // Mouse leave - end panning
  const onMouseLeave = useCallback(() => {
    if (state.isPanning) {
      setState((prev) => ({ ...prev, isPanning: false }));
    }
  }, [state.isPanning]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!suppressContextMenuRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    suppressContextMenuRef.current = false;
  }, []);

  // Wheel - pan by default, zoom only for explicit modifier/pinch gestures.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const vp = viewportRef.current;

      if (!e.ctrlKey && !e.metaKey) {
        let deltaX = normalizeWheelDelta(e.deltaX, e.deltaMode, container.clientHeight);
        let deltaY = normalizeWheelDelta(e.deltaY, e.deltaMode, container.clientHeight);
        if (e.shiftKey && deltaX === 0) {
          deltaX = deltaY;
          deltaY = 0;
        }
        onViewportChangeRef.current({
          pan: {
            x: vp.pan.x - deltaX,
            y: vp.pan.y - deltaY,
          },
        });
        return;
      }

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = -e.deltaY * ZOOM_WHEEL_SENSITIVITY;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, vp.zoom * (1 + delta)));

      const zoomRatio = newZoom / vp.zoom;
      const newPanX = mouseX - (mouseX - vp.pan.x) * zoomRatio;
      const newPanY = mouseY - (mouseY - vp.pan.y) * zoomRatio;

      onViewportChangeRef.current({
        zoom: newZoom,
        pan: { x: newPanX, y: newPanY },
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef, minZoom, maxZoom]);

  // Programmatic pan
  const panTo = useCallback(
    (position: { x: number; y: number }) => {
      onViewportChange({ pan: position });
    },
    [onViewportChange],
  );

  // Programmatic zoom
  const zoomTo = useCallback(
    (zoom: number, center?: { x: number; y: number }) => {
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));

      if (center) {
        const zoomRatio = clampedZoom / viewport.zoom;
        const newPanX = center.x - (center.x - viewport.pan.x) * zoomRatio;
        const newPanY = center.y - (center.y - viewport.pan.y) * zoomRatio;
        onViewportChange({ zoom: clampedZoom, pan: { x: newPanX, y: newPanY } });
      } else {
        onViewportChange({ zoom: clampedZoom });
      }
    },
    [viewport, minZoom, maxZoom, onViewportChange],
  );

  // Fit content in view
  const fitContent = useCallback(
    (
      bounds: { x: number; y: number; width: number; height: number },
      containerSize: { width: number; height: number },
    ) => {
      if (bounds.width === 0 || bounds.height === 0) {
        onViewportChange({ pan: { x: 0, y: 0 }, zoom: 1 });
        return;
      }

      const padding = 50;
      const availableWidth = containerSize.width - padding * 2;
      const availableHeight = containerSize.height - padding * 2;

      const scaleX = availableWidth / bounds.width;
      const scaleY = availableHeight / bounds.height;
      const zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(scaleX, scaleY)));

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      const panX = containerSize.width / 2 - centerX * zoom;
      const panY = containerSize.height / 2 - centerY * zoom;

      onViewportChange({ zoom, pan: { x: panX, y: panY } });
    },
    [minZoom, maxZoom, onViewportChange],
  );

  // Reset viewport
  const resetViewport = useCallback(() => {
    onViewportChange({ pan: { x: 0, y: 0 }, zoom: 1 });
  }, [onViewportChange]);

  return {
    state,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      onContextMenu,
    },
    panTo,
    zoomTo,
    fitContent,
    resetViewport,
  };
}

function normalizeWheelDelta(delta: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return delta * WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === 2) return delta * pageHeight;
  return delta;
}
