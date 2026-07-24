import {
  createContext,
  useContext,
  useRef,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import type {
  CutClipRepresentationResult,
  CutExportTaskSnapshot,
  CutUserDiagnostic,
  TimelineView,
} from '@neko-cut/domain';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';

export interface CutPresentationClipSelection {
  readonly kind: 'clip';
  readonly trackId: string;
  readonly clipId: string;
}

export type CutPresentationSelection =
  | CutPresentationClipSelection
  | { readonly kind: 'gap'; readonly trackId: string; readonly itemIndex: number }
  | { readonly kind: 'track'; readonly trackId: string };

export type CutPresentationSelectionMode = 'replace' | 'add' | 'toggle';
export type CutPlacementMode = 'sequence' | 'position';

export type CutPresentationClipboard =
  | {
      readonly kind: 'clips';
      readonly documentUri: string;
      readonly sessionId: string;
      readonly clips: readonly Pick<CutPresentationClipSelection, 'trackId' | 'clipId'>[];
    }
  | {
      readonly kind: 'track';
      readonly documentUri: string;
      readonly sessionId: string;
      readonly trackId: string;
    };

export interface CutClipGestureDraft {
  readonly clipId: string;
  readonly targetTrackId: string;
  readonly timelineStartFrames: number;
  readonly mode: 'place' | 'trim-start' | 'trim-end';
}

export interface CutPresentationState {
  readonly view?: TimelineView;
  readonly selection?: CutPresentationSelection;
  readonly selectedClips: readonly CutPresentationClipSelection[];
  readonly clipboard?: CutPresentationClipboard;
  readonly playheadSeconds: number;
  readonly isPlaying: boolean;
  readonly previewVolume: number;
  readonly previewMuted: boolean;
  readonly pixelsPerSecond: number;
  readonly snappingEnabled: boolean;
  readonly placementMode: CutPlacementMode;
  readonly overviewVisible: boolean;
  readonly inspectorVisible: boolean;
  readonly gestureDraft?: CutClipGestureDraft;
  readonly exportTasks: readonly CutExportTaskSnapshot[];
  readonly representations: ReadonlyMap<string, CutClipRepresentationResult>;
  readonly diagnostic?: CutUserDiagnostic;
  readonly actions: CutPresentationActions;
}

export interface CutPresentationActions {
  readonly select: (
    selection: CutPresentationSelection | undefined,
    mode?: CutPresentationSelectionMode,
  ) => void;
  readonly selectManyClips: (
    selections: readonly CutPresentationClipSelection[],
    mode?: Exclude<CutPresentationSelectionMode, 'toggle'>,
  ) => void;
  readonly selectAllClips: () => void;
  readonly copySelection: () => void;
  readonly seek: (seconds: number) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly setPreviewVolume: (volume: number) => void;
  readonly togglePreviewMute: () => void;
  readonly setPixelsPerSecond: (pixelsPerSecond: number) => void;
  readonly toggleSnapping: () => void;
  readonly setPlacementMode: (mode: CutPlacementMode) => void;
  readonly setOverviewVisible: (visible: boolean) => void;
  readonly setInspectorVisible: (visible: boolean) => void;
  readonly setGestureDraft: (draft: CutClipGestureDraft | undefined) => void;
  readonly reportDiagnostic: (diagnostic: CutUserDiagnostic) => void;
  readonly clearDiagnostic: () => void;
}

export type CutPresentationStore = StoreApi<CutPresentationState>;

const CutPresentationStoreContext = createContext<CutPresentationStore | undefined>(undefined);

export function createCutPresentationStore(): CutPresentationStore {
  return createStore<CutPresentationState>()((set, get) => ({
    playheadSeconds: 0,
    isPlaying: false,
    previewVolume: 1,
    previewMuted: false,
    pixelsPerSecond: 80,
    snappingEnabled: true,
    placementMode: 'sequence',
    overviewVisible: true,
    inspectorVisible: true,
    selectedClips: [],
    exportTasks: [],
    representations: new Map(),
    actions: {
      select: (selection, mode = 'replace') =>
        set((state) => selectPresentationState(state, selection, mode)),
      selectManyClips: (selections, mode = 'replace') =>
        set((state) => {
          const next =
            mode === 'add'
              ? deduplicateClipSelections([...state.selectedClips, ...selections])
              : deduplicateClipSelections(selections);
          return {
            selectedClips: next,
            selection: next[next.length - 1],
          };
        }),
      selectAllClips: () =>
        set((state) => {
          const selectedClips =
            state.view?.tracks.flatMap((track) =>
              track.items.flatMap((item) =>
                item.kind === 'clip'
                  ? [{ kind: 'clip' as const, trackId: track.trackId, clipId: item.clipId }]
                  : [],
              ),
            ) ?? [];
          return {
            selectedClips,
            selection: selectedClips[selectedClips.length - 1],
          };
        }),
      copySelection: () => {
        const { selectedClips, selection, view } = get();
        if (!view || !selection || selection.kind === 'gap') return;
        set({
          clipboard:
            selectedClips.length > 0
              ? {
                  kind: 'clips',
                  documentUri: view.documentUri,
                  sessionId: view.sessionId,
                  clips: selectedClips.map(({ trackId, clipId }) => ({ trackId, clipId })),
                }
              : {
                  kind: 'track',
                  documentUri: view.documentUri,
                  sessionId: view.sessionId,
                  trackId: selection.trackId,
                },
        });
      },
      seek: (seconds) => {
        const duration = get().view?.durationSeconds ?? 0;
        set({ playheadSeconds: clamp(seconds, 0, duration) });
      },
      setPlaying: (isPlaying) => set({ isPlaying }),
      setPreviewVolume: (previewVolume) => set({ previewVolume: clamp(previewVolume, 0, 1) }),
      togglePreviewMute: () => set((state) => ({ previewMuted: !state.previewMuted })),
      setPixelsPerSecond: (pixelsPerSecond) =>
        set({ pixelsPerSecond: clamp(pixelsPerSecond, 8, 480) }),
      toggleSnapping: () => set((state) => ({ snappingEnabled: !state.snappingEnabled })),
      setPlacementMode: (placementMode) => set({ placementMode }),
      setOverviewVisible: (overviewVisible) => set({ overviewVisible }),
      setInspectorVisible: (inspectorVisible) => set({ inspectorVisible }),
      setGestureDraft: (gestureDraft) => set({ gestureDraft }),
      reportDiagnostic: (diagnostic) => set({ diagnostic }),
      clearDiagnostic: () => set({ diagnostic: undefined }),
    },
  }));
}

function selectPresentationState(
  state: CutPresentationState,
  selection: CutPresentationSelection | undefined,
  mode: CutPresentationSelectionMode,
): Pick<CutPresentationState, 'selection' | 'selectedClips'> {
  if (!selection) return { selection: undefined, selectedClips: [] };
  if (selection.kind !== 'clip') {
    return { selection, selectedClips: [] };
  }
  if (mode === 'replace') {
    return { selection, selectedClips: [selection] };
  }
  const exists = state.selectedClips.some((candidate) => sameClipSelection(candidate, selection));
  const selectedClips =
    mode === 'toggle' && exists
      ? state.selectedClips.filter((candidate) => !sameClipSelection(candidate, selection))
      : deduplicateClipSelections([...state.selectedClips, selection]);
  return {
    selectedClips,
    selection: selectedClips[selectedClips.length - 1],
  };
}

function deduplicateClipSelections(
  selections: readonly CutPresentationClipSelection[],
): readonly CutPresentationClipSelection[] {
  const seen = new Set<string>();
  return selections.filter((selection) => {
    const key = `${selection.trackId}\0${selection.clipId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameClipSelection(
  left: CutPresentationClipSelection,
  right: CutPresentationClipSelection,
): boolean {
  return left.trackId === right.trackId && left.clipId === right.clipId;
}

export function CutPresentationStoreProvider({
  store,
  children,
}: PropsWithChildren<{ readonly store?: CutPresentationStore }>): ReactElement {
  const storeRef = useRef<CutPresentationStore>();
  if (!storeRef.current) storeRef.current = store ?? createCutPresentationStore();
  return (
    <CutPresentationStoreContext.Provider value={storeRef.current}>
      {children}
    </CutPresentationStoreContext.Provider>
  );
}

export function useCutPresentationStore<T>(selector: (state: CutPresentationState) => T): T {
  const store = useContext(CutPresentationStoreContext);
  if (!store) throw new Error('CutPresentationStoreProvider is missing.');
  return useStore(store, selector);
}

export function useCutPresentationStoreApi(): CutPresentationStore {
  const store = useContext(CutPresentationStoreContext);
  if (!store) throw new Error('CutPresentationStoreProvider is missing.');
  return store;
}

export function representationKey(
  revision: number,
  clipId: string,
  kind: CutClipRepresentationResult['kind'],
): string {
  return `${revision}:${clipId}:${kind}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
