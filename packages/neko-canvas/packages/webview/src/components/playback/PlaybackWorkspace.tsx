import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCanvasPlaybackPlan,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasPlaybackDiagnostic,
  type CanvasPlaybackPlan,
  type CanvasPlaybackRouteCandidate,
  type CanvasPlaybackUnit,
  type CanvasPreviewRole,
  type ResourceRef,
} from '@neko/shared';
import { isResourceRef } from '@neko/shared';
import { useResizable } from '@neko/ui/hooks';
import { PlayIcon } from '@neko/ui/icons';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { ResizeHandle } from '@neko/ui/primitives';
import { t } from '../../i18n';
import { useCanvasStore } from '../../stores/canvasStore';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useRuntimeViewportStore } from '../../stores/runtimeViewportStore';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type {
  PreviewPlaybackControl,
  PreviewPlaybackEndedEvent,
  PreviewPlaybackProgressEvent,
  PreviewSourceDescriptor,
} from '../../preview/types';
import {
  CanvasPlaybackController,
  type CanvasPlaybackRequest,
  type PlaybackCompletionSignal,
} from './CanvasPlaybackController';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import { RouteStoryboardMatrix } from './RouteStoryboardMatrixView';
import {
  projectRouteStoryboardMatrix,
  type RouteStoryboardMatrixFilters,
  type RouteStoryboardMatrixPlayableCell,
  type RouteStoryboardMatrixRow,
  type RouteStoryboardMatrixSummaryCell,
} from './routeStoryboardMatrix';

const PLAYBACK_STAGE_WIDTH_BOUNDS = { min: 280, max: 760 } as const;
const PLAYBACK_ROUTE_HEIGHT_BOUNDS = { min: 220, max: 640 } as const;
const HOST_PLAYBACK_PLAN_TIMEOUT_MS = 5_000;
const DEFAULT_ROUTE_UNIT_DURATION_MS = 1200;
const MAX_VISIBLE_ROUTE_TABS = 6;

export interface PlaybackWorkspaceProps {
  readonly canvasPane: React.ReactNode;
  readonly className?: string;
}

