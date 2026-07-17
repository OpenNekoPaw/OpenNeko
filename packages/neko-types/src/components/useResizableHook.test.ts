// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResizable, type UseResizableReturn } from './useResizable';

describe('useResizable hook lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: UseResizableReturn | null;
  let animationFrameId: number;
  let animationFrameCallbacks: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    latest = null;
    animationFrameId = 0;
    animationFrameCallbacks = new Map();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrameId += 1;
      animationFrameCallbacks.set(animationFrameId, callback);
      return animationFrameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrameCallbacks.delete(id);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  it('updates controlled size and ignores stale pointer IDs', () => {
    const onSizeChange = vi.fn();

    renderHarness({
      size: 240,
      onSizeChange,
      captureWidth: 800,
      captureHeight: 400,
    });

    const handle = getHandle();

    act(() => {
      latest?.handleProps.onPointerDown(createPointerEvent(handle, 1, 0, 0));
    });
    expect(latest?.isResizing).toBe(true);

    act(() => {
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 2, 650, 0));
    });
    expect(onSizeChange).not.toHaveBeenCalled();

    act(() => {
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 1, 650, 0));
    });

    expect(onSizeChange).not.toHaveBeenCalled();

    act(() => {
      flushAnimationFrames();
    });

    expect(onSizeChange).toHaveBeenLastCalledWith(250);
  });

  it('coalesces resize pointer movement to one animation-frame update', () => {
    const onSizeChange = vi.fn();

    renderHarness({
      size: 240,
      onSizeChange,
      captureWidth: 800,
      captureHeight: 400,
    });

    const handle = getHandle();

    act(() => {
      latest?.handleProps.onPointerDown(createPointerEvent(handle, 1, 0, 0));
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 1, 650, 0));
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 1, 620, 0));
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 1, 590, 0));
    });

    expect(onSizeChange).not.toHaveBeenCalled();
    expect(animationFrameCallbacks.size).toBe(1);

    act(() => {
      flushAnimationFrames();
    });

    expect(onSizeChange).toHaveBeenCalledTimes(1);
    expect(onSizeChange).toHaveBeenLastCalledWith(310);
  });

  it('flushes the latest resize value when pointer capture ends before animation frame', () => {
    const onSizeChange = vi.fn();

    renderHarness({
      size: 240,
      onSizeChange,
      captureWidth: 800,
      captureHeight: 400,
    });

    const handle = getHandle();

    act(() => {
      latest?.handleProps.onPointerDown(createPointerEvent(handle, 1, 0, 0));
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 1, 590, 0));
      latest?.handleProps.onPointerUp(createPointerEvent(handle, 1, 590, 0));
    });

    expect(onSizeChange).toHaveBeenCalledTimes(1);
    expect(onSizeChange).toHaveBeenLastCalledWith(310);
    expect(animationFrameCallbacks.size).toBe(0);
  });

  it('stops resizing on pointercancel and ignores later pointer movement', () => {
    const onSizeChange = vi.fn();

    renderHarness({
      size: 240,
      onSizeChange,
      captureWidth: 800,
      captureHeight: 400,
    });

    const handle = getHandle();

    act(() => {
      latest?.handleProps.onPointerDown(createPointerEvent(handle, 1, 0, 0));
      latest?.handleProps.onPointerCancel(createPointerEvent(handle, 1, 0, 0));
    });

    expect(latest?.isResizing).toBe(false);

    act(() => {
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 1, 650, 0));
    });

    expect(onSizeChange).not.toHaveBeenCalled();
  });

  it('stops resizing on lostpointercapture and duplicate end events are safe', () => {
    const onSizeChange = vi.fn();

    renderHarness({
      size: 240,
      onSizeChange,
      captureWidth: 800,
      captureHeight: 400,
    });

    const handle = getHandle();

    act(() => {
      latest?.handleProps.onPointerDown(createPointerEvent(handle, 1, 0, 0));
      latest?.handleProps.onLostPointerCapture(createPointerEvent(handle, 1, 0, 0));
      latest?.handleProps.onPointerUp(createPointerEvent(handle, 1, 0, 0));
    });

    expect(latest?.isResizing).toBe(false);
    expect(onSizeChange).not.toHaveBeenCalled();
  });

  it('updates uncontrolled size from pointer movement', () => {
    renderHarness({
      initialSize: 0.5,
      edge: 'top',
      mode: 'ratio',
      minSize: 0.2,
      maxSize: 0.8,
      captureWidth: 800,
      captureHeight: 400,
    });

    const handle = getHandle();

    act(() => {
      latest?.handleProps.onPointerDown(createPointerEvent(handle, 1, 0, 0));
      latest?.handleProps.onPointerMove(createPointerEvent(handle, 1, 0, 250));
    });

    act(() => {
      flushAnimationFrames();
    });

    expect(latest?.size).toBe(0.5);
  });

  function renderHarness(options: {
    size?: number;
    initialSize?: number;
    onSizeChange?: (size: number) => void;
    edge?: 'right' | 'top';
    mode?: 'pixel' | 'ratio';
    minSize?: number;
    maxSize?: number;
    captureWidth: number;
    captureHeight: number;
  }) {
    const {
      captureWidth,
      captureHeight,
      edge = 'right',
      mode = 'pixel',
      minSize = 100,
      maxSize = 500,
    } = options;

    function Harness() {
      const result =
        options.size !== undefined
          ? useResizable({
              edge,
              mode,
              size: options.size,
              minSize,
              maxSize,
              onSizeChange: options.onSizeChange ?? vi.fn(),
            })
          : useResizable({
              edge,
              mode,
              initialSize: options.initialSize ?? 240,
              minSize,
              maxSize,
              onSizeChange: options.onSizeChange,
            });

      latest = result;

      useEffect(() => {
        if (!result.containerRef.current) return;
        result.containerRef.current.getBoundingClientRect = () =>
          ({
            left: 100,
            right: 900,
            top: 50,
            bottom: 450,
            width: captureWidth,
            height: captureHeight,
            x: 100,
            y: 50,
            toJSON: () => undefined,
          }) as DOMRect;
      }, [result.containerRef]);

      return React.createElement(
        'div',
        { ref: result.containerRef },
        React.createElement('div', { id: 'handle', ...result.handleProps }),
      );
    }

    act(() => {
      root.render(React.createElement(Harness));
    });
  }

  function getHandle(): HTMLElement {
    const handle = host.querySelector<HTMLElement>('#handle');
    if (!handle) {
      throw new Error('Handle not rendered');
    }

    handle.hasPointerCapture = () => false;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    return handle;
  }

  function flushAnimationFrames(): void {
    const callbacks = Array.from(animationFrameCallbacks.values());
    animationFrameCallbacks.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  }
});

function createPointerEvent(
  currentTarget: HTMLElement,
  pointerId: number,
  clientX: number,
  clientY: number,
): React.PointerEvent<HTMLElement> {
  return {
    pointerId,
    clientX,
    clientY,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent<HTMLElement>;
}
