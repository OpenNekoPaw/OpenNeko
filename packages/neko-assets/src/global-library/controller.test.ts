import { describe, expect, it, vi } from 'vitest';
import type {
  GlobalAssetItem,
  GlobalLibraryBrowserRuntime,
  GlobalMediaLibraryItem,
} from './contract';
import { GlobalLibraryController } from './controller';

describe('GlobalLibraryController', () => {
  it('uses the current catalog and thumbnail revisions for exact resolution', async () => {
    const item: GlobalAssetItem = {
      id: 'asset-library:abc123',
      owner: 'asset-library',
      label: 'frame.png',
      kind: 'asset',
      mediaType: 'image',
      availability: 'available',
      thumbnail: {
        descriptorId: 'asset-library:def456',
        revision: '2026-07-31T00:00:00.000Z:120',
        mediaType: 'image',
      },
    };
    const runtime = createRuntime();
    runtime.searchAssets = vi.fn(async () => ({ revision: 7, items: [item] }));
    const controller = new GlobalLibraryController(runtime);

    await controller.searchAssets(searchInput);
    await controller.resolveThumbnail(item, 'hover');

    expect(runtime.resolveThumbnail).toHaveBeenCalledWith({
      owner: 'asset-library',
      itemId: item.id,
      expectedCatalogRevision: 7,
      descriptorId: item.thumbnail?.descriptorId,
      thumbnailRevision: item.thumbnail?.revision,
      variant: 'hover',
    });
  });

  it('keeps Media Library mutations distinct from owned Asset removal', async () => {
    const library: GlobalMediaLibraryItem = {
      id: 'media-library:abc123',
      owner: 'media-library',
      libraryId: 'media-library:local:Footage',
      libraryLabel: 'Footage',
      label: 'Footage',
      kind: 'library',
      locationKind: 'local',
      relativePath: '',
      availability: 'available',
    };
    const runtime = createRuntime();
    runtime.searchMediaLibraries = vi.fn(async () => ({ revision: 3, items: [library] }));
    const controller = new GlobalLibraryController(runtime);

    await controller.searchMediaLibraries(searchInput);
    await controller.removeMediaLibrary(library.libraryId);

    expect(runtime.removeMediaLibrary).toHaveBeenCalledWith(library.libraryId, 3);
    expect(runtime.removeAsset).not.toHaveBeenCalled();
  });
});

const searchInput = {
  query: '',
  sortBy: 'name' as const,
  sortDirection: 'ascending' as const,
  limit: 20,
};

function createRuntime(): GlobalLibraryBrowserRuntime {
  return {
    searchAssets: vi.fn(async () => ({ revision: 0, items: [] })),
    searchMediaLibraries: vi.fn(async () => ({ revision: 0, items: [] })),
    readMediaLibraryChildren: vi.fn(async () => ({ revision: 0, items: [] })),
    resolveThumbnail: vi.fn(async (request) => ({
      ...request,
      dataUrl: 'data:image/png;base64,AA==',
    })),
    importAssets: vi.fn(async () => ({ status: 'cancelled' as const, revision: 0 })),
    removeAsset: vi.fn(async (assetId: string) => ({
      status: 'removed' as const,
      assetId,
      revision: 1,
    })),
    addMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const, revision: 0 })),
    relinkMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const, revision: 0 })),
    removeMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'removed' as const,
      libraryId,
      revision: 1,
    })),
    revealMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'revealed' as const,
      libraryId,
      revision: 0,
    })),
  };
}
