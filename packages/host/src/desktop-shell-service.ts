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
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  closeCutView,
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  openOrFocusMainView,
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
  type DesktopWorkbenchViewRef,
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
  type DesktopWorkbenchMainSurfaceRef,
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
import { isCutDraftDocumentId, type CutHostRuntimeIdentity } from '@neko/cut-domain';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import { createCutHostSessionId } from '@neko/cut-domain';
import type {
  DesktopWorkspaceGrantAuthorityPort,
  DesktopWorkspaceGrantResolution,
} from './desktop-workspace-grant-authority';
import type { AgentBoundDomainBinding } from '@neko/agent-contracts';

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
      const agentQualifiedWindow = this.agentHomeProjectionSource
        ? reconcilePersistedAgentSurface(
            restoredWindow,
            this.readAgentHomeProjection(),
            this.createIdentity,
          )
        : restoredWindow;
      const cutDraftCleanup = discardExpiredCutDraftPresentations(agentQualifiedWindow);
      const experimentalSceneReset = resetExperimentalScenePresentation(
        cutDraftCleanup.window,
        this.createIdentity,
      );
      const previewRestore = restoreWindowWorkbench(
        state,
        experimentalSceneReset.window,
        this.createIdentity,
      );
      const restoredSceneReconciliation = reconcileRestoredWorkspaceScene(
        activeDesktopWorkbench(experimentalSceneReset.window).scene,
        previewRestore.layout,
        this.createIdentity,
      );
      const qualifiedWindow = captureActiveProjectPresentation(
        replaceActiveDesktopWorkbench(experimentalSceneReset.window, {
          layout: previewRestore.layout,
          scene: restoredSceneReconciliation.scene,
        }),
      );
      if (cutDraftCleanup.removedViewIds.length > 0) {
        this.isolatedWindowDiagnostics = [
          ...this.isolatedWindowDiagnostics,
          {
            code: 'desktop-presentation-reset',
            severity: 'warning',
            windowId,
            owner: 'cut',
            removedViewIds: cutDraftCleanup.removedViewIds,
            message:
              'Expired unnamed Cut draft presentation was removed because its in-memory document ended with the previous application process.',
          },
        ];
      }
      if (previewRestore.removedViewIds.length > 0) {
        this.isolatedWindowDiagnostics = [
          ...this.isolatedWindowDiagnostics,
          {
            code: 'desktop-presentation-reset',
            severity: 'warning',
            windowId,
            owner: 'preview',
            removedViewIds: previewRestore.removedViewIds,
            message:
              'Preview presentation without a persistent ContentLocator was removed; source content and sibling Workspace views were preserved.',
          },
        ];
      }
      if (experimentalSceneReset.diagnostic) {
        this.isolatedWindowDiagnostics = [
          ...this.isolatedWindowDiagnostics,
          experimentalSceneReset.diagnostic,
        ];
      }
      if (restoredSceneReconciliation.diagnostic) {
        this.isolatedWindowDiagnostics = [
          ...this.isolatedWindowDiagnostics,
          restoredSceneReconciliation.diagnostic,
        ];
      }
      await this.options.stateRepository.commit({
        ...state,
        windows: state.windows.map((window) =>
          window.windowId === windowId ? qualifiedWindow : window,
        ),
      });
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
        request.intent.kind === 'open-project-workspace' ||
        request.intent.kind === 'open-character-authoring' ||
        request.intent.kind === 'open-world-authoring'
      ) {
        const targetProjectId =
          request.intent.kind === 'open-project-workspace'
            ? request.intent.projectId
            : request.intent.kind === 'open-character-authoring' ||
                request.intent.kind === 'open-world-authoring'
              ? request.intent.authority.projectId
              : undefined;
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
        if (
          (request.intent.kind === 'open-project-workspace' ||
            request.intent.kind === 'open-character-authoring' ||
            request.intent.kind === 'open-world-authoring') &&
          !targetProject
        ) {
          throw new DesktopShellContractError(
            'desktop-shell-project-not-found',
            `Desktop Project '${targetProjectId}' is not present in the stable catalog.`,
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
        if (
          request.intent.kind === 'open-workspace' ||
          request.intent.kind === 'open-character-authoring' ||
          request.intent.kind === 'open-world-authoring'
        ) {
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
        const draftId =
          activeScene.context.kind === 'agent' && activeScene.context.scope.kind === 'unbound'
            ? activeScene.context.scope.draftId
            : `draft:${this.createIdentity()}`;
        const composed =
          request.intent.kind === 'open-character-authoring'
            ? composeCharacterAuthoringAgentDraft({
                state,
                windowId: request.windowId,
                current: activeScene,
                draftId,
                resolution,
                authority: request.intent.authority,
                characterProjectId: request.intent.characterProjectId,
                now: this.now(),
                createIdentity: this.createIdentity,
              })
            : request.intent.kind === 'open-world-authoring'
              ? composeWorldAuthoringAgentDraft({
                  state,
                  windowId: request.windowId,
                  current: activeScene,
                  draftId,
                  resolution,
                  authority: request.intent.authority,
                  worldProjectId: request.intent.worldProjectId,
                  now: this.now(),
                  createIdentity: this.createIdentity,
                })
              : composeWorkspaceAgentDraft({
                  state,
                  windowId: request.windowId,
                  current: activeScene,
                  draftId,
                  resolution,
                  now: this.now(),
                  createIdentity: this.createIdentity,
                });
        this.assertMutationContext(request.windowId, request.rendererSessionId);
        const committed = await this.options.stateRepository.commit(composed.state);
        await this.emitAll(committed);
        return { status: 'transitioned', requestId: request.requestId, scene: composed.scene };
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
    readonly draftId: string;
    readonly context: AgentBoundDomainBinding;
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
        current.context.kind === 'character-interaction' &&
        input.context.kind !== 'world' &&
        current.context.scope.conversationId === input.conversationId &&
        isSameAgentConversationOwner(
          current.context.owner,
          conversationOwnerFromContext(input.context),
        )
      ) {
        return current;
      }
      if (
        current.context.kind === 'agent' &&
        current.context.scope.kind !== 'unbound' &&
        current.context.scope.draftId === input.draftId &&
        current.context.scope.conversationId === input.conversationId &&
        conversationContextMatchesSceneScope(input.context, current.context.scope) &&
        interaction?.kind === 'agent' &&
        interaction.scope.kind !== 'unbound' &&
        interaction.scope.draftId === input.draftId &&
        interaction.phase === 'session' &&
        interaction.scope.conversationId === input.conversationId
      ) {
        return current;
      }
      if (
        current.context.kind !== 'agent' ||
        current.context.agentViewId !== input.agentViewId ||
        current.context.scope.draftId !== input.draftId ||
        !interaction ||
        interaction.kind !== 'agent' ||
        interaction.agentViewId !== input.agentViewId ||
        interaction.scope.draftId !== input.draftId ||
        interaction.phase !== 'draft' ||
        (current.context.scope.kind !== 'unbound' &&
          current.context.scope.conversationId !== undefined) ||
        (current.context.scope.kind !== 'unbound' &&
          !conversationContextMatchesSceneScope(input.context, current.context.scope))
      ) {
        throw new DesktopSceneContractError(
          'desktop-scene-scope-mismatch',
          'Committed Agent Conversation does not match the exact active draft Scene.',
        );
      }
      let nextState = state;
      let scene: DesktopWorkbenchSceneProjection;
      if (
        current.context.scope.kind === 'unbound' &&
        (input.context.kind === 'character' || input.context.kind === 'room')
      ) {
        scene = createCharacterInteractionConversationScene({
          current,
          interaction,
          context: input.context,
          conversationId: input.conversationId,
        });
      } else if (current.context.scope.kind === 'unbound' && input.context.kind === 'workspace') {
        const workspaceGrantAuthority = this.options.workspaceGrantAuthority;
        if (!workspaceGrantAuthority) {
          throw new DesktopSceneContractError(
            'desktop-scene-scope-mismatch',
            'Workspace authority is unavailable for the committed Entry Draft target.',
          );
        }
        const resolution = await workspaceGrantAuthority.resolve(
          input.windowId,
          input.context.workspaceGrantId,
        );
        if (resolution.workspace.workspaceId !== input.context.workspaceId) {
          throw new DesktopSceneContractError(
            'desktop-scene-scope-mismatch',
            'Committed Agent Workspace grant resolves to another Workspace.',
          );
        }
        const composed = composeWorkspaceAgentDraft({
          state,
          windowId: input.windowId,
          current,
          draftId: input.draftId,
          resolution,
          now: this.now(),
          createIdentity: this.createIdentity,
        });
        nextState = composed.state;
        scene = attachConversationToDraftScene(composed.scene, input.context, input.conversationId);
      } else if (current.context.scope.kind === 'unbound') {
        const scope = createAssistantConversationScope(
          input.draftId,
          input.context,
          input.conversationId,
        );
        scene = parseDesktopWorkbenchSceneProjection({
          ...current,
          context: { ...current.context, scope },
          slots: {
            ...current.slots,
            interaction: { ...interaction, phase: 'session', scope },
          },
        });
      } else {
        scene = attachConversationToDraftScene(current, input.context, input.conversationId);
      }
      this.assertMutationContext(input.windowId, input.rendererSessionId);
      const committed = await this.options.stateRepository.commit({
        ...nextState,
        windows: nextState.windows.map((candidate) =>
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
    readonly context: AgentBoundDomainBinding;
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
      if (context.kind === 'world') {
        return unavailableConversationSceneTransition(
          request,
          context.kind,
          'Complete World Experience capabilities are unavailable until the WorldExperienceVersion owner is composed.',
        );
      }
      const contextOwner = conversationOwnerFromContext(context);
      if (!isSameAgentConversationOwner(navigation.owner, contextOwner)) {
        throw new DesktopSceneContractError(
          'desktop-scene-scope-mismatch',
          `Agent Conversation '${conversationId}' lifecycle context does not match its navigation owner.`,
        );
      }
      if (context.kind === 'character' || context.kind === 'room') {
        const fresh = createDefaultDesktopAgentScene(
          request.windowId,
          `draft:${this.createIdentity()}`,
        );
        const interaction = fresh.slots.interaction;
        if (!interaction || interaction.kind !== 'agent') {
          throw new DesktopSceneContractError(
            'desktop-scene-scope-mismatch',
            'Character Conversation restore could not create an Agent Interaction Surface.',
          );
        }
        const scene = createCharacterInteractionConversationScene({
          current: fresh,
          interaction,
          context,
          conversationId,
        });
        this.assertMutationContext(request.windowId, request.rendererSessionId);
        const committed = await this.options.stateRepository.commit({
          ...state,
          windows: state.windows.map((candidate) =>
            candidate.windowId === request.windowId
              ? putSceneWorkbench({ window, scene })
              : candidate,
          ),
        });
        await this.emitAll(committed);
        return { status: 'transitioned', requestId: request.requestId, scene };
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
    if (interaction?.kind !== 'agent' || interaction.agentSurfaceId !== identity.agentSurfaceId) {
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
    const view = projection.window.workbench.layout.cutPanel?.views.find(
      (candidate) => candidate.viewId === identity.viewId,
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
    await this.resolveAgentHomeConversations(windowId, [navigation], rendererSessionId);
  }

  async resolveAgentHomeConversations(
    windowId: string,
    navigations: readonly DesktopAgentHomeNavigationIdentity[],
    rendererSessionId: string,
  ): Promise<readonly DesktopAgentHomeNavigationIdentity[]> {
    return this.enqueue(async () => {
      this.requireActive();
      this.assertMutationContext(windowId, rendererSessionId);
      const state = await this.options.stateRepository.read();
      requireStoredWindow(state, windowId);
      const agentHome = this.readAgentHomeProjection();
      const conversations = navigations.map((navigation) => {
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
        return conversation.navigation;
      });
      this.assertMutationContext(windowId, rendererSessionId);
      return Object.freeze(conversations);
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

  async registerContentProject(
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
      const existing = state.projects.find(
        (project) => project.workspaceId === workspace.workspaceId,
      );
      const project = existing ?? createStoredProject(workspace, this.now());
      const next = existing ? state : { ...state, projects: [...state.projects, project] };
      this.assertMutationContext(windowId, rendererSessionId);
      const committed = next === state ? state : await this.options.stateRepository.commit(next);
      await this.emitAll(committed);
      return { projection: this.projectWindow(committed, windowId), workspace };
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
      const sceneScope =
        instance.scene.context.kind === 'agent' ? instance.scene.context.scope : null;
      const workspaceProject =
        sceneScope?.kind === 'workspace'
          ? state.projects.find((candidate) => candidate.workspaceId === sceneScope.workspaceId)
          : undefined;
      const standaloneEmptyWorkspace =
        sceneScope?.kind === 'workspace' &&
        workspaceProject === undefined &&
        instance.scene.slots.main === undefined &&
        instance.scene.slots.secondaryMain === undefined &&
        instance.scene.slots.rightManager === undefined &&
        instance.layout.main.views.length === 0 &&
        parsed.main.views.length === 0;
      if (sceneScope?.kind === 'workspace' && !workspaceProject && !standaloneEmptyWorkspace) {
        throw new DesktopShellContractError(
          'desktop-shell-project-identity-mismatch',
          `Desktop Workspace '${sceneScope.workspaceId}' has no exact authoring authority.`,
        );
      }
      const workspaceTab = workspaceProject
        ? requireProjectTab(window, workspaceProject.projectId)
        : undefined;
      if (workspaceProject) {
        for (const view of parsed.main.views) {
          if (
            view.projectId !== workspaceProject.projectId ||
            view.workspaceId !== workspaceProject.workspaceId
          ) {
            throw new DesktopShellContractError(
              'desktop-shell-project-identity-mismatch',
              `Desktop Workbench View '${view.viewId}' belongs to another Project.`,
            );
          }
        }
      }
      return {
        ...window,
        tabs: workspaceTab
          ? window.tabs.map((candidate) =>
              candidate.tabId === workspaceTab.tabId
                ? { ...candidate, presentation: parsed }
                : candidate,
            )
          : window.tabs,
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
  if (
    !interaction ||
    interaction.kind !== 'agent' ||
    isPersistedAgentSurfaceQualified(window.workbench.scene, interaction, agentHome)
  ) {
    return window;
  }
  return replaceActiveDesktopWorkbench(window, {
    scene: createReplacementAgentDraftScene(window.workbench.scene, `draft:${createIdentity()}`),
  });
}

function discardExpiredCutDraftPresentations(window: DesktopStoredWindow): {
  readonly window: DesktopStoredWindow;
  readonly removedViewIds: readonly string[];
} {
  const removedViewIds = new Set<string>();
  const discardFromLayout = (
    layout: DesktopWorkbenchLayoutProjection,
  ): DesktopWorkbenchLayoutProjection => {
    let next = layout;
    for (const view of layout.cutPanel?.views ?? []) {
      if (view.documentId && isCutDraftDocumentId(view.documentId)) {
        removedViewIds.add(view.viewId);
        next = closeCutView(next, view.viewId);
      }
    }
    return next;
  };
  const active = activeDesktopWorkbench(window);
  const activeLayout = discardFromLayout(active.layout);
  const tabs = window.tabs.map((tab) => {
    if (!tab.presentation) return tab;
    const presentation = discardFromLayout(tab.presentation);
    return presentation === tab.presentation ? tab : { ...tab, presentation };
  });
  const tabsChanged = tabs.some((tab, index) => tab !== window.tabs[index]);
  const withActiveLayout =
    activeLayout === active.layout
      ? window
      : replaceActiveDesktopWorkbench(window, { layout: activeLayout });
  return {
    window: tabsChanged ? { ...withActiveLayout, tabs } : withActiveLayout,
    removedViewIds: [...removedViewIds],
  };
}

function isPersistedAgentSurfaceQualified(
  scene: DesktopWorkbenchSceneProjection,
  interaction: DesktopAgentInteractionSurfaceRef,
  agentHome: DesktopAgentHomeProjection,
): boolean {
  if (interaction.phase === 'draft') return true;
  if (scene.context.kind === 'character-interaction') {
    const context = scene.context;
    const conversation = agentHome.conversations.find(
      (conversation) =>
        conversation.navigation.conversationId === context.scope.conversationId &&
        isSameAgentConversationOwner(conversation.navigation.owner, context.owner),
    );
    return conversation !== undefined && conversation.unavailable === undefined;
  }
  const scope = interaction.scope;
  if (scope.kind === 'unbound' || scope.conversationId === undefined) return false;
  const owner =
    scope.kind === 'assistant'
      ? { kind: 'assistant' as const, assistantSpaceId: scope.assistantSpaceId }
      : { kind: 'workspace' as const, workspaceId: scope.workspaceId };
  const conversation = agentHome.conversations.find(
    (conversation) =>
      conversation.navigation.conversationId === scope.conversationId &&
      isSameAgentConversationOwner(conversation.navigation.owner, owner),
  );
  return conversation !== undefined && conversation.unavailable === undefined;
}

function createReplacementAgentDraftScene(
  current: DesktopWorkbenchSceneProjection,
  draftId: string,
): DesktopWorkbenchSceneProjection {
  if (current.context.kind === 'character-interaction') {
    return createAssistantAgentScene({
      current,
      assistantSpaceId: current.context.scope.assistantSpaceId,
      draftId,
    });
  }
  if (current.context.kind === 'agent' && current.context.scope.kind === 'assistant') {
    return createAssistantAgentScene({
      current,
      assistantSpaceId: current.context.scope.assistantSpaceId,
      draftId,
    });
  }
  if (
    current.context.kind !== 'agent' ||
    current.context.scope.kind !== 'workspace' ||
    current.slots.interaction?.kind !== 'agent'
  ) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Desktop Scene '${current.sceneId}' cannot replace an invalid session with a same-owner draft.`,
    );
  }
  const { conversationId: _conversationId, ...persistedScope } = current.context.scope;
  const scope = { ...persistedScope, draftId };
  return parseDesktopWorkbenchSceneProjection({
    ...current,
    context: { ...current.context, scope },
    slots: {
      ...current.slots,
      interaction: {
        ...current.slots.interaction,
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
  const currentInteraction = window.workbench.scene.slots.interaction;
  const currentScope = currentInteraction?.kind === 'agent' ? currentInteraction.scope : undefined;
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
    conversationNavigation: projectDesktopConversationNavigation(
      catalog,
      agentHome,
      state.projects.map((project) => project.projectId),
    ),
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
  const currentInteraction = window.workbench.scene.slots.interaction;
  const currentScope = currentInteraction?.kind === 'agent' ? currentInteraction.scope : undefined;
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

function composeWorkspaceAgentDraft(input: {
  readonly state: DesktopShellStoredState;
  readonly windowId: string;
  readonly current: DesktopWorkbenchSceneProjection;
  readonly draftId: string;
  readonly resolution: DesktopWorkspaceGrantResolution;
  readonly now: string;
  readonly createIdentity: () => string;
}): {
  readonly state: DesktopShellStoredState;
  readonly scene: DesktopWorkbenchSceneProjection;
} {
  const opened = openContentProject(
    input.state,
    input.windowId,
    input.resolution.workspace,
    input.now,
    input.createIdentity,
  );
  const openedWindow = requireStoredWindow(opened, input.windowId);
  const project = requireWorkspaceProject(opened, input.resolution.workspace.workspaceId);
  const tab = requireProjectTab(openedWindow, project.projectId);
  const workspaceWorkbench = attachProjectWorkbench(
    openedWindow.workbench.layout,
    project,
    input.createIdentity,
  );
  const scene = createWorkspaceAgentScene({
    current: input.current,
    draftId: input.draftId,
    workspaceGrantId: input.resolution.workspaceGrantId,
    workspaceId: input.resolution.workspace.workspaceId,
    tab,
    workbench: workspaceWorkbench,
  });
  return {
    state: {
      ...opened,
      windows: opened.windows.map((candidate) =>
        candidate.windowId === input.windowId
          ? putSceneWorkbench({
              window: candidate,
              scene,
              layout: workspaceWorkbench,
            })
          : candidate,
      ),
    },
    scene,
  };
}

function composeCharacterAuthoringAgentDraft(input: {
  readonly state: DesktopShellStoredState;
  readonly windowId: string;
  readonly current: DesktopWorkbenchSceneProjection;
  readonly draftId: string;
  readonly resolution: DesktopWorkspaceGrantResolution;
  readonly authority: Extract<
    DesktopSceneTransitionIntent,
    { readonly kind: 'open-character-authoring' }
  >['authority'];
  readonly characterProjectId: string;
  readonly now: string;
  readonly createIdentity: () => string;
}): {
  readonly state: DesktopShellStoredState;
  readonly scene: DesktopWorkbenchSceneProjection;
} {
  if (input.authority.kind === 'project') {
    const base = composeWorkspaceAgentDraft(input);
    const window = requireStoredWindow(base.state, input.windowId);
    const project = requireWorkspaceProject(base.state, input.resolution.workspace.workspaceId);
    if (project.projectId !== input.authority.projectId) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        'Character authoring authority does not match the authorized Project.',
      );
    }
    const tab = requireProjectTab(window, project.projectId);
    const layout = openOrFocusMainView(
      window.workbench.layout,
      {
        viewId: `character-authoring:${input.characterProjectId}`,
        viewInstanceId: `character-authoring-view:${input.createIdentity()}`,
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        kind: 'character-authoring',
        ownerId: input.characterProjectId,
        displayLabel: input.characterProjectId,
        characterProjectId: input.characterProjectId,
      },
      { groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, splitAxis: 'columns' },
    );
    const scene = createWorkspaceAgentScene({
      current: input.current,
      draftId: input.draftId,
      workspaceGrantId: input.resolution.workspaceGrantId,
      workspaceId: input.resolution.workspace.workspaceId,
      tab,
      workbench: layout,
    });
    return {
      state: {
        ...base.state,
        windows: base.state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? putSceneWorkbench({ window: candidate, scene, layout })
            : candidate,
        ),
      },
      scene,
    };
  }

  const currentWindow = requireStoredWindow(input.state, input.windowId);
  const layout = openOrFocusMainView(
    createDefaultDesktopWorkbenchLayout(input.windowId),
    {
      viewId: `character-authoring:${input.characterProjectId}`,
      viewInstanceId: `character-authoring-view:${input.createIdentity()}`,
      workspaceId: input.resolution.workspace.workspaceId,
      kind: 'character-authoring',
      ownerId: input.characterProjectId,
      displayLabel: input.characterProjectId,
      characterProjectId: input.characterProjectId,
    },
    { groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, splitAxis: 'columns' },
  );
  const scene = createStandaloneCharacterAuthoringScene({
    current: input.current,
    draftId: input.draftId,
    workspaceGrantId: input.resolution.workspaceGrantId,
    workspaceId: input.resolution.workspace.workspaceId,
    characterProjectId: input.characterProjectId,
    workbench: layout,
  });
  return {
    state: {
      ...input.state,
      windows: input.state.windows.map((candidate) =>
        candidate.windowId === input.windowId
          ? putSceneWorkbench({
              window: { ...currentWindow, activeTarget: { kind: 'home' } },
              scene,
              layout,
            })
          : candidate,
      ),
    },
    scene,
  };
}

function composeWorldAuthoringAgentDraft(input: {
  readonly state: DesktopShellStoredState;
  readonly windowId: string;
  readonly current: DesktopWorkbenchSceneProjection;
  readonly draftId: string;
  readonly resolution: DesktopWorkspaceGrantResolution;
  readonly authority: Extract<
    DesktopSceneTransitionIntent,
    { readonly kind: 'open-world-authoring' }
  >['authority'];
  readonly worldProjectId: string;
  readonly now: string;
  readonly createIdentity: () => string;
}): {
  readonly state: DesktopShellStoredState;
  readonly scene: DesktopWorkbenchSceneProjection;
} {
  if (input.authority.kind === 'project') {
    const base = composeWorkspaceAgentDraft(input);
    const window = requireStoredWindow(base.state, input.windowId);
    const project = requireWorkspaceProject(base.state, input.resolution.workspace.workspaceId);
    if (project.projectId !== input.authority.projectId) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        'World authoring authority does not match the authorized Project.',
      );
    }
    const tab = requireProjectTab(window, project.projectId);
    const layout = openOrFocusMainView(
      window.workbench.layout,
      {
        viewId: `world-authoring:${input.worldProjectId}`,
        viewInstanceId: `world-authoring-view:${input.createIdentity()}`,
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        kind: 'world-authoring',
        ownerId: input.worldProjectId,
        displayLabel: input.worldProjectId,
        worldProjectId: input.worldProjectId,
      },
      { groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, splitAxis: 'columns' },
    );
    const scene = createWorkspaceAgentScene({
      current: input.current,
      draftId: input.draftId,
      workspaceGrantId: input.resolution.workspaceGrantId,
      workspaceId: input.resolution.workspace.workspaceId,
      tab,
      workbench: layout,
    });
    return {
      state: {
        ...base.state,
        windows: base.state.windows.map((candidate) =>
          candidate.windowId === input.windowId
            ? putSceneWorkbench({ window: candidate, scene, layout })
            : candidate,
        ),
      },
      scene,
    };
  }

  const currentWindow = requireStoredWindow(input.state, input.windowId);
  const layout = openOrFocusMainView(
    createDefaultDesktopWorkbenchLayout(input.windowId),
    {
      viewId: `world-authoring:${input.worldProjectId}`,
      viewInstanceId: `world-authoring-view:${input.createIdentity()}`,
      workspaceId: input.resolution.workspace.workspaceId,
      kind: 'world-authoring',
      ownerId: input.worldProjectId,
      displayLabel: input.worldProjectId,
      worldProjectId: input.worldProjectId,
    },
    { groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, splitAxis: 'columns' },
  );
  const scene = createStandaloneWorldAuthoringScene({
    current: input.current,
    draftId: input.draftId,
    workspaceGrantId: input.resolution.workspaceGrantId,
    workspaceId: input.resolution.workspace.workspaceId,
    worldProjectId: input.worldProjectId,
    workbench: layout,
  });
  return {
    state: {
      ...input.state,
      windows: input.state.windows.map((candidate) =>
        candidate.windowId === input.windowId
          ? putSceneWorkbench({
              window: { ...currentWindow, activeTarget: { kind: 'home' } },
              scene,
              layout,
            })
          : candidate,
      ),
    },
    scene,
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
  const hasRestorableBaseMainView = current.main.views.some(
    (view) =>
      view.kind !== 'project-content' &&
      view.kind !== 'character-authoring' &&
      view.kind !== 'world-authoring',
  );
  if (ownsAllMainViews && hasRestorableBaseMainView) return current;
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
): {
  readonly layout: DesktopWorkbenchLayoutProjection;
  readonly removedViewIds: readonly string[];
} {
  let restored = activeDesktopWorkbench(window).layout;
  const removedViewIds: string[] = [];
  for (const view of activeDesktopWorkbench(window).layout.main.views) {
    if (
      view.kind === 'preview' &&
      ((view.previewPresentation === 'temporary' && view.ownerId.startsWith('preview-session:')) ||
        view.previewContentLocator === undefined)
    ) {
      restored = closeMainView(restored, view.viewId);
      removedViewIds.push(view.viewId);
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
    return {
      layout: attachProjectWorkbench(
        restored,
        requireStoredProject(state, tab.projectId),
        createIdentity,
      ),
      removedViewIds,
    };
  }
  if (restored === activeDesktopWorkbench(window).layout) {
    return { layout: restored, removedViewIds };
  }
  return {
    layout: createDefaultDesktopWorkbenchLayout(window.windowId),
    removedViewIds,
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
    currentInteraction?.kind === 'agent' &&
    nextInteraction?.kind === 'agent' &&
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

function resetExperimentalScenePresentation(
  window: DesktopStoredWindow,
  createIdentity: () => string,
): {
  readonly window: DesktopStoredWindow;
  readonly diagnostic?: DesktopShellStateDiagnosticProjection;
} {
  const scene = activeDesktopWorkbench(window).scene;
  const owner =
    scene.context.kind === 'creative-management' && scene.context.catalog === 'characters'
      ? 'character'
      : scene.context.kind === 'creative-management' && scene.context.catalog === 'worlds'
        ? 'world'
        : undefined;
  if (!owner) return { window };
  const nextScene = createDefaultDesktopAgentScene(window.windowId, `draft:${createIdentity()}`);
  return {
    window: {
      ...window,
      activeTarget: { kind: 'home' },
      workbench: createDesktopWindowComposition({
        workbenchInstanceId: window.workbench.workbenchInstanceId,
        layout: createDefaultDesktopWorkbenchLayout(window.windowId),
        scene: nextScene,
      }),
    },
    diagnostic: {
      code: 'desktop-presentation-reset',
      severity: 'warning',
      windowId: window.windowId,
      owner,
      resetSceneId: scene.sceneId,
      message: `${owner === 'character' ? 'Character' : 'World'} experimental presentation was reset because the capability has not passed product promotion. Durable records and protected background runtime were preserved.`,
    },
  };
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
  conversationOwnerKind: AgentConversationOwnerRef['kind'] | 'world',
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
  context: AgentBoundDomainBinding,
  scope: DesktopAgentScopeProjection,
): boolean {
  if (scope.kind === 'unbound') return false;
  if (context.kind === 'assistant') {
    return scope.kind === 'assistant' && context.assistantSpaceId === scope.assistantSpaceId;
  }
  if (context.kind === 'workspace') {
    return (
      scope.kind === 'workspace' &&
      context.workspaceId === scope.workspaceId &&
      context.workspaceGrantId === scope.workspaceGrantId
    );
  }
  return false;
}

function conversationOwnerFromContext(
  context: Exclude<AgentBoundDomainBinding, { readonly kind: 'world' }>,
): AgentConversationOwnerRef {
  if (context.kind === 'assistant') {
    return { kind: 'assistant', assistantSpaceId: context.assistantSpaceId };
  }
  if (context.kind === 'workspace') return { kind: 'workspace', workspaceId: context.workspaceId };
  if (context.kind === 'room') {
    return { kind: 'room', roomId: context.roomId, roomRunId: context.roomRunId };
  }
  if (!context.characterRunId || !context.dialogueRunId) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'Character Conversation requires an exact CharacterRun and DialogueRun owner.',
    );
  }
  return {
    kind: 'character',
    characterId: context.characterId,
    characterRunId: context.characterRunId,
    dialogueRunId: context.dialogueRunId,
  };
}

function createCharacterInteractionConversationScene(input: {
  readonly current: DesktopWorkbenchSceneProjection;
  readonly interaction: DesktopAgentInteractionSurfaceRef;
  readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'character' | 'room' }>;
  readonly conversationId: string;
}): DesktopWorkbenchSceneProjection {
  if (
    input.current.context.kind !== 'agent' ||
    input.current.context.scope.kind !== 'unbound' ||
    input.interaction.phase !== 'draft'
  ) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'Character Interaction can only replace the exact active unbound Agent Draft.',
    );
  }
  const owner = conversationOwnerFromContext(input.context);
  if (owner.kind !== 'character' && owner.kind !== 'room') {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      'Character Interaction requires a Character or Room owner.',
    );
  }
  const scope = {
    kind: 'assistant' as const,
    draftId: input.current.context.scope.draftId,
    assistantSpaceId: DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
    conversationId: input.conversationId,
  };
  const sceneId = `scene:${input.current.windowId}:character-interaction:${input.conversationId}`;
  return parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: input.current.windowId,
    context: {
      kind: 'character-interaction',
      agentViewId: input.interaction.agentViewId,
      owner,
      scope,
    },
    slots: {
      interaction: { ...input.interaction, phase: 'session', scope },
      main: {
        kind: 'character-presentation',
        owner,
        surfaceKind: 'avatar',
        providerId: 'chara.representation',
        surfaceId: `character-presentation:${input.conversationId}`,
      },
      rightManager: { kind: 'character-runtime-manager', owner },
      cutPanel: {
        kind: 'character-timeline-stack',
        owner,
        timelines: [
          {
            kind: 'character-storyline-timeline',
            owner,
            timelineId: `character-storyline-timeline:${input.conversationId}`,
          },
          ...(owner.kind === 'room'
            ? [
                {
                  kind: 'character-room-event-timeline' as const,
                  owner,
                  timelineId: `character-room-event-timeline:${input.conversationId}`,
                },
              ]
            : []),
        ],
      },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function createAssistantConversationScope(
  draftId: string,
  context: AgentBoundDomainBinding,
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
  context: AgentBoundDomainBinding,
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
  const sceneId = `scene:${input.current.windowId}:${input.workspaceId}`;
  const scope = {
    kind: 'workspace' as const,
    draftId: input.draftId,
    workspaceId: input.workspaceId,
    workspaceGrantId: input.workspaceGrantId,
  };
  const scene = parseDesktopWorkbenchSceneProjection({
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
      rightManager: { kind: 'workspace-resources', workspaceId: input.workspaceId },
      status: { kind: 'scene-status', sceneId },
    },
  });
  return synchronizeWorkspaceSceneWithWorkbench(scene, input.workbench);
}

function createStandaloneCharacterAuthoringScene(input: {
  readonly current: DesktopWorkbenchSceneProjection;
  readonly draftId: string;
  readonly workspaceGrantId: string;
  readonly workspaceId: string;
  readonly characterProjectId: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}): DesktopWorkbenchSceneProjection {
  const secondaryGroup = input.workbench.main.groups.find(
    (group) => group.groupId === DESKTOP_SECONDARY_MAIN_GROUP_ID,
  );
  const mainView = secondaryGroup?.activeViewId
    ? input.workbench.main.views.find(
        (view) =>
          view.viewId === secondaryGroup.activeViewId &&
          view.workspaceId === input.workspaceId &&
          view.kind === 'character-authoring' &&
          view.projectId === undefined &&
          view.characterProjectId === input.characterProjectId,
      )
    : undefined;
  if (!mainView) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Standalone Character '${input.characterProjectId}' has no exact authoring View.`,
    );
  }
  const sceneId = `scene:${input.current.windowId}:${input.workspaceId}:character:${input.characterProjectId}`;
  const agentViewId = `agent-view:${input.current.windowId}:${input.draftId}`;
  const scope = {
    kind: 'workspace' as const,
    draftId: input.draftId,
    workspaceId: input.workspaceId,
    workspaceGrantId: input.workspaceGrantId,
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: input.current.windowId,
    context: { kind: 'agent', agentViewId, scope },
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
  return synchronizeWorkspaceSceneWithWorkbench(scene, input.workbench);
}

function createStandaloneWorldAuthoringScene(input: {
  readonly current: DesktopWorkbenchSceneProjection;
  readonly draftId: string;
  readonly workspaceGrantId: string;
  readonly workspaceId: string;
  readonly worldProjectId: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}): DesktopWorkbenchSceneProjection {
  const secondaryGroup = input.workbench.main.groups.find(
    (group) => group.groupId === DESKTOP_SECONDARY_MAIN_GROUP_ID,
  );
  const mainView = secondaryGroup?.activeViewId
    ? input.workbench.main.views.find(
        (view) =>
          view.viewId === secondaryGroup.activeViewId &&
          view.workspaceId === input.workspaceId &&
          view.kind === 'world-authoring' &&
          view.projectId === undefined &&
          view.worldProjectId === input.worldProjectId,
      )
    : undefined;
  if (!mainView) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Standalone World '${input.worldProjectId}' has no exact authoring View.`,
    );
  }
  const sceneId = `scene:${input.current.windowId}:${input.workspaceId}:world:${input.worldProjectId}`;
  const agentViewId = `agent-view:${input.current.windowId}:${input.draftId}`;
  const scope = {
    kind: 'workspace' as const,
    draftId: input.draftId,
    workspaceId: input.workspaceId,
    workspaceGrantId: input.workspaceGrantId,
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: input.current.windowId,
    context: { kind: 'agent', agentViewId, scope },
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
  return synchronizeWorkspaceSceneWithWorkbench(scene, input.workbench);
}

function synchronizeWorkspaceSceneWithWorkbench(
  scene: DesktopWorkbenchSceneProjection,
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchSceneProjection {
  if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') return scene;
  const workspaceId = scene.context.scope.workspaceId;

  const resolveGroupView = (groupId: string): DesktopWorkbenchViewRef | undefined => {
    const group = workbench.main.groups.find((candidate) => candidate.groupId === groupId);
    if (!group) return undefined;
    if (!group.activeViewId) {
      if (group.viewIds.length > 0) {
        throw new DesktopSceneContractError(
          'desktop-scene-scope-mismatch',
          `Workspace '${workspaceId}' Main Group '${groupId}' has no authoritative active View.`,
        );
      }
      return undefined;
    }
    const view = workbench.main.views.find(
      (candidate) =>
        candidate.viewId === group.activeViewId && candidate.workspaceId === workspaceId,
    );
    if (!view) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        `Workspace '${workspaceId}' Main Group '${groupId}' has no exact active View.`,
      );
    }
    return view;
  };
  const primaryView = resolveGroupView(DESKTOP_PRIMARY_MAIN_GROUP_ID);
  const secondaryView = resolveGroupView(DESKTOP_SECONDARY_MAIN_GROUP_ID);
  const cutView =
    workbench.cutPanel?.presentation === 'docked'
      ? workbench.cutPanel.views.find(
          (view) =>
            view.viewId === workbench.cutPanel?.activeViewId && view.workspaceId === workspaceId,
        )
      : undefined;
  if (workbench.cutPanel?.presentation === 'docked' && !cutView) {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Workspace '${workspaceId}' Cut Panel has no authoritative active Cut View.`,
    );
  }

  const main = primaryView ? projectWorkspaceMainSurface(primaryView) : undefined;
  const secondaryMain = secondaryView ? projectWorkspaceMainSurface(secondaryView) : undefined;
  const cutPanel = cutView
    ? {
        kind: 'workspace-cut' as const,
        workspaceId,
        viewId: cutView.viewId,
        viewInstanceId: cutView.viewInstanceId,
        ownerId: cutView.ownerId,
      }
    : undefined;
  const currentMain = scene.slots.main;
  const currentSecondaryMain = scene.slots.secondaryMain;
  const currentCutPanel = scene.slots.cutPanel;
  if (
    sameWorkspaceMainSurface(currentMain, main) &&
    sameWorkspaceMainSurface(currentSecondaryMain, secondaryMain) &&
    ((!currentCutPanel && !cutPanel) ||
      (currentCutPanel?.kind === 'workspace-cut' &&
        cutPanel &&
        currentCutPanel.workspaceId === cutPanel.workspaceId &&
        currentCutPanel.viewId === cutPanel.viewId &&
        currentCutPanel.viewInstanceId === cutPanel.viewInstanceId &&
        currentCutPanel.ownerId === cutPanel.ownerId))
  ) {
    return scene;
  }

  const {
    main: _main,
    secondaryMain: _secondaryMain,
    cutPanel: _cutPanel,
    ...retainedSlots
  } = scene.slots;
  return parseDesktopWorkbenchSceneProjection({
    ...scene,
    slots: {
      ...retainedSlots,
      ...(main ? { main } : {}),
      ...(secondaryMain ? { secondaryMain } : {}),
      ...(cutPanel ? { cutPanel } : {}),
    },
  });
}

function reconcileRestoredWorkspaceScene(
  scene: DesktopWorkbenchSceneProjection,
  workbench: DesktopWorkbenchLayoutProjection,
  createIdentity: () => string,
): {
  readonly scene: DesktopWorkbenchSceneProjection;
  readonly diagnostic?: DesktopShellStateDiagnosticProjection;
} {
  if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
    return { scene: synchronizeWorkspaceSceneWithWorkbench(scene, workbench) };
  }
  const workspaceId = scene.context.scope.workspaceId;
  const activeViews = workbench.main.groups.flatMap((group) => {
    if (!group.activeViewId) return [];
    const view = workbench.main.views.find((candidate) => candidate.viewId === group.activeViewId);
    if (!view) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        `Desktop Main Group '${group.groupId}' has no exact active View.`,
      );
    }
    return [view];
  });
  if (activeViews.every((view) => view.workspaceId === workspaceId)) {
    return { scene: synchronizeWorkspaceSceneWithWorkbench(scene, workbench) };
  }
  return {
    scene: createDefaultDesktopAgentScene(scene.windowId, `draft:${createIdentity()}`),
    diagnostic: {
      code: 'desktop-presentation-reset',
      severity: 'warning',
      windowId: scene.windowId,
      owner: 'workspace',
      resetSceneId: scene.sceneId,
      message: `Workspace Scene '${scene.sceneId}' belonged to Workspace '${workspaceId}' while the active Project presentation belonged to another Workspace. Only the stale Scene presentation was reset; Project records and presentations were preserved.`,
    },
  };
}

function sameWorkspaceMainSurface(
  left: DesktopWorkbenchMainSurfaceRef | undefined,
  right: DesktopWorkbenchMainSurfaceRef | undefined,
): boolean {
  if (!left || !right) return left === right;
  if (!isWorkspaceMainSurface(left) || !isWorkspaceMainSurface(right) || left.kind !== right.kind) {
    return false;
  }
  if (
    left.workspaceId !== right.workspaceId ||
    left.viewId !== right.viewId ||
    left.viewInstanceId !== right.viewInstanceId
  ) {
    return false;
  }
  if (left.kind === 'character-authoring') {
    return (
      right.kind === 'character-authoring' &&
      sameAuthoringAuthority(left.authority, right.authority) &&
      left.characterProjectId === right.characterProjectId
    );
  }
  if (left.kind === 'world-authoring') {
    return (
      right.kind === 'world-authoring' &&
      sameAuthoringAuthority(left.authority, right.authority) &&
      left.worldProjectId === right.worldProjectId
    );
  }
  return right.kind === 'workspace-main';
}

function isWorkspaceMainSurface(
  surface: DesktopWorkbenchMainSurfaceRef,
): surface is Extract<
  DesktopWorkbenchMainSurfaceRef,
  { readonly kind: 'workspace-main' | 'character-authoring' | 'world-authoring' }
> {
  return (
    surface.kind === 'workspace-main' ||
    surface.kind === 'character-authoring' ||
    surface.kind === 'world-authoring'
  );
}

function projectWorkspaceMainSurface(
  view: DesktopWorkbenchViewRef,
): Extract<
  DesktopWorkbenchMainSurfaceRef,
  { readonly kind: 'workspace-main' | 'character-authoring' | 'world-authoring' }
> {
  if (view.kind === 'character-authoring') {
    if (!view.characterProjectId) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        `Character authoring View '${view.viewId}' has no exact CharacterProject.`,
      );
    }
    if (!view.projectId) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        `Character authoring View '${view.viewId}' has no exact Project authority.`,
      );
    }
    return {
      kind: 'character-authoring',
      workspaceId: view.workspaceId,
      authority: { kind: 'project', projectId: view.projectId },
      viewId: view.viewId,
      viewInstanceId: view.viewInstanceId,
      characterProjectId: view.characterProjectId,
    };
  }
  if (view.kind === 'world-authoring') {
    if (!view.worldProjectId) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        `World authoring View '${view.viewId}' has no exact WorldProject.`,
      );
    }
    if (!view.projectId) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        `World authoring View '${view.viewId}' has no exact Project authority.`,
      );
    }
    return {
      kind: 'world-authoring',
      workspaceId: view.workspaceId,
      authority: { kind: 'project', projectId: view.projectId },
      viewId: view.viewId,
      viewInstanceId: view.viewInstanceId,
      worldProjectId: view.worldProjectId,
    };
  }
  if (view.kind === 'cut') {
    throw new DesktopSceneContractError(
      'desktop-scene-scope-mismatch',
      `Cut View '${view.viewId}' cannot be projected into the Workspace Main slot.`,
    );
  }
  return {
    kind: 'workspace-main',
    workspaceId: view.workspaceId,
    viewId: view.viewId,
    viewInstanceId: view.viewInstanceId,
  };
}

