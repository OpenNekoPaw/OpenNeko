// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasConnection, CanvasData, CanvasNode } from '@neko/shared';
import {
  CanvasPlaybackController,
  buildDefaultPlaybackPath,
  buildInitialPlaybackRoute,
} from './CanvasPlaybackController';
import { useCanvasStore } from '../../stores/canvasStore';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@neko/ui/icons', () => ({
  PauseIcon: ({ size = 16 }: { size?: number }) => <span data-icon="pause">{size}</span>,
  PlayIcon: ({ size = 16 }: { size?: number }) => <span data-icon="play">{size}</span>,
  SkipBackIcon: ({ size = 16 }: { size?: number }) => <span data-icon="skip-back">{size}</span>,
  SkipForwardIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="skip-forward">{size}</span>
  ),
}));

describe('CanvasPlaybackController', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setLocale('en');
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      expandedNodeId: null,
      generationPanelState: { visible: false, nodeId: null, childNodeId: null },
      contentOverlayState: { visible: false, nodeId: null },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders storyboard playback for scene and shot nodes without narrative nodes', () => {
    useCanvasStore.setState({
      canvasData: storyboardCanvas(),
      selection: { nodeIds: ['scene-a'], connectionIds: [] },
    });

    act(() => {
      root.render(<CanvasPlaybackController />);
    });

    const controller = host.querySelector<HTMLElement>(
      '[data-testid="canvas-playback-controller"]',
    );
    expect(controller).not.toBeNull();
    expect(controller?.getAttribute('data-playback-adapter')).toBe('storyboard');
    expect(host.textContent).toContain('Storyboard');
    expect(host.textContent).toContain('1/2');
  });

  it('moves playback highlight without mutating the graph or changing selection', () => {
    const data = storyboardCanvas();
    useCanvasStore.setState({
      canvasData: data,
      selection: { nodeIds: ['scene-a'], connectionIds: [] },
    });
    const before = JSON.stringify(data);

    act(() => {
      root.render(<CanvasPlaybackController />);
    });
    const nextButton = host.querySelector<HTMLButtonElement>('button[title="Next"]');

    act(() => {
      nextButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['scene-a']);
    expect(useCanvasStore.getState().activePlayingNodeId).toBe('shot-a2');
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).toBe(before);
  });

  it('renders branch choices for interactive playback plans', () => {
    const data = genericChoiceCanvas();
    data.playback = { version: 1, adapterId: 'generic', mode: 'interactive' };
    useCanvasStore.setState({
      canvasData: data,
      selection: { nodeIds: ['a'], connectionIds: [] },
    });

    act(() => {
      root.render(<CanvasPlaybackController />);
    });

    expect(host.querySelector('[data-testid="canvas-playback-branches"]')).not.toBeNull();
    expect(host.textContent).toContain('Go left');
    expect(host.textContent).toContain('Go right');
  });

  it('tracks the actual route after choosing a non-default interactive branch', () => {
    const data = genericChoiceCanvas();
    data.playback = { version: 1, adapterId: 'generic', mode: 'interactive' };
    useCanvasStore.setState({
      canvasData: data,
      selection: { nodeIds: ['a'], connectionIds: [] },
    });

    act(() => {
      root.render(<CanvasPlaybackController />);
    });

    const rightChoice = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Go right',
    );
    act(() => {
      rightChoice?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useCanvasStore.getState().activePlayingNodeId).toBe('c');
    expect(host.textContent).toContain('2/2');
    expect(host.querySelector<HTMLButtonElement>('button[title="Next"]')?.disabled).toBe(true);
  });

  it('uses unit duration when auto-advancing timer playback', () => {
    vi.useFakeTimers();
    useCanvasStore.setState({
      canvasData: durationCanvas(),
      selection: { nodeIds: ['a'], connectionIds: [] },
    });

    act(() => {
      root.render(<CanvasPlaybackController />);
    });
    const playButton = host.querySelector<HTMLButtonElement>('button[title="Play"]');

    act(() => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(useCanvasStore.getState().activePlayingNodeId).toBe('a');

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(useCanvasStore.getState().activePlayingNodeId).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useCanvasStore.getState().activePlayingNodeId).toBe('b');

    vi.useRealTimers();
  });

  it('keeps media sequence playback active until media completion advances the route', () => {
    const requests: unknown[] = [];
    const plan = mediaSequencePlan();

    act(() => {
      root.render(
        <CanvasPlaybackController
          plan={plan}
          routeUnitIds={['media-a', 'media-b']}
          activeUnitId="media-a"
          isPlaying={false}
          onPlaybackRequest={(request) => requests.push(request)}
        />,
      );
    });

    const playButton = host.querySelector<HTMLButtonElement>('button[title="Play"]');
    act(() => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(requests).toEqual([
      expect.objectContaining({
        unitId: 'media-a',
        startTimeMs: 0,
        state: 'playing',
      }),
    ]);

    act(() => {
      root.render(
        <CanvasPlaybackController
          plan={plan}
          routeUnitIds={['media-a', 'media-b']}
          activeUnitId="media-a"
          isPlaying
          playbackCompletionSignal={{ unitId: 'media-a', nonce: 1 }}
          onPlaybackRequest={(request) => requests.push(request)}
        />,
      );
    });

    expect(requests).toEqual([
      expect.objectContaining({ unitId: 'media-a', state: 'playing' }),
      expect.objectContaining({ unitId: 'media-b', state: 'playing' }),
    ]);
  });

  it('starts interactive routes at the entry unit instead of precomputing a default branch', () => {
    expect(
      buildInitialPlaybackRoute({
        adapterId: 'generic',
        requestedAdapterId: 'generic',
        behaviorMode: 'interactive',
        advancePolicy: 'user-input',
        entryUnitIds: ['a'],
        units: [
          { id: 'a', sourceNodeId: 'a', kind: 'node', renderMode: 'select-node' },
          { id: 'b', sourceNodeId: 'b', kind: 'node', renderMode: 'select-node' },
        ],
        transitions: [
          { id: 'a-b', sourceUnitId: 'a', targetUnitId: 'b', type: 'choice', priority: 0 },
        ],
        routeCandidates: [
          {
            id: 'entry:a',
            title: 'A',
            entryUnitId: 'a',
            unitIds: ['a', 'b'],
            sourceKind: 'entry',
            sourceNodeId: 'a',
          },
        ],
        diagnostics: [],
        metadata: {},
      }),
    ).toEqual(['a']);
  });

  it('builds a default path without looping forever', () => {
    expect(
      buildDefaultPlaybackPath({
        adapterId: 'generic',
        requestedAdapterId: 'generic',
        behaviorMode: 'linear',
        advancePolicy: 'timer',
        entryUnitIds: ['a'],
        units: [
          { id: 'a', sourceNodeId: 'a', kind: 'node', renderMode: 'select-node' },
          { id: 'b', sourceNodeId: 'b', kind: 'node', renderMode: 'select-node' },
        ],
        transitions: [
          { id: 'a-b', sourceUnitId: 'a', targetUnitId: 'b', type: 'sequence', priority: 0 },
          { id: 'b-a', sourceUnitId: 'b', targetUnitId: 'a', type: 'sequence', priority: 0 },
        ],
        routeCandidates: [
          {
            id: 'entry:a',
            title: 'A',
            entryUnitId: 'a',
            unitIds: ['a', 'b'],
            sourceKind: 'entry',
            sourceNodeId: 'a',
          },
        ],
        diagnostics: [],
        metadata: {},
      }),
    ).toEqual(['a', 'b']);
  });
});

