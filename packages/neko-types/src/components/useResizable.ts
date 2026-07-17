import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { VSCodeAPI } from '../vscode/types';
import { getVSCodeAPI } from '../vscode/api';

// ── Types ────────────────────────────────────────────────────────────────────

export type ResizeEdge = 'left' | 'right' | 'top' | 'bottom';
export type ResizeMode = 'pixel' | 'ratio';
export type ResizeOrientation = 'horizontal' | 'vertical';

export interface ResizePointerPosition {
  clientX: number;
  clientY: number;
}

export interface ResizeRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface UseResizableBaseOptions {
  edge: ResizeEdge;
  mode: ResizeMode;
  minSize?: number;
  maxSize?: number;
  disabled?: boolean;
  calculateSize?: (event: ResizePointerPosition, containerRect: ResizeRect) => number;
}

export interface UseResizableControlledOptions extends UseResizableBaseOptions {
  size: number;
  onSizeChange: (size: number) => void;
  initialSize?: never;
}

export interface UseResizableUncontrolledOptions extends UseResizableBaseOptions {
  initialSize: number;
  size?: never;
  onSizeChange?: (size: number) => void;
}

export type UseResizableOptions = UseResizableControlledOptions | UseResizableUncontrolledOptions;

export interface ResizeHandleBindings {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: React.PointerEvent<HTMLElement>) => void;
  role: 'separator';
  'aria-orientation': ResizeOrientation;
  style: React.CSSProperties;
}

export interface UseResizableReturn<TElement extends HTMLElement = HTMLElement> {
  size: number;
  isResizing: boolean;
  containerRef: React.MutableRefObject<TElement | null>;
  handleProps: ResizeHandleBindings;
}

export interface ResizeBounds {
  minSize?: number;
  maxSize?: number;
}

export interface ResizeState {
  size: number;
  collapsed: boolean;
}

export interface PersistedResizeOptions extends ResizeBounds {
  api?: Pick<VSCodeAPI, 'getState' | 'setState'> | null;
  persistDebounceMs?: number;
}

export interface PersistedResizeReturn {
  state: ResizeState;
  size: number;
  collapsed: boolean;
  setSize: (size: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  updateState: (state: Partial<ResizeState>) => void;
}

type WebviewPersistedState = Record<string, unknown>;

const RESIZE_STATE_KEY = 'neko.resizeState';
const RESIZE_PERSIST_DEBOUNCE_MS = 180;

// ── Pure Helpers ─────────────────────────────────────────────────────────────

export function getResizeOrientation(edge: ResizeEdge): ResizeOrientation {
  return edge === 'top' || edge === 'bottom' ? 'horizontal' : 'vertical';
}

export function getResizeCursor(edge: ResizeEdge): React.CSSProperties['cursor'] {
  return edge === 'top' || edge === 'bottom' ? 'ns-resize' : 'ew-resize';
}

export function clampResizeSize(size: number, minSize?: number, maxSize?: number): number {
  const min = minSize ?? Number.NEGATIVE_INFINITY;
  const max = maxSize ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, size));
}

export function calculateEdgeSize(
  edge: ResizeEdge,
  mode: ResizeMode,
  pointer: ResizePointerPosition,
  containerRect: ResizeRect,
): number {
  const distance =
    edge === 'left'
      ? pointer.clientX - containerRect.left
      : edge === 'right'
        ? containerRect.right - pointer.clientX
        : edge === 'top'
          ? pointer.clientY - containerRect.top
          : containerRect.bottom - pointer.clientY;

  if (mode === 'pixel') {
    return distance;
  }

  const axisSize = edge === 'left' || edge === 'right' ? containerRect.width : containerRect.height;
  return axisSize > 0 ? distance / axisSize : 0;
}

export function resolveResizeSize(
  options: Pick<UseResizableBaseOptions, 'edge' | 'mode' | 'minSize' | 'maxSize' | 'calculateSize'>,
  pointer: ResizePointerPosition,
  containerRect: ResizeRect,
): number {
  const rawSize = options.calculateSize
    ? options.calculateSize(pointer, containerRect)
    : calculateEdgeSize(options.edge, options.mode, pointer, containerRect);

  return clampResizeSize(rawSize, options.minSize, options.maxSize);
}

