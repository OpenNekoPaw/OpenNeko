import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasData, CanvasNode, MediaCanvasNode } from '../canvas';
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

function media(id: string, parentId?: string): MediaCanvasNode {
  return {
    id,
    type: 'media',
    ...(parentId ? { parentId } : {}),
    position: { x: 0, y: 0 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data: {
      assetPath: `media/${id}.mp4`,
      contentLocator: { kind: 'workspace-file', path: `media/${id}.mp4` },
      mediaType: 'video',
      duration: 3,
    },
  };
}

function group(
  id: string,
  childIds: string[],
  layoutMode: 'manual' | 'sequence' = 'manual',
): CanvasNode {
  return {
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    size: { width: 640, height: 420 },
    zIndex: 0,
    container: { policy: 'group', childIds, layout: { mode: layoutMode } },
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
  return { name: 'Playback', nodes, connections };
}

describe('canonical Canvas playback', () => {
  it('normalizes generic metadata and ignores unknown adapter values', () => {
    const data = canvas([markdown('a')]);
    data.playback = {
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

  it('does not treat ordinary Group child order as a sequence', () => {
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
    expect(plan.transitions).toEqual([]);
    expect(resolveEffectiveCanvasPlaybackRoutes(plan).routes.map((route) => route.unitIds)).toEqual(
      [['note'], ['clip']],
    );
  });

  it('projects explicit sequence Group child order', () => {
    const data = canvas([
      group('group', ['note', 'clip'], 'sequence'),
      markdown('note', 'group'),
      media('clip', 'group'),
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.transitions).toEqual([
      expect.objectContaining({ sourceUnitId: 'note', targetUnitId: 'clip' }),
    ]);
    expect(resolveEffectiveCanvasPlaybackRoutes(plan).routes.map((route) => route.unitIds)).toEqual(
      [['note', 'clip']],
    );
  });

  it('uses explicit sequence edges without reordering the unit catalog', () => {
    const data = canvas(
      [markdown('second'), markdown('first')],
      [connection('next', 'first', 'second')],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.units.map((unit) => unit.id)).toEqual(['second', 'first']);
    expect(plan.transitions[0]?.sourceConnectionId).toBe('next');
    expect(plan.routeCandidates.map((route) => route.unitIds)).toEqual([['first', 'second']]);
  });

  it('reports sequence cycles without synthesizing fallback transitions', () => {
    const data = canvas(
      [markdown('a'), markdown('b')],
      [connection('a-b', 'a', 'b'), connection('b-a', 'b', 'a')],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.transitions).toEqual([
      expect.objectContaining({ sourceUnitId: 'a', targetUnitId: 'b' }),
      expect.objectContaining({ sourceUnitId: 'b', targetUnitId: 'a' }),
    ]);
    expect(plan.routeCandidates).toEqual([]);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'playback-route-cycle' })]),
    );
  });

  it('keeps disconnected playable nodes isolated and selection-independent', () => {
    const data = canvas([media('video'), media('audio'), media('image')]);

    const unselected = createCanvasPlaybackPlan({ canvas: data });
    const selected = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'audio' });

    expect(unselected.transitions).toEqual([]);
    expect(unselected.routeCandidates.map((route) => route.unitIds)).toEqual([
      ['video'],
      ['audio'],
      ['image'],
    ]);
    expect(selected.transitions).toEqual([]);
    expect(selected.routeCandidates.map((route) => route.unitIds)).toEqual([
      ['audio'],
      ['video'],
      ['image'],
    ]);
    expect(selected.routeCandidates.flatMap((route) => route.unitIds).sort()).toEqual(
      unselected.routeCandidates.flatMap((route) => route.unitIds).sort(),
    );
  });

  it('reports a path-only media node as missing canonical content identity', () => {
    const pathOnly = media('path-only');
    pathOnly.data.contentLocator = undefined;

    const plan = createCanvasPlaybackPlan({ canvas: canvas([pathOnly]) });

    expect(plan.units[0]).toMatchObject({
      id: 'path-only',
      assetPath: 'media/path-only.mp4',
    });
    expect(plan.units[0]).not.toHaveProperty('contentLocator');
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'playback-missing-media-source',
          nodeId: 'path-only',
          message: 'Media node "path-only" has no canonical ContentLocator.',
        }),
      ]),
    );
  });

  it('keeps independent sequences separate', () => {
    const data = canvas(
      [markdown('a'), markdown('b'), markdown('c'), markdown('d')],
      [connection('a-b', 'a', 'b'), connection('c-d', 'c', 'd')],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.routeCandidates.map((route) => route.unitIds)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(plan.transitions.map((transition) => transition.sourceConnectionId)).toEqual([
      'a-b',
      'c-d',
    ]);
  });

  it('derives authored branch and merge routes without cross-branch edges', () => {
    const data = canvas(
      [markdown('a'), markdown('b'), markdown('c'), markdown('d')],
      [
        connection('a-b', 'a', 'b'),
        connection('a-c', 'a', 'c'),
        connection('b-d', 'b', 'd'),
        connection('c-d', 'c', 'd'),
      ],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data });

    expect(plan.routeCandidates.map((route) => route.unitIds)).toEqual([
      ['a', 'b', 'd'],
      ['a', 'c', 'd'],
    ]);
    expect(
      plan.transitions.map((transition) => [transition.sourceUnitId, transition.targetUnitId]),
    ).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
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
          jobRef: { kind: 'generation', jobId: 'job' },
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
