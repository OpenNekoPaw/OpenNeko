import { describe, expect, it } from 'vitest';
import {
  areResourceCacheEntryDescriptorsContentCompatible,
  asWorkspaceCachePath,
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
  isWorkspaceCachePath,
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
      fileId: 'comic-source',
    },
    identity: { fileId: 'comic-source', sizeBytes: 1024, mtimeMs: 42 },
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

  it('distinguishes logical file identity from durable content fingerprints', () => {
    const portablePath = '${A}/epub/animation/Blame/volume-01.epub';
    const pathFingerprint: ResourceCacheEntryDescriptor = {
      id: 'res_path_fingerprint',
      scope: 'project',
      provider: 'source-file-content-access',
      kind: 'document',
      source: { kind: 'file', projectRelativePath: portablePath },
      fingerprint: { strategy: 'none', value: portablePath },
    };
    const firstFingerprint: ResourceCacheEntryDescriptor = {
      ...pathFingerprint,
      id: 'res_hash_1',
      fingerprint: { strategy: 'hash', value: 'sha256:volume-01-initial' },
    };
    const secondFingerprint: ResourceCacheEntryDescriptor = {
      ...pathFingerprint,
      id: 'res_hash_2',
      fingerprint: { strategy: 'hash', value: 'sha256:volume-01-updated' },
    };

    expect(createResourceCacheLogicalContentIdentity(pathFingerprint)).toBe(
      createResourceCacheLogicalContentIdentity(firstFingerprint),
    );
    expect(
      areResourceCacheEntryDescriptorsContentCompatible(pathFingerprint, firstFingerprint),
    ).toBe(true);
    expect(
      compareResourceCacheDescriptorObservationStrength(firstFingerprint, pathFingerprint),
    ).toBeGreaterThan(0);
    expect(createResourceCacheContentIdentity(pathFingerprint)).not.toBe(
      createResourceCacheContentIdentity(firstFingerprint),
    );
    expect(
      areResourceCacheEntryDescriptorsContentCompatible(firstFingerprint, secondFingerprint),
    ).toBe(false);
    expect(createResourceCacheContentIdentity(firstFingerprint)).not.toBe(
      createResourceCacheContentIdentity(secondFingerprint),
    );
  });

  it('creates deterministic variant keys and validates variants', () => {
    const descriptor: ResourceCacheEntryDescriptor = createResourceCacheEntryDescriptor({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source,
      contentLocator,
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-initial' }),
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
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'doc-entry-initial' }),
    });
    const now = '2026-06-05T00:00:00.000Z';
    const manifest: ResourceCacheManifest = {
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
    const workspaceCacheRoot = '/Users/feng/.neko/workspace-cache/workspace-id';
    const globalRoot = '/Users/feng/.neko';
    const extensionPrivateRoot =
      '/Users/feng/Library/Application Support/Code/User/globalStorage/neko.neko-agent';

    expect(
      getResourcePathCategory('/Users/feng/.neko/workspace-cache/workspace-id/resources/a.jpg', {
        workspaceCacheRoot,
      }),
    ).toBe('workspace-cache');
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
      isWorkspaceCachePath('/Users/feng/.neko/workspace-cache/workspace-id/resources/a.jpg', {
        workspaceCacheRoot,
      }),
    ).toBe(true);
    expect(isProjectFactPath('/workspace/demo/neko/assets/library.json', { projectRoot })).toBe(
      true,
    );
    expect(
      asWorkspaceCachePath('/workspace/demo/neko/assets/library.json', { workspaceCacheRoot }),
    ).toBeUndefined();
    expect(
      asProjectFactPath('/Users/feng/.neko/workspace-cache/workspace-id/resources/a.jpg', {
        projectRoot,
      }),
    ).toBeUndefined();
    expect(isManagedCachePathCategory('workspace-cache')).toBe(true);
    expect(isManagedCachePathCategory('project-fact')).toBe(false);
  });

  it('adds unified resource cache paths to storage layout', () => {
    const layout = resolveStorageLayout('/workspace/demo', '/Users/feng');

    expect(layout.global.database).toBe('/Users/feng/.neko/neko.db');
    expect(layout.global.workspaceCaches).toBe('/Users/feng/.neko/workspace-cache');
    expect(layout.project.facts.identity).toBe('/workspace/demo/neko/project.json');
  });
});
