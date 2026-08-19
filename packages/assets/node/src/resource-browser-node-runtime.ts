import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { lstat, realpath, stat } from 'node:fs/promises';
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
import { type AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  createGlobalMediaLibraryConnection,
  listGlobalMediaLibraryConnections,
  removeGlobalMediaLibraryConnection,
  replaceGlobalMediaLibraryConnection,
  resolveGlobalMediaLibraryTarget,
} from './global-media-library-files';
import { WorkspaceDirectoryObserver } from './workspace-directory-observer';
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
  createWorkspaceLinkedMediaLibrary,
  replaceWorkspaceLinkedMediaLibrary,
} from './workspace-linked-media-libraries';
import { readProjectContentReferences } from './project-content-reference-readers';
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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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
  readonly shell: ResourceBrowserShellPort;
  readonly host: Pick<NekoHostPorts, 'files' | 'external' | 'diagnostics'>;
  readonly openPreview: ResourceBrowserNodeSourceOptions['openPreview'];
  readonly openCreativeDocument: ResourceBrowserNodeSourceOptions['openCreativeDocument'];
  readonly openTextEditor: ResourceBrowserNodeSourceOptions['openTextEditor'];
  readonly selectSource: (windowId: string) => Promise<string | undefined>;
  readonly selectWorkspaceFiles: (windowId: string) => Promise<readonly string[] | undefined>;
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
}

export class ResourceBrowserNodeRuntime {
  private readonly controllers = new Map<string, ResourceBrowserController>();
  private readonly workspaceObservers = new Map<string, WorkspaceDirectoryObserver>();
  private readonly workspaceObservationKeys = new Set<string>();
  private readonly homeItemsByWindow = new Map<string, Map<string, GlobalLibraryItem>>();
  private readonly homeThumbnailControllers = new Map<string, Set<AbortController>>();
  private globalAssetMutationTail: Promise<void> = Promise.resolve();
  private globalMediaLibraryMutationTail: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly mediaRecoveryPlans = new Map<
    string,
    {
      readonly identity: ResourceBrowserIdentity;
      readonly resourceId: string;
      readonly operationFingerprint: string;
      readonly plan: {
        readonly libraryName: string;
        readonly requirementFingerprint: string;
        readonly validatedRelativePaths: readonly string[];
        readonly targetDirectory: string;
      };
    }
  >();

  constructor(private readonly options: ResourceBrowserNodeRuntimeOptions) {}

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

