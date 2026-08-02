import { describe, expect, it } from 'vitest';
import type { CanvasPlaybackRouteCandidate, CanvasPlaybackUnit } from '@neko/canvas-domain';
import { buildStorylineGraphLayout } from './storylineGraphLayout';

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
