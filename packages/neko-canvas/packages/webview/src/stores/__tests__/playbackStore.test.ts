import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasData } from '@neko/shared';
import { useCanvasStore } from '../canvasStore';
import { usePlaybackStore } from '../playbackStore';

describe('playbackStore storyline session state', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      canvasData: canvasData(),
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
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
  });

  it('defaults to one hidden playback Overlay without pane, layout or matrix state', () => {
    const session = usePlaybackStore.getInitialState().playbackSession;
    expect(session).toMatchObject({
      visible: false,
      presentation: 'overlay',
    });
    expect(session).not.toHaveProperty('preview');
    expect(session).not.toHaveProperty('panes');
    expect(session).not.toHaveProperty('layout');
    expect(session.routeId).toBeUndefined();
    expect(session.currentUnitId).toBeUndefined();
    expect(session).not.toHaveProperty('matrix');
  });

  it('reveals the unified Overlay with route focus by default', () => {
    usePlaybackStore.getState().revealPlaybackWorkspace();

    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      visible: true,
      presentation: 'overlay',
      focusOwner: 'route',
    });
  });

  it('changes the same Overlay presentation and resets it when hidden', () => {
    usePlaybackStore.getState().revealPlaybackWorkspace({ focusOwner: 'preview' });
    usePlaybackStore.getState().setPlaybackOverlayPresentation('fullscreen');

    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      visible: true,
      presentation: 'fullscreen',
      focusOwner: 'preview',
    });

    usePlaybackStore.getState().hidePlaybackWorkspace();

    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      visible: false,
      presentation: 'overlay',
      focusOwner: 'canvas',
    });
  });

  it('stores route and current story node as runtime-only state', () => {
    const before = JSON.stringify(useCanvasStore.getState().canvasData);

    usePlaybackStore.getState().setPlaybackSessionRoute('route-a', 'story-node-a', 250);

    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      routeId: 'route-a',
      currentUnitId: 'story-node-a',
      playheadMs: 250,
    });
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).toBe(before);
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).not.toContain('matrix');
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).not.toContain('timelineOrder');
  });

  it('resets the story node playhead when the selected route changes', () => {
    usePlaybackStore.getState().setPlaybackSessionRoute('route-a', 'story-node-a', 500);
    usePlaybackStore.getState().setPlaybackSessionRoute('route-b', 'story-node-b');

    expect(usePlaybackStore.getState().playbackSession).toMatchObject({
      routeId: 'route-b',
      currentUnitId: 'story-node-b',
      playheadMs: 0,
    });
  });
});

function canvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Storyline Session State',
    nodes: [],
    connections: [],
  };
}
