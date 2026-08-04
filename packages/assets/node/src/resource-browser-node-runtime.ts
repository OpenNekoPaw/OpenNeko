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
import { importGlobalAssetFiles, removeGlobalAssetFile } from './global-asset-files';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import { createResourceBrowserViewId } from '@neko/assets-domain/resource-browser/contract';
import type { ContentLocator } from '@neko/content';

export interface ResourceBrowserShellProjection {
  readonly endpointEpoch: string;
  readonly catalog: {
    readonly projects: readonly {
      readonly projectId: string;
      readonly workspaceId: string;
    }[];
  };
  readonly window: {
    readonly tabs: readonly {
      readonly tabId: string;
      readonly projectId: string;
      readonly viewId: string;
      readonly viewEpoch: number;
    }[];
    readonly scene: {
      readonly context:
        | {
            readonly kind: 'agent';
            readonly agentViewId: string;
            readonly scope:
              | { readonly kind: 'unbound' }
              | { readonly kind: 'assistant' }
              | { readonly kind: 'workspace'; readonly workspaceId: string };
          }
        | {
            readonly kind: 'asset-center' | 'extensions' | 'project-management' | 'settings';
          };
    };
    readonly workbench: {
      readonly main: {
        readonly views: readonly ResourceBrowserWorkbenchView[];
      };
    };
  };
}

export interface ResourceBrowserWorkbenchView {
  readonly viewId: string;
  readonly viewEpoch: number;
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
  readonly localMetadataRepositories?: LocalMetadataRepositories;
  readonly shell: ResourceBrowserShellPort;
  readonly host: Pick<NekoHostPorts, 'files' | 'external'>;
  readonly openPreview: ResourceBrowserNodeSourceOptions['openPreview'];
  readonly openCut: ResourceBrowserNodeSourceOptions['openCut'];
  readonly selectSource: (windowId: string) => Promise<string | undefined>;
  readonly selectConfiguredGlobalMediaLibrary: ResourceBrowserNodeSourceOptions['selectGlobalLibrary'];
  readonly selectGlobalMediaLibrarySource: (windowId: string) => Promise<string | undefined>;
  readonly selectGlobalAssetSources: (windowId: string) => Promise<readonly string[] | undefined>;
  readonly trashGlobalAsset: (absolutePath: string) => Promise<void>;
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
        readonly viewEpoch: number;
        readonly documentId: string;
        readonly sessionId: string;
        readonly expectedRevision: number;
      };
    }): Promise<void>;
  };
}

export class ResourceBrowserNodeRuntime {
  private readonly controllers = new Map<string, ResourceBrowserController>();
  private readonly homeItemsByWindow = new Map<string, Map<string, GlobalLibraryItem>>();
  private readonly homeThumbnailControllers = new Map<string, Set<AbortController>>();
  private homeCatalogRevision = 0;
  private globalAssetMutationActive = false;
  private globalMediaLibraryMutationActive = false;
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
    const absolutePath = await resolveResourceBrowserItemPath(workspace, item);
    const opened = await this.options.openQuickPreview({
      identity: request.identity,
      item,
      absolutePath,
    });
    return {
      schemaVersion: request.schemaVersion,
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
      schemaVersion: request.schemaVersion,
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
          schemaVersion: request.schemaVersion,
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
        schemaVersion: request.schemaVersion,
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
      schemaVersion: request.schemaVersion,
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
    const current = await controller.getSnapshot();
    if (current.revision !== request.expectedRevision) {
      throw new Error('Desktop Resource Browser recovery projection is stale.');
    }
    const workspace = await this.options.shell.resolveProjectWorkspace(request.identity.projectId);
    if (workspace.workspaceId !== request.identity.workspaceId) {
      throw new Error('Desktop Resource Browser recovery Workspace is stale.');
    }
    await this.withGlobalMediaLibraryMutation(() =>
      this.workspaceMediaLibrarySync.applyRecovery({
        workspace,
        planId: request.planId,
        expectedOperationRevision: request.expectedOperationRevision,
      }),
    );
    this.advanceHomeRevision();
    return controller.execute({
      schemaVersion: request.schemaVersion,
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
      schemaVersion: request.schemaVersion,
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
    readonly endpointEpoch: string;
    readonly query: string;
    readonly sortBy: GlobalLibraryCatalogSort;
    readonly sortDirection: GlobalLibrarySortDirection;
    readonly limit: number;
  }): Promise<GlobalAssetProjection> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    const items = await searchGlobalAssetCatalog({
      globalAssetRoot: this.options.globalAssetRoot,
      files: this.options.host.files,
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
    this.recordHomeItems(input.windowId, 'global-asset-library', items);
    return { revision: this.homeCatalogRevision, items };
  }

  async searchHomeMediaLibraries(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly query: string;
    readonly sortBy: GlobalLibraryCatalogSort;
    readonly sortDirection: GlobalLibrarySortDirection;
    readonly limit: number;
  }): Promise<GlobalMediaLibraryProjection> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    const items = await searchGlobalMediaLibraries({
      mediaLibraryRoot: this.options.globalMediaLibraryRoot,
      files: this.options.host.files,
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
    this.recordHomeItems(input.windowId, 'media-library', items);
    return { revision: this.homeCatalogRevision, items };
  }

  async readHomeMediaLibraryChildren(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly libraryId: string;
    readonly relativePath: string;
    readonly sortBy: GlobalLibraryCatalogSort;
    readonly sortDirection: GlobalLibrarySortDirection;
    readonly limit: number;
  }): Promise<GlobalMediaLibraryProjection> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
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
    return { revision: this.homeCatalogRevision, items };
  }

