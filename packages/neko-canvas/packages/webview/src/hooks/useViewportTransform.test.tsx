// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasViewport } from '@neko/shared';
import { useViewportTransform } from './useViewportTransform';

interface ViewportHarnessProps {
  readonly viewport: CanvasViewport;
  readonly onViewportChange: (viewport: Partial<CanvasViewport>) => void;
  readonly onParentContextMenu: () => void;
}

function ViewportHarness({
  viewport,
  onViewportChange,
  onParentContextMenu,
}: ViewportHarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, handlers } = useViewportTransform({
    viewport,
    onViewportChange,
    containerRef,
  });

  return (
    <div onContextMenu={onParentContextMenu}>
      <div
        ref={containerRef}
        data-testid="viewport"
        data-panning={state.isPanning ? 'true' : 'false'}
        onMouseDown={handlers.onMouseDown}
        onMouseMove={handlers.onMouseMove}
        onMouseUp={handlers.onMouseUp}
        onMouseLeave={handlers.onMouseLeave}
        onContextMenu={handlers.onContextMenu}
      />
    </div>
  );
}

describe('useViewportTransform', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function renderHarness(
    onViewportChange = vi.fn(),
    onParentContextMenu = vi.fn(),
    viewport: CanvasViewport = { pan: { x: 20, y: 30 }, zoom: 2 },
  ) {
    act(() => {
      root.render(
        <ViewportHarness
          viewport={viewport}
          onViewportChange={onViewportChange}
          onParentContextMenu={onParentContextMenu}
        />,
      );
    });
    const element = host.querySelector<HTMLDivElement>('[data-testid="viewport"]');
    if (!element) throw new Error('Viewport harness did not render');
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 });
    element.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 400,
      left: 0,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    });
    return element;
  }

  it('pans from ordinary horizontal and vertical wheel deltas without changing zoom', () => {
    const onViewportChange = vi.fn();
    const element = renderHarness(onViewportChange);
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: 12,
      deltaY: 40,
    });

    act(() => element.dispatchEvent(wheel));

    expect(wheel.defaultPrevented).toBe(true);
    expect(onViewportChange).toHaveBeenLastCalledWith({ pan: { x: 8, y: -10 } });
  });

  it('keeps pointer-anchored zoom for modifier wheel input', () => {
    const onViewportChange = vi.fn();
    const element = renderHarness(onViewportChange);

    act(() => {
      element.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          clientX: 100,
          clientY: 80,
          deltaY: -100,
        }),
      );
    });

    const update = onViewportChange.mock.lastCall?.[0] as Partial<CanvasViewport>;
    expect(update.zoom).toBeCloseTo(2.2);
    expect(update.pan?.x).toBeCloseTo(12);
    expect(update.pan?.y).toBeCloseTo(25);
  });

  it('pans with a right-button drag and consumes its following context menu', () => {
    const onViewportChange = vi.fn();
    const onParentContextMenu = vi.fn();
    const element = renderHarness(onViewportChange, onParentContextMenu);

    act(() => {
      element.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 10,
          clientY: 20,
        }),
      );
    });
    act(() => {
      element.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          buttons: 2,
          clientX: 40,
          clientY: 45,
        }),
      );
    });
    act(() => {
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 }));
    });
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => element.dispatchEvent(contextMenu));

    expect(onViewportChange).toHaveBeenLastCalledWith({ pan: { x: 50, y: 55 } });
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(onParentContextMenu).not.toHaveBeenCalled();
  });

  it('allows a stationary right click to reach the existing context-menu owner', () => {
    const onParentContextMenu = vi.fn();
    const element = renderHarness(vi.fn(), onParentContextMenu);

    act(() => {
      element.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 10,
          clientY: 20,
        }),
      );
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 }));
    });
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => element.dispatchEvent(contextMenu));

    expect(contextMenu.defaultPrevented).toBe(false);
    expect(onParentContextMenu).toHaveBeenCalledTimes(1);
  });
});
