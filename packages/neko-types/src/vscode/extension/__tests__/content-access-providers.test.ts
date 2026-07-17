import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '../../../path';
import {
  createResourceFingerprint,
  createResourceRef,
  type ContentAccessRequest,
  type ContentDocumentSourceRef,
  type ContentIngestRequest,
  type ResourceRef,
  type ResourceVariantRequest,
} from '../../../types';
import type { LocalResourceAccessService } from '../local-resource-access';
import {
  CacheArtifactContentIngestProvider,
  DocumentEntryContentAccessProvider,
  ExportStagingContentIngestProvider,
  GeneratedOutputContentIngestProvider,
  GeneratedAssetSourceContentAccessProvider,
  ImportSourceContentIngestProvider,
  PreviewVariantContentAccessProvider,
  RegisterExistingSourceContentIngestProvider,
  ResourceCacheContentAccessProvider,
  SourceFileContentAccessProvider,
  VideoProxyContentAccessProvider,
  type ContentAccessFileOps,
} from '../content-access-providers';
import type {
  ResourceCacheProjectOptions,
  ResourceCacheProvider,
  ResourceCacheService,
} from '../resource-cache-service';

describe('content access providers', () => {
  const resource = createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'document',
    source: {
      kind: 'document',
      filePath: '${BOOKS}/comic.epub',
      document: {
        filePath: '${BOOKS}/comic.epub',
        format: 'epub',
      },
    },
    locator: {
      kind: 'document',
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml' },
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'comic-v1' }),
  });
  const resourceWithoutEntryPath = createResourceRef({
    scope: resource.scope,
    provider: resource.provider,
    kind: resource.kind,
    source: resource.source,
    locator: {
      kind: 'document',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml' },
    },
    fingerprint: resource.fingerprint,
  });
  const variant: ResourceVariantRequest = {
    role: 'thumbnail',
    width: 256,
    height: 256,
    mimeType: 'image/jpeg',
  };

  it('reads generated image source bytes without materializing ResourceCache', async () => {
    const sourcePath = '/workspace/demo/neko/generated/image/shot.png';
    const resolveAsset = vi.fn(async () => ({ path: sourcePath, mimeType: 'image/png' }));
    const provider = new GeneratedAssetSourceContentAccessProvider({
      resolveAsset,
      fileOps: { readFile: vi.fn(async () => bytes('generated-source')) },
    });
    const generated = createResourceRef({
      scope: 'project',
      provider: 'generated-asset',
      kind: 'generated',
      source: { kind: 'generated-asset', assetId: 'asset-1' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'asset-1' }),
    });

    const result = await provider.resolve({
      request: {
        ref: generated,
        intent: 'agent-context',
        target: 'bytes',
        variant: { role: 'preview' },
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'generated-asset-source-content-access',
      localPath: sourcePath,
      mimeType: 'image/png',
    });
    expect(text(result.bytes)).toBe('generated-source');
    expect(resolveAsset).toHaveBeenCalledWith(generated);

    await expect(
      provider.resolve({
        request: {
          ref: generated,
          intent: 'agent-context',
          target: 'local-path',
          variant: { role: 'preview' },
        },
      }),
    ).resolves.toMatchObject({ status: 'ready', localPath: sourcePath });
  });

  it('projects generated image sources directly through authorized Webview access', async () => {
    const sourcePath = '/workspace/demo/neko/generated/image/shot.png';
    const webview = { id: 'agent' };
    const localResourceAccess = {
      toWebviewUri: vi.fn(async () => ({
        ok: true as const,
        kind: 'local' as const,
        source: sourcePath,
        uri: 'webview:/generated/shot.png',
      })),
    } as unknown as LocalResourceAccessService;
    const provider = new GeneratedAssetSourceContentAccessProvider({
      resolveAsset: async () => ({ path: sourcePath, mimeType: 'image/png' }),
      localResourceAccess,
      webviewResolver: () => webview as never,
    });
    const generated = createResourceRef({
      scope: 'project',
      provider: 'generated-asset',
      kind: 'generated',
      source: { kind: 'generated-asset', assetId: 'asset-1' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'asset-1' }),
    });

    const result = await provider.resolve({
      request: {
        ref: generated,
        intent: 'interactive-preview',
        target: 'webview-uri',
        variant: { role: 'preview' },
        caller: 'agent-card',
      },
    });

    expect(result).toMatchObject({ status: 'ready', uri: 'webview:/generated/shot.png' });
    expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(webview, sourcePath, {
      caller: 'agent-card',
    });
  });

  it('resolves preview cache variants and materializes missing cache', async () => {
    const cache = createResourceCache({
      absolutePath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      bytes: bytes('image-bytes'),
    });
    const provider = new ResourceCacheContentAccessProvider({
      resourceCache: cache,
      fileOps: { readFile: async () => bytes('image-bytes') },
    });

    const result = await provider.resolve({
      request: {
        ref: resource,
        intent: 'interactive-preview',
        target: 'bytes',
        variant,
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'resource-cache-content-access',
      localPath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      mimeType: 'image/jpeg',
    });
    expect(text(result.bytes)).toBe('image-bytes');
    expect(cache.resolve).toHaveBeenCalledWith(resource, variant, { materializeIfMissing: true });
  });

  it('projects cache variants through Webview projection', async () => {
    const cache = createResourceCache({
      absolutePath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      uri: 'webview:/page-1.jpg',
    });
    const provider = new ResourceCacheContentAccessProvider({
      resourceCache: cache,
      webviewResolver: () => ({}) as never,
    });

    const result = await provider.resolve({
      request: {
        ref: resource,
        intent: 'interactive-preview',
        target: 'webview-uri',
        variant,
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      uri: 'webview:/page-1.jpg',
      localPath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
    });
  });

  it('passes the requested Webview from resolver metadata into cache projection', async () => {
    const panelWebview = { id: 'panel' };
    const previewWebview = { id: 'preview' };
    const webviews = new Map<string, unknown>([
      ['panel-token', panelWebview],
      ['preview-token', previewWebview],
    ]);
    const cache = {
      ...createResourceCache({
        absolutePath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      }),
      project: vi.fn(
        async (
          webview: { readonly id: string },
          ref: ResourceRef,
          request: ResourceVariantRequest,
        ) => ({
          status: 'ready' as const,
          ref,
          variant: { resource: ref, ...request },
          absolutePath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
          uri: `webview:/${webview.id}/page-1.jpg`,
        }),
      ),
    } satisfies ResourceCacheService;
    const provider = new ResourceCacheContentAccessProvider({
      resourceCache: cache,
      webviewResolver: (request) =>
        webviews.get(String(request.metadata?.['webviewResolverToken'])) as never,
    });

    const panelResult = await provider.resolve({
      request: {
        ref: resource,
        intent: 'interactive-preview',
        target: 'webview-uri',
        variant,
        metadata: { webviewResolverToken: 'panel-token' },
      },
    });
    const previewResult = await provider.resolve({
      request: {
        ref: resource,
        intent: 'interactive-preview',
        target: 'webview-uri',
        variant,
        metadata: { webviewResolverToken: 'preview-token' },
      },
    });

    expect(panelResult.uri).toBe('webview:/panel/page-1.jpg');
    expect(previewResult.uri).toBe('webview:/preview/page-1.jpg');
    expect(cache.project).toHaveBeenNthCalledWith(
      1,
      panelWebview,
      resource,
      variant,
      expect.any(Object),
    );
    expect(cache.project).toHaveBeenNthCalledWith(
      2,
      previewWebview,
      resource,
      variant,
      expect.any(Object),
    );
  });

  it('resolves source-first local paths, bytes, and engine source tokens', async () => {
    const fileOps = createFileOps({ '/media/books/comic.epub': bytes('book') });
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      fileOps,
      engineSourceResolver: async ({ path }) => ({
        token: `engine:${path}`,
        sourcePath: path,
        runtimeOnly: true,
      }),
    });
    const request = {
      ref: resource,
      intent: 'final-export',
      target: 'bytes',
    } satisfies ContentAccessRequest;

    await expect(provider.resolve({ request })).resolves.toMatchObject({
      status: 'ready',
      localPath: '/media/books/comic.epub',
    });
    await expect(
      provider.resolve({ request: { ...request, target: 'engine-source' } }),
    ).resolves.toMatchObject({
      status: 'ready',
      engineSource: { token: 'engine:/media/books/comic.epub', runtimeOnly: true },
    });
  });

  it('resolves agent document context local paths through PathResolver', async () => {
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
    });

    await expect(
      provider.resolve({
        request: {
          ref: { kind: 'file', path: '${BOOKS}/comic.epub' },
          intent: 'agent-context',
          target: 'local-path',
        },
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      localPath: '/media/books/comic.epub',
    });
  });

  it('does not support document resource refs as whole source files', async () => {
    const fileOps = createFileOps({ '/media/books/comic.epub': bytes('whole-archive') });
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      fileOps,
    });

    expect(
      provider.supports({
        ref: resource,
        intent: 'agent-context',
        target: 'bytes',
      }),
    ).toBe(false);
  });

  it('returns structured diagnostics when engine source resolution fails', async () => {
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/workspace/demo/media/shot.glb']),
      engineSourceResolver: async () => {
        throw new Error('engine offline');
      },
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '/workspace/demo/media/shot.glb' },
        intent: 'interactive-preview',
        target: 'engine-source',
      },
    });

    expect(result).toMatchObject({
      status: 'failed',
      providerId: 'source-file-content-access',
      error: 'engine offline',
    });
    expect(result.diagnostics?.[0]).toMatchObject({
      code: 'content-provider-resolver-failed',
      providerId: 'source-file-content-access',
    });
  });

  it('reports unresolved path variables as missing source', async () => {
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: {
        owningWorkspaceRoot: '/workspace/demo',
        workspaceRoots: ['/workspace/demo'],
        pathVariables: new Map(),
        allowedRoots: ['/workspace/demo'],
      },
      fileExists: createFileExists([]),
    });

    const result = await provider.resolve({
      request: { ref: resource, intent: 'verify', target: 'local-path' },
    });

    expect(result).toMatchObject({
      status: 'missing-source',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-source-unknown-variable');
  });

  it('reports unreadable source bytes as missing source instead of provider failure', async () => {
    const provider = new SourceFileContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/workspace/demo/missing.png']),
      fileOps: {
        readFile: async () => {
          throw new Error('ENOENT');
        },
      },
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '/workspace/demo/missing.png' },
        intent: 'verify',
        target: 'bytes',
      },
    });

    expect(result).toMatchObject({
      status: 'missing-source',
      providerId: 'source-file-content-access',
      error: 'Source file cannot be read: ENOENT',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-provider-missing-source');
  });

  it('reads original document entry bytes for package intent', async () => {
    const provider = new DocumentEntryContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      entryReader: async ({ sourcePath, entryPath }) => bytes(`${sourcePath}:${entryPath}`),
    });

    const result = await provider.resolve({
      request: { ref: resource, intent: 'package', target: 'bytes' },
    });

    expect(text(result.bytes)).toBe('/media/books/comic.epub:OPS/page-1.jpg');
  });

  it('reads document entry bytes for agent image context without registering the whole archive', async () => {
    const provider = new DocumentEntryContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      entryReader: async ({ sourcePath, entryPath }) => bytes(`${sourcePath}:${entryPath}`),
    });

    const result = await provider.resolve({
      request: { ref: resource, intent: 'agent-context', target: 'bytes' },
    });

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'document-entry-content-access',
    });
    expect(text(result.bytes)).toBe('/media/books/comic.epub:OPS/page-1.jpg');
  });

  it('reads content document source entry bytes for agent image context before cache fallback', async () => {
    const cache = createResourceCache({
      absolutePath: '/workspace/demo/.neko/.cache/resources/page-1.jpg',
      bytes: bytes('cached-image'),
    });
    const provider = new DocumentEntryContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      resourceCache: cache,
      entryReader: async ({ sourcePath, entryPath }) => bytes(`${sourcePath}:${entryPath}`),
    });
    const documentSource: ContentDocumentSourceRef = {
      kind: 'document',
      source: {
        kind: 'document',
        document: {
          filePath: '${BOOKS}/comic.epub',
          format: 'epub',
        },
      },
      entryPath: 'OPS/page-1.jpg',
      locator: {
        kind: 'document',
        entryPath: 'OPS/page-1.jpg',
        locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml' },
      },
    };
    const request: ContentAccessRequest = {
      ref: documentSource,
      intent: 'agent-context',
      target: 'bytes',
    };

    expect(provider.supports(request)).toBe(true);

    const result = await provider.resolve({ request });

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'document-entry-content-access',
    });
    expect(text(result.bytes)).toBe('/media/books/comic.epub:OPS/page-1.jpg');
    expect(cache.resolve).not.toHaveBeenCalled();
  });

  it('rejects whole document archive bytes instead of falling back to source-file reads', async () => {
    const fileOps = createFileOps({ '/media/books/comic.epub': bytes('whole-archive') });
    const readFile = vi.fn(fileOps.readFile);
    const provider = new DocumentEntryContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      fileOps: { ...fileOps, readFile },
      entryReader: async () => bytes('entry'),
    });

    const result = await provider.resolve({
      request: { ref: resourceWithoutEntryPath, intent: 'agent-context', target: 'bytes' },
    });

    expect(result).toMatchObject({
      status: 'unsupported-destination',
      providerId: 'document-entry-content-access',
      error:
        'Document archive sources cannot be resolved as whole-file provider assets. Use a ResourceRef with a stable document entry path.',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-document-whole-archive-read-rejected');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('rejects package entry reads without a stable document entry path', async () => {
    const provider = new DocumentEntryContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      entryReader: async () => bytes('entry'),
    });
    const locatorOnlyResource = createResourceRef({
      scope: resource.scope,
      provider: resource.provider,
      kind: resource.kind,
      source: resource.source,
      fingerprint: resource.fingerprint,
      locator: {
        kind: 'document',
        locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml' },
      },
    });

    const result = await provider.resolve({
      request: { ref: locatorOnlyResource, intent: 'package', target: 'bytes' },
    });

    expect(result).toMatchObject({
      status: 'unsupported-destination',
      providerId: 'document-entry-content-access',
      error: 'Document package entry bytes require a stable document entry path.',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-document-entry-path-missing');
  });

  it('returns structured diagnostics when document entry reading fails', async () => {
    const provider = new DocumentEntryContentAccessProvider({
      projectRoot: '/workspace/demo',
      mediaPathContext: createMediaPathContext(),
      fileExists: createFileExists(['/media/books/comic.epub']),
      entryReader: async () => {
        throw new Error('zip read failed');
      },
    });

    const result = await provider.resolve({
      request: { ref: resource, intent: 'package', target: 'bytes' },
    });

    expect(result).toMatchObject({
      status: 'failed',
      providerId: 'document-entry-content-access',
      error: 'zip read failed',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-provider-resolver-failed');
  });

  it('uses proxy only for preview and edit playback requests', async () => {
    const provider = new VideoProxyContentAccessProvider({
      proxyResolver: async () => ({
        localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
        mimeType: 'video/mp4',
      }),
    });

    expect(
      provider.supports({
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'edit-playback',
        target: 'local-path',
        role: 'proxy',
      }),
    ).toBe(true);
    expect(
      provider.supports({
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'final-export',
        target: 'local-path',
        role: 'proxy',
        qualityMode: 'draft-proxy',
      }),
    ).toBe(false);
  });

  it('projects proxy local paths before returning Webview URI targets', async () => {
    const localResourceAccess = createLocalResourceAccess('webview:/proxy/clip.mp4');
    const provider = new VideoProxyContentAccessProvider({
      proxyResolver: async () => ({
        localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
        mimeType: 'video/mp4',
      }),
      localResourceAccess,
      webviewResolver: () => ({}) as never,
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'interactive-preview',
        target: 'webview-uri',
        role: 'proxy',
        caller: 'proxy-test',
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
      uri: 'webview:/proxy/clip.mp4',
      mimeType: 'video/mp4',
    });
  });

  it('rejects proxy Webview URI targets when projection dependencies are missing', async () => {
    const provider = new VideoProxyContentAccessProvider({
      proxyResolver: async () => ({
        localPath: '/workspace/demo/.neko/.cache/proxy/clip.mp4',
      }),
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'interactive-preview',
        target: 'webview-uri',
        role: 'proxy',
      },
    });

    expect(result).toMatchObject({
      status: 'unsupported-destination',
      error:
        'Proxy Webview URI content access requires local resource access and a webview resolver.',
    });
  });

  it('returns structured diagnostics when proxy resolution fails', async () => {
    const provider = new VideoProxyContentAccessProvider({
      proxyResolver: async () => {
        throw new Error('proxy build failed');
      },
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '${MEDIA}/clip.mp4' },
        intent: 'interactive-preview',
        target: 'local-path',
        role: 'proxy',
      },
    });

    expect(result).toMatchObject({
      status: 'failed',
      providerId: 'video-proxy-content-access',
      error: 'proxy build failed',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-provider-resolver-failed');
  });

  it('adapts existing preview variant APIs', async () => {
    const provider = new PreviewVariantContentAccessProvider({
      variantResolver: async () => ({
        uri: 'webview:/preview.png',
        width: 640,
        height: 360,
        mimeType: 'image/png',
      }),
    });

    await expect(
      provider.resolve({
        request: {
          ref: { kind: 'file', path: '${MEDIA}/shot.png' },
          intent: 'agent-context',
          target: 'webview-uri',
        },
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      uri: 'webview:/preview.png',
      width: 640,
      height: 360,
    });
  });

  it('does not report preview variants as ready without target data', async () => {
    const provider = new PreviewVariantContentAccessProvider({
      variantResolver: async () => ({}),
    });

    const result = await provider.resolve({
      request: {
        ref: { kind: 'file', path: '${MEDIA}/shot.png' },
        intent: 'agent-context',
        target: 'webview-uri',
      },
    });

    expect(result).toMatchObject({
      status: 'missing-source',
      providerId: 'preview-variant-content-access',
    });
    expect(result.diagnostics?.[0]?.code).toBe('content-provider-missing-source');
  });
});

