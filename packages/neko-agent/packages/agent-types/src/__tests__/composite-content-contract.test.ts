import { describe, expect, it } from 'vitest';
import { extractCompositeContentFenceCandidates, parseCompositeContentJson } from '../index';

describe('composite content contract', () => {
  it('parses envelopes and drops invalid composite payloads', () => {
    expect(
      parseCompositeContentJson(
        JSON.stringify({
          kind: 'neko-composite',
          composites: [
            {
              template: 'gallery',
              sections: [{ mediaRefs: [{ toolCallId: 'call-1', assetIndex: 1.5 }] }],
            },
            {
              template: 'unknown',
              sections: [{ heading: 'Ignored' }],
            },
          ],
        }),
      ),
    ).toEqual([
      {
        template: 'gallery',
        sections: [
          {
            mediaRefs: [{ toolCallId: 'call-1' }],
          },
        ],
      },
    ]);
  });

  it('extracts semantic storyboard tables without requiring legacy sections', () => {
    const result = parseCompositeContentJson(
      JSON.stringify({
        template: 'storyboard-table',
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Opening',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'INT. CAFE - DAY',
            shots: [
              {
                shotNumber: 1,
                duration: 4,
                visualDescription: 'A wide establishing frame.',
                characterAction: 'Rin enters the cafe.',
                imageStrategy: 'use-as-reference',
                generationPrompt: 'wide anime cafe frame',
                sourceMediaRefs: [
                  {
                    refId: 'source-page-1',
                    role: 'source',
                    locator: { type: 'tool-result', toolCallId: 'read-doc', assetIndex: 0 },
                    label: '原始页',
                    mimeType: 'image/jpeg',
                  },
                ],
                generatedMediaRefs: [
                  {
                    refId: 'generated-shot-1',
                    role: 'generated',
                    locator: { type: 'tool-result', toolCallId: 'generate-image', assetIndex: 0 },
                    label: '生成镜头',
                    mimeType: 'image/png',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    expect(result[0]).toMatchObject({
      template: 'storyboard-table',
      title: 'Opening',
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        scenes: [
          {
            sceneId: 'scene-1',
            shots: [
              {
                shotNumber: 1,
                visualDescription: 'A wide establishing frame.',
              },
            ],
          },
        ],
      },
      sections: [
        {
          heading: 'INT. CAFE - DAY / Shot 1',
          content: 'A wide establishing frame.',
          layout: 'table-row',
          mediaRefs: [
            {
              toolCallId: 'read-doc',
              assetIndex: 0,
              caption: '原始页',
              role: 'source',
            },
            {
              toolCallId: 'generate-image',
              assetIndex: 0,
              caption: '生成镜头',
              role: 'generated',
            },
          ],
        },
      ],
    });
  });

  it('keeps flat Storyboard rows visible without promoting them to canonical Canvas input', () => {
    const result = parseCompositeContentJson(
      JSON.stringify({
        template: 'storyboard-table',
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Legacy flat rows',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Page 1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A flat row that must not become canonical input.',
            characterAction: 'Rin enters.',
            imageStrategy: 'use-as-reference',
          },
        ],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.storyboardTable).toBeUndefined();
    expect(result[0]?.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          heading: 'Page 1 / Shot 1',
          content: 'A flat row that must not become canonical input.',
        }),
      ]),
    );
    expect(result[0]?.storyboardDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'canonical-scene-shot-hierarchy-required',
          path: ['scenes', 0, 'shots'],
        }),
      ]),
    );
  });

  it('does not promote flat Storyboard artifact payloads to canonical Canvas input', () => {
    const result = parseCompositeContentJson(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'artifact-flat-storyboard',
        blocks: [
          {
            blockId: 'storyboard-domain',
            kind: 'domain',
            domainKind: 'StoryboardTable',
            schemaVersion: 1,
            payload: {
              schemaVersion: 1,
              kind: 'storyboard-table',
              title: 'Legacy artifact rows',
              scenes: [
                {
                  sceneId: 'scene-1',
                  sceneTitle: 'Page 1',
                  shotNumber: 1,
                  duration: 3,
                  visualDescription: 'Legacy artifact row.',
                  characterAction: 'Rin enters.',
                  imageStrategy: 'use-as-reference',
                },
              ],
            },
          },
        ],
      }),
    );

    expect(result[0]?.storyboardTable).toBeUndefined();
    expect(result[0]?.sections[0]).toMatchObject({
      heading: 'Page 1 / Shot 1',
      content: 'Legacy artifact row.',
    });
    expect(result[0]?.storyboardDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'canonical-scene-shot-hierarchy-required' }),
      ]),
    );
  });

  it('extracts storyboard domain blocks from composite artifacts', () => {
    const result = parseCompositeContentJson(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'artifact-storyboard',
        title: 'Comic artifact',
        extensions: {
          'neko.entityMemoryContributionPayload': {
            contributionId: 'contribution-page-1',
            sourcePackage: 'neko-agent',
            sourceRef: { kind: 'tool-result', toolCallId: 'read-doc', assetIndex: 0 },
            reviewPolicy: 'requires-user-review',
            entityCandidates: [
              {
                id: 'candidate-rin',
                kind: 'character',
                name: 'Rin',
                status: 'open',
                identityBasis: 'user-named',
                provenance: [
                  {
                    providerId: 'neko-agent',
                    sourceKind: 'agent',
                    sourceRef: 'read-doc#0',
                  },
                ],
                sourceRefs: ['read-doc#0'],
              },
            ],
          },
        },
        blocks: [
          {
            blockId: 'storyboard-domain',
            kind: 'domain',
            title: 'Storyboard Payload',
            domainKind: 'StoryboardTable',
            schemaVersion: 1,
            payload: {
              schemaVersion: 1,
              kind: 'storyboard-table',
              title: 'Opening',
              scenes: [
                {
                  sceneId: 'scene-1',
                  sceneTitle: 'Page 1',
                  shots: [
                    {
                      shotNumber: 1,
                      duration: 3,
                      visualDescription: 'Panel action and composition.',
                      characterAction: 'Rin enters the frame.',
                      imageStrategy: 'use-as-reference',
                      sourceMediaRefs: [
                        {
                          refId: 'source-panel-1',
                          role: 'source',
                          locator: {
                            type: 'tool-result',
                            toolCallId: 'read-doc',
                            assetIndex: 0,
                          },
                          label: 'Original panel',
                          mimeType: 'image/jpeg',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );

    expect(result[0]).toMatchObject({
      template: 'storyboard-table',
      title: 'Storyboard Payload',
      storyboardTable: {
        kind: 'storyboard-table',
        title: 'Opening',
      },
      extensions: {
        'neko.entityMemoryContributionPayload': {
          contributionId: 'contribution-page-1',
        },
      },
      sections: [
        {
          heading: 'Page 1 / Shot 1',
          content: 'Panel action and composition.',
          layout: 'table-row',
          mediaRefs: [
            {
              toolCallId: 'read-doc',
              assetIndex: 0,
              caption: 'Original panel',
              role: 'source',
            },
          ],
        },
      ],
    });
  });

  it('extracts composite artifacts from json fences while preserving entity extensions and media refs', () => {
    const markdown = `Summary.

\`\`\`json
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "artifact-storyboard",
  "title": "Comic artifact",
  "extensions": {
    "neko.entityMemoryContributionPayload": {
      "contributionId": "contribution-page-1",
      "sourcePackage": "neko-agent",
      "sourceRef": { "kind": "tool-result", "toolCallId": "read-doc", "assetIndex": 0 },
      "reviewPolicy": "requires-user-review",
      "entityCandidates": [
        {
          "id": "candidate-rin",
          "kind": "character",
          "name": "Rin",
          "status": "open",
          "identityBasis": "user-named",
          "provenance": [
            {
              "providerId": "neko-agent",
              "sourceKind": "agent",
              "sourceRef": "read-doc#0"
            }
          ],
          "sourceRefs": ["read-doc#0"]
        }
      ]
    }
  },
  "blocks": [
    {
      "blockId": "storyboard-domain",
      "kind": "domain",
      "title": "Storyboard Payload",
      "domainKind": "StoryboardTable",
      "schemaVersion": 1,
      "payload": {
        "schemaVersion": 1,
        "kind": "storyboard-table",
        "title": "Opening",
        "scenes": [
          {
            "sceneId": "scene-1",
            "sceneTitle": "Page 1",
            "shots": [
              {
                "shotNumber": 1,
                "duration": 3,
                "visualDescription": "Panel action and composition.",
                "characterAction": "Rin enters the frame.",
                "imageStrategy": "use-as-reference",
                "sourceMediaRefs": [
                  {
                    "refId": "source-panel-1",
                    "role": "source",
                    "locator": {
                      "type": "tool-result",
                      "toolCallId": "read-doc",
                      "assetIndex": 0
                    },
                    "label": "Original panel",
                    "mimeType": "image/jpeg"
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  ]
}
\`\`\`

Done.`;
    const candidates = extractCompositeContentFenceCandidates(markdown);
    const composites = candidates.flatMap((candidate) =>
      parseCompositeContentJson(candidate.rawJson),
    );

    expect(markdown).toContain('Summary.');
    expect(markdown).toContain('Done.');
    expect(composites[0]).toMatchObject({
      template: 'storyboard-table',
      extensions: {
        'neko.entityMemoryContributionPayload': {
          contributionId: 'contribution-page-1',
        },
      },
      sections: [
        {
          mediaRefs: [
            {
              toolCallId: 'read-doc',
              assetIndex: 0,
              caption: 'Original panel',
              role: 'source',
            },
          ],
        },
      ],
    });
  });

  it('extracts uppercase neko fenced composite artifacts', () => {
    const markdown = `Summary.

\`\`\`NEKO
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "artifact-storyboard",
  "title": "Comic artifact",
  "blocks": [
    {
      "blockId": "storyboard-domain",
      "kind": "domain",
      "title": "Storyboard Payload",
      "domainKind": "StoryboardTable",
      "schemaVersion": 1,
      "payload": {
        "schemaVersion": 1,
        "kind": "storyboard-table",
        "title": "Opening",
        "scenes": [
          {
            "sceneId": "scene-1",
            "sceneTitle": "Page 1",
            "shots": [
              {
                "shotNumber": 1,
                "duration": 3,
                "visualDescription": "Panel action and composition.",
                "characterAction": "Rin enters the frame.",
                "imageStrategy": "use-as-reference"
              }
            ]
          }
        ]
      }
    }
  ]
}
\`\`\`

Done.`;
    const candidates = extractCompositeContentFenceCandidates(markdown);
    const composites = candidates.flatMap((candidate) =>
      parseCompositeContentJson(candidate.rawJson),
    );

    expect(candidates[0]?.language).toBe('neko');
    expect(composites[0]).toMatchObject({
      template: 'storyboard-table',
      title: 'Storyboard Payload',
      storyboardTable: {
        kind: 'storyboard-table',
        title: 'Opening',
      },
      sections: [
        {
          heading: 'Page 1 / Shot 1',
          content: 'Panel action and composition.',
          layout: 'table-row',
        },
      ],
    });
  });

  it('extracts shared fenced JSON candidates from neko aliases and envelopes', () => {
    const result = extractCompositeContentFenceCandidates(`Payload.

\`\`\`NEKO
{
  "kind": "neko-composite",
  "composites": [
    {
      "schemaVersion": 1,
      "kind": "composite-artifact",
      "artifactId": "artifact-review",
      "title": "Review Artifact",
      "blocks": [
        { "blockId": "summary", "kind": "text", "text": "Review summary." }
      ]
    }
  ]
}
\`\`\``);

    expect(result).toHaveLength(1);
    expect(result[0]?.language).toBe('neko');
    expect(result[0]?.value).toMatchObject({
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'artifact-review',
      title: 'Review Artifact',
    });
  });

  it('keeps invalid semantic storyboard tables visible with bounded diagnostics', () => {
    const result = parseCompositeContentJson(
      JSON.stringify({
        template: 'storyboard-table',
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Broken',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'INT. CAFE - DAY',
            shots: [
              {
                shotNumber: 1,
                duration: 4,
                characterAction: 'Rin enters the cafe.',
                imageStrategy: 'generate-new',
              },
            ],
          },
        ],
      }),
    );

    expect(result[0]?.storyboardTable).toBeUndefined();
    expect(result[0]?.storyboardDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'missing-required-field',
          path: ['scenes', 0, 'shots', 0, 'visualDescription'],
        }),
      ]),
    );
    expect(result[0]?.sections[0]).toMatchObject({
      heading: 'Storyboard validation failed',
      layout: 'table-row',
    });
  });
});
