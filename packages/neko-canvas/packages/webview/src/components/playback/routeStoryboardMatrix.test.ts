import { describe, expect, it } from 'vitest';
import type {
  CanvasData,
  CanvasNode,
  CanvasPlaybackPlan,
  CanvasPlaybackRouteCandidate,
  CanvasPlaybackUnit,
} from '@neko/shared';
import { projectRouteStoryboardMatrix } from './routeStoryboardMatrix';

describe('projectRouteStoryboardMatrix', () => {
  it('reports an empty plan as a matrix diagnostic without inventing rows or columns', () => {
    const matrix = projectRouteStoryboardMatrix({
      plan: playbackPlan({
        units: [],
        routeCandidates: [],
      }),
    });

    expect(matrix.rows).toEqual([]);
    expect(matrix.columns).toEqual([]);
    expect(matrix.diagnostics).toContainEqual({
      code: 'matrix-missing-route',
      severity: 'warning',
      message: 'Canvas playback plan has no route candidates for the storyboard matrix.',
    });
  });

  it('groups routes by family, folds duplicate candidates, and exposes all candidates explicitly', () => {
    const plan = playbackPlan({
      units: [
        unit('shot-a', { label: 'Opening' }),
        unit('shot-b', { label: 'Branch B' }),
        unit('shot-c', { label: 'Branch C' }),
      ],
      routeCandidates: [
        route('entry:shot-a', ['shot-a', 'shot-b'], { sourceKind: 'entry' }),
        route('auto-entry:shot-a', ['shot-a', 'shot-b'], { sourceKind: 'auto-entry' }),
        route('component:shot-a', ['shot-a', 'shot-c'], { sourceKind: 'component' }),
        route('selection:shot-a', ['shot-a', 'shot-b'], { sourceKind: 'selection' }),
      ],
    });

    const matrix = projectRouteStoryboardMatrix({ plan });
    const primary = matrix.families.find((family) => family.id === 'family:primary');

    expect(primary?.routeIds).toEqual(['entry:shot-a', 'auto-entry:shot-a', 'component:shot-a']);
    expect(primary?.visibleRouteIds).toEqual(['entry:shot-a', 'component:shot-a']);
    expect(primary?.foldedRouteIds).toEqual(['auto-entry:shot-a']);
    expect(matrix.rows.map((row) => row.routeId)).toEqual(['entry:shot-a', 'component:shot-a']);

    const allCandidates = projectRouteStoryboardMatrix({ plan, showAllCandidates: true });

    expect(new Set(allCandidates.rows.map((row) => row.routeId))).toEqual(
      new Set(['entry:shot-a', 'auto-entry:shot-a', 'component:shot-a', 'selection:shot-a']),
    );
  });

  it('aligns columns by container boundary and stable source node identity', () => {
    const canvas = storyboardCanvas([
      scene('scene-a', ['shot-a', 'shot-b', 'shot-c']),
      shot('shot-a', 1, 'scene-a'),
      shot('shot-b', 2, 'scene-a'),
      shot('shot-c', 3, 'scene-a'),
      scene('scene-b', ['shot-x']),
      shot('shot-x', 1, 'scene-b'),
    ]);
    const plan = playbackPlan({
      units: [
        unit('unit-a', { sourceNodeId: 'shot-a', label: 'A' }),
        unit('unit-b', { sourceNodeId: 'shot-b', label: 'B' }),
        unit('unit-c', { sourceNodeId: 'shot-c', label: 'C' }),
        unit('unit-x', { sourceNodeId: 'shot-x', label: 'X' }),
      ],
      routeCandidates: [
        route('route-left', ['unit-a', 'unit-b', 'unit-x']),
        route('route-right', ['unit-a', 'unit-c', 'unit-x']),
      ],
    });

    const matrix = projectRouteStoryboardMatrix({ plan, canvas });

    expect(matrix.containerGroups.map((group) => group.containerNodeId)).toEqual([
      'scene-a',
      'scene-b',
    ]);
    expect(
      matrix.columns.map((column) => ({
        container: column.containerId,
        identity: column.stableIdentity,
      })),
    ).toEqual([
      { container: 'container:scene-a', identity: 'shot-a' },
      { container: 'container:scene-a', identity: 'shot-b' },
      { container: 'container:scene-a', identity: 'shot-c' },
      { container: 'container:scene-b', identity: 'shot-x' },
    ]);

    const leftCells = matrix.rows[0]?.cells;
    const rightCells = matrix.rows[1]?.cells;

    expect(leftCells?.map((cell) => cell.kind)).toEqual([
      'playable',
      'playable',
      'empty',
      'playable',
    ]);
    expect(rightCells?.map((cell) => cell.kind)).toEqual([
      'playable',
      'empty',
      'playable',
      'playable',
    ]);
    expect(leftCells?.[2]).toMatchObject({
      kind: 'empty',
      containerId: 'container:scene-a',
      stableIdentity: 'shot-c',
      semanticAnchor: {
        containerNodeId: 'scene-a',
        previousUnitId: 'unit-b',
      },
    });
    expect(rightCells?.[1]).toMatchObject({
      kind: 'empty',
      containerId: 'container:scene-a',
      stableIdentity: 'shot-b',
      semanticAnchor: {
        containerNodeId: 'scene-a',
        previousUnitId: 'unit-a',
        nextUnitId: 'unit-c',
      },
    });
  });

  it('creates stable occurrence identities for repeated units inside the same container', () => {
    const canvas = storyboardCanvas([scene('scene-a', ['shot-a']), shot('shot-a', 1, 'scene-a')]);
    const plan = playbackPlan({
      units: [
        unit('unit-a-first', { sourceNodeId: 'shot-a', label: 'A first' }),
        unit('unit-a-repeat', { sourceNodeId: 'shot-a', label: 'A repeat' }),
      ],
      routeCandidates: [route('route-repeat', ['unit-a-first', 'unit-a-repeat'])],
    });

    const matrix = projectRouteStoryboardMatrix({ plan, canvas });

    expect(matrix.columns.map((column) => column.stableIdentity)).toEqual(['shot-a', 'shot-a#2']);
    expect(matrix.rows[0]?.cells).toHaveLength(2);
    expect(
      matrix.rows[0]?.cells.map((cell) =>
        cell.kind === 'playable'
          ? {
              id: cell.id,
              stableIdentity: cell.stableIdentity,
              unitId: cell.unitId,
            }
          : null,
      ),
    ).toEqual([
      {
        id: 'cell:route-repeat:container:scene-a:shot-a',
        stableIdentity: 'shot-a',
        unitId: 'unit-a-first',
      },
      {
        id: 'cell:route-repeat:container:scene-a:shot-a#2',
        stableIdentity: 'shot-a#2',
        unitId: 'unit-a-repeat',
      },
    ]);
  });

  it('keeps folded containers global and preserves slot span with summary cells', () => {
    const canvas = storyboardCanvas([
      scene('scene-a', ['shot-a', 'shot-b', 'shot-c']),
      shot('shot-a', 1, 'scene-a'),
      shot('shot-b', 2, 'scene-a'),
      shot('shot-c', 3, 'scene-a'),
      scene('scene-b', ['shot-x']),
      shot('shot-x', 1, 'scene-b'),
    ]);
    const plan = playbackPlan({
      units: [
        unit('unit-a', { sourceNodeId: 'shot-a' }),
        unit('unit-b', { sourceNodeId: 'shot-b' }),
        unit('unit-c', { sourceNodeId: 'shot-c' }),
        unit('unit-x', { sourceNodeId: 'shot-x' }),
      ],
      routeCandidates: [
        route('route-left', ['unit-a', 'unit-b', 'unit-x']),
        route('route-right', ['unit-a', 'unit-c', 'unit-x']),
      ],
    });

    const matrix = projectRouteStoryboardMatrix({
      plan,
      canvas,
      foldedContainerIds: ['container:scene-a'],
    });

    expect(matrix.containerGroups.find((group) => group.id === 'container:scene-a')).toMatchObject({
      folded: true,
      slotCount: 3,
    });
    expect(matrix.rows[0]?.cells[0]).toMatchObject({
      kind: 'summary',
      containerId: 'container:scene-a',
      columnStart: 0,
      columnSpan: 3,
      unitIds: ['unit-a', 'unit-b'],
    });
    expect(matrix.rows[1]?.cells[0]).toMatchObject({
      kind: 'summary',
      containerId: 'container:scene-a',
      columnStart: 0,
      columnSpan: 3,
      unitIds: ['unit-a', 'unit-c'],
    });
    expect(matrix.rows[0]?.cells[1]).toMatchObject({
      kind: 'playable',
      containerId: 'container:scene-b',
      columnStart: 3,
      unitId: 'unit-x',
    });
  });

  it('does not derive route rows from workflow provenance or multi-input generation metadata', () => {
    const plan = playbackPlan({
      units: [
        unit('video-d', {
          sourceNodeId: 'video-d',
          kind: 'media',
          assetPath: 'assets/video-d.mp4',
          metadata: {
            inputNodeIds: ['prompt-a', 'image-b', 'audio-c'],
            generatedFrom: ['prompt-a', 'image-b', 'audio-c'],
          },
        }),
      ],
      routeCandidates: [route('entry:video-d', ['video-d'])],
    });

    const matrix = projectRouteStoryboardMatrix({ plan });

    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]?.unitIds).toEqual(['video-d']);
    expect(matrix.rows[0]?.cells).toHaveLength(1);
    expect(matrix.rows[0]?.cells[0]).toMatchObject({
      kind: 'playable',
      unitId: 'video-d',
    });
  });

  it('projects safe thumbnails from playback metadata and source nodes', () => {
    const canvas = storyboardCanvas([
      scene('scene-a', ['shot-a', 'shot-b', 'shot-c', 'media-d']),
      shot('shot-a', 1, 'scene-a'),
      shot('shot-b', 2, 'scene-a', {
        generatedImage: 'data:image/png;base64,node-generated',
      }),
      shot('shot-c', 3, 'scene-a', {
        thumbnailData: 'bm9kZS10aHVtYg==',
      }),
      media('media-d', 'scene-a', {
        thumbnailPath: 'assets/thumbs/media-d.png',
        runtimeThumbnailPath:
          'https://file+.vscode-resource.vscode-cdn.net/workspace/thumbs/media-d.png',
      }),
    ]);
    const plan = playbackPlan({
      units: [
        unit('unit-a', {
          sourceNodeId: 'shot-a',
          label: 'Metadata preview',
          metadata: {
            previewUrl: 'data:image/png;base64,metadata-preview',
          },
        }),
        unit('unit-b', { sourceNodeId: 'shot-b', label: 'Generated image' }),
        unit('unit-c', { sourceNodeId: 'shot-c', label: 'Document cover' }),
        unit('unit-d', {
          sourceNodeId: 'media-d',
          label: 'Media poster',
          kind: 'media',
          metadata: {
            previewUrl: 'assets/unresolved-preview.png',
            sourceRange: { startMs: 12_000, endMs: 18_000 },
          },
        }),
      ],
      routeCandidates: [route('entry:shot-a', ['unit-a', 'unit-b', 'unit-c', 'unit-d'])],
    });

    const matrix = projectRouteStoryboardMatrix({ plan, canvas });
    const thumbnails = (matrix.rows[0]?.cells ?? []).map((cell) =>
      cell.kind === 'playable' ? cell.thumbnail : undefined,
    );

    expect(thumbnails).toEqual([
      { src: 'data:image/png;base64,metadata-preview', alt: 'Metadata preview' },
      { src: 'data:image/png;base64,node-generated', alt: 'Generated image' },
      { src: 'data:image/png;base64,bm9kZS10aHVtYg==', alt: 'Document cover' },
      {
        src: 'https://file+.vscode-resource.vscode-cdn.net/workspace/thumbs/media-d.png',
        alt: 'Media poster',
      },
    ]);
    expect(matrix.rows[0]?.cells[3]).toMatchObject({
      kind: 'playable',
      sourceRange: { startMs: 12_000, endMs: 18_000, durationMs: 6_000 },
    });
  });

  it('does not expose unresolved relative thumbnail paths to matrix image cells', () => {
    const canvas = storyboardCanvas([
      scene('scene-a', ['media-a']),
      media('media-a', 'scene-a', {
        thumbnailPath: 'assets/thumbs/media-a.png',
        runtimeThumbnailPath: 'vscode-webview-resource://panel/media-a.mp4',
      }),
    ]);
    const plan = playbackPlan({
      units: [
        unit('unit-a', {
          sourceNodeId: 'media-a',
          label: 'Relative media',
          kind: 'media',
          metadata: {
            previewUrl: 'assets/unresolved-preview.png',
            posterUrl: 'https://example.test/clip.mp4',
          },
        }),
      ],
      routeCandidates: [route('entry:media-a', ['unit-a'])],
    });

    const matrix = projectRouteStoryboardMatrix({ plan, canvas });
    const cell = matrix.rows[0]?.cells[0];

    expect(cell).toMatchObject({ kind: 'playable', mediaState: 'playable' });
    expect(cell?.kind === 'playable' ? cell.thumbnail : undefined).toBeUndefined();
  });

  it('highlights unit-property filters without hiding alignment slots', () => {
    const plan = playbackPlan({
      units: [
        unit('shot-a', { kind: 'shot' }),
        unit('media-b', { kind: 'media', assetPath: 'assets/b.mp4' }),
      ],
      routeCandidates: [route('entry:shot-a', ['shot-a', 'media-b'])],
    });

    const matrix = projectRouteStoryboardMatrix({
      plan,
      filters: { highlightedNodeKinds: ['media'] },
    });

    const cells = matrix.rows[0]?.cells ?? [];
    expect(cells).toHaveLength(2);
    expect(cells.map((cell) => (cell.kind === 'playable' ? cell.highlight : false))).toEqual([
      false,
      true,
    ]);
  });
});

