import { describe, expect, it } from 'vitest';
import { projectToolCallDisplayState } from '../tool-call-presenter';

describe('tool-call-presenter', () => {
  it('projects Canvas authoring feedback for follow-up turns', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-canvas-1',
      name: 'canvas_create_composite',
      arguments: {},
      result: {
        success: false,
        data: {
          authoringResult: {
            version: 1,
            status: 'blocked',
            summary: 'Composite needs a supported shot preset.',
            refs: [
              {
                kind: 'node',
                id: 'scene-1',
                canvasId: 'canvas-1',
                label: 'Scene',
              },
            ],
            diagnostics: [
              {
                severity: 'error',
                code: 'unsupported-child-preset',
                message: 'Unsupported child preset "shot.magic".',
                target: 'children[0].preset',
                requiredQuery: 'canvas_describe_authoring_capabilities',
                retryable: true,
                suggestedActions: [
                  {
                    id: 'query-authoring-catalog',
                    label: 'Query Canvas authoring catalog',
                    toolName: 'canvas_describe_authoring_capabilities',
                  },
                ],
              },
            ],
            changedFields: ['/storyboardPrompt'],
            blockedReason: 'Unsupported child preset "shot.magic".',
            nextActions: [
              {
                id: 'create-replacement-shot',
                label: 'Create replacement shot',
                toolName: 'canvas_create_node',
                requiresApproval: true,
                arguments: { preset: 'shot.basic' },
              },
            ],
          },
          semanticPrompt: {
            text: 'Wide rain street with @hero.',
            fieldProjections: [
              {
                fieldId: 'scene.environment',
                sourceSpanId: 'span-scene',
                alignmentState: 'prompt-overridden',
                userOverride: true,
              },
            ],
          },
        },
      },
    });

    expect(projection.canvasAuthoringResult).toMatchObject({
      isValid: true,
      status: 'blocked',
      summary: 'Composite needs a supported shot preset.',
      blockedReason: 'Unsupported child preset "shot.magic".',
      refs: [
        {
          kind: 'node',
          id: 'scene-1',
          label: 'Scene',
          details: ['canvas:canvas-1'],
        },
      ],
      diagnostics: [
        {
          severity: 'error',
          code: 'unsupported-child-preset',
          message: 'Unsupported child preset "shot.magic".',
          target: 'children[0].preset',
          requiredQuery: 'canvas_describe_authoring_capabilities',
          retryable: true,
        },
      ],
      changedFields: ['/storyboardPrompt'],
      nextActions: [
        {
          id: 'create-replacement-shot',
          label: 'Create replacement shot',
          toolName: 'canvas_create_node',
          requiresApproval: true,
          argumentsJson: '{\n  "preset": "shot.basic"\n}',
        },
        {
          id: 'query-authoring-catalog',
          label: 'Query Canvas authoring catalog',
          toolName: 'canvas_describe_authoring_capabilities',
          requiresApproval: false,
        },
      ],
      promptFieldAlignments: [
        {
          fieldId: 'scene.environment',
          sourceSpanId: 'span-scene',
          alignmentState: 'prompt-overridden',
          userOverride: true,
        },
      ],
    });
    expect(projection.resultJson).toContain('"authoringResult"');
    expect(projection.resultJson).toContain('"scene-1"');
  });

  it('surfaces malformed Canvas authoring envelopes as diagnostics', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-canvas-2',
      name: 'canvas_create_node',
      arguments: {},
      result: {
        success: true,
        data: {
          authoringResult: {
            version: 99,
            status: 'ok',
            refs: 'node-1',
            diagnostics: [],
          },
        },
      },
    });

    expect(projection.canvasAuthoringResult).toMatchObject({
      isValid: false,
      status: 'ok',
      refs: [],
      changedFields: [],
      nextActions: [],
    });
    expect(projection.canvasAuthoringResult?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-catalog-version' }),
        expect.objectContaining({ code: 'malformed-authoring-status' }),
        expect.objectContaining({ code: 'malformed-authoring-ref' }),
      ]),
    );
  });

  it('projects ReadImage result images into thumbnail view models', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-2',
      name: 'ReadImage',
      arguments: {},
      result: {
        success: true,
        data: {
          source: { filePath: '/books/a.epub', format: 'epub' },
          mode: 'metadata',
          analysis: 'custom',
          images: [
            {
              label: 'Page 1',
              renderUri: 'vscode-webview://page-1.jpg',
              width: 1494,
              height: 2133,
              byteSize: 2048,
              mimeType: 'image/jpeg',
              metadata: {
                documentIndex: 1,
                locator: {
                  kind: 'chapter',
                  chapterHref: 'Page_1',
                  spineIndex: 1,
                },
              },
              documentImage: {
                locator: {
                  kind: 'chapter',
                  chapterHref: 'Page_1',
                  spineIndex: 1,
                },
                resourceRef: {
                  kind: 'document-entry',
                  source: { filePath: '/books/a.epub', format: 'epub' },
                  entryPath: 'image/Page_1.jpg',
                  versionPolicy: 'versioned-export',
                },
              },
            },
          ],
          imageCount: 1,
        },
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/books/a.epub',
        path: 'image/Page_1.jpg',
        width: 1494,
        height: 2133,
        byteSize: 2048,
        mimeType: 'image/jpeg',
        src: 'vscode-webview://page-1.jpg',
        label: 'Page 1',
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_1',
          spineIndex: 1,
        },
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'image/Page_1.jpg',
          versionPolicy: 'versioned-export',
        },
      }),
    ]);
    expect(projection.copyText).toBeNull();

    const reference = JSON.parse(projection.documentThumbnails[0]!.referenceJson);
    expect(reference).toEqual({
      kind: 'document-image-reference',
      protocolVersion: 2,
      document: {
        filePath: '/books/a.epub',
        source: { filePath: '/books/a.epub', format: 'epub' },
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_1',
          spineIndex: 1,
        },
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'image/Page_1.jpg',
          versionPolicy: 'versioned-export',
        },
      },
      image: {
        index: 0,
        width: 1494,
        height: 2133,
        byteSize: 2048,
        mimeType: 'image/jpeg',
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'image/Page_1.jpg',
          versionPolicy: 'versioned-export',
        },
      },
    });
    expect(projection.documentThumbnails[0]!.referenceJson).not.toContain('"renderUri"');
    expect(projection.documentThumbnails[0]!.referenceJson).not.toContain('vscode-webview://');
    expect(projection.documentThumbnails[0]!.referenceJson).not.toContain('/tmp/page-1.jpg');
  });

  it('projects ReadImage argument images into thumbnails while pending', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-3',
      name: 'ReadImage',
      arguments: {
        images: [
          {
            label: '第10页',
            path: '/tmp/page-10.jpg',
            renderUri: 'vscode-webview://page-10.jpg',
          },
        ],
        mode: 'metadata',
      },
    });

    expect(projection.isPending).toBe(true);
    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/tmp/page-10.jpg',
        path: '/tmp/page-10.jpg',
        src: 'vscode-webview://page-10.jpg',
        label: '第10页',
      }),
    ]);
  });

  it('keeps ReadImage stable refs even when no webview URI is available', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-3b',
      name: 'ReadImage',
      arguments: {},
      result: {
        success: true,
        data: {
          images: [
            {
              label: 'Page 1',
              renderUri: 'vscode-webview://page-1.jpg',
              width: 1494,
              height: 2133,
              mimeType: 'image/jpeg',
              resourceRef: {
                kind: 'document-entry',
                source: { filePath: '/books/a.epub', format: 'epub' },
                entryPath: 'image/Page_1.jpg',
                versionPolicy: 'versioned-export',
              },
            },
          ],
        },
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/books/a.epub',
        path: 'image/Page_1.jpg',
        width: 1494,
        height: 2133,
        mimeType: 'image/jpeg',
        src: 'vscode-webview://page-1.jpg',
        label: 'Page 1',
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'image/Page_1.jpg',
          versionPolicy: 'versioned-export',
        },
      }),
    ]);
    expect(JSON.parse(projection.documentThumbnails[0]!.referenceJson).image).not.toHaveProperty(
      'renderUri',
    );
    expect(projection.documentThumbnails[0]!.referenceJson).not.toContain('renderUri');
    expect(projection.documentThumbnails[0]!.referenceJson).not.toContain('vscode-webview://');
    expect(projection.documentThumbnails[0]!.referenceJson).not.toContain('.neko/.cache');
  });

  it('keeps locator-only ReadImage selections visible and aligns their attachment previews', () => {
    const contentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/comic.cbz' },
      entryPath: 'pages/001.png',
    };
    const projection = projectToolCallDisplayState({
      id: 'tool-locator-only',
      name: 'ReadImage',
      arguments: {},
      result: {
        success: true,
        data: {
          images: [
            {
              label: 'Page 1',
              width: 1200,
              height: 1800,
              byteSize: 2048,
              mimeType: 'image/png',
              contentLocator,
            },
          ],
        },
        attachments: [
          {
            type: 'image',
            path: 'content:document-entry',
            mimeType: 'image/png',
            assetRef: {
              assetId: 'page-1',
              uri: 'content:document-entry',
              mimeType: 'image/png',
              contentLocator,
              previewUri: 'data:image/webp;base64,dGh1bWI=',
            },
          },
        ],
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        path: 'pages/001.png',
        filePath: 'books/comic.cbz',
        label: 'Page 1',
        src: 'data:image/webp;base64,dGh1bWI=',
        contentLocator,
      }),
    ]);
  });

  it('keeps an ordered locator-only placeholder when preview projection fails', () => {
    const contentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/comic.cbz' },
      entryPath: 'pages/002.png',
    };
    const projection = projectToolCallDisplayState({
      id: 'tool-preview-failed',
      name: 'ReadImage',
      arguments: {},
      result: {
        success: true,
        data: { images: [{ label: 'Page 2', contentLocator }] },
        attachments: [
          {
            type: 'image',
            path: 'content:page-2',
            assetRef: {
              assetId: 'page-2',
              uri: 'content:page-2',
              mimeType: 'image/png',
              contentLocator,
              previewDiagnostic: 'Image preview is unavailable: unauthorized.',
            },
          },
        ],
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        index: 0,
        label: 'Page 2',
        contentLocator,
        previewDiagnostic: 'Image preview is unavailable: unauthorized.',
      }),
    ]);
    expect(projection.documentThumbnails[0]).not.toHaveProperty('src');
  });

  it('uses a hydrated perception-card preview when legacy history has no attachments', () => {
    const contentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/comic.cbz' },
      entryPath: 'pages/003.png',
    };
    const projection = projectToolCallDisplayState({
      id: 'tool-hydrated-preview',
      name: 'ReadImage',
      arguments: {},
      result: {
        success: true,
        data: {
          success: true,
          data: { images: [{ label: 'Page 3', contentLocator }] },
          perceptionCards: [
            {
              version: 1,
              assetId: 'page-3',
              modality: 'image',
              createdAt: 1,
              layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
              structural: { format: 'png', mimeType: 'image/png', byteSize: 2048 },
              perceptual: {
                thumbnailRef: {
                  assetId: 'page-3',
                  uri: 'content:page-3',
                  mimeType: 'image/png',
                  contentLocator,
                  previewUri: 'data:image/webp;base64,aGlzdG9yeQ==',
                },
              },
            },
          ],
        },
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        index: 0,
        label: 'Page 3',
        contentLocator,
        src: 'data:image/webp;base64,aGlzdG9yeQ==',
      }),
    ]);
  });

  it('projects ReadImage argument images into thumbnails when failed', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-5',
      name: 'ReadImage',
      arguments: {
        file_path: '/books/a.epub',
        source: { filePath: '/books/a.epub', format: 'epub' },
        images: [
          {
            label: 'Page 2',
            path: '/tmp/page-2.jpg',
            renderUri: 'vscode-webview://page-2.jpg',
            metadata: {
              locator: {
                kind: 'chapter',
                chapterHref: 'Page_2',
                spineIndex: 2,
              },
            },
          },
        ],
      },
      result: {
        success: false,
        data: null,
        error: 'No data received for 30000ms',
      },
    });

    expect(projection.documentThumbnails).toEqual([
      expect.objectContaining({
        filePath: '/books/a.epub',
        path: '/tmp/page-2.jpg',
        src: 'vscode-webview://page-2.jpg',
        label: 'Page 2',
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_2',
          spineIndex: 2,
        },
      }),
    ]);
  });

  it('projects compact copy text for ReadDocument range results', () => {
    const projection = projectToolCallDisplayState({
      id: 'tool-1',
      name: 'ReadDocument',
      arguments: {},
      result: {
        success: true,
        data: {
          source: { filePath: '/books/a.epub', format: 'epub' },
          locator: {
            kind: 'chapter',
            chapterHref: 'Page_10',
            spineIndex: 10,
          },
          text: 'EPUB chapter range with 1 image pages',
        },
      },
    });

    expect(projection.copyText).toBe(
      [
        'Document: /books/a.epub',
        'Location: chapter:Page_10@10',
        'EPUB chapter range with 1 image pages',
      ].join('\n'),
    );
  });
});
