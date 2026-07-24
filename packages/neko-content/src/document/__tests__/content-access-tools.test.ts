import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type ContentRepresentationLocator,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
} from '@neko/shared';
import {
  createReadDocumentTool,
  type ReadDocumentContentAccessRuntime,
} from '../read-document-tool';
import {
  createReadImageTool,
  MAX_READ_IMAGE_BYTES,
  type ReadImageContentAccessRuntime,
} from '../read-image-tool';

const documentSource = {
  filePath: '/workspace/books/book.epub',
  format: 'epub' as const,
  fileId: 'book-file-id',
};

const documentContentSource: ContentSourceRef = {
  kind: 'document',
  source: {
    kind: 'document',
    document: documentSource,
    filePath: documentSource.filePath,
  },
  entryPath: 'images/page-1.jpg',
  locator: {
    kind: 'document',
    entryPath: 'images/page-1.jpg',
    locator: { kind: 'chapter', chapterHref: 'page-1', spineIndex: 0 },
  },
};

const archiveRef: DocumentArchiveResourceRef = {
  kind: 'document-entry',
  source: documentSource,
  entryPath: 'images/page-1.jpg',
  locator: { kind: 'chapter', chapterHref: 'page-1', spineIndex: 0 },
  versionPolicy: 'versioned-export',
};

const resourceRef = createResourceRef({
  id: 'res_page_1',
  scope: 'project',
  provider: 'document-archive',
  kind: 'document',
  source: {
    kind: 'document',
    document: documentSource,
    filePath: documentSource.filePath,
  },
  locator: {
    kind: 'document',
    entryPath: archiveRef.entryPath,
    locator: archiveRef.locator,
  },
  fingerprint: createResourceFingerprint({
    strategy: 'identity',
    value: documentSource.fileId,
    providerId: 'document-archive',
  }),
});

const representationLocator: ContentRepresentationLocator = {
  kind: 'content-representation',
  id: 'document-raster-page-1',
  representationKind: 'raster-page',
  source: {
    kind: 'workspace-file',
    path: 'docs/story.pdf',
    fingerprint: { strategy: 'mtime-size', value: '1:100' },
  },
  spec: { kind: 'raster-page', page: 1, format: 'png' },
  generatorId: 'neko-content.document-raster',
  sourceFingerprint: '1:100',
  specFingerprint: 'raster-page-1-png',
  revision: '1',
};