function storyboardCanvas(): CanvasData {
  return {
    version: '2.1',
    name: 'Storyboard',
    nodes: [
      scene('scene-a', ['shot-a1', 'shot-a2']),
      shot('shot-a1', 1, 'scene-a'),
      shot('shot-a2', 2, 'scene-a'),
    ],
    connections: [],
  };
}

function genericChoiceCanvas(): CanvasData {
  return {
    version: '2.1',
    name: 'Generic',
    nodes: [annotation('a'), annotation('b'), annotation('c')],
    connections: [
      connection('left', 'a', 'b', 'choice', { choiceText: 'Go left', priority: 0 }),
      connection('right', 'a', 'c', 'choice', { choiceText: 'Go right', priority: 1 }),
    ],
  };
}

function durationCanvas(): CanvasData {
  const data = genericChoiceCanvas();
  data.playback = {
    version: 1,
    adapterId: 'generic',
    mode: 'linear',
    nodeOverrides: { a: { durationMs: 50 } },
  };
  data.connections = [connection('next', 'a', 'b', 'sequence', { priority: 0 })];
  return data;
}

function mediaSequencePlan() {
  return {
    adapterId: 'media-sequence' as const,
    requestedAdapterId: 'media-sequence' as const,
    behaviorMode: 'linear' as const,
    advancePolicy: 'media-ended' as const,
    entryUnitIds: ['media-a'],
    units: [
      {
        id: 'media-a',
        sourceNodeId: 'media-a',
        kind: 'media' as const,
        renderMode: 'media-playback' as const,
        assetPath: 'assets/a.mp4',
        durationMs: 1000,
      },
      {
        id: 'media-b',
        sourceNodeId: 'media-b',
        kind: 'media' as const,
        renderMode: 'media-playback' as const,
        assetPath: 'assets/b.mp4',
        durationMs: 1000,
      },
    ],
    transitions: [
      {
        id: 'media-a-b',
        sourceUnitId: 'media-a',
        targetUnitId: 'media-b',
        type: 'sequence' as const,
        priority: 0,
      },
    ],
    routeCandidates: [
      {
        id: 'auto-entry:media-a',
        title: 'Media route',
        entryUnitId: 'media-a',
        unitIds: ['media-a', 'media-b'],
        sourceKind: 'auto-entry' as const,
        sourceNodeId: 'media-a',
      },
    ],
    diagnostics: [],
    metadata: {},
  };
}

function scene(id: string, childIds: readonly string[]): CanvasNode {
  return {
    id,
    type: 'scene',
    position: { x: 0, y: 0 },
    size: { width: 400, height: 240 },
    zIndex: 0,
    container: { policy: 'scene', childIds: [...childIds], layout: { mode: 'sequence' } },
    data: { sceneTitle: 'Scene', sceneNumber: 1 },
  };
}

function shot(id: string, shotNumber: number, parentId: string): CanvasNode {
  return {
    id,
    type: 'shot',
    parentId,
    position: { x: shotNumber * 240, y: 40 },
    size: { width: 200, height: 120 },
    zIndex: shotNumber,
    data: {
      shotNumber,
      duration: 3,
      visualDescription: id,
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
    },
  };
}

function annotation(id: string): CanvasNode {
  return {
    id,
    type: 'annotation',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data: { content: id },
  };
}

function connection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasConnection['type'],
  extra: Partial<CanvasConnection>,
): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type,
    ...extra,
  };
}
