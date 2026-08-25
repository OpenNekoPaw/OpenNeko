import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getLogger } from '../utils/logger';

const WORKSPACE_BOARD_SELECTION = 'workspace-board';
const SESSION_STORAGE_KEY = 'neko.agent.dshComposerCanvasSelections';
const logger = getLogger('DshComposerPresentationSnapshot');

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

export interface DshComposerPresentationSnapshotPersistence {
  read(): unknown;
  write(state: Readonly<Record<string, string>>): void;
}

export interface DshComposerPresentationSnapshotDiagnostic {
  readonly code: 'invalid-state' | 'invalid-entry' | 'read-failed' | 'write-failed';
  readonly message: string;
}

export interface DshComposerPresentationSnapshotStoreOptions {
  readonly persistence?: DshComposerPresentationSnapshotPersistence;
  readonly onDiagnostic?: (diagnostic: DshComposerPresentationSnapshotDiagnostic) => void;
}

export function createDshComposerPresentationSnapshotStore(
  options: DshComposerPresentationSnapshotStoreOptions = {},
): DshComposerPresentationSnapshotStore {
  const selections = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  restorePersistedSelections(selections, options);

  const persist = (): void => {
    if (options.persistence === undefined) return;
    try {
      options.persistence.write(Object.fromEntries(selections));
    } catch (error) {
      options.onDiagnostic?.({
        code: 'write-failed',
        message: `DSH composer presentation snapshot write failed: ${describeError(error)}`,
      });
    }
  };

  const store: DshComposerPresentationSnapshotStore = {
    read(scope) {
      return selections.get(selectionScopeKey(scope));
    },
    select(scope, canvasId) {
      const identity = requireIdentity(canvasId, 'Canvas selection');
      const key = selectionScopeKey(scope);
      if (selections.get(key) === identity) return;
      selections.set(key, identity);
      persist();
      notify(listeners.get(key));
    },
    transferIfAbsent(source, target) {
      const sourceKey = selectionScopeKey(source);
      const targetKey = selectionScopeKey(target);
      if (sourceKey === targetKey || selections.has(targetKey)) return;
      const selection = selections.get(sourceKey);
      if (selection === undefined) return;
      selections.set(targetKey, selection);
      persist();
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

export function createDshComposerSessionPresentationSnapshotStore(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): DshComposerPresentationSnapshotStore {
  return createDshComposerPresentationSnapshotStore({
    persistence: {
      read() {
        const serialized = storage.getItem(SESSION_STORAGE_KEY);
        return serialized === null ? undefined : JSON.parse(serialized);
      },
      write(state) {
        storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
      },
    },
    onDiagnostic(diagnostic) {
      logger.warn(diagnostic.message, { code: diagnostic.code });
    },
  });
}

const DshComposerPresentationSnapshotContext = createContext<
  DshComposerPresentationSnapshotStore | undefined
>(undefined);

export function DshComposerPresentationSnapshotProvider({
  children,
  store: providedStore,
}: {
  readonly children: ReactNode;
  readonly store?: DshComposerPresentationSnapshotStore;
}): JSX.Element {
  const ownedStore = useMemo(() => createDshComposerPresentationSnapshotStore(), []);
  const store = providedStore ?? ownedStore;
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

function restorePersistedSelections(
  selections: Map<string, string>,
  options: DshComposerPresentationSnapshotStoreOptions,
): void {
  if (options.persistence === undefined) return;
  let state: unknown;
  try {
    state = options.persistence.read();
  } catch (error) {
    options.onDiagnostic?.({
      code: 'read-failed',
      message: `DSH composer presentation snapshot read failed: ${describeError(error)}`,
    });
    return;
  }
  if (state === undefined) return;
  if (!isRecord(state)) {
    options.onDiagnostic?.({
      code: 'invalid-state',
      message: 'DSH composer presentation snapshot state must be an object.',
    });
    return;
  }
  for (const [key, selection] of Object.entries(state)) {
    if (
      !isSelectionScopeKey(key) ||
      typeof selection !== 'string' ||
      selection.trim().length === 0
    ) {
      options.onDiagnostic?.({
        code: 'invalid-entry',
        message: 'A DSH composer presentation snapshot entry is invalid and was discarded.',
      });
      continue;
    }
    selections.set(key, selection);
  }
}

function isSelectionScopeKey(value: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  return (
    Array.isArray(parsed) &&
    parsed.length === 3 &&
    (parsed[0] === 'draft' || parsed[0] === 'conversation') &&
    typeof parsed[1] === 'string' &&
    parsed[1].trim().length > 0 &&
    typeof parsed[2] === 'string' &&
    parsed[2].trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
