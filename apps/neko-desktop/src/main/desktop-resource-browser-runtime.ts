import type { NekoHostPorts } from '@neko/host/ports';
import {
  createCanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostRuntimeIdentity,
} from '@neko-canvas/domain';
import {
  assertResourceBrowserIdentity,
  parseResourceBrowserChildrenRequest,
  parseResourceBrowserIntentRequest,
  parseResourceBrowserSearchRequest,
  parseResourceBrowserSnapshotRequest,
  parseResourceBrowserThumbnailRequest,
  type ResourceBrowserIdentity,
  type ResourceBrowserChildrenRequest,
  type ResourceBrowserItem,
  type ResourceBrowserIntentRequest,
  type ResourceBrowserProjection,
  type ResourceBrowserProjectionEvent,
  type ResourceBrowserSearchRequest,
  type ResourceBrowserSnapshotRequest,
  type ResourceBrowserThumbnailRequest,
  type ResourceBrowserThumbnailResult,
} from 'neko-assets/resource-browser/contract';
import { ResourceBrowserController } from 'neko-assets/resource-browser/controller';
import type { DesktopShellService } from './shell-service';
import {
  createDesktopResourceBrowserReadSource,
  createDesktopResourceBrowserProjectionSource,
  searchDesktopGlobalAssetCatalog,
  type DesktopResourceBrowserSourceOptions,
} from './desktop-resource-browser-source';
import { resourceBrowserViewId } from '../shared/resource-browser-bridge-contract';
import { createDesktopCanvasSessionId } from '../shared/canvas-bridge-contract';
import type { DesktopWorkbenchViewRef } from '../shared/workbench-contract';
import type {
  DesktopHomeAssetFacet,
  DesktopHomeAssetItem,
  DesktopHomeAssetSort,
  DesktopHomeSortDirection,
} from '../shared/home-management-contract';

export interface DesktopResourceBrowserRuntimeOptions {
  readonly globalAssetRoot: string;
  readonly shell: DesktopShellService;
  readonly host: Pick<NekoHostPorts, 'files' | 'external'>;
  readonly openPreview: DesktopResourceBrowserSourceOptions['openPreview'];
  readonly openCut: DesktopResourceBrowserSourceOptions['openCut'];
  readonly selectSource: (windowId: string) => Promise<string | undefined>;
  readonly createThumbnail: (absolutePath: string) => Promise<string>;
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
    readonly facet: DesktopHomeAssetFacet;
    readonly query: string;
    readonly sortBy: DesktopHomeAssetSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit: number;
  }): Promise<readonly DesktopHomeAssetItem[]> {
    this.requireActive();
    const projection = await this.options.shell.getProjection(input.windowId);
    if (projection.endpointEpoch !== input.endpointEpoch) {
      throw new Error('Desktop Home asset query endpoint identity is stale.');
    }
    return searchDesktopGlobalAssetCatalog({
      globalAssetRoot: this.options.globalAssetRoot,
      files: this.options.host.files,
      facet: input.facet,
      query: input.query,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      limit: input.limit,
    });
  }

  detachWindow(windowId: string): void {
    for (const [key, controller] of this.controllers) {
      if (controller.identity.windowId !== windowId) continue;
      controller.dispose();
      this.controllers.delete(key);
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
        intent: { type: 'project-content', locator },
      }),
    );
    if (result.status === 'rejected') {
      throw new Error(result.diagnostic.message);
    }
  };
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
