import { describe, expect, it } from 'vitest';
import type { AgentContextPayload, ToolCall } from '@neko/agent-contracts';
import { validateCanvasMarkdownCapabilityInput } from '@neko/canvas-domain';
import {
  projectMarkdownResourceRendering,
  normalizeMarkdownResourceLookupToken,
} from '../markdown-resource-rendering-presenter';
import type { AmbientCanvasNodeProjection } from '../plugin-transfer-presenter';

describe('markdown resource rendering presenter', () => {
  it('projects markdown table resource tokens from stable tool result resources', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `read-image-cover.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall()],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'read-image-cover.jpg',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/cover'],
        refs: [expect.objectContaining({ label: 'read-image-cover.jpg' })],
      }),
    );
    expect(JSON.stringify(projection.tokens[0]?.refs)).not.toContain(
      'http://127.0.0.1:43125/v1/resources/cover',
    );
  });

  it('does not bind missing tokens by image order', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P9 | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall()],
    });

    expect(projection.status).toBe('diagnostic');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'P9',
        status: 'missing',
      }),
    );
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'missing-resource-token',
    ]);
  });

  it('binds scoped page tokens from imageInfo entries in the current tool result', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P1 | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadDocumentToolCall()],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/page-1'],
        resources: [
          expect.objectContaining({
            token: 'P1',
            contentLocator: expect.objectContaining({ entryPath: 'OPS/page-1.jpg' }),
          }),
        ],
      }),
    );
  });

  it('marks repeated scoped page tokens across tool results as ambiguous', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P1 | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadDocumentToolCall({ id: 'read-doc-a', entryPath: 'OPS/a/page-1.jpg' }),
        createReadDocumentToolCall({ id: 'read-doc-b', entryPath: 'OPS/b/page-1.jpg' }),
      ],
    });

    expect(projection.status).toBe('diagnostic');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'P1',
        status: 'ambiguous',
      }),
    );
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: 'ambiguous-resource-token',
        token: 'P1',
      }),
    ]);
  });

  it('binds ReadImage-derived asset labels from stable image metadata', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `read-image-cover.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadImageToolCall({
          label: 'Cover',
          entryPath: 'image/cover.jpg',
          includeAttachments: false,
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'read-image-cover.jpg',
        status: 'bound',
        resources: [
          expect.objectContaining({
            token: 'read-image-cover.jpg',
            contentLocator: expect.objectContaining({ path: 'image/cover.jpg' }),
          }),
        ],
      }),
    );
  });

  it('binds stable ReadImage asset ids back to their resource refs', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `read-image-moe-010564.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadImageToolCall({
          label: 'moe-010564.jpg',
          entryPath: 'image/moe-010564.jpg',
          assetId: 'read-image-moe-010564.jpg',
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'read-image-moe-010564.jpg',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/cover'],
        resources: [
          expect.objectContaining({
            token: 'read-image-moe-010564.jpg',
            contentLocator: expect.objectContaining({ path: 'image/moe-010564.jpg' }),
          }),
        ],
      }),
    );
  });

  it('binds screenshot-style source page and perception card columns', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| 镜号 | 来源页 / 感知卡 | 画面内容 | 镜头设计 |',
        '| --- | --- | --- | --- |',
        '| S01 | `read-image-p01-cover` | 主角立于黑白工业巨构前 | 中远景 |',
      ].join('\n'),
      toolCalls: [
        createReadImageToolCall({
          label: 'p01-cover',
          entryPath: 'images/p01-cover.jpg',
          assetId: 'read-image-p01-cover',
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'read-image-p01-cover',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/cover'],
        resources: [
          expect.objectContaining({
            token: 'read-image-p01-cover',
            contentLocator: expect.objectContaining({ path: 'images/p01-cover.jpg' }),
          }),
        ],
      }),
    ]);
  });

  it('binds CommonMark image targets from ReadImage document resources', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: '![第 1 页](P1)',
      toolCalls: [
        createReadImageDocumentResourceToolCall({
          label: 'Page 1',
          entryPath: 'image/moe-010564.jpg',
          renderUri: 'http://127.0.0.1:43125/v1/resources/moe-page-1',
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/moe-page-1'],
        resources: [
          expect.objectContaining({
            token: 'P1',
            contentLocator: expect.objectContaining({ entryPath: 'image/moe-010564.jpg' }),
          }),
        ],
      }),
    ]);
  });

  it('binds zero-based scoped page aliases from a ReadImage document resource batch', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| 镜头 | 来源 | 画面内容 |',
        '| --- | --- | --- |',
        '| S001 | P00 | 封面页 |',
        '| S002 | P01 | 第一张正文图 |',
        '| S003 | P02 | 第二张正文图 |',
      ].join('\n'),
      toolCalls: [createReadImageDocumentResourceBatchToolCall()],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P00',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/cover'],
        resources: [
          expect.objectContaining({
            token: 'P00',
            contentLocator: expect.objectContaining({ entryPath: 'image/cover.jpg' }),
          }),
        ],
      }),
      expect.objectContaining({
        token: 'P01',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/moe-010564'],
        resources: [
          expect.objectContaining({
            token: 'P01',
            contentLocator: expect.objectContaining({ entryPath: 'image/moe-010564.jpg' }),
          }),
        ],
      }),
      expect.objectContaining({
        token: 'P02',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/moe-003015'],
        resources: [
          expect.objectContaining({
            token: 'P02',
            contentLocator: expect.objectContaining({ entryPath: 'image/moe-003015.jpg' }),
          }),
        ],
      }),
    ]);
  });

  it('binds document entry paths and basenames from DocumentEntryContentLocator values', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot | source | visual |',
        '| --- | --- | --- |',
        '| 1 | ![page](image/moe-010564.jpg) | Opening frame |',
        '| 2 | ![page](moe-010564.jpg) | Detail frame |',
      ].join('\n'),
      toolCalls: [
        createReadImageManagedDocumentResourceToolCall({
          entryPath: 'image/moe-010564.jpg',
          renderUri: 'http://127.0.0.1:43125/v1/resources/managed-moe-page',
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'image/moe-010564.jpg',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/managed-moe-page'],
      }),
      expect.objectContaining({
        token: 'moe-010564.jpg',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/managed-moe-page'],
      }),
    ]);
  });

  it('binds document image basenames without requiring generated read-image prefixes', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `moe-010564.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadImageToolCall({
          label: 'Moe page',
          entryPath: 'image/moe-010564.jpg',
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'moe-010564.jpg',
        status: 'bound',
      }),
    );
  });

  it('binds Neko resource-reference embeds through the shared resource index', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: '![[cover.png]]',
      toolCalls: [createReadImageToolCall({ label: 'cover.png', entryPath: 'cover.png' })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.diagnostics).toEqual([]);
    expect(projection.resourceReferences).toEqual([
      expect.objectContaining({
        raw: '![[cover.png]]',
        lookupToken: 'cover.png',
        embed: true,
        status: 'bound',
        ref: expect.objectContaining({
          kind: 'workspace-file',
          namespace: 'content',
        }),
      }),
    ]);
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'cover.png',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/cover'],
      }),
    ]);
  });

  it('treats panel hints as placement intent without requiring separate resources', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P1#panel_2 | Close-up from page panel |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall({ alias: 'P1', label: 'Page 1' })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
      }),
    ]);
    expect(projection.diagnostics).toEqual([]);
  });

  it('treats CommonMark image panel hints as placement intent on the base token', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: '![panel](P1#panel_2)',
      toolCalls: [createReadImageToolCall({ alias: 'P1', label: 'Page 1' })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
      }),
    ]);
  });

  it('binds scoped page tokens from nested ReadDocument excerpt imageInfo entries', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| scene | shot | source | visual |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Wide panel |',
      ].join('\n'),
      toolCalls: [createReadDocumentToolCall({ nestedExcerpt: true })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/page-1'],
        resources: [
          expect.objectContaining({
            token: 'P1',
            contentLocator: expect.objectContaining({ entryPath: 'OPS/page-1.jpg' }),
          }),
        ],
      }),
    ]);
  });

  it('builds scoped page tokens from perception cards when result data has only media refs', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| scene | shot | source | visual |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Wide panel |',
      ].join('\n'),
      toolCalls: [createPerceptionOnlyToolCall()],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
        renderUris: ['http://127.0.0.1:43125/v1/resources/page-1'],
      }),
    ]);
  });

  it('keeps explicit document content locators for Canvas handoff', () => {
    const markdown = [
      '| scene | shot | source | visual |',
      '| --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide panel |',
    ].join('\n');
    const projection = projectMarkdownResourceRendering({
      markdown,
      toolCalls: [createReadImageDocumentResourceFieldToolCall()],
    });
    const resource = projection.tokens[0]?.resources[0];

    expect(projection.status).toBe('ready');
    expect(resource).toEqual(
      expect.objectContaining({
        token: 'P1',
        contentLocator: expect.objectContaining({ entryPath: 'OPS/page-1.jpg' }),
      }),
    );
    expect(resource).not.toHaveProperty('sourcePath');
    expect(
      validateCanvasMarkdownCapabilityInput({
        capabilityId: 'canvas.ingestMarkdown',
        markdown,
        sourceFormat: 'gfm-table',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        resources: projection.tokens.flatMap((token) => token.resources),
      }),
    ).toEqual([]);
  });

  it('does not turn plain table source tokens into diagnostics without image resource context', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| scene | shot | source | visual |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Wide panel |',
      ].join('\n'),
      toolCalls: [],
    });

    expect(projection).toEqual({ status: 'none', tokens: [], diagnostics: [] });
  });

  it('distinguishes explicit image targets caused by absent resource context', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: '![Page 1](P1)',
      toolCalls: [],
    });

    expect(projection.status).toBe('diagnostic');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'P1',
        status: 'missing',
        diagnostics: [
          expect.objectContaining({
            code: 'missing-resource-context',
          }),
        ],
      }),
    );
  });

  it('does not treat CommonMark image alt text as a separate resource token', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | ![cover](assets/cover.png) | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall({ alias: 'assets/cover.png', label: 'cover.png' })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'assets/cover.png',
        status: 'bound',
      }),
    ]);
    expect(projection.diagnostics).toEqual([]);
  });

  it('normalizes markdown resource tokens without draft-runtime', () => {
    expect(normalizeMarkdownResourceLookupToken('`read-image-cover.jpg`')).toBe(
      'read_image_cover.jpg',
    );
    expect(normalizeMarkdownResourceLookupToken('Page 1')).toBe('page_1');
  });

  it('resolves markdown mentions from Agent context chips to stable refs', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: 'Use @Rin in the image prompt.',
      contextChips: [
        createContextChip({
          type: 'character',
          id: 'character-rin',
          label: 'Rin',
          summary: 'Lead character',
        }),
      ],
      requireResolvedReferences: true,
    });

    expect(projection.status).toBe('ready');
    expect(projection.mentions).toEqual([
      expect.objectContaining({
        raw: '@Rin',
        label: 'Rin',
        status: 'bound',
        ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
      }),
    ]);
    expect(projection.diagnostics).toEqual([]);
  });

  it('resolves markdown mentions from ambient Canvas nodes', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: 'Extend @group-01 with a close-up panel.',
      ambientNodes: [createAmbientCanvasNode({ nodeId: 'group-01', type: 'group' })],
      requireResolvedReferences: true,
    });

    expect(projection.status).toBe('ready');
    expect(projection.mentions).toEqual([
      expect.objectContaining({
        raw: '@group-01',
        status: 'bound',
        ref: { kind: 'canvas-node', id: 'group-01', namespace: 'canvas' },
      }),
    ]);
  });

  it('resolves markdown mentions from explicit mention items', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: 'Attach @OpeningScript as source context.',
      mentionItems: [
        {
          id: 'script-1',
          kind: 'file',
          label: 'OpeningScript',
          filePath: 'story/opening-script.md',
          description: 'Opening scene source',
        },
      ],
      requireResolvedReferences: true,
    });

    expect(projection.status).toBe('ready');
    expect(projection.mentions).toEqual([
      expect.objectContaining({
        raw: '@OpeningScript',
        status: 'bound',
        ref: { kind: 'file', id: 'story/opening-script.md' },
      }),
    ]);
  });

  it('does not resolve ambiguous markdown mentions by display order', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: 'Compare @Rin references before handoff.',
      contextChips: [
        createContextChip({
          type: 'character',
          id: 'character-rin-main',
          label: 'Rin',
          summary: 'Main continuity',
        }),
        createContextChip({
          type: 'character',
          id: 'character-rin-alt',
          label: 'Rin',
          summary: 'Alternate costume',
        }),
      ],
      requireResolvedReferences: true,
    });

    expect(projection.status).toBe('diagnostic');
    expect(projection.mentions).toEqual([
      expect.objectContaining({
        raw: '@Rin',
        status: 'ambiguous',
        candidates: [
          { kind: 'character', id: 'character-rin-main', namespace: 'entity' },
          { kind: 'character', id: 'character-rin-alt', namespace: 'entity' },
        ],
      }),
    ]);
    expect(projection.mentions?.[0]?.ref).toBeUndefined();
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: 'MD_MENTION_AMBIGUOUS',
        token: '@Rin',
      }),
    ]);
  });

  it('emits diagnostics for unresolved mentions when stable refs are required', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: 'Generate a shot for @UnknownCharacter.',
      requireResolvedReferences: true,
    });

    expect(projection.status).toBe('diagnostic');
    expect(projection.mentions).toEqual([
      expect.objectContaining({
        raw: '@UnknownCharacter',
        status: 'missing',
      }),
    ]);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: 'MD_MENTION_MISSING',
        token: '@UnknownCharacter',
      }),
    ]);
  });

  it('projects semantic prompt spans for read-only renderer metadata', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: 'Alley at night. Rin enters.',
      promptSpans: [
        {
          kind: 'scene',
          range: { startOffset: 0, endOffset: 14 },
          fieldId: 'scene.location',
          label: 'Alley',
          tone: 'scene',
          tooltip: 'Scene location span',
          ref: { kind: 'canvas-node', id: 'scene-1', namespace: 'canvas' },
        },
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.promptSpans).toEqual([
      {
        kind: 'scene',
        range: { startOffset: 0, endOffset: 14 },
        fieldId: 'scene.location',
        label: 'Alley',
        tone: 'scene',
        tooltip: 'Scene location span',
        ref: { kind: 'canvas-node', id: 'scene-1', namespace: 'canvas' },
      },
    ]);
    expect(projection.diagnostics).toEqual([]);
  });
});

