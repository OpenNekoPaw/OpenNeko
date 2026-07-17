import { describe, expect, it } from 'vitest';
import type { ResourceRef } from '../resource-cache';
import type {
  CanvasPlaybackPlan,
  CanvasPlaybackRouteCandidate,
  CanvasPlaybackUnit,
} from '../canvas-playback';
import {
  CANVAS_CUT_DRAFT_KIND,
  CANVAS_CUT_DRAFT_SCHEMA_VERSION,
  isCanvasCutDraftPayload,
  projectCanvasPlaybackRouteToCutDraft,
  validateCanvasCutDraftPayload,
  type CanvasCutDraftPayload,
} from '../canvas-cut-draft';

const resourceRef: ResourceRef = {
  id: 'resource-video-a',
  scope: 'project',
  provider: 'neko-assets',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'assets/video-a.mp4' },
  fingerprint: { strategy: 'hash', value: 'hash-a' },
};

describe('canvas cut draft contract', () => {
  it('projects a playback route to a Cut draft snapshot with source mapping and cues', () => {
    const plan = createPlan({
      units: [
        playbackUnit('shot-a', {
          assetPath: 'assets/shot-a.mp4',
          metadata: {
            sceneId: 'scene-1',
            shotId: 'shot-1',
            dialogue: 'Hello there.',
            voiceCues: [
              {
                cueId: 'voice-1',
                kind: 'dialogue',
                text: 'Hello there.',
                speakerName: 'Neko',
                voiceAssetId: 'voice-a',
              },
            ],
          },
        }),
        playbackUnit('shot-b', {
          resourceRef,
          metadata: { sceneId: 'scene-1', shotId: 'shot-2', soundCue: 'Door closes.' },
        }),
      ],
      route: {
        id: 'scene:scene-1',
        title: 'Scene 1',
        entryUnitId: 'shot-a',
        unitIds: ['shot-a', 'shot-b'],
        sourceKind: 'scene',
        sourceNodeId: 'scene-1',
        totalDurationMs: 4000,
      },
    });

    const result = projectCanvasPlaybackRouteToCutDraft({
      plan,
      sourceCanvasUri: 'neko://canvas/project.nkc',
      sourceRevision: 7,
      currentSourceRevision: 7,
      projectName: 'Scene 1 Cut',
      routeId: 'scene:scene-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected draft projection to succeed.');
    expect(result.payload).toMatchObject({
      kind: CANVAS_CUT_DRAFT_KIND,
      schemaVersion: CANVAS_CUT_DRAFT_SCHEMA_VERSION,
      source: { canvasUri: 'neko://canvas/project.nkc', revision: 7 },
      route: { id: 'scene:scene-1', unitIds: ['shot-a', 'shot-b'] },
      projectName: 'Scene 1 Cut',
    });
    expect(result.payload.units[0]).toMatchObject({
      id: 'shot-a',
      sourceMapping: {
        routeId: 'scene:scene-1',
        canvasUnitId: 'shot-a',
        canvasNodeId: 'shot-a',
        canvasUnitKind: 'shot',
        sceneId: 'scene-1',
        shotId: 'shot-1',
      },
      media: [{ role: 'source', assetPath: 'assets/shot-a.mp4' }],
      cues: expect.arrayContaining([
        expect.objectContaining({ kind: 'dialogue', text: 'Hello there.', source: 'canvas-node' }),
        expect.objectContaining({
          kind: 'dialogue',
          text: 'Hello there.',
          source: 'story-projection',
          metadata: { voiceAssetId: 'voice-a' },
        }),
      ]),
    });
    expect(result.payload.units[1]?.media?.[0]?.resourceRef).toEqual(resourceRef);
  });

  it('fails visibly when the selected route is missing', () => {
    const result = projectCanvasPlaybackRouteToCutDraft({
      plan: createPlan(),
      sourceCanvasUri: 'neko://canvas/project.nkc',
      routeId: 'missing-route',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'draft-missing-route',
        severity: 'error',
        routeId: 'missing-route',
      }),
    ]);
  });

  it('rejects stale source revisions before Cut import', () => {
    const result = projectCanvasPlaybackRouteToCutDraft({
      plan: createPlan(),
      sourceCanvasUri: 'neko://canvas/project.nkc',
      sourceRevision: 3,
      currentSourceRevision: 4,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'draft-stale-source', severity: 'error' }),
    ]);
  });

  it('rejects invalid extension namespaces and timeline semantics', () => {
    const payload = createPayload({
      extensions: {
        canvas: { note: 'bare namespace is invalid' },
        'neko.canvas': { timelineOrder: ['shot-b', 'shot-a'] },
      },
    });

    const validation = validateCanvasCutDraftPayload(payload);

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'draft-invalid-extension-namespace' }),
        expect.objectContaining({ code: 'draft-forbidden-extension-field' }),
      ]),
    );
  });

  it('rejects runtime media handles and unmanaged absolute paths', () => {
    const payload = createPayload({
      units: [
        createDraftUnit({
          media: [
            { role: 'source', assetPath: 'vscode-webview-resource://asset/video.mp4' },
            { role: 'source', assetPath: '/Users/feng/video.mp4' },
          ],
        }),
      ],
    });

    const validation = validateCanvasCutDraftPayload(payload);

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'draft-invalid-media-reference' }),
        expect.objectContaining({ code: 'draft-unmanaged-path' }),
      ]),
    );
  });

  it('diagnoses cue conflicts instead of picking an arbitrary source', () => {
    const result = projectCanvasPlaybackRouteToCutDraft({
      plan: createPlan({
        units: [
          playbackUnit('shot-a', {
            metadata: {
              dialogue: 'Canvas line.',
              voiceCues: [{ cueId: 'voice-1', kind: 'dialogue', text: 'Story line.' }],
            },
          }),
        ],
      }),
      sourceCanvasUri: 'neko://canvas/project.nkc',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'draft-cue-conflict', severity: 'error' }),
    ]);
  });

  it('accepts valid Neko extension metadata', () => {
    const payload = createPayload({
      extensions: { 'neko.canvas': { routeLabel: 'Main route' } },
    });

    const validation = validateCanvasCutDraftPayload(payload);

    expect(validation.valid).toBe(true);
    expect(isCanvasCutDraftPayload(payload)).toBe(true);
  });
});

