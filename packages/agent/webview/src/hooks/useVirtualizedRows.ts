/**
 * useVirtualizedRows — minimal fixed-height row virtualizer.
 *
 * Returns the subset of item indices currently inside the scrolling
 * viewport (+ an `overscan` buffer on each side) along with the spacer
 * heights needed to keep the scrollbar accurate.
 *
 * Intended for long tables (PlanMatrix, asset browsers) where adding a
 * full virtualization library (tanstack/react-virtual, react-window) is
 * overkill.  Assumes a fixed row height — for the one use case that
 * surfaced (100+ shots) all rows have identical height.
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { range, paddingTop, paddingBottom } = useVirtualizedRows({
 *     container: containerRef,
 *     itemCount: shots.length,
 *     rowHeight: 28,
 *   });
 *   return (
 *     <div ref={containerRef} style={{ overflowY: 'auto', maxHeight: 400 }}>
 *       <div style={{ height: paddingTop }} />
 *       {shots.slice(range.start, range.end).map(...)}
 *       <div style={{ height: paddingBottom }} />
 *     </div>
 *   );
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface VirtualizedRowsRange {
  /** First index to render (inclusive). */
  start: number;
  /** One past the last index to render (exclusive). */
  end: number;
}

export interface VirtualizedRowsResult {
  range: VirtualizedRowsRange;
  /** Spacer height above the rendered window, in px. */
  paddingTop: number;
  /** Spacer height below the rendered window, in px. */
  paddingBottom: number;
}

export interface UseVirtualizedRowsOptions {
  container: RefObject<HTMLElement | null>;
  itemCount: number;
  rowHeight: number;
  /** Extra rows to render outside the viewport for smoother scrolling. */
  overscan?: number;
}

export function useVirtualizedRows({
  container,
  itemCount,
  rowHeight,
  overscan = 6,
}: UseVirtualizedRowsOptions): VirtualizedRowsResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  // Initial measurement + resize observer.
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    setScrollTop(el.scrollTop);

    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [container]);

  // Scroll listener (throttled via rAF).
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onScroll = () => {
      if (rafRef.current !== undefined) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = undefined;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
    };
  }, [container]);

  if (itemCount === 0 || rowHeight <= 0) {
    return { range: { start: 0, end: 0 }, paddingTop: 0, paddingBottom: 0 };
  }

  // When the viewport hasn't been measured yet, render the first page so
  // the user sees something before the effect fires.
  const effectiveViewport = viewportHeight > 0 ? viewportHeight : rowHeight * 20;

  const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight));
  const lastVisibleExclusive = Math.min(
    itemCount,
    Math.ceil((scrollTop + effectiveViewport) / rowHeight),
  );

  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(itemCount, lastVisibleExclusive + overscan);

  return {
    range: { start, end },
    paddingTop: start * rowHeight,
    paddingBottom: (itemCount - end) * rowHeight,
  };
}
