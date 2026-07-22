import { describe, expect, it } from 'vitest';
import {
  CANVAS_CUT_DRAFT_KIND,
  CANVAS_CUT_DRAFT_SCHEMA_VERSION,
  type CanvasCutDraftPayload,
  type ResourceRef,
} from '@neko/shared';
import {
  buildCanvasDraftTimelineSyncPayload,
  buildStoryboardMediaElement,
  buildStoryboardMetadataCues,
  buildStoryboardImageClips,
  normalizeCutStoryboardImportPayload,
  projectCanvasCutDraftToStoryboardImport,
  projectCanvasCutDraftToStoryboardImportResult,
} from './storyboardImport';

describe('storyboard import utilities', () => {
  it('normalizes storyboard import payloads with image paths', () => {
    expect(
      normalizeCutStoryboardImportPayload({
        projectName: 'Opening',
        shots: [
          {
            id: 'shot-1',
            shotNumber: 1,
            duration: 2.5,
            imagePath: '/repo/shot-1.png',
            label: '#001 LS',
          },
        ],
      }),
    ).toEqual({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2.5,
          imagePath: '/repo/shot-1.png',
          label: '#001 LS',
        },
      ],
    });
  });

  it('builds sequential image clips and falls back to valid durations', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        { id: 'shot-1', shotNumber: 1, duration: 2, imagePath: '/repo/1.png', label: 'One' },
        { id: 'shot-2', shotNumber: 2, duration: 0, imagePath: '/repo/2.png', label: 'Two' },
        { id: 'shot-3', shotNumber: 3, duration: 5, label: 'No image' },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardImageClips(payload!, 10)).toEqual([
      { id: 'shot-1', path: '/repo/1.png', name: 'One', duration: 2, startTime: 10 },
      { id: 'shot-2', path: '/repo/2.png', name: 'Two', duration: 3, startTime: 12 },
    ]);
  });

  it('prefers approved prepared keyframe refs over raw comic image paths', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/raw-comic-panel.png',
          preparedKeyframeRef: {
            refId: 'prepared-shot-1',
            role: 'derived',
            locator: {
              type: 'tool-result',
              toolCallId: 'transform-shot-1',
              assetIndex: 0,
            },
            label: 'Prepared keyframe',
          },
          referenceDescriptors: [
            {
              schemaVersion: 1,
              kind: 'reference-descriptor',
              referenceId: 'shot-1:keyframeRefs:0:prepared-shot-1',
              sourceKind: 'canvas-node',
              sourceId: 'shot-1',
              referenceKind: 'custom',
              role: 'keyframe',
              modality: 'image',
              payload: {
                type: 'custom',
                data: {
                  locatorType: 'tool-result',
                  toolCallId: 'transform-shot-1',
                  assetIndex: 0,
                },
              },
            },
            {
              schemaVersion: 1,
              kind: 'reference-descriptor',
              referenceId: 'unsafe',
              sourceKind: 'canvas-node',
              sourceId: 'shot-1',
              referenceKind: 'custom',
              role: 'keyframe',
              modality: 'image',
              payload: { type: 'path', path: 'blob:runtime-preview' },
            },
          ],
          label: 'One',
        },
      ],
    });

    expect(payload?.shots[0]?.preparedKeyframeRef).toEqual({
      refId: 'prepared-shot-1',
      role: 'derived',
      locator: {
        type: 'tool-result',
        toolCallId: 'transform-shot-1',
        assetIndex: 0,
      },
      label: 'Prepared keyframe',
    });
    expect(payload?.shots[0]?.referenceDescriptors).toEqual([
      {
        schemaVersion: 1,
        kind: 'reference-descriptor',
        referenceId: 'shot-1:keyframeRefs:0:prepared-shot-1',
        sourceKind: 'canvas-node',
        sourceId: 'shot-1',
        referenceKind: 'custom',
        role: 'keyframe',
        modality: 'image',
        payload: {
          type: 'custom',
          data: {
            locatorType: 'tool-result',
            toolCallId: 'transform-shot-1',
            assetIndex: 0,
          },
        },
      },
    ]);
    expect(payload).not.toBeNull();
    expect(buildStoryboardImageClips(payload!)).toEqual([
      {
        id: 'shot-1',
        path: 'tool-result:transform-shot-1:0',
        name: 'One',
        duration: 2,
        startTime: 0,
      },
    ]);
  });

  it('rejects legacy Asset locators instead of resolving an Asset fallback', () => {
    expect(() =>
      normalizeCutStoryboardImportPayload({
        projectName: 'Legacy',
        shots: [
          {
            id: 'shot-legacy',
            shotNumber: 1,
            duration: 2,
            preparedKeyframeRef: {
              refId: 'legacy-asset-ref',
              role: 'source',
              locator: { type: 'asset', assetId: 'legacy-asset' },
            },
            label: 'Legacy shot',
          },
        ],
      }),
    ).toThrow('require explicit inspection and migration');

    expect(() =>
      buildStoryboardImageClips({
        projectName: 'Legacy',
        shots: [
          {
            id: 'shot-legacy',
            shotNumber: 1,
            duration: 2,
            preparedKeyframeRef: {
              refId: 'legacy-asset-ref',
              role: 'source',
              locator: { type: 'asset', assetId: 'legacy-asset' },
            },
            label: 'Legacy shot',
          },
        ],
      }),
    ).toThrow('require explicit inspection and migration');
  });

  it('keeps storyboard timing stable when a shot has no image', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        { id: 'shot-1', shotNumber: 1, duration: 2, imagePath: '/repo/1.png', label: 'One' },
        { id: 'shot-2', shotNumber: 2, duration: 4, label: 'No image' },
        { id: 'shot-3', shotNumber: 3, duration: 1, imagePath: '/repo/3.png', label: 'Three' },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardImageClips(payload!, 10)).toEqual([
      { id: 'shot-1', path: '/repo/1.png', name: 'One', duration: 2, startTime: 10 },
      { id: 'shot-3', path: '/repo/3.png', name: 'Three', duration: 1, startTime: 16 },
    ]);
  });

  it('builds timeline metadata cues for dialogue, voice-over, and sound cues', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          dialogue: 'We are close.',
          voiceOver: 'A quiet narrator line.',
        },
        {
          id: 'shot-2',
          shotNumber: 2,
          duration: 0,
          imagePath: '/repo/2.png',
          label: 'Two',
          soundCue: 'Distant thunder.',
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardMetadataCues(payload!, 10)).toEqual([
      {
        id: 'shot-1-dialogue',
        kind: 'dialogue',
        text: 'We are close.',
        name: 'Dialogue 1: One',
        duration: 2,
        startTime: 10,
      },
      {
        id: 'shot-1-voice-over',
        kind: 'voiceOver',
        text: 'A quiet narrator line.',
        name: 'Voice Over 1: One',
        duration: 2,
        startTime: 10,
      },
      {
        id: 'shot-2-sound-cue',
        kind: 'soundCue',
        text: 'Distant thunder.',
        name: 'Sound Cue 2: Two',
        duration: 3,
        startTime: 12,
      },
    ]);
  });

  it('preserves structured voice cue speaker and voice lineage metadata', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          dialogue: 'We are close.',
          voiceCues: [
            {
              cueId: 'shot-1-dialogue-1',
              kind: 'dialogue',
              text: 'We are close.',
              speakerName: 'Rin',
              speakerCharacterId: 'char-rin',
              speakerEntityRef: {
                entityId: 'char-rin',
                entityKind: 'character',
              },
              voiceAssetId: 'voice-rin',
              emotion: 'urgent',
              delivery: 'whispered',
            },
          ],
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardMetadataCues(payload!, 0)).toEqual([
      {
        id: 'shot-1-dialogue-1',
        kind: 'dialogue',
        text: 'We are close.',
        name: 'Dialogue 1: One',
        duration: 2,
        startTime: 0,
        speakerName: 'Rin',
        speakerCharacterId: 'char-rin',
        speakerEntityId: 'char-rin',
        voiceAssetId: 'voice-rin',
        sourceCueId: 'shot-1-dialogue-1',
        emotion: 'urgent',
        delivery: 'whispered',
      },
    ]);
  });

  it('keeps additional structured cues when summary dialogue is present', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          dialogue: 'First line.',
          voiceCues: [
            {
              cueId: 'shot-1-dialogue-1',
              kind: 'dialogue',
              text: 'First line.',
              speakerCharacterId: 'char-stale',
              speakerEntityRef: {
                entityId: 'char-rin',
                entityKind: 'character',
              },
            },
            {
              cueId: 'shot-1-dialogue-2',
              kind: 'dialogue',
              text: 'Second line.',
              speakerName: 'Rin',
            },
          ],
        },
      ],
    });

    expect(payload?.shots[0]?.voiceCues?.[0]).toMatchObject({
      speakerCharacterId: 'char-rin',
    });
    expect(buildStoryboardMetadataCues(payload!, 0)).toEqual([
      expect.objectContaining({
        id: 'shot-1-dialogue-1',
        text: 'First line.',
        speakerCharacterId: 'char-rin',
        speakerEntityId: 'char-rin',
      }),
      expect.objectContaining({
        id: 'shot-1-dialogue-2',
        text: 'Second line.',
        speakerName: 'Rin',
      }),
    ]);
  });

  it('merges summary dialogue with the structured cue whose text matches first', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          dialogue: 'Second line.',
          voiceCues: [
            {
              cueId: 'shot-1-dialogue-1',
              kind: 'dialogue',
              text: 'First line.',
              speakerName: 'Aki',
            },
            {
              cueId: 'shot-1-dialogue-2',
              kind: 'dialogue',
              text: 'Second line.',
              speakerName: 'Rin',
            },
          ],
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(buildStoryboardMetadataCues(payload!, 0)).toEqual([
      expect.objectContaining({
        id: 'shot-1-dialogue-2',
        text: 'Second line.',
        speakerName: 'Rin',
      }),
      expect.objectContaining({
        id: 'shot-1-dialogue-1',
        text: 'First line.',
        speakerName: 'Aki',
      }),
    ]);
  });

  it('filters invalid structured voice cues during normalization', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          voiceCues: [
            { cueId: 'bad-kind', kind: 'soundCue', text: 'Nope.' },
            { kind: 'dialogue', text: 'Missing cue id.' },
            { cueId: 'missing-text', kind: 'dialogue' },
            { cueId: 'valid', kind: 'voiceOver', text: 'Keep me.' },
          ],
        },
      ],
    });

    expect(payload?.shots[0]?.voiceCues).toEqual([
      {
        cueId: 'valid',
        kind: 'voiceOver',
        text: 'Keep me.',
      },
    ]);
  });

  it('preserves classified text cues without turning non-dialogue OCR into timeline cues', () => {
    const payload = normalizeCutStoryboardImportPayload({
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 2,
          imagePath: '/repo/1.png',
          label: 'One',
          textCues: [
            {
              cueId: 'text-dialogue',
              kind: 'dialogue',
              text: 'Wait!',
              speakerName: 'Rin',
              speakerCharacterId: 'char-rin',
              speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
              confidence: 0.9,
            },
            {
              cueId: 'text-sign',
              kind: 'backgroundText',
              text: 'KEEP OUT',
            },
            {
              cueId: 'bad-kind',
              kind: 'subtitle',
              text: 'drop me',
            },
          ],
        },
      ],
    });

    expect(payload?.shots[0]?.textCues).toEqual([
      {
        cueId: 'text-dialogue',
        kind: 'dialogue',
        text: 'Wait!',
        speakerName: 'Rin',
        speakerCharacterId: 'char-rin',
        speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
        confidence: 0.9,
      },
      {
        cueId: 'text-sign',
        kind: 'backgroundText',
        text: 'KEEP OUT',
      },
    ]);
    expect(payload ? buildStoryboardMetadataCues(payload) : []).toEqual([]);
  });

  it('rejects empty storyboard imports', () => {
    expect(normalizeCutStoryboardImportPayload({ projectName: 'Empty', shots: [] })).toBeNull();
    expect(normalizeCutStoryboardImportPayload({ projectName: 'Broken' })).toBeNull();
  });

  it('projects Canvas Cut drafts to storyboard imports with cues and source mapping', () => {
    const draft = createCanvasDraftPayload({
      units: [
        createCanvasDraftUnit({
          id: 'unit-a',
          durationMs: 2400,
          label: 'Opening shot',
          media: [{ role: 'source', assetPath: 'media/opening.mp4' }],
          cues: [
            { id: 'cue-dialogue', kind: 'dialogue', text: 'We begin.', source: 'canvas-node' },
            {
              id: 'cue-voice',
              kind: 'voiceOver',
              text: 'A quiet start.',
              source: 'story-projection',
            },
            { id: 'cue-sound', kind: 'soundCue', text: 'Low wind.', source: 'canvas-node' },
          ],
          sourceMapping: {
            routeId: 'route-main',
            canvasUnitId: 'unit-a',
            canvasNodeId: 'node-a',
            canvasUnitKind: 'shot',
            sceneId: 'scene-a',
            shotId: 'shot-a',
          },
        }),
      ],
    });

    expect(projectCanvasCutDraftToStoryboardImport(draft)).toEqual({
      projectName: 'Canvas Route',
      shots: [
        {
          id: 'unit-a',
          shotNumber: 1,
          duration: 2.4,
          imagePath: 'media/opening.mp4',
          dialogue: 'We begin.',
          voiceOver: 'A quiet start.',
          soundCue: 'Low wind.',
          sourceMapping: {
            routeId: 'route-main',
            canvasUnitId: 'unit-a',
            canvasNodeId: 'node-a',
            canvasUnitKind: 'shot',
            sceneId: 'scene-a',
            shotId: 'shot-a',
          },
          label: 'Opening shot',
        },
      ],
    });
  });

  it('resolves project-relative ResourceRef media for Canvas draft import', () => {
    const resourceRef: ResourceRef = {
      id: 'resource-a',
      scope: 'project',
      provider: 'neko-assets',
      kind: 'media',
      source: { kind: 'file', projectRelativePath: 'assets/resource-a.mp4' },
      fingerprint: { strategy: 'hash', value: 'hash-a' },
    };

    const projection = projectCanvasCutDraftToStoryboardImportResult(
      createCanvasDraftPayload({
        units: [createCanvasDraftUnit({ media: [{ role: 'source', resourceRef }] })],
      }),
    );

    expect(projection).toMatchObject({
      ok: true,
      payload: {
        shots: [
          {
            imagePath: 'assets/resource-a.mp4',
          },
        ],
      },
    });
  });

  it('rejects invalid Canvas draft versions, extension namespaces, and full-timeline fields', () => {
    const projection = projectCanvasCutDraftToStoryboardImportResult({
      ...createCanvasDraftPayload({
        extensions: {
          bare: { note: 'bad namespace' },
          'neko.canvas': { tracks: [] },
        },
      }),
      schemaVersion: 999,
    });

    expect(projection.ok).toBe(false);
    expect(projection.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'draft-invalid-schema-version' }),
        expect.objectContaining({ code: 'draft-invalid-extension-namespace' }),
        expect.objectContaining({ code: 'draft-forbidden-extension-field' }),
      ]),
    );
  });

  it('rejects Canvas drafts without importable media', () => {
    const projection = projectCanvasCutDraftToStoryboardImportResult(
      createCanvasDraftPayload({
        units: [createCanvasDraftUnit({ media: [{ role: 'source', sourceRefId: 'node-output' }] })],
      }),
    );

    expect(projection.ok).toBe(false);
    expect(projection.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'draft-missing-media-source', severity: 'error' }),
      ]),
    );
  });

  it('rejects Canvas drafts that carry stale-source diagnostics', () => {
    const projection = projectCanvasCutDraftToStoryboardImportResult(
      createCanvasDraftPayload({
        diagnostics: [
          {
            code: 'draft-stale-source',
            severity: 'error',
            message: 'Source revision is stale.',
          },
        ],
      }),
    );

    expect(projection.ok).toBe(false);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({ code: 'draft-stale-source', severity: 'error' }),
    ]);
  });

  it('builds imported media lineage and minimal Canvas sync payloads', () => {
    const sourceMapping = {
      routeId: 'route-main',
      canvasUnitId: 'unit-a',
      canvasNodeId: 'node-a',
      canvasUnitKind: 'shot' as const,
      sceneId: 'scene-a',
      shotId: 'shot-a',
    };
    const clip = {
      id: 'unit-a',
      path: 'media/opening.mp4',
      name: 'Opening shot',
      duration: 2.4,
      startTime: 5,
      sourceMapping,
    };

    expect(buildStoryboardMediaElement(clip, 1234)).toMatchObject({
      type: 'media',
      src: 'media/opening.mp4',
      name: 'Opening shot',
      lineage: {
        shotNodeId: 'shot-a',
        generationId: '',
        planId: 'route-main',
        routeLevel: 'canvas-route',
        recordedAt: 1234,
      },
    });

    expect(
      buildCanvasDraftTimelineSyncPayload(
        {
          projectName: 'Canvas Route',
          shots: [
            {
              id: 'unit-a',
              shotNumber: 1,
              duration: 2.4,
              imagePath: 'media/opening.mp4',
              sourceMapping,
              label: 'Opening shot',
            },
          ],
        },
        1234,
      ),
    ).toEqual({
      source: 'neko-cut',
      reason: 'storyboard-import',
      shots: [
        {
          shotId: 'shot-a',
          projectName: 'Canvas Route',
          importedAt: 1234,
          duration: 2.4,
          selectedInTimeline: true,
        },
      ],
    });
  });
});

