import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SeekBar } from '@neko/ui/creative';
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@neko/ui/icons';
import {
  createCanvasPlaybackPlan,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasPlaybackPlan,
} from '@neko/shared';
import { t } from '../../i18n';
import { useCanvasStore } from '../../stores/canvasStore';

const DEFAULT_UNIT_DURATION_MS = 1200;

export interface CanvasPlaybackViewState {
  readonly currentUnitId?: string;
  readonly currentIndex: number;
  readonly canStepPrevious: boolean;
  readonly canStepNext: boolean;
  readonly canPlay: boolean;
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

export interface CanvasPlaybackControllerModel {
  readonly adapterId: CanvasPlaybackPlan['adapterId'];
  readonly routeLength: number;
  readonly viewState: CanvasPlaybackViewState;
  readonly isPlaying: boolean;
  readonly currentTimeMs?: number;
  readonly durationMs?: number;
  readonly playPause: () => void;
  readonly stepPrevious: () => void;
  readonly stepNext: () => void;
  readonly seek?: (playheadMs: number) => void;
}

export function useCanvasPlaybackController({
  plan: providedPlan,
  routeUnitIds: controlledRoute,
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
}: CanvasPlaybackControllerProps = {}): CanvasPlaybackControllerModel | null {
  const canvasData = useCanvasStore((state) => state.canvasData);
  const selectedNodeId = useCanvasStore((state) => state.selection.nodeIds[0]);
  const setActivePlayingNode = useCanvasStore((state) => state.setActivePlayingNode);
  const [activeUnitId, setActiveUnitId] = useState<string | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [route, setRoute] = useState<readonly string[]>([]);
  const timerRef = useRef<number>();
  const requestCounterRef = useRef(0);
  const handledCompletionRef = useRef<number>();
  const onActiveUnitChangeRef = useRef(onActiveUnitChange);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onRouteChangeRef = useRef(onRouteChange);
  const onPlaybackRequestRef = useRef(onPlaybackRequest);
  onActiveUnitChangeRef.current = onActiveUnitChange;
  onPlayingChangeRef.current = onPlayingChange;
  onRouteChangeRef.current = onRouteChange;
  onPlaybackRequestRef.current = onPlaybackRequest;

  const plan = useMemo(
    () =>
      providedPlan ??
      (canvasData
        ? createCanvasPlaybackPlan({ canvas: canvasData, selectedNodeId, adapterId: 'auto' })
        : null),
    [canvasData, providedPlan, selectedNodeId],
  );
  const defaultRoute = useMemo(() => (plan ? buildInitialPlaybackRoute(plan) : []), [plan]);
  const defaultRouteRef = useRef(defaultRoute);
  defaultRouteRef.current = defaultRoute;
  const effectiveRoute = controlledRoute ?? (route.length > 0 ? route : defaultRoute);
  const effectiveActiveUnitId = controlledActiveUnitId ?? activeUnitId;
  const effectiveIsPlaying = controlledIsPlaying ?? isPlaying;
  const viewState = resolveCanvasPlaybackViewState(
    plan,
    effectiveRoute,
    effectiveActiveUnitId,
    selectedNodeId,
  );
  const planKey = `${plan?.adapterId ?? 'none'}:${defaultRoute.join('|')}`;

  const commitActive = useCallback(
    (unitId: string | undefined, playbackState: 'playing' | 'paused') => {
      if (!unitId || !plan) return;
      const unit = plan.units.find((candidate) => candidate.id === unitId);
      if (!unit) {
        throw new Error(`Playback route references missing unit "${unitId}".`);
      }
      if (controlledActiveUnitId === undefined) setActiveUnitId(unitId);
      onActiveUnitChangeRef.current?.(unitId);
      setActivePlayingNode(unit.sourceNodeId);
      requestCounterRef.current += 1;
      onPlaybackRequestRef.current?.({
        unitId,
        state: playbackState,
        startTimeMs: 0,
        requestId: `canvas-playback-${requestCounterRef.current}`,
      });
    },
    [controlledActiveUnitId, plan, setActivePlayingNode],
  );

  const commitPlaying = useCallback(
    (next: boolean) => {
      if (controlledIsPlaying === undefined) setIsPlaying(next);
      onPlayingChangeRef.current?.(next);
    },
    [controlledIsPlaying],
  );

  const advance = useCallback(
    (delta: -1 | 1, continuePlaying = false) => {
      clearTimer(timerRef);
      const nextIndex = viewState.currentIndex + delta;
      const nextUnitId = effectiveRoute[nextIndex];
      if (!nextUnitId) {
        commitPlaying(false);
        return;
      }
      commitActive(nextUnitId, continuePlaying ? 'playing' : 'paused');
      commitPlaying(continuePlaying);
    },
    [commitActive, commitPlaying, effectiveRoute, viewState.currentIndex],
  );

  useEffect(() => {
    clearTimer(timerRef);
    setRoute(defaultRouteRef.current);
    setActiveUnitId(undefined);
    setIsPlaying(false);
    onRouteChangeRef.current?.(defaultRouteRef.current);
    onActiveUnitChangeRef.current?.(undefined);
    onPlayingChangeRef.current?.(false);
    return () => clearTimer(timerRef);
  }, [planKey]);

  useEffect(() => {
    if (!playbackCompletionSignal || !effectiveIsPlaying) return;
    if (handledCompletionRef.current === playbackCompletionSignal.nonce) return;
    if (playbackCompletionSignal.unitId !== viewState.currentUnitId) return;
    handledCompletionRef.current = playbackCompletionSignal.nonce;
    if (plan?.advancePolicy === 'user-input') {
      commitPlaying(false);
      return;
    }
    advance(1, true);
  }, [
    advance,
    commitPlaying,
    effectiveIsPlaying,
    plan,
    playbackCompletionSignal,
    viewState.currentUnitId,
  ]);

  useEffect(() => {
    clearTimer(timerRef);
    if (!effectiveIsPlaying || plan?.advancePolicy !== 'timer' || !viewState.currentUnitId) {
      return;
    }
    const unit = plan.units.find((candidate) => candidate.id === viewState.currentUnitId);
    if (!unit) {
      throw new Error(`Playback route references missing unit "${viewState.currentUnitId}".`);
    }
    timerRef.current = window.setTimeout(
      () => advance(1, true),
      unit.durationMs ?? DEFAULT_UNIT_DURATION_MS,
    );
    return () => clearTimer(timerRef);
  }, [advance, effectiveIsPlaying, plan, viewState.currentUnitId]);

  function handlePlayPause() {
    const unitId = viewState.currentUnitId ?? effectiveRoute[0];
    if (!unitId) return;
    if (effectiveIsPlaying) {
      clearTimer(timerRef);
      commitPlaying(false);
      commitActive(unitId, 'paused');
      return;
    }
    commitActive(unitId, 'playing');
    commitPlaying(true);
  }

  if (!plan || effectiveRoute.length === 0) return null;

  return {
    adapterId: plan.adapterId,
    routeLength: effectiveRoute.length,
    viewState,
    isPlaying: effectiveIsPlaying,
    ...(currentTimeMs !== undefined ? { currentTimeMs } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    playPause: handlePlayPause,
    stepPrevious: () => advance(-1),
    stepNext: () => advance(1),
    ...(onSeek ? { seek: onSeek } : {}),
  };
}

export function CanvasPlaybackController(props: CanvasPlaybackControllerProps = {}) {
  const model = useCanvasPlaybackController(props);
  return model ? <CanvasPlaybackControls model={model} /> : null;
}

export function CanvasPlaybackControls({
  model,
  presentation = 'default',
}: {
  readonly model: CanvasPlaybackControllerModel;
  readonly presentation?: 'default' | 'overlay';
}) {
  const {
    currentTimeMs,
    durationMs,
    isPlaying,
    playPause,
    seek,
    stepNext,
    stepPrevious,
    viewState,
  } = model;

  return (
    <div
      className="canvas-playback-controller"
      data-testid="canvas-playback-controller"
      data-playback-adapter={model.adapterId}
      data-presentation={presentation}
    >
      <div className="canvas-playback-controller-row">
        <div className="canvas-playback-controller-transport">
          <ToolbarIconButton
            title={t('toolbar.playbackPrevious')}
            disabled={!viewState.canStepPrevious}
            onClick={stepPrevious}
          >
            <SkipBackIcon size={14} />
          </ToolbarIconButton>
          <ToolbarIconButton
            title={isPlaying ? t('toolbar.playbackPause') : t('toolbar.playbackPlay')}
            disabled={!viewState.canPlay}
            onClick={playPause}
            variant="primary"
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </ToolbarIconButton>
          <ToolbarIconButton
            title={t('toolbar.playbackNext')}
            disabled={!viewState.canStepNext}
            onClick={stepNext}
          >
            <SkipForwardIcon size={14} />
          </ToolbarIconButton>
          <span className="canvas-playback-controller-count">
            {Math.max(0, viewState.currentIndex) + 1}/{model.routeLength}
          </span>
        </div>
        {durationMs !== undefined ? (
          <span className="canvas-playback-controller-time">
            {formatControllerTime((currentTimeMs ?? 0) / 1000)} /{' '}
            {formatControllerTime(durationMs / 1000)}
          </span>
        ) : null}
      </div>
      {durationMs !== undefined && seek ? (
        <div className="canvas-playback-controller-seek">
          <SeekBar
            currentTime={(currentTimeMs ?? 0) / 1000}
            duration={durationMs / 1000}
            onSeeking={(seconds) => seek(Math.round(seconds * 1000))}
            onSeekCommit={(seconds) => seek(Math.round(seconds * 1000))}
            formatTooltip={formatControllerTime}
          />
        </div>
      ) : null}
    </div>
  );
}

function buildInitialPlaybackRoute(plan: CanvasPlaybackPlan): readonly string[] {
  return buildDefaultPlaybackPath(plan);
}

export function buildDefaultPlaybackPath(plan: CanvasPlaybackPlan): readonly string[] {
  return resolveEffectiveCanvasPlaybackRoutes(plan).routes[0]?.unitIds ?? [];
}

export function resolveCanvasPlaybackViewState(
  plan: CanvasPlaybackPlan | null,
  route: readonly string[],
  activeUnitId?: string | null,
  selectedNodeId?: string | null,
): CanvasPlaybackViewState {
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
  return {
    currentUnitId,
    currentIndex,
    canStepPrevious: currentIndex > 0,
    canStepNext: currentIndex >= 0 && currentIndex < route.length - 1,
    canPlay: route.length > 0,
  };
}

function ToolbarIconButton({
  children,
  disabled,
  onClick,
  title,
  variant = 'default',
}: {
  readonly children: React.ReactNode;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly title: string;
  readonly variant?: 'default' | 'primary';
}) {
  return (
    <button
      type="button"
      className="canvas-playback-controller-button"
      data-variant={variant}
      disabled={disabled}
      title={title}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function clearTimer(timerRef: React.MutableRefObject<number | undefined>): void {
  if (timerRef.current === undefined) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = undefined;
}

function formatControllerTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}
