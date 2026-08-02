import { describe, expect, it } from 'vitest';
import { type ContentLocator } from '@neko/content';
import { type CanvasPlaybackPlan } from '@neko-canvas/domain';
import { validateCompositeArtifact } from '@neko-agent/contracts';
import { projectCanvasPlaybackRouteCard } from '../canvas-playback-route-presenter';

function createPosterContentLocator(): ContentLocator {
  return {
    kind: 'generated-output',
    outputId: 'asset-shot-1',
    revision: '1',
    digest: 'sha256:asset-shot-1',
    path: 'generated/asset-shot-1.png',
  };
}

function createPlan(): CanvasPlaybackPlan {
  const posterLocator = createPosterContentLocator();
  return {
    adapterId: 'generic',
    requestedAdapterId: 'generic',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: ['unit-media-1'],
    units: [
      {
        id: 'unit-media-1',
        sourceNodeId: 'media-1',
        kind: 'media',
        renderMode: 'media-playback',
        label: 'Opening image',
        durationMs: 3000,
        contentLocator: posterLocator,
        metadata: { mediaType: 'image', thumbnailUrl: 'webview://runtime-thumbnail' },
      },
      {
        id: 'unit-markdown-1',
        sourceNodeId: 'markdown-1',
        kind: 'node',
        renderMode: 'select-node',
        label: 'Reaction notes',
        durationMs: 2500,
      },
    ],
    transitions: [
      {
        id: 'transition-1',
        sourceUnitId: 'unit-media-1',
        targetUnitId: 'unit-markdown-1',
        type: 'sequence',
        priority: 0,
      },
    ],
    routeCandidates: [
      {
        id: 'route-main',
        title: 'Main route',
        entryUnitId: 'unit-media-1',
        unitIds: ['unit-media-1', 'unit-markdown-1'],
        sourceKind: 'entry',
        sourceNodeId: 'group-1',
        totalDurationMs: 5500,
      },
    ],
    diagnostics: [
      {
        code: 'playback-missing-media-source',
        severity: 'warning',
        message: 'Reaction notes use node selection rendering.',
        adapterId: 'generic',
        nodeId: 'markdown-1',
      },
    ],
    metadata: {
      sourceCanvasUri: 'file:///project/story.nkc',
      sourceRevision: 12,
    },
  };
}

describe('canvas playback route presenter', () => {
  it('projects a CanvasPlaybackPlan into a standard route summary artifact', () => {
    const projection = projectCanvasPlaybackRouteCard(createPlan(), { routeId: 'route-main' });

    expect(projection.selectedRoute?.id).toBe('route-main');
    expect(projection.unitCount).toBe(2);
    expect(projection.projectedUnitCount).toBe(2);
    const validation = validateCompositeArtifact(projection.artifact);
    expect(validation.ok).toBe(true);
    expect(validation.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual(
      [],
    );
    expect(projection.artifact).toMatchObject({
      profile: 'canvas-playback-route',
      title: 'Main route',
      suggestedActions: [
        {
          actionId: 'canvas.revealPlaybackWorkspace',
          requiresApproval: false,
          metadata: { routeId: 'route-main' },
        },
        {
          actionId: 'canvas.createCutDraftFromRoute',
          requiresApproval: true,
          metadata: { routeId: 'route-main', unitCount: 2 },
        },
        {
          actionId: 'canvas.getPlaybackRoutes',
          requiresApproval: false,
          metadata: { includeFullOrder: true },
        },
      ],
    });

    const summary = projection.artifact.blocks.find((block) => block.blockId === 'summary');
    expect(summary).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('Playback stays in Canvas'),
    });

    const tableBlock = projection.artifact.blocks.find(
      (block) => block.blockId === 'ordered-units',
    );
    expect(tableBlock).toMatchObject({
      kind: 'table',
      table: {
        rows: [
          {
            rowId: 'unit-media-1',
            cells: {
              label: { type: 'string', value: 'Opening image' },
              duration: { type: 'duration', valueMs: 3000 },
            },
          },
          {
            rowId: 'unit-markdown-1',
            cells: {
              diagnostics: {
                type: 'tags',
                value: ['playback-missing-media-source'],
              },
            },
          },
        ],
      },
    });
  });

  it('includes durable poster references without exposing runtime playback state', () => {
    const projection = projectCanvasPlaybackRouteCard(createPlan());
    const gallery = projection.artifact.blocks.find((block) => block.blockId === 'posters');

    expect(gallery).toMatchObject({
      kind: 'gallery',
      items: [
        {
          itemId: 'unit-media-1:poster',
          mediaType: 'image',
          reference: {
            kind: 'content',
            contentLocator: createPosterContentLocator(),
          },
          metadata: {
            routeCardRole: 'poster-or-source-reference',
          },
        },
      ],
    });

    const serialized = JSON.stringify(projection.artifact);
    expect(serialized).not.toContain('webview://runtime-thumbnail');
    expect(serialized).not.toContain('agentOrder');
    expect(serialized).not.toContain('AgentPlaybackSession');
    expect(serialized).not.toContain('playhead');
    expect(serialized).not.toContain('createVideoPlayer');
  });

  it('can show a clipped order while preserving the total route count', () => {
    const projection = projectCanvasPlaybackRouteCard(createPlan(), { maxUnits: 1 });

    expect(projection.unitCount).toBe(2);
    expect(projection.projectedUnitCount).toBe(1);
    expect(
      projection.artifact.blocks.find((block) => block.blockId === 'ordered-units'),
    ).toMatchObject({
      title: 'Ordered Units (1/2)',
      kind: 'table',
      table: {
        rows: [{ rowId: 'unit-media-1' }],
      },
    });
  });
});
