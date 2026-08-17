import { describe, expect, it } from 'vitest';
import type { ContentBlock, ToolCall } from '@neko/agent-contracts';
import { projectCompositeBlockRichContent } from '../composite-content-presenter';

describe('composite content presenter', () => {
  it('projects storyboard rows from backfilled tool result assets', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        sections: [
          {
            heading: 'Shot 1',
            content: 'Wide establishing frame',
            layout: 'table-row',
            mediaRefs: [{ toolCallId: 'call-1', assetIndex: 0, caption: 'Wide', role: 'shot' }],
          },
        ],
      },
      siblingBlocks: [toolBlock(makeImageToolCall())],
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.sections).toMatchObject([
      {
        heading: 'Shot 1',
        content: 'Wide establishing frame',
        media: [
          {
            toolCallId: 'call-1',
            type: 'image',
            descriptor: expect.objectContaining({ displayName: 'asset-1.png' }),
            assetId: 'asset-1',
            stableUri: '${WORKSPACE}/neko/generated/image/out.png',
            caption: 'Wide',
            role: 'shot',
          },
        ],
        diagnostics: [],
      },
    ]);
    expect(projection.data.sections[0]?.media[0]).not.toHaveProperty('localPath');
  });

  it('preserves semantic storyboard diagnostics for rich rendering and transfer gating', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Broken',
        storyboardDiagnostics: [
          {
            severity: 'error',
            code: 'missing-required-field',
            path: ['scenes', 0, 'shots', 0, 'visualDescription'],
            message: 'Missing required storyboard field visualDescription.',
          },
        ],
        sections: [
          {
            heading: 'Storyboard validation failed',
            content: '[error] missing-required-field',
          },
        ],
      },
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.storyboardDiagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'missing-required-field',
      }),
    ]);
  });

  it('resolves model image-order labels like Image #2 into source media refs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Ordered Images',
        storyboardTable: {
          kind: 'storyboard-table',
          title: 'Ordered Images',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Opening',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use the second provided image as reference. [Image #2]',
                  characterAction: 'Static reference frame.',
                  imageStrategy: 'use-as-reference',
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Shot 1',
            content: 'Reference: [Image #2]',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image-current-result',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  previewDescriptor: previewDescriptor('image-1.jpg'),
                  label: 'Image #1',
                  mimeType: 'image/jpeg',
                },
                {
                  previewDescriptor: previewDescriptor('image-2.jpg'),
                  label: 'Image #2',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'tool-result:read-image-current-result:1',
        role: 'source',
        locator: {
          type: 'tool-result',
          toolCallId: 'read-image-current-result',
          assetIndex: 1,
        },
        label: 'Image #2',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image-current-result',
        assetIndex: 1,
        descriptor: expect.objectContaining({ displayName: 'image-2.jpg' }),
      }),
    ]);
    expect(projection.data.diagnostics).toEqual([]);
  });

  it('renders storyboard rows from stable document resource refs without requiring tool-result lookup', () => {
    const contentLocator = makeDocumentEntryContentLocator(
      'OPS/images/page-1.jpg',
      'epub/animation/Blame/book.epub',
    );
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'A full-page establishing image.',
                  characterAction: 'The city fills the frame.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'document-entry:page-1',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'missing-read-document',
                        assetIndex: 0,
                      },
                      label: 'Page 1',
                      mimeType: 'image/jpeg',
                      contentLocator,
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 1',
            content: 'A full-page establishing image.',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'document-entry:page-1',
        assetIndex: 0,
        type: 'image',
        contentLocator: contentLocator,
        mimeType: 'image/jpeg',
        caption: 'Page 1',
        label: 'Page 1',
        role: 'source',
      }),
    ]);
    expect(projection.data.diagnostics).toEqual([]);
    expect(projection.data.sections[0]?.diagnostics).toEqual([]);
    expect(projection.data.sections[0]?.media[0]).not.toHaveProperty('localPath');
  });

  it('replaces unresolved model-authored storyboard media refs with inferred tool result refs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'The title page appears.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'source-page-1',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'ReadImage-vision-pages-1-10',
                        assetIndex: 0,
                      },
                      label: 'Page 1',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 1 / Shot 1',
            content: 'The title page appears.',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page-1.jpg',
                  previewDescriptor: previewDescriptor('page-1.jpg'),
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'tool-result:read-image:0',
        role: 'source',
        locator: {
          type: 'tool-result',
          toolCallId: 'read-image',
          assetIndex: 0,
        },
        label: 'Page 1',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.diagnostics).toEqual([]);
    expect(projection.data.diagnostics).toEqual([]);
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image',
        descriptor: expect.objectContaining({ displayName: 'page-1.jpg' }),
      }),
    ]);
    expect(projection.data.sections[0]?.media[0]).not.toHaveProperty('localPath');
  });

  it('projects structured entity memory contribution provided by runtime or domain', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        extensions: {
          'neko.entityMemoryContributionPayload': {
            contributionId: 'explicit-contribution',
            sourcePackage: 'neko-agent',
            sourceRef: { kind: 'manual', label: 'explicit payload' },
            reviewPolicy: 'requires-user-review',
          },
        },
        sections: [
          {
            heading: '主要角色观察',
            content: [
              '| 角色 | 当前证据支撑的观察 |',
              '| --- | --- |',
              '| 瑞德 | 红色围巾。 |',
            ].join('\n'),
          },
        ],
      },
    });

    expect(projection.data.entityMemoryContribution).toMatchObject({
      contributionId: 'explicit-contribution',
      sourceRef: { kind: 'manual', label: 'explicit payload' },
    });
    expect(projection.data.entityMemoryContribution?.metadata).toBeUndefined();
  });

  it('preserves explicit sourceMediaRefs when duplicate readable aliases exist', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use the second page_1.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'explicit-page',
                      role: 'source',
                      locator: { type: 'tool-result', toolCallId: 'read-doc-b', assetIndex: 0 },
                      label: 'page_1',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'page_1', content: 'Use page_1.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc-a',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  alias: 'page_1',
                  aliasScope: 'document:comic-a',
                  sourceDocumentId: 'comic-a',
                  mimeType: 'image/jpeg',
                  contentLocator: makeDocumentEntryContentLocator(
                    'OPS/a/page-1.jpg',
                    'books/comic-a.epub',
                  ),
                },
              ],
            },
          },
        }),
        toolBlock({
          id: 'read-doc-b',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  alias: 'page_1',
                  aliasScope: 'document:comic-b',
                  sourceDocumentId: 'comic-b',
                  mimeType: 'image/jpeg',
                  contentLocator: makeDocumentEntryContentLocator(
                    'OPS/b/page-1.jpg',
                    'books/comic-b.epub',
                  ),
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'explicit-page',
        role: 'source',
        locator: { type: 'tool-result', toolCallId: 'read-doc-b', assetIndex: 0 },
        label: 'page_1',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.media[0]).toMatchObject({
      toolCallId: 'read-doc-b',
      assetIndex: 0,
      contentLocator: makeDocumentEntryContentLocator('OPS/b/page-1.jpg', 'books/comic-b.epub'),
    });
    expect(projection.data.sections[0]?.media[0]).not.toHaveProperty('localPath');
    expect(projection.data.diagnostics).toEqual([]);
  });

  it('repairs invented explicit tool result ids through a single eligible image batch', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 2',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use the second page from the analysis batch.',
                  characterAction: 'Static page reference.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'invented-page',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'ReadImage.front10pages',
                        assetIndex: 1,
                      },
                      label: 'Page 2',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [{ heading: 'Page 2 / Shot 1', content: 'Use page 2.', layout: 'table-row' }],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image-real',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page-1.jpg',
                  previewDescriptor: previewDescriptor('page-1.jpg'),
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
                {
                  path: '/cache/page-2.jpg',
                  previewDescriptor: previewDescriptor('page-2.jpg'),
                  label: 'Page 2',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.storyboardTable?.scenes[0]?.shots[0]?.sourceMediaRefs).toEqual([
      {
        refId: 'tool-result:read-image-real:1',
        role: 'source',
        locator: {
          type: 'tool-result',
          toolCallId: 'read-image-real',
          assetIndex: 1,
        },
        label: 'Page 2',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image-real',
        assetIndex: 1,
        descriptor: expect.objectContaining({ displayName: 'page-2.jpg' }),
      }),
    ]);
    expect(projection.data.sections[0]?.media[0]).not.toHaveProperty('localPath');
    expect(projection.data.diagnostics).toEqual([]);
  });

  it('resolves readimage-current-result alias through the current single image batch', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 2',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'Use image two.',
                  characterAction: 'Static page reference.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'current-result-page',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'readimage-current-result',
                        assetIndex: 1,
                      },
                      label: 'Image #2',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 2 / Shot 1',
            content: 'Use [Image #2].',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'real-read-image-call',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  previewDescriptor: previewDescriptor('page-1.jpg'),
                  label: 'Image #1',
                  mimeType: 'image/jpeg',
                },
                {
                  previewDescriptor: previewDescriptor('page-2.jpg'),
                  label: 'Image #2',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    if (projection.kind !== 'storyboard-table') {
      throw new Error('expected storyboard table projection');
    }
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'real-read-image-call',
        assetIndex: 1,
        descriptor: expect.objectContaining({ displayName: 'page-2.jpg' }),
      }),
    ]);
    expect(projection.data.diagnostics).toEqual([]);
    expect(JSON.stringify(projection)).not.toContain('Tool result is not ready');
  });

  it('resolves semantic storyboard row media from explicit shot media refs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        title: 'Opening',
        storyboardTable: {
          kind: 'storyboard-table',
          title: 'Opening',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Page 1',
              shots: [
                {
                  shotNumber: 1,
                  duration: 2,
                  visualDescription: 'The title page appears.',
                  characterAction: 'Static title card.',
                  imageStrategy: 'use-as-reference',
                  sourceMediaRefs: [
                    {
                      refId: 'page-1',
                      role: 'source',
                      locator: {
                        type: 'tool-result',
                        toolCallId: 'read-image',
                        assetIndex: 0,
                      },
                      label: 'Page 1',
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              ],
            },
          ],
        },
        sections: [
          {
            heading: 'Page 1 / Shot 1',
            content: 'The title page appears.',
            layout: 'table-row',
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              images: [
                {
                  path: '/cache/page-1.jpg',
                  previewDescriptor: previewDescriptor('page-1.jpg'),
                  label: 'Page 1',
                  mimeType: 'image/jpeg',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image',
        type: 'image',
        descriptor: expect.objectContaining({ displayName: 'page-1.jpg' }),
        caption: 'Page 1',
        role: 'source',
      }),
    ]);
    expect(projection.data.sections[0]?.media[0]).not.toHaveProperty('localPath');
  });

  it('projects comparison variants from ordered media refs', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'comparison',
        sections: [
          {
            heading: 'Variant A',
            mediaRefs: [{ toolCallId: 'call-1', assetIndex: 0 }],
          },
          {
            heading: 'Variant B',
            mediaRefs: [{ toolCallId: 'call-1', assetIndex: 1 }],
          },
        ],
      },
      siblingBlocks: [toolBlock(makeImageToolCall())],
    });

    expect(projection.kind).toBe('comparison-grid');
    expect(
      projection.data.sections.map((section) => section.media[0]?.descriptor?.displayName),
    ).toEqual(['asset-1.png', 'asset-2.png']);
  });

  it('projects storyboard media refs from document image pages and generated variants', () => {
    const contentLocator = makeDocumentEntryContentLocator('OPS/Page_1.jpg', '/books/story.epub');
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        sections: [
          {
            heading: 'Shot 1',
            content: 'Use the original page, color pass, and final generated keyframe.',
            mediaRefs: [
              {
                toolCallId: 'read-doc',
                assetIndex: 0,
                caption: '原始页图',
                role: 'original',
              },
              {
                toolCallId: 'colorize',
                assetIndex: 0,
                caption: '上色图',
                role: 'colorized',
              },
              {
                toolCallId: 'generate',
                assetIndex: 0,
                caption: '生成图',
                role: 'generated',
              },
            ],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-doc',
          name: 'ReadDocument',
          arguments: {},
          result: {
            success: true,
            data: {
              filePath: '/books/story.epub',
              imageInfo: [
                {
                  width: 1493,
                  height: 2133,
                  mimeType: 'image/jpeg',
                  locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
                  contentLocator: contentLocator,
                },
              ],
            },
          },
        }),
        toolBlock(
          makeImageToolCall('colorize', 'color-1', 'http://127.0.0.1:43125/resources/color.png'),
        ),
        toolBlock(
          makeImageToolCall(
            'generate',
            'generated-1',
            'http://127.0.0.1:43125/resources/generated.png',
          ),
        ),
      ],
    });

    expect(projection.kind).toBe('storyboard-table');
    expect(projection.data.sections[0]?.media).toMatchObject([
      {
        toolCallId: 'read-doc',
        type: 'image',
        contentLocator: contentLocator,
        mimeType: 'image/jpeg',
        caption: '原始页图',
        role: 'original',
      },
      {
        toolCallId: 'colorize',
        descriptor: expect.objectContaining({ displayName: 'color.png' }),
        caption: '上色图',
        role: 'colorized',
      },
      {
        toolCallId: 'generate',
        descriptor: expect.objectContaining({ displayName: 'generated.png' }),
        caption: '生成图',
        role: 'generated',
      },
    ]);
  });

  it('projects read image results when webview URIs are available on image entries', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: [
          {
            mediaRefs: [{ toolCallId: 'read-image', assetIndex: 0 }],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'read-image',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              mode: 'metadata',
              analysis: 'describe',
              images: [
                {
                  path: '/images/reference.png',
                  previewDescriptor: previewDescriptor('reference.png'),
                  label: 'reference',
                  mimeType: 'image/png',
                  byteSize: 100,
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.data.sections[0]?.media).toEqual([
      expect.objectContaining({
        toolCallId: 'read-image',
        type: 'image',
        descriptor: expect.objectContaining({ displayName: 'reference.png' }),
        caption: 'reference',
      }),
    ]);
    expect(projection.data.sections[0]?.media[0]).not.toHaveProperty('localPath');
  });

  it('projects gallery assets and bounds missing media diagnostics', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: Array.from({ length: 12 }, (_, index) => ({
          heading: `Asset ${index}`,
          mediaRefs: [{ toolCallId: `missing-${index}`, assetIndex: index }],
        })),
      },
      siblingBlocks: [toolBlock(makeImageToolCall())],
    });

    expect(projection.kind).toBe('asset-gallery');
    expect(projection.data.diagnostics).toHaveLength(8);
    expect(projection.data.diagnostics[0]).toMatchObject({
      code: 'missing-tool-result',
      toolCallId: 'missing-0',
    });
  });

  it('diagnoses generated 3D model assets until Preview provides an authorized descriptor', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: [
          {
            heading: 'Character',
            mediaRefs: [{ toolCallId: 'call-model', assetIndex: 0 }],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'call-model',
          name: 'GenerateModel',
          arguments: {},
          result: {
            success: true,
            data: {
              assets: [
                {
                  id: 'model-1',
                  type: 'generated-model',
                  path: '/repo/neko/generated/model/character.glb',
                  mimeType: 'model/gltf-binary',
                },
              ],
            },
          },
        }),
      ],
      plugins: { canvas: true },
    });

    expect(projection.kind).toBe('asset-gallery');
    expect(projection.data.sections[0]?.media).toEqual([]);
    expect(projection.data.sections[0]?.diagnostics).toEqual([
      {
        code: 'missing-uri',
        toolCallId: 'call-model',
        assetIndex: 0,
        assetId: 'model-1',
        message: 'Asset 0 does not have an authorized Preview descriptor',
      },
    ]);
    expect(projection.data.plugins).toEqual({ canvas: true });
  });

  it('diagnoses stable asset refs that lack authorized Preview descriptors', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'storyboard-table',
        sections: [
          {
            mediaRefs: [{ toolCallId: 'call-stable', assetIndex: 0 }],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'call-stable',
          name: 'GenerateImage',
          arguments: {},
          result: {
            success: true,
            data: {
              resultAssetRefs: [
                {
                  assetId: 'asset-stable',
                  uri: '${WORKSPACE}/out.png',
                  mimeType: 'image/png',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(projection.data.sections[0]?.media).toEqual([]);
    expect(projection.data.sections[0]?.diagnostics).toEqual([
      {
        code: 'missing-uri',
        toolCallId: 'call-stable',
        assetIndex: 0,
        assetId: 'asset-stable',
        message: 'Asset 0 does not have an authorized Preview descriptor',
      },
    ]);
  });

  it('does not promote provider URLs, inline data, or absolute paths into preview success', () => {
    const projection = projectCompositeBlockRichContent({
      composite: {
        template: 'gallery',
        sections: [
          {
            mediaRefs: [
              { toolCallId: 'call-provider', assetIndex: 0 },
              { toolCallId: 'call-provider', assetIndex: 1 },
              { toolCallId: 'call-provider', assetIndex: 2 },
            ],
          },
        ],
      },
      siblingBlocks: [
        toolBlock({
          id: 'call-provider',
          name: 'GenerateImage',
          arguments: {},
          result: {
            success: true,
            data: {
              provider: 'openai',
              urls: [
                'file:///repo/out.png',
                'data:image/png;base64,abc',
                'http://127.0.0.1:43125/resources/safe.png',
              ],
              localPaths: ['/repo/out.png'],
            },
          },
        }),
      ],
    });

    expect(JSON.stringify(projection)).not.toContain('openai');
    expect(JSON.stringify(projection)).not.toContain('file://');
    expect(JSON.stringify(projection)).not.toContain('base64');
    expect(JSON.stringify(projection)).not.toContain('safe.png');
    expect(projection.data.sections[0]?.media).toEqual([]);
  });
});

function makeImageToolCall(
  id = 'call-1',
  assetId = 'asset-1',
  renderUri = 'http://127.0.0.1:43125/resources/asset-1.png',
): ToolCall {
  return {
    id,
    name: 'GenerateImage',
    arguments: { prompt: 'cat' },
    result: {
      success: true,
      data: {
        assets: [
          {
            id: assetId,
            type: 'generated-image',
            path: '/repo/neko/generated/image/out.png',
            previewDescriptor: previewDescriptor(renderUri.split('/').at(-1) ?? assetId),
            mimeType: 'image/png',
            generatedAt: '2026-01-01T00:00:00.000Z',
            width: 1024,
            height: 1024,
            ratio: '1:1',
            assetRef: {
              assetId,
              uri: '${WORKSPACE}/neko/generated/image/out.png',
              mimeType: 'image/png',
            },
          },
          {
            id: 'asset-2',
            type: 'generated-image',
            path: '/repo/neko/generated/image/out-2.png',
            previewDescriptor: previewDescriptor('asset-2.png'),
            mimeType: 'image/png',
            generatedAt: '2026-01-01T00:00:00.000Z',
            width: 1024,
            height: 1024,
            ratio: '1:1',
          },
        ],
      },
    },
  };
}

function previewDescriptor(displayName: string) {
  return {
    descriptorId: `descriptor-${displayName}`,
    sourceFingerprint: `fingerprint-${displayName}`,
    contentLocator: { kind: 'workspace-file' as const, path: `assets/${displayName}` },
    url: 'openneko://resource/12345678901234567890123456789012',
    contentKind: 'image' as const,
    mediaType: displayName.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    displayName,
    byteLength: 1024,
  };
}

function toolBlock(toolCall: ToolCall): ContentBlock {
  return {
    id: `block-${toolCall.id}`,
    type: 'tool_call',
    timestamp: 1,
    toolCall,
  };
}

function makeDocumentEntryContentLocator(
  entryPath: string,
  filePath = 'books/comic.epub',
): {
  readonly kind: 'document-entry';
  readonly source: { readonly kind: 'workspace-file'; readonly path: string };
  readonly entryPath: string;
} {
  return {
    kind: 'document-entry',
    source: { kind: 'workspace-file', path: filePath.replace(/^\/+/u, '') },
    entryPath,
  };
}
