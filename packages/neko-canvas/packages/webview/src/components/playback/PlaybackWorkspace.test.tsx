// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasData, CanvasNode } from '@neko/shared';
import { resetVSCodeApi } from '@neko/shared/vscode';
import { PlaybackWorkspace } from './PlaybackWorkspace';
import { useCanvasStore } from '../../stores/canvasStore';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useRuntimeViewportStore } from '../../stores/runtimeViewportStore';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@neko/ui/icons', () => ({
  PlayIcon: ({ size = 16 }: { size?: number }) => <span data-icon="play">{size}</span>,
  PauseIcon: ({ size = 16 }: { size?: number }) => <span data-icon="pause">{size}</span>,
  SkipBackIcon: ({ size = 16 }: { size?: number }) => <span data-icon="skip-back">{size}</span>,
  SkipForwardIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="skip-forward">{size}</span>
  ),
  ChevronDownIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="chevron-down">{size}</span>
  ),
  ChevronRightIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="chevron-right">{size}</span>
  ),
  ClockIcon: ({ size = 16 }: { size?: number }) => <span data-icon="clock">{size}</span>,
  SendIcon: ({ size = 16 }: { size?: number }) => <span data-icon="send">{size}</span>,
  WarningIcon: ({ size = 16 }: { size?: number }) => <span data-icon="warning">{size}</span>,
}));

vi.mock('../../preview/PreviewRendererRegistry', () => ({
  PreviewSurface: ({
    source,
    playbackControl,
  }: {
    source: { id: string };
    playbackControl?: {
      requestId?: string;
      state?: 'playing' | 'paused';
      onEnded?: (event: {
        sourceId: string;
        mediaType: 'video';
        currentTime: number;
        duration: number;
      }) => void;
    };
  }) => (
    <div
      data-testid="preview-surface"
      data-playback-request-id={playbackControl?.requestId}
      data-playback-state={playbackControl?.state}
    >
      {source.id}
      <button
        type="button"
        data-testid="preview-ended"
        onClick={() =>
          playbackControl?.onEnded?.({
            sourceId: source.id,
            mediaType: 'video',
            currentTime: 2,
            duration: 2,
          })
        }
      >
        ended
      </button>
    </div>
  ),
}));

