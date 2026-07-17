import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SkipBackIcon, SkipForwardIcon, PlayIcon } from '@neko/ui/icons';
import { traverseNarrativeFlow } from '@neko/shared';
import { t } from '../../i18n';
import { useCanvasStore } from '../../stores/canvasStore';
import type { PlaybackControllerComponentProps } from '../types';

const PLAY_INTERVAL_MS = 1200;

export interface NarrativePlaybackState {
  readonly currentNodeId?: string;
  readonly currentIndex: number;
  readonly canStepPrevious: boolean;
  readonly canStepNext: boolean;
  readonly canPlay: boolean;
}

export default function NarrativePlaybackController(_props: PlaybackControllerComponentProps) {
  const canvasData = useCanvasStore((state) => state.canvasData);
  const selectedNodeId = useCanvasStore((state) => state.selection.nodeIds[0]);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const playbackTimerRef = useRef<number | null>(null);

  useEffect(() => () => clearPlaybackTimer(), []);

  const flow = useMemo(
    () =>
      canvasData
        ? traverseNarrativeFlow(
            canvasData.nodes,
            canvasData.connections,
            canvasData.narrative?.entryNodeId,
          )
        : null,
    [canvasData],
  );

  const path = flow?.defaultPath ?? [];
  const playbackState = resolveNarrativePlaybackState({
    path,
    activeNodeId,
    selectedNodeId,
  });

  function moveTo(index: number) {
    const nodeId = path[index];
    if (!nodeId) return;
    setActiveNodeId(nodeId);
    selectNode(nodeId);
  }

  function handlePrevious() {
    clearPlaybackTimer();
    if (playbackState.canStepPrevious) {
      moveTo(playbackState.currentIndex - 1);
    }
  }

  function handlePlay() {
    if (!playbackState.canPlay) return;
    clearPlaybackTimer();
    let index = playbackState.currentIndex >= 0 ? playbackState.currentIndex : 0;
    moveTo(index);

    playbackTimerRef.current = window.setInterval(() => {
      index += 1;
      if (index >= path.length) {
        clearPlaybackTimer();
        return;
      }
      moveTo(index);
    }, PLAY_INTERVAL_MS);
  }

  function handleNext() {
    clearPlaybackTimer();
    if (playbackState.canStepNext) {
      moveTo(playbackState.currentIndex + 1);
    }
  }

  function clearPlaybackTimer() {
    if (playbackTimerRef.current === null) return;
    window.clearInterval(playbackTimerRef.current);
    playbackTimerRef.current = null;
  }

  return (
    <div className="flex items-center gap-1">
      <ToolbarIconButton
        title={t('toolbar.playbackPrevious')}
        disabled={!playbackState.canStepPrevious}
        onClick={handlePrevious}
      >
        <SkipBackIcon size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton
        title={t('toolbar.playbackPlay')}
        disabled={!playbackState.canPlay}
        onClick={handlePlay}
      >
        <PlayIcon size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton
        title={t('toolbar.playbackNext')}
        disabled={!playbackState.canStepNext}
        onClick={handleNext}
      >
        <SkipForwardIcon size={14} />
      </ToolbarIconButton>
    </div>
  );
}

export function resolveNarrativePlaybackState({
  path,
  activeNodeId,
  selectedNodeId,
}: {
  path: readonly string[];
  activeNodeId?: string | null;
  selectedNodeId?: string | null;
}): NarrativePlaybackState {
  const currentNodeId =
    activeNodeId && path.includes(activeNodeId)
      ? activeNodeId
      : selectedNodeId && path.includes(selectedNodeId)
        ? selectedNodeId
        : path[0];
  const currentIndex = currentNodeId ? path.indexOf(currentNodeId) : -1;

  return {
    currentNodeId,
    currentIndex,
    canStepPrevious: currentIndex > 0,
    canStepNext: currentIndex >= 0 && currentIndex < path.length - 1,
    canPlay: path.length > 0,
  };
}

function ToolbarIconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded disabled:opacity-45"
      style={{
        border: '1px solid var(--control-border)',
        backgroundColor: 'var(--control-bg)',
        color: 'var(--control-fg)',
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
