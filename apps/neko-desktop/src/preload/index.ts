import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentHostToWebviewMessage,
  DesktopAgentConnectionIdentity,
} from '@neko/agent-contracts';
import {
  createDesktopAgentBootstrapRequest,
  createDesktopAssistantAgentBootstrapRequest,
  createDesktopAgentDetachRequest,
  createDesktopAgentMessageRequest,
  DESKTOP_AGENT_CHANNELS,
  DesktopAgentContractError,
  parseDesktopAgentBootstrapProjection,
  parseDesktopAgentDetachResult,
  parseDesktopAgentEvent,
  parseDesktopAgentMessageResult,
  type OpenNekoDesktopAgentBridge,
} from '../shared/agent-contract';
import {
  createDesktopAgentAutomationRequest,
  DESKTOP_AGENT_AUTOMATION_CHANNEL,
  DESKTOP_AGENT_AUTOMATION_RENDERER_ARGUMENT,
  parseDesktopAgentAutomationResult,
  type OpenNekoDesktopAgentAutomationBridge,
} from '../shared/agent-automation-contract';
import {
  createDesktopBootstrapRequest,
  DESKTOP_BRIDGE_CHANNELS,
  parseDesktopBootstrapProjection,
  parseDesktopLifecycleEvent,
  type DesktopLifecycleEvent,
  type OpenNekoDesktopBridge,
} from '../shared/bridge-contract';
import {
  createDesktopConversationDeleteRequest,
  createDesktopProfileRequest,
  createDesktopProjectSelectionRequest,
  createDesktopProjectOpenRequest,
  createDesktopShellRequest,
  createDesktopTabMutationRequest,
  createDesktopWindowMutationRequest,
  createDesktopWorkbenchMutationRequest,
  DESKTOP_SHELL_CHANNELS,
  parseDesktopOpenContentResult,
  parseDesktopProfileRequestResult,
  parseDesktopShellProjectionEvent,
  parseDesktopShellResponse,
  type DesktopShellProjectionEvent,
  type OpenNekoDesktopShellBridge,
} from '@neko/host/desktop-shell-contract';
import {
  createDesktopApplicationSidebarMutationRequest,
  createDesktopSceneTransitionRequest,
  parseDesktopSceneTransitionResult,
} from '@neko/host/desktop-scene-contract';
import {
  projectDesktopShellMutationContext,
  type DesktopShellMutationContext,
} from '../shared/shell-mutation-context';
import {
  DesktopAgentEventCursorRegistry,
  isSameDesktopAgentEventConnection,
  projectDesktopAgentSendFailure,
} from './desktop-agent-event-cursor';
import { preserveDesktopBootstrapEventSequence } from './desktop-runtime-event-cursor';
import {
  parseResourceBrowserChildrenRequest,
  parseResourceBrowserIntentRequest,
  parseResourceBrowserIntentResult,
  parseResourceBrowserQuickPreviewReleaseRequest,
  parseResourceBrowserQuickPreviewReleaseResult,
  parseResourceBrowserQuickPreviewRequest,
  parseResourceBrowserQuickPreviewResult,
  parseResourceBrowserRecoveryApplyRequest,
  parseResourceBrowserRecoveryCancelRequest,
  parseResourceBrowserRecoveryCancelResult,
  parseResourceBrowserRecoveryPlanRequest,
  parseResourceBrowserRecoveryPlanResult,
  parseResourceBrowserProjection,
  parseResourceBrowserProjectionEvent,
  parseResourceBrowserSearchRequest,
  parseResourceBrowserSnapshotRequest,
  parseResourceBrowserThumbnailRequest,
  parseResourceBrowserThumbnailResult,
  type ResourceBrowserIdentity,
} from '@neko/assets-domain/resource-browser/contract';
import {
  DESKTOP_RESOURCE_BROWSER_CHANNELS,
  isSameResourceBrowserIdentity,
  type OpenNekoDesktopResourceBrowserBridge,
} from '../shared/resource-browser-bridge-contract';
import {
  DESKTOP_PREVIEW_CHANNELS,
  parseDesktopPreviewBootstrapRequest,
  parseDesktopPreviewProjection,
  parseDesktopPreviewRuntimeRequest,
  type OpenNekoDesktopPreviewBridge,
} from '../shared/preview-bridge-contract';
import type { PreviewRuntimeIdentity } from '@neko/preview-domain';
import {
  TEXT_EDITOR_HOST_CHANNELS,
  TEXT_EDITOR_HOST_ROUTES,
  parseTextEditorHostRequest,
  parseTextEditorHostResult,
  parseTextEditorProjectionEvent,
  parseTextEditorRuntimeIdentity,
  sameTextEditorRuntimeIdentity,
  sameTextEditorRuntimeOwner,
  type OpenNekoDesktopTextEditorBridge,
  type TextEditorRuntimeIdentity,
} from '@neko/text-editor-domain';
import {
  parseCanvasHostIntentRequest,
  parseCanvasHostIntentResult,
  parseCanvasMaterialActionResolution,
  parseCanvasMaterialActionResolutionRequest,
  parseCanvasHostProjectionEvent,
  parseCanvasHostSnapshot,
  parseCanvasTextFilePreviewRequest,
  parseCanvasTextFilePreviewResult,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntimeIdentity,
} from '@neko/canvas-domain';
import {
  DESKTOP_CANVAS_CHANNELS,
  isSameCanvasHostIdentity,
  parseDesktopCanvasHostIdentity,
  parseDesktopCanvasMediaRequest,
  parseDesktopCanvasMediaResponse,
  parseDesktopCanvasPreviewVariantRequest,
  parseDesktopCanvasPreviewVariantResult,
  type OpenNekoDesktopCanvasBridge,
} from '../shared/canvas-bridge-contract';
import {
  CUT_HOST_RUNTIME_ROUTES,
  isCutDraftDocumentId,
  parseCutHostRuntimeProjectionEvent,
  parseCutHostRuntimeRequest,
  parseCutHostRuntimeResult,
  parseCutHostRuntimeSnapshot,
  type CutHostRuntimeIdentity,
} from '@neko/cut-domain';
import {
  desktopCutIdentityKey,
  DESKTOP_CUT_CHANNELS,
  isSameCutHostIdentity,
  isSameCutHostSession,
  parseDesktopCutHostIdentity,
  parseDesktopCutViewMutationRequest,
  parseDesktopCutViewMutationResult,
  rebindDesktopCutProjectionState,
  type OpenNekoDesktopCutBridge,
} from '../shared/cut-bridge-contract';
import {
  createDesktopApplicationSettingsRequest,
  createDesktopApplicationSettingsUpdateRequest,
  DESKTOP_APPLICATION_SETTINGS_CHANNELS,
  DesktopApplicationSettingsContractError,
  parseDesktopAgentAdvancedSettingsResult,
  parseDesktopApplicationSettingsProjectionEvent,
  parseDesktopApplicationSettingsResponse,
  type DesktopApplicationSettingsProjection,
  type OpenNekoDesktopApplicationSettingsBridge,
} from '@neko/host/application-settings';
import {
  DESKTOP_PROJECT_PORTABILITY_CHANNELS,
  isSameDesktopProjectPortabilityIdentity,
  parseDesktopProjectPortabilityCancelResult,
  parseDesktopProjectPortabilityExecuteRequest,
  parseDesktopProjectPortabilityExecuteResult,
  parseDesktopProjectPortabilityInspectResult,
  parseDesktopProjectPortabilityPlanResult,
  parseDesktopProjectPortabilityProgressEvent,
  parseDesktopProjectPortabilityRequest,
  parseDesktopProjectPortabilityResumeRequest,
  type DesktopProjectPortabilityIdentity,
  type OpenNekoDesktopProjectPortabilityBridge,
} from '@neko/assets-domain/contracts';
import {
  ASSET_CENTER_HOST_CHANNEL,
  parseAssetCenterHostRequest,
  parseAssetCenterHostResult,
  type OpenNekoAssetCenterBridge,
} from '@neko/assets-domain/asset-center/host-contract';
import {
  AGENT_LAUNCH_HOST_CHANNEL,
  parseAgentLaunchHostRequest,
  parseAgentLaunchHostResult,
  type OpenNekoAgentLaunchBridge,
} from '@neko/agent-contracts/agent-launch-host';
import {
  ASSISTANT_RESOURCE_HOST_CHANNEL,
  parseAssistantResourceHostRequest,
  parseAssistantResourceHostResult,
  type OpenNekoAssistantResourceBridge,
} from '@neko/agent-contracts/assistant-resource-host';
import {
  DESKTOP_WORKSPACE_GRANT_CHANNEL,
  createDesktopWorkspaceDirectoryTargetRequest,
  createDesktopContentProjectTargetRequest,
  createDesktopWorkspaceAuthoringLibraryTargetRequest,
  createDesktopWorkspaceProjectTargetRequest,
  parseDesktopWorkspaceGrantTargetResult,
  type OpenNekoDesktopWorkspaceGrantBridge,
} from '@neko/host/desktop-workspace-grant-contract';
import {
  PROJECT_AUTHORING_HOST_CHANNEL,
  PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
  createProjectAuthoringCatalogHostRequest,
  createProjectLocalAuthoringHostRequest,
  createProjectAuthoringNavigationHostRequest,
  parseProjectAuthoringCatalogHostResult,
  parseProjectLocalAuthoringHostResult,
  parseProjectAuthoringNavigationHostResult,
  type OpenNekoDesktopProjectAuthoringBridge,
  type OpenNekoDesktopProjectLocalAuthoringBridge,
} from '@neko/project/contracts';
import {
  AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
  parseAgentExtensionManagementHostRequest,
  parseAgentExtensionManagementHostResult,
  type OpenNekoAgentExtensionManagementBridge,
} from '@neko/agent-contracts/extension-management-host';
import {
  AUTOMATION_ENDPOINT_MANAGEMENT_HOST_CHANNEL,
  parseAutomationEndpointManagementHostRequest,
  parseAutomationEndpointManagementHostResult,
  type OpenNekoAutomationEndpointManagementBridge,
} from '@neko/automation-contracts/endpoint-management';
import {
  AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL,
  parseAutomationPermissionManagementHostRequest,
  parseAutomationPermissionManagementHostResult,
  type OpenNekoAutomationPermissionManagementBridge,
} from '@neko/automation-contracts/permission-management';
import {
  DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS,
  parseDesktopAutomationTargetSelectionChangedEvent,
  parseDesktopAutomationTargetSelectionRequest,
  parseDesktopAutomationTargetSelectionResult,
  type OpenNekoDesktopAutomationTargetSelectionBridge,
} from '../shared/automation-target-selection-contract';
import {
  DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS,
  parseDesktopAutomationSessionControlChangedEvent,
  parseDesktopAutomationSessionControlRequest,
  parseDesktopAutomationSessionControlResult,
  type OpenNekoDesktopAutomationSessionControlBridge,
} from '../shared/automation-session-control-contract';
import {
  CHARACTER_FOUNDATION_HOST_CHANNEL,
  CHARACTER_AUTHORING_HOST_CHANNEL,
  CHARACTER_AVATAR_HOST_CHANNEL,
  CHARACTER_ROOM_WORKBENCH_CHANNELS,
  createCharacterFoundationCommandHostRequest,
  createCharacterFoundationHostRequest,
  createCharacterAuthoringCommandRequest,
  createCharacterAuthoringSnapshotRequest,
  createCharacterAvatarOpenRequest,
  createCharacterAvatarReleaseRequest,
  createCharacterRoomWorkbenchSnapshotRequest,
  parseCharacterFoundationHostResult,
  parseCharacterConversationLaunchCatalogHostResult,
  parseCharacterAuthoringHostResult,
  parseCharacterAvatarHostResult,
  parseCharacterRoomWorkbenchProjectionEvent,
  parseCharacterRoomWorkbenchSnapshotResult,
  type CharacterRoomWorkbenchProjectionEvent,
  type OpenNekoDesktopCharacterBridge,
  type OpenNekoDesktopCharacterAuthoringBridge,
  type OpenNekoDesktopCharacterAvatarBridge,
  type OpenNekoDesktopCharacterRoomWorkbenchBridge,
} from '@neko/chara/contracts';
import {
  WORLD_FOUNDATION_HOST_CHANNEL,
  WORLD_AUTHORING_HOST_CHANNEL,
  createWorldFoundationCommandHostRequest,
  createWorldFoundationHostRequest,
  createWorldAuthoringCommandRequest,
  createWorldAuthoringSnapshotRequest,
  parseWorldFoundationHostResult,
  parseWorldAuthoringHostResult,
  type OpenNekoDesktopWorldAuthoringBridge,
  type OpenNekoDesktopWorldBridge,
} from '@neko/world/contracts';

