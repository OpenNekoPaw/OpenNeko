import { useCallback, useSyncExternalStore } from 'react';
import type {
  TabRenderStateUpdate,
  TabRenderStore,
  TabRenderStoreSnapshot,
} from './tab-render-runtime';

export interface UseTabRenderStoreResult {
  readonly snapshot: TabRenderStoreSnapshot;
  readonly updateState: (update: TabRenderStateUpdate) => void;
}

export function useTabRenderStore(store: TabRenderStore): UseTabRenderStoreResult {
  const snapshot = useSyncExternalStore(
    useCallback((listener) => store.subscribe(listener), [store]),
    useCallback(() => store.getSnapshot(), [store]),
    useCallback(() => store.getSnapshot(), [store]),
  );
  const updateState = useCallback(
    (update: TabRenderStateUpdate) => store.updateState(update),
    [store],
  );
  return { snapshot, updateState };
}
