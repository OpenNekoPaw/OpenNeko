/**
 * Viewport Math - Screen ↔ Canvas coordinate conversion utilities
 */

import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface Point {
  x: number;
  y: number;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Convert screen coordinates to canvas coordinates.
 * Accounts for viewport pan, zoom, and container offset.
 */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  viewport: CanvasViewport,
  containerRect: DOMRect,
): Point {
  const cx = (screenX - containerRect.left - viewport.pan.x) / viewport.zoom;
  const cy = (screenY - containerRect.top - viewport.pan.y) / viewport.zoom;
  return { x: Math.round(cx), y: Math.round(cy) };
}

/**
 * Get canvas coordinates of the viewport center.
 */
export function getViewportCenter(
  containerWidth: number,
  containerHeight: number,
  viewport: CanvasViewport,
): Point {
  const cx = (containerWidth / 2 - viewport.pan.x) / viewport.zoom;
  const cy = (containerHeight / 2 - viewport.pan.y) / viewport.zoom;
  return { x: Math.round(cx), y: Math.round(cy) };
}
