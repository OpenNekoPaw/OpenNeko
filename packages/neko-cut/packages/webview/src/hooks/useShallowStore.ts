import { useRef, useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';

type EditorStore = ReturnType<typeof useEditorStore.getState>;

/**
 * Shallow comparison for objects/arrays
 * Returns true if they are shallowly equal
 */
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Custom hook that selects multiple values from the store with shallow equality check
 * This prevents unnecessary re-renders when the selected values haven't actually changed
 *
 * Usage:
 * const { project, isPlaying, currentTime } = useShallowStore(
 *   state => ({ project: state.project, isPlaying: state.isPlaying, currentTime: state.currentTime })
 * );
 */
export function useShallowStore<T>(selector: (state: EditorStore) => T): T {
  const prevRef = useRef<T | undefined>(undefined);

  const equalityFn = useCallback((a: T, b: T) => shallowEqual(a, b), []);

  return useEditorStore((state) => {
    const next = selector(state);
    if (prevRef.current !== undefined && equalityFn(prevRef.current, next)) {
      return prevRef.current;
    }
    prevRef.current = next;
    return next;
  });
}
