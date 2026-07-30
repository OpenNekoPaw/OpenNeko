// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasPlaybackPlan } from '@neko/shared';
import {
  CanvasPlaybackController,
  buildDefaultPlaybackPath,
  resolveCanvasPlaybackViewState,
} from './CanvasPlaybackController';
import { useCanvasStore } from '../../stores/canvasStore';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@neko/ui/icons', () => ({
  PlayIcon: () => <span>play</span>,
  PauseIcon: () => <span>pause</span>,
  SkipBackIcon: () => <span>previous</span>,
  SkipForwardIcon: () => <span>next</span>,
}));

describe('CanvasPlaybackController', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    host.remove();
  });

  it('moves through a canonical linear route', () => {
    const onActiveUnitChange = vi.fn();
    act(() => {
      root.render(
        <CanvasPlaybackController
          plan={plan()}
          routeUnitIds={['markdown-1', 'media-1']}
          activeUnitId="markdown-1"
          onActiveUnitChange={onActiveUnitChange}
        />,
      );
    });

    act(() => {
      host
        .querySelector<HTMLButtonElement>('button[title="Next"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onActiveUnitChange).toHaveBeenCalledWith('media-1', 'navigation');
    expect(useCanvasStore.getState()).not.toHaveProperty('activePlayingNodeId');
    expect(host.querySelector('[data-testid="canvas-playback-branches"]')).toBeNull();
  });

  it('projects route state without branch semantics', () => {
    expect(resolveCanvasPlaybackViewState(plan(), ['markdown-1', 'media-1'], 'media-1')).toEqual({
      currentUnitId: 'media-1',
      currentIndex: 1,
      canStepPrevious: true,
      canStepNext: false,
      canPlay: true,
    });
    expect(buildDefaultPlaybackPath(plan())).toEqual(['markdown-1', 'media-1']);
  });

  it('centers transport controls without rendering time labels', () => {
    act(() => {
      root.render(
        <CanvasPlaybackController
          plan={plan()}
          routeUnitIds={['markdown-1', 'media-1']}
          activeUnitId="markdown-1"
          currentTimeMs={600}
          durationMs={1_200}
          onSeek={() => undefined}
        />,
      );
    });

    const controller = host.querySelector('[data-testid="canvas-playback-controller"]');
    expect(controller?.querySelector('.canvas-playback-controller-transport')).not.toBeNull();
    expect(controller?.querySelector('.canvas-playback-controller-seek')).not.toBeNull();
    expect(controller?.querySelector('.canvas-playback-controller-time')).toBeNull();
    expect(controller?.textContent).not.toContain('0:00');
    expect(controller?.textContent).not.toContain('0:01');
  });

  it('advances through each timer-driven unit exactly once', () => {
    vi.useFakeTimers();
    const onActiveUnitChange = vi.fn();

    act(() => {
      root.render(
        <CanvasPlaybackController
          plan={timerPlan()}
          routeUnitIds={['unit-1', 'unit-2', 'unit-3']}
          onActiveUnitChange={onActiveUnitChange}
        />,
      );
    });
    onActiveUnitChange.mockClear();

    act(() => {
      host
        .querySelector<HTMLButtonElement>('button[title="Play"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(1_200));
    act(() => vi.advanceTimersByTime(1_200));
    act(() => vi.advanceTimersByTime(1_200));

    expect(onActiveUnitChange.mock.calls.map(([unitId]) => unitId)).toEqual([
      'unit-1',
      'unit-2',
      'unit-3',
    ]);
    expect(onActiveUnitChange.mock.calls.map(([, origin]) => origin)).toEqual([
      'playback',
      'playback',
      'playback',
    ]);
    expect(host.querySelector<HTMLButtonElement>('button[title="Play"]')).not.toBeNull();
  });

  it('clears the pending timer when controlled playback is paused externally', () => {
    vi.useFakeTimers();
    const onActiveUnitChange = vi.fn();
    const renderController = (isPlaying: boolean) => (
      <CanvasPlaybackController
        plan={timerPlan()}
        routeUnitIds={['unit-1', 'unit-2', 'unit-3']}
        activeUnitId="unit-1"
        isPlaying={isPlaying}
        onActiveUnitChange={onActiveUnitChange}
      />
    );

    act(() => root.render(renderController(true)));
    onActiveUnitChange.mockClear();
    act(() => root.render(renderController(false)));
    act(() => vi.advanceTimersByTime(2_400));

    expect(onActiveUnitChange).not.toHaveBeenCalled();
  });

  it('pauses at media completion when the route requires user input', () => {
    const onActiveUnitChange = vi.fn();
    const onPlayingChange = vi.fn();

    act(() => {
      root.render(
        <CanvasPlaybackController
          plan={{ ...timerPlan(), advancePolicy: 'user-input' }}
          routeUnitIds={['unit-1', 'unit-2', 'unit-3']}
          activeUnitId="unit-1"
          isPlaying={true}
          playbackCompletionSignal={{ unitId: 'unit-1', nonce: 1 }}
          onActiveUnitChange={onActiveUnitChange}
          onPlayingChange={onPlayingChange}
        />,
      );
    });

    expect(onActiveUnitChange).not.toHaveBeenCalledWith('unit-2');
    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });
});

function plan(): CanvasPlaybackPlan {
  return {
    adapterId: 'generic',
    requestedAdapterId: 'auto',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: ['markdown-1'],
    units: [
      {
        id: 'markdown-1',
        sourceNodeId: 'markdown-1',
        kind: 'node',
        renderMode: 'select-node',
        label: 'Opening',
      },
      {
        id: 'media-1',
        sourceNodeId: 'media-1',
        kind: 'media',
        renderMode: 'media-playback',
        label: 'Reference',
      },
    ],
    transitions: [
      {
        id: 'sequence-1',
        sourceUnitId: 'markdown-1',
        targetUnitId: 'media-1',
        type: 'sequence',
        priority: 0,
      },
    ],
    routeCandidates: [
      {
        id: 'route-1',
        title: 'Preview',
        entryUnitId: 'markdown-1',
        unitIds: ['markdown-1', 'media-1'],
        sourceKind: 'entry',
      },
    ],
    diagnostics: [],
    metadata: {},
  };
}

function timerPlan(): CanvasPlaybackPlan {
  return {
    adapterId: 'generic',
    requestedAdapterId: 'auto',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: ['unit-1'],
    units: ['unit-1', 'unit-2', 'unit-3'].map((id) => ({
      id,
      sourceNodeId: id,
      kind: 'node',
      renderMode: 'select-node',
      label: id,
      durationMs: 1_200,
    })),
    transitions: [
      {
        id: 'sequence-1-2',
        sourceUnitId: 'unit-1',
        targetUnitId: 'unit-2',
        type: 'sequence',
        priority: 0,
      },
      {
        id: 'sequence-2-3',
        sourceUnitId: 'unit-2',
        targetUnitId: 'unit-3',
        type: 'sequence',
        priority: 0,
      },
    ],
    routeCandidates: [
      {
        id: 'route-timer',
        title: 'Timer route',
        entryUnitId: 'unit-1',
        unitIds: ['unit-1', 'unit-2', 'unit-3'],
        sourceKind: 'entry',
      },
    ],
    diagnostics: [],
    metadata: {},
  };
}
