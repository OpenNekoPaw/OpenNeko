import * as path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import type { NekoHostPorts } from '@neko/host/ports';
import type { LocalMetadataRepositories } from '@neko/local-metadata';
import {
  createCanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostRuntimeIdentity,
} from '@neko/canvas-domain';
import type { CanvasMaterialMediaKind } from '@neko/canvas-domain';
import {
  RESOURCE_BROWSER_ROUTES,
  assertResourceBrowserIdentity,
  parseResourceBrowserChildrenRequest,
  parseResourceBrowserIntentRequest,
  parseResourceBrowserQuickPreviewReleaseRequest,
  parseResourceBrowserQuickPreviewRequest,
  parseResourceBrowserRecoveryApplyRequest,
  parseResourceBrowserRecoveryCancelRequest,
  parseResourceBrowserRecoveryPlanRequest,
  parseResourceBrowserSearchRequest,
  parseResourceBrowserSnapshotRequest,
  parseResourceBrowserThumbnailRequest,
  type ResourceBrowserIdentity,
  type ResourceBrowserChildrenRequest,
  type ResourceBrowserItem,
  type ResourceBrowserIntentRequest,
  type ResourceBrowserProjection,
  type ResourceBrowserProjectionEvent,
  type ResourceBrowserQuickPreviewReleaseRequest,
  type ResourceBrowserQuickPreviewReleaseResult,
  type ResourceBrowserQuickPreviewRequest,
  type ResourceBrowserQuickPreviewResult,
  type ResourceBrowserRecoveryApplyRequest,
  type ResourceBrowserRecoveryCancelRequest,
  type ResourceBrowserRecoveryCancelResult,
  type ResourceBrowserRecoveryPlanRequest,
  type ResourceBrowserRecoveryPlanResult,
  type ResourceBrowserSearchRequest,
  type ResourceBrowserSnapshotRequest,
  type ResourceBrowserThumbnailRequest,
  type ResourceBrowserThumbnailResult,
} from '@neko/assets-domain/resource-browser/contract';
import { ResourceBrowserController } from '@neko/assets-domain/resource-browser/controller';
import type {
  GlobalAssetImportResult,
  GlobalAssetItem,
  GlobalAssetProjection,
  GlobalAssetRemoveResult,
  GlobalLibraryItem,
  GlobalLibraryCatalogSort,
  GlobalLibraryMoveResult,
  GlobalLibrarySortDirection,
  GlobalLibraryThumbnailRequest,
  GlobalLibraryThumbnailResult,
  GlobalMediaLibraryItem,
  GlobalMediaLibraryLocationKind,
  GlobalMediaLibraryProjection,
} from '@neko/assets-domain/global-library/contract';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  createGlobalMediaLibraryConnection,
  listGlobalMediaLibraryConnections,
  removeGlobalMediaLibraryConnection,
  replaceGlobalMediaLibraryConnection,
  resolveGlobalMediaLibraryTarget,
} from './global-media-library-files';
import { WorkspaceMediaLibrarySyncService } from './workspace-media-library-sync';
import {
  createResourceBrowserNodeProjectionSource,
  readGlobalMediaLibraryChildren,
  resolveGlobalAssetItemPath,
  resolveResourceBrowserItemPath,
  searchGlobalAssetCatalog,
  searchGlobalMediaLibraries,
  type ResourceBrowserNodeSourceOptions,
} from './resource-browser-node-source';
import { importGlobalAssetFiles } from './global-asset-files';
import { moveGlobalLibraryFiles } from './global-library-file-mutations';
import type { AssetLibraryMembershipRepository } from '@neko/assets-domain/global-library/membership';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import { createResourceBrowserViewId } from '@neko/assets-domain/resource-browser/contract';
import type { ContentLocator } from '@neko/content';
import {
  resolveDesktopWindowWorkspaceWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';

export type ResourceBrowserShellProjection = Pick<
  DesktopShellProjection,
  'rendererSessionId' | 'catalog' | 'window'
>;

export interface ResourceBrowserWorkbenchView {
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly kind: string;
  readonly documentId?: string;
}

export interface ResourceBrowserShellPort {
  getProjection(windowId: string): Promise<ResourceBrowserShellProjection>;
  resolveProjectWorkspace(projectId: string): Promise<AssetWorkspaceResolution>;
  resolveAgentWorkspace(workspaceId: string): Promise<AssetWorkspaceResolution>;
}

export interface ResourceBrowserNodeRuntimeOptions {
  readonly globalAssetRoot: string;
  readonly globalMediaLibraryRoot: string;
  readonly assetLibraryMemberships?: AssetLibraryMembershipRepository;
  readonly localMetadataRepositories?: LocalMetadataRepositories;
  readonly refreshEntityProjections?: ResourceBrowserNodeSourceOptions['refreshEntityProjections'];
  readonly shell: ResourceBrowserShellPort;
  readonly host: Pick<NekoHostPorts, 'files' | 'external'>;
  readonly openPreview: ResourceBrowserNodeSourceOptions['openPreview'];
  readonly openCut: ResourceBrowserNodeSourceOptions['openCut'];
  readonly selectSource: (windowId: string) => Promise<string | undefined>;
  readonly selectWorkspaceFiles: ResourceBrowserNodeSourceOptions['selectWorkspaceFiles'];
  readonly trashWorkspaceItem: ResourceBrowserNodeSourceOptions['trashWorkspaceItem'];
  readonly selectConfiguredGlobalMediaLibrary: ResourceBrowserNodeSourceOptions['selectGlobalLibrary'];
  readonly selectGlobalMediaLibrarySource: (windowId: string) => Promise<string | undefined>;
  readonly selectGlobalAssetSources: (windowId: string) => Promise<readonly string[] | undefined>;
  readonly selectGlobalLibraryMoveDestination: (input: {
    readonly windowId: string;
    readonly owner: GlobalLibraryItem['owner'];
    readonly defaultPath: string;
  }) => Promise<string | undefined>;
  readonly createThumbnail: (absolutePath: string) => Promise<string>;
  readonly createGlobalLibraryThumbnail: (input: {
    readonly absolutePath: string;
    readonly mediaType: 'image' | 'video';
    readonly variant: GlobalLibraryThumbnailRequest['variant'];
    readonly signal?: AbortSignal;
  }) => Promise<string>;
  readonly openQuickPreview: (input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
  }) => Promise<{
    readonly previewSessionId: string;
    readonly descriptor: ResourceBrowserQuickPreviewResult['descriptor'];
  }>;
  readonly releaseQuickPreview: (windowId: string, previewSessionId: string) => void;
  readonly canvas: {
    executeIntent(windowId: string, payload: unknown): Promise<CanvasHostIntentResult>;
  };
  readonly cut: {
    addResource(input: {
      readonly resourceIdentity: ResourceBrowserIdentity;
      readonly item: ResourceBrowserItem;
      readonly target: {
        readonly viewId: string;
        readonly viewInstanceId: string;
        readonly documentId: string;
        readonly sessionId: string;
      };
    }): Promise<void>;
  };
  readonly entity: {
    executeIntent(
      input: Parameters<ResourceBrowserNodeSourceOptions['manageEntity']>[0] & {
        readonly workspace: AssetWorkspaceResolution;
      },
    ): Promise<void>;
  };
}

