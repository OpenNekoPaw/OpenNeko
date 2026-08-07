import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  createPreviewViewerSnapshotStore,
  type PreviewViewerSnapshotStore,
} from './viewer-snapshot';

export type { PreviewViewerSnapshotStore } from './viewer-snapshot';

const PreviewViewerSnapshotContext = createContext<PreviewViewerSnapshotStore | undefined>(
  undefined,
);

export function PreviewViewerSnapshotProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const store = useMemo(() => createPreviewViewerSnapshotStore(), []);
  useEffect(() => () => store.clear(), [store]);
  return (
    <PreviewViewerSnapshotContext.Provider value={store}>
      {children}
    </PreviewViewerSnapshotContext.Provider>
  );
}

export function usePreviewViewerSnapshotStore(): PreviewViewerSnapshotStore {
  const store = useOptionalPreviewViewerSnapshotStore();
  if (!store) {
    throw new Error('Preview Viewer snapshot owner is missing.');
  }
  return store;
}

export function useOptionalPreviewViewerSnapshotStore(): PreviewViewerSnapshotStore | undefined {
  return useContext(PreviewViewerSnapshotContext);
}
