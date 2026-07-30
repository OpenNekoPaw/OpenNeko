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
  parseDesktopConversationDeleteRequest,
  parseDesktopProfileRequest,
  parseDesktopProjectOpenRequest,
  parseDesktopProjectRemoveRecentRequest,
  parseDesktopShellRequest,
  parseDesktopTabMutationRequest,
  parseDesktopWorkbenchMutationRequest,
  parseDesktopWindowMutationRequest,
  type DesktopOpenContentResult,
  type DesktopProfileRequestResult,
  type DesktopShellResponse,
} from '../shared/shell-contract';
import { DesktopWindowRegistry, type DesktopSenderIdentity } from './window-registry';
import type {
  DesktopAgentAppHostComposition,
  DesktopAgentSkillCatalog,
} from './desktop-agent-app-host-composition';
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
  ResourceBrowserQuickPreviewReleaseRequest,
  ResourceBrowserQuickPreviewReleaseResult,
  ResourceBrowserQuickPreviewRequest,
  ResourceBrowserQuickPreviewResult,
  ResourceBrowserSearchRequest,
  ResourceBrowserSnapshotRequest,
  ResourceBrowserThumbnailRequest,
  ResourceBrowserThumbnailResult,
} from 'neko-assets/resource-browser/contract';
import type { DesktopResourceBrowserRuntime } from './desktop-resource-browser-runtime';
import type { DesktopPreviewRuntime } from './desktop-preview-runtime';
import type { PreviewProjection, PreviewRuntimeRequest } from '@neko-preview/contracts';
import type {
  CanvasHostIntentResult,
  CanvasHostProjectionEvent,
  CanvasHostRuntimeIdentity,
  CanvasHostSnapshot,
  CanvasMaterialActionResolution,
} from '@neko-canvas/domain';
import {
  parseDesktopCanvasHostIdentity,
  type DesktopCanvasMediaResponse,
  type DesktopCanvasPreviewVariantResult,
} from '../shared/canvas-bridge-contract';
import type { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import type {
  CutHostRuntimeProjectionEvent,
  CutHostRuntimeResult,
  CutHostRuntimeSnapshot,
} from '@neko-cut/domain';
import { parseDesktopCutHostIdentity } from '../shared/cut-bridge-contract';
import type { DesktopCutRuntime } from './desktop-cut-runtime';
import {
  DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
  parseDesktopHomeAssetSearchRequest,
  parseDesktopHomeMediaLibraryAddRequest,
  parseDesktopHomeMediaLibraryChildrenRequest,
  parseDesktopHomeMediaLibraryRequest,
  parseDesktopHomeMediaLibrarySearchRequest,
  parseDesktopHomePluginsRequest,
  type DesktopHomeAssetSearchResult,
  type DesktopHomeMediaLibraryAddResult,
  type DesktopHomeMediaLibraryChildrenResult,
  type DesktopHomeMediaLibraryRemoveResult,
  type DesktopHomeMediaLibraryRevealResult,
  type DesktopHomeMediaLibrarySearchResult,
  type DesktopHomePluginsResult,
} from '../shared/home-management-contract';
import {
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
  parseDesktopApplicationSettingsRequest,
  parseDesktopApplicationSettingsUpdateRequest,
  type DesktopAgentAdvancedSettingsResult,
  type DesktopApplicationSettingsResponse,
} from '../shared/application-settings-contract';
import type { DesktopApplicationSettingsService } from './application-settings-service';

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
  readonly settings: DesktopApplicationSettingsService;
  readonly openAgentAdvancedSettings: () => Promise<void>;
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
  readonly settings: DesktopApplicationSettingsService;
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
    this.settings = options.settings;
    this.shell.setAgentHomeProjectionSource(this.agent);
    this.shell.setAgentCapabilityReady(this.agentBridge.startup.ready);
    this.shell.setResourceBrowserCapabilityReady(this.resourceBrowser !== undefined);
    this.shell.setPreviewCapabilityReady(this.preview !== undefined);
    this.shell.setCanvasCapabilityReady(this.canvas !== undefined);
    this.shell.setCutCapabilityReady(this.cut !== undefined);
  }

  createApplicationSettingsSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): DesktopApplicationSettingsResponse {
    this.requireActive();
    const request = parseDesktopApplicationSettingsRequest(payload);
    this.windows.resolveSender(sender);
    return {
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: this.settings.current,
    };
  }

  async updateApplicationSettings(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopApplicationSettingsResponse> {
    this.requireActive();
    const request = parseDesktopApplicationSettingsUpdateRequest(payload);
    this.windows.resolveSender(sender);
    return {
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: await this.settings.update(request.expectedRevision, request.preferences),
    };
  }

  async openAgentAdvancedSettings(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopAgentAdvancedSettingsResult> {
    this.requireActive();
    const request = parseDesktopApplicationSettingsRequest(payload);
    this.windows.resolveSender(sender);
    await this.options.openAgentAdvancedSettings();
    return {
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      requestId: request.requestId,
      status: 'opened',
    };
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

  async removeRecentProject(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopProjectRemoveRecentRequest(payload);
    const window = this.windows.resolveSender(sender);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: await this.shell.removeRecentProject(
        window.windowId,
        request.projectId,
        request.expectedEndpointEpoch,
        request.expectedWindowRevision,
        request.expectedCatalogRevision,
      ),
    };
  }

  async deleteHomeConversation(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopConversationDeleteRequest(payload);
    const window = this.windows.resolveSender(sender);
    await this.shell.assertAgentHomeConversation(
      window.windowId,
      request.expectedEndpointEpoch,
      request.expectedWindowRevision,
      request.expectedAgentHomeRevision,
      request.navigation,
    );
    const workspaceResolution = await this.shell.resolveAgentWorkspace(
      request.navigation.workspaceId,
    );
    const workspace =
      this.agent.getWorkspace(request.navigation.workspaceId) ??
      (await this.agent.attachWorkspace(workspaceResolution));
    await workspace.deleteConversation(request.navigation.conversationId);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: await this.shell.getProjection(window.windowId),
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
      const items = await this.requireResourceBrowser().searchHomeAssets({
        windowId: window.windowId,
        endpointEpoch: projection.endpointEpoch,
        query: request.query,
        sortBy: request.sortBy,
        sortDirection: request.sortDirection,
        limit: request.limit,
      });
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'ready',
        items,
      };
    } catch (error: unknown) {
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'error',
        diagnostic: { message: describeError(error) },
      };
    }
  }

  async searchHomeMediaLibraries(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomeMediaLibrarySearchResult> {
    this.requireActive();
    const request = parseDesktopHomeMediaLibrarySearchRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    try {
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'ready',
        items: await this.requireResourceBrowser().searchHomeMediaLibraries({
          windowId: window.windowId,
          endpointEpoch: projection.endpointEpoch,
          query: request.query,
          sortBy: request.sortBy,
          sortDirection: request.sortDirection,
          limit: request.limit,
        }),
      };
    } catch (error: unknown) {
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'error',
        diagnostic: { message: describeError(error) },
      };
    }
  }

  async readHomeMediaLibraryChildren(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomeMediaLibraryChildrenResult> {
    this.requireActive();
    const request = parseDesktopHomeMediaLibraryChildrenRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    try {
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'ready',
        items: await this.requireResourceBrowser().readHomeMediaLibraryChildren({
          windowId: window.windowId,
          endpointEpoch: projection.endpointEpoch,
          libraryId: request.libraryId,
          relativePath: request.relativePath,
          sortBy: request.sortBy,
          sortDirection: request.sortDirection,
          limit: request.limit,
        }),
      };
    } catch (error: unknown) {
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'error',
        diagnostic: { message: describeError(error) },
      };
    }
  }

  async addHomeMediaLibrary(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomeMediaLibraryAddResult> {
    this.requireActive();
    const request = parseDesktopHomeMediaLibraryAddRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    const result = await this.requireResourceBrowser().addHomeMediaLibrary({
      windowId: window.windowId,
      endpointEpoch: projection.endpointEpoch,
      locationKind: request.locationKind,
    });
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: request.requestId,
      ...result,
    };
  }

  async removeHomeMediaLibrary(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomeMediaLibraryRemoveResult> {
    this.requireActive();
    const request = parseDesktopHomeMediaLibraryRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    await this.requireResourceBrowser().removeHomeMediaLibrary({
      windowId: window.windowId,
      endpointEpoch: projection.endpointEpoch,
      libraryId: request.libraryId,
    });
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: request.requestId,
      status: 'removed',
      libraryId: request.libraryId,
    };
  }

  async revealHomeMediaLibrary(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomeMediaLibraryRevealResult> {
    this.requireActive();
    const request = parseDesktopHomeMediaLibraryRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    await this.requireResourceBrowser().revealHomeMediaLibrary({
      windowId: window.windowId,
      endpointEpoch: projection.endpointEpoch,
      libraryId: request.libraryId,
    });
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: request.requestId,
      status: 'revealed',
      libraryId: request.libraryId,
    };
  }

  async listHomePlugins(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopHomePluginsResult> {
    this.requireActive();
    const request = parseDesktopHomePluginsRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection = await this.shell.getProjection(window.windowId);
    const catalog = await this.agent.readGlobalSkillCatalog();
    for (const skill of catalog.records) {
      if (skill.source.kind === 'project') {
        throw new Error('Desktop global Skill catalog returned a Project-scoped Skill.');
      }
    }
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: request.requestId,
      skills: catalog.records.map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: requireGlobalSkillSource(skill.source.kind),
      })),
      skillDiscovery: projectSkillDiscovery(catalog),
      plugins: projection.domains.map((capability) => ({
        id: capability.surface,
        name: capability.surface,
        description: capability.ownerSlice,
        kind: 'builtin',
        status: capability.status,
      })),
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

  async resolveResourceBrowserQuickPreview(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserQuickPreviewRequest | unknown,
  ): Promise<ResourceBrowserQuickPreviewResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().resolveQuickPreview(window.windowId, payload);
  }

  async releaseResourceBrowserQuickPreview(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserQuickPreviewReleaseRequest | unknown,
  ): Promise<ResourceBrowserQuickPreviewReleaseResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().releaseQuickPreview(window.windowId, payload);
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

  async resolveCanvasMaterialActions(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CanvasMaterialActionResolution> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCanvas().resolveMaterialActions(window.windowId, payload);
  }

  async resolveCanvasPreviewVariant(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopCanvasPreviewVariantResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCanvas().resolvePreviewVariant(window.windowId, payload);
  }

  async executeCanvasMediaRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopCanvasMediaResponse | undefined> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCanvas().executeMediaRequest(window.windowId, payload);
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
      await this.canvas?.dispose();
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
    try {
      await this.settings.dispose();
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

function projectSkillDiscovery(
  catalog: DesktopAgentSkillCatalog,
): DesktopHomePluginsResult['skillDiscovery'] {
  const grouped = new Map<
    string,
    DesktopHomePluginsResult['skillDiscovery']['diagnostics'][number]
  >();
  for (const diagnostic of catalog.diagnostics) {
    const source = requireGlobalSkillSource(diagnostic.source);
    const key = `${source}:${diagnostic.code}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      code: diagnostic.code,
      source,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return {
    diagnostics: Object.freeze(
      [...grouped.values()].sort((left, right) =>
        `${left.source}:${left.code}`.localeCompare(`${right.source}:${right.code}`),
      ),
    ),
    duplicateCount: catalog.warnings.length,
  };
}

function requireGlobalSkillSource(
  source: DesktopAgentSkillCatalog['diagnostics'][number]['source'],
): 'builtin' | 'personal' {
  if (source === 'builtin' || source === 'personal') return source;
  throw new Error('Desktop global Skill catalog cannot contain Project source metadata.');
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
