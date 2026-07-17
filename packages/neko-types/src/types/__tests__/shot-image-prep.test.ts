import { describe, expect, it } from 'vitest';
import { validateGenericTable } from '../composite-artifact';
import { MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID } from '../media-production';
import * as shotImagePrepContract from '../shot-image-prep';
import type { StoryboardMediaRef, StoryboardTable } from '../storyboard-table';
import {
  SHOT_IMAGE_PREP_PROFILE,
  buildShotImagePrepTable,
  deriveShotImagePrepPlansFromStoryboard,
  projectShotImageRegenerationRecommendation,
  transitionShotImagePrepStatus,
  validateShotImagePrepPlan,
  type ShotImagePrepPlan,
} from '../shot-image-prep';

describe('shot image prep contracts', () => {
  it('validates a source-backed transform prep plan with stable refs', () => {
    const plan = makePlan();

    expect(validateShotImagePrepPlan(plan)).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects unsafe runtime handles inside prep refs', () => {
    const plan = makePlan({
      sourceMediaRefs: [
        {
          ...sourceRef,
          locator: {
            type: 'workspace-path',
            path: '/Users/feng/tmp/panel.png',
          },
        },
      ],
    });

    const result = validateShotImagePrepPlan(plan);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsafe-runtime-handle',
          path: ['sourceMediaRefs', 0, 'locator', 'path'],
        }),
      ]),
    );
  });

  it('requires source refs for source-backed image strategies', () => {
    const plan = makePlan({ sourceMediaRefs: [] });

    const result = validateShotImagePrepPlan(plan);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-source-ref',
          path: ['sourceMediaRefs'],
        }),
      ]),
    );
  });

  it('rejects character and scene refs with incompatible entity kinds', () => {
    const plan = makePlan({
      referenceBundle: {
        characterRefs: [
          {
            entityRef: { entityId: 'scene-1', entityKind: 'scene' },
          },
        ],
        sceneRefs: [
          {
            entityRef: { entityId: 'char-rin', entityKind: 'character' },
          },
        ],
      },
    });

    const result = validateShotImagePrepPlan(plan);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.code === 'invalid-entity-ref'),
    ).toHaveLength(2);
  });

  it('reports oversized payloads without losing bounded diagnostics', () => {
    const plan = makePlan({
      metadata: {
        note: 'x'.repeat(256),
      },
    });

    const result = validateShotImagePrepPlan(plan, { maxSerializedBytes: 128 });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('oversized-payload');
  });

  it('warns when source-backed prep lacks perception evidence and policy asks for it', () => {
    const result = validateShotImagePrepPlan(makePlan(), {
      requirePerceptionForSourceBacked: true,
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'missing-perception-card',
        }),
      ]),
    );
  });

  it('defines a shared media-production.shot-image-prep table profile', () => {
    const table = buildShotImagePrepTable([makePlan()], { includeProfileVersion: true });

    expect(SHOT_IMAGE_PREP_PROFILE.profileId).toBe(MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID);
    expect(table.profile).toBe(MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID);
    expect(shotImagePrepContract).not.toHaveProperty('COMIC_SHOT_ASSET_PREP_PROFILE');
    expect(shotImagePrepContract).not.toHaveProperty('COMIC_SHOT_ASSET_PREP_PROFILE_ID');

    const result = validateGenericTable(table, {
      profiles: [SHOT_IMAGE_PREP_PROFILE],
      persisted: true,
      resolvedSchemaRefs: [
        'neko.shot-image-prep.image-audit',
        'neko.shot-image-prep.mask-refs',
        'neko.shot-image-prep.reference-bundle',
      ],
    });

    expect(result).toEqual({ ok: true, diagnostics: [] });
    expect(table.columns.map((column) => column.columnId)).toEqual(
      expect.arrayContaining([
        'shotId',
        'imageStrategy',
        'operationPlan',
        'imageAudit',
        'regenerationRecommendation',
        'status',
      ]),
    );
    expect(table.rows[0]?.cells['status']).toEqual({ type: 'status', value: 'planned' });
    expect(table.rows[0]?.cells['regenerationRecommendation']).toEqual({
      type: 'status',
      value: 'Recommend editing source image',
    });
    expect(table.rows[0]?.metadata?.['regenerationRecommendation']).toMatchObject({
      decision: 'transform-source',
    });
  });

  it('diagnoses malformed prep profile tables', () => {
    const table = buildShotImagePrepTable([makePlan()], { includeProfileVersion: true });
    const result = validateGenericTable(
      {
        ...table,
        columns: table.columns.filter((column) => column.columnId !== 'status'),
        rows: [
          {
            rowId: 'row-1',
            cells: {
              shotId: { type: 'number', value: 1 },
              imageStrategy: { type: 'enum', value: 'generate-new' },
              operationPlan: { type: 'tags', value: ['generate-keyframe'] },
              output: {
                type: 'media-preview',
                value: {
                  itemId: 'video-output',
                  mediaType: 'video',
                  resourceRef: { kind: 'tool-result', toolCallId: 'call-video' },
                },
              },
            },
            actions: [{ actionId: 'unknown-action', kind: 'execute' }],
          },
        ],
      },
      {
        profiles: [SHOT_IMAGE_PREP_PROFILE],
        persisted: true,
        resolvedSchemaRefs: [
          'neko.shot-image-prep.image-audit',
          'neko.shot-image-prep.mask-refs',
          'neko.shot-image-prep.reference-bundle',
        ],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'profile-column-mismatch',
        'profile-cell-type-mismatch',
        'profile-required-cell-missing',
        'profile-resource-modality-mismatch',
        'invalid-profile',
      ]),
    );
  });

  it('rejects output refs before prep execution succeeds', () => {
    const result = validateShotImagePrepPlan({
      ...makePlan(),
      outputMediaRefs: [{ ...sourceRef, refId: 'generated-1', role: 'generated' }],
      status: 'running',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-required-field',
          path: ['outputMediaRefs'],
        }),
      ]),
    );
  });

  it('accepts comic page normalization and panel splitting operations', () => {
    const plan = makePlan({
      operationPlan: [
        'crop-panel',
        'rotate',
        'split-panels',
        'remove-text',
        'inpaint',
        'outpaint',
        'colorize',
      ],
    });

    expect(validateShotImagePrepPlan(plan)).toEqual({ ok: true, diagnostics: [] });
  });

  it('derives prep plans from storyboard shots without mutating storyboard data', () => {
    const table = makeStoryboard();
    const before = JSON.parse(JSON.stringify(table));

    const result = deriveShotImagePrepPlansFromStoryboard({
      table,
      storyboardId: 'storyboard-1',
      requirePerceptionForSourceBacked: true,
    });

    expect(table).toEqual(before);
    expect(result.plans).toHaveLength(2);
    expect(result.plans[0]).toMatchObject({
      storyboardId: 'storyboard-1',
      sceneId: 'scene-1',
      shotId: 'shot-transform',
      imageStrategy: 'transform-original',
      operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
      perceptionCardRefs: [{ assetId: 'asset-panel-1', cacheKey: 'panel-v1' }],
      metadata: {
        regenerationRecommendation: {
          decision: 'transform-source',
        },
      },
    });
    expect(result.plans[1]).toMatchObject({
      shotId: 'shot-generate',
      imageStrategy: 'generate-new',
      sourceMediaRefs: [],
      operationPlan: ['generate-keyframe'],
      metadata: {
        regenerationRecommendation: {
          decision: 'regenerate',
        },
      },
    });
  });

  it('derives comic image audit operations from storyboard extensions', () => {
    const result = deriveShotImagePrepPlansFromStoryboard({
      table: makeStoryboardWithComicImageAudit(),
      storyboardId: 'storyboard-1',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      shotId: 'shot-audit',
      imageStrategy: 'transform-original',
      operationPlan: [
        'crop-panel',
        'rotate',
        'split-panels',
        'remove-text',
        'inpaint',
        'outpaint',
        'colorize',
        'upscale',
      ],
      metadata: {
        imageAudit: {
          orientation: 'rotate-90',
          panelCount: 3,
          derivedShotCount: 3,
          requiresSplit: true,
          requiresColorize: true,
          requiresOutpaint: true,
          sourceImageGroupId: 'page-1',
          sourcePageRefId: 'page-1-image',
        },
        regenerationRecommendation: {
          decision: 'transform-source',
        },
      },
    });
    expect(buildShotImagePrepTable(result.plans).rows[0]?.cells['imageAudit']).toEqual({
      type: 'json',
      value: expect.objectContaining({
        orientation: 'rotate-90',
        panelCount: 3,
        derivedShotCount: 3,
      }),
      schemaRef: 'neko.shot-image-prep.image-audit',
    });
  });

  it('projects image regeneration recommendations from prep strategy and diagnostics', () => {
    expect(projectShotImageRegenerationRecommendation(makePlan())).toMatchObject({
      decision: 'transform-source',
    });
    expect(
      projectShotImageRegenerationRecommendation(
        makePlan({
          imageStrategy: 'generate-new',
          sourceMediaRefs: [],
          operationPlan: ['generate-keyframe'],
        }),
      ),
    ).toMatchObject({
      decision: 'regenerate',
    });
    expect(
      projectShotImageRegenerationRecommendation(
        makePlan({
          imageStrategy: 'reuse-original',
          operationPlan: ['crop-panel'],
        }),
      ),
    ).toMatchObject({
      decision: 'not-needed',
    });
    expect(
      projectShotImageRegenerationRecommendation(
        makePlan({
          diagnostics: [
            {
              severity: 'error',
              code: 'provider-unavailable',
              path: ['providerId'],
              message: 'Provider unavailable.',
            },
          ],
        }),
      ),
    ).toMatchObject({
      decision: 'blocked',
      reason: 'Provider unavailable.',
    });
  });

  it('transitions prep status through approval and execution actions', () => {
    expect(transitionShotImagePrepStatus('planned', 'approve-shot-prep')).toBe('approved');
    expect(transitionShotImagePrepStatus('approved', 'run-shot-prep')).toBe('queued');
    expect(transitionShotImagePrepStatus('running', 'reject-shot-prep')).toBe('skipped');
    expect(transitionShotImagePrepStatus('succeeded', 'edit-shot-prep')).toBe('needs-approval');
    expect(transitionShotImagePrepStatus('approved', 'estimate-batch-cost')).toBe('approved');
  });
});

