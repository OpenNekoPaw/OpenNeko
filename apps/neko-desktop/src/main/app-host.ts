import { randomUUID } from 'node:crypto';
import { type NekoApplicationIdentity } from '@neko/host/application';
import type { NekoHostPorts } from '@neko/host/ports';
import type { ILogger } from '@neko/shared/logger';
import {
  parseDesktopBootstrapRequest,
  type DesktopBootstrapProjection,
} from '../shared/bridge-contract';
import {
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
  type DesktopSceneTransitionResult,
} from '@neko/host/desktop-scene-contract';
import { DesktopWindowRegistry, type DesktopSenderIdentity } from './window-registry';
import type { DesktopShellService } from '@neko/host/desktop-shell-service';
import type { DesktopProjectRegistrationService } from '@neko/host/desktop-project-registration-service';
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
import {
  resolveWorkspaceContentLocator,
  type AssetCenterNodeRuntime,
  type ResourceBrowserNodeRuntime,
} from '@neko/assets-node';
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
  CanvasTextFilePreviewResult,
} from '@neko/canvas-domain';
import {
  parseCanvasHostRuntimeIdentity,
  type CanvasWorkspaceIndexService,
} from '@neko/canvas-domain';
import {
  parseDesktopCanvasWorkspaceDocumentOpenRequest,
  parseDesktopCanvasWorkspaceIndexCatalogRequest,
  type DesktopCanvasPreviewResourceResult,
} from '../shared/canvas-bridge-contract';
import { openDesktopWorkspaceCanvasDocument } from './desktop-creative-document-runtime';
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
import {
  parseAutomationLocalRuntimeManagementHostRequest,
  type AutomationLocalRuntimeManagementHostResult,
} from '@neko/automation-contracts/local-runtime-management';
import {
  parseAutomationPermissionManagementHostRequest,
  type AutomationPermissionManagementHostResult,
} from '@neko/automation-contracts/permission-management';
import type {
  AutomationLocalRuntimeManagementService,
  AutomationPermissionManagementService,
} from '@neko/automation-node';
import type { ProjectPortabilityRuntime } from '@neko/assets-node';
import type {
  DesktopProjectPortabilityCancelResult,
  DesktopProjectPortabilityExecuteResult,
  DesktopProjectPortabilityInspectResult,
  DesktopProjectPortabilityPlanResult,
  DesktopProjectPortabilityProgressEvent,
} from '@neko/assets-domain/contracts';
import {
  parseDesktopWorkspaceGrantTargetRequest,
  type DesktopWorkspaceGrantTargetResult,
} from '@neko/host/desktop-workspace-grant-contract';
import type { DesktopWorkspaceGrantAuthority } from '@neko/host/desktop-workspace-grant-authority';
import type { AgentConversationContextAuthorityPort } from '@neko/agent-runtime/application';
import {
  isSameAgentConversationOwner,
  projectAgentConversationSurfaceBinding,
  type AgentConversationOwnerRef,
} from '@neko/agent-contracts';
import {
  parseCharacterFoundationAnyHostRequest,
  parseCharacterFoundationHostRequest,
  parseCharacterAuthoringHostRequest,
  parseCharacterAvatarHostRequest,
  parseCharacterPortableHostRequest,
  parseCharacterRoomWorkbenchSnapshotRequest,
  type CharacterAvatarHostResult,
  type CharacterConversationLaunchCatalogHostResult,
  type CharacterFoundationHostResult,
  type CharacterAuthoringCommand,
  type CharacterAuthoringAuthority,
  type CharacterAuthoringHostRequest,
  type CharacterAuthoringHostResult,
  type CharacterAuthoringSnapshot,
  type CharacterPortableExportSelection,
  type CharacterPortableImportTarget,
  type CharacterPortableHostResult,
  type CharacterRoomWorkbenchProjectionEvent,
  type CharacterRoomWorkbenchSnapshotResult,
  type RoomView,
} from '@neko/chara/contracts';
import type { DesktopCharacterAvatarRuntime } from './desktop-character-avatar-runtime';
import type {
  CharacterFoundationCommandPort,
  CharacterFoundationService,
  CharacterInteractionService,
  CharacterRoomMessageSubmissionResult,
  SubmitCharacterRoomMessageInput,
} from '@neko/chara/application';
import {
  parseWorldAuthoringHostRequest,
  parseWorldManagementHostRequest,
  parseWorldPortableHostRequest,
  parseWorldRuntimeHostRequest,
  type WorldAuthoringCommand,
  type WorldAuthoringAuthority,
  type WorldAuthoringHostRequest,
  type WorldAuthoringHostResult,
  type WorldAuthoringSnapshot,
  type WorldManagementHostResult,
  type WorldPortableExportSelection,
  type WorldPortableImportTarget,
  type WorldPortableHostResult,
  type WorldPortableOperationResult,
  type WorldRuntimeBinding,
  type WorldRuntimeHostResult,
} from '@neko/world/contracts';
import type { WorldManagementService, WorldRuntimeWorkbenchService } from '@neko/world/application';
import {
  parseProjectLocalAuthoringHostRequest,
  parseProjectAuthoringHostRequest,
  type ProjectAuthoringCatalogHostResult,
  type ProjectCreativeWorkspaceHostResult,
  type ProjectCreativeWorkspaceProjection,
  type ProjectGlobalReferenceMutation,
  type ProjectWorkspaceObjectMutation,
  type ProjectContentHostResult,
  type ProjectContentProjection,
  type ProjectLocalAuthoringOutcome,
  type ProjectLocalAuthoringCreateInput,
  type ProjectLocalAuthoringHostResult,
  type ProjectAuthoringNavigationHostResult,
  type ProjectAuthoringNavigationItem,
} from '@neko/project/contracts';