function createContextChip(
  overrides: Pick<AgentContextPayload, 'type' | 'id' | 'label' | 'summary'>,
): AgentContextPayload {
  return {
    ...overrides,
    data: {},
  };
}

function createAmbientCanvasNode(
  overrides: Pick<AmbientCanvasNodeProjection, 'nodeId' | 'type'>,
): AmbientCanvasNodeProjection {
  return {
    summary: `${overrides.nodeId} ${overrides.type}`,
    ...overrides,
  };
}

function createReadImageToolCall(
  overrides: {
    readonly alias?: string;
    readonly label?: string;
    readonly entryPath?: string;
    readonly assetId?: string;
    readonly includeAttachments?: boolean;
  } = {},
): ToolCall {
  const entryPath = overrides.entryPath ?? 'assets/read-image-cover.jpg';
  return {
    id: 'read-image',
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        images: [
          {
            label: overrides.label ?? 'read-image-cover.jpg',
            ...(overrides.alias ? { alias: overrides.alias } : {}),
            ...(overrides.entryPath ? { entryPath: overrides.entryPath } : {}),
            mimeType: 'image/jpeg',
            contentLocator: {
              kind: 'workspace-file',
              path: entryPath,
            },
          },
        ],
      },
      ...(overrides.includeAttachments === false
        ? {}
        : {
            attachments: [
              {
                type: 'image',
                path: 'http://127.0.0.1:43125/v1/resources/cover',
                mimeType: 'image/jpeg',
                assetRef: {
                  assetId: overrides.assetId ?? 'read-image-cover',
                  uri: 'http://127.0.0.1:43125/v1/resources/cover',
                  mimeType: 'image/jpeg',
                  ...(overrides.label ? { label: overrides.label } : {}),
                },
              },
            ],
          }),
    },
  };
}

