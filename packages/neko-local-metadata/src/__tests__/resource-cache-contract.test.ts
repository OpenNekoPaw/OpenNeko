import { describe, expect, it } from 'vitest';
import {
  areResourceCacheEntryDescriptorsContentCompatible,
  asProjectCachePath,
  asProjectFactPath,
  compareResourceCacheDescriptorObservationStrength,
  createResourceCacheContentIdentity,
  createResourceFingerprint,
  createResourceCacheLogicalContentIdentity,
  createResourceCacheEntryDescriptor,
  createResourceCacheEntryDescriptorId,
  createResourceVariantKey,
  getResourcePathCategory,
  isManagedCachePathCategory,
  isProjectCachePath,
  isProjectFactPath,
  isResourceCacheManifest,
  isResourceCacheStatus,
  isResourceKind,
  isResourceCacheEntryDescriptor,
  isResourceScope,
  isResourceCacheVariantDescriptor,
  isResourceVariantRole,
  type ResourceCacheManifest,
  type ResourceCacheEntryDescriptor,
  type ResourceCacheVariantDescriptor,
} from '../resource-cache-contract';
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

  const contentLocator = {
    kind: 'document-entry' as const,
    source: { kind: 'workspace-file' as const, path: 'books/comic.epub' },
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
      contentLocator,
      fingerprint,
    };

    expect(createResourceCacheEntryDescriptorId(input)).toBe(
      createResourceCacheEntryDescriptorId({ ...input }),
    );

    const ref = createResourceCacheEntryDescriptor(input);
    const sameRef = createResourceCacheEntryDescriptor({ ...input });
    expect(ref.id).toBe(sameRef.id);
    expect(isResourceCacheEntryDescriptor(ref)).toBe(true);
    expect(
      isResourceCacheEntryDescriptor({
        ...ref,
        contentLocator: { kind: 'document-entry', source: { kind: 'bad' } },
      }),
    ).toBe(false);
  });

  it('distinguishes logical file identity from durable resource revisions', () => {
    const portablePath = '${A}/epub/animation/Blame/volume-01.epub';
    const fallback: ResourceCacheEntryDescriptor = {
      id: 'res_fallback',
      scope: 'project',
      provider: 'source-file-content-access',
      kind: 'document',
      source: { kind: 'file', projectRelativePath: portablePath },
      fingerprint: { strategy: 'none', value: portablePath },
    };
    const firstRevision: ResourceCacheEntryDescriptor = {
      ...fallback,
      id: 'res_hash_1',
      fingerprint: { strategy: 'hash', value: 'sha256:volume-01-v1' },
    };
    const secondRevision: ResourceCacheEntryDescriptor = {
      ...fallback,
      id: 'res_hash_2',
      fingerprint: { strategy: 'hash', value: 'sha256:volume-01-v2' },
    };

    expect(createResourceCacheLogicalContentIdentity(fallback)).toBe(
      createResourceCacheLogicalContentIdentity(firstRevision),
    );
    expect(areResourceCacheEntryDescriptorsContentCompatible(fallback, firstRevision)).toBe(true);
    expect(
      compareResourceCacheDescriptorObservationStrength(firstRevision, fallback),
    ).toBeGreaterThan(0);
    expect(createResourceCacheContentIdentity(fallback)).not.toBe(
      createResourceCacheContentIdentity(firstRevision),
    );
    expect(areResourceCacheEntryDescriptorsContentCompatible(firstRevision, secondRevision)).toBe(
      false,
    );
    expect(createResourceCacheContentIdentity(firstRevision)).not.toBe(
      createResourceCacheContentIdentity(secondRevision),
    );
  });

  it('creates deterministic variant keys and validates variants', () => {
    const descriptor: ResourceCacheEntryDescriptor = createResourceCacheEntryDescriptor({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source,
      contentLocator,
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-v1' }),
    });
    const variant: ResourceCacheVariantDescriptor = {
      descriptor,
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
    expect(createResourceVariantKey({ descriptor, role: 'document-entry' })).toBe(
      createResourceVariantKey({
        descriptor,
        role: 'document-entry',
        format: 'epub',
        mimeType: 'image/jpeg',
        width: 1511,
        height: 2160,
      }),
    );
    expect(createResourceVariantKey({ descriptor, role: 'thumbnail', width: 256 })).not.toBe(
      createResourceVariantKey({ descriptor, role: 'thumbnail', width: 512 }),
    );
    expect(isResourceCacheVariantDescriptor(variant)).toBe(true);
    expect(isResourceCacheVariantDescriptor({ ...variant, role: 'poster' })).toBe(false);
  });

  it('validates cache manifests with mapping and freshness metadata', () => {
    const descriptor = createResourceCacheEntryDescriptor({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source,
      contentLocator,
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-v1' }),
    });
    const now = '2026-06-05T00:00:00.000Z';
    const manifest: ResourceCacheManifest = {
      version: 2,
      projectRoot: '/workspace',
      createdAt: now,
      updatedAt: now,
      entries: {
        [descriptor.id]: {
          descriptor,
          status: 'ready',
          createdAt: now,
          updatedAt: now,
          variants: [
            {
              key: createResourceVariantKey({ descriptor, role: 'thumbnail', width: 256 }),
              role: 'thumbnail',
              status: 'ready',
              relativePath: 'documents/res/page-1.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 2048,
              createdAt: now,
              updatedAt: now,
              sourceFingerprint: descriptor.fingerprint,
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
      isResourceCacheManifest({ ...manifest, entries: { [descriptor.id]: { status: 'ready' } } }),
    ).toBe(false);
    expect(
      isResourceCacheManifest({
        ...manifest,
        version: 1,
        entries: {
          [descriptor.id]: {
            ...manifest.entries[descriptor.id],
            resource: descriptor,
            descriptor: undefined,
          },
        },
      }),
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
