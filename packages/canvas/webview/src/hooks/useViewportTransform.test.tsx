// @vitest-environment jsdom

import { act, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasViewport } from '@neko/canvas-domain';
import { useViewportTransform } from './useViewportTransform';

interface ViewportHarnessProps {
  readonly viewport: CanvasViewport;
  readonly onViewportChange: (viewport: Partial<CanvasViewport>) => void;
  readonly onParentContextMenu: () => void;
  readonly onContextMenuRequest: (event: ReactMouseEvent) => void;
  readonly disabled?: boolean;
}

function ViewportHarness({
  viewport,
  onViewportChange,
  onParentContextMenu,
  onContextMenuRequest,
  disabled = false,
}: ViewportHarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, handlers } = useViewportTransform({
    viewport,
    onViewportChange,
    containerRef,
    disabled,
  });

  return (
    <div onContextMenu={onParentContextMenu}>
      <div
        ref={containerRef}
        data-testid="viewport"
        data-panning={state.isPanning ? 'true' : 'false'}
        onMouseDown={handlers.onMouseDown}
        onMouseMove={handlers.onMouseMove}
        onMouseUp={(event) => {
          if (handlers.onMouseUp(event) === 'open-context-menu') {
            onContextMenuRequest(event);
          }
        }}
        onMouseLeave={handlers.onMouseLeave}
        onContextMenu={handlers.onContextMenu}
      >
        <div data-canvas-wheel-owner="content" data-testid="content-scroll-owner">
          <span data-testid="content-scroll-child" />
        </div>
      </div>
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
    disabled = false,
    onContextMenuRequest = vi.fn(),
  ) {
    act(() => {
      root.render(
        <ViewportHarness
          viewport={viewport}
          onViewportChange={onViewportChange}
          onParentContextMenu={onParentContextMenu}
          onContextMenuRequest={onContextMenuRequest}
          disabled={disabled}
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

  it('leaves ordinary wheel input inside Canvas content to its nested scroll owner', () => {
    const onViewportChange = vi.fn();
    const element = renderHarness(onViewportChange);
    const content = element.querySelector<HTMLElement>('[data-testid="content-scroll-child"]');
    if (!content) throw new Error('Content scroll child did not render');
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 40,
    });

    act(() => content.dispatchEvent(wheel));

    expect(wheel.defaultPrevented).toBe(false);
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it('keeps modifier wheel as Canvas zoom inside a nested content scroll owner', () => {
    const onViewportChange = vi.fn();
    const element = renderHarness(onViewportChange);
    const content = element.querySelector<HTMLElement>('[data-testid="content-scroll-child"]');
    if (!content) throw new Error('Content scroll child did not render');
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: 100,
      clientY: 80,
      deltaY: -100,
    });

    act(() => content.dispatchEvent(wheel));

    expect(wheel.defaultPrevented).toBe(true);
    expect(onViewportChange).toHaveBeenCalledTimes(1);
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

  it('does not pan or zoom while a modal preview owns Canvas input', () => {
    const onViewportChange = vi.fn();
    const element = renderHarness(
      onViewportChange,
      vi.fn(),
      { pan: { x: 20, y: 30 }, zoom: 2 },
      true,
    );

    act(() => {
      element.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -100,
        }),
      );
      element.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 2, clientX: 10, clientY: 20 }),
      );
      element.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, buttons: 2, clientX: 40, clientY: 50 }),
      );
    });

    expect(onViewportChange).not.toHaveBeenCalled();
    expect(element.dataset.panning).toBe('false');
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
      const earlyContextMenu = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
      });
      element.dispatchEvent(earlyContextMenu);
      expect(earlyContextMenu.defaultPrevented).toBe(true);
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
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    act(() => element.dispatchEvent(contextMenu));

    expect(onViewportChange).toHaveBeenLastCalledWith({ pan: { x: 50, y: 55 } });
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(onParentContextMenu).not.toHaveBeenCalled();
  });

  it('opens the existing menu owner only after a stationary right-button release', () => {
    const onParentContextMenu = vi.fn();
    const onContextMenuRequest = vi.fn();
    const element = renderHarness(
      vi.fn(),
      onParentContextMenu,
      { pan: { x: 20, y: 30 }, zoom: 2 },
      false,
      onContextMenuRequest,
    );
    const earlyContextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

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
      element.dispatchEvent(earlyContextMenu);
      element.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 2,
          clientX: 10,
          clientY: 20,
        }),
      );
    });
    const lateContextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    act(() => element.dispatchEvent(lateContextMenu));

    expect(earlyContextMenu.defaultPrevented).toBe(true);
    expect(lateContextMenu.defaultPrevented).toBe(true);
    expect(onParentContextMenu).not.toHaveBeenCalled();
    expect(onContextMenuRequest).toHaveBeenCalledTimes(1);
    expect(onContextMenuRequest.mock.calls[0]?.[0]).toMatchObject({ clientX: 10, clientY: 20 });
  });

  it('treats sub-threshold right-pointer jitter as a click without moving the viewport', () => {
    const onViewportChange = vi.fn();
    const onContextMenuRequest = vi.fn();
    const element = renderHarness(
      onViewportChange,
      vi.fn(),
      { pan: { x: 20, y: 30 }, zoom: 2 },
      false,
      onContextMenuRequest,
    );

    act(() => {
      element.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 2, clientX: 10, clientY: 20 }),
      );
    });
    act(() => {
      element.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          buttons: 2,
          clientX: 12,
          clientY: 22,
        }),
      );
      element.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, button: 2, clientX: 12, clientY: 22 }),
      );
    });

    expect(onViewportChange).not.toHaveBeenCalled();
    expect(onContextMenuRequest).toHaveBeenCalledTimes(1);
  });

  it('allows keyboard-originated context-menu events to reach the existing owner', () => {
    const onParentContextMenu = vi.fn();
    const onContextMenuRequest = vi.fn();
    const element = renderHarness(
      vi.fn(),
      onParentContextMenu,
      { pan: { x: 20, y: 30 }, zoom: 2 },
      false,
      onContextMenuRequest,
    );
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    act(() => element.dispatchEvent(contextMenu));

    expect(contextMenu.defaultPrevented).toBe(false);
    expect(onParentContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenuRequest).not.toHaveBeenCalled();
  });
});
