/**
 * useNodeDrag - Hook for node drag interactions
 * Handles mouse-based node dragging with canvas coordinate conversion
 */

import { useCallback, useState, useEffect } from 'react';
import { useDrag } from '@neko/ui/hooks';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface UseNodeDragOptions {
  nodeId: string;
  initialPosition: { x: number; y: number };
  viewport: CanvasViewport;
  onDragStart?: (nodeId: string) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  disabled?: boolean;
}

export interface UseNodeDragReturn {
  position: { x: number; y: number };
  isDragging: boolean;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
  };
}

// =============================================================================
// Context
// =============================================================================

interface NodeDragCtx {
  startX: number;
  startY: number;
  posX: number;
  posY: number;
  zoom: number;
}

const SCROLLBAR_HIT_SIZE_PX = 18;
const DRAG_BLOCK_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'a[href]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="slider"]',
  '[role="textbox"]',
  '[data-node-drag-block="true"]',
].join(',');
const DRAG_ALLOW_SELECTOR = '[data-node-drag-allow="true"]';

export interface NodeDragStartDecision {
  readonly canStart: boolean;
  readonly stopPropagation: boolean;
}

function isElement(value: EventTarget | null): value is Element {
  return value instanceof Element;
}

function isInsideScrollableScrollbar(target: Element, event: MouseEvent): boolean {
  let current: Element | null = target;
  while (current) {
    if (current instanceof HTMLElement) {
      const canScrollX = current.scrollWidth > current.clientWidth;
      const canScrollY = current.scrollHeight > current.clientHeight;
      if (canScrollX || canScrollY) {
        const rect = current.getBoundingClientRect();
        const inHorizontalScrollbar =
          canScrollX &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.bottom - SCROLLBAR_HIT_SIZE_PX &&
          event.clientY <= rect.bottom;
        const inVerticalScrollbar =
          canScrollY &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom &&
          event.clientX >= rect.right - SCROLLBAR_HIT_SIZE_PX &&
          event.clientX <= rect.right;
        if (inHorizontalScrollbar || inVerticalScrollbar) {
          return true;
        }
      }
    }
    current = current.parentElement;
  }
  return false;
}

export function shouldStartNodeDrag(event: MouseEvent): boolean {
  return getNodeDragStartDecision(event).canStart;
}

export function getNodeDragStartDecision(event: MouseEvent): NodeDragStartDecision {
  if (!isElement(event.target)) {
    return { canStart: true, stopPropagation: false };
  }
  if (event.target.closest(DRAG_BLOCK_SELECTOR) && !event.target.closest(DRAG_ALLOW_SELECTOR)) {
    return { canStart: false, stopPropagation: true };
  }
  if (isInsideScrollableScrollbar(event.target, event)) {
    return { canStart: false, stopPropagation: true };
  }
  return { canStart: true, stopPropagation: false };
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeDrag({
  nodeId,
  initialPosition,
  viewport,
  onDragStart,
  onDrag,
  onDragEnd,
  disabled = false,
}: UseNodeDragOptions): UseNodeDragReturn {
  const [position, setPosition] = useState(initialPosition);

  const { isDragging, bindDrag } = useDrag<NodeDragCtx>({
    onStart: (e) => {
      if (disabled || e.button !== 0) return undefined;
      if (!shouldStartNodeDrag(e)) return undefined;
      onDragStart?.(nodeId);
      return {
        startX: e.clientX,
        startY: e.clientY,
        posX: position.x,
        posY: position.y,
        zoom: viewport.zoom,
      };
    },
    onMove: (e, ctx) => {
      const newPosition = {
        x: ctx.posX + (e.clientX - ctx.startX) / ctx.zoom,
        y: ctx.posY + (e.clientY - ctx.startY) / ctx.zoom,
      };
      setPosition(newPosition);
      onDrag?.(nodeId, newPosition);
    },
    onEnd: (e, ctx) => {
      const finalPosition = {
        x: ctx.posX + (e.clientX - ctx.startX) / ctx.zoom,
        y: ctx.posY + (e.clientY - ctx.startY) / ctx.zoom,
      };
      setPosition(finalPosition);
      onDragEnd?.(nodeId, finalPosition);
    },
  });

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      const decision = getNodeDragStartDecision(event.nativeEvent);
      if (!decision.canStart) {
        if (decision.stopPropagation) {
          event.stopPropagation();
        }
        return;
      }
      bindDrag.onMouseDown(event);
    },
    [bindDrag],
  );

  // Update position when initialPosition changes (external update)
  useEffect(() => {
    if (!isDragging) {
      setPosition(initialPosition);
    }
  }, [initialPosition, isDragging]);

  return {
    position,
    isDragging,
    handlers: {
      onMouseDown: handleMouseDown,
    },
  };
}
