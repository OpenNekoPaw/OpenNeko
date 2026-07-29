import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { CanvasViewport } from '@neko/shared';

export interface UseThrottledCanvasViewportOptions {
  readonly enabled: boolean;
  readonly intervalMs: number;
}

export function useThrottledCanvasViewport(
  viewport: CanvasViewport,
  { enabled, intervalMs }: UseThrottledCanvasViewportOptions,
): CanvasViewport {
  const [snapshot, setSnapshot] = useState(viewport);
  const latestViewportRef = useRef(viewport);
  const timeoutRef = useRef<number | null>(null);
  const lastPublishedAtRef = useRef(0);

  useEffect(() => {
    latestViewportRef.current = viewport;

    if (!enabled) {
      clearPendingTimeout(timeoutRef);
      lastPublishedAtRef.current = Date.now();
      setSnapshot(viewport);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastPublishedAtRef.current;
    const publish = () => {
      timeoutRef.current = null;
      lastPublishedAtRef.current = Date.now();
      setSnapshot(latestViewportRef.current);
    };

    if (lastPublishedAtRef.current === 0 || elapsed >= intervalMs) {
      clearPendingTimeout(timeoutRef);
      publish();
      return;
    }

    if (timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(publish, intervalMs - elapsed);
    }
  }, [enabled, intervalMs, viewport]);

  useEffect(() => () => clearPendingTimeout(timeoutRef), []);

  return snapshot;
}

function clearPendingTimeout(timeoutRef: MutableRefObject<number | null>): void {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}