  async query(
    windowId: string,
    value: ResourceBrowserSearchRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    const request = parseResourceBrowserSearchRequest(value);
    return (await this.resolveController(windowId, request.identity)).query(request);
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
      projectId: request.identity.projectId,
      globalAssetRoot: this.options.globalAssetRoot,
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
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
    let targetDirectory: string;
    let locationKind: GlobalMediaLibraryLocationKind;
    let connectionName: string;
    if (request.candidate === 'select-directory') {
      const selectedDirectory = await this.options.selectSource(windowId);
      if (!selectedDirectory) {
        return {
          requestId: request.requestId,
          identity: request.identity,
          resourceId: request.resourceId,
          status: 'cancelled',
        };
      }
      connectionName = path.basename(selectedDirectory);
      if (connectionName !== context.libraryName) {
        throw new Error('Selected Media Library directory must exactly match the logical name.');
      }
      locationKind = 'local';
      targetDirectory = selectedDirectory;
    } else {
      const candidates = (
        await listGlobalMediaLibraryConnections(this.options.globalMediaLibraryRoot)
      ).filter(
        (connection) =>
          connection.name === context.libraryName && connection.availability === 'available',
      );
      if (candidates.length === 0) {
        return {
          requestId: request.requestId,
          identity: request.identity,
          resourceId: request.resourceId,
          status: 'cancelled',
        };
      }
      if (candidates.length !== 1) {
        throw new Error('Reconnect found multiple exact-name available external sources.');
      }
      const candidate = candidates[0];
      if (!candidate) throw new Error('Recovery candidate is unavailable.');
      connectionName = candidate.name;
      locationKind = candidate.locationKind;
      targetDirectory = await resolveGlobalMediaLibraryTarget({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: candidate.libraryId,
      });
    }
    const references = await readProjectContentReferences({
      workspacePath: context.workspace.workspacePath,
      projectId: request.identity.projectId,
    });
    const requirement = references.requirements.requirements.find(
      (candidate) => candidate.libraryName === context.libraryName,
    );
    const relativePaths = requirement?.descendants ?? [];
    await validateRecoveryTarget(targetDirectory, relativePaths);
    const plan = {
      libraryName: context.libraryName,
      requirementFingerprint: references.requirements.fingerprint,
      validatedRelativePaths: relativePaths,
      targetDirectory,
    };
    const planId = `media-library-recovery:${randomUUID()}`;
    this.mediaRecoveryPlans.set(planId, {
      identity: request.identity,
      resourceId: request.resourceId,
      operationFingerprint: request.expectedOperationFingerprint,
      plan,
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      status: 'planned',
      plan: {
        planId,
        workspaceId: request.identity.workspaceId,
        libraryName: context.libraryName,
        requirementFingerprint: plan.requirementFingerprint,
        operationFingerprint: request.expectedOperationFingerprint,
        candidate: {
          kind: 'global-alias',
          name: connectionName,
          locationKind,
        },
        referencedCount: plan.validatedRelativePaths.length,
        validatedCount: plan.validatedRelativePaths.length,
      },
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
    const pending = this.mediaRecoveryPlans.get(request.planId);
    if (
      !pending ||
      resourceBrowserIdentityKey(pending.identity) !==
        resourceBrowserIdentityKey(request.identity) ||
      pending.operationFingerprint !== request.expectedOperationFingerprint
    ) {
      throw new Error('Desktop Resource Browser recovery plan is stale.');
    }
    await this.assertRecoveryProjectionCurrent(controller, pending);
    try {
      await applyWorkspaceMediaLibraryLink({
        workspaceRoot: workspace.workspacePath,
        libraryName: pending.plan.libraryName,
        targetDirectory: pending.plan.targetDirectory,
      });
    } finally {
      this.mediaRecoveryPlans.delete(request.planId);
    }
    return controller.reconcile();
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
    const pending = this.mediaRecoveryPlans.get(request.planId);
    if (
      !pending ||
      resourceBrowserIdentityKey(pending.identity) !== resourceBrowserIdentityKey(request.identity)
    ) {
      throw new Error('Desktop Resource Browser recovery plan is stale.');
    }
    this.mediaRecoveryPlans.delete(request.planId);
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
    const controller = await this.resolveController(windowId, request.identity);
    const projection = await controller.execute(request);
    if (
      request.route === RESOURCE_BROWSER_ROUTES.reconcile &&
      this.workspaceObservationKeys.has(resourceBrowserControllerKey(controller.identity))
    ) {
      const workspace = await this.options.shell.resolveAgentWorkspace(
        request.identity.workspaceId,
      );
      this.startWorkspaceObserver(controller, workspace.workspacePath);
    }
    return projection;
  }

  async subscribe(
    windowId: string,
    identity: ResourceBrowserIdentity,
    listener: (event: ResourceBrowserProjectionEvent) => void,
  ): Promise<() => void> {
    const controller = await this.resolveController(windowId, identity);
    const key = resourceBrowserControllerKey(controller.identity);
    const workspace = await this.options.shell.resolveAgentWorkspace(identity.workspaceId);
    this.workspaceObservationKeys.add(key);
    this.startWorkspaceObserver(controller, workspace.workspacePath);
    const unsubscribe = controller.subscribe(listener);
    return () => {
      unsubscribe();
      this.workspaceObservationKeys.delete(key);
      this.workspaceObservers.get(key)?.dispose();
      this.workspaceObservers.delete(key);
    };
  }

  async reconcileWindow(windowId: string): Promise<void> {
    this.requireActive();
    const controllers = [...this.controllers.entries()].filter(
      ([key, controller]) =>
        controller.identity.windowId === windowId && this.workspaceObservationKeys.has(key),
    );
    await Promise.all(
      controllers.map(async ([, controller]) => {
        try {
          await controller.reconcile();
          const workspace = await this.options.shell.resolveAgentWorkspace(
            controller.identity.workspaceId,
          );
          const key = resourceBrowserControllerKey(controller.identity);
          if (this.workspaceObservationKeys.has(key)) {
            this.startWorkspaceObserver(controller, workspace.workspacePath);
          }
        } catch (error) {
          await controller.reportObservationFailure(
            `Workspace directory focus reconciliation failed: ${asError(error).message}`,
          );
        }
      }),
    );
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
      contentLocator: { file: { authority: 'workspace', path: relativePath } },
      absolutePath,
    };
  }

  detachWindow(windowId: string): void {
    for (const [key, controller] of this.controllers) {
      if (controller.identity.windowId !== windowId) continue;
      this.workspaceObservers.get(key)?.dispose();
      this.workspaceObservers.delete(key);
      this.workspaceObservationKeys.delete(key);
      controller.dispose();
      this.controllers.delete(key);
    }
    this.homeItemsByWindow.delete(windowId);
    for (const [planId, plan] of this.mediaRecoveryPlans) {
      if (plan.identity.windowId === windowId) this.mediaRecoveryPlans.delete(planId);
    }
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

  private startWorkspaceObserver(
    controller: ResourceBrowserController,
    workspacePath: string,
  ): WorkspaceDirectoryObserver | undefined {
    const key = resourceBrowserControllerKey(controller.identity);
    this.workspaceObservers.get(key)?.dispose();
    this.workspaceObservers.delete(key);
    let observer: WorkspaceDirectoryObserver | undefined;
    try {
      observer = new WorkspaceDirectoryObserver({
        root: workspacePath,
        onInvalidated: () => controller.reconcile().then(() => undefined),
        onError: (error) => {
          if (observer && this.workspaceObservers.get(key) === observer) {
            observer.dispose();
            this.workspaceObservers.delete(key);
          }
          this.reportWorkspaceObservationFailure(
            key,
            controller,
            `Workspace directory observation failed: ${error.message}`,
          );
        },
      });
      this.workspaceObservers.set(key, observer);
      return observer;
    } catch (error) {
      const watchError = asError(error);
      this.reportWorkspaceObservationFailure(
        key,
        controller,
        `Workspace directory observation failed: ${watchError.message}`,
      );
      return undefined;
    }
  }

  private reportWorkspaceObservationFailure(
    key: string,
    controller: ResourceBrowserController,
    message: string,
  ): void {
    void controller.reportObservationFailure(message).catch((error: unknown) => {
      if (this.controllers.get(key) !== controller) return;
      this.options.host.diagnostics?.report({
        code: 'resource-browser-observation-diagnostic-failed',
        severity: 'error',
        message: asError(error).message,
        metadata: { key },
      });
    });
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
    for (const observer of this.workspaceObservers.values()) observer.dispose();
    this.workspaceObservers.clear();
    this.workspaceObservationKeys.clear();
    for (const controllers of this.homeThumbnailControllers.values()) {
      for (const controller of controllers) {
        controller.abort(new Error('Desktop Resource Browser runtime was disposed.'));
      }
    }
    this.homeThumbnailControllers.clear();
    this.homeItemsByWindow.clear();
    this.mediaRecoveryPlans.clear();
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
        this.workspaceObservers.get(candidateKey)?.dispose();
        this.workspaceObservers.delete(candidateKey);
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
      projectId: project.projectId,
      globalAssetRoot: this.options.globalAssetRoot,
      ...((this.options.assetLibraryMemberships ?? this.options.localMetadataRepositories)
        ? { assetLibraryMemberships: this.requireAssetLibraryMemberships() }
        : {}),
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
      workspace,
      host: this.options.host,
      openPreview: this.options.openPreview,
      openCreativeDocument: this.options.openCreativeDocument,
      openTextEditor: this.options.openTextEditor,
      selectSource: this.options.selectSource,
      selectWorkspaceFiles: this.options.selectWorkspaceFiles,
      trashWorkspaceItem: this.options.trashWorkspaceItem,
      selectGlobalLibrary: this.options.selectConfiguredGlobalMediaLibrary,
      mutateGlobalMediaLibraries: (operation) => this.withGlobalMediaLibraryMutation(operation),
      createThumbnail: this.options.createThumbnail,
      addToCanvas,
      addToCut,
    });
    const controller = new ResourceBrowserController({
      identity: expected,
      source: composition.source,
      interactions: composition.interactions,
      initialSource: 'files',
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

  private async assertRecoveryProjectionCurrent(
    controller: ResourceBrowserController,
    pending: {
      readonly resourceId: string;
      readonly operationFingerprint: string;
    },
  ): Promise<void> {
    const item = (await controller.getSnapshot()).items.find(
      (candidate) => candidate.resourceId === pending.resourceId,
    );
    if (item?.libraryStatus?.operationFingerprint !== pending.operationFingerprint) {
      throw new Error('Desktop Resource Browser recovery projection changed after planning.');
    }
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
      item.source === 'assets' || item.role === 'library-root' ? undefined : item.locator;
    if (!locator) {
      throw new Error('Resource Browser item has no Canvas representation.');
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
          },
        },
      }),
    );
    if (result.status === 'rejected') {
      throw new Error(result.diagnostic.message);
    }
  };
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

