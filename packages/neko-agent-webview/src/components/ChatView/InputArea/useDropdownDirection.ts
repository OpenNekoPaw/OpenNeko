/**
 * useDropdownDirection — auto-detect available space and choose
 * whether a dropdown should open upward or downward.
 */

import { useCallback, type RefObject } from 'react';

export type DropdownDirection = 'up' | 'down';
export type DropdownAlignment = 'start' | 'end';

export interface DropdownPlacement {
  readonly direction: DropdownDirection;
  readonly alignment: DropdownAlignment;
}

export interface DropdownPlacementOptions {
  readonly preferredDirection?: DropdownDirection;
  readonly estimatedWidth?: number;
  readonly boundarySelector?: string;
}

interface DropdownPlacementRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const DEFAULT_DROPDOWN_WIDTH = 220;
const DEFAULT_EDGE_GAP = 8;
const DEFAULT_VERTICAL_THRESHOLD = 200;
const DEFAULT_BOUNDARY_SELECTOR = '.agent-composer-shell, .agent-composer-rail';

/**
 * Measure trigger element position relative to viewport and determine
 * dropdown placement to avoid clipping.
 *
 * Returns a function that computes placement on demand (call it on open).
 */
export function useDropdownPlacement(
  triggerRef: RefObject<HTMLElement | null>,
  options: DropdownPlacementOptions = {},
): () => DropdownPlacement {
  const {
    preferredDirection = 'down',
    estimatedWidth = DEFAULT_DROPDOWN_WIDTH,
    boundarySelector = DEFAULT_BOUNDARY_SELECTOR,
  } = options;

  return useCallback(() => {
    const el = triggerRef.current;
    if (!el) return { direction: preferredDirection, alignment: 'start' };

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const boundaryRect = resolveBoundaryRect(el, boundarySelector);
    return resolveDropdownPlacement({
      triggerRect: rect,
      boundaryRect,
      viewportHeight,
      preferredDirection,
      estimatedWidth,
    });
  }, [boundarySelector, estimatedWidth, preferredDirection, triggerRef]);
}

/** CSS class helpers for dropdown positioning */
export function dropdownPositionClass(placement: DropdownDirection | DropdownPlacement): string {
  const direction = typeof placement === 'string' ? placement : placement.direction;
  const alignment = typeof placement === 'string' ? 'start' : placement.alignment;
  const verticalClass = direction === 'down' ? 'top-full mt-0.5' : 'bottom-full mb-1';
  const horizontalClass = alignment === 'end' ? 'right-0' : 'left-0';
  return `${verticalClass} ${horizontalClass}`;
}

export function resolveDropdownPlacement(input: {
  readonly triggerRect: DropdownPlacementRect;
  readonly boundaryRect: DropdownPlacementRect;
  readonly viewportHeight: number;
  readonly preferredDirection: DropdownDirection;
  readonly estimatedWidth: number;
}): DropdownPlacement {
  const spaceAbove = input.triggerRect.top;
  const spaceBelow = input.viewportHeight - input.triggerRect.bottom;

  // If preferred direction has enough space, use it; otherwise pick the side with more room.
  const direction =
    input.preferredDirection === 'down' && spaceBelow >= DEFAULT_VERTICAL_THRESHOLD
      ? 'down'
      : input.preferredDirection === 'up' && spaceAbove >= DEFAULT_VERTICAL_THRESHOLD
        ? 'up'
        : spaceBelow >= spaceAbove
          ? 'down'
          : 'up';
  const startRight = input.triggerRect.left + input.estimatedWidth;
  const endLeft = input.triggerRect.right - input.estimatedWidth;
  const startOverflowsRight = startRight > input.boundaryRect.right - DEFAULT_EDGE_GAP;
  const endOverflowsLeft = endLeft < input.boundaryRect.left + DEFAULT_EDGE_GAP;
  const alignment = startOverflowsRight && !endOverflowsLeft ? 'end' : 'start';

  return { direction, alignment };
}

function resolveBoundaryRect(el: HTMLElement, boundarySelector: string): DOMRect {
  const boundary = el.closest(boundarySelector);
  if (boundary instanceof HTMLElement) {
    return boundary.getBoundingClientRect();
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}