function createCanvasDraftPayload(
  overrides: Partial<CanvasCutDraftPayload> = {},
): CanvasCutDraftPayload {
  return {
    kind: CANVAS_CUT_DRAFT_KIND,
    schemaVersion: CANVAS_CUT_DRAFT_SCHEMA_VERSION,
    source: { canvasUri: 'file:///workspace/story.nkc', revision: 1 },
    route: {
      id: 'route-main',
      title: 'Main route',
      entryUnitId: 'unit-a',
      unitIds: ['unit-a'],
      sourceKind: 'auto-entry',
      totalDurationMs: 2400,
    },
    projectName: 'Canvas Route',
    units: [createCanvasDraftUnit()],
    ...overrides,
  };
}

function createCanvasDraftUnit(
  overrides: Partial<CanvasCutDraftPayload['units'][number]> = {},
): CanvasCutDraftPayload['units'][number] {
  return {
    id: 'unit-a',
    kind: 'shot',
    renderMode: 'story-preview',
    durationMs: 2400,
    label: 'Opening shot',
    media: [{ role: 'source', assetPath: 'media/opening.mp4' }],
    sourceMapping: {
      routeId: 'route-main',
      canvasUnitId: 'unit-a',
      canvasNodeId: 'node-a',
      canvasUnitKind: 'shot',
      shotId: 'shot-a',
    },
    ...overrides,
  };
}
