import { describe, expect, it } from 'vitest';
import {
  asProjectCachePath,
  asProjectFactPath,
  createResourceFingerprint,
  createResourceRef,
  createResourceRefId,
  createResourceVariantKey,
  getResourcePathCategory,
  isManagedCachePathCategory,
  isProjectCachePath,
  isProjectFactPath,
  isResourceCacheManifest,
  isResourceCacheStatus,
  isResourceKind,
  isResourceRef,
  isResourceScope,
  isResourceVariantRef,
  isResourceVariantRole,
  type ResourceCacheManifest,
  type ResourceRef,
  type ResourceVariantRef,
} from '../resource-cache';
import { resolveStorageLayout } from '../storage';

describe('resource cache contracts', () => {
  const source = {
    kind: 'document' as const,
    document: {
      filePath: '${BOOKS}/comic.epub',
      format: 'epub' as const,
      fileId: 'comic-v1',
    },
    identity: { fileId: 'comic-v1', sizeBytes: 1024, mtimeMs: 42 },
  };

  const locator = {
    kind: 'document' as const,
    locator: { kind: 'chapter' as const, chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
    entryPath: 'OPS/page-1.jpg',
  };

  it('validates enum-like resource cache fields', () => {
    expect(isResourceScope('project')).toBe(true);
    expect(isResourceScope('workspace')).toBe(false);
    expect(isResourceKind('storyboard-reference')).toBe(true);
    expect(isResourceKind('asset')).toBe(false);
    expect(isResourceVariantRole('thumbnail')).toBe(true);
    expect(isResourceVariantRole('poster')).toBe(false);
    expect(isResourceCacheStatus('materializing')).toBe(true);
    expect(isResourceCacheStatus('pending')).toBe(false);
  });

  it('creates deterministic resource ids from source locator and fingerprint', () => {
    const fingerprint = createResourceFingerprint({
      strategy: 'mtime-size',
      source: source.identity,
    });
    const input = {
      scope: 'project' as const,
      provider: 'document-archive',
      kind: 'document' as const,
      source,
      locator,
      fingerprint,
    };

    expect(createResourceRefId(input)).toBe(createResourceRefId({ ...input }));

    const ref = createResourceRef(input);
    const sameRef = createResourceRef({ ...input });
    expect(ref.id).toBe(sameRef.id);
    expect(isResourceRef(ref)).toBe(true);
    expect(
      isResourceRef({
        ...ref,
        locator: { kind: 'document', locator: { kind: 'bad' } },
      }),
    ).toBe(false);
  });

  it('creates deterministic variant keys and validates variants', () => {
    const resource: ResourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source,
      locator,
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-v1' }),
    });
    const variant: ResourceVariantRef = {
      resource,
      role: 'thumbnail',
      format: 'jpg',
      mimeType: 'image/jpeg',
      width: 256,
      height: 256,
    };

    expect(createResourceVariantKey(variant)).toBe(createResourceVariantKey({ ...variant }));
    expect(createResourceVariantKey({ role: 'thumbnail', width: 256, height: 256 })).toBe(
      createResourceVariantKey({ height: 256, role: 'thumbnail', width: 256 }),
    );
    expect(createResourceVariantKey({ resource, role: 'document-entry' })).toBe(
      createResourceVariantKey({
        resource,
        role: 'document-entry',
        format: 'epub',
        mimeType: 'image/jpeg',
        width: 1511,
        height: 2160,
      }),
    );
    expect(createResourceVariantKey({ resource, role: 'thumbnail', width: 256 })).not.toBe(
      createResourceVariantKey({ resource, role: 'thumbnail', width: 512 }),
    );
    expect(isResourceVariantRef(variant)).toBe(true);
    expect(isResourceVariantRef({ ...variant, role: 'poster' })).toBe(false);
  });

  it('validates cache manifests with mapping and freshness metadata', () => {
    const resource = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source,
      locator,
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-v1' }),
    });
    const now = '2026-06-05T00:00:00.000Z';
    const manifest: ResourceCacheManifest = {
      version: 1,
      projectRoot: '/workspace',
      createdAt: now,
      updatedAt: now,
      entries: {
        [resource.id]: {
          resource,
          status: 'ready',
          createdAt: now,
          updatedAt: now,
          variants: [
            {
              key: createResourceVariantKey({ resource, role: 'thumbnail', width: 256 }),
              role: 'thumbnail',
              status: 'ready',
              relativePath: 'documents/res/page-1.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 2048,
              createdAt: now,
              updatedAt: now,
              sourceFingerprint: resource.fingerprint,
              rebuildable: true,
            },
          ],
        },
      },
      stats: {
        totalSizeBytes: 2048,
        entryCount: 1,
        variantCount: 1,
        scopeBytes: { project: 2048 },
        providerBytes: { 'document-archive': 2048 },
      },
    };

    expect(isResourceCacheManifest(manifest)).toBe(true);
    expect(
      isResourceCacheManifest({ ...manifest, entries: { [resource.id]: { status: 'ready' } } }),
    ).toBe(false);
  });

  it('classifies cache and project fact paths conservatively', () => {
    const projectRoot = '/workspace/demo';
    const globalRoot = '/Users/feng/.neko';
    const extensionPrivateRoot =
      '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent';

    expect(
      getResourcePathCategory('/workspace/demo/.neko/.cache/resources/a.jpg', { projectRoot }),
    ).toBe('project-cache');
    expect(
      getResourcePathCategory('/workspace/demo/neko/assets/library.json', { projectRoot }),
    ).toBe('project-fact');
    expect(getResourcePathCategory('/Users/feng/.neko/market-cache/pkg.zip', { globalRoot })).toBe(
      'global-cache',
    );
    expect(
      getResourcePathCategory(
        '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent/resources/a.jpg',
        { extensionPrivateRoot },
      ),
    ).toBe('extension-private-cache');
    expect(getResourcePathCategory('/media/source/a.jpg', { projectRoot })).toBe('source-asset');
    expect(
      isProjectCachePath('/workspace/demo/.neko/.cache/resources/a.jpg', { projectRoot }),
    ).toBe(true);
    expect(isProjectFactPath('/workspace/demo/neko/assets/library.json', { projectRoot })).toBe(
      true,
    );
    expect(
      asProjectCachePath('/workspace/demo/neko/assets/library.json', { projectRoot }),
    ).toBeUndefined();
    expect(
      asProjectFactPath('/workspace/demo/.neko/.cache/resources/a.jpg', { projectRoot }),
    ).toBeUndefined();
    expect(isManagedCachePathCategory('project-cache')).toBe(true);
    expect(isManagedCachePathCategory('project-fact')).toBe(false);
  });

  it('adds unified resource cache paths to storage layout', () => {
    const layout = resolveStorageLayout('/workspace/demo', '/Users/feng');

    expect(layout.global.database).toBe('/Users/feng/.neko/neko.db');
    expect(layout.project.local.cache.resources).toBe('/workspace/demo/.neko/.cache/resources');
    expect(layout.project.local.cache.resourceManifest).toBe(
      '/workspace/demo/.neko/.cache/resources/manifest.json',
    );
    expect('database' in layout.project.local.cache).toBe(false);
  });
});