describe('content ingest providers', () => {
  it('imports external files and returns project-relative stable refs', async () => {
    const fileOps = createFileOps({ '/downloads/shot.png': bytes('image') });
    const provider = new ImportSourceContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'import-source',
      sourcePath: '/downloads/shot.png',
      destination: {
        kind: 'project',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/imports',
      },
      fileName: 'shot.png',
    };

    const result = await provider.ingest({ request });

    expect(fileOps.files.get('/workspace/demo/neko/imports/shot.png')).toEqual(bytes('image'));
    expect(result.contractedPath).toBe('neko/imports/shot.png');
    expect(result.source).toMatchObject({
      scope: 'project',
      source: { filePath: 'neko/imports/shot.png' },
    });
  });

  it('registers existing variable paths without copying', async () => {
    const fileOps = createFileOps({});
    const provider = new RegisterExistingSourceContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
      pathResolver: new PathResolver(new Map([['MEDIA', '/Volumes/media']])),
    });
    const request: ContentIngestRequest = {
      mode: 'register-existing-source',
      sourcePath: '/Volumes/media/shot.png',
      destination: { kind: 'media-library', mediaLibraryId: 'main' },
    };

    const result = await provider.ingest({ request });

    expect(fileOps.copyCalls).toEqual([]);
    expect(result.contractedPath).toBe('${MEDIA}/shot.png');
    expect(result.source).toMatchObject({
      scope: 'global',
      source: { filePath: '${MEDIA}/shot.png', mediaLibraryId: 'main' },
    });
  });

  it('promotes generated bytes into generated-assets scope', async () => {
    const fileOps = createFileOps({});
    const provider = new GeneratedOutputContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      bytes: bytes('generated'),
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/generated/image',
      },
      fileName: 'agent-shot.png',
      metadata: { assetId: 'agent-shot' },
      prewarm: [{ role: 'thumbnail', width: 256 }],
    };

    const result = await provider.ingest({ request });

    expect(fileOps.files.get('/workspace/demo/neko/generated/image/agent-shot.png')).toEqual(
      bytes('generated'),
    );
    expect(result.source).toMatchObject({
      kind: 'generated-asset',
      assetId: 'agent-shot',
      path: 'neko/generated/image/agent-shot.png',
      promoted: true,
    });
    expect(result.prewarm).toEqual([{ role: 'thumbnail', width: 256 }]);
  });

  it('creates assets from bytes but does not treat source paths as Create Asset input', async () => {
    const fileOps = createFileOps({ '/downloads/shot.png': bytes('external') });
    const provider = new GeneratedOutputContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const bytesRequest: ContentIngestRequest = {
      mode: 'create-asset',
      bytes: bytes('created'),
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/generated/image',
      },
      fileName: 'created.png',
    };
    const sourcePathRequest: ContentIngestRequest = {
      mode: 'create-asset',
      sourcePath: '/downloads/shot.png',
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/generated/image',
      },
      fileName: 'shot.png',
    };

    expect(provider.supports(bytesRequest)).toBe(true);
    expect(provider.supports(sourcePathRequest)).toBe(false);

    const result = await provider.ingest({ request: bytesRequest });

    expect(fileOps.files.get('/workspace/demo/neko/generated/image/created.png')).toEqual(
      bytes('created'),
    );
    expect(result.contractedPath).toBe('neko/generated/image/created.png');
  });

  it('defaults generated outputs to durable project generated root when no directory is provided', async () => {
    const fileOps = createFileOps({});
    const provider = new GeneratedOutputContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      bytes: bytes('generated'),
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
      },
      fileName: 'agent-shot.png',
    };

    const result = await provider.ingest({ request });

    expect(result.outputPath).toBe('/workspace/demo/neko/generated/file/agent-shot.png');
    expect(result.contractedPath).toBe('neko/generated/file/agent-shot.png');
    expect(fileOps.files.get('/workspace/demo/neko/generated/file/agent-shot.png')).toEqual(
      bytes('generated'),
    );
  });

  it.each([
    ['image', 'image/png', 'shot.png', '/workspace/demo/neko/generated/image/shot.png'],
    ['audio', 'audio/wav', 'shot.wav', '/workspace/demo/neko/generated/audio/shot.wav'],
    ['video', 'video/mp4', 'shot.mp4', '/workspace/demo/neko/generated/video/shot.mp4'],
    [
      'storyboard',
      'application/vnd.neko.storyboard+json',
      'shot.json',
      '/workspace/demo/neko/generated/storyboard/shot.json',
    ],
  ])(
    'defaults %s generated outputs to durable project generated roots',
    async (_kind, mimeType, fileName, expectedPath) => {
      const fileOps = createFileOps({});
      const provider = new GeneratedOutputContentIngestProvider({
        projectRoot: '/workspace/demo',
        fileOps,
      });
      const request: ContentIngestRequest = {
        mode: 'generated-output',
        bytes: bytes('generated'),
        destination: {
          kind: 'generated-assets',
          projectRoot: '/workspace/demo',
        },
        fileName,
        mimeType,
      };

      const result = await provider.ingest({ request });

      expect(result.outputPath).toBe(expectedPath);
      expect(result.contractedPath).toBe(expectedPath.replace('/workspace/demo/', ''));
      expect(result.source).toMatchObject({
        kind: 'generated-asset',
        path: expectedPath.replace('/workspace/demo/', ''),
        promoted: true,
      });
    },
  );

  it('rejects generated promotion when output path cannot be contracted', async () => {
    const fileOps = createFileOps({});
    const provider = new GeneratedOutputContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      bytes: bytes('generated'),
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/external/generated/image',
      },
      fileName: 'agent-shot.png',
    };

    const result = await provider.ingest({ request });

    expect(result).toMatchObject({
      status: 'missing-source',
      providerId: 'generated-output-content-ingest',
      error: 'Generated asset output path must be contracted before promotion.',
    });
    expect(result.source).toBeUndefined();
  });

  it('derives deterministic generated byte names when callers do not provide fileName', async () => {
    const fileOps = createFileOps({});
    const provider = new GeneratedOutputContentIngestProvider({
      projectRoot: '/workspace/demo',
      fileOps,
    });
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      bytes: bytes('generated'),
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
      },
    };

    const result = await provider.ingest({ request });

    expect(result.outputPath).toMatch(
      /^\/workspace\/demo\/neko\/generated\/file\/content-[a-f0-9]{16}\.bin$/,
    );
    expect(result.outputPath).not.toBe('/workspace/demo/neko/generated/file/content.bin');
    expect(fileOps.files.get(result.outputPath ?? '')).toEqual(bytes('generated'));
  });

  it('stages export outputs without creating source refs', async () => {
    const provider = new ExportStagingContentIngestProvider({ projectRoot: '/workspace/demo' });
    const request: ContentIngestRequest = {
      mode: 'stage-export',
      destination: {
        kind: 'export-output',
        directory: '/exports',
        allowAbsolutePath: true,
      },
      fileName: 'final.mp4',
    };

    const result = await provider.ingest({ request });

    expect(result).toMatchObject({
      status: 'ready',
      outputPath: '/exports/final.mp4',
      stagedOutput: { path: '/exports/final.mp4', kind: 'export' },
    });
    expect(result.source).toBeUndefined();
  });

  it('delegates cache artifacts to resource cache service', async () => {
    const resource = createResourceRef({
      scope: 'project',
      provider: 'test',
      kind: 'media',
      source: { kind: 'file', filePath: 'media/shot.png' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'shot-v1' }),
    });
    const variant: ResourceVariantRequest = { role: 'thumbnail', width: 128 };
    const cache = createResourceCache({
      absolutePath: '/workspace/demo/.neko/.cache/resources/shot-thumb.png',
    });
    const provider = new CacheArtifactContentIngestProvider({ resourceCache: cache });
    const request: ContentIngestRequest = {
      mode: 'cache-artifact',
      resource,
      variant,
      destination: { kind: 'cache' },
    };

    await expect(provider.ingest({ request })).resolves.toMatchObject({
      status: 'ready',
      outputPath: '/workspace/demo/.neko/.cache/resources/shot-thumb.png',
      source: resource,
    });
    expect(cache.ensure).toHaveBeenCalledWith(resource, variant, { materializeIfMissing: true });
  });
});