describe('PlaybackWorkspace', () => {
  let host: HTMLDivElement;
  let root: Root;
  let vscodeApi: { postMessage: ReturnType<typeof vi.fn> } | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vscodeApi = undefined;
    resetVSCodeApi();
    (globalThis as { acquireVsCodeApi?: () => unknown }).acquireVsCodeApi = undefined;
    (window as unknown as { vscodeApi?: unknown }).vscodeApi = undefined;
    setLocale('en');
    useCanvasStore.setState({
      canvasData: storyboardCanvas(),
      selection: { nodeIds: ['scene-a'], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      expandedNodeId: null,
      generationPanelState: { visible: false, nodeId: null, childNodeId: null },
      contentOverlayState: { visible: false, nodeId: null },
    });
    usePlaybackStore.setState({
      activePlayback: null,
      handoffRequest: null,
      playbacks: new Map(),
      playbackSession: {
        visible: false,
        panes: { canvas: true, stage: false, route: false },
        layout: { stageWidthPx: 520, routeHeightPx: 300 },
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
      },
    });
    useRuntimeViewportStore.getState().resetViewport();
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      root.unmount();
    });
    host.remove();
    delete (globalThis as { acquireVsCodeApi?: () => unknown }).acquireVsCodeApi;
    delete (window as unknown as { vscodeApi?: unknown }).vscodeApi;
    resetVSCodeApi();
  });

  it('keeps the canvas pane visible by default without opening playback panes', () => {
    act(() => {
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    expect(host.querySelector('[data-testid="canvas-pane"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-stage-pane"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-route-strip"]')).toBeNull();
  });

  it('reveals stage and route matrix from Webview-local session state', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    expect(host.querySelector('[data-testid="canvas-playback-stage-pane"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-route-storyboard-matrix"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-route-strip"]')).toBeNull();
    expect(host.querySelector('.canvas-playback-workspace-header')).toBeNull();
    expect(host.querySelector('.canvas-playback-route-pane-toolbar')).toBeNull();
    expect(host.textContent).toContain('Route Storyboard Matrix');
    expect(host.textContent).toContain('Shot 1');
    expect(host.textContent).toContain('Shot 2');
  });

  it('localizes preview metadata field labels without changing playback metadata keys', () => {
    setLocale('zh-cn');

    act(() => {
      useCanvasStore.setState({
        canvasData: {
          ...storyboardCanvas(),
          nodes: [scene('scene-a', ['shot-a1']), shot('shot-a1', 1, 'scene-a', '')],
        },
      });
      usePlaybackStore.getState().revealPlaybackWorkspace({
        panes: { canvas: true, stage: true, route: false },
      });
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    expect(host.textContent).toContain('镜头 1');
    expect(host.textContent).toContain('镜头号');
    expect(host.textContent).toContain('时长');
    expect(host.textContent).toContain('画面描述');
    expect(host.textContent).toContain('角色');
    expect(host.textContent).not.toContain('shotNumber');
    expect(host.textContent).not.toContain('visualDescription');
    expect(host.textContent).not.toContain('characters');
  });

  it('changes current unit from the route matrix without writing private order to canvas data', () => {
    const before = JSON.stringify(useCanvasStore.getState().canvasData);

    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const shotTwo = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.canvas-route-storyboard-matrix-cell-playable'),
    ).find((button) => button.textContent?.includes('Shot 2'));

    act(() => {
      shotTwo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usePlaybackStore.getState().playbackSession.currentUnitId).toBe('shot-a2');
    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['shot-a2']);
    expect(useCanvasStore.getState().activePlayingNodeId).toBe('shot-a2');
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).toBe(before);
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).not.toContain('timelineOrder');
  });

  it('reveals an off-screen source node in the canvas viewport when a matrix cell is selected', () => {
    useRuntimeViewportStore.getState().setViewport({ zoom: 2 });

    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const canvasPane = host.querySelector<HTMLElement>(
      '[data-testid="canvas-playback-canvas-pane"]',
    );
    if (!canvasPane) throw new Error('canvas pane was not rendered');
    Object.defineProperty(canvasPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        right: 800,
        top: 0,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const shotTwo = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.canvas-route-storyboard-matrix-cell-playable'),
    ).find((button) => button.textContent?.includes('Shot 2'));

    act(() => {
      shotTwo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['shot-a2']);
    expect(useRuntimeViewportStore.getState().viewport.pan).toEqual({
      x: -680,
      y: 180,
    });
  });

  it('renders pane visibility from playback session state and pauses active playback state', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      usePlaybackStore.getState().setPlaybackWorkspacePlaybackState('playing');
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      usePlaybackStore.getState().setPlaybackPaneVisible('stage', false);
    });

    expect(usePlaybackStore.getState().playbackSession.panes.stage).toBe(false);
    expect(usePlaybackStore.getState().playbackSession.playbackState).toBe('paused');
    expect(host.querySelector('[data-testid="canvas-route-storyboard-matrix"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-stage-pane"]')).toBeNull();
  });

  it('keeps route matrix reachable when the playback stage is hidden', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      usePlaybackStore.getState().setPlaybackPaneVisible('stage', false);
    });

    expect(host.querySelector('[data-testid="canvas-playback-stage-pane"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-route-storyboard-matrix"]')).not.toBeNull();
    expect(host.querySelector('.canvas-playback-workspace-header')).toBeNull();

    act(() => {
      usePlaybackStore.getState().setPlaybackPaneVisible('stage', true);
    });

    expect(host.querySelector('[data-testid="canvas-playback-stage-pane"]')).not.toBeNull();
  });

  it('updates workspace layout through resize separators', () => {
    act(() => {
      usePlaybackStore.getState().setPlaybackWorkspaceLayout({
        stageWidthPx: 640,
        routeHeightPx: 260,
      });
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const stage = host.querySelector<HTMLElement>('[data-testid="canvas-playback-stage-pane"]');
    const route = host.querySelector<HTMLElement>('[data-testid="canvas-playback-route-pane"]');

    expect(stage?.style.width).toBe('640px');
    expect(route?.style.height).toBe('260px');
    expect(host.querySelector('[data-testid="canvas-route-storyboard-matrix"]')).not.toBeNull();
  });

  it('seeks from the preview control bar into the route unit projection', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const seekTrack = host.querySelector<HTMLElement>('.canvas-playback-controller-seek .group');
    if (!seekTrack) throw new Error('preview seek bar was not rendered');
    Object.defineProperty(seekTrack, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        right: 400,
        top: 0,
        bottom: 8,
        width: 400,
        height: 8,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    act(() => {
      seekTrack.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          clientX: 300,
        }),
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          clientX: 300,
        }),
      );
    });

    expect(usePlaybackStore.getState().playbackSession.currentUnitId).toBe('shot-a2');
    expect(usePlaybackStore.getState().playbackSession.playheadMs).toBe(1000);
    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['shot-a2']);
  });

  it('continues a media route when the current preview media ends', () => {
    act(() => {
      useCanvasStore.setState({
        canvasData: mediaRouteCanvas(),
        selection: { nodeIds: ['media-a'], connectionIds: [] },
      });
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const playButton = host.querySelector<HTMLButtonElement>('button[title="Play"]');
    act(() => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.querySelector('[data-testid="preview-surface"]')?.textContent).toContain(
      'playback:media-a',
    );
    expect(
      host.querySelector<HTMLElement>('[data-testid="preview-surface"]')?.dataset.playbackState,
    ).toBe('playing');

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-testid="preview-ended"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usePlaybackStore.getState().playbackSession.currentUnitId).toBe('media-b');
    expect(host.querySelector('[data-testid="preview-surface"]')?.textContent).toContain(
      'playback:media-b',
    );
  });

  it('requests and renders host-enriched preview plans inside the same Webview', async () => {
    vscodeApi = { postMessage: vi.fn() };
    (window as unknown as { vscodeApi?: unknown }).vscodeApi = vscodeApi;
    resetVSCodeApi();

    await act(async () => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
      await Promise.resolve();
    });

    const request = vscodeApi.postMessage.mock.calls.find(
      ([message]) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === 'playback:getPreviewPlan',
    )?.[0] as { requestId?: string } | undefined;
    expect(request?.requestId).toEqual(expect.any(String));

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'playback:previewPlanResult',
            requestId: request?.requestId,
            plan: {
              ...hostEnrichedPlaybackPlan(),
            },
          },
        }),
      );
      await Promise.resolve();
    });

    expect(host.querySelector('[data-testid="preview-surface"]')?.firstChild?.textContent).toBe(
      'playback:shot-host',
    );
    expect(host.textContent).toContain('Host Shot');
  });

  it('marks playback workspace stale when host-enriched plan requests time out', async () => {
    vi.useFakeTimers();
    vscodeApi = { postMessage: vi.fn() };
    (window as unknown as { vscodeApi?: unknown }).vscodeApi = vscodeApi;
    resetVSCodeApi();

    await act(async () => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(usePlaybackStore.getState().playbackSession.stale).toBe(true);
    expect(host.textContent).toContain(
      'Preview metadata did not respond in time. Showing local route order.',
    );
  });

  it('keeps matrix as the route pane surface without exposing the compact strip toggle', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const beforeRouteId = usePlaybackStore.getState().playbackSession.routeId;

    expect(host.querySelector('[data-testid="canvas-route-storyboard-matrix"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-route-strip"]')).toBeNull();
    expect(host.querySelector('.canvas-playback-route-view-toggle')).toBeNull();
    expect(usePlaybackStore.getState().playbackSession.routeId).toBe(beforeRouteId);
  });

  it('folds matrix containers globally and preserves summary cells', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      host
        .querySelector<HTMLButtonElement>('.canvas-route-storyboard-matrix-container')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usePlaybackStore.getState().playbackSession.matrix.foldedContainerIds).toEqual([
      'container:scene-a',
    ]);
    expect(host.querySelector('.canvas-route-storyboard-matrix-cell-summary')).not.toBeNull();
  });

  it('selects and reveals a folded container summary without changing the preview unit', () => {
    useRuntimeViewportStore.getState().setViewport({ zoom: 1 });

    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const canvasPane = host.querySelector<HTMLElement>(
      '[data-testid="canvas-playback-canvas-pane"]',
    );
    if (!canvasPane) throw new Error('canvas pane was not rendered');
    Object.defineProperty(canvasPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        right: 800,
        top: 0,
        bottom: 600,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const currentUnitBefore = usePlaybackStore.getState().playbackSession.currentUnitId;

    act(() => {
      host
        .querySelector<HTMLButtonElement>('.canvas-route-storyboard-matrix-container')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      host
        .querySelector<HTMLButtonElement>('.canvas-route-storyboard-matrix-cell-summary')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['scene-a']);
    expect(usePlaybackStore.getState().playbackSession.currentUnitId).toBe(currentUnitBefore);
    expect(useRuntimeViewportStore.getState().viewport.pan).toEqual({
      x: 300,
      y: 240,
    });
  });
});

