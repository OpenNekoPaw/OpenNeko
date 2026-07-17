import { describe, expect, it } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  validateCompositeArtifact,
  type CanvasPlaybackPlan,
  type ResourceRef,
} from '@neko/shared';
import { projectCanvasPlaybackRouteCard } from '../canvas-playback-route-presenter';

function createPosterResourceRef(): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'generated-assets',
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: 'asset-shot-1',
    },
    locator: {
      kind: 'generated-asset',
      assetId: 'asset-shot-1',
      variantId: 'poster',
    },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: 'asset-shot-1:poster',
      providerId: 'generated-assets',
    }),
  });
}

function createPlan(): CanvasPlaybackPlan {
  const posterRef = createPosterResourceRef();
  return {
    adapterId: 'storyboard',
    requestedAdapterId: 'storyboard',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: ['unit-shot-1'],
    units: [
      {
        id: 'unit-shot-1',
        sourceNodeId: 'shot-1',
        kind: 'shot',
        renderMode: 'media-playback',
        label: 'Opening shot',
        durationMs: 3000,
        resourceRef: posterRef,
        metadata: { mediaType: 'image', thumbnailUrl: 'webview://runtime-thumbnail' },
      },
      {
        id: 'unit-shot-2',
        sourceNodeId: 'shot-2',
        kind: 'shot',
        renderMode: 'select-node',
        label: 'Reaction shot',
        durationMs: 2500,
      },
    ],
    transitions: [
      {
        id: 'transition-1',
        sourceUnitId: 'unit-shot-1',
        targetUnitId: 'unit-shot-2',
        type: 'sequence',
        priority: 0,
      },
    ],
    routeCandidates: [
      {
        id: 'route-main',
        title: 'Main route',
        entryUnitId: 'unit-shot-1',
        unitIds: ['unit-shot-1', 'unit-shot-2'],
        sourceKind: 'entry',
        sourceNodeId: 'scene-1',
        totalDurationMs: 5500,
      },
    ],
    diagnostics: [
      {
        code: 'playback-missing-media-source',
        severity: 'warning',
        message: 'Reaction shot has no media source.',
        adapterId: 'storyboard',
        nodeId: 'shot-2',
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
            rowId: 'unit-shot-1',
            cells: {
              label: { type: 'string', value: 'Opening shot' },
              duration: { type: 'duration', valueMs: 3000 },
            },
          },
          {
            rowId: 'unit-shot-2',
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
          itemId: 'unit-shot-1:poster',
          mediaType: 'image',
          resourceRef: {
            kind: 'resource',
            resource: {
              provider: 'generated-assets',
            },
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
        rows: [{ rowId: 'unit-shot-1' }],
      },
    });
  });
});
