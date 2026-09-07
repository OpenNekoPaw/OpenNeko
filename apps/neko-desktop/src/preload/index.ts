import { contextBridge, ipcRenderer } from 'electron';
import {
  DSH_PERMISSION_CHANGED_CHANNEL,
  DSH_PERMISSION_HOST_CHANNEL,
  parseDshPermissionChangedEvent,
  parseDshPermissionHostResult,
  type DshPermissionHostResult,
  type OpenNekoDshPermissionBridge,
} from '@neko/agent-contracts/dsh-permission-host';
import {
  DSH_SESSION_CHANGED_CHANNEL,
  DSH_SESSION_HOST_CHANNEL,
  parseDshComposerConfigurationHostResult,
  parseDshComposerMaterializedAssetHostResult,
  parseDshComposerMentionsHostResult,
  parseDshImageAttachmentPreviewHostResult,
  parseDshImageAttachmentPreviewsReleaseHostResult,
  parseDshSessionChangedEvent,
  parseDshSessionHostResult,
  parseDshWrittenFileOpenHostResult,
  type DshSessionHostResult,
  type OpenNekoDshSessionBridge,
} from '@neko/agent-contracts/dsh-session-host';
import {
  DSH_RUNTIME_CHANGED_CHANNEL,
  DSH_RUNTIME_HOST_CHANNEL,
  parseDshRuntimeHostProjection,
  parseDshRuntimeHostResult,
  type OpenNekoDshRuntimeBridge,
} from '@neko/agent-contracts/dsh-runtime-host';
import {
  createDesktopBootstrapRequest,
  DESKTOP_BRIDGE_CHANNELS,
  parseDesktopBootstrapProjection,
  parseDesktopLifecycleEvent,
  type DesktopLifecycleEvent,
  type OpenNekoDesktopBridge,
} from '../shared/bridge-contract';
import {
  createDesktopConversationArchiveRequest,
  createDesktopConversationDeleteUnavailableRequest,
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
  parseTextEditorClipboardCommandRequest,
  parseTextEditorClipboardCommandResult,
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
  parseCanvasHostRuntimeIdentity,
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
  parseDesktopCanvasPreviewResourceReleaseRequest,
  parseDesktopCanvasWorkspaceIndexChangedEvent,
  parseDesktopCanvasWorkspaceIndexCatalogRequest,
  parseDesktopCanvasWorkspaceIndexCatalogResult,
  parseDesktopCanvasWorkspaceDocumentOpenRequest,
  parseDesktopCanvasWorkspaceDocumentOpenResult,
  parseDesktopCanvasPreviewResourceRequest,
  parseDesktopCanvasPreviewResourceResult,
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
  createDesktopAiModelSettingsRequest,
  DESKTOP_AI_MODEL_SETTINGS_CHANNEL,
  parseDesktopAiModelSettingsResponse,
  type OpenNekoDesktopAiModelSettingsBridge,
} from '@neko/host/ai-model-settings';
import {
  createDesktopStorageSettingsRequest,
  DESKTOP_STORAGE_SETTINGS_CHANNEL,
  parseDesktopStorageSettingsResponse,
  type OpenNekoDesktopStorageSettingsBridge,
} from '@neko/host/desktop-storage-settings-contract';
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
  DESKTOP_WORKSPACE_GRANT_CHANNEL,
  createDesktopWorkspaceDirectoryTargetRequest,
  createDesktopContentProjectTargetRequest,
  createDesktopWorkspaceProjectTargetRequest,
  parseDesktopWorkspaceGrantTargetResult,
  type OpenNekoDesktopWorkspaceGrantBridge,
} from '@neko/host/desktop-workspace-grant-contract';
import {
  PROJECT_AUTHORING_HOST_CHANNEL,
  PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
  createProjectAuthoringCatalogHostRequest,
  createProjectCreativeWorkspaceHostRequest,
  createProjectCreativeWorkspaceMutationHostRequest,
  createProjectCreativeWorkspaceObjectMutationHostRequest,
  createProjectContentHostRequest,
  createProjectLocalAuthoringHostRequest,
  createProjectAuthoringNavigationHostRequest,
  parseProjectAuthoringCatalogHostResult,
  parseProjectCreativeWorkspaceHostResult,
  parseProjectContentHostResult,
  parseProjectLocalAuthoringHostResult,
  parseProjectAuthoringNavigationHostResult,
  type OpenNekoDesktopProjectAuthoringBridge,
  type OpenNekoDesktopProjectLocalAuthoringBridge,
} from '@neko/project-domain/contracts';
import {
  AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
  parseAgentExtensionManagementHostRequest,
  parseAgentExtensionManagementHostResult,
  type OpenNekoAgentExtensionManagementBridge,
} from '@neko/agent-contracts/extension-management-host';
import {
  PROFESSIONAL_APPLICATION_HOST_CHANNEL,
  parseProfessionalApplicationHostRequest,
  parseProfessionalApplicationHostResult,
  type OpenNekoProfessionalApplicationBridge,
} from '@neko/professional-apps-contracts/host';
import {
  CHARACTER_FOUNDATION_HOST_CHANNEL,
  CHARACTER_AUTHORING_HOST_CHANNEL,
  CHARACTER_AVATAR_HOST_CHANNEL,
  CHARACTER_PORTABLE_HOST_CHANNELS,
  CHARACTER_ROOM_WORKBENCH_CHANNELS,
  createCharacterFoundationCommandHostRequest,
  createCharacterFoundationHostRequest,
  createCharacterAuthoringCommandRequest,
  createCharacterAuthoringSnapshotRequest,
  createCharacterPortableHostRequest,
  createCharacterAvatarOpenRequest,
  createCharacterAvatarReleaseRequest,
  createCharacterRoomWorkbenchSnapshotRequest,
  parseCharacterFoundationHostResult,
  parseCharacterConversationLaunchCatalogHostResult,
  parseCharacterAuthoringHostResult,
  parseCharacterPortableHostResult,
  parseCharacterAvatarHostResult,
  parseCharacterRoomWorkbenchProjectionEvent,
  parseCharacterRoomWorkbenchSnapshotResult,
  type CharacterRoomWorkbenchProjectionEvent,
  type OpenNekoDesktopCharacterBridge,
  type OpenNekoDesktopCharacterAuthoringBridge,
  type OpenNekoDesktopCharacterPortableBridge,
  type OpenNekoDesktopCharacterAvatarBridge,
  type OpenNekoDesktopCharacterRoomWorkbenchBridge,
} from '@neko/chara-domain/contracts';
import {
  WORLD_AUTHORING_HOST_CHANNEL,
  WORLD_MANAGEMENT_HOST_CHANNEL,
  WORLD_PORTABLE_HOST_CHANNELS,
  WORLD_RUNTIME_HOST_CHANNEL,
  createWorldRuntimeActionRequest,
  createWorldRuntimeLaunchRequest,
  createWorldRuntimeSnapshotRequest,
  createWorldAuthoringCommandRequest,
  createWorldAuthoringSnapshotRequest,
  createWorldManagementCatalogRequest,
  createWorldManagementDetailRequest,
  createWorldPortableHostRequest,
  parseWorldAuthoringHostResult,
  parseWorldManagementHostResult,
  parseWorldPortableHostResult,
  parseWorldRuntimeHostResult,
  type OpenNekoDesktopWorldManagementBridge,
  type OpenNekoDesktopWorldPortableBridge,
  type OpenNekoDesktopWorldAuthoringBridge,
  type OpenNekoDesktopWorldRuntimeBridge,
} from '@neko/world-domain/contracts';