function storyboardCanvas(): CanvasData {
  return {
    version: '2.1',
    name: 'Storyboard',
    nodes: [
      scene('scene-a', ['shot-a1', 'shot-a2']),
      shot('shot-a1', 1, 'scene-a', 'assets/shot-a1.png'),
      shot('shot-a2', 2, 'scene-a', 'assets/shot-a2.png'),
    ],
    connections: [],
  };
}

function mediaRouteCanvas(): CanvasData {
  return {
    version: '2.1',
    name: 'Media route',
    nodes: [mediaNode('media-a', 'assets/a.mp4'), mediaNode('media-b', 'assets/b.mp4')],
    connections: [
      {
        id: 'media-a-b',
        sourceId: 'media-a',
        targetId: 'media-b',
        sourceEndpoint: { nodeId: 'media-a', scope: 'node' },
        targetEndpoint: { nodeId: 'media-b', scope: 'node' },
        type: 'sequence',
      },
    ],
  };
}

function mediaNode(id: string, assetPath: string): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data: {
      assetPath,
      mediaType: 'video',
      duration: 2,
    },
  };
}

function scene(id: string, childIds: readonly string[]): CanvasNode {
  return {
    id,
    type: 'scene',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    container: { policy: 'scene', childIds: [...childIds], layout: { mode: 'sequence' } },
    data: { sceneTitle: 'Scene A', sceneNumber: 1 },
  };
}

