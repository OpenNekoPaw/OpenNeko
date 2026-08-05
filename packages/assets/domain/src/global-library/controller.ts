import {
  type GlobalAssetImportResult,
  type GlobalAssetItem,
  type GlobalAssetProjection,
  type GlobalAssetRemoveResult,
  type GlobalLibraryBrowserRuntime,
  type GlobalLibraryItem,
  type GlobalLibraryOwner,
  type GlobalLibrarySearchInput,
  type GlobalLibraryThumbnailResult,
  type GlobalLibraryThumbnailVariant,
  type GlobalMediaLibraryLocationKind,
  type GlobalMediaLibraryMutationResult,
  type GlobalMediaLibraryProjection,
  type GlobalMediaLibraryRelinkResult,
} from './contract';

export class GlobalLibraryController {
  private readonly activeReads = new Map<GlobalLibraryOwner, object>();
  private readonly projections = new Map<
    GlobalLibraryOwner,
    GlobalAssetProjection | GlobalMediaLibraryProjection
  >();
  private disposed = false;

  constructor(private readonly runtime: GlobalLibraryBrowserRuntime) {}

  async searchAssets(input: GlobalLibrarySearchInput): Promise<GlobalAssetProjection> {
    const requestIdentity = this.beginRead('global-asset-library');
    const projection = await this.runtime.searchAssets(input);
    this.commitRead('global-asset-library', requestIdentity, projection);
    return projection;
  }

  async searchMediaLibraries(
    input: GlobalLibrarySearchInput,
  ): Promise<GlobalMediaLibraryProjection> {
    const requestIdentity = this.beginRead('media-library');
    const projection = await this.runtime.searchMediaLibraries(input);
    this.commitRead('media-library', requestIdentity, projection);
    return projection;
  }

  async readMediaLibraryChildren(
    input: GlobalLibrarySearchInput & {
      readonly libraryId: string;
      readonly relativePath: string;
    },
  ): Promise<GlobalMediaLibraryProjection> {
    const requestIdentity = this.beginRead('media-library');
    const projection = await this.runtime.readMediaLibraryChildren(input);
    this.commitRead('media-library', requestIdentity, projection);
    return projection;
  }

  async resolveThumbnail(
    item: GlobalLibraryItem,
    variant: GlobalLibraryThumbnailVariant,
  ): Promise<GlobalLibraryThumbnailResult> {
    this.requireActive();
    const projection = this.requireProjection(item.owner);
    const current = projection.items.find((candidate) => candidate.id === item.id);
    if (
      !current?.thumbnail ||
      !item.thumbnail ||
      current.thumbnail.descriptorId !== item.thumbnail.descriptorId ||
      current.thumbnail.sourceFingerprint !== item.thumbnail.sourceFingerprint
    ) {
      throw new Error('Global Library thumbnail item is stale.');
    }
    return this.runtime.resolveThumbnail({
      owner: item.owner,
      itemId: item.id,
      descriptorId: item.thumbnail.descriptorId,
      sourceFingerprint: item.thumbnail.sourceFingerprint,
      variant,
    });
  }

  importAssets(): Promise<GlobalAssetImportResult> {
    this.requireProjection('global-asset-library');
    return this.runtime.importAssets();
  }

  removeAsset(item: GlobalAssetItem): Promise<GlobalAssetRemoveResult> {
    this.requireProjection('global-asset-library');
    return this.runtime.removeAsset(item.id);
  }

  addMediaLibrary(locationKind: GlobalMediaLibraryLocationKind) {
    this.requireProjection('media-library');
    return this.runtime.addMediaLibrary(locationKind);
  }

  relinkMediaLibrary(libraryId: string): Promise<GlobalMediaLibraryRelinkResult> {
    this.requireProjection('media-library');
    return this.runtime.relinkMediaLibrary(libraryId);
  }

  removeMediaLibrary(libraryId: string): Promise<GlobalMediaLibraryMutationResult> {
    this.requireProjection('media-library');
    return this.runtime.removeMediaLibrary(libraryId);
  }

  revealMediaLibrary(libraryId: string): Promise<GlobalMediaLibraryMutationResult> {
    this.requireProjection('media-library');
    return this.runtime.revealMediaLibrary(libraryId);
  }

  dispose(): void {
    this.disposed = true;
    this.activeReads.clear();
    this.projections.clear();
  }

  private beginRead(owner: GlobalLibraryOwner): object {
    this.requireActive();
    const requestIdentity = {};
    this.activeReads.set(owner, requestIdentity);
    return requestIdentity;
  }

  private commitRead(
    owner: GlobalLibraryOwner,
    requestIdentity: object,
    projection: GlobalAssetProjection | GlobalMediaLibraryProjection,
  ): void {
    this.requireActive();
    if (this.activeReads.get(owner) !== requestIdentity) {
      throw new Error('Global Library catalog response is stale.');
    }
    this.projections.set(owner, projection);
  }

  private requireProjection(owner: 'global-asset-library'): GlobalAssetProjection;
  private requireProjection(owner: 'media-library'): GlobalMediaLibraryProjection;
  private requireProjection(
    owner: GlobalLibraryOwner,
  ): GlobalAssetProjection | GlobalMediaLibraryProjection;
  private requireProjection(
    owner: GlobalLibraryOwner,
  ): GlobalAssetProjection | GlobalMediaLibraryProjection {
    this.requireActive();
    const projection = this.projections.get(owner);
    if (!projection) {
      throw new Error(`Global Library ${owner} projection is unavailable.`);
    }
    return projection;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Global Library controller is disposed.');
  }
}
