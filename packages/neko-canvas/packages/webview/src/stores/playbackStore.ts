import { create, createStore, type StateCreator } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';

interface NodePlaybackState {
  currentTime: number;
  duration: number;
  wasPlaying: boolean;
  savedAt: number;
}

export type PlaybackSurfaceKind = 'inline' | 'overlay';
export type PlaybackWorkspaceFocusOwner = 'canvas' | 'preview' | 'route' | 'toolbar';
export type PlaybackWorkspacePlaybackState = 'idle' | 'playing' | 'paused' | 'stale';
export type PlaybackOverlayPresentation = 'overlay' | 'fullscreen';

export interface PlaybackSessionState {
  readonly visible: boolean;
  readonly presentation: PlaybackOverlayPresentation;
  readonly routeId?: string;
  readonly currentUnitId?: string;
  readonly playheadMs: number;
  readonly focusOwner: PlaybackWorkspaceFocusOwner;
  readonly playbackState: PlaybackWorkspacePlaybackState;
  readonly stale: boolean;
}

export type RevealPlaybackWorkspaceInput = Partial<
  Pick<PlaybackSessionState, 'routeId' | 'currentUnitId' | 'focusOwner'>
>;

const DEFAULT_PLAYBACK_SESSION: PlaybackSessionState = {
  visible: false,
  presentation: 'overlay',
  playheadMs: 0,
  focusOwner: 'canvas',
  playbackState: 'idle',
  stale: false,
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

export interface PlaybackStore {
  playbacks: Map<string, NodePlaybackState>;
  activePlayback: ActivePlaybackState | null;
  handoffRequest: PlaybackHandoffRequest | null;
  playbackSession: PlaybackSessionState;
  revealPlaybackWorkspace: (input?: RevealPlaybackWorkspaceInput) => void;
  hidePlaybackWorkspace: () => void;
  setPlaybackOverlayPresentation: (presentation: PlaybackOverlayPresentation) => void;
  setPlaybackSessionRoute: (
    routeId: string | undefined,
    currentUnitId?: string,
    playheadMs?: number,
  ) => void;
  setPlaybackSessionCurrentUnit: (unitId: string | undefined, playheadMs?: number) => void;
  setPlaybackWorkspaceFocusOwner: (focusOwner: PlaybackWorkspaceFocusOwner) => void;
  setPlaybackWorkspacePlaybackState: (playbackState: PlaybackWorkspacePlaybackState) => void;
  markPlaybackWorkspaceStale: (stale: boolean) => void;
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

const STALE_TIMEOUT_MS = 60_000;

const createPlaybackState: StateCreator<PlaybackStore> = (set, get) => ({
  playbacks: new Map(),
  activePlayback: null,
  handoffRequest: null,
  playbackSession: DEFAULT_PLAYBACK_SESSION,

  revealPlaybackWorkspace: (input = {}) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        visible: true,
        ...(input.routeId !== undefined ? { routeId: input.routeId } : {}),
        ...(input.currentUnitId !== undefined ? { currentUnitId: input.currentUnitId } : {}),
        focusOwner: input.focusOwner ?? 'route',
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
        presentation: 'overlay',
        playbackState:
          prev.playbackSession.playbackState === 'playing'
            ? 'paused'
            : prev.playbackSession.playbackState,
        focusOwner: 'canvas',
      },
    }));
  },

  setPlaybackOverlayPresentation: (presentation) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        presentation,
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

  markPlaybackWorkspaceStale: (stale) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        stale,
        playbackState: stale
          ? 'stale'
          : prev.playbackSession.playbackState === 'stale'
            ? 'idle'
            : prev.playbackSession.playbackState,
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
});

export type PlaybackStoreApi = StoreApi<PlaybackStore>;

export function createPlaybackStore(): PlaybackStoreApi {
  return createStore(createPlaybackState);
}

/** Test/default standalone store. Production Roots use CanvasStoreScopeProvider. */
export const usePlaybackStore = create(createPlaybackState);

function withSavedPlayback(
  playbacks: Map<string, NodePlaybackState>,
  assetPath: string,
  state: Omit<NodePlaybackState, 'savedAt'>,
): Map<string, NodePlaybackState> {
  const next = new Map(playbacks);
  next.set(assetPath, { ...state, savedAt: Date.now() });
  return next;
}
