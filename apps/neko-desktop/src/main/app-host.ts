import { randomUUID } from 'node:crypto';
import { type NekoApplicationIdentity } from '@neko/host/application';
import type { NekoHostPorts } from '@neko/host/ports';
import type { ILogger } from '@neko/shared/logger';
import {
  parseDesktopAgentBootstrapRequest,
  parseDesktopAgentDetachRequest,
  parseDesktopAgentMessageRequest,
  type DesktopAgentBootstrapProjection,
  type DesktopAgentDetachResult,
  type DesktopAgentEvent,
  type DesktopAgentMessageResult,
} from '../shared/agent-contract';
import {
  parseDesktopBootstrapRequest,
  type DesktopBootstrapProjection,
} from '../shared/bridge-contract';
import {
  parseDesktopConversationDeleteRequest,
  parseDesktopProfileRequest,
  parseDesktopProjectOpenRequest,
  parseDesktopProjectSelectionRequest,
  parseDesktopShellRequest,
  parseDesktopTabMutationRequest,
  parseDesktopWorkbenchMutationRequest,
  parseDesktopWindowMutationRequest,
  resolveActiveDesktopWindowWorkbench,
  type DesktopOpenContentResult,
  type DesktopProfileRequestResult,
  type DesktopShellProjection,
  type DesktopShellResponse,
} from '@neko/host/desktop-shell-contract';
import {
  createDesktopSceneTransitionRequest,
  parseDesktopApplicationSidebarMutationRequest,
  parseDesktopSceneTransitionRequest,
  type DesktopWorkbenchSceneProjection,
  type DesktopSceneTransitionResult,
} from '@neko/host/desktop-scene-contract';
import { DesktopWindowRegistry, type DesktopSenderIdentity } from './window-registry';
import type {
  AgentAppHost,
  AgentControllerComposition,
  AgentSkillCatalog,
  AgentWorkspaceRuntime,
} from '@neko/agent-runtime/application';
import {
  createDesktopAgentBridgeRuntime,
  type DesktopAgentBridgeRuntime,
  type DesktopAnyAgentConnectionGrant,
  type DesktopAgentConnectionGrant,
} from './desktop-agent-bridge-runtime';
import type { DesktopShellService } from '@neko/host/desktop-shell-service';
import type { DesktopProjectManagementService } from '@neko/host/desktop-project-management-service';
import { DESKTOP_DEFAULT_ASSISTANT_SPACE_ID } from '@neko/host/desktop-shell-state';
import type {
  ResourceBrowserChildrenRequest,
  ResourceBrowserIntentRequest,
  ResourceBrowserIntentResult,
  ResourceBrowserProjection,
  ResourceBrowserProjectionEvent,
  ResourceBrowserQuickPreviewReleaseRequest,
  ResourceBrowserQuickPreviewReleaseResult,
  ResourceBrowserQuickPreviewRequest,
  ResourceBrowserQuickPreviewResult,
  ResourceBrowserRecoveryApplyRequest,
  ResourceBrowserRecoveryCancelRequest,
  ResourceBrowserRecoveryCancelResult,
  ResourceBrowserRecoveryPlanRequest,
  ResourceBrowserRecoveryPlanResult,
  ResourceBrowserSearchRequest,
  ResourceBrowserSnapshotRequest,
  ResourceBrowserThumbnailRequest,
  ResourceBrowserThumbnailResult,
} from '@neko/assets-domain/resource-browser/contract';
import { parseResourceBrowserIntentRequest } from '@neko/assets-domain/resource-browser/contract';
import {
  DESKTOP_WORKBENCH_LIMITS,
  DesktopWorkbenchContractError,
} from '@neko/host/desktop-workbench-contract';
import type { AssetCenterNodeRuntime, ResourceBrowserNodeRuntime } from '@neko/assets-node';
import {
  parseAssetCenterHostRequest,
  type AssetCenterHostResult,
} from '@neko/assets-domain/asset-center/host-contract';
import type { AssetCenterSessionProjection } from '@neko/assets-domain/asset-center/contract';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type { DesktopPreviewRuntime } from './desktop-preview-runtime';
import type { DesktopTextEditorRuntime } from './desktop-text-editor-runtime';
import {
  TEXT_EDITOR_HOST_ROUTES,
  parseTextEditorHostRequest,
  type TextEditorHostResult,
  type TextEditorProjectionEvent,
  type TextEditorRuntimeIdentity,
} from '@neko/text-editor-domain';
import type { PreviewProjection, PreviewRuntimeRequest } from '@neko/preview-domain';
import type {
  CanvasHostIntentResult,
  CanvasHostProjectionEvent,
  CanvasHostRuntimeIdentity,
  CanvasHostSnapshot,
  CanvasMaterialActionResolution,
} from '@neko/canvas-domain';
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
} from '@neko/cut-domain';
import {
  parseDesktopCutHostIdentity,
  parseDesktopCutViewMutationRequest,
  type DesktopCutViewMutationResult,
} from '../shared/cut-bridge-contract';
import type { DesktopCutRuntime } from './desktop-cut-runtime';
import {
  parseDesktopApplicationSettingsRequest,
  parseDesktopApplicationSettingsUpdateRequest,
  type DesktopAgentAdvancedSettingsResult,
  type DesktopApplicationSettingsResponse,
} from '@neko/host/application-settings';
import type { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import type { AgentExtensionManager } from '@neko/agent-runtime/extensions';
import {
  parseAgentLaunchHostRequest,
  type AgentLaunchHostResult,
} from '@neko/agent-contracts/agent-launch-host';
import { type AgentBoundDomainBinding, type AgentDomainBinding } from '@neko/agent-contracts';
import {
  parseAgentExtensionManagementHostRequest,
  type AgentExtensionManagementHostResult,
} from '@neko/agent-contracts/extension-management-host';
import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementSessionIdentity,
} from '@neko/agent-contracts/extension-management';
import type { PersonalSkillManager } from '@neko/agent-runtime/pi';
import type { ProjectPortabilityRuntime } from '@neko/assets-node';
import type {
  DesktopProjectPortabilityCancelResult,
  DesktopProjectPortabilityExecuteResult,
  DesktopProjectPortabilityInspectResult,
  DesktopProjectPortabilityPlanResult,
  DesktopProjectPortabilityProgressEvent,
} from '@neko/assets-domain/contracts';
import {
  parseDesktopAgentAutomationRequest,
  type DesktopAgentAutomationResult,
} from '../shared/agent-automation-contract';
import type { DesktopAgentLaunchRuntime } from './desktop-agent-launch-runtime';
import type { AgentLaunchDraftSubmissionApplicationService } from '@neko/agent-runtime/application';
import {
  parseDesktopWorkspaceGrantTargetRequest,
  type DesktopWorkspaceGrantTargetResult,
} from '@neko/host/desktop-workspace-grant-contract';
import type { DesktopWorkspaceGrantAuthority } from '@neko/host/desktop-workspace-grant-authority';
import {
  AgentConversationLifecycleUnavailableError,
  projectAgentConversationInitialMessage,
  type AgentConversationLifecycleService,
} from '@neko/agent-runtime/application';
import type { AssistantResourceService } from '@neko/agent-runtime/application';
import {
  isSameAgentConversationOwner,
  type AgentConversationOwnerRef,
} from '@neko/agent-contracts';
import {
  parseAssistantResourceHostRequest,
  type AssistantResourceHostResult,
} from '@neko/agent-contracts/assistant-resource-host';
import {
  parseCharacterFoundationAnyHostRequest,
  parseCharacterFoundationHostRequest,
  parseCharacterAvatarHostRequest,
  parseCharacterConversationLaunchHostRequest,
  parseCharacterRoomWorkbenchSnapshotRequest,
  type CharacterConversationLaunchInput,
  type CharacterConversationLaunchResult,
  type CharacterAvatarHostResult,
  type CharacterFoundationHostResult,
  type CharacterRoomWorkbenchProjectionEvent,
  type CharacterRoomWorkbenchSnapshotResult,
  type RoomView,
} from '@neko/chara/contracts';
import type { DesktopCharacterAvatarRuntime } from './desktop-character-avatar-runtime';
import type {
  CharacterFoundationCommandPort,
  CharacterFoundationService,
  CharacterRoomMessageSubmissionResult,
  SubmitCharacterRoomMessageInput,
} from '@neko/chara/application';
import {
  parseWorldFoundationAnyHostRequest,
  type WorldFoundationHostResult,
} from '@neko/world/contracts';
import type { WorldFoundationCommandPort, WorldFoundationService } from '@neko/world/application';

