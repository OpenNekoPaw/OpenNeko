import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  createResourceBrowserPresentationSnapshotStore,
  type ResourceBrowserPresentationSnapshotStore,
} from './presentation-snapshot';

const ResourceBrowserPresentationSnapshotContext = createContext<
  ResourceBrowserPresentationSnapshotStore | undefined
>(undefined);

export function ResourceBrowserPresentationSnapshotProvider({
  children,
  store: providedStore,
}: {
  readonly children: ReactNode;
  readonly store?: ResourceBrowserPresentationSnapshotStore;
}): ReactElement {
  const ownedStore = useMemo(() => createResourceBrowserPresentationSnapshotStore(), []);
  const store = providedStore ?? ownedStore;
  useEffect(
    () => () => {
      if (!providedStore) ownedStore.clear();
    },
    [ownedStore, providedStore],
  );
  return (
    <ResourceBrowserPresentationSnapshotContext.Provider value={store}>
      {children}
    </ResourceBrowserPresentationSnapshotContext.Provider>
  );
}

export function useResourceBrowserPresentationSnapshotStore():
  ResourceBrowserPresentationSnapshotStore | undefined {
  return useContext(ResourceBrowserPresentationSnapshotContext);
}