describe('content access tools', () => {
  it('publishes ReadImage stable resourceRef or workspace locator identity branches', () => {
    const tool = createReadImageTool({ contentAccessRuntime: createRuntime() });
    const images = tool.parameters.properties['images'] as {
      readonly items?: {
        readonly anyOf?: readonly { readonly required?: readonly string[] }[];
        readonly required?: readonly string[];
        readonly properties?: {
          readonly resourceRef?: {
            readonly anyOf?: readonly { readonly required?: readonly string[] }[];
          };
          readonly contentLocator?: {
            readonly anyOf?: readonly {
              readonly required?: readonly string[];
              readonly properties?: {
                readonly source?: { readonly required?: readonly string[] };
              };
            }[];
          };
        };
      };
    };

    expect(images.items?.required).toBeUndefined();
    expect(images.items?.anyOf?.map((branch) => branch.required)).toEqual([
      ['resourceRef'],
      ['contentLocator'],
      ['locator'],
      ['representationLocator'],
    ]);
    expect(images.items?.properties?.resourceRef?.anyOf?.[0]?.required).toEqual([
      'kind',
      'source',
      'entryPath',
    ]);
    expect(images.items?.properties?.resourceRef?.anyOf?.[1]?.required).toEqual([
      'id',
      'scope',
      'provider',
      'kind',
      'source',
      'fingerprint',
    ]);
    expect(images.items?.properties?.contentLocator?.anyOf?.[1]?.required).toEqual([
      'kind',
      'source',
      'entryPath',
    ]);
    expect(
      images.items?.properties?.contentLocator?.anyOf?.[1]?.properties?.source?.required,
    ).toEqual(['kind', 'path']);
  });

  it('advertises metadata-only ReadImage mode and rejects legacy model-backed vision mode', async () => {
    const tool = createReadImageTool({ contentAccessRuntime: createRuntime() });
    const mode = tool.parameters.properties['mode'] as {
      readonly enum?: readonly string[];
      readonly description?: string;
    };

    expect(mode.enum).toEqual(['metadata']);
    expect(mode.description).toContain('native multimodal Agent turn');

    await expect(tool.execute({ mode: 'vision' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('no longer performs model-backed vision analysis'),
    });
  });

  it('routes ReadDocument through AgentContentAccessRuntime', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: documentContentSource,
      diagnostics: [],
      resourceRef,
      text: 'hello document',
      totalTextChars: 14,
      returnedTextChars: 14,
      truncated: false,
    });

    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: documentContentSource,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ resourceRef });
    expect(runtime.resolveDocumentContent).toHaveBeenCalledWith({
      source: documentContentSource,
      mode: 'content',
      startBatch: false,
      includeManifest: false,
      includeImages: true,
      maxChars: 20000,
      maxImages: 50,
    });
  });

  it('routes ReadDocument range mode through AgentContentAccessRuntime', async () => {
    const runtime = createRuntime();
    const range = {
      locator: { kind: 'chapter' as const, chapterHref: 'Page_1', spineIndex: 1 },
    };
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: { kind: 'file', path: '${A}/books/book.epub' },
      diagnostics: [],
      text: 'chapter text',
      range,
      imageInfo: [
        {
          entryPath: archiveRef.entryPath,
          locator: archiveRef.locator,
          resourceRef: archiveRef,
        },
      ],
      imageCount: 1,
      imagesTruncated: false,
    });

    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: { kind: 'file', path: '${A}/books/book.epub' },
      mode: 'range',
      range,
      max_images: 5,
    });

    expect(result.success).toBe(true);
    expect(runtime.resolveDocumentContent).toHaveBeenCalledWith({
      source: { kind: 'file', path: '${A}/books/book.epub' },
      mode: 'range',
      range,
      startBatch: false,
      includeManifest: false,
      includeImages: true,
      maxChars: 20000,
      maxImages: 5,
    });
    expect(result.data).toMatchObject({
      mode: 'range',
      text: 'chapter text',
      imageCount: 1,
      imagesTruncated: false,
    });
  });

  it('rejects an incomplete chapter locator before invoking AgentContentAccessRuntime', async () => {
    const runtime = createRuntime();

    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
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
    });

    expect(result).toEqual({
      success: false,
      error:
        'ReadDocument range.locator must match a DocumentLocator; chapter locators require chapterHref.',
    });
    expect(runtime.resolveDocumentContent).not.toHaveBeenCalled();
  });

  it('localizes generated ReadDocument image-only placeholder text for Chinese prompt context', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: { kind: 'file', path: '${A}/books/book.epub' },
      diagnostics: [],
      text: 'EPUB chapter range with 10 image pages',
      imageInfo: [],
      imageCount: 10,
      imagesTruncated: false,
    });

    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute(
      {
        source: { kind: 'file', path: '${A}/books/book.epub' },
        mode: 'range',
        range: {
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
        },
      },
      { metadata: { locale: 'zh-CN' } },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      text: 'EPUB 章节范围包含 10 张图片页面',
    });
  });

  it('passes ReadDocument imageInfo entries to ReadImage through unified content refs', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: { kind: 'file', path: '${A}/books/book.epub' },
      diagnostics: [],
      text: '',
      imageInfo: [
        {
          label: 'page 1',
          entryPath: archiveRef.entryPath,
          locator: archiveRef.locator,
          width: 1,
          height: 1,
          mimeType: 'image/png',
          resourceRef: archiveRef,
        },
      ],
      imageCount: 1,
      imagesTruncated: false,
    });
    runtime.loadProviderAsset.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    runtime.resolveImageMetadata.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: pngBytes().byteLength,
    });

    const documentResult = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: { kind: 'file', path: '${A}/books/book.epub' },
      mode: 'range',
      range: {
        locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
      },
      max_images: 1,
    });
    const imageInfo = (
      documentResult.data as {
        readonly imageInfo: readonly [{ readonly resourceRef: DocumentArchiveResourceRef }];
      }
    ).imageInfo;

    const imageResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: imageInfo,
    });

    expect(documentResult.success).toBe(true);
    expect(imageResult.success).toBe(true);
    expect(runtime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          provider: 'document-archive',
          locator: expect.objectContaining({
            kind: 'document',
            entryPath: archiveRef.entryPath,
          }),
        }),
      }),
    );
  });

  it('passes computed ReadDocument raster pages to ReadImage without exposing a storage path', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: { kind: 'file', path: '/workspace/docs/story.pdf' },
      diagnostics: [],
      text: '',
      imageInfo: [
        {
          label: 'page 1',
          locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
          mimeType: 'image/png',
          representationLocator,
        },
      ],
      imageCount: 1,
      imagesTruncated: false,
      pageCount: 1,
    });
    runtime.loadRepresentationAsset.mockResolvedValueOnce({
      status: 'ready',
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });

    const documentResult = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: { kind: 'file', path: '/workspace/docs/story.pdf' },
      max_images: 1,
    });
    const imageInfo = (
      documentResult.data as {
        readonly imageInfo: readonly [
          { readonly representationLocator: ContentRepresentationLocator },
        ];
      }
    ).imageInfo;
    const imageResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: imageInfo,
    });

    expect(documentResult.success).toBe(true);
    expect(imageResult.success).toBe(true);
    expect(runtime.loadRepresentationAsset).toHaveBeenCalledWith({
      locator: representationLocator,
      maxBytes: 20 * 1024 * 1024,
    });
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(runtime.resolveImageMetadata).not.toHaveBeenCalled();
    expect(imageResult.attachments?.[0]?.path).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(imageResult)).not.toContain('.neko/.cache');
  });

  it('routes ReadImage through provider asset and metadata content access', async () => {
    const runtime = createRuntime();
    runtime.loadProviderAsset.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    runtime.resolveImageMetadata.mockResolvedValueOnce({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: pngBytes().byteLength,
    });

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ resourceRef }],
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      images: [{ portableForTransfer: true, resourceRef }],
    });
    expect(result.perceptionCards?.[0]?.perceptual?.thumbnailRef).toMatchObject({
      resourceRef,
    });
    expect(runtime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        source: resourceRef,
      }),
    );
    expect(runtime.resolveImageMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        source: resourceRef,
      }),
    );
  });

  it('routes a canonical workspace-file locator through unified content access', async () => {
    const runtime = createRuntime();
    runtime.loadProviderAsset.mockResolvedValueOnce({
      status: 'ready',
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    runtime.resolveImageMetadata.mockResolvedValueOnce({
      status: 'ready',
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: pngBytes().byteLength,
    });
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Reference/library-image.png',
    };

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ locator }],
      mode: 'metadata',
    });

    expect(result).toMatchObject({
      success: true,
      data: { images: [{ locator }] },
    });
    expect(runtime.loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          provider: 'source-file-content-access',
          kind: 'media',
          source: {
            kind: 'file',
            projectRelativePath: 'neko/assets/Reference/library-image.png',
          },
        }),
      }),
    );
    expect(result.perceptionCards?.[0]?.perceptual?.thumbnailRef).toMatchObject({
      resourceRef: expect.objectContaining({ provider: 'source-file-content-access' }),
    });
  });

  it('passes a ReadDocument document-entry locator unchanged to the narrow read port', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValueOnce({
      status: 'ready',
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    const contentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/comic.cbz' },
      entryPath: 'pages/001.png',
    };

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ contentLocator }],
      mode: 'metadata',
    });

    expect(result).toMatchObject({
      success: true,
      data: { images: [{ contentLocator }] },
    });
    expect(runtime.loadContentAsset).toHaveBeenCalledWith({
      locator: contentLocator,
      maxBytes: MAX_READ_IMAGE_BYTES,
    });
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(result.perceptionCards?.[0]?.perceptual?.thumbnailRef).toMatchObject({
      contentLocator,
    });
  });

  it('selects at most five ordered images before loading a provider continuation batch', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValue({
      status: 'ready',
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    const images = Array.from({ length: 12 }, (_, index) => ({
      label: `Page ${index + 1}`,
      contentLocator: {
        kind: 'document-entry' as const,
        source: { kind: 'workspace-file' as const, path: 'books/comic.cbz' },
        entryPath: `pages/${String(index + 1).padStart(3, '0')}.png`,
      },
    }));

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images,
      max_images: 12,
      mode: 'metadata',
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        images: images.slice(0, 5),
        imageCount: 12,
        imagesTruncated: true,
      },
    });
    expect(runtime.loadContentAsset).toHaveBeenCalledTimes(5);
  });

  it('rejects an invalid content locator instead of falling back to a sibling resource ref', async () => {
    const runtime = createRuntime();
    runtime.loadProviderAsset.mockResolvedValueOnce({
      status: 'unsupported-source',
      diagnostics: [
        {
          code: 'unsupported-source',
          severity: 'error',
          message: 'Agent content source does not resolve to a stable content locator.',
        },
      ],
    });

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [
        {
          contentLocator: {
            kind: 'document-entry',
            source: { kind: 'workspace-file' },
            entryPath: 'pages/001.png',
          },
          resourceRef,
        },
      ],
      mode: 'metadata',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('images[0].contentLocator'),
    });
    expect(runtime.loadContentAsset).not.toHaveBeenCalled();
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(runtime.resolveImageMetadata).not.toHaveBeenCalled();
  });

  it('rejects a missing nested document entry path instead of restoring it from sibling metadata', async () => {
    const runtime = createRuntime();
    runtime.loadProviderAsset.mockResolvedValue({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      bytes: pngBytes(),
      mimeType: 'image/png',
      sizeBytes: pngBytes().byteLength,
    });
    runtime.resolveImageMetadata.mockResolvedValue({
      status: 'ready',
      source: resourceRef,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: pngBytes().byteLength,
    });
    const images = [
      {
        label: 'page 5',
        entryPath: 'images/page-5.jpg',
        resourceRef: {
          kind: 'document-entry',
          source: documentSource,
          locator: { kind: 'chapter', chapterHref: 'page-5', spineIndex: 4 },
          versionPolicy: 'versioned-export',
        },
      },
    ];

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images,
      max_images: 1,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('stable document entry path'),
    });
    expect(images[0]?.entryPath).toBe('images/page-5.jpg');
    expect(images[0]?.resourceRef).not.toHaveProperty('entryPath');
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(runtime.resolveImageMetadata).not.toHaveBeenCalled();
  });

  it('rejects conflicting nested and outer document entry paths before content access', async () => {
    const runtime = createRuntime();

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [
        {
          entryPath: 'images/page-2.jpg',
          resourceRef: {
            kind: 'document-entry',
            source: documentSource,
            entryPath: 'images/page-1.jpg',
          },
        },
      ],
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('document entry identity mismatch'),
    });
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(runtime.resolveImageMetadata).not.toHaveBeenCalled();
  });

  it('rejects a document image when both nested and outer entry identity are absent', async () => {
    const runtime = createRuntime();

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ resourceRef: { kind: 'document-entry', source: documentSource } }],
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('stable document entry path'),
    });
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(runtime.resolveImageMetadata).not.toHaveBeenCalled();
  });

  it('rejects ReadImage path-only, cache, and Webview URI inputs instead of falling back', async () => {
    const runtime = createRuntime();

    const pathResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ path: '/workspace/.neko/.cache/resources/page-1.jpg' }],
    });
    const webviewResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ webviewUri: 'vscode-webview://extension/.neko/.cache/resources/page-1.jpg' }],
    });

    expect(pathResult.success).toBe(false);
    expect(pathResult.error).toContain('Missing required stable image identity');
    expect(pathResult.error).toContain('Do not inspect cache directories');
    expect(webviewResult.success).toBe(false);
    expect(webviewResult.error).toContain('Missing required stable image identity');
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
    expect(runtime.resolveImageMetadata).not.toHaveBeenCalled();
  });
});

function createRuntime(): ReadDocumentContentAccessRuntime &
  ReadImageContentAccessRuntime & {
    readonly resolveDocumentContent: ReturnType<typeof vi.fn>;
    readonly loadProviderAsset: ReturnType<typeof vi.fn>;
    readonly loadContentAsset: ReturnType<typeof vi.fn>;
    readonly loadRepresentationAsset: ReturnType<typeof vi.fn>;
    readonly resolveImageMetadata: ReturnType<typeof vi.fn>;
  } {
  return {
    resolveDocumentContent: vi.fn(),
    loadProviderAsset: vi.fn(),
    loadContentAsset: vi.fn(),
    loadRepresentationAsset: vi.fn(),
    resolveImageMetadata: vi.fn(),
  };
}

function pngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89,
  ]);
}
