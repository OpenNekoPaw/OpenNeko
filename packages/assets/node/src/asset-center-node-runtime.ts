import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { contentLocatorsEqual, type ContentLocator } from '@neko/content';
import {
  AssetCenterController,
  AssetCenterSession,
  createDefaultAssetCenterFilter,
  type AssetCenterFilterProjection,
  type AssetCenterSessionIdentity,
  type AssetCenterSessionProjection,
} from '@neko/assets-domain/asset-center';
import type {
  GlobalAssetItem,
  GlobalLibraryBrowserRuntime,
  GlobalLibraryItem,
  GlobalLibraryThumbnailVariant,
  GlobalMediaLibraryLocationKind,
} from '@neko/assets-domain/global-library';
import {
  parseAuthorizedPreviewSessionProjection,
  type AuthorizedPreviewSessionProjection,
} from '@neko/preview-domain/authorized-session';
import type { PreviewMediaDescriptor } from '@neko/preview-domain';
import { detectPreviewContentKind, getPreviewMediaType } from '@neko/preview-domain';
import type { ResourceBrowserNodeRuntime } from './resource-browser-node-runtime';

type AssetCenterResourceBrowserPort = Pick<
  ResourceBrowserNodeRuntime,
  | 'searchHomeAssets'
  | 'searchHomeMediaLibraries'
  | 'readHomeMediaLibraryChildren'
  | 'resolveHomeLibraryThumbnail'
  | 'importHomeAssets'
  | 'removeHomeAssets'
  | 'moveHomeItems'
  | 'addHomeMediaLibrary'
  | 'relinkHomeMediaLibrary'
  | 'removeHomeMediaLibrary'
  | 'revealHomeMediaLibrary'
  | 'resolveAssetCenterSelection'
>;

export interface AssetCenterNodeRuntimeOptions {
  readonly resourceBrowser: AssetCenterResourceBrowserPort;
  readonly createIdentity?: () => string;
  readonly resources: {
    registerFile(
      owner: {
        readonly windowId: string;
        readonly viewId: string;
        readonly sessionId: string;
        readonly sourceFingerprint: string;
      },
      resource: {
        readonly absolutePath: string;
        readonly mediaType: string;
        readonly sourceFingerprint: string;
      },
    ): Promise<{
      readonly url: string;
      readonly resourceUris?: Readonly<Record<string, string>>;
    }>;
    releaseSession(sessionId: string): void;
  };
}

interface SessionEntry {
  controller: AssetCenterController;
  operationTail: Promise<void>;
}

interface ResolvedSelection {
  readonly item: GlobalLibraryItem;
  readonly contentLocator: ContentLocator;
  readonly absolutePath: string;
}

interface PendingPreview {
  readonly previewSessionId: string;
  readonly identity: AssetCenterSessionIdentity;
  readonly itemId: string;
  readonly descriptorId: string;
}

export class AssetCenterNodeRuntime {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly resolvedSelections = new Map<string, ResolvedSelection>();
  private readonly pendingPreviews = new Map<string, PendingPreview>();
  private readonly previews = new Map<string, AuthorizedPreviewSessionProjection>();
  private readonly createIdentity: () => string;
  private disposed = false;

  constructor(private readonly options: AssetCenterNodeRuntimeOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
  }

