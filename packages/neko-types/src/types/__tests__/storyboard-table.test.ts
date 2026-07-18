import { describe, expect, it } from 'vitest';
import type {
  StoryboardTableProfile,
  StoryboardTable,
  StoryboardValidationDiagnostic,
} from '../storyboard-table';
import {
  STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
  STORYBOARD_GENERATED_MEDIA_ROLES,
  STORYBOARD_SCENE_REQUIRED_FIELDS,
  STORYBOARD_SHOT_IMAGE_STRATEGIES,
  STORYBOARD_SHOT_REQUIRED_FIELDS,
  STORYBOARD_SOURCE_MEDIA_ROLES,
  STORYBOARD_TABLE_PROFILES,
  STORYBOARD_TABLE_REQUIRED_FIELDS,
  classifyStoryboardMediaIdentity,
  interpretStoryboardImageStrategies,
  normalizeCanonicalStoryboardTable,
  normalizeStoryboardTable,
  projectStoryboardTableToCutPayload,
  validateStoryboardTable,
  validateCanonicalStoryboardTable,
} from '../storyboard-table';

describe('storyboard table contract', () => {
  it('defines stable-core required fields as shared constants', () => {
    expect(STORYBOARD_TABLE_REQUIRED_FIELDS).toEqual(['schemaVersion', 'kind', 'title', 'scenes']);
    expect(STORYBOARD_SCENE_REQUIRED_FIELDS).toEqual(['sceneId', 'sceneTitle', 'shots']);
    expect(STORYBOARD_SHOT_REQUIRED_FIELDS).toEqual([
      'shotNumber',
      'duration',
      'visualDescription',
      'characterAction',
      'imageStrategy',
    ]);
    expect(STORYBOARD_TABLE_PROFILES).toContain('from-comic');
    expect(STORYBOARD_TABLE_PROFILES).not.toContain('manga-to-video');
  });

  it('rejects removed puppet representations from active voice cue requests', () => {
    const result = normalizeStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Removed representation',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 1,
                visualDescription: 'A character speaks.',
                characterAction: 'Speaks.',
                imageStrategy: 'generate-new',
                voiceCues: [
                  {
                    cueId: 'voice-1',
                    kind: 'dialogue',
                    text: 'Hello.',
                    requestedRepresentationKind: 'puppet-bone',
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]?.voiceCues?.[0]).not.toHaveProperty(
      'requestedRepresentationKind',
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-required-field',
          path: ['scenes', 0, 'shots', 0, 'voiceCues', 0, 'requestedRepresentationKind'],
        }),
      ]),
    );
  });

  it('accepts a strict semantic storyboard table with layered media refs', () => {
    const profile: StoryboardTableProfile = 'from-comic';
    const table: StoryboardTable = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      profile,
      sourceProfile: STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
      source: {
        type: 'document',
        sourceUri: '${WORKSPACE}/books/page-01.cbz',
      },
      title: 'Opening sequence',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Rin finds the signal',
          sceneNumber: 1,
          shots: [
            {
              shotId: 'scene-1-shot-1',
              shotNumber: 1,
              duration: 4,
              visualDescription: 'A wide dusk frame of Rin finding a broken radio.',
              characters: [{ name: 'Rin', role: 'primary', emotion: 'curious' }],
              shotScale: 'LS',
              characterAction: 'Rin kneels beside the radio.',
              emotion: ['curious'],
              sceneTags: ['dusk', 'radio'],
              imageStrategy: 'use-as-reference',
              generationPrompt: 'anime dusk field, broken radio, cinematic wide shot',
              decisionReason: 'The source panel is useful for layout, but needs a video keyframe.',
              sourceMediaRefs: [
                {
                  refId: 'source-panel-1',
                  role: 'source',
                  locator: {
                    type: 'tool-result',
                    toolCallId: 'read-document-1',
                    assetIndex: 0,
                  },
                  label: 'Original panel',
                  mimeType: 'image/jpeg',
                },
              ],
              generatedMediaRefs: [
                {
                  refId: 'generated-keyframe-1',
                  role: 'generated',
                  locator: {
                    type: 'asset',
                    assetId: 'asset-keyframe-1',
                    uri: '${WORKSPACE}/.neko/generated/image/keyframe-1.png',
                  },
                  metadata: { provider: 'test-provider', selected: true },
                },
              ],
              extensions: {
                'neko.fromComic': {
                  panelId: 'page-01-panel-02',
                  motionHint: 'slow push-in',
                },
              },
            },
          ],
        },
      ],
      extensions: {
        'neko.storyboardTable': {
          authoringMode: 'agent-plan',
        },
      },
    };

    expect(table.profile).toBe('from-comic');
    expect(table.sourceProfile).toBe(STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID);
    expect(table.scenes[0]?.shots[0]?.sourceMediaRefs?.[0]?.locator.type).toBe('tool-result');
    expect(JSON.parse(JSON.stringify(table))).toEqual(table);
  });

  it('exports strategy and layered media role constants for validators', () => {
    expect(STORYBOARD_SHOT_IMAGE_STRATEGIES).toContain('transform-original');
    expect(STORYBOARD_SOURCE_MEDIA_ROLES).toEqual(['source', 'reference', 'thumbnail', 'mask']);
    expect(STORYBOARD_GENERATED_MEDIA_ROLES).toEqual(['generated', 'derived', 'thumbnail', 'mask']);
  });

  it('models graded diagnostics without Agent or Webview dependencies', () => {
    const diagnostic: StoryboardValidationDiagnostic = {
      severity: 'profileHint',
      code: 'missing-profile-field',
      path: ['scenes', 0, 'shots', 0, 'cameraAngle'],
      message: 'script-breakdown profile recommends cameraAngle.',
      expected: 'cameraAngle for script-breakdown profile',
      details: { profile: 'script-breakdown' },
    };

    expect(diagnostic.severity).toBe('profileHint');
    expect(JSON.parse(JSON.stringify(diagnostic))).toEqual(diagnostic);
  });

  it('reports stable-core required field errors as projection blockers', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Broken',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'wide frame',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'missing-required-field',
          path: ['scenes', 0, 'shots', 0, 'visualDescription'],
        }),
      ]),
    );
  });

  it('rejects flat scene rows at the canonical Storyboard handoff boundary', () => {
    const result = normalizeCanonicalStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Flat canonical input',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A cat enters.',
            characterAction: 'The cat walks.',
            imageStrategy: 'generate-new',
          },
        ],
      },
    });

    expect(result.table).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canonical-scene-shot-hierarchy-required',
        path: ['scenes', 0, 'shots'],
      }),
    ]);
  });

  it('normalizes flat storyboard shot rows mistakenly placed in scenes', () => {
    const result = normalizeStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        profile: 'from-comic',
        sourceProfile: STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
        title: 'P11-P20',
        scenes: [
          {
            sceneId: 'page-11',
            sceneTitle: 'P11',
            shotNumber: 1,
            duration: 3,
            sourcePage: 'P11',
            visualDescription: 'Panel P11 establishes the street.',
            characterAction: 'The character enters the street.',
            imageStrategy: 'use-as-reference',
            sourceMediaRefs: [
              {
                refId: 'source-p11',
                role: 'source',
                locator: {
                  type: 'tool-result',
                  toolCallId: 'readimage-current-result',
                  assetIndex: 0,
                },
                mimeType: 'image/png',
              },
            ],
          },
          {
            sceneId: 'page-11',
            sceneTitle: 'P11',
            shotNumber: 2,
            duration: 2,
            sourcePage: 'P11',
            visualDescription: 'Panel P11 close-up reaction.',
            characterAction: 'The character reacts.',
            imageStrategy: 'reuse-original',
            sourceMediaRefs: [
              {
                refId: 'source-p11-close',
                role: 'source',
                locator: {
                  type: 'tool-result',
                  toolCallId: 'readimage-current-result',
                  assetIndex: 0,
                },
                mimeType: 'image/png',
              },
            ],
          },
          {
            sceneId: 'page-12',
            sceneTitle: 'P12',
            shotNumber: 3,
            duration: 3,
            sourcePage: 'P12',
            visualDescription: 'Panel P12 shows the next beat.',
            characterAction: 'The character turns around.',
            imageStrategy: 'use-as-reference',
            sourceMediaRefs: [
              {
                refId: 'source-p12',
                role: 'source',
                locator: {
                  type: 'tool-result',
                  toolCallId: 'readimage-current-result',
                  assetIndex: 1,
                },
                mimeType: 'image/png',
              },
            ],
          },
        ],
      },
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(result.table?.scenes).toHaveLength(2);
    expect(result.table?.scenes[0]).toMatchObject({
      sceneId: 'page-11',
      sceneTitle: 'P11',
      shots: [
        {
          shotNumber: 1,
          visualDescription: 'Panel P11 establishes the street.',
          sourceMediaRefs: [
            {
              locator: {
                type: 'tool-result',
                toolCallId: 'readimage-current-result',
                assetIndex: 0,
              },
            },
          ],
        },
        {
          shotNumber: 2,
          visualDescription: 'Panel P11 close-up reaction.',
        },
      ],
    });
    expect(result.table?.scenes[1]?.shots[0]).toMatchObject({
      shotNumber: 3,
      sourceMediaRefs: [
        {
          locator: {
            type: 'tool-result',
            toolCallId: 'readimage-current-result',
            assetIndex: 1,
          },
        },
      ],
    });
    expect(validateStoryboardTable(result.table).ok).toBe(true);
  });

  it('keeps profile recommendations non-blocking', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      profile: 'script-breakdown',
      title: 'Profile hints',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'wide frame',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'profileHint',
          code: 'missing-profile-field',
          path: ['scenes', 0, 'shots', 0, 'cameraAngle'],
        }),
      ]),
    );
  });

  it('treats source-based image strategies without source refs as projection blockers', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Missing source',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'reuse-original',
              decisionReason: 'The source panel is available in the previous message.',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'image-strategy-missing-source',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs'],
        }),
      ]),
    );
  });

  it('keeps decisionReason as display metadata, not validation input', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Reason only',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              decisionReason: 'Generate from the source panel instead of text.',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'image-strategy-missing-prompt',
          path: ['scenes', 0, 'shots', 0, 'imagePrompt'],
        }),
      ]),
    );
  });

  it('rejects scene-level video prompts duplicated or stored on later shots', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Invalid scene video prompts',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              imagePrompt: 'Create the first frame.',
              videoPrompt: 'Animate the whole scene.',
            },
            {
              shotNumber: 2,
              duration: 3,
              visualDescription: 'The signal flashes.',
              characterAction: 'Rin turns toward the signal.',
              imageStrategy: 'generate-new',
              imagePrompt: 'Create the second frame.',
              videoPrompt: 'Legacy per-shot video prompt must be rejected.',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'invalid-scene-video-prompt',
          path: ['scenes', 0, 'shots', 0, 'videoPrompt'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'invalid-scene-video-prompt',
          path: ['scenes', 0, 'shots', 1, 'videoPrompt'],
        }),
      ]),
    );
  });

  it('rejects unsafe media references in structured storyboard payloads', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Unsafe refs',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Panel.',
              characterAction: 'Character waits.',
              imageStrategy: 'reuse-original',
              sourceMediaRefs: [
                {
                  refId: 'abs-path',
                  role: 'source',
                  locator: { type: 'workspace-path', path: '/tmp/cache/page.jpg' },
                },
                {
                  refId: 'asset-localhost',
                  role: 'reference',
                  locator: {
                    type: 'asset',
                    assetId: 'asset-1',
                    uri: 'http://localhost:3000/image.png',
                  },
                },
                {
                  refId: 'data-url',
                  role: 'thumbnail',
                  locator: { type: 'workspace-path', path: 'data:image/png;base64,abc' },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.filter((item) => item.code === 'unsafe-media-ref').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('classifies storyboard media identity without package-specific dependencies', () => {
    expect(
      classifyStoryboardMediaIdentity(
        {
          refId: 'page-1',
          role: 'source',
          locator: { type: 'tool-result', toolCallId: 'read-document-1', assetIndex: 0 },
          label: 'P1',
        },
        { knownToolCallIds: ['read-document-1'] },
      ),
    ).toMatchObject({ kind: 'stable', toolCallId: 'read-document-1' });

    expect(
      classifyStoryboardMediaIdentity(
        {
          refId: 'page-1',
          role: 'source',
          locator: { type: 'tool-result', toolCallId: 'fabricated-call', assetIndex: 0 },
        },
        { knownToolCallIds: ['read-document-1'] },
      ),
    ).toMatchObject({ kind: 'unresolved-tool-result', toolCallId: 'fabricated-call' });

    expect(
      classifyStoryboardMediaIdentity(
        {
          refId: 'page_1',
          role: 'source',
          locator: { type: 'tool-result', toolCallId: 'read-document-1', assetIndex: 0 },
        },
        { ambiguousAliases: ['P1', 'page_1'] },
      ),
    ).toMatchObject({ kind: 'ambiguous-alias', alias: 'page_1' });

    expect(
      classifyStoryboardMediaIdentity({
        refId: 'cache-path',
        role: 'source',
        locator: {
          type: 'workspace-path',
          path: '${WORKSPACE}/.neko/.cache/resources/documents/doc_1/page.jpg',
        },
      }),
    ).toMatchObject({ kind: 'unsafe-cache-path' });

    expect(
      classifyStoryboardMediaIdentity({
        refId: 'runtime-uri',
        role: 'source',
        locator: {
          type: 'asset',
          assetId: 'asset-1',
          uri: 'vscode-webview-resource://neko/page.jpg',
        },
      }),
    ).toMatchObject({ kind: 'runtime-only' });

    expect(
      classifyStoryboardMediaIdentity({
        refId: 'asset-stable',
        role: 'source',
        locator: { type: 'asset', assetId: 'asset-1', uri: '${WORKSPACE}/assets/page.jpg' },
      }),
    ).toMatchObject({ kind: 'stable' });
  });

  it('rejects runtime handles and fabricated tool ids as storyboard media identity', () => {
    const result = validateStoryboardTable(
      {
        schemaVersion: 1,
        kind: 'storyboard-table',
        sourceProfile: 'from-comic',
        title: 'Runtime refs',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Panel one.',
                characterAction: 'Character waits.',
                imageStrategy: 'reuse-original',
                sourceMediaRefs: [
                  {
                    refId: 'webview',
                    role: 'source',
                    locator: {
                      type: 'asset',
                      assetId: 'asset-webview',
                      uri: 'vscode-webview://neko/page.jpg',
                    },
                  },
                  {
                    refId: 'blob',
                    role: 'source',
                    locator: { type: 'workspace-path', path: 'blob:https://neko.local/page' },
                  },
                  {
                    refId: 'object',
                    role: 'source',
                    locator: { type: 'workspace-path', path: 'object://preview/page' },
                  },
                  {
                    refId: 'fabricated',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'missing-tool-call',
                      assetIndex: 0,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      { knownToolCallIds: ['read-document-1'] },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'runtime-only-media-ref',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 0, 'locator'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'runtime-only-media-ref',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 1, 'locator'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'runtime-only-media-ref',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 2, 'locator'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'unresolved-tool-result',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 3, 'locator'],
        }),
      ]),
    );
  });

  it('reports ambiguous aliases when validation receives request-scoped alias context', () => {
    const result = validateStoryboardTable(
      {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Ambiguous alias',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Panel one.',
                characterAction: 'Character waits.',
                imageStrategy: 'reuse-original',
                sourceMediaRefs: [
                  {
                    refId: 'P1',
                    role: 'source',
                    locator: {
                      type: 'tool-result',
                      toolCallId: 'read-document-1',
                      assetIndex: 0,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      { ambiguousAliases: ['page_1', 'p1'] },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'ambiguous-media-alias',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 0, 'locator'],
        }),
      ]),
    );
  });

  it('blocks generation when confirmation policy is pending', () => {
    const result = interpretStoryboardImageStrategies({
      table: storyboardTable({ imageStrategy: 'generate-new', generationPrompt: 'frame' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
      userOverride: {
        generationPolicy: 'confirm',
        source: 'webview-confirmation',
      },
    });

    expect(result.actions).toEqual([]);
    expect(result.blockedActions[0]).toMatchObject({
      reason: 'confirmation-required',
      imageStrategy: 'generate-new',
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'generation-confirmation-required',
      }),
    ]);
  });

  it('rejects unsafe media refs and layered role drift', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Unsafe refs',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'reuse-original',
              sourceMediaRefs: [
                {
                  refId: 'generated-in-source',
                  role: 'generated',
                  locator: {
                    type: 'workspace-path',
                    path: '/tmp/fake.png',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'media-ref-role-mismatch',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 0, 'role'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'unsafe-media-ref',
          path: ['scenes', 0, 'shots', 0, 'sourceMediaRefs', 0, 'locator'],
        }),
      ]),
    );
  });

  it('rejects pre-schema storyboard section payloads', () => {
    const result = normalizeStoryboardTable({
      value: {
        template: 'storyboard-table',
        title: 'Old sections',
        sections: [
          {
            heading: 'Shot 1',
            content: 'Use original panel, then generated keyframe.',
            mediaRefs: [
              { toolCallId: 'read-panel', assetIndex: 0, role: 'original', caption: '原图' },
              { toolCallId: 'generate-shot', assetIndex: 1, role: 'generated' },
            ],
          },
        ],
      },
    });

    expect(result.table).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'invalid-root',
        path: [],
      }),
    ]);
  });

  it('splits schema v1 mediaRefs when layered refs are absent', () => {
    const result = normalizeStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Mixed',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Rin looks up.',
                characterAction: 'Rin looks up.',
                imageStrategy: 'reuse-original',
                mediaRefs: [
                  {
                    refId: 'source-1',
                    role: 'source',
                    locator: { type: 'tool-result', toolCallId: 'read-1', assetIndex: 0 },
                  },
                  {
                    refId: 'generated-1',
                    role: 'generated',
                    locator: { type: 'asset', assetId: 'asset-1' },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]?.sourceMediaRefs?.map((ref) => ref.refId)).toEqual([
      'source-1',
    ]);
    expect(result.table?.scenes[0]?.shots[0]?.generatedMediaRefs?.map((ref) => ref.refId)).toEqual([
      'generated-1',
    ]);
  });

  it('preserves model-authored image alias fields as extension metadata', () => {
    const result = normalizeStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Alias',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Use the first page.',
                characterAction: 'The character looks up.',
                imageStrategy: 'use-as-reference',
                page_1: true,
                panel2: 'selected',
                image_3: false,
              },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]?.extensions).toMatchObject({
      'neko.storyboardImageAlias': {
        kind: 'page',
        number: 1,
        key: 'page_1',
        aliases: [
          { kind: 'page', number: 1, key: 'page_1' },
          { kind: 'panel', number: 2, key: 'panel2' },
        ],
      },
    });
  });

  it('preserves model-authored source page fields as extension metadata', () => {
    const result = normalizeStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Source Page',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Use page six.',
                characterAction: 'The character walks through the village.',
                imageStrategy: 'use-as-reference',
                sourcePage: 'P6',
              },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]?.extensions).toMatchObject({
      'neko.storyboardSourceImage': {
        kind: 'page',
        number: 6,
        key: 'P6',
        sourceField: 'sourcePage',
      },
    });
  });

  it('rejects non-serializable or un-namespaced extensions', () => {
    const result = validateStoryboardTable({
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Extensions',
      extensions: {
        custom: { unsafe: true },
        'neko.bad': () => 'not serializable',
      },
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Rin looks up.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              generationPrompt: 'wide frame',
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'invalid-extension-namespace',
          path: ['extensions', 'custom'],
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'non-serializable-extension',
          path: ['extensions', 'neko.bad'],
        }),
      ]),
    );
  });

  it('normalizes classified OCR text cues and warns on conflicting speaker ids', () => {
    const result = normalizeStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Text Cues',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Rin reads a glowing sign.',
                characterAction: 'Rin reacts to a warning.',
                imageStrategy: 'generate-new',
                generationPrompt: 'manga panel',
                textCues: [
                  {
                    cueId: 'text-1',
                    kind: 'dialogue',
                    text: 'Run!',
                    speakerName: 'Rin',
                    speakerCharacterId: 'char-rin',
                    speakerEntityRef: { entityId: 'char-aki', entityKind: 'character' },
                    confidence: 0.8,
                  },
                  {
                    cueId: 'text-2',
                    kind: 'backgroundText',
                    text: 'KEEP OUT',
                    sourceRefId: 'panel-1',
                  },
                  {
                    cueId: 'bad-kind',
                    kind: 'subtitle',
                    text: 'drop me',
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]?.textCues).toEqual([
      {
        cueId: 'text-1',
        kind: 'dialogue',
        text: 'Run!',
        speakerName: 'Rin',
        speakerCharacterId: 'char-rin',
        speakerEntityRef: { entityId: 'char-aki', entityKind: 'character' },
        confidence: 0.8,
      },
      {
        cueId: 'text-2',
        kind: 'backgroundText',
        text: 'KEEP OUT',
        sourceRefId: 'panel-1',
      },
    ]);
    expect(validateStoryboardTable(result.table).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'invalid-required-field',
          path: ['scenes', 0, 'shots', 0, 'textCues', 0, 'speakerEntityRef'],
        }),
      ]),
    );
  });

  it('projects valid semantic tables to Cut payloads', () => {
    const table: StoryboardTable = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Projection',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotId: 'shot-1',
              shotNumber: 1,
              duration: 4,
              visualDescription: 'Rin looks up.',
              characters: [
                {
                  characterId: 'char-rin',
                  entityRef: { entityId: 'char-rin', entityKind: 'character' },
                  candidateId: 'candidate-rin',
                  name: 'Rin',
                  role: 'primary',
                  action: 'Looks up',
                  emotion: 'curious',
                  continuityNotes: 'Keep the blue scarf.',
                  appearanceNotes: 'Short hair, blue scarf.',
                },
              ],
              shotScale: 'CU',
              characterAction: 'Rin looks up.',
              emotion: ['curious'],
              sceneTags: ['signal'],
              dialogue: 'What is that?',
              textCues: [
                {
                  cueId: 'shot-1-text-1',
                  kind: 'dialogue',
                  text: 'What is that?',
                  speakerName: 'Rin',
                  speakerCharacterId: 'char-rin',
                  speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
                  sourceRefId: 'panel-1',
                  confidence: 0.9,
                  emotion: 'curious',
                  delivery: 'quietly',
                },
                {
                  cueId: 'shot-1-text-2',
                  kind: 'sfx',
                  text: 'Zzz',
                  sourceRefId: 'panel-1',
                },
              ],
              voiceCues: [
                {
                  cueId: 'shot-1-dialogue-1',
                  kind: 'dialogue',
                  text: 'What is that?',
                  speakerName: 'Rin',
                  speakerCharacterId: 'char-rin',
                  speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
                  emotion: 'curious',
                  delivery: 'quietly',
                },
              ],
              voiceOver: 'The signal returns.',
              soundCue: 'Radio static.',
              generationPrompt: 'close-up anime frame',
              imageStrategy: 'generate-new',
              extensions: {
                'neko.shotImagePrep': {
                  schemaVersion: 1,
                  kind: 'shot-image-prep-plan',
                  planId: 'shot-1-image-prep',
                  sceneId: 'scene-1',
                  shotId: 'shot-1',
                  sourceMediaRefs: [],
                  imageStrategy: 'generate-new',
                  operationPlan: ['generate-keyframe'],
                  status: 'planned',
                },
              },
              generatedMediaRefs: [
                {
                  refId: 'asset-1',
                  role: 'generated',
                  locator: {
                    type: 'workspace-path',
                    path: '${WORKSPACE}/.neko/generated/image/shot-1.png',
                  },
                  mimeType: 'image/png',
                },
              ],
            },
          ],
        },
      ],
    };

    expect(projectStoryboardTableToCutPayload(table)).toEqual({
      projectName: 'Projection',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 4,
          dialogue: 'What is that?',
          textCues: [
            {
              cueId: 'shot-1-text-1',
              kind: 'dialogue',
              text: 'What is that?',
              speakerName: 'Rin',
              speakerCharacterId: 'char-rin',
              speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
              sourceRefId: 'panel-1',
              confidence: 0.9,
              emotion: 'curious',
              delivery: 'quietly',
            },
            {
              cueId: 'shot-1-text-2',
              kind: 'sfx',
              text: 'Zzz',
              sourceRefId: 'panel-1',
            },
          ],
          voiceCues: [
            {
              cueId: 'shot-1-dialogue-1',
              kind: 'dialogue',
              text: 'What is that?',
              speakerName: 'Rin',
              speakerCharacterId: 'char-rin',
              speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
              emotion: 'curious',
              delivery: 'quietly',
            },
          ],
          voiceOver: 'The signal returns.',
          soundCue: 'Radio static.',
          label: '#001 Scene',
          imagePath: '${WORKSPACE}/.neko/generated/image/shot-1.png',
        },
      ],
    });
  });

  it('normalizes and projects shot character candidate ids without requiring entity refs', () => {
    const result = normalizeStoryboardTable({
      value: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Candidate projection',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Scene',
            shots: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Rin enters.',
                characterAction: 'Rin enters.',
                imageStrategy: 'generate-new',
                characters: [
                  {
                    characterName: 'Rin',
                    candidateId: ' candidate-rin ',
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.table?.scenes[0]?.shots[0]?.characters).toEqual([
      {
        candidateId: 'candidate-rin',
        name: 'Rin',
      },
    ]);
  });

  it('accepts stable document and resource refs as storyboard image identity', () => {
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'OPS/page-1.jpg',
      cachePath: '/tmp/neko-cache/page-1.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const table = storyboardTable({
      imageStrategy: 'reuse-original',
      sourceMediaRefs: [
        {
          refId: 'page-1',
          role: 'source',
          locator: { type: 'tool-result', toolCallId: 'read-document-1', assetIndex: 0 },
          mimeType: 'image/jpeg',
          documentResourceRef,
        },
      ],
    });

    expect(validateStoryboardTable(table, { knownToolCallIds: ['read-document-1'] }).ok).toBe(true);
    expect(table.scenes[0]?.shots[0]?.sourceMediaRefs?.[0]?.documentResourceRef).toEqual(
      documentResourceRef,
    );
  });

  it('interprets image strategies without scheduling generation for reuse-original', () => {
    const table = storyboardTable({
      imageStrategy: 'reuse-original',
      sourceMediaRefs: [sourceMediaRef('source-1')],
    });

    const result = interpretStoryboardImageStrategies({
      table,
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });

    expect(result.blockedActions).toEqual([]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'reuse-original',
        imageStrategy: 'reuse-original',
        sourceMediaRefs: [sourceMediaRef('source-1')],
      }),
    ]);
  });

  it('requires prompt, source refs, allowed generation, and provider capability', () => {
    const missingPrompt = interpretStoryboardImageStrategies({
      table: storyboardTable({ imageStrategy: 'generate-new' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });
    expect(missingPrompt.blockedActions[0]).toMatchObject({
      reason: 'missing-prompt',
      imageStrategy: 'generate-new',
    });

    const missingSource = interpretStoryboardImageStrategies({
      table: storyboardTable({ imageStrategy: 'use-as-reference', generationPrompt: 'frame' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });
    expect(missingSource.blockedActions[0]).toMatchObject({
      reason: 'missing-source',
      imageStrategy: 'use-as-reference',
    });

    const missingCapability = interpretStoryboardImageStrategies({
      table: storyboardTable({ imageStrategy: 'generate-new', generationPrompt: 'frame' }),
      availableTools: [],
    });
    expect(missingCapability.blockedActions[0]).toMatchObject({
      reason: 'missing-capability',
      imageStrategy: 'generate-new',
    });

    const denied = interpretStoryboardImageStrategies({
      table: storyboardTable({ imageStrategy: 'generate-new', generationPrompt: 'frame' }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
      userOverride: {
        generationPolicy: 'deny',
        source: 'chat-instruction',
      },
    });
    expect(denied.blockedActions[0]).toMatchObject({
      reason: 'generation-denied',
      imageStrategy: 'generate-new',
    });
  });

  it('routes generate and transform strategies through available tool capabilities', () => {
    const table: StoryboardTable = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      title: 'Strategies',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Scene',
          shots: [
            {
              shotId: 'shot-generate',
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Generate a frame.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'generate-new',
              imagePrompt: 'new canonical frame',
              generationPrompt: 'legacy frame must not execute',
            },
            {
              shotId: 'shot-transform',
              shotNumber: 2,
              duration: 3,
              visualDescription: 'Transform source.',
              characterAction: 'Rin looks up.',
              imageStrategy: 'transform-original',
              sourceMediaRefs: [sourceMediaRef('source-2')],
            },
          ],
        },
      ],
    };

    const result = interpretStoryboardImageStrategies({
      table,
      availableTools: [
        { toolName: 'GenerateImage', supportsReferences: true },
        { toolName: 'TransformImage', supportsReferences: true },
      ],
    });

    expect(result.blockedActions).toEqual([]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'generate-image',
        toolName: 'GenerateImage',
        shotId: 'shot-generate',
        generationPrompt: 'new canonical frame',
      }),
      expect.objectContaining({
        kind: 'transform-image',
        toolName: 'TransformImage',
        shotId: 'shot-transform',
        sourceMediaRefs: [sourceMediaRef('source-2')],
      }),
    ]);
  });
});

