import type { ContentRepresentationLocator } from '@neko/content';
import { AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES } from '@neko/agent-contracts';
import type { PerceptualAssetRef } from '@neko/media';
import { describe, expect, it, vi } from 'vitest';

import type { AgentContentAccessRuntime } from '../runtime/capability/agent-content-access-runtime';
import { createPiToolResultAssetLoader } from './pi-tool-result-asset-loader';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const CONTENT_LOCATOR = {
  kind: 'document-entry' as const,
  source: { kind: 'workspace-file' as const, path: 'books/book.epub' },
  entryPath: 'images/page-1.png',
};

const REPRESENTATION_LOCATOR: ContentRepresentationLocator = {
  kind: 'content-representation',
  id: 'book-page-1',
  representationKind: 'raster-page',
  source: { kind: 'workspace-file', path: 'books/book.pdf' },
  spec: { kind: 'raster-page', page: 1, format: 'png' },
  generatorId: 'neko-content.document-raster',
  sourceFingerprint: 'source-1',
  specFingerprint: 'raster-page-1',
};

describe('Pi Tool result asset loader', () => {
  it('consumes and normalizes one exact transient observation receipt', async () => {
    const runtime = createRuntime();
    const consume = vi.fn(async () => ({ bytes: PNG_BYTES, mimeType: 'image/png' }));
    const loader = createPiToolResultAssetLoader(runtime, consume);

    const result = await loader.loadTransientImage?.({
      receiptId: 'receipt-1',
      sessionId: 'session-1',
      actionId: 'action-1',
    });

    expect(result).toMatchObject({ kind: 'image', mimeType: 'image/png' });
    expect(result?.url).toMatch(/^data:image\/png;base64,/u);
    expect(consume).toHaveBeenCalledWith({
      receiptId: 'receipt-1',
      sessionId: 'session-1',
      actionId: 'action-1',
    });
    expect(runtime.loadContentAsset).not.toHaveBeenCalled();
  });

  it('loads and normalizes the exact content locator without consulting ref.uri', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValueOnce(readyPng());
    const loader = createPiToolResultAssetLoader(runtime);

    const result = await loader.load({
      assetId: 'page-1',
      uri: 'file:///must-not-be-read.png',
      mimeType: 'image/png',
      contentLocator: CONTENT_LOCATOR,
    });

    expect(result).toMatchObject({ kind: 'image', mimeType: 'image/png' });
    expect(result.url).toMatch(/^data:image\/png;base64,/u);
    expect(runtime.loadContentAsset).toHaveBeenCalledWith({
      locator: CONTENT_LOCATOR,
      maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
    });
  });

  it('preserves representation authority instead of loading its source document', async () => {
    const runtime = createRuntime();
    runtime.loadRepresentationAsset.mockResolvedValueOnce(readyPng());
    const loader = createPiToolResultAssetLoader(runtime);

    await expect(
      loader.load({
        assetId: 'raster-page-1',
        uri: 'data:image/png;base64,ignored',
        mimeType: 'image/png',
        representationLocator: REPRESENTATION_LOCATOR,
      }),
    ).resolves.toMatchObject({ kind: 'image', mimeType: 'image/png' });
    expect(runtime.loadRepresentationAsset).toHaveBeenCalledWith({
      locator: REPRESENTATION_LOCATOR,
      maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
    });
    expect(runtime.loadContentAsset).not.toHaveBeenCalled();
  });

  it('uses the existing ordered contact-sheet transport for multiple exact locators', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValue(readyPng());
    const loader = createPiToolResultAssetLoader(runtime);
    const refs: PerceptualAssetRef[] = [0, 1].map((index) => ({
      assetId: `page-${index + 1}`,
      label: `Page ${index + 1}`,
      uri: `content:page-${index + 1}`,
      mimeType: 'image/png',
      contentLocator: {
        ...CONTENT_LOCATOR,
        entryPath: `images/page-${index + 1}.png`,
      },
    }));

    const batches = await loader.loadBatch?.(refs, { layout: 'overview' });

    expect(batches).toHaveLength(1);
    expect(batches?.[0]).toMatchObject({
      payload: { kind: 'image', mimeType: 'image/jpeg' },
      sourceIndexes: [0, 1],
    });
    expect(batches?.[0]?.payload.url).toMatch(/^data:image\/jpeg;base64,/u);
  });

  it('fails visibly when no canonical locator can authorize the image bytes', async () => {
    const runtime = createRuntime();
    const loader = createPiToolResultAssetLoader(runtime);

    await expect(
      loader.load({
        assetId: 'missing-locator',
        uri: 'file:///must-not-be-read.png',
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('requires an exact content or representation locator');
    expect(runtime.loadContentAsset).not.toHaveBeenCalled();
    expect(runtime.loadRepresentationAsset).not.toHaveBeenCalled();
  });

  it('propagates the exact content access failure without trying another source', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValueOnce({
      status: 'unavailable',
      diagnostics: [
        {
          code: 'content-source-unavailable',
          severity: 'error',
          message: 'The authorized document entry is unavailable.',
        },
      ],
    });
    const loader = createPiToolResultAssetLoader(runtime);

    await expect(
      loader.load({
        assetId: 'unavailable-page',
        uri: 'file:///must-not-be-read.png',
        mimeType: 'image/png',
        contentLocator: CONTENT_LOCATOR,
      }),
    ).rejects.toThrow(
      'Pi image Tool result content could not be loaded: content-source-unavailable.',
    );
    expect(runtime.loadContentAsset).toHaveBeenCalledOnce();
    expect(runtime.loadRepresentationAsset).not.toHaveBeenCalled();
  });

  it('rejects bytes that are not a supported image', async () => {
    const runtime = createRuntime();
    runtime.loadContentAsset.mockResolvedValueOnce({
      status: 'ready',
      diagnostics: [],
      bytes: Buffer.from('plain text'),
      mimeType: 'text/plain',
      sizeBytes: 10,
    });
    const loader = createPiToolResultAssetLoader(runtime);

    await expect(
      loader.load({
        assetId: 'not-an-image',
        uri: 'file:///must-not-be-read.txt',
        mimeType: 'image/png',
        contentLocator: CONTENT_LOCATOR,
      }),
    ).rejects.toThrow('Pi image Tool result content is not a supported image.');
    expect(runtime.loadContentAsset).toHaveBeenCalledOnce();
    expect(runtime.loadRepresentationAsset).not.toHaveBeenCalled();
  });
});

function createRuntime(): AgentContentAccessRuntime & {
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
  return {
    status: 'ready' as const,
    diagnostics: [],
    bytes: PNG_BYTES,
    mimeType: 'image/png',
    sizeBytes: PNG_BYTES.byteLength,
  };
}
