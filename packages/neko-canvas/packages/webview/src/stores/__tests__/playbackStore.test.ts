import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasData } from '@neko/shared';
import { useCanvasStore } from '../canvasStore';
import { usePlaybackStore } from '../playbackStore';

describe('playbackStore matrix runtime state', () => {
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
        panes: { canvas: true, stage: false, route: false },
        layout: { stageWidthPx: 520, routeHeightPx: 300 },
        playheadMs: 0,
        focusOwner: 'canvas',
        playbackState: 'idle',
        stale: false,
        matrix: {
          routeViewMode: 'compact',
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
  });

  it('defaults to compact storyline mode and preserves it across matrix projection updates', () => {
    expect(usePlaybackStore.getInitialState().playbackSession).toMatchObject({
      layout: { routeHeightPx: 208 },
      matrix: { routeViewMode: 'compact' },
    });

    usePlaybackStore.getState().setPlaybackMatrixFilters({
      routeIds: ['route-a'],
      highlightedNodeKinds: ['media'],
    });
    usePlaybackStore.getState().reconcilePlaybackMatrixState({
      projectionKey: 'revision-1:storyboard',
      routeFamilyIds: ['family:scene-a'],
      routeIds: ['route-a'],
      containerIds: ['container:scene-a'],
      rowIds: ['row:route-a'],
      columnIds: ['column:shot-a'],
      cellIds: ['cell:route-a:shot-a'],
    });

    expect(usePlaybackStore.getState().playbackSession.matrix.routeViewMode).toBe('compact');
  });

  it('stores matrix mode, route family, filters, focus, and folds as runtime-only state', () => {
    const before = JSON.stringify(useCanvasStore.getState().canvasData);

    usePlaybackStore.getState().setPlaybackRouteViewMode('matrix');
    usePlaybackStore.getState().setPlaybackMatrixRouteFamily('family:scene-a');
    usePlaybackStore.getState().setPlaybackMatrixFilters({
      routeIds: ['route-b', 'route-a', 'route-a'],
      containerIds: ['container:scene-a'],
      highlightedNodeKinds: ['media', 'node', 'media'],
      generationStatuses: ['ready'],
    });
    usePlaybackStore.getState().focusPlaybackMatrix({ kind: 'cell', id: 'cell:route-a:shot-a' });
    usePlaybackStore.getState().togglePlaybackMatrixContainerFold('container:scene-a');

    expect(usePlaybackStore.getState().playbackSession.matrix).toMatchObject({
      routeViewMode: 'matrix',
      activeRouteFamilyId: 'family:scene-a',
      filters: {
        routeFamilyId: 'family:scene-a',
        routeIds: ['route-a', 'route-b'],
        containerIds: ['container:scene-a'],
        highlightedNodeKinds: ['media', 'node'],
        generationStatuses: ['ready'],
      },
      focus: { kind: 'cell', id: 'cell:route-a:shot-a' },
      foldedContainerIds: ['container:scene-a'],
    });
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).toBe(before);
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).not.toContain('matrix');
    expect(JSON.stringify(useCanvasStore.getState().canvasData)).not.toContain('timelineOrder');
  });

  it('reconciles matrix state when the active projection changes', () => {
    usePlaybackStore.getState().setPlaybackMatrixRouteFamily('family:old');
    usePlaybackStore.getState().setPlaybackMatrixFilters({
      routeIds: ['route-old', 'route-keep'],
      containerIds: ['container:old', 'container:keep'],
      highlightedNodeKinds: ['media'],
    });
    usePlaybackStore.getState().focusPlaybackMatrix({ kind: 'cell', id: 'cell-old' });
    usePlaybackStore.getState().togglePlaybackMatrixContainerFold('container:old');
    usePlaybackStore.getState().togglePlaybackMatrixContainerFold('container:keep');

    usePlaybackStore.getState().reconcilePlaybackMatrixState({
      projectionKey: 'revision-2:storyboard',
      routeFamilyIds: ['family:next'],
      routeIds: ['route-keep'],
      containerIds: ['container:keep'],
      rowIds: ['row:route-keep'],
      columnIds: ['column:container:keep:shot-a'],
      cellIds: ['cell:route-keep:shot-a'],
    });

    expect(usePlaybackStore.getState().playbackSession.matrix).toMatchObject({
      activeRouteFamilyId: 'family:next',
      projectionKey: 'revision-2:storyboard',
      filters: {
        routeFamilyId: 'family:next',
        routeIds: ['route-keep'],
        containerIds: ['container:keep'],
        highlightedNodeKinds: ['media'],
      },
      foldedContainerIds: ['container:keep'],
    });
    expect(usePlaybackStore.getState().playbackSession.matrix.focus).toBeUndefined();
  });
});

function canvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Matrix Runtime State',
    nodes: [],
    connections: [],
  };
}