function sameAuthoringAuthority(
  left: import('./desktop-scene-contract').DesktopAuthoringAuthority,
  right: import('./desktop-scene-contract').DesktopAuthoringAuthority,
): boolean {
  return left.projectId === right.projectId;
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
  if (intent.kind === 'new-agent-conversation') {
    if (
      current.context.kind !== 'agent' ||
      current.context.scope.kind === 'unbound' ||
      current.context.scope.conversationId === undefined ||
      current.slots.interaction?.kind !== 'agent' ||
      current.slots.interaction?.phase !== 'session'
    ) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        'A new owner-bound Agent Draft requires the exact active Conversation Scene.',
      );
    }
    return createReplacementAgentDraftScene(current, `draft:${createIdentity()}`);
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
  if (intent.kind === 'open-creative-management') {
    const sceneId = `scene:${windowId}:creative-management`;
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId,
      context: { kind: 'creative-management', catalog: intent.catalog },
      slots: {
        main: { kind: 'creative-management', catalog: intent.catalog },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (intent.kind === 'select-character-detail') {
    if (
      current.context.kind !== 'creative-management' ||
      current.context.catalog !== 'characters'
    ) {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        'Character detail selection requires the Character Creative Management catalog.',
      );
    }
    return parseDesktopWorkbenchSceneProjection({
      ...current,
      context: {
        kind: 'creative-management',
        catalog: 'characters',
        detail: intent.selection,
      },
      slots: {
        ...current.slots,
        main: { kind: 'creative-management', catalog: 'characters' },
        secondaryMain: { kind: 'character-detail', selection: intent.selection },
      },
    });
  }
  if (intent.kind === 'select-world-detail') {
    if (current.context.kind !== 'creative-management' || current.context.catalog !== 'worlds') {
      throw new DesktopSceneContractError(
        'desktop-scene-scope-mismatch',
        'World detail selection requires the World Creative Management catalog.',
      );
    }
    return parseDesktopWorkbenchSceneProjection({
      ...current,
      context: {
        kind: 'creative-management',
        catalog: 'worlds',
        detail: intent.selection,
      },
      slots: {
        ...current.slots,
        main: { kind: 'creative-management', catalog: 'worlds' },
        secondaryMain: { kind: 'world-detail', selection: intent.selection },
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
  if (intent.kind === 'open-world-runtime') {
    const sceneId = `scene:${windowId}:world-runtime:${intent.binding.worldRunId}`;
    const surface = {
      worldRunId: intent.binding.worldRunId,
      worldSaveId: intent.binding.worldSaveId,
      branchId: intent.binding.branchId,
      participantId: intent.binding.participantId,
    };
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId,
      context: { kind: 'world-runtime', binding: intent.binding },
      slots: {
        interaction: { kind: 'world-runtime-interaction', ...surface },
        main: { kind: 'world-runtime-main', ...surface },
        rightManager: { kind: 'world-runtime-manager', ...surface },
        cutPanel: { kind: 'world-runtime-timeline', ...surface },
        status: { kind: 'world-runtime-status', sceneId, ...surface },
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