function createReadImageDocumentResourceToolCall(
  overrides: {
    readonly label?: string;
    readonly entryPath?: string;
    readonly renderUri?: string;
  } = {},
): ToolCall {
  const entryPath = overrides.entryPath ?? 'image/moe-010564.jpg';
  const contentLocator = {
    kind: 'document-entry' as const,
    source: {
      kind: 'workspace-file' as const,
      path: 'books/story.epub',
    },
    entryPath,
  };
  return {
    id: 'read-image-document',
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        images: [
          {
            label: overrides.label ?? 'Page 1',
            entryPath,
            mimeType: 'image/jpeg',
            contentLocator,
          },
        ],
      },
      attachments: [
        {
          type: 'image',
          path: overrides.renderUri ?? 'http://127.0.0.1:43125/v1/resources/document-page',
          mimeType: 'image/jpeg',
          assetRef: {
            assetId: 'read-image-page-1',
            uri: entryPath,
            mimeType: 'image/jpeg',
            label: overrides.label ?? 'Page 1',
            contentLocator: contentLocator,
          },
        },
      ],
      perceptionCards: [
        {
          assetId: 'read-image-page-1',
          modality: 'image',
          createdAt: 1,
          layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
          structural: {
            format: 'jpeg',
            mimeType: 'image/jpeg',
            byteSize: 1024,
          },
          perceptual: {
            thumbnailRef: {
              assetId: 'read-image-page-1',
              uri: entryPath,
              mimeType: 'image/jpeg',
              label: overrides.label ?? 'Page 1',
              contentLocator: contentLocator,
            },
          },
        },
      ],
    },
  };
}