  attach(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly initialViewMode?: AssetCenterFilterProjection['viewMode'];
  }): AssetCenterSessionProjection {
    this.requireActive();
    const existing = this.sessions.get(input.identity.assetCenterSessionId);
    if (existing) {
      assertIdentity(existing.controller.identity, input.identity);
      return existing.controller.getSnapshot();
    }
    const entry = {} as SessionEntry;
    const browser = this.createBrowserRuntime(input.identity);
    const session = new AssetCenterSession(input.identity, {
      ...createDefaultAssetCenterFilter(),
      ...(input.initialViewMode ? { viewMode: input.initialViewMode } : {}),
    });
    const controller = new AssetCenterController(
      session,
      browser,
      {
        resolve: async ({ identity, owner, itemId }) => {
          const resolved = await this.options.resourceBrowser.resolveAssetCenterSelection({
            windowId: identity.windowId,
            owner,
            itemId,
          });
          this.resolvedSelections.set(
            selectionKey(identity.assetCenterSessionId, itemId),
            resolved,
          );
          return resolved.contentLocator;
        },
      },
      {
        contentAuthorization: {
          authorize: async ({ identity, itemId, contentLocator }) => {
            const key = selectionKey(identity.assetCenterSessionId, itemId);
            const resolved = this.resolvedSelections.get(key);
            if (!resolved || !contentLocatorsEqual(resolved.contentLocator, contentLocator)) {
              return {
                status: 'unavailable',
                diagnostic: {
                  code: 'preview-source-unavailable',
                  message: 'Asset Center selection authorization is stale.',
                },
              };
            }
            const previewSessionId = `preview:asset-center:${this.createIdentity()}`;
            const contentKind = detectPreviewContentKind(resolved.item.label);
            const mediaType = getPreviewMediaType(resolved.item.label);
            if (!contentKind || !mediaType) {
              return {
                status: 'unavailable',
                diagnostic: {
                  code: 'preview-unsupported-kind',
                  message: `Preview does not support '${resolved.item.label}'.`,
                },
              };
            }
            try {
              const file = await stat(resolved.absolutePath);
              if (!file.isFile()) throw new Error('Asset Center Preview source is not a file.');
              const sourceFingerprint = `${file.mtimeMs}:${file.size}`;
              const lease = await this.options.resources.registerFile(
                {
                  windowId: identity.windowId,
                  viewId: identity.assetCenterSessionId,
                  sessionId: previewSessionId,
                  sourceFingerprint,
                },
                {
                  absolutePath: resolved.absolutePath,
                  mediaType,
                  sourceFingerprint,
                },
              );
              const descriptor: PreviewMediaDescriptor = {
                descriptorId: `descriptor:${previewSessionId}`,
                sourceFingerprint,
                contentLocator,
                url: lease.url,
                ...(lease.resourceUris ? { resourceUris: lease.resourceUris } : {}),
                contentKind,
                mediaType,
                displayName: resolved.item.label,
                byteLength: file.size,
              };
              this.pendingPreviews.set(descriptor.descriptorId, {
                previewSessionId,
                identity,
                itemId,
                descriptorId: descriptor.descriptorId,
              });
              return { status: 'ready', descriptor };
            } catch (error: unknown) {
              return {
                status: 'unavailable',
                diagnostic: {
                  code: 'preview-source-unavailable',
                  message: error instanceof Error ? error.message : String(error),
                },
              };
            }
          },
        },
        previewSessions: {
          create: async ({ identity, selection, descriptor }) => {
            const pending = this.pendingPreviews.get(descriptor.descriptorId);
            if (
              !pending ||
              pending.identity.assetCenterSessionId !== identity.assetCenterSessionId ||
              pending.identity.windowId !== identity.windowId ||
              pending.itemId !== selection.itemId
            ) {
              throw new Error('Asset Center Preview authorization is stale.');
            }
            this.pendingPreviews.delete(descriptor.descriptorId);
            const projection = parseAuthorizedPreviewSessionProjection({
              identity: {
                previewSessionId: pending.previewSessionId,
                windowId: identity.windowId,
                owner: {
                  kind: 'asset-center',
                  assetCenterSessionId: identity.assetCenterSessionId,
                  resourceOwner: selection.owner,
                  itemId: selection.itemId,
                },
              },
              status: 'ready',
              descriptor,
            });
            this.previews.set(pending.previewSessionId, projection);
            return projection;
          },
          release: async ({ identity, previewSessionId }) => {
            const projection = this.previews.get(previewSessionId);
            if (
              !projection ||
              projection.identity.windowId !== identity.windowId ||
              projection.identity.owner.kind !== 'asset-center' ||
              projection.identity.owner.assetCenterSessionId !== identity.assetCenterSessionId
            ) {
              throw new Error(`Asset Center Preview session '${previewSessionId}' is unavailable.`);
            }
            this.previews.delete(previewSessionId);
            this.options.resources.releaseSession(previewSessionId);
          },
        },
      },
    );
    entry.controller = controller;
    entry.operationTail = Promise.resolve();
    this.sessions.set(input.identity.assetCenterSessionId, entry);
    return controller.getSnapshot();
  }

  getSnapshot(identity: AssetCenterSessionIdentity): AssetCenterSessionProjection {
    return this.requireSession(identity).controller.getSnapshot();
  }

  updateFilter(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly filter: AssetCenterFilterProjection;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, () => entry.controller.updateFilter(input.filter));
  }

  refresh(input: {
    readonly identity: AssetCenterSessionIdentity;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, () => entry.controller.refresh());
  }

  select(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, () => entry.controller.select(input));
  }

  resolveThumbnail(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly itemId: string;
    readonly variant: GlobalLibraryThumbnailVariant;
  }) {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, () => {
      const item = this.requireCatalogItem(entry, input.itemId);
      return entry.controller.resolveThumbnail(item, input.variant);
    });
  }

  importAssets(input: {
    readonly identity: AssetCenterSessionIdentity;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      await entry.controller.importAssets();
      return entry.controller.getSnapshot();
    });
  }

  removeAssets(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly itemIds: readonly string[];
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      const items = this.requireCatalogItems(entry, input.itemIds);
      if (items.some((item) => item.owner !== 'global-asset-library')) {
        throw new Error('Asset Center removal requires global Asset items.');
      }
      await entry.controller.removeAssets(
        items.filter((item): item is GlobalAssetItem => item.owner === 'global-asset-library'),
      );
      return entry.controller.getSnapshot();
    });
  }

  moveItems(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly itemIds: readonly string[];
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      await entry.controller.moveItems(this.requireCatalogItems(entry, input.itemIds));
      return entry.controller.getSnapshot();
    });
  }

  addMediaLibrary(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly locationKind: GlobalMediaLibraryLocationKind;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      await entry.controller.addMediaLibrary(input.locationKind);
      return entry.controller.getSnapshot();
    });
  }

  relinkMediaLibrary(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly libraryId: string;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      await entry.controller.relinkMediaLibrary(input.libraryId);
      return entry.controller.getSnapshot();
    });
  }

  removeMediaLibrary(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly libraryId: string;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      await entry.controller.removeMediaLibrary(input.libraryId);
      return entry.controller.getSnapshot();
    });
  }

  revealMediaLibrary(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly libraryId: string;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      await entry.controller.revealMediaLibrary(input.libraryId);
      return entry.controller.getSnapshot();
    });
  }

  getPreview(identity: AssetCenterSessionIdentity, previewSessionId: string) {
    this.requireSession(identity);
    const preview = this.previews.get(previewSessionId);
    if (
      !preview ||
      preview.identity.windowId !== identity.windowId ||
      preview.identity.owner.kind !== 'asset-center' ||
      preview.identity.owner.assetCenterSessionId !== identity.assetCenterSessionId
    ) {
      throw new Error(`Asset Center Preview session '${previewSessionId}' is unavailable.`);
    }
    return preview;
  }

  async detachView(identity: AssetCenterSessionIdentity): Promise<AssetCenterSessionProjection> {
    const controller = this.requireSession(identity).controller;
    return controller.detachPreview();
  }

  detachWindow(windowId: string): void {
    for (const [sessionId, entry] of this.sessions) {
      if (entry.controller.identity.windowId !== windowId) continue;
      for (const [previewSessionId, preview] of this.previews) {
        if (preview.identity.windowId !== windowId) continue;
        this.previews.delete(previewSessionId);
        this.options.resources.releaseSession(previewSessionId);
      }
      entry.controller.dispose();
      this.sessions.delete(sessionId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const previewSessionId of this.previews.keys()) {
      this.options.resources.releaseSession(previewSessionId);
    }
    this.previews.clear();
    for (const entry of this.sessions.values()) entry.controller.dispose();
    this.sessions.clear();
    this.pendingPreviews.clear();
    this.resolvedSelections.clear();
  }

  private createBrowserRuntime(identity: AssetCenterSessionIdentity): GlobalLibraryBrowserRuntime {
    const resources = this.options.resourceBrowser;
    return {
      searchAssets: (input) =>
        resources.searchHomeAssets({
          windowId: identity.windowId,
          ...input,
          limit: input.limit ?? 160,
        }),
      searchMediaLibraries: (input) =>
        resources.searchHomeMediaLibraries({
          windowId: identity.windowId,
          ...input,
          limit: input.limit ?? 160,
        }),
      readMediaLibraryChildren: (input) =>
        resources.readHomeMediaLibraryChildren({
          windowId: identity.windowId,
          ...input,
          limit: input.limit ?? 160,
        }),
      resolveThumbnail: (request) =>
        resources.resolveHomeLibraryThumbnail({
          windowId: identity.windowId,
          request,
        }),
      importAssets: () =>
        resources.importHomeAssets({
          windowId: identity.windowId,
        }),
      removeAssets: (assetIds) =>
        resources.removeHomeAssets({
          windowId: identity.windowId,
          assetIds,
        }),
      moveItems: (itemIds) => resources.moveHomeItems({ windowId: identity.windowId, itemIds }),
      addMediaLibrary: (locationKind) =>
        resources.addHomeMediaLibrary({
          windowId: identity.windowId,
          locationKind,
        }),
      relinkMediaLibrary: (libraryId) =>
        resources.relinkHomeMediaLibrary({
          windowId: identity.windowId,
          libraryId,
        }),
      removeMediaLibrary: async (libraryId) => {
        await resources.removeHomeMediaLibrary({
          windowId: identity.windowId,
          libraryId,
        });
        return {
          status: 'removed',
          libraryId,
        };
      },
      revealMediaLibrary: async (libraryId) => {
        await resources.revealHomeMediaLibrary({
          windowId: identity.windowId,
          libraryId,
        });
        return {
          status: 'revealed',
          libraryId,
        };
      },
    };
  }

  private requireSession(identity: AssetCenterSessionIdentity): SessionEntry {
    this.requireActive();
    const entry = this.sessions.get(identity.assetCenterSessionId);
    if (!entry)
      throw new Error(`Asset Center session '${identity.assetCenterSessionId}' is unavailable.`);
    assertIdentity(entry.controller.identity, identity);
    return entry;
  }

  private requireCatalogItem(entry: SessionEntry, itemId: string): GlobalLibraryItem {
    const projection = entry.controller.getSnapshot();
    if (projection.catalog.status !== 'ready') {
      throw new Error('Asset Center catalog is unavailable.');
    }
    const item = projection.catalog.entries.find((entry) => entry.item.id === itemId)?.item;
    if (!item) throw new Error(`Asset Center item '${itemId}' is unavailable.`);
    return item;
  }

  private requireCatalogItems(
    entry: SessionEntry,
    itemIds: readonly string[],
  ): readonly GlobalLibraryItem[] {
    if (itemIds.length === 0 || new Set(itemIds).size !== itemIds.length) {
      throw new Error('Asset Center batch item identities are invalid.');
    }
    return itemIds.map((itemId) => this.requireCatalogItem(entry, itemId));
  }

  private enqueue<Result>(
    entry: SessionEntry,
    operation: () => Promise<Result> | Result,
  ): Promise<Result> {
    const result = entry.operationTail.then(operation);
    entry.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Asset Center Node runtime is disposed.');
  }
}

function assertIdentity(
  expected: AssetCenterSessionIdentity,
  actual: AssetCenterSessionIdentity,
): void {
  if (
    expected.assetCenterSessionId !== actual.assetCenterSessionId ||
    expected.windowId !== actual.windowId
  ) {
    throw new Error('Asset Center session identity does not match its owning Window.');
  }
}

function selectionKey(assetCenterSessionId: string, itemId: string): string {
  return `${assetCenterSessionId}\u0000${itemId}`;
}