export interface ResizePointerSession {
  activePointerId: number | null;
  isResizing: boolean;
}

export function beginResizeSession(pointerId: number): ResizePointerSession {
  return {
    activePointerId: pointerId,
    isResizing: true,
  };
}

export function isActiveResizePointer(session: ResizePointerSession, pointerId: number): boolean {
  return session.activePointerId !== null && session.activePointerId === pointerId;
}

export function endResizeSession(
  session: ResizePointerSession,
  pointerId: number,
): ResizePointerSession {
  if (!isActiveResizePointer(session, pointerId)) {
    return session;
  }

  return {
    activePointerId: null,
    isResizing: false,
  };
}

export function normalizeResizeState(
  value: unknown,
  defaultSize: number,
  bounds: ResizeBounds = {},
): ResizeState {
  const record = isRecord(value) ? value : {};
  const rawSize =
    typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : defaultSize;

  return {
    size: clampResizeSize(rawSize, bounds.minSize, bounds.maxSize),
    collapsed: typeof record.collapsed === 'boolean' ? record.collapsed : false,
  };
}

export function readPersistedResizeState(
  rootState: unknown,
  panelId: string,
  defaultSize: number,
  bounds: ResizeBounds = {},
): ResizeState {
  const record = isRecord(rootState) ? rootState : {};
  const resizeRecord = isRecord(record[RESIZE_STATE_KEY]) ? record[RESIZE_STATE_KEY] : {};
  return normalizeResizeState(resizeRecord[panelId], defaultSize, bounds);
}

export function writePersistedResizeState(
  rootState: unknown,
  panelId: string,
  state: ResizeState,
): WebviewPersistedState {
  const base = isRecord(rootState) ? { ...rootState } : {};
  const resizeRecord = isRecord(base[RESIZE_STATE_KEY]) ? { ...base[RESIZE_STATE_KEY] } : {};

  return {
    ...base,
    [RESIZE_STATE_KEY]: {
      ...resizeRecord,
      [panelId]: state,
    },
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useResizable<TElement extends HTMLElement = HTMLElement>(
  options: UseResizableOptions,
): UseResizableReturn<TElement> {
  const isControlled = options.size !== undefined;
  const [internalSize, setInternalSize] = useState(() =>
    isControlled ? options.size : options.initialSize,
  );
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<TElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pendingSizeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const currentSize = isControlled ? options.size : internalSize;

  const commitSize = useCallback((nextSize: number) => {
    const latestOptions = optionsRef.current;
    if (latestOptions.size === undefined) {
      setInternalSize(nextSize);
    }
    latestOptions.onSizeChange?.(nextSize);
  }, []);

  const cancelScheduledSize = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const commitPendingSize = useCallback(() => {
    const nextSize = pendingSizeRef.current;
    pendingSizeRef.current = null;
    if (nextSize !== null) {
      commitSize(nextSize);
    }
  }, [commitSize]);

  const flushPendingSize = useCallback(() => {
    cancelScheduledSize();
    commitPendingSize();
  }, [cancelScheduledSize, commitPendingSize]);

  const scheduleSizeCommit = useCallback(
    (nextSize: number) => {
      pendingSizeRef.current = nextSize;
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        commitPendingSize();
      });
    },
    [commitPendingSize],
  );

  useEffect(
    () => () => {
      cancelScheduledSize();
      pendingSizeRef.current = null;
      mountedRef.current = false;
      activePointerIdRef.current = null;
    },
    [cancelScheduledSize],
  );

  const finishResize = useCallback(
    (event: React.PointerEvent<HTMLElement>, releaseCapture: boolean) => {
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }

      if (releaseCapture) {
        releasePointerCaptureSafely(event.currentTarget, activePointerId);
      }

      flushPendingSize();
      activePointerIdRef.current = null;
      if (mountedRef.current) {
        setIsResizing(false);
      }
    },
    [flushPendingSize],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (optionsRef.current.disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    activePointerIdRef.current = event.pointerId;
    setPointerCaptureSafely(event.currentTarget, event.pointerId);
    setIsResizing(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const nextSize = resolveResizeSize(
        optionsRef.current,
        event,
        container.getBoundingClientRect(),
      );
      scheduleSizeCommit(nextSize);
    },
    [scheduleSizeCommit],
  );

  const handleProps = useMemo<ResizeHandleBindings>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: (event) => finishResize(event, true),
      onPointerCancel: (event) => finishResize(event, true),
      onLostPointerCapture: (event) => finishResize(event, false),
      role: 'separator',
      'aria-orientation': getResizeOrientation(options.edge),
      style: {
        cursor: getResizeCursor(options.edge),
        touchAction: 'none',
      },
    }),
    [finishResize, handlePointerDown, handlePointerMove, options.edge],
  );

  return {
    size: currentSize,
    isResizing,
    containerRef,
    handleProps,
  };
}