let requestSequence = 0;
let latestShellProjection: DesktopShellMutationContext | undefined;
const agentEventCursors = new DesktopAgentEventCursorRegistry();
const agentListeners = new Set<{
  readonly connection: DesktopAgentConnectionIdentity;
  readonly listener: (message: AgentHostToWebviewMessage) => void;
}>();
let currentResourceIdentity: ResourceBrowserIdentity | undefined;
let currentResourceEventSequence = 0;
const resourceListeners = new Set<
  Parameters<OpenNekoDesktopResourceBrowserBridge['resources']['subscribe']>[0]
>();
let currentProjectPortabilityIdentity: DesktopProjectPortabilityIdentity | undefined;
const projectPortabilityEventSequences = new Map<string, number>();
const projectPortabilityListeners = new Set<
  Parameters<OpenNekoDesktopProjectPortabilityBridge['projectPortability']['subscribe']>[0]
>();
const currentPreviewIdentities = new Map<string, PreviewRuntimeIdentity>();
const currentTextEditorIdentities = new Map<string, TextEditorRuntimeIdentity>();
const currentTextEditorEventSequences = new Map<string, number>();
const textEditorListeners = new Set<{
  identity: TextEditorRuntimeIdentity;
  readonly listener: Parameters<OpenNekoDesktopTextEditorBridge['textEditor']['subscribe']>[1];
}>();
const currentCanvasIdentities = new Map<string, CanvasHostRuntimeIdentity>();
const currentCanvasEventSequences = new Map<string, number>();
const canvasListeners = new Set<{
  readonly identity: CanvasHostRuntimeIdentity;
  readonly listener: Parameters<OpenNekoDesktopCanvasBridge['canvas']['subscribe']>[1];
}>();
const currentCutIdentities = new Map<string, CutHostRuntimeIdentity>();
const currentCutEventSequences = new Map<string, number>();
const cutListeners = new Set<{
  readonly identity: CutHostRuntimeIdentity;
  readonly listener: Parameters<OpenNekoDesktopCutBridge['cut']['subscribe']>[1];
}>();
let currentSettingsProjection: DesktopApplicationSettingsProjection | undefined;
const settingsListeners = new Set<
  Parameters<OpenNekoDesktopApplicationSettingsBridge['settings']['subscribe']>[0]
>();
let currentCharacterRoomRunId: string | undefined;
let currentCharacterRoomEventSequence = 0;
let currentCharacterRoomSnapshotRequestId: string | undefined;
let characterRoomSnapshotPending = false;
let pendingCharacterRoomEvents: CharacterRoomWorkbenchProjectionEvent[] = [];
const characterRoomWorkbenchListeners = new Set<{
  readonly roomRunId: string;
  readonly listener: Parameters<
    OpenNekoDesktopCharacterRoomWorkbenchBridge['characterRoomWorkbench']['subscribe']
  >[1];
}>();

