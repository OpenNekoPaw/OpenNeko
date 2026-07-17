import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '../../../path';
import type { PreviewVariantRequest } from '../../../types';
import {
  createFileThumbnailResourceRef,
  createGeneratedAssetResourceRef,
  createPreviewAssetResourceRef,
  GeneratedAssetDerivativeResourceCacheProvider,
  PreviewVariantResourceCacheProvider,
  ThumbnailResourceCacheProvider,
  type ResourceCacheFileOps,
} from '../resource-cache-providers';

describe('resource cache provider adapters', () => {
  it('wraps thumbnail generation into a project resource cache entry', async () => {
    const fsOps = new FakeFileOps({
      '/legacy/thumbs/video.jpg': 'thumbnail',
    });
    const generator = {
      generate: vi.fn(async () => ({
        path: '/legacy/thumbs/video.jpg',
        width: 256,
        height: 144,
        mimeType: 'image/jpeg',
      })),
    };
    const ref = createFileThumbnailResourceRef({
      filePath: '/workspace/media/video.mp4',
      identity: { sizeBytes: 1024, mtimeMs: 42 },
    });
    const provider = new ThumbnailResourceCacheProvider({ generator, fsOps });

    const result = await provider.ensure({
      ref,
      variant: { role: 'thumbnail', width: 256, height: 144, mimeType: 'image/jpeg' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(generator.generate).toHaveBeenCalledWith('/workspace/media/video.mp4', {
      maxWidth: 256,
      maxHeight: 144,
    });
    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^thumbnails\/media-thumbnail\/res_/),
      mimeType: 'image/jpeg',
      width: 256,
      height: 144,
      rebuildable: true,
    });
    expect(fsOps.copyCalls[0]?.source).toBe('/legacy/thumbs/video.jpg');
    expect(fsOps.copyCalls[0]?.target).toContain('/workspace/.neko/.cache/resources/thumbnails/');
  });

  it('copies preview variants without treating preview API roots as cache identity', async () => {
    const fsOps = new FakeFileOps({
      '/engine/cache/pano-preview.webp': 'preview',
    });
    const preview = {
      registerPreviewAsset: vi.fn(async () => ({
        manifestVersion: 1 as const,
        assetId: 'preview-asset-1',
        token: 'token',
        kind: 'image' as const,
        status: 'ready' as const,
        sourceName: 'pano.jpg',
        projection: {
          type: 'flat' as const,
          confidence: 'none' as const,
          source: 'unknown' as const,
        },
        media: {
          fileSizeBytes: 100,
          mimeType: 'image/jpeg',
          dynamicRange: 'sdr' as const,
        },
        variants: [],
        createdAt: '2026-06-05T00:00:00.000Z',
      })),
      requestPreviewVariant: vi.fn(async (_assetId: string, _request: PreviewVariantRequest) => ({
        id: 'variant-1',
        assetId: 'preview-asset-1',
        role: 'thumbnail' as const,
        url: '/engine/cache/pano-preview.webp',
        mimeType: 'image/webp',
        dimensions: { width: 512, height: 256 },
        fileSizeBytes: 7,
      })),
    };
    const ref = createPreviewAssetResourceRef({
      assetId: 'preview-asset-1',
      sourcePath: '/workspace/media/pano.jpg',
      kind: 'image',
    });
    const provider = new PreviewVariantResourceCacheProvider({ preview, fsOps });

    const result = await provider.ensure({
      ref,
      variant: { role: 'fov-crop', width: 512, height: 256, format: 'webp' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(preview.registerPreviewAsset).toHaveBeenCalledWith({
      source: '/workspace/media/pano.jpg',
      kind: 'image',
      explicitOpen: false,
    });
    expect(preview.requestPreviewVariant).toHaveBeenCalledWith('preview-asset-1', {
      role: 'fov-crop',
      width: 512,
      height: 256,
      format: 'webp',
    });
    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^previews\/preview-variant\/res_/),
      mimeType: 'image/webp',
      width: 512,
      height: 256,
      sizeBytes: 7,
    });
  });

  it('materializes bounded generated thumbnails without copying source bytes', async () => {
    const fsOps = new FakeFileOps({
      '/workspace/neko/generated/image/shot.png': 'generated',
    });
    const ref = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '/workspace/neko/generated/image/shot.png',
      mimeType: 'image/png',
    });
    const generator = {
      generate: vi.fn(async () => ({
        bytes: new TextEncoder().encode('small-thumbnail'),
        width: 256,
        height: 144,
        mimeType: 'image/webp',
      })),
    };
    const provider = new GeneratedAssetDerivativeResourceCacheProvider({ fsOps, generator });

    const result = await provider.ensure({
      ref,
      variant: { role: 'thumbnail', width: 256, height: 256, mimeType: 'image/webp' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(/^generated\/generated-asset\/res_/),
      mimeType: 'image/webp',
      width: 256,
      height: 144,
    });
    expect(generator.generate).toHaveBeenCalledWith('/workspace/neko/generated/image/shot.png', {
      role: 'thumbnail',
      width: 256,
      height: 256,
      mimeType: 'image/webp',
    });
    expect(fsOps.copyCalls).toEqual([]);
    expect(fsOps.files.get(result.absolutePath!)).toBe('small-thumbnail');
  });

  it('rejects untransformed generated previews instead of copying the source into cache', async () => {
    const fsOps = new FakeFileOps({
      '/workspace/neko/generated/image/shot.png': 'generated',
    });
    const provider = new GeneratedAssetDerivativeResourceCacheProvider({
      fsOps,
      generator: { generate: vi.fn() },
    });

    const result = await provider.ensure({
      ref: createGeneratedAssetResourceRef({
        assetId: 'asset-1',
        path: '/workspace/neko/generated/image/shot.png',
        mimeType: 'image/png',
      }),
      variant: { role: 'preview', mimeType: 'image/png' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({ status: 'unsupported' });
    expect(fsOps.copyCalls).toEqual([]);
  });

  it('rejects generated source variants because ResourceCache only stores derivatives', async () => {
    const fsOps = new FakeFileOps({
      '/workspace/neko/generated/image/shot.png': 'generated',
    });
    const ref = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '/workspace/neko/generated/image/shot.png',
      mimeType: 'image/png',
    });
    const provider = new GeneratedAssetDerivativeResourceCacheProvider({ fsOps });

    const result = await provider.ensure({
      ref,
      variant: { role: 'source', mimeType: 'image/png' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'unsupported',
      error: 'Generated asset provider does not support this variant.',
    });
    expect(fsOps.copyCalls).toEqual([]);
  });

  it('expands generated asset variable paths before materializing thumbnails', async () => {
    const fsOps = new FakeFileOps({
      '/workspace/neko/generated/image/shot.png': 'generated',
    });
    const ref = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '${WORKSPACE}/neko/generated/image/shot.png',
      mimeType: 'image/png',
    });
    const provider = new GeneratedAssetDerivativeResourceCacheProvider({
      fsOps,
      pathResolver: new PathResolver(new Map([['WORKSPACE', '/workspace']])),
      projectRoot: '/workspace',
      generator: createGeneratedThumbnailGenerator(),
    });

    const result = await provider.ensure({
      ref,
      variant: { role: 'thumbnail', width: 256, mimeType: 'image/webp' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result.status).toBe('ready');
    expect(fsOps.files.get(result.absolutePath!)).toBe('small-thumbnail');
  });

  it('keys generated derivatives by promoted generated source refs', async () => {
    const fsOps = new FakeFileOps({
      '/workspace/neko/generated/image/shot-a.png': 'generated-a',
      '/workspace/neko/generated/image/shot-b.png': 'generated-b',
    });
    const provider = new GeneratedAssetDerivativeResourceCacheProvider({
      fsOps,
      generator: createGeneratedThumbnailGenerator(),
    });
    const firstRef = createGeneratedAssetResourceRef({
      assetId: 'asset-a',
      path: '/workspace/neko/generated/image/shot-a.png',
      mimeType: 'image/png',
    });
    const secondRef = createGeneratedAssetResourceRef({
      assetId: 'asset-b',
      path: '/workspace/neko/generated/image/shot-b.png',
      mimeType: 'image/png',
    });

    const first = await provider.ensure({
      ref: firstRef,
      variant: { role: 'thumbnail', width: 256, mimeType: 'image/png' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });
    const second = await provider.ensure({
      ref: secondRef,
      variant: { role: 'thumbnail', width: 256, mimeType: 'image/png' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    expect(first.relativePath).not.toBe(second.relativePath);
    expect(first.relativePath).toContain(firstRef.id);
    expect(second.relativePath).toContain(secondRef.id);
  });

  it('rebuilds generated derivatives after cache deletion without deleting promoted sources', async () => {
    const sourcePath = '/workspace/neko/generated/image/shot.png';
    const fsOps = new FakeFileOps({
      [sourcePath]: 'generated-source',
    });
    const ref = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: sourcePath,
      mimeType: 'image/png',
    });
    const provider = new GeneratedAssetDerivativeResourceCacheProvider({
      fsOps,
      generator: createGeneratedThumbnailGenerator(),
    });
    const input = {
      ref,
      variant: { role: 'thumbnail' as const, width: 512, mimeType: 'image/webp' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    };

    const first = await provider.ensure(input);
    expect(first.status).toBe('ready');
    expect(first.absolutePath).toBeDefined();
    fsOps.files.delete(first.absolutePath!);

    const second = await provider.ensure(input);

    expect(fsOps.files.get(sourcePath)).toBe('generated-source');
    expect(second).toMatchObject({
      status: 'ready',
      absolutePath: first.absolutePath,
      relativePath: first.relativePath,
    });
    expect(fsOps.copyCalls).toEqual([]);
  });
});

function createGeneratedThumbnailGenerator() {
  return {
    generate: vi.fn(async () => ({
      bytes: new TextEncoder().encode('small-thumbnail'),
      width: 256,
      height: 144,
      mimeType: 'image/webp',
    })),
  };
}

class FakeFileOps implements ResourceCacheFileOps {
  readonly files = new Map<string, string>();
  readonly mkdirCalls: string[] = [];
  readonly copyCalls: Array<{ source: string; target: string }> = [];

  constructor(files: Record<string, string>) {
    for (const [filePath, content] of Object.entries(files)) {
      this.files.set(filePath, content);
    }
  }

  async copyFile(source: string, target: string): Promise<void> {
    const content = this.files.get(source);
    if (content === undefined) throw new Error(`ENOENT: ${source}`);
    this.copyCalls.push({ source, target });
    this.files.set(target, content);
  }

  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    this.files.set(filePath, new TextDecoder().decode(content));
  }

  async mkdir(filePath: string): Promise<void> {
    this.mkdirCalls.push(filePath);
  }

  async stat(filePath: string): Promise<{ readonly size: number }> {
    const content = this.files.get(filePath);
    if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
    return { size: content.length };
  }
}
