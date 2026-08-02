import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CanvasGrid, resolveGridPattern } from './CanvasGrid';

describe('CanvasGrid', () => {
  it('renders a canvas-backed grid surface instead of SVG dot elements', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CanvasGrid, {
        viewport: { pan: { x: 12, y: 8 }, zoom: 1 },
        width: 640,
        height: 480,
      }),
    );

    expect(markup).toContain('<canvas');
    expect(markup).toContain('data-canvas-background="grid"');
    expect(markup).not.toContain('<circle');
    expect(markup).not.toContain('<svg');
  });

  it('keeps grid alignment derived from runtime viewport pan and zoom', () => {
    expect(resolveGridPattern({ pan: { x: 45, y: -15 }, zoom: 1 })).toEqual({
      gridSize: 20,
      offsetX: 5,
      offsetY: -15,
    });
    expect(resolveGridPattern({ pan: { x: 45, y: -15 }, zoom: 0.2 })).toEqual({
      gridSize: 16,
      offsetX: 13,
      offsetY: -15,
    });
  });
});