const bridge: OpenNekoDesktopBridge &
  OpenNekoDesktopShellBridge &
  OpenNekoDesktopAgentBridge &
  OpenNekoDesktopAgentAutomationBridge &
  OpenNekoDesktopResourceBrowserBridge &
  OpenNekoDesktopPreviewBridge &
  OpenNekoDesktopTextEditorBridge &
  OpenNekoDesktopCanvasBridge &
  OpenNekoDesktopCutBridge &
  OpenNekoAssetCenterBridge &
  OpenNekoAgentLaunchBridge &
  OpenNekoAssistantResourceBridge &
  OpenNekoDesktopWorkspaceGrantBridge &
  OpenNekoAgentExtensionManagementBridge &
  OpenNekoAutomationEndpointManagementBridge &
  OpenNekoAutomationPermissionManagementBridge &
  OpenNekoDesktopAutomationTargetSelectionBridge &
  OpenNekoDesktopAutomationSessionControlBridge &
  OpenNekoDesktopApplicationSettingsBridge &
  OpenNekoDesktopProjectPortabilityBridge &
  OpenNekoDesktopProjectAuthoringBridge &
  OpenNekoDesktopProjectLocalAuthoringBridge &
  OpenNekoDesktopCharacterBridge &
  OpenNekoDesktopCharacterAuthoringBridge &
  OpenNekoDesktopCharacterAvatarBridge &
  OpenNekoDesktopCharacterRoomWorkbenchBridge &
  OpenNekoDesktopWorldBridge &
  OpenNekoDesktopWorldAuthoringBridge = {
  worldAuthoring: {
    async getSnapshot(windowId, binding) {
      const context = requireShellMutationContext();
      const request = createWorldAuthoringSnapshotRequest({
        requestId: nextRequestId('world-authoring'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
      });
      const response: unknown = await ipcRenderer.invoke(WORLD_AUTHORING_HOST_CHANNEL, request);
      return parseWorldAuthoringHostResult(response, request.requestId, binding).snapshot;
    },
    async execute(windowId, binding, command) {
      const context = requireShellMutationContext();
      const request = createWorldAuthoringCommandRequest({
        requestId: nextRequestId('world-authoring-command'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
        command,
      });
      const response: unknown = await ipcRenderer.invoke(WORLD_AUTHORING_HOST_CHANNEL, request);
      return parseWorldAuthoringHostResult(response, request.requestId, binding).snapshot;
    },
  },
  worldFoundation: {
    async getSnapshot() {
      const request = createWorldFoundationHostRequest(nextRequestId('world-foundation'));
      const response: unknown = await ipcRenderer.invoke(WORLD_FOUNDATION_HOST_CHANNEL, request);
      return parseWorldFoundationHostResult(response, request.requestId).snapshot;
    },
    async execute(command) {
      const request = createWorldFoundationCommandHostRequest(
        nextRequestId('world-foundation-command'),
        command,
      );
      const response: unknown = await ipcRenderer.invoke(WORLD_FOUNDATION_HOST_CHANNEL, request);
      return parseWorldFoundationHostResult(response, request.requestId).snapshot;
    },
  },
  characterFoundation: {
    async getSnapshot() {
      const request = createCharacterFoundationHostRequest(nextRequestId('character-foundation'));
      const response: unknown = await ipcRenderer.invoke(
        CHARACTER_FOUNDATION_HOST_CHANNEL,
        request,
      );
      return parseCharacterFoundationHostResult(response, request.requestId).snapshot;
    },
    async getConversationLaunchCatalog() {
      const request = createCharacterFoundationHostRequest(
        nextRequestId('character-conversation-launch-catalog'),
        'conversation-launch-catalog-get',
      );
      const response: unknown = await ipcRenderer.invoke(
        CHARACTER_FOUNDATION_HOST_CHANNEL,
        request,
      );
      return parseCharacterConversationLaunchCatalogHostResult(response, request.requestId).catalog;
    },
    async execute(command) {
      const request = createCharacterFoundationCommandHostRequest(
        nextRequestId('character-foundation-command'),
        command,
      );
      const response: unknown = await ipcRenderer.invoke(
        CHARACTER_FOUNDATION_HOST_CHANNEL,
        request,
      );
      return parseCharacterFoundationHostResult(response, request.requestId).snapshot;
    },
  },
  characterAuthoring: {
    async getSnapshot(windowId, binding) {
      const context = requireShellMutationContext();
      const request = createCharacterAuthoringSnapshotRequest({
        requestId: nextRequestId('character-authoring'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
      });
      const response: unknown = await ipcRenderer.invoke(CHARACTER_AUTHORING_HOST_CHANNEL, request);
      return parseCharacterAuthoringHostResult(response, request.requestId, binding).snapshot;
    },
    async execute(windowId, binding, command) {
      const context = requireShellMutationContext();
      const request = createCharacterAuthoringCommandRequest({
        requestId: nextRequestId('character-authoring-command'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
        command,
      });
      const response: unknown = await ipcRenderer.invoke(CHARACTER_AUTHORING_HOST_CHANNEL, request);
      return parseCharacterAuthoringHostResult(response, request.requestId, binding).snapshot;
    },
  },
  characterAvatar: {
    async openSurface(input) {
      const context = requireShellMutationContext();
      const request = createCharacterAvatarOpenRequest({
        requestId: nextRequestId('character-avatar-open'),
        rendererSessionId: context.rendererSessionId,
        ...input,
      });
      const response: unknown = await ipcRenderer.invoke(CHARACTER_AVATAR_HOST_CHANNEL, request);
      return parseCharacterAvatarHostResult(response, request.requestId);
    },
    async releaseSurface(avatarResourceLeaseId) {
      const context = requireShellMutationContext();
      const request = createCharacterAvatarReleaseRequest({
        requestId: nextRequestId('character-avatar-release'),
        rendererSessionId: context.rendererSessionId,
        avatarResourceLeaseId,
      });
      const response: unknown = await ipcRenderer.invoke(CHARACTER_AVATAR_HOST_CHANNEL, request);
      const result = parseCharacterAvatarHostResult(response, request.requestId);
      if (result.status !== 'released' || result.avatarResourceLeaseId !== avatarResourceLeaseId) {
        throw new Error('Character Avatar release did not confirm the exact resource lease.');
      }
    },
  },
  characterRoomWorkbench: {
    async getSnapshot(roomRunId) {
      const request = createCharacterRoomWorkbenchSnapshotRequest(
        nextRequestId('character-room-workbench'),
        roomRunId,
      );
      currentCharacterRoomSnapshotRequestId = request.requestId;
      characterRoomSnapshotPending = true;
      currentCharacterRoomEventSequence = 0;
      currentCharacterRoomRunId = request.roomRunId;
      pendingCharacterRoomEvents = [];
      try {
        const response: unknown = await ipcRenderer.invoke(
          CHARACTER_ROOM_WORKBENCH_CHANNELS.snapshotGet,
          request,
        );
        const result = parseCharacterRoomWorkbenchSnapshotResult(response, request);
        if (currentCharacterRoomSnapshotRequestId === request.requestId) {
          currentCharacterRoomEventSequence = Math.max(
            currentCharacterRoomEventSequence,
            result.sequence,
          );
          characterRoomSnapshotPending = false;
          for (const event of pendingCharacterRoomEvents) publishCharacterRoomEvent(event);
          pendingCharacterRoomEvents = [];
        }
        return result.projection;
      } catch (error) {
        if (currentCharacterRoomSnapshotRequestId === request.requestId) {
          currentCharacterRoomSnapshotRequestId = undefined;
          characterRoomSnapshotPending = false;
          currentCharacterRoomRunId = undefined;
          currentCharacterRoomEventSequence = 0;
          pendingCharacterRoomEvents = [];
        }
        throw error;
      }
    },
    subscribe(roomRunId, listener) {
      const identity = createCharacterRoomWorkbenchSnapshotRequest(
        'character-room-workbench-subscription',
        roomRunId,
      ).roomRunId;
      const subscription = { roomRunId: identity, listener };
      characterRoomWorkbenchListeners.add(subscription);
      return () => characterRoomWorkbenchListeners.delete(subscription);
    },
  },
  assistantResources: {
    async execute(value) {
      const request = parseAssistantResourceHostRequest(value);
      const response: unknown = await ipcRenderer.invoke(ASSISTANT_RESOURCE_HOST_CHANNEL, request);
      return parseAssistantResourceHostResult(response, request.requestId);
    },
  },
  agentLaunch: {
    async attach(workbenchInstanceId, agentSurfaceId, viewId, draft) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-attach'),
        operation: 'attach',
        workbenchInstanceId,
        agentSurfaceId,
        viewId,
        draft,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status !== 'ready' && result.status !== 'unavailable') {
        throw new Error(`Agent launch attach returned '${result.status}'.`);
      }
      return result;
    },
    async authorizeResource(connection, resourceKind) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-authorize'),
        operation: 'authorize-resource',
        connection,
        resourceKind,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status === 'cancelled') return undefined;
      if (result.status !== 'ready') {
        throw new Error(`Agent launch authorization returned '${result.status}'.`);
      }
      return result.catalog;
    },
    async bindTarget(connection, binding) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-bind-target'),
        operation: 'bind-target',
        connection,
        binding,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status !== 'ready') {
        throw new Error(`Agent launch target binding returned '${result.status}'.`);
      }
      return result.catalog;
    },
    async configureEntryTarget(connection, mode, binding) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-configure-entry-target'),
        operation: 'configure-entry-target',
        connection,
        mode,
        binding: binding ?? null,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status !== 'entry-configured') {
        throw new Error(`Agent Entry target configuration returned '${result.status}'.`);
      }
      return { intent: result.intent, catalog: result.catalog };
    },
    async updateConfiguration(connection, configuration) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-update-configuration'),
        operation: 'update-configuration',
        connection,
        configuration,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status !== 'ready') {
        throw new Error(`Agent launch configuration update returned '${result.status}'.`);
      }
      return result.catalog;
    },
    async searchWorkspaceMentions(connection, bindingReceiptId, filter) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-search-workspace-mentions'),
        operation: 'search-workspace-mentions',
        connection,
        bindingReceiptId,
        filter,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status !== 'mentions') {
        throw new Error(`Agent launch mention search returned '${result.status}'.`);
      }
      return result.projection;
    },
    async submitDraft(connection, input) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-submit-draft'),
        operation: 'submit-draft',
        connection,
        input,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status !== 'committed') {
        throw new Error(`Agent draft submit returned '${result.status}'.`);
      }
      return result.projection;
    },
    async detach(connection) {
      const request = parseAgentLaunchHostRequest({
        requestId: nextRequestId('agent-launch-detach'),
        operation: 'detach',
        connection,
      });
      const response: unknown = await ipcRenderer.invoke(AGENT_LAUNCH_HOST_CHANNEL, request);
      const result = parseAgentLaunchHostResult(response, request.requestId);
      if (result.status !== 'detached') {
        throw new Error(`Agent launch detach returned '${result.status}'.`);
      }
    },
  },
  workspaceGrants: {
    async chooseDirectory(windowId) {
      const context = requireShellMutationContext();
      const request = createDesktopWorkspaceDirectoryTargetRequest({
        requestId: nextRequestId('desktop-workspace-grant-choose'),
        rendererSessionId: context.rendererSessionId,
        windowId,
      });
      const response: unknown = await ipcRenderer.invoke(DESKTOP_WORKSPACE_GRANT_CHANNEL, request);
      return parseDesktopWorkspaceGrantTargetResult(response, request.requestId);
    },
    async createContentProject(windowId) {
      const context = requireShellMutationContext();
      const request = createDesktopContentProjectTargetRequest({
        requestId: nextRequestId('desktop-content-project-create'),
        rendererSessionId: context.rendererSessionId,
        windowId,
      });
      const response: unknown = await ipcRenderer.invoke(DESKTOP_WORKSPACE_GRANT_CHANNEL, request);
      return parseDesktopWorkspaceGrantTargetResult(response, request.requestId);
    },
    async selectProject(windowId, projectId) {
      const context = requireShellMutationContext();
      const request = createDesktopWorkspaceProjectTargetRequest({
        requestId: nextRequestId('desktop-workspace-grant-select-project'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        projectId,
      });
      const response: unknown = await ipcRenderer.invoke(DESKTOP_WORKSPACE_GRANT_CHANNEL, request);
      return parseDesktopWorkspaceGrantTargetResult(response, request.requestId);
    },
    async selectAuthoringLibrary(windowId, library) {
      const context = requireShellMutationContext();
      const request = createDesktopWorkspaceAuthoringLibraryTargetRequest({
        requestId: nextRequestId('desktop-workspace-grant-select-authoring-library'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        library,
      });
      const response: unknown = await ipcRenderer.invoke(DESKTOP_WORKSPACE_GRANT_CHANNEL, request);
      return parseDesktopWorkspaceGrantTargetResult(response, request.requestId);
    },
  },
  projectAuthoring: {
    async getCatalog(windowId) {
      const context = requireShellMutationContext();
      const request = createProjectAuthoringCatalogHostRequest({
        requestId: nextRequestId('project-authoring-catalog'),
        rendererSessionId: context.rendererSessionId,
        windowId,
      });
      const response: unknown = await ipcRenderer.invoke(PROJECT_AUTHORING_HOST_CHANNEL, request);
      return parseProjectAuthoringCatalogHostResult(response, request.requestId);
    },
    async getNavigation(windowId, binding) {
      const context = requireShellMutationContext();
      const request = createProjectAuthoringNavigationHostRequest({
        requestId: nextRequestId('project-authoring-navigation'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
      });
      const response: unknown = await ipcRenderer.invoke(PROJECT_AUTHORING_HOST_CHANNEL, request);
      return parseProjectAuthoringNavigationHostResult(response, request.requestId);
    },
  },
  projectLocalAuthoring: {
    async createTarget(windowId, binding, input) {
      const context = requireShellMutationContext();
      const request = createProjectLocalAuthoringHostRequest({
        requestId: nextRequestId('project-local-authoring-create'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
        create: input,
      });
      const response: unknown = await ipcRenderer.invoke(
        PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
        request,
      );
      return parseProjectLocalAuthoringHostResult(response, request.requestId, binding);
    },
  },
  agent: {
    async getBootstrap(workbenchInstanceId, agentSurfaceId, projectId, viewId, conversationId) {
      const request = createDesktopAgentBootstrapRequest(
        nextRequestId('desktop-agent-bootstrap'),
        workbenchInstanceId,
        agentSurfaceId,
        projectId,
        viewId,
        conversationId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AGENT_CHANNELS.bootstrapGet,
        request,
      );
      const projection = parseDesktopAgentBootstrapProjection(response, request.requestId);
      if (projection.status === 'ready') agentEventCursors.register(projection.connection);
      return projection;
    },
    async getAssistantBootstrap(
      workbenchInstanceId,
      agentSurfaceId,
      assistantSpaceId,
      conversationId,
      viewId,
    ) {
      const request = createDesktopAssistantAgentBootstrapRequest(
        nextRequestId('desktop-assistant-agent-bootstrap'),
        workbenchInstanceId,
        agentSurfaceId,
        assistantSpaceId,
        conversationId,
        viewId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AGENT_CHANNELS.bootstrapGet,
        request,
      );
      const projection = parseDesktopAgentBootstrapProjection(response, request.requestId);
      if (projection.status === 'ready') agentEventCursors.register(projection.connection);
      return projection;
    },
    async detach(connection) {
      const request = createDesktopAgentDetachRequest(
        nextRequestId('desktop-agent-detach'),
        connection,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AGENT_CHANNELS.connectionDetach,
        request,
      );
      parseDesktopAgentDetachResult(response, request.requestId);
      agentEventCursors.release(connection);
    },
    send(connection, message) {
      const request = createDesktopAgentMessageRequest(
        nextRequestId('desktop-agent-message'),
        connection,
        message,
      );
      void ipcRenderer
        .invoke(DESKTOP_AGENT_CHANNELS.messageSend, request)
        .then((response: unknown) => {
          const result = parseDesktopAgentMessageResult(response, request.requestId);
          if (result.status === 'unavailable') {
            emitAgentMessage(
              connection,
              projectDesktopAgentSendFailure(message, result.diagnostic.message),
            );
          }
        })
        .catch((error: unknown) => {
          emitAgentMessage(
            connection,
            projectDesktopAgentSendFailure(message, describeError(error)),
          );
        });
    },
    subscribe(connection, listener) {
      const subscription = { connection, listener };
      agentListeners.add(subscription);
      return () => {
        agentListeners.delete(subscription);
      };
    },
    ...(process.argv.includes(DESKTOP_AGENT_AUTOMATION_RENDERER_ARGUMENT)
      ? {
          automation: {
            async execute(connection, operation) {
              const request = createDesktopAgentAutomationRequest(
                nextRequestId('desktop-agent-automation'),
                connection,
                operation,
              );
              const response: unknown = await ipcRenderer.invoke(
                DESKTOP_AGENT_AUTOMATION_CHANNEL,
                request,
              );
              return parseDesktopAgentAutomationResult(response, request.requestId);
            },
          },
        }
      : {}),
  },
  bootstrap: {
    async get() {
      requestSequence += 1;
      const requestId = `desktop-bootstrap-${Date.now()}-${requestSequence}`;
      const request = createDesktopBootstrapRequest(requestId);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
        request,
      );
      const projection = parseDesktopBootstrapProjection(response, requestId);
      return projection;
    },
  },
  lifecycle: {
    subscribe(listener: (event: DesktopLifecycleEvent) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        const event = parseDesktopLifecycleEvent(value);
        listener(event);
      };
      ipcRenderer.on(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, handler);
      };
    },
  },
  settings: {
    async get() {
      const request = createDesktopApplicationSettingsRequest(
        nextRequestId('desktop-application-settings'),
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_APPLICATION_SETTINGS_CHANNELS.snapshotGet,
        request,
      );
      const projection = parseDesktopApplicationSettingsResponse(
        response,
        request.requestId,
      ).projection;
      currentSettingsProjection = projection;
      return projection;
    },
    async update(preferences) {
      const request = createDesktopApplicationSettingsUpdateRequest(
        nextRequestId('desktop-application-settings-update'),
        preferences,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_APPLICATION_SETTINGS_CHANNELS.update,
        request,
      );
      const projection = parseDesktopApplicationSettingsResponse(
        response,
        request.requestId,
      ).projection;
      currentSettingsProjection = projection;
      return projection;
    },
    async openAgentAdvanced() {
      const request = createDesktopApplicationSettingsRequest(
        nextRequestId('desktop-agent-advanced-settings'),
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_APPLICATION_SETTINGS_CHANNELS.agentAdvancedOpen,
        request,
      );
      parseDesktopAgentAdvancedSettingsResult(response, request.requestId);
    },
    subscribe(listener) {
      settingsListeners.add(listener);
      return () => {
        settingsListeners.delete(listener);
      };
    },
  },
  assetCenter: {
    async execute(input) {
      const request = parseAssetCenterHostRequest(input);
      const response: unknown = await ipcRenderer.invoke(ASSET_CENTER_HOST_CHANNEL, request);
      return parseAssetCenterHostResult(response, request);
    },
  },
  extensionManagement: {
    async execute(input) {
      const request = parseAgentExtensionManagementHostRequest(input);
      const response: unknown = await ipcRenderer.invoke(
        AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
        request,
      );
      return parseAgentExtensionManagementHostResult(response, request);
    },
  },
  automationEndpoints: {
    async execute(input) {
      const request = parseAutomationEndpointManagementHostRequest(input);
      const response: unknown = await ipcRenderer.invoke(
        AUTOMATION_ENDPOINT_MANAGEMENT_HOST_CHANNEL,
        request,
      );
      return parseAutomationEndpointManagementHostResult(response, request);
    },
  },
  automationPermissions: {
    async execute(input) {
      const request = parseAutomationPermissionManagementHostRequest(input);
      const response: unknown = await ipcRenderer.invoke(
        AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL,
        request,
      );
      return parseAutomationPermissionManagementHostResult(response, request);
    },
  },
  automationTargetSelection: {
    async execute(input) {
      const request = parseDesktopAutomationTargetSelectionRequest(input);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.execute,
        request,
      );
      return parseDesktopAutomationTargetSelectionResult(response, request);
    },
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        parseDesktopAutomationTargetSelectionChangedEvent(value);
        listener();
      };
      ipcRenderer.on(DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.changed, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.changed, handler);
      };
    },
  },
  automationSessionControl: {
    async execute(input) {
      const request = parseDesktopAutomationSessionControlRequest(input);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.execute,
        request,
      );
      return parseDesktopAutomationSessionControlResult(response, request);
    },
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        parseDesktopAutomationSessionControlChangedEvent(value);
        listener();
      };
      ipcRenderer.on(DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.changed, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.changed, handler);
      };
    },
  },
  resources: {
    async getSnapshot(value) {
      const request = parseResourceBrowserSnapshotRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet,
        request,
      );
      const projection = parseResourceBrowserProjection(response);
      if (!isSameResourceBrowserIdentity(projection.identity, request.identity)) {
        throw new Error('Desktop Resource Browser snapshot owner identity does not match.');
      }
      currentResourceIdentity = projection.identity;
      currentResourceEventSequence = 0;
      return projection;
    },
    async search(value) {
      const request = parseResourceBrowserSearchRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.search,
        request,
      );
      return parseResourceBrowserProjection(response);
    },
    async children(value) {
      const request = parseResourceBrowserChildrenRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.children,
        request,
      );
      return parseResourceBrowserProjection(response);
    },
    async resolveThumbnail(value) {
      const request = parseResourceBrowserThumbnailRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.thumbnailResolve,
        request,
      );
      const result = parseResourceBrowserThumbnailResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.resourceId !== request.resourceId ||
        result.descriptorId !== request.descriptorId ||
        result.sourceFingerprint !== request.sourceFingerprint
      ) {
        throw new Error('Desktop Resource Browser thumbnail result identity does not match.');
      }
      return result;
    },
    async resolveQuickPreview(value) {
      const request = parseResourceBrowserQuickPreviewRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewResolve,
        request,
      );
      const result = parseResourceBrowserQuickPreviewResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.resourceId !== request.resourceId
      ) {
        throw new Error('Desktop Resource Browser quick preview result identity does not match.');
      }
      return result;
    },
    async releaseQuickPreview(value) {
      const request = parseResourceBrowserQuickPreviewReleaseRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewRelease,
        request,
      );
      const result = parseResourceBrowserQuickPreviewReleaseResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.previewSessionId !== request.previewSessionId
      ) {
        throw new Error(
          'Desktop Resource Browser quick preview release result identity does not match.',
        );
      }
      return result;
    },
    async planRecovery(value) {
      const request = parseResourceBrowserRecoveryPlanRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryPlan,
        request,
      );
      const result = parseResourceBrowserRecoveryPlanResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.resourceId !== request.resourceId ||
        (result.status === 'planned' &&
          (result.plan.workspaceId !== request.identity.workspaceId ||
            result.plan.operationFingerprint !== request.expectedOperationFingerprint))
      ) {
        throw new Error('Desktop Resource Browser recovery plan identity does not match.');
      }
      return result;
    },
    async applyRecovery(value) {
      const request = parseResourceBrowserRecoveryApplyRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryApply,
        request,
      );
      const projection = parseResourceBrowserProjection(response);
      if (!isSameResourceBrowserIdentity(projection.identity, request.identity)) {
        throw new Error('Desktop Resource Browser recovery projection identity does not match.');
      }
      return projection;
    },
    async cancelRecovery(value) {
      const request = parseResourceBrowserRecoveryCancelRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryCancel,
        request,
      );
      const result = parseResourceBrowserRecoveryCancelResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId ||
        result.planId !== request.planId
      ) {
        throw new Error('Desktop Resource Browser recovery cancellation identity does not match.');
      }
      return result;
    },
    async execute(value) {
      const request = parseResourceBrowserIntentRequest(value);
      requireCurrentResourceIdentity(request.identity);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_RESOURCE_BROWSER_CHANNELS.execute,
        request,
      );
      const result = parseResourceBrowserIntentResult(response);
      if (
        !isSameResourceBrowserIdentity(result.identity, request.identity) ||
        result.requestId !== request.requestId
      ) {
        throw new Error('Desktop Resource Browser intent result identity does not match.');
      }
      return result;
    },
    subscribe(listener) {
      resourceListeners.add(listener);
      return () => {
        resourceListeners.delete(listener);
      };
    },
  },
  projectPortability: {
    async inspect(value) {
      const request = parseDesktopProjectPortabilityRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.inspect,
        request,
      );
      const result = parseDesktopProjectPortabilityInspectResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      currentProjectPortabilityIdentity = request.identity;
      return result;
    },
    async plan(value) {
      const request = parseDesktopProjectPortabilityRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.plan,
        request,
      );
      const result = parseDesktopProjectPortabilityPlanResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (result.status === 'planned' && result.plan.workspaceId !== request.identity.workspaceId) {
        throw new Error('Desktop project portability plan Workspace identity does not match.');
      }
      currentProjectPortabilityIdentity = request.identity;
      return result;
    },
    async resume(value) {
      const request = parseDesktopProjectPortabilityResumeRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.resume,
        request,
      );
      const result = parseDesktopProjectPortabilityPlanResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (
        result.status === 'planned' &&
        (result.plan.workspaceId !== request.identity.workspaceId ||
          result.plan.snapshotId !== request.snapshotId)
      ) {
        throw new Error('Desktop project portability resume identity does not match.');
      }
      currentProjectPortabilityIdentity = request.identity;
      return result;
    },
    async execute(value) {
      const request = parseDesktopProjectPortabilityExecuteRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.execute,
        request,
      );
      const result = parseDesktopProjectPortabilityExecuteResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (result.snapshotId !== request.snapshotId) {
        throw new Error('Desktop project portability execution identity does not match.');
      }
      return result;
    },
    async cancel(value) {
      const request = parseDesktopProjectPortabilityResumeRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PROJECT_PORTABILITY_CHANNELS.cancel,
        request,
      );
      const result = parseDesktopProjectPortabilityCancelResult(response);
      requireProjectPortabilityResultIdentity(
        request.identity,
        result.identity,
        request.requestId,
        result.requestId,
      );
      if (result.snapshotId !== request.snapshotId) {
        throw new Error('Desktop project portability cancellation identity does not match.');
      }
      return result;
    },
    subscribe(listener) {
      projectPortabilityListeners.add(listener);
      return () => {
        projectPortabilityListeners.delete(listener);
      };
    },
  },
  preview: {
    async getSnapshot(value) {
      const request = parseDesktopPreviewBootstrapRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PREVIEW_CHANNELS.snapshotGet,
        request,
      );
      const projection = parseDesktopPreviewProjection(response);
      if (
        projection.identity.projectId !== request.projectId ||
        projection.identity.workspaceId !== request.workspaceId ||
        projection.identity.viewId !== request.viewId ||
        projection.identity.viewInstanceId !== request.viewInstanceId ||
        projection.identity.sessionId !== request.sessionId ||
        projection.identity.rendererSessionId !== request.rendererSessionId
      ) {
        throw new Error('Desktop Preview projection owner identity does not match.');
      }
      currentPreviewIdentities.set(previewIdentityKey(projection.identity), projection.identity);
      return projection;
    },
    async execute(value) {
      const request = parseDesktopPreviewRuntimeRequest(value);
      const key = previewIdentityKey(request.identity);
      const identity = currentPreviewIdentities.get(key);
      if (!identity || !isSamePreviewIdentity(request.identity, identity)) {
        throw new Error('Desktop Preview request requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_PREVIEW_CHANNELS.requestExecute,
        request,
      );
      const projection = parseDesktopPreviewProjection(response);
      currentPreviewIdentities.delete(key);
      currentPreviewIdentities.set(previewIdentityKey(projection.identity), projection.identity);
      return projection;
    },
  },
  textEditor: {
    async execute(value) {
      const request = parseTextEditorHostRequest(value);
      const response: unknown = await ipcRenderer.invoke(
        TEXT_EDITOR_HOST_CHANNELS.execute,
        request,
      );
      const result = parseTextEditorHostResult(response);
      const recoveredCleanSession =
        result.status === 'ready' &&
        request.route === TEXT_EDITOR_HOST_ROUTES.projectionGet &&
        sameTextEditorRuntimeOwner(result.identity, request.identity);
      if (
        result.requestId !== request.requestId ||
        (!sameTextEditorRuntimeIdentity(result.identity, request.identity) &&
          !recoveredCleanSession)
      ) {
        throw new Error('Desktop Text Editor result identity does not match.');
      }
      const previousKey = textEditorIdentityKey(request.identity);
      const key = textEditorIdentityKey(result.identity);
      if (result.status === 'ready') {
        if (previousKey !== key) {
          currentTextEditorIdentities.delete(previousKey);
          currentTextEditorEventSequences.delete(previousKey);
          for (const entry of textEditorListeners) {
            if (sameTextEditorRuntimeIdentity(entry.identity, request.identity)) {
              entry.identity = result.identity;
            }
          }
        }
        currentTextEditorIdentities.set(key, result.identity);
      } else if (result.status === 'closed') {
        currentTextEditorIdentities.delete(key);
        currentTextEditorEventSequences.delete(key);
      }
      return result;
    },
    subscribe(identity, listener) {
      const entry = { identity: parseTextEditorRuntimeIdentity(identity), listener };
      textEditorListeners.add(entry);
      return () => textEditorListeners.delete(entry);
    },
  },
  canvas: {
    async getSnapshot(value) {
      const identity = parseDesktopCanvasHostIdentity(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.snapshotGet,
        identity,
      );
      const snapshot = parseCanvasHostSnapshot(response);
      if (!isSameCanvasHostIdentity(snapshot.identity, identity)) {
        throw new Error('Desktop Canvas snapshot owner identity does not match.');
      }
      const key = canvasIdentityKey(snapshot.identity);
      currentCanvasIdentities.set(key, snapshot.identity);
      currentCanvasEventSequences.set(
        key,
        preserveDesktopBootstrapEventSequence(currentCanvasEventSequences.get(key)),
      );
      return snapshot;
    },
    async resolveMaterialActions(value) {
      const request = parseCanvasMaterialActionResolutionRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error(
          'Desktop Canvas material action resolution requires a current owner-bound snapshot.',
        );
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.materialActionsResolve,
        request,
      );
      return parseCanvasMaterialActionResolution(response, request.requestId);
    },
    async readTextFilePreview(value) {
      const request = parseCanvasTextFilePreviewRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas text preview requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.textFilePreviewRead,
        request,
      );
      return parseCanvasTextFilePreviewResult(response, request.requestId, request.nodeId);
    },
    async executeIntent(value) {
      const request = parseCanvasHostIntentRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas intent requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.intentExecute,
        request,
      );
      return parseCanvasHostIntentResult(response, request.requestId, request.commandId);
    },
    async resolvePreviewVariant(value) {
      const request = parseDesktopCanvasPreviewVariantRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas preview requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.previewVariantResolve,
        request,
      );
      return parseDesktopCanvasPreviewVariantResult(response, request.requestId);
    },
    async executeMediaRequest(value) {
      const request = parseDesktopCanvasMediaRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas media request requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.mediaRequestExecute,
        request,
      );
      return parseDesktopCanvasMediaResponse(response, request.nodeId);
    },
    subscribe(identity, listener) {
      const entry = { identity: parseDesktopCanvasHostIdentity(identity), listener };
      canvasListeners.add(entry);
      return () => canvasListeners.delete(entry);
    },
  },
  cut: {
    async createDraft(value) {
      const request = parseDesktopCutViewMutationRequest(value);
      if (request.identity !== undefined) {
        throw new Error('Desktop Cut draft creation must not carry a document identity.');
      }
      const response: unknown = await ipcRenderer.invoke(DESKTOP_CUT_CHANNELS.draftCreate, request);
      return parseDesktopCutViewMutationResult(response);
    },
    async closeView(value) {
      const request = parseDesktopCutViewMutationRequest(value);
      if (request.identity === undefined) {
        throw new Error('Desktop Cut close requires an exact document identity.');
      }
      const response: unknown = await ipcRenderer.invoke(DESKTOP_CUT_CHANNELS.viewClose, request);
      return parseDesktopCutViewMutationResult(response);
    },
    async getSnapshot(value) {
      const identity = parseDesktopCutHostIdentity(value);
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CUT_CHANNELS.snapshotGet,
        identity,
      );
      const snapshot = parseCutHostRuntimeSnapshot(response);
      if (!isSameCutHostIdentity(snapshot.identity, identity)) {
        throw new Error('Desktop Cut snapshot owner identity does not match.');
      }
      const key = desktopCutIdentityKey(snapshot.identity);
      currentCutIdentities.set(key, snapshot.identity);
      currentCutEventSequences.set(
        key,
        preserveDesktopBootstrapEventSequence(currentCutEventSequences.get(key)),
      );
      return snapshot;
    },
    async execute(value) {
      const request = parseCutHostRuntimeRequest(value);
      const identity = currentCutIdentities.get(desktopCutIdentityKey(request.identity));
      const createsDocument = request.route === CUT_HOST_RUNTIME_ROUTES.documentCreate;
      if (
        (!identity && !createsDocument) ||
        (identity !== undefined && !isSameCutHostIdentity(request.identity, identity))
      ) {
        throw new Error('Desktop Cut request requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CUT_CHANNELS.requestExecute,
        request,
      );
      const result = parseCutHostRuntimeResult(response);
      const expectedIdentity = identity ?? request.identity;
      const savesDraft =
        request.route === CUT_HOST_RUNTIME_ROUTES.save &&
        isCutDraftDocumentId(request.identity.documentId);
      const reboundDraft =
        savesDraft &&
        !isCutDraftDocumentId(result.snapshot.identity.documentId) &&
        isSameCutHostSession(result.snapshot.identity, expectedIdentity);
      if (!isSameCutHostIdentity(result.snapshot.identity, expectedIdentity) && !reboundDraft) {
        throw new Error('Desktop Cut response owner identity does not match.');
      }
      if (createsDocument || reboundDraft) {
        if (reboundDraft) {
          if (result.output?.type !== 'identity-rebound') {
            throw new Error('Desktop Cut draft rebind result is missing its event cursor.');
          }
          rebindDesktopCutProjectionState({
            identities: currentCutIdentities,
            eventSequences: currentCutEventSequences,
            listeners: cutListeners,
            previousIdentity: expectedIdentity,
            nextIdentity: result.snapshot.identity,
            eventSequence: result.output.eventSequence,
          });
        } else {
          const key = desktopCutIdentityKey(result.snapshot.identity);
          currentCutIdentities.set(key, result.snapshot.identity);
          currentCutEventSequences.set(
            key,
            preserveDesktopBootstrapEventSequence(currentCutEventSequences.get(key)),
          );
        }
      }
      return result;
    },
    subscribe(identity, listener) {
      const entry = { identity: parseDesktopCutHostIdentity(identity), listener };
      cutListeners.add(entry);
      return () => cutListeners.delete(entry);
    },
  },
  shell: {
    async getSnapshot() {
      const request = createDesktopShellRequest(nextRequestId('desktop-shell-snapshot'));
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.snapshotGet,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    subscribe(listener: (event: DesktopShellProjectionEvent) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        const event = parseDesktopShellProjectionEvent(value);
        rememberShellProjection(event.projection);
        listener(event);
      };
      ipcRenderer.on(DESKTOP_SHELL_CHANNELS.projectionEvent, handler);
      return () => {
        ipcRenderer.removeListener(DESKTOP_SHELL_CHANNELS.projectionEvent, handler);
      };
    },
  },
  projects: {
    async openContent() {
      const context = requireShellMutationContext();
      const request = createDesktopWindowMutationRequest(
        nextRequestId('desktop-project-open'),
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectOpenContent,
        request,
      );
      const result = parseDesktopOpenContentResult(response, request.requestId);
      rememberShellProjection(result.projection);
      return result;
    },
    async open(projectId) {
      const context = requireShellMutationContext();
      const request = createDesktopProjectOpenRequest(
        nextRequestId('desktop-project-catalog-open'),
        projectId,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectOpenCatalog,
        request,
      );
      const result = parseDesktopOpenContentResult(response, request.requestId);
      rememberShellProjection(result.projection);
      return result;
    },
    async remove(projectIds) {
      const context = requireShellMutationContext();
      const request = createDesktopProjectSelectionRequest(
        nextRequestId('desktop-project-remove'),
        projectIds,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectRemove,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    async deleteConversations(projectIds) {
      const context = requireShellMutationContext();
      const request = createDesktopProjectSelectionRequest(
        nextRequestId('desktop-project-conversation-delete'),
        projectIds,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectConversationDelete,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    async requestProfile(profile) {
      const request = createDesktopProfileRequest(
        nextRequestId('desktop-project-profile'),
        profile,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectRequestProfile,
        request,
      );
      const result = parseDesktopProfileRequestResult(response, request.requestId);
      rememberShellProjection(result.projection);
      return result;
    },
  },
  conversations: {
    async delete(navigations) {
      const context = requireShellMutationContext();
      const request = createDesktopConversationDeleteRequest(
        nextRequestId('desktop-conversation-delete'),
        navigations,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.conversationDelete,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
  },
  tabs: {
    async activateHome() {
      const context = requireShellMutationContext();
      const request = createDesktopTabMutationRequest(
        nextRequestId('desktop-home-activate'),
        'home',
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.homeActivate,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    async activate(tabId) {
      const context = requireShellMutationContext();
      const request = createDesktopTabMutationRequest(
        nextRequestId('desktop-tab-activate'),
        tabId,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.tabActivate,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    async close(tabId) {
      const context = requireShellMutationContext();
      const request = createDesktopTabMutationRequest(
        nextRequestId('desktop-tab-close'),
        tabId,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(DESKTOP_SHELL_CHANNELS.tabClose, request);
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
  },
  workbench: {
    async update(workbenchInstanceId, workbench) {
      const context = requireShellMutationContext();
      const request = createDesktopWorkbenchMutationRequest(
        nextRequestId('desktop-workbench-update'),
        context.rendererSessionId,
        workbenchInstanceId,
        workbench,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.workbenchUpdate,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
  },
  applicationSidebar: {
    async update(windowId, visible, width) {
      const context = requireShellMutationContext();
      const request = createDesktopApplicationSidebarMutationRequest({
        requestId: nextRequestId('desktop-application-sidebar-update'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        visible,
        width,
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.applicationSidebarUpdate,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
  },
  scenes: {
    async transition(windowId, intent, sceneId) {
      const context = requireShellMutationContext();
      const request = createDesktopSceneTransitionRequest({
        requestId: nextRequestId('desktop-scene-transition'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        sceneId,
        intent,
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.sceneTransition,
        request,
      );
      const result = parseDesktopSceneTransitionResult(response);
      if (result.requestId !== request.requestId) {
        throw new Error('Desktop Scene transition response request identity does not match.');
      }
      return result;
    },
  },
};

ipcRenderer.on(
  DESKTOP_APPLICATION_SETTINGS_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseDesktopApplicationSettingsProjectionEvent(value);
    const current = currentSettingsProjection;
    if (current && event.sequence !== current.eventSequence + 1) {
      throw new DesktopApplicationSettingsContractError(
        'desktop-application-settings-event-sequence',
        `Desktop settings event sequence ${event.sequence} does not follow ${current.eventSequence}.`,
      );
    }
    currentSettingsProjection = event.projection;
    for (const listener of settingsListeners) listener(event);
  },
);

ipcRenderer.on(
  DESKTOP_AGENT_CHANNELS.messageEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseDesktopAgentEvent(value);
    const result = agentEventCursors.advance(event.connection, event.sequence);
    if (result.kind === 'foreign') {
      const eventKind = 'status' in event ? event.status : `message:${event.message.type}`;
      throw new DesktopAgentContractError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent rejected ${eventKind} event ${event.sequence} for foreign connection '${event.connection.connectionId}'.`,
      );
    }
    if (result.kind === 'sequence-mismatch') {
      emitAgentMessage(result.connection, {
        type: 'globalError',
        message: `Desktop Agent event sequence ${result.receivedSequence} does not follow ${result.expectedSequence - 1}.`,
      });
      return;
    }
    if ('status' in event) {
      agentEventCursors.unregister(result.connection);
      return;
    }
    emitAgentMessage(result.connection, event.message);
  },
);

ipcRenderer.on(
  DESKTOP_CUT_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseCutHostRuntimeProjectionEvent(value);
    const key = desktopCutIdentityKey(event.snapshot.identity);
    const identity = currentCutIdentities.get(key);
    if (!identity || !isSameCutHostIdentity(event.snapshot.identity, identity)) {
      return;
    }
    const sequence = currentCutEventSequences.get(key) ?? 0;
    if (event.sequence !== sequence + 1) {
      return;
    }
    currentCutEventSequences.set(key, event.sequence);
    for (const entry of cutListeners) {
      if (isSameCutHostIdentity(entry.identity, identity)) entry.listener(event);
    }
  },
);

ipcRenderer.on(
  CHARACTER_ROOM_WORKBENCH_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseCharacterRoomWorkbenchProjectionEvent(value);
    if (event.requestId !== currentCharacterRoomSnapshotRequestId) return;
    if (event.projection.roomRunId !== currentCharacterRoomRunId) return;
    if (event.sequence !== currentCharacterRoomEventSequence + 1) return;
    currentCharacterRoomEventSequence = event.sequence;
    if (characterRoomSnapshotPending) pendingCharacterRoomEvents.push(event);
    else publishCharacterRoomEvent(event);
  },
);

function publishCharacterRoomEvent(event: CharacterRoomWorkbenchProjectionEvent): void {
  for (const subscription of characterRoomWorkbenchListeners) {
    if (subscription.roomRunId === event.projection.roomRunId) subscription.listener(event);
  }
}

ipcRenderer.on(
  DESKTOP_RESOURCE_BROWSER_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseResourceBrowserProjectionEvent(value);
    const identity = currentResourceIdentity;
    if (!identity || !isSameResourceBrowserIdentity(event.projection.identity, identity)) {
      return;
    }
    if (event.sequence !== currentResourceEventSequence + 1) {
      return;
    }
    currentResourceEventSequence = event.sequence;
    for (const listener of resourceListeners) listener(event);
  },
);

ipcRenderer.on(
  DESKTOP_PROJECT_PORTABILITY_CHANNELS.progressEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseDesktopProjectPortabilityProgressEvent(value);
    const identity = currentProjectPortabilityIdentity;
    if (!identity || !isSameDesktopProjectPortabilityIdentity(event.identity, identity)) {
      return;
    }
    const currentSequence = projectPortabilityEventSequences.get(event.progress.snapshotId) ?? 0;
    if (event.sequence !== currentSequence + 1) return;
    projectPortabilityEventSequences.set(event.progress.snapshotId, event.sequence);
    for (const listener of projectPortabilityListeners) listener(event);
  },
);

ipcRenderer.on(
  TEXT_EDITOR_HOST_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event = parseTextEditorProjectionEvent(value);
    const key = textEditorIdentityKey(event.identity);
    const identity = currentTextEditorIdentities.get(key);
    if (!identity || !sameTextEditorRuntimeIdentity(event.identity, identity)) return;
    const currentSequence = currentTextEditorEventSequences.get(key);
    if (currentSequence !== undefined && event.sequence <= currentSequence) return;
    currentTextEditorEventSequences.set(key, event.sequence);
    for (const entry of textEditorListeners) {
      if (sameTextEditorRuntimeIdentity(entry.identity, identity)) entry.listener(event);
    }
  },
);

ipcRenderer.on(
  DESKTOP_CANVAS_CHANNELS.projectionEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const event: CanvasHostProjectionEvent = parseCanvasHostProjectionEvent(value);
    const key = canvasIdentityKey(event.snapshot.identity);
    const identity = currentCanvasIdentities.get(key);
    if (!identity || !isSameCanvasHostIdentity(event.snapshot.identity, identity)) {
      return;
    }
    const sequence = currentCanvasEventSequences.get(key) ?? 0;
    if (event.sequence !== sequence + 1) {
      return;
    }
    currentCanvasEventSequences.set(key, event.sequence);
    for (const entry of canvasListeners) {
      if (isSameCanvasHostIdentity(entry.identity, identity)) entry.listener(event);
    }
  },
);

contextBridge.exposeInMainWorld('openNekoDesktop', bridge);

function textEditorIdentityKey(identity: TextEditorRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    identity.viewInstanceId,
    identity.documentId,
    identity.sessionId,
  ].join(':');
}

function nextRequestId(prefix: string): string {
  requestSequence += 1;
  return `${prefix}-${Date.now()}-${requestSequence}`;
}

function rememberShellProjection<
  T extends {
    readonly rendererSessionId: string;
  },
>(projection: T): T {
  latestShellProjection = projectDesktopShellMutationContext(latestShellProjection, projection);
  return projection;
}

function requireShellMutationContext(): {
  readonly rendererSessionId: string;
} {
  if (!latestShellProjection) {
    throw new Error('Desktop Shell mutation requires an authoritative snapshot.');
  }
  return latestShellProjection;
}

function emitAgentMessage(
  connection: DesktopAgentConnectionIdentity,
  message: AgentHostToWebviewMessage,
): void {
  for (const subscription of agentListeners) {
    if (isSameDesktopAgentEventConnection(subscription.connection, connection)) {
      subscription.listener(message);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireCurrentResourceIdentity(identity: ResourceBrowserIdentity): void {
  const current = currentResourceIdentity;
  if (!current || !isSameResourceBrowserIdentity(identity, current)) {
    throw new Error('Desktop Resource Browser request requires a current owner-bound snapshot.');
  }
}

function requireProjectPortabilityResultIdentity(
  expectedIdentity: DesktopProjectPortabilityIdentity,
  actualIdentity: DesktopProjectPortabilityIdentity,
  expectedRequestId: string,
  actualRequestId: string,
): void {
  if (
    expectedRequestId !== actualRequestId ||
    !isSameDesktopProjectPortabilityIdentity(expectedIdentity, actualIdentity)
  ) {
    throw new Error('Desktop project portability result identity does not match.');
  }
}

function canvasIdentityKey(identity: CanvasHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewInstanceId),
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
  ].join(':');
}

function previewIdentityKey(identity: PreviewRuntimeIdentity): string {
  return [identity.windowId, identity.sessionId, identity.rendererSessionId].join(':');
}

function isSamePreviewIdentity(
  left: PreviewRuntimeIdentity,
  right: PreviewRuntimeIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewInstanceId === right.viewInstanceId &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.rendererSessionId === right.rendererSessionId
  );
}