export interface DesktopAppHostOptions {
  readonly host: NekoHostPorts;
  readonly logger: ILogger;
  readonly shell: DesktopShellService;
  readonly projectManagement: DesktopProjectRegistrationService;
  readonly projectAuthoring: {
    getNavigation(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly projectId: string;
      readonly projectLabel: string;
    }): Promise<readonly ProjectAuthoringNavigationItem[]>;
    getContent(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly workspaceId: string;
      readonly projectId: string;
    }): Promise<ProjectContentProjection>;
    getCreativeWorkspace(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly workspaceId: string;
      readonly projectId: string;
    }): Promise<ProjectCreativeWorkspaceProjection>;
    mutateCreativeWorkspaceReference(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly workspaceId: string;
      readonly projectId: string;
      readonly mutation: ProjectGlobalReferenceMutation;
    }): Promise<ProjectCreativeWorkspaceProjection>;
    mutateCreativeWorkspaceObject(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly workspaceId: string;
      readonly projectId: string;
      readonly mutation: ProjectWorkspaceObjectMutation;
    }): Promise<ProjectCreativeWorkspaceProjection>;
    createLocalTarget(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly workspaceId: string;
      readonly projectId: string;
      readonly create: ProjectLocalAuthoringCreateInput;
    }): Promise<ProjectLocalAuthoringOutcome>;
    getCharacterSnapshot(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly authority: CharacterAuthoringAuthority;
      readonly characterProjectId: string;
    }): Promise<CharacterAuthoringSnapshot>;
    executeCharacter(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly authority: CharacterAuthoringAuthority;
      readonly characterProjectId: string;
      readonly command: CharacterAuthoringCommand;
    }): Promise<CharacterAuthoringSnapshot>;
    getCharacterPortableExportScope(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly authority: CharacterAuthoringAuthority;
      readonly characterProjectId: string;
    }): Promise<import('@neko/chara/contracts').CharacterPortableExportScope>;
    exportCharacterPackage(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly authority: CharacterAuthoringAuthority;
      readonly characterProjectId: string;
      readonly selection: CharacterPortableExportSelection;
    }): Promise<Uint8Array>;
    importCharacterGlobalPackage(input: {
      readonly archiveBytes: Uint8Array;
      readonly target?: CharacterPortableImportTarget;
    }): Promise<string>;
    getWorldSnapshot(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly authority: WorldAuthoringAuthority;
      readonly worldProjectId: string;
    }): Promise<WorldAuthoringSnapshot>;
    executeWorld(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly authority: WorldAuthoringAuthority;
      readonly worldProjectId: string;
      readonly command: WorldAuthoringCommand;
    }): Promise<WorldAuthoringSnapshot>;
  };
  readonly generationLifecycle?: { dispose(): Promise<void> };
  readonly workspaceConfigLifecycle?: { dispose(): void };
  readonly workspaceGrants: DesktopWorkspaceGrantAuthority;
  readonly conversationContexts: Pick<AgentConversationContextAuthorityPort, 'readContext'>;
  readonly characterFoundation: CharacterFoundationService;
  readonly characterFoundationCommands: CharacterFoundationCommandPort;
  readonly worldManagement: WorldManagementService;
  readonly worldPortable: {
    exportPackage(input: {
      readonly workspace: AssetWorkspaceResolution;
      readonly authority: WorldAuthoringAuthority;
      readonly selection: WorldPortableExportSelection;
    }): Promise<{
      readonly archiveBytes: Uint8Array;
      readonly result: WorldPortableOperationResult;
    }>;
    importGlobal(input: {
      readonly archiveBytes: Uint8Array;
      readonly target?: WorldPortableImportTarget;
    }): Promise<WorldPortableOperationResult>;
  };
  readonly worldRuntime: Pick<WorldRuntimeWorkbenchService, 'launch' | 'read' | 'submitAction'>;
  readonly characterAvatar?: DesktopCharacterAvatarRuntime;
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
  readonly resourceBrowser?: ResourceBrowserNodeRuntime;
  readonly assetCenter?: AssetCenterNodeRuntime;
  readonly projectPortability?: ProjectPortabilityRuntime;
  readonly preview?: DesktopPreviewRuntime;
  readonly textEditor?: DesktopTextEditorRuntime;
  readonly canvas?: DesktopCanvasRuntime;
  readonly canvasWorkspaceIndexService?: CanvasWorkspaceIndexService;
  readonly cut?: DesktopCutRuntime;
  readonly settings: DesktopApplicationSettingsService;
  readonly automationLocalRuntimes: AutomationLocalRuntimeManagementService;
  readonly automationPermissions: AutomationPermissionManagementService;
  readonly openAgentAdvancedSettings: () => Promise<void>;
  readonly instanceId?: string;
}