function createReadImageDocumentResourceBatchToolCall(): ToolCall {
  const entries = [
    {
      label: 'read-image-cover.jpg',
      entryPath: 'image/cover.jpg',
      renderUri: 'http://127.0.0.1:43125/v1/resources/cover',
    },
    {
      label: 'read-image-moe-010564.jpg',
      entryPath: 'image/moe-010564.jpg',
      renderUri: 'http://127.0.0.1:43125/v1/resources/moe-010564',
    },
    {
      label: 'read-image-moe-003015.jpg',
      entryPath: 'image/moe-003015.jpg',
      renderUri: 'http://127.0.0.1:43125/v1/resources/moe-003015',
    },
  ];
  const source = {
    kind: 'workspace-file' as const,
    path: 'epub/animation/Blame/volume-01.epub',
  };
  return {
    id: 'read-image-document-batch',
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        mode: 'metadata',
        images: entries.map((entry) => ({
          label: entry.label,
          entryPath: entry.entryPath,
          mimeType: 'image/jpeg',
          contentLocator: {
            kind: 'document-entry',
            source,
            entryPath: entry.entryPath,
          },
        })),
      },
      attachments: entries.map((entry) => ({
        type: 'image',
        path: entry.renderUri,
        mimeType: 'image/jpeg',
        assetRef: {
          assetId: entry.label,
          uri: entry.entryPath,
          mimeType: 'image/jpeg',
          label: entry.label,
          contentLocator: {
            kind: 'document-entry',
            source,
            entryPath: entry.entryPath,
          },
        },
      })),
    },
  };
}

