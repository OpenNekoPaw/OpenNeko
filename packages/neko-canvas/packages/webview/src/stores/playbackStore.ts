import { create } from 'zustand';
import type { CanvasPlaybackDiagnostic, CanvasPlaybackUnitKind } from '@neko/shared';

interface NodePlaybackState {
  currentTime: number;
  duration: number;
  wasPlaying: boolean;
  savedAt: number;
}

export type PlaybackSurfaceKind = 'inline' | 'overlay';
export type PlaybackWorkspacePane = 'canvas' | 'stage' | 'route';
export type PlaybackWorkspaceFocusOwner = 'canvas' | 'stage' | 'route' | 'toolbar';
export type PlaybackWorkspacePlaybackState = 'idle' | 'playing' | 'paused' | 'stale';
export type PlaybackRouteViewMode = 'matrix' | 'compact';
export type PlaybackMatrixFocusKind = 'row' | 'column' | 'cell';

export interface PlaybackWorkspaceLayoutState {
  readonly stageWidthPx: number;
  readonly routeHeightPx: number;
}

export interface PlaybackMatrixFilters {
  readonly routeFamilyId?: string;
  readonly routeIds: readonly string[];
  readonly containerIds: readonly string[];
  readonly highlightedNodeKinds: readonly CanvasPlaybackUnitKind[];
  readonly diagnosticSeverity?: CanvasPlaybackDiagnostic['severity'];
  readonly generationStatuses: readonly string[];
}

export interface PlaybackMatrixFocus {
  readonly kind: PlaybackMatrixFocusKind;
  readonly id: string;
}

export interface PlaybackMatrixState {
  readonly routeViewMode: PlaybackRouteViewMode;
  readonly activeRouteFamilyId?: string;
  readonly filters: PlaybackMatrixFilters;
  readonly focus?: PlaybackMatrixFocus;
  readonly foldedContainerIds: readonly string[];
  readonly projectionKey?: string;
}

export interface PlaybackSessionState {
  readonly visible: boolean;
  readonly panes: Readonly<Record<PlaybackWorkspacePane, boolean>>;
  readonly layout: PlaybackWorkspaceLayoutState;
  readonly routeId?: string;
  readonly currentUnitId?: string;
  readonly playheadMs: number;
  readonly focusOwner: PlaybackWorkspaceFocusOwner;
  readonly playbackState: PlaybackWorkspacePlaybackState;
  readonly stale: boolean;
  readonly matrix: PlaybackMatrixState;
}

export interface RevealPlaybackWorkspaceInput extends Partial<
  Pick<PlaybackSessionState, 'routeId' | 'currentUnitId' | 'focusOwner'>
> {
  readonly panes?: Partial<Record<PlaybackWorkspacePane, boolean>>;
}

const PLAYBACK_WORKSPACE_LAYOUT_BOUNDS = {
  stageWidthPx: { min: 280, max: 760, defaultValue: 520 },
  routeHeightPx: { min: 220, max: 640, defaultValue: 360 },
} as const;

const DEFAULT_PLAYBACK_SESSION: PlaybackSessionState = {
  visible: false,
  panes: {
    canvas: true,
    stage: false,
    route: false,
  },
  layout: {
    stageWidthPx: PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.stageWidthPx.defaultValue,
    routeHeightPx: PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.routeHeightPx.defaultValue,
  },
  playheadMs: 0,
  focusOwner: 'canvas',
  playbackState: 'idle',
  stale: false,
  matrix: {
    routeViewMode: 'matrix',
    filters: {
      routeIds: [],
      containerIds: [],
      highlightedNodeKinds: [],
      generationStatuses: [],
    },
    foldedContainerIds: [],
  },
};

export interface PlaybackHandoffRequest {
  sourceKey?: string;
  assetPath?: string;
  mediaType: 'video' | 'audio';
  fromSurfaceId: string;
  toKind: PlaybackSurfaceKind;
  startTime: number;
}

interface ActivePlaybackState {
  sourceKey: string;
  assetPath?: string;
  mediaType: 'video' | 'audio';
  surfaceId: string;
  surfaceKind: PlaybackSurfaceKind;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  updatedAt: number;
}