  async addHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly locationKind: GlobalMediaLibraryLocationKind;
    readonly expectedRevision: number;
  }): Promise<
    | { readonly status: 'added'; readonly libraryId: string; readonly revision: number }
    | { readonly status: 'cancelled'; readonly revision: number }
  > {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.expectedRevision);
    return this.withGlobalMediaLibraryMutation(async () => {
      const sourceDirectory = await this.options.selectGlobalMediaLibrarySource(input.windowId);
      if (!sourceDirectory) {
        return { status: 'cancelled', revision: this.homeCatalogRevision };
      }
      const connection = await createGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        sourceDirectory,
        locationKind: input.locationKind,
      });
      return {
        status: 'added',
        libraryId: connection.libraryId,
        revision: this.advanceHomeRevision(),
      };
    });
  }

  async relinkHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly libraryId: string;
    readonly expectedRevision: number;
  }): Promise<
    | { readonly status: 'relinked'; readonly libraryId: string; readonly revision: number }
    | { readonly status: 'cancelled'; readonly revision: number }
  > {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.expectedRevision);
    return this.withGlobalMediaLibraryMutation(async () => {
      const sourceDirectory = await this.options.selectGlobalMediaLibrarySource(input.windowId);
      if (!sourceDirectory) {
        return { status: 'cancelled', revision: this.homeCatalogRevision };
      }
      await replaceGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: input.libraryId,
        sourceDirectory,
      });
      return {
        status: 'relinked',
        libraryId: input.libraryId,
        revision: this.advanceHomeRevision(),
      };
    });
  }

  async removeHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly libraryId: string;
    readonly expectedRevision: number;
  }): Promise<number> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.expectedRevision);
    return this.withGlobalMediaLibraryMutation(async () => {
      await removeGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: input.libraryId,
      });
      return this.advanceHomeRevision();
    });
  }

  async revealHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly libraryId: string;
    readonly expectedRevision: number;
  }): Promise<number> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.expectedRevision);
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
    return this.homeCatalogRevision;
  }

  async importHomeAssets(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly expectedRevision: number;
  }): Promise<GlobalAssetImportResult> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.expectedRevision);
    return this.withGlobalAssetMutation(async () => {
      const sources = await this.options.selectGlobalAssetSources(input.windowId);
      if (!sources) return { status: 'cancelled', revision: this.homeCatalogRevision };
      const outcomes = await importGlobalAssetFiles({
        globalAssetRoot: this.options.globalAssetRoot,
        sourcePaths: sources,
      });
      const changed = outcomes.some((outcome) => outcome.status === 'added');
      return {
        status: 'completed',
        revision: changed ? this.advanceHomeRevision() : this.homeCatalogRevision,
        outcomes,
      };
    });
  }

  async removeHomeAsset(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly assetId: string;
    readonly expectedRevision: number;
  }): Promise<GlobalAssetRemoveResult> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.expectedRevision);
    return this.withGlobalAssetMutation(async () => {
      const item = this.requireHomeItem(input.windowId, input.assetId, 'global-asset-library');
      if (item.owner !== 'global-asset-library') {
        throw new Error('Desktop global Asset identity has the wrong owner.');
      }
      const assetPath = await resolveGlobalAssetItemPath({
        globalAssetRoot: this.options.globalAssetRoot,
        files: this.options.host.files,
        itemId: item.id,
      });
      await removeGlobalAssetFile({
        globalAssetRoot: this.options.globalAssetRoot,
        assetPath,
        trash: this.options.trashGlobalAsset,
      });
      return {
        status: 'removed',
        assetId: item.id,
        revision: this.advanceHomeRevision(),
      };
    });
  }

  async resolveHomeLibraryThumbnail(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly request: GlobalLibraryThumbnailRequest;
  }): Promise<GlobalLibraryThumbnailResult> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.request.expectedCatalogRevision);
    const item = this.requireHomeItem(input.windowId, input.request.itemId, input.request.owner);
    const descriptor = item.thumbnail;
    if (
      !descriptor ||
      descriptor.descriptorId !== input.request.descriptorId ||
      descriptor.revision !== input.request.thumbnailRevision
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
    readonly endpointEpoch: string;
    readonly owner: GlobalLibraryItem['owner'];
    readonly itemId: string;
    readonly expectedCatalogRevision: number;
  }): Promise<{
    readonly item: GlobalLibraryItem;
    readonly contentLocator: ContentLocator;
    readonly absolutePath: string;
  }> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    this.requireHomeRevision(input.expectedCatalogRevision);
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

  private async requireHomeEndpoint(windowId: string, endpointEpoch: string): Promise<void> {
    this.requireActive();
    const projection = await this.options.shell.getProjection(windowId);
    if (projection.endpointEpoch !== endpointEpoch) {
      throw new Error('Desktop Home asset endpoint identity is stale.');
    }
  }

  private async withGlobalMediaLibraryMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.globalMediaLibraryMutationActive) {
      throw new Error('Desktop global media-library mutation is already in progress.');
    }
    this.globalMediaLibraryMutationActive = true;
    try {
      return await operation();
    } finally {
      this.globalMediaLibraryMutationActive = false;
    }
  }

  private async withGlobalAssetMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.globalAssetMutationActive) {
      throw new Error('Desktop global Asset mutation is already in progress.');
    }
    this.globalAssetMutationActive = true;
    try {
      return await operation();
    } finally {
      this.globalAssetMutationActive = false;
    }
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

  private requireHomeRevision(expectedRevision: number): void {
    if (expectedRevision !== this.homeCatalogRevision) {
      throw new Error(
        `Desktop global Library expected revision ${expectedRevision} but current revision is ${this.homeCatalogRevision}.`,
      );
    }
  }

  private advanceHomeRevision(): number {
    this.homeCatalogRevision += 1;
    return this.homeCatalogRevision;
  }

  private async resolveHomeItemPath(
    item: GlobalAssetItem | GlobalMediaLibraryItem,
  ): Promise<string> {
    if (item.owner === 'global-asset-library') {
      return this.requireContainedRealFile(
        await resolveGlobalAssetItemPath({
          globalAssetRoot: this.options.globalAssetRoot,
          files: this.options.host.files,
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
    if (identity.windowId !== windowId || identity.endpointEpoch !== projection.endpointEpoch) {
      throw new Error('Desktop Resource Browser owner identity is stale.');
    }
    const sceneContext = projection.window.scene.context;
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
      viewEpoch: tab.viewEpoch,
      endpointEpoch: projection.endpointEpoch,
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
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
      workspaceMediaLibrarySync: this.workspaceMediaLibrarySync,
      workspace,
      host: this.options.host,
      openPreview: this.options.openPreview,
      openCut: this.options.openCut,
      selectSource: this.options.selectSource,
      selectGlobalLibrary: this.options.selectConfiguredGlobalMediaLibrary,
      mutateGlobalMediaLibraries: (operation) => this.withGlobalMediaLibraryMutation(operation),
      didMutateGlobalMediaLibraries: () => {
        this.advanceHomeRevision();
      },
      createThumbnail: this.options.createThumbnail,
      addToCanvas,
      addToCut,
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
    if (projection.revision !== request.expectedRevision) {
      throw new Error('Desktop Resource Browser recovery projection is stale.');
    }
    const item = projection.items.find((candidate) => candidate.resourceId === request.resourceId);
    if (
      !item ||
      item.role !== 'library-root' ||
      !item.libraryName ||
      !item.libraryStatus ||
      item.libraryStatus.operationRevision !== request.expectedOperationRevision
    ) {
      throw new Error('Desktop Resource Browser recovery item is stale or not recoverable.');
    }
    const workspace = await this.options.shell.resolveProjectWorkspace(request.identity.projectId);
    if (workspace.workspaceId !== request.identity.workspaceId) {
      throw new Error('Desktop Resource Browser recovery Workspace is stale.');
    }
    return { workspace, libraryName: item.libraryName };
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new Error('Desktop Resource Browser runtime is disposed.');
    }
  }
}

export function createResourceToCanvasInteraction(options: {
  readonly shell: {
    getProjection(windowId: string): Promise<{
      readonly window: {
        readonly workbench: {
          readonly main: { readonly views: readonly ResourceBrowserWorkbenchView[] };
        };
      };
    }>;
  };
  readonly canvas: ResourceBrowserNodeRuntimeOptions['canvas'];
  readonly windowId: string;
}): NonNullable<ResourceBrowserNodeSourceOptions['addToCanvas']> {
  return async ({ identity: resourceIdentity, item, target }) => {
    const currentProjection = await options.shell.getProjection(options.windowId);
    const canvasView = currentProjection.window.workbench.main.views.find(
      (candidate) =>
        candidate.kind === 'canvas' &&
        candidate.projectId === resourceIdentity.projectId &&
        candidate.workspaceId === resourceIdentity.workspaceId &&
        candidate.documentId === target.documentId &&
        createCanvasHostSessionId(candidate.viewId, candidate.viewEpoch) === target.sessionId,
    );
    if (!canvasView) {
      throw new Error('Resource Browser target Canvas is stale or not attached.');
    }
    const canvasIdentity: CanvasHostRuntimeIdentity = {
      projectId: resourceIdentity.projectId,
      workspaceId: resourceIdentity.workspaceId,
      windowId: resourceIdentity.windowId,
      viewId: canvasView.viewId,
      viewEpoch: canvasView.viewEpoch,
      documentId: target.documentId,
      sessionId: target.sessionId,
      endpointEpoch: resourceIdentity.endpointEpoch,
    };
    const locator = item.facet === 'materials' ? item.representationLocator : item.locator;
    if (!locator) {
      throw new Error('Resource Browser item has no Canvas representation.');
    }
    if (locator.kind === 'generated-output') {
      throw new Error(
        'Generated Resource Browser results require the Generation-owned commit path.',
      );
    }
    const commandIdentity = [
      'resource-browser',
      resourceIdentity.viewId,
      item.resourceId,
      target.sessionId,
      String(target.expectedRevision),
    ].join(':');
    const result = await options.canvas.executeIntent(
      options.windowId,
      createCanvasHostIntentRequest({
        requestId: commandIdentity,
        commandId: commandIdentity,
        expectedRevision: target.expectedRevision,
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
            ...(item.facet === 'materials'
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
  item: Extract<ResourceBrowserItem, { readonly facet: 'materials' }>,
): string {
  if (!item.representationBindingId) {
    throw new Error('Resource Browser Entity has no active representation binding identity.');
  }
  return item.representationBindingId;
}

function requireEntityRepresentationRole(
  item: Extract<ResourceBrowserItem, { readonly facet: 'materials' }>,
) {
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
    String(identity.viewEpoch),
    identity.endpointEpoch,
  ].join(':');
}
