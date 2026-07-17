import { describe, expect, it, vi } from 'vitest';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  createResourceFingerprint,
  createResourceRef,
  type PerceptualAssetRef,
} from '@neko/shared';
import { createReadImageTool } from '../../tools/readImageTool';
import { createLocalPerceptionAssetLoader } from '../perceptionAssetLoader';

describe('createLocalPerceptionAssetLoader', () => {
  it('passes data URLs through without content access', async () => {
    const runtime = createContentAccessRuntime();
    const loader = createLocalPerceptionAssetLoader(runtime);

    const result = await loader.load({
      assetId: 'inline',
      uri: 'data:image/png;base64,abc',
      mimeType: 'image/png',
    });

    expect(result).toEqual({
      kind: 'image',
      url: 'data:image/png;base64,abc',
      mimeType: 'image/png',
    });
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('passes remote URLs through without content access', async () => {
    const runtime = createContentAccessRuntime();
    const loader = createLocalPerceptionAssetLoader(runtime);

    const result = await loader.load({
      assetId: 'remote',
      uri: 'https://cdn.example.test/frame.png',
      mimeType: 'image/png',
    });

    expect(result).toEqual({
      kind: 'image',
      url: 'https://cdn.example.test/frame.png',
      mimeType: 'image/png',
    });
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('preserves audio payload kind for provider-ready audio refs', async () => {
    const runtime = createContentAccessRuntime();
    const loader = createLocalPerceptionAssetLoader(runtime);

    const result = await loader.load({
      assetId: 'audio-1',
      uri: 'data:audio/wav;base64,abc',
      mimeType: 'audio/wav',
    });

    expect(result).toEqual({
      kind: 'audio',
      url: 'data:audio/wav;base64,abc',
      mimeType: 'audio/wav',
    });
    expect(runtime.loadProviderAsset).not.toHaveBeenCalled();
  });

  it('loads local assets through Agent content access runtime', async () => {
    const bytes = Buffer.from('image-bytes');
    const runtime = createContentAccessRuntime(bytes, 'image/png');
    const loader = createLocalPerceptionAssetLoader(runtime);

    const result = await loader.load({
      assetId: 'asset-1',
      uri: '${A}/images/frame.png',
      mimeType: 'image/png',
    });

    expect(runtime.loadProviderAsset).toHaveBeenCalledWith({
      caller: 'perception-asset-loader',
      source: { kind: 'file', path: '${A}/images/frame.png' },
      preferredTarget: 'bytes',
      mimeTypeHint: 'image/png',
    });
    expect(result).toEqual({
      kind: 'image',
      url: `data:image/png;base64,${bytes.toString('base64')}`,
      mimeType: 'image/png',
    });
  });

  it('loads document refs through Agent content access runtime', async () => {
    const bytes = Buffer.from('document-image-bytes');
    const runtime = createContentAccessRuntime(bytes, 'image/jpeg');
    const loader = createLocalPerceptionAssetLoader(runtime);
    const documentAsset: PerceptualAssetRef = {
      assetId: 'doc-image-1',
      uri: 'book.epub#OPS/images/page-1.jpg',
      mimeType: 'image/jpeg',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: '/workspace/book.epub', format: 'epub' },
        entryPath: 'OPS/images/page-1.jpg',
        versionPolicy: 'versioned-export',
      },
    };

    const result = await loader.load(documentAsset);

    expect(runtime.loadProviderAsset).toHaveBeenCalledWith({
      caller: 'perception-asset-loader',
      source: {
        kind: 'document',
        source: {
          kind: 'document',
          document: { filePath: '/workspace/book.epub', format: 'epub' },
        },
        entryPath: 'OPS/images/page-1.jpg',
        locator: { kind: 'document', entryPath: 'OPS/images/page-1.jpg' },
      },
      preferredTarget: 'bytes',
      mimeTypeHint: 'image/jpeg',
    });
    expect(result).toEqual({
      kind: 'image',
      url: `data:image/jpeg;base64,${bytes.toString('base64')}`,
      mimeType: 'image/jpeg',
    });
  });

  it('keeps generated ResourceRef identity through ReadImage and native asset loading', async () => {
    const bytes = Buffer.from('generated-image-bytes');
    const runtime = createContentAccessRuntime(bytes, 'image/png');
    vi.mocked(runtime.resolveImageMetadata).mockResolvedValueOnce({
      status: 'ready',
      diagnostics: [],
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      sizeBytes: bytes.byteLength,
    });
    const generatedResourceRef = createResourceRef({
      id: 'res-generated-1',
      scope: 'project',
      provider: 'generated-asset',
      kind: 'generated',
      source: {
        kind: 'generated-asset',
        generatedAssetId: 'generated-1',
        filePath: '${WORKSPACE}/neko/generated/image/task_1_0.png',
      },
      locator: { kind: 'generated-asset', assetId: 'generated-1' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'generated-1',
        providerId: 'generated-asset',
      }),
    });

    const readResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [
        {
          label: 'generated-assets/non-existent-display-label.png',
          resourceRef: generatedResourceRef,
        },
      ],
    });

    expect(readResult.success).toBe(true);
    expect(readResult.data).toMatchObject({
      images: [{ portableForTransfer: true, resourceRef: generatedResourceRef }],
    });
    const assetRef = readResult.perceptionCards?.[0]?.perceptual?.thumbnailRef;
    expect(assetRef).toMatchObject({ resourceRef: generatedResourceRef });
    if (!assetRef) throw new Error('ReadImage did not return a thumbnail asset ref.');

    const loaded = await createLocalPerceptionAssetLoader(runtime).load(assetRef);

    expect(runtime.loadProviderAsset).toHaveBeenLastCalledWith({
      caller: 'perception-asset-loader',
      source: generatedResourceRef,
      preferredTarget: 'bytes',
      mimeTypeHint: 'image/png',
    });
    expect(loaded).toEqual({
      kind: 'image',
      url: `data:image/png;base64,${bytes.toString('base64')}`,
      mimeType: 'image/png',
    });
  });

  it('fails visibly when local asset runtime is unavailable', async () => {
    const loader = createLocalPerceptionAssetLoader();

    await expect(
      loader.load({
        assetId: 'asset-1',
        uri: '/workspace/frame.png',
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('Perception asset loading requires AgentContentAccessRuntime.');
  });

  it('surfaces content access diagnostics for unauthorized assets', async () => {
    const runtime = createContentAccessRuntime();
    vi.mocked(runtime.loadProviderAsset).mockResolvedValueOnce({
      status: 'unauthorized',
      diagnostics: [
        {
          code: 'unauthorized',
          severity: 'error',
          message: 'Unauthorized asset source',
        },
      ],
    });
    const loader = createLocalPerceptionAssetLoader(runtime);

    await expect(
      loader.load({
        assetId: 'asset-1',
        uri: '/private/frame.png',
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('Unauthorized asset source');
  });
});

function createContentAccessRuntime(
  bytes = Buffer.from('asset-bytes'),
  mimeType = 'image/png',
): AgentContentAccessRuntime {
  return {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset: vi.fn(async () => ({
      status: 'ready' as const,
      diagnostics: [],
      bytes,
      mimeType,
      sizeBytes: bytes.byteLength,
    })),
    projectResource: vi.fn(),
  } as unknown as AgentContentAccessRuntime;
}
