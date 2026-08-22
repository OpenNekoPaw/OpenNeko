import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

const WORKSPACE_BOARD_SELECTION = 'workspace-board';

export interface DshComposerCanvasSelectionScope {
  readonly agentSurfaceId: string;
  readonly workspaceId: string;
  readonly conversationId?: string;
}

export interface DshComposerPresentationSnapshotStore {
  read(scope: DshComposerCanvasSelectionScope): string | undefined;
  select(scope: DshComposerCanvasSelectionScope, canvasId: string): void;
  transferIfAbsent(
    source: DshComposerCanvasSelectionScope,
    target: DshComposerCanvasSelectionScope,
  ): void;
  subscribe(scope: DshComposerCanvasSelectionScope, listener: () => void): () => void;
}

export function createDshComposerPresentationSnapshotStore(): DshComposerPresentationSnapshotStore {
  const selections = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();

  const store: DshComposerPresentationSnapshotStore = {
    read(scope) {
      return selections.get(selectionScopeKey(scope));
    },
    select(scope, canvasId) {
      const identity = requireIdentity(canvasId, 'Canvas selection');
      const key = selectionScopeKey(scope);
      if (selections.get(key) === identity) return;
      selections.set(key, identity);
      notify(listeners.get(key));
    },
    transferIfAbsent(source, target) {
      const sourceKey = selectionScopeKey(source);
      const targetKey = selectionScopeKey(target);
      if (sourceKey === targetKey || selections.has(targetKey)) return;
      const selection = selections.get(sourceKey);
      if (selection === undefined) return;
      selections.set(targetKey, selection);
      notify(listeners.get(targetKey));
    },
    subscribe(scope, listener) {
      const key = selectionScopeKey(scope);
      const scoped = listeners.get(key) ?? new Set<() => void>();
      scoped.add(listener);
      listeners.set(key, scoped);
      return () => {
        scoped.delete(listener);
        if (scoped.size === 0) listeners.delete(key);
      };
    },
  };
  return Object.freeze(store);
}

const DshComposerPresentationSnapshotContext = createContext<
  DshComposerPresentationSnapshotStore | undefined
>(undefined);

export function DshComposerPresentationSnapshotProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const store = useMemo(() => createDshComposerPresentationSnapshotStore(), []);
  return (
    <DshComposerPresentationSnapshotContext.Provider value={store}>
      {children}
    </DshComposerPresentationSnapshotContext.Provider>
  );
}

export function useDshComposerPresentationSnapshotStore(): DshComposerPresentationSnapshotStore {
  const store = useContext(DshComposerPresentationSnapshotContext);
  if (store === undefined) {
    throw new Error('DSH composer presentation snapshot provider is unavailable.');
  }
  return store;
}

export function useDshComposerCanvasSelection(
  scope: DshComposerCanvasSelectionScope | undefined,
): readonly [string, (canvasId: string) => void] {
  const store = useDshComposerPresentationSnapshotStore();
  const selection = useSyncExternalStore(
    (listener) => (scope === undefined ? () => undefined : store.subscribe(scope, listener)),
    () =>
      scope === undefined
        ? WORKSPACE_BOARD_SELECTION
        : (store.read(scope) ?? WORKSPACE_BOARD_SELECTION),
    () =>
      scope === undefined
        ? WORKSPACE_BOARD_SELECTION
        : (store.read(scope) ?? WORKSPACE_BOARD_SELECTION),
  );
  return [
    selection,
    (canvasId) => {
      if (scope === undefined) {
        throw new Error('DSH Canvas selection requires an exact presentation scope.');
      }
      store.select(scope, canvasId);
    },
  ];
}

function selectionScopeKey(scope: DshComposerCanvasSelectionScope): string {
  return JSON.stringify([
    scope.conversationId === undefined ? 'draft' : 'conversation',
    scope.conversationId ?? requireIdentity(scope.agentSurfaceId, 'Agent Surface'),
    requireIdentity(scope.workspaceId, 'Workspace'),
  ]);
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity must not be empty.`);
  return value;
}

function notify(listeners: Set<() => void> | undefined): void {
  if (listeners === undefined) return;
  for (const listener of listeners) listener();
}
