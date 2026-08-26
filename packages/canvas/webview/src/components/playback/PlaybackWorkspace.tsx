import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { contentLocatorKey } from '@neko/content-domain';
import {
  createCanvasPlaybackPlan,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasData,
  type CanvasPlaybackDiagnostic,
  type CanvasPlaybackPlan,
  type CanvasPlaybackRouteCandidate,
  type CanvasPlaybackUnit,
  type CanvasPreviewRole,
} from '@neko/canvas-domain';
import { CloseIcon, EyeIcon, EyeOffIcon, FullscreenIcon, RestoreIcon } from '@neko/ui/icons';
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
  resolveCanvasPlaybackRequestState,
  useCanvasPlaybackController,
  type CanvasPlaybackControllerModel,
  type CanvasPlaybackRequest,
  type PlaybackCompletionSignal,
} from './CanvasPlaybackController';
import { useOptionalCanvasHost } from '../../host-runtime';
import {
  buildStorylineGraphLayout,
  buildStorylineSequenceGraphLayout,
  moveStorylineGraphNode,
  resolveStorylineGraphNodeRole,
  resolveStorylineOrderPosition,
  storylineSequenceEdgeKey,
  wouldCreateStorylineSequenceCycle,
  type StorylineGraphLayout,
  type StorylineGraphNodeRole,
  type StorylineOrderPosition,
  type StorylineSequenceEdge,
} from './storylineGraphLayout';
import type {
  CanvasPlaybackSequenceGraphInput,
  CanvasPlaybackSequenceMutationResult,
} from '../../stores/canvasStore';

const HOST_PLAYBACK_PLAN_TIMEOUT_MS = 5_000;
const DEFAULT_ROUTE_UNIT_DURATION_MS = 1200;
const STORYLINE_NODE_WIDTH = 120;
const STORYLINE_NODE_HEIGHT = 34;
const STORYLINE_COLUMN_WIDTH = 144;
const STORYLINE_LANE_HEIGHT = 48;
const STORYLINE_GRAPH_PADDING_X = 24;
const STORYLINE_GRAPH_PADDING_Y = 18;
const STORYLINE_ORDER_STATUS_INSET = 36;

