import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { HostDiagnostic } from '@neko/host/ports';
import {
  DesktopAgentContractError,
  type DesktopAgentViewIdentity,
} from '../shared/agent-contract';
import {
  DESKTOP_SHELL_CONTRACT_VERSION,
  DesktopShellContractError,
  type DesktopAgentHomeNavigationIdentity,
  type DesktopDomainCapabilityProjection,
  type DesktopAgentHomeProjection,
  type DesktopProfileRequestResult,
  type DesktopProjectCatalogItem,
  type DesktopShellProjection,
  type DesktopShellProjectionEvent,
  type DesktopUnavailableProjectProfile,
} from '../shared/shell-contract';
import {
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from '../shared/workbench-contract';
import type {
  DesktopShellStateRepository,
  DesktopShellStoredState,
  DesktopStoredProject,
  DesktopStoredWindow,
} from './shell-state-repository';
import type {
  DesktopWorkspaceRegistry,
  DesktopWorkspaceResolution,
} from './desktop-workspace-registry';
import type { CanvasHostRuntimeIdentity } from '@neko-canvas/domain';
import type { CutHostRuntimeIdentity } from '@neko-cut/domain';
import {
  createDesktopCanvasSessionId,
} from '../shared/canvas-bridge-contract';
import { createDesktopCutSessionId } from '../shared/cut-bridge-contract';
import type { DesktopStartupTargetPreference } from '../shared/application-settings-contract';

const UNAVAILABLE_DOMAIN_CAPABILITIES: readonly DesktopDomainCapabilityProjection[] = [
  unavailableDomain('agent', 'P1.3'),
  unavailableDomain('media-library', 'P1.4'),
  unavailableDomain('canvas', 'P1.4'),
  unavailableDomain('cut', 'P1.5'),
  unavailableDomain('preview', 'P1.5'),
  unavailableDomain('generation', 'P1.6'),
  unavailableDomain('quality', 'P1.6'),
  unavailableDomain('character', 'P1.6'),
  unavailableDomain('world', 'P1.6'),
  unavailableDomain('tools', 'P1.6'),
];

export interface DesktopShellServiceOptions {
  readonly applicationInstanceId: string;
  readonly stateRepository: DesktopShellStateRepository;
  readonly workspaceRegistry: DesktopWorkspaceRegistry;
  readonly startupTarget: DesktopStartupTargetPreference;
  readonly createIdentity?: () => string;
  readonly now?: () => string;
}

export interface DesktopAgentHomeProjectionSource {
  readHomeProjection(): DesktopAgentHomeProjection;
  subscribeHomeProjection(listener: () => void): () => void;
}

export interface DesktopShellOpenContentResult {
  readonly projection: DesktopShellProjection;
  readonly workspace: DesktopWorkspaceResolution;
}

export interface DesktopAgentViewGrant extends DesktopAgentViewIdentity {
  readonly windowId: string;
  readonly workspaceId: string;
}

export interface DesktopCanvasViewGrant {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly workspace: DesktopWorkspaceResolution;
}

export interface DesktopCutViewGrant {
  readonly identity: CutHostRuntimeIdentity;
  readonly workspace: DesktopWorkspaceResolution;
}

interface DesktopWindowRuntime {
  rendererEpoch: number;
  sequence: number;
  readonly subscribers: Set<(event: DesktopShellProjectionEvent) => void>;
}

export class DesktopShellService {
  private readonly activeWindows = new Map<string, DesktopWindowRuntime>();
  private operationTail: Promise<void> = Promise.resolve();
  private agentCapabilityReady = false;
  private resourceBrowserCapabilityReady = false;
  private previewCapabilityReady = false;
  private canvasCapabilityReady = false;
  private cutCapabilityReady = false;
  private agentHomeProjectionSource: DesktopAgentHomeProjectionSource | undefined;
  private disposeAgentHomeProjectionSubscription: (() => void) | undefined;
  private agentHomeProjectionFailure: unknown;
  private disposed = false;

  constructor(private readonly options: DesktopShellServiceOptions) {
    requireIdentity(options.applicationInstanceId, 'Desktop application instance identity');
  }

  setAgentCapabilityReady(ready: boolean): void {
    this.requireActive();
    if (this.activeWindows.size > 0) {
      throw new Error('Desktop Agent capability must be configured before any Window is claimed.');
    }
    this.agentCapabilityReady = ready;
  }

  setResourceBrowserCapabilityReady(ready: boolean): void {
    this.requireActive();
    if (this.activeWindows.size > 0) {
      throw new Error(
        'Desktop Resource Browser capability must be configured before any Window is claimed.',
      );
    }
    this.resourceBrowserCapabilityReady = ready;
  }

  setPreviewCapabilityReady(ready: boolean): void {
    this.requireActive();
    if (this.activeWindows.size > 0) {
      throw new Error('Desktop Preview capability must be configured before any Window is claimed.');
    }
    this.previewCapabilityReady = ready;
  }

  setCanvasCapabilityReady(ready: boolean): void {
    this.requireActive();
    if (this.activeWindows.size > 0) {
      throw new Error('Desktop Canvas capability must be configured before any Window is claimed.');
    }
    this.canvasCapabilityReady = ready;
  }

  setCutCapabilityReady(ready: boolean): void {
    this.requireActive();
    if (this.activeWindows.size > 0) {
      throw new Error('Desktop Cut capability must be configured before any Window is claimed.');
    }
    this.cutCapabilityReady = ready;
  }

  setAgentHomeProjectionSource(source: DesktopAgentHomeProjectionSource): void {
    this.requireActive();
    if (this.activeWindows.size > 0) {
      throw new Error(
        'Desktop Agent Home projection source must be configured before any Window is claimed.',
      );
    }
    if (this.agentHomeProjectionSource) {
      throw new Error('Desktop Agent Home projection source is already configured.');
    }
    this.agentHomeProjectionSource = source;
    this.disposeAgentHomeProjectionSubscription = source.subscribeHomeProjection(() => {
      if (this.disposed) return;
      void this.enqueue(async () => {
        this.requireActive();
        const state = await this.options.stateRepository.read();
        await this.emitAll(state);
      }).catch((error: unknown) => {
        this.agentHomeProjectionFailure = error;
      });
    });
  }

  async claimWindowId(): Promise<string> {
    return this.enqueue(async () => {
      this.requireActive();
      const state = await this.options.stateRepository.read();
      const reusablePrimary =
        state.primaryWindowId !== null && !this.activeWindows.has(state.primaryWindowId)
          ? state.primaryWindowId
          : null;
      const windowId = reusablePrimary ?? this.createIdentity();
      if (!state.windows.some((window) => window.windowId === windowId)) {
        const next = await this.options.stateRepository.commit(state.storageRevision, {
          ...state,
          storageRevision: state.storageRevision + 1,
          primaryWindowId: state.primaryWindowId ?? windowId,
          windows: [
            ...state.windows,
            {
              windowId,
              revision: 0,
              activeTarget: { kind: 'home' },
              tabs: [],
              workbench: createDefaultDesktopWorkbenchLayout(windowId),
            },
          ],
        });
        this.installWindowRuntime(windowId);
        await this.emitAll(next);
        return windowId;
      }
      const restoredWindow = requireStoredWindow(state, windowId);
      const restoredWorkbench = restoreTransientWorkbench(state, restoredWindow);
      const restoredActiveTarget =
        this.options.startupTarget === 'home' &&
        restoredWindow.activeTarget.kind !== 'home'
          ? ({ kind: 'home' } as const)
          : restoredWindow.activeTarget;
      if (
        restoredWorkbench !== restoredWindow.workbench ||
        restoredActiveTarget !== restoredWindow.activeTarget
      ) {
        await this.options.stateRepository.commit(state.storageRevision, {
          ...state,
          storageRevision: state.storageRevision + 1,
          windows: state.windows.map((window) =>
            window.windowId === windowId
              ? {
                  ...window,
                  revision: window.revision + 1,
                  activeTarget: restoredActiveTarget,
                  workbench: restoredWorkbench,
                }
              : window,
          ),
        });
      }
      this.installWindowRuntime(windowId);
      return windowId;
    });
  }

  releaseWindow(windowId: string): void {
    this.activeWindows.delete(windowId);
  }

  setRendererEpoch(windowId: string, rendererEpoch: number): void {
    const runtime = this.requireWindowRuntime(windowId);
    if (!Number.isSafeInteger(rendererEpoch) || rendererEpoch <= runtime.rendererEpoch) {
      throw new Error(
        `Desktop renderer epoch must advance for Window '${windowId}'; received ${rendererEpoch}.`,
      );
    }
    runtime.rendererEpoch = rendererEpoch;
    runtime.sequence = 0;
  }

  subscribe(windowId: string, listener: (event: DesktopShellProjectionEvent) => void): () => void {
    const runtime = this.requireWindowRuntime(windowId);
    runtime.subscribers.add(listener);
    return () => {
      runtime.subscribers.delete(listener);
    };
  }

  async getProjection(windowId: string): Promise<DesktopShellProjection> {
    this.requireActive();
    this.requireAgentHomeProjectionHealthy();
    const runtime = this.requireWindowRuntime(windowId);
    return projectShellState(
      await this.options.stateRepository.read(),
      this.options.applicationInstanceId,
      windowId,
      runtime.rendererEpoch,
      this.readAgentHomeProjection(),
      this.domainCapabilities(),
    );
  }

  async resolveAgentViewGrant(
    windowId: string,
    identity: DesktopAgentViewIdentity,
  ): Promise<DesktopAgentViewGrant> {
    this.requireActive();
    const projection = await this.getProjection(windowId);
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === identity.projectId,
    );
    const tab = projection.window.tabs.find(
      (candidate) => candidate.projectId === identity.projectId,
    );
    if (!project || !tab || tab.viewId !== identity.viewId) {
      throw new DesktopAgentContractError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent View '${identity.viewId}' is not granted to Project '${identity.projectId}' in Window '${windowId}'.`,
      );
    }
    if (tab.viewEpoch !== identity.viewEpoch) {
      throw new DesktopAgentContractError(
        'desktop-agent-stale-view-epoch',
        `Desktop Agent View '${identity.viewId}' epoch ${identity.viewEpoch} is stale; current epoch is ${tab.viewEpoch}.`,
      );
    }
    return {
      windowId,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      viewId: tab.viewId,
      viewEpoch: tab.viewEpoch,
    };
  }

  async resolveAgentWorkspace(workspaceId: string): Promise<DesktopWorkspaceResolution> {
    this.requireActive();
    const state = await this.options.stateRepository.read();
    const project = state.projects.find((candidate) => candidate.workspaceId === workspaceId);
    if (!project) {
      throw new DesktopAgentContractError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Workspace '${workspaceId}' is not present in the Project catalog.`,
      );
    }
    const workspace = await this.options.workspaceRegistry.resolve(project.workspacePath);
    if (workspace.workspaceId !== project.workspaceId) {
      throw new DesktopAgentContractError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Workspace '${project.workspaceId}' no longer matches its persisted locator.`,
      );
    }
    return workspace;
  }

  async resolveProjectWorkspace(projectId: string): Promise<DesktopWorkspaceResolution> {
    this.requireActive();
    const state = await this.options.stateRepository.read();
    const project = state.projects.find((candidate) => candidate.projectId === projectId);
    if (!project) {
      throw new DesktopShellContractError(
        'desktop-shell-project-not-found',
        `Desktop Project '${projectId}' is not present in the Project catalog.`,
      );
    }
    return this.resolveAgentWorkspace(project.workspaceId);
  }

  async resolveCanvasViewGrant(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<DesktopCanvasViewGrant> {
    this.requireActive();
    if (!this.canvasCapabilityReady) {
      throw new Error('Desktop Canvas capability is unavailable.');
    }
    const projection = await this.getProjection(windowId);
    if (
      identity.windowId !== windowId ||
      identity.endpointEpoch !== projection.endpointEpoch
    ) {
      throw new Error('Desktop Canvas Window or renderer identity is stale.');
    }
    const view = projection.window.workbench.main.views.find(
      (candidate) => candidate.viewId === identity.viewId && candidate.kind === 'canvas',
    );
    if (
      !view ||
      view.projectId !== identity.projectId ||
      view.workspaceId !== identity.workspaceId ||
      view.viewEpoch !== identity.viewEpoch ||
      view.documentId !== identity.documentId ||
      identity.sessionId !== createDesktopCanvasSessionId(view.viewId, view.viewEpoch)
    ) {
      throw new Error('Desktop Canvas View identity is not granted by the active Workbench.');
    }
    return {
      identity: { ...identity },
      workspace: await this.resolveAgentWorkspace(identity.workspaceId),
    };
  }

  async resolveCutViewGrant(
    windowId: string,
    identity: CutHostRuntimeIdentity,
  ): Promise<DesktopCutViewGrant> {
    this.requireActive();
    if (!this.cutCapabilityReady) {
      throw new Error('Desktop Cut capability is unavailable.');
    }
    const projection = await this.getProjection(windowId);
    if (
      identity.windowId !== windowId ||
      identity.endpointEpoch !== projection.endpointEpoch
    ) {
      throw new Error('Desktop Cut Window or renderer identity is stale.');
    }
    const view = projection.window.workbench.main.views.find(
      (candidate) => candidate.viewId === identity.viewId && candidate.kind === 'cut',
    );
    if (
      !view ||
      view.projectId !== identity.projectId ||
      view.workspaceId !== identity.workspaceId ||
      view.viewEpoch !== identity.viewEpoch ||
      view.documentId !== identity.documentId ||
      identity.sessionId !== createDesktopCutSessionId(view.viewId, view.viewEpoch)
    ) {
      throw new Error('Desktop Cut View identity is not granted by the active Workbench.');
    }
    return {
      identity: { ...identity },
      workspace: await this.resolveAgentWorkspace(identity.workspaceId),
    };
  }

  async assertWindowMutationContext(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<void> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, windowId);
      if (window.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, window.revision);
      }
    });
  }

  async assertAgentHomeConversation(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
    expectedAgentHomeRevision: number,
    navigation: DesktopAgentHomeNavigationIdentity,
  ): Promise<void> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, windowId);
      if (window.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, window.revision);
      }
      const agentHome = this.readAgentHomeProjection();
      if (agentHome.revision !== expectedAgentHomeRevision) {
        throw new DesktopShellContractError(
          'desktop-shell-stale-revision',
          `Desktop Agent Home revision ${expectedAgentHomeRevision} is stale; current revision is ${agentHome.revision}.`,
        );
      }
      const project = state.projects.find(
        (candidate) =>
          candidate.projectId === navigation.projectId &&
          candidate.workspaceId === navigation.workspaceId,
      );
      if (!project) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          `Desktop Agent Home conversation '${navigation.conversationId}' belongs to an unknown Project or Workspace.`,
        );
      }
      const conversation = agentHome.conversations.find(
        (candidate) =>
          candidate.navigation.projectId === navigation.projectId &&
          candidate.navigation.workspaceId === navigation.workspaceId &&
          candidate.navigation.conversationId === navigation.conversationId,
      );
      if (!conversation) {
        throw new DesktopShellContractError(
          'desktop-shell-conversation-not-found',
          `Desktop Agent Home conversation '${navigation.conversationId}' is not present in the authoritative projection.`,
        );
      }
      this.assertMutationContext(windowId, expectedEndpointEpoch);
    });
  }

  async removeRecentProject(
    windowId: string,
    projectId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
    expectedCatalogRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const requestingWindow = requireStoredWindow(state, windowId);
      if (requestingWindow.revision !== expectedWindowRevision) {
        throw staleWindowRevision(
          windowId,
          expectedWindowRevision,
          requestingWindow.revision,
        );
      }
      if (state.catalogRevision !== expectedCatalogRevision) {
        throw new DesktopShellContractError(
          'desktop-shell-stale-revision',
          `Desktop Project catalog revision ${expectedCatalogRevision} is stale; current revision is ${state.catalogRevision}.`,
        );
      }
      requireStoredProject(state, projectId);
      const windows = state.windows.map((window) =>
        removeProjectFromWindow(window, state, projectId),
      );
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        catalogRevision: state.catalogRevision + 1,
        projects: state.projects.filter((project) => project.projectId !== projectId),
        windows,
      });
      await this.emitAll(committed);
      return this.projectWindow(committed, windowId);
    });
  }

  async openContent(
    windowId: string,
    workspacePath: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellOpenContentResult> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const workspace = await this.options.workspaceRegistry.resolve(workspacePath);
      const state = await this.options.stateRepository.read();
      const currentWindow = requireStoredWindow(state, windowId);
      if (currentWindow.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, currentWindow.revision);
      }
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const next = openContentProject(state, windowId, workspace, this.now(), this.createIdentity);
      const committed =
        next === state
          ? state
          : await this.options.stateRepository.commit(state.storageRevision, next);
      await this.emitAll(committed);
      return {
        projection: this.projectWindow(committed, windowId),
        workspace,
      };
    });
  }

  async openCatalogProject(
    windowId: string,
    projectId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellOpenContentResult> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const currentWindow = requireStoredWindow(state, windowId);
      if (currentWindow.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, currentWindow.revision);
      }
      const project = state.projects.find((candidate) => candidate.projectId === projectId);
      if (!project) {
        throw new DesktopShellContractError(
          'desktop-shell-project-not-found',
          `Desktop Project '${projectId}' is not present in the catalog.`,
        );
      }
      const workspace = await this.options.workspaceRegistry.resolve(project.workspacePath);
      if (workspace.workspaceId !== project.workspaceId) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          `Desktop Project '${projectId}' no longer matches its persisted Workspace identity.`,
        );
      }
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const next = openContentProject(state, windowId, workspace, this.now(), this.createIdentity);
      const committed =
        next === state
          ? state
          : await this.options.stateRepository.commit(state.storageRevision, next);
      await this.emitAll(committed);
      return {
        projection: this.projectWindow(committed, windowId),
        workspace,
      };
    });
  }

  async requestUnavailableProfile(
    windowId: string,
    requestId: string,
    profile: DesktopUnavailableProjectProfile,
  ): Promise<DesktopProfileRequestResult> {
    const diagnostic: HostDiagnostic & {
      readonly code: 'desktop-project-profile-unavailable';
      readonly severity: 'error';
    } = {
      code: 'desktop-project-profile-unavailable',
      severity: 'error',
      message:
        profile === 'character'
          ? 'Character projects require the P1.6 Character aggregate and are not available yet.'
          : 'World projects require a canonical World aggregate and are not available yet.',
      metadata: { profile, ownerSlice: 'P1.6' },
    };
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId,
      status: 'unavailable',
      diagnostic,
      projection: await this.getProjection(windowId),
    };
  }

  async activateTab(
    windowId: string,
    tabId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.mutateWindow(
      windowId,
      expectedEndpointEpoch,
      expectedWindowRevision,
      (window, state) => {
        if (!window.tabs.some((tab) => tab.tabId === tabId)) {
          throw new Error(`Unknown Desktop Project Tab '${tabId}' for Window '${windowId}'.`);
        }
        const tab = window.tabs.find((candidate) => candidate.tabId === tabId);
        if (!tab) {
          throw new Error(`Unknown Desktop Project Tab '${tabId}' for Window '${windowId}'.`);
        }
        const project = requireStoredProject(state, tab.projectId);
        const workbench = attachProjectWorkbench(window.workbench, project);
        if (
          window.activeTarget.kind === 'project' &&
          window.activeTarget.tabId === tabId &&
          workbench === window.workbench
        ) {
          return window;
        }
        return {
          ...window,
          revision: window.revision + 1,
          activeTarget: { kind: 'project', tabId },
          workbench,
        };
      },
    );
  }

  async activateHome(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.mutateWindow(windowId, expectedEndpointEpoch, expectedWindowRevision, (window) => {
      if (window.activeTarget.kind === 'home') return window;
      return {
        ...window,
        revision: window.revision + 1,
        activeTarget: { kind: 'home' },
      };
    });
  }

  async closeTab(
    windowId: string,
    tabId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
  ): Promise<DesktopShellProjection> {
    return this.mutateWindow(
      windowId,
      expectedEndpointEpoch,
      expectedWindowRevision,
      (window, state) => {
        const tabIndex = window.tabs.findIndex((tab) => tab.tabId === tabId);
        if (tabIndex < 0) {
          throw new Error(`Unknown Desktop Project Tab '${tabId}' for Window '${windowId}'.`);
        }
        const tabs = window.tabs.filter((tab) => tab.tabId !== tabId);
        const wasActive =
          window.activeTarget.kind === 'project' && window.activeTarget.tabId === tabId;
        const nextActiveTab = tabs[Math.min(tabIndex, tabs.length - 1)];
        const nextWorkbench =
          wasActive && nextActiveTab
            ? attachProjectWorkbench(
                window.workbench,
                requireStoredProject(state, nextActiveTab.projectId),
              )
            : wasActive
              ? {
                  ...createDefaultDesktopWorkbenchLayout(window.windowId),
                  revision: window.workbench.revision + 1,
                }
              : window.workbench;
        return {
          ...window,
          revision: window.revision + 1,
          tabs,
          activeTarget: wasActive
            ? nextActiveTab
              ? { kind: 'project', tabId: nextActiveTab.tabId }
              : { kind: 'home' }
            : window.activeTarget,
          workbench: nextWorkbench,
        };
      },
    );
  }

  async updateWorkbench(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
    expectedWorkbenchRevision: number,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<DesktopShellProjection> {
    const rendererEpoch = this.requireWindowRuntime(windowId).rendererEpoch;
    const rendererEpochOffset = Math.max(0, rendererEpoch - 1);
    const parsed = parseDesktopWorkbenchLayout(workbench);
    return this.mutateWindow(
      windowId,
      expectedEndpointEpoch,
      expectedWindowRevision,
      (window, state) => {
        if (window.workbench.revision !== expectedWorkbenchRevision) {
          throw staleWorkbenchRevision(
            windowId,
            expectedWorkbenchRevision,
            window.workbench.revision,
          );
        }
        if (
          parsed.windowId !== windowId ||
          parsed.revision !== expectedWorkbenchRevision + 1
        ) {
          throw new DesktopShellContractError(
            'desktop-shell-project-identity-mismatch',
            'Desktop Workbench mutation has invalid Window or revision identity.',
          );
        }
        if (window.activeTarget.kind !== 'project') {
          const projectedWorkbench = projectWorkbench(
            window.workbench,
            rendererEpochOffset,
          );
          const allowedHomeMutation: DesktopWorkbenchLayoutProjection = {
            ...projectedWorkbench,
            revision: parsed.revision,
            primarySidebar: parsed.primarySidebar,
          };
          if (!isDeepStrictEqual(parsed, allowedHomeMutation)) {
            throw new DesktopShellContractError(
              'desktop-shell-project-identity-mismatch',
              'Desktop Home may only mutate the application primary sidebar.',
            );
          }
          return {
            ...window,
            revision: window.revision + 1,
            workbench: {
              ...window.workbench,
              revision: parsed.revision,
              primarySidebar: parsed.primarySidebar,
            },
          };
        }
        const activeTabId = window.activeTarget.tabId;
        const tab = window.tabs.find(
          (candidate) => candidate.tabId === activeTabId,
        );
        if (!tab) {
          throw new DesktopShellContractError(
            'desktop-shell-project-identity-mismatch',
            'Desktop Workbench active Project attachment is missing.',
          );
        }
        const project = requireStoredProject(state, tab.projectId);
        const normalizedViews = parsed.main.views.map((view) => {
          if (
            view.projectId !== project.projectId ||
            view.workspaceId !== project.workspaceId
          ) {
            throw new DesktopShellContractError(
              'desktop-shell-project-identity-mismatch',
              `Desktop Workbench View '${view.viewId}' belongs to another Project.`,
            );
          }
          const persistedViewEpoch = view.viewEpoch - rendererEpochOffset;
          if (!Number.isSafeInteger(persistedViewEpoch) || persistedViewEpoch < 1) {
            throw new DesktopShellContractError(
              'desktop-shell-project-identity-mismatch',
              `Desktop Workbench View '${view.viewId}' has a stale epoch.`,
            );
          }
          return {
            ...view,
            viewEpoch: persistedViewEpoch,
          };
        });
        return {
          ...window,
          revision: window.revision + 1,
          workbench: {
            ...parsed,
            main: {
              ...parsed.main,
              views: normalizedViews,
            },
          },
        };
      },
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeAgentHomeProjectionSubscription?.();
    this.disposeAgentHomeProjectionSubscription = undefined;
    await this.operationTail;
    this.activeWindows.clear();
    await this.options.workspaceRegistry.dispose();
  }

  private async mutateWindow(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
    mutate: (
      window: DesktopStoredWindow,
      state: DesktopShellStoredState,
    ) => DesktopStoredWindow,
  ): Promise<DesktopShellProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, windowId);
      if (window.revision !== expectedWindowRevision) {
        throw staleWindowRevision(windowId, expectedWindowRevision, window.revision);
      }
      this.assertMutationContext(windowId, expectedEndpointEpoch);
      const updatedWindow = mutate(window, state);
      if (updatedWindow === window) return this.projectWindow(state, windowId);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        windows: state.windows.map((candidate) =>
          candidate.windowId === windowId ? updatedWindow : candidate,
        ),
      });
      await this.emitAll(committed);
      return this.projectWindow(committed, windowId);
    });
  }

  private async emitAll(state: DesktopShellStoredState): Promise<void> {
    for (const [windowId, runtime] of this.activeWindows) {
      const projection = projectShellState(
        state,
        this.options.applicationInstanceId,
        windowId,
        runtime.rendererEpoch,
        this.readAgentHomeProjection(),
        this.domainCapabilities(),
      );
      runtime.sequence += 1;
      const event: DesktopShellProjectionEvent = {
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        applicationInstanceId: this.options.applicationInstanceId,
        windowId,
        rendererEpoch: runtime.rendererEpoch,
        sequence: runtime.sequence,
        projection,
      };
      for (const subscriber of runtime.subscribers) subscriber(event);
    }
  }

  private projectWindow(state: DesktopShellStoredState, windowId: string): DesktopShellProjection {
    const runtime = this.requireWindowRuntime(windowId);
    return projectShellState(
      state,
      this.options.applicationInstanceId,
      windowId,
      runtime.rendererEpoch,
      this.readAgentHomeProjection(),
      this.domainCapabilities(),
    );
  }

  private domainCapabilities(): readonly DesktopDomainCapabilityProjection[] {
    return UNAVAILABLE_DOMAIN_CAPABILITIES.map((capability) => {
      if (capability.surface === 'agent' && this.agentCapabilityReady) {
        return {
          surface: 'agent',
          status: 'ready',
          ownerSlice: 'P1.3',
        };
      }
      if (
        capability.surface === 'media-library' &&
        this.resourceBrowserCapabilityReady
      ) {
        return {
          surface: 'media-library',
          status: 'ready',
          ownerSlice: 'P1.4',
        };
      }
      if (capability.surface === 'preview' && this.previewCapabilityReady) {
        return {
          surface: 'preview',
          status: 'ready',
          ownerSlice: 'P1.5',
        };
      }
      if (capability.surface === 'canvas' && this.canvasCapabilityReady) {
        return {
          surface: 'canvas',
          status: 'ready',
          ownerSlice: 'P1.4',
        };
      }
      if (capability.surface === 'cut' && this.cutCapabilityReady) {
        return {
          surface: 'cut',
          status: 'ready',
          ownerSlice: 'P1.5',
        };
      }
      return capability;
    });
  }

  private installWindowRuntime(windowId: string): void {
    if (this.activeWindows.has(windowId)) {
      throw new Error(`Desktop Window '${windowId}' is already active.`);
    }
    this.activeWindows.set(windowId, {
      rendererEpoch: 0,
      sequence: 0,
      subscribers: new Set(),
    });
  }

  private requireWindowRuntime(windowId: string): DesktopWindowRuntime {
    const runtime = this.activeWindows.get(windowId);
    if (!runtime) throw new Error(`Desktop Window '${windowId}' is not attached to Shell state.`);
    return runtime;
  }

  private assertMutationContext(windowId: string, expectedEndpointEpoch: string): void {
    const runtime = this.requireWindowRuntime(windowId);
    const currentEndpointEpoch = `${this.options.applicationInstanceId}:${windowId}:${runtime.rendererEpoch}`;
    if (expectedEndpointEpoch !== currentEndpointEpoch) {
      throw new DesktopShellContractError(
        'desktop-shell-stale-revision',
        `Desktop endpoint '${expectedEndpointEpoch}' is stale; current endpoint is '${currentEndpointEpoch}'.`,
      );
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Shell service is disposed.');
  }

  private readAgentHomeProjection(): DesktopAgentHomeProjection {
    this.requireAgentHomeProjectionHealthy();
    return (
      this.agentHomeProjectionSource?.readHomeProjection() ?? {
        revision: 0,
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }
    );
  }

  private requireAgentHomeProjectionHealthy(): void {
    if (this.agentHomeProjectionFailure !== undefined) {
      throw new Error('Desktop Agent Home projection update failed.', {
        cause: this.agentHomeProjectionFailure,
      });
    }
  }

  private createIdentity = (): string => {
    return this.options.createIdentity ? this.options.createIdentity() : randomUUID();
  };

  private now(): string {
    return this.options.now ? this.options.now() : new Date().toISOString();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function removeProjectFromWindow(
  window: DesktopStoredWindow,
  state: DesktopShellStoredState,
  projectId: string,
): DesktopStoredWindow {
  const removedTabIndexes = window.tabs.flatMap((tab, index) =>
    tab.projectId === projectId ? [index] : [],
  );
  const workbench = detachProjectWorkbench(window.workbench, projectId);
  if (removedTabIndexes.length === 0 && workbench === window.workbench) return window;
  const tabs = window.tabs.filter((tab) => tab.projectId !== projectId);
  const activeTarget = window.activeTarget;
  const activeTab =
    activeTarget.kind === 'project'
      ? window.tabs.find((tab) => tab.tabId === activeTarget.tabId)
      : undefined;
  const activeProjectRemoved = activeTab?.projectId === projectId;
  if (!activeProjectRemoved) {
    return {
      ...window,
      revision: window.revision + 1,
      tabs,
      workbench,
    };
  }
  const firstRemovedTabIndex = removedTabIndexes[0];
  if (firstRemovedTabIndex === undefined) {
    throw new Error('Removed project tabs must include their original indexes.');
  }
  const nextActiveTab = tabs[Math.min(firstRemovedTabIndex, tabs.length - 1)];
  return {
    ...window,
    revision: window.revision + 1,
    tabs,
    activeTarget: nextActiveTab
      ? { kind: 'project', tabId: nextActiveTab.tabId }
      : { kind: 'home' },
    workbench: nextActiveTab
      ? attachProjectWorkbench(workbench, requireStoredProject(state, nextActiveTab.projectId))
      : workbench,
  };
}

function detachProjectWorkbench(
  current: DesktopWorkbenchLayoutProjection,
  projectId: string,
): DesktopWorkbenchLayoutProjection {
  if (!current.main.views.some((view) => view.projectId === projectId)) {
    return current;
  }
  return {
    ...createDefaultDesktopWorkbenchLayout(current.windowId),
    revision: current.revision + 1,
    primarySidebar: current.primarySidebar,
  };
}

function projectShellState(
  state: DesktopShellStoredState,
  applicationInstanceId: string,
  windowId: string,
  rendererEpoch: number,
  agentHome: DesktopAgentHomeProjection,
  domainCapabilities: readonly DesktopDomainCapabilityProjection[],
): DesktopShellProjection {
  const window = requireStoredWindow(state, windowId);
  const projects: readonly DesktopProjectCatalogItem[] = state.projects.map((project) => ({
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    profile: 'content',
    displayName: project.displayName,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId,
    endpointEpoch: `${applicationInstanceId}:${windowId}:${rendererEpoch}`,
    projectionRevision: state.storageRevision,
    catalog: {
      revision: state.catalogRevision,
      projects,
    },
    window: {
      windowId: window.windowId,
      revision: window.revision,
      activeTarget: window.activeTarget,
      tabs: window.tabs.map((tab) => ({
        ...tab,
        viewEpoch: tab.viewEpoch + Math.max(0, rendererEpoch - 1),
      })),
      workbench: projectWorkbench(
        window.workbench,
        Math.max(0, rendererEpoch - 1),
      ),
    },
    agentHome,
    domains: domainCapabilities,
  };
}

function projectWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  rendererEpochOffset: number,
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    main: {
      ...workbench.main,
      views: workbench.main.views.map((view) => ({
        ...view,
        viewEpoch: view.viewEpoch + rendererEpochOffset,
      })),
    },
  };
}

function openContentProject(
  state: DesktopShellStoredState,
  windowId: string,
  workspace: DesktopWorkspaceResolution,
  now: string,
  createIdentity: () => string,
): DesktopShellStoredState {
  const window = requireStoredWindow(state, windowId);
  const existingProject = state.projects.find(
    (project) => project.workspaceId === workspace.workspaceId,
  );
  const project = existingProject ?? createStoredProject(workspace, now);
  const projectChanged =
    existingProject !== undefined &&
    (existingProject.workspacePath !== workspace.workspacePath ||
      existingProject.displayName !== workspace.displayName ||
      existingProject.workspaceLocator.kind !== workspace.locator.kind ||
      existingProject.workspaceLocator.value !== workspace.locator.value);
  const projects = existingProject
    ? state.projects.map((candidate) =>
        candidate.projectId === existingProject.projectId && projectChanged
          ? {
              ...candidate,
              displayName: workspace.displayName,
              workspacePath: workspace.workspacePath,
              workspaceLocator: workspace.locator,
              updatedAt: now,
            }
          : candidate,
      )
    : [...state.projects, project];
  const existingTab = window.tabs.find((tab) => tab.projectId === project.projectId);
  const tab = existingTab ?? {
    tabId: `tab:${windowId}:${project.projectId}`,
    projectId: project.projectId,
    viewId: `view:${createIdentity()}`,
    viewEpoch: 1,
  };
  const activeAlready =
    window.activeTarget.kind === 'project' && window.activeTarget.tabId === tab.tabId;
  const workbench = attachProjectWorkbench(window.workbench, project);
  if (
    existingProject &&
    !projectChanged &&
    existingTab &&
    activeAlready &&
    workbench === window.workbench
  ) {
    return state;
  }
  const updatedWindow: DesktopStoredWindow = {
    ...window,
    revision: window.revision + 1,
    tabs: existingTab ? window.tabs : [...window.tabs, tab],
    activeTarget: { kind: 'project', tabId: tab.tabId },
    workbench,
  };
  return {
    ...state,
    storageRevision: state.storageRevision + 1,
    catalogRevision:
      existingProject && !projectChanged ? state.catalogRevision : state.catalogRevision + 1,
    projects,
    windows: state.windows.map((candidate) =>
      candidate.windowId === windowId ? updatedWindow : candidate,
    ),
  };
}

function attachProjectWorkbench(
  current: DesktopWorkbenchLayoutProjection,
  project: DesktopStoredProject,
): DesktopWorkbenchLayoutProjection {
  if (
    current.main.views.every(
      (view) => view.projectId === project.projectId && view.workspaceId === project.workspaceId,
    )
  ) {
    return current;
  }
  const reset = createDefaultDesktopWorkbenchLayout(current.windowId);
  return {
    ...reset,
    revision: current.revision + 1,
    primarySidebar: current.primarySidebar,
    resourceDock: {
      ...current.resourceDock,
      presentation: 'hidden',
    },
    display: {
      ...current.display,
      mode: 'chat-only',
    },
  };
}

function restoreTransientWorkbench(
  state: DesktopShellStoredState,
  window: DesktopStoredWindow,
): DesktopWorkbenchLayoutProjection {
  const hasTemporaryPreview = window.workbench.main.views.some(
    (view) =>
      view.kind === 'preview' &&
      view.previewPresentation === 'temporary' &&
      view.ownerId.startsWith('preview-session:'),
  );
  if (!hasTemporaryPreview) return window.workbench;
  if (window.activeTarget.kind === 'project') {
    const activeTabId = window.activeTarget.tabId;
    const tab = window.tabs.find((candidate) => candidate.tabId === activeTabId);
    if (!tab) {
      throw new Error(
        `Desktop active Project Tab '${activeTabId}' is unavailable during Workbench restore.`,
      );
    }
    let restored = window.workbench;
    for (const view of window.workbench.main.views) {
      if (
        view.kind === 'preview' &&
        view.previewPresentation === 'temporary' &&
        view.ownerId.startsWith('preview-session:')
      ) {
        restored = closeMainView(restored, view.viewId);
      }
    }
    return restored;
  }
  return {
    ...createDefaultDesktopWorkbenchLayout(window.windowId),
    revision: window.workbench.revision + 1,
  };
}

function requireStoredProject(
  state: DesktopShellStoredState,
  projectId: string,
): DesktopStoredProject {
  const project = state.projects.find((candidate) => candidate.projectId === projectId);
  if (!project) {
    throw new DesktopShellContractError(
      'desktop-shell-project-not-found',
      `Desktop Project '${projectId}' is not present in Host state.`,
    );
  }
  return project;
}

function staleWorkbenchRevision(
  windowId: string,
  expected: number,
  actual: number,
): DesktopShellContractError {
  return new DesktopShellContractError(
    'desktop-shell-stale-revision',
    `Desktop Workbench revision ${expected} is stale for Window '${windowId}'; current revision is ${actual}.`,
  );
}

function createStoredProject(
  workspace: DesktopWorkspaceResolution,
  now: string,
): DesktopStoredProject {
  return {
    projectId: `content:${workspace.workspaceId}`,
    workspaceId: workspace.workspaceId,
    profile: 'content',
    displayName: workspace.displayName,
    workspacePath: workspace.workspacePath,
    workspaceLocator: workspace.locator,
    createdAt: now,
    updatedAt: now,
  };
}

function requireStoredWindow(
  state: DesktopShellStoredState,
  windowId: string,
): DesktopStoredWindow {
  const window = state.windows.find((candidate) => candidate.windowId === windowId);
  if (!window) throw new Error(`Desktop Shell state has no Window '${windowId}'.`);
  return window;
}

function unavailableDomain(
  surface: DesktopDomainCapabilityProjection['surface'],
  ownerSlice: DesktopDomainCapabilityProjection['ownerSlice'],
): DesktopDomainCapabilityProjection {
  return {
    surface,
    status: 'unavailable',
    ownerSlice,
    diagnosticCode: 'desktop-domain-surface-unavailable',
  };
}

function requireIdentity(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} is required.`);
}

function staleWindowRevision(
  windowId: string,
  expectedRevision: number,
  currentRevision: number,
): DesktopShellContractError {
  return new DesktopShellContractError(
    'desktop-shell-stale-revision',
    `Desktop Window '${windowId}' revision ${expectedRevision} is stale; current revision is ${currentRevision}.`,
  );
}
