import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DragCallbacks<T = void> {
  /**
   * Called on mousedown. Return an initial context value to start the drag,
   * or `undefined` to cancel (mousedown is ignored).
   *
   * The context `T` carries start-of-drag state (coordinates, viewport snapshot,
   * initial values, etc.) and is forwarded to onMove/onEnd — no useRef needed.
   */
  onStart: (e: MouseEvent) => T | undefined;
  /** Called on every mousemove while dragging. */
  onMove: (e: MouseEvent, ctx: T) => void;
  /** Called on mouseup to finish the drag. */
  onEnd: (e: MouseEvent, ctx: T) => void;
}

export interface DragOptions {
  /** Minimum pixel distance before the drag activates (default 0). */
  threshold?: number;
  /** Mark mousemove listener as passive for scroll performance (default false). */
  passive?: boolean;
  /** Call stopPropagation() on the originating mousedown (default true). */
  stopPropagation?: boolean;
  /** Call preventDefault() on the originating mousedown (default true). */
  preventDefault?: boolean;
}

export interface DragBindings {
  onMouseDown: (e: React.MouseEvent) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Generic mouse-drag shell that handles the mousedown → document mousemove/mouseup
 * lifecycle and cleanup, so domain hooks only implement the three callbacks.
 *
 * ```tsx
 * const { isDragging, bindDrag } = useDrag<{ startX: number }>({
 *   onStart: (e) => ({ startX: e.clientX }),
 *   onMove:  (e, ctx) => console.log('dx', e.clientX - ctx.startX),
 *   onEnd:   (e, ctx) => console.log('done'),
 * });
 *
 * return <div {...bindDrag} />;
 * ```
 */
export function useDrag<T = void>(
  callbacks: DragCallbacks<T>,
  options?: DragOptions,
): {
  isDragging: boolean;
  bindDrag: DragBindings;
} {
  const [isDragging, setIsDragging] = useState(false);
  const ctxRef = useRef<T | undefined>(undefined);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const optsRef = useRef(options);
  optsRef.current = options;

  // For threshold support: track whether threshold has been exceeded
  const thresholdRef = useRef<{ startX: number; startY: number; activated: boolean } | null>(null);

  // Attach document-level listeners while dragging
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const ctx = ctxRef.current as T;
      const thr = thresholdRef.current;
      if (thr && !thr.activated) {
        const dx = e.clientX - thr.startX;
        const dy = e.clientY - thr.startY;
        if (dx * dx + dy * dy < (optsRef.current?.threshold ?? 0) ** 2) {
          return; // below threshold, suppress
        }
        thr.activated = true;
      }
      cbRef.current.onMove(e, ctx);
    };

    const onUp = (e: MouseEvent) => {
      const ctx = ctxRef.current as T;
      // Only fire onEnd if threshold was reached (or no threshold)
      const thr = thresholdRef.current;
      if (!thr || thr.activated) {
        cbRef.current.onEnd(e, ctx);
      }
      ctxRef.current = undefined;
      thresholdRef.current = null;
      setIsDragging(false);
    };

    const passiveOpt = optsRef.current?.passive === true;
    window.addEventListener('mousemove', onMove, { passive: passiveOpt });
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const opts = optsRef.current;
    if (opts?.stopPropagation !== false) e.stopPropagation();
    if (opts?.preventDefault !== false) e.preventDefault();

    const nativeEvent = e.nativeEvent;
    const ctx = cbRef.current.onStart(nativeEvent);
    if (ctx === undefined) return; // cancelled

    ctxRef.current = ctx;
    const threshold = opts?.threshold ?? 0;
    if (threshold > 0) {
      thresholdRef.current = {
        startX: nativeEvent.clientX,
        startY: nativeEvent.clientY,
        activated: false,
      };
    } else {
      thresholdRef.current = { startX: 0, startY: 0, activated: true };
    }
    setIsDragging(true);
  }, []);

  return {
    isDragging,
    bindDrag: { onMouseDown: handleMouseDown },
  };
}
