import {
  ASSET_CENTER_SESSION_CONTRACT_VERSION,
  AssetCenterContractError,
  createDefaultAssetCenterFilter,
  parseAssetCenterCatalogEntry,
  parseAssetCenterFilterProjection,
  parseAssetCenterSessionIdentity,
  parseAssetCenterSessionProjection,
  type AssetCenterCatalogEntry,
  type AssetCenterFilterProjection,
  type AssetCenterSessionIdentity,
  type AssetCenterSessionProjection,
  type AssetCenterPreviewProjection,
} from './contract';
import { validateContentLocator, type ContentLocator } from '@neko/content';

export interface AssetCenterSelectionIntent {
  readonly expectedRevision: number;
  readonly owner: AssetCenterCatalogEntry['item']['owner'];
  readonly itemId: string;
}

export interface AssetCenterCatalogCommit {
  readonly expectedRevision: number;
  readonly owner: AssetCenterCatalogEntry['item']['owner'];
  readonly catalogRevision: number;
  readonly entries: readonly AssetCenterCatalogEntry[];
}

export class AssetCenterSession {
  readonly identity: AssetCenterSessionIdentity;
  private projection: AssetCenterSessionProjection;
  private disposed = false;

  constructor(
    identity: AssetCenterSessionIdentity,
    filter: AssetCenterFilterProjection = createDefaultAssetCenterFilter(),
  ) {
    this.identity = parseAssetCenterSessionIdentity(identity);
    this.projection = parseAssetCenterSessionProjection({
      schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
      identity: this.identity,
      revision: 0,
      filter,
      catalog: { status: 'loading' },
      preview: { status: 'empty' },
    });
  }

  getSnapshot(): AssetCenterSessionProjection {
    this.requireActive();
    return this.projection;
  }

  updateFilter(
    expectedRevision: number,
    filter: AssetCenterFilterProjection,
  ): AssetCenterSessionProjection {
    const current = this.requireRevision(expectedRevision);
    const nextFilter = parseAssetCenterFilterProjection(filter);
    const requiresCatalogRead = !catalogFiltersEqual(current.filter, nextFilter);
    return this.commit({
      ...current,
      revision: current.revision + 1,
      filter: nextFilter,
      catalog: requiresCatalogRead ? { status: 'loading' } : current.catalog,
    });
  }

  commitCatalog(input: AssetCenterCatalogCommit): AssetCenterSessionProjection {
    const current = this.requireRevision(input.expectedRevision);
    if (input.owner !== current.filter.catalog) {
      throw new AssetCenterContractError(
        'asset-center-stale-identity',
        'Asset Center catalog owner does not match the active filter.',
      );
    }
    const entries = input.entries.map(parseAssetCenterCatalogEntry);
    return this.commit({
      ...current,
      revision: current.revision + 1,
      catalog: {
        status: 'ready',
        owner: input.owner,
        catalogRevision: input.catalogRevision,
        entries,
      },
    });
  }

  commitCatalogUnavailable(
    expectedRevision: number,
    message: string,
  ): AssetCenterSessionProjection {
    const current = this.requireRevision(expectedRevision);
    return this.commit({
      ...current,
      revision: current.revision + 1,
      catalog: {
        status: 'unavailable',
        diagnostic: { code: 'asset-center-catalog-unavailable', message },
      },
    });
  }

  select(input: AssetCenterSelectionIntent): AssetCenterSessionProjection {
    const current = this.requireRevision(input.expectedRevision);
    if (current.catalog.status !== 'ready' || current.catalog.owner !== input.owner) {
      throw unavailable(input.itemId);
    }
    const entry = current.catalog.entries.find(
      (candidate) => candidate.item.owner === input.owner && candidate.item.id === input.itemId,
    );
    if (!entry?.contentLocator) throw unavailable(input.itemId);
    return this.commit({
      ...current,
      revision: current.revision + 1,
      selection: {
        owner: entry.item.owner,
        itemId: entry.item.id,
        item: entry.item,
        contentLocator: entry.contentLocator,
      },
    });
  }

  selectResolved(
    input: AssetCenterSelectionIntent & {
      readonly contentLocator: ContentLocator;
    },
  ): AssetCenterSessionProjection {
    const current = this.requireRevision(input.expectedRevision);
    if (current.catalog.status !== 'ready' || current.catalog.owner !== input.owner) {
      throw unavailable(input.itemId);
    }
    const entry = current.catalog.entries.find(
      (candidate) => candidate.item.owner === input.owner && candidate.item.id === input.itemId,
    );
    const locator = validateContentLocator(input.contentLocator);
    if (!entry || !locator.ok) throw unavailable(input.itemId);
    return this.commit({
      ...current,
      revision: current.revision + 1,
      selection: {
        owner: entry.item.owner,
        itemId: entry.item.id,
        item: entry.item,
        contentLocator: locator.locator,
      },
    });
  }

  clearSelection(expectedRevision: number): AssetCenterSessionProjection {
    const current = this.requireRevision(expectedRevision);
    const { selection: _selection, ...withoutSelection } = current;
    return this.commit({
      ...withoutSelection,
      revision: current.revision + 1,
      preview: { status: 'empty' },
    });
  }

  commitPreview(
    expectedRevision: number,
    preview: AssetCenterPreviewProjection,
  ): AssetCenterSessionProjection {
    const current = this.requireRevision(expectedRevision);
    if (preview.status !== 'empty' && current.selection?.itemId !== preview.itemId) {
      throw new AssetCenterContractError(
        'asset-center-stale-identity',
        'Asset Center Preview does not match the selected resource.',
      );
    }
    return this.commit({ ...current, revision: current.revision + 1, preview });
  }

  dispose(): void {
    this.disposed = true;
  }

  private commit(projection: AssetCenterSessionProjection): AssetCenterSessionProjection {
    this.projection = parseAssetCenterSessionProjection(projection);
    return this.projection;
  }

  private requireRevision(expectedRevision: number): AssetCenterSessionProjection {
    this.requireActive();
    if (this.projection.revision !== expectedRevision) {
      throw new AssetCenterContractError(
        'asset-center-stale-revision',
        `Asset Center session revision ${expectedRevision} is stale; current revision is ${this.projection.revision}.`,
      );
    }
    return this.projection;
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new AssetCenterContractError(
        'asset-center-session-disposed',
        'Asset Center session is disposed.',
      );
    }
  }
}

function unavailable(itemId: string): AssetCenterContractError {
  return new AssetCenterContractError(
    'asset-center-item-unavailable',
    `Asset Center item '${itemId}' is unavailable, mismatched, or not previewable.`,
  );
}

function catalogFiltersEqual(
  left: AssetCenterFilterProjection,
  right: AssetCenterFilterProjection,
): boolean {
  return (
    left.catalog === right.catalog &&
    left.query === right.query &&
    left.sortBy === right.sortBy &&
    left.sortDirection === right.sortDirection &&
    left.directory?.libraryId === right.directory?.libraryId &&
    left.directory?.libraryLabel === right.directory?.libraryLabel &&
    left.directory?.locationKind === right.directory?.locationKind &&
    left.directory?.relativePath === right.directory?.relativePath
  );
}
