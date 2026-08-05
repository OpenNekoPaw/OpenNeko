import type { ContentLocator } from '@neko/content';
import {
  GlobalLibraryController,
  type GlobalAssetItem,
  type GlobalLibraryBrowserRuntime,
  type GlobalLibraryItem,
  type GlobalLibraryThumbnailResult,
  type GlobalLibraryThumbnailVariant,
  type GlobalMediaLibraryLocationKind,
} from '../global-library';
import {
  AssetCenterContractError,
  type AssetCenterFilterProjection,
  type AssetCenterSessionIdentity,
  type AssetCenterSessionProjection,
} from './contract';
import { AssetCenterSession } from './session';
import type { AssetCenterPreviewCoordinationPorts } from './preview-coordination';

export interface AssetCenterSelectionResolver {
  resolve(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
    readonly expectedCatalogRevision: number;
  }): Promise<ContentLocator>;
}

export interface AssetCenterManagementRuntime {
  readonly identity: AssetCenterSessionIdentity;
  getSnapshot(): AssetCenterSessionProjection | Promise<AssetCenterSessionProjection>;
  subscribe(listener: (projection: AssetCenterSessionProjection) => void): () => void;
  updateFilter(
    expectedRevision: number,
    filter: AssetCenterFilterProjection,
  ): AssetCenterSessionProjection | Promise<AssetCenterSessionProjection>;
  refresh(expectedRevision: number): Promise<AssetCenterSessionProjection>;
  select(input: {
    readonly expectedRevision: number;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
  }): Promise<AssetCenterSessionProjection>;
  resolveThumbnail(
    item: GlobalLibraryItem,
    variant: GlobalLibraryThumbnailVariant,
  ): Promise<GlobalLibraryThumbnailResult>;
  importAssets(expectedRevision: number): Promise<void>;
  removeAsset(item: GlobalAssetItem, expectedRevision: number): Promise<void>;
  addMediaLibrary(
    locationKind: GlobalMediaLibraryLocationKind,
    expectedRevision: number,
  ): Promise<void>;
  relinkMediaLibrary(libraryId: string, expectedRevision: number): Promise<void>;
  removeMediaLibrary(libraryId: string, expectedRevision: number): Promise<void>;
  revealMediaLibrary(libraryId: string, expectedRevision: number): Promise<void>;
  dispose(): void;
}

export class AssetCenterController implements AssetCenterManagementRuntime {
  readonly identity: AssetCenterSessionIdentity;
  private readonly library: GlobalLibraryController;
  private readonly listeners = new Set<(projection: AssetCenterSessionProjection) => void>();
  private disposed = false;

  constructor(
    private readonly session: AssetCenterSession,
    libraryRuntime: GlobalLibraryBrowserRuntime,
    private readonly selectionResolver: AssetCenterSelectionResolver,
    private readonly previewPorts?: AssetCenterPreviewCoordinationPorts,
  ) {
    this.identity = session.identity;
    this.library = new GlobalLibraryController(libraryRuntime);
  }

  getSnapshot(): AssetCenterSessionProjection {
    this.requireActive();
    return this.session.getSnapshot();
  }

