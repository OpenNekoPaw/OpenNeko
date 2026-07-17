import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '../../../path';
import {
  createResourceFingerprint,
  createResourceRef,
  type ContentAccessProvider,
  type ResourceRef,
  type ResourceCacheManifestStore,
  type ResourceVariantRequest,
} from '../../../types';
import { createHostContentAccessRuntime } from '../content-access-runtime';
import type { LocalResourceAccessService } from '../local-resource-access';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => {
      const filePath = [base.fsPath, ...segments].join('/');
      return {
        scheme: 'file',
        fsPath: filePath,
        path: filePath,
        toString: () => `file://${filePath}`,
      };
    },
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          scheme: 'file',
          fsPath: '/workspace/demo',
          path: '/workspace/demo',
          toString: () => 'file:///workspace/demo',
        },
        name: 'demo',
        index: 0,
      },
    ],
  },
  extensions: { getExtension: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

describe('createHostContentAccessRuntime', () => {
  const resource = createResourceRef({
    scope: 'project',
    provider: 'document-archive',
    kind: 'document',
    source: {
      kind: 'document',
      filePath: '${BOOKS}/comic.epub',
      document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
    },
    locator: { kind: 'document', entryPath: 'OPS/page-1.jpg' },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'comic-v1' }),
  });
  const variant = {
    role: 'document-entry',
    mimeType: 'image/jpeg',
  } satisfies ResourceVariantRequest;

  it('creates shared access, ingest, cache, and local resource services from Host options', async () => {
    const runtime = createHostContentAccessRuntime({
      extensionUri: uri('/extension'),
      context: { globalStorageUri: uri('/global/neko-agent') } as never,
      workspaceRoot: '/workspace/demo',
      resourceCacheOptions: {
        cacheRoot: '/workspace/demo/.neko/.cache/resources',
        manifestStore: createMemoryManifestStore(),
        providers: [
          createCacheProvider(resource, '/workspace/demo/.neko/.cache/resources/page.jpg'),
        ],
        fsOps: createResourceCacheFsOps(),
        now: () => '2026-06-26T00:00:00.000Z',
      },
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });

    const result = await runtime.contentAccess.resolve({
      ref: resource,
      intent: 'interactive-preview',
      target: 'local-path',
      variant,
    });

    expect(runtime.localResourceAccess).toBeDefined();
    expect(runtime.resourceCache).toBeDefined();
    expect(runtime.hasResourceCache()).toBe(true);
    expect(runtime.contentIngest).toBeDefined();
    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'resource-cache-content-access',
      localPath: '/workspace/demo/.neko/.cache/resources/page.jpg',
    });
  });

  it('exposes resource cache availability before provider registration', () => {
    const runtime = createHostContentAccessRuntime({
      workspaceRoot: '/workspace/demo',
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });

    expect(runtime.resourceCache).toBeUndefined();
    expect(runtime.hasResourceCache()).toBe(false);
    expect(() =>
      runtime.registerResourceCacheProvider({
        id: 'document-archive',
        supports: () => true,
        ensure: vi.fn(),
      }),
    ).toThrow('Cannot register a resource cache provider without ResourceCacheService.');
  });

  it('keeps provider registration and duplicate replacement on the shared runtime boundary', async () => {
    const runtime = createHostContentAccessRuntime({
      workspaceRoot: '/workspace/demo',
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });
    runtime.registerAccessProvider(createAccessProvider('preview', '/cache/old.png'));
    runtime.registerAccessProvider(createAccessProvider('preview', '/cache/new.png'));

    const result = await runtime.contentAccess.resolve({
      ref: { kind: 'file', path: '/workspace/demo/media/shot.png' },
      intent: 'interactive-preview',
      target: 'local-path',
    });

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'preview',
      localPath: '/cache/new.png',
    });
  });

  it('returns fail-visible missing-provider diagnostics when no provider supports a request', async () => {
    const runtime = createHostContentAccessRuntime({
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });

    const result = await runtime.contentAccess.resolve({
      ref: { kind: 'file', path: '/workspace/demo/media/shot.png' },
      intent: 'interactive-preview',
      target: 'local-path',
    });

    expect(result.status).toBe('unsupported-source');
    expect(result.diagnostics?.[0]?.code).toBe('content-access-provider-missing');
  });

  it('scopes Webview URI projection through the request-selected Webview resolver', async () => {
    const panelWebview = createWebview('panel');
    const previewWebview = createWebview('preview');
    const webviews = new Map([
      ['panel-token', panelWebview],
      ['preview-token', previewWebview],
    ]);
    const localResourceAccess = createLocalResourceAccess();
    const runtime = createHostContentAccessRuntime({
      workspaceRoot: '/workspace/demo',
      localResourceAccess,
      pathResolver: new PathResolver(new Map([['BOOKS', '/media/books']])),
      resourceCacheOptions: {
        cacheRoot: '/workspace/demo/.neko/.cache/resources',
        manifestStore: createMemoryManifestStore(),
        fsOps: createResourceCacheFsOps(),
        providers: [
          createCacheProvider(resource, '/workspace/demo/.neko/.cache/resources/page.jpg'),
        ],
      },
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
      webviewResolver: (request) =>
        webviews.get(String(request.metadata?.['webviewResolverToken'])) as never,
    });

    const panelResult = await runtime.contentAccess.resolve({
      ref: resource,
      intent: 'interactive-preview',
      target: 'webview-uri',
      variant,
      metadata: { webviewResolverToken: 'panel-token' },
    });
    const previewResult = await runtime.contentAccess.resolve({
      ref: resource,
      intent: 'interactive-preview',
      target: 'webview-uri',
      variant,
      metadata: { webviewResolverToken: 'preview-token' },
    });

    expect(panelResult.uri).toBe('webview:panel:/workspace/demo/.neko/.cache/resources/page.jpg');
    expect(previewResult.uri).toBe(
      'webview:preview:/workspace/demo/.neko/.cache/resources/page.jpg',
    );
    expect(panelWebview.asWebviewUri).toHaveBeenCalledOnce();
    expect(previewWebview.asWebviewUri).toHaveBeenCalledOnce();
  });

  it('does not fall back to raw paths when Webview projection is unauthorized', async () => {
    const runtime = createHostContentAccessRuntime({
      workspaceRoot: '/workspace/demo',
      localResourceAccess: createLocalResourceAccess({ unauthorized: true }),
      webviewResolver: () => createWebview('panel') as never,
      resourceCacheOptions: {
        cacheRoot: '/workspace/demo/.neko/.cache/resources',
        manifestStore: createMemoryManifestStore(),
        fsOps: createResourceCacheFsOps(),
        providers: [
          createCacheProvider(resource, '/workspace/demo/.neko/.cache/resources/page.jpg'),
        ],
      },
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });

    const result = await runtime.contentAccess.resolve({
      ref: resource,
      intent: 'interactive-preview',
      target: 'webview-uri',
      variant,
    });

    expect(result.status).toBe('unauthorized');
    expect(result.uri).toBeUndefined();
    expect(result.localPath).toBe('/workspace/demo/.neko/.cache/resources/page.jpg');
    expect(result.diagnostics?.[0]?.code).toBe('content-cache-unauthorized-root');
  });

  it('reports missing Engine source resolver at the shared source provider boundary', async () => {
    const runtime = createHostContentAccessRuntime({
      workspaceRoot: '/workspace/demo',
      fileExists: (filePath) => filePath === '/workspace/demo/media/shot.png',
      sourceFileProvider: {},
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });

    const result = await runtime.contentAccess.resolve({
      ref: { kind: 'file', path: '/workspace/demo/media/shot.png' },
      intent: 'verify',
      target: 'engine-source',
    });

    expect(result.status).toBe('unsupported-destination');
    expect(result.diagnostics?.[0]?.code).toBe('content-engine-source-resolver-missing');
  });

  it('authorizes preview-like file refs for Engine source registration only', async () => {
    const engineSourceResolver = vi.fn(async ({ path }: { path: string }) => ({
      token: `engine:${path}`,
      sourcePath: path,
      runtimeOnly: true as const,
    }));
    const runtime = createHostContentAccessRuntime({
      workspaceRoot: '/workspace/demo',
      fileExists: (filePath) => filePath === '/workspace/demo/media/shot.glb',
      sourceFileProvider: { engineSourceResolver },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });

    const engineResult = await runtime.contentAccess.resolve({
      ref: { kind: 'file', path: '/workspace/demo/media/shot.glb' },
      intent: 'interactive-preview',
      target: 'engine-source',
      metadata: { enginePurpose: 'model' },
    });
    const pathResult = await runtime.contentAccess.resolve({
      ref: { kind: 'file', path: '/workspace/demo/media/shot.glb' },
      intent: 'interactive-preview',
      target: 'local-path',
    });

    expect(engineResult).toMatchObject({
      status: 'ready',
      providerId: 'source-file-content-access',
      engineSource: {
        token: 'engine:/workspace/demo/media/shot.glb',
        sourcePath: '/workspace/demo/media/shot.glb',
        runtimeOnly: true,
      },
    });
    expect(engineSourceResolver).toHaveBeenCalledOnce();
    expect(pathResult.status).toBe('unsupported-source');
    expect(pathResult.diagnostics?.[0]?.code).toBe('content-access-provider-missing');
  });

  it('requires complete resource cache path options instead of guessing cache layout', () => {
    expect(() =>
      createHostContentAccessRuntime({
        localResourceAccess: createLocalResourceAccess(),
        resourceCacheOptions: {
          cacheRoot: '/workspace/demo/.neko/.cache/resources',
        },
      }),
    ).toThrow('Resource cache options require cacheRoot and a LocalMetadata manifestStore.');
  });

  it('rejects retired ResourceCache manifest paths at the Host runtime boundary', () => {
    expect(() =>
      createHostContentAccessRuntime({
        localResourceAccess: createLocalResourceAccess(),
        resourceCacheOptions: {
          cacheRoot: '/workspace/demo/.neko/.cache/resources',
          manifestPath: '/workspace/demo/.neko/.cache/resources/manifest.json',
        },
      }),
    ).toThrow('Legacy ResourceCache manifest paths are retired');
  });
});