export class ResourceBrowserNodeRuntime {
  private readonly controllers = new Map<string, ResourceBrowserController>();
  private readonly homeItemsByWindow = new Map<string, Map<string, GlobalLibraryItem>>();
  private readonly homeThumbnailControllers = new Map<string, Set<AbortController>>();
  private globalAssetMutationTail: Promise<void> = Promise.resolve();
  private globalMediaLibraryMutationTail: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly workspaceMediaLibrarySync: WorkspaceMediaLibrarySyncService;

  constructor(private readonly options: ResourceBrowserNodeRuntimeOptions) {
    this.workspaceMediaLibrarySync = new WorkspaceMediaLibrarySyncService(
      options.globalMediaLibraryRoot,
      options.localMetadataRepositories,
    );
  }

  async getSnapshot(
    windowId: string,
    value: ResourceBrowserSnapshotRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    const request = parseResourceBrowserSnapshotRequest(value);
    return (await this.resolveController(windowId, request.identity)).getSnapshot();
  }

  async search(
    windowId: string,
    value: ResourceBrowserSearchRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    const request = parseResourceBrowserSearchRequest(value);
    return (await this.resolveController(windowId, request.identity)).search(request);
  }

  async children(
    windowId: string,
    value: ResourceBrowserChildrenRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    const request = parseResourceBrowserChildrenRequest(value);
    return (await this.resolveController(windowId, request.identity)).children(request);
  }

  async resolveThumbnail(
    windowId: string,
    value: ResourceBrowserThumbnailRequest | unknown,
  ): Promise<ResourceBrowserThumbnailResult> {
    const request = parseResourceBrowserThumbnailRequest(value);
    return (await this.resolveController(windowId, request.identity)).resolveThumbnail(request);
  }

