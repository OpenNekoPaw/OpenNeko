import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@neko/ui/icons';
import { SeekBar } from '@neko/ui/creative';
import {
  createCanvasPlaybackPlan,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasPlaybackPlan,
  type CanvasPlaybackTransition,
} from '@neko/shared';
import { t } from '../../i18n';
import { useCanvasStore } from '../../stores/canvasStore';

const TIMER_INTERVAL_MS = 1200;

export interface CanvasPlaybackViewState {
  readonly currentUnitId?: string;
  readonly currentIndex: number;
  readonly canStepPrevious: boolean;
  readonly canStepNext: boolean;
  readonly canPlay: boolean;
  readonly branchChoices: readonly CanvasPlaybackTransition[];
}

export interface CanvasPlaybackControllerProps {
  readonly plan?: CanvasPlaybackPlan | null;
  readonly routeUnitIds?: readonly string[];
  readonly activeUnitId?: string | null;
  readonly isPlaying?: boolean;
  readonly currentTimeMs?: number;
  readonly durationMs?: number;
  readonly playbackCompletionSignal?: PlaybackCompletionSignal;
  readonly onActiveUnitChange?: (unitId: string | undefined) => void;
  readonly onPlayingChange?: (isPlaying: boolean) => void;
  readonly onSeek?: (playheadMs: number) => void;
  readonly onRouteChange?: (routeUnitIds: readonly string[]) => void;
  readonly onPlaybackRequest?: (request: CanvasPlaybackRequest) => void;
}

export interface CanvasPlaybackRequest {
  readonly unitId: string;
  readonly requestId: string;
  readonly startTimeMs: number;
  readonly state: 'playing' | 'paused';
}

export interface PlaybackCompletionSignal {
  readonly unitId: string;
  readonly nonce: number;
}

