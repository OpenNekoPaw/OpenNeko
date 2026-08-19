import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { contentLocatorsEqual, type ContentLocator } from '@neko/content';
import {
  AssetCenterController,
  AssetCenterSession,
  createDefaultAssetCenterFilter,
  parseAssetCenterPresentationSnapshot,
  type AssetCenterFilterProjection,
  type AssetCenterPresentationSnapshot,
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
import { getPreviewMediaType } from '@neko/preview-domain';
import {
  createPreviewResourceProjectionService,
  type PreviewResourceProjectionService,
} from '@neko/preview-domain/resource-projection';
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
  initialViewMode: AssetCenterFilterProjection['viewMode'];
  operationTail: Promise<void>;
}

interface PresentationEntry {
  readonly windowId: string;
  readonly snapshot: AssetCenterPresentationSnapshot;
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

interface AssetCenterPreviewResourceOwner {
  readonly previewSessionId: string;
  readonly identity: AssetCenterSessionIdentity;
  readonly resolved: ResolvedSelection;
}

export class AssetCenterNodeRuntime {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly presentations = new Map<string, PresentationEntry>();
  private readonly pendingSelectionRestores = new Map<
    string,
    NonNullable<AssetCenterPresentationSnapshot['selection']>
  >();
  private readonly resolvedSelections = new Map<string, ResolvedSelection>();
  private readonly pendingPreviews = new Map<string, PendingPreview>();
  private readonly previews = new Map<string, AuthorizedPreviewSessionProjection>();
  private readonly createIdentity: () => string;
  private readonly previewResources: PreviewResourceProjectionService<AssetCenterPreviewResourceOwner>;
  private disposed = false;

