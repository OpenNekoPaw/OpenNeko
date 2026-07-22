import {
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PERCEPTION,
  TOOL_NAMES_QUALITY,
  type Tool,
} from '@neko/shared';
import { createReadDocumentTool, createReadImageTool } from '@neko/content/document';
import { Value } from 'typebox/value';
import { describe, expect, it, vi } from 'vitest';

import {
  MAX_PI_TOOL_RESULT_IMAGE_PAYLOAD_BYTES,
  MAX_PI_TOOL_RESULT_IMAGE_TOTAL_BYTES,
  MAX_PI_TOOL_RESULT_SOURCE_IMAGES,
  projectOpenNekoTool,
  OpenNekoPiToolExecutionError,
  resolveOpenNekoToolModelPurpose,
} from '../openneko-tool';

function tool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'InspectAsset',
    description: 'Inspect one asset',
    localization: { zh: { description: '检查一个资源' } },
    category: 'analysis',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['assetId'],
      additionalProperties: false,
    },
    requirements: { writableProject: true },
    execute: vi.fn(async () => ({ success: true, data: { evidence: 'ok' } })),
    ...overrides,
  };
}

const context = {
  identity: {
    workspaceId: 'workspace-1',
    conversationId: 'conversation-1',
    branchId: 'branch-1',
    turnId: 'turn-1',
    runId: 'run-1',
    toolCallId: 'tool-call-1',
  },
  workspaceTrusted: true,
};

