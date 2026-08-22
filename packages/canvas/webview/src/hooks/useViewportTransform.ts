/**
 * useViewportTransform - Viewport transformation hook
 * Handles pan (drag and wheel) and explicit modifier-wheel zoom operations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type React from 'react';
import type { CanvasViewport } from '@neko/canvas-domain';

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
const CANVAS_CONTENT_WHEEL_OWNER_SELECTOR = '[data-canvas-wheel-owner="content"]';

// =============================================================================
// Types
// =============================================================================

export interface ViewportTransformState {
  isPanning: boolean;
  startPan: { x: number; y: number };
  startViewport: CanvasViewport;
}

export type ViewportPointerReleaseDisposition = 'none' | 'pan-ended' | 'open-context-menu';

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
  /** Suspends all Canvas viewport input while a modal surface owns interaction. */
  disabled?: boolean;
}

export interface UseViewportTransformReturn {
  state: ViewportTransformState;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => ViewportPointerReleaseDisposition;
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
    disabled = false,
  } = options;

  // State
  const [state, setState] = useState<ViewportTransformState>({
    isPanning: false,
    startPan: { x: 0, y: 0 },
    startViewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  });
  const rightPanStartRef = useRef<{ x: number; y: number } | null>(null);
  const rightPanActivatedRef = useRef(false);

  // Mouse down - start panning
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      // Pan with: right/middle mouse button, space + left click, or hand tool mode.
      const shouldPan =
        e.button === RIGHT_BUTTON ||
        e.button === 1 ||
        (e.button === 0 && (isSpacePanActive || isPanMode));

      if (!shouldPan) return;

      e.preventDefault();

      if (e.button === RIGHT_BUTTON) {
        rightPanStartRef.current = { x: e.clientX, y: e.clientY };
        rightPanActivatedRef.current = false;
      } else {
        rightPanStartRef.current = null;
        rightPanActivatedRef.current = false;
      }

      setState({
        isPanning: true,
        startPan: { x: e.clientX, y: e.clientY },
        startViewport: { ...viewport },
      });
    },
    [disabled, viewport, isPanMode, isSpacePanActive],
  );

  // Mouse move - update pan
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      if (!state.isPanning) return;

      const deltaX = e.clientX - state.startPan.x;
      const deltaY = e.clientY - state.startPan.y;

      const rightPanStart = rightPanStartRef.current;
      if (rightPanStart && !rightPanActivatedRef.current) {
        if (
          Math.hypot(e.clientX - rightPanStart.x, e.clientY - rightPanStart.y) <
          RIGHT_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        rightPanActivatedRef.current = true;
      }

      onViewportChange({
        pan: {
          x: state.startViewport.pan.x + deltaX,
          y: state.startViewport.pan.y + deltaY,
        },
      });
    },
    [disabled, state.isPanning, state.startPan, state.startViewport, onViewportChange],
  );

  // Mouse up - end panning
  const onMouseUp = useCallback(
    (e: React.MouseEvent): ViewportPointerReleaseDisposition => {
      const wasRightPointerGesture = rightPanStartRef.current !== null;
      const wasRightPan = rightPanActivatedRef.current;
      rightPanStartRef.current = null;
      rightPanActivatedRef.current = false;

      if (state.isPanning) {
        setState((prev) => ({ ...prev, isPanning: false }));
      }
      if (wasRightPointerGesture && e.button === RIGHT_BUTTON) {
        return wasRightPan ? 'pan-ended' : 'open-context-menu';
      }
      return state.isPanning ? 'pan-ended' : 'none';
    },
    [state.isPanning],
  );

  // Mouse leave - end panning
  const onMouseLeave = useCallback(() => {
    rightPanStartRef.current = null;
    rightPanActivatedRef.current = false;
    if (state.isPanning) {
      setState((prev) => ({ ...prev, isPanning: false }));
    }
  }, [state.isPanning]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      if (e.button !== RIGHT_BUTTON) return;

      e.preventDefault();
      e.stopPropagation();
    },
    [disabled],
  );

  useEffect(() => {
    if (!disabled) return;
    rightPanStartRef.current = null;
    rightPanActivatedRef.current = false;
    if (state.isPanning) {
      setState((current) => ({ ...current, isPanning: false }));
    }
  }, [disabled, state.isPanning]);

  // Wheel - pan by default, zoom only for explicit modifier/pinch gestures.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const handleWheel = (e: WheelEvent) => {
      if (shouldDeferWheelToCanvasContent(e, container)) return;

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
  }, [containerRef, disabled, minZoom, maxZoom]);

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

function shouldDeferWheelToCanvasContent(
  event: Pick<WheelEvent, 'target' | 'ctrlKey' | 'metaKey'>,
  container: HTMLElement,
): boolean {
  if (event.ctrlKey || event.metaKey || !(event.target instanceof Element)) return false;
  const owner = event.target.closest(CANVAS_CONTENT_WHEEL_OWNER_SELECTOR);
  return owner !== null && container.contains(owner);
}

function normalizeWheelDelta(delta: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return delta * WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === 2) return delta * pageHeight;
  return delta;
}