function playbackPlan({
  units,
  routeCandidates,
}: {
  readonly units: readonly CanvasPlaybackUnit[];
  readonly routeCandidates: readonly CanvasPlaybackRouteCandidate[];
}): CanvasPlaybackPlan {
  return {
    adapterId: 'storyboard',
    requestedAdapterId: 'auto',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: units[0] ? [units[0].id] : [],
    units,
    transitions: [],
    routeCandidates,
    diagnostics: [],
    metadata: { sourceCanvasName: 'Storyboard' },
  };
}

function route(
  id: string,
  unitIds: readonly string[],
  overrides: Partial<CanvasPlaybackRouteCandidate> = {},
): CanvasPlaybackRouteCandidate {
  const entryUnitId = unitIds[0];
  if (!entryUnitId) {
    throw new Error('test route requires at least one unit');
  }
  return {
    id,
    title: id,
    entryUnitId,
    unitIds,
    sourceKind: 'entry',
    totalDurationMs: unitIds.length * 1000,
    ...overrides,
  };
}

function unit(id: string, overrides: Partial<CanvasPlaybackUnit> = {}): CanvasPlaybackUnit {
  return {
    id,
    sourceNodeId: id,
    kind: 'shot',
    renderMode: 'story-preview',
    label: id,
    durationMs: 1000,
    ...overrides,
  };
}

function storyboardCanvas(nodes: readonly CanvasNode[]): Pick<CanvasData, 'nodes'> {
  return { nodes: [...nodes] };
}

function scene(id: string, childIds: readonly string[]): CanvasNode {
  return {
    id,
    type: 'scene',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    container: { policy: 'scene', childIds: [...childIds], layout: { mode: 'sequence' } },
    data: { sceneTitle: id, sceneNumber: 1 },
  };
}

function shot(
  id: string,
  shotNumber: number,
  parentId: string,
  dataOverrides: Readonly<Record<string, unknown>> = {},
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
      duration: 1,
      visualDescription: id,
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
      ...dataOverrides,
    },
  };
}

function media(
  id: string,
  parentId: string,
  dataOverrides: Readonly<Record<string, unknown>> = {},
): CanvasNode {
  return {
    id,
    type: 'media',
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data: {
      assetPath: '',
      mediaType: 'video',
      ...dataOverrides,
    },
  };
}
