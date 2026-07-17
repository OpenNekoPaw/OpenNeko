import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasData, CanvasNode } from '../canvas';
import {
  createCanvasPlaybackPlan,
  getCanvasPlaybackEdgeOverride,
  getCanvasPlaybackNodeOverride,
  normalizeCanvasPlaybackMetadata,
  resolveEffectiveCanvasPlaybackRoutes,
  sortCanvasPlaybackConnections,
  sortCanvasPlaybackContainerChildren,
} from '../canvas-playback';

function baseNode(
  id: string,
  type: CanvasNode['type'],
  extra: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data: {},
    ...extra,
  } as CanvasNode;
}

function scene(id: string, childIds: readonly string[] = [], sceneNumber = 1): CanvasNode {
  return baseNode(id, 'scene', {
    container: { policy: 'scene', childIds: [...childIds], layout: { mode: 'sequence' } },
    data: { sceneTitle: id, sceneNumber },
  });
}

function shot(id: string, shotNumber: number, parentId?: string): CanvasNode {
  return baseNode(id, 'shot', {
    parentId,
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
  });
}

function media(id: string, assetPath: string): CanvasNode {
  return baseNode(id, 'media', {
    data: { assetPath, mediaType: 'video' },
  });
}

function connection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasConnection['type'] = 'sequence',
  extra: Partial<CanvasConnection> = {},
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

function canvas(
  nodes: readonly CanvasNode[],
  connections: readonly CanvasConnection[] = [],
): CanvasData {
  return {
    version: '2.1',
    name: 'Playback Fixture',
    nodes: [...nodes],
    connections: [...connections],
  };
}

