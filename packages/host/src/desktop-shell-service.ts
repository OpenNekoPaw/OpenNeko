import { randomUUID } from 'node:crypto';
import type { HostDiagnostic } from './ports';
import type { DesktopAgentViewIdentity } from '@neko/agent-contracts';
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
} from './desktop-shell-contract';
import {
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  openOrFocusMainView,
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from './desktop-workbench-contract';
import {
  applyDesktopApplicationSidebarMutation,
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
  DESKTOP_SCENE_CONTRACT_VERSION,
  DesktopSceneContractError,
  parseDesktopSceneTransitionRequest,
  parseDesktopWorkbenchSceneProjection,
  type DesktopApplicationSidebarMutationRequest,
  type DesktopApplicationSidebarProjection,
  type DesktopAgentScopeProjection,
  type DesktopSceneTransitionIntent,
  type DesktopSceneTransitionRequest,
  type DesktopSceneTransitionResult,
  type DesktopWorkbenchSceneProjection,
} from './desktop-scene-contract';
import type {
  DesktopShellStateRepositoryPort,
  DesktopShellStoredState,
  DesktopStoredProject,
  DesktopStoredWindow,
} from './desktop-shell-state';
import { DESKTOP_DEFAULT_ASSISTANT_SPACE_ID } from './desktop-shell-state';
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
  readonly createIdentity?: () => string;
  readonly now?: () => string;
}

export interface DesktopWorkspaceResolutionPort {
  resolve(workspacePath: string): Promise<AssetWorkspaceResolution>;
  dispose(): Promise<void>;
}

export class DesktopShellAgentIdentityError extends Error {
  constructor(
    readonly code: 'desktop-agent-identity-mismatch' | 'desktop-agent-stale-view-epoch',
    message: string,
  ) {
    super(message);
    this.name = 'DesktopShellAgentIdentityError';
  }
}

export interface DesktopAgentHomeProjectionSource {
  setHomeWorkspaceScope(workspaceIds: readonly string[]): void;
  readHomeProjection(): DesktopAgentHomeProjection;
  subscribeHomeProjection(listener: () => void): () => void;
}

export interface DesktopShellOpenContentResult {
  readonly projection: DesktopShellProjection;
  readonly workspace: AssetWorkspaceResolution;
}