export function usePersistedResize(
  panelId: string,
  defaultSize: number,
  bounds: ResizeBounds = {},
  options: PersistedResizeOptions = {},
): PersistedResizeReturn {
  const api = options.api === undefined ? getVSCodeAPI() : options.api;
  const persistDebounceMs = options.persistDebounceMs ?? RESIZE_PERSIST_DEBOUNCE_MS;
  const effectiveBounds = {
    minSize: options.minSize ?? bounds.minSize,
    maxSize: options.maxSize ?? bounds.maxSize,
  };
  const defaultSizeRef = useRef(defaultSize);
  const boundsRef = useRef(effectiveBounds);
  const pendingPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistStateRef = useRef<ResizeState | null>(null);
  boundsRef.current = effectiveBounds;

  const [state, setState] = useState<ResizeState>(() =>
    api
      ? readPersistedResizeState(api.getState(), panelId, defaultSizeRef.current, boundsRef.current)
      : normalizeResizeState(undefined, defaultSizeRef.current, boundsRef.current),
  );

  const flushPendingPersist = useCallback(() => {
    if (pendingPersistTimerRef.current !== null) {
      clearTimeout(pendingPersistTimerRef.current);
      pendingPersistTimerRef.current = null;
    }
    const nextState = pendingPersistStateRef.current;
    pendingPersistStateRef.current = null;
    if (!api || nextState === null) {
      return;
    }
    api.setState(writePersistedResizeState(api.getState(), panelId, nextState));
  }, [api, panelId]);

  const persist = useCallback(
    (nextState: ResizeState, immediate = false) => {
      if (!api) return;
      pendingPersistStateRef.current = nextState;
      if (pendingPersistTimerRef.current !== null) {
        clearTimeout(pendingPersistTimerRef.current);
        pendingPersistTimerRef.current = null;
      }
      if (immediate || persistDebounceMs <= 0) {
        flushPendingPersist();
        return;
      }
      pendingPersistTimerRef.current = setTimeout(() => {
        flushPendingPersist();
      }, persistDebounceMs);
    },
    [api, flushPendingPersist, persistDebounceMs],
  );

  useEffect(
    () => () => {
      flushPendingPersist();
    },
    [flushPendingPersist],
  );

  const updateState = useCallback(
    (patch: Partial<ResizeState>) => {
      setState((current) => {
        const next = normalizeResizeState(
          {
            size: patch.size ?? current.size,
            collapsed: patch.collapsed ?? current.collapsed,
          },
          defaultSizeRef.current,
          boundsRef.current,
        );
        persist(next, patch.collapsed !== undefined);
        return next;
      });
    },
    [persist],
  );

  const setSize = useCallback(
    (size: number) => {
      updateState({ size });
    },
    [updateState],
  );

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      updateState({ collapsed });
    },
    [updateState],
  );

  return {
    state,
    size: state.size,
    collapsed: state.collapsed,
    setSize,
    setCollapsed,
    updateState,
  };
}

function setPointerCaptureSafely(target: HTMLElement, pointerId: number): void {
  try {
    if (!target.hasPointerCapture(pointerId)) {
      target.setPointerCapture(pointerId);
    }
  } catch {
    // Pointer capture can fail in incomplete DOM hosts; resize still degrades gracefully.
  }
}

function isRecord(value: unknown): value is WebviewPersistedState {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function releasePointerCaptureSafely(target: HTMLElement, pointerId: number): void {
  try {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore release failures caused by host interruption or already-lost capture.
  }
}
