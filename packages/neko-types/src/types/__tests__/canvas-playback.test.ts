import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasData, CanvasNode } from '../canvas';
import {
  createCanvasPlaybackPlan,
  normalizeCanvasPlaybackMetadata,
  resolveEffectiveCanvasPlaybackRoutes,
  sortCanvasPlaybackConnections,
  sortCanvasPlaybackContainerChildren,
} from '../canvas-playback';

function markdown(id: string, parentId?: string): CanvasNode {
  return {
    id,
    type: 'markdown',
    ...(parentId ? { parentId } : {}),
    position: { x: 0, y: 0 },
    size: { width: 280, height: 180 },
    zIndex: 1,
    data: { content: `# ${id}`, title: id },
  };
}

function media(id: string, parentId?: string): CanvasNode {
  return {
    id,
    type: 'media',
    ...(parentId ? { parentId } : {}),
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data: { assetPath: `media/${id}.mp4`, mediaType: 'video', duration: 3 },
  };
}

function group(id: string, childIds: string[]): CanvasNode {
  return {
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    size: { width: 640, height: 420 },
    zIndex: 0,
    container: { policy: 'group', childIds, layout: { mode: 'manual' } },
    data: { label: id },
  };
}

function connection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasConnection['type'] = 'sequence',
): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    type,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
  };
}

function canvas(nodes: CanvasNode[], connections: CanvasConnection[] = []): CanvasData {
  return { version: '3.0', name: 'Playback', nodes, connections };
}

describe('canonical Canvas playback', () => {
  it('normalizes generic metadata and ignores unknown adapter values', () => {
    const data = canvas([markdown('a')]);
    data.playback = {
      version: 1,
      adapterId: 'generic',
      mode: 'linear',
      entryIds: ['a'],
      nodeOverrides: { a: { order: 2, durationMs: 1000 } },
      edgeOverrides: { edge: { enabled: false, order: 1 } },
    };

    expect(normalizeCanvasPlaybackMetadata(data)).toEqual(data.playback);
  });

  it('sorts Group children and sequence edges using explicit overrides', () => {
    const container = group('group', ['b', 'a']);
    const nodes = [container, markdown('a', 'group'), media('b', 'group')];
    const data = canvas(nodes);
    data.playback = {
      version: 1,
      nodeOverrides: { a: { order: 0 } },
      edgeOverrides: { second: { order: 0 } },
    };
    const metadata = normalizeCanvasPlaybackMetadata(data);

    expect(
      sortCanvasPlaybackContainerChildren(container, nodes, metadata).map((node) => node.id),
    ).toEqual(['a', 'b']);
    expect(
      sortCanvasPlaybackConnections(
        [
          connection('first', 'a', 'b'),
          connection('reference', 'b', 'a', 'reference'),
          connection('second', 'b', 'a'),
        ],
        metadata,
      ).map((edge) => edge.id),
    ).toEqual(['second', 'first']);
  });

  it('projects Markdown and Media through Group child order', () => {
    const data = canvas([
      group('group', ['note', 'clip']),
      markdown('note', 'group'),
      media('clip', 'group'),
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.adapterId).toBe('generic');
    expect(plan.units.map((unit) => [unit.sourceNodeId, unit.kind])).toEqual([
      ['note', 'node'],
      ['clip', 'media'],
    ]);
    expect(plan.transitions).toHaveLength(1);
    expect(plan.units[1]?.terminal).toBe(true);
    expect(resolveEffectiveCanvasPlaybackRoutes(plan).routes[0]?.unitIds).toEqual(['note', 'clip']);
  });

  it('uses sequence edges to order otherwise independent content', () => {
    const data = canvas(
      [markdown('second'), markdown('first')],
      [connection('next', 'first', 'second')],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.units.map((unit) => unit.id)).toEqual(['first', 'second']);
    expect(plan.transitions[0]?.sourceConnectionId).toBe('next');
  });

  it('reports sequence cycles and keeps deterministic child order', () => {
    const data = canvas(
      [markdown('a'), markdown('b')],
      [connection('a-b', 'a', 'b'), connection('b-a', 'b', 'a')],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.units.map((unit) => unit.id)).toEqual(['a', 'b']);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'playback-route-cycle' })]),
    );
  });

  it('does not project Job, File, CanvasEmbed, or empty Group as playable units', () => {
    const data = canvas([
      group('group', []),
      {
        id: 'job',
        type: 'job',
        position: { x: 0, y: 0 },
        size: { width: 300, height: 180 },
        zIndex: 1,
        data: {
          jobId: 'job',
          revision: 1,
          title: 'Job',
          status: 'draft',
          inputRefs: [],
          outputRefs: [],
        },
      },
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.units).toEqual([]);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'playback-missing-route' })]),
    );
  });
});