  async resolveQuickPreview(
    windowId: string,
    value: ResourceBrowserQuickPreviewRequest | unknown,
  ): Promise<ResourceBrowserQuickPreviewResult> {
    const request = parseResourceBrowserQuickPreviewRequest(value);
    const controller = await this.resolveController(windowId, request.identity);
    const projection = await controller.getSnapshot();
    const item = projection.items.find((candidate) => candidate.resourceId === request.resourceId);
    if (!item || (item.kind !== 'image' && item.kind !== 'video' && item.kind !== 'audio')) {
      throw new Error('Desktop Resource Browser quick preview item is unavailable or unsupported.');
    }
    const workspace = await this.options.shell.resolveProjectWorkspace(request.identity.projectId);
    if (workspace.workspaceId !== request.identity.workspaceId) {
      throw new Error('Desktop Resource Browser quick preview Workspace is stale.');
    }
    const absolutePath = await resolveResourceBrowserItemPath({
      workspace,
      globalAssetRoot: this.options.globalAssetRoot,
      memberships: this.requireAssetLibraryMemberships(),
      item,
    });
    const opened = await this.options.openQuickPreview({
      identity: request.identity,
      item,
      absolutePath,
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      previewSessionId: opened.previewSessionId,
      descriptor: opened.descriptor,
    };
  }

  async releaseQuickPreview(
    windowId: string,
    value: ResourceBrowserQuickPreviewReleaseRequest | unknown,
  ): Promise<ResourceBrowserQuickPreviewReleaseResult> {
    const request = parseResourceBrowserQuickPreviewReleaseRequest(value);
    await this.resolveController(windowId, request.identity);
    this.options.releaseQuickPreview(windowId, request.previewSessionId);
    return {
      requestId: request.requestId,
      identity: request.identity,
      previewSessionId: request.previewSessionId,
      status: 'released',
    };
  }

  async planRecovery(
    windowId: string,
    value: ResourceBrowserRecoveryPlanRequest | unknown,
  ): Promise<ResourceBrowserRecoveryPlanResult> {
    const request = parseResourceBrowserRecoveryPlanRequest(value);
    const context = await this.resolveRecoveryContext(windowId, request);
    if (request.candidate === 'select-directory') {
      const sourceDirectory = await this.options.selectSource(windowId);
      if (!sourceDirectory) {
        return {
          requestId: request.requestId,
          identity: request.identity,
          resourceId: request.resourceId,
          status: 'cancelled',
        };
      }
      const plan = await this.workspaceMediaLibrarySync.planSelectedDirectory({
        workspace: context.workspace,
        libraryName: context.libraryName,
        locationKind: 'local',
        sourceDirectory,
      });
      return {
        requestId: request.requestId,
        identity: request.identity,
        resourceId: request.resourceId,
        status: 'planned',
        plan,
      };
    }
    const plan = await this.workspaceMediaLibrarySync.planRecovery({
      workspace: context.workspace,
      libraryName: context.libraryName,
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      status: 'planned',
      plan,
    };
  }

  async applyRecovery(
    windowId: string,
    value: ResourceBrowserRecoveryApplyRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    const request = parseResourceBrowserRecoveryApplyRequest(value);
    const controller = await this.resolveController(windowId, request.identity);
    const workspace = await this.options.shell.resolveProjectWorkspace(request.identity.projectId);
    if (workspace.workspaceId !== request.identity.workspaceId) {
      throw new Error('Desktop Resource Browser recovery Workspace is stale.');
    }
    await this.withGlobalMediaLibraryMutation(() =>
      this.workspaceMediaLibrarySync.applyRecovery({
        workspace,
        planId: request.planId,
        expectedOperationFingerprint: request.expectedOperationFingerprint,
      }),
    );
    return controller.execute({
      requestId: `${request.requestId}:refresh`,
      identity: request.identity,
      route: RESOURCE_BROWSER_ROUTES.refresh,
    });
  }

  async cancelRecovery(
    windowId: string,
    value: ResourceBrowserRecoveryCancelRequest | unknown,
  ): Promise<ResourceBrowserRecoveryCancelResult> {
    const request = parseResourceBrowserRecoveryCancelRequest(value);
    await this.resolveController(windowId, request.identity);
    const workspace = await this.options.shell.resolveProjectWorkspace(request.identity.projectId);
    if (workspace.workspaceId !== request.identity.workspaceId) {
      throw new Error('Desktop Resource Browser recovery Workspace is stale.');
    }
    this.workspaceMediaLibrarySync.cancelRecovery({
      workspace,
      planId: request.planId,
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      planId: request.planId,
      status: 'cancelled',
    };
  }

  async execute(
    windowId: string,
    value: ResourceBrowserIntentRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    const request = parseResourceBrowserIntentRequest(value);
    return (await this.resolveController(windowId, request.identity)).execute(request);
  }

  async subscribe(
    windowId: string,
    identity: ResourceBrowserIdentity,
    listener: (event: ResourceBrowserProjectionEvent) => void,
  ): Promise<() => void> {
    return (await this.resolveController(windowId, identity)).subscribe(listener);
  }

  async searchHomeAssets(input: {
    readonly windowId: string;
    readonly query: string;
    readonly sortBy: GlobalLibraryCatalogSort;
    readonly sortDirection: GlobalLibrarySortDirection;
    readonly limit: number;
  }): Promise<GlobalAssetProjection> {
    await this.requireHomeWindow(input.windowId);
    const items = await searchGlobalAssetCatalog({
      globalAssetRoot: this.options.globalAssetRoot,
      files: this.options.host.files,
      memberships: this.requireAssetLibraryMemberships(),
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
    this.recordHomeItems(input.windowId, 'global-asset-library', items);
    return { items };
  }

  async searchHomeMediaLibraries(input: {
    readonly windowId: string;
    readonly query: string;
    readonly sortBy: GlobalLibraryCatalogSort;
    readonly sortDirection: GlobalLibrarySortDirection;
    readonly limit: number;
  }): Promise<GlobalMediaLibraryProjection> {
    await this.requireHomeWindow(input.windowId);
    const items = await searchGlobalMediaLibraries({
      mediaLibraryRoot: this.options.globalMediaLibraryRoot,
      files: this.options.host.files,
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
    this.recordHomeItems(input.windowId, 'media-library', items);
    return { items };
  }

  async readHomeMediaLibraryChildren(input: {
    readonly windowId: string;
    readonly libraryId: string;
    readonly relativePath: string;
    readonly sortBy: GlobalLibraryCatalogSort;
    readonly sortDirection: GlobalLibrarySortDirection;
    readonly limit: number;
  }): Promise<GlobalMediaLibraryProjection> {
    await this.requireHomeWindow(input.windowId);
    const items = await readGlobalMediaLibraryChildren({
      mediaLibraryRoot: this.options.globalMediaLibraryRoot,
      files: this.options.host.files,
      libraryId: input.libraryId,
      relativePath: input.relativePath,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
    this.recordHomeItems(input.windowId, 'media-library', items);
    return { items };
  }

  async addHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly locationKind: GlobalMediaLibraryLocationKind;
  }): Promise<
    { readonly status: 'added'; readonly libraryId: string } | { readonly status: 'cancelled' }
  > {
    await this.requireHomeWindow(input.windowId);
    return this.withGlobalMediaLibraryMutation(async () => {
      const sourceDirectory = await this.options.selectGlobalMediaLibrarySource(input.windowId);
      if (!sourceDirectory) return { status: 'cancelled' };
      const connection = await createGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        sourceDirectory,
        locationKind: input.locationKind,
      });
      return {
        status: 'added',
        libraryId: connection.libraryId,
      };
    });
  }

  async relinkHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly libraryId: string;
  }): Promise<
    { readonly status: 'relinked'; readonly libraryId: string } | { readonly status: 'cancelled' }
  > {
    await this.requireHomeWindow(input.windowId);
    return this.withGlobalMediaLibraryMutation(async () => {
      const sourceDirectory = await this.options.selectGlobalMediaLibrarySource(input.windowId);
      if (!sourceDirectory) return { status: 'cancelled' };
      await replaceGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: input.libraryId,
        sourceDirectory,
      });
      return {
        status: 'relinked',
        libraryId: input.libraryId,
      };
    });
  }

  async removeHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly libraryId: string;
  }): Promise<void> {
    await this.requireHomeWindow(input.windowId);
    await this.withGlobalMediaLibraryMutation(async () => {
      await removeGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: input.libraryId,
      });
    });
  }

  async revealHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly libraryId: string;
  }): Promise<void> {
    await this.requireHomeWindow(input.windowId);
    const revealPath = this.options.host.external?.revealPath;
    if (!revealPath) {
      throw new Error('Desktop global media-library reveal capability is unavailable.');
    }
    await revealPath(
      await resolveGlobalMediaLibraryTarget({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: input.libraryId,
      }),
    );
  }

  async importHomeAssets(input: { readonly windowId: string }): Promise<GlobalAssetImportResult> {
    await this.requireHomeWindow(input.windowId);
    return this.withGlobalAssetMutation(async () => {
      const sources = await this.options.selectGlobalAssetSources(input.windowId);
      if (!sources) return { status: 'cancelled' };
      const outcomes = await importGlobalAssetFiles({
        globalAssetRoot: this.options.globalAssetRoot,
        sourcePaths: sources,
        memberships: this.requireAssetLibraryMemberships(),
      });
      return {
        status: 'completed',
        outcomes,
      };
    });
  }

  async removeHomeAssets(input: {
    readonly windowId: string;
    readonly assetIds: readonly string[];
  }): Promise<GlobalAssetRemoveResult> {
    await this.requireHomeWindow(input.windowId);
    return this.withGlobalAssetMutation(async () => {
      const items = this.requireHomeItems(input.windowId, input.assetIds);
      if (items.some((item) => item.owner !== 'global-asset-library')) {
        throw new Error('Desktop global Asset removal requires Asset items.');
      }
      await this.requireAssetLibraryMemberships().removeMany(
        items.map((item) => item.id),
        new Date().toISOString(),
      );
      return {
        status: 'removed',
        assetIds: items.map((item) => item.id),
      };
    });
  }

  async moveHomeItems(input: {
    readonly windowId: string;
    readonly itemIds: readonly string[];
  }): Promise<GlobalLibraryMoveResult> {
    await this.requireHomeWindow(input.windowId);
    const items = this.requireHomeItems(input.windowId, input.itemIds);
    const owner = items[0]?.owner;
    if (!owner || items.some((item) => item.owner !== owner)) {
      throw new Error('Desktop global Library move requires one resource owner.');
    }
    return owner === 'global-asset-library'
      ? this.withGlobalAssetMutation(() => this.moveHomeAssetItems(input.windowId, items))
      : this.withGlobalMediaLibraryMutation(() => this.moveHomeMediaItems(input.windowId, items));
  }

  async resolveHomeLibraryThumbnail(input: {
    readonly windowId: string;
    readonly request: GlobalLibraryThumbnailRequest;
  }): Promise<GlobalLibraryThumbnailResult> {
    await this.requireHomeWindow(input.windowId);
    const item = this.requireHomeItem(input.windowId, input.request.itemId, input.request.owner);
    const descriptor = item.thumbnail;
    if (
      !descriptor ||
      descriptor.descriptorId !== input.request.descriptorId ||
      descriptor.sourceFingerprint !== input.request.sourceFingerprint
    ) {
      throw new Error('Desktop global Library thumbnail identity is stale.');
    }
    const absolutePath = await this.resolveHomeItemPath(item);
    const controller = new AbortController();
    const controllers = this.homeThumbnailControllers.get(input.windowId) ?? new Set();
    controllers.add(controller);
    this.homeThumbnailControllers.set(input.windowId, controllers);
    try {
      const dataUrl = await this.options.createGlobalLibraryThumbnail({
        absolutePath,
        mediaType: descriptor.mediaType,
        variant: input.request.variant,
        signal: controller.signal,
      });
      return { ...input.request, dataUrl };
    } finally {
      controllers.delete(controller);
      if (controllers.size === 0) this.homeThumbnailControllers.delete(input.windowId);
    }
  }

  async resolveAssetCenterSelection(input: {
    readonly windowId: string;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
  }): Promise<{
    readonly item: GlobalLibraryItem;
    readonly contentLocator: ContentLocator;
    readonly absolutePath: string;
  }> {
    await this.requireHomeWindow(input.windowId);
    const item = this.requireHomeItem(input.windowId, input.itemId, input.owner);
    if (item.owner === 'media-library' && item.kind !== 'file') {
      throw new Error('Asset Center selection requires a content item.');
    }
    const absolutePath = await this.resolveHomeItemPath(item);
    const relativePath =
      item.owner === 'media-library'
        ? item.relativePath
        : path.relative(this.options.globalAssetRoot, absolutePath).split(path.sep).join('/');
    if (!relativePath || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
      throw new Error('Asset Center selection escaped its authorized owner root.');
    }
    return {
      item,
      contentLocator: { kind: 'workspace-file', path: relativePath },
      absolutePath,
    };
  }

  detachWindow(windowId: string): void {
    for (const [key, controller] of this.controllers) {
      if (controller.identity.windowId !== windowId) continue;
      controller.dispose();
      this.controllers.delete(key);
    }
    this.homeItemsByWindow.delete(windowId);
    const controllers = this.homeThumbnailControllers.get(windowId);
    if (controllers) {
      for (const controller of controllers) {
        controller.abort(new Error('Desktop Window was detached.'));
      }
      this.homeThumbnailControllers.delete(windowId);
    }
  }

  private async requireHomeWindow(windowId: string): Promise<void> {
    this.requireActive();
    await this.options.shell.getProjection(windowId);
  }

  private async withGlobalMediaLibraryMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.globalMediaLibraryMutationTail.then(operation);
    this.globalMediaLibraryMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async withGlobalAssetMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.globalAssetMutationTail.then(operation);
    this.globalAssetMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.dispose();
    this.controllers.clear();
    for (const controllers of this.homeThumbnailControllers.values()) {
      for (const controller of controllers) {
        controller.abort(new Error('Desktop Resource Browser runtime was disposed.'));
      }
    }
    this.homeThumbnailControllers.clear();
    this.homeItemsByWindow.clear();
  }

  private recordHomeItems(
    windowId: string,
    owner: GlobalLibraryItem['owner'],
    items: readonly GlobalLibraryItem[],
  ): void {
    const current = this.homeItemsByWindow.get(windowId) ?? new Map<string, GlobalLibraryItem>();
    for (const [itemId, item] of current) {
      if (item.owner === owner) current.delete(itemId);
    }
    for (const item of items) current.set(item.id, item);
    this.homeItemsByWindow.set(windowId, current);
  }

  private requireHomeItem(
    windowId: string,
    itemId: string,
    owner: GlobalLibraryItem['owner'],
  ): GlobalLibraryItem {
    const item = this.homeItemsByWindow.get(windowId)?.get(itemId);
    if (!item || item.owner !== owner) {
      throw new Error('Desktop global Library item identity is stale or has the wrong owner.');
    }
    return item;
  }

  private requireHomeItems(
    windowId: string,
    itemIds: readonly string[],
  ): readonly GlobalLibraryItem[] {
    if (itemIds.length === 0 || new Set(itemIds).size !== itemIds.length) {
      throw new Error('Desktop global Library batch item identities are invalid.');
    }
    return itemIds.map((itemId) => {
      const item = this.homeItemsByWindow.get(windowId)?.get(itemId);
      if (!item) throw new Error(`Desktop global Library item '${itemId}' is stale.`);
      return item;
    });
  }

  private async moveHomeAssetItems(
    windowId: string,
    items: readonly GlobalLibraryItem[],
  ): Promise<GlobalLibraryMoveResult> {
    if (items.some((item) => item.owner !== 'global-asset-library')) {
      throw new Error('Desktop global Asset move received another resource owner.');
    }
    const memberships = this.requireAssetLibraryMemberships();
    const allowedRoot = await realpath(this.options.globalAssetRoot);
    const records = await Promise.all(items.map((item) => memberships.get(item.id)));
    if (records.some((record) => record?.state !== 'active')) {
      throw new Error('Desktop global Asset move contains a stale membership.');
    }
    const destinationDirectory = await this.options.selectGlobalLibraryMoveDestination({
      windowId,
      owner: 'global-asset-library',
      defaultPath: allowedRoot,
    });
    if (!destinationDirectory) return { status: 'cancelled' };
    const sources = await Promise.all(
      items.map(async (item) => ({
        itemId: item.id,
        absolutePath: await resolveGlobalAssetItemPath({
          globalAssetRoot: this.options.globalAssetRoot,
          memberships,
          itemId: item.id,
        }),
      })),
    );
    await moveGlobalLibraryFiles({
      allowedRoot,
      destinationDirectory,
      sources,
      commit: async (entries) => {
        const relocatedAt = new Date().toISOString();
        await memberships.relocateMany(
          entries.map((entry, index) => {
            const record = records[index];
            if (!record) throw new Error('Desktop global Asset membership became stale.');
            return {
              membershipId: entry.itemId,
              expectedSourceRelativePath: record.sourceRelativePath,
              sourceRelativePath: path
                .relative(allowedRoot, entry.destinationPath)
                .split(path.sep)
                .join('/'),
              label: path.basename(entry.destinationPath),
              relocatedAt,
            };
          }),
        );
      },
    });
    return { status: 'moved', itemIds: items.map((item) => item.id) };
  }

  private async moveHomeMediaItems(
    windowId: string,
    items: readonly GlobalLibraryItem[],
  ): Promise<GlobalLibraryMoveResult> {
    const first = items[0];
    if (
      !first ||
      first.owner !== 'media-library' ||
      first.kind !== 'file' ||
      items.some(
        (item) =>
          item.owner !== 'media-library' ||
          item.kind !== 'file' ||
          item.libraryId !== first.libraryId,
      )
    ) {
      throw new Error('Desktop Media Library move requires files from one connection.');
    }
    const allowedRoot = await resolveGlobalMediaLibraryTarget({
      mediaLibraryRoot: this.options.globalMediaLibraryRoot,
      libraryId: first.libraryId,
    });
    const destinationDirectory = await this.options.selectGlobalLibraryMoveDestination({
      windowId,
      owner: 'media-library',
      defaultPath: allowedRoot,
    });
    if (!destinationDirectory) return { status: 'cancelled' };
    await moveGlobalLibraryFiles({
      allowedRoot,
      destinationDirectory,
      sources: items.map((item) => {
        if (item.owner !== 'media-library') {
          throw new Error('Desktop Media Library move received another resource owner.');
        }
        return {
          itemId: item.id,
          absolutePath: path.resolve(allowedRoot, ...item.relativePath.split('/')),
        };
      }),
    });
    return { status: 'moved', itemIds: items.map((item) => item.id) };
  }

  private async resolveHomeItemPath(
    item: GlobalAssetItem | GlobalMediaLibraryItem,
  ): Promise<string> {
    if (item.owner === 'global-asset-library') {
      return this.requireContainedRealFile(
        await resolveGlobalAssetItemPath({
          globalAssetRoot: this.options.globalAssetRoot,
          memberships: this.requireAssetLibraryMemberships(),
          itemId: item.id,
        }),
        this.options.globalAssetRoot,
      );
    }
    if (item.kind !== 'file') {
      throw new Error('Desktop global Library thumbnail requires a file item.');
    }
    const connection = (
      await listGlobalMediaLibraryConnections(this.options.globalMediaLibraryRoot)
    ).find((candidate) => candidate.libraryId === item.libraryId);
    if (!connection || connection.availability !== 'available') {
      throw new Error('Desktop global Media Library connection is unavailable.');
    }
    return this.requireContainedRealFile(
      path.resolve(connection.linkPath, ...item.relativePath.split('/')),
      connection.linkPath,
    );
  }

  private async requireContainedRealFile(candidate: string, root: string): Promise<string> {
    const [resolvedRoot, resolvedCandidate, candidateStat] = await Promise.all([
      realpath(root),
      realpath(candidate),
      lstat(candidate),
    ]);
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    if (
      !candidateStat.isFile() ||
      candidateStat.isSymbolicLink() ||
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Desktop global Library file escapes its authorized owner root.');
    }
    return resolvedCandidate;
  }

  private async resolveController(
    windowId: string,
    identity: ResourceBrowserIdentity,
  ): Promise<ResourceBrowserController> {
    this.requireActive();
    const projection = await this.options.shell.getProjection(windowId);
    if (
      identity.windowId !== windowId ||
      identity.rendererSessionId !== projection.rendererSessionId
    ) {
      throw new Error('Desktop Resource Browser owner identity is stale.');
    }
    const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      projection.window,
      identity.workspaceId,
    );
    const sceneContext = workspaceWorkbench.scene.context;
    const tab =
      sceneContext.kind === 'agent' &&
      sceneContext.scope.kind === 'workspace' &&
      sceneContext.scope.workspaceId === identity.workspaceId
        ? projection.window.tabs.find((candidate) => candidate.viewId === sceneContext.agentViewId)
        : undefined;
    const project =
      tab?.projectId === identity.projectId
        ? projection.catalog.projects.find(
            (candidate) => candidate.projectId === identity.projectId,
          )
        : undefined;
    if (
      !project ||
      !tab ||
      project.workspaceId !== identity.workspaceId ||
      identity.viewId !== createResourceBrowserViewId(tab.viewId)
    ) {
      throw new Error('Desktop Resource Browser Project is not attached to this Window.');
    }
    const expected: ResourceBrowserIdentity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId,
      viewId: createResourceBrowserViewId(tab.viewId),
      viewInstanceId: tab.viewInstanceId,
      rendererSessionId: projection.rendererSessionId,
    };
    assertResourceBrowserIdentity(expected, identity);
    const key = resourceBrowserControllerKey(expected);
    const current = this.controllers.get(key);
    if (current) return current;

    for (const [candidateKey, candidate] of this.controllers) {
      if (
        candidate.identity.windowId === windowId &&
        candidate.identity.projectId === identity.projectId
      ) {
        candidate.dispose();
        this.controllers.delete(candidateKey);
      }
    }
    const workspace = await this.options.shell.resolveAgentWorkspace(project.workspaceId);
    const addToCanvas = createResourceToCanvasInteraction({
      shell: this.options.shell,
      canvas: this.options.canvas,
      windowId,
    });
    const addToCut: ResourceBrowserNodeSourceOptions['addToCut'] = async ({
      identity: resourceIdentity,
      item,
      target,
    }) => {
      await this.options.cut.addResource({ resourceIdentity, item, target });
    };
    const composition = createResourceBrowserNodeProjectionSource({
      globalAssetRoot: this.options.globalAssetRoot,
      ...((this.options.assetLibraryMemberships ?? this.options.localMetadataRepositories)
        ? { assetLibraryMemberships: this.requireAssetLibraryMemberships() }
        : {}),
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
      workspaceMediaLibrarySync: this.workspaceMediaLibrarySync,
      entityProjections: this.options.localMetadataRepositories?.entityAssetProjections,
      refreshEntityProjections: this.options.refreshEntityProjections,
      workspace,
      host: this.options.host,
      openPreview: this.options.openPreview,
      openCut: this.options.openCut,
      selectSource: this.options.selectSource,
      selectWorkspaceFiles: this.options.selectWorkspaceFiles,
      trashWorkspaceItem: this.options.trashWorkspaceItem,
      selectGlobalLibrary: this.options.selectConfiguredGlobalMediaLibrary,
      mutateGlobalMediaLibraries: (operation) => this.withGlobalMediaLibraryMutation(operation),
      createThumbnail: this.options.createThumbnail,
      addToCanvas,
      addToCut,
      manageEntity: (input) => this.options.entity.executeIntent({ ...input, workspace }),
    });
    const controller = new ResourceBrowserController({
      identity: expected,
      source: composition.source,
      interactions: composition.interactions,
      initialFacet: 'files',
      canvasAvailable: true,
    });
    this.controllers.set(key, controller);
    return controller;
  }

  private async resolveRecoveryContext(
    windowId: string,
    request: ResourceBrowserRecoveryPlanRequest,
  ): Promise<{
    readonly workspace: AssetWorkspaceResolution;
    readonly libraryName: string;
  }> {
    const controller = await this.resolveController(windowId, request.identity);
    const projection = await controller.getSnapshot();
    const item = projection.items.find((candidate) => candidate.resourceId === request.resourceId);
    if (
      !item ||
      item.role !== 'library-root' ||
      !item.libraryName ||
      !item.libraryStatus ||
      item.libraryStatus.operationFingerprint !== request.expectedOperationFingerprint
    ) {
      throw new Error('Desktop Resource Browser recovery item is stale or not recoverable.');
    }
    const workspace = await this.options.shell.resolveProjectWorkspace(request.identity.projectId);
    if (workspace.workspaceId !== request.identity.workspaceId) {
      throw new Error('Desktop Resource Browser recovery Workspace is stale.');
    }
    return { workspace, libraryName: item.libraryName };
  }

  private requireAssetLibraryMemberships(): AssetLibraryMembershipRepository {
    const memberships =
      this.options.assetLibraryMemberships ??
      this.options.localMetadataRepositories?.assetLibraryMemberships;
    if (!memberships) {
      throw new Error('Desktop Asset Library membership repository is unavailable.');
    }
    return memberships;
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new Error('Desktop Resource Browser runtime is disposed.');
    }
  }
}

