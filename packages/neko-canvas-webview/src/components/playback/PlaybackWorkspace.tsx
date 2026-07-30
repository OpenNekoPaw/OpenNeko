import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCanvasPlaybackPlan,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasData,
  type CanvasPlaybackDiagnostic,
  type CanvasPlaybackPlan,
  type CanvasPlaybackRouteCandidate,
  type CanvasPlaybackUnit,
  type CanvasPreviewRole,
  type ResourceRef,
} from '@neko/shared';
import { isResourceRef } from '@neko/shared';
import { CloseIcon, EyeIcon, EyeOffIcon, FullscreenIcon, RestoreIcon } from '@neko/shared/icons';
import { PlayIcon } from '@neko/ui/icons';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { IconButton } from '@neko/ui/primitives';
import { t } from '../../i18n';
import {
  usePlaybackStoreApi,
  useScopedCanvasStore as useCanvasStore,
  useScopedPlaybackStore as usePlaybackStore,
  useScopedRuntimeViewportStore as useRuntimeViewportStore,
} from '../../stores/canvasStoreScope';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type {
  PreviewPlaybackControl,
  PreviewPlaybackEndedEvent,
  PreviewPlaybackProgressEvent,
  PreviewSourceDescriptor,
} from '../../preview/types';
import {
  CanvasPlaybackControls,
  useCanvasPlaybackController,
  type CanvasPlaybackControllerModel,
  type CanvasPlaybackRequest,
  type PlaybackCompletionSignal,
} from './CanvasPlaybackController';
import { useOptionalCanvasHost } from '../../host-runtime';
import { buildStorylineGraphLayout, type StorylineGraphLayout } from './storylineGraphLayout';

const HOST_PLAYBACK_PLAN_TIMEOUT_MS = 5_000;
const DEFAULT_ROUTE_UNIT_DURATION_MS = 1200;
const STORYLINE_COLUMN_WIDTH = 132;
const STORYLINE_LANE_HEIGHT = 48;
const STORYLINE_GRAPH_PADDING_X = 24;
const STORYLINE_GRAPH_PADDING_Y = 18;

export interface PlaybackWorkspaceProps {
  readonly canvasPane: React.ReactNode;
  readonly className?: string;
}

