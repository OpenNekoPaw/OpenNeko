import { describe, expect, it } from 'vitest';
import type { CanvasPlaybackRouteCandidate, CanvasPlaybackUnit } from '@neko/canvas-domain';
import {
  buildStorylineGraphLayout,
  buildStorylineSequenceGraphLayout,
  moveStorylineGraphNode,
  resolveStorylineGraphNodeRole,
  resolveStorylineOrderPosition,
  wouldCreateStorylineSequenceCycle,
} from './storylineGraphLayout';

describe('buildStorylineGraphLayout', () => {
  it('projects shared prefixes, branches and merges from stable source identities', () => {
    const unitById = new Map<string, CanvasPlaybackUnit>([
      ['start-main', unit('start-main', 'start', 'Start')],
      ['choice-a', unit('choice-a', 'choice-a', 'Choice')],
      ['end-main', unit('end-main', 'end', 'End')],
      ['start-alt', unit('start-alt', 'start', 'Start')],
      ['choice-b', unit('choice-b', 'choice-b', 'Choice')],
      ['end-alt', unit('end-alt', 'end', 'End')],
    ]);
    const routes = [
      route('main', ['start-main', 'choice-a', 'end-main']),
      route('alternate', ['start-alt', 'choice-b', 'end-alt']),
    ];

    const layout = buildStorylineGraphLayout(routes, unitById);

    expect(layout.laneCount).toBe(2);
    expect(layout.columnCount).toBe(3);
    expect(layout.nodes).toHaveLength(4);
    expect(layout.nodes.find((node) => node.sourceNodeId === 'start')).toMatchObject({
      column: 0,
      lane: 0,
      isolated: false,
      routeIds: ['main', 'alternate'],
    });
    expect(layout.nodes.find((node) => node.sourceNodeId === 'choice-a')).toMatchObject({
      column: 1,
      lane: 0,
      routeIds: ['main'],
    });
    expect(layout.nodes.find((node) => node.sourceNodeId === 'choice-b')).toMatchObject({
      column: 1,
      lane: 1,
      routeIds: ['alternate'],
    });
    expect(layout.nodes.find((node) => node.sourceNodeId === 'end')).toMatchObject({
      column: 2,
      lane: 0,
      routeIds: ['main', 'alternate'],
    });
    expect(layout.edges.map((edge) => [edge.routeId, edge.sourceKey, edge.targetKey])).toEqual([
      ['main', 'start', 'choice-a'],
      ['main', 'choice-a', 'end'],
      ['alternate', 'start', 'choice-b'],
      ['alternate', 'choice-b', 'end'],
    ]);
  });

  it('marks disconnected single-node routes as isolated', () => {
    const unitById = new Map<string, CanvasPlaybackUnit>([
      ['first', unit('first', 'first-source', 'First')],
      ['second', unit('second', 'second-source', 'Second')],
    ]);

    const layout = buildStorylineGraphLayout(
      [route('first-route', ['first']), route('second-route', ['second'])],
      unitById,
    );

    expect(layout.edges).toEqual([]);
    expect(layout.nodes.map((node) => [node.sourceNodeId, node.isolated])).toEqual([
      ['first-source', true],
      ['second-source', true],
    ]);
  });

  it('keeps same-label nodes distinct when their source identities differ', () => {
    const unitById = new Map<string, CanvasPlaybackUnit>([
      ['left', unit('left', 'source-left', 'Choice')],
      ['right', unit('right', 'source-right', 'Choice')],
    ]);

    const layout = buildStorylineGraphLayout(
      [route('left-route', ['left']), route('right-route', ['right'])],
      unitById,
    );

    expect(layout.nodes).toHaveLength(2);
    expect(layout.nodes.map((node) => node.sourceNodeId)).toEqual(['source-left', 'source-right']);
  });

  it('classifies explicit route positions without inventing order for isolated nodes', () => {
    expect(resolveStorylineOrderPosition(0, 3, false)).toBe('start');
    expect(resolveStorylineOrderPosition(1, 3, false)).toBe('step');
    expect(resolveStorylineOrderPosition(2, 3, false)).toBe('end');
    expect(resolveStorylineOrderPosition(0, 1, false)).toBe('only');
    expect(resolveStorylineOrderPosition(0, 1, true)).toBe('unsequenced');
  });

  it('lays out multiple starts, branches and merges from a sequence graph draft', () => {
    const nodeIds = ['start-a', 'start-b', 'choice-a', 'choice-b', 'end'];
    const unitById = new Map<string, CanvasPlaybackUnit>(
      nodeIds.map((nodeId) => [nodeId, unit(nodeId, nodeId, nodeId)]),
    );
    const edges = [
      { sourceNodeId: 'start-a', targetNodeId: 'choice-a' },
      { sourceNodeId: 'start-a', targetNodeId: 'choice-b' },
      { sourceNodeId: 'start-b', targetNodeId: 'choice-b' },
      { sourceNodeId: 'choice-a', targetNodeId: 'end' },
      { sourceNodeId: 'choice-b', targetNodeId: 'end' },
    ];

    const layout = buildStorylineSequenceGraphLayout(nodeIds, edges, unitById);

    expect(layout.columnCount).toBe(3);
    expect(layout.laneCount).toBe(2);
    expect(layout.nodes).toHaveLength(5);
    expect(resolveStorylineGraphNodeRole('start-a', edges)).toBe('start-branch');
    expect(resolveStorylineGraphNodeRole('start-b', edges)).toBe('start');
    expect(resolveStorylineGraphNodeRole('choice-b', edges)).toBe('merge');
    expect(resolveStorylineGraphNodeRole('end', edges)).toBe('merge-end');
  });

  it('rejects cyclic sequence drafts before layout', () => {
    const unitById = new Map<string, CanvasPlaybackUnit>([
      ['a', unit('a', 'a', 'A')],
      ['b', unit('b', 'b', 'B')],
    ]);
    const forward = [{ sourceNodeId: 'a', targetNodeId: 'b' }];

    expect(
      wouldCreateStorylineSequenceCycle(forward, { sourceNodeId: 'b', targetNodeId: 'a' }),
    ).toBe(true);
    expect(() =>
      buildStorylineSequenceGraphLayout(
        ['a', 'b'],
        [...forward, { sourceNodeId: 'b', targetNodeId: 'a' }],
        unitById,
      ),
    ).toThrow(/cycle/);
  });

  it('lays out dense branching by graph size instead of enumerating route combinations', () => {
    const layers = Array.from({ length: 11 }, (_value, index) => [
      `layer-${index}-a`,
      `layer-${index}-b`,
    ]);
    const nodeIds = layers.flat();
    const unitById = new Map<string, CanvasPlaybackUnit>(
      nodeIds.map((nodeId) => [nodeId, unit(nodeId, nodeId, nodeId)]),
    );
    const edges = layers.slice(0, -1).flatMap((layer, index) => {
      const nextLayer = layers[index + 1] ?? [];
      return layer.flatMap((sourceNodeId) =>
        nextLayer.map((targetNodeId) => ({ sourceNodeId, targetNodeId })),
      );
    });

    const layout = buildStorylineSequenceGraphLayout(nodeIds, edges, unitById);

    expect(layout.nodes).toHaveLength(22);
    expect(layout.edges).toHaveLength(40);
    expect(layout.columnCount).toBe(11);
    expect(layout.laneCount).toBe(2);
  });

  it('moves one same-level branch and keeps outgoing edge priority aligned with node order', () => {
    const graph = {
      nodeIds: ['start', 'left', 'right', 'end'],
      edges: [
        { sourceNodeId: 'start', targetNodeId: 'left' },
        { sourceNodeId: 'start', targetNodeId: 'right' },
        { sourceNodeId: 'left', targetNodeId: 'end' },
        { sourceNodeId: 'right', targetNodeId: 'end' },
      ],
    };

    const moved = moveStorylineGraphNode(graph, 'right', 'left', 'before');

    expect(moved.nodeIds).toEqual(['start', 'right', 'left', 'end']);
    expect(moved.edges.slice(0, 2)).toEqual([
      { sourceNodeId: 'start', targetNodeId: 'right' },
      { sourceNodeId: 'start', targetNodeId: 'left' },
    ]);
    const unitById = new Map<string, CanvasPlaybackUnit>(
      moved.nodeIds.map((nodeId) => [nodeId, unit(nodeId, nodeId, nodeId)]),
    );
    const layout = buildStorylineSequenceGraphLayout(moved.nodeIds, moved.edges, unitById);
    expect(layout.nodes.find((node) => node.sourceNodeId === 'right')?.lane).toBe(0);
    expect(layout.nodes.find((node) => node.sourceNodeId === 'left')?.lane).toBe(1);
  });
});

function unit(id: string, sourceNodeId: string, label: string): CanvasPlaybackUnit {
  return {
    id,
    sourceNodeId,
    label,
    kind: 'media',
    renderMode: 'media-playback',
    assetPath: `/fixture/${id}.mp4`,
  };
}

function route(id: string, unitIds: readonly string[]): CanvasPlaybackRouteCandidate {
  return {
    id,
    title: id,
    entryUnitId: unitIds[0] ?? '',
    unitIds,
    sourceKind: 'entry',
  };
}