export interface DesktopAppHostOptions {
  readonly host: NekoHostPorts;
  readonly logger: ILogger;
  readonly shell: DesktopShellService;
  readonly projectManagement: DesktopProjectManagementService;
  readonly agent: AgentAppHost;
  readonly assistantWorkspace: AssetWorkspaceResolution;
  readonly agentControllerComposition?: AgentControllerComposition;
  readonly generationLifecycle?: { dispose(): Promise<void> };
  readonly workspaceConfigLifecycle?: { dispose(): void };
  readonly agentLaunch: DesktopAgentLaunchRuntime;
  readonly agentLaunchSubmission: AgentLaunchDraftSubmissionApplicationService;
  readonly workspaceGrants: DesktopWorkspaceGrantAuthority;
  readonly conversationLifecycle: AgentConversationLifecycleService;
  readonly assistantResources?: AssistantResourceService;
  readonly characterFoundation: CharacterFoundationService;
  readonly characterFoundationCommands: CharacterFoundationCommandPort;
  readonly worldFoundation: WorldFoundationService;
  readonly worldFoundationCommands: WorldFoundationCommandPort;
  readonly characterAvatar?: DesktopCharacterAvatarRuntime;
  readonly characterConversations: {
    launch(
      input: CharacterConversationLaunchInput,
      signal?: AbortSignal,
    ): Promise<CharacterConversationLaunchResult>;
  };
  readonly characterInteractions: {
    submitTurn(
      input: {
        readonly topology: 'dialogue';
        readonly dialogueRunId: string;
        readonly characterRunId: string;
        readonly message: string;
      },
      signal?: AbortSignal,
    ): Promise<{ readonly turnId: string; readonly content: string }>;
  };
  readonly characterRoomConversations: {
    submitUserMessage(
      input: SubmitCharacterRoomMessageInput,
      signal?: AbortSignal,
    ): Promise<CharacterRoomMessageSubmissionResult>;
  };
  readonly characterRoomWorkbench: {
    materializeUserView(
      input: { readonly roomRunId: string; readonly userId: string },
      signal?: AbortSignal,
    ): Promise<RoomView>;
    subscribeUserView(
      roomRunId: string,
      userId: string,
      listener: (view: RoomView) => void,
    ): () => void;
  };
  readonly assistantPreviewLifecycle?: {
    detachWindow(windowId: string): void;
    dispose(): void;
  };
  readonly resourceBrowser?: ResourceBrowserNodeRuntime;
  readonly assetCenter?: AssetCenterNodeRuntime;
  readonly projectPortability?: ProjectPortabilityRuntime;
  readonly preview?: DesktopPreviewRuntime;
  readonly textEditor?: DesktopTextEditorRuntime;
  readonly canvas?: DesktopCanvasRuntime;
  readonly cut?: DesktopCutRuntime;
  readonly settings: DesktopApplicationSettingsService;
  readonly extensionManager: AgentExtensionManager;
  readonly personalSkillManager: PersonalSkillManager;
  readonly openAgentAdvancedSettings: () => Promise<void>;
  readonly instanceId?: string;
  readonly agentAutomation?: {
    reloadRenderer(windowId: string): void;
    closeApplication(windowId: string): void;
  };
}

export class DesktopAppHost {
  readonly applicationIdentity: NekoApplicationIdentity;
  readonly windows = new DesktopWindowRegistry();
  readonly shell: DesktopShellService;
  readonly projectManagement: DesktopProjectManagementService;
  readonly agent: AgentAppHost;
  readonly agentBridge: DesktopAgentBridgeRuntime;
  readonly agentLaunch: DesktopAgentLaunchRuntime;
  readonly agentLaunchSubmission: AgentLaunchDraftSubmissionApplicationService;
  readonly workspaceGrants: DesktopWorkspaceGrantAuthority;
  readonly conversationLifecycle: AgentConversationLifecycleService;
  readonly assistantResources: AssistantResourceService | undefined;
  readonly characterFoundation: CharacterFoundationService;
  readonly characterFoundationCommands: CharacterFoundationCommandPort;
  readonly worldFoundation: WorldFoundationService;
  readonly worldFoundationCommands: WorldFoundationCommandPort;
  readonly characterAvatar: DesktopCharacterAvatarRuntime | undefined;
  readonly characterConversations: DesktopAppHostOptions['characterConversations'];
  readonly characterInteractions: DesktopAppHostOptions['characterInteractions'];
  readonly characterRoomConversations: DesktopAppHostOptions['characterRoomConversations'];
  readonly characterRoomWorkbench: DesktopAppHostOptions['characterRoomWorkbench'];
  readonly resourceBrowser: ResourceBrowserNodeRuntime | undefined;
  readonly assetCenter: AssetCenterNodeRuntime | undefined;
  readonly projectPortability: ProjectPortabilityRuntime | undefined;
  readonly preview: DesktopPreviewRuntime | undefined;
  readonly textEditor: DesktopTextEditorRuntime | undefined;
  readonly canvas: DesktopCanvasRuntime | undefined;
  readonly cut: DesktopCutRuntime | undefined;
  readonly settings: DesktopApplicationSettingsService;
  private readonly resourceSubscriptions = new Map<number, () => void>();
  private readonly canvasSubscriptions = new Map<number, Map<string, () => void>>();
  private readonly cutSubscriptions = new Map<number, Map<string, () => void>>();
  private readonly textEditorSubscriptions = new Map<number, Map<string, () => void>>();
  private readonly characterRoomWorkbenchSubscriptions = new Map<
    number,
    { readonly roomRunId: string; readonly dispose: () => void }
  >();
  private disposed = false;

