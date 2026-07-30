/**
 * CanvasViewport - Viewport transformation layer
 * Applies pan and zoom transformations to child elements
 */

import type { ReactNode } from 'react';
import type { CanvasViewport as ViewportType } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface CanvasViewportProps {
  viewport: ViewportType;
  children: ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function CanvasViewport({ viewport, children }: CanvasViewportProps) {
  const { pan, zoom } = viewport;

  return (
    <div
      data-canvas-viewport-layer
      className="absolute inset-0 origin-top-left"
      style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
}
