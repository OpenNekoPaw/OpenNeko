import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import { getBrowserHostState } from './browserHostState';

const DEBOUNCE_MS = 500;

type SetStateAction<T> = T | ((previous: T) => T);
type PersistedStateSnapshot = Readonly<Record<string, unknown>>;

interface PersistedStateScope {
  read<T>(key: string, defaultValue: T): T;
  set<T>(key: string, value: T): void;
  restore(snapshot: PersistedStateSnapshot): void;
  subscribe(key: string, subscriber: (value: unknown) => void): () => void;
  dispose(): void;
}

const PersistedStateContext = createContext<PersistedStateScope | undefined>(undefined);

export function PersistedStateProvider({
  children,
  initialState,
  onStateChange,
}: {
  readonly children: ReactNode;
  readonly initialState?: PersistedStateSnapshot;
  readonly onStateChange?: (snapshot: PersistedStateSnapshot) => void;
}): ReactElement {
  const initialStateRef = useRef(initialState);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const scope = useMemo(
    () =>
      createPersistedStateScope(initialStateRef.current ?? {}, (snapshot) => {
        onStateChangeRef.current?.(snapshot);
      }),
    [],
  );
  useEffect(() => () => scope.dispose(), [scope]);
  return createElement(PersistedStateContext.Provider, { value: scope }, children);
}

export function usePersistedStateRestore(): (snapshot: PersistedStateSnapshot) => void {
  const scope = usePersistedStateScope();
  return useCallback((snapshot: PersistedStateSnapshot) => scope.restore(snapshot), [scope]);
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (action: SetStateAction<T>) => void] {
  const scope = usePersistedStateScope();
  const [value, setValueRaw] = useState<T>(() => scope.read(key, defaultValue));
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(
    () =>
      scope.subscribe(key, (restored) => {
        const value = restored as T;
        setValueRaw(value);
        valueRef.current = value;
      }),
    [key, scope],
  );

  const setValue = useCallback(
    (action: SetStateAction<T>) => {
      const next =
        typeof action === 'function' ? (action as (previous: T) => T)(valueRef.current) : action;
      setValueRaw(next);
      valueRef.current = next;
      scope.set(key, next);
    },
    [key, scope],
  );

  return [value, setValue];
}

function usePersistedStateScope(): PersistedStateScope {
  const scope = useContext(PersistedStateContext);
  if (!scope) throw new Error('Persisted document state requires an instance-owned Provider.');
  return scope;
}

function createPersistedStateScope(
  initialState: PersistedStateSnapshot,
  onStateChange: (snapshot: PersistedStateSnapshot) => void,
): PersistedStateScope {
  let state: Record<string, unknown> = { ...initialState };
  let restored = Object.keys(initialState).length > 0;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  const subscribers = new Map<string, Set<(value: unknown) => void>>();

  const snapshot = (): PersistedStateSnapshot => Object.freeze({ ...state });
  const flush = (): void => {
    if (pendingTimer !== undefined) clearTimeout(pendingTimer);
    pendingTimer = undefined;
    getBrowserHostState().postMessage({
      type: 'document:saveState',
      payload: snapshot(),
    });
  };
  const scheduleFlush = (): void => {
    if (pendingTimer !== undefined) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flush, DEBOUNCE_MS);
  };

  return {
    read<T>(key: string, defaultValue: T): T {
      return key in state ? (state[key] as T) : defaultValue;
    },
    set<T>(key: string, value: T): void {
      state = { ...state, [key]: value };
      const next = snapshot();
      onStateChange(next);
      scheduleFlush();
    },
    restore(next): void {
      if (restored) return;
      state = { ...next };
      restored = true;
      for (const [key, listeners] of subscribers) {
        if (!(key in state)) continue;
        for (const listener of listeners) listener(state[key]);
      }
    },
    subscribe(key, subscriber): () => void {
      const listeners = subscribers.get(key) ?? new Set();
      listeners.add(subscriber);
      subscribers.set(key, listeners);
      return () => {
        listeners.delete(subscriber);
        if (listeners.size === 0) subscribers.delete(key);
      };
    },
    dispose(): void {
      if (pendingTimer !== undefined) flush();
      subscribers.clear();
    },
  };
}
