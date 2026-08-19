import { describe, expect, it, vi } from 'vitest';
import type { ContentRepresentationLocator } from '@neko/content';
import {
  createReadDocumentTool,
  type ReadDocumentContentAccessRuntime,
} from '../read-document-tool';
import {
  createReadImageTool,
  MAX_READ_IMAGE_BYTES,
  type ReadImageContentAccessRuntime,
} from '../read-image-tool';

const workspaceSource = {
  kind: 'workspace-file' as const,
  path: 'books/book.epub',
  fingerprint: { strategy: 'sha256' as const, value: 'sha256:book-content' },
};

const documentEntryLocator = {
  kind: 'document-entry' as const,
  source: workspaceSource,
  entryPath: 'images/page-1.jpg',
};

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
};

describe('content access tools', () => {
  it('publishes only ContentLocator and representation locator ReadImage identity branches', () => {
    const tool = createReadImageTool({ contentAccessRuntime: createRuntime() });
    const images = tool.parameters.properties['images'] as {
      readonly items?: {
        readonly anyOf?: readonly { readonly required?: readonly string[] }[];
        readonly properties?: Readonly<Record<string, unknown>>;
      };
    };

    expect(images.items?.anyOf?.map((branch) => branch.required)).toEqual([
      ['contentLocator'],
      ['representationLocator'],
    ]);
    expect(images.items?.properties).toHaveProperty('contentLocator');
    expect(images.items?.properties).toHaveProperty('representationLocator');
    expect(images.items?.properties).not.toHaveProperty('resourceRef');
    expect(JSON.stringify(tool.parameters)).not.toMatch(/documentResourceRef/u);
  });

  it('advertises and accepts only the metadata ReadImage mode', async () => {
    const tool = createReadImageTool({ contentAccessRuntime: createRuntime() });
    const mode = tool.parameters.properties['mode'] as {
      readonly enum?: readonly string[];
      readonly description?: string;
    };

    expect(mode.enum).toEqual(['metadata']);
    expect(mode.description).toContain('native multimodal Agent turn');
    await expect(tool.execute({ mode: 'unsupported' })).resolves.toEqual({
      success: false,
      error: 'ReadImage mode must be "metadata".',
    });
  });

  it('routes ReadDocument through the locator-only content access runtime', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: workspaceSource,
      diagnostics: [],
      contentLocator: workspaceSource,
      text: 'hello document',
      totalTextChars: 14,
      returnedTextChars: 14,
      truncated: false,
    });

    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: workspaceSource,
    });

    expect(result).toMatchObject({
      success: true,
      data: { source: workspaceSource, contentLocator: workspaceSource },
    });
    expect(runtime.resolveDocumentContent).toHaveBeenCalledWith({
      source: workspaceSource,
      mode: 'content',
      startBatch: false,
      includeManifest: false,
      includeImages: true,
      maxChars: 20000,
      maxImages: 50,
    });
    expect(JSON.stringify(result)).not.toMatch(/resourceRef|documentResourceRef/u);
  });

  it('rejects a top-level ReadDocument locator instead of treating it as a range alias', async () => {
    const runtime = createRuntime();
    const tool = createReadDocumentTool({ contentAccessRuntime: runtime });

    expect(tool.parameters.additionalProperties).toBe(false);
    await expect(
      tool.execute({
        source: workspaceSource,
        mode: 'range',
        locator: { kind: 'chapter', chapterHref: 'page-1', spineIndex: 0 },
      }),
    ).resolves.toEqual({
      success: false,
      error:
        'ReadDocument locator is not a top-level field. Use range: { locator: <DocumentLocator> } for mode="range".',
    });
    expect(runtime.resolveDocumentContent).not.toHaveBeenCalled();
  });

  it('rejects an incomplete chapter locator before invoking the runtime', async () => {
    const runtime = createRuntime();
    const result = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: workspaceSource,
      mode: 'range',
      range: {
        locator: { kind: 'chapter', spineIndex: 304 },
        limit: { maxChars: 1000, maxImages: 100 },
      },
    });

    expect(result).toEqual({
      success: false,
      error:
        'ReadDocument range.locator must match a DocumentLocator; chapter locators require chapterHref.',
    });
    expect(runtime.resolveDocumentContent).not.toHaveBeenCalled();
  });

  it('passes ReadDocument document-entry image identity unchanged to ReadImage', async () => {
    const runtime = createRuntime();
    runtime.resolveDocumentContent.mockResolvedValueOnce({
      status: 'ready',
      source: workspaceSource,
      diagnostics: [],
      text: '',
      imageInfo: [
        {
          label: 'page 1',
          entryPath: documentEntryLocator.entryPath,
          locator: { kind: 'chapter', chapterHref: 'page-1', spineIndex: 0 },
          width: 1,
          height: 1,
          mimeType: 'image/png',
          contentLocator: documentEntryLocator,
        },
      ],
      imageCount: 1,
      imagesTruncated: false,
    });
    runtime.loadContentAsset.mockResolvedValueOnce(readyPng());

    const documentResult = await createReadDocumentTool({ contentAccessRuntime: runtime }).execute({
      source: workspaceSource,
      mode: 'range',
      range: { locator: { kind: 'chapter', chapterHref: 'page-1', spineIndex: 0 } },
      max_images: 1,
    });
    const data = documentResult.data as {
      readonly imageInfo: readonly [{ readonly contentLocator: typeof documentEntryLocator }];
    };
    const imageResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: data.imageInfo,
    });

    expect(documentResult.success).toBe(true);
    expect(imageResult.success).toBe(true);
    expect(runtime.loadContentAsset).toHaveBeenCalledWith({
      locator: documentEntryLocator,
      maxBytes: MAX_READ_IMAGE_BYTES,
    });
    expect(imageResult.data).toMatchObject({
      images: [{ contentLocator: documentEntryLocator, portableForTransfer: true }],
    });
  });

  it('derives distinct perceptual asset identities for same-named images in different documents', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValue(readyPng());
    const first = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/volume-1.epub' },
      entryPath: 'images/cover.jpg',
    };
    const second = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/volume-2.epub' },
      entryPath: 'images/cover.jpg',
    };

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [
        { label: 'cover.jpg', contentLocator: first },
        { label: 'cover.jpg', contentLocator: second },
      ],
    });

    expect(result.success).toBe(true);
    const assetIds = result.attachments?.map((attachment) => attachment.assetRef?.assetId);
    expect(assetIds).toHaveLength(2);
    expect(new Set(assetIds).size).toBe(2);
    expect(assetIds?.every((assetId) => assetId?.startsWith('read-image-cover.jpg-'))).toBe(true);
  });

  it('loads derived document pages through the representation port', async () => {
    const runtime = createRuntime();
    runtime.loadRepresentationAsset.mockResolvedValueOnce(readyPng());

    const result = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ label: 'page 1', representationLocator }],
    });

    expect(result.success).toBe(true);
    expect(runtime.loadRepresentationAsset).toHaveBeenCalledWith({
      locator: representationLocator,
      maxBytes: MAX_READ_IMAGE_BYTES,
    });
    expect(runtime.loadContentAsset).not.toHaveBeenCalled();
    expect(result.attachments?.[0]?.path).toMatch(/^data:image\/png;base64,/u);
    expect(result.attachments?.[0]?.assetRef).toMatchObject({ representationLocator });
    expect(result.attachments?.[0]?.assetRef).not.toHaveProperty('contentLocator');
  });

  it('selects at most five ordered images before loading content', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValue(readyPng());
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
});

function createRuntime(): ReadDocumentContentAccessRuntime &
  ReadImageContentAccessRuntime & {
    readonly resolveDocumentContent: ReturnType<typeof vi.fn>;
    readonly loadContentAsset: ReturnType<typeof vi.fn>;
    readonly loadRepresentationAsset: ReturnType<typeof vi.fn>;
  } {
  return {
    resolveDocumentContent: vi.fn(),
    loadContentAsset: vi.fn(),
    loadRepresentationAsset: vi.fn(),
  };
}

function readyPng() {
  const bytes = pngBytes();
  return {
    status: 'ready' as const,
    diagnostics: [],
    bytes,
    mimeType: 'image/png',
    sizeBytes: bytes.byteLength,
  };
}

function pngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89,
  ]);
}
