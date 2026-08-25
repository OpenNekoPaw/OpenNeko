// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CanvasGrid, resolveGridPattern } from './CanvasGrid';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

  it('repaints the same canvas from current tokens when the root theme changes', async () => {
    const paintedBackgrounds: string[] = [];
    const context = {
      fillStyle: '',
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(() => paintedBackgrounds.push(String(context.fillStyle))),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      const light = document.documentElement.dataset.nekoTheme === 'light';
      const tokens: Readonly<Record<string, string>> = light
        ? {
            '--canvas-bg': '#f8f8f7',
            '--canvas-grid': '#d8d8d4',
            '--canvas-grid-major': '#c5c5bf',
          }
        : {
            '--canvas-bg': '#1e1e1e',
            '--canvas-grid': '#333333',
            '--canvas-grid-major': '#3f3f3f',
          };
      return {
        getPropertyValue: (name: string) => tokens[name] ?? '',
      } as unknown as CSSStyleDeclaration;
    });

    document.documentElement.dataset.nekoTheme = 'dark';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CanvasGrid viewport={{ pan: { x: 12, y: 8 }, zoom: 1 }} width={640} height={480} />,
      );
    });
    const mountedCanvas = container.querySelector('canvas');
    expect(mountedCanvas).toBeTruthy();
    expect(paintedBackgrounds).toEqual(['#1e1e1e']);

    await act(async () => {
      document.documentElement.dataset.nekoTheme = 'light';
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('canvas')).toBe(mountedCanvas);
    expect(paintedBackgrounds).toEqual(['#1e1e1e', '#f8f8f7']);

    await act(async () => root.unmount());
    const paintCountAfterUnmount = paintedBackgrounds.length;
    document.documentElement.dataset.nekoTheme = 'dark';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(paintedBackgrounds).toHaveLength(paintCountAfterUnmount);

    container.remove();
    vi.restoreAllMocks();
  });
});