function resourceBrowserIdentityKey(identity: ResourceBrowserIdentity): string {
  return [
    identity.projectId,
    identity.workspaceId,
    identity.windowId,
    identity.viewId,
    String(identity.viewInstanceId),
    identity.rendererSessionId,
  ].join(':');
}

async function validateRecoveryTarget(
  targetDirectory: string,
  relativePaths: readonly string[],
): Promise<void> {
  const root = await realpath(targetDirectory);
  if (!(await stat(root)).isDirectory()) {
    throw new Error('Selected Media Library target is not a directory.');
  }
  for (const relativePath of relativePaths) {
    const candidate = await realpath(path.join(root, ...relativePath.split('/')));
    if (!isPathInside(candidate, root) || !(await stat(candidate)).isFile()) {
      throw new Error('Selected Media Library is missing required project content.');
    }
  }
}

async function applyWorkspaceMediaLibraryLink(input: {
  readonly workspaceRoot: string;
  readonly libraryName: string;
  readonly targetDirectory: string;
}): Promise<void> {
  const linkPath = path.join(input.workspaceRoot, 'neko', 'assets', input.libraryName);
  let exists = false;
  try {
    await lstat(linkPath);
    exists = true;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const operation = exists ? replaceWorkspaceLinkedMediaLibrary : createWorkspaceLinkedMediaLibrary;
  await operation({
    workspaceRoot: input.workspaceRoot,
    name: input.libraryName,
    targetDirectory: input.targetDirectory,
  });
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
  );
}