let requestSequence = 0;
let desktopWindowContext:
  | {
      readonly applicationInstanceId: string;
      readonly windowId: string;
      readonly rendererSessionId: string;
    }
  | undefined;
let desktopLifecycleProjectionStarted = false;
let latestShellProjection: DesktopShellMutationContext | undefined;
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
const currentCanvasSnapshotRequests = new Map<string, object>();
const canvasListeners = new Set<{
  readonly identity: CanvasHostRuntimeIdentity;
  readonly listener: Parameters<OpenNekoDesktopCanvasBridge['canvas']['subscribe']>[1];
}>();
const canvasWorkspaceIndexListeners = new Set<
  Parameters<OpenNekoDesktopCanvasBridge['canvas']['subscribeWorkspaceIndex']>[0]
>();
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
const dshPermissionListeners = new Set<
  Parameters<OpenNekoDshPermissionBridge['dshPermissions']['subscribe']>[0]
>();
const dshSessionListeners = new Set<
  Parameters<OpenNekoDshSessionBridge['dshSessions']['subscribe']>[0]
>();
const dshRuntimeListeners = new Set<
  Parameters<OpenNekoDshRuntimeBridge['dshRuntime']['subscribe']>[0]
>();
const desktopLifecycleListeners = new Set<
  Parameters<OpenNekoDesktopBridge['lifecycle']['subscribe']>[0]
>();

