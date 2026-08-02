import { describe, expect, it } from 'vitest';
import {
  createGlobalLibraryOpaqueId,
  createGlobalLibraryThumbnailDescriptor,
  parseGlobalAssetItem,
  parseGlobalLibraryThumbnailRequest,
  parseGlobalLibraryThumbnailResult,
  parseGlobalMediaLibraryItem,
} from './contract';

describe('Global Library contract', () => {
  it('projects opaque stable identities without exposing the canonical key', () => {
    const first = createGlobalLibraryOpaqueId('global-asset-library', 'Characters/Hero.png');
    expect(first).toBe(createGlobalLibraryOpaqueId('global-asset-library', 'Characters/Hero.png'));
    expect(first).not.toContain('Characters');
    expect(first).not.toContain('Hero.png');
  });

  it('creates revisioned thumbnail descriptors only for images and videos', () => {
    expect(
      createGlobalLibraryThumbnailDescriptor({
        owner: 'global-asset-library',
        itemId: 'global-asset-library:1',
        mediaType: 'image',
        modifiedAt: '2026-07-31T00:00:00.000Z',
        byteLength: 42,
      }),
    ).toMatchObject({
      revision: '2026-07-31T00:00:00.000Z:42',
      mediaType: 'image',
    });
    expect(
      createGlobalLibraryThumbnailDescriptor({
        owner: 'global-asset-library',
        itemId: 'global-asset-library:2',
        mediaType: 'audio',
        modifiedAt: undefined,
        byteLength: undefined,
      }),
    ).toBeUndefined();
  });

  it('accepts exact owner-specific item projections', () => {
    expect(
      parseGlobalAssetItem({
        id: 'global-asset-library:1',
        owner: 'global-asset-library',
        label: 'Hero.png',
        kind: 'asset',
        mediaType: 'image',
        byteLength: 42,
        modifiedAt: '2026-07-31T00:00:00.000Z',
        availability: 'available',
        thumbnail: {
          descriptorId: 'global-asset-library:thumb',
          revision: '2026-07-31T00:00:00.000Z:42',
          mediaType: 'image',
        },
      }),
    ).toMatchObject({ owner: 'global-asset-library', kind: 'asset' });
    expect(
      parseGlobalMediaLibraryItem({
        id: 'media-library:1',
        owner: 'media-library',
        libraryId: 'media-library:local:Media',
        libraryLabel: 'Media',
        label: 'shot.mp4',
        kind: 'file',
        locationKind: 'local',
        relativePath: 'shot.mp4',
        mediaType: 'video',
        availability: 'available',
      }),
    ).toMatchObject({ owner: 'media-library', kind: 'file' });
    expect(() =>
      parseGlobalMediaLibraryItem({
        id: 'media-library:1',
        owner: 'media-library',
        libraryId: 'media-library:local:Media',
        label: 'shot.mp4',
        kind: 'file',
        locationKind: 'local',
        relativePath: 'shot.mp4',
        mediaType: 'video',
        availability: 'available',
      }),
    ).toThrow('libraryLabel');
  });

  it('rejects owner mismatches and unknown fields', () => {
    expect(() =>
      parseGlobalAssetItem({
        id: 'media-library:1',
        owner: 'media-library',
        label: 'shot.mp4',
        kind: 'asset',
        availability: 'available',
      }),
    ).toThrow('owner');
    expect(() =>
      parseGlobalAssetItem({
        id: 'global-asset-library:1',
        owner: 'global-asset-library',
        label: 'Hero.png',
        kind: 'asset',
        availability: 'available',
        absolutePath: '/private/Hero.png',
      }),
    ).toThrow('invalid');
  });

  it('parses exact thumbnail requests and fences result identity', () => {
    const request = {
      owner: 'global-asset-library' as const,
      itemId: 'global-asset-library:1',
      expectedCatalogRevision: 2,
      descriptorId: 'global-asset-library:thumb',
      thumbnailRevision: 'revision:42',
      variant: 'hover' as const,
    };
    expect(parseGlobalLibraryThumbnailRequest(request)).toEqual(request);
    expect(
      parseGlobalLibraryThumbnailResult({
        ...request,
        dataUrl: 'data:image/png;base64,AA==',
      }),
    ).toEqual({ ...request, dataUrl: 'data:image/png;base64,AA==' });
    expect(() =>
      parseGlobalLibraryThumbnailRequest({ ...request, expectedCatalogRevision: -1 }),
    ).toThrow('revision');
  });
});