interface PlaybackStore {
  playbacks: Map<string, NodePlaybackState>;
  activePlayback: ActivePlaybackState | null;
  handoffRequest: PlaybackHandoffRequest | null;
  playbackSession: PlaybackSessionState;
  revealPlaybackWorkspace: (input?: RevealPlaybackWorkspaceInput) => void;
  hidePlaybackWorkspace: () => void;
  setPlaybackPaneVisible: (pane: PlaybackWorkspacePane, visible: boolean) => void;
  setPlaybackSessionRoute: (
    routeId: string | undefined,
    currentUnitId?: string,
    playheadMs?: number,
  ) => void;
  setPlaybackSessionCurrentUnit: (unitId: string | undefined, playheadMs?: number) => void;
  setPlaybackWorkspaceFocusOwner: (focusOwner: PlaybackWorkspaceFocusOwner) => void;
  setPlaybackWorkspacePlaybackState: (playbackState: PlaybackWorkspacePlaybackState) => void;
  setPlaybackWorkspaceLayout: (layout: Partial<PlaybackWorkspaceLayoutState>) => void;
  markPlaybackWorkspaceStale: (stale: boolean) => void;
  setPlaybackRouteViewMode: (routeViewMode: PlaybackRouteViewMode) => void;
  setPlaybackMatrixRouteFamily: (routeFamilyId: string | undefined) => void;
  setPlaybackMatrixFilters: (filters: Partial<PlaybackMatrixFilters>) => void;
  focusPlaybackMatrix: (focus: PlaybackMatrixFocus | undefined) => void;
  togglePlaybackMatrixContainerFold: (containerId: string) => void;
  reconcilePlaybackMatrixState: (input: ReconcilePlaybackMatrixStateInput) => void;
  savePlayback: (assetPath: string, state: Omit<NodePlaybackState, 'savedAt'>) => void;
  getPlayback: (assetPath: string) => NodePlaybackState | undefined;
  clearPlayback: (assetPath: string) => void;
  startActivePlayback: (
    state: Omit<ActivePlaybackState, 'sourceKey' | 'updatedAt' | 'isPlaying'> & {
      sourceKey?: string;
      isPlaying?: boolean;
    },
  ) => void;
  updateActivePlayback: (
    sourceKey: string,
    surfaceId: string,
    patch: Partial<Pick<ActivePlaybackState, 'currentTime' | 'duration' | 'isPlaying'>>,
  ) => void;
  stopActivePlayback: (sourceKey: string, surfaceId: string, currentTime: number) => void;
  requestHandoff: (request: PlaybackHandoffRequest) => void;
  consumeHandoff: (
    sourceKey: string | undefined,
    toKind: PlaybackSurfaceKind,
  ) => PlaybackHandoffRequest | null;
}

export interface ReconcilePlaybackMatrixStateInput {
  readonly projectionKey: string;
  readonly routeFamilyIds: readonly string[];
  readonly routeIds: readonly string[];
  readonly containerIds: readonly string[];
  readonly rowIds?: readonly string[];
  readonly columnIds?: readonly string[];
  readonly cellIds?: readonly string[];
}

