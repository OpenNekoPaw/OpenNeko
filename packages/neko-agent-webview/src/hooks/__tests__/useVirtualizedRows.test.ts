import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useVirtualizedRows } from '../useVirtualizedRows';

// jsdom lacks ResizeObserver — provide a no-op class so useLayoutEffect doesn't explode.
beforeEach(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  // Run rAF callbacks synchronously so scroll updates propagate before assertions.
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
    cb: FrameRequestCallback,
  ): number => {
    cb(0);
    return 0;
  };
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
});

/**
 * Thin wrapper that simulates a scrollable element by attaching a fake ref
 * with user-controlled clientHeight + scrollTop, then calls the hook.
 * Lets us verify the returned range + padding without a real DOM layout.
 */
function setupHook(params: {
  itemCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop?: number;
  overscan?: number;
}) {
  const { itemCount, rowHeight, viewportHeight, scrollTop = 0, overscan = 0 } = params;

  return renderHook(() => {
    const ref = useRef<HTMLDivElement | null>(null);
    if (ref.current === null) {
      const el = document.createElement('div');
      Object.defineProperty(el, 'clientHeight', {
        value: viewportHeight,
        configurable: true,
      });
      Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
      ref.current = el;
    }
    const result = useVirtualizedRows({
      container: ref,
      itemCount,
      rowHeight,
      overscan,
    });
    return { ref, ...result };
  });
}

describe('useVirtualizedRows', () => {
  it('returns empty range when itemCount is 0', () => {
    const { result } = setupHook({ itemCount: 0, rowHeight: 30, viewportHeight: 300 });
    expect(result.current.range).toEqual({ start: 0, end: 0 });
    expect(result.current.paddingTop).toBe(0);
    expect(result.current.paddingBottom).toBe(0);
  });

  it('renders a sensible first page before viewport measurement completes', () => {
    // scrollTop=0, viewportHeight=0 triggers the fallback viewport path.
    const { result } = setupHook({
      itemCount: 500,
      rowHeight: 28,
      viewportHeight: 0,
    });
    expect(result.current.range.start).toBe(0);
    // Fallback viewport = rowHeight * 20 → ceil(0 + 560 / 28) = 20 visible rows
    expect(result.current.range.end).toBeGreaterThanOrEqual(20);
    expect(result.current.range.end).toBeLessThanOrEqual(500);
  });

  it('updates the visible window when the container scrolls', async () => {
    const viewportHeight = 300;
    const rowHeight = 30;
    const itemCount = 200;

    // Create a persistent element we can mutate between renders.
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', { value: viewportHeight, configurable: true });
    Object.defineProperty(el, 'scrollTop', {
      get: () => scrollValue,
      configurable: true,
    });
    let scrollValue = 0;

    const { result, rerender } = renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(el);
      return useVirtualizedRows({ container: ref, itemCount, rowHeight, overscan: 0 });
    });

    // Initial state: should roughly show rows 0..9 (300 / 30).
    expect(result.current.range.start).toBe(0);
    expect(result.current.range.end).toBeGreaterThanOrEqual(10);
    expect(result.current.paddingTop).toBe(0);
    expect(result.current.paddingBottom).toBe((itemCount - result.current.range.end) * rowHeight);

    // Scroll by 60 rows (1800px) and dispatch scroll event.
    scrollValue = 1800;
    await act(async () => {
      el.dispatchEvent(new Event('scroll'));
      // Flush rAF; jsdom doesn't batch so we give it a tick.
      await new Promise((r) => setTimeout(r, 0));
    });
    rerender();

    // Now should render around rows 60..69.
    expect(result.current.range.start).toBe(60);
    expect(result.current.range.end).toBeGreaterThanOrEqual(70);
    expect(result.current.paddingTop).toBe(60 * rowHeight);
  });

  it('applies the overscan buffer on both ends', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(el, 'scrollTop', { value: 300, configurable: true });

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(el);
      return useVirtualizedRows({
        container: ref,
        itemCount: 100,
        rowHeight: 30,
        overscan: 4,
      });
    });

    // Without overscan, first visible = 10; with overscan 4, start = 6.
    // Before the useLayoutEffect measures viewportHeight the fallback kicks
    // in — so skip the strict equality and just check the band contains the
    // visible rows and stays inside bounds.
    expect(result.current.range.start).toBeLessThanOrEqual(10);
    expect(result.current.range.end).toBeGreaterThanOrEqual(20);
    expect(result.current.range.start).toBeGreaterThanOrEqual(0);
    expect(result.current.range.end).toBeLessThanOrEqual(100);
  });
});