export function PlaybackWorkspace({ canvasPane, className }: PlaybackWorkspaceProps) {
  const canvasPaneRef = useRef<HTMLDivElement | null>(null);
  const canvasData = useCanvasStore((state) => state.canvasData);
  const selectedNodeId = useCanvasStore((state) => state.selection.nodeIds[0]);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const setActivePlayingNode = useCanvasStore((state) => state.setActivePlayingNode);
  const viewportZoom = useRuntimeViewportStore((state) => state.viewport.zoom);
  const setViewport = useRuntimeViewportStore((state) => state.setViewport);
  const session = usePlaybackStore((state) => state.playbackSession);
  const setRoute = usePlaybackStore((state) => state.setPlaybackSessionRoute);
  const setCurrentUnit = usePlaybackStore((state) => state.setPlaybackSessionCurrentUnit);
  const setFocusOwner = usePlaybackStore((state) => state.setPlaybackWorkspaceFocusOwner);
  const setPlaybackState = usePlaybackStore((state) => state.setPlaybackWorkspacePlaybackState);
  const setLayout = usePlaybackStore((state) => state.setPlaybackWorkspaceLayout);
  const markStale = usePlaybackStore((state) => state.markPlaybackWorkspaceStale);
  const savePlayback = usePlaybackStore((state) => state.savePlayback);
  const setMatrixRouteFamily = usePlaybackStore((state) => state.setPlaybackMatrixRouteFamily);
  const focusMatrix = usePlaybackStore((state) => state.focusPlaybackMatrix);
  const toggleMatrixContainerFold = usePlaybackStore(
    (state) => state.togglePlaybackMatrixContainerFold,
  );
  const reconcileMatrixState = usePlaybackStore((state) => state.reconcilePlaybackMatrixState);

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
    readonly error?: string;
  }>({ plan: null, stale: false });
  const [matrixRuntimeDiagnostics, setMatrixRuntimeDiagnostics] = useState<readonly string[]>([]);
  const [playbackRequest, setPlaybackRequest] = useState<CanvasPlaybackRequest | undefined>();
  const [playbackCompletionSignal, setPlaybackCompletionSignal] = useState<
    PlaybackCompletionSignal | undefined
  >();
  const plan = hostPlanState.plan ?? localPlan;
  const routeResolution = useMemo(
    () => (plan ? resolveEffectiveCanvasPlaybackRoutes(plan) : null),
    [plan],
  );
  const matrixFilters = useMemo<RouteStoryboardMatrixFilters>(
    () => ({
      ...(session.matrix.filters.routeFamilyId
        ? { routeFamilyId: session.matrix.filters.routeFamilyId }
        : {}),
      routeIds: session.matrix.filters.routeIds,
      containerIds: session.matrix.filters.containerIds,
      highlightedNodeKinds: session.matrix.filters.highlightedNodeKinds,
      ...(session.matrix.filters.diagnosticSeverity
        ? { diagnosticSeverity: session.matrix.filters.diagnosticSeverity }
        : {}),
      generationStatuses: session.matrix.filters.generationStatuses,
    }),
    [session.matrix.filters],
  );
  const routeMatrix = useMemo(
    () =>
      plan
        ? projectRouteStoryboardMatrix({
            plan,
            canvas: canvasData ?? undefined,
            routes: routeResolution?.routes,
            selectedRouteId: session.routeId,
            activeRouteFamilyId: session.matrix.activeRouteFamilyId,
            foldedContainerIds: session.matrix.foldedContainerIds,
            filters: matrixFilters,
          })
        : null,
    [
      canvasData,
      matrixFilters,
      plan,
      routeResolution?.routes,
      session.matrix.activeRouteFamilyId,
      session.matrix.foldedContainerIds,
      session.routeId,
    ],
  );
  const routeMatrixProjectionKey = useMemo(
    () => (routeMatrix && plan ? buildRouteMatrixProjectionKey(plan, routeMatrix) : undefined),
    [plan, routeMatrix],
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
  const routeUnitIds = selectedRoute?.unitIds ?? [];
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
    currentUnit?.id ?? session.currentUnitId,
    session.playheadMs,
  );
  const stageResize = useResizable<HTMLDivElement>({
    edge: 'right',
    mode: 'pixel',
    size: session.layout.stageWidthPx,
    minSize: PLAYBACK_STAGE_WIDTH_BOUNDS.min,
    maxSize: PLAYBACK_STAGE_WIDTH_BOUNDS.max,
    disabled: !session.visible || !session.panes.canvas || !session.panes.stage,
    onSizeChange: (stageWidthPx) => setLayout({ stageWidthPx }),
  });
  const routeResize = useResizable<HTMLDivElement>({
    edge: 'bottom',
    mode: 'pixel',
    size: session.layout.routeHeightPx,
    minSize: PLAYBACK_ROUTE_HEIGHT_BOUNDS.min,
    maxSize: PLAYBACK_ROUTE_HEIGHT_BOUNDS.max,
    disabled: !session.visible || !session.panes.route,
    onSizeChange: (routeHeightPx) => setLayout({ routeHeightPx }),
  });

  useEffect(() => {
    if (!session.visible || !canvasData) {
      return;
    }
    const vscode = getGlobalVSCodeApi();
    if (!vscode) {
      setHostPlanState({ plan: null, stale: false });
      return;
    }

    let cancelled = false;
    const requestId = `playback-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const settleHostPlan = (nextState: {
      readonly plan: CanvasPlaybackPlan | null;
      readonly stale: boolean;
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
        ...(typeof message.error === 'string' ? { error: message.error } : {}),
      });
    };
    const timeoutId = window.setTimeout(() => {
      settleHostPlan({
        plan: null,
        stale: true,
        error: t('playback.stage.hostPlanTimeout'),
      });
    }, HOST_PLAYBACK_PLAN_TIMEOUT_MS);

    window.addEventListener('message', handleMessage);
    vscode.postMessage({
      type: 'playback:getPreviewPlan',
      requestId,
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
    };
  }, [canvasData, markStale, session.visible]);

  useEffect(() => {
    if (usePlaybackStore.getState().playbackSession.stale) {
      markStale(false);
    }
    setHostPlanState({ plan: null, stale: false });
    setMatrixRuntimeDiagnostics([]);
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
  }, [selectedRoute, session.currentUnitId, session.routeId, setCurrentUnit, setRoute]);

  useEffect(() => {
    if (!routeMatrix || !routeMatrixProjectionKey) return;
    if (session.matrix.projectionKey === routeMatrixProjectionKey) return;
    reconcileMatrixState({
      projectionKey: routeMatrixProjectionKey,
      routeFamilyIds: routeMatrix.families.map((family) => family.id),
      routeIds: routeMatrix.rows.map((row) => row.routeId),
      containerIds: routeMatrix.containerGroups.map((container) => container.id),
      rowIds: routeMatrix.rows.map((row) => row.id),
      columnIds: routeMatrix.columns.map((column) => column.id),
      cellIds: routeMatrix.rows.flatMap((row) => row.cells.map((cell) => cell.id)),
    });
  }, [reconcileMatrixState, routeMatrix, routeMatrixProjectionKey, session.matrix.projectionKey]);

  useEffect(() => {
    setMatrixRuntimeDiagnostics([]);
  }, [routeMatrixProjectionKey]);

  useEffect(() => {
    if (!hostPlanState.stale && !session.stale && routeResolution) {
      setMatrixRuntimeDiagnostics([]);
    }
  }, [hostPlanState.stale, routeResolution, session.stale]);

  useEffect(() => {
    if (!session.visible && session.playbackState === 'playing') {
      setPlaybackState('paused');
    }
  }, [session.playbackState, session.visible, setPlaybackState]);

  useEffect(() => {
    if (!session.visible) return;
    const handleWindowBlur = () => {
      if (usePlaybackStore.getState().playbackSession.playbackState === 'playing') {
        usePlaybackStore.getState().setPlaybackWorkspacePlaybackState('paused');
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [session.visible]);

  const workspaceClasses = ['canvas-playback-workspace', className].filter(Boolean).join(' ');
  const canvasVisible = !session.visible || session.panes.canvas;
  const stageVisible = session.visible && session.panes.stage;
  const routeVisible = session.visible && session.panes.route;
  const stageResizeLabel = t('playback.workspace.resizeStage');
  const routeResizeLabel = t('playback.workspace.resizeRoute');
  const stageResizeHandleProps = {
    ...stageResize.handleProps,
    'aria-label': stageResizeLabel,
    title: stageResizeLabel,
  };
  const routeResizeHandleProps = {
    ...routeResize.handleProps,
    'aria-label': routeResizeLabel,
    title: routeResizeLabel,
  };

  const selectPlaybackUnit = (
    unitId: string | undefined,
    playheadMs = 0,
    routeId = selectedRoute?.id,
  ) => {
    if (!unitId) return;
    const unit = unitById.get(unitId);
    const targetRoute = routeId && routeResolution?.routes.find((route) => route.id === routeId);
    if (targetRoute && targetRoute.unitIds.includes(unitId)) {
      setRoute(targetRoute.id, unitId, playheadMs);
    } else {
      setCurrentUnit(unitId, playheadMs);
    }
    if (!unit) return;
    setActivePlayingNode(unit.sourceNodeId);
    selectNode(unit.sourceNodeId);
    revealCanvasSourceNode(unit.sourceNodeId);
    if (unit.assetPath) {
      savePlayback(unit.assetPath, {
        currentTime: playheadMs / 1000,
        duration: resolveRouteUnitDurationMs(unit) / 1000,
        wasPlaying: false,
      });
    }
  };
  const selectPlaybackTime = (targetMs: number) => {
    const segment = resolveRouteTimeSegment(routeTimeSegments, targetMs);
    if (!segment) return;
    const unitPlayheadMs = clampNumber(targetMs - segment.startMs, 0, segment.durationMs);
    selectPlaybackUnit(segment.unit.id, unitPlayheadMs);
    setPlaybackRequest((prev) => ({
      unitId: segment.unit.id,
      startTimeMs: unitPlayheadMs,
      state: session.playbackState === 'playing' ? 'playing' : 'paused',
      requestId: `route-seek-${Date.now()}-${prev?.requestId ?? 'initial'}`,
    }));
  };
  const selectMatrixRow = (row: RouteStoryboardMatrixRow) => {
    setRoute(row.routeId, row.unitIds[0]);
    selectPlaybackUnit(row.unitIds[0], 0, row.routeId);
  };
  const selectMatrixCell = (cell: RouteStoryboardMatrixPlayableCell) => {
    focusMatrix({ kind: 'cell', id: cell.id });
    selectPlaybackUnit(cell.unitId, 0, cell.routeId);
  };
  const selectMatrixSummaryCell = (cell: RouteStoryboardMatrixSummaryCell) => {
    focusMatrix({ kind: 'cell', id: cell.id });
    if (!cell.containerNodeId) return;
    selectNode(cell.containerNodeId);
    revealCanvasSourceNode(cell.containerNodeId);
  };
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
  const sendMatrixRouteToCut = (row: RouteStoryboardMatrixRow) => {
    const vscode = getGlobalVSCodeApi();
    if (!vscode || !plan) return;
    if (hostPlanState.stale || session.stale) {
      setMatrixRuntimeDiagnostics([t('playback.matrix.cutDraftStale')]);
      return;
    }
    if (!routeResolution?.routes.some((route) => route.id === row.routeId)) {
      setMatrixRuntimeDiagnostics([t('playback.matrix.cutDraftMissingRoute')]);
      return;
    }
    setMatrixRuntimeDiagnostics([]);
    vscode.postMessage({
      type: 'playback:createCutDraftFromRoute',
      _requestId: Date.now(),
      routeId: row.routeId,
      sourceRevision: readFiniteNumber(plan.metadata['sourceRevision']),
    });
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
    if (!currentUnit || playbackRequest?.unitId !== currentUnit.id) return undefined;
    return {
      requestId: playbackRequest.requestId,
      state: playbackRequest.state,
      startTimeSeconds: playbackRequest.startTimeMs / 1000,
      onTimeUpdate: handlePreviewPlaybackTimeUpdate,
      onEnded: handlePreviewPlaybackEnded,
    };
  }, [
    currentUnit?.id,
    handlePreviewPlaybackEnded,
    handlePreviewPlaybackTimeUpdate,
    playbackRequest,
  ]);

  return (
    <section
      id="canvas-playback-workspace"
      className={workspaceClasses}
      data-testid="canvas-playback-workspace"
      data-playback-visible={session.visible ? 'true' : 'false'}
      data-playback-focus-owner={session.focusOwner}
    >
      <div
        className="canvas-playback-workspace-main"
        data-stage-visible={stageVisible ? 'true' : 'false'}
        data-canvas-visible={canvasVisible ? 'true' : 'false'}
      >
        {canvasVisible ? (
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
        ) : null}

        {stageVisible ? (
          <div
            id="canvas-playback-stage-pane"
            ref={stageResize.containerRef}
            className="canvas-playback-stage-pane"
            data-testid="canvas-playback-stage-pane"
            data-resizing={stageResize.isResizing ? 'true' : 'false'}
            style={
              canvasVisible
                ? {
                    flexBasis: stageResize.size,
                    width: stageResize.size,
                  }
                : undefined
            }
            {...getKeyboardBoundaryMetadata({
              scope: 'media-preview',
              ownerId: 'canvas-playback-stage',
              priority: 30,
              ownedKeys: ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'Tab'],
            })}
            onFocus={() => setFocusOwner('stage')}
          >
            {canvasVisible ? (
              <ResizeHandle
                handleProps={stageResizeHandleProps}
                className="canvas-playback-stage-resize-handle"
              />
            ) : null}
            <PlaybackStage
              plan={plan}
              unit={currentUnit}
              playheadMs={session.playheadMs}
              diagnostics={routeResolution?.diagnostics ?? []}
              previewError={hostPlanState.error}
              playbackControl={previewPlaybackControl}
            />
            <CanvasPlaybackController
              plan={plan}
              routeUnitIds={routeUnitIds}
              activeUnitId={currentUnit?.id ?? session.currentUnitId ?? null}
              isPlaying={session.playbackState === 'playing'}
              currentTimeMs={absoluteRoutePlayheadMs}
              durationMs={routeDurationMs}
              playbackCompletionSignal={playbackCompletionSignal}
              onActiveUnitChange={(unitId) => {
                selectPlaybackUnit(unitId, 0);
              }}
              onPlayingChange={(playing) => {
                setPlaybackState(playing ? 'playing' : 'paused');
                if (!playing && currentUnit) {
                  setPlaybackRequest((previous) => ({
                    unitId: currentUnit.id,
                    startTimeMs: session.playheadMs,
                    state: 'paused',
                    requestId: `route-pause-${Date.now()}-${previous?.requestId ?? 'initial'}`,
                  }));
                }
              }}
              onSeek={selectPlaybackTime}
              onPlaybackRequest={setPlaybackRequest}
            />
          </div>
        ) : null}
      </div>

      {routeVisible ? (
        <div
          id="canvas-playback-route-pane"
          ref={routeResize.containerRef}
          className="canvas-playback-route-pane"
          data-testid="canvas-playback-route-pane"
          data-resizing={routeResize.isResizing ? 'true' : 'false'}
          style={{ flexBasis: routeResize.size, height: routeResize.size }}
        >
          <ResizeHandle
            handleProps={routeResizeHandleProps}
            className="canvas-playback-route-resize-handle"
          />
          {routeMatrix ? (
            <RouteStoryboardMatrix
              matrix={routeMatrix}
              selectedRouteId={selectedRoute?.id}
              currentUnitId={currentUnit?.id ?? session.currentUnitId}
              focusedCellId={
                session.matrix.focus?.kind === 'cell' ? session.matrix.focus.id : undefined
              }
              runtimeDiagnostics={matrixRuntimeDiagnostics}
              onSelectRoute={selectMatrixRow}
              onSelectCell={selectMatrixCell}
              onSelectSummaryCell={selectMatrixSummaryCell}
              onFocusCell={(cell) => focusMatrix({ kind: 'cell', id: cell.id })}
              onClearFocus={() => focusMatrix(undefined)}
              onSelectColumn={(columnId) => focusMatrix({ kind: 'column', id: columnId })}
              onSelectFamily={(family) => setMatrixRouteFamily(family.id)}
              onToggleContainerFold={(container) => toggleMatrixContainerFold(container.id)}
              onSendToCut={sendMatrixRouteToCut}
              onFocus={() => setFocusOwner('route')}
            />
          ) : (
            <PlaybackRouteStrip
              routes={routeResolution?.routes ?? []}
              diagnostics={routeResolution?.diagnostics ?? []}
              unitById={unitById}
              selectedRouteId={selectedRoute?.id}
              currentUnitId={currentUnit?.id ?? session.currentUnitId}
              currentPlayheadMs={session.playheadMs}
              panelHeightPx={routeResize.size}
              onSelectRoute={(route) => {
                setRoute(route.id, route.unitIds[0]);
                selectPlaybackUnit(route.unitIds[0], 0, route.id);
              }}
              onSelectUnit={selectPlaybackUnit}
              onFocus={() => setFocusOwner('route')}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}

function PlaybackStage({
  plan,
  unit,
  playheadMs,
  diagnostics,
  previewError,
  playbackControl,
}: {
  readonly plan: CanvasPlaybackPlan | null;
  readonly unit: CanvasPlaybackUnit | undefined;
  readonly playheadMs: number;
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly previewError?: string;
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
      <div className="canvas-playback-stage-details">
        <div className="canvas-playback-stage-kicker">{formatUnitKind(unit)}</div>
        <div className="canvas-playback-stage-title">
          {formatPlaybackDisplayLabel(unit.label ?? unit.id)}
        </div>
        <div className="canvas-playback-stage-meta">
          {t('playback.stage.position', {
            position: formatDurationMs(playheadMs),
            duration: formatDurationMs(resolveRouteUnitDurationMs(unit)),
          })}
        </div>
        {previewError ? (
          <div className="canvas-playback-stage-diagnostics">{previewError}</div>
        ) : diagnostics.length > 0 ? (
          <div className="canvas-playback-stage-diagnostics">
            {diagnostics
              .slice(0, 2)
              .map((diagnostic) => diagnostic.message)
              .join(' · ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlaybackRouteStrip({
  routes,
  diagnostics,
  unitById,
  selectedRouteId,
  currentUnitId,
  currentPlayheadMs,
  panelHeightPx,
  onSelectRoute,
  onSelectUnit,
  onFocus,
}: {
  readonly routes: readonly CanvasPlaybackRouteCandidate[];
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly unitById: ReadonlyMap<string, CanvasPlaybackUnit>;
  readonly selectedRouteId: string | undefined;
  readonly currentUnitId: string | undefined;
  readonly currentPlayheadMs: number;
  readonly panelHeightPx: number;
  readonly onSelectRoute: (route: CanvasPlaybackRouteCandidate) => void;
  readonly onSelectUnit: (unitId: string, playheadMs?: number) => void;
  readonly onFocus: () => void;
}) {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const routeUnits = (selectedRoute?.unitIds ?? [])
    .map((unitId) => unitById.get(unitId))
    .filter((unit): unit is CanvasPlaybackUnit => Boolean(unit));
  const segments = buildRouteTimeSegments(routeUnits);
  const currentSegment = segments.find((segment) => segment.unit.id === currentUnitId);
  const totalDurationMs = segments.at(-1)?.endMs ?? 0;
  const absolutePlayheadMs = currentSegment
    ? currentSegment.startMs + clampNumber(currentPlayheadMs, 0, currentSegment.durationMs)
    : 0;
  const activeProgress =
    totalDurationMs > 0 ? clampNumber((absolutePlayheadMs / totalDurationMs) * 100, 0, 100) : 0;
  const visibleRoutes = routes.slice(0, MAX_VISIBLE_ROUTE_TABS);
  const hiddenRouteCount = Math.max(0, routes.length - visibleRoutes.length);
  const density = panelHeightPx >= 240 ? 'expanded' : 'compact';

  function seekRoute(event: React.PointerEvent<HTMLDivElement>) {
    if (segments.length === 0 || totalDurationMs <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? clampNumber((event.clientX - rect.left) / rect.width, 0, 1) : 0;
    const targetMs = ratio * totalDurationMs;
    const segment =
      segments.find((candidate) => targetMs >= candidate.startMs && targetMs < candidate.endMs) ??
      segments[segments.length - 1];
    if (!segment) return;
    onSelectUnit(segment.unit.id, clampNumber(targetMs - segment.startMs, 0, segment.durationMs));
  }

  return (
    <div
      className="canvas-playback-route-strip"
      data-testid="canvas-playback-route-strip"
      data-density={density}
      data-route-count={routes.length}
      {...getKeyboardBoundaryMetadata({
        scope: 'media-preview',
        ownerId: 'canvas-playback-route-strip',
        priority: 25,
        ownedKeys: ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'Tab'],
      })}
      onFocus={onFocus}
    >
      <div className="canvas-playback-route-strip-header">
        <div className="canvas-playback-route-strip-title">{t('playback.route.title')}</div>
        <div className="canvas-playback-route-tabs">
          {visibleRoutes.map((route) => (
            <button
              key={route.id}
              type="button"
              className="canvas-playback-route-tab"
              data-active={route.id === selectedRoute?.id ? 'true' : 'false'}
              title={`${formatPlaybackDisplayLabel(route.title)} · ${route.unitIds.length}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onSelectRoute(route)}
            >
              {formatPlaybackDisplayLabel(route.title)}
            </button>
          ))}
          {hiddenRouteCount > 0 ? (
            <span
              className="canvas-playback-route-tab-overflow"
              title={t('playback.route.moreRoutes', { count: hiddenRouteCount })}
            >
              {t('playback.route.moreRoutesShort', { count: hiddenRouteCount })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="canvas-playback-route-timeline">
        <div className="canvas-playback-route-track-label">
          <span className="canvas-playback-route-track-label-title">
            {selectedRoute
              ? formatPlaybackDisplayLabel(selectedRoute.title)
              : t('playback.route.title')}
          </span>
          <span className="canvas-playback-route-track-label-meta">
            {segments.length} · {formatDurationMs(totalDurationMs)}
          </span>
        </div>
        <div
          className="canvas-playback-route-time-ruler"
          data-testid="canvas-playback-route-time-ruler"
          role="slider"
          aria-label={t('playback.route.seek')}
          aria-valuemin={0}
          aria-valuemax={Math.round(totalDurationMs)}
          aria-valuenow={Math.round(absolutePlayheadMs)}
          tabIndex={0}
          title={t('playback.route.seek')}
          onPointerDown={(event) => {
            capturePointerSafely(event.currentTarget, event.pointerId);
            seekRoute(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons !== 1) return;
            seekRoute(event);
          }}
          onKeyDown={(event) => {
            if (segments.length === 0) return;
            const stepMs = event.shiftKey ? 1000 : 250;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              const direction = event.key === 'ArrowRight' ? 1 : -1;
              const targetMs = clampNumber(
                absolutePlayheadMs + direction * stepMs,
                0,
                totalDurationMs,
              );
              const segment =
                segments.find(
                  (candidate) => targetMs >= candidate.startMs && targetMs < candidate.endMs,
                ) ?? segments[segments.length - 1];
              if (segment) {
                onSelectUnit(
                  segment.unit.id,
                  clampNumber(targetMs - segment.startMs, 0, segment.durationMs),
                );
              }
            }
          }}
        >
          <div className="canvas-playback-route-ruler-scale" aria-hidden="true">
            {buildRouteTimeTicks(totalDurationMs).map((tick) => (
              <span
                key={`${tick.timeMs}:${tick.major ? 'major' : 'minor'}`}
                className="canvas-playback-route-ruler-tick"
                data-major={tick.major ? 'true' : 'false'}
                style={{ left: `${tick.leftPercent}%` }}
              >
                {tick.major ? (
                  <span className="canvas-playback-route-ruler-label">
                    {formatDurationMs(tick.timeMs)}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <div className="canvas-playback-route-time-track" role="list">
            {segments.map((segment, index) => {
              const active = segment.unit.id === currentUnitId;
              return (
                <button
                  key={`${segment.unit.id}:${index}:time`}
                  type="button"
                  className="canvas-playback-route-time-segment"
                  data-active={active ? 'true' : 'false'}
                  role="listitem"
                  style={{
                    flexGrow: segment.durationMs,
                  }}
                  title={formatPlaybackDisplayLabel(segment.unit.label ?? segment.unit.id)}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectUnit(segment.unit.id, 0);
                  }}
                >
                  <span className="canvas-playback-route-time-segment-label">
                    {formatPlaybackDisplayLabel(segment.unit.label ?? segment.unit.id)}
                  </span>
                  <span className="canvas-playback-route-time-segment-duration">
                    {formatDurationMs(segment.durationMs)}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="canvas-playback-route-time-playhead"
            style={{ left: `${activeProgress}%` }}
          />
        </div>
      </div>

      {diagnostics.length > 0 ? (
        <div className="canvas-playback-route-diagnostics">
          {diagnostics
            .slice(0, 3)
            .map((diagnostic) => diagnostic.message)
            .join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

interface RouteTimeSegment {
  readonly unit: CanvasPlaybackUnit;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

interface RouteTimeTick {
  readonly timeMs: number;
  readonly leftPercent: number;
  readonly major: boolean;
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

function buildRouteTimeTicks(totalDurationMs: number): readonly RouteTimeTick[] {
  if (totalDurationMs <= 0) return [];
  const totalSeconds = totalDurationMs / 1000;
  const intervalSeconds =
    totalSeconds <= 15 ? 1 : totalSeconds <= 60 ? 5 : totalSeconds <= 180 ? 10 : 30;
  const ticks: RouteTimeTick[] = [];
  const tickCount = Math.floor(totalSeconds / intervalSeconds);
  for (let index = 0; index <= tickCount; index += 1) {
    const timeMs = Math.round(index * intervalSeconds * 1000);
    ticks.push({
      timeMs,
      leftPercent: clampNumber((timeMs / totalDurationMs) * 100, 0, 100),
      major: index % 2 === 0,
    });
  }
  if (ticks[ticks.length - 1]?.timeMs !== Math.round(totalDurationMs)) {
    ticks.push({ timeMs: Math.round(totalDurationMs), leftPercent: 100, major: true });
  }
  return ticks;
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

function formatDurationMs(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function capturePointerSafely(target: HTMLElement, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // jsdom and interrupted Webview pointer sessions can lack capture support.
  }
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

function formatUnitKind(unit: CanvasPlaybackUnit): string {
  switch (unit.kind) {
    case 'scene':
      return t('playback.kind.scene');
    case 'shot':
      return t('playback.kind.shot');
    case 'media':
      return t('playback.kind.media');
    case 'container':
      return t('playback.kind.container');
    case 'narrative':
      return t('playback.kind.narrative');
    case 'node':
    default:
      return t('playback.kind.node');
  }
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

function buildRouteMatrixProjectionKey(
  plan: CanvasPlaybackPlan,
  matrix: NonNullable<ReturnType<typeof projectRouteStoryboardMatrix>>,
): string {
  const revision = readFiniteNumber(plan.metadata['sourceRevision']) ?? 'local';
  return [
    revision,
    plan.adapterId,
    plan.behaviorMode,
    matrix.activeRouteFamilyId ?? 'none',
    matrix.rows.map((row) => row.routeId).join('|'),
    matrix.columns.map((column) => column.id).join('|'),
  ].join(':');
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