const STALE_TIMEOUT_MS = 60_000;

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  playbacks: new Map(),
  activePlayback: null,
  handoffRequest: null,
  playbackSession: DEFAULT_PLAYBACK_SESSION,

  revealPlaybackWorkspace: (input = {}) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        visible: true,
        panes: {
          ...prev.playbackSession.panes,
          ...(input.panes ?? { stage: true, route: true }),
        },
        ...(input.routeId !== undefined ? { routeId: input.routeId } : {}),
        ...(input.currentUnitId !== undefined ? { currentUnitId: input.currentUnitId } : {}),
        focusOwner: input.focusOwner ?? 'stage',
        stale: false,
        playbackState:
          prev.playbackSession.playbackState === 'stale'
            ? 'idle'
            : prev.playbackSession.playbackState,
      },
    }));
  },

  hidePlaybackWorkspace: () => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        visible: false,
        playbackState:
          prev.playbackSession.playbackState === 'playing'
            ? 'paused'
            : prev.playbackSession.playbackState,
        focusOwner: 'canvas',
      },
    }));
  },

  setPlaybackPaneVisible: (pane, visible) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        panes: {
          ...prev.playbackSession.panes,
          [pane]: visible,
        },
        playbackState:
          pane === 'stage' && !visible && prev.playbackSession.playbackState === 'playing'
            ? 'paused'
            : prev.playbackSession.playbackState,
        focusOwner:
          prev.playbackSession.focusOwner === pane && !visible
            ? 'canvas'
            : prev.playbackSession.focusOwner,
      },
    }));
  },

  setPlaybackSessionRoute: (routeId, currentUnitId, playheadMs = 0) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        ...(routeId !== undefined ? { routeId } : { routeId: undefined }),
        currentUnitId,
        playheadMs,
      },
    }));
  },

  setPlaybackSessionCurrentUnit: (unitId, playheadMs = 0) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        currentUnitId: unitId,
        playheadMs,
      },
    }));
  },

  setPlaybackWorkspaceFocusOwner: (focusOwner) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        focusOwner,
      },
    }));
  },

  setPlaybackWorkspacePlaybackState: (playbackState) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        playbackState,
      },
    }));
  },

  setPlaybackWorkspaceLayout: (layout) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        layout: normalizePlaybackWorkspaceLayout({
          ...prev.playbackSession.layout,
          ...layout,
        }),
      },
    }));
  },

  markPlaybackWorkspaceStale: (stale) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        stale,
        playbackState: stale ? 'stale' : 'idle',
        ...(stale ? { visible: prev.playbackSession.visible } : {}),
      },
    }));
  },

  setPlaybackRouteViewMode: (routeViewMode) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        matrix: {
          ...prev.playbackSession.matrix,
          routeViewMode,
        },
      },
    }));
  },

  setPlaybackMatrixRouteFamily: (routeFamilyId) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        matrix: {
          ...prev.playbackSession.matrix,
          ...(routeFamilyId
            ? { activeRouteFamilyId: routeFamilyId }
            : { activeRouteFamilyId: undefined }),
          filters: {
            ...prev.playbackSession.matrix.filters,
            ...(routeFamilyId ? { routeFamilyId } : { routeFamilyId: undefined }),
          },
        },
      },
    }));
  },

  setPlaybackMatrixFilters: (filters) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        matrix: {
          ...prev.playbackSession.matrix,
          filters: normalizePlaybackMatrixFilters({
            ...prev.playbackSession.matrix.filters,
            ...filters,
          }),
        },
      },
    }));
  },

  focusPlaybackMatrix: (focus) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        matrix: {
          ...prev.playbackSession.matrix,
          ...(focus ? { focus } : { focus: undefined }),
        },
      },
    }));
  },

  togglePlaybackMatrixContainerFold: (containerId) => {
    set((prev) => {
      const folded = new Set(prev.playbackSession.matrix.foldedContainerIds);
      if (folded.has(containerId)) {
        folded.delete(containerId);
      } else {
        folded.add(containerId);
      }
      return {
        playbackSession: {
          ...prev.playbackSession,
          matrix: {
            ...prev.playbackSession.matrix,
            foldedContainerIds: Array.from(folded).sort(),
          },
        },
      };
    });
  },

  reconcilePlaybackMatrixState: (input) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        matrix: reconcilePlaybackMatrixState(prev.playbackSession.matrix, input),
      },
    }));
  },

  savePlayback: (assetPath, state) => {
    set((prev) => {
      const next = new Map(prev.playbacks);
      next.set(assetPath, { ...state, savedAt: Date.now() });
      return { playbacks: next };
    });
  },

  getPlayback: (assetPath) => {
    const entry = get().playbacks.get(assetPath);
    if (!entry) return undefined;
    if (Date.now() - entry.savedAt > STALE_TIMEOUT_MS) {
      get().clearPlayback(assetPath);
      return undefined;
    }
    return entry;
  },

  clearPlayback: (assetPath) => {
    set((prev) => {
      const next = new Map(prev.playbacks);
      next.delete(assetPath);
      return { playbacks: next };
    });
  },

  startActivePlayback: (state) => {
    const sourceKey = state.sourceKey ?? state.assetPath;
    if (!sourceKey) {
      throw new Error('Active playback requires a source key or asset path.');
    }
    set({
      activePlayback: {
        ...state,
        sourceKey,
        isPlaying: state.isPlaying ?? true,
        updatedAt: Date.now(),
      },
    });
  },

  updateActivePlayback: (sourceKey, surfaceId, patch) => {
    set((prev) => {
      const active = prev.activePlayback;
      if (!active || active.sourceKey !== sourceKey || active.surfaceId !== surfaceId) {
        return {};
      }
      return {
        activePlayback: {
          ...active,
          ...patch,
          updatedAt: Date.now(),
        },
      };
    });
  },

  stopActivePlayback: (sourceKey, surfaceId, currentTime) => {
    set((prev) => {
      const active = prev.activePlayback;
      if (!active || active.sourceKey !== sourceKey || active.surfaceId !== surfaceId) {
        return {};
      }
      return {
        activePlayback: null,
        playbacks: withSavedPlayback(prev.playbacks, sourceKey, {
          currentTime,
          duration: active.duration,
          wasPlaying: false,
        }),
      };
    });
  },

  requestHandoff: (request) => {
    const sourceKey = request.sourceKey ?? request.assetPath;
    if (!sourceKey) {
      throw new Error('Playback handoff requires a source key or asset path.');
    }
    set({ handoffRequest: { ...request, sourceKey } });
  },

  consumeHandoff: (sourceKey, toKind) => {
    if (!sourceKey) return null;
    const request = get().handoffRequest;
    const requestSourceKey = request?.sourceKey ?? request?.assetPath;
    if (!request || requestSourceKey !== sourceKey || request.toKind !== toKind) {
      return null;
    }
    set({ handoffRequest: null });
    return request;
  },
}));

