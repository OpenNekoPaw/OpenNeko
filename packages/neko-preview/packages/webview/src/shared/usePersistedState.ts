/**
 * Persisted state hook for document viewers.
 *
 * Uses postMessage to delegate persistence to the Extension Host,
 * which stores state in workspaceState (survives tab close/reopen
 * and VSCode restarts within the same workspace).
 *
 * Flow:
 *   Extension → Webview: document:restoreState { state } (on open)
 *   Webview → Extension: document:saveState { state }   (debounced)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getVscodeApi } from './vscodeApi';

const DEBOUNCE_MS = 500;

type SetStateAction<T> = T | ((prev: T) => T);

/** Shared mutable store — all usePersistedState calls merge into one object. */
const stateStore: Record<string, unknown> = {};
let storeInitialized = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/** Flush current state to extension via postMessage. */
function flushToExtension(): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    getVscodeApi().postMessage({
      type: 'document:saveState',
      payload: { ...stateStore },
    });
    pendingTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Initialize the store from extension-provided state.
 * Called once when the `document:restoreState` message arrives.
 */
export function initPersistedStore(restored: Record<string, unknown>): void {
  if (storeInitialized) return;
  Object.assign(stateStore, restored);
  storeInitialized = true;
}

/** Subscribers notified when store is initialized (for late-mounting components). */
const subscribers = new Map<string, (value: unknown) => void>();

export function notifySubscribers(): void {
  for (const [key, cb] of subscribers) {
    if (key in stateStore) {
      cb(stateStore[key]);
    }
  }
}

/**
 * Like useState but persisted via extension workspaceState.
 * Supports both direct values and updater functions.
 *
 * ```ts
 * const [page, setPage] = usePersistedState('currentPage', 1);
 * setPage(5);
 * setPage(prev => prev + 1);
 * ```
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (action: SetStateAction<T>) => void] {
  const [value, setValueRaw] = useState<T>(() => {
    // If store was initialized before this component mounted, use saved value
    if (key in stateStore) {
      return stateStore[key] as T;
    }
    return defaultValue;
  });

  const valueRef = useRef(value);
  valueRef.current = value;

  // Subscribe for late restore (message arrives after component mounts)
  useEffect(() => {
    subscribers.set(key, (restored) => {
      setValueRaw(restored as T);
      valueRef.current = restored as T;
    });
    return () => {
      subscribers.delete(key);
    };
  }, [key]);

  const setValue = useCallback(
    (action: SetStateAction<T>) => {
      const next =
        typeof action === 'function' ? (action as (prev: T) => T)(valueRef.current) : action;
      setValueRaw(next);
      valueRef.current = next;
      stateStore[key] = next;
      flushToExtension();
    },
    [key],
  );

  return [value, setValue];
}