function createReadImageManagedDocumentResourceToolCall(
  overrides: {
    readonly entryPath?: string;
    readonly renderUri?: string;
  } = {},
): ToolCall {
  const entryPath = overrides.entryPath ?? 'image/moe-010564.jpg';
  return {
    id: 'read-image-managed-document',
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        images: [
          {
            label: 'Moe page',
            mimeType: 'image/jpeg',
            contentLocator: {
              kind: 'document-entry',
              source: { kind: 'workspace-file', path: 'books/story.epub' },
              entryPath,
            },
          },
        ],
      },
      attachments: [
        {
          type: 'image',
          path: overrides.renderUri ?? 'http://127.0.0.1:43125/v1/resources/managed-document-page',
          mimeType: 'image/jpeg',
          assetRef: {
            assetId: 'read-image-managed-moe-page',
            uri: entryPath,
            mimeType: 'image/jpeg',
            label: 'Moe page',
          },
        },
      ],
    },
  };
}

function createReadDocumentToolCall(
  overrides: {
    readonly id?: string;
    readonly label?: string;
    readonly entryPath?: string;
    readonly sourcePath?: string;
    readonly nestedExcerpt?: boolean;
  } = {},
): ToolCall {
  const entryPath = overrides.entryPath ?? 'OPS/page-1.jpg';
  const imageInfo = [
    {
      label: overrides.label ?? 'Page 1',
      entryPath,
      mimeType: 'image/jpeg',
      width: 1494,
      height: 2133,
      contentLocator: {
        kind: 'document-entry',
        source: {
          kind: 'workspace-file',
          path: (overrides.sourcePath ?? 'books/story.epub').replace(/^\/+/u, ''),
        },
        entryPath,
      },
    },
  ];
  return {
    id: overrides.id ?? 'read-doc',
    name: 'ReadDocument',
    arguments: {},
    result: {
      success: true,
      data: {
        ...(overrides.nestedExcerpt
          ? { excerpt: { contentKind: 'image', imageInfo } }
          : { imageInfo }),
      },
      attachments: [
        {
          type: 'image',
          path: 'http://127.0.0.1:43125/v1/resources/page-1',
          mimeType: 'image/jpeg',
        },
      ],
    },
  };
}

