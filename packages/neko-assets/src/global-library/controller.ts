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
  private readonly readGeneration = new Map<GlobalLibraryOwner, number>();
  private readonly projections = new Map<
    GlobalLibraryOwner,
    GlobalAssetProjection | GlobalMediaLibraryProjection
  >();
  private disposed = false;

  constructor(private readonly runtime: GlobalLibraryBrowserRuntime) {}

  async searchAssets(input: GlobalLibrarySearchInput): Promise<GlobalAssetProjection> {
    const generation = this.beginRead('asset-library');
    const projection = await this.runtime.searchAssets(input);
    this.commitRead('asset-library', generation, projection);
    return projection;
  }

  async searchMediaLibraries(
    input: GlobalLibrarySearchInput,
  ): Promise<GlobalMediaLibraryProjection> {
    const generation = this.beginRead('media-library');
    const projection = await this.runtime.searchMediaLibraries(input);
    this.commitRead('media-library', generation, projection);
    return projection;
  }

  async readMediaLibraryChildren(
    input: GlobalLibrarySearchInput & {
      readonly libraryId: string;
      readonly relativePath: string;
    },
  ): Promise<GlobalMediaLibraryProjection> {
    const generation = this.beginRead('media-library');
    const projection = await this.runtime.readMediaLibraryChildren(input);
    this.commitRead('media-library', generation, projection);
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
      current.thumbnail.revision !== item.thumbnail.revision
    ) {
      throw new Error('Global Library thumbnail item is stale.');
    }
    return this.runtime.resolveThumbnail({
      owner: item.owner,
      itemId: item.id,
      expectedCatalogRevision: projection.revision,
      descriptorId: item.thumbnail.descriptorId,
      thumbnailRevision: item.thumbnail.revision,
      variant,
    });
  }

  importAssets(): Promise<GlobalAssetImportResult> {
    return this.runtime.importAssets(this.requireProjection('asset-library').revision);
  }

  removeAsset(item: GlobalAssetItem): Promise<GlobalAssetRemoveResult> {
    return this.runtime.removeAsset(item.id, this.requireProjection('asset-library').revision);
  }

  addMediaLibrary(locationKind: GlobalMediaLibraryLocationKind): Promise<
    | {
        readonly status: 'added';
        readonly libraryId: string;
        readonly revision: number;
      }
    | { readonly status: 'cancelled'; readonly revision: number }
  > {
    return this.runtime.addMediaLibrary(
      locationKind,
      this.requireProjection('media-library').revision,
    );
  }

  relinkMediaLibrary(libraryId: string): Promise<GlobalMediaLibraryRelinkResult> {
    return this.runtime.relinkMediaLibrary(
      libraryId,
      this.requireProjection('media-library').revision,
    );
  }

  removeMediaLibrary(libraryId: string): Promise<GlobalMediaLibraryMutationResult> {
    return this.runtime.removeMediaLibrary(
      libraryId,
      this.requireProjection('media-library').revision,
    );
  }

  revealMediaLibrary(libraryId: string): Promise<GlobalMediaLibraryMutationResult> {
    return this.runtime.revealMediaLibrary(
      libraryId,
      this.requireProjection('media-library').revision,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.readGeneration.clear();
    this.projections.clear();
  }

  private beginRead(owner: GlobalLibraryOwner): number {
    this.requireActive();
    const generation = (this.readGeneration.get(owner) ?? 0) + 1;
    this.readGeneration.set(owner, generation);
    return generation;
  }

  private commitRead(
    owner: GlobalLibraryOwner,
    generation: number,
    projection: GlobalAssetProjection | GlobalMediaLibraryProjection,
  ): void {
    this.requireActive();
    if (this.readGeneration.get(owner) !== generation) {
      throw new Error('Global Library catalog response is stale.');
    }
    this.projections.set(owner, projection);
  }

  private requireProjection(owner: 'asset-library'): GlobalAssetProjection;
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