function shot(
  id: string,
  shotNumber: number,
  parentId: string,
  generatedImage: string,
): CanvasNode {
  return {
    id,
    type: 'shot',
    parentId,
    position: { x: shotNumber * 220, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: shotNumber,
    data: {
      shotNumber,
      duration: 2,
      visualDescription: `Shot ${shotNumber}`,
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generatedImage,
      generationStatus: 'idle',
      generationHistory: [],
    },
  };
}

function hostEnrichedPlaybackPlan() {
  return {
    adapterId: 'storyboard',
    requestedAdapterId: 'auto',
    behaviorMode: 'linear',
    advancePolicy: 'manual',
    entryUnitIds: ['shot-host'],
    units: [
      {
        id: 'shot-host',
        sourceNodeId: 'shot-a1',
        kind: 'shot',
        renderMode: 'preview',
        label: 'Host Shot',
        assetPath: 'assets/host-shot.png',
        metadata: {
          previewUrl: 'data:image/png;base64,host-preview',
          previewMediaType: 'image',
        },
      },
    ],
    transitions: [],
    routeCandidates: [
      {
        id: 'route-host',
        title: 'Host Route',
        entryUnitId: 'shot-host',
        unitIds: ['shot-host'],
        sourceKind: 'entry',
      },
    ],
    diagnostics: [],
    metadata: { sourceCanvasName: 'Storyboard' },
  };
}