  subscribe(listener: (projection: AssetCenterSessionProjection) => void): () => void {
    this.requireActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateFilter(
    expectedRevision: number,
    filter: AssetCenterFilterProjection,
  ): AssetCenterSessionProjection {
    const projection = this.session.updateFilter(expectedRevision, filter);
    this.publish(projection);
    return projection;
  }

  async refresh(expectedRevision: number): Promise<AssetCenterSessionProjection> {
    this.requireRevision(expectedRevision);
    const filter = this.getSnapshot().filter;
    const input = {
      query: filter.query,
      sortBy: filter.sortBy,
      sortDirection: filter.sortDirection,
    } as const;
    let catalog;
    try {
      catalog =
        filter.catalog === 'global-asset-library'
          ? await this.library.searchAssets(input)
          : filter.directory && filter.query.length === 0
            ? await this.library.readMediaLibraryChildren({
                ...input,
                libraryId: filter.directory.libraryId,
                relativePath: filter.directory.relativePath,
              })
            : await this.library.searchMediaLibraries(input);
    } catch (error: unknown) {
      this.requireRevision(expectedRevision);
      const unavailable = this.session.commitCatalogUnavailable(
        expectedRevision,
        error instanceof Error ? error.message : String(error),
      );
      this.publish(unavailable);
      return unavailable;
    }
    const projection = this.session.commitCatalog({
      expectedRevision,
      owner: filter.catalog,
      catalogRevision: catalog.revision,
      entries: catalog.items.map((item) => ({ item })),
    });
    this.publish(projection);
    return projection;
  }

  async select(input: {
    readonly expectedRevision: number;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
  }): Promise<AssetCenterSessionProjection> {
    const projection = this.requireRevision(input.expectedRevision);
    if (projection.catalog.status !== 'ready' || projection.catalog.owner !== input.owner) {
      throw itemUnavailable(input.itemId);
    }
    const item = projection.catalog.entries.find(
      (candidate) => candidate.item.owner === input.owner && candidate.item.id === input.itemId,
    )?.item;
    if (!item || item.availability !== 'available' || !isContentItem(item)) {
      throw itemUnavailable(input.itemId);
    }
    const previousPreview = projection.preview;
    const contentLocator = await this.selectionResolver.resolve({
      identity: this.identity,
      owner: input.owner,
      itemId: input.itemId,
      expectedCatalogRevision: projection.catalog.catalogRevision,
    });
    if (previousPreview.status === 'ready') {
      await this.previewPorts?.previewSessions.release({
        identity: this.identity,
        previewSessionId: previousPreview.previewSessionId,
      });
    }
    const selected = this.session.selectResolved({ ...input, contentLocator });
    this.publish(selected);
    if (!this.previewPorts) return selected;
    const loading = this.session.commitPreview(selected.revision, {
      status: 'loading',
      itemId: input.itemId,
    });
    this.publish(loading);
    const selection = loading.selection;
    if (!selection) {
      throw new AssetCenterContractError(
        'asset-center-stale-identity',
        'Asset Center selected resource is unavailable for Preview authorization.',
      );
    }
    const authorization = await this.previewPorts.contentAuthorization.authorize({
      identity: this.identity,
      owner: selection.owner,
      itemId: selection.itemId,
      contentLocator: selection.contentLocator,
    });
    if (authorization.status === 'unavailable') {
      const unavailable = this.session.commitPreview(loading.revision, {
        status: 'unavailable',
        itemId: selection.itemId,
        diagnostic: authorization.diagnostic,
      });
      this.publish(unavailable);
      return unavailable;
    }
    const preview = await this.previewPorts.previewSessions.create({
      identity: this.identity,
      selection,
      descriptor: authorization.descriptor,
    });
    assertPreviewOwner(this.identity, selection.itemId, preview);
    try {
      const ready = this.session.commitPreview(loading.revision, {
        status: 'ready',
        itemId: selection.itemId,
        previewSessionId: preview.identity.previewSessionId,
      });
      this.publish(ready);
      return ready;
    } catch (error) {
      await this.previewPorts.previewSessions.release({
        identity: this.identity,
        previewSessionId: preview.identity.previewSessionId,
      });
      throw error;
    }
  }

  async detachPreview(): Promise<AssetCenterSessionProjection> {
    const current = this.getSnapshot();
    if (current.preview.status !== 'ready') return current;
    if (!this.previewPorts) {
      throw new Error('Asset Center Preview lifecycle port is unavailable.');
    }
    await this.previewPorts.previewSessions.release({
      identity: this.identity,
      previewSessionId: current.preview.previewSessionId,
    });
    const detached = this.session.commitPreview(current.revision, { status: 'empty' });
    this.publish(detached);
    return detached;
  }

  resolveThumbnail(
    item: GlobalLibraryItem,
    variant: GlobalLibraryThumbnailVariant,
  ): Promise<GlobalLibraryThumbnailResult> {
    return this.library.resolveThumbnail(item, variant);
  }

  async importAssets(expectedRevision: number): Promise<void> {
    this.requireRevision(expectedRevision);
    await this.library.importAssets();
  }

  async removeAsset(item: GlobalAssetItem, expectedRevision: number): Promise<void> {
    const current = this.requireRevision(expectedRevision);
    await this.library.removeAsset(item);
    if (current.selection?.itemId !== item.id) return;
    if (current.preview.status === 'ready') {
      if (!this.previewPorts) {
        throw new Error('Asset Center Preview lifecycle port is unavailable.');
      }
      await this.previewPorts.previewSessions.release({
        identity: this.identity,
        previewSessionId: current.preview.previewSessionId,
      });
    }
    this.publish(this.session.clearSelection(current.revision));
  }

  async addMediaLibrary(
    locationKind: GlobalMediaLibraryLocationKind,
    expectedRevision: number,
  ): Promise<void> {
    this.requireRevision(expectedRevision);
    await this.library.addMediaLibrary(locationKind);
  }

  async relinkMediaLibrary(libraryId: string, expectedRevision: number): Promise<void> {
    this.requireRevision(expectedRevision);
    await this.library.relinkMediaLibrary(libraryId);
  }

  async removeMediaLibrary(libraryId: string, expectedRevision: number): Promise<void> {
    this.requireRevision(expectedRevision);
    await this.library.removeMediaLibrary(libraryId);
  }

  async revealMediaLibrary(libraryId: string, expectedRevision: number): Promise<void> {
    this.requireRevision(expectedRevision);
    await this.library.revealMediaLibrary(libraryId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.library.dispose();
    this.session.dispose();
    this.listeners.clear();
  }

  private requireRevision(expectedRevision: number): AssetCenterSessionProjection {
    const projection = this.getSnapshot();
    if (projection.revision !== expectedRevision) {
      throw new AssetCenterContractError(
        'asset-center-stale-revision',
        `Asset Center session revision ${expectedRevision} is stale; current revision is ${projection.revision}.`,
      );
    }
    return projection;
  }

  private publish(projection: AssetCenterSessionProjection): void {
    for (const listener of this.listeners) listener(projection);
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new AssetCenterContractError(
        'asset-center-session-disposed',
        'Asset Center controller is disposed.',
      );
    }
  }
}

function assertPreviewOwner(
  identity: AssetCenterSessionIdentity,
  itemId: string,
  preview: import('@neko/preview-domain/authorized-session').AuthorizedPreviewSessionProjection,
): void {
  if (
    preview.identity.windowId !== identity.windowId ||
    preview.identity.owner.kind !== 'asset-center' ||
    preview.identity.owner.kind !== 'asset-center' ||
    preview.identity.owner.assetCenterSessionId !== identity.assetCenterSessionId ||
    preview.identity.owner.itemId !== itemId
  ) {
    throw new AssetCenterContractError(
      'asset-center-stale-identity',
      'Authorized Preview session does not match the Asset Center selection.',
    );
  }
}

function isContentItem(item: GlobalLibraryItem): boolean {
  return item.owner === 'global-asset-library' || item.kind === 'file';
}

function itemUnavailable(itemId: string): AssetCenterContractError {
  return new AssetCenterContractError(
    'asset-center-item-unavailable',
    `Asset Center item '${itemId}' is unavailable, mismatched, or not previewable.`,
  );
}