function storyboardTable(
  shot: Partial<StoryboardTable['scenes'][number]['shots'][number]>,
): StoryboardTable {
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    title: 'Strategies',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Scene',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'Rin looks up.',
            characterAction: 'Rin looks up.',
            imageStrategy: 'generate-new',
            ...shot,
          },
        ],
      },
    ],
  };
}

function sourceMediaRef(refId: string) {
  return {
    refId,
    role: 'source' as const,
    locator: {
      type: 'tool-result' as const,
      toolCallId: `tool-${refId}`,
      assetIndex: 0,
    },
  };
}

describe('canonical storyboard contract', () => {
  it('requires source profile, stable trace, revision, and revision-bound projections', () => {
    const resource = {
      id: 'story-source-1',
      scope: 'project',
      provider: 'workspace',
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'story/script.md' },
      fingerprint: { strategy: 'hash', value: 'sha256:script-v1' },
    } as const;
    const table = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      contractVersion: 1,
      sourceProfile: 'from-script',
      revision: {
        revisionId: 'storyboard-revision-1',
        sequence: 1,
        contentDigest: 'sha256:storyboard-v1',
        createdAt: '2026-07-11T00:00:00.000Z',
      },
      sourceTrace: [{ traceId: 'trace-1', sourceProfile: 'from-script', sourceRef: resource }],
      projections: [
        {
          target: 'cut',
          storyboardRevisionId: 'storyboard-revision-1',
          mode: 'one-way-handoff',
          createdAt: '2026-07-11T00:00:00.000Z',
        },
      ],
      title: 'Canonical storyboard',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Opening',
          shots: [
            {
              shotId: 'shot-1',
              shotNumber: 1,
              duration: 2,
              visualDescription: 'A door opens.',
              characterAction: 'The hero enters.',
              imageStrategy: 'generate-new',
              generationPrompt: 'A cinematic door opens as the hero enters.',
            },
          ],
        },
      ],
    } as const;

    expect(validateCanonicalStoryboardTable(table)).toEqual({ ok: true, diagnostics: [] });
    expect(
      validateCanonicalStoryboardTable({
        ...table,
        projections: [{ ...table.projections[0], storyboardRevisionId: 'old-revision' }],
      }).diagnostics,
    ).toEqual([expect.objectContaining({ code: 'invalid-projection-handoff' })]);

    const { sourceProfile: _sourceProfile, ...profileOnlyTable } = table;
    expect(
      validateCanonicalStoryboardTable({
        ...profileOnlyTable,
        profile: STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
      }).diagnostics,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unsupported-source-profile' })]),
    );
  });

  it('rejects unsupported source profiles and runtime-only source refs', () => {
    const table = {
      schemaVersion: 1,
      kind: 'storyboard-table',
      contractVersion: 1,
      sourceProfile: 'from-prompt',
      revision: {
        revisionId: 'storyboard-revision-1',
        sequence: 1,
        contentDigest: 'sha256:storyboard-v1',
        createdAt: '2026-07-11T00:00:00.000Z',
      },
      sourceTrace: [
        {
          traceId: 'trace-1',
          sourceProfile: 'from-prompt',
          sourceRef: {
            id: 'runtime-source',
            scope: 'project',
            provider: 'workspace',
            kind: 'media',
            source: { kind: 'file', uri: 'vscode-webview://panel/source.png' },
            fingerprint: { strategy: 'none', value: 'runtime' },
          },
        },
      ],
      title: 'Invalid canonical storyboard',
      scenes: [],
    } as const;

    expect(validateCanonicalStoryboardTable(table).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid-source-trace' })]),
    );
  });
});