function createPerceptionOnlyToolCall(): ToolCall {
  const contentLocator = {
    kind: 'document-entry' as const,
    source: {
      kind: 'workspace-file' as const,
      path: 'books/story.epub',
    },
    entryPath: 'OPS/page-1.jpg',
  };
  return {
    id: 'read-image-perception-only',
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        mode: 'metadata',
      },
      attachments: [
        {
          type: 'image',
          path: 'http://127.0.0.1:43125/v1/resources/page-1',
          mimeType: 'image/jpeg',
          assetRef: {
            assetId: 'read-image-page-1',
            uri: 'OPS/page-1.jpg',
            mimeType: 'image/jpeg',
            label: 'Page 1',
            contentLocator,
          },
        },
      ],
      perceptionCards: [
        {
          assetId: 'read-image-page-1',
          modality: 'image',
          createdAt: 1,
          layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
          structural: {
            format: 'jpeg',
            mimeType: 'image/jpeg',
            byteSize: 1024,
            width: 1494,
            height: 2133,
          },
          perceptual: {
            thumbnailRef: {
              assetId: 'read-image-page-1',
              uri: 'OPS/page-1.jpg',
              mimeType: 'image/jpeg',
              label: 'Page 1',
              contentLocator,
            },
          },
        },
      ],
    },
  };
}

function createReadImageDocumentResourceFieldToolCall(): ToolCall {
  const contentLocator = {
    kind: 'document-entry' as const,
    source: {
      kind: 'workspace-file' as const,
      path: 'books/story.epub',
    },
    entryPath: 'OPS/page-1.jpg',
  };
  return {
    id: 'read-image-document-ref-field',
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        images: [
          {
            label: 'Page 1',
            entryPath: 'OPS/page-1.jpg',
            mimeType: 'image/jpeg',
            contentLocator,
          },
        ],
      },
      attachments: [
        {
          type: 'image',
          path: 'http://127.0.0.1:43125/v1/resources/page-1',
          mimeType: 'image/jpeg',
          assetRef: {
            assetId: 'read-image-page-1',
            uri: 'OPS/page-1.jpg',
            mimeType: 'image/jpeg',
            label: 'Page 1',
            contentLocator,
          },
        },
      ],
    },
  };
}
