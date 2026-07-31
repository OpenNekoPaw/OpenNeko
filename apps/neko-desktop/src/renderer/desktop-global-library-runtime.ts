import type { GlobalLibraryBrowserRuntime } from 'neko-assets/global-library/contract';
import type { OpenNekoDesktopHomeManagementBridge } from '../shared/home-management-contract';

export function createDesktopGlobalLibraryRuntime(
  bridge: OpenNekoDesktopHomeManagementBridge,
): GlobalLibraryBrowserRuntime {
  return {
    async searchAssets(input) {
      const result = await bridge.home.assets.search(input);
      if (result.status === 'error') throw new Error(result.diagnostic.message);
      return { revision: result.revision, items: result.items };
    },
    async searchMediaLibraries(input) {
      const result = await bridge.home.mediaLibraries.search(input);
      if (result.status === 'error') throw new Error(result.diagnostic.message);
      return { revision: result.revision, items: result.items };
    },
    async readMediaLibraryChildren(input) {
      const result = await bridge.home.mediaLibraries.children(input);
      if (result.status === 'error') throw new Error(result.diagnostic.message);
      return { revision: result.revision, items: result.items };
    },
    async resolveThumbnail(request) {
      const result = await bridge.home.libraryThumbnails.resolve(request);
      return {
        owner: result.owner,
        itemId: result.itemId,
        expectedCatalogRevision: result.expectedCatalogRevision,
        descriptorId: result.descriptorId,
        thumbnailRevision: result.thumbnailRevision,
        variant: result.variant,
        dataUrl: result.dataUrl,
      };
    },
    async importAssets(expectedRevision) {
      const result = await bridge.home.assets.importFiles(expectedRevision);
      return result.status === 'cancelled'
        ? { status: result.status, revision: result.revision }
        : {
            status: result.status,
            revision: result.revision,
            outcomes: result.outcomes,
          };
    },
    async removeAsset(assetId, expectedRevision) {
      const result = await bridge.home.assets.remove(assetId, expectedRevision);
      return {
        status: result.status,
        assetId: result.assetId,
        revision: result.revision,
      };
    },
    async addMediaLibrary(locationKind, expectedRevision) {
      const result = await bridge.home.mediaLibraries.addLibrary(
        locationKind,
        expectedRevision,
      );
      return result.status === 'cancelled'
        ? { status: result.status, revision: result.revision }
        : {
            status: result.status,
            libraryId: result.libraryId,
            revision: result.revision,
          };
    },
    async relinkMediaLibrary(libraryId, expectedRevision) {
      const result = await bridge.home.mediaLibraries.relinkLibrary(
        libraryId,
        expectedRevision,
      );
      return result.status === 'cancelled'
        ? { status: result.status, revision: result.revision }
        : {
            status: result.status,
            libraryId: result.libraryId,
            revision: result.revision,
          };
    },
    async removeMediaLibrary(libraryId, expectedRevision) {
      const result = await bridge.home.mediaLibraries.removeLibrary(
        libraryId,
        expectedRevision,
      );
      return {
        status: result.status,
        libraryId: result.libraryId,
        revision: result.revision,
      };
    },
    async revealMediaLibrary(libraryId, expectedRevision) {
      const result = await bridge.home.mediaLibraries.revealLibrary(
        libraryId,
        expectedRevision,
      );
      return {
        status: result.status,
        libraryId: result.libraryId,
        revision: result.revision,
      };
    },
  };
}