const bridge: OpenNekoDesktopBridge &
  OpenNekoDshPermissionBridge &
  OpenNekoDshRuntimeBridge &
  OpenNekoDshSessionBridge &
  OpenNekoDesktopShellBridge &
  OpenNekoDesktopResourceBrowserBridge &
  OpenNekoDesktopPreviewBridge &
  OpenNekoDesktopTextEditorBridge &
  OpenNekoDesktopCanvasBridge &
  OpenNekoDesktopCutBridge &
  OpenNekoAssetCenterBridge &
  OpenNekoDesktopWorkspaceGrantBridge &
  OpenNekoAgentExtensionManagementBridge &
  OpenNekoProfessionalApplicationBridge &
  OpenNekoDesktopApplicationSettingsBridge &
  OpenNekoDesktopAiModelSettingsBridge &
  OpenNekoDesktopStorageSettingsBridge &
  OpenNekoDesktopProjectPortabilityBridge &
  OpenNekoDesktopProjectAuthoringBridge &
  OpenNekoDesktopProjectLocalAuthoringBridge &
  OpenNekoDesktopCharacterBridge &
  OpenNekoDesktopCharacterAuthoringBridge &
  OpenNekoDesktopCharacterPortableBridge &
  OpenNekoDesktopCharacterAvatarBridge &
  OpenNekoDesktopCharacterRoomWorkbenchBridge &
  OpenNekoDesktopWorldManagementBridge &
  OpenNekoDesktopWorldAuthoringBridge &
  OpenNekoDesktopWorldPortableBridge &
  OpenNekoDesktopWorldRuntimeBridge = {
  dshPermissions: {
    async list(conversationId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-permission-list'),
        operation: 'list' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_PERMISSION_HOST_CHANNEL, request);
      return requireDshPermissionConversation(
        parseDshPermissionHostResult(response, request.requestId),
        conversationId,
      ).pending;
    },
    async decide(identity, optionId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-permission-decide'),
        operation: 'decide' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        ...identity,
        optionId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_PERMISSION_HOST_CHANNEL, request);
      return requireDshPermissionConversation(
        parseDshPermissionHostResult(response, request.requestId),
        identity.conversationId,
        identity.dshSessionId,
      ).pending;
    },
    async cancel(identity) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-permission-cancel'),
        operation: 'cancel' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        ...identity,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_PERMISSION_HOST_CHANNEL, request);
      return requireDshPermissionConversation(
        parseDshPermissionHostResult(response, request.requestId),
        identity.conversationId,
        identity.dshSessionId,
      ).pending;
    },
    subscribe(listener) {
      dshPermissionListeners.add(listener);
      return () => dshPermissionListeners.delete(listener);
    },
  },
  dshSessions: {
    async create(workbenchInstanceId, agentSurfaceId, permissionPresetId, target, initialInput) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-create'),
        operation: 'create' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
        permissionPresetId,
        target,
        initialInput,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshSessionHostResult(response, request.requestId).projection;
    },
    async getSnapshot(conversationId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-snapshot'),
        operation: 'snapshot' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return requireDshSessionConversation(
        parseDshSessionHostResult(response, request.requestId),
        conversationId,
      ).projection;
    },
    async submit(conversationId, input) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-submit'),
        operation: 'submit' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
        input,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return requireDshSessionConversation(
        parseDshSessionHostResult(response, request.requestId),
        conversationId,
      );
    },
    async cancel(conversationId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-cancel'),
        operation: 'cancel' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return requireDshSessionConversation(
        parseDshSessionHostResult(response, request.requestId),
        conversationId,
      ).projection;
    },
    async branch(conversationId, messageId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-branch'),
        operation: 'branch' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
        messageId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      const result = parseDshSessionHostResult(response, request.requestId);
      if (result.projection.conversationId === conversationId) {
        throw new Error('DSH Session branch returned the source Conversation.');
      }
      return result.projection;
    },
    async sendInboxMessageNow(conversationId, messageId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-inbox-send-now'),
        operation: 'inbox-send-now' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
        messageId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return requireDshSessionConversation(
        parseDshSessionHostResult(response, request.requestId),
        conversationId,
      ).projection;
    },
    async removeInboxMessage(conversationId, messageId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-inbox-remove'),
        operation: 'inbox-remove' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
        messageId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return requireDshSessionConversation(
        parseDshSessionHostResult(response, request.requestId),
        conversationId,
      ).projection;
    },
    async getImageAttachmentPreview(conversationId, attachmentId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-image-preview'),
        operation: 'image-preview' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
        attachmentId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshImageAttachmentPreviewHostResult(response, request.requestId).preview;
    },
    async releaseImageAttachmentPreviews(conversationId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-image-previews-release'),
        operation: 'image-previews-release' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      parseDshImageAttachmentPreviewsReleaseHostResult(response, request.requestId);
    },
    async openWrittenFile(conversationId, toolCallId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-session-written-file-open'),
        operation: 'written-file-open' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        conversationId,
        toolCallId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      parseDshWrittenFileOpenHostResult(response, request.requestId);
    },
    async getComposerConfiguration(workbenchInstanceId, agentSurfaceId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-composer-snapshot'),
        operation: 'composer-snapshot' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshComposerConfigurationHostResult(response, request.requestId).configuration;
    },
    async selectComposerCanvas(workbenchInstanceId, agentSurfaceId, conversationId, canvasId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-composer-canvas'),
        operation: 'composer-canvas' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
        conversationId,
        canvasId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshComposerConfigurationHostResult(response, request.requestId).configuration;
    },
    async searchComposerMentions(workbenchInstanceId, agentSurfaceId, filter) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-composer-mentions'),
        operation: 'composer-mentions' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
        filter,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshComposerMentionsHostResult(response, request.requestId).mentions;
    },
    async materializeComposerAsset(workbenchInstanceId, agentSurfaceId, assetId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-composer-materialize-asset'),
        operation: 'composer-materialize-asset' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
        assetId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshComposerMaterializedAssetHostResult(response, request.requestId).materialized;
    },
    async selectComposerModel(workbenchInstanceId, agentSurfaceId, modelOptionId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-composer-model'),
        operation: 'composer-model' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
        modelOptionId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshComposerConfigurationHostResult(response, request.requestId).configuration;
    },
    async selectComposerMediaModel(workbenchInstanceId, agentSurfaceId, category, modelOptionId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-composer-media-model'),
        operation: 'composer-media-model' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
        category,
        modelOptionId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshComposerConfigurationHostResult(response, request.requestId).configuration;
    },
    async selectComposerPermissionPreset(workbenchInstanceId, agentSurfaceId, permissionPresetId) {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-composer-permission-preset'),
        operation: 'composer-permission-preset' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
        workbenchInstanceId,
        agentSurfaceId,
        permissionPresetId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_SESSION_HOST_CHANNEL, request);
      return parseDshComposerConfigurationHostResult(response, request.requestId).configuration;
    },
    subscribe(listener) {
      dshSessionListeners.add(listener);
      return () => dshSessionListeners.delete(listener);
    },
  },
  dshRuntime: {
    async getStatus() {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-runtime-status'),
        operation: 'status' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_RUNTIME_HOST_CHANNEL, request);
      return parseDshRuntimeHostResult(response, request.requestId).projection;
    },
    async prepareSession() {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-runtime-prepare-session'),
        operation: 'prepare-session' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_RUNTIME_HOST_CHANNEL, request);
      return parseDshRuntimeHostResult(response, request.requestId).projection;
    },
    async restart() {
      const context = requireDesktopWindowContext();
      const request = {
        requestId: nextRequestId('dsh-runtime-restart'),
        operation: 'restart' as const,
        windowId: context.windowId,
        rendererSessionId: context.rendererSessionId,
      };
      const response: unknown = await ipcRenderer.invoke(DSH_RUNTIME_HOST_CHANNEL, request);
      return parseDshRuntimeHostResult(response, request.requestId).projection;
    },
    subscribe(listener) {
      dshRuntimeListeners.add(listener);
      return () => dshRuntimeListeners.delete(listener);
    },
  },
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
  worldRuntime: {
    async launch(windowId, launch) {
      const context = requireShellMutationContext();
      const request = createWorldRuntimeLaunchRequest({
        requestId: nextRequestId('world-runtime-launch'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        launch,
      });
      const response: unknown = await ipcRenderer.invoke(WORLD_RUNTIME_HOST_CHANNEL, request);
      return parseWorldRuntimeHostResult(response, request.requestId).projection;
    },
    async getSnapshot(windowId, binding) {
      const context = requireShellMutationContext();
      const request = createWorldRuntimeSnapshotRequest({
        requestId: nextRequestId('world-runtime-snapshot'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
      });
      const response: unknown = await ipcRenderer.invoke(WORLD_RUNTIME_HOST_CHANNEL, request);
      return parseWorldRuntimeHostResult(response, request.requestId).projection;
    },
    async submitAction(windowId, binding, intent) {
      const context = requireShellMutationContext();
      const request = createWorldRuntimeActionRequest({
        requestId: nextRequestId('world-runtime-action'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
        intent,
      });
      const response: unknown = await ipcRenderer.invoke(WORLD_RUNTIME_HOST_CHANNEL, request);
      return parseWorldRuntimeHostResult(response, request.requestId).projection;
    },
  },
  worldPortable: {
    async exportPackage(windowId, binding, selection) {
      const context = requireShellMutationContext();
      const request = createWorldPortableHostRequest({
        requestId: nextRequestId('world-portable-export'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        operation: 'export',
        binding,
        selection,
      });
      return parseWorldPortableHostResult(
        await ipcRenderer.invoke(WORLD_PORTABLE_HOST_CHANNELS.exportPackage, request),
        request.requestId,
      );
    },
    async importPackage(windowId, target) {
      const context = requireShellMutationContext();
      const request = createWorldPortableHostRequest({
        requestId: nextRequestId('world-portable-import'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        operation: 'import',
        ...(target === undefined ? {} : { target }),
      });
      return parseWorldPortableHostResult(
        await ipcRenderer.invoke(WORLD_PORTABLE_HOST_CHANNELS.importPackage, request),
        request.requestId,
      );
    },
  },
  worldManagement: {
    async getCatalog(query) {
      const request = createWorldManagementCatalogRequest(
        nextRequestId('world-management-catalog'),
        query,
      );
      const response: unknown = await ipcRenderer.invoke(WORLD_MANAGEMENT_HOST_CHANNEL, request);
      const result = parseWorldManagementHostResult(response, request);
      if (result.operation !== 'catalog-get') {
        throw new Error('World management catalog response operation mismatch.');
      }
      return result.catalog;
    },
    async getDetail(worldProjectId) {
      const request = createWorldManagementDetailRequest(
        nextRequestId('world-management-detail'),
        worldProjectId,
      );
      const response: unknown = await ipcRenderer.invoke(WORLD_MANAGEMENT_HOST_CHANNEL, request);
      const result = parseWorldManagementHostResult(response, request);
      if (result.operation !== 'detail-get') {
        throw new Error('World management detail response operation mismatch.');
      }
      return result.detail;
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
  characterPortable: {
    async getExportScope(windowId, binding, characterProjectId) {
      const context = requireShellMutationContext();
      const request = createCharacterPortableHostRequest(
        {
          requestId: nextRequestId('character-portable-export-scope'),
          rendererSessionId: context.rendererSessionId,
          windowId,
        },
        binding,
        { kind: 'export-scope', characterProjectId },
      );
      return parseCharacterPortableHostResult(
        await ipcRenderer.invoke(CHARACTER_PORTABLE_HOST_CHANNELS.exportScope, request),
        request.requestId,
      );
    },
    async exportPackage(windowId, binding, characterProjectId, selection) {
      const context = requireShellMutationContext();
      const request = createCharacterPortableHostRequest(
        {
          requestId: nextRequestId('character-portable-export'),
          rendererSessionId: context.rendererSessionId,
          windowId,
        },
        binding,
        { kind: 'export', characterProjectId, selection },
      );
      const response: unknown = await ipcRenderer.invoke(
        CHARACTER_PORTABLE_HOST_CHANNELS.exportPackage,
        request,
      );
      return parseCharacterPortableHostResult(response, request.requestId);
    },
    async importPackage(windowId, target) {
      const context = requireShellMutationContext();
      const request = createCharacterPortableHostRequest(
        {
          requestId: nextRequestId('character-portable-import'),
          rendererSessionId: context.rendererSessionId,
          windowId,
        },
        undefined,
        { kind: 'import', ...(target === undefined ? {} : { target }) },
      );
      const response: unknown = await ipcRenderer.invoke(
        CHARACTER_PORTABLE_HOST_CHANNELS.importPackage,
        request,
      );
      return parseCharacterPortableHostResult(response, request.requestId);
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
    async getContent(windowId, binding) {
      const context = requireShellMutationContext();
      const request = createProjectContentHostRequest({
        requestId: nextRequestId('project-content'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
      });
      const response: unknown = await ipcRenderer.invoke(PROJECT_AUTHORING_HOST_CHANNEL, request);
      const result = parseProjectContentHostResult(response, request.requestId);
      if (result.workspaceId !== binding.workspaceId || result.projectId !== binding.projectId) {
        throw new Error('Desktop Project Content result identity does not match.');
      }
      return result;
    },
    async getCreativeWorkspace(windowId, binding) {
      const context = requireShellMutationContext();
      const request = createProjectCreativeWorkspaceHostRequest({
        requestId: nextRequestId('project-creative-workspace'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
      });
      const response: unknown = await ipcRenderer.invoke(PROJECT_AUTHORING_HOST_CHANNEL, request);
      return parseProjectCreativeWorkspaceHostResult(response, request.requestId, binding);
    },
    async mutateCreativeWorkspaceReference(windowId, binding, mutation) {
      const context = requireShellMutationContext();
      const request = createProjectCreativeWorkspaceMutationHostRequest({
        requestId: nextRequestId('project-creative-workspace-reference-mutate'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
        mutation,
      });
      const response: unknown = await ipcRenderer.invoke(PROJECT_AUTHORING_HOST_CHANNEL, request);
      return parseProjectCreativeWorkspaceHostResult(response, request.requestId, binding);
    },
    async mutateCreativeWorkspaceObject(windowId, binding, mutation) {
      const context = requireShellMutationContext();
      const request = createProjectCreativeWorkspaceObjectMutationHostRequest({
        requestId: nextRequestId('project-creative-workspace-object-mutate'),
        rendererSessionId: context.rendererSessionId,
        windowId,
        binding,
        mutation,
      });
      const response: unknown = await ipcRenderer.invoke(PROJECT_AUTHORING_HOST_CHANNEL, request);
      return parseProjectCreativeWorkspaceHostResult(response, request.requestId, binding);
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
      const expectedTarget =
        input.kind === 'character-project'
          ? {
              kind: 'character-project' as const,
              characterProjectId: input.characterProjectId,
            }
          : { kind: 'world-project' as const, worldProjectId: input.worldProjectId };
      return parseProjectLocalAuthoringHostResult(
        response,
        request.requestId,
        binding,
        expectedTarget,
      );
    },
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
      desktopWindowContext = {
        applicationInstanceId: projection.application.instanceId,
        ...projection.window,
      };
      startDesktopLifecycleProjection();
      return projection;
    },
  },
  lifecycle: {
    subscribe(listener: (event: DesktopLifecycleEvent) => void): () => void {
      desktopLifecycleListeners.add(listener);
      return () => desktopLifecycleListeners.delete(listener);
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
  aiModelSettings: {
    async get() {
      const request = createDesktopAiModelSettingsRequest({
        requestId: nextRequestId('desktop-ai-model-settings'),
        operation: 'get',
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AI_MODEL_SETTINGS_CHANNEL,
        request,
      );
      return parseDesktopAiModelSettingsResponse(response, request.requestId).projection;
    },
    async saveProvider(provider, apiKey) {
      const request = createDesktopAiModelSettingsRequest({
        requestId: nextRequestId('desktop-ai-provider-save'),
        operation: 'save-provider',
        provider,
        ...(apiKey === undefined ? {} : { apiKey }),
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AI_MODEL_SETTINGS_CHANNEL,
        request,
      );
      return parseDesktopAiModelSettingsResponse(response, request.requestId);
    },
    async saveModel(model) {
      const request = createDesktopAiModelSettingsRequest({
        requestId: nextRequestId('desktop-ai-model-save'),
        operation: 'save-model',
        model,
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AI_MODEL_SETTINGS_CHANNEL,
        request,
      );
      return parseDesktopAiModelSettingsResponse(response, request.requestId);
    },
    async deleteProvider(providerId) {
      const request = createDesktopAiModelSettingsRequest({
        requestId: nextRequestId('desktop-ai-provider-delete'),
        operation: 'delete-provider',
        providerId,
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AI_MODEL_SETTINGS_CHANNEL,
        request,
      );
      return parseDesktopAiModelSettingsResponse(response, request.requestId);
    },
    async deleteModel(modelId) {
      const request = createDesktopAiModelSettingsRequest({
        requestId: nextRequestId('desktop-ai-model-delete'),
        operation: 'delete-model',
        modelId,
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AI_MODEL_SETTINGS_CHANNEL,
        request,
      );
      return parseDesktopAiModelSettingsResponse(response, request.requestId);
    },
    async setDefault(modelType, ref) {
      const request = createDesktopAiModelSettingsRequest({
        requestId: nextRequestId('desktop-ai-model-default'),
        operation: 'set-default',
        modelType,
        ref,
      });
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_AI_MODEL_SETTINGS_CHANNEL,
        request,
      );
      return parseDesktopAiModelSettingsResponse(response, request.requestId);
    },
  },
  storageSettings: {
    async get() {
      const request = createDesktopStorageSettingsRequest({
        requestId: nextRequestId('desktop-storage-settings'),
        operation: 'get',
      });
      const response: unknown = await ipcRenderer.invoke(DESKTOP_STORAGE_SETTINGS_CHANNEL, request);
      return parseDesktopStorageSettingsResponse(response, request.requestId).projection;
    },
    async open(entryId) {
      const request = createDesktopStorageSettingsRequest({
        requestId: nextRequestId('desktop-storage-open'),
        operation: 'open',
        entryId,
      });
      const response: unknown = await ipcRenderer.invoke(DESKTOP_STORAGE_SETTINGS_CHANNEL, request);
      return parseDesktopStorageSettingsResponse(response, request.requestId).projection;
    },
    async selectDefaultWorkspace() {
      const request = createDesktopStorageSettingsRequest({
        requestId: nextRequestId('desktop-storage-default-select'),
        operation: 'select-default-workspace',
      });
      const response: unknown = await ipcRenderer.invoke(DESKTOP_STORAGE_SETTINGS_CHANNEL, request);
      return parseDesktopStorageSettingsResponse(response, request.requestId);
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
  professionalApplications: {
    async execute(input) {
      const request = parseProfessionalApplicationHostRequest(input);
      const response: unknown = await ipcRenderer.invoke(
        PROFESSIONAL_APPLICATION_HOST_CHANNEL,
        request,
      );
      return parseProfessionalApplicationHostResult(response, request);
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
    async executeClipboardCommand(value) {
      const request = parseTextEditorClipboardCommandRequest(value);
      const key = textEditorIdentityKey(request.identity);
      const identity = currentTextEditorIdentities.get(key);
      if (!identity || !sameTextEditorRuntimeIdentity(identity, request.identity)) {
        throw new Error('Desktop Text Editor clipboard command requires a current session.');
      }
      const response: unknown = await ipcRenderer.invoke(
        TEXT_EDITOR_HOST_CHANNELS.clipboardExecute,
        request,
      );
      const result = parseTextEditorClipboardCommandResult(response);
      if (
        result.command !== request.command ||
        !sameTextEditorRuntimeIdentity(result.identity, request.identity)
      ) {
        throw new Error('Desktop Text Editor clipboard result identity does not match.');
      }
      return result;
    },
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
      const identity = parseCanvasHostRuntimeIdentity(value);
      const key = canvasIdentityKey(identity);
      const request = {};
      currentCanvasSnapshotRequests.set(key, request);
      currentCanvasIdentities.set(key, identity);
      currentCanvasEventSequences.set(key, 0);
      try {
        const response: unknown = await ipcRenderer.invoke(
          DESKTOP_CANVAS_CHANNELS.snapshotGet,
          identity,
        );
        const snapshot = parseCanvasHostSnapshot(response);
        if (!isSameCanvasHostIdentity(snapshot.identity, identity)) {
          throw new Error('Desktop Canvas snapshot owner identity does not match.');
        }
        if (currentCanvasSnapshotRequests.get(key) === request) {
          currentCanvasSnapshotRequests.delete(key);
        }
        return snapshot;
      } catch (error) {
        const current = currentCanvasIdentities.get(key);
        if (
          currentCanvasSnapshotRequests.get(key) === request &&
          current &&
          isSameCanvasHostIdentity(current, identity)
        ) {
          currentCanvasSnapshotRequests.delete(key);
          currentCanvasIdentities.delete(key);
          currentCanvasEventSequences.delete(key);
        }
        throw error;
      }
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
    async resolvePreviewResource(value) {
      const request = parseDesktopCanvasPreviewResourceRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error('Desktop Canvas preview resource requires a current owner-bound snapshot.');
      }
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.previewResourceResolve,
        request,
      );
      return parseDesktopCanvasPreviewResourceResult(response, request.requestId);
    },
    async releasePreviewResource(value) {
      const request = parseDesktopCanvasPreviewResourceReleaseRequest(value);
      const identity = currentCanvasIdentities.get(canvasIdentityKey(request.identity));
      if (!identity || !isSameCanvasHostIdentity(request.identity, identity)) {
        throw new Error(
          'Desktop Canvas preview resource release requires a current owner-bound snapshot.',
        );
      }
      await ipcRenderer.invoke(DESKTOP_CANVAS_CHANNELS.previewResourceRelease, request);
    },
    async readWorkspaceIndexCatalog(request) {
      const parsed = parseDesktopCanvasWorkspaceIndexCatalogRequest(request);
      const response = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.workspaceIndexCatalogRead,
        parsed,
      );
      return parseDesktopCanvasWorkspaceIndexCatalogResult(
        response,
        parsed.requestId,
        parsed.workspaceId,
      );
    },
    async openWorkspaceDocument(request) {
      const parsed = parseDesktopCanvasWorkspaceDocumentOpenRequest(request);
      const response = await ipcRenderer.invoke(
        DESKTOP_CANVAS_CHANNELS.workspaceDocumentOpen,
        parsed,
      );
      return parseDesktopCanvasWorkspaceDocumentOpenResult(response, parsed.requestId);
    },
    subscribeWorkspaceIndex(listener) {
      canvasWorkspaceIndexListeners.add(listener);
      return () => canvasWorkspaceIndexListeners.delete(listener);
    },
    subscribe(identity, listener) {
      const entry = { identity: parseCanvasHostRuntimeIdentity(identity), listener };
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
    async archiveConversations(projectIds) {
      const context = requireShellMutationContext();
      const request = createDesktopProjectSelectionRequest(
        nextRequestId('desktop-project-conversation-archive'),
        projectIds,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.projectConversationArchive,
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
    async archive(navigations) {
      const context = requireShellMutationContext();
      const request = createDesktopConversationArchiveRequest(
        nextRequestId('desktop-conversation-archive'),
        navigations,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.conversationArchive,
        request,
      );
      return rememberShellProjection(
        parseDesktopShellResponse(response, request.requestId).projection,
      );
    },
    async deleteUnavailable(navigation) {
      const context = requireShellMutationContext();
      const request = createDesktopConversationDeleteUnavailableRequest(
        nextRequestId('desktop-conversation-delete-unavailable'),
        navigation,
        context.rendererSessionId,
      );
      const response: unknown = await ipcRenderer.invoke(
        DESKTOP_SHELL_CHANNELS.conversationDeleteUnavailable,
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
  DESKTOP_CANVAS_CHANNELS.workspaceIndexChangedEvent,
  (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const changed = parseDesktopCanvasWorkspaceIndexChangedEvent(value);
    for (const listener of canvasWorkspaceIndexListeners) listener(changed);
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
    if (event.sequence <= sequence) {
      return;
    }
    currentCanvasEventSequences.set(key, event.sequence);
    for (const entry of canvasListeners) {
      if (isSameCanvasHostIdentity(entry.identity, identity)) entry.listener(event);
    }
  },
);

ipcRenderer.on(DSH_PERMISSION_CHANGED_CHANNEL, (_event, value: unknown) => {
  const changed = parseDshPermissionChangedEvent(value);
  for (const listener of dshPermissionListeners) listener(changed);
});

ipcRenderer.on(DSH_SESSION_CHANGED_CHANNEL, (_event, value: unknown) => {
  const changed = parseDshSessionChangedEvent(value);
  for (const listener of dshSessionListeners) listener(changed);
});

ipcRenderer.on(DSH_RUNTIME_CHANGED_CHANNEL, (_event, value: unknown) => {
  const projection = parseDshRuntimeHostProjection(value);
  for (const listener of dshRuntimeListeners) listener(projection);
});

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

function requireDesktopWindowContext(): {
  readonly windowId: string;
  readonly rendererSessionId: string;
} {
  if (!desktopWindowContext) {
    throw new Error('DSH permission request requires an authoritative Desktop bootstrap.');
  }
  return desktopWindowContext;
}

function rememberDesktopWindowLifecycle(event: DesktopLifecycleEvent): void {
  const current = desktopWindowContext;
  if (!current) {
    throw new Error('Desktop lifecycle event requires an authoritative Desktop bootstrap.');
  }
  if (
    current.applicationInstanceId !== event.applicationInstanceId ||
    current.windowId !== event.windowId
  ) {
    throw new Error('Desktop lifecycle event does not match the bootstrapped application Window.');
  }
  if (event.type !== 'renderer-loading' && current.rendererSessionId !== event.rendererSessionId) {
    throw new Error('Desktop lifecycle event does not match the active renderer session.');
  }
  desktopWindowContext = {
    ...current,
    rendererSessionId: event.rendererSessionId,
  };
}

function startDesktopLifecycleProjection(): void {
  if (desktopLifecycleProjectionStarted) return;
  desktopLifecycleProjectionStarted = true;
  ipcRenderer.on(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, (_event, value: unknown) => {
    const event = parseDesktopLifecycleEvent(value);
    rememberDesktopWindowLifecycle(event);
    for (const listener of desktopLifecycleListeners) listener(event);
  });
}

function requireDshSessionConversation(
  result: DshSessionHostResult,
  conversationId: string,
): DshSessionHostResult {
  if (result.projection.conversationId !== conversationId) {
    throw new Error('DSH Session result Conversation identity does not match.');
  }
  return result;
}

function requireDshPermissionConversation(
  result: DshPermissionHostResult,
  conversationId: string,
  dshSessionId?: string,
): DshPermissionHostResult {
  if (
    result.conversationId !== conversationId ||
    result.pending.some(
      (permission) =>
        permission.conversationId !== conversationId ||
        (dshSessionId !== undefined && permission.dshSessionId !== dshSessionId),
    )
  ) {
    throw new Error('DSH permission result owner identity does not match.');
  }
  return result;
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