export function createResourceToCanvasInteraction(options: {
  readonly shell: {
    getProjection(windowId: string): Promise<Pick<DesktopShellProjection, 'window'>>;
  };
  readonly canvas: ResourceBrowserNodeRuntimeOptions['canvas'];
  readonly windowId: string;
}): NonNullable<ResourceBrowserNodeSourceOptions['addToCanvas']> {
  let commandSequence = 0;
  return async ({ identity: resourceIdentity, item, target }) => {
    const currentProjection = await options.shell.getProjection(options.windowId);
    const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      currentProjection.window,
      resourceIdentity.workspaceId,
    );
    const canvasView = workspaceWorkbench.layout.main.views.find(
      (candidate) =>
        candidate.kind === 'canvas' &&
        candidate.projectId === resourceIdentity.projectId &&
        candidate.workspaceId === resourceIdentity.workspaceId &&
        candidate.documentId === target.documentId &&
        createCanvasHostSessionId(candidate.viewId, candidate.viewInstanceId) === target.sessionId,
    );
    if (!canvasView) {
      throw new Error('Resource Browser target Canvas is stale or not attached.');
    }
    const canvasIdentity: CanvasHostRuntimeIdentity = {
      projectId: resourceIdentity.projectId,
      workspaceId: resourceIdentity.workspaceId,
      windowId: resourceIdentity.windowId,
      viewId: canvasView.viewId,
      viewInstanceId: canvasView.viewInstanceId,
      documentId: target.documentId,
      sessionId: target.sessionId,
      rendererSessionId: resourceIdentity.rendererSessionId,
    };
    const locator =
      item.facet === 'entities'
        ? item.entityStatus === 'candidate'
          ? undefined
          : item.representationLocator
        : item.facet === 'assets'
          ? undefined
          : item.locator;
    if (!locator) {
      throw new Error('Resource Browser item has no Canvas representation.');
    }
    if (locator.kind === 'generated-output') {
      throw new Error(
        'Generated Resource Browser results require the Generation-owned commit path.',
      );
    }
    commandSequence += 1;
    const commandIdentity = [
      'resource-browser',
      resourceIdentity.viewId,
      item.resourceId,
      target.sessionId,
      String(commandSequence),
    ].join(':');
    const result = await options.canvas.executeIntent(
      options.windowId,
      createCanvasHostIntentRequest({
        requestId: commandIdentity,
        commandId: commandIdentity,
        identity: canvasIdentity,
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: {
              projectId: canvasIdentity.projectId,
              canvasId: canvasIdentity.documentId,
              canvasSessionId: canvasIdentity.sessionId,
            },
            locator,
            mediaKind: resourceItemMediaKind(item),
            title: item.label,
            ...(item.facet === 'entities' && item.entityStatus !== 'candidate'
              ? {
                  entity: {
                    entityId: item.entityRef.entityId,
                    bindingId: requireEntityRepresentationBindingId(item),
                    role: requireEntityRepresentationRole(item),
                  },
                }
              : {}),
          },
        },
      }),
    );
    if (result.status === 'rejected') {
      throw new Error(result.diagnostic.message);
    }
  };
}

