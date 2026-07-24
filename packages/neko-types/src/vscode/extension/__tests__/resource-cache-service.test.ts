import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RESOURCE_CACHE_GLOBAL_MAX_BYTES,
  DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
  createResourceFingerprint,
  createResourceRef,
  createResourceVariantKey,
  type ResourceCacheManifest,
  type ResourceRef,
  type ResourceVariantRequest,
} from '../../../types/resource-cache';
import type { LocalResourceAccessService } from '../local-resource-access';
import {
  VSCodeResourceCacheService,
  computeStats,
  resolveResourceCacheQuotaPolicy,
  type ResourceCacheFsOps,
  type ResourceCacheManifestStore,
  type ResourceCacheProvider,
  type ResourceEnsureInput,
} from '../resource-cache-service';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    }),
  },
}));

describe('resource cache service', () => {
  let fsOps: FakeFsOps;
  let localResourceAccess: LocalResourceAccessService;
  let manifestStore: TestResourceCacheManifestStore;
  let ref: ResourceRef;
  let variant: ResourceVariantRequest;

  beforeEach(() => {
    fsOps = new FakeFsOps();
    localResourceAccess = createLocalResourceAccess();
    manifestStore = createMemoryManifestStore('2026-06-05T00:00:00.000Z');
    ref = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: {
          filePath: '${BOOKS}/comic.epub',
          format: 'epub',
          fileId: 'comic-v1',
        },
      },
      locator: {
        kind: 'document',
        locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
        entryPath: 'OPS/page-1.jpg',
      },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v1:OPS/page-1.jpg',
      }),
    });
    variant = { role: 'thumbnail', width: 256, height: 256, mimeType: 'image/jpeg' };
  });

  it('rejects retired JSON manifest paths as a normal ResourceCache metadata store', () => {
    expect(
      () =>
        new VSCodeResourceCacheService({
          cacheRoot: '/workspace/.neko/.cache/resources',
          manifestPath: '/workspace/.neko/.cache/resources/manifest.json',
          projectRoot: '/workspace',
          fsOps,
        }),
    ).toThrow('Legacy ResourceCache manifest paths are retired');
  });

  it('materializes missing variants through a provider and records stats', async () => {
    const provider = createProvider(async (input) => {
      const absolutePath = `${input.cacheRoot}/documents/page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        mimeType: 'image/jpeg',
        width: 256,
        height: 256,
        rebuildable: true,
      };
    });
    const service = createService([provider]);

    const result = await service.resolve(ref, variant, { materializeIfMissing: true });

    expect(result.status).toBe('ready');
    expect(result.absolutePath).toBe('/workspace/.neko/.cache/resources/documents/page-1.jpg');
    const stats = await service.stats();
    expect(stats).toMatchObject({
      totalSizeBytes: 'image-bytes'.length,
      entryCount: 1,
      variantCount: 1,
      providerBytes: { 'document-archive': 'image-bytes'.length },
    });
  });

  it('uses an injected metadata store without writing a JSON manifest', async () => {
    const manifestStore = createMemoryManifestStore('2026-06-05T00:00:00.000Z');
    const service = new VSCodeResourceCacheService({
      cacheRoot: '/workspace/.neko/.cache/resources',
      projectRoot: '/workspace',
      localResourceAccess,
      manifestStore,
      fsOps,
      now: () => '2026-06-05T00:00:00.000Z',
    });
    const artifactPath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    fsOps.files.set(artifactPath, 'image-bytes');

    await service.record({
      ref,
      variant,
      absolutePath: artifactPath,
      rebuildable: true,
    });

    await expect(manifestStore.load()).resolves.toMatchObject({
      entries: { [ref.id]: { resource: ref, status: 'ready' } },
    });
    expect(fsOps.writeCalls).toEqual([]);
    expect(fsOps.renameCalls).toEqual([]);
  });

  it('selects the first registered provider that supports a resource ref', async () => {
    const fallbackProvider = createNamedProvider('external-cache-path', async (input) => {
      const absolutePath = `${input.cacheRoot}/legacy/page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const primaryProvider = createNamedProvider('document-archive', async (input) => ({
      status: 'unsupported',
      ref: input.ref,
      variant: input.variant,
      error: 'Primary provider cannot rebuild this entry.',
    }));
    const service = createService({ providers: [fallbackProvider, primaryProvider] });

    await expect(service.ensure(ref, variant)).resolves.toMatchObject({
      status: 'ready',
      absolutePath: '/workspace/.neko/.cache/resources/legacy/page-1.jpg',
    });
    expect(fallbackProvider.ensure).toHaveBeenCalledTimes(1);
    expect(primaryProvider.ensure).not.toHaveBeenCalled();
  });

  it('coalesces duplicate ensure calls for the same variant', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createProvider(async (input) => {
      calls += 1;
      await gate;
      const absolutePath = `${input.cacheRoot}/documents/page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);

    const first = service.ensure(ref, variant);
    const second = service.ensure(ref, variant);
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
    ]);
    expect(calls).toBe(1);
  });

  it('bounds concurrent representation generation across different variants', async () => {
    let active = 0;
    let maximumActive = 0;
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const provider = createProvider(async (input) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (input.ref.id === ref.id) {
        markFirstStarted?.();
        await firstGate;
      }
      const absolutePath = `${input.cacheRoot}/${input.ref.id}.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      active -= 1;
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService({ providers: [provider], maxConcurrentEnsures: 1 });
    const secondRef = { ...ref, id: `${ref.id}-second` };

    const first = service.ensure(ref, variant);
    await firstStarted;
    const second = service.ensure(secondRef, variant);
    await Promise.resolve();

    expect(provider.ensure).toHaveBeenCalledTimes(1);
    expect(maximumActive).toBe(1);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ status: 'ready' }),
    ]);
    expect(provider.ensure).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
  });

  it('keeps document entry variants canonical across metadata-shaped requests', async () => {
    const documentVariant = { role: 'document-entry' as const };
    const documentEntryPath = '/workspace/.neko/.cache/resources/documents/doc/page-1.jpg';
    let calls = 0;
    const provider: ResourceCacheProvider = {
      id: 'document-archive',
      supports: (resource, request) =>
        resource.provider === 'document-archive' && request.role === 'document-entry',
      ensure: vi.fn(async (input) => {
        calls += 1;
        fsOps.files.set(documentEntryPath, 'image-bytes');
        return {
          status: 'ready',
          ref: input.ref,
          variant: input.variant,
          absolutePath: documentEntryPath,
          mimeType: 'image/jpeg',
          width: 1511,
          height: 2160,
          sizeBytes: 341346,
          rebuildable: true,
        };
      }),
    };
    const service = createService([provider]);

    await expect(service.ensure(ref, documentVariant)).resolves.toMatchObject({
      status: 'ready',
      absolutePath: documentEntryPath,
    });
    await expect(
      service.ensure(ref, {
        role: 'document-entry',
        format: 'epub',
        mimeType: 'image/jpeg',
        width: 1511,
        height: 2160,
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      absolutePath: documentEntryPath,
    });
    await expect(service.ensure(ref, { role: 'preview' })).resolves.toMatchObject({
      status: 'unsupported',
      error: 'No provider supports this variant.',
    });

    const manifest = manifestStore.current();
    expect(manifest.entries[ref.id]).toMatchObject({
      status: 'ready',
    });
    expect(manifest.entries[ref.id].variants).toHaveLength(2);
    expect(manifest.entries[ref.id].variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: createResourceVariantKey({ resource: ref, role: 'document-entry' }),
          role: 'document-entry',
          status: 'ready',
          relativePath: 'documents/doc/page-1.jpg',
          mimeType: 'image/jpeg',
          width: 1511,
          height: 2160,
          sizeBytes: 341346,
        }),
        expect.objectContaining({
          key: createResourceVariantKey({ resource: ref, role: 'preview' }),
          role: 'preview',
          status: 'unsupported',
        }),
      ]),
    );
    expect(
      manifest.entries[ref.id].variants.filter(
        (candidate: { readonly role: string }) => candidate.role === 'document-entry',
      ),
    ).toHaveLength(1);
    expect(manifest.entries[ref.id].variants[0]).not.toHaveProperty('absolutePath');
    expect(calls).toBe(2);
  });

  it('finds cached resource variants by local filesystem path', async () => {
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService([provider]);

    await service.ensure(ref, variant);

    await expect(service.findByLocalPath(absolutePath)).resolves.toMatchObject({
      ref,
      absolutePath,
      variantEntry: expect.objectContaining({
        role: variant.role,
        status: 'ready',
      }),
    });
    await expect(
      service.findByLocalPath('/workspace/.neko/.cache/resources/missing.jpg'),
    ).resolves.toBeUndefined();
  });

  it('reports unsupported and failed provider states explicitly', async () => {
    const unsupported = await createService([]).ensure(ref, variant);
    expect(unsupported).toMatchObject({
      status: 'unsupported',
      error: 'No provider supports this variant.',
    });

    const provider = createProvider(async () => {
      throw new Error('extract failed');
    });
    const logger = { warn: vi.fn() };
    const service = createService([provider], logger);

    const failed = await service.ensure(ref, variant);

    expect(failed).toMatchObject({ status: 'failed', error: 'extract failed' });
    expect(logger.warn).toHaveBeenCalledWith('Resource cache provider failed', {
      provider: 'document-archive',
      error: 'extract failed',
    });
  });

  it('detects missing disk files and can re-materialize them', async () => {
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    let writes = 0;
    const provider = createProvider(async (input) => {
      writes += 1;
      fsOps.files.set(absolutePath, `image-${writes}`);
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);

    await service.ensure(ref, variant);
    fsOps.files.delete(absolutePath);

    await expect(service.resolve(ref, variant)).resolves.toMatchObject({ status: 'missing' });
    await expect(
      service.resolve(ref, variant, { materializeIfMissing: true }),
    ).resolves.toMatchObject({ status: 'ready', absolutePath });
    expect(writes).toBe(2);
  });

  it('marks ready variants stale when the source fingerprint changes', async () => {
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    let writes = 0;
    const provider = createProvider(async (input) => {
      writes += 1;
      fsOps.files.set(absolutePath, `image-${writes}`);
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);

    await service.ensure(ref, variant);
    const updatedRef: ResourceRef = {
      ...ref,
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v2:OPS/page-1.jpg',
      }),
    };

    await expect(service.resolve(updatedRef, variant)).resolves.toMatchObject({
      status: 'stale',
      error: 'Cached artifact source fingerprint is stale.',
    });
    await expect(
      service.resolve(updatedRef, variant, { materializeIfMissing: true }),
    ).resolves.toMatchObject({
      status: 'ready',
      absolutePath,
    });
    expect(writes).toBe(2);
  });

  it('projects ready resources through local resource access and reports unauthorized paths', async () => {
    const provider = createProvider(async (input) => {
      const absolutePath = `${input.cacheRoot}/documents/page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return { status: 'ready', ref: input.ref, variant: input.variant, absolutePath };
    });
    const service = createService([provider]);
    const webview = {} as never;

    await expect(service.project(webview, ref, variant)).resolves.toMatchObject({
      status: 'ready',
      uri: 'webview:/workspace/.neko/.cache/resources/documents/page-1.jpg',
    });

    localResourceAccess = createLocalResourceAccess({ unauthorized: true });
    await expect(createService([provider]).project(webview, ref, variant)).resolves.toMatchObject({
      status: 'unauthorized',
      error: 'Local resource path is outside authorized roots.',
    });
  });

  it('batches access-time touches before updating metadata', async () => {
    let now = '2026-06-05T00:00:00.000Z';
    let clockMs = 0;
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService({
      providers: [provider],
      now: () => now,
      clockMs: () => clockMs,
      touchFlushIntervalMs: 60_000,
    });

    await service.ensure(ref, variant);
    const writeCountAfterEnsure = manifestStore.writeCount;

    now = '2026-06-05T00:00:01.000Z';
    await service.resolve(ref, variant);
    clockMs = 1_000;
    now = '2026-06-05T00:00:02.000Z';
    await service.resolve(ref, variant);

    expect(manifestStore.writeCount).toBe(writeCountAfterEnsure);

    now = '2026-06-05T00:00:03.000Z';
    const stats = await service.stats();
    expect(stats.lastAccessedAt).toBe('2026-06-05T00:00:03.000Z');
    expect(manifestStore.writeCount).toBe(writeCountAfterEnsure + 1);

    const manifest = manifestStore.current();
    expect(manifest.entries[ref.id].variants[0]).toMatchObject({
      lastAccessedAt: '2026-06-05T00:00:03.000Z',
    });
  });

  it('uses the injected clock for touch flush interval decisions', async () => {
    let now = '2026-06-05T00:00:00.000Z';
    let clockMs = 0;
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService({
      providers: [provider],
      now: () => now,
      clockMs: () => clockMs,
      touchFlushIntervalMs: 100,
    });

    await service.ensure(ref, variant);
    const writeCountAfterEnsure = manifestStore.writeCount;

    now = '2026-06-05T00:00:01.000Z';
    clockMs = 99;
    await service.resolve(ref, variant);
    expect(manifestStore.writeCount).toBe(writeCountAfterEnsure);

    now = '2026-06-05T00:00:02.000Z';
    clockMs = 100;
    await service.resolve(ref, variant);

    expect(manifestStore.writeCount).toBe(writeCountAfterEnsure + 1);
    const manifest = manifestStore.current();
    expect(manifest.entries[ref.id].variants[0]).toMatchObject({
      lastAccessedAt: '2026-06-05T00:00:02.000Z',
    });
  });

  it('flushes queued touches on dispose', async () => {
    let now = '2026-06-05T00:00:00.000Z';
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService({
      providers: [provider],
      now: () => now,
      touchFlushIntervalMs: 60_000,
    });

    await service.ensure(ref, variant);
    const writeCountAfterEnsure = manifestStore.writeCount;
    now = '2026-06-05T00:00:01.000Z';
    await service.resolve(ref, variant);

    expect(manifestStore.writeCount).toBe(writeCountAfterEnsure);

    await service.dispose();

    expect(manifestStore.writeCount).toBe(writeCountAfterEnsure + 1);
    const manifest = manifestStore.current();
    expect(manifest.entries[ref.id].variants[0]).toMatchObject({
      lastAccessedAt: '2026-06-05T00:00:01.000Z',
    });
  });

  it('does not write the manifest when queued touches no longer match entries', async () => {
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService({
      providers: [provider],
      touchFlushIntervalMs: 60_000,
    });

    await service.ensure(ref, variant);
    await service.resolve(ref, variant);
    const writeCountAfterResolve = manifestStore.writeCount;
    service.invalidateManifestCache();
    manifestStore.replace({
      version: 1,
      projectRoot: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      entries: {},
    });

    await expect(service.stats()).resolves.toMatchObject({ entryCount: 0 });
    expect(manifestStore.writeCount).toBe(writeCountAfterResolve);
  });

  it('invalidates entries and garbage collects rebuildable variants by quota', async () => {
    const oldNow = '2026-06-05T00:00:00.000Z';
    const newNow = '2026-06-05T00:00:01.000Z';
    let now = oldNow;
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService([provider], undefined, () => now);

    await service.ensure(ref, variant);
    now = newNow;
    await service.invalidate(ref);

    const variantKey = createResourceVariantKey({ resource: ref, ...variant });
    const manifestAfterInvalidate = manifestStore.current();
    expect(manifestAfterInvalidate.entries[ref.id].variants[0]).toMatchObject({
      key: variantKey,
      status: 'stale',
    });

    const gc = await service.gc({ projectMaxBytes: 1 });

    expect(gc).toEqual({
      removedCount: 1,
      removedBytes: 128,
      skippedCount: 0,
      skippedReasons: {},
    });
    expect(fsOps.files.has(absolutePath)).toBe(false);
  });

  it('rejects durable product outputs instead of adopting them into derived storage', async () => {
    const service = createService([]);
    const durablePaths = [
      '/workspace/neko/assets/library/hero.png',
      '/workspace/neko/generated/image/accepted.png',
      '/workspace/neko/canvas/board.nkc',
      '/workspace/exports/final.mp4',
    ];

    for (const [index, durablePath] of durablePaths.entries()) {
      fsOps.files.set(durablePath, 'durable-content');
      await expect(
        service.record({
          ref: { ...ref, id: `${ref.id}-durable-${index}` },
          variant,
          absolutePath: durablePath,
          sizeBytes: 128,
          rebuildable: false,
        }),
      ).resolves.toMatchObject({
        status: 'non-portable',
        error: 'Recorded resource path is outside the managed cache root.',
      });
    }

    await expect(manifestStore.load()).resolves.toMatchObject({ entries: {} });
    for (const durablePath of durablePaths) {
      expect(fsOps.files.has(durablePath)).toBe(true);
    }
  });

  it('preserves unsafe paths, pinned entries, and session-active variants during GC', async () => {
    const service = createService([]);
    const oldVariant = { role: 'thumbnail' as const, width: 64, height: 64 };
    const activeVariant = { role: 'preview' as const, width: 128, height: 128 };
    const oldKey = createResourceVariantKey({ resource: ref, ...oldVariant });
    const activeKey = createResourceVariantKey({ resource: ref, ...activeVariant });
    fsOps.files.set('/workspace/.neko/.cache/resources/old.jpg', 'old-cache');
    fsOps.files.set('/workspace/neko/facts.json', 'project-fact');
    fsOps.files.set('/workspace/.neko/.cache/resources/pinned.jpg', 'pinned-cache');
    fsOps.files.set('/workspace/.neko/.cache/resources/active.jpg', 'active-cache');

    manifestStore.replace({
      version: 1,
      projectRoot: '/workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      entries: {
        [ref.id]: {
          resource: ref,
          status: 'ready',
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
          variants: [
            {
              key: oldKey,
              role: 'thumbnail',
              status: 'ready',
              absolutePath: '/workspace/.neko/.cache/resources/old.jpg',
              sizeBytes: 128,
              createdAt: '2026-06-05T00:00:00.000Z',
              updatedAt: '2026-06-05T00:00:00.000Z',
              lastAccessedAt: '2026-06-05T00:00:00.000Z',
              rebuildable: true,
            },
            {
              key: 'fact',
              role: 'thumbnail',
              status: 'ready',
              absolutePath: '/workspace/neko/facts.json',
              sizeBytes: 128,
              createdAt: '2026-06-05T00:00:00.000Z',
              updatedAt: '2026-06-05T00:00:00.000Z',
              rebuildable: true,
            },
            {
              key: 'pinned',
              role: 'thumbnail',
              status: 'ready',
              absolutePath: '/workspace/.neko/.cache/resources/pinned.jpg',
              sizeBytes: 128,
              createdAt: '2026-06-05T00:00:00.000Z',
              updatedAt: '2026-06-05T00:00:00.000Z',
              pinned: true,
              rebuildable: true,
            },
            {
              key: activeKey,
              role: 'preview',
              status: 'ready',
              absolutePath: '/workspace/.neko/.cache/resources/active.jpg',
              sizeBytes: 128,
              createdAt: '2026-06-05T00:00:00.000Z',
              updatedAt: '2026-06-05T00:00:00.000Z',
              rebuildable: true,
            },
          ],
        },
      },
    });

    const gc = await service.gc({
      projectMaxBytes: 1,
      activeVariantKeys: [`${ref.id}:${activeKey}`],
    });

    expect(gc).toMatchObject({
      removedCount: 1,
      removedBytes: 128,
      skippedReasons: {
        'unsafe-project-fact': 1,
        pinned: 1,
        'session-active': 1,
      },
    });
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/old.jpg')).toBe(false);
    expect(fsOps.files.has('/workspace/neko/facts.json')).toBe(true);
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/pinned.jpg')).toBe(true);
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/active.jpg')).toBe(true);
  });

  it('records processor lifecycle metadata and updates retention/pin/promote state', async () => {
    const service = createService([]);
    const processorRef = createResourceRef({
      scope: 'project',
      provider: 'external-processor',
      kind: 'generated',
      source: {
        kind: 'file',
        projectRelativePath: 'external-processors/upscale/run-1/stage-1/attempt-1/result.png',
      },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        providerId: 'external-processor',
        value: 'run-1:stage-1:image',
      }),
    });
    const processorVariant = { role: 'preview' as const, mimeType: 'image/png' };
    fsOps.files.set(
      '/workspace/.neko/.cache/resources/external-processors/upscale/run-1/stage-1/attempt-1/result.png',
      'processor-image',
    );

    await service.record({
      ref: processorRef,
      variant: processorVariant,
      absolutePath:
        '/workspace/.neko/.cache/resources/external-processors/upscale/run-1/stage-1/attempt-1/result.png',
      retentionHint: 'intermediate',
      lifecycle: {
        processorRunId: 'run-1',
        stageId: 'stage-1',
        attempt: 1,
        retentionHint: 'intermediate',
      },
    });
    const pinned = await service.updateLifecycle({
      ref: processorRef,
      variant: processorVariant,
      retentionHint: 'pinned',
      pinned: true,
      reason: 'approval-ui',
      ownerId: 'agent',
    });
    const promoted = await service.updateLifecycle({
      ref: processorRef,
      variant: processorVariant,
      retentionHint: 'promoted',
      promoted: true,
      promotedTarget: 'asset',
    });

    expect(pinned.variantEntry).toMatchObject({
      retentionHint: 'pinned',
      pinned: true,
    });
    expect(promoted.entry?.lifecycle).toMatchObject({
      processorRunId: 'run-1',
      stageId: 'stage-1',
      attempt: 1,
      retentionHint: 'promoted',
      promoted: true,
      promotedTarget: 'asset',
      ownerId: 'agent',
    });
    expect(promoted.variantEntry).toMatchObject({
      retentionHint: 'promoted',
      promoted: true,
    });
  });

  it('preserves debug processor outputs during GC', async () => {
    const service = createService([]);
    const debugVariant = { role: 'thumbnail' as const, width: 64 };
    const previewVariant = { role: 'preview' as const, width: 128 };
    const evictableVariant = { role: 'proxy' as const, width: 256 };
    const debugRef = { ...ref, id: `${ref.id}-debug` };
    const previewRef = { ...ref, id: `${ref.id}-preview` };
    const evictableRef = { ...ref, id: `${ref.id}-evictable` };
    fsOps.files.set('/workspace/.neko/.cache/resources/debug.png', 'debug-cache');
    fsOps.files.set('/workspace/.neko/.cache/resources/preview.png', 'preview-cache');
    fsOps.files.set('/workspace/.neko/.cache/resources/evictable.png', 'evictable-cache');
    await service.record({
      ref: debugRef,
      variant: debugVariant,
      absolutePath: '/workspace/.neko/.cache/resources/debug.png',
      sizeBytes: 128,
      retentionHint: 'debug',
      lifecycle: { retentionHint: 'debug', processorRunId: 'run-debug' },
    });
    await service.record({
      ref: previewRef,
      variant: previewVariant,
      absolutePath: '/workspace/.neko/.cache/resources/preview.png',
      sizeBytes: 128,
      retentionHint: 'intermediate',
    });
    await service.record({
      ref: evictableRef,
      variant: evictableVariant,
      absolutePath: '/workspace/.neko/.cache/resources/evictable.png',
      sizeBytes: 128,
      retentionHint: 'intermediate',
    });

    const gc = await service.gc({ projectMaxBytes: 1 });

    expect(gc).toMatchObject({
      removedCount: 2,
      skippedReasons: {
        debug: 1,
      },
    });
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/debug.png')).toBe(true);
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/preview.png')).toBe(false);
    expect(fsOps.files.has('/workspace/.neko/.cache/resources/evictable.png')).toBe(false);
  });

  it('does not evict at exact quota and evicts once the quota is lower than usage', async () => {
    const absolutePath = '/workspace/.neko/.cache/resources/documents/page-1.jpg';
    const provider = createProvider(async (input) => {
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 128,
      };
    });
    const service = createService({ providers: [provider] });

    await service.ensure(ref, variant);

    await expect(service.gc({ projectMaxBytes: 128 })).resolves.toEqual({
      removedCount: 0,
      removedBytes: 0,
      skippedCount: 0,
      skippedReasons: {},
    });
    expect(fsOps.files.has(absolutePath)).toBe(true);

    await expect(service.gc({ projectMaxBytes: 127 })).resolves.toMatchObject({
      removedCount: 1,
      removedBytes: 128,
    });
    expect(fsOps.files.has(absolutePath)).toBe(false);
  });

  it('applies default quota policy to the project cache root', async () => {
    const bigPath = '/workspace/.neko/.cache/resources/big.jpg';
    const smallPath = '/workspace/.neko/.cache/resources/small.jpg';
    const bigRef = { ...ref, id: `${ref.id}-big` };
    const smallRef = { ...ref, id: `${ref.id}-small` };
    fsOps.files.set(bigPath, 'big-cache');
    fsOps.files.set(smallPath, 'small-cache');
    const service = createService([]);

    await service.record({
      ref: bigRef,
      variant: { role: 'thumbnail', width: 64 },
      absolutePath: bigPath,
      sizeBytes: DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
      retentionHint: 'intermediate',
    });
    await service.record({
      ref: smallRef,
      variant: { role: 'preview', width: 128 },
      absolutePath: smallPath,
      sizeBytes: 1,
      retentionHint: 'intermediate',
    });

    await expect(service.gc(resolveResourceCacheQuotaPolicy())).resolves.toMatchObject({
      removedCount: 1,
      removedBytes: DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
    });
    expect(fsOps.files.has(bigPath)).toBe(false);
    expect(fsOps.files.has(smallPath)).toBe(true);
  });

  it('materializes extension-private refs through the shared cache but keeps projection non-portable', async () => {
    const scratchRef: ResourceRef = { ...ref, scope: 'extension-private' };
    const provider = createProvider(async (input) => {
      const absolutePath = `${input.cacheRoot}/documents/private-page-1.jpg`;
      fsOps.files.set(absolutePath, 'image-bytes');
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath,
        sizeBytes: 11,
      };
    });
    const service = createService([provider]);

    await expect(
      service.resolve(scratchRef, variant, { materializeIfMissing: true }),
    ).resolves.toMatchObject({
      status: 'ready',
      absolutePath: '/workspace/.neko/.cache/resources/documents/private-page-1.jpg',
    });
    await expect(service.project({} as never, scratchRef, variant)).resolves.toMatchObject({
      status: 'non-portable',
      error: expect.stringContaining('portable'),
    });
  });

  it('computes stats from a manifest', () => {
    const manifest = {
      version: 1 as const,
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      entries: {
        [ref.id]: {
          resource: ref,
          status: 'ready' as const,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
          variants: [
            {
              key: 'thumb',
              role: 'thumbnail' as const,
              status: 'missing' as const,
              sizeBytes: 32,
              createdAt: '2026-06-05T00:00:00.000Z',
              updatedAt: '2026-06-05T00:00:00.000Z',
            },
          ],
        },
      },
    };

    expect(computeStats(manifest)).toMatchObject({
      totalSizeBytes: 32,
      entryCount: 1,
      variantCount: 1,
      missingCount: 1,
      scopeBytes: { project: 32 },
      statusCounts: { missing: 1 },
      roleCounts: { thumbnail: 1 },
      scopeEntryCounts: { project: 1 },
      providerEntryCounts: { 'document-archive': 1 },
    });
  });

  it('resolves cache quota policy defaults from settings', () => {
    expect(resolveResourceCacheQuotaPolicy()).toEqual({
      projectMaxBytes: DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
      globalMaxBytes: DEFAULT_RESOURCE_CACHE_GLOBAL_MAX_BYTES,
      preservePinned: true,
      preserveSessionActive: true,
      preserveDebug: true,
      preservePromoted: true,
    });

    expect(
      resolveResourceCacheQuotaPolicy(
        {
          projectMaxBytes: 1024,
          globalMaxBytes: 2048,
          minFreeDiskBytes: 512,
        },
        ['res:variant'],
      ),
    ).toEqual({
      projectMaxBytes: 1024,
      globalMaxBytes: 2048,
      minFreeDiskBytes: 512,
      preservePinned: true,
      preserveSessionActive: true,
      preserveDebug: true,
      preservePromoted: true,
      activeVariantKeys: ['res:variant'],
    });
  });

  function createService(
    input:
      | readonly ResourceCacheProvider[]
      | {
          readonly providers: readonly ResourceCacheProvider[];
          readonly logger?: { warn: ReturnType<typeof vi.fn> };
          readonly now?: () => string;
          readonly touchFlushIntervalMs?: number;
          readonly clockMs?: () => number;
          readonly maxConcurrentEnsures?: number;
        },
    logger?: { warn: ReturnType<typeof vi.fn> },
    now: () => string = () => '2026-06-05T00:00:00.000Z',
  ): VSCodeResourceCacheService {
    const options = Array.isArray(input)
      ? { providers: input, logger, now }
      : {
          providers: input.providers,
          logger: input.logger,
          now: input.now ?? (() => '2026-06-05T00:00:00.000Z'),
          touchFlushIntervalMs: input.touchFlushIntervalMs,
          clockMs: input.clockMs,
          maxConcurrentEnsures: input.maxConcurrentEnsures,
        };
    return new VSCodeResourceCacheService({
      cacheRoot: '/workspace/.neko/.cache/resources',
      manifestStore: (manifestStore = createMemoryManifestStore(options.now())),
      projectRoot: '/workspace',
      globalRoot: '/Users/feng/.neko',
      extensionPrivateRoot:
        '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent',
      localResourceAccess,
      providers: options.providers,
      fsOps,
      now: options.now,
      logger: options.logger,
      maxConcurrentEnsures: options.maxConcurrentEnsures ?? 1,
      ...(options.touchFlushIntervalMs !== undefined
        ? { touchFlushIntervalMs: options.touchFlushIntervalMs }
        : {}),
      ...(options.clockMs ? { clockMs: options.clockMs } : {}),
    });
  }
});

function createMemoryManifestStore(now: string): TestResourceCacheManifestStore {
  return new TestResourceCacheManifestStore({
    version: 1,
    projectRoot: '/workspace',
    createdAt: now,
    updatedAt: now,
    entries: {},
  });
}

class TestResourceCacheManifestStore implements ResourceCacheManifestStore {
  writeCount = 0;

  constructor(private manifest: ResourceCacheManifest) {}

  async load(): Promise<ResourceCacheManifest> {
    return this.manifest;
  }

  async save(next: ResourceCacheManifest): Promise<void> {
    this.writeCount += 1;
    this.manifest = next;
  }

  async update(
    operation: (
      manifest: ResourceCacheManifest,
    ) => ResourceCacheManifest | Promise<ResourceCacheManifest>,
  ): Promise<ResourceCacheManifest> {
    const current = this.manifest;
    const next = await operation(current);
    if (next !== current) {
      this.writeCount += 1;
      this.manifest = next;
    }
    return this.manifest;
  }

  invalidateCache(): void {}

  current(): ResourceCacheManifest {
    return this.manifest;
  }

  replace(manifest: ResourceCacheManifest): void {
    this.manifest = manifest;
  }
}

function createProvider(
  ensure: (
    input: ResourceEnsureInput,
  ) => Promise<ReturnType<ResourceCacheProvider['ensure']> extends Promise<infer T> ? T : never>,
): ResourceCacheProvider {
  return createNamedProvider('document-archive', ensure);
}

function createNamedProvider(
  id: string,
  ensure: (
    input: ResourceEnsureInput,
  ) => Promise<ReturnType<ResourceCacheProvider['ensure']> extends Promise<infer T> ? T : never>,
): ResourceCacheProvider {
  return {
    id,
    supports: (resource, request) =>
      resource.provider === 'document-archive' && request.role === 'thumbnail',
    ensure: vi.fn(ensure),
  };
}

function createLocalResourceAccess(
  options: { unauthorized?: boolean } = {},
): LocalResourceAccessService {
  return {
    getLocalResourceRoots: async () => [],
    configureWebview: async () => undefined,
    isAuthorizedPath: async () => !options.unauthorized,
    toWebviewUri: async (_webview, source) =>
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
            uri: `webview:${source}`,
          },
    createSyncProjector: () => () => undefined,
  };
}

class FakeFsOps implements ResourceCacheFsOps {
  readonly files = new Map<string, string>();
  readonly mtimes = new Map<string, number>();
  readonly mkdirCalls: string[] = [];
  readonly readCalls: string[] = [];
  readonly writeCalls: Array<{ path: string; content: string }> = [];
  readonly renameCalls: Array<{ oldPath: string; newPath: string }> = [];
  readonly rmCalls: string[] = [];
  failNextRename = false;
  private nextMtimeMs = 1;

  async readFile(filePath: string): Promise<string> {
    this.readCalls.push(filePath);
    const value = this.files.get(filePath);
    if (value === undefined) {
      throw new Error(`ENOENT: ${filePath}`);
    }
    return value;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.writeCalls.push({ path: filePath, content });
    this.writeExternalFile(filePath, content);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.failNextRename) {
      this.failNextRename = false;
      throw new Error('rename failed');
    }
    this.renameCalls.push({ oldPath, newPath });
    const value = this.files.get(oldPath);
    if (value === undefined) {
      throw new Error(`ENOENT: ${oldPath}`);
    }
    this.files.delete(oldPath);
    this.mtimes.delete(oldPath);
    this.writeExternalFile(newPath, value);
  }

  async mkdir(filePath: string): Promise<void> {
    this.mkdirCalls.push(filePath);
  }

  async stat(filePath: string): Promise<{ readonly size: number; readonly mtimeMs: number }> {
    const value = this.files.get(filePath);
    if (value === undefined) {
      throw new Error(`ENOENT: ${filePath}`);
    }
    return { size: value.length, mtimeMs: this.mtimes.get(filePath) ?? 0 };
  }

  async rm(filePath: string): Promise<void> {
    this.rmCalls.push(filePath);
    this.files.delete(filePath);
    this.mtimes.delete(filePath);
  }

  writeExternalFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
    this.mtimes.set(filePath, this.nextMtimeMs);
    this.nextMtimeMs += 1;
  }
}