  constructor(private readonly options: AssetCenterNodeRuntimeOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
    this.previewResources = createPreviewResourceProjectionService({
      resolveSource: async ({ owner, displayName, requestedMediaType }) => {
        const mediaType = requestedMediaType ?? getPreviewMediaType(displayName);
        if (!mediaType) {
          return {
            status: 'unavailable',
            diagnostic: {
              code: 'preview-unsupported-kind',
              message: `Preview does not support '${displayName}'.`,
            },
          };
        }
        const file = await stat(owner.resolved.absolutePath);
        if (!file.isFile()) throw new Error('Asset Center Preview source is not a file.');
        return {
          status: 'ready',
          source: {
            kind: 'file',
            absolutePath: owner.resolved.absolutePath,
            mediaType,
            sourceFingerprint: `${file.mtimeMs}:${file.size}`,
            byteLength: file.size,
          },
        };
      },
      registerSource: async ({ owner, source }) => {
        if (source.kind !== 'file') {
          throw new Error('Asset Center Preview requires a file source.');
        }
        const lease = await this.options.resources.registerFile(
          {
            windowId: owner.identity.windowId,
            viewId: owner.identity.assetCenterSessionId,
            sessionId: owner.previewSessionId,
            sourceFingerprint: source.sourceFingerprint,
          },
          source,
        );
        return {
          status: 'ready',
          lease: {
            ...lease,
            release: () => this.options.resources.releaseSession(owner.previewSessionId),
          },
        };
      },
    });
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
    const presentation = this.presentations.get(input.identity.assetCenterSessionId);
    if (presentation && presentation.windowId !== input.identity.windowId) {
      throw new Error('Asset Center presentation identity does not match its owning Window.');
    }
    const browser = this.createBrowserRuntime(input.identity);
    const session = new AssetCenterSession(
      input.identity,
      presentation?.snapshot.filter ?? {
        ...createDefaultAssetCenterFilter(),
        ...(input.initialViewMode ? { viewMode: input.initialViewMode } : {}),
      },
    );
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
            const mediaType = getPreviewMediaType(resolved.item.label);
            if (!mediaType) {
              return {
                status: 'unavailable',
                diagnostic: {
                  code: 'preview-unsupported-kind',
                  message: `Preview does not support '${resolved.item.label}'.`,
                },
              };
            }
            try {
              const descriptorId = `descriptor:${previewSessionId}`;
              const projection = await this.previewResources.project({
                descriptorId,
                source: contentLocator,
                displayName: resolved.item.label,
                requestedMediaType: mediaType,
                owner: { previewSessionId, identity, resolved },
              });
              if (projection.status === 'unavailable') {
                return {
                  status: 'unavailable',
                  diagnostic: {
                    code:
                      projection.diagnostic.code === 'preview-unsupported-kind'
                        ? 'preview-unsupported-kind'
                        : 'preview-source-unavailable',
                    message: projection.diagnostic.message,
                  },
                };
              }
              this.pendingPreviews.set(descriptorId, {
                previewSessionId,
                identity,
                itemId,
                descriptorId,
              });
              return { status: 'ready', descriptor: projection.descriptor };
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
            this.previewResources.release(requirePreviewDescriptorId(projection));
          },
        },
      },
    );
    const entry: SessionEntry = {
      controller,
      initialViewMode: input.initialViewMode ?? 'list',
      operationTail: Promise.resolve(),
    };
    this.sessions.set(input.identity.assetCenterSessionId, entry);
    if (presentation?.snapshot.selection) {
      this.pendingSelectionRestores.set(
        input.identity.assetCenterSessionId,
        presentation.snapshot.selection,
      );
    }
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
    return this.enqueue(entry, () => {
      const projection = entry.controller.updateFilter(input.filter);
      this.capturePresentation(entry, projection);
      return projection;
    });
  }

  refresh(input: {
    readonly identity: AssetCenterSessionIdentity;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      const projection = await entry.controller.refresh();
      const selection = this.pendingSelectionRestores.get(input.identity.assetCenterSessionId);
      this.pendingSelectionRestores.delete(input.identity.assetCenterSessionId);
      if (!selection || !isSelectionAvailable(projection, selection)) {
        this.capturePresentation(entry, projection);
        return projection;
      }
      const restored = await entry.controller.select(selection);
      this.capturePresentation(entry, restored);
      return restored;
    });
  }

  select(input: {
    readonly identity: AssetCenterSessionIdentity;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
  }): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(input.identity);
    return this.enqueue(entry, async () => {
      const projection = await entry.controller.select(input);
      this.capturePresentation(entry, projection);
      return projection;
    });
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

  async detachSession(identity: AssetCenterSessionIdentity): Promise<AssetCenterSessionProjection> {
    const entry = this.requireSession(identity);
    return this.enqueue(entry, async () => {
      const projection = await entry.controller.detachPreview();
      this.capturePresentation(entry, projection);
      entry.controller.dispose();
      this.sessions.delete(identity.assetCenterSessionId);
      this.pendingSelectionRestores.delete(identity.assetCenterSessionId);
      this.releasePendingPreviews(identity.assetCenterSessionId);
      this.clearResolvedSelections(identity.assetCenterSessionId);
      return projection;
    });
  }

  detachWindow(windowId: string): void {
    for (const [sessionId, entry] of this.sessions) {
      if (entry.controller.identity.windowId !== windowId) continue;
      for (const [previewSessionId, preview] of this.previews) {
        if (preview.identity.windowId !== windowId) continue;
        this.previews.delete(previewSessionId);
        this.previewResources.release(requirePreviewDescriptorId(preview));
      }
      this.releasePendingPreviews(sessionId);
      entry.controller.dispose();
      this.sessions.delete(sessionId);
      this.presentations.delete(sessionId);
      this.pendingSelectionRestores.delete(sessionId);
      this.clearResolvedSelections(sessionId);
    }
    for (const [sessionId, presentation] of this.presentations) {
      if (presentation.windowId === windowId) this.presentations.delete(sessionId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const preview of this.previews.values()) {
      this.previewResources.release(requirePreviewDescriptorId(preview));
    }
    this.previews.clear();
    for (const entry of this.sessions.values()) entry.controller.dispose();
    this.sessions.clear();
    this.presentations.clear();
    this.pendingSelectionRestores.clear();
    this.pendingPreviews.clear();
    this.resolvedSelections.clear();
    this.previewResources.dispose();
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

  private capturePresentation(entry: SessionEntry, projection: AssetCenterSessionProjection): void {
    const selection =
      projection.selection?.owner === projection.filter.catalog
        ? {
            owner: projection.selection.owner,
            itemId: projection.selection.itemId,
          }
        : undefined;
    if (isDefaultFilter(projection.filter, entry.initialViewMode) && !selection) {
      this.presentations.delete(projection.identity.assetCenterSessionId);
      return;
    }
    this.presentations.set(projection.identity.assetCenterSessionId, {
      windowId: projection.identity.windowId,
      snapshot: parseAssetCenterPresentationSnapshot({
        filter: projection.filter,
        selection,
      }),
    });
  }

  private clearResolvedSelections(assetCenterSessionId: string): void {
    const prefix = `${assetCenterSessionId}\u0000`;
    for (const key of this.resolvedSelections.keys()) {
      if (key.startsWith(prefix)) this.resolvedSelections.delete(key);
    }
  }

  private releasePendingPreviews(assetCenterSessionId: string): void {
    for (const [descriptorId, pending] of this.pendingPreviews) {
      if (pending.identity.assetCenterSessionId !== assetCenterSessionId) continue;
      this.previewResources.release(descriptorId);
      this.pendingPreviews.delete(descriptorId);
    }
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

function requirePreviewDescriptorId(projection: AuthorizedPreviewSessionProjection): string {
  if (projection.status !== 'ready') {
    throw new Error(
      `Asset Center Preview session '${projection.identity.previewSessionId}' is not ready.`,
    );
  }
  return projection.descriptor.descriptorId;
}

function isSelectionAvailable(
  projection: AssetCenterSessionProjection,
  selection: NonNullable<AssetCenterPresentationSnapshot['selection']>,
): boolean {
  return (
    projection.catalog.status === 'ready' &&
    projection.catalog.owner === selection.owner &&
    projection.catalog.entries.some(
      (entry) =>
        entry.item.owner === selection.owner &&
        entry.item.id === selection.itemId &&
        entry.item.availability === 'available',
    )
  );
}

function isDefaultFilter(
  filter: AssetCenterFilterProjection,
  initialViewMode: AssetCenterFilterProjection['viewMode'],
): boolean {
  const defaults = createDefaultAssetCenterFilter();
  return (
    filter.catalog === defaults.catalog &&
    filter.query === defaults.query &&
    filter.sortBy === defaults.sortBy &&
    filter.sortDirection === defaults.sortDirection &&
    filter.viewMode === initialViewMode &&
    filter.directory === undefined
  );
}