function createResourceCache(input: {
  readonly absolutePath: string;
  readonly uri?: string;
  readonly bytes?: Uint8Array;
}): ResourceCacheService {
  const ensure = vi.fn(async (ref: ResourceRef, request: ResourceVariantRequest) => ({
    status: 'ready' as const,
    ref,
    variant: { resource: ref, ...request },
    absolutePath: input.absolutePath,
    variantEntry: {
      key: 'variant',
      role: request.role,
      status: 'ready' as const,
      absolutePath: input.absolutePath,
      mimeType: request.mimeType,
      width: request.width,
      height: request.height,
      sizeBytes: input.bytes?.byteLength,
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
  }));
  return {
    registerProvider: vi.fn((_provider: ResourceCacheProvider) => undefined),
    findByLocalPath: vi.fn(async () => undefined),
    ensure,
    resolve: vi.fn(async (ref: ResourceRef, request: ResourceVariantRequest) => ({
      status: 'ready' as const,
      ref,
      variant: { resource: ref, ...request },
      absolutePath: input.absolutePath,
      variantEntry: {
        key: 'variant',
        role: request.role,
        status: 'ready' as const,
        absolutePath: input.absolutePath,
        mimeType: request.mimeType,
        width: request.width,
        height: request.height,
        sizeBytes: input.bytes?.byteLength,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    })),
    record: vi.fn(async (record) => ({
      status: record.status ?? 'ready',
      ref: record.ref,
      variant: { resource: record.ref, ...record.variant },
      absolutePath: record.absolutePath,
      relativePath: record.relativePath,
    })),
    updateLifecycle: vi.fn(async (record) => ({
      status: 'ready' as const,
      ref: record.ref,
      variant: { resource: record.ref, ...record.variant },
    })),
    project: vi.fn(
      async (
        _webview: never,
        ref: ResourceRef,
        request: ResourceVariantRequest,
        _options?: ResourceCacheProjectOptions,
      ) => ({
        status: 'ready' as const,
        ref,
        variant: { resource: ref, ...request },
        absolutePath: input.absolutePath,
        uri: input.uri,
        variantEntry: {
          key: 'variant',
          role: request.role,
          status: 'ready' as const,
          absolutePath: input.absolutePath,
          mimeType: request.mimeType,
          width: request.width,
          height: request.height,
          sizeBytes: input.bytes?.byteLength,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      }),
    ),
    invalidate: vi.fn(async () => undefined),
    invalidateManifestCache: vi.fn(),
    stats: vi.fn(async () => ({
      totalSizeBytes: 0,
      entryCount: 0,
      variantCount: 0,
    })),
    gc: vi.fn(async () => ({
      removedCount: 0,
      removedBytes: 0,
      skippedCount: 0,
      skippedReasons: {},
    })),
    dispose: vi.fn(async () => undefined),
  };
}

function createFileOps(initial: Record<string, Uint8Array>): ContentAccessFileOps & {
  readonly files: Map<string, Uint8Array>;
  readonly copyCalls: Array<{ readonly sourcePath: string; readonly targetPath: string }>;
} {
  const files = new Map(Object.entries(initial));
  const copyCalls: Array<{ readonly sourcePath: string; readonly targetPath: string }> = [];
  return {
    files,
    copyCalls,
    readFile: async (filePath) => files.get(filePath) ?? bytes(''),
    writeFile: async (filePath, content) => {
      files.set(filePath, content);
    },
    copyFile: async (sourcePath, targetPath) => {
      copyCalls.push({ sourcePath, targetPath });
      files.set(targetPath, files.get(sourcePath) ?? bytes(''));
    },
    mkdir: async () => undefined,
  };
}

function createLocalResourceAccess(uri: string): LocalResourceAccessService {
  return {
    getLocalResourceRoots: async () => [],
    configureWebview: async () => undefined,
    isAuthorizedPath: async () => true,
    toWebviewUri: async (_webview, source) => ({
      ok: true,
      kind: 'local',
      source,
      uri,
    }),
    createSyncProjector: () => () => uri,
  };
}

function createMediaPathContext() {
  return {
    owningWorkspaceRoot: '/workspace/demo',
    workspaceRoots: ['/workspace/demo'],
    pathVariables: new Map([['BOOKS', '/media/books']]),
    allowedRoots: ['/workspace/demo', '/media/books'],
  };
}

function createFileExists(existingPaths: readonly string[]) {
  const existing = new Set(existingPaths);
  return (filePath: string) => existing.has(filePath);
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function text(value: Uint8Array | undefined): string {
  return new TextDecoder().decode(value);
}
