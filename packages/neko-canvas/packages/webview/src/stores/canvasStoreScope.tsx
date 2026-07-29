import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  createCanvasOperationStore,
  useCanvasOperationStore,
  type CanvasOperationMessagePort,
  type CanvasOperationStoreApi,
} from './canvasOperationStore';
import {
  createCanvasStore,
  useCanvasStore,
  type CanvasStore,
  type CanvasStoreApi,
} from './canvasStore';
import { createClipboardStore, useClipboardStore, type ClipboardStoreApi } from './clipboardStore';
import {
  createHistoryStore,
  useHistoryStore,
  type HistoryStore,
  type HistoryStoreApi,
} from './historyStore';
import {
  createPlaybackStore,
  usePlaybackStore,
  type PlaybackStore,
  type PlaybackStoreApi,
} from './playbackStore';
import {
  createRuntimeViewportStore,
  useRuntimeViewportStore,
  type RuntimeViewportState,
  type RuntimeViewportStoreApi,
} from './runtimeViewportStore';

interface CanvasStoreScope {
  readonly canvas: CanvasStoreApi;
  readonly clipboard: ClipboardStoreApi;
  readonly history: HistoryStoreApi;
  readonly operations: CanvasOperationStoreApi;
  readonly playback: PlaybackStoreApi;
  readonly viewport: RuntimeViewportStoreApi;
}

const CanvasStoreScopeContext = createContext<CanvasStoreScope | undefined>(undefined);
const defaultTestScope: CanvasStoreScope = {
  canvas: useCanvasStore,
  clipboard: useClipboardStore,
  history: useHistoryStore,
  operations: useCanvasOperationStore,
  playback: usePlaybackStore,
  viewport: useRuntimeViewportStore,
};
let defaultTestScopeEnabled = false;

/** Enables standalone stores only for the package test harness. */
export function enableDefaultCanvasTestStoreScope(): void {
  defaultTestScopeEnabled = true;
}

export function CanvasStoreScopeProvider({
  children,
  operationPort,
}: {
  readonly children: ReactNode;
  readonly operationPort: CanvasOperationMessagePort;
}) {
  const [scope] = useState<CanvasStoreScope>(() => {
    const history = createHistoryStore();
    const operations = createCanvasOperationStore(operationPort);
    return {
      canvas: createCanvasStore(history, operations),
      clipboard: createClipboardStore(),
      history,
      operations,
      playback: createPlaybackStore(),
      viewport: createRuntimeViewportStore(),
    };
  });
  return (
    <CanvasStoreScopeContext.Provider value={scope}>{children}</CanvasStoreScopeContext.Provider>
  );
}

function useCanvasStoreScope(): CanvasStoreScope {
  const scope = useContext(CanvasStoreScopeContext);
  if (scope) return scope;
  if (defaultTestScopeEnabled) return defaultTestScope;
  throw new Error('Canvas Store scope provider is missing.');
}

export function useScopedCanvasStore<T>(selector: (state: CanvasStore) => T): T {
  return useStore(useCanvasStoreScope().canvas, selector);
}

export function useCanvasStoreApi(): CanvasStoreApi {
  return useCanvasStoreScope().canvas;
}

export function useClipboardStoreApi(): ClipboardStoreApi {
  return useCanvasStoreScope().clipboard;
}

export function useScopedHistoryStore<T>(selector: (state: HistoryStore) => T): T {
  return useStore(useCanvasStoreScope().history, selector);
}

export function useHistoryStoreApi(): HistoryStoreApi {
  return useCanvasStoreScope().history;
}

export function useCanvasOperationStoreApi(): CanvasOperationStoreApi {
  return useCanvasStoreScope().operations;
}

export function useScopedPlaybackStore<T>(selector: (state: PlaybackStore) => T): T {
  return useStore(useCanvasStoreScope().playback, selector);
}

export function usePlaybackStoreApi(): PlaybackStoreApi {
  return useCanvasStoreScope().playback;
}

export function useScopedRuntimeViewportStore<T>(selector: (state: RuntimeViewportState) => T): T {
  return useStore(useCanvasStoreScope().viewport, selector);
}