function createMemoryManifestStore(): ResourceCacheManifestStore {
  let manifest = {
    version: 1 as const,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    entries: {},
  };
  return {
    load: async () => manifest,
    save: async (next) => {
      manifest = next;
    },
    update: async (operation) => {
      manifest = await operation(manifest);
      return manifest;
    },
    invalidateCache: () => undefined,
  };
}

function uri(filePath: string) {
  return {
    scheme: 'file',
    fsPath: filePath,
    path: filePath,
    toString: () => `file://${filePath}`,
  };
}

function createWebview(id: string) {
  return {
    id,
    options: {},
    asWebviewUri: vi.fn((input: { fsPath: string }) => ({
      toString: () => `webview:${id}:${input.fsPath}`,
    })),
  };
}

function createLocalResourceAccess(
  options: { unauthorized?: boolean } = {},
): LocalResourceAccessService {
  return {
    getLocalResourceRoots: async () => [uri('/workspace/demo')],
    configureWebview: async () => undefined,
    isAuthorizedPath: async () => !options.unauthorized,
    toWebviewUri: async (webview, source) =>
      options.unauthorized
        ? {
            ok: false,
            reason: 'unauthorized',
            source,
            message: 'Local resource path is outside authorized roots.',
          }
        : {
            ok: true,
            kind: 'local',
            source,
            uri: webview.asWebviewUri(uri(source) as never).toString(),
          },
    createSyncProjector: () => () => undefined,
  };
}

