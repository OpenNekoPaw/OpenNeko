// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvasPlaybackPlan, type CanvasData, type CanvasNode } from '@neko/shared';
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
      startTimeSeconds?: number;
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
      data-playback-start-time={playbackControl?.startTimeSeconds}
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
    });
    usePlaybackStore.setState({
      activePlayback: null,
      handoffRequest: null,
      playbacks: new Map(),
      playbackSession: {
        visible: false,
        presentation: 'overlay',
        playheadMs: 0,
        focusOwner: 'canvas',
        playbackState: 'idle',
        stale: false,
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
    expect(host.querySelector('[data-testid="canvas-playback-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-storyline"]')).toBeNull();
  });

  it('reveals one collapsed Overlay with Storyline and controls but no Preview content', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const overlay = host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]');
    const layer = host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay-layer"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.dataset.expanded).toBe('false');
    expect(overlay?.getAttribute('aria-modal')).toBeNull();
    expect(layer).not.toBeNull();
    expect(layer?.dataset.expanded).toBeUndefined();
    expect(overlay?.querySelector('[data-testid="canvas-playback-storyline"]')).not.toBeNull();
    expect(overlay?.querySelector('[data-testid="canvas-playback-controller"]')).not.toBeNull();
    expect(overlay?.querySelector('[data-testid="canvas-playback-stage"]')).toBeNull();
    expect(overlay?.querySelector('[data-testid="preview-surface"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-storyline-panel"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-route-pane"]')).toBeNull();
    expect(host.querySelector('.canvas-playback-route-view-toggle')).toBeNull();
    expect(host.querySelector('[role="grid"]')).toBeNull();
    expect(host.querySelectorAll('[data-testid="canvas-playback-controller"]')).toHaveLength(1);
    expect(host.querySelector('.canvas-playback-workspace-header')).toBeNull();
    expect(host.querySelector('.canvas-playback-route-pane-toolbar')).toBeNull();
    expect(overlay?.querySelector('.canvas-playback-overlay-storyline-header')).toBeNull();
    expect(overlay?.querySelector('[data-testid="canvas-playback-route-selector"]')).toBeNull();
    expect(overlay?.querySelector('[data-playback-action="reveal-preview"]')).not.toBeNull();
    expect(host.textContent).toContain('Media 1');
    expect(host.textContent).toContain('Media 2');
  });

  it('keeps one Preview visibility toggle before and after explicit reveal', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const revealPreview = host.querySelector<HTMLButtonElement>(
      '[data-playback-action="reveal-preview"]',
    );
    expect(revealPreview?.title).toBe('Show preview');
    const playbackStateBeforeReveal = usePlaybackStore.getState().playbackSession.playbackState;

    act(() => {
      revealPreview?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const overlay = host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]');
    expect(overlay?.dataset.expanded).toBe('true');
    expect(overlay?.querySelector('[data-testid="canvas-playback-stage"]')).not.toBeNull();
    expect(usePlaybackStore.getState().playbackSession.playbackState).toBe(
      playbackStateBeforeReveal,
    );
    expect(overlay?.querySelector('[data-playback-action="reveal-preview"]')).toBeNull();
    const hidePreview = overlay?.querySelector<HTMLButtonElement>(
      '[data-playback-action="hide-preview"]',
    );
    expect(hidePreview?.title).toBe('Hide preview');

    act(() => {
      hidePreview?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(overlay?.dataset.expanded).toBe('false');
    expect(overlay?.querySelector('[data-testid="canvas-playback-stage"]')).toBeNull();
    expect(overlay?.querySelector('[data-playback-action="hide-preview"]')).toBeNull();
    expect(overlay?.querySelector('[data-playback-action="reveal-preview"]')).not.toBeNull();
    expect(usePlaybackStore.getState().playbackSession.playbackState).toBe(
      playbackStateBeforeReveal,
    );
  });

  it('allows manual Preview hiding without changing active playback state', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[data-testid="canvas-playback-controller"] button[title="Play"]',
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const overlay = host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]');
    expect(overlay?.dataset.expanded).toBe('true');
    expect(usePlaybackStore.getState().playbackSession.playbackState).toBe('playing');

    act(() => {
      overlay
        ?.querySelector<HTMLButtonElement>('[data-playback-action="hide-preview"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(overlay?.dataset.expanded).toBe('false');
    expect(overlay?.querySelector('[data-testid="canvas-playback-stage"]')).toBeNull();
    expect(overlay?.querySelector('[data-playback-action="reveal-preview"]')).not.toBeNull();
    expect(usePlaybackStore.getState().playbackSession.playbackState).toBe('playing');

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[data-testid="canvas-playback-controller"] button[title="Pause"]',
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  });

  it('toggles the unified Overlay full-bleed presentation and closes everything with Escape', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const overlay = host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.dataset.presentation).toBe('overlay');
    expect(overlay?.dataset.expanded).toBe('false');
    expect(overlay?.querySelector('[data-testid="canvas-playback-stage"]')).toBeNull();
    expect(host.querySelectorAll('[data-testid="canvas-playback-controller"]')).toHaveLength(1);
    expect(overlay?.querySelector('[data-testid="canvas-playback-storyline"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-canvas-pane"]')).not.toBeNull();

    act(() => {
      overlay
        ?.querySelector<HTMLButtonElement>('[data-playback-action="toggle-overlay-fullscreen"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(
      host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]')?.dataset
        .presentation,
    ).toBe('fullscreen');
    expect(
      host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]')?.dataset.expanded,
    ).toBe('true');
    expect(host.querySelector('[data-testid="canvas-playback-stage"]')).not.toBeNull();
    expect(host.querySelector('[data-playback-action="reveal-preview"]')).toBeNull();
    expect(host.querySelector('[data-playback-action="hide-preview"]')).toBeNull();

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-playback-action="toggle-overlay-fullscreen"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(
      host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]')?.dataset
        .presentation,
    ).toBe('overlay');
    expect(
      host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]')?.dataset.expanded,
    ).toBe('true');
    expect(host.querySelector('[data-testid="canvas-playback-stage"]')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[data-testid="canvas-playback-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-storyline"]')).toBeNull();
  });

  it('keeps one controlled Preview instance and playback identity across full-bleed toggles', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-playback-action="reveal-preview"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewBefore = host.querySelector<HTMLElement>('[data-testid="preview-surface"]');
    if (!previewBefore) throw new Error('preview surface was not revealed');
    const requestIdBefore = previewBefore.dataset.playbackRequestId;
    expect(requestIdBefore).toBeTruthy();
    expect(previewBefore.dataset.playbackState).toBe('paused');

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-playback-action="toggle-overlay-fullscreen"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewFullscreen = host.querySelector<HTMLElement>('[data-testid="preview-surface"]');
    expect(previewFullscreen).toBe(previewBefore);
    expect(previewFullscreen?.dataset.playbackRequestId).toBe(requestIdBefore);
    expect(previewFullscreen?.dataset.playbackState).toBe('paused');

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-playback-action="toggle-overlay-fullscreen"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewRestored = host.querySelector<HTMLElement>('[data-testid="preview-surface"]');
    expect(previewRestored).toBe(previewBefore);
    expect(previewRestored?.dataset.playbackRequestId).toBe(requestIdBefore);
    expect(previewRestored?.dataset.playbackState).toBe('paused');
  });

  it('preserves an active playback request and playhead across full-bleed presentation changes', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      usePlaybackStore.getState().setPlaybackSessionCurrentUnit('shot-a1', 750);
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[data-testid="canvas-playback-controller"] button[title="Play"]',
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewBefore = host.querySelector<HTMLElement>('[data-testid="preview-surface"]');
    if (!previewBefore) throw new Error('playing preview surface was not rendered');
    const requestIdBefore = previewBefore.dataset.playbackRequestId;
    const startTimeBefore = previewBefore.dataset.playbackStartTime;
    const sessionBefore = usePlaybackStore.getState().playbackSession;
    expect(previewBefore.dataset.playbackState).toBe('playing');
    expect(requestIdBefore).toBeTruthy();
    expect(startTimeBefore).toBe('0.75');
    expect(sessionBefore.playheadMs).toBe(750);

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-playback-action="toggle-overlay-fullscreen"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-playback-action="toggle-overlay-fullscreen"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewAfter = host.querySelector<HTMLElement>('[data-testid="preview-surface"]');
    expect(previewAfter).toBe(previewBefore);
    expect(previewAfter?.dataset.playbackRequestId).toBe(requestIdBefore);
    expect(previewAfter?.dataset.playbackState).toBe('playing');
    expect(previewAfter?.dataset.playbackStartTime).toBe(startTimeBefore);
    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      presentation: 'overlay',
      playbackState: sessionBefore.playbackState,
      currentUnitId: sessionBefore.currentUnitId,
      playheadMs: sessionBefore.playheadMs,
    });

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[data-testid="canvas-playback-controller"] button[title="Pause"]',
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      host.querySelector<HTMLElement>('[data-testid="preview-surface"]')?.dataset.playbackState,
    ).toBe('paused');
    expect(
      host.querySelector<HTMLElement>('[data-testid="preview-surface"]')?.dataset.playbackStartTime,
    ).toBe('0.75');
    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      playbackState: 'paused',
      playheadMs: 750,
    });
  });

  it('keeps persisted media titles while localizing the unified Overlay shell', () => {
    setLocale('zh-cn');

    act(() => {
      useCanvasStore.setState({
        canvasData: {
          ...storyboardCanvas(),
          nodes: [scene('scene-a', ['shot-a1']), shot('shot-a1', 1, 'scene-a', '')],
        },
      });
      usePlaybackStore.getState().revealPlaybackWorkspace();
      usePlaybackStore.getState().setPlaybackWorkspacePlaybackState('playing');
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    expect(host.textContent).toContain('Media 1');
    expect(
      host.querySelector('[data-testid="canvas-playback-overlay"]')?.getAttribute('aria-label'),
    ).toBe('故事播放');
    expect(host.textContent).not.toContain('playback.overlay.title');
  });

  it('renders the unified Storyline without a redundant heading or single-route selector', () => {
    setLocale('zh-cn');

    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const panel = host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]');
    expect(panel?.querySelector('.canvas-playback-overlay-storyline-header')).toBeNull();
    expect(panel?.querySelector('[data-testid="canvas-playback-route-selector"]')).toBeNull();
    expect(panel?.textContent).not.toContain('路线比较');
    expect(panel?.textContent).toContain('Media 1');
    expect(panel?.querySelector('[data-playback-action="open-preview"]')).toBeNull();
    expect(panel?.querySelector('[data-testid="canvas-playback-storyline"]')).not.toBeNull();
    expect(panel?.querySelector('[aria-label="调整故事线浮层高度"]')).toBeNull();
    expect(panel?.textContent).not.toContain('Storyline');
    expect(panel?.textContent).not.toContain('Compare');
  });

  it('keeps route focus ownership inside the Overlay Storyline', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const storyline = host.querySelector<HTMLElement>('[data-testid="canvas-playback-storyline"]');
    if (!storyline) throw new Error('storyline panel was not rendered');

    act(() => {
      storyline.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(usePlaybackStore.getState().playbackSession.focusOwner).toBe('route');
  });

  it('changes current unit from Storyline without writing private order to canvas data', () => {
    const before = JSON.stringify(useCanvasStore.getState().canvasData);

    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });
    const shotTwo = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-storyline-node="true"]'),
    ).find((button) => button.textContent?.includes('Media 2'));

    act(() => {
      shotTwo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usePlaybackStore.getState().playbackSession.currentUnitId).toBe('shot-a2');
    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['scene-a']);
    expect(useCanvasStore.getState()).not.toHaveProperty('activePlayingNodeId');
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).toBe(before);
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).not.toContain('timelineOrder');
  });

  it('reveals an off-screen source node in the canvas viewport when a Storyline node is selected', () => {
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
      host.querySelectorAll<HTMLButtonElement>('[data-storyline-node="true"]'),
    ).find((button) => button.textContent?.includes('Media 2'));

    act(() => {
      shotTwo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['scene-a']);
    expect(useRuntimeViewportStore.getState().viewport.pan).toEqual({
      x: -680,
      y: 180,
    });
  });

  it('closes the unified Overlay and pauses playback', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      usePlaybackStore.getState().setPlaybackWorkspacePlaybackState('playing');
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      usePlaybackStore.getState().hidePlaybackWorkspace();
    });

    expect(usePlaybackStore.getState().playbackSession.visible).toBe(false);
    expect(usePlaybackStore.getState().playbackSession.playbackState).toBe('paused');
    expect(host.querySelector('[data-testid="canvas-playback-storyline"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-overlay"]')).toBeNull();
  });

  it('hides and reopens the same collapsed Overlay', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    act(() => {
      usePlaybackStore.getState().hidePlaybackWorkspace();
    });

    expect(host.querySelector('[data-testid="canvas-playback-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-storyline"]')).toBeNull();
    expect(host.querySelector('.canvas-playback-workspace-header')).toBeNull();

    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
    });

    expect(host.querySelector('[data-testid="canvas-playback-overlay"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-stage"]')).toBeNull();
  });

  it('does not create Preview width or resize state', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    expect(usePlaybackStore.getState().playbackSession).not.toHaveProperty('layout');
    expect(host.querySelector('.canvas-playback-stage-resize-handle')).toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-storyline"]')).not.toBeNull();
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
    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['scene-a']);
    expect(useRuntimeViewportStore.getState().viewport.pan).toEqual({ x: 0, y: 0 });
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

  it('keeps Preview expanded after pausing and resets it only after reopening Storyline', () => {
    act(() => {
      useCanvasStore.setState({
        canvasData: mediaRouteCanvas(),
        selection: { nodeIds: ['media-a'], connectionIds: [] },
      });
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const collapsedOverlay = host.querySelector<HTMLElement>(
      '[data-testid="canvas-playback-overlay"]',
    );
    const layer = host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay-layer"]');
    expect(collapsedOverlay).not.toBeNull();
    expect(collapsedOverlay?.dataset.expanded).toBe('false');
    expect(collapsedOverlay?.getAttribute('aria-modal')).toBeNull();
    expect(layer).not.toBeNull();
    expect(layer?.dataset.expanded).toBeUndefined();
    expect(host.querySelector('[data-testid="canvas-playback-stage"]')).toBeNull();
    expect(host.querySelectorAll('[data-testid="canvas-playback-controller"]')).toHaveLength(1);

    act(() => {
      host
        .querySelector<HTMLButtonElement>('button[title="Play"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const expandedOverlay = host.querySelector<HTMLElement>(
      '[data-testid="canvas-playback-overlay"]',
    );
    expect(expandedOverlay).not.toBeNull();
    expect(expandedOverlay).toBe(collapsedOverlay);
    expect(expandedOverlay?.dataset.expanded).toBe('true');
    expect(expandedOverlay?.getAttribute('aria-modal')).toBeNull();
    expect(layer?.dataset.expanded).toBeUndefined();
    expect(host.querySelector('[data-testid="canvas-playback-stage"]')).not.toBeNull();
    expect(
      host.querySelector<HTMLElement>('[data-testid="preview-surface"]')?.dataset.playbackState,
    ).toBe('playing');
    expect(host.querySelectorAll('[data-testid="canvas-playback-controller"]')).toHaveLength(1);

    act(() => {
      host
        .querySelector<HTMLButtonElement>('button[title="Pause"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usePlaybackStore.getState().playbackSession.playbackState).toBe('paused');
    expect(
      host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]')?.dataset.expanded,
    ).toBe('true');
    expect(
      host
        .querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]')
        ?.getAttribute('aria-modal'),
    ).toBeNull();
    expect(layer?.dataset.expanded).toBeUndefined();
    expect(host.querySelector('[data-testid="canvas-playback-stage"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-storyline"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-playback-controller"]')).not.toBeNull();

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-playback-action="close-overlay"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="canvas-playback-overlay"]')).toBeNull();

    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
    });
    expect(
      host.querySelector<HTMLElement>('[data-testid="canvas-playback-overlay"]')?.dataset.expanded,
    ).toBe('false');
    expect(host.querySelector('[data-testid="canvas-playback-stage"]')).toBeNull();
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

    expect(host.querySelector('[data-testid="preview-surface"]')).toBeNull();
    expect(host.textContent).toContain('Host Shot');

    act(() => {
      usePlaybackStore.getState().setPlaybackWorkspacePlaybackState('playing');
    });

    expect(host.querySelector('[data-testid="preview-surface"]')?.firstChild?.textContent).toBe(
      'playback:shot-host',
    );
  });

  it('preserves active video playback when the Host plan settles after Play', async () => {
    vscodeApi = { postMessage: vi.fn() };
    (window as unknown as { vscodeApi?: unknown }).vscodeApi = vscodeApi;
    resetVSCodeApi();

    await act(async () => {
      useCanvasStore.setState({
        canvasData: mediaRouteCanvas(),
        selection: { nodeIds: ['media-a'], connectionIds: [] },
      });
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

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[data-testid="canvas-playback-controller"] button[title="Play"]',
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const previewBefore = host.querySelector<HTMLElement>('[data-testid="preview-surface"]');
    if (!previewBefore) throw new Error('playing preview surface was not rendered');
    const playbackRequestId = previewBefore.dataset.playbackRequestId;
    expect(previewBefore.dataset.playbackState).toBe('playing');

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'playback:previewPlanResult',
            requestId: request?.requestId,
            plan: createCanvasPlaybackPlan({
              canvas: mediaRouteCanvas(),
              selectedNodeId: 'media-a',
              adapterId: 'auto',
            }),
          },
        }),
      );
      await Promise.resolve();
    });

    const previewAfter = host.querySelector<HTMLElement>('[data-testid="preview-surface"]');
    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      stale: false,
      playbackState: 'playing',
    });
    expect(previewAfter).toBe(previewBefore);
    expect(previewAfter?.dataset.playbackRequestId).toBe(playbackRequestId);
    expect(previewAfter?.dataset.playbackState).toBe('playing');
  });

  it('drops a stale host Storyline plan immediately when Canvas topology changes', async () => {
    vscodeApi = { postMessage: vi.fn() };
    (window as unknown as { vscodeApi?: unknown }).vscodeApi = vscodeApi;
    resetVSCodeApi();

    await act(async () => {
      useCanvasStore.setState({
        canvasData: mediaRouteCanvas(),
        selection: { nodeIds: ['media-a'], connectionIds: [] },
      });
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

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'playback:previewPlanResult',
            requestId: request?.requestId,
            plan: createCanvasPlaybackPlan({
              canvas: mediaRouteCanvas(),
              selectedNodeId: 'media-a',
              adapterId: 'auto',
            }),
          },
        }),
      );
      await Promise.resolve();
    });
    expect(
      host
        .querySelector('[data-testid="canvas-playback-storyline-branch-graph"]')
        ?.querySelectorAll('.canvas-playback-storyline-edge'),
    ).toHaveLength(1);

    act(() => {
      useCanvasStore.getState().removeConnection('media-a-b');
    });

    expect(
      host
        .querySelector('[data-testid="canvas-playback-storyline-branch-graph"]')
        ?.querySelectorAll('.canvas-playback-storyline-edge'),
    ).toHaveLength(0);
  });

  it('selects multiple routes inside Storyline without opening another route surface', async () => {
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

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'playback:previewPlanResult',
            requestId: request?.requestId,
            plan: multiRoutePlaybackPlan(),
          },
        }),
      );
      await Promise.resolve();
    });

    const routeSelector = host.querySelector<HTMLSelectElement>(
      '[data-testid="canvas-playback-route-selector"]',
    );
    if (!routeSelector) throw new Error('multiple-route Storyline selector was not rendered');
    expect(routeSelector.getAttribute('aria-label')).toBe('Story routes');
    expect(routeSelector.options).toHaveLength(2);
    expect(host.querySelector('.canvas-playback-storyline-routes')).toBeNull();
    expect(host.querySelector('.canvas-playback-storyline-route')).toBeNull();

    act(() => {
      routeSelector.value = 'route-alternate';
      routeSelector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      routeId: 'route-alternate',
      currentUnitId: 'shot-a2',
    });
    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['scene-a']);
    expect(host.querySelectorAll('[data-storyline-node="true"]')).toHaveLength(2);
    expect(
      host
        .querySelector('[data-testid="canvas-playback-storyline-branch-graph"]')
        ?.getAttribute('data-lane-count'),
    ).toBe('2');
    const transport = host.querySelector('[data-testid="canvas-playback-controller"]');
    expect(transport?.querySelectorAll('button')).toHaveLength(3);
    expect(host.querySelector('[role="grid"]')).toBeNull();
  });

  it('renders all route connectors while keeping visible story nodes compact', async () => {
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

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'playback:previewPlanResult',
            requestId: request?.requestId,
            plan: branchedPlaybackPlan(),
          },
        }),
      );
      await Promise.resolve();
    });

    const graph = host.querySelector('[data-testid="canvas-playback-storyline-branch-graph"]');
    const edges = Array.from(
      graph?.querySelectorAll<SVGPathElement>('.canvas-playback-storyline-edge') ?? [],
    );
    const nodes = Array.from(
      graph?.querySelectorAll<HTMLButtonElement>('[data-storyline-node="true"]') ?? [],
    );
    expect(graph?.getAttribute('data-lane-count')).toBe('2');
    expect(edges.map((edge) => edge.dataset.routeId)).toEqual([
      'route-main',
      'route-main',
      'route-alternate',
      'route-alternate',
    ]);
    expect(edges.filter((edge) => edge.dataset.selected === 'true')).toHaveLength(2);
    expect(nodes).toHaveLength(4);
    expect(
      nodes.every(
        (node) =>
          node.children.length === 2 &&
          node.querySelector('.canvas-playback-storyline-node-index') !== null &&
          node.querySelector('.canvas-playback-storyline-node-label') !== null,
      ),
    ).toBe(true);
    expect(graph?.textContent).not.toContain('Playable media');
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

  it('renders Storyline as the only structural route surface without a time ruler', () => {
    act(() => {
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    expect(host.querySelector('[data-testid="canvas-playback-storyline"]')).not.toBeNull();
    expect(host.querySelector('[role="grid"]')).toBeNull();
    expect(host.querySelector('.canvas-playback-route-view-toggle')).toBeNull();
    expect(host.querySelector('.canvas-playback-route-time-ruler')).toBeNull();
    const nodes = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-storyline-node="true"]'),
    );
    expect(nodes).toHaveLength(2);
    expect(
      host.querySelector<HTMLElement>('[data-testid="canvas-playback-storyline"]')?.textContent,
    ).not.toContain('0:02');
    expect(nodes.every((node) => node.style.flexGrow === '')).toBe(true);

    act(() => {
      nodes[0]?.focus();
      nodes[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });
    expect(document.activeElement).toBe(nodes[1]);
  });

  it('shows missing media state on the owning Storyline node', () => {
    act(() => {
      useCanvasStore.setState({
        canvasData: {
          version: '2.1',
          name: 'Missing media',
          nodes: [
            {
              id: 'missing-media',
              type: 'media',
              position: { x: 0, y: 0 },
              size: { width: 200, height: 120 },
              zIndex: 0,
              data: { assetPath: '', mediaType: 'video', title: 'Missing clip' },
            },
          ],
          connections: [],
        },
        selection: { nodeIds: ['missing-media'], connectionIds: [] },
      });
      usePlaybackStore.getState().revealPlaybackWorkspace();
      root.render(<PlaybackWorkspace canvasPane={<div data-testid="canvas-pane">Canvas</div>} />);
    });

    const node = host.querySelector<HTMLElement>('[data-storyline-node="true"]');
    expect(node?.dataset.mediaState).toBe('missing');
    expect(node?.getAttribute('aria-label')).toContain('Missing media');
    expect(host.textContent).toContain('has no stable source');
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
    type: 'group',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    container: { policy: 'group', childIds: [...childIds], layout: { mode: 'sequence' } },
    data: { label: 'Group A' },
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
    type: 'media',
    parentId,
    position: { x: shotNumber * 220, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: shotNumber,
    data: {
      assetPath: generatedImage || `assets/${id}.png`,
      mediaType: 'image',
      duration: 2,
      title: `Media ${shotNumber}`,
    },
  };
}

function hostEnrichedPlaybackPlan() {
  return {
    adapterId: 'generic',
    requestedAdapterId: 'auto',
    behaviorMode: 'linear',
    advancePolicy: 'user-input',
    entryUnitIds: ['shot-host'],
    units: [
      {
        id: 'shot-host',
        sourceNodeId: 'shot-a1',
        kind: 'media',
        renderMode: 'media-playback',
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

function multiRoutePlaybackPlan() {
  return {
    adapterId: 'generic',
    requestedAdapterId: 'auto',
    behaviorMode: 'manual',
    advancePolicy: 'user-input',
    entryUnitIds: ['shot-a1'],
    units: [
      {
        id: 'shot-a1',
        sourceNodeId: 'shot-a1',
        kind: 'media',
        renderMode: 'media-playback',
        label: 'Media 1',
        assetPath: 'assets/shot-a1.png',
      },
      {
        id: 'shot-a2',
        sourceNodeId: 'shot-a2',
        kind: 'media',
        renderMode: 'media-playback',
        label: 'Media 2',
        assetPath: 'assets/shot-a2.png',
      },
    ],
    transitions: [
      {
        id: 'shot-a1-to-shot-a2',
        sourceUnitId: 'shot-a1',
        targetUnitId: 'shot-a2',
        type: 'sequence',
        priority: 0,
      },
    ],
    routeCandidates: [
      {
        id: 'route-main',
        title: 'Main Route',
        entryUnitId: 'shot-a1',
        unitIds: ['shot-a1', 'shot-a2'],
        sourceKind: 'entry',
      },
      {
        id: 'route-alternate',
        title: 'Alternate Route',
        entryUnitId: 'shot-a2',
        unitIds: ['shot-a2'],
        sourceKind: 'selection',
      },
    ],
    diagnostics: [],
    metadata: { sourceCanvasName: 'Storyboard' },
  };
}

function branchedPlaybackPlan() {
  const mediaUnit = (id: string, sourceNodeId: string, label: string) => ({
    id,
    sourceNodeId,
    kind: 'media',
    renderMode: 'media-playback',
    label,
    assetPath: `assets/${id}.png`,
  });
  return {
    adapterId: 'generic',
    requestedAdapterId: 'auto',
    behaviorMode: 'manual',
    advancePolicy: 'user-input',
    entryUnitIds: ['start-main', 'start-alt'],
    units: [
      mediaUnit('start-main', 'source-start', 'Start'),
      mediaUnit('choice-main', 'source-main', 'Main choice'),
      mediaUnit('end-main', 'source-end', 'End'),
      mediaUnit('start-alt', 'source-start', 'Start'),
      mediaUnit('choice-alt', 'source-alt', 'Alternate choice'),
      mediaUnit('end-alt', 'source-end', 'End'),
    ],
    transitions: [],
    routeCandidates: [
      {
        id: 'route-main',
        title: 'Main Route',
        entryUnitId: 'start-main',
        unitIds: ['start-main', 'choice-main', 'end-main'],
        sourceKind: 'entry',
      },
      {
        id: 'route-alternate',
        title: 'Alternate Route',
        entryUnitId: 'start-alt',
        unitIds: ['start-alt', 'choice-alt', 'end-alt'],
        sourceKind: 'entry',
      },
    ],
    diagnostics: [],
    metadata: { sourceCanvasName: 'Branched Storyline' },
  };
}