interface StorylineConnectionDragState {
  readonly sourceNodeId: string;
  readonly originX: number;
  readonly originY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly targetNodeId?: string;
  readonly targetValid?: boolean;
}

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
  const replacePlaybackSequenceGraph = useCanvasStore(
    (state) => state.replacePlaybackSequenceGraph,
  );

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
  }, [canvasData, markStale, playbackStoreApi]);

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
  }, [playbackStoreApi, session.visible]);

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
    if (unit.contentLocator) {
      savePlayback(`content:${contentLocatorKey(unit.contentLocator)}`, {
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
    const state = resolveCanvasPlaybackRequestState(
      currentUnitId,
      playbackRequest,
      session.playbackState === 'playing',
    );
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
            onCommitSequence={replacePlaybackSequenceGraph}
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
  readonly onCommitSequence: (
    graph: CanvasPlaybackSequenceGraphInput,
  ) => CanvasPlaybackSequenceMutationResult;
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
  onCommitSequence,
  onFocusStoryline,
  onTogglePresentation,
  onClose,
}: StorylinePlaybackOverlayProps) {
  const [previewRevealed, setPreviewRevealed] = useState(false);
  const [sequenceDraft, setSequenceDraft] = useState<CanvasPlaybackSequenceGraphInput | null>(null);
  const [sequenceSourceNodeId, setSequenceSourceNodeId] = useState<string | null>(null);
  const [sequenceConnectionDrag, setSequenceConnectionDrag] =
    useState<StorylineConnectionDragState | null>(null);
  const [sequenceBranchDragNodeId, setSequenceBranchDragNodeId] = useState<string | null>(null);
  const [sequenceEditorError, setSequenceEditorError] = useState<string>();
  const revealRequested = isPlaying || presentation === 'fullscreen';
  const expanded = previewRevealed || presentation === 'fullscreen';
  const storylineGraph = useMemo(
    () => buildStorylineGraphLayout(routes, unitById),
    [routes, unitById],
  );
  const canvasManagedSequence =
    plan?.transitions.some((transition) => !transition.sourceConnectionId) ?? false;
  const canEditSequenceGraph = storylineGraph.nodes.length > 1 && !canvasManagedSequence;
  const beginSequenceEdit = () => {
    if (!canEditSequenceGraph || isPlaying) return;
    const entryNodeIds = (plan?.entryUnitIds ?? []).flatMap((unitId) => {
      const unit = unitById.get(unitId);
      return unit ? [unit.sourceNodeId] : [];
    });
    const nodeIds = Array.from(
      new Set([...entryNodeIds, ...Array.from(unitById.values(), (unit) => unit.sourceNodeId)]),
    );
    const edgeByKey = new Map<string, StorylineSequenceEdge>();
    for (const transition of plan?.transitions ?? []) {
      if (!transition.sourceConnectionId) continue;
      if (!transition.sourceNodeId || !transition.targetNodeId) {
        throw new Error('Canvas sequence transition is missing its source node identities.');
      }
      const edge = {
        sourceNodeId: transition.sourceNodeId,
        targetNodeId: transition.targetNodeId,
      };
      edgeByKey.set(storylineSequenceEdgeKey(edge), edge);
    }
    setSequenceDraft({ nodeIds, edges: Array.from(edgeByKey.values()) });
    setSequenceSourceNodeId(null);
    setSequenceConnectionDrag(null);
    setSequenceBranchDragNodeId(null);
    setSequenceEditorError(undefined);
  };
  const cancelSequenceEdit = () => {
    setSequenceDraft(null);
    setSequenceSourceNodeId(null);
    setSequenceConnectionDrag(null);
    setSequenceBranchDragNodeId(null);
    setSequenceEditorError(undefined);
  };
  const commitSequenceEdit = () => {
    if (!sequenceDraft) return;
    const result = onCommitSequence(sequenceDraft);
    if (!result.ok) {
      setSequenceEditorError(t('playback.storyline.graphSaveError'));
      return;
    }
    cancelSequenceEdit();
  };

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
            canEditSequenceGraph,
            canvasManagedSequence,
            sequenceEditing: sequenceDraft !== null,
            sequenceDraft: sequenceDraft ?? { nodeIds: [], edges: [] },
            sequenceSourceNodeId,
            sequenceConnectionDrag,
            sequenceBranchDragNodeId,
            sequenceEditorError,
            editingDisabled: isPlaying,
            onBeginSequenceEdit: beginSequenceEdit,
            onCancelSequenceEdit: cancelSequenceEdit,
            onCommitSequenceEdit: commitSequenceEdit,
            onSequenceDraftChange: setSequenceDraft,
            onSequenceSourceNodeChange: setSequenceSourceNodeId,
            onSequenceConnectionDragChange: setSequenceConnectionDrag,
            onSequenceBranchDragNodeChange: setSequenceBranchDragNodeId,
            onSequenceEditorError: setSequenceEditorError,
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
  canEditSequenceGraph,
  canvasManagedSequence,
  sequenceEditing,
  sequenceDraft,
  sequenceSourceNodeId,
  sequenceConnectionDrag,
  sequenceBranchDragNodeId,
  sequenceEditorError,
  editingDisabled,
  onBeginSequenceEdit,
  onCancelSequenceEdit,
  onCommitSequenceEdit,
  onSequenceDraftChange,
  onSequenceSourceNodeChange,
  onSequenceConnectionDragChange,
  onSequenceBranchDragNodeChange,
  onSequenceEditorError,
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
  readonly canEditSequenceGraph: boolean;
  readonly canvasManagedSequence: boolean;
  readonly sequenceEditing: boolean;
  readonly sequenceDraft: CanvasPlaybackSequenceGraphInput;
  readonly sequenceSourceNodeId: string | null;
  readonly sequenceConnectionDrag: StorylineConnectionDragState | null;
  readonly sequenceBranchDragNodeId: string | null;
  readonly sequenceEditorError?: string;
  readonly editingDisabled: boolean;
  readonly onBeginSequenceEdit: () => void;
  readonly onCancelSequenceEdit: () => void;
  readonly onCommitSequenceEdit: () => void;
  readonly onSequenceDraftChange: (draft: CanvasPlaybackSequenceGraphInput) => void;
  readonly onSequenceSourceNodeChange: (nodeId: string | null) => void;
  readonly onSequenceConnectionDragChange: (drag: StorylineConnectionDragState | null) => void;
  readonly onSequenceBranchDragNodeChange: (nodeId: string | null) => void;
  readonly onSequenceEditorError: (message: string | undefined) => void;
  readonly onFocus: () => void;
}) {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const unsequencedNodeKeys = new Set(
    graph.nodes.length > 1
      ? graph.nodes.filter((node) => node.isolated).map((node) => node.key)
      : [],
  );
  const unsequencedNodeCount = unsequencedNodeKeys.size;
  const requiresCanvasSequenceEditing = canvasManagedSequence;
  const showOrderBar = graph.nodes.length > 1;
  const graphTopInset = showOrderBar ? STORYLINE_ORDER_STATUS_INSET : 0;
  const graphWidth =
    STORYLINE_GRAPH_PADDING_X * 2 +
    Math.max(0, graph.columnCount - 1) * STORYLINE_COLUMN_WIDTH +
    STORYLINE_NODE_WIDTH;
  const graphHeight =
    STORYLINE_GRAPH_PADDING_Y * 2 +
    graphTopInset +
    Math.max(0, graph.laneCount - 1) * STORYLINE_LANE_HEIGHT +
    STORYLINE_NODE_HEIGHT;
  const graphNodeByKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const graphVisualEdgeByKey = new Map<
    string,
    StorylineSequenceEdge & { readonly id: string; readonly routeIds: string[] }
  >();
  graph.edges.forEach((edge) => {
    const sequenceEdge = { sourceNodeId: edge.sourceKey, targetNodeId: edge.targetKey };
    const key = storylineSequenceEdgeKey(sequenceEdge);
    const existing = graphVisualEdgeByKey.get(key);
    if (existing) {
      existing.routeIds.push(edge.routeId);
    } else {
      graphVisualEdgeByKey.set(key, { ...sequenceEdge, id: key, routeIds: [edge.routeId] });
    }
  });
  const graphVisualEdges = Array.from(graphVisualEdgeByKey.values());
  const graphSequenceEdges: StorylineSequenceEdge[] = graphVisualEdges;
  const graphTargetNodeIds = new Set(graphSequenceEdges.map((edge) => edge.targetNodeId));
  const graphStartCount = graph.nodes.filter(
    (node) => !graphTargetNodeIds.has(node.sourceNodeId),
  ).length;
  const unitBySourceNodeId = new Map(
    Array.from(unitById.values()).map((unit) => [unit.sourceNodeId, unit]),
  );
  const sequenceGraphLayout = sequenceEditing
    ? buildStorylineSequenceGraphLayout(sequenceDraft.nodeIds, sequenceDraft.edges, unitById)
    : null;
  const sequenceGraphNodeById = new Map(
    sequenceGraphLayout?.nodes.map((node) => [node.sourceNodeId, node]) ?? [],
  );
  const sequenceGraphWidth = sequenceGraphLayout
    ? STORYLINE_GRAPH_PADDING_X * 2 +
      Math.max(0, sequenceGraphLayout.columnCount - 1) * STORYLINE_COLUMN_WIDTH +
      STORYLINE_NODE_WIDTH
    : 0;
  const sequenceGraphHeight = sequenceGraphLayout
    ? STORYLINE_GRAPH_PADDING_Y * 2 +
      STORYLINE_ORDER_STATUS_INSET +
      Math.max(0, sequenceGraphLayout.laneCount - 1) * STORYLINE_LANE_HEIGHT +
      STORYLINE_NODE_HEIGHT
    : 0;
  const connectSequenceNodes = (sourceNodeId: string, targetNodeId: string): void => {
    const candidate = { sourceNodeId, targetNodeId };
    const candidateKey = storylineSequenceEdgeKey(candidate);
    if (sequenceDraft.edges.some((edge) => storylineSequenceEdgeKey(edge) === candidateKey)) {
      onSequenceEditorError(t('playback.storyline.graphEdgeExists'));
      return;
    }
    if (wouldCreateStorylineSequenceCycle(sequenceDraft.edges, candidate)) {
      onSequenceEditorError(t('playback.storyline.graphCycleRejected'));
      return;
    }
    onSequenceDraftChange({
      ...sequenceDraft,
      edges: [...sequenceDraft.edges, candidate],
    });
    onSequenceSourceNodeChange(null);
    onSequenceEditorError(undefined);
  };
  const moveSequenceNode = (
    movedNodeId: string,
    referenceNodeId: string,
    direction: 'before' | 'after',
  ): void => {
    const movedNode = sequenceGraphNodeById.get(movedNodeId);
    const referenceNode = sequenceGraphNodeById.get(referenceNodeId);
    if (!movedNode || !referenceNode) {
      throw new Error('Storyline branch move references a missing layout node.');
    }
    if (movedNode.column !== referenceNode.column) {
      onSequenceEditorError(t('playback.storyline.branchSameLevelOnly'));
      return;
    }
    onSequenceDraftChange(
      moveStorylineGraphNode(sequenceDraft, movedNodeId, referenceNodeId, direction),
    );
    onSequenceEditorError(undefined);
  };

  return (
    <div
      className="canvas-playback-storyline"
      data-testid="canvas-playback-storyline"
      data-route-count={routes.length}
      {...getKeyboardBoundaryMetadata({
        scope: 'media-preview',
        ownerId: 'canvas-playback-storyline',
        priority: 25,
        ownedKeys: [
          'Enter',
          'Escape',
          'Space',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'Tab',
        ],
      })}
      onFocus={onFocus}
    >
      {!sequenceEditing && routes.length > 1 ? (
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
              {formatStorylineRouteLabel(route, unitById, unsequencedNodeKeys)}
            </option>
          ))}
        </select>
      ) : null}

      {showOrderBar ? (
        <div
          className="canvas-playback-storyline-order-status"
          data-has-route-selector={!sequenceEditing && routes.length > 1 ? 'true' : 'false'}
          data-editing={sequenceEditing ? 'true' : 'false'}
        >
          <span
            className="canvas-playback-storyline-order-message"
            role="status"
            title={resolveStorylineOrderMessage({
              sequenceEditing,
              sequenceEditorError,
              selectedSourceLabel: sequenceSourceNodeId
                ? formatPlaybackDisplayLabel(
                    unitBySourceNodeId.get(sequenceSourceNodeId)?.label ?? sequenceSourceNodeId,
                  )
                : undefined,
              requiresCanvasSequenceEditing,
              unsequencedNodeCount,
              nodeCount: graph.nodes.length,
              startCount: graphStartCount,
              routeCount: routes.length,
            })}
          >
            {resolveStorylineOrderMessage({
              sequenceEditing,
              sequenceEditorError,
              selectedSourceLabel: sequenceSourceNodeId
                ? formatPlaybackDisplayLabel(
                    unitBySourceNodeId.get(sequenceSourceNodeId)?.label ?? sequenceSourceNodeId,
                  )
                : undefined,
              requiresCanvasSequenceEditing,
              unsequencedNodeCount,
              nodeCount: graph.nodes.length,
              startCount: graphStartCount,
              routeCount: routes.length,
            })}
          </span>
          <div className="canvas-playback-storyline-order-actions">
            {sequenceEditing ? (
              <>
                <button
                  type="button"
                  data-storyline-order-action="cancel"
                  onClick={onCancelSequenceEdit}
                >
                  {t('playback.storyline.cancelOrder')}
                </button>
                <button
                  type="button"
                  data-primary="true"
                  data-storyline-order-action="save"
                  disabled={sequenceDraft.nodeIds.length < 2}
                  onClick={onCommitSequenceEdit}
                >
                  {t('playback.storyline.saveGraph')}
                </button>
              </>
            ) : canEditSequenceGraph ? (
              <button
                type="button"
                data-storyline-order-action="begin"
                disabled={editingDisabled}
                title={
                  editingDisabled
                    ? t('playback.storyline.pauseBeforeOrdering')
                    : unsequencedNodeCount > 0
                      ? t('playback.storyline.defineGraph')
                      : t('playback.storyline.editGraph')
                }
                onClick={onBeginSequenceEdit}
              >
                {unsequencedNodeCount > 0
                  ? t('playback.storyline.defineGraph')
                  : t('playback.storyline.editGraph')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="canvas-playback-storyline-viewport" data-canvas-wheel-owner="content">
        {sequenceEditing && sequenceGraphLayout ? (
          <div
            className="canvas-playback-storyline-sequence-editor"
            data-testid="canvas-playback-sequence-editor"
            data-connection-drag-active={sequenceConnectionDrag ? 'true' : 'false'}
            role="group"
            aria-label={t('playback.storyline.graphEditorLabel')}
            style={{ width: `${sequenceGraphWidth}px`, height: `${sequenceGraphHeight}px` }}
            onKeyDown={(event) => {
              if (
                event.key !== 'Escape' ||
                (!sequenceConnectionDrag && !sequenceBranchDragNodeId)
              ) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onSequenceConnectionDragChange(null);
              onSequenceBranchDragNodeChange(null);
            }}
          >
            <svg
              className="canvas-playback-storyline-network-edges"
              width={sequenceGraphWidth}
              height={sequenceGraphHeight}
              viewBox={`0 0 ${sequenceGraphWidth} ${sequenceGraphHeight}`}
              aria-label={t('playback.storyline.graphEdgesLabel')}
            >
              <defs>
                {sequenceDraft.edges.map((edge) => (
                  <marker
                    key={storylineSequenceEdgeKey(edge)}
                    id={storylineEdgeMarkerId(`draft:${storylineSequenceEdgeKey(edge)}`)}
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path className="canvas-playback-storyline-arrow" d="M 0 0 L 8 3 L 0 6 Z" />
                  </marker>
                ))}
                {sequenceConnectionDrag ? (
                  <marker
                    id={storylineEdgeMarkerId('draft-preview')}
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path className="canvas-playback-storyline-arrow" d="M 0 0 L 8 3 L 0 6 Z" />
                  </marker>
                ) : null}
              </defs>
              {sequenceDraft.edges.map((edge) => {
                const source = sequenceGraphNodeById.get(edge.sourceNodeId);
                const target = sequenceGraphNodeById.get(edge.targetNodeId);
                if (!source || !target) {
                  throw new Error('Storyline graph edge references a missing layout node.');
                }
                const edgeKey = storylineSequenceEdgeKey(edge);
                const path = createStorylineEdgePath(
                  source.column,
                  source.lane,
                  target.column,
                  target.lane,
                  STORYLINE_ORDER_STATUS_INSET,
                );
                const sourceLabel = formatPlaybackDisplayLabel(
                  unitBySourceNodeId.get(edge.sourceNodeId)?.label ?? edge.sourceNodeId,
                );
                const targetLabel = formatPlaybackDisplayLabel(
                  unitBySourceNodeId.get(edge.targetNodeId)?.label ?? edge.targetNodeId,
                );
                const removeEdge = () => {
                  onSequenceDraftChange({
                    ...sequenceDraft,
                    edges: sequenceDraft.edges.filter(
                      (candidate) => storylineSequenceEdgeKey(candidate) !== edgeKey,
                    ),
                  });
                  onSequenceSourceNodeChange(null);
                  onSequenceEditorError(undefined);
                };
                return (
                  <g
                    key={edgeKey}
                    className="canvas-playback-storyline-network-edge"
                    data-source-node-id={edge.sourceNodeId}
                    data-target-node-id={edge.targetNodeId}
                    role="button"
                    tabIndex={0}
                    aria-label={t('playback.storyline.removeGraphEdge', {
                      source: sourceLabel,
                      target: targetLabel,
                    })}
                    onClick={removeEdge}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      removeEdge();
                    }}
                  >
                    <path className="canvas-playback-storyline-network-edge-hit" d={path} />
                    <path
                      className="canvas-playback-storyline-edge"
                      markerEnd={`url(#${storylineEdgeMarkerId(`draft:${edgeKey}`)})`}
                      d={path}
                    />
                  </g>
                );
              })}
              {sequenceConnectionDrag ? (
                <path
                  className="canvas-playback-storyline-edge canvas-playback-storyline-edge-preview"
                  data-valid-target={sequenceConnectionDrag.targetNodeId ? 'true' : 'false'}
                  markerEnd={`url(#${storylineEdgeMarkerId('draft-preview')})`}
                  d={createStorylineFreeEdgePath(
                    sequenceConnectionDrag.originX,
                    sequenceConnectionDrag.originY,
                    sequenceConnectionDrag.currentX,
                    sequenceConnectionDrag.currentY,
                  )}
                />
              ) : null}
            </svg>
            {sequenceGraphLayout.nodes.map((graphNode) => {
              const sourceNodeId = graphNode.sourceNodeId;
              const unit = unitBySourceNodeId.get(sourceNodeId);
              if (!unit) {
                throw new Error(
                  `Storyline sequence editor referenced missing source node "${sourceNodeId}".`,
                );
              }
              const role = resolveStorylineGraphNodeRole(sourceNodeId, sequenceDraft.edges);
              const label = formatPlaybackDisplayLabel(unit.label ?? unit.id);
              const sameColumnNodes = sequenceGraphLayout.nodes
                .filter((node) => node.column === graphNode.column)
                .sort((left, right) => left.lane - right.lane);
              const sameColumnIndex = sameColumnNodes.findIndex(
                (node) => node.sourceNodeId === sourceNodeId,
              );
              const previousBranchNode = sameColumnNodes[sameColumnIndex - 1];
              const nextBranchNode = sameColumnNodes[sameColumnIndex + 1];
              const resolvePointerDrag = (event: React.PointerEvent<HTMLElement>) => {
                const editor = event.currentTarget.closest(
                  '[data-testid="canvas-playback-sequence-editor"]',
                );
                if (!(editor instanceof HTMLElement)) {
                  throw new Error('Storyline sequence editor is unavailable during drag.');
                }
                const rect = editor.getBoundingClientRect();
                const hoveredNode = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>('[data-storyline-node="true"]');
                const targetNodeId = hoveredNode?.dataset.sourceNodeId;
                const candidate = targetNodeId ? { sourceNodeId, targetNodeId } : undefined;
                const targetValid = candidate
                  ? !sequenceDraft.edges.some(
                      (edge) =>
                        storylineSequenceEdgeKey(edge) === storylineSequenceEdgeKey(candidate),
                    ) && !wouldCreateStorylineSequenceCycle(sequenceDraft.edges, candidate)
                  : false;
                return {
                  currentX: event.clientX - rect.left,
                  currentY: event.clientY - rect.top,
                  targetNodeId,
                  targetValid,
                };
              };
              return (
                <div
                  key={sourceNodeId}
                  className="canvas-playback-storyline-node"
                  data-storyline-node="true"
                  data-source-node-id={sourceNodeId}
                  data-graph-role={role}
                  data-connection-source={sequenceSourceNodeId === sourceNodeId ? 'true' : 'false'}
                  data-drop-target={
                    sequenceConnectionDrag?.targetNodeId === sourceNodeId
                      ? sequenceConnectionDrag.targetValid
                        ? 'valid'
                        : 'invalid'
                      : undefined
                  }
                  data-branch-dragging={
                    sequenceBranchDragNodeId === sourceNodeId ? 'true' : 'false'
                  }
                  data-branch-position={`${sameColumnIndex + 1}/${sameColumnNodes.length}`}
                  role="group"
                  aria-label={t('playback.storyline.graphEditorNodeLabel', {
                    label,
                    role: formatStorylineGraphNodeRole(role),
                  })}
                  title={
                    sameColumnNodes.length > 1 ? t('playback.storyline.branchDragHelp') : undefined
                  }
                  style={{
                    left: `${storylineNodeX(graphNode.column)}px`,
                    top: `${storylineNodeY(graphNode.lane, STORYLINE_ORDER_STATUS_INSET)}px`,
                  }}
                  onDragOver={(event) => {
                    if (!sequenceBranchDragNodeId || sequenceBranchDragNodeId === sourceNodeId) {
                      return;
                    }
                    const draggedNode = sequenceGraphNodeById.get(sequenceBranchDragNodeId);
                    if (draggedNode?.column !== graphNode.column) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const movedNodeId = sequenceBranchDragNodeId;
                    onSequenceBranchDragNodeChange(null);
                    if (!movedNodeId || movedNodeId === sourceNodeId) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    moveSequenceNode(
                      movedNodeId,
                      sourceNodeId,
                      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
                    );
                  }}
                >
                  <span
                    className="canvas-playback-storyline-branch-drag-surface"
                    draggable={sameColumnNodes.length > 1}
                    role="button"
                    tabIndex={0}
                    aria-label={t('playback.storyline.graphTargetCard', { label })}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp' && previousBranchNode) {
                        event.preventDefault();
                        event.stopPropagation();
                        moveSequenceNode(sourceNodeId, previousBranchNode.sourceNodeId, 'before');
                        return;
                      }
                      if (event.key === 'ArrowDown' && nextBranchNode) {
                        event.preventDefault();
                        event.stopPropagation();
                        moveSequenceNode(sourceNodeId, nextBranchNode.sourceNodeId, 'after');
                        return;
                      }
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (sequenceSourceNodeId) {
                        connectSequenceNodes(sequenceSourceNodeId, sourceNodeId);
                      }
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', sourceNodeId);
                      onSequenceBranchDragNodeChange(sourceNodeId);
                      onSequenceConnectionDragChange(null);
                    }}
                    onDragEnd={() => onSequenceBranchDragNodeChange(null)}
                  >
                    <span className="canvas-playback-storyline-node-index">
                      {formatStorylineGraphNodeBadge(role)}
                    </span>
                    <span className="canvas-playback-storyline-node-label">{label}</span>
                  </span>
                  <button
                    type="button"
                    className="canvas-playback-storyline-connection-handle canvas-playback-storyline-connection-handle--output"
                    data-storyline-output-node-id={sourceNodeId}
                    draggable={false}
                    aria-pressed={sequenceSourceNodeId === sourceNodeId}
                    aria-label={t('playback.storyline.graphOutputHandle', { label })}
                    title={t('playback.storyline.graphOutputHandle', { label })}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.detail !== 0) return;
                      onSequenceSourceNodeChange(
                        sequenceSourceNodeId === sourceNodeId ? null : sourceNodeId,
                      );
                      onSequenceEditorError(undefined);
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const originX = storylineNodeX(graphNode.column) + STORYLINE_NODE_WIDTH;
                      const originY =
                        storylineNodeY(graphNode.lane, STORYLINE_ORDER_STATUS_INSET) +
                        STORYLINE_NODE_HEIGHT / 2;
                      onSequenceConnectionDragChange({
                        sourceNodeId,
                        originX,
                        originY,
                        currentX: originX,
                        currentY: originY,
                      });
                      onSequenceBranchDragNodeChange(null);
                      onSequenceEditorError(undefined);
                    }}
                    onPointerMove={(event) => {
                      if (sequenceConnectionDrag?.sourceNodeId !== sourceNodeId) return;
                      onSequenceConnectionDragChange({
                        ...sequenceConnectionDrag,
                        ...resolvePointerDrag(event),
                      });
                    }}
                    onPointerUp={(event) => {
                      if (sequenceConnectionDrag?.sourceNodeId !== sourceNodeId) return;
                      const resolved = resolvePointerDrag(event);
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      onSequenceConnectionDragChange(null);
                      if (resolved.targetNodeId) {
                        connectSequenceNodes(sourceNodeId, resolved.targetNodeId);
                      }
                    }}
                    onPointerCancel={() => onSequenceConnectionDragChange(null)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="canvas-playback-storyline-nodes"
            data-testid="canvas-playback-storyline-branch-graph"
            data-lane-count={graph.laneCount}
            aria-label={t('playback.storyline.nodes', {
              route: selectedRoute
                ? formatStorylineRouteLabel(selectedRoute, unitById, unsequencedNodeKeys)
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
              <defs>
                {graphVisualEdges.map((edge) => (
                  <marker
                    key={edge.id}
                    id={storylineEdgeMarkerId(edge.id)}
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path
                      className="canvas-playback-storyline-arrow"
                      data-selected={
                        edge.routeIds.includes(selectedRoute?.id ?? '') ? 'true' : 'false'
                      }
                      d="M 0 0 L 8 3 L 0 6 Z"
                    />
                  </marker>
                ))}
              </defs>
              {graphVisualEdges.map((edge) => {
                const source = graphNodeByKey.get(edge.sourceNodeId);
                const target = graphNodeByKey.get(edge.targetNodeId);
                if (!source || !target) return null;
                return (
                  <path
                    key={edge.id}
                    className="canvas-playback-storyline-edge"
                    data-route-ids={edge.routeIds.join(',')}
                    data-selected={
                      edge.routeIds.includes(selectedRoute?.id ?? '') ? 'true' : 'false'
                    }
                    markerEnd={`url(#${storylineEdgeMarkerId(edge.id)})`}
                    d={createStorylineEdgePath(
                      source.column,
                      source.lane,
                      target.column,
                      target.lane,
                      graphTopInset,
                    )}
                  />
                );
              })}
            </svg>
            {graph.nodes.map((graphNode, index) => {
              const occurrence =
                graphNode.occurrences.find(
                  (candidate) => candidate.routeId === selectedRoute?.id,
                ) ?? graphNode.occurrences[0];
              if (!occurrence) return null;
              const unit = unitById.get(occurrence.unitId);
              if (!unit) return null;
              const route = routes.find((candidate) => candidate.id === occurrence.routeId);
              const routeLength = route?.unitIds.length ?? graph.nodes.length;
              const orderPosition = resolveStorylineOrderPosition(
                occurrence.unitIndex,
                routeLength,
                unsequencedNodeKeys.has(graphNode.key),
              );
              const graphRole = resolveStorylineGraphNodeRole(graphNode.key, graphSequenceEdges);
              const orderPositionLabel =
                orderPosition === 'unsequenced'
                  ? formatStorylineOrderPosition(orderPosition, occurrence.unitIndex)
                  : formatStorylineGraphNodeRole(graphRole);
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
                count: routeLength,
                label,
                state: stateLabel,
              });
              const title = [accessibleLabel, orderPositionLabel, ...diagnosticMessages].join(
                ' · ',
              );

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
                  data-order-position={orderPosition}
                  data-graph-role={graphRole}
                  data-media-state={mediaState}
                  data-has-diagnostic={nodeDiagnostics.length > 0 ? 'true' : 'false'}
                  data-source-node-id={unit.sourceNodeId}
                  data-route-ids={graphNode.routeIds.join(',')}
                  aria-current={active ? 'step' : undefined}
                  aria-label={accessibleLabel}
                  title={title}
                  style={{
                    left: `${storylineNodeX(graphNode.column)}px`,
                    top: `${storylineNodeY(graphNode.lane, graphTopInset)}px`,
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectUnit(unit.id, occurrence.routeId);
                  }}
                  onKeyDown={(event) => focusAdjacentStorylineNode(event, index)}
                >
                  <span className="canvas-playback-storyline-node-index">
                    {orderPosition === 'unsequenced'
                      ? formatStorylineOrderBadge(orderPosition, occurrence.unitIndex)
                      : formatStorylineGraphNodeBadge(graphRole)}
                  </span>
                  <span className="canvas-playback-storyline-node-label">{label}</span>
                </button>
              );
            })}
          </div>
        )}
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

function storylineNodeY(lane: number, topInset = 0): number {
  return STORYLINE_GRAPH_PADDING_Y + topInset + lane * STORYLINE_LANE_HEIGHT;
}

function createStorylineEdgePath(
  sourceColumn: number,
  sourceLane: number,
  targetColumn: number,
  targetLane: number,
  topInset = 0,
): string {
  const sourceX = storylineNodeX(sourceColumn) + STORYLINE_NODE_WIDTH;
  const sourceY = storylineNodeY(sourceLane, topInset) + STORYLINE_NODE_HEIGHT / 2;
  const targetX = storylineNodeX(targetColumn);
  const targetY = storylineNodeY(targetLane, topInset) + STORYLINE_NODE_HEIGHT / 2;
  const controlOffset = Math.max(24, (targetX - sourceX) / 2);
  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

function createStorylineFreeEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): string {
  const controlOffset = Math.max(24, Math.abs(targetX - sourceX) / 2);
  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

function formatStorylineOrderPosition(position: StorylineOrderPosition, unitIndex: number): string {
  switch (position) {
    case 'unsequenced':
      return t('playback.storyline.positionUnsequenced');
    case 'start':
      return t('playback.storyline.positionStart');
    case 'step':
      return t('playback.storyline.positionStep', { index: unitIndex + 1 });
    case 'end':
      return t('playback.storyline.positionEnd');
    case 'only':
      return t('playback.storyline.positionOnly');
  }
}

function formatStorylineOrderBadge(position: StorylineOrderPosition, unitIndex: number): string {
  switch (position) {
    case 'unsequenced':
      return t('playback.storyline.badgeUnsequenced');
    case 'start':
      return t('playback.storyline.badgeStart', { index: unitIndex + 1 });
    case 'end':
      return t('playback.storyline.badgeEnd', { index: unitIndex + 1 });
    case 'step':
    case 'only':
      return String(unitIndex + 1);
  }
}

function formatStorylineGraphNodeRole(role: StorylineGraphNodeRole): string {
  switch (role) {
    case 'isolated':
      return t('playback.storyline.graphRoleIsolated');
    case 'start':
      return t('playback.storyline.graphRoleStart');
    case 'start-branch':
      return t('playback.storyline.graphRoleStartBranch');
    case 'step':
      return t('playback.storyline.graphRoleStep');
    case 'branch':
      return t('playback.storyline.graphRoleBranch');
    case 'merge':
      return t('playback.storyline.graphRoleMerge');
    case 'branch-merge':
      return t('playback.storyline.graphRoleBranchMerge');
    case 'merge-end':
      return t('playback.storyline.graphRoleMergeEnd');
    case 'end':
      return t('playback.storyline.graphRoleEnd');
  }
}

function formatStorylineGraphNodeBadge(role: StorylineGraphNodeRole): string {
  switch (role) {
    case 'isolated':
      return t('playback.storyline.graphBadgeIsolated');
    case 'start':
      return t('playback.storyline.graphBadgeStart');
    case 'start-branch':
      return t('playback.storyline.graphBadgeStartBranch');
    case 'step':
      return t('playback.storyline.graphBadgeStep');
    case 'branch':
      return t('playback.storyline.graphBadgeBranch');
    case 'merge':
      return t('playback.storyline.graphBadgeMerge');
    case 'branch-merge':
      return t('playback.storyline.graphBadgeBranchMerge');
    case 'merge-end':
      return t('playback.storyline.graphBadgeMergeEnd');
    case 'end':
      return t('playback.storyline.graphBadgeEnd');
  }
}

function formatStorylineRouteLabel(
  route: CanvasPlaybackRouteCandidate,
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
  unsequencedNodeKeys: ReadonlySet<string>,
): string {
  const onlyUnit = route.unitIds.length === 1 ? unitById.get(route.unitIds[0] ?? '') : undefined;
  if (onlyUnit && unsequencedNodeKeys.has(onlyUnit.sourceNodeId)) {
    return t('playback.storyline.unsequencedRoute', {
      label: formatPlaybackDisplayLabel(onlyUnit.label ?? onlyUnit.id),
    });
  }
  const firstUnit = unitById.get(route.unitIds[0] ?? '');
  const lastUnit = unitById.get(route.unitIds.at(-1) ?? '');
  if (firstUnit && lastUnit && route.unitIds.length > 1) {
    return t('playback.storyline.graphRouteLabel', {
      start: formatPlaybackDisplayLabel(firstUnit.label ?? firstUnit.id),
      end: formatPlaybackDisplayLabel(lastUnit.label ?? lastUnit.id),
      count: route.unitIds.length,
    });
  }
  return formatPlaybackDisplayLabel(route.title);
}

function resolveStorylineOrderMessage({
  sequenceEditing,
  sequenceEditorError,
  selectedSourceLabel,
  requiresCanvasSequenceEditing,
  unsequencedNodeCount,
  nodeCount,
  startCount,
  routeCount,
}: {
  readonly sequenceEditing: boolean;
  readonly sequenceEditorError?: string;
  readonly selectedSourceLabel?: string;
  readonly requiresCanvasSequenceEditing: boolean;
  readonly unsequencedNodeCount: number;
  readonly nodeCount: number;
  readonly startCount: number;
  readonly routeCount: number;
}): string {
  if (sequenceEditorError) return sequenceEditorError;
  if (sequenceEditing) {
    return selectedSourceLabel
      ? t('playback.storyline.graphTargetInstruction', { source: selectedSourceLabel })
      : t('playback.storyline.graphEditorInstruction');
  }
  if (requiresCanvasSequenceEditing) return t('playback.storyline.canvasManagedOrderNotice');
  if (unsequencedNodeCount > 0) {
    return t('playback.storyline.unsequencedNotice', { count: unsequencedNodeCount });
  }
  return t('playback.storyline.graphDefined', {
    count: nodeCount,
    starts: startCount,
    routes: routeCount,
  });
}

function storylineEdgeMarkerId(edgeId: string): string {
  return `canvas-storyline-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

type StorylineMediaState = 'playable' | 'missing' | 'metadata';

function resolveStorylineMediaState(unit: CanvasPlaybackUnit): StorylineMediaState {
  if (unit.kind !== 'media') return 'metadata';
  return unit.contentLocator ? 'playable' : 'missing';
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
  const path =
    readString(unit.metadata?.['previewPlayableAssetPath']) ??
    readString(unit.metadata?.['previewSourceAssetPath']) ??
    unit.assetPath ??
    readGeneratedMediaPath(unit.metadata);
  const contentLocator = unit.contentLocator;
  if (!contentLocator) return undefined;
  return {
    id: `playback:${unit.id}`,
    nodeId: unit.sourceNodeId,
    outputId: unit.sourceNodeId,
    role,
    title: formatPlaybackDisplayLabel(unit.label ?? unit.id),
    ...(contentLocator ? { contentLocator } : {}),
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