function createCacheProvider(ref: ResourceRef, absolutePath: string) {
  return {
    id: ref.provider,
    supports: (inputRef, request) => inputRef.id === ref.id && request.role === 'document-entry',
    ensure: vi.fn(async (input) => ({
      status: 'ready' as const,
      ref: input.ref,
      variant: input.variant,
      absolutePath,
      relativePath: 'page.jpg',
      mimeType: input.variant.mimeType,
      sizeBytes: 10,
      rebuildable: true,
    })),
  };
}

function createAccessProvider(id: string, localPath: string): ContentAccessProvider {
  return {
    id,
    supports: () => true,
    resolve: vi.fn(async ({ request }) => ({
      status: 'ready',
      request,
      providerId: id,
      localPath,
    })),
  };
}

function createResourceCacheFsOps() {
  const files = new Map<string, string>();
  const mtimes = new Map<string, number>();
  let mtime = 0;
  return {
    readFile: vi.fn(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return files.get(filePath)!;
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, content);
      mtimes.set(filePath, ++mtime);
    }),
    rename: vi.fn(async (oldPath: string, newPath: string) => {
      const content = files.get(oldPath);
      if (content === undefined) throw new Error(`ENOENT: ${oldPath}`);
      files.delete(oldPath);
      files.set(newPath, content);
      mtimes.set(newPath, ++mtime);
    }),
    mkdir: vi.fn(async () => undefined),
    stat: vi.fn(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return {
        size: files.get(filePath)!.length,
        mtimeMs: mtimes.get(filePath) ?? 0,
      };
    }),
    rm: vi.fn(async (filePath: string) => {
      files.delete(filePath);
      mtimes.delete(filePath);
    }),
  };
}