export function CanvasPlaybackController({
  plan: providedPlan,
  routeUnitIds: controlledRouteUnitIds,
  activeUnitId: controlledActiveUnitId,
  isPlaying: controlledIsPlaying,
  currentTimeMs,
  durationMs,
  playbackCompletionSignal,
  onActiveUnitChange,
  onPlayingChange,
  onSeek,
  onRouteChange,
  onPlaybackRequest,
}: CanvasPlaybackControllerProps = {}) {
  const canvasData = useCanvasStore((state) => state.canvasData);
  const selectedNodeId = useCanvasStore((state) => state.selection.nodeIds[0]);
  const setActivePlayingNode = useCanvasStore((state) => state.setActivePlayingNode);
  const [uncontrolledActiveUnitId, setUncontrolledActiveUnitId] = useState<string | null>(null);
  const [uncontrolledIsPlaying, setUncontrolledIsPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);
  const playbackRequestCounterRef = useRef(0);
  const handledCompletionSignalRef = useRef<number | null>(null);

  const plan = useMemo(
    () =>
      providedPlan ??
      (canvasData
        ? createCanvasPlaybackPlan({ canvas: canvasData, selectedNodeId, adapterId: 'auto' })
        : null),
    [canvasData, providedPlan, selectedNodeId],
  );
  const initialRoute = useMemo(() => (plan ? buildInitialPlaybackRoute(plan) : []), [plan]);
  const [uncontrolledRouteUnitIds, setUncontrolledRouteUnitIds] = useState<readonly string[]>([]);
  const activeUnitId = controlledActiveUnitId ?? uncontrolledActiveUnitId;
  const isPlaying = controlledIsPlaying ?? uncontrolledIsPlaying;
  const routeUnitIds = controlledRouteUnitIds ?? uncontrolledRouteUnitIds;
  const route = routeUnitIds.length > 0 ? routeUnitIds : initialRoute;
  const state = resolveCanvasPlaybackViewState({ plan, route, activeUnitId, selectedNodeId });
  const planResetKey = `${plan?.adapterId ?? 'none'}:${plan?.entryUnitIds.join('|') ?? ''}`;
  const onActiveUnitChangeRef = useRef(onActiveUnitChange);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onSeekRef = useRef(onSeek);
  const onRouteChangeRef = useRef(onRouteChange);
  const onPlaybackRequestRef = useRef(onPlaybackRequest);

  onActiveUnitChangeRef.current = onActiveUnitChange;
  onPlayingChangeRef.current = onPlayingChange;
  onSeekRef.current = onSeek;
  onRouteChangeRef.current = onRouteChange;
  onPlaybackRequestRef.current = onPlaybackRequest;

  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    setUncontrolledActiveUnitId(null);
    setUncontrolledRouteUnitIds([]);
    setUncontrolledIsPlaying(false);
    onActiveUnitChangeRef.current?.(undefined);
    onRouteChangeRef.current?.([]);
    onPlayingChangeRef.current?.(false);
    clearTimer();
  }, [planResetKey, selectedNodeId]);

  useEffect(() => {
    if (!playbackCompletionSignal || !isPlaying || !plan) return;
    if (handledCompletionSignalRef.current === playbackCompletionSignal.nonce) return;
    if (playbackCompletionSignal.unitId !== state.currentUnitId) return;
    handledCompletionSignalRef.current = playbackCompletionSignal.nonce;
    continueFromUnit(plan, playbackCompletionSignal.unitId, route);
  }, [isPlaying, plan, playbackCompletionSignal, route, state.currentUnitId]);

  if (!plan || plan.units.length === 0 || state.canPlay === false) {
    return null;
  }

  function moveToUnit(unitId: string | undefined) {
    if (!unitId || !plan) return;
    const unit = plan.units.find((candidate) => candidate.id === unitId);
    if (!unit) return;
    commitActiveUnit(unit.id);
    setActivePlayingNode(unit.sourceNodeId);
  }

  function handlePrevious() {
    clearTimer();
    commitPlaying(false);
    if (!state.canStepPrevious) return;
    moveToUnit(route[state.currentIndex - 1]);
  }

  function handlePlayPause() {
    if (!plan) return;
    if (isPlaying) {
      clearTimer();
      if (state.currentUnitId) {
        requestUnitPlayback(state.currentUnitId, currentUnitPlaybackOffsetMs(), 'paused');
      }
      commitPlaying(false);
      return;
    }
    if (!state.canPlay) return;
    const activePlan = plan;
    const startUnitId = state.currentUnitId ?? route[0];
    if (!startUnitId) return;
    const committedRoute = route.length > 0 ? route : [startUnitId];
    commitRoute(committedRoute);
    moveToUnit(startUnitId);
    requestUnitPlayback(startUnitId, 0, 'playing');

    if (activePlan.advancePolicy !== 'timer') {
      commitPlaying(activePlan.advancePolicy === 'media-ended');
      return;
    }

    commitPlaying(true);
    scheduleNextStep(activePlan, startUnitId, committedRoute);
  }

  function handleNext() {
    clearTimer();
    commitPlaying(false);
    if (!state.canStepNext) return;
    const nextStep = resolveNextRouteStep(plan, route, state.currentIndex, state.currentUnitId);
    if (!nextStep) return;
    commitRoute(nextStep.route);
    moveToUnit(nextStep.unitId);
    requestUnitPlayback(nextStep.unitId, 0, 'paused');
  }

  function handleSeek(timeSeconds: number) {
    onSeekRef.current?.(Math.round(timeSeconds * 1000));
  }

  function handleChoice(transition: CanvasPlaybackTransition) {
    clearTimer();
    commitPlaying(false);
    commitRoute(
      appendTargetToRoute(route, state.currentIndex, state.currentUnitId, transition.targetUnitId),
    );
    moveToUnit(transition.targetUnitId);
    requestUnitPlayback(transition.targetUnitId, 0, 'paused');
  }

  function scheduleNextStep(
    activePlan: CanvasPlaybackPlan,
    currentUnitId: string,
    currentRoute: readonly string[],
  ) {
    clearTimer();
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        const nextStep = resolveNextRouteStep(
          activePlan,
          currentRoute,
          currentRoute.indexOf(currentUnitId),
          currentUnitId,
        );
        if (!nextStep) {
          commitPlaying(false);
          return;
        }
        const unit = activePlan.units.find((candidate) => candidate.id === nextStep.unitId);
        if (!unit) {
          commitPlaying(false);
          return;
        }
        commitRoute(nextStep.route);
        commitActiveUnit(unit.id);
        setActivePlayingNode(unit.sourceNodeId);
        requestUnitPlayback(unit.id, 0, 'playing');
        scheduleNextStep(activePlan, unit.id, nextStep.route);
      },
      resolveUnitDurationMs(activePlan, currentUnitId),
    );
  }

  function continueFromUnit(
    activePlan: CanvasPlaybackPlan,
    currentUnitId: string,
    currentRoute: readonly string[],
  ) {
    clearTimer();
    const nextStep = resolveNextRouteStep(
      activePlan,
      currentRoute,
      currentRoute.indexOf(currentUnitId),
      currentUnitId,
    );
    if (!nextStep) {
      commitPlaying(false);
      return;
    }
    const unit = activePlan.units.find((candidate) => candidate.id === nextStep.unitId);
    if (!unit) {
      commitPlaying(false);
      return;
    }
    commitRoute(nextStep.route);
    commitActiveUnit(unit.id);
    setActivePlayingNode(unit.sourceNodeId);
    requestUnitPlayback(unit.id, 0, 'playing');
    if (activePlan.advancePolicy === 'timer') {
      scheduleNextStep(activePlan, unit.id, nextStep.route);
    }
  }

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function commitActiveUnit(unitId: string | undefined) {
    if (controlledActiveUnitId !== undefined && (controlledActiveUnitId ?? undefined) === unitId) {
      return;
    }
    setUncontrolledActiveUnitId(unitId ?? null);
    onActiveUnitChangeRef.current?.(unitId);
  }

  function commitPlaying(nextIsPlaying: boolean) {
    if (controlledIsPlaying !== undefined && controlledIsPlaying === nextIsPlaying) return;
    setUncontrolledIsPlaying(nextIsPlaying);
    onPlayingChangeRef.current?.(nextIsPlaying);
  }

  function commitRoute(nextRouteUnitIds: readonly string[]) {
    if (
      controlledRouteUnitIds !== undefined &&
      areRouteUnitIdsEqual(controlledRouteUnitIds, nextRouteUnitIds)
    ) {
      return;
    }
    setUncontrolledRouteUnitIds(nextRouteUnitIds);
    onRouteChangeRef.current?.(nextRouteUnitIds);
  }

  function requestUnitPlayback(
    unitId: string,
    startTimeMs: number,
    requestState: CanvasPlaybackRequest['state'],
  ) {
    playbackRequestCounterRef.current += 1;
    onPlaybackRequestRef.current?.({
      unitId,
      startTimeMs,
      state: requestState,
      requestId: `route-playback-${playbackRequestCounterRef.current}`,
    });
  }

  function currentUnitPlaybackOffsetMs(): number {
    if (!state.currentUnitId || currentTimeMs === undefined) return 0;
    let cursor = 0;
    for (const unitId of route) {
      const unit = plan?.units.find((candidate) => candidate.id === unitId);
      const durationMs = plan && unit ? resolveUnitDurationMs(plan, unit.id) : TIMER_INTERVAL_MS;
      if (unitId === state.currentUnitId) {
        return clampNumber(currentTimeMs - cursor, 0, durationMs);
      }
      cursor += durationMs;
    }
    return 0;
  }

  return (
    <div
      className="canvas-playback-controller"
      data-testid="canvas-playback-controller"
      data-playback-adapter={plan.adapterId}
      data-playback-mode={plan.behaviorMode}
    >
      <div className="canvas-playback-controller-row">
        <span
          className="canvas-playback-controller-label canvas-playback-controller-leading"
          title={`${plan.adapterId} · ${plan.behaviorMode}`}
        >
          {formatPlaybackLabel(plan)}
        </span>
        <div className="canvas-playback-controller-transport">
          <ToolbarIconButton
            title={t('toolbar.playbackPrevious')}
            disabled={!state.canStepPrevious}
            onClick={handlePrevious}
          >
            <SkipBackIcon size={14} />
          </ToolbarIconButton>
          <ToolbarIconButton
            title={isPlaying ? t('toolbar.playbackPause') : t('toolbar.playbackPlay')}
            disabled={!state.canPlay}
            onClick={handlePlayPause}
            variant="primary"
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </ToolbarIconButton>
          <ToolbarIconButton
            title={t('toolbar.playbackNext')}
            disabled={!state.canStepNext}
            onClick={handleNext}
          >
            <SkipForwardIcon size={14} />
          </ToolbarIconButton>
          <span className="canvas-playback-controller-count">
            {state.currentIndex + 1}/{route.length}
          </span>
        </div>
        {durationMs !== undefined ? (
          <span className="canvas-playback-controller-time">
            {formatControllerTime((currentTimeMs ?? 0) / 1000)} /{' '}
            {formatControllerTime(durationMs / 1000)}
          </span>
        ) : null}
      </div>
      {durationMs !== undefined && onSeek ? (
        <div className="canvas-playback-controller-seek">
          <SeekBar
            currentTime={(currentTimeMs ?? 0) / 1000}
            duration={durationMs / 1000}
            onSeeking={handleSeek}
            onSeekCommit={handleSeek}
            formatTooltip={formatControllerTime}
          />
        </div>
      ) : null}
      {state.branchChoices.length > 1 ? (
        <div className="canvas-playback-controller-branches" data-testid="canvas-playback-branches">
          {state.branchChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className="canvas-playback-controller-branch"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => handleChoice(choice)}
              title={choice.label ?? t('toolbar.playbackContinue')}
            >
              {choice.label ?? t('toolbar.playbackContinue')}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function resolveCanvasPlaybackViewState({
  plan,
  route,
  activeUnitId,
  selectedNodeId,
}: {
  readonly plan: CanvasPlaybackPlan | null;
  readonly route: readonly string[];
  readonly activeUnitId?: string | null;
  readonly selectedNodeId?: string | null;
}): CanvasPlaybackViewState {
  const selectedUnit = selectedNodeId
    ? plan?.units.find((unit) => unit.sourceNodeId === selectedNodeId)
    : undefined;
  const currentUnitId =
    activeUnitId && route.includes(activeUnitId)
      ? activeUnitId
      : selectedUnit && route.includes(selectedUnit.id)
        ? selectedUnit.id
        : route[0];
  const currentIndex = currentUnitId ? route.indexOf(currentUnitId) : -1;
  const branchChoices = currentUnitId
    ? (plan?.transitions.filter(
        (transition) => transition.sourceUnitId === currentUnitId && transition.enabled !== false,
      ) ?? [])
    : [];
  const nextStep = resolveNextRouteStep(plan, route, currentIndex, currentUnitId);

  return {
    currentUnitId,
    currentIndex,
    canStepPrevious: currentIndex > 0,
    canStepNext: Boolean(nextStep),
    canPlay: route.length > 0,
    branchChoices,
  };
}

export function buildInitialPlaybackRoute(plan: CanvasPlaybackPlan): readonly string[] {
  const route = buildDefaultPlaybackPath(plan);
  if (plan.behaviorMode === 'interactive') {
    return route[0] ? [route[0]] : [];
  }
  return route;
}

export function buildDefaultPlaybackPath(plan: CanvasPlaybackPlan): readonly string[] {
  return resolveEffectiveCanvasPlaybackRoutes(plan).routes[0]?.unitIds ?? [];
}

function resolveNextRouteStep(
  plan: CanvasPlaybackPlan | null,
  route: readonly string[],
  currentIndex: number,
  currentUnitId: string | undefined,
): { readonly unitId: string; readonly route: readonly string[] } | undefined {
  if (!plan || !currentUnitId || currentIndex < 0) return undefined;
  const existingNextUnitId = route[currentIndex + 1];
  if (existingNextUnitId) return { unitId: existingNextUnitId, route };
  const transition = resolveNextTransition(plan, currentUnitId, route);
  if (!transition) return undefined;
  return {
    unitId: transition.targetUnitId,
    route: appendTargetToRoute(route, currentIndex, currentUnitId, transition.targetUnitId),
  };
}

function resolveNextTransition(
  plan: CanvasPlaybackPlan,
  currentUnitId: string,
  route: readonly string[],
): CanvasPlaybackTransition | undefined {
  const transitions = plan.transitions
    .filter(
      (transition) => transition.sourceUnitId === currentUnitId && transition.enabled !== false,
    )
    .filter((transition) => !route.includes(transition.targetUnitId))
    .slice()
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  if (plan.behaviorMode === 'interactive' && transitions.length > 1) {
    return undefined;
  }
  return transitions[0];
}

function appendTargetToRoute(
  route: readonly string[],
  currentIndex: number,
  currentUnitId: string | undefined,
  targetUnitId: string,
): readonly string[] {
  const prefix =
    currentIndex >= 0 ? route.slice(0, currentIndex + 1) : currentUnitId ? [currentUnitId] : [];
  const existingIndex = prefix.indexOf(targetUnitId);
  return existingIndex >= 0 ? prefix.slice(0, existingIndex + 1) : [...prefix, targetUnitId];
}

function resolveUnitDurationMs(plan: CanvasPlaybackPlan, unitId: string): number {
  const durationMs = plan.units.find((unit) => unit.id === unitId)?.durationMs;
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0
    ? durationMs
    : TIMER_INTERVAL_MS;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function areRouteUnitIdsEqual(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  if (!left || left.length !== right.length) return false;
  return left.every((unitId, index) => unitId === right[index]);
}

function formatPlaybackLabel(plan: CanvasPlaybackPlan): string {
  switch (plan.adapterId) {
    case 'storyboard':
      return t('toolbar.playbackStoryboard');
    case 'narrative':
      return t('toolbar.playbackNarrative');
    case 'media-sequence':
      return t('toolbar.playbackMedia');
    case 'generic':
    default:
      return t('toolbar.playbackGeneric');
  }
}

function ToolbarIconButton({
  title,
  disabled,
  onClick,
  children,
  variant = 'default',
}: {
  readonly title: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children: React.ReactNode;
  readonly variant?: 'default' | 'primary';
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className="canvas-playback-controller-button"
      data-variant={variant}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function formatControllerTime(timeSeconds: number): string {
  const totalSeconds = Math.max(0, Math.round(timeSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
