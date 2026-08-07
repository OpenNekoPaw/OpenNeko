import { randomUUID } from 'node:crypto';
import type { HostDiagnostic } from './ports';
import {
  isSameAgentConversationOwner,
  type AgentConversationOwnerRef,
  type DesktopAgentViewIdentity,
} from '@neko/agent-contracts';
import {
  DesktopShellContractError,
  projectDesktopConversationNavigation,
  type DesktopAgentHomeNavigationIdentity,
  type DesktopDomainCapabilityProjection,
  type DesktopAgentHomeProjection,
  type DesktopProfileRequestResult,
  type DesktopProjectCatalogItem,
  type DesktopShellProjection,
  type DesktopShellProjectionEvent,
  type DesktopShellStateDiagnosticProjection,
  type DesktopUnavailableProjectProfile,
} from './desktop-shell-contract';
import {
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  openOrFocusMainView,
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from './desktop-workbench-contract';
import {
  createDesktopWindowComposition,
  type DesktopWindowCompositionProjection,
} from './desktop-window-composition-contract';
import {
  applyDesktopApplicationSidebarMutation,
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
  DesktopSceneContractError,
  parseDesktopSceneTransitionRequest,
  parseDesktopWorkbenchSceneProjection,
  type DesktopApplicationSidebarMutationRequest,
  type DesktopApplicationSidebarProjection,
  type DesktopAgentScopeProjection,
  type DesktopAgentInteractionSurfaceRef,
  type DesktopSceneTransitionIntent,
  type DesktopSceneTransitionRequest,
  type DesktopSceneTransitionResult,
  type DesktopWorkbenchSceneProjection,
} from './desktop-scene-contract';
import type {
  DesktopShellStateRepositoryPort,
  DesktopShellStoredState,
  DesktopStoredProject,
  DesktopStoredProjectTab,
  DesktopStoredWindow,
} from './desktop-shell-state';
import {
  DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
  readDesktopShellStateDiagnostics,
} from './desktop-shell-state';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type { CanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import type { CutHostRuntimeIdentity } from '@neko/cut-domain';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import { createCutHostSessionId } from '@neko/cut-domain';
import type { DesktopStartupTargetPreference } from './application-settings-contract';
import type { DesktopWorkspaceGrantAuthorityPort } from './desktop-workspace-grant-authority';
import type { AgentConversationContext } from '@neko/agent-contracts';

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
  readonly stateRepository: DesktopShellStateRepositoryPort;
  readonly workspaceRegistry: DesktopWorkspaceResolutionPort;
  readonly workspaceGrantAuthority?: DesktopWorkspaceGrantAuthorityPort;
  readonly startupTarget: DesktopStartupTargetPreference;
  readonly startupStateDiagnostics?: readonly DesktopShellStateDiagnosticProjection[];
  readonly retainedProjects?: readonly DesktopProjectCatalogItem[];
  readonly createIdentity?: () => string;
  readonly now?: () => string;
}

export interface DesktopWorkspaceResolutionPort {
  resolve(workspacePath: string): Promise<AssetWorkspaceResolution>;
  removeProjects?(workspaceIds: readonly string[]): Promise<boolean>;
  dispose(): Promise<void>;
}

export class DesktopShellAgentIdentityError extends Error {
  constructor(
    readonly code: 'desktop-agent-identity-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'DesktopShellAgentIdentityError';
  }
}

export interface DesktopAgentHomeProjectionSource {
  readHomeProjection(): DesktopAgentHomeProjection;
  subscribeHomeProjection(listener: () => void): () => void;
}

export interface DesktopShellOpenContentResult {
  readonly projection: DesktopShellProjection;
  readonly workspace: AssetWorkspaceResolution;
}

export interface DesktopProjectCatalogRemovalResult {
  readonly projection: DesktopShellProjection;
}

export interface DesktopAgentViewGrant extends DesktopAgentViewIdentity {
  readonly windowId: string;
  readonly workspaceId: string;
}

export interface DesktopAgentSurfaceGrant {
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly workbench: DesktopWindowCompositionProjection;
  readonly interaction: DesktopAgentInteractionSurfaceRef;
}

export interface DesktopCanvasViewGrant {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly workspace: AssetWorkspaceResolution;
}

export interface DesktopCutViewGrant {
  readonly identity: CutHostRuntimeIdentity;
  readonly workspace: AssetWorkspaceResolution;
}

interface DesktopWindowRuntime {
  rendererSessionId: string | undefined;
  sequence: number;
  readonly subscribers: Set<(event: DesktopShellProjectionEvent) => void>;
}

export class DesktopShellService {
  private readonly activeWindows = new Map<string, DesktopWindowRuntime>();
  private readonly retainedProjects = new Map<string, DesktopProjectCatalogItem>();
  private isolatedWindowDiagnostics: readonly DesktopShellStateDiagnosticProjection[] = [];
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
    for (const project of options.retainedProjects ?? []) {
      this.retainedProjects.set(project.projectId, project);
    }
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
      throw new Error(
        'Desktop Preview capability must be configured before any Window is claimed.',
      );
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
      let state = await this.options.stateRepository.read();
      const isolatedWindowDiagnostics = readDesktopShellStateDiagnostics(state).filter(
        (diagnostic) => diagnostic.code === 'desktop-stored-window-invalid',
      );
      if (isolatedWindowDiagnostics.length > 0) {
        this.isolatedWindowDiagnostics = isolatedWindowDiagnostics;
        await this.options.stateRepository.commit(state);
        state = await this.options.stateRepository.read();
      }
      const reusablePrimary =
        state.primaryWindowId !== null && !this.activeWindows.has(state.primaryWindowId)
          ? state.primaryWindowId
          : null;
      const windowId = reusablePrimary ?? this.createIdentity();
      if (!state.windows.some((window) => window.windowId === windowId)) {
        const scene = createDefaultDesktopAgentScene(windowId, `draft:${this.createIdentity()}`);
        const workbench = createDesktopWindowComposition({
          workbenchInstanceId: `workbench:${this.createIdentity()}`,
          layout: createDefaultDesktopWorkbenchLayout(windowId),
          scene,
        });
        const next = await this.options.stateRepository.commit({
          ...state,
          primaryWindowId: state.primaryWindowId ?? windowId,
          windows: [
            ...state.windows,
            {
              windowId,
              activeTarget: { kind: 'home' },
              tabs: [],
              workbench,
              applicationSidebar: createDefaultDesktopApplicationSidebar(windowId),
            },
          ],
        });
        this.installWindowRuntime(windowId);
        await this.emitAll(next);
        return windowId;
      }
      const restoredWindow = requireStoredWindow(state, windowId);
      const qualifiedWindow = this.agentHomeProjectionSource
        ? reconcilePersistedAgentSurface(
            restoredWindow,
            this.readAgentHomeProjection(),
            this.createIdentity,
          )
        : restoredWindow;
      const restoredWorkbench = restoreWindowWorkbench(state, qualifiedWindow, this.createIdentity);
      const restoredScene = synchronizeWorkspaceSceneWithWorkbench(
        activeDesktopWorkbench(qualifiedWindow).scene,
        restoredWorkbench,
      );
      const restoredActiveTarget =
        this.options.startupTarget === 'home' && restoredWindow.activeTarget.kind !== 'home'
          ? ({ kind: 'home' } as const)
          : restoredWindow.activeTarget;
      if (
        qualifiedWindow !== restoredWindow ||
        restoredWorkbench !== activeDesktopWorkbench(qualifiedWindow).layout ||
        restoredScene !== activeDesktopWorkbench(qualifiedWindow).scene ||
        restoredActiveTarget !== restoredWindow.activeTarget
      ) {
        await this.options.stateRepository.commit({
          ...state,
          windows: state.windows.map((window) =>
            window.windowId === windowId
              ? replaceActiveDesktopWorkbench(
                  {
                    ...qualifiedWindow,
                    activeTarget: restoredActiveTarget,
                  },
                  { layout: restoredWorkbench, scene: restoredScene },
                )
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
    this.options.workspaceGrantAuthority?.releaseWindow(windowId);
  }

  setRendererSessionId(windowId: string, rendererSessionId: string): void {
    const runtime = this.requireWindowRuntime(windowId);
    if (rendererSessionId.trim().length === 0) {
      throw new Error(`Desktop renderer session identity is required for Window '${windowId}'.`);
    }
    if (rendererSessionId === runtime.rendererSessionId) {
      throw new Error(`Desktop renderer session '${rendererSessionId}' is already active.`);
    }
    runtime.rendererSessionId = rendererSessionId;
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
    const state = await this.options.stateRepository.read();
    return projectShellState(
      state,
      this.options.applicationInstanceId,
      windowId,
      this.rendererSessionId(windowId),
      this.readAgentHomeProjection(),
      this.domainCapabilities(),
      this.startupStateDiagnostics(),
      [...this.retainedProjects.values()],
    );
  }

  async getSceneProjection(windowId: string): Promise<DesktopWorkbenchSceneProjection> {
    this.requireActive();
    this.requireWindowRuntime(windowId);
    const state = await this.options.stateRepository.read();
    return activeDesktopWorkbench(requireStoredWindow(state, windowId)).scene;
  }

  async getApplicationSidebarProjection(
    windowId: string,
  ): Promise<DesktopApplicationSidebarProjection> {
    this.requireActive();
    this.requireWindowRuntime(windowId);
    const state = await this.options.stateRepository.read();
    return requireStoredWindow(state, windowId).applicationSidebar;
  }

  async transitionScene(
    requestValue: DesktopSceneTransitionRequest,
  ): Promise<DesktopSceneTransitionResult> {
    const request = parseDesktopSceneTransitionRequest(requestValue);
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(request.windowId, request.rendererSessionId);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, request.windowId);
      if (activeDesktopWorkbench(window).scene.sceneId !== request.sceneId) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          `Desktop Scene '${request.sceneId}' is stale; current Scene is '${activeDesktopWorkbench(window).scene.sceneId}'.`,
        );
      }
      if (
        request.intent.kind === 'open-workspace' ||
        request.intent.kind === 'open-project-workspace'
      ) {
        const targetProjectId =
          request.intent.kind === 'open-project-workspace' ? request.intent.projectId : undefined;
        const targetStoredProject = targetProjectId
          ? state.projects.find((project) => project.projectId === targetProjectId)
          : undefined;
        const targetRetainedProject = targetProjectId
          ? this.retainedProjects.get(targetProjectId)
          : undefined;
        const targetProject =
          targetProjectId !== undefined
            ? (targetStoredProject ?? targetRetainedProject)
            : undefined;
        if (request.intent.kind === 'open-project-workspace' && !targetProject) {
          throw new DesktopShellContractError(
            'desktop-shell-project-not-found',
            `Desktop Project '${request.intent.projectId}' is not present in the stable catalog.`,
          );
        }
        const targetUnavailable =
          targetRetainedProject &&
          targetProject &&
          targetRetainedProject.workspaceId === targetProject.workspaceId
            ? targetRetainedProject.unavailable
            : undefined;
        if (targetProject && targetUnavailable) {
          return unavailableWorkspaceSceneTransition(
            request,
            `Desktop Project '${targetProject.projectId}' is unavailable: ${targetUnavailable.fieldNames.join(', ')}: ${targetUnavailable.message}`,
          );
        }
        const activeScene = activeDesktopWorkbench(window).scene;
        if (
          targetStoredProject &&
          window.activeTarget.kind === 'project' &&
          window.activeTarget.tabId ===
            requireProjectTab(window, targetStoredProject.projectId).tabId &&
          activeScene.context.kind === 'agent' &&
          activeScene.context.scope.kind === 'workspace' &&
          activeScene.context.scope.workspaceId === targetStoredProject.workspaceId &&
          activeScene.context.scope.conversationId === undefined &&
          activeScene.slots.interaction?.kind === 'agent' &&
          activeScene.slots.interaction.phase === 'draft'
        ) {
          return {
            status: 'transitioned',
            requestId: request.requestId,
            scene: activeScene,
          };
        }
        const workspaceGrantAuthority = this.options.workspaceGrantAuthority;
        if (!workspaceGrantAuthority) return unavailableWorkspaceSceneTransition(request);
        let resolution;
        if (request.intent.kind === 'open-workspace') {
          resolution = await workspaceGrantAuthority.resolve(
            request.windowId,
            request.intent.workspaceGrantId,
          );
        } else {
          if (!targetProject) {
            throw new Error('Desktop Project catalog resolution lost its validated identity.');
          }
          resolution = await workspaceGrantAuthority.restore(
            request.windowId,
            `workspace-grant:project:${this.createIdentity()}`,
            targetProject.workspaceId,
          );
        }
        const opened = openContentProject(
          state,
          request.windowId,
          resolution.workspace,
          this.now(),
          this.createIdentity,
        );
        const openedWindow = requireStoredWindow(opened, request.windowId);
        const project = requireWorkspaceProject(opened, resolution.workspace.workspaceId);
        const tab = requireProjectTab(openedWindow, project.projectId);
        const workspaceWorkbench = attachProjectWorkbench(
          openedWindow.workbench.layout,
          project,
          this.createIdentity,
        );
        const scene = createWorkspaceAgentScene({
          current: activeScene,
          draftId:
            activeScene.context.kind === 'agent' && activeScene.context.scope.kind === 'unbound'
              ? activeScene.context.scope.draftId
              : `draft:${this.createIdentity()}`,
          workspaceGrantId: resolution.workspaceGrantId,
          workspaceId: resolution.workspace.workspaceId,
          tab,
          workbench: workspaceWorkbench,
        });
        const next: DesktopShellStoredState = {
          ...opened,
          windows: opened.windows.map((candidate) =>
            candidate.windowId === request.windowId
              ? putSceneWorkbench({
                  window: candidate,
                  scene,
                  layout: workspaceWorkbench,
                })
              : candidate,
          ),
        };
        this.assertMutationContext(request.windowId, request.rendererSessionId);
        const committed = await this.options.stateRepository.commit(next);
        await this.emitAll(committed);
        return { status: 'transitioned', requestId: request.requestId, scene };
      }
      const unavailable = unavailableSceneTransition(request);
      if (unavailable) return unavailable;
      const scene = createTransitionedScene(
        activeDesktopWorkbench(window).scene,
        request.intent,
        this.createIdentity,
      );
      this.assertMutationContext(request.windowId, request.rendererSessionId);
      const committed = await this.options.stateRepository.commit({
        ...state,
        windows: state.windows.map((candidate) =>
          candidate.windowId === request.windowId
            ? putSceneWorkbench({
                window: candidate,
                scene,
              })
            : candidate,
        ),
      });
      await this.emitAll(committed);
      return { status: 'transitioned', requestId: request.requestId, scene };
    });
  }

  async updateApplicationSidebar(
    request: DesktopApplicationSidebarMutationRequest,
  ): Promise<DesktopShellProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(request.windowId, request.rendererSessionId);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, request.windowId);
      const applicationSidebar = applyDesktopApplicationSidebarMutation({
        projection: window.applicationSidebar,
        request,
        rendererSessionId: this.rendererSessionId(request.windowId),
      });
      this.assertMutationContext(request.windowId, request.rendererSessionId);
      const committed = await this.options.stateRepository.commit({
        ...state,
        windows: state.windows.map((candidate) =>
          candidate.windowId === request.windowId
            ? { ...candidate, applicationSidebar }
            : candidate,
        ),
      });
      await this.emitAll(committed);
      return this.projectWindow(committed, request.windowId);
    });
  }

  async attachAgentConversation(input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly agentViewId: string;
    readonly context: AgentConversationContext;
    readonly conversationId: string;
  }): Promise<DesktopWorkbenchSceneProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(input.windowId, input.rendererSessionId);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, input.windowId);
      const current = activeDesktopWorkbench(window).scene;
      const interaction = current.slots.interaction;
      if (
        current.context.kind === 'agent' &&
        current.context.scope.kind !== 'unbound' &&
        current.context.agentViewId === input.agentViewId &&
        current.context.scope.conversationId === input.conversationId &&
        conversationContextMatchesSceneScope(input.context, current.context.scope) &&
        interaction?.kind === 'agent' &&
        interaction.scope.kind !== 'unbound' &&
        interaction.agentViewId === input.agentViewId &&
        interaction.phase === 'session' &&
        interaction.scope.conversationId === input.conversationId
      ) {
        return current;
      }
      if (
        current.context.kind !== 'agent' ||
        current.context.agentViewId !== input.agentViewId ||
        !interaction ||
        interaction.kind !== 'agent' ||
        interaction.agentViewId !== input.agentViewId ||
        interaction.phase !== 'draft' ||
        (current.context.scope.kind !== 'unbound' &&
          current.context.scope.conversationId !== undefined) ||
        (current.context.scope.kind === 'unbound'
          ? input.context.kind !== 'assistant'
          : !conversationContextMatchesSceneScope(input.context, current.context.scope))
      ) {
        throw new DesktopSceneContractError(
          'desktop-scene-scope-mismatch',
          'Committed Agent Conversation does not match the exact active draft Scene.',
        );
      }
      const scope =
        current.context.scope.kind === 'unbound'
          ? createAssistantConversationScope(
              current.context.scope.draftId,
              input.context,
              input.conversationId,
            )
          : { ...current.context.scope, conversationId: input.conversationId };
      const scene = parseDesktopWorkbenchSceneProjection({
        ...current,
        context: { ...current.context, scope },
        slots: {
          ...current.slots,
          interaction: { ...interaction, phase: 'session', scope },
        },
      });
      this.assertMutationContext(input.windowId, input.rendererSessionId);
      const committed = await this.options.stateRepository.commit({
        ...state,
        windows: state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? putSceneWorkbench({
                window: candidate,
                scene,
              })
            : candidate,
        ),
      });
      await this.emitAll(committed);
      return scene;
    });
  }

  async restoreAgentConversation(input: {
    readonly request: DesktopSceneTransitionRequest;
    readonly context: AgentConversationContext;
  }): Promise<DesktopSceneTransitionResult> {
    const request = parseDesktopSceneTransitionRequest(input.request);
    if (request.intent.kind !== 'restore-conversation') {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        'Agent Conversation restore requires a restore-conversation intent.',
      );
    }
    const navigation = request.intent.navigation;
    const conversationId = navigation.conversationId;
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(request.windowId, request.rendererSessionId);
      const state = await this.options.stateRepository.read();
      const window = captureActiveProjectPresentation(requireStoredWindow(state, request.windowId));
      if (activeDesktopWorkbench(window).scene.sceneId !== request.sceneId) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          `Desktop Scene '${request.sceneId}' is stale; current Scene is '${activeDesktopWorkbench(window).scene.sceneId}'.`,
        );
      }
      const context = input.context;
      const homeConversation = this.readAgentHomeProjection().conversations.find(
        (candidate) =>
          candidate.navigation.conversationId === navigation.conversationId &&
          isSameAgentConversationOwner(candidate.navigation.owner, navigation.owner),
      );
      if (!homeConversation) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          `Agent Conversation '${conversationId}' does not match the authoritative navigation owner.`,
        );
      }
      if (homeConversation.unavailable) {
        return unavailableConversationSceneTransition(
          request,
          homeConversation.navigation.owner.kind,
          homeConversation.unavailable.message,
        );
      }
      const contextOwner =
        context.kind === 'assistant'
          ? { kind: 'assistant' as const, assistantSpaceId: context.assistantSpaceId }
          : { kind: 'workspace' as const, workspaceId: context.workspaceId };
      if (!isSameAgentConversationOwner(navigation.owner, contextOwner)) {
        throw new DesktopSceneContractError(
          'desktop-scene-scope-mismatch',
          `Agent Conversation '${conversationId}' lifecycle context does not match its navigation owner.`,
        );
      }
      let draft: DesktopWorkbenchSceneProjection;
      let workspaceAttachment:
        | {
            readonly tab: DesktopStoredWindow['tabs'][number];
            readonly workbench: DesktopWorkbenchLayoutProjection;
          }
        | undefined;
      if (context.kind === 'assistant') {
        draft = createAssistantAgentScene({
          current: activeDesktopWorkbench(window).scene,
          assistantSpaceId: context.assistantSpaceId,
          draftId: `draft:${this.createIdentity()}`,
        });
      } else {
        const project = state.projects.find(
          (candidate) => candidate.workspaceId === context.workspaceId,
        );
        if (!project) {
          throw new DesktopSceneContractError(
            'desktop-scene-stale-identity',
            `Workspace Conversation '${conversationId}' has no exact stored Workspace identity.`,
          );
        }
        const tab = window.tabs.find((candidate) => candidate.projectId === project.projectId);
        if (!tab) {
          throw new DesktopSceneContractError(
            'desktop-scene-stale-identity',
            `Workspace Conversation '${conversationId}' has no exact Window View.`,
          );
        }
        const workbench = attachProjectWorkbench(
          tab.presentation ?? createDefaultDesktopWorkbenchLayout(window.windowId),
          project,
          this.createIdentity,
        );
        workspaceAttachment = {
          tab: { ...tab, presentation: workbench },
          workbench,
        };
        draft = createWorkspaceAgentScene({
          current: activeDesktopWorkbench(window).scene,
          draftId: `draft:${this.createIdentity()}`,
          workspaceGrantId: context.workspaceGrantId,
          workspaceId: context.workspaceId,
          tab,
          workbench,
        });
      }
      const scene = attachConversationToDraftScene(draft, context, conversationId);
      this.assertMutationContext(request.windowId, request.rendererSessionId);
      const committed = await this.options.stateRepository.commit({
        ...state,
        windows: state.windows.map((candidate) => {
          if (candidate.windowId !== request.windowId) return candidate;
          if (!workspaceAttachment) return putSceneWorkbench({ window, scene });
          return putSceneWorkbench({
            window: {
              ...window,
              tabs: window.tabs.map((tab) =>
                tab.tabId === workspaceAttachment.tab.tabId ? workspaceAttachment.tab : tab,
              ),
              activeTarget: {
                kind: 'project',
                tabId: workspaceAttachment.tab.tabId,
              },
            },
            scene,
            layout: workspaceAttachment.workbench,
          });
        }),
      });
      await this.emitAll(committed);
      return { status: 'transitioned', requestId: request.requestId, scene };
    });
  }

  async projectAssetCenterPreview(input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly assetCenterSessionId: string;
    readonly previewSessionId?: string;
  }): Promise<DesktopWorkbenchSceneProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(input.windowId, input.rendererSessionId);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, input.windowId);
      const activeScene = activeDesktopWorkbench(window).scene;
      if (
        activeScene.context.kind !== 'asset-center' ||
        activeScene.context.assetCenterSessionId !== input.assetCenterSessionId
      ) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          'Asset Center Preview does not match the active Scene.',
        );
      }
      const { secondaryMain: _secondaryMain, ...slotsWithoutSecondaryMain } = activeScene.slots;
      const scene = parseDesktopWorkbenchSceneProjection({
        ...activeScene,
        slots: {
          ...slotsWithoutSecondaryMain,
          ...(input.previewSessionId
            ? {
                secondaryMain: {
                  kind: 'asset-preview',
                  assetCenterSessionId: input.assetCenterSessionId,
                  previewSessionId: input.previewSessionId,
                },
              }
            : {}),
        },
      });
      const committed = await this.options.stateRepository.commit({
        ...state,
        windows: state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? putSceneWorkbench({
                window: candidate,
                scene,
              })
            : candidate,
        ),
      });
      await this.emitAll(committed);
      return scene;
    });
  }

  async projectAssistantPreview(input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly assistantSpaceId: string;
    readonly conversationId: string;
    readonly previewSessionId?: string;
    readonly scratchArtifactId?: string;
  }): Promise<DesktopWorkbenchSceneProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(input.windowId, input.rendererSessionId);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, input.windowId);
      const scene = activeDesktopWorkbench(window).scene;
      if (
        scene.context.kind !== 'agent' ||
        scene.context.scope.kind !== 'assistant' ||
        scene.context.scope.assistantSpaceId !== input.assistantSpaceId ||
        scene.context.scope.conversationId !== input.conversationId ||
        scene.slots.interaction?.kind !== 'agent' ||
        scene.slots.interaction.phase !== 'session'
      ) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          'Assistant Preview does not match the exact active Conversation Scene.',
        );
      }
      const { main: _main, ...slotsWithoutMain } = scene.slots;
      const next = parseDesktopWorkbenchSceneProjection({
        ...scene,
        slots: {
          ...slotsWithoutMain,
          ...(input.previewSessionId && input.scratchArtifactId
            ? {
                main: {
                  kind: 'assistant-preview' as const,
                  previewSessionId: input.previewSessionId,
                  assistantSpaceId: input.assistantSpaceId,
                  conversationId: input.conversationId,
                  scratchArtifactId: input.scratchArtifactId,
                },
              }
            : {}),
        },
      });
      this.assertMutationContext(input.windowId, input.rendererSessionId);
      const committed = await this.options.stateRepository.commit({
        ...state,
        windows: state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? putSceneWorkbench({
                window: candidate,
                scene: next,
              })
            : candidate,
        ),
      });
      await this.emitAll(committed);
      return next;
    });
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
      throw new DesktopShellAgentIdentityError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent View '${identity.viewId}' is not granted to Project '${identity.projectId}' in Window '${windowId}'.`,
      );
    }
    return {
      windowId,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      viewId: tab.viewId,
    };
  }

  async resolveAgentSurfaceGrant(
    windowId: string,
    identity: {
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
    },
  ): Promise<DesktopAgentSurfaceGrant> {
    this.requireActive();
    this.requireWindowRuntime(windowId);
    const state = await this.options.stateRepository.read();
    const window = requireStoredWindow(state, windowId);
    const workbench = window.workbench;
    if (workbench.workbenchInstanceId !== identity.workbenchInstanceId) {
      throw new DesktopShellAgentIdentityError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Workbench '${identity.workbenchInstanceId}' is not current in Window '${windowId}'.`,
      );
    }
    const interaction = workbench.scene.slots.interaction;
    if (interaction?.agentSurfaceId !== identity.agentSurfaceId) {
      throw new DesktopShellAgentIdentityError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Surface '${identity.agentSurfaceId}' is not current in Workbench '${identity.workbenchInstanceId}'.`,
      );
    }
    return {
      windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId: interaction.agentSurfaceId,
      workbench,
      interaction,
    };
  }

  async resolveAgentWorkspace(workspaceId: string): Promise<AssetWorkspaceResolution> {
    this.requireActive();
    const state = await this.options.stateRepository.read();
    const project = state.projects.find((candidate) => candidate.workspaceId === workspaceId);
    if (!project) {
      throw new DesktopShellAgentIdentityError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Workspace '${workspaceId}' is not present in the Project catalog.`,
      );
    }
    const retainedProject = this.retainedProjects.get(project.projectId);
    if (retainedProject?.workspaceId === project.workspaceId && retainedProject.unavailable) {
      throw new DesktopShellAgentIdentityError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Workspace '${workspaceId}' is unavailable: ${retainedProject.unavailable.message}`,
      );
    }
    const workspace = await this.options.workspaceRegistry.resolve(project.workspacePath);
    if (workspace.workspaceId !== project.workspaceId) {
      throw new DesktopShellAgentIdentityError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Workspace '${project.workspaceId}' no longer matches its persisted locator.`,
      );
    }
    return workspace;
  }

  async resolveProjectWorkspace(projectId: string): Promise<AssetWorkspaceResolution> {
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
      identity.rendererSessionId !== projection.rendererSessionId
    ) {
      throw new Error('Desktop Canvas Window or renderer identity is stale.');
    }
    const view = projection.window.workbench.layout.main.views.find(
      (candidate) => candidate.viewId === identity.viewId && candidate.kind === 'canvas',
    );
    if (
      !view ||
      view.projectId !== identity.projectId ||
      view.workspaceId !== identity.workspaceId ||
      view.viewInstanceId !== identity.viewInstanceId ||
      view.documentId !== identity.documentId ||
      identity.sessionId !== createCanvasHostSessionId(view.viewId, view.viewInstanceId)
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
      identity.rendererSessionId !== projection.rendererSessionId
    ) {
      throw new Error('Desktop Cut Window or renderer identity is stale.');
    }
    const view = projection.window.workbench.layout.main.views.find(
      (candidate) => candidate.viewId === identity.viewId && candidate.kind === 'cut',
    );
    if (
      !view ||
      view.projectId !== identity.projectId ||
      view.workspaceId !== identity.workspaceId ||
      view.viewInstanceId !== identity.viewInstanceId ||
      view.documentId !== identity.documentId ||
      identity.sessionId !== createCutHostSessionId(view.viewId, view.viewInstanceId)
    ) {
      throw new Error('Desktop Cut View identity is not granted by the active Workbench.');
    }
    return {
      identity: { ...identity },
      workspace: await this.resolveAgentWorkspace(identity.workspaceId),
    };
  }

  async resolveCutCreationGrant(
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
      identity.rendererSessionId !== projection.rendererSessionId
    ) {
      throw new Error('Desktop Cut Window or renderer identity is stale.');
    }
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === identity.projectId,
    );
    const tab = projection.window.tabs.find(
      (candidate) => candidate.projectId === identity.projectId,
    );
    if (
      !project ||
      !tab ||
      project.workspaceId !== identity.workspaceId ||
      tab.viewInstanceId !== identity.viewInstanceId ||
      identity.sessionId !== createCutHostSessionId(identity.viewId, identity.viewInstanceId)
    ) {
      throw new Error('Desktop Cut creation identity is not granted by the active Project.');
    }
    return {
      identity: { ...identity },
      workspace: await this.resolveAgentWorkspace(identity.workspaceId),
    };
  }

  async assertWindowMutationContext(windowId: string, rendererSessionId: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      requireStoredWindow(await this.options.stateRepository.read(), windowId);
    });
  }

  async assertAgentHomeConversation(
    windowId: string,
    rendererSessionId: string,
    navigation: DesktopAgentHomeNavigationIdentity,
  ): Promise<void> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      const state = await this.options.stateRepository.read();
      requireStoredWindow(state, windowId);
      const agentHome = this.readAgentHomeProjection();
      const conversation = agentHome.conversations.find(
        (candidate) =>
          candidate.navigation.conversationId === navigation.conversationId &&
          isSameAgentConversationOwner(candidate.navigation.owner, navigation.owner),
      );
      if (!conversation) {
        throw new DesktopShellContractError(
          'desktop-shell-conversation-not-found',
          `Desktop Agent Home conversation '${navigation.conversationId}' is not present in the authoritative projection.`,
        );
      }
      this.assertMutationContext(windowId, rendererSessionId);
    });
  }

  async removeProjectsFromCatalog(
    windowId: string,
    projectIds: readonly string[],
    rendererSessionId: string,
  ): Promise<DesktopProjectCatalogRemovalResult> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      const state = await this.options.stateRepository.read();
      requireStoredWindow(state, windowId);
      const requestedProjectIds = new Set(projectIds);
      const projects = resolveRequestedProjects(state, this.retainedProjects, projectIds);
      const storedProjectIds = new Set(
        state.projects
          .filter((project) => requestedProjectIds.has(project.projectId))
          .map((project) => project.projectId),
      );
      if (
        this.options.workspaceRegistry.removeProjects &&
        !(await this.options.workspaceRegistry.removeProjects(
          projects.map((project) => project.workspaceId),
        ))
      ) {
        throw new DesktopShellContractError(
          'desktop-shell-project-not-found',
          'One or more Desktop Workspaces are not present in the stable authority.',
        );
      }
      const windows = state.windows.map((window) =>
        [...storedProjectIds].reduce(
          (current, projectId) =>
            removeProjectFromWindow(current, state, projectId, this.createIdentity),
          window,
        ),
      );
      this.assertMutationContext(windowId, rendererSessionId);
      const committed = await this.options.stateRepository.commit({
        ...state,
        projects: state.projects.filter((project) => !requestedProjectIds.has(project.projectId)),
        windows,
      });
      projectIds.forEach((projectId) => this.retainedProjects.delete(projectId));
      await this.emitAll(committed);
      return {
        projection: this.projectWindow(committed, windowId),
      };
    });
  }

  async resolveProjectWorkspaceConversations(
    windowId: string,
    projectIds: readonly string[],
    rendererSessionId: string,
  ): Promise<readonly DesktopAgentHomeNavigationIdentity[]> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      const state = await this.options.stateRepository.read();
      requireStoredWindow(state, windowId);
      const projects = resolveRequestedProjects(state, this.retainedProjects, projectIds);
      const workspaceIds = new Set(projects.map((project) => project.workspaceId));
      const conversations = this.readAgentHomeProjection().conversations.flatMap((conversation) =>
        conversation.navigation.owner.kind === 'workspace' &&
        workspaceIds.has(conversation.navigation.owner.workspaceId)
          ? [conversation.navigation]
          : [],
      );
      this.assertMutationContext(windowId, rendererSessionId);
      return Object.freeze(conversations);
    });
  }

  async openContent(
    windowId: string,
    workspacePath: string,
    rendererSessionId: string,
  ): Promise<DesktopShellOpenContentResult> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      const workspace = await this.options.workspaceRegistry.resolve(workspacePath);
      const state = await this.options.stateRepository.read();
      requireStoredWindow(state, windowId);
      this.assertMutationContext(windowId, rendererSessionId);
      const next = openContentProject(state, windowId, workspace, this.now(), this.createIdentity);
      const committed = next === state ? state : await this.options.stateRepository.commit(next);
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
    rendererSessionId: string,
  ): Promise<DesktopShellOpenContentResult> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      const state = await this.options.stateRepository.read();
      requireStoredWindow(state, windowId);
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
      this.assertMutationContext(windowId, rendererSessionId);
      const next = openContentProject(state, windowId, workspace, this.now(), this.createIdentity);
      const committed = next === state ? state : await this.options.stateRepository.commit(next);
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
      requestId,
      status: 'unavailable',
      diagnostic,
      projection: await this.getProjection(windowId),
    };
  }

  async activateHome(windowId: string, rendererSessionId: string): Promise<DesktopShellProjection> {
    return this.mutateWindow(windowId, rendererSessionId, (window) => {
      if (window.activeTarget.kind === 'home') return window;
      return {
        ...window,
        activeTarget: { kind: 'home' },
      };
    });
  }

  async closeTab(
    windowId: string,
    tabId: string,
    rendererSessionId: string,
  ): Promise<DesktopShellProjection> {
    return this.mutateWindow(windowId, rendererSessionId, (window) => {
      const tabIndex = window.tabs.findIndex((tab) => tab.tabId === tabId);
      if (tabIndex < 0) {
        throw new Error(`Unknown Desktop Project Tab '${tabId}' for Window '${windowId}'.`);
      }
      const tabs = window.tabs.filter((tab) => tab.tabId !== tabId);
      const wasActive =
        window.activeTarget.kind === 'project' && window.activeTarget.tabId === tabId;
      const workbench = wasActive
        ? createDesktopWindowComposition({
            workbenchInstanceId: window.workbench.workbenchInstanceId,
            layout: createDefaultDesktopWorkbenchLayout(windowId),
            scene: createDefaultDesktopAgentScene(windowId, `draft:${this.createIdentity()}`),
          })
        : window.workbench;
      return {
        ...window,
        tabs,
        activeTarget: wasActive ? { kind: 'home' } : window.activeTarget,
        workbench,
      };
    });
  }

  async updateWorkbench(
    windowId: string,
    rendererSessionId: string,
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<DesktopShellProjection> {
    const parsed = parseDesktopWorkbenchLayout(workbench);
    return this.mutateWindow(windowId, rendererSessionId, (window, state) => {
      const instance = window.workbench;
      if (instance.workbenchInstanceId !== workbenchInstanceId) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          `Desktop Workbench instance '${workbenchInstanceId}' is unavailable.`,
        );
      }
      if (parsed.windowId !== windowId) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          'Desktop Workbench mutation has invalid Window identity.',
        );
      }
      if (window.activeTarget.kind !== 'project') {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          'Desktop Workbench mutation requires an active Project attachment.',
        );
      }
      const activeTabId = window.activeTarget.tabId;
      const tab = window.tabs.find((candidate) => candidate.tabId === activeTabId);
      if (!tab) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          'Desktop Workbench active Project attachment is missing.',
        );
      }
      const project = requireStoredProject(state, tab.projectId);
      for (const view of parsed.main.views) {
        if (view.projectId !== project.projectId || view.workspaceId !== project.workspaceId) {
          throw new DesktopShellContractError(
            'desktop-shell-project-identity-mismatch',
            `Desktop Workbench View '${view.viewId}' belongs to another Project.`,
          );
        }
      }
      return {
        ...window,
        tabs: window.tabs.map((candidate) =>
          candidate.tabId === tab.tabId ? { ...candidate, presentation: parsed } : candidate,
        ),
        workbench: createDesktopWindowComposition({
          workbenchInstanceId: instance.workbenchInstanceId,
          layout: parsed,
          scene: synchronizeWorkspaceSceneWithWorkbench(instance.scene, parsed),
        }),
      };
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeAgentHomeProjectionSubscription?.();
    this.disposeAgentHomeProjectionSubscription = undefined;
    await this.operationTail;
    this.activeWindows.clear();
    this.options.workspaceGrantAuthority?.dispose();
    await this.options.workspaceRegistry.dispose();
  }

  private async mutateWindow(
    windowId: string,
    rendererSessionId: string,
    mutate: (window: DesktopStoredWindow, state: DesktopShellStoredState) => DesktopStoredWindow,
  ): Promise<DesktopShellProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, windowId);
      this.assertMutationContext(windowId, rendererSessionId);
      const updatedWindow = mutate(window, state);
      if (updatedWindow === window) return this.projectWindow(state, windowId);
      const committed = await this.options.stateRepository.commit({
        ...state,
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
      const rendererSessionId = runtime.rendererSessionId;
      if (!rendererSessionId) continue;
      const projection = projectShellState(
        state,
        this.options.applicationInstanceId,
        windowId,
        rendererSessionId,
        this.readAgentHomeProjection(),
        this.domainCapabilities(),
        this.startupStateDiagnostics(),
        [...this.retainedProjects.values()],
      );
      runtime.sequence += 1;
      const event: DesktopShellProjectionEvent = {
        applicationInstanceId: this.options.applicationInstanceId,
        windowId,
        rendererSessionId,
        sequence: runtime.sequence,
        projection,
      };
      for (const subscriber of runtime.subscribers) subscriber(event);
    }
  }

  private projectWindow(state: DesktopShellStoredState, windowId: string): DesktopShellProjection {
    return projectShellState(
      state,
      this.options.applicationInstanceId,
      windowId,
      this.rendererSessionId(windowId),
      this.readAgentHomeProjection(),
      this.domainCapabilities(),
      this.startupStateDiagnostics(),
      [...this.retainedProjects.values()],
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
      if (capability.surface === 'media-library' && this.resourceBrowserCapabilityReady) {
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

  private startupStateDiagnostics(): readonly DesktopShellStateDiagnosticProjection[] {
    return [...(this.options.startupStateDiagnostics ?? []), ...this.isolatedWindowDiagnostics];
  }

  private installWindowRuntime(windowId: string): void {
    if (this.activeWindows.has(windowId)) {
      throw new Error(`Desktop Window '${windowId}' is already active.`);
    }
    this.activeWindows.set(windowId, {
      rendererSessionId: undefined,
      sequence: 0,
      subscribers: new Set(),
    });
  }

  private requireWindowRuntime(windowId: string): DesktopWindowRuntime {
    const runtime = this.activeWindows.get(windowId);
    if (!runtime) throw new Error(`Desktop Window '${windowId}' is not attached to Shell state.`);
    return runtime;
  }

  private assertMutationContext(windowId: string, rendererSessionId: string): void {
    const currentRendererSessionId = this.rendererSessionId(windowId);
    if (rendererSessionId !== currentRendererSessionId) {
      throw new DesktopShellContractError(
        'desktop-shell-request-mismatch',
        `Desktop renderer session '${rendererSessionId}' does not match the active session '${currentRendererSessionId}'.`,
      );
    }
  }

  private rendererSessionId(windowId: string): string {
    const runtime = this.requireWindowRuntime(windowId);
    if (!runtime.rendererSessionId) {
      throw new Error(`Desktop Window '${windowId}' has no active renderer session.`);
    }
    return runtime.rendererSessionId;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Shell service is disposed.');
  }

  private readAgentHomeProjection(): DesktopAgentHomeProjection {
    this.requireAgentHomeProjectionHealthy();
    return (
      this.agentHomeProjectionSource?.readHomeProjection() ?? {
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

function reconcilePersistedAgentSurface(
  window: DesktopStoredWindow,
  agentHome: DesktopAgentHomeProjection,
  createIdentity: () => string,
): DesktopStoredWindow {
  const interaction = window.workbench.scene.slots.interaction;
  if (!interaction || isPersistedAgentSurfaceQualified(interaction, agentHome)) return window;
  return replaceActiveDesktopWorkbench(window, {
    scene: createReplacementAgentDraftScene(window.workbench, `draft:${createIdentity()}`),
  });
}

function isPersistedAgentSurfaceQualified(
  interaction: DesktopAgentInteractionSurfaceRef,
  agentHome: DesktopAgentHomeProjection,
): boolean {
  if (interaction.phase === 'draft') return true;
  const scope = interaction.scope;
  if (scope.kind === 'unbound' || scope.conversationId === undefined) return false;
  const owner =
    scope.kind === 'assistant'
      ? { kind: 'assistant' as const, assistantSpaceId: scope.assistantSpaceId }
      : { kind: 'workspace' as const, workspaceId: scope.workspaceId };
  return agentHome.conversations.some(
    (conversation) =>
      conversation.navigation.conversationId === scope.conversationId &&
      isSameAgentConversationOwner(conversation.navigation.owner, owner),
  );
}

function createReplacementAgentDraftScene(
  instance: DesktopWindowCompositionProjection,
  draftId: string,
): DesktopWorkbenchSceneProjection {
  if (
    instance.scene.context.kind === 'agent' &&
    instance.scene.context.scope.kind === 'assistant'
  ) {
    return createAssistantAgentScene({
      current: instance.scene,
      assistantSpaceId: instance.scene.context.scope.assistantSpaceId,
      draftId,
    });
  }
  if (
    instance.scene.context.kind !== 'agent' ||
    instance.scene.context.scope.kind !== 'workspace' ||
    instance.scene.slots.interaction?.kind !== 'agent'
  ) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Desktop Workbench '${instance.workbenchInstanceId}' cannot replace an invalid session with a same-owner draft.`,
    );
  }
  const { conversationId: _conversationId, ...persistedScope } = instance.scene.context.scope;
  const scope = { ...persistedScope, draftId };
  return parseDesktopWorkbenchSceneProjection({
    ...instance.scene,
    context: { ...instance.scene.context, scope },
    slots: {
      ...instance.scene.slots,
      interaction: {
        ...instance.scene.slots.interaction,
        phase: 'draft',
        scope,
      },
    },
  });
}

function removeProjectFromWindow(
  window: DesktopStoredWindow,
  state: DesktopShellStoredState,
  projectId: string,
  createIdentity: () => string,
): DesktopStoredWindow {
  const project = requireStoredProject(state, projectId);
  const removedTabIndexes = window.tabs.flatMap((tab, index) =>
    tab.projectId === projectId ? [index] : [],
  );
  const currentScope = window.workbench.scene.slots.interaction?.scope;
  const currentProjectRemoved =
    currentScope?.kind === 'workspace' && currentScope.workspaceId === project.workspaceId;
  if (removedTabIndexes.length === 0 && !currentProjectRemoved) return window;
  const tabs = window.tabs.filter((tab) => tab.projectId !== projectId);
  const activeTarget = window.activeTarget;
  const activeTab =
    activeTarget.kind === 'project'
      ? window.tabs.find((tab) => tab.tabId === activeTarget.tabId)
      : undefined;
  const activeProjectRemoved = activeTab?.projectId === projectId;
  if (!activeProjectRemoved && !currentProjectRemoved) {
    return {
      ...window,
      tabs,
    };
  }
  const scene = createDefaultDesktopAgentScene(window.windowId, `draft:${createIdentity()}`);
  return {
    ...window,
    tabs,
    activeTarget: { kind: 'home' },
    workbench: createDesktopWindowComposition({
      workbenchInstanceId: window.workbench.workbenchInstanceId,
      layout: createDefaultDesktopWorkbenchLayout(window.windowId),
      scene,
    }),
  };
}

function projectShellState(
  state: DesktopShellStoredState,
  applicationInstanceId: string,
  windowId: string,
  rendererSessionId: string,
  agentHome: DesktopAgentHomeProjection,
  domainCapabilities: readonly DesktopDomainCapabilityProjection[],
  startupStateDiagnostics: readonly DesktopShellStateDiagnosticProjection[],
  retainedProjects: readonly DesktopProjectCatalogItem[],
): DesktopShellProjection {
  const window = requireStoredWindow(state, windowId);
  const projectsById = new Map(retainedProjects.map((project) => [project.projectId, project]));
  for (const project of state.projects) {
    const retainedProject = projectsById.get(project.projectId);
    const unavailable =
      retainedProject?.workspaceId === project.workspaceId
        ? retainedProject.unavailable
        : undefined;
    projectsById.set(project.projectId, {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      profile: 'content',
      displayName: project.displayName,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ...(unavailable ? { unavailable } : {}),
    });
  }
  const projects = [...projectsById.values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  const catalog = { projects };
  return {
    applicationInstanceId,
    rendererSessionId,
    catalog,
    window: {
      windowId: window.windowId,
      activeTarget: window.activeTarget,
      tabs: window.tabs.map(projectStoredTab),
      workbench: window.workbench,
      applicationSidebar: window.applicationSidebar,
    },
    agentHome,
    conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome),
    domains: domainCapabilities,
    stateDiagnostics: [...startupStateDiagnostics, ...readDesktopShellStateDiagnostics(state)],
  };
}

function projectStoredTab(tab: DesktopStoredProjectTab) {
  return {
    tabId: tab.tabId,
    projectId: tab.projectId,
    viewId: tab.viewId,
    viewInstanceId: tab.viewInstanceId,
  };
}

function captureActiveProjectPresentation(window: DesktopStoredWindow): DesktopStoredWindow {
  if (window.activeTarget.kind !== 'project') return window;
  const activeTabId = window.activeTarget.tabId;
  const activeTab = window.tabs.find((tab) => tab.tabId === activeTabId);
  if (!activeTab) {
    throw new DesktopShellContractError(
      'desktop-shell-project-identity-mismatch',
      `Desktop active Project Tab '${activeTabId}' is unavailable.`,
    );
  }
  const presentation = window.workbench.layout;
  if (presentation.main.views.length === 0) return window;
  if (presentation.main.views.some((view) => view.projectId !== activeTab.projectId)) {
    throw new DesktopShellContractError(
      'desktop-shell-project-identity-mismatch',
      `Desktop active Project Tab '${activeTab.tabId}' has a foreign presentation.`,
    );
  }
  if (activeTab.presentation === presentation) return window;
  return {
    ...window,
    tabs: window.tabs.map((tab) =>
      tab.tabId === activeTab.tabId ? { ...tab, presentation } : tab,
    ),
  };
}

function openContentProject(
  state: DesktopShellStoredState,
  windowId: string,
  workspace: AssetWorkspaceResolution,
  now: string,
  createIdentity: () => string,
): DesktopShellStoredState {
  const storedWindow = requireStoredWindow(state, windowId);
  const window = captureActiveProjectPresentation(storedWindow);
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
  const tabIdentity = existingTab ?? {
    tabId: `tab:${windowId}:${project.projectId}`,
    projectId: project.projectId,
    viewId: `view:${createIdentity()}`,
    viewInstanceId: `view-instance:${createIdentity()}`,
  };
  const activeAlready =
    window.activeTarget.kind === 'project' && window.activeTarget.tabId === tabIdentity.tabId;
  const currentScope = window.workbench.scene.slots.interaction?.scope;
  const reusesCurrentLayout =
    currentScope?.kind === 'workspace' && currentScope.workspaceId === project.workspaceId;
  const workbench = attachProjectWorkbench(
    reusesCurrentLayout
      ? window.workbench.layout
      : existingTab?.presentation
        ? existingTab.presentation
        : createDefaultDesktopWorkbenchLayout(window.windowId),
    project,
    createIdentity,
  );
  const tab: DesktopStoredProjectTab =
    existingTab?.presentation === workbench
      ? existingTab
      : { ...tabIdentity, presentation: workbench };
  if (
    existingProject &&
    !projectChanged &&
    existingTab &&
    activeAlready &&
    reusesCurrentLayout &&
    workbench === window.workbench.layout
  ) {
    if (window === storedWindow) return state;
    return {
      ...state,
      windows: state.windows.map((candidate) =>
        candidate.windowId === windowId ? window : candidate,
      ),
    };
  }
  const updatedWindow: DesktopStoredWindow = {
    ...window,
    tabs: existingTab
      ? window.tabs.map((candidate) => (candidate.tabId === tab.tabId ? tab : candidate))
      : [...window.tabs, tab],
    activeTarget: { kind: 'project', tabId: tab.tabId },
    workbench: createDesktopWindowComposition({
      workbenchInstanceId: window.workbench.workbenchInstanceId,
      layout: workbench,
      scene: window.workbench.scene,
    }),
  };
  return {
    ...state,
    projects,
    windows: state.windows.map((candidate) =>
      candidate.windowId === windowId ? updatedWindow : candidate,
    ),
  };
}

function attachProjectWorkbench(
  current: DesktopWorkbenchLayoutProjection,
  project: DesktopStoredProject,
  createIdentity: () => string,
): DesktopWorkbenchLayoutProjection {
  const ownsAllMainViews =
    current.main.views.length > 0 &&
    current.main.views.every(
      (view) => view.projectId === project.projectId && view.workspaceId === project.workspaceId,
    );
  if (ownsAllMainViews) return current;
  const reset = createDefaultDesktopWorkbenchLayout(current.windowId);
  const base: DesktopWorkbenchLayoutProjection = {
    ...reset,
    resourceDock: current.resourceDock,
    display: {
      ...current.display,
      mode: 'chat-main',
    },
  };
  return openOrFocusMainView(base, {
    viewId: `canvas:${project.projectId}:workspace`,
    viewInstanceId: `view-instance:${createIdentity()}`,
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    kind: 'canvas',
    ownerId: `canvas:${project.projectId}`,
    displayLabel: 'workspace.nkc',
    documentId: 'neko/boards/workspace.nkc',
  });
}

function restoreWindowWorkbench(
  state: DesktopShellStoredState,
  window: DesktopStoredWindow,
  createIdentity: () => string,
): DesktopWorkbenchLayoutProjection {
  let restored = activeDesktopWorkbench(window).layout;
  for (const view of activeDesktopWorkbench(window).layout.main.views) {
    if (
      view.kind === 'preview' &&
      view.previewPresentation === 'temporary' &&
      view.ownerId.startsWith('preview-session:')
    ) {
      restored = closeMainView(restored, view.viewId);
    }
  }
  if (window.activeTarget.kind === 'project') {
    const activeTabId = window.activeTarget.tabId;
    const tab = window.tabs.find((candidate) => candidate.tabId === activeTabId);
    if (!tab) {
      throw new Error(
        `Desktop active Project Tab '${activeTabId}' is unavailable during Workbench restore.`,
      );
    }
    return attachProjectWorkbench(
      restored,
      requireStoredProject(state, tab.projectId),
      createIdentity,
    );
  }
  if (restored === activeDesktopWorkbench(window).layout) return restored;
  return {
    ...createDefaultDesktopWorkbenchLayout(window.windowId),
  };
}

function resolveRequestedProjects(
  state: DesktopShellStoredState,
  retainedProjects: ReadonlyMap<string, DesktopProjectCatalogItem>,
  projectIds: readonly string[],
): readonly DesktopProjectCatalogItem[] {
  const requestedProjectIds = new Set(projectIds);
  if (projectIds.length === 0 || requestedProjectIds.size !== projectIds.length) {
    throw new DesktopShellContractError(
      'invalid-desktop-shell-payload',
      'Desktop Project identities must be non-empty and unique.',
    );
  }
  return projectIds.map((projectId) => {
    const project =
      state.projects.find((candidate) => candidate.projectId === projectId) ??
      retainedProjects.get(projectId);
    if (!project) {
      throw new DesktopShellContractError(
        'desktop-shell-project-not-found',
        `Desktop Project '${projectId}' is not present in the stable catalog.`,
      );
    }
    return project;
  });
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

function createStoredProject(
  workspace: AssetWorkspaceResolution,
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

function activeDesktopWorkbench(window: DesktopStoredWindow): DesktopWindowCompositionProjection {
  return window.workbench;
}

function replaceActiveDesktopWorkbench(
  window: DesktopStoredWindow,
  update: {
    readonly layout?: DesktopWorkbenchLayoutProjection;
    readonly scene?: DesktopWorkbenchSceneProjection;
  },
): DesktopStoredWindow {
  const active = activeDesktopWorkbench(window);
  return {
    ...window,
    workbench: createDesktopWindowComposition({
      workbenchInstanceId: active.workbenchInstanceId,
      layout: update.layout ?? active.layout,
      scene: update.scene ?? active.scene,
    }),
  };
}

function putSceneWorkbench(input: {
  readonly window: DesktopStoredWindow;
  readonly scene: DesktopWorkbenchSceneProjection;
  readonly layout?: DesktopWorkbenchLayoutProjection;
}): DesktopStoredWindow {
  const current = activeDesktopWorkbench(input.window);
  const currentInteraction = current.scene.slots.interaction;
  const nextInteraction = input.scene.slots.interaction;
  const preservesDraftSurface =
    currentInteraction?.phase === 'draft' &&
    nextInteraction?.phase === 'draft' &&
    currentInteraction.scope.draftId === nextInteraction.scope.draftId;
  const scene = preservesDraftSurface
    ? parseDesktopWorkbenchSceneProjection({
        ...input.scene,
        slots: {
          ...input.scene.slots,
          interaction: {
            ...nextInteraction,
            agentSurfaceId: currentInteraction.agentSurfaceId,
          },
        },
      })
    : input.scene;
  return {
    ...input.window,
    workbench: createDesktopWindowComposition({
      workbenchInstanceId: current.workbenchInstanceId,
      layout: input.layout ?? current.layout,
      scene,
    }),
  };
}

function unavailableSceneTransition(
  request: DesktopSceneTransitionRequest,
): DesktopSceneTransitionResult | undefined {
  if (request.intent.kind === 'restore-conversation') {
    return {
      status: 'unavailable',
      requestId: request.requestId,
      diagnostic: {
        code: 'desktop-scene-owner-unavailable',
        severity: 'error',
        message: 'Conversation restore requires Agent conversation authority.',
        metadata: {
          owner: 'agent-conversation-authority',
          intentKind: 'restore-conversation',
        },
      },
    };
  }
  return undefined;
}

function unavailableWorkspaceSceneTransition(
  request: DesktopSceneTransitionRequest,
  message = 'Workspace scene requires a validated Workspace authority grant.',
): DesktopSceneTransitionResult {
  if (
    request.intent.kind !== 'open-workspace' &&
    request.intent.kind !== 'open-project-workspace'
  ) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'Workspace unavailable projection requires an explicit Workspace transition intent.',
    );
  }
  return {
    status: 'unavailable',
    requestId: request.requestId,
    diagnostic: {
      code: 'desktop-scene-owner-unavailable',
      severity: 'error',
      message,
      metadata: {
        owner: 'workspace-authority',
        intentKind: request.intent.kind,
      },
    },
  };
}

function unavailableConversationSceneTransition(
  request: DesktopSceneTransitionRequest,
  conversationOwnerKind: AgentConversationOwnerRef['kind'],
  message: string,
): DesktopSceneTransitionResult {
  if (request.intent.kind !== 'restore-conversation') {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'Conversation unavailable projection requires a restore-conversation intent.',
    );
  }
  return {
    status: 'unavailable',
    requestId: request.requestId,
    diagnostic: {
      code: 'desktop-scene-owner-unavailable',
      severity: 'error',
      message,
      metadata: {
        owner: 'agent-conversation-authority',
        intentKind: 'restore-conversation',
        conversationOwnerKind,
      },
    },
  };
}

function conversationContextMatchesSceneScope(
  context: AgentConversationContext,
  scope: DesktopAgentScopeProjection,
): boolean {
  if (scope.kind === 'unbound') return false;
  return context.kind === 'assistant'
    ? scope.kind === 'assistant' && context.assistantSpaceId === scope.assistantSpaceId
    : scope.kind === 'workspace' &&
        context.workspaceId === scope.workspaceId &&
        context.workspaceGrantId === scope.workspaceGrantId;
}

function createAssistantConversationScope(
  draftId: string,
  context: AgentConversationContext,
  conversationId: string,
): Extract<DesktopAgentScopeProjection, { readonly kind: 'assistant' }> {
  if (context.kind !== 'assistant') {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'An unbound Agent Draft can only commit an Assistant Conversation context.',
    );
  }
  return {
    kind: 'assistant',
    draftId,
    assistantSpaceId: context.assistantSpaceId,
    conversationId,
  };
}

function attachConversationToDraftScene(
  draft: DesktopWorkbenchSceneProjection,
  context: AgentConversationContext,
  conversationId: string,
): DesktopWorkbenchSceneProjection {
  if (
    draft.context.kind !== 'agent' ||
    !conversationContextMatchesSceneScope(context, draft.context.scope) ||
    draft.slots.interaction?.kind !== 'agent' ||
    draft.slots.interaction.phase !== 'draft'
  ) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'Agent Conversation context does not match its restored draft Scene.',
    );
  }
  const scope = { ...draft.context.scope, conversationId };
  return parseDesktopWorkbenchSceneProjection({
    ...draft,
    context: { ...draft.context, scope },
    slots: {
      ...draft.slots,
      interaction: { ...draft.slots.interaction, phase: 'session', scope },
    },
  });
}

function createAssistantAgentScene(input: {
  readonly current: DesktopWorkbenchSceneProjection;
  readonly assistantSpaceId: string;
  readonly draftId: string;
}): DesktopWorkbenchSceneProjection {
  const sceneId = `scene:${input.current.windowId}:agent:${input.draftId}`;
  const agentViewId =
    input.current.context.kind === 'agent' && input.current.context.scope.draftId === input.draftId
      ? input.current.context.agentViewId
      : `agent-view:${input.current.windowId}:${input.draftId}`;
  const scope = {
    kind: 'assistant' as const,
    draftId: input.draftId,
    assistantSpaceId: input.assistantSpaceId,
  };
  return parseDesktopWorkbenchSceneProjection({
    ...input.current,
    sceneId,
    context: {
      kind: 'agent',
      agentViewId,
      scope,
    },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: `agent-surface:${input.current.windowId}:${input.draftId}`,
        agentViewId,
        phase: 'draft',
        scope,
      },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function createWorkspaceAgentScene(input: {
  readonly current: DesktopWorkbenchSceneProjection;
  readonly draftId: string;
  readonly workspaceGrantId: string;
  readonly workspaceId: string;
  readonly tab: DesktopStoredWindow['tabs'][number];
  readonly workbench: DesktopWorkbenchLayoutProjection;
}): DesktopWorkbenchSceneProjection {
  const activeGroup = input.workbench.main.groups.find(
    (group) => group.groupId === input.workbench.main.activeGroupId,
  );
  if (!activeGroup?.activeViewId) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Workspace '${input.workspaceId}' has no authoritative active Main View.`,
    );
  }
  const mainView = input.workbench.main.views.find(
    (view) => view.viewId === activeGroup.activeViewId && view.workspaceId === input.workspaceId,
  );
  if (!mainView) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Workspace '${input.workspaceId}' active Main View is not attached to its Workbench.`,
    );
  }
  const sceneId = `scene:${input.current.windowId}:${input.workspaceId}`;
  const scope = {
    kind: 'workspace' as const,
    draftId: input.draftId,
    workspaceId: input.workspaceId,
    workspaceGrantId: input.workspaceGrantId,
  };
  const timelineOwner = input.workbench.timeline.ownerViewId
    ? input.workbench.main.views.find(
        (view) =>
          view.viewId === input.workbench.timeline.ownerViewId &&
          view.workspaceId === input.workspaceId,
      )
    : undefined;
  return parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: input.current.windowId,
    context: { kind: 'agent', agentViewId: input.tab.viewId, scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: `agent-surface:${input.current.windowId}:${input.draftId}`,
        agentViewId: input.tab.viewId,
        phase: 'draft',
        scope,
      },
      main: {
        kind: 'workspace-main',
        workspaceId: input.workspaceId,
        viewId: mainView.viewId,
        viewInstanceId: mainView.viewInstanceId,
      },
      rightManager: { kind: 'workspace-resources', workspaceId: input.workspaceId },
      ...(timelineOwner
        ? {
            timeline: {
              kind: 'workspace-timeline',
              workspaceId: input.workspaceId,
              viewId: timelineOwner.viewId,
              viewInstanceId: timelineOwner.viewInstanceId,
              ownerId: timelineOwner.ownerId,
            },
          }
        : {}),
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function synchronizeWorkspaceSceneWithWorkbench(
  scene: DesktopWorkbenchSceneProjection,
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchSceneProjection {
  if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') return scene;
  const workspaceId = scene.context.scope.workspaceId;

  const activeGroup = workbench.main.groups.find(
    (group) => group.groupId === workbench.main.activeGroupId,
  );
  const activeView = activeGroup?.activeViewId
    ? workbench.main.views.find(
        (view) => view.viewId === activeGroup.activeViewId && view.workspaceId === workspaceId,
      )
    : undefined;
  if (!activeView) {
    if (workbench.main.views.length > 0) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        `Workspace '${workspaceId}' has Views without an authoritative active Main View.`,
      );
    }
    const { main: _main, timeline: _timeline, ...retainedSlots } = scene.slots;
    if (!_main && !_timeline) return scene;
    return parseDesktopWorkbenchSceneProjection({
      ...scene,
      slots: retainedSlots,
    });
  }

  const timelineView = workbench.timeline.ownerViewId
    ? workbench.main.views.find(
        (view) =>
          view.viewId === workbench.timeline.ownerViewId && view.workspaceId === workspaceId,
      )
    : undefined;
  if (workbench.timeline.ownerViewId && !timelineView) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Workspace '${workspaceId}' Timeline owner is not attached to its Workbench.`,
    );
  }

  const main = {
    kind: 'workspace-main' as const,
    workspaceId,
    viewId: activeView.viewId,
    viewInstanceId: activeView.viewInstanceId,
  };
  const timeline = timelineView
    ? {
        kind: 'workspace-timeline' as const,
        workspaceId,
        viewId: timelineView.viewId,
        viewInstanceId: timelineView.viewInstanceId,
        ownerId: timelineView.ownerId,
      }
    : undefined;
  const currentMain = scene.slots.main;
  const currentTimeline = scene.slots.timeline;
  if (
    currentMain?.kind === 'workspace-main' &&
    currentMain.workspaceId === main.workspaceId &&
    currentMain.viewId === main.viewId &&
    currentMain.viewInstanceId === main.viewInstanceId &&
    ((!currentTimeline && !timeline) ||
      (currentTimeline &&
        timeline &&
        currentTimeline.workspaceId === timeline.workspaceId &&
        currentTimeline.viewId === timeline.viewId &&
        currentTimeline.viewInstanceId === timeline.viewInstanceId &&
        currentTimeline.ownerId === timeline.ownerId))
  ) {
    return scene;
  }

  const { main: _main, timeline: _timeline, ...retainedSlots } = scene.slots;
  return parseDesktopWorkbenchSceneProjection({
    ...scene,
    slots: {
      ...retainedSlots,
      main,
      ...(timeline ? { timeline } : {}),
    },
  });
}

function requireWorkspaceProject(
  state: DesktopShellStoredState,
  workspaceId: string,
): DesktopStoredProject {
  const project = state.projects.find((candidate) => candidate.workspaceId === workspaceId);
  if (!project) {
    throw new DesktopShellContractError(
      'desktop-shell-project-not-found',
      `Desktop Workspace '${workspaceId}' has no exact Project identity.`,
    );
  }
  return project;
}

function requireProjectTab(
  window: DesktopStoredWindow,
  projectId: string,
): DesktopStoredWindow['tabs'][number] {
  const tab = window.tabs.find((candidate) => candidate.projectId === projectId);
  if (!tab) {
    throw new DesktopShellContractError(
      'desktop-shell-project-identity-mismatch',
      `Desktop Project '${projectId}' has no exact Window View.`,
    );
  }
  return tab;
}

function createTransitionedScene(
  current: DesktopWorkbenchSceneProjection,
  intent: DesktopSceneTransitionIntent,
  createIdentity: () => string,
): DesktopWorkbenchSceneProjection {
  const windowId = current.windowId;
  if (intent.kind === 'open-agent-entry') {
    return createDefaultDesktopAgentScene(windowId, `draft:${createIdentity()}`);
  }
  if (intent.kind === 'bind-agent-assistant') {
    if (
      current.context.kind !== 'agent' ||
      current.context.scope.kind !== 'unbound' ||
      current.context.scope.draftId !== intent.draftId ||
      current.slots.interaction?.phase !== 'draft'
    ) {
      throw new DesktopSceneContractError(
        'desktop-scene-stale-identity',
        `Agent Draft '${intent.draftId}' is not the exact active Entry Draft.`,
      );
    }
    return createAssistantAgentScene({
      current,
      assistantSpaceId: DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
      draftId: intent.draftId,
    });
  }
  if (intent.kind === 'open-asset-center') {
    const assetCenterSessionId = `asset-center:${createIdentity()}`;
    const sceneId = `scene:${windowId}:asset-center`;
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId,
      context: { kind: 'asset-center', assetCenterSessionId },
      slots: {
        main: { kind: 'asset-management', assetCenterSessionId },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (intent.kind === 'open-extensions') {
    const sceneId = `scene:${windowId}:extensions`;
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId,
      context: { kind: 'extensions' },
      slots: {
        main: { kind: 'extension-management' },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (intent.kind === 'open-project-management') {
    const sceneId = `scene:${windowId}:project-management`;
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId,
      context: { kind: 'project-management' },
      slots: {
        main: { kind: 'project-management' },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (intent.kind === 'open-settings') {
    const settingsSectionId = intent.sectionId ?? 'general';
    const sceneId = `scene:${windowId}:settings`;
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId,
      context: { kind: 'settings', settingsSectionId },
      slots: {
        leftManager: { kind: 'settings-navigation', settingsSectionId },
        main: { kind: 'settings-main', settingsSectionId },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  throw new DesktopSceneContractError(
    'desktop-scene-scope-mismatch',
    `Desktop Scene intent '${intent.kind}' requires its owning authority.`,
  );
}

function requireIdentity(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} is required.`);
}