export interface DesktopAgentViewGrant extends DesktopAgentViewIdentity {
  readonly windowId: string;
  readonly workspaceId: string;
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
      const state = await this.options.stateRepository.read();
      this.synchronizeAgentHomeWorkspaceScope(state);
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
              scene: createDefaultDesktopAgentScene(windowId, `draft:${this.createIdentity()}`),
              applicationSidebar: createDefaultDesktopApplicationSidebar(windowId),
            },
          ],
        });
        this.installWindowRuntime(windowId);
        await this.emitAll(next);
        return windowId;
      }
      const restoredWindow = requireStoredWindow(state, windowId);
      const restoredWorkbench = restoreWindowWorkbench(state, restoredWindow);
      const restoredScene = synchronizeWorkspaceSceneWithWorkbench(
        restoredWindow.scene,
        restoredWorkbench,
      );
      const restoredActiveTarget =
        this.options.startupTarget === 'home' && restoredWindow.activeTarget.kind !== 'home'
          ? ({ kind: 'home' } as const)
          : restoredWindow.activeTarget;
      if (
        restoredWorkbench !== restoredWindow.workbench ||
        restoredScene !== restoredWindow.scene ||
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
                  scene: restoredScene,
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
    this.options.workspaceGrantAuthority?.releaseWindow(windowId);
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
    const state = await this.options.stateRepository.read();
    return projectShellState(
      state,
      this.options.applicationInstanceId,
      windowId,
      runtime.rendererEpoch,
      this.readAgentHomeProjection(state),
      this.domainCapabilities(),
    );
  }

  async getSceneProjection(windowId: string): Promise<DesktopWorkbenchSceneProjection> {
    this.requireActive();
    this.requireWindowRuntime(windowId);
    const state = await this.options.stateRepository.read();
    return requireStoredWindow(state, windowId).scene;
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
      this.assertMutationContext(request.windowId, request.expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, request.windowId);
      if (window.revision !== request.expectedWindowRevision) {
        throw staleWindowRevision(
          request.windowId,
          request.expectedWindowRevision,
          window.revision,
        );
      }
      if (window.scene.revision !== request.expectedSceneRevision) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          `Desktop Scene revision ${request.expectedSceneRevision} is stale; current revision is ${window.scene.revision}.`,
        );
      }
      if (
        request.intent.kind === 'open-workspace' ||
        request.intent.kind === 'open-project-workspace'
      ) {
        const targetProject =
          request.intent.kind === 'open-project-workspace'
            ? requireStoredProject(state, request.intent.projectId)
            : undefined;
        const conversationId =
          window.scene.context.kind === 'agent' && window.scene.context.scope.kind !== 'unbound'
            ? window.scene.context.scope.conversationId
            : undefined;
        if (conversationId) {
          if (
            targetProject &&
            window.activeTarget.kind === 'project' &&
            window.activeTarget.tabId ===
              requireProjectTab(window, targetProject.projectId).tabId &&
            window.scene.context.kind === 'agent' &&
            window.scene.context.scope.kind === 'workspace' &&
            window.scene.context.scope.workspaceId === targetProject.workspaceId
          ) {
            return {
              status: 'transitioned',
              requestId: request.requestId,
              scene: window.scene,
            };
          }
          return {
            status: 'rejected',
            requestId: request.requestId,
            diagnostic: {
              code: 'new-conversation-required',
              severity: 'error',
              message: 'Open a new conversation before changing Workspace scope.',
              metadata: {
                owner: 'agent-conversation-authority',
                intentKind: request.intent.kind,
                conversationId,
              },
            },
          };
        }
        const workspaceGrantAuthority = this.options.workspaceGrantAuthority;
        if (!workspaceGrantAuthority) return unavailableWorkspaceSceneTransition(request);
        const resolution =
          request.intent.kind === 'open-workspace'
            ? await workspaceGrantAuthority.resolve(
                request.windowId,
                request.intent.workspaceGrantId,
              )
            : await workspaceGrantAuthority.restore(
                request.windowId,
                `workspace-grant:project:${this.createIdentity()}`,
                requireStoredProject(state, request.intent.projectId).workspaceId,
              );
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
        const scene = createWorkspaceAgentScene({
          current: window.scene,
          draftId:
            window.scene.context.kind === 'agent' && window.scene.context.scope.kind === 'unbound'
              ? window.scene.context.scope.draftId
              : `draft:${this.createIdentity()}`,
          workspaceGrantId: resolution.workspaceGrantId,
          workspaceId: resolution.workspace.workspaceId,
          tab,
          workbench: openedWindow.workbench,
        });
        const windowChanged = openedWindow !== window;
        const next: DesktopShellStoredState = {
          ...opened,
          storageRevision: windowChanged ? opened.storageRevision : opened.storageRevision + 1,
          windows: opened.windows.map((candidate) =>
            candidate.windowId === request.windowId
              ? {
                  ...candidate,
                  revision: windowChanged ? candidate.revision : candidate.revision + 1,
                  scene,
                }
              : candidate,
          ),
        };
        this.assertMutationContext(request.windowId, request.expectedEndpointEpoch);
        const committed = await this.options.stateRepository.commit(state.storageRevision, next);
        await this.emitAll(committed);
        return { status: 'transitioned', requestId: request.requestId, scene };
      }
      const unavailable = unavailableSceneTransition(request);
      if (unavailable) return unavailable;
      const scene = createTransitionedScene(window.scene, request.intent, this.createIdentity);
      this.assertMutationContext(request.windowId, request.expectedEndpointEpoch);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        windows: state.windows.map((candidate) =>
          candidate.windowId === request.windowId
            ? {
                ...candidate,
                revision: candidate.revision + 1,
                scene,
              }
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
      this.assertMutationContext(request.windowId, request.expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, request.windowId);
      const applicationSidebar = applyDesktopApplicationSidebarMutation({
        projection: window.applicationSidebar,
        request,
        endpointEpoch: this.endpointEpoch(request.windowId),
      });
      this.assertMutationContext(request.windowId, request.expectedEndpointEpoch);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
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
    readonly expectedEndpointEpoch: string;
    readonly agentViewId: string;
    readonly context: AgentConversationContext;
    readonly conversationId: string;
  }): Promise<DesktopWorkbenchSceneProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(input.windowId, input.expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, input.windowId);
      const current = window.scene;
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
        current.context.scope.kind === 'unbound' ||
        current.context.agentViewId !== input.agentViewId ||
        !interaction ||
        interaction.kind !== 'agent' ||
        interaction.agentViewId !== input.agentViewId ||
        interaction.phase !== 'draft' ||
        current.context.scope.conversationId !== undefined ||
        !conversationContextMatchesSceneScope(input.context, current.context.scope)
      ) {
        throw new DesktopSceneContractError(
          'desktop-scene-scope-mismatch',
          'Committed Agent Conversation does not match the exact active draft Scene.',
        );
      }
      const scope = { ...current.context.scope, conversationId: input.conversationId };
      const scene = parseDesktopWorkbenchSceneProjection({
        ...current,
        revision: current.revision + 1,
        context: { ...current.context, scope },
        slots: {
          ...current.slots,
          interaction: { ...interaction, phase: 'session', scope },
        },
      });
      this.assertMutationContext(input.windowId, input.expectedEndpointEpoch);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        windows: state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? { ...candidate, revision: candidate.revision + 1, scene }
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
    const conversationId = request.intent.conversationId;
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(request.windowId, request.expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, request.windowId);
      if (window.revision !== request.expectedWindowRevision) {
        throw staleWindowRevision(
          request.windowId,
          request.expectedWindowRevision,
          window.revision,
        );
      }
      if (window.scene.revision !== request.expectedSceneRevision) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          `Desktop Scene revision ${request.expectedSceneRevision} is stale; current revision is ${window.scene.revision}.`,
        );
      }
      const context = input.context;
      let draft: DesktopWorkbenchSceneProjection;
      let workspaceAttachment:
        | {
            readonly tab: DesktopStoredWindow['tabs'][number];
            readonly workbench: DesktopWorkbenchLayoutProjection;
          }
        | undefined;
      if (context.kind === 'assistant') {
        draft = createAssistantAgentScene({
          current: window.scene,
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
        const workbench = attachProjectWorkbench(window.workbench, project);
        workspaceAttachment = { tab, workbench };
        draft = createWorkspaceAgentScene({
          current: window.scene,
          draftId: `draft:${this.createIdentity()}`,
          workspaceGrantId: context.workspaceGrantId,
          workspaceId: context.workspaceId,
          tab,
          workbench,
        });
      }
      const scene = attachConversationToDraftScene(draft, context, conversationId);
      this.assertMutationContext(request.windowId, request.expectedEndpointEpoch);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        windows: state.windows.map((candidate) =>
          candidate.windowId === request.windowId
            ? workspaceAttachment
              ? {
                  ...candidate,
                  revision: candidate.revision + 1,
                  activeTarget: {
                    kind: 'project',
                    tabId: workspaceAttachment.tab.tabId,
                  },
                  workbench: workspaceAttachment.workbench,
                  scene,
                }
              : { ...candidate, revision: candidate.revision + 1, scene }
            : candidate,
        ),
      });
      await this.emitAll(committed);
      return { status: 'transitioned', requestId: request.requestId, scene };
    });
  }

  async projectAssetCenterPreview(input: {
    readonly windowId: string;
    readonly expectedEndpointEpoch: string;
    readonly assetCenterSessionId: string;
    readonly previewSessionId?: string;
  }): Promise<DesktopWorkbenchSceneProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(input.windowId, input.expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, input.windowId);
      if (
        window.scene.context.kind !== 'asset-center' ||
        window.scene.context.assetCenterSessionId !== input.assetCenterSessionId
      ) {
        throw new DesktopSceneContractError(
          'desktop-scene-stale-identity',
          'Asset Center Preview does not match the active Scene.',
        );
      }
      const { secondaryMain: _secondaryMain, ...slotsWithoutSecondaryMain } = window.scene.slots;
      const scene = parseDesktopWorkbenchSceneProjection({
        ...window.scene,
        revision: window.scene.revision + 1,
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
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        windows: state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? { ...candidate, revision: candidate.revision + 1, scene }
            : candidate,
        ),
      });
      await this.emitAll(committed);
      return scene;
    });
  }

  async projectAssistantPreview(input: {
    readonly windowId: string;
    readonly expectedEndpointEpoch: string;
    readonly assistantSpaceId: string;
    readonly conversationId: string;
    readonly previewSessionId?: string;
    readonly scratchArtifactId?: string;
  }): Promise<DesktopWorkbenchSceneProjection> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(input.windowId, input.expectedEndpointEpoch);
      const state = await this.options.stateRepository.read();
      const window = requireStoredWindow(state, input.windowId);
      const scene = window.scene;
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
        revision: scene.revision + 1,
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
      this.assertMutationContext(input.windowId, input.expectedEndpointEpoch);
      const committed = await this.options.stateRepository.commit(state.storageRevision, {
        ...state,
        storageRevision: state.storageRevision + 1,
        windows: state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? { ...candidate, revision: candidate.revision + 1, scene: next }
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
    if (tab.viewEpoch !== identity.viewEpoch) {
      throw new DesktopShellAgentIdentityError(
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
    if (identity.windowId !== windowId || identity.endpointEpoch !== projection.endpointEpoch) {
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
      identity.sessionId !== createCanvasHostSessionId(view.viewId, view.viewEpoch)
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
    if (identity.windowId !== windowId || identity.endpointEpoch !== projection.endpointEpoch) {
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
      identity.sessionId !== createCutHostSessionId(view.viewId, view.viewEpoch)
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
    if (identity.windowId !== windowId || identity.endpointEpoch !== projection.endpointEpoch) {
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
      tab.viewEpoch !== identity.viewEpoch ||
      identity.sessionId !== createCutHostSessionId(identity.viewId, identity.viewEpoch)
    ) {
      throw new Error('Desktop Cut creation identity is not granted by the active Project.');
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
      const agentHome = this.readAgentHomeProjection(state);
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
        throw staleWindowRevision(windowId, expectedWindowRevision, requestingWindow.revision);
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
        if (parsed.windowId !== windowId || parsed.revision !== expectedWorkbenchRevision + 1) {
          throw new DesktopShellContractError(
            'desktop-shell-project-identity-mismatch',
            'Desktop Workbench mutation has invalid Window or revision identity.',
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
        const normalizedViews = parsed.main.views.map((view) => {
          if (view.projectId !== project.projectId || view.workspaceId !== project.workspaceId) {
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
        const workbench = {
          ...parsed,
          main: {
            ...parsed.main,
            views: normalizedViews,
          },
        };
        return {
          ...window,
          revision: window.revision + 1,
          workbench,
          scene: synchronizeWorkspaceSceneWithWorkbench(window.scene, workbench),
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
    this.options.workspaceGrantAuthority?.dispose();
    await this.options.workspaceRegistry.dispose();
  }

  private async mutateWindow(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
    mutate: (window: DesktopStoredWindow, state: DesktopShellStoredState) => DesktopStoredWindow,
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
    this.synchronizeAgentHomeWorkspaceScope(state);
    for (const [windowId, runtime] of this.activeWindows) {
      const projection = projectShellState(
        state,
        this.options.applicationInstanceId,
        windowId,
        runtime.rendererEpoch,
        this.readAgentHomeProjection(state),
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
      this.readAgentHomeProjection(state),
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
    const currentEndpointEpoch = this.endpointEpoch(windowId);
    if (expectedEndpointEpoch !== currentEndpointEpoch) {
      throw new DesktopShellContractError(
        'desktop-shell-stale-revision',
        `Desktop endpoint '${expectedEndpointEpoch}' is stale; current endpoint is '${currentEndpointEpoch}'.`,
      );
    }
  }

  private endpointEpoch(windowId: string): string {
    const runtime = this.requireWindowRuntime(windowId);
    return `${this.options.applicationInstanceId}:${windowId}:${runtime.rendererEpoch}`;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Shell service is disposed.');
  }

  private readAgentHomeProjection(state: DesktopShellStoredState): DesktopAgentHomeProjection {
    this.synchronizeAgentHomeWorkspaceScope(state);
    this.requireAgentHomeProjectionHealthy();
    return (
      this.agentHomeProjectionSource?.readHomeProjection() ?? {
        revision: 0,
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }
    );
  }

  private synchronizeAgentHomeWorkspaceScope(state: DesktopShellStoredState): void {
    this.agentHomeProjectionSource?.setHomeWorkspaceScope(
      state.projects.map((project) => project.workspaceId),
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
      workbench: projectWorkbench(window.workbench, Math.max(0, rendererEpoch - 1)),
      scene: projectScene(window.scene, Math.max(0, rendererEpoch - 1)),
      applicationSidebar: window.applicationSidebar,
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

function projectScene(
  scene: DesktopWorkbenchSceneProjection,
  rendererEpochOffset: number,
): DesktopWorkbenchSceneProjection {
  if (
    scene.context.kind !== 'agent' ||
    scene.context.scope.kind !== 'workspace' ||
    rendererEpochOffset === 0
  ) {
    return scene;
  }
  const main = scene.slots.main;
  if (main && main.kind !== 'workspace-main') {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'Workspace Scene Main Surface must use its authoritative Workspace View.',
    );
  }
  const timeline = scene.slots.timeline;
  return {
    ...scene,
    slots: {
      ...scene.slots,
      ...(main ? { main: { ...main, viewEpoch: main.viewEpoch + rendererEpochOffset } } : {}),
      ...(timeline
        ? { timeline: { ...timeline, viewEpoch: timeline.viewEpoch + rendererEpochOffset } }
        : {}),
    },
  };
}

function openContentProject(
  state: DesktopShellStoredState,
  windowId: string,
  workspace: AssetWorkspaceResolution,
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
  const ownsAllMainViews =
    current.main.views.length > 0 &&
    current.main.views.every(
      (view) => view.projectId === project.projectId && view.workspaceId === project.workspaceId,
    );
  if (ownsAllMainViews) return current;
  const reset = createDefaultDesktopWorkbenchLayout(current.windowId);
  const base: DesktopWorkbenchLayoutProjection = {
    ...reset,
    revision: current.revision,
    resourceDock: current.resourceDock,
    display: {
      ...current.display,
      mode: 'chat-main',
    },
  };
  return openOrFocusMainView(base, {
    viewId: `canvas:${project.projectId}:workspace`,
    viewEpoch: 1,
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
): DesktopWorkbenchLayoutProjection {
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
  if (window.activeTarget.kind === 'project') {
    const activeTabId = window.activeTarget.tabId;
    const tab = window.tabs.find((candidate) => candidate.tabId === activeTabId);
    if (!tab) {
      throw new Error(
        `Desktop active Project Tab '${activeTabId}' is unavailable during Workbench restore.`,
      );
    }
    return attachProjectWorkbench(restored, requireStoredProject(state, tab.projectId));
  }
  if (restored === window.workbench) return restored;
  return {
    ...createDefaultDesktopWorkbenchLayout(window.windowId),
    revision: restored.revision,
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
      message: 'Workspace scene requires a validated Workspace authority grant.',
      metadata: {
        owner: 'workspace-authority',
        intentKind: request.intent.kind,
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
    revision: input.current.revision + 1,
    context: {
      kind: 'agent',
      agentViewId,
      scope,
    },
    slots: {
      interaction: {
        kind: 'agent',
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
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId,
    windowId: input.current.windowId,
    revision: input.current.revision + 1,
    context: { kind: 'agent', agentViewId: input.tab.viewId, scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentViewId: input.tab.viewId,
        phase: 'draft',
        scope,
      },
      main: {
        kind: 'workspace-main',
        workspaceId: input.workspaceId,
        viewId: mainView.viewId,
        viewEpoch: mainView.viewEpoch,
      },
      rightManager: { kind: 'workspace-resources', workspaceId: input.workspaceId },
      ...(timelineOwner
        ? {
            timeline: {
              kind: 'workspace-timeline',
              workspaceId: input.workspaceId,
              viewId: timelineOwner.viewId,
              viewEpoch: timelineOwner.viewEpoch,
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
      revision: scene.revision + 1,
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
    viewEpoch: activeView.viewEpoch,
  };
  const timeline = timelineView
    ? {
        kind: 'workspace-timeline' as const,
        workspaceId,
        viewId: timelineView.viewId,
        viewEpoch: timelineView.viewEpoch,
        ownerId: timelineView.ownerId,
      }
    : undefined;
  const currentMain = scene.slots.main;
  const currentTimeline = scene.slots.timeline;
  if (
    currentMain?.kind === 'workspace-main' &&
    currentMain.workspaceId === main.workspaceId &&
    currentMain.viewId === main.viewId &&
    currentMain.viewEpoch === main.viewEpoch &&
    ((!currentTimeline && !timeline) ||
      (currentTimeline &&
        timeline &&
        currentTimeline.workspaceId === timeline.workspaceId &&
        currentTimeline.viewId === timeline.viewId &&
        currentTimeline.viewEpoch === timeline.viewEpoch &&
        currentTimeline.ownerId === timeline.ownerId))
  ) {
    return scene;
  }

  const { main: _main, timeline: _timeline, ...retainedSlots } = scene.slots;
  return parseDesktopWorkbenchSceneProjection({
    ...scene,
    revision: scene.revision + 1,
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
  const revision = current.revision + 1;
  const windowId = current.windowId;
  if (intent.kind === 'open-agent-entry') {
    return parseDesktopWorkbenchSceneProjection({
      ...createDefaultDesktopAgentScene(windowId, `draft:${createIdentity()}`),
      revision,
    });
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
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId,
      revision,
      context: { kind: 'asset-center', assetCenterSessionId },
      slots: {
        main: { kind: 'asset-management', assetCenterSessionId },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (intent.kind === 'open-extensions') {
    const extensionManagementSessionId = `extension-management:${createIdentity()}`;
    const sceneId = `scene:${windowId}:extensions`;
    return parseDesktopWorkbenchSceneProjection({
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId,
      revision,
      context: { kind: 'extensions', extensionManagementSessionId },
      slots: {
        main: { kind: 'extension-management', extensionManagementSessionId },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (intent.kind === 'open-project-management') {
    const projectManagementSessionId = `project-management:${createIdentity()}`;
    const sceneId = `scene:${windowId}:project-management`;
    return parseDesktopWorkbenchSceneProjection({
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId,
      revision,
      context: { kind: 'project-management', projectManagementSessionId },
      slots: {
        main: { kind: 'project-management', projectManagementSessionId },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (intent.kind === 'open-settings') {
    const settingsSectionId = intent.sectionId ?? 'general';
    const sceneId = `scene:${windowId}:settings`;
    return parseDesktopWorkbenchSceneProjection({
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId,
      revision,
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
