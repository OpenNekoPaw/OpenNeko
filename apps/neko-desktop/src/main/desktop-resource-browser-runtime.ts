import * as path from 'node:path';
import type { NekoHostPorts } from '@neko/host/ports';
import {
  createCanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostRuntimeIdentity,
} from '@neko-canvas/domain';
import type { CanvasMaterialMediaKind } from '@neko/shared';
import {
  assertResourceBrowserIdentity,
  parseResourceBrowserChildrenRequest,
  parseResourceBrowserIntentRequest,
  parseResourceBrowserQuickPreviewReleaseRequest,
  parseResourceBrowserQuickPreviewRequest,
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
  type ResourceBrowserSearchRequest,
  type ResourceBrowserSnapshotRequest,
  type ResourceBrowserThumbnailRequest,
  type ResourceBrowserThumbnailResult,
} from 'neko-assets/resource-browser/contract';
import { ResourceBrowserController } from 'neko-assets/resource-browser/controller';
import type { DesktopShellService } from './shell-service';
import {
  createDesktopGlobalMediaLibraryConnection,
  removeDesktopGlobalMediaLibraryConnection,
  resolveDesktopGlobalMediaLibraryTarget,
} from './desktop-global-media-library-files';
import {
  createDesktopResourceBrowserProjectionSource,
  readDesktopGlobalMediaLibraryChildren,
  resolveDesktopResourceBrowserItemPath,
  searchDesktopGlobalAssetCatalog,
  searchDesktopGlobalMediaLibraries,
  type DesktopResourceBrowserSourceOptions,
} from './desktop-resource-browser-source';
import { resourceBrowserViewId } from '../shared/resource-browser-bridge-contract';
import { createDesktopCanvasSessionId } from '../shared/canvas-bridge-contract';
import type { DesktopWorkbenchViewRef } from '../shared/workbench-contract';
import type {
  DesktopHomeAssetItem,
  DesktopHomeCatalogSort,
  DesktopHomeMediaLibraryItem,
  DesktopHomeMediaLibraryLocationKind,
  DesktopHomeSortDirection,
} from '../shared/home-management-contract';

export interface DesktopResourceBrowserRuntimeOptions {
  readonly globalAssetRoot: string;
  readonly globalMediaLibraryRoot: string;
  readonly shell: DesktopShellService;
  readonly host: Pick<NekoHostPorts, 'files' | 'external'>;
  readonly openPreview: DesktopResourceBrowserSourceOptions['openPreview'];
  readonly openCut: DesktopResourceBrowserSourceOptions['openCut'];
  readonly selectSource: (windowId: string) => Promise<string | undefined>;
  readonly selectGlobalMediaLibrarySource: (windowId: string) => Promise<string | undefined>;
  readonly createThumbnail: (absolutePath: string) => Promise<string>;
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

export class DesktopResourceBrowserRuntime {
  private readonly controllers = new Map<string, ResourceBrowserController>();
  private globalMediaLibraryMutationActive = false;
  private disposed = false;

