import { describe, expect, it, vi } from 'vitest';
import type { CanvasCutDraftPayload, NekoCutAPI } from '@neko/shared';
import { handoffCanvasDraftToCut, projectCanvasDraftToCutRoute } from './CanvasCutRouteHandoff';

describe('CanvasCutRouteHandoff', () => {
  it('projects ordered workspace media and empty units to media/gap items', () => {
    expect(projectCanvasDraftToCutRoute(draft())).toEqual([
      {
        kind: 'media',
        workspaceRelativePath: 'media/shot.mp4',
        name: 'Shot',
        durationSeconds: 2,
      },
      { kind: 'gap', durationSeconds: 0.5 },
    ]);
  });

  it('rejects cues, resource-only media and workspace escapes before calling Cut', async () => {
    const handoff = vi.fn();
    const cutApi = { status: 'ready', routes: { handoff } } satisfies NekoCutAPI;
    const invalid = draft();
    const first = invalid.units[0]!;
    const withCue: CanvasCutDraftPayload = {
      ...invalid,
      units: [{ ...first, cues: [{ id: 'cue', kind: 'text', text: 'No', source: 'canvas-node' }] }],
    };

    await expect(
      handoffCanvasDraftToCut(cutApi, withCue, { kind: 'new', projectName: 'Demo' }),
    ).rejects.toThrow('unsupported cues');
    expect(handoff).not.toHaveBeenCalled();
  });

  it('passes an explicit append target without active/recent fallback', async () => {
    const handoff = vi.fn(async () => ({
      documentUri: 'file:///workspace/edit.otio',
      revision: 8,
      created: false,
    }));
    const cutApi = { status: 'ready', routes: { handoff } } satisfies NekoCutAPI;

    await expect(
      handoffCanvasDraftToCut(cutApi, draft(), {
        kind: 'append',
        documentUri: 'file:///workspace/edit.otio',
        expectedRevision: 7,
      }),
    ).resolves.toMatchObject({ revision: 8, created: false });
    expect(handoff).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          kind: 'append',
          documentUri: 'file:///workspace/edit.otio',
          expectedRevision: 7,
        },
      }),
    );
  });
});

function draft(): CanvasCutDraftPayload {
  return {
    kind: 'canvas-cut-draft',
    schemaVersion: 1,
    source: { canvasUri: 'file:///workspace/board.nkc', revision: 4 },
    route: {
      id: 'route-1',
      title: 'Route',
      entryUnitId: 'unit-1',
      unitIds: ['unit-1', 'unit-2'],
      sourceKind: 'entry',
    },
    projectName: 'Demo',
    units: [
      {
        id: 'unit-1',
        label: 'Shot',
        kind: 'media',
        renderMode: 'media-playback',
        durationMs: 2_000,
        sourceMapping: {
          routeId: 'route-1',
          canvasUnitId: 'unit-1',
          canvasNodeId: 'node-1',
          canvasUnitKind: 'media',
        },
        media: [{ role: 'source', assetPath: 'media/shot.mp4' }],
      },
      {
        id: 'unit-2',
        kind: 'node',
        renderMode: 'select-node',
        durationMs: 500,
        sourceMapping: {
          routeId: 'route-1',
          canvasUnitId: 'unit-2',
          canvasNodeId: 'node-2',
          canvasUnitKind: 'node',
        },
      },
    ],
  };
}