  constructor(private readonly options: DesktopAppHostOptions) {
    this.applicationIdentity = {
      applicationId: 'neko-desktop',
      instanceId: options.instanceId ?? randomUUID(),
    };
    this.shell = options.shell;
    this.projectManagement = options.projectManagement;
    this.agent = options.agent;
    this.agentBridge = createDesktopAgentBridgeRuntime({
      ...(options.agentControllerComposition
        ? { controllerComposition: options.agentControllerComposition }
        : {}),
    });
    this.agentLaunch = options.agentLaunch;
    this.agentLaunchSubmission = options.agentLaunchSubmission;
    this.workspaceGrants = options.workspaceGrants;
    this.conversationLifecycle = options.conversationLifecycle;
    this.assistantResources = options.assistantResources;
    this.characterFoundation = options.characterFoundation;
    this.characterFoundationCommands = options.characterFoundationCommands;
    this.worldFoundation = options.worldFoundation;
    this.worldFoundationCommands = options.worldFoundationCommands;
    this.characterAvatar = options.characterAvatar;
    this.characterConversations = options.characterConversations;
    this.characterInteractions = options.characterInteractions;
    this.characterRoomConversations = options.characterRoomConversations;
    this.characterRoomWorkbench = options.characterRoomWorkbench;
    this.resourceBrowser = options.resourceBrowser;
    this.assetCenter = options.assetCenter;
    this.projectPortability = options.projectPortability;
    this.preview = options.preview;
    this.textEditor = options.textEditor;
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
      requestId: request.requestId,
      projection: this.settings.current,
    };
  }

  async createCharacterFoundationSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CharacterFoundationHostResult> {
    this.requireActive();
    parseCharacterFoundationHostRequest(payload);
    this.windows.resolveSender(sender);
    throw new Error(
      'Character and Room capabilities remain experimental and are not available in the production Desktop.',
    );
  }

  async executeCharacterFoundationRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CharacterFoundationHostResult> {
    this.requireActive();
    parseCharacterFoundationAnyHostRequest(payload);
    this.windows.resolveSender(sender);
    throw new Error(
      'Character and Room capabilities remain experimental and are not available in the production Desktop.',
    );
  }

  async executeWorldFoundationRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<WorldFoundationHostResult> {
    this.requireActive();
    parseWorldFoundationAnyHostRequest(payload);
    this.windows.resolveSender(sender);
    throw new Error(
      'Interactive World capabilities remain experimental and are not available in the production Desktop.',
    );
  }

  async executeCharacterConversationLaunchRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<{ readonly requestId: string; readonly launch: CharacterConversationLaunchResult }> {
    this.requireActive();
    parseCharacterConversationLaunchHostRequest(payload);
    this.windows.resolveSender(sender);
    throw new Error(
      'Character and Room capabilities remain experimental and are not available in the production Desktop.',
    );
  }

  async executeCharacterAvatarRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CharacterAvatarHostResult> {
    this.requireActive();
    const request = parseCharacterAvatarHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
    const runtime = this.characterAvatar;
    if (!runtime) {
      return {
        requestId: request.requestId,
        status: 'unavailable',
        diagnostic: {
          code: 'character-avatar-renderer-unavailable',
          message: 'The Character Avatar runtime is unavailable.',
        },
      };
    }
    if (request.operation === 'release') {
      runtime.release({
        windowId: window.windowId,
        rendererSessionId: request.rendererSessionId,
        avatarResourceLeaseId: request.avatarResourceLeaseId,
      });
      return {
        requestId: request.requestId,
        status: 'released',
        avatarResourceLeaseId: request.avatarResourceLeaseId,
      };
    }
    const shell = await this.shell.getProjection(window.windowId);
    const composition = resolveActiveDesktopWindowWorkbench(shell.window);
    if (
      composition.workbenchInstanceId !== request.workbenchInstanceId ||
      composition.scene.context.kind !== 'character-interaction'
    ) {
      return {
        requestId: request.requestId,
        status: 'unavailable',
        diagnostic: {
          code: 'character-avatar-scene-mismatch',
          message: 'The Character Avatar request does not match the exact active Workbench.',
        },
      };
    }
    return runtime.open({
      windowId: window.windowId,
      request,
      owner: composition.scene.context.owner,
    });
  }

  async getCharacterRoomWorkbenchSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: CharacterRoomWorkbenchProjectionEvent) => void,
  ): Promise<CharacterRoomWorkbenchSnapshotResult> {
    this.requireActive();
    const request = parseCharacterRoomWorkbenchSnapshotRequest(payload);
    const window = this.windows.resolveSender(sender);
    const scene = await this.shell.getSceneProjection(window.windowId);
    if (
      scene.context.kind !== 'character-interaction' ||
      scene.context.owner.kind !== 'room' ||
      scene.context.owner.roomRunId !== request.roomRunId
    ) {
      throw new Error('Character Room Workbench request does not match the active Room Scene.');
    }

    const current = this.characterRoomWorkbenchSubscriptions.get(sender.webContentsId);
    current?.dispose();
    let sequence = 0;
    let active = false;
    const disposeUserView = this.characterRoomWorkbench.subscribeUserView(
      request.roomRunId,
      'user:local',
      (projection) => {
        if (active) publish({ requestId: request.requestId, sequence: ++sequence, projection });
      },
    );
    const subscription = {
      roomRunId: request.roomRunId,
      dispose: () => {
        active = false;
        disposeUserView();
      },
    };
    this.characterRoomWorkbenchSubscriptions.set(sender.webContentsId, subscription);
    active = true;

    try {
      const projection = await this.characterRoomWorkbench.materializeUserView({
        roomRunId: request.roomRunId,
        userId: 'user:local',
      });
      return {
        requestId: request.requestId,
        sequence,
        projection,
      };
    } catch (error) {
      if (this.characterRoomWorkbenchSubscriptions.get(sender.webContentsId) === subscription) {
        subscription.dispose();
        this.characterRoomWorkbenchSubscriptions.delete(sender.webContentsId);
      }
      throw error;
    }
  }

  async updateApplicationSettings(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopApplicationSettingsResponse> {
    this.requireActive();
    const request = parseDesktopApplicationSettingsUpdateRequest(payload);
    this.windows.resolveSender(sender);
    return {
      requestId: request.requestId,
      projection: await this.settings.update(request.preferences),
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
      requestId: request.requestId,
      application: this.applicationIdentity,
      window: {
        windowId: window.windowId,
        rendererSessionId: window.rendererSessionId,
      },
      host: {
        id: host.id,
        kind: host.kind,
        ui: host.ui,
        ...(host.displayName ? { displayName: host.displayName } : {}),
      },
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
      requestId: request.requestId,
      projection: await this.shell.getProjection(window.windowId),
    };
  }

  async createAgentBootstrap(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: DesktopAgentEvent) => void,
  ): Promise<DesktopAgentBootstrapProjection> {
    this.requireActive();
    const request = parseDesktopAgentBootstrapRequest(payload);
    const window = this.windows.resolveSender(sender);
    const surfaceGrant = await this.shell.resolveAgentSurfaceGrant(window.windowId, request);
    const surfaceInteraction = surfaceGrant.interaction;
    if (surfaceInteraction.agentViewId !== request.viewId) {
      throw new Error('Desktop Agent bootstrap does not match its exact Agent Surface View.');
    }
    if ('assistantSpaceId' in request) {
      if (
        surfaceInteraction.phase !== 'session' ||
        surfaceInteraction.scope.kind !== 'assistant' ||
        surfaceInteraction.scope.assistantSpaceId !== request.assistantSpaceId ||
        surfaceInteraction.scope.conversationId !== request.conversationId
      ) {
        throw new Error(
          'Desktop Assistant Agent bootstrap does not match its exact Agent Surface.',
        );
      }
      const restored = await readAgentConversationBootstrap(
        this.conversationLifecycle,
        request.conversationId,
      );
      if (restored.status === 'unavailable') {
        return {
          requestId: request.requestId,
          status: 'unavailable',
          diagnostic: restored.diagnostic,
        };
      }
      const { context, firstSubmitRecord } = restored;
      const scene = resolveActiveDesktopWindowWorkbench(
        (await this.shell.getProjection(window.windowId)).window,
      ).scene;
      if (!assistantSurfaceContextMatches(context, scene, request.assistantSpaceId)) {
        throw new Error(
          'Desktop Assistant Agent bootstrap does not match its persisted Conversation context.',
        );
      }
      if (this.options.assistantWorkspace.workspaceId !== request.assistantSpaceId) {
        throw new Error(
          `Desktop Assistant Space '${request.assistantSpaceId}' does not match its configured Workspace authority.`,
        );
      }
      const workspace =
        this.agent.getWorkspace(request.assistantSpaceId) ??
        (await this.agent.attachWorkspace(this.options.assistantWorkspace));
      if (workspace.workspaceId !== request.assistantSpaceId) {
        throw new Error(
          `Desktop Assistant Space '${request.assistantSpaceId}' resolved to another Agent runtime.`,
        );
      }
      return this.agentBridge.createBootstrap({
        requestId: request.requestId,
        grant: {
          applicationInstanceId: this.applicationIdentity.instanceId,
          windowId: window.windowId,
          workbenchInstanceId: request.workbenchInstanceId,
          agentSurfaceId: request.agentSurfaceId,
          assistantSpaceId: request.assistantSpaceId,
          workspaceId: workspace.workspaceId,
          viewId: request.viewId,
        },
        workspace,
        initialConversationId: request.conversationId,
        ...(firstSubmitRecord === undefined
          ? {}
          : {
              initialConversationMessage: projectAgentConversationInitialMessage(firstSubmitRecord),
            }),
        publish,
        readConversationContext: (conversationId) =>
          this.conversationLifecycle.readConversationContext(conversationId),
        ...(context.kind === 'assistant'
          ? {
              readConversationConfiguration: (conversationId: string) =>
                this.conversationLifecycle.readConversationConfiguration(conversationId),
              updateConversationConfiguration: (
                input: Parameters<AgentConversationLifecycleService['updateConfiguration']>[0],
              ) => this.conversationLifecycle.updateConfiguration(input),
            }
          : {}),
        readGlobalSkillCatalog: () => this.agent.readGlobalSkillCatalog(),
        personalSkillOwnerId: DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
      });
    }
    const view = await this.shell.resolveAgentViewGrant(window.windowId, request);
    if (
      surfaceInteraction.scope.kind !== 'workspace' ||
      surfaceInteraction.scope.workspaceId !== view.workspaceId
    ) {
      throw new Error('Desktop Workspace Agent bootstrap does not match its exact Agent Surface.');
    }
    const grant: DesktopAgentConnectionGrant = {
      applicationInstanceId: this.applicationIdentity.instanceId,
      windowId: window.windowId,
      workbenchInstanceId: request.workbenchInstanceId,
      agentSurfaceId: request.agentSurfaceId,
      projectId: view.projectId,
      workspaceId: view.workspaceId,
      viewId: view.viewId,
    };
    let workspace = this.agent.getWorkspace(grant.workspaceId);
    if (!workspace && this.agentBridge.startup.ready) {
      workspace = await this.agent.attachWorkspace(
        await this.shell.resolveAgentWorkspace(grant.workspaceId),
      );
    }
    const initialConversationId = request.conversationId ?? surfaceInteraction.scope.conversationId;
    if (
      initialConversationId !== surfaceInteraction.scope.conversationId ||
      (initialConversationId === undefined && surfaceInteraction.phase !== 'draft') ||
      (initialConversationId !== undefined && surfaceInteraction.phase !== 'session')
    ) {
      throw new Error('Desktop Workspace Agent bootstrap does not match its exact Agent Surface.');
    }
    const initialConversation =
      initialConversationId === undefined
        ? undefined
        : await readAgentConversationBootstrap(this.conversationLifecycle, initialConversationId);
    if (initialConversation?.status === 'unavailable') {
      return {
        requestId: request.requestId,
        status: 'unavailable',
        diagnostic: initialConversation.diagnostic,
      };
    }
    if (
      initialConversation &&
      (initialConversation.context.kind !== 'workspace' ||
        initialConversation.context.workspaceId !== grant.workspaceId)
    ) {
      throw new Error('Desktop Workspace Agent bootstrap context belongs to another Workspace.');
    }
    const initialConversationRecord = initialConversation?.firstSubmitRecord;
    return this.agentBridge.createBootstrap({
      requestId: request.requestId,
      grant,
      workspace,
      ...(initialConversationId === undefined ? {} : { initialConversationId }),
      ...(initialConversationRecord === undefined
        ? {}
        : {
            initialConversationMessage:
              projectAgentConversationInitialMessage(initialConversationRecord),
          }),
      publish,
      readConversationContext: (conversationId) =>
        this.conversationLifecycle.readConversationContext(conversationId),
      readConversationConfiguration: (conversationId) =>
        this.conversationLifecycle.readConversationConfiguration(conversationId),
      updateConversationConfiguration: (input) =>
        this.conversationLifecycle.updateConfiguration(input),
      readGlobalSkillCatalog: () => this.agent.readGlobalSkillCatalog(),
      personalSkillOwnerId: DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
    });
  }

  async executeAgentLaunchRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<AgentLaunchHostResult> {
    this.requireActive();
    const request = parseAgentLaunchHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.operation === 'attach') {
      const surfaceGrant = await this.shell.resolveAgentSurfaceGrant(window.windowId, request);
      const interaction = surfaceGrant.interaction;
      if (
        interaction.agentViewId !== request.viewId ||
        interaction.phase !== 'draft' ||
        !desktopAgentScopeMatchesBinding(interaction.scope, request.draft.binding) ||
        interaction.scope.draftId !== request.draft.draftId
      ) {
        throw new Error('Agent launch attach does not match its exact Agent Surface.');
      }
      if (request.draft.binding.kind === 'workspace') {
        try {
          await this.workspaceGrants.restore(
            window.windowId,
            request.draft.binding.workspaceGrantId,
            request.draft.binding.workspaceId,
          );
        } catch {
          return {
            requestId: request.requestId,
            status: 'unavailable',
            diagnostic: {
              code: 'agent-workspace-binding-unavailable',
              owner: 'workspace',
              message: 'The exact Workspace access for this Agent draft is unavailable.',
            },
          };
        }
      }
      return {
        requestId: request.requestId,
        status: 'ready',
        catalog: await this.agentLaunch.attach({
          applicationInstanceId: this.applicationIdentity.instanceId,
          windowId: window.windowId,
          workbenchInstanceId: surfaceGrant.workbenchInstanceId,
          agentSurfaceId: surfaceGrant.agentSurfaceId,
          viewId: request.viewId,
          draft: request.draft,
        }),
      };
    }
    const connection = request.connection;
    if (
      connection.applicationInstanceId !== this.applicationIdentity.instanceId ||
      connection.windowId !== window.windowId
    ) {
      throw new Error('Agent launch connection does not match its sender-bound Desktop identity.');
    }
    if (request.operation === 'bind-assistant') {
      return {
        requestId: request.requestId,
        status: 'ready',
        catalog: await this.agentLaunch.bindTarget(connection, {
          kind: 'assistant',
          assistantSpaceId: DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
          baseGrantIds: [],
        }),
      };
    }
    if (request.operation === 'bind-target') {
      if (request.binding.kind === 'assistant') {
        if (
          request.binding.assistantSpaceId !== DESKTOP_DEFAULT_ASSISTANT_SPACE_ID ||
          request.binding.baseGrantIds.length > 0
        ) {
          throw new Error('Agent Assistant target is not authorized by this Desktop entry.');
        }
      } else if (request.binding.kind === 'workspace') {
        const resolution = await this.workspaceGrants.resolve(
          window.windowId,
          request.binding.workspaceGrantId,
        );
        if (resolution.workspace.workspaceId !== request.binding.workspaceId) {
          throw new Error('Agent Workspace target grant resolves to another Workspace.');
        }
      } else if (request.binding.kind === 'character' || request.binding.kind === 'world') {
        throw new Error(`Agent ${request.binding.kind} binding provider is unavailable.`);
      }
      return {
        requestId: request.requestId,
        status: 'ready',
        catalog: await this.agentLaunch.bindTarget(connection, request.binding),
      };
    }
    if (request.operation === 'update-configuration') {
      return {
        requestId: request.requestId,
        status: 'ready',
        catalog: this.agentLaunch.updateConfiguration(connection, request.configuration),
      };
    }
    if (request.operation === 'search-workspace-mentions') {
      return {
        requestId: request.requestId,
        status: 'mentions',
        projection: await this.agentLaunch.searchWorkspaceMentions(
          connection,
          request.bindingReceiptId,
          request.filter,
        ),
      };
    }
    if (request.operation === 'authorize-resource') {
      const catalog = await this.agentLaunch.authorizeResource(connection, request.resourceKind);
      return catalog
        ? {
            requestId: request.requestId,
            status: 'ready',
            catalog,
          }
        : {
            requestId: request.requestId,
            status: 'cancelled',
          };
    }
    if (request.operation === 'submit-draft') {
      return {
        requestId: request.requestId,
        status: 'committed',
        projection: await this.agentLaunchSubmission.submit({
          requestId: request.requestId,
          connection,
          draftInput: request.input,
        }),
      };
    }
    await this.agentLaunch.detach(connection);
    return {
      requestId: request.requestId,
      status: 'detached',
    };
  }

  async executeAssistantResourceRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<AssistantResourceHostResult> {
    this.requireActive();
    const resources = this.assistantResources;
    if (!resources) throw new Error('Assistant Resource authority is unavailable.');
    const request = parseAssistantResourceHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.identity.windowId !== window.windowId) {
      throw new Error('Assistant Resource request belongs to another Window.');
    }
    const projection = await this.shell.getProjection(window.windowId);
    const scene = resolveActiveDesktopWindowWorkbench(projection.window).scene;
    if (
      scene.context.kind !== 'agent' ||
      scene.context.scope.kind !== 'assistant' ||
      scene.context.scope.assistantSpaceId !== request.identity.assistantSpaceId ||
      scene.context.scope.conversationId !== request.identity.conversationId ||
      scene.slots.interaction?.kind !== 'agent' ||
      scene.slots.interaction.phase !== 'session'
    ) {
      throw new Error('Assistant Resource request does not match the exact active Scene.');
    }
    if (request.route === 'snapshot.get') {
      return {
        requestId: request.requestId,
        route: 'snapshot.get',
        projection: await resources.snapshot(request.identity),
      };
    }
    if (request.route === 'preview.authorize') {
      const preview = await resources.authorizePreview({
        identity: request.identity,
        scratchArtifactId: request.scratchArtifactId,
      });
      if (preview.identity.owner.kind !== 'assistant-scratch') {
        throw new Error('Assistant Resource Preview returned a non-Assistant owner.');
      }
      await this.shell.projectAssistantPreview({
        windowId: window.windowId,
        rendererSessionId: projection.rendererSessionId,
        assistantSpaceId: request.identity.assistantSpaceId,
        conversationId: request.identity.conversationId,
        previewSessionId: preview.identity.previewSessionId,
        scratchArtifactId: preview.identity.owner.scratchArtifactId,
      });
      return {
        requestId: request.requestId,
        route: 'preview.authorize',
        preview,
      };
    }
    if (request.route === 'preview.get') {
      if (
        scene.slots.main?.kind !== 'assistant-preview' ||
        scene.slots.main.previewSessionId !== request.previewSessionId
      ) {
        throw new Error('Assistant Preview request does not match the active Main Surface.');
      }
      return {
        requestId: request.requestId,
        route: 'preview.get',
        preview: resources.readPreview(request),
      };
    }
    resources.releasePreview(request);
    await this.shell.projectAssistantPreview({
      windowId: window.windowId,
      rendererSessionId: projection.rendererSessionId,
      assistantSpaceId: request.identity.assistantSpaceId,
      conversationId: request.identity.conversationId,
    });
    return {
      requestId: request.requestId,
      route: 'preview.release',
      status: 'released',
    };
  }

  async resolveWorkspaceTarget(
    sender: DesktopSenderIdentity,
    payload: unknown,
    selectWorkspace: () => Promise<
      | {
          readonly label: string;
          readonly hostResource: string;
        }
      | undefined
    >,
  ): Promise<DesktopWorkspaceGrantTargetResult> {
    this.requireActive();
    const request = parseDesktopWorkspaceGrantTargetRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('Desktop Workspace grant request belongs to another Window.');
    }
    await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
    if (request.operation === 'choose-directory') {
      const selection = await selectWorkspace();
      if (!selection) return { requestId: request.requestId, status: 'cancelled' };
      await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
      const grant = this.workspaceGrants.authorize({
        windowId: window.windowId,
        label: selection.label,
        hostResource: selection.hostResource,
      });
      const resolution = await this.workspaceGrants.resolve(
        window.windowId,
        grant.workspaceGrantId,
      );
      return {
        requestId: request.requestId,
        status: 'authorized',
        workspaceId: resolution.workspace.workspaceId,
        grant,
      };
    }
    const projection = await this.shell.getProjection(window.windowId);
    const project = projection.catalog.projects.find(
      (candidate) => candidate.projectId === request.projectId,
    );
    if (!project || project.unavailable) {
      throw new Error(`Desktop Project '${request.projectId}' is unavailable as a Draft target.`);
    }
    const target = await this.workspaceGrants.authorizeWorkspace({
      windowId: window.windowId,
      workspaceId: project.workspaceId,
    });
    await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
    return {
      requestId: request.requestId,
      status: 'authorized',
      workspaceId: target.workspace.workspaceId,
      grant: target.grant,
    };
  }

  async sendAgentMessage(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopAgentMessageResult> {
    this.requireActive();
    const request = parseDesktopAgentMessageRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (isAgentProjectionControlMessage(request.message.type)) {
      const result = await this.agentBridge.sendProjectionControl(request, {
        applicationInstanceId: this.applicationIdentity.instanceId,
        windowId: window.windowId,
      });
      if (request.message.type === 'projectionAttach') {
        this.startCommittedAgentProviderExecution(request.message.key.conversationId);
      }
      return result;
    }
    const grant = await this.resolveAgentConnectionGrant(window.windowId, request.connection);
    if (request.message.type === 'sendMessage') {
      const context = await this.conversationLifecycle.readConversationContext(
        request.message.conversationId,
      );
      if (context.kind === 'room') {
        const scene = resolveActiveDesktopWindowWorkbench(
          (await this.shell.getProjection(window.windowId)).window,
        ).scene;
        if (
          scene.context.kind !== 'character-interaction' ||
          scene.context.owner.kind !== 'room' ||
          scene.context.scope.conversationId !== request.message.conversationId ||
          !isSameAgentConversationOwner(conversationOwnerFromContext(context), scene.context.owner)
        ) {
          throw new Error('Room message does not match the exact active Room Conversation owner.');
        }
        this.agentBridge.assertConnection(request.connection, grant);
        const result = await this.characterRoomConversations.submitUserMessage({
          submissionId: request.message.messageTrackingId ?? request.requestId,
          roomRunId: context.roomRunId,
          userId: 'user:local',
          message: request.message.message,
        });
        const rejected = result.outcomes.filter((outcome) => outcome.status === 'rejected');
        for (const outcome of rejected) {
          this.reportError(
            outcome.diagnostic.code,
            `Room participant '${outcome.participantId}' response was rejected.`,
            new Error(outcome.diagnostic.message),
          );
        }
        if (
          result.outcomes.length > 0 &&
          result.outcomes.every((outcome) => outcome.status === 'rejected')
        ) {
          throw new Error('Every scheduled Room participant response was rejected.');
        }
        return { requestId: request.requestId, status: 'accepted' };
      }
      if (context.kind === 'character') {
        const scene = resolveActiveDesktopWindowWorkbench(
          (await this.shell.getProjection(window.windowId)).window,
        ).scene;
        if (
          !context.characterRunId ||
          !context.dialogueRunId ||
          scene.context.kind !== 'character-interaction' ||
          scene.context.owner.kind !== 'character' ||
          scene.context.scope.conversationId !== request.message.conversationId ||
          !isSameAgentConversationOwner(conversationOwnerFromContext(context), scene.context.owner)
        ) {
          throw new Error(
            'Character message does not match the exact active Character Conversation owner.',
          );
        }
        this.agentBridge.assertConnection(request.connection, grant);
        await this.characterInteractions.submitTurn({
          topology: 'dialogue',
          dialogueRunId: context.dialogueRunId,
          characterRunId: context.characterRunId,
          message: request.message.message,
        });
        return { requestId: request.requestId, status: 'accepted' };
      }
    }
    if (request.message.type === 'newConversation') {
      const projection = await this.shell.getProjection(window.windowId);
      const scene = resolveActiveDesktopWindowWorkbench(projection.window).scene;
      await this.shell.transitionScene(
        createDesktopSceneTransitionRequest({
          requestId: request.requestId,
          rendererSessionId: projection.rendererSessionId,
          windowId: window.windowId,
          sceneId: scene.sceneId,
          intent: { kind: 'new-agent-conversation' },
        }),
      );
      return { requestId: request.requestId, status: 'accepted' };
    }
    return this.agentBridge.send(request, grant);
  }

  async detachAgentConnection(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopAgentDetachResult> {
    this.requireActive();
    const request = parseDesktopAgentDetachRequest(payload);
    const window = this.windows.resolveSender(sender);
    this.agentBridge.detachConnection(request.connection, {
      applicationInstanceId: this.applicationIdentity.instanceId,
      windowId: window.windowId,
    });
    return {
      requestId: request.requestId,
      status: 'detached',
    };
  }

  async executeAgentAutomation(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopAgentAutomationResult> {
    this.requireActive();
    const automation = this.options.agentAutomation;
    if (!automation) {
      throw new Error('Desktop Agent automation is unavailable outside an isolated fixture.');
    }
    const request = parseDesktopAgentAutomationRequest(payload);
    const window = this.windows.resolveSender(sender);
    const grant = await this.resolveAgentConnectionGrant(window.windowId, request.connection);
    switch (request.operation.kind) {
      case 'wait-for-idle':
        return {
          requestId: request.requestId,
          status: 'idle',
          identity: await this.agentBridge.waitForIdle(
            request.connection,
            grant,
            request.operation.conversationId,
            request.operation.timeoutMs,
            request.operation.afterIdentity,
          ),
        };
      case 'read-facts':
        return {
          requestId: request.requestId,
          status: 'facts',
          facts: this.agentBridge.readFacts(request.connection, grant, request.operation),
        };
      case 'reload-renderer': {
        const facts = await this.agentBridge.disposeConnectionAndReadFacts(
          request.connection,
          grant,
        );
        automation.reloadRenderer(window.windowId);
        return {
          requestId: request.requestId,
          status: 'facts',
          facts,
        };
      }
      case 'close-application': {
        const facts = await this.agentBridge.disposeConnectionAndReadFacts(
          request.connection,
          grant,
        );
        automation.closeApplication(window.windowId);
        return {
          requestId: request.requestId,
          status: 'facts',
          facts,
        };
      }
      case 'submit':
      case 'queue':
      case 'cancel':
      case 'confirm':
      case 'resume':
        throw new Error(
          `Desktop Agent automation operation '${request.operation.kind}' must use the ordinary public Agent bridge.`,
        );
    }
  }

  async openContentProject(
    sender: DesktopSenderIdentity,
    payload: unknown,
    selectWorkspace: () => Promise<string | undefined>,
  ): Promise<DesktopOpenContentResult> {
    this.requireActive();
    const request = parseDesktopWindowMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
    const workspacePath = await selectWorkspace();
    if (!workspacePath) {
      return {
        requestId: request.requestId,
        status: 'cancelled',
        projection: await this.shell.getProjection(window.windowId),
      };
    }
    const initial = await this.shell.getProjection(window.windowId);
    const grant = this.workspaceGrants.authorize({
      windowId: window.windowId,
      label: workspacePath,
      hostResource: workspacePath,
    });
    const transitioned = await this.transitionScene(
      sender,
      createDesktopSceneTransitionRequest({
        requestId: request.requestId,
        rendererSessionId: request.rendererSessionId,
        windowId: window.windowId,
        sceneId: resolveActiveDesktopWindowWorkbench(initial.window).scene.sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: grant.workspaceGrantId },
      }),
    );
    if (transitioned.status !== 'transitioned') {
      throw new Error('Authorized Workspace open did not activate its Workspace Scene.');
    }
    return {
      requestId: request.requestId,
      status: 'opened',
      projection: await this.shell.getProjection(window.windowId),
    };
  }

  async openCatalogProject(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopOpenContentResult> {
    this.requireActive();
    const request = parseDesktopProjectOpenRequest(payload);
    const window = this.windows.resolveSender(sender);
    const initial = await this.shell.getProjection(window.windowId);
    const transitioned = await this.transitionScene(
      sender,
      createDesktopSceneTransitionRequest({
        requestId: request.requestId,
        rendererSessionId: request.rendererSessionId,
        windowId: window.windowId,
        sceneId: resolveActiveDesktopWindowWorkbench(initial.window).scene.sceneId,
        intent: { kind: 'open-project-workspace', projectId: request.projectId },
      }),
    );
    if (transitioned.status !== 'transitioned') {
      throw new Error('Catalog Project open did not activate its Workspace Scene.');
    }
    return {
      requestId: request.requestId,
      status: 'opened',
      projection: await this.shell.getProjection(window.windowId),
    };
  }

  async removeProjects(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopProjectSelectionRequest(payload);
    const window = this.windows.resolveSender(sender);
    return {
      requestId: request.requestId,
      projection: await this.projectManagement.removeProjects(
        window.windowId,
        request.rendererSessionId,
        request.projectIds,
      ),
    };
  }

  async deleteProjectConversations(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopProjectSelectionRequest(payload);
    const window = this.windows.resolveSender(sender);
    return {
      requestId: request.requestId,
      projection: await this.projectManagement.deleteProjectConversations(
        window.windowId,
        request.rendererSessionId,
        request.projectIds,
      ),
    };
  }

  async deleteHomeConversations(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopConversationDeleteRequest(payload);
    const window = this.windows.resolveSender(sender);
    for (const navigation of request.navigations) {
      await this.shell.assertAgentHomeConversation(
        window.windowId,
        request.rendererSessionId,
        navigation,
      );
    }
    for (const navigation of request.navigations) {
      await this.agent.deleteConversation(navigation.conversationId);
    }
    return {
      requestId: request.requestId,
      projection: await this.shell.getProjection(window.windowId),
    };
  }

  async executeAssetCenter(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<AssetCenterHostResult> {
    this.requireActive();
    const request = parseAssetCenterHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.identity.windowId !== window.windowId) {
      throw new Error('Asset Center request belongs to another Window.');
    }
    const shell = await this.shell.getProjection(window.windowId);
    const runtime = this.requireAssetCenter();
    if (request.route === 'preview.get') {
      return {
        requestId: request.requestId,
        route: request.route,
        preview: runtime.getPreview(request.identity, request.previewSessionId),
      };
    }
    if (request.route === 'thumbnail.resolve') {
      return {
        requestId: request.requestId,
        route: request.route,
        thumbnail: await runtime.resolveThumbnail(request),
      };
    }
    let projection: AssetCenterSessionProjection;
    switch (request.route) {
      case 'attach':
        projection = runtime.attach({
          identity: request.identity,
          initialViewMode: request.initialViewMode,
        });
        break;
      case 'snapshot.get':
        projection = runtime.getSnapshot(request.identity);
        break;
      case 'filter.update':
        projection = await runtime.updateFilter(request);
        break;
      case 'catalog.refresh':
        projection = await runtime.refresh(request);
        break;
      case 'selection.select':
        projection = await runtime.select(request);
        break;
      case 'session.detach':
        projection = await runtime.detachSession(request.identity);
        break;
      case 'asset.import':
        projection = await runtime.importAssets(request);
        break;
      case 'assets.remove':
        projection = await runtime.removeAssets(request);
        break;
      case 'items.move':
        projection = await runtime.moveItems(request);
        break;
      case 'media-library.add':
        projection = await runtime.addMediaLibrary(request);
        break;
      case 'media-library.relink':
        projection = await runtime.relinkMediaLibrary(request);
        break;
      case 'media-library.remove':
        projection = await runtime.removeMediaLibrary(request);
        break;
      case 'media-library.reveal':
        projection = await runtime.revealMediaLibrary(request);
        break;
    }
    if (
      request.route === 'selection.select' ||
      request.route === 'assets.remove' ||
      request.route === 'items.move' ||
      request.route === 'session.detach'
    ) {
      const currentScene = await this.shell.getSceneProjection(window.windowId);
      if (
        currentScene.context.kind === 'asset-center' &&
        currentScene.context.assetCenterSessionId === request.identity.assetCenterSessionId
      ) {
        await this.shell.projectAssetCenterPreview({
          windowId: window.windowId,
          rendererSessionId: shell.rendererSessionId,
          assetCenterSessionId: request.identity.assetCenterSessionId,
          ...(projection.preview.status === 'ready'
            ? { previewSessionId: projection.preview.previewSessionId }
            : {}),
        });
      }
    }
    return {
      requestId: request.requestId,
      route: request.route,
      projection,
    };
  }

  async executeExtensionManagement(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<AgentExtensionManagementHostResult> {
    this.requireActive();
    const request = parseAgentExtensionManagementHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.identity.windowId !== window.windowId) {
      throw new Error('Agent Extension Management request belongs to another Window.');
    }
    const shell = await this.shell.getProjection(window.windowId);
    const activeScene = resolveActiveDesktopWindowWorkbench(shell.window).scene;
    if (activeScene.context.kind !== 'extensions') {
      throw new Error('Agent Extension Management request does not match the active Scene.');
    }
    switch (request.route) {
      case 'snapshot.get':
        break;
      case 'plugin.install': {
        this.requireAgentIdleForPluginMutation();
        const snapshot = await this.options.extensionManager.installPlugin(request.pluginId);
        await this.activatePluginSnapshot(snapshot);
        break;
      }
      case 'plugin.enable': {
        this.requireAgentIdleForPluginMutation();
        const snapshot = await this.options.extensionManager.enablePlugin(request.pluginId);
        await this.activatePluginSnapshot(snapshot);
        break;
      }
      case 'plugin.disable': {
        this.requireAgentIdleForPluginMutation();
        const snapshot = await this.options.extensionManager.disablePlugin(request.pluginId);
        await this.activatePluginSnapshot(snapshot);
        break;
      }
      case 'plugin.remove': {
        this.requireAgentIdleForPluginMutation();
        const snapshot = await this.options.extensionManager.removePlugin(request.pluginId);
        await this.activatePluginSnapshot(snapshot);
        break;
      }
      case 'marketplaces.refresh': {
        this.requireAgentIdleForPluginMutation();
        const snapshot = await this.options.extensionManager.refreshMarketplaces();
        await this.activatePluginSnapshot(snapshot);
        break;
      }
      case 'skill.install': {
        await this.options.personalSkillManager.install(window.windowId);
        break;
      }
      case 'skill.remove': {
        const skills = await this.agent.readGlobalSkillCatalog();
        await this.options.personalSkillManager.remove(request.managementId, skills.records);
        break;
      }
    }
    return {
      requestId: request.requestId,
      route: request.route,
      projection: await this.projectExtensionManagement(request.identity),
    };
  }

  private async prepareExtensionCatalog() {
    const snapshot = await this.options.extensionManager.readCatalog();
    await this.activatePluginSnapshot(snapshot);
    return this.options.extensionManager.readCatalog();
  }

  private async projectExtensionManagement(
    identity: AgentExtensionManagementSessionIdentity,
  ): Promise<AgentExtensionManagementProjection> {
    const extensionCatalog = await this.prepareExtensionCatalog();
    const skillCatalog = await this.agent.readGlobalSkillCatalog();
    for (const skill of skillCatalog.records) {
      if (skill.source.kind === 'project') {
        throw new Error('Agent global Skill catalog returned a Workspace-scoped Skill.');
      }
    }
    const skills = await Promise.all(
      skillCatalog.records
        .filter((skill) => skill.source.kind !== 'builtin')
        .map(async (skill) => {
          const source = requireGlobalSkillSource(skill.source);
          const sourceId = skill.source.kind === 'plugin' ? skill.source.pluginId : source;
          const managementId =
            source === 'personal'
              ? await this.options.personalSkillManager.resolveManagementId(skill)
              : undefined;
          return {
            id: `${source}:${sourceId}:${skill.name}`,
            name: skill.name,
            description: skill.description,
            source,
            sourceId,
            managementId: managementId ?? '',
            canRemove: managementId !== undefined,
          };
        }),
    );
    return {
      identity,
      skills,
      skillDiscovery: projectSkillDiscovery(skillCatalog),
      extensions: extensionCatalog.records,
      extensionDiscovery: { diagnostics: extensionCatalog.diagnostics },
    };
  }

  private async activatePluginSnapshot(
    snapshot: Awaited<ReturnType<AgentExtensionManager['readCatalog']>>,
  ): Promise<void> {
    const readiness = await this.agent.reconcilePluginRuntime(snapshot);
    this.options.extensionManager.setRuntimeReadiness(snapshot, readiness);
  }

  private requireAgentIdleForPluginMutation(): void {
    if (this.agent.hasActiveTurns()) {
      throw new Error('Plugin management is unavailable while an Agent turn is active.');
    }
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
      requestId: request.requestId,
      projection: await this.shell.activateHome(window.windowId, request.rendererSessionId),
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
      request.rendererSessionId,
      request.workbenchInstanceId,
      request.workbench,
    );
    this.reconcileWindowWorkbenchResources(window.windowId, projection);
    return {
      requestId: request.requestId,
      projection,
    };
  }

  async updateApplicationSidebar(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopApplicationSidebarMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('Desktop Application Sidebar request belongs to another Window.');
    }
    return {
      requestId: request.requestId,
      projection: await this.shell.updateApplicationSidebar(request),
    };
  }

  async transitionScene(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopSceneTransitionResult> {
    this.requireActive();
    const request = parseDesktopSceneTransitionRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('Desktop Scene transition request belongs to another Window.');
    }
    const previous = await this.shell.getProjection(window.windowId);
    if (request.intent.kind === 'restore-conversation') {
      const navigation = request.intent.navigation;
      const conversation = previous.agentHome.conversations.find(
        (candidate) =>
          candidate.navigation.conversationId === navigation.conversationId &&
          isSameAgentConversationOwner(candidate.navigation.owner, navigation.owner),
      );
      if (!conversation) {
        throw new Error(
          `Desktop Conversation '${navigation.conversationId}' does not match its authoritative navigation owner.`,
        );
      }
      if (conversation.unavailable) {
        return unavailableConversationOwner(
          request.requestId,
          navigation.owner,
          conversation.unavailable.message,
        );
      }
      const context = await this.conversationLifecycle.readConversationContext(
        navigation.conversationId,
      );
      const contextOwner = conversationOwnerFromContext(context);
      if (!isSameAgentConversationOwner(navigation.owner, contextOwner)) {
        throw new Error(
          `Desktop Conversation '${navigation.conversationId}' lifecycle context does not match its navigation owner.`,
        );
      }
      if (context.kind === 'workspace') {
        const resolution = await this.workspaceGrants.restore(
          window.windowId,
          context.workspaceGrantId,
          context.workspaceId,
        );
        if (resolution.workspace.workspaceId !== context.workspaceId) {
          throw new Error(
            'Persisted Agent Conversation Workspace grant resolves to another Workspace.',
          );
        }
      }
      const result = await this.shell.restoreAgentConversation({ request, context });
      if (result.status === 'transitioned') {
        await this.attachWorkspaceAgentScene(result.scene);
        this.releaseReplacedAssistantPreview(
          resolveActiveDesktopWindowWorkbench(previous.window).scene,
          result.scene,
        );
      }
      return result;
    }
    const result = await this.shell.transitionScene(request);
    if (result.status === 'transitioned') {
      await this.attachWorkspaceAgentScene(result.scene);
      this.releaseReplacedAssistantPreview(
        resolveActiveDesktopWindowWorkbench(previous.window).scene,
        result.scene,
      );
    }
    return result;
  }

  private async attachWorkspaceAgentScene(scene: DesktopWorkbenchSceneProjection): Promise<void> {
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') return;
    await this.agent.attachWorkspace(
      await this.shell.resolveAgentWorkspace(scene.context.scope.workspaceId),
    );
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

  async planResourceBrowserRecovery(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserRecoveryPlanRequest | unknown,
  ): Promise<ResourceBrowserRecoveryPlanResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().planRecovery(window.windowId, payload);
  }

  async applyResourceBrowserRecovery(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserRecoveryApplyRequest | unknown,
  ): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().applyRecovery(window.windowId, payload);
  }

  async cancelResourceBrowserRecovery(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserRecoveryCancelRequest | unknown,
  ): Promise<ResourceBrowserRecoveryCancelResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireResourceBrowser().cancelRecovery(window.windowId, payload);
  }

  async inspectProjectPortability(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopProjectPortabilityInspectResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireProjectPortability().inspect(window.windowId, payload);
  }

  async planProjectPortability(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopProjectPortabilityPlanResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireProjectPortability().plan(window.windowId, payload);
  }

  async resumeProjectPortability(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopProjectPortabilityPlanResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireProjectPortability().resume(window.windowId, payload);
  }

  async executeProjectPortability(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: DesktopProjectPortabilityProgressEvent) => void,
  ): Promise<DesktopProjectPortabilityExecuteResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireProjectPortability().execute(window.windowId, payload, publish);
  }

  async cancelProjectPortability(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopProjectPortabilityCancelResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireProjectPortability().cancel(window.windowId, payload);
  }

  async executeResourceBrowser(
    sender: DesktopSenderIdentity,
    payload: ResourceBrowserIntentRequest | unknown,
  ): Promise<ResourceBrowserIntentResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const request = parseResourceBrowserIntentRequest(payload);
    try {
      const projection = await this.requireResourceBrowser().execute(window.windowId, request);
      return {
        requestId: request.requestId,
        identity: request.identity,
        status: 'completed',
        projection,
      };
    } catch (error) {
      if (
        error instanceof DesktopWorkbenchContractError &&
        error.code === 'desktop-workbench-main-view-capacity-reached'
      ) {
        return {
          requestId: request.requestId,
          identity: request.identity,
          status: 'rejected',
          rejection: {
            code: 'main-view-capacity-reached',
            maximum: DESKTOP_WORKBENCH_LIMITS.mainViewCount.max,
          },
        };
      }
      throw error;
    }
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

  async executeTextEditorRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: TextEditorProjectionEvent) => void,
  ): Promise<TextEditorHostResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const runtime = this.textEditor;
    if (!runtime) throw new Error('Desktop Text Editor runtime is unavailable.');
    const request = parseTextEditorHostRequest(payload);
    const result = await runtime.execute(window.windowId, request);
    if (request.route === TEXT_EDITOR_HOST_ROUTES.projectionGet && result.status === 'ready') {
      const subscriptions =
        this.textEditorSubscriptions.get(sender.webContentsId) ?? new Map<string, () => void>();
      const previousKey = textEditorSubscriptionKey(request.identity);
      const key = textEditorSubscriptionKey(result.identity);
      if (previousKey !== key) {
        subscriptions.get(previousKey)?.();
        subscriptions.delete(previousKey);
      }
      if (!subscriptions.has(key)) {
        subscriptions.set(key, await runtime.subscribe(window.windowId, result.identity, publish));
        this.textEditorSubscriptions.set(sender.webContentsId, subscriptions);
      }
    }
    return result;
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

  async createCutDraft(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopCutViewMutationResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const request = parseDesktopCutViewMutationRequest(payload);
    if (request.windowId !== window.windowId || request.identity !== undefined) {
      throw new Error('Desktop Cut draft request does not match its sender Window.');
    }
    const projection = await this.requireCut().createDraft(request);
    return { requestId: request.requestId, status: 'updated', projection };
  }

  async closeCutView(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopCutViewMutationResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const request = parseDesktopCutViewMutationRequest(payload);
    if (request.windowId !== window.windowId || request.identity === undefined) {
      throw new Error('Desktop Cut close request does not match its sender Window.');
    }
    const result = await this.requireCut().closeView({ ...request, identity: request.identity });
    return { requestId: request.requestId, ...result };
  }

  async executeCutRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CutHostRuntimeResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const result = await this.requireCut().execute(window.windowId, payload);
    await deliverCutAgentContext(result, window.windowId, this.agentBridge);
    return result;
  }

  detachWindowResources(windowId: string, webContentsId: number): void {
    this.detachRendererSubscriptions(webContentsId);
    this.resourceBrowser?.detachWindow(windowId);
    this.assetCenter?.detachWindow(windowId);
    this.projectPortability?.detachWindow(windowId);
    this.preview?.detachWindow(windowId);
    this.textEditor?.detachWindow(windowId);
    this.canvas?.detachWindow(windowId);
    this.cut?.detachWindow(windowId);
    this.options.assistantPreviewLifecycle?.detachWindow(windowId);
    this.characterAvatar?.detachWindow(windowId);
    this.agentBridge.detachWindow(windowId);
    void this.agentLaunch.detachWindow(windowId).catch((error: unknown) => {
      this.reportError(
        'desktop-agent-launch-detach-failed',
        'Failed to detach Agent launch Window.',
        error,
      );
    });
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
    for (const disposeSubscription of this.textEditorSubscriptions.get(webContentsId)?.values() ??
      []) {
      disposeSubscription();
    }
    this.textEditorSubscriptions.delete(webContentsId);
    this.characterRoomWorkbenchSubscriptions.get(webContentsId)?.dispose();
    this.characterRoomWorkbenchSubscriptions.delete(webContentsId);
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
    try {
      await this.agentLaunch.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.options.assistantPreviewLifecycle?.dispose();
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
    for (const subscriptions of this.textEditorSubscriptions.values()) {
      for (const disposeSubscription of subscriptions.values()) {
        try {
          disposeSubscription();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    this.textEditorSubscriptions.clear();
    for (const subscription of this.characterRoomWorkbenchSubscriptions.values()) {
      try {
        subscription.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.characterRoomWorkbenchSubscriptions.clear();
    try {
      this.assetCenter?.dispose();
    } catch (error) {
      errors.push(error);
    }
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
      this.characterAvatar?.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.textEditor?.dispose();
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
      await this.conversationLifecycle.waitForProviderIdle();
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
      await this.options.generationLifecycle?.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.options.workspaceConfigLifecycle?.dispose();
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

  private startCommittedAgentProviderExecution(conversationId: string): void {
    void this.conversationLifecycle
      .startProviderExecution(conversationId)
      .catch((error: unknown) =>
        this.reportError(
          'desktop-agent-provider-execution-start-failed',
          `Desktop Agent provider execution could not start for Conversation '${conversationId}'.`,
          error,
        ),
      );
  }

  private async resolveAgentConnectionGrant(
    windowId: string,
    connection: import('@neko/agent-contracts').DesktopAgentConnectionIdentity,
  ): Promise<DesktopAnyAgentConnectionGrant> {
    const surfaceGrant = await this.shell.resolveAgentSurfaceGrant(windowId, connection);
    const interaction = surfaceGrant.interaction;
    if (interaction.agentViewId !== connection.viewId) {
      throw new Error('Desktop Agent connection does not match its exact Agent Surface View.');
    }
    if ('assistantSpaceId' in connection) {
      if (
        connection.windowId !== windowId ||
        interaction.phase !== 'session' ||
        interaction.scope.kind !== 'assistant' ||
        interaction.scope.assistantSpaceId !== connection.assistantSpaceId ||
        !interaction.scope.conversationId
      ) {
        throw new Error(
          'Desktop Assistant Agent connection does not match its exact Agent Surface.',
        );
      }
      const context = await this.conversationLifecycle.readConversationContext(
        interaction.scope.conversationId,
      );
      const scene = resolveActiveDesktopWindowWorkbench(
        (await this.shell.getProjection(windowId)).window,
      ).scene;
      if (!assistantSurfaceContextMatches(context, scene, connection.assistantSpaceId)) {
        throw new Error(
          'Desktop Assistant Agent connection does not match its persisted Conversation context.',
        );
      }
      const workspace = this.requireAssistantAgentWorkspace(connection);
      return {
        applicationInstanceId: this.applicationIdentity.instanceId,
        windowId,
        workbenchInstanceId: surfaceGrant.workbenchInstanceId,
        agentSurfaceId: surfaceGrant.agentSurfaceId,
        assistantSpaceId: connection.assistantSpaceId,
        workspaceId: workspace.workspaceId,
        viewId: connection.viewId,
      };
    }
    const view = await this.shell.resolveAgentViewGrant(windowId, connection);
    if (
      interaction.scope.kind !== 'workspace' ||
      interaction.scope.workspaceId !== view.workspaceId
    ) {
      throw new Error('Desktop Workspace Agent connection does not match its exact Agent Surface.');
    }
    return {
      applicationInstanceId: this.applicationIdentity.instanceId,
      windowId,
      workbenchInstanceId: surfaceGrant.workbenchInstanceId,
      agentSurfaceId: surfaceGrant.agentSurfaceId,
      projectId: view.projectId,
      workspaceId: view.workspaceId,
      viewId: view.viewId,
    };
  }

  private requireAssistantAgentWorkspace(
    connection: import('@neko/agent-contracts').DesktopAgentConnectionIdentity & {
      readonly assistantSpaceId: string;
    },
  ): AgentWorkspaceRuntime {
    const workspace = this.agent.getWorkspace(connection.workspaceId);
    if (
      !workspace ||
      workspace.workspaceId !== connection.workspaceId ||
      workspace.workspaceId !== connection.assistantSpaceId
    ) {
      throw new Error(
        `Desktop Assistant Space '${connection.assistantSpaceId}' has no exact managed Agent runtime.`,
      );
    }
    return workspace;
  }

  private requireAssetCenter(): AssetCenterNodeRuntime {
    if (!this.assetCenter) throw new Error('Desktop Asset Center runtime is unavailable.');
    return this.assetCenter;
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new Error('Desktop AppHost is disposed.');
    }
  }

  private requireResourceBrowser(): ResourceBrowserNodeRuntime {
    if (!this.resourceBrowser) {
      throw new Error('Desktop Resource Browser runtime is unavailable.');
    }
    return this.resourceBrowser;
  }

  private requireProjectPortability(): ProjectPortabilityRuntime {
    if (!this.projectPortability) {
      throw new Error('Desktop project portability runtime is unavailable.');
    }
    return this.projectPortability;
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

  private releaseReplacedAssistantPreview(
    previous: DesktopWorkbenchSceneProjection,
    next: DesktopWorkbenchSceneProjection,
  ): void {
    const main = previous.slots.main;
    if (
      main?.kind !== 'assistant-preview' ||
      (next.slots.main?.kind === 'assistant-preview' &&
        next.slots.main.previewSessionId === main.previewSessionId)
    ) {
      return;
    }
    const resources = this.assistantResources;
    if (!resources) {
      throw new Error('Assistant Preview Scene exists without its Resource authority.');
    }
    resources.releasePreview({
      identity: {
        assistantSpaceId: main.assistantSpaceId,
        conversationId: main.conversationId,
        windowId: previous.windowId,
      },
      previewSessionId: main.previewSessionId,
    });
  }

  private async mutateProjectTab(
    sender: DesktopSenderIdentity,
    payload: unknown,
    operation: 'activate' | 'close',
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopTabMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    const current = await this.shell.getProjection(window.windowId);
    const targetTab = current.window.tabs.find((tab) => tab.tabId === request.tabId);
    if (!targetTab) {
      throw new Error(
        `Unknown Desktop Project Tab '${request.tabId}' for Window '${window.windowId}'.`,
      );
    }
    const targetProject = current.catalog.projects.find(
      (project) => project.projectId === targetTab.projectId,
    );
    if (!targetProject) {
      throw new Error(`Desktop Project Tab '${request.tabId}' has no Project catalog owner.`);
    }
    let projection: DesktopShellProjection;
    if (operation === 'activate') {
      const transitioned = await this.transitionScene(
        sender,
        createDesktopSceneTransitionRequest({
          requestId: request.requestId,
          rendererSessionId: request.rendererSessionId,
          windowId: window.windowId,
          sceneId: resolveActiveDesktopWindowWorkbench(current.window).scene.sceneId,
          intent: { kind: 'open-project-workspace', projectId: targetTab.projectId },
        }),
      );
      if (transitioned.status !== 'transitioned') {
        throw new Error('Project Tab activation did not activate its Workspace Scene.');
      }
      projection = await this.shell.getProjection(window.windowId);
    } else {
      projection = await this.shell.closeTab(
        window.windowId,
        request.tabId,
        request.rendererSessionId,
      );
    }
    this.reconcileWindowWorkbenchResources(window.windowId, projection);
    return {
      requestId: request.requestId,
      projection,
    };
  }

  private reconcileWindowWorkbenchResources(
    windowId: string,
    projection: DesktopShellProjection,
  ): void {
    const workbenches = [projection.window.workbench.layout];
    this.preview?.reconcileWindow(windowId, workbenches);
    this.textEditor?.reconcileWindow(windowId, workbenches);
    this.canvas?.reconcileWindow(windowId, workbenches);
    this.cut?.reconcileWindow(windowId, workbenches);
  }
}

function isAgentProjectionControlMessage(type: string): boolean {
  return (
    type === 'projectionEndpointDiscover' ||
    type === 'projectionAttach' ||
    type === 'projectionSnapshotAck' ||
    type === 'projectionDetach'
  );
}

function conversationOwnerFromContext(context: AgentBoundDomainBinding): AgentConversationOwnerRef {
  if (context.kind === 'assistant') {
    return { kind: 'assistant', assistantSpaceId: context.assistantSpaceId };
  }
  if (context.kind === 'workspace') {
    return { kind: 'workspace', workspaceId: context.workspaceId };
  }
  if (
    context.kind === 'character' &&
    context.characterRunId !== undefined &&
    context.dialogueRunId !== undefined
  ) {
    return {
      kind: 'character',
      characterId: context.characterId,
      characterRunId: context.characterRunId,
      dialogueRunId: context.dialogueRunId,
    };
  }
  if (context.kind === 'room') {
    return { kind: 'room', roomId: context.roomId, roomRunId: context.roomRunId };
  }
  throw new Error(`Desktop ${context.kind} Conversation owner provider is unavailable.`);
}

function assistantSurfaceContextMatches(
  context: AgentBoundDomainBinding,
  scene: DesktopWorkbenchSceneProjection,
  assistantSpaceId: string,
): boolean {
  if (context.kind === 'assistant') {
    return (
      context.assistantSpaceId === assistantSpaceId &&
      scene.context.kind === 'agent' &&
      scene.context.scope.kind === 'assistant' &&
      scene.context.scope.assistantSpaceId === assistantSpaceId
    );
  }
  if (context.kind !== 'character' && context.kind !== 'room') return false;
  return (
    scene.context.kind === 'character-interaction' &&
    scene.context.scope.assistantSpaceId === assistantSpaceId &&
    isSameAgentConversationOwner(conversationOwnerFromContext(context), scene.context.owner)
  );
}

function unavailableConversationOwner(
  requestId: string,
  owner: AgentConversationOwnerRef,
  message = `Desktop ${owner.kind} Conversation requires its qualified owner runtime.`,
): DesktopSceneTransitionResult {
  return {
    status: 'unavailable',
    requestId,
    diagnostic: {
      code: 'desktop-scene-owner-unavailable',
      severity: 'error',
      message,
      metadata: {
        owner: 'agent-conversation-authority',
        intentKind: 'restore-conversation',
        conversationOwnerKind: owner.kind,
      },
    },
  };
}

async function readAgentConversationBootstrap(
  lifecycle: AgentConversationLifecycleService,
  conversationId: string,
) {
  try {
    const context = await lifecycle.readConversationContext(conversationId);
    let firstSubmitRecord;
    try {
      firstSubmitRecord = await lifecycle.readFirstSubmitRecord(conversationId);
    } catch (error) {
      if (
        !(error instanceof AgentConversationLifecycleUnavailableError) ||
        error.conversationId !== conversationId ||
        (context.kind !== 'character' && context.kind !== 'room')
      ) {
        throw error;
      }
    }
    return { status: 'ready' as const, context, firstSubmitRecord };
  } catch (error) {
    if (
      !(error instanceof AgentConversationLifecycleUnavailableError) ||
      error.conversationId !== conversationId
    ) {
      throw error;
    }
    return {
      status: 'unavailable' as const,
      diagnostic: {
        code: 'desktop-agent-conversation-unavailable' as const,
        severity: 'error' as const,
        conversationId,
        fieldNames: [...error.fieldNames],
        message: 'The stored Agent Conversation cannot be opened by the current application.',
      },
    };
  }
}

export async function deliverCutAgentContext(
  result: CutHostRuntimeResult,
  windowId: string,
  agentBridge: Pick<DesktopAgentBridgeRuntime, 'injectContext'>,
): Promise<void> {
  if (result.output?.type !== 'agent-context') return;
  if (result.snapshot.identity.windowId !== windowId) {
    throw new Error('Cut Agent context result belongs to another Desktop Window.');
  }
  await agentBridge.injectContext({
    windowId,
    projectId: result.snapshot.identity.projectId,
    workspaceId: result.snapshot.identity.workspaceId,
    payload: result.output.payload,
  });
}

function projectSkillDiscovery(
  catalog: AgentSkillCatalog,
): AgentExtensionManagementProjection['skillDiscovery'] {
  const grouped = new Map<
    string,
    AgentExtensionManagementProjection['skillDiscovery']['diagnostics'][number]
  >();
  for (const diagnostic of catalog.diagnostics) {
    if (diagnostic.source === 'builtin') continue;
    const source = requireGlobalSkillSourceKind(diagnostic.source);
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
    duplicateCount: catalog.warnings.filter((warning) => {
      const selectedManageable = isAgentManageableSkillSourceKind(warning.selectedSource);
      const shadowedManageable = isAgentManageableSkillSourceKind(warning.shadowedSource);
      return selectedManageable && shadowedManageable;
    }).length,
  };
}

function requireGlobalSkillSource(
  source: AgentSkillCatalog['records'][number]['source'],
): 'personal' | 'plugin' {
  if (source.kind === 'personal' || source.kind === 'plugin') {
    return source.kind;
  }
  throw new Error('Agent Extension Management received an unmanaged Skill source.');
}

function requireGlobalSkillSourceKind(
  source: AgentSkillCatalog['diagnostics'][number]['source'],
): 'personal' | 'plugin' {
  if (source === 'personal' || source === 'plugin') return source;
  throw new Error('Desktop global Skill catalog cannot contain Project source metadata.');
}

function isAgentManageableSkillSourceKind(
  source: AgentSkillCatalog['warnings'][number]['selectedSource'],
): boolean {
  if (source === 'personal' || source === 'plugin') return true;
  if (source === 'builtin') return false;
  throw new Error('Desktop global Skill catalog cannot contain Project source metadata.');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function desktopAgentScopeMatchesBinding(
  left: Extract<DesktopWorkbenchSceneProjection['context'], { readonly kind: 'agent' }>['scope'],
  right: AgentDomainBinding,
): boolean {
  if (left.kind === 'unbound' || right.kind === 'unbound') {
    return left.kind === 'unbound' && right.kind === 'unbound';
  }
  if (left.kind === 'assistant' && right.kind === 'assistant') {
    return left.assistantSpaceId === right.assistantSpaceId;
  }
  return (
    left.kind === 'workspace' &&
    right.kind === 'workspace' &&
    left.workspaceId === right.workspaceId &&
    left.workspaceGrantId === right.workspaceGrantId
  );
}

function canvasSubscriptionKey(identity: CanvasHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewInstanceId),
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
  ].join(':');
}

function cutSubscriptionKey(identity: ReturnType<typeof parseDesktopCutHostIdentity>): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewInstanceId),
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
  ].join(':');
}

function textEditorSubscriptionKey(identity: TextEditorRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    identity.viewInstanceId,
    identity.documentId,
    identity.sessionId,
  ].join(':');
}
