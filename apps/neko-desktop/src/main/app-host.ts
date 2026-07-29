import { randomUUID } from 'node:crypto';
import {
  NEKO_APPLICATION_CONTRACT_VERSION,
  type NekoApplicationIdentity,
} from '@neko/host/application';
import type { NekoHostPorts } from '@neko/host/ports';
import type { ILogger } from '@neko/shared/logger';
import {
  parseDesktopAgentBootstrapRequest,
  parseDesktopAgentMessageRequest,
  type DesktopAgentBootstrapProjection,
  type DesktopAgentMessageEvent,
  type DesktopAgentMessageResult,
} from '../shared/agent-contract';
import {
  DESKTOP_BRIDGE_CONTRACT_VERSION,
  parseDesktopBootstrapRequest,
  type DesktopBootstrapProjection,
} from '../shared/bridge-contract';
import {
  DESKTOP_SHELL_CONTRACT_VERSION,
  parseDesktopProfileRequest,
  parseDesktopProjectOpenRequest,
  parseDesktopShellRequest,
  parseDesktopTabMutationRequest,
  parseDesktopWorkbenchMutationRequest,
  parseDesktopWindowMutationRequest,
  type DesktopOpenContentResult,
  type DesktopProfileRequestResult,
  type DesktopShellResponse,
} from '../shared/shell-contract';
import { DesktopWindowRegistry, type DesktopSenderIdentity } from './window-registry';
import type { DesktopAgentAppHostComposition } from './desktop-agent-app-host-composition';
import {
  createDesktopAgentBridgeRuntime,
  type DesktopAgentBridgeRuntime,
  type DesktopAgentConnectionGrant,
  type DesktopAgentControllerComposition,
} from './desktop-agent-bridge-runtime';
import type { DesktopShellService } from './shell-service';
import type {
  ResourceBrowserChildrenRequest,
  ResourceBrowserIntentRequest,
  ResourceBrowserProjection,
  ResourceBrowserProjectionEvent,
  ResourceBrowserSearchRequest,
  ResourceBrowserSnapshotRequest,
  ResourceBrowserThumbnailRequest,
  ResourceBrowserThumbnailResult,
} from 'neko-assets/resource-browser/contract';
import type { DesktopResourceBrowserRuntime } from './desktop-resource-browser-runtime';
import type { DesktopPreviewRuntime } from './desktop-preview-runtime';
import type {
  PreviewProjection,
  PreviewRuntimeRequest,
} from '@neko-preview/contracts';
import type {
  CanvasHostIntentResult,
  CanvasHostProjectionEvent,
  CanvasHostRuntimeIdentity,
  CanvasHostSnapshot,
} from '@neko-canvas/domain';
import {
  parseDesktopCanvasHostIdentity,
  type DesktopCanvasPreviewVariantResult,
} from '../shared/canvas-bridge-contract';
import type { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import type {
  CutHostRuntimeProjectionEvent,
  CutHostRuntimeResult,
  CutHostRuntimeSnapshot,
} from '@neko-cut/domain';
import {
  parseDesktopCutHostIdentity,
} from '../shared/cut-bridge-contract';
import type { DesktopCutRuntime } from './desktop-cut-runtime';
import {
  DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
  parseDesktopHomeAssetSearchRequest,
  parseDesktopHomePluginsRequest,
  type DesktopHomeAssetSearchResult,
  type DesktopHomePluginsResult,
} from '../shared/home-management-contract';

export interface DesktopAppHostOptions {
  readonly host: NekoHostPorts;
  readonly version: string;
  readonly logger: ILogger;
  readonly shell: DesktopShellService;
  readonly agent: DesktopAgentAppHostComposition;
  readonly agentControllerComposition?: DesktopAgentControllerComposition;
  readonly resourceBrowser?: DesktopResourceBrowserRuntime;
  readonly preview?: DesktopPreviewRuntime;
  readonly canvas?: DesktopCanvasRuntime;
  readonly cut?: DesktopCutRuntime;
  readonly instanceId?: string;
}

export class DesktopAppHost {
  readonly applicationIdentity: NekoApplicationIdentity;
  readonly windows = new DesktopWindowRegistry();
  readonly shell: DesktopShellService;
  readonly agent: DesktopAgentAppHostComposition;
  readonly agentBridge: DesktopAgentBridgeRuntime;
  readonly resourceBrowser: DesktopResourceBrowserRuntime | undefined;
  readonly preview: DesktopPreviewRuntime | undefined;
  readonly canvas: DesktopCanvasRuntime | undefined;
  readonly cut: DesktopCutRuntime | undefined;
  private readonly resourceSubscriptions = new Map<number, () => void>();
  private readonly canvasSubscriptions = new Map<number, Map<string, () => void>>();
  private readonly cutSubscriptions = new Map<number, Map<string, () => void>>();
  private disposed = false;

  constructor(private readonly options: DesktopAppHostOptions) {
    this.applicationIdentity = {
      schemaVersion: NEKO_APPLICATION_CONTRACT_VERSION,
      applicationId: 'neko-desktop',
      instanceId: options.instanceId ?? randomUUID(),
      version: options.version,
    };
    this.shell = options.shell;
    this.agent = options.agent;
    this.agentBridge = createDesktopAgentBridgeRuntime({
      ...(options.agentControllerComposition
        ? { controllerComposition: options.agentControllerComposition }
        : {}),
    });
    this.resourceBrowser = options.resourceBrowser;
    this.preview = options.preview;
    this.canvas = options.canvas;
    this.cut = options.cut;
    this.shell.setAgentHomeProjectionSource(this.agent);
    this.shell.setAgentCapabilityReady(this.agentBridge.startup.ready);
    this.shell.setResourceBrowserCapabilityReady(this.resourceBrowser !== undefined);
    this.shell.setPreviewCapabilityReady(this.preview !== undefined);
    this.shell.setCanvasCapabilityReady(this.canvas !== undefined);
    this.shell.setCutCapabilityReady(this.cut !== undefined);
  }

  async createBootstrapProjection(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopBootstrapProjection> {
    this.requireActive();
    const request = parseDesktopBootstrapRequest(payload);
    const window = this.windows.resolveSender(sender);
    const host = await this.options.host.environment.getHostIdentity();
    const runtime = await this.options.host.environment.getRuntimeInfo();
    if (host.kind !== 'electron' || host.ui !== 'graphical') {
      throw new Error(
        `Desktop AppHost requires a graphical Electron host; received '${host.kind}/${host.ui}'.`,
      );
    }
    return {
      schemaVersion: DESKTOP_BRIDGE_CONTRACT_VERSION,
      requestId: request.requestId,
      application: this.applicationIdentity,
      window: {
        windowId: window.windowId,
        rendererEpoch: window.rendererEpoch,
      },
      host,
      runtime: {
        platform: runtime.platform,
        ...(runtime.arch ? { arch: runtime.arch } : {}),
        ...(runtime.locale ? { locale: runtime.locale } : {}),
      },
      status: 'foundation-ready',
    };
  }

  reportError(code: string, message: string, error?: unknown): void {
    this.options.host.diagnostics?.report({
      code,
      severity: 'error',
      message,
      metadata: error === undefined ? undefined : { error: describeError(error) },
    });
  }

  async createShellSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopShellRequest(payload);
    const window = this.windows.resolveSender(sender);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: await this.shell.getProjection(window.windowId),
    };
  }

  async createAgentBootstrap(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: DesktopAgentMessageEvent) => void,
  ): Promise<DesktopAgentBootstrapProjection> {
    this.requireActive();
    const request = parseDesktopAgentBootstrapRequest(payload);
    const window = this.windows.resolveSender(sender);
    const view = await this.shell.resolveAgentViewGrant(window.windowId, request);
    const grant: DesktopAgentConnectionGrant = {
      applicationInstanceId: this.applicationIdentity.instanceId,
      windowId: window.windowId,
      projectId: view.projectId,
      workspaceId: view.workspaceId,
      viewId: view.viewId,
      viewEpoch: view.viewEpoch,
      rendererEpoch: window.rendererEpoch,
    };
    let workspace = this.agent.getWorkspace(grant.workspaceId);
    if (!workspace && this.agentBridge.startup.ready) {
      workspace = await this.agent.attachWorkspace(
        await this.shell.resolveAgentWorkspace(grant.workspaceId),
      );
    }
    return this.agentBridge.createBootstrap({
      requestId: request.requestId,
      grant,
      workspace,
      publish,
    });
  }

  async sendAgentMessage(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopAgentMessageResult> {
    this.requireActive();
    const request = parseDesktopAgentMessageRequest(payload);
    const window = this.windows.resolveSender(sender);
    const connection = request.connection;
    const view = await this.shell.resolveAgentViewGrant(window.windowId, connection);
    const grant: DesktopAgentConnectionGrant = {
      applicationInstanceId: this.applicationIdentity.instanceId,
      windowId: window.windowId,
      projectId: view.projectId,
      workspaceId: view.workspaceId,
      viewId: view.viewId,
      viewEpoch: view.viewEpoch,
      rendererEpoch: window.rendererEpoch,
    };
    return this.agentBridge.send(request, grant);
  }

  async openContentProject(
    sender: DesktopSenderIdentity,
    payload: unknown,
    selectWorkspace: () => Promise<string | undefined>,
  ): Promise<DesktopOpenContentResult> {
    this.requireActive();
    const request = parseDesktopWindowMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    await this.shell.assertWindowMutationContext(
      window.windowId,
      request.expectedEndpointEpoch,
      request.expectedWindowRevision,
    );
    const workspacePath = await selectWorkspace();
    if (!workspacePath) {
      return {
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'cancelled',
        projection: await this.shell.getProjection(window.windowId),
      };
    }
    const opened = await this.shell.openContent(
      window.windowId,
      workspacePath,
      request.expectedEndpointEpoch,
      request.expectedWindowRevision,
    );
    await this.agent.attachWorkspace(opened.workspace);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      status: 'opened',
      projection: opened.projection,
    };
  }

  async openCatalogProject(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopOpenContentResult> {
    this.requireActive();
    const request = parseDesktopProjectOpenRequest(payload);
    const window = this.windows.resolveSender(sender);
    const opened = await this.shell.openCatalogProject(
      window.windowId,
      request.projectId,
      request.expectedEndpointEpoch,
      request.expectedWindowRevision,
    );
    await this.agent.attachWorkspace(opened.workspace);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      status: 'opened',
      projection: opened.projection,
    };
  }

  async searchHomeAssets(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomeAssetSearchResult> {
    this.requireActive();
    const request = parseDesktopHomeAssetSearchRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    try {
      const items = await this.requireResourceBrowser().searchHomeProject({
        windowId: window.windowId,
        endpointEpoch: projection.endpointEpoch,
        projectId: request.projectId,
        facet: request.facet,
        query: request.query,
        limit: request.limit,
      });
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        projectId: request.projectId,
        facet: request.facet,
        status: 'ready',
        items,
      };
    } catch (error: unknown) {
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        projectId: request.projectId,
        facet: request.facet,
        status: 'error',
        diagnostic: { message: describeError(error) },
      };
    }
  }

  async listHomePlugins(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomePluginsResult> {
    this.requireActive();
    const request = parseDesktopHomePluginsRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    const workspaceResolution = await this.shell.resolveProjectWorkspace(request.projectId);
    const project = projection.catalog.projects.find(
      (candidate) =>
        candidate.projectId === request.projectId &&
        candidate.workspaceId === workspaceResolution.workspaceId,
    );
    if (!project) {
      throw new Error(`Desktop Home Project '${request.projectId}' is not in this catalog.`);
    }
    const workspace =
      this.agent.getWorkspace(project.workspaceId) ??
      (await this.agent.attachWorkspace(workspaceResolution));
    const skills = await workspace.listSkills(true);
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: request.requestId,
      projectId: project.projectId,
      skills: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: skill.source.kind,
        trusted: skill.trusted,
        enabled: skill.enabled,
      })),
      extensions: projection.domains,
      externalPluginHost: 'unavailable',
    };
  }

  async requestProjectProfile(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopProfileRequestResult> {
    this.requireActive();
    const request = parseDesktopProfileRequest(payload);
    const window = this.windows.resolveSender(sender);
    return this.shell.requestUnavailableProfile(
      window.windowId,
      request.requestId,
      request.profile,
    );
  }

  async activateProjectTab(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    return this.mutateProjectTab(sender, payload, 'activate');
  }

  async activateHome(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopTabMutationRequest(payload);
    if (request.tabId !== 'home') {
      throw new Error("Desktop Home activation requires the fixed 'home' target.");
    }
    const window = this.windows.resolveSender(sender);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: await this.shell.activateHome(
        window.windowId,
        request.expectedEndpointEpoch,
        request.expectedWindowRevision,
      ),
    };
  }

  async closeProjectTab(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    return this.mutateProjectTab(sender, payload, 'close');
  }

  async updateWorkbench(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopWorkbenchMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.updateWorkbench(
      window.windowId,
      request.expectedEndpointEpoch,
      request.expectedWindowRevision,
      request.expectedWorkbenchRevision,
      request.workbench,
    );
    this.preview?.reconcileWorkbench(window.windowId, projection.window.workbench);
    this.cut?.reconcileWorkbench(window.windowId, projection.window.workbench);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection,
    };
  }

  async getResourceBrowserSnapshot(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserSnapshotRequest | unknown,
    publish: (event: ResourceBrowserProjectionEvent) => void,
  ): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const runtime = this.requireResourceBrowser();
    const window = this.windows.resolveSender(sender);
    const projection = await runtime.getSnapshot(window.windowId, payload);
    this.resourceSubscriptions.get(sender.webContentsId)?.();
    this.resourceSubscriptions.set(
      sender.webContentsId,
      await runtime.subscribe(window.windowId, projection.identity, publish),
    );
    return projection;
  }

  async searchResourceBrowser(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserSearchRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().search(window.windowId, payload);
  }

  async readResourceBrowserChildren(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserChildrenRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().children(window.windowId, payload);
  }

  async resolveResourceBrowserThumbnail(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserThumbnailRequest | unknown,
  ): Promise<ResourceBrowserThumbnailResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().resolveThumbnail(window.windowId, payload);
  }

  async executeResourceBrowser(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserIntentRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().execute(window.windowId, payload);
  }

  async getPreviewSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<PreviewProjection> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    if (!this.preview) throw new Error('Desktop Preview runtime is unavailable.');
    return this.preview.getSnapshot(window.windowId, payload);
  }

  async executePreviewRequest(
    sender: DesktopSenderIdentity,
    payload: PreviewRuntimeRequest | unknown,
  ): Promise<PreviewProjection> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    if (!this.preview) throw new Error('Desktop Preview runtime is unavailable.');
    return this.preview.execute(window.windowId, payload);
  }

  async getCanvasSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: CanvasHostProjectionEvent) => void,
  ): Promise<CanvasHostSnapshot> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const identity = parseDesktopCanvasHostIdentity(payload);
    const runtime = this.requireCanvas();
    const snapshot = await runtime.getSnapshot(window.windowId, identity);
    const subscriptions =
      this.canvasSubscriptions.get(sender.webContentsId) ?? new Map<string, () => void>();
    const key = canvasSubscriptionKey(identity);
    if (!subscriptions.has(key)) {
      subscriptions.set(key, await runtime.subscribe(window.windowId, identity, publish));
      this.canvasSubscriptions.set(sender.webContentsId, subscriptions);
    }
    return snapshot;
  }

  async executeCanvasIntent(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CanvasHostIntentResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCanvas().executeIntent(window.windowId, payload);
  }

  async resolveCanvasPreviewVariant(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopCanvasPreviewVariantResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCanvas().resolvePreviewVariant(window.windowId, payload);
  }

  async getCutSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: CutHostRuntimeProjectionEvent) => void,
  ): Promise<CutHostRuntimeSnapshot> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const identity = parseDesktopCutHostIdentity(payload);
    const runtime = this.requireCut();
    const snapshot = await runtime.getSnapshot(window.windowId, identity);
    const subscriptions =
      this.cutSubscriptions.get(sender.webContentsId) ?? new Map<string, () => void>();
    const key = cutSubscriptionKey(identity);
    if (!subscriptions.has(key)) {
      subscriptions.set(key, await runtime.subscribe(window.windowId, identity, publish));
      this.cutSubscriptions.set(sender.webContentsId, subscriptions);
    }
    return snapshot;
  }

  async executeCutRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CutHostRuntimeResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCut().execute(window.windowId, payload);
  }

  detachWindowResources(windowId: string, webContentsId: number): void {
    this.detachRendererSubscriptions(webContentsId);
    this.resourceBrowser?.detachWindow(windowId);
    this.preview?.detachWindow(windowId);
    this.canvas?.detachWindow(windowId);
    this.cut?.detachWindow(windowId);
  }

  detachRendererSubscriptions(webContentsId: number): void {
    this.resourceSubscriptions.get(webContentsId)?.();
    this.resourceSubscriptions.delete(webContentsId);
    for (const disposeSubscription of this.canvasSubscriptions.get(webContentsId)?.values() ?? []) {
      disposeSubscription();
    }
    this.canvasSubscriptions.delete(webContentsId);
    for (const disposeSubscription of this.cutSubscriptions.get(webContentsId)?.values() ?? []) {
      disposeSubscription();
    }
    this.cutSubscriptions.delete(webContentsId);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    try {
      this.windows.disposeAll();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.agentBridge.dispose();
    } catch (error) {
      errors.push(error);
    }
    for (const disposeSubscription of this.resourceSubscriptions.values()) {
      try {
        disposeSubscription();
      } catch (error) {
        errors.push(error);
      }
    }
    this.resourceSubscriptions.clear();
    for (const subscriptions of this.canvasSubscriptions.values()) {
      for (const disposeSubscription of subscriptions.values()) {
        try {
          disposeSubscription();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    this.canvasSubscriptions.clear();
    for (const subscriptions of this.cutSubscriptions.values()) {
      for (const disposeSubscription of subscriptions.values()) {
        try {
          disposeSubscription();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    this.cutSubscriptions.clear();
    try {
      this.resourceBrowser?.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.preview?.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.canvas?.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.cut?.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.options.agentControllerComposition?.dispose?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.agent.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.shell.dispose();
    } catch (error) {
      errors.push(error);
    }
    this.options.logger.info('Desktop AppHost disposed.', {
      applicationInstanceId: this.applicationIdentity.instanceId,
    });
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose Desktop AppHost.');
    }
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new Error('Desktop AppHost is disposed.');
    }
  }

  private requireResourceBrowser(): DesktopResourceBrowserRuntime {
    if (!this.resourceBrowser) {
      throw new Error('Desktop Resource Browser runtime is unavailable.');
    }
    return this.resourceBrowser;
  }

  private requireCanvas(): DesktopCanvasRuntime {
    if (!this.canvas) {
      throw new Error('Desktop Canvas runtime is unavailable.');
    }
    return this.canvas;
  }

  private requireCut(): DesktopCutRuntime {
    if (!this.cut) {
      throw new Error('Desktop Cut runtime is unavailable.');
    }
    return this.cut;
  }

  private async mutateProjectTab(
    sender: DesktopSenderIdentity,
    payload: unknown,
    operation: 'activate' | 'close',
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopTabMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    const closingView =
      operation === 'close'
        ? (await this.shell.getProjection(window.windowId)).window.tabs.find(
            (tab) => tab.tabId === request.tabId,
          )
        : undefined;
    const projection =
      operation === 'activate'
        ? await this.shell.activateTab(
            window.windowId,
            request.tabId,
            request.expectedEndpointEpoch,
            request.expectedWindowRevision,
          )
        : await this.shell.closeTab(
            window.windowId,
            request.tabId,
            request.expectedEndpointEpoch,
            request.expectedWindowRevision,
          );
    if (operation === 'close' && closingView) {
      this.agentBridge.detachView(window.windowId, closingView.viewId);
    }
    this.preview?.reconcileWorkbench(window.windowId, projection.window.workbench);
    this.cut?.reconcileWorkbench(window.windowId, projection.window.workbench);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection,
    };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function canvasSubscriptionKey(identity: CanvasHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
  ].join(':');
}

function cutSubscriptionKey(identity: ReturnType<typeof parseDesktopCutHostIdentity>): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
  ].join(':');
}