export class DesktopAppHost {
  readonly applicationIdentity: NekoApplicationIdentity;
  readonly windows = new DesktopWindowRegistry();
  readonly shell: DesktopShellService;
  readonly projectManagement: DesktopProjectRegistrationService;
  readonly projectAuthoring: DesktopAppHostOptions['projectAuthoring'];
  readonly workspaceGrants: DesktopWorkspaceGrantAuthority;
  readonly characterFoundation: CharacterFoundationService;
  readonly characterFoundationCommands: CharacterFoundationCommandPort;
  readonly worldManagement: WorldManagementService;
  readonly worldPortable: DesktopAppHostOptions['worldPortable'];
  readonly worldRuntime: Pick<WorldRuntimeWorkbenchService, 'launch' | 'read' | 'submitAction'>;
  readonly characterAvatar: DesktopCharacterAvatarRuntime | undefined;
  readonly characterRoomWorkbench: DesktopAppHostOptions['characterRoomWorkbench'];
  readonly resourceBrowser: ResourceBrowserNodeRuntime | undefined;
  readonly assetCenter: AssetCenterNodeRuntime | undefined;
  readonly projectPortability: ProjectPortabilityRuntime | undefined;
  readonly preview: DesktopPreviewRuntime | undefined;
  readonly textEditor: DesktopTextEditorRuntime | undefined;
  readonly canvas: DesktopCanvasRuntime | undefined;
  readonly canvasWorkspaceIndexService: CanvasWorkspaceIndexService | undefined;
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
    this.projectAuthoring = options.projectAuthoring;
    this.workspaceGrants = options.workspaceGrants;
    this.characterFoundation = options.characterFoundation;
    this.characterFoundationCommands = options.characterFoundationCommands;
    this.worldManagement = options.worldManagement;
    this.worldPortable = options.worldPortable;
    this.worldRuntime = options.worldRuntime;
    this.characterAvatar = options.characterAvatar;
    this.characterRoomWorkbench = options.characterRoomWorkbench;
    this.resourceBrowser = options.resourceBrowser;
    this.assetCenter = options.assetCenter;
    this.projectPortability = options.projectPortability;
    this.preview = options.preview;
    this.textEditor = options.textEditor;
    this.canvas = options.canvas;
    this.canvasWorkspaceIndexService = options.canvasWorkspaceIndexService;
    this.cut = options.cut;
    this.settings = options.settings;
    this.shell.setAgentCapabilityReady(false);
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
    const request = parseCharacterFoundationHostRequest(payload);
    this.windows.resolveSender(sender);
    if (request.operation !== 'snapshot-get') {
      throw new Error('Character Foundation snapshot route requires snapshot-get.');
    }
    return { requestId: request.requestId, snapshot: await this.characterFoundation.getSnapshot() };
  }

  async executeCharacterFoundationRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CharacterFoundationHostResult | CharacterConversationLaunchCatalogHostResult> {
    this.requireActive();
    const request = parseCharacterFoundationAnyHostRequest(payload);
    this.windows.resolveSender(sender);
    if (request.operation === 'conversation-launch-catalog-get') {
      return {
        requestId: request.requestId,
        catalog: await this.characterFoundation.getConversationLaunchCatalog(),
      };
    }
    if (request.operation !== 'snapshot-get') {
      const { requestId: _requestId, ...command } = request;
      await this.characterFoundationCommands.execute(command);
    }
    return { requestId: request.requestId, snapshot: await this.characterFoundation.getSnapshot() };
  }

  async executeWorldManagementRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<WorldManagementHostResult> {
    this.requireActive();
    const request = parseWorldManagementHostRequest(payload);
    this.windows.resolveSender(sender);
    if (request.operation === 'catalog-get') {
      return {
        requestId: request.requestId,
        operation: request.operation,
        catalog: await this.worldManagement.readCatalog(request.query),
      };
    }
    return {
      requestId: request.requestId,
      operation: request.operation,
      detail: await this.worldManagement.readDetail(request.globalWorldId),
    };
  }

  async createWorldPortableExport(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<{ readonly result: WorldPortableHostResult; readonly archiveBytes: Uint8Array }> {
    this.requireActive();
    const request = parseWorldPortableHostRequest(payload);
    if (request.operation !== 'export') {
      throw new Error('World portable export requires an export request.');
    }
    const window = this.windows.resolveSender(sender);
    this.requireWorldPortableWindow(request, window.windowId);
    const workspace = await this.resolveWorldAuthoringAuthority({
      ...request.binding,
      rendererSessionId: request.rendererSessionId,
      windowId: request.windowId,
    });
    const exported = await this.worldPortable.exportPackage({
      workspace,
      authority: request.binding.authority,
      selection: request.selection,
    });
    return {
      archiveBytes: exported.archiveBytes,
      result: { requestId: request.requestId, status: 'completed', result: exported.result },
    };
  }

  async importWorldPortablePackage(
    sender: DesktopSenderIdentity,
    payload: unknown,
    archiveBytes: Uint8Array,
  ): Promise<WorldPortableHostResult> {
    this.requireActive();
    const request = parseWorldPortableHostRequest(payload);
    if (request.operation !== 'import') {
      throw new Error('World portable import requires an import request.');
    }
    const window = this.windows.resolveSender(sender);
    this.requireWorldPortableWindow(request, window.windowId);
    await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
    const result = await this.worldPortable.importGlobal({
      archiveBytes,
      ...(request.target === undefined ? {} : { target: request.target }),
    });
    return { requestId: request.requestId, status: 'completed', result };
  }

  private requireWorldPortableWindow(
    request: { readonly windowId: string },
    windowId: string,
  ): void {
    if (request.windowId !== windowId) {
      throw new Error('World portable request belongs to another Window.');
    }
  }

  async executeWorldRuntimeRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<WorldRuntimeHostResult> {
    this.requireActive();
    const request = parseWorldRuntimeHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('World Runtime request belongs to another Window.');
    }
    await this.shell.assertWindowMutationContext(request.windowId, request.rendererSessionId);
    if (request.operation === 'runtime-launch') {
      return {
        requestId: request.requestId,
        projection: await this.worldRuntime.launch(request.launch),
      };
    }
    const scene = await this.shell.getSceneProjection(request.windowId);
    if (
      scene.context.kind !== 'world-runtime' ||
      !sameWorldRuntimeBinding(scene.context.binding, request.binding)
    ) {
      throw new Error('World Runtime request does not match the exact active Runtime Scene.');
    }
    return {
      requestId: request.requestId,
      projection:
        request.operation === 'runtime-snapshot-get'
          ? await this.worldRuntime.read(request.binding)
          : await this.worldRuntime.submitAction({
              binding: request.binding,
              intent: request.intent,
            }),
    };
  }

  async getProjectAuthoringNavigation(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<
    | ProjectAuthoringNavigationHostResult
    | ProjectAuthoringCatalogHostResult
    | ProjectContentHostResult
    | ProjectCreativeWorkspaceHostResult
  > {
    this.requireActive();
    const request = parseProjectAuthoringHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('Project authoring request belongs to another Window.');
    }
    if (request.operation === 'catalog-get') {
      await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
      const projection = await this.shell.getProjection(window.windowId);
      const availableProjects = projection.catalog.projects.filter(
        (project) => !project.unavailable,
      );
      const results = await Promise.allSettled(
        availableProjects.map(async (project) => {
          const workspace = await this.shell.resolveAgentWorkspace(project.workspaceId);
          return {
            workspaceId: workspace.workspaceId,
            projectId: project.projectId,
            label: project.displayName,
            navigation: await this.projectAuthoring.getNavigation({
              workspace,
              projectId: project.projectId,
              projectLabel: project.displayName,
            }),
          };
        }),
      );
      return {
        requestId: request.requestId,
        projects: results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        ),
        diagnostics: results.flatMap((result, index) =>
          result.status === 'rejected'
            ? [
                {
                  projectId: availableProjects[index]!.projectId,
                  message: describeError(result.reason),
                },
              ]
            : [],
        ),
      };
    }
    const { project, workspace } = await this.resolveProjectAuthoringAuthority(request);
    if (request.operation === 'content-get') {
      return {
        requestId: request.requestId,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        projection: await this.projectAuthoring.getContent({
          workspace,
          workspaceId: request.workspaceId,
          projectId: request.projectId,
        }),
      };
    }
    if (request.operation === 'creative-workspace-get') {
      return {
        requestId: request.requestId,
        workspaceId: request.workspaceId,
        workspaceGrantId: request.workspaceGrantId,
        projectId: request.projectId,
        projection: await this.projectAuthoring.getCreativeWorkspace({
          workspace,
          workspaceId: request.workspaceId,
          projectId: request.projectId,
        }),
      };
    }
    if (request.operation === 'creative-workspace-reference-mutate') {
      return {
        requestId: request.requestId,
        workspaceId: request.workspaceId,
        workspaceGrantId: request.workspaceGrantId,
        projectId: request.projectId,
        projection: await this.projectAuthoring.mutateCreativeWorkspaceReference({
          workspace,
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          mutation: request.mutation,
        }),
      };
    }
    if (request.operation === 'creative-workspace-object-mutate') {
      return {
        requestId: request.requestId,
        workspaceId: request.workspaceId,
        workspaceGrantId: request.workspaceGrantId,
        projectId: request.projectId,
        projection: await this.projectAuthoring.mutateCreativeWorkspaceObject({
          workspace,
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          mutation: request.mutation,
        }),
      };
    }
    return {
      requestId: request.requestId,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      navigation: await this.projectAuthoring.getNavigation({
        workspace,
        projectId: request.projectId,
        projectLabel: project.displayName,
      }),
    };
  }

  async executeProjectLocalAuthoringRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<ProjectLocalAuthoringHostResult> {
    this.requireActive();
    const request = parseProjectLocalAuthoringHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('Project local authoring request belongs to another Window.');
    }
    const { workspace } = await this.resolveProjectAuthoringAuthority(request);
    const outcome = await this.projectAuthoring.createLocalTarget({
      workspace,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      create: request.input,
    });
    return {
      requestId: request.requestId,
      workspaceId: request.workspaceId,
      workspaceGrantId: request.workspaceGrantId,
      projectId: request.projectId,
      ...outcome,
    };
  }

  async executeCharacterAuthoringRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CharacterAuthoringHostResult> {
    this.requireActive();
    const request = parseCharacterAuthoringHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('Character authoring request belongs to another Window.');
    }
    const workspace = await this.resolveCharacterAuthoringAuthority(request);
    const input = {
      workspace,
      authority: request.authority,
      characterProjectId: request.characterProjectId,
    };
    const snapshot =
      request.operation === 'authoring-snapshot-get'
        ? await this.projectAuthoring.getCharacterSnapshot(input)
        : await this.projectAuthoring.executeCharacter({
            ...input,
            command: characterAuthoringCommand(request),
          });
    return {
      requestId: request.requestId,
      workspaceId: request.workspaceId,
      workspaceGrantId: request.workspaceGrantId,
      authority: request.authority,
      characterProjectId: request.characterProjectId,
      snapshot,
    };
  }

  async createCharacterPortableExport(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<{ readonly result: CharacterPortableHostResult; readonly archiveBytes: Uint8Array }> {
    this.requireActive();
    const request = parseCharacterPortableHostRequest(payload);
    if (request.operation !== 'export') {
      throw new Error('Character portable export requires an export request.');
    }
    const window = this.windows.resolveSender(sender);
    this.requireCharacterPortableWindow(request, window.windowId);
    const workspace = await this.resolveCharacterAuthoringAuthority(request);
    const archiveBytes = await this.projectAuthoring.exportCharacterPackage({
      workspace,
      authority: request.authority,
      characterProjectId: request.characterProjectId,
      selection: request.selection,
    });
    return { result: { requestId: request.requestId, status: 'exported' }, archiveBytes };
  }

  async getCharacterPortableExportScope(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CharacterPortableHostResult> {
    this.requireActive();
    const request = parseCharacterPortableHostRequest(payload);
    if (request.operation !== 'export-scope') {
      throw new Error('Character portable export scope requires an export-scope request.');
    }
    const window = this.windows.resolveSender(sender);
    this.requireCharacterPortableWindow(request, window.windowId);
    const workspace = await this.resolveCharacterAuthoringAuthority(request);
    const scope = await this.projectAuthoring.getCharacterPortableExportScope({
      workspace,
      authority: request.authority,
      characterProjectId: request.characterProjectId,
    });
    return { requestId: request.requestId, status: 'scope-ready', scope };
  }

  async importCharacterPortablePackage(
    sender: DesktopSenderIdentity,
    payload: unknown,
    archiveBytes: Uint8Array,
  ): Promise<CharacterPortableHostResult> {
    this.requireActive();
    const request = parseCharacterPortableHostRequest(payload);
    if (request.operation !== 'import') {
      throw new Error('Character portable import requires an import request.');
    }
    const window = this.windows.resolveSender(sender);
    this.requireCharacterPortableWindow(request, window.windowId);
    await this.shell.assertWindowMutationContext(window.windowId, request.rendererSessionId);
    const globalCharacterId = await this.projectAuthoring.importCharacterGlobalPackage({
      archiveBytes,
      ...(request.target === undefined ? {} : { target: request.target }),
    });
    return { requestId: request.requestId, status: 'imported', globalCharacterId };
  }

  private requireCharacterPortableWindow(
    request: { readonly rendererSessionId: string; readonly windowId: string },
    windowId: string,
  ): void {
    if (request.windowId !== windowId) {
      throw new Error('Character portable request belongs to another Window.');
    }
  }

  async executeWorldAuthoringRequest(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<WorldAuthoringHostResult> {
    this.requireActive();
    const request = parseWorldAuthoringHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.windowId !== window.windowId) {
      throw new Error('World authoring request belongs to another Window.');
    }
    const workspace = await this.resolveWorldAuthoringAuthority(request);
    const input = {
      workspace,
      authority: request.authority,
      worldProjectId: request.worldProjectId,
    };
    const snapshot =
      request.operation === 'authoring-snapshot-get'
        ? await this.projectAuthoring.getWorldSnapshot(input)
        : await this.projectAuthoring.executeWorld({
            ...input,
            command: worldAuthoringCommand(request),
          });
    return {
      requestId: request.requestId,
      workspaceId: request.workspaceId,
      workspaceGrantId: request.workspaceGrantId,
      authority: request.authority,
      worldProjectId: request.worldProjectId,
      snapshot,
    };
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
    if (
      request.operation === 'choose-directory' ||
      request.operation === 'create-content-project'
    ) {
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
      if (request.operation === 'create-content-project') {
        const registered = await this.shell.registerContentProject(
          window.windowId,
          selection.hostResource,
          request.rendererSessionId,
        );
        const project = registered.projection.catalog.projects.find(
          (candidate) => candidate.workspaceId === registered.workspace.workspaceId,
        );
        if (!project) {
          throw new Error('Registered Content Project is missing from the Host catalog.');
        }
        return {
          requestId: request.requestId,
          status: 'authorized-project',
          workspaceId: resolution.workspace.workspaceId,
          projectId: project.projectId,
          grant,
        };
      }
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


  async executeAutomationLocalRuntimeManagement(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<AutomationLocalRuntimeManagementHostResult> {
    this.requireActive();
    const request = parseAutomationLocalRuntimeManagementHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.identity.windowId !== window.windowId) {
      throw new Error('Automation local runtime management request belongs to another Window.');
    }
    const shell = await this.shell.getProjection(window.windowId);
    const activeScene = resolveActiveDesktopWindowWorkbench(shell.window).scene;
    if (activeScene.context.kind !== 'extensions') {
      throw new Error(
        'Automation local runtime management request does not match the active Scene.',
      );
    }
    let runtimes;
    switch (request.route) {
      case 'snapshot.get':
        runtimes = await this.options.automationLocalRuntimes.list();
        break;
      case 'guide.open':
        runtimes = await this.options.automationLocalRuntimes.openInstallationGuide(
          request.sourceId,
        );
        break;
      case 'command.copy':
        runtimes = await this.options.automationLocalRuntimes.copyInstallationCommand(
          request.sourceId,
        );
        break;
      case 'asset.authorize':
        runtimes = await this.options.automationLocalRuntimes.authorizeAsset(
          request.sourceId,
          request.assetKey,
          window.windowId,
        );
        break;
      case 'runtime.recheck':
        runtimes = await this.options.automationLocalRuntimes.recheck(
          request.sourceId,
          request.runtimeId,
        );
        break;
      case 'runtime.disconnect':
        runtimes = await this.options.automationLocalRuntimes.disconnect(
          request.sourceId,
          request.runtimeId,
        );
        break;
    }
    return {
      requestId: request.requestId,
      route: request.route,
      projection: {
        identity: request.identity,
        runtimes,
      },
    };
  }

  async executeAutomationPermissionManagement(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<AutomationPermissionManagementHostResult> {
    this.requireActive();
    const request = parseAutomationPermissionManagementHostRequest(payload);
    const window = this.windows.resolveSender(sender);
    if (request.identity.windowId !== window.windowId) {
      throw new Error('Automation permission management request belongs to another Window.');
    }
    const shell = await this.shell.getProjection(window.windowId);
    const activeScene = resolveActiveDesktopWindowWorkbench(shell.window).scene;
    if (activeScene.context.kind !== 'extensions') {
      throw new Error('Automation permission management request does not match the active Scene.');
    }
    const permissions =
      request.route === 'snapshot.get'
        ? await this.options.automationPermissions.list()
        : await this.options.automationPermissions.request(request.permission);
    return {
      requestId: request.requestId,
      route: request.route,
      projection: { identity: request.identity, permissions },
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
      const context = await this.options.conversationContexts.readContext(
        navigation.conversationId,
      );
      if (!context) {
        throw new Error(
          `Desktop Conversation '${navigation.conversationId}' has no durable context.`,
        );
      }
      return this.shell.restoreAgentConversation({
        request,
        context: projectAgentConversationSurfaceBinding(context),
      });
    }
    if (request.intent.kind === 'open-character-authoring') {
      const resolution = await this.workspaceGrants.resolve(
        window.windowId,
        request.intent.workspaceGrantId,
      );
      const authority = request.intent.authority;
      const characterAuthoringWorkspace = await this.resolveCharacterAuthoringAuthority({
        rendererSessionId: request.rendererSessionId,
        windowId: request.windowId,
        workspaceId: resolution.workspace.workspaceId,
        workspaceGrantId: request.intent.workspaceGrantId,
        authority,
      });
      await this.projectAuthoring.getCharacterSnapshot({
        workspace: characterAuthoringWorkspace,
        authority,
        characterProjectId: request.intent.characterProjectId,
      });
    }
    if (request.intent.kind === 'open-world-authoring') {
      const resolution = await this.workspaceGrants.resolve(
        window.windowId,
        request.intent.workspaceGrantId,
      );
      const authority = request.intent.authority;
      const worldAuthoringWorkspace = await this.resolveWorldAuthoringAuthority({
        rendererSessionId: request.rendererSessionId,
        windowId: request.windowId,
        workspaceId: resolution.workspace.workspaceId,
        workspaceGrantId: request.intent.workspaceGrantId,
        authority,
      });
      await this.projectAuthoring.getWorldSnapshot({
        workspace: worldAuthoringWorkspace,
        authority,
        worldProjectId: request.intent.worldProjectId,
      });
    }
    if (request.intent.kind === 'open-world-runtime') {
      await this.shell.assertWindowMutationContext(request.windowId, request.rendererSessionId);
      await this.worldRuntime.read(request.intent.binding);
    }
    const result = await this.shell.transitionScene(request);
    if (result.status === 'transitioned') {
    }
    return result;
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

  async readCanvasWorkspaceIndexCatalog(
    sender: Parameters<DesktopAppHost['executeCanvasIntent']>[0],
    payload: unknown,
  ): Promise<import('../shared/canvas-bridge-contract').DesktopCanvasWorkspaceIndexCatalogResult> {
    this.requireActive();
    const request = parseDesktopCanvasWorkspaceIndexCatalogRequest(payload);
    const window = this.windows.resolveSender(sender);
    await this.workspaceGrants.restore(
      window.windowId,
      request.workspaceGrantId,
      request.workspaceId,
    );
    const service = this.canvasWorkspaceIndexService;
    if (service === undefined) {
      throw new Error('Desktop Canvas workspace index catalog is unavailable.');
    }
    const catalog = await service.readCatalog(request.workspaceId);
    return { requestId: request.requestId, catalog };
  }

  async openCanvasWorkspaceDocument(
    sender: Parameters<DesktopAppHost['executeCanvasIntent']>[0],
    payload: unknown,
  ): Promise<import('../shared/canvas-bridge-contract').DesktopCanvasWorkspaceDocumentOpenResult> {
    this.requireActive();
    const request = parseDesktopCanvasWorkspaceDocumentOpenRequest(payload);
    const window = this.windows.resolveSender(sender);
    const resolution = await this.workspaceGrants.restore(
      window.windowId,
      request.workspaceGrantId,
      request.workspaceId,
    );
    await resolveWorkspaceContentLocator(resolution.workspace, {
      file: { authority: 'workspace', path: request.canvasId },
    });
    const projection = await this.shell.getProjection(window.windowId);
    const project = projection.catalog.projects.find(
      (candidate) => candidate.workspaceId === request.workspaceId,
    );
    if (!project) {
      throw new Error(`Desktop Canvas Workspace '${request.workspaceId}' has no Project owner.`);
    }
    await openDesktopWorkspaceCanvasDocument({
      shell: this.shell,
      windowId: window.windowId,
      rendererSessionId: projection.rendererSessionId,
      projectId: project.projectId,
      workspaceId: request.workspaceId,
      documentId: request.canvasId,
      displayLabel: request.canvasId.split('/').at(-1) ?? request.canvasId,
    });
    return { requestId: request.requestId, status: 'opened' };
  }

  async getCanvasSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
    publish: (event: CanvasHostProjectionEvent) => void,
  ): Promise<CanvasHostSnapshot> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    const identity = parseCanvasHostRuntimeIdentity(payload);
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

  async readCanvasTextFilePreview(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<CanvasTextFilePreviewResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCanvas().readTextFilePreview(window.windowId, payload);
  }

  async resolveCanvasPreviewResource(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopCanvasPreviewResourceResult> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    return this.requireCanvas().resolvePreviewResource(window.windowId, payload);
  }

  async releaseCanvasPreviewResource(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<void> {
    this.requireActive();
    const window = this.windows.resolveSender(sender);
    await this.requireCanvas().releasePreviewResource(window.windowId, payload);
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
    if (result.output?.type === 'agent-context') {
      throw new Error('Cut Agent context requires a canonical DSH Tool consumer.');
    }
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
    this.characterAvatar?.detachWindow(windowId);
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

  private requireAssetCenter(): AssetCenterNodeRuntime {
    if (!this.assetCenter) throw new Error('Desktop Asset Center runtime is unavailable.');
    return this.assetCenter;
  }

  private async resolveProjectAuthoringAuthority(request: {
    readonly rendererSessionId: string;
    readonly windowId: string;
    readonly workspaceId: string;
    readonly workspaceGrantId: string;
    readonly projectId: string;
  }): Promise<{
    readonly workspace: AssetWorkspaceResolution;
    readonly project: DesktopShellProjection['catalog']['projects'][number];
  }> {
    await this.shell.assertWindowMutationContext(request.windowId, request.rendererSessionId);
    const resolution = await this.workspaceGrants.resolve(
      request.windowId,
      request.workspaceGrantId,
    );
    if (resolution.workspace.workspaceId !== request.workspaceId) {
      throw new Error('Project authoring grant resolves to another Workspace.');
    }
    const projection = await this.shell.getProjection(request.windowId);
    const project = projection.catalog.projects.find(
      (candidate) =>
        candidate.projectId === request.projectId && candidate.workspaceId === request.workspaceId,
    );
    if (!project) {
      throw new Error(`Project '${request.projectId}' is not registered for this Workspace.`);
    }
    return { workspace: resolution.workspace, project };
  }

  private async resolveCharacterAuthoringAuthority(request: {
    readonly rendererSessionId: string;
    readonly windowId: string;
    readonly workspaceId: string;
    readonly workspaceGrantId: string;
    readonly authority: CharacterAuthoringAuthority;
  }): Promise<AssetWorkspaceResolution> {
    await this.shell.assertWindowMutationContext(request.windowId, request.rendererSessionId);
    const resolution = await this.workspaceGrants.resolve(
      request.windowId,
      request.workspaceGrantId,
    );
    if (resolution.workspace.workspaceId !== request.workspaceId) {
      throw new Error('Character authoring grant resolves to another Workspace.');
    }
    const projectId = request.authority.projectId;
    const projection = await this.shell.getProjection(request.windowId);
    const project = projection.catalog.projects.find(
      (candidate) =>
        candidate.projectId === projectId && candidate.workspaceId === request.workspaceId,
    );
    if (!project) {
      throw new Error(`Project '${projectId}' is not registered for this Workspace.`);
    }
    return resolution.workspace;
  }

  private async resolveWorldAuthoringAuthority(request: {
    readonly rendererSessionId: string;
    readonly windowId: string;
    readonly workspaceId: string;
    readonly workspaceGrantId: string;
    readonly authority: WorldAuthoringAuthority;
  }): Promise<AssetWorkspaceResolution> {
    await this.shell.assertWindowMutationContext(request.windowId, request.rendererSessionId);
    const resolution = await this.workspaceGrants.resolve(
      request.windowId,
      request.workspaceGrantId,
    );
    if (resolution.workspace.workspaceId !== request.workspaceId) {
      throw new Error('World authoring grant resolves to another Workspace.');
    }
    const projectId = request.authority.projectId;
    const projection = await this.shell.getProjection(request.windowId);
    const project = projection.catalog.projects.find(
      (candidate) =>
        candidate.projectId === projectId && candidate.workspaceId === request.workspaceId,
    );
    if (!project) {
      throw new Error(`Project '${projectId}' is not registered for this Workspace.`);
    }
    return resolution.workspace;
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

function characterAuthoringCommand(
  request: CharacterAuthoringHostRequest,
): CharacterAuthoringCommand {
  switch (request.operation) {
    case 'character-project-update-draft':
      return { operation: request.operation, input: request.input };
    case 'character-project-set-review':
      return { operation: request.operation, input: request.input };
    case 'character-version-publish':
      return { operation: request.operation, input: request.input };
    case 'character-version-continue':
      return { operation: request.operation, input: request.input };
    case 'character-version-delete':
      return { operation: request.operation, input: request.input };
    case 'character-authoring-test-capture':
      return { operation: request.operation, input: request.input };
    case 'character-storyline-create':
      return { operation: request.operation, input: request.input };
    case 'character-storyline-update-draft':
      return { operation: request.operation, input: request.input };
    case 'character-storyline-restore-as-draft':
      return { operation: request.operation, input: request.input };
    case 'character-storyline-delete':
      return { operation: request.operation, input: request.input };
    case 'character-storyline-publish':
      return { operation: request.operation, input: request.input };
    case 'authoring-snapshot-get':
      throw new Error('Character authoring snapshot request is not a command.');
  }
}

function worldAuthoringCommand(request: WorldAuthoringHostRequest): WorldAuthoringCommand {
  switch (request.operation) {
    case 'world-project-create':
      return { operation: request.operation, input: request.input };
    case 'world-project-update-draft':
      return { operation: request.operation, input: request.input };
    case 'world-project-set-review':
      return { operation: request.operation, input: request.input };
    case 'world-version-publish':
      return { operation: request.operation, input: request.input };
    case 'authoring-snapshot-get':
      throw new Error('World authoring snapshot request is not a command.');
  }
}

function sameWorldRuntimeBinding(left: WorldRuntimeBinding, right: WorldRuntimeBinding): boolean {
  return (
    left.worldProjectId === right.worldProjectId &&
    left.worldVersionId === right.worldVersionId &&
    left.worldRunId === right.worldRunId &&
    left.worldSaveId === right.worldSaveId &&
    left.branchId === right.branchId &&
    left.participantId === right.participantId &&
    left.actorId === right.actorId
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