function normalizePlaybackWorkspaceLayout(
  layout: PlaybackWorkspaceLayoutState,
): PlaybackWorkspaceLayoutState {
  return {
    stageWidthPx: clampLayoutValue(
      layout.stageWidthPx,
      PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.stageWidthPx,
    ),
    routeHeightPx: clampLayoutValue(
      layout.routeHeightPx,
      PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.routeHeightPx,
    ),
  };
}

function clampLayoutValue(
  value: number,
  bounds: { readonly min: number; readonly max: number; readonly defaultValue: number },
): number {
  if (!Number.isFinite(value)) return bounds.defaultValue;
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}

function normalizePlaybackMatrixFilters(filters: PlaybackMatrixFilters): PlaybackMatrixFilters {
  return {
    ...(filters.routeFamilyId ? { routeFamilyId: filters.routeFamilyId } : {}),
    routeIds: dedupeStrings(filters.routeIds),
    containerIds: dedupeStrings(filters.containerIds),
    highlightedNodeKinds: dedupeStrings(filters.highlightedNodeKinds),
    ...(filters.diagnosticSeverity ? { diagnosticSeverity: filters.diagnosticSeverity } : {}),
    generationStatuses: dedupeStrings(filters.generationStatuses),
  };
}

function reconcilePlaybackMatrixState(
  state: PlaybackMatrixState,
  input: ReconcilePlaybackMatrixStateInput,
): PlaybackMatrixState {
  const routeFamilyIds = new Set(input.routeFamilyIds);
  const routeIds = new Set(input.routeIds);
  const containerIds = new Set(input.containerIds);
  const activeRouteFamilyId =
    state.activeRouteFamilyId && routeFamilyIds.has(state.activeRouteFamilyId)
      ? state.activeRouteFamilyId
      : input.routeFamilyIds[0];
  const filters = normalizePlaybackMatrixFilters({
    ...state.filters,
    ...(state.filters.routeFamilyId && routeFamilyIds.has(state.filters.routeFamilyId)
      ? { routeFamilyId: state.filters.routeFamilyId }
      : activeRouteFamilyId
        ? { routeFamilyId: activeRouteFamilyId }
        : { routeFamilyId: undefined }),
    routeIds: state.filters.routeIds.filter((routeId) => routeIds.has(routeId)),
    containerIds: state.filters.containerIds.filter((containerId) => containerIds.has(containerId)),
  });
  return {
    ...state,
    ...(activeRouteFamilyId ? { activeRouteFamilyId } : { activeRouteFamilyId: undefined }),
    filters,
    foldedContainerIds: state.foldedContainerIds.filter((containerId) =>
      containerIds.has(containerId),
    ),
    focus: reconcilePlaybackMatrixFocus(state.focus, input),
    projectionKey: input.projectionKey,
  };
}

function reconcilePlaybackMatrixFocus(
  focus: PlaybackMatrixFocus | undefined,
  input: ReconcilePlaybackMatrixStateInput,
): PlaybackMatrixFocus | undefined {
  if (!focus) return undefined;
  if (focus.kind === 'row' && (input.rowIds ?? []).includes(focus.id)) return focus;
  if (focus.kind === 'column' && (input.columnIds ?? []).includes(focus.id)) return focus;
  if (focus.kind === 'cell' && (input.cellIds ?? []).includes(focus.id)) return focus;
  return undefined;
}

function dedupeStrings<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

function withSavedPlayback(
  playbacks: Map<string, NodePlaybackState>,
  assetPath: string,
  state: Omit<NodePlaybackState, 'savedAt'>,
): Map<string, NodePlaybackState> {
  const next = new Map(playbacks);
  next.set(assetPath, { ...state, savedAt: Date.now() });
  return next;
}