const sourceRef: StoryboardMediaRef = {
  refId: 'source-panel-1',
  role: 'source',
  locator: {
    type: 'tool-result',
    toolCallId: 'read-comic',
    assetIndex: 0,
  },
  label: 'Panel 1',
  mimeType: 'image/png',
};

function makePlan(overrides: Partial<ShotImagePrepPlan> = {}): ShotImagePrepPlan {
  return {
    schemaVersion: 1,
    kind: 'shot-image-prep-plan',
    planId: 'shot-1-image-prep',
    sceneId: 'scene-1',
    shotId: 'shot-1',
    sourceMediaRefs: [sourceRef],
    imageStrategy: 'transform-original',
    operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
    referenceBundle: {
      sourcePanelRefs: [sourceRef],
      characterRefs: [
        {
          entityRef: { entityId: 'char-rin', entityKind: 'character' },
          role: 'identity',
          assetRefs: [sourceRef],
          memoryObservationIds: ['obs-rin-1'],
        },
      ],
      sceneRefs: [
        {
          entityRef: { entityId: 'loc-street', entityKind: 'location' },
          role: 'layout',
          semanticIndexRefs: ['semantic-panel-1'],
        },
      ],
    },
    status: 'planned',
    ...overrides,
  };
}

function makeStoryboard(): StoryboardTable {
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    profile: 'from-comic',
    sourceProfile: 'from-comic',
    title: 'Comic shots',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Scene',
        shots: [
          {
            shotId: 'shot-transform',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'Clean and colorize the source panel.',
            characterAction: 'Rin looks back.',
            imageStrategy: 'transform-original',
            sourceMediaRefs: [sourceRef],
            generationPrompt: 'clean anime keyframe',
            characters: [
              {
                name: 'Rin',
                entityRef: { entityId: 'char-rin', entityKind: 'character' },
              },
            ],
            extensions: {
              'neko.perception': {
                perceptionCardRefs: [{ assetId: 'asset-panel-1', cacheKey: 'panel-v1' }],
              },
            },
          },
          {
            shotId: 'shot-generate',
            shotNumber: 2,
            duration: 2,
            visualDescription: 'A new establishing shot.',
            characterAction: 'The city appears.',
            imageStrategy: 'generate-new',
            generationPrompt: 'wide city establishing shot',
          },
        ],
      },
    ],
  };
}

function makeStoryboardWithComicImageAudit(): StoryboardTable {
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    profile: 'from-comic',
    sourceProfile: 'from-comic',
    title: 'Comic shot audit',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Page 1',
        shots: [
          {
            shotId: 'shot-audit',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'Panel needs rotation, split, cleanup, color, and expansion.',
            characterAction: 'Rin turns toward the light.',
            imageStrategy: 'transform-original',
            sourceMediaRefs: [sourceRef],
            extensions: {
              'neko.comicImageAudit': {
                orientation: 'rotate-90',
                panelCount: 3,
                derivedShotCount: 3,
                requiresSplit: true,
                requiresTextRemoval: true,
                requiresInpaint: true,
                requiresOutpaint: true,
                requiresColorize: true,
                requiredOperations: ['upscale', 'unknown-operation'],
                sourceImageGroupId: 'page-1',
                sourcePageRefId: 'page-1-image',
              },
            },
          },
        ],
      },
    ],
  };
}