describe('OpenNeko tool projection to Pi', () => {
  it.each([
    [TOOL_NAMES_QUALITY.QUALITY_CHECK, 'image.understand'],
    [TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND, 'image.understand'],
    [TOOL_NAMES_MEDIA.GENERATE_IMAGE, 'image.generate'],
    [TOOL_NAMES_MEDIA.TRANSFORM_IMAGE, 'image.edit'],
    [TOOL_NAMES_MEDIA.GENERATE_VIDEO, 'video.generate'],
    [TOOL_NAMES_MEDIA.GENERATE_MUSIC, 'audio.music.generate'],
    [TOOL_NAMES_MEDIA.GENERATE_TTS, 'audio.tts'],
  ] as const)('maps %s to its flat model purpose', (name, purpose) => {
    expect(resolveOpenNekoToolModelPurpose({ name })).toBe(purpose);
  });

  it('does not invent a purpose for a tool without a configured model contract', () => {
    expect(resolveOpenNekoToolModelPurpose({ name: 'InspectAsset' })).toBeUndefined();
  });

  it('preserves the strict JSON schema and localized description', () => {
    const projected = projectOpenNekoTool(tool({ isReadOnly: true, requiresConfirmation: false }), {
      locale: 'zh',
      modelPurpose: 'image.understand',
    });

    expect(projected.description).toBe('检查一个资源');
    expect(projected.parameters).toMatchObject({
      type: 'object',
      required: ['assetId'],
      additionalProperties: false,
      properties: {
        assetId: { type: 'string', minLength: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    });
    expect(projected.modelPurpose).toBe('image.understand');
    expect(projected.requirements).toEqual({ workspaceTrust: true });
    expect(projected.isReadOnly).toBe(true);
    expect(projected.requiresConfirmation).toBe(false);
  });

  it('projects the complete ReadDocument chapter locator contract to Pi', () => {
    const projected = projectOpenNekoTool(createReadDocumentTool({}));
    const base = {
      source: { kind: 'file', path: '${A}/books/book.epub' },
      mode: 'range',
      range: {
        locator: { kind: 'chapter', spineIndex: 304 },
        endLocator: { kind: 'chapter', spineIndex: 401 },
        limit: { maxChars: 1000, maxImages: 100 },
      },
      include_images: true,
      max_chars: 1000,
      max_images: 100,
    };

    expect(Value.Check(projected.parameters, base)).toBe(false);
    expect(
      Value.Check(projected.parameters, {
        ...base,
        range: {
          ...base.range,
          locator: { kind: 'chapter', chapterHref: 'page-305.xhtml', spineIndex: 304 },
          endLocator: { kind: 'chapter', chapterHref: 'page-402.xhtml', spineIndex: 401 },
        },
      }),
    ).toBe(true);
  });

  it('projects the discriminated ReadImage resource contract to Pi', () => {
    const projected = projectOpenNekoTool(createReadImageTool({}));
    const documentImage = {
      entryPath: 'images/page-1.jpg',
      resourceRef: {
        kind: 'document-entry',
        source: { filePath: 'books/book.epub', format: 'epub' },
        entryPath: 'images/page-1.jpg',
      },
    };
    const managedImage = {
      resourceRef: {
        id: 'resource-1',
        scope: 'project',
        provider: 'source-file',
        kind: 'image',
        source: { kind: 'file', filePath: 'images/reference.png' },
        fingerprint: { strategy: 'none', value: 'resource-1' },
      },
    };
    const contentLocatorImage = {
      contentLocator: {
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'books/book.epub' },
        entryPath: 'images/page-1.jpg',
      },
    };

    expect(Value.Check(projected.parameters, { images: [documentImage] })).toBe(true);
    expect(
      Value.Check(projected.parameters, {
        images: [
          {
            ...documentImage,
            resourceRef: {
              kind: 'document-entry',
              source: documentImage.resourceRef.source,
            },
          },
        ],
      }),
    ).toBe(false);
    expect(Value.Check(projected.parameters, { images: [managedImage] })).toBe(true);
    expect(Value.Check(projected.parameters, { images: [contentLocatorImage] })).toBe(true);
    expect(
      Value.Check(projected.parameters, {
        images: [
          {
            ...contentLocatorImage,
            contentLocator: {
              ...contentLocatorImage.contentLocator,
              source: { kind: 'workspace-file' },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(projected.parameters).toMatchObject({
      properties: {
        images: {
          items: {
            properties: {
              contentLocator: {
                anyOf: [
                  expect.any(Object),
                  expect.objectContaining({ required: ['kind', 'source', 'entryPath'] }),
                  expect.any(Object),
                  expect.any(Object),
                ],
              },
              resourceRef: {
                anyOf: [
                  expect.objectContaining({ required: ['kind', 'source', 'entryPath'] }),
                  expect.objectContaining({
                    required: ['id', 'scope', 'provider', 'kind', 'source', 'fingerprint'],
                  }),
                ],
              },
            },
          },
        },
      },
    });
  });

  it('executes through the owning Tool with explicit identity and model facts', async () => {
    const execute = vi.fn(async () => ({ success: true, data: { evidence: 'ok' } }));
    const projected = projectOpenNekoTool(tool({ execute }), {
      modelPurpose: 'image.understand',
    });
    const result = await projected.execute({
      args: { assetId: 'asset-1' },
      context: {
        ...context,
        modelUse: {
          purpose: 'image.understand',
          model: {
            id: 'vision-model',
            name: 'Vision',
            provider: 'provider-1',
            api: 'openai-completions',
            baseUrl: 'https://example.invalid/v1',
            reasoning: false,
            input: ['text', 'image'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32_000,
            maxTokens: 4_096,
          },
          parameters: { temperature: 0.2 },
        },
        purposeModel: {
          purpose: 'image.understand',
          providerId: 'provider-1',
          modelId: 'vision-model',
          complete: vi.fn(),
        },
      },
    });

    expect(execute).toHaveBeenCalledWith(
      { assetId: 'asset-1' },
      expect.objectContaining({
        metadata: expect.objectContaining({
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
          modelPurpose: 'image.understand',
          modelId: 'vision-model',
        }),
        purposeModel: expect.objectContaining({
          purpose: 'image.understand',
          providerId: 'provider-1',
          modelId: 'vision-model',
        }),
      }),
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"evidence":"ok"}' }],
      details: { success: true, data: { evidence: 'ok' } },
    });
  });

  it('projects stable image attachments through the injected Host loader', async () => {
    const assetRef = {
      assetId: 'document-page-1',
      uri: 'book.epub#images/page-1.png',
      mimeType: 'image/png',
      documentResourceRef: {
        kind: 'document-entry' as const,
        source: { filePath: 'book.epub', format: 'epub' as const },
        entryPath: 'images/page-1.png',
        versionPolicy: 'versioned-export' as const,
      },
    };
    const load = vi.fn(async () => ({
      kind: 'image' as const,
      url: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
      mimeType: 'image/png',
    }));
    const projected = projectOpenNekoTool(
      tool({
        execute: async () => ({
          success: true,
          data: { imageCount: 1 },
          attachments: [{ type: 'image', path: assetRef.uri, mimeType: 'image/png', assetRef }],
        }),
      }),
      { assetLoader: { load } },
    );

    await expect(projected.execute({ args: {}, context })).resolves.toEqual({
      content: [
        { type: 'text', text: '{"imageCount":1}' },
        { type: 'image', data: 'aW1hZ2UtYnl0ZXM=', mimeType: 'image/png' },
      ],
      details: expect.objectContaining({ success: true, data: { imageCount: 1 } }),
    });
    expect(load).toHaveBeenCalledWith(assetRef);
  });

  it('uses one Host batch projection for multiple source images and preserves ordered coverage', async () => {
    const refs = [0, 1].map((index) => ({
      assetId: `page-${index + 1}`,
      uri: `content:page-${index + 1}`,
      mimeType: 'image/png',
    }));
    const load = vi.fn(async () => {
      throw new Error('single-image loading must not run');
    });
    const loadBatch = vi.fn(async () => [
      {
        payload: {
          kind: 'image' as const,
          url: 'data:image/jpeg;base64,Y29udGFjdC1zaGVldA==',
          mimeType: 'image/jpeg',
        },
        sourceIndexes: [0, 1],
      },
    ]);
    const projected = projectOpenNekoTool(
      tool({
        execute: async () => ({
          success: true,
          data: { imageCount: 2, analysis: 'storyboard' },
          attachments: refs.map((assetRef) => ({
            type: 'image' as const,
            path: assetRef.uri,
            assetRef,
          })),
        }),
      }),
      { assetLoader: { load, loadBatch } },
    );

    const result = await projected.execute({ args: {}, context });

    expect(result.content).toEqual([
      { type: 'text', text: '{"imageCount":2,"analysis":"storyboard"}' },
      {
        type: 'text',
        text: [
          'Contact-sheet tile manifest (labels are local to each sheet):',
          'sheet 1, tile 1 = page-1 [page-1]',
          'sheet 1, tile 2 = page-2 [page-2]',
        ].join('\n'),
      },
      { type: 'image', data: 'Y29udGFjdC1zaGVldA==', mimeType: 'image/jpeg' },
    ]);
    expect(load).not.toHaveBeenCalled();
    expect(loadBatch).toHaveBeenCalledWith(refs, { layout: 'overview' });
  });

  it('rejects more than five source images before Host batch projection', async () => {
    const refs = Array.from({ length: MAX_PI_TOOL_RESULT_SOURCE_IMAGES + 1 }, (_, index) => ({
      assetId: `page-${index + 1}`,
      uri: `content:page-${index + 1}`,
      mimeType: 'image/png',
    }));
    const loadBatch = vi.fn();
    const projected = projectOpenNekoTool(
      tool({
        execute: async () => ({
          success: true,
          data: { imageCount: refs.length, analysis: 'storyboard' },
          attachments: refs.map((assetRef) => ({
            type: 'image' as const,
            path: assetRef.uri,
            assetRef,
          })),
        }),
      }),
      { assetLoader: { load: vi.fn(), loadBatch } },
    );

    await expect(projected.execute({ args: {}, context })).rejects.toThrow(
      `maximum is ${MAX_PI_TOOL_RESULT_SOURCE_IMAGES}`,
    );
    expect(loadBatch).not.toHaveBeenCalled();
  });

  it('rejects an oversized provider-bound image before the next model request', async () => {
    const oversized = Buffer.alloc(MAX_PI_TOOL_RESULT_IMAGE_PAYLOAD_BYTES + 1).toString('base64');
    const projected = projectOpenNekoTool(
      tool({
        execute: async () => ({
          success: true,
          data: { imageCount: 1 },
          attachments: [
            {
              type: 'image',
              path: 'content:page-1',
              assetRef: {
                assetId: 'page-1',
                uri: 'content:page-1',
                mimeType: 'image/jpeg',
              },
            },
          ],
        }),
      }),
      {
        assetLoader: {
          load: async () => ({
            kind: 'image',
            url: `data:image/jpeg;base64,${oversized}`,
            mimeType: 'image/jpeg',
          }),
        },
      },
    );

    await expect(projected.execute({ args: {}, context })).rejects.toThrow(
      `maximum is ${MAX_PI_TOOL_RESULT_IMAGE_PAYLOAD_BYTES}`,
    );
  });

  it('rejects a provider-bound image batch that exceeds the total byte budget', async () => {
    const refs = Array.from({ length: 4 }, (_, index) => ({
      assetId: `page-${index + 1}`,
      uri: `content:page-${index + 1}`,
      mimeType: 'image/jpeg',
    }));
    const payloadBytes = Math.floor(MAX_PI_TOOL_RESULT_IMAGE_TOTAL_BYTES / 4) + 1;
    const data = Buffer.alloc(payloadBytes).toString('base64');
    const projected = projectOpenNekoTool(
      tool({
        execute: async () => ({
          success: true,
          data: { imageCount: refs.length },
          attachments: refs.map((assetRef) => ({
            type: 'image' as const,
            path: assetRef.uri,
            assetRef,
          })),
        }),
      }),
      {
        assetLoader: {
          load: async () => {
            throw new Error('single-image loading must not run');
          },
          loadBatch: async () =>
            refs.map((_, index) => ({
              payload: { kind: 'image', url: `data:image/jpeg;base64,${data}` },
              sourceIndexes: [index],
            })),
        },
      },
    );

    await expect(projected.execute({ args: {}, context })).rejects.toThrow(
      `maximum is ${MAX_PI_TOOL_RESULT_IMAGE_TOTAL_BYTES}`,
    );
  });

  it('fails visibly when an image attachment has no Host loader', async () => {
    const projected = projectOpenNekoTool(
      tool({
        execute: async () => ({
          success: true,
          data: { imageCount: 1 },
          attachments: [
            {
              type: 'image',
              path: 'book.epub#images/page-1.png',
              assetRef: {
                assetId: 'document-page-1',
                uri: 'book.epub#images/page-1.png',
                mimeType: 'image/png',
                documentResourceRef: {
                  kind: 'document-entry',
                  source: { filePath: 'book.epub', format: 'epub' },
                  entryPath: 'images/page-1.png',
                },
              },
            },
          ],
        }),
      }),
    );

    await expect(projected.execute({ args: {}, context })).rejects.toThrow(
      'Pi image Tool result requires a Host asset loader.',
    );
  });

  it('rejects non-image or non-base64 Host payloads', async () => {
    const projected = projectOpenNekoTool(
      tool({
        execute: async () => ({
          success: true,
          data: { imageCount: 1 },
          attachments: [
            {
              type: 'image',
              path: 'book.epub#images/page-1.png',
              assetRef: {
                assetId: 'document-page-1',
                uri: 'book.epub#images/page-1.png',
                mimeType: 'image/png',
                documentResourceRef: {
                  kind: 'document-entry',
                  source: { filePath: 'book.epub', format: 'epub' },
                  entryPath: 'images/page-1.png',
                },
              },
            },
          ],
        }),
      }),
      {
        assetLoader: {
          load: async () => ({ kind: 'image', url: 'https://example.invalid/a.png' }),
        },
      },
    );

    await expect(projected.execute({ args: {}, context })).rejects.toThrow(
      'Pi image Tool result requires a base64 data URL.',
    );
  });

  it('propagates failed Tool results instead of presenting fallback success', async () => {
    const projected = projectOpenNekoTool(
      tool({ execute: async () => ({ success: false, error: 'permission denied' }) }),
    );

    await expect(projected.execute({ args: {}, context })).rejects.toEqual(
      expect.objectContaining({
        name: 'OpenNekoPiToolExecutionError',
        message: 'permission denied',
      }) satisfies Partial<OpenNekoPiToolExecutionError>,
    );
  });
});