function requireEntityRepresentationBindingId(
  item: Extract<ResourceBrowserItem, { readonly facet: 'entities' }>,
): string {
  if (item.entityStatus === 'candidate') {
    throw new Error('Resource Browser candidate has no representation binding identity.');
  }
  if (!item.representationBindingId) {
    throw new Error('Resource Browser Entity has no active representation binding identity.');
  }
  return item.representationBindingId;
}

function requireEntityRepresentationRole(
  item: Extract<ResourceBrowserItem, { readonly facet: 'entities' }>,
) {
  if (item.entityStatus === 'candidate') {
    throw new Error('Resource Browser candidate has no representation role.');
  }
  if (!item.representationRole) {
    throw new Error('Resource Browser Entity has no active representation role.');
  }
  return item.representationRole;
}

function resourceItemMediaKind(item: ResourceBrowserItem): CanvasMaterialMediaKind {
  switch (item.kind) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return item.kind;
    case 'file': {
      const extension = path.extname(item.label).toLocaleLowerCase();
      if (extension === '.glb' || extension === '.gltf' || extension === '.vrm') {
        return 'model';
      }
      return 'other';
    }
    case 'directory':
    case 'asset':
    case 'character':
    case 'scene':
    case 'object':
    case 'location':
    case 'style':
      return 'other';
  }
}

function resourceBrowserControllerKey(identity: ResourceBrowserIdentity): string {
  return [
    identity.windowId,
    identity.projectId,
    identity.viewId,
    String(identity.viewInstanceId),
    identity.rendererSessionId,
  ].join(':');
}