export function PlaybackWorkspace({ canvasPane, className }: PlaybackWorkspaceProps) {
  const host = useOptionalCanvasHost();
  const playbackStoreApi = usePlaybackStoreApi();
  const canvasPaneRef = useRef<HTMLDivElement | null>(null);
  const canvasData = useCanvasStore((state) => state.canvasData);
  const selectedNodeId = useCanvasStore((state) => state.selection.nodeIds[0]);
  const viewportZoom = useRuntimeViewportStore((state) => state.viewport.zoom);
  const setViewport = useRuntimeViewportStore((state) => state.setViewport);
  const session = usePlaybackStore((state) => state.playbackSession);
  const setRoute = usePlaybackStore((state) => state.setPlaybackSessionRoute);
  const setCurrentUnit = usePlaybackStore((state) => state.setPlaybackSessionCurrentUnit);
  const setFocusOwner = usePlaybackStore((state) => state.setPlaybackWorkspaceFocusOwner);
  const setPlaybackState = usePlaybackStore((state) => state.setPlaybackWorkspacePlaybackState);
  const hidePlaybackWorkspace = usePlaybackStore((state) => state.hidePlaybackWorkspace);
  const setOverlayPresentation = usePlaybackStore((state) => state.setPlaybackOverlayPresentation);
  const markStale = usePlaybackStore((state) => state.markPlaybackWorkspaceStale);
  const savePlayback = usePlaybackStore((state) => state.savePlayback);

  const localPlan = useMemo(
    () =>
      canvasData
        ? createCanvasPlaybackPlan({ canvas: canvasData, selectedNodeId, adapterId: 'auto' })
        : null,
    [canvasData, selectedNodeId],
  );
  const [hostPlanState, setHostPlanState] = useState<{
    readonly plan: CanvasPlaybackPlan | null;
    readonly stale: boolean;
    readonly sourceCanvasData: CanvasData | null;
    readonly error?: string;
  }>({ plan: null, stale: false, sourceCanvasData: null });
  const [playbackRequest, setPlaybackRequest] = useState<CanvasPlaybackRequest | undefined>();
  const [playbackCompletionSignal, setPlaybackCompletionSignal] = useState<
    PlaybackCompletionSignal | undefined
  >();
  const hostPlan = hostPlanState.sourceCanvasData === canvasData ? hostPlanState.plan : null;
  const plan = hostPlan ?? localPlan;
  const routeResolution = useMemo(
    () => (plan ? resolveEffectiveCanvasPlaybackRoutes(plan) : null),
    [plan],
  );
  const playbackDiagnostics = useMemo(
    () => mergePlaybackDiagnostics(plan?.diagnostics ?? [], routeResolution?.diagnostics ?? []),
    [plan?.diagnostics, routeResolution?.diagnostics],
  );
  const unitById = useMemo(
    () => new Map((plan?.units ?? []).map((unit) => [unit.id, unit])),
    [plan],
  );
  const selectedRoute =
    routeResolution?.routes.find((route) => route.id === session.routeId) ??
    routeResolution?.routes.find((route) =>
      session.currentUnitId ? route.unitIds.includes(session.currentUnitId) : false,
    ) ??
    routeResolution?.routes[0];
  const currentUnit =
    (session.currentUnitId ? unitById.get(session.currentUnitId) : undefined) ??
    (selectedRoute?.unitIds[0] ? unitById.get(selectedRoute.unitIds[0]) : undefined);
  const currentUnitId = currentUnit?.id;
  const activeSessionUnitId = currentUnitId ?? session.currentUnitId;
  const routeUnitIds = useMemo(() => selectedRoute?.unitIds ?? [], [selectedRoute]);
  const routeUnits = useMemo(
    () =>
      routeUnitIds
        .map((unitId) => unitById.get(unitId))
        .filter((unit): unit is CanvasPlaybackUnit => Boolean(unit)),
    [routeUnitIds, unitById],
  );
  const routeTimeSegments = useMemo(() => buildRouteTimeSegments(routeUnits), [routeUnits]);
  const routeDurationMs = routeTimeSegments.at(-1)?.endMs ?? 0;
  const absoluteRoutePlayheadMs = resolveAbsoluteRoutePlayheadMs(
    routeTimeSegments,
    currentUnitId ?? session.currentUnitId,
    session.playheadMs,
  );
  useEffect(() => {
    if (!session.visible || !canvasData) {
      return;
    }
    const hostPort = host;
    if (!hostPort || !(hostPort.supportsMessage?.('playback:getPreviewPlan') ?? true)) {
      setHostPlanState({ plan: null, stale: false, sourceCanvasData: null });
      return;
    }

    let cancelled = false;
    const requestId = `playback-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const settleHostPlan = (nextState: {
      readonly plan: CanvasPlaybackPlan | null;
      readonly stale: boolean;
      readonly sourceCanvasData: CanvasData | null;
      readonly error?: string;
    }) => {
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timeoutId);
      if (cancelled) return;
      setHostPlanState(nextState);
      markStale(nextState.stale);
    };
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        requestId?: string;
        plan?: CanvasPlaybackPlan;
        stale?: boolean;
        error?: string;
      };
      if (message.type !== 'playback:previewPlanResult' || message.requestId !== requestId) {
        return;
      }
      settleHostPlan({
        plan: message.plan ?? null,
        stale: message.stale === true,
        sourceCanvasData: canvasData,
        ...(typeof message.error === 'string' ? { error: message.error } : {}),
      });
    };
    const timeoutId = window.setTimeout(() => {
      settleHostPlan({
        plan: null,
        stale: true,
        sourceCanvasData: canvasData,
        error: t('playback.stage.hostPlanTimeout'),
      });
    }, HOST_PLAYBACK_PLAN_TIMEOUT_MS);

    window.addEventListener('message', handleMessage);
    queueMicrotask(() => {
      if (cancelled) return;
      hostPort.postMessage({
        type: 'playback:getPreviewPlan',
        requestId,
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
    };
  }, [canvasData, host, markStale, session.visible]);

  useEffect(() => {
    if (playbackStoreApi.getState().playbackSession.stale) {
      markStale(false);
    }
    setHostPlanState({ plan: null, stale: false, sourceCanvasData: null });
  }, [canvasData, markStale]);

  useEffect(() => {
    if (!selectedRoute) return;
    if (session.routeId !== selectedRoute.id) {
      const currentUnitInRoute =
        session.currentUnitId !== undefined &&
        selectedRoute.unitIds.includes(session.currentUnitId);
      setRoute(
        selectedRoute.id,
        currentUnitInRoute ? session.currentUnitId : selectedRoute.unitIds[0],
        currentUnitInRoute ? session.playheadMs : 0,
      );
      return;
    }
    if (!session.currentUnitId && selectedRoute.unitIds[0]) {
      setCurrentUnit(selectedRoute.unitIds[0], 0);
    }
  }, [
    selectedRoute,
    session.currentUnitId,
    session.playheadMs,
    session.routeId,
    setCurrentUnit,
    setRoute,
  ]);

  useEffect(() => {
    if (!session.visible && session.playbackState === 'playing') {
      setPlaybackState('paused');
    }
  }, [session.playbackState, session.visible, setPlaybackState]);

  useEffect(() => {
    if (!session.visible) return;
    const handleWindowBlur = () => {
      if (playbackStoreApi.getState().playbackSession.playbackState === 'playing') {
        playbackStoreApi.getState().setPlaybackWorkspacePlaybackState('paused');
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [session.visible]);

  useEffect(() => {
    if (!session.visible) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      hidePlaybackWorkspace();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [hidePlaybackWorkspace, session.visible]);

  const workspaceClasses = ['canvas-playback-workspace', className].filter(Boolean).join(' ');
  const overlayVisible = session.visible;
  const revealCanvasSourceNode = (sourceNodeId: string) => {
    const target = canvasData?.nodes.find((node) => node.id === sourceNodeId);
    if (!target) return;
    const pane = canvasPaneRef.current ?? document.getElementById('canvas-playback-canvas-pane');
    if (!(pane instanceof HTMLElement)) return;
    const rect = pane.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : pane.clientWidth;
    const height = rect.height > 0 ? rect.height : pane.clientHeight;
    if (width <= 0 || height <= 0) return;
    const centerX = target.position.x + target.size.width / 2;
    const centerY = target.position.y + target.size.height / 2;
    setViewport({
      pan: {
        x: width / 2 - centerX * viewportZoom,
        y: height / 2 - centerY * viewportZoom,
      },
    });
  };
  const syncPlaybackUnit = (
    unitId: string | undefined,
    playheadMs = 0,
    routeId = selectedRoute?.id,
  ): CanvasPlaybackUnit | undefined => {
    if (!unitId) return undefined;
    const unit = unitById.get(unitId);
    const targetRoute = routeId && routeResolution?.routes.find((route) => route.id === routeId);
    if (targetRoute && targetRoute.unitIds.includes(unitId)) {
      setRoute(targetRoute.id, unitId, playheadMs);
    } else {
      setCurrentUnit(unitId, playheadMs);
    }
    if (!unit) return undefined;
    if (unit.assetPath) {
      savePlayback(unit.assetPath, {
        currentTime: playheadMs / 1000,
        duration: resolveRouteUnitDurationMs(unit) / 1000,
        wasPlaying: false,
      });
    }
    return unit;
  };
  const navigateToPlaybackUnit = (
    unitId: string | undefined,
    playheadMs = 0,
    routeId = selectedRoute?.id,
  ) => {
    const unit = syncPlaybackUnit(unitId, playheadMs, routeId);
    if (unit) revealCanvasSourceNode(unit.sourceNodeId);
  };
  const selectPlaybackTime = (targetMs: number) => {
    const segment = resolveRouteTimeSegment(routeTimeSegments, targetMs);
    if (!segment) return;
    const unitPlayheadMs = clampNumber(targetMs - segment.startMs, 0, segment.durationMs);
    syncPlaybackUnit(segment.unit.id, unitPlayheadMs);
    setPlaybackRequest((prev) => ({
      unitId: segment.unit.id,
      startTimeMs: unitPlayheadMs,
      state: session.playbackState === 'playing' ? 'playing' : 'paused',
      requestId: `route-seek-${Date.now()}-${prev?.requestId ?? 'initial'}`,
    }));
  };
  const handlePreviewPlaybackTimeUpdate = useCallback(
    (event: PreviewPlaybackProgressEvent) => {
      const unitId = readPlaybackSourceUnitId(event.sourceId);
      if (!unitId || unitId !== (currentUnit?.id ?? session.currentUnitId)) return;
      setCurrentUnit(unitId, Math.round(event.currentTime * 1000));
    },
    [currentUnit?.id, session.currentUnitId, setCurrentUnit],
  );
  const handlePreviewPlaybackEnded = useCallback(
    (event: PreviewPlaybackEndedEvent) => {
      const unitId = readPlaybackSourceUnitId(event.sourceId);
      if (!unitId || unitId !== (currentUnit?.id ?? session.currentUnitId)) return;
      setCurrentUnit(unitId, Math.round(event.duration * 1000));
      setPlaybackCompletionSignal((previous) => ({
        unitId,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
    },
    [currentUnit?.id, session.currentUnitId, setCurrentUnit],
  );
  const previewPlaybackControl = useMemo<PreviewPlaybackControl | undefined>(() => {
    if (!currentUnitId) return undefined;
    const state = session.playbackState === 'playing' ? 'playing' : 'paused';
    if (playbackRequest?.unitId !== currentUnitId) {
      return {
        requestId: `route-idle-${currentUnitId}`,
        state,
        startTimeSeconds: session.playheadMs / 1000,
        onTimeUpdate: handlePreviewPlaybackTimeUpdate,
        onEnded: handlePreviewPlaybackEnded,
      };
    }
    return {
      requestId: playbackRequest.requestId,
      state,
      startTimeSeconds: playbackRequest.startTimeMs / 1000,
      onTimeUpdate: handlePreviewPlaybackTimeUpdate,
      onEnded: handlePreviewPlaybackEnded,
    };
  }, [
    currentUnitId,
    handlePreviewPlaybackEnded,
    handlePreviewPlaybackTimeUpdate,
    playbackRequest,
    session.playbackState,
    session.playheadMs,
  ]);
  const playbackController = useCanvasPlaybackController({
    plan,
    routeUnitIds,
    activeUnitId: currentUnit?.id ?? session.currentUnitId ?? null,
    isPlaying: session.playbackState === 'playing',
    currentTimeMs: absoluteRoutePlayheadMs,
    durationMs: routeDurationMs,
    playbackCompletionSignal,
    onActiveUnitChange: (unitId, origin) => {
      if (origin === 'navigation') {
        navigateToPlaybackUnit(unitId, 0);
        return;
      }
      syncPlaybackUnit(unitId, unitId === activeSessionUnitId ? session.playheadMs : 0);
    },
    onPlayingChange: (playing) => {
      setPlaybackState(playing ? 'playing' : 'paused');
      if (!playing && currentUnit) {
        setPlaybackRequest((previous) => ({
          unitId: currentUnit.id,
          startTimeMs: session.playheadMs,
          state: 'paused',
          requestId: `route-pause-${Date.now()}-${previous?.requestId ?? 'initial'}`,
        }));
      }
    },
    onSeek: selectPlaybackTime,
    onPlaybackRequest: (request) => {
      setPlaybackRequest({
        ...request,
        startTimeMs:
          request.unitId === activeSessionUnitId ? session.playheadMs : request.startTimeMs,
      });
    },
  });
  const closeOverlay = () => {
    hidePlaybackWorkspace();
  };
  const toggleOverlayPresentation = () => {
    setOverlayPresentation(session.presentation === 'fullscreen' ? 'overlay' : 'fullscreen');
  };
  return (
    <section
      id="canvas-playback-workspace"
      className={workspaceClasses}
      data-testid="canvas-playback-workspace"
      data-playback-visible={session.visible ? 'true' : 'false'}
      data-playback-focus-owner={session.focusOwner}
    >
      <div className="canvas-playback-workspace-main">
        <div
          id="canvas-playback-canvas-pane"
          ref={canvasPaneRef}
          className="canvas-playback-canvas-pane"
          data-testid="canvas-playback-canvas-pane"
          {...getKeyboardBoundaryMetadata({
            scope: 'editor',
            ownerId: 'canvas-editor-pane',
            priority: 0,
          })}
          onFocus={() => setFocusOwner('canvas')}
        >
          {canvasPane}
        </div>

        {overlayVisible ? (
          <StorylinePlaybackOverlay
            presentation={session.presentation}
            isPlaying={session.playbackState === 'playing'}
            routes={routeResolution?.routes ?? []}
            diagnostics={playbackDiagnostics}
            runtimeError={hostPlanState.error}
            unitById={unitById}
            selectedRoute={selectedRoute}
            currentUnit={currentUnit}
            currentUnitId={currentUnitId ?? session.currentUnitId}
            plan={plan}
            playbackController={playbackController}
            previewPlaybackControl={previewPlaybackControl}
            onSelectRoute={(route) => {
              navigateToPlaybackUnit(route.unitIds[0], 0, route.id);
            }}
            onSelectUnit={(unitId, routeId) => navigateToPlaybackUnit(unitId, 0, routeId)}
            onFocusStoryline={() => setFocusOwner('route')}
            onTogglePresentation={toggleOverlayPresentation}
            onClose={closeOverlay}
          />
        ) : null}
      </div>
    </section>
  );
}

interface StorylinePlaybackOverlayProps {
  readonly presentation: 'overlay' | 'fullscreen';
  readonly isPlaying: boolean;
  readonly routes: readonly CanvasPlaybackRouteCandidate[];
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly runtimeError?: string;
  readonly unitById: ReadonlyMap<string, CanvasPlaybackUnit>;
  readonly selectedRoute: CanvasPlaybackRouteCandidate | undefined;
  readonly currentUnit: CanvasPlaybackUnit | undefined;
  readonly currentUnitId: string | undefined;
  readonly plan: CanvasPlaybackPlan | null;
  readonly playbackController: CanvasPlaybackControllerModel | null;
  readonly previewPlaybackControl?: PreviewPlaybackControl;
  readonly onSelectRoute: (route: CanvasPlaybackRouteCandidate) => void;
  readonly onSelectUnit: (unitId: string, routeId: string) => void;
  readonly onFocusStoryline: () => void;
  readonly onTogglePresentation: () => void;
  readonly onClose: () => void;
}

function StorylinePlaybackOverlay({
  presentation,
  isPlaying,
  routes,
  diagnostics,
  runtimeError,
  unitById,
  selectedRoute,
  currentUnit,
  currentUnitId,
  plan,
  playbackController,
  previewPlaybackControl,
  onSelectRoute,
  onSelectUnit,
  onFocusStoryline,
  onTogglePresentation,
  onClose,
}: StorylinePlaybackOverlayProps) {
  const [previewRevealed, setPreviewRevealed] = useState(false);
  const revealRequested = isPlaying || presentation === 'fullscreen';
  const expanded = previewRevealed || presentation === 'fullscreen';
  const storylineGraph = useMemo(
    () => buildStorylineGraphLayout(routes, unitById),
    [routes, unitById],
  );

  useEffect(() => {
    if (revealRequested) {
      setPreviewRevealed(true);
    }
  }, [revealRequested]);

  return (
    <div
      className="canvas-playback-overlay-layer"
      data-testid="canvas-playback-overlay-layer"
      data-presentation={presentation}
      role="presentation"
    >
      <section
        id="canvas-playback-overlay"
        className="canvas-playback-overlay"
        data-testid="canvas-playback-overlay"
        data-presentation={presentation}
        data-expanded={expanded ? 'true' : 'false'}
        role="dialog"
        aria-label={t('playback.overlay.title')}
        {...getKeyboardBoundaryMetadata({
          scope: 'media-preview',
          ownerId: 'canvas-playback-overlay',
          priority: 40,
          ownedKeys: ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'Tab'],
        })}
      >
        <div className="canvas-playback-overlay-storyline">
          {renderStorylineGraph({
            graph: storylineGraph,
            routes,
            diagnostics,
            runtimeError,
            unitById,
            selectedRouteId: selectedRoute?.id,
            currentUnitId,
            onSelectRoute,
            onSelectUnit,
            onFocus: onFocusStoryline,
          })}
        </div>
        <div className="canvas-playback-overlay-controls">
          {playbackController ? <CanvasPlaybackControls model={playbackController} /> : null}
        </div>
        {expanded ? (
          <div className="canvas-playback-overlay-preview">
            {renderPlaybackPreview({
              plan,
              unit: currentUnit,
              playbackControl: previewPlaybackControl,
            })}
          </div>
        ) : null}
        <footer className="canvas-playback-overlay-footer">
          <strong>
            {currentUnit
              ? formatPlaybackDisplayLabel(currentUnit.label ?? currentUnit.id)
              : t('playback.overlay.title')}
          </strong>
          <div className="canvas-playback-overlay-actions">
            {presentation !== 'fullscreen' ? (
              expanded ? (
                <IconButton
                  className="canvas-playback-panel-icon-button"
                  data-playback-action="hide-preview"
                  icon={<EyeOffIcon size={15} />}
                  label={t('playback.overlay.hidePreview')}
                  title={t('playback.overlay.hidePreview')}
                  onClick={() => setPreviewRevealed(false)}
                />
              ) : (
                <IconButton
                  className="canvas-playback-panel-icon-button"
                  data-playback-action="reveal-preview"
                  icon={<EyeIcon size={15} />}
                  label={t('playback.overlay.showPreview')}
                  title={t('playback.overlay.showPreview')}
                  onClick={() => setPreviewRevealed(true)}
                />
              )
            ) : null}
            <IconButton
              className="canvas-playback-panel-icon-button"
              data-playback-action="toggle-overlay-fullscreen"
              icon={
                presentation === 'fullscreen' ? (
                  <RestoreIcon size={15} />
                ) : (
                  <FullscreenIcon size={15} />
                )
              }
              label={
                presentation === 'fullscreen'
                  ? t('playback.overlay.restore')
                  : t('playback.overlay.fullscreen')
              }
              title={
                presentation === 'fullscreen'
                  ? t('playback.overlay.restore')
                  : t('playback.overlay.fullscreen')
              }
              onClick={onTogglePresentation}
            />
            <IconButton
              className="canvas-playback-panel-icon-button"
              data-playback-action="close-overlay"
              icon={<CloseIcon size={15} />}
              label={t('playback.overlay.close')}
              title={t('playback.overlay.close')}
              onClick={onClose}
            />
          </div>
        </footer>
      </section>
    </div>
  );
}

function renderPlaybackPreview({
  plan,
  unit,
  playbackControl,
}: {
  readonly plan: CanvasPlaybackPlan | null;
  readonly unit: CanvasPlaybackUnit | undefined;
  readonly playbackControl?: PreviewPlaybackControl;
}) {
  if (!plan || !unit) {
    return (
      <div className="canvas-playback-stage-empty" data-testid="canvas-playback-stage-empty">
        <PlayIcon size={28} />
        <span>{t('playback.stage.noUnit')}</span>
      </div>
    );
  }

  const source = createPreviewSourceForUnit(unit);
  return (
    <div
      className="canvas-playback-stage"
      data-testid="canvas-playback-stage"
      data-unit-id={unit.id}
    >
      <div className="canvas-playback-stage-preview">
        {source ? (
          <PreviewSurface source={source} surfaceKind="overlay" playbackControl={playbackControl} />
        ) : (
          <PlaybackUnitSummary unit={unit} />
        )}
      </div>
    </div>
  );
}

function renderStorylineGraph({
  graph,
  routes,
  diagnostics,
  runtimeError,
  unitById,
  selectedRouteId,
  currentUnitId,
  onSelectRoute,
  onSelectUnit,
  onFocus,
}: {
  readonly graph: StorylineGraphLayout;
  readonly routes: readonly CanvasPlaybackRouteCandidate[];
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly runtimeError?: string;
  readonly unitById: ReadonlyMap<string, CanvasPlaybackUnit>;
  readonly selectedRouteId: string | undefined;
  readonly currentUnitId: string | undefined;
  readonly onSelectRoute: (route: CanvasPlaybackRouteCandidate) => void;
  readonly onSelectUnit: (unitId: string, routeId: string) => void;
  readonly onFocus: () => void;
}) {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const graphWidth =
    STORYLINE_GRAPH_PADDING_X * 2 +
    Math.max(0, graph.columnCount - 1) * STORYLINE_COLUMN_WIDTH +
    108;
  const graphHeight =
    STORYLINE_GRAPH_PADDING_Y * 2 + Math.max(0, graph.laneCount - 1) * STORYLINE_LANE_HEIGHT + 34;
  const graphNodeByKey = new Map(graph.nodes.map((node) => [node.key, node]));

  return (
    <div
      className="canvas-playback-storyline"
      data-testid="canvas-playback-storyline"
      data-route-count={routes.length}
      {...getKeyboardBoundaryMetadata({
        scope: 'media-preview',
        ownerId: 'canvas-playback-storyline',
        priority: 25,
        ownedKeys: ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'],
      })}
      onFocus={onFocus}
    >
      {routes.length > 1 ? (
        <select
          className="canvas-playback-storyline-route-selector"
          data-testid="canvas-playback-route-selector"
          value={selectedRoute?.id ?? ''}
          aria-label={t('playback.storyline.routes')}
          title={t('playback.storyline.routes')}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const route = routes.find((candidate) => candidate.id === event.currentTarget.value);
            if (!route) {
              throw new Error(
                `Storyline route selector referenced missing route "${event.currentTarget.value}".`,
              );
            }
            onSelectRoute(route);
          }}
        >
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {formatPlaybackDisplayLabel(route.title)}
            </option>
          ))}
        </select>
      ) : null}

      <div className="canvas-playback-storyline-viewport">
        <div
          className="canvas-playback-storyline-nodes"
          data-testid="canvas-playback-storyline-branch-graph"
          data-lane-count={graph.laneCount}
          aria-label={t('playback.storyline.nodes', {
            route: selectedRoute
              ? formatPlaybackDisplayLabel(selectedRoute.title)
              : t('playback.route.title'),
          })}
          role="group"
          style={{ width: `${graphWidth}px`, height: `${graphHeight}px` }}
        >
          <svg
            className="canvas-playback-storyline-edges"
            width={graphWidth}
            height={graphHeight}
            viewBox={`0 0 ${graphWidth} ${graphHeight}`}
            aria-hidden="true"
          >
            {graph.edges.map((edge) => {
              const source = graphNodeByKey.get(edge.sourceKey);
              const target = graphNodeByKey.get(edge.targetKey);
              if (!source || !target) return null;
              return (
                <path
                  key={edge.id}
                  className="canvas-playback-storyline-edge"
                  data-route-id={edge.routeId}
                  data-selected={edge.routeId === selectedRoute?.id ? 'true' : 'false'}
                  d={createStorylineEdgePath(
                    source.column,
                    source.lane,
                    target.column,
                    target.lane,
                  )}
                />
              );
            })}
          </svg>
          {graph.nodes.map((graphNode, index) => {
            const occurrence =
              graphNode.occurrences.find((candidate) => candidate.routeId === selectedRoute?.id) ??
              graphNode.occurrences[0];
            if (!occurrence) return null;
            const unit = unitById.get(occurrence.unitId);
            if (!unit) return null;
            const active = graphNode.occurrences.some(
              (candidate) => candidate.unitId === currentUnitId,
            );
            const mediaState = resolveStorylineMediaState(unit);
            const nodeDiagnostics = diagnostics.filter(
              (diagnostic) => diagnostic.nodeId === unit.sourceNodeId,
            );
            const label = formatPlaybackDisplayLabel(unit.label ?? unit.id);
            const stateLabel = formatStorylineMediaState(mediaState);
            const diagnosticMessages = nodeDiagnostics.map((diagnostic) => diagnostic.message);
            const accessibleLabel = t('playback.storyline.nodeLabel', {
              index: occurrence.unitIndex + 1,
              count:
                routes.find((route) => route.id === occurrence.routeId)?.unitIds.length ??
                graph.nodes.length,
              label,
              state: stateLabel,
            });
            const title = [accessibleLabel, ...diagnosticMessages].join(' · ');

            return (
              <button
                key={graphNode.key}
                type="button"
                className="canvas-playback-storyline-node"
                data-storyline-node="true"
                data-active={active ? 'true' : 'false'}
                data-selected-route={
                  graphNode.routeIds.includes(selectedRoute?.id ?? '') ? 'true' : 'false'
                }
                data-media-state={mediaState}
                data-has-diagnostic={nodeDiagnostics.length > 0 ? 'true' : 'false'}
                data-source-node-id={unit.sourceNodeId}
                data-route-ids={graphNode.routeIds.join(',')}
                aria-current={active ? 'step' : undefined}
                aria-label={accessibleLabel}
                title={title}
                style={{
                  left: `${storylineNodeX(graphNode.column)}px`,
                  top: `${storylineNodeY(graphNode.lane)}px`,
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectUnit(unit.id, occurrence.routeId);
                }}
                onKeyDown={(event) => focusAdjacentStorylineNode(event, index)}
              >
                <span className="canvas-playback-storyline-node-index">
                  {occurrence.unitIndex + 1}
                </span>
                <span className="canvas-playback-storyline-node-label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {runtimeError || diagnostics.length > 0 ? (
        <div className="canvas-playback-storyline-diagnostics" role="status">
          {[runtimeError, ...diagnostics.slice(0, 3).map((diagnostic) => diagnostic.message)]
            .filter((message): message is string => Boolean(message))
            .join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

function storylineNodeX(column: number): number {
  return STORYLINE_GRAPH_PADDING_X + column * STORYLINE_COLUMN_WIDTH;
}

function storylineNodeY(lane: number): number {
  return STORYLINE_GRAPH_PADDING_Y + lane * STORYLINE_LANE_HEIGHT;
}

function createStorylineEdgePath(
  sourceColumn: number,
  sourceLane: number,
  targetColumn: number,
  targetLane: number,
): string {
  const sourceX = storylineNodeX(sourceColumn) + 108;
  const sourceY = storylineNodeY(sourceLane) + 17;
  const targetX = storylineNodeX(targetColumn);
  const targetY = storylineNodeY(targetLane) + 17;
  const controlOffset = Math.max(24, (targetX - sourceX) / 2);
  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

type StorylineMediaState = 'playable' | 'missing' | 'metadata';

function resolveStorylineMediaState(unit: CanvasPlaybackUnit): StorylineMediaState {
  if (unit.kind !== 'media') return 'metadata';
  return unit.assetPath || unit.resourceRef ? 'playable' : 'missing';
}

function formatStorylineMediaState(state: StorylineMediaState): string {
  switch (state) {
    case 'playable':
      return t('playback.storyline.mediaPlayable');
    case 'missing':
      return t('playback.storyline.mediaMissing');
    case 'metadata':
      return t('playback.storyline.metadataNode');
  }
}

function focusAdjacentStorylineNode(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const list = event.currentTarget.closest('.canvas-playback-storyline-nodes');
  if (!(list instanceof HTMLElement)) return;
  const nodes = Array.from(
    list.querySelectorAll<HTMLButtonElement>('[data-storyline-node="true"]'),
  );
  if (nodes.length === 0) return;
  event.preventDefault();
  const targetIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? nodes.length - 1
        : clampNumber(currentIndex + (event.key === 'ArrowRight' ? 1 : -1), 0, nodes.length - 1);
  nodes[targetIndex]?.focus();
}

interface RouteTimeSegment {
  readonly unit: CanvasPlaybackUnit;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

function buildRouteTimeSegments(units: readonly CanvasPlaybackUnit[]): readonly RouteTimeSegment[] {
  let cursor = 0;
  return units.map((unit) => {
    const durationMs = resolveRouteUnitDurationMs(unit);
    const segment = {
      unit,
      startMs: cursor,
      endMs: cursor + durationMs,
      durationMs,
    };
    cursor += durationMs;
    return segment;
  });
}

function resolveAbsoluteRoutePlayheadMs(
  segments: readonly RouteTimeSegment[],
  unitId: string | undefined,
  unitPlayheadMs: number,
): number {
  const currentSegment = segments.find((segment) => segment.unit.id === unitId);
  if (!currentSegment) return 0;
  return currentSegment.startMs + clampNumber(unitPlayheadMs, 0, currentSegment.durationMs);
}

function resolveRouteTimeSegment(
  segments: readonly RouteTimeSegment[],
  targetMs: number,
): RouteTimeSegment | undefined {
  if (segments.length === 0) return undefined;
  return (
    segments.find((candidate) => targetMs >= candidate.startMs && targetMs < candidate.endMs) ??
    segments[segments.length - 1]
  );
}

function resolveRouteUnitDurationMs(unit: CanvasPlaybackUnit): number {
  return typeof unit.durationMs === 'number' &&
    Number.isFinite(unit.durationMs) &&
    unit.durationMs > 0
    ? unit.durationMs
    : DEFAULT_ROUTE_UNIT_DURATION_MS;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function PlaybackUnitSummary({ unit }: { readonly unit: CanvasPlaybackUnit }) {
  const metadataEntries = Object.entries(unit.metadata ?? {}).slice(0, 4);
  return (
    <div className="canvas-playback-unit-summary">
      <PlayIcon size={28} />
      <div className="canvas-playback-unit-summary-title">
        {formatPlaybackDisplayLabel(unit.label ?? unit.id)}
      </div>
      {metadataEntries.length > 0 ? (
        <dl className="canvas-playback-unit-summary-list">
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="canvas-playback-unit-summary-row">
              <dt>{formatSummaryKey(key)}</dt>
              <dd>{formatSummaryValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function createPreviewSourceForUnit(unit: CanvasPlaybackUnit): PreviewSourceDescriptor | undefined {
  const previewMediaType = readString(unit.metadata?.['previewMediaType']);
  const mediaType =
    previewMediaType ?? readString(unit.metadata?.['mediaType']) ?? inferMediaType(unit.assetPath);
  const role = previewRoleForUnit(unit, mediaType);
  const previewUrl = readString(unit.metadata?.['previewUrl']);
  const path =
    readString(unit.metadata?.['previewPlayableAssetPath']) ??
    readString(unit.metadata?.['previewSourceAssetPath']) ??
    unit.assetPath ??
    readGeneratedMediaPath(unit.metadata);
  const resourceRef =
    readResourceRef(unit.metadata?.['previewSourceResourceRef']) ??
    unit.resourceRef ??
    readResourceRef(unit.metadata?.['resourceRef']);
  const documentResourceRef = unit.metadata?.['previewSourceDocumentResourceRef'];
  if (!path && !resourceRef && !previewUrl) return undefined;
  return {
    id: `playback:${unit.id}`,
    role,
    title: formatPlaybackDisplayLabel(unit.label ?? unit.id),
    ...(previewUrl
      ? {
          variants: [
            {
              id: `playback:${unit.id}:preview`,
              role,
              sourcePath: previewUrl,
              mimeType: mediaType,
            },
          ],
        }
      : {}),
    ...(path || mediaType
      ? {
          asset: {
            kind: 'asset-identity',
            ...(path ? { path } : {}),
            ...(mediaType ? { mediaType } : {}),
          },
        }
      : {}),
    metadata: {
      sourceNodeId: unit.sourceNodeId,
      ...(typeof unit.durationMs === 'number' &&
      Number.isFinite(unit.durationMs) &&
      unit.durationMs > 0
        ? { duration: unit.durationMs / 1000 }
        : {}),
      ...(resourceRef ? { resourceRef } : {}),
      ...(documentResourceRef ? { documentResourceRef } : {}),
    },
  };
}

function readPlaybackSourceUnitId(sourceId: string): string | undefined {
  return sourceId.startsWith('playback:') ? sourceId.slice('playback:'.length) : undefined;
}

function previewRoleForUnit(
  unit: CanvasPlaybackUnit,
  mediaType: string | undefined,
): CanvasPreviewRole {
  if (mediaType === 'video') return 'video-proxy';
  if (mediaType === 'audio') return 'audio-waveform';
  if (mediaType === 'image') return 'image';
  if (unit.kind === 'media') return 'video-proxy';
  return 'image';
}

function readGeneratedMediaPath(metadata: CanvasPlaybackUnit['metadata']): string | undefined {
  const generatedVideo = metadata?.['generatedVideoAsset'];
  if (isRecord(generatedVideo)) {
    return readString(generatedVideo['path']) ?? readString(generatedVideo['url']);
  }
  const generatedImage = metadata?.['generatedAsset'];
  if (isRecord(generatedImage)) {
    return readString(generatedImage['path']) ?? readString(generatedImage['url']);
  }
  return readString(metadata?.['generatedImage']);
}

function readResourceRef(value: unknown): ResourceRef | undefined {
  return isResourceRef(value) ? value : undefined;
}

function inferMediaType(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/\.(?:mp4|m4v|mov|webm|mkv)(?:[?#]|$)/i.test(path)) return 'video';
  if (/\.(?:mp3|m4a|wav|flac|aac|ogg|opus)(?:[?#]|$)/i.test(path)) return 'audio';
  if (/\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#]|$)/i.test(path)) return 'image';
  return undefined;
}

function formatSummaryValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length}`;
  if (isRecord(value)) return '{...}';
  return '';
}

function formatSummaryKey(key: string): string {
  switch (key) {
    case 'shotNumber':
      return t('playback.metadata.shotNumber');
    case 'duration':
      return t('playback.metadata.duration');
    case 'visualDescription':
      return t('playback.metadata.visualDescription');
    case 'characters':
      return t('playback.metadata.characters');
    case 'shotScale':
      return t('playback.metadata.shotScale');
    case 'cameraAngle':
      return t('playback.metadata.cameraAngle');
    case 'cameraMovement':
      return t('playback.metadata.cameraMovement');
    case 'characterAction':
      return t('playback.metadata.characterAction');
    case 'generationStatus':
      return t('playback.metadata.generationStatus');
    case 'mediaType':
      return t('playback.metadata.mediaType');
    case 'previewMediaType':
      return t('playback.metadata.previewMediaType');
    case 'sourceCanvasName':
      return t('playback.metadata.sourceCanvasName');
    default:
      return key;
  }
}

function formatPlaybackDisplayLabel(label: string): string {
  const defaultShotMatch = /^Shot\s+(\d+)$/i.exec(label.trim());
  if (defaultShotMatch?.[1]) {
    return t('playback.label.defaultShot', { number: defaultShotMatch[1] });
  }
  return label;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergePlaybackDiagnostics(
  ...sources: readonly (readonly CanvasPlaybackDiagnostic[])[]
): readonly CanvasPlaybackDiagnostic[] {
  const diagnostics = new Map<string, CanvasPlaybackDiagnostic>();
  for (const source of sources) {
    for (const diagnostic of source) {
      diagnostics.set(
        [
          diagnostic.code,
          diagnostic.nodeId ?? '',
          diagnostic.connectionId ?? '',
          diagnostic.message,
        ].join(':'),
        diagnostic,
      );
    }
  }
  return Array.from(diagnostics.values());
}