describe('canvas playback contracts', () => {
  it('normalizes optional canvas, node, and connection playback metadata', () => {
    const data = canvas([baseNode('a', 'annotation')]);
    data.playback = {
      version: 1,
      adapterId: 'storyboard',
      mode: 'interactive',
      entryIds: ['scene-a'],
      nodeOverrides: { 'scene-a': { role: 'start', order: 2 } },
      edgeOverrides: { edge: { branchLabel: 'Go', order: 1 } },
    };
    data.nodes[0] = {
      ...data.nodes[0]!,
      extension: { playback: { order: 0, expand: 'children' } },
    };
    const edge = connection('edge', 'a', 'b', 'choice', {
      extension: { playback: { enabled: false } },
    });

    const metadata = normalizeCanvasPlaybackMetadata(data);

    expect(metadata).toMatchObject({
      adapterId: 'storyboard',
      mode: 'interactive',
      entryIds: ['scene-a'],
    });
    expect(getCanvasPlaybackNodeOverride(metadata, data.nodes[0]!)).toEqual({
      order: 0,
      expand: 'children',
    });
    expect(getCanvasPlaybackEdgeOverride(metadata, edge)).toMatchObject({
      branchLabel: 'Go',
      order: 1,
      enabled: false,
    });
  });

  it('sorts container children and playable connections deterministically', () => {
    const s = scene('scene', ['b', 'a', 'c']);
    const a = shot('a', 3, 'scene');
    const b = shot('b', 2, 'scene');
    const c = shot('c', 1, 'scene');
    const data = canvas([s, a, b, c]);
    data.playback = {
      version: 1,
      nodeOverrides: { c: { order: 0 } },
      edgeOverrides: { second: { order: 0 } },
    };
    const metadata = normalizeCanvasPlaybackMetadata(data);
    const edges = [
      connection('first', 'a', 'b', 'choice', { priority: 1 }),
      connection('reference', 'a', 'c', 'reference', { priority: -1 }),
      connection('second', 'a', 'c', 'choice', { priority: 5 }),
    ];

    expect(
      sortCanvasPlaybackContainerChildren(s, data.nodes, metadata).map((node) => node.id),
    ).toEqual(['c', 'b', 'a']);
    expect(sortCanvasPlaybackConnections(edges, metadata).map((edge) => edge.id)).toEqual([
      'second',
      'first',
    ]);
  });

  it('projects storyboard scene and shot playback with scene-to-scene continuation', () => {
    const firstScene = scene('scene-a', ['shot-a1', 'shot-a2'], 1);
    const secondScene = scene('scene-b', ['shot-b1'], 2);
    const data = canvas(
      [
        firstScene,
        shot('shot-a1', 1, 'scene-a'),
        shot('shot-a2', 2, 'scene-a'),
        secondScene,
        shot('shot-b1', 1, 'scene-b'),
      ],
      [connection('next-scene', 'scene-a', 'scene-b', 'sequence')],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'scene-a' });

    expect(plan.adapterId).toBe('storyboard');
    expect(plan.entryUnitIds).toEqual(['shot-a1']);
    expect(plan.units.map((unit) => unit.id)).toEqual(['shot-a1', 'shot-a2', 'shot-b1']);
    expect(plan.units[0]).toMatchObject({
      durationMs: 3000,
      metadata: expect.objectContaining({
        shotNumber: 1,
        duration: 3,
        visualDescription: 'shot-a1',
        shotScale: 'MS',
      }),
    });
    expect(
      plan.transitions.map((transition) => [transition.sourceUnitId, transition.targetUnitId]),
    ).toEqual([
      ['shot-a1', 'shot-a2'],
      ['shot-a2', 'shot-b1'],
    ]);
    expect(plan.routeCandidates).toEqual([
      expect.objectContaining({
        id: 'auto-entry:shot-a1',
        sourceKind: 'auto-entry',
        entryUnitId: 'shot-a1',
        unitIds: ['shot-a1', 'shot-a2', 'shot-b1'],
      }),
      expect.objectContaining({
        id: 'selection:shot-a1',
        sourceKind: 'selection',
        entryUnitId: 'shot-a1',
        unitIds: ['shot-a1', 'shot-a2', 'shot-b1'],
      }),
      expect.objectContaining({
        id: 'scene:scene-b',
        sourceKind: 'scene',
        entryUnitId: 'shot-b1',
        unitIds: ['shot-b1'],
      }),
    ]);
  });

  it('supports explicit adapter overrides in mixed graphs', () => {
    const data = canvas([
      scene('scene-a', ['shot-a']),
      shot('shot-a', 1, 'scene-a'),
      baseNode('start', 'narrative-start'),
      baseNode('narrative-scene', 'narrative-scene'),
    ]);

    const autoPlan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'scene-a' });
    const narrativePlan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'narrative' });

    expect(autoPlan.adapterId).toBe('storyboard');
    expect(autoPlan.units.map((unit) => unit.id)).toEqual(['shot-a']);
    expect(narrativePlan.adapterId).toBe('narrative');
    expect(narrativePlan.units.map((unit) => unit.id)).toEqual(['start', 'narrative-scene']);
  });

  it('generates route candidates for explicit entries and disconnected components', () => {
    const data = canvas(
      [
        media('media-a', 'assets/a.mp4'),
        media('media-b', 'assets/b.mp4'),
        media('media-c', 'assets/c.mp4'),
      ],
      [connection('a-b', 'media-a', 'media-b', 'sequence')],
    );
    data.playback = {
      version: 1,
      adapterId: 'media-sequence',
      entryIds: ['media-c'],
    };

    const plan = createCanvasPlaybackPlan({ canvas: data });
    const routeResolution = resolveEffectiveCanvasPlaybackRoutes(plan);

    expect(plan.routeCandidates?.map((route) => [route.id, route.sourceKind])).toEqual([
      ['entry:media-c', 'entry'],
      ['component:media-a', 'component'],
    ]);
    expect(routeResolution.routes.map((route) => route.id)).toEqual([
      'entry:media-c',
      'component:media-a',
    ]);
  });

  it('uses explicit scene playback entries as the main storyboard route start', () => {
    const data = canvas([
      scene('scene-a', ['shot-a1'], 1),
      shot('shot-a1', 1, 'scene-a'),
      scene('scene-b', ['shot-b1'], 2),
      shot('shot-b1', 1, 'scene-b'),
    ]);
    data.playback = {
      version: 1,
      entryIds: ['scene-b'],
    };

    const plan = createCanvasPlaybackPlan({ canvas: data });
    const routeResolution = resolveEffectiveCanvasPlaybackRoutes(plan);

    expect(plan.entryUnitIds).toEqual(['shot-b1']);
    expect(routeResolution.routes[0]).toMatchObject({
      id: 'entry:shot-b1',
      sourceKind: 'entry',
      entryUnitId: 'shot-b1',
      unitIds: ['shot-b1'],
    });
  });

  it('keeps selected container routes available without overriding the main route', () => {
    const data = canvas([
      scene('scene-a', ['shot-a1', 'shot-a2'], 1),
      shot('shot-a1', 1, 'scene-a'),
      shot('shot-a2', 2, 'scene-a'),
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'scene-a' });
    const routeResolution = resolveEffectiveCanvasPlaybackRoutes(plan);

    expect(routeResolution.routes[0]).toMatchObject({
      id: 'auto-entry:shot-a1',
      sourceKind: 'auto-entry',
      entryUnitId: 'shot-a1',
      unitIds: ['shot-a1', 'shot-a2'],
    });
    expect(routeResolution.routes[1]).toMatchObject({
      id: 'selection:shot-a1',
      title: 'scene-a',
      sourceKind: 'selection',
      sourceNodeId: 'scene-a',
      entryUnitId: 'shot-a1',
      unitIds: ['shot-a1', 'shot-a2'],
    });
  });

  it('generates a single-unit route for a selected playable node', () => {
    const data = canvas([shot('shot-a', 1)]);

    const plan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'shot-a' });

    expect(plan.routeCandidates?.map((route) => [route.id, route.sourceKind])).toEqual([
      ['auto-entry:shot-a', 'auto-entry'],
      ['selection:shot-a', 'selection'],
    ]);
    expect(resolveEffectiveCanvasPlaybackRoutes(plan).routes[0]).toMatchObject({
      entryUnitId: 'shot-a',
      unitIds: ['shot-a'],
    });
  });

  it('projects generic containers and node connections without mutating canvas data', () => {
    const group = baseNode('group', 'group', {
      container: {
        policy: 'group',
        childIds: ['note-a', 'note-b'],
        layout: { mode: 'manual' },
      },
      extension: { playback: { expand: 'children' } },
      data: { label: 'Group' },
    });
    const noteA = baseNode('note-a', 'annotation', {
      parentId: 'group',
      data: { content: 'A' },
    });
    const noteB = baseNode('note-b', 'annotation', {
      parentId: 'group',
      data: { content: 'B' },
    });
    const data = canvas(
      [group, noteA, noteB],
      [connection('branch', 'note-a', 'note-b', 'choice', { choiceText: 'Continue' })],
    );
    const before = JSON.stringify(data);

    const plan = createCanvasPlaybackPlan({
      canvas: data,
      selectedNodeId: 'group',
      adapterId: 'generic',
    });

    expect(plan.units.map((unit) => unit.id)).toEqual(['note-a', 'note-b']);
    expect(plan.transitions).toEqual([
      expect.objectContaining({
        id: 'branch',
        sourceUnitId: 'note-a',
        targetUnitId: 'note-b',
        type: 'choice',
        label: 'Continue',
      }),
    ]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('keeps narrative runtime boundaries separate from scene and shot nodes', () => {
    const data = canvas([scene('scene-a', ['shot-a']), shot('shot-a', 1, 'scene-a')]);

    const narrativePlan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'narrative' });
    const storyboardPlan = createCanvasPlaybackPlan({ canvas: data });

    expect(narrativePlan.units).toEqual([]);
    expect(narrativePlan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'playback-narrative-runtime-only',
    );
    expect(storyboardPlan.adapterId).toBe('storyboard');
    expect(storyboardPlan.units.map((unit) => unit.kind)).toEqual(['shot']);
  });

  it('derives preview media refs from narrative generated-video production bindings', () => {
    const generatedVideoResource = {
      id: 'generated-video-1',
      scope: 'project' as const,
      provider: 'generated',
      kind: 'generated' as const,
      source: {
        kind: 'generated-asset' as const,
        generatedAssetId: 'generated-video-1',
      },
      fingerprint: { strategy: 'provider' as const, value: 'generated-video-1' },
    };
    const data = canvas([
      baseNode('start', 'narrative-start'),
      baseNode('scene-a', 'narrative-scene', {
        data: {
          title: 'Interactive clip',
          productionRefs: [
            {
              bindingId: 'bind-video-1',
              role: 'primary',
              target: {
                kind: 'generated-video',
                ref: {
                  kind: 'generated-asset',
                  assetId: 'generated-video-1',
                  resourceRef: generatedVideoResource,
                },
              },
            },
          ],
        },
      }),
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'narrative' });
    expect(plan.units.find((unit) => unit.id === 'scene-a')).toMatchObject({
      resourceRef: generatedVideoResource,
      metadata: {
        previewMediaType: 'video',
        productionBindingId: 'bind-video-1',
        productionTargetKind: 'generated-video',
      },
    });
  });

  it('copies durable playback metadata while excluding runtime-only preview resources', () => {
    const data = canvas([
      scene('scene-a', ['shot-a']),
      {
        ...shot('shot-a', 1, 'scene-a'),
        data: {
          ...shot('shot-a', 1, 'scene-a').data,
          visualDescription: 'Durable storyboard summary',
          referenceImagePath: 'assets/ref.png',
          sourceMediaRefs: [
            {
              refId: 'source-panel-1',
              role: 'source',
              locator: { type: 'workspace-path', path: 'assets/source-panel.png' },
              mimeType: 'image/png',
            },
          ],
          runtimeReferenceImagePath: 'blob:runtime-reference',
          previewSessionId: 'session-runtime',
          activeRouteId: 'route-runtime',
          branchSelections: { 'shot-a': 'choice-b' },
          routeCandidates: [{ id: 'runtime-route' }],
          mediaHandles: ['handle-runtime'],
          activeMediaSurfaceId: 'surface-runtime',
          generatedImage: 'blob:runtime-image',
          generatedVideoAsset: {
            id: 'video-1',
            path: 'assets/shot-a.mp4',
            runtimeUrl: 'blob:runtime-video',
          },
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'data:image/png;base64,runtime',
              prompt: 'keep prompt',
              timestamp: 1,
              selected: true,
            },
          ],
        },
      } as CanvasNode,
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'scene-a' });
    const unit = plan.units[0];
    const metadata = unit?.metadata as Record<string, unknown> | undefined;

    expect(unit).toMatchObject({
      id: 'shot-a',
      durationMs: 3000,
    });
    expect(metadata).toMatchObject({
      visualDescription: 'Durable storyboard summary',
      referenceImagePath: 'assets/ref.png',
      sourceMediaRefs: [
        expect.objectContaining({
          refId: 'source-panel-1',
          locator: { type: 'workspace-path', path: 'assets/source-panel.png' },
        }),
      ],
      generatedVideoAsset: expect.objectContaining({ path: 'assets/shot-a.mp4' }),
      generationHistory: [expect.objectContaining({ prompt: 'keep prompt' })],
    });
    expect(JSON.stringify(unit)).not.toContain('blob:runtime');
    expect(JSON.stringify(unit)).not.toContain('data:image/png');
    expect(JSON.stringify(unit)).not.toContain('runtimeReferenceImagePath');
    expect(JSON.stringify(unit)).not.toContain('session-runtime');
    expect(JSON.stringify(unit)).not.toContain('route-runtime');
    expect(JSON.stringify(unit)).not.toContain('choice-b');
    expect(JSON.stringify(unit)).not.toContain('handle-runtime');
  });

  it('does not persist runtime URLs in media playback units', () => {
    const data = canvas([
      media('media-a', 'assets/a.mp4'),
      {
        ...media('media-b', ''),
        data: {
          assetPath: '',
          mediaType: 'video',
          runtimeAssetPath: 'blob:vscode-runtime-url',
        },
      } as CanvasNode,
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'media-sequence' });

    expect(plan.advancePolicy).toBe('media-ended');
    expect(plan.units.find((unit) => unit.id === 'media-a')).toMatchObject({
      assetPath: 'assets/a.mp4',
    });
    expect(JSON.stringify(plan)).not.toContain('blob:vscode-runtime-url');
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'playback-missing-media-source',
    );
  });

  it('resolves explicit route candidates before legacy entry routes', () => {
    const plan = {
      ...createCanvasPlaybackPlan({
        canvas: canvas(
          [media('media-a', 'assets/a.mp4'), media('media-b', 'assets/b.mp4')],
          [connection('media-link', 'media-a', 'media-b', 'sequence')],
        ),
        adapterId: 'media-sequence',
      }),
      routeCandidates: [
        {
          id: 'route-b',
          title: 'Route B',
          entryUnitId: 'media-b',
          unitIds: ['media-b'],
          sourceKind: 'entry' as const,
          sourceNodeId: 'media-b',
        },
      ],
    };

    const resolution = resolveEffectiveCanvasPlaybackRoutes(plan);

    expect(resolution.routes).toEqual([
      expect.objectContaining({
        id: 'route-b',
        entryUnitId: 'media-b',
        unitIds: ['media-b'],
      }),
    ]);
    expect(resolution.diagnostics).toEqual([]);
  });

  it('diagnoses explicitly empty route candidates', () => {
    const plan = {
      ...createCanvasPlaybackPlan({ canvas: canvas([media('media-a', 'assets/a.mp4')]) }),
      routeCandidates: [],
    };

    const resolution = resolveEffectiveCanvasPlaybackRoutes(plan);

    expect(resolution.routes).toEqual([]);
    expect(resolution.diagnostics).toEqual([
      expect.objectContaining({
        code: 'playback-missing-route',
        severity: 'warning',
      }),
    ]);
  });

  it('reports a diagnostic when default route traversal reaches a cycle', () => {
    const plan = createCanvasPlaybackPlan({
      canvas: canvas(
        [media('media-a', 'assets/a.mp4'), media('media-b', 'assets/b.mp4')],
        [
          connection('media-a-b', 'media-a', 'media-b', 'sequence'),
          connection('media-b-a', 'media-b', 'media-a', 'sequence'),
        ],
      ),
      adapterId: 'media-sequence',
    });

    const resolution = resolveEffectiveCanvasPlaybackRoutes(plan);

    expect(resolution.routes[0]).toMatchObject({
      id: 'auto-entry:media-a',
      entryUnitId: 'media-a',
      unitIds: ['media-a', 'media-b'],
    });
    expect(resolution.diagnostics).toEqual([
      expect.objectContaining({
        code: 'playback-route-cycle',
        severity: 'warning',
      }),
    ]);
  });

  it('sorts route candidates deterministically and filters invalid routes', () => {
    const basePlan = createCanvasPlaybackPlan({
      canvas: canvas([media('media-a', 'assets/a.mp4'), media('media-b', 'assets/b.mp4')]),
      adapterId: 'media-sequence',
    });
    const plan = {
      ...basePlan,
      routeCandidates: [
        {
          id: 'single',
          title: 'Single',
          entryUnitId: 'media-b',
          unitIds: ['media-b'],
          sourceKind: 'single-unit' as const,
        },
        {
          id: 'selection',
          title: 'Selection',
          entryUnitId: 'media-a',
          unitIds: ['media-a'],
          sourceKind: 'selection' as const,
        },
        {
          id: 'missing',
          title: 'Missing',
          entryUnitId: 'missing',
          unitIds: ['missing'],
          sourceKind: 'entry' as const,
        },
      ],
    };

    const resolution = resolveEffectiveCanvasPlaybackRoutes(plan);

    expect(resolution.routes.map((route) => route.id)).toEqual(['selection', 'single']);
    expect(resolution.diagnostics).toEqual([
      expect.objectContaining({ code: 'playback-missing-entry' }),
      expect.objectContaining({ code: 'playback-missing-unit' }),
    ]);
  });

  it('caps route candidates and reports truncation diagnostics', () => {
    const data = canvas(
      Array.from({ length: 4 }, (_, index) => media(`media-${index + 1}`, `assets/${index}.mp4`)),
    );
    const basePlan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'media-sequence' });
    const plan = {
      ...basePlan,
      routeCandidates: basePlan.units.map((unit) => ({
        id: `route:${unit.id}`,
        title: unit.id,
        entryUnitId: unit.id,
        unitIds: [unit.id],
        sourceKind: 'component' as const,
        sourceNodeId: unit.sourceNodeId,
      })),
    };

    const resolution = resolveEffectiveCanvasPlaybackRoutes(plan, { maxRoutes: 2 });

    expect(resolution.routes).toHaveLength(2);
    expect(resolution.routes.map((route) => route.id)).toEqual(['route:media-1', 'route:media-2']);
    expect(resolution.diagnostics).toEqual([
      expect.objectContaining({
        code: 'playback-route-truncated',
        severity: 'info',
      }),
    ]);
  });

  it('caps generated route candidates after deterministic ordering', () => {
    const data = canvas(
      Array.from({ length: 4 }, (_, index) =>
        baseNode(`note-${index + 1}`, 'annotation', {
          data: { label: `Note ${index + 1}` },
        }),
      ),
    );

    const plan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'generic' });
    const resolution = resolveEffectiveCanvasPlaybackRoutes(plan, { maxRoutes: 2 });

    expect(plan.routeCandidates?.map((route) => route.id)).toEqual([
      'auto-entry:note-1',
      'component:note-2',
      'component:note-3',
      'component:note-4',
    ]);
    expect(resolution.routes.map((route) => route.id)).toEqual([
      'auto-entry:note-1',
      'component:note-2',
    ]);
    expect(resolution.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'playback-route-truncated',
    );
  });
});