  constructor(private readonly options: DesktopResourceBrowserRuntimeOptions) {}

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
    const absolutePath = await resolveDesktopResourceBrowserItemPath(workspace, item);
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
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit: number;
  }): Promise<readonly DesktopHomeAssetItem[]> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    return searchDesktopGlobalAssetCatalog({
      globalAssetRoot: this.options.globalAssetRoot,
      files: this.options.host.files,
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
  }

  async searchHomeMediaLibraries(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly query: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit: number;
  }): Promise<readonly DesktopHomeMediaLibraryItem[]> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    return searchDesktopGlobalMediaLibraries({
      mediaLibraryRoot: this.options.globalMediaLibraryRoot,
      files: this.options.host.files,
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
  }

  async readHomeMediaLibraryChildren(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly libraryId: string;
    readonly relativePath: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit: number;
  }): Promise<readonly DesktopHomeMediaLibraryItem[]> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    return readDesktopGlobalMediaLibraryChildren({
      mediaLibraryRoot: this.options.globalMediaLibraryRoot,
      files: this.options.host.files,
      libraryId: input.libraryId,
      relativePath: input.relativePath,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
  }

  async addHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly locationKind: DesktopHomeMediaLibraryLocationKind;
  }): Promise<
    { readonly status: 'added'; readonly libraryId: string } | { readonly status: 'cancelled' }
  > {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    return this.withGlobalMediaLibraryMutation(async () => {
      const sourceDirectory = await this.options.selectGlobalMediaLibrarySource(input.windowId);
      if (!sourceDirectory) return { status: 'cancelled' };
      const connection = await createDesktopGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        sourceDirectory,
        locationKind: input.locationKind,
      });
      return { status: 'added', libraryId: connection.libraryId };
    });
  }

  async removeHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly libraryId: string;
  }): Promise<void> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    await this.withGlobalMediaLibraryMutation(async () => {
      await removeDesktopGlobalMediaLibraryConnection({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: input.libraryId,
      });
    });
  }

  async revealHomeMediaLibrary(input: {
    readonly windowId: string;
    readonly endpointEpoch: string;
    readonly libraryId: string;
  }): Promise<void> {
    await this.requireHomeEndpoint(input.windowId, input.endpointEpoch);
    const revealPath = this.options.host.external?.revealPath;
    if (!revealPath) {
      throw new Error('Desktop global media-library reveal capability is unavailable.');
    }
    await revealPath(
      await resolveDesktopGlobalMediaLibraryTarget({
        mediaLibraryRoot: this.options.globalMediaLibraryRoot,
        libraryId: input.libraryId,
      }),
    );
  }

  detachWindow(windowId: string): void {
    for (const [key, controller] of this.controllers) {
      if (controller.identity.windowId !== windowId) continue;
      controller.dispose();
      this.controllers.delete(key);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.dispose();
    this.controllers.clear();
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
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === identity.projectId,
    );
    const tab = projection.window.tabs.find(
      (candidate) => candidate.projectId === identity.projectId,
    );
    if (!project || !tab || project.workspaceId !== identity.workspaceId) {
      throw new Error('Desktop Resource Browser Project is not attached to this Window.');
    }
    const expected: ResourceBrowserIdentity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId,
      viewId: resourceBrowserViewId(tab.viewId),
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
    const addToCanvas = createDesktopResourceToCanvasInteraction({
      shell: this.options.shell,
      canvas: this.options.canvas,
      windowId,
    });
    const addToCut: DesktopResourceBrowserSourceOptions['addToCut'] = async ({
      identity: resourceIdentity,
      item,
      target,
    }) => {
      await this.options.cut.addResource({ resourceIdentity, item, target });
    };
    const composition = createDesktopResourceBrowserProjectionSource({
      workspace,
      host: this.options.host,
      openPreview: this.options.openPreview,
      openCut: this.options.openCut,
      selectSource: this.options.selectSource,
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

  private requireActive(): void {
    if (this.disposed) {
      throw new Error('Desktop Resource Browser runtime is disposed.');
    }
  }
}

export function createDesktopResourceToCanvasInteraction(options: {
  readonly shell: {
    getProjection(windowId: string): Promise<{
      readonly window: {
        readonly workbench: {
          readonly main: { readonly views: readonly DesktopWorkbenchViewRef[] };
        };
      };
    }>;
  };
  readonly canvas: DesktopResourceBrowserRuntimeOptions['canvas'];
  readonly windowId: string;
}): NonNullable<DesktopResourceBrowserSourceOptions['addToCanvas']> {
  return async ({ identity: resourceIdentity, item, target }) => {
    const currentProjection = await options.shell.getProjection(options.windowId);
    const canvasView = currentProjection.window.workbench.main.views.find(
      (candidate) =>
        candidate.kind === 'canvas' &&
        candidate.projectId === resourceIdentity.projectId &&
        candidate.workspaceId === resourceIdentity.workspaceId &&
        candidate.documentId === target.documentId &&
        createDesktopCanvasSessionId(candidate.viewId, candidate.viewEpoch) === target.sessionId,
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
    const locator = item.facet === 'entities' ? item.representationLocator : item.locator;
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
            ...(item.facet === 'entities'
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
  if (!item.representationBindingId) {
    throw new Error('Resource Browser Entity has no active representation binding identity.');
  }
  return item.representationBindingId;
}

function requireEntityRepresentationRole(
  item: Extract<ResourceBrowserItem, { readonly facet: 'entities' }>,
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
