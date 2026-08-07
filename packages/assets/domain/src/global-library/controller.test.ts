import { describe, expect, it, vi } from 'vitest';
import type {
  GlobalAssetItem,
  GlobalLibraryBrowserRuntime,
  GlobalMediaLibraryItem,
} from './contract';
import { GlobalLibraryController } from './controller';

describe('GlobalLibraryController', () => {
  it('uses the current item and source fingerprint for exact thumbnail resolution', async () => {
    const item: GlobalAssetItem = {
      id: 'global-asset-library:abc123',
      owner: 'global-asset-library',
      label: 'frame.png',
      kind: 'asset',
      mediaType: 'image',
      availability: 'available',
      thumbnail: {
        descriptorId: 'global-asset-library:def456',
        sourceFingerprint: '2026-07-31T00:00:00.000Z:120',
        mediaType: 'image',
      },
    };
    const runtime = createRuntime();
    runtime.searchAssets = vi.fn(async () => ({ items: [item] }));
    const controller = new GlobalLibraryController(runtime);

    await controller.searchAssets(searchInput);
    await controller.resolveThumbnail(item, 'hover');

    expect(runtime.resolveThumbnail).toHaveBeenCalledWith({
      owner: 'global-asset-library',
      itemId: item.id,
      descriptorId: item.thumbnail?.descriptorId,
      sourceFingerprint: item.thumbnail?.sourceFingerprint,
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
    runtime.searchMediaLibraries = vi.fn(async () => ({ items: [library] }));
    const controller = new GlobalLibraryController(runtime);

    await controller.searchMediaLibraries(searchInput);
    await controller.removeMediaLibrary(library.libraryId);

    expect(runtime.removeMediaLibrary).toHaveBeenCalledWith(library.libraryId);
    expect(runtime.removeAssets).not.toHaveBeenCalled();
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
    searchAssets: vi.fn(async () => ({ items: [] })),
    searchMediaLibraries: vi.fn(async () => ({ items: [] })),
    readMediaLibraryChildren: vi.fn(async () => ({ items: [] })),
    resolveThumbnail: vi.fn(async (request) => ({
      ...request,
      dataUrl: 'data:image/png;base64,AA==',
    })),
    importAssets: vi.fn(async () => ({ status: 'cancelled' as const })),
    removeAssets: vi.fn(async (assetIds: readonly string[]) => ({
      status: 'removed' as const,
      assetIds,
    })),
    moveItems: vi.fn(async (itemIds: readonly string[]) => ({
      status: 'moved' as const,
      itemIds,
    })),
    addMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const })),
    relinkMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const })),
    removeMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'removed' as const,
      libraryId,
    })),
    revealMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'revealed' as const,
      libraryId,
    })),
  };
}
