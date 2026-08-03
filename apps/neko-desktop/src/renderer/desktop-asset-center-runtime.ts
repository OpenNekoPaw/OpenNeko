import type { AssetCenterManagementRuntime } from '@neko/assets-domain/asset-center/controller';
import {
  createAssetCenterHostRequest,
  type OpenNekoAssetCenterBridge,
} from '@neko/assets-domain/asset-center/host-contract';
import type {
  AssetCenterFilterProjection,
  AssetCenterSessionIdentity,
  AssetCenterSessionProjection,
} from '@neko/assets-domain/asset-center/contract';
import type {
  GlobalAssetItem,
  GlobalLibraryItem,
  GlobalLibraryThumbnailVariant,
  GlobalMediaLibraryLocationKind,
} from '@neko/assets-domain/global-library/contract';

export class DesktopAssetCenterRuntime implements AssetCenterManagementRuntime {
  readonly identity: AssetCenterSessionIdentity;
  private projection: AssetCenterSessionProjection | undefined;
  private attachPromise: Promise<AssetCenterSessionProjection> | undefined;
  private readonly listeners = new Set<(projection: AssetCenterSessionProjection) => void>();
  private disposed = false;

  constructor(
    identity: AssetCenterSessionIdentity,
    private readonly endpointEpoch: string,
    private readonly initialViewMode: AssetCenterFilterProjection['viewMode'],
    private readonly bridge: OpenNekoAssetCenterBridge,
  ) {
    this.identity = identity;
  }

  getSnapshot(): Promise<AssetCenterSessionProjection> {
    this.requireActive();
    if (this.projection) return Promise.resolve(this.projection);
    if (!this.attachPromise) {
      this.attachPromise = this.execute({ route: 'attach', initialViewMode: this.initialViewMode });
    }
    return this.attachPromise;
  }

  subscribe(listener: (projection: AssetCenterSessionProjection) => void): () => void {
    this.requireActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateFilter(
    expectedRevision: number,
    filter: AssetCenterFilterProjection,
  ): Promise<AssetCenterSessionProjection> {
    return this.execute({ route: 'filter.update', expectedRevision, filter });
  }

  refresh(expectedRevision: number): Promise<AssetCenterSessionProjection> {
    return this.execute({ route: 'catalog.refresh', expectedRevision });
  }

  select(input: {
    readonly expectedRevision: number;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
  }): Promise<AssetCenterSessionProjection> {
    return this.execute({ route: 'selection.select', ...input });
  }

  resolveThumbnail(item: GlobalLibraryItem, variant: GlobalLibraryThumbnailVariant) {
    const projection = this.requireProjection();
    if (projection.catalog.status !== 'ready' || !item.thumbnail) {
      return Promise.reject(new Error('Asset Center thumbnail identity is unavailable.'));
    }
    const request = createAssetCenterHostRequest({
      requestId: crypto.randomUUID(),
      endpointEpoch: this.endpointEpoch,
      identity: this.identity,
      route: 'thumbnail.resolve',
      expectedRevision: projection.revision,
      itemId: item.id,
      variant,
    });
    return this.bridge.assetCenter.execute(request).then((result) => {
      if (result.route !== 'thumbnail.resolve') {
        throw new Error('Asset Center thumbnail request returned a projection result.');
      }
      return result.thumbnail;
    });
  }

  async importAssets(expectedRevision: number): Promise<void> {
    await this.execute({ route: 'asset.import', expectedRevision });
  }

  async removeAsset(item: GlobalAssetItem, expectedRevision: number): Promise<void> {
    await this.execute({ route: 'asset.remove', expectedRevision, itemId: item.id });
  }

  async addMediaLibrary(
    locationKind: GlobalMediaLibraryLocationKind,
    expectedRevision: number,
  ): Promise<void> {
    await this.execute({ route: 'media-library.add', expectedRevision, locationKind });
  }

  async relinkMediaLibrary(libraryId: string, expectedRevision: number): Promise<void> {
    await this.execute({ route: 'media-library.relink', expectedRevision, libraryId });
  }

  async removeMediaLibrary(libraryId: string, expectedRevision: number): Promise<void> {
    await this.execute({ route: 'media-library.remove', expectedRevision, libraryId });
  }

  async revealMediaLibrary(libraryId: string, expectedRevision: number): Promise<void> {
    await this.execute({ route: 'media-library.reveal', expectedRevision, libraryId });
  }

  dispose(): void {
    if (this.disposed) return;
    const projection = this.projection;
    this.disposed = true;
    this.listeners.clear();
    if (projection?.preview.status === 'ready') {
      void this.bridge.assetCenter.execute(
        createAssetCenterHostRequest({
          requestId: crypto.randomUUID(),
          endpointEpoch: this.endpointEpoch,
          identity: this.identity,
          route: 'preview.detach',
        }),
      );
    }
  }

  private async execute(
    input:
      | { readonly route: 'attach'; readonly initialViewMode: 'list' | 'grid' }
      | {
          readonly route: 'filter.update';
          readonly expectedRevision: number;
          readonly filter: AssetCenterFilterProjection;
        }
      | { readonly route: 'catalog.refresh'; readonly expectedRevision: number }
      | {
          readonly route: 'selection.select';
          readonly expectedRevision: number;
          readonly owner: GlobalLibraryItem['owner'];
          readonly itemId: string;
        }
      | { readonly route: 'asset.import'; readonly expectedRevision: number }
      | {
          readonly route: 'asset.remove';
          readonly expectedRevision: number;
          readonly itemId: string;
        }
      | {
          readonly route: 'media-library.add';
          readonly expectedRevision: number;
          readonly locationKind: GlobalMediaLibraryLocationKind;
        }
      | {
          readonly route: 'media-library.relink' | 'media-library.remove' | 'media-library.reveal';
          readonly expectedRevision: number;
          readonly libraryId: string;
        },
  ): Promise<AssetCenterSessionProjection> {
    this.requireActive();
    const request = createAssetCenterHostRequest({
      requestId: crypto.randomUUID(),
      endpointEpoch: this.endpointEpoch,
      identity: this.identity,
      ...input,
    });
    const result = await this.bridge.assetCenter.execute(request);
    if (result.route === 'preview.get' || result.route === 'thumbnail.resolve') {
      throw new Error('Asset Center management request returned a non-projection result.');
    }
    this.projection = result.projection;
    for (const listener of this.listeners) listener(result.projection);
    return result.projection;
  }

  private requireProjection(): AssetCenterSessionProjection {
    this.requireActive();
    if (!this.projection) throw new Error('Asset Center session is not attached.');
    return this.projection;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Asset Center runtime is disposed.');
  }
}