function createPlan(
  overrides: {
    readonly units?: readonly CanvasPlaybackUnit[];
    readonly route?: CanvasPlaybackRouteCandidate;
  } = {},
): CanvasPlaybackPlan {
  const units = overrides.units ?? [playbackUnit('shot-a', { assetPath: 'assets/shot-a.mp4' })];
  const route =
    overrides.route ??
    ({
      id: 'auto-entry:shot-a',
      title: 'Shot A',
      entryUnitId: 'shot-a',
      unitIds: ['shot-a'],
      sourceKind: 'auto-entry',
      sourceNodeId: 'shot-a',
      totalDurationMs: 2000,
    } satisfies CanvasPlaybackRouteCandidate);
  return {
    adapterId: 'storyboard',
    requestedAdapterId: 'auto',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: [route.entryUnitId],
    units,
    transitions: [],
    routeCandidates: [route],
    diagnostics: [],
    metadata: { sourceCanvasName: 'Canvas' },
  };
}

function playbackUnit(id: string, overrides: Partial<CanvasPlaybackUnit> = {}): CanvasPlaybackUnit {
  return {
    id,
    sourceNodeId: id,
    kind: 'shot',
    renderMode: 'story-preview',
    label: id,
    durationMs: 2000,
    ...overrides,
  };
}

function createPayload(overrides: Partial<CanvasCutDraftPayload> = {}): CanvasCutDraftPayload {
  return {
    kind: CANVAS_CUT_DRAFT_KIND,
    schemaVersion: CANVAS_CUT_DRAFT_SCHEMA_VERSION,
    source: { canvasUri: 'neko://canvas/project.nkc', revision: 1 },
    route: {
      id: 'auto-entry:shot-a',
      title: 'Shot A',
      entryUnitId: 'shot-a',
      unitIds: ['shot-a'],
      sourceKind: 'auto-entry',
    },
    projectName: 'Draft',
    units: [createDraftUnit()],
    ...overrides,
  };
}

function createDraftUnit(
  overrides: Partial<CanvasCutDraftPayload['units'][number]> = {},
): CanvasCutDraftPayload['units'][number] {
  return {
    id: 'shot-a',
    kind: 'shot',
    renderMode: 'story-preview',
    sourceMapping: {
      routeId: 'auto-entry:shot-a',
      canvasUnitId: 'shot-a',
      canvasNodeId: 'shot-a',
      canvasUnitKind: 'shot',
    },
    media: [{ role: 'source', assetPath: 'assets/shot-a.mp4' }],
    ...overrides,
  };
}
