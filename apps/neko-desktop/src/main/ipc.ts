import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { DESKTOP_AGENT_CHANNELS } from '../shared/agent-contract';
import { DESKTOP_AGENT_AUTOMATION_CHANNEL } from '../shared/agent-automation-contract';
import { DESKTOP_BRIDGE_CHANNELS } from '../shared/bridge-contract';
import { DESKTOP_SHELL_CHANNELS } from '@neko/host/desktop-shell-contract';
import { DESKTOP_RESOURCE_BROWSER_CHANNELS } from '../shared/resource-browser-bridge-contract';
import { DESKTOP_PREVIEW_CHANNELS } from '../shared/preview-bridge-contract';
import { TEXT_EDITOR_HOST_CHANNELS } from '@neko/text-editor-domain';
import { DESKTOP_CANVAS_CHANNELS } from '../shared/canvas-bridge-contract';
import { DESKTOP_CUT_CHANNELS } from '../shared/cut-bridge-contract';
import { DESKTOP_APPLICATION_SETTINGS_CHANNELS } from '@neko/host/application-settings';
import { DESKTOP_PROJECT_PORTABILITY_CHANNELS } from '@neko/assets-domain/contracts';
import { ASSET_CENTER_HOST_CHANNEL } from '@neko/assets-domain/asset-center/host-contract';
import { AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL } from '@neko/agent-contracts/extension-management-host';
import { AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL } from '@neko/automation-contracts/local-runtime-management';
import { AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL } from '@neko/automation-contracts/permission-management';
import { DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS } from '../shared/automation-target-selection-contract';
import { DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS } from '../shared/automation-session-control-contract';
import { AGENT_LAUNCH_HOST_CHANNEL } from '@neko/agent-contracts/agent-launch-host';
import { ASSISTANT_RESOURCE_HOST_CHANNEL } from '@neko/agent-contracts/assistant-resource-host';
import { DESKTOP_WORKSPACE_GRANT_CHANNEL } from '@neko/host/desktop-workspace-grant-contract';
import {
  CHARACTER_FOUNDATION_HOST_CHANNEL,
  CHARACTER_AUTHORING_HOST_CHANNEL,
  CHARACTER_PORTABLE_HOST_CHANNELS,
  parseCharacterPortableHostRequest,
  CHARACTER_AVATAR_HOST_CHANNEL,
  CHARACTER_ROOM_WORKBENCH_CHANNELS,
} from '@neko/chara/contracts';
import { WORLD_AUTHORING_HOST_CHANNEL, WORLD_FOUNDATION_HOST_CHANNEL } from '@neko/world/contracts';
import {
  PROJECT_AUTHORING_HOST_CHANNEL,
  PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
} from '@neko/project/contracts';
import type { DesktopAppHost } from './app-host';

export function registerDesktopIpc(
  appHost: DesktopAppHost,
  options: {
    readonly selectContentWorkspace: (event: IpcMainInvokeEvent) => Promise<string | undefined>;
    readonly selectWorkspaceGrant: (
      event: IpcMainInvokeEvent,
    ) => Promise<{ readonly label: string; readonly hostResource: string } | undefined>;
    readonly saveCharacterPackage: (
      event: IpcMainInvokeEvent,
      produce: () => Promise<Uint8Array>,
    ) => Promise<boolean>;
    readonly readCharacterPackage: (event: IpcMainInvokeEvent) => Promise<Uint8Array | undefined>;
  },
): () => void {
  ipcMain.handle(CHARACTER_FOUNDATION_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeCharacterFoundationRequest(requireSender(event), payload),
  );
  ipcMain.handle(CHARACTER_AUTHORING_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeCharacterAuthoringRequest(requireSender(event), payload),
  );
  ipcMain.handle(
    CHARACTER_PORTABLE_HOST_CHANNELS.exportScope,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.getCharacterPortableExportScope(requireSender(event), payload),
  );
  ipcMain.handle(
    CHARACTER_PORTABLE_HOST_CHANNELS.exportPackage,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      const request = parseCharacterPortableHostRequest(payload);
      if (request.operation !== 'export') {
        throw new Error('Character portable export channel requires an export request.');
      }
      let result: Awaited<ReturnType<typeof appHost.createCharacterPortableExport>> | undefined;
      const saved = await options.saveCharacterPackage(event, async () => {
        result = await appHost.createCharacterPortableExport(requireSender(event), request);
        return result.archiveBytes;
      });
      return saved
        ? requireCharacterPortableExportResult(result).result
        : { requestId: request.requestId, status: 'cancelled' as const };
    },
  );
  ipcMain.handle(
    CHARACTER_PORTABLE_HOST_CHANNELS.previewImport,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      const request = parseCharacterPortableHostRequest(payload);
      if (request.operation !== 'import-preview') {
        throw new Error('Character portable import preview channel requires a preview request.');
      }
      const archiveBytes = await options.readCharacterPackage(event);
      return archiveBytes
        ? appHost.previewCharacterPortableImport(requireSender(event), request, archiveBytes)
        : { requestId: request.requestId, status: 'cancelled' as const };
    },
  );
  ipcMain.handle(
    CHARACTER_PORTABLE_HOST_CHANNELS.commitImport,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.commitCharacterPortableImport(requireSender(event), payload),
  );
  ipcMain.handle(
    CHARACTER_PORTABLE_HOST_CHANNELS.cancelImport,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.cancelCharacterPortableImport(requireSender(event), payload),
  );
  ipcMain.handle(WORLD_FOUNDATION_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeWorldFoundationRequest(requireSender(event), payload),
  );
  ipcMain.handle(WORLD_AUTHORING_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeWorldAuthoringRequest(requireSender(event), payload),
  );
  ipcMain.handle(PROJECT_AUTHORING_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.getProjectAuthoringNavigation(requireSender(event), payload),
  );
  ipcMain.handle(
    PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeProjectLocalAuthoringRequest(requireSender(event), payload),
  );
  ipcMain.handle(CHARACTER_AVATAR_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeCharacterAvatarRequest(requireSender(event), payload),
  );
  ipcMain.handle(
    CHARACTER_ROOM_WORKBENCH_CHANNELS.snapshotGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.getCharacterRoomWorkbenchSnapshot(requireSender(event), payload, (roomEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(CHARACTER_ROOM_WORKBENCH_CHANNELS.projectionEvent, roomEvent);
        }
      }),
  );
  ipcMain.handle(
    DESKTOP_APPLICATION_SETTINGS_CHANNELS.snapshotGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.createApplicationSettingsSnapshot(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_APPLICATION_SETTINGS_CHANNELS.update,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.updateApplicationSettings(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_APPLICATION_SETTINGS_CHANNELS.agentAdvancedOpen,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.openAgentAdvancedSettings(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_AGENT_CHANNELS.bootstrapGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.createAgentBootstrap(requireSender(event), payload, (agentEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(DESKTOP_AGENT_CHANNELS.messageEvent, agentEvent);
        }
      }),
  );
  ipcMain.handle(
    DESKTOP_AGENT_CHANNELS.connectionDetach,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.detachAgentConnection(requireSender(event), payload),
  );
  ipcMain.handle(AGENT_LAUNCH_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeAgentLaunchRequest(requireSender(event), payload),
  );
  ipcMain.handle(ASSISTANT_RESOURCE_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeAssistantResourceRequest(requireSender(event), payload),
  );
  ipcMain.handle(DESKTOP_WORKSPACE_GRANT_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.resolveWorkspaceTarget(requireSender(event), payload, () =>
      options.selectWorkspaceGrant(event),
    ),
  );
  ipcMain.handle(DESKTOP_CUT_CHANNELS.snapshotGet, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.getCutSnapshot(requireSender(event), payload, (cutEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(DESKTOP_CUT_CHANNELS.projectionEvent, cutEvent);
      }
    }),
  );
  ipcMain.handle(
    DESKTOP_CUT_CHANNELS.requestExecute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeCutRequest(requireSender(event), payload),
  );
  ipcMain.handle(DESKTOP_CUT_CHANNELS.draftCreate, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.createCutDraft(requireSender(event), payload),
  );
  ipcMain.handle(DESKTOP_CUT_CHANNELS.viewClose, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.closeCutView(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.getResourceBrowserSnapshot(requireSender(event), payload, (resourceEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(DESKTOP_RESOURCE_BROWSER_CHANNELS.projectionEvent, resourceEvent);
        }
      }),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.children,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.readResourceBrowserChildren(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.search,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.searchResourceBrowser(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.thumbnailResolve,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resolveResourceBrowserThumbnail(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewResolve,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resolveResourceBrowserQuickPreview(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewRelease,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.releaseResourceBrowserQuickPreview(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryPlan,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.planResourceBrowserRecovery(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryApply,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.applyResourceBrowserRecovery(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryCancel,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.cancelResourceBrowserRecovery(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_RESOURCE_BROWSER_CHANNELS.execute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeResourceBrowser(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_PROJECT_PORTABILITY_CHANNELS.inspect,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.inspectProjectPortability(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_PROJECT_PORTABILITY_CHANNELS.plan,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.planProjectPortability(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_PROJECT_PORTABILITY_CHANNELS.resume,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resumeProjectPortability(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_PROJECT_PORTABILITY_CHANNELS.execute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeProjectPortability(requireSender(event), payload, (progressEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(DESKTOP_PROJECT_PORTABILITY_CHANNELS.progressEvent, progressEvent);
        }
      }),
  );
  ipcMain.handle(
    DESKTOP_PROJECT_PORTABILITY_CHANNELS.cancel,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.cancelProjectPortability(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_PREVIEW_CHANNELS.snapshotGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.getPreviewSnapshot(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_PREVIEW_CHANNELS.requestExecute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executePreviewRequest(requireSender(event), payload),
  );
  ipcMain.handle(TEXT_EDITOR_HOST_CHANNELS.execute, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeTextEditorRequest(requireSender(event), payload, (textEditorEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(TEXT_EDITOR_HOST_CHANNELS.projectionEvent, textEditorEvent);
      }
    }),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.snapshotGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.getCanvasSnapshot(requireSender(event), payload, (canvasEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(DESKTOP_CANVAS_CHANNELS.projectionEvent, canvasEvent);
        }
      }),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.materialActionsResolve,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resolveCanvasMaterialActions(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.textFilePreviewRead,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.readCanvasTextFilePreview(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.intentExecute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeCanvasIntent(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.previewVariantResolve,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resolveCanvasPreviewVariant(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.embeddedPreviewResolve,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resolveCanvasEmbeddedPreview(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.embeddedPreviewRelease,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.releaseCanvasEmbeddedPreview(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.mediaRequestExecute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeCanvasMediaRequest(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_AGENT_CHANNELS.messageSend,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.sendAgentMessage(requireSender(event), payload),
  );
  ipcMain.handle(DESKTOP_AGENT_AUTOMATION_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeAgentAutomation(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      const frameUrl = event.senderFrame?.url;
      if (!frameUrl) {
        throw new Error('Desktop bootstrap request has no sender frame URL.');
      }
      return appHost.createBootstrapProjection(
        {
          webContentsId: event.sender.id,
          frameUrl,
        },
        payload,
      );
    },
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.snapshotGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.createShellSnapshot(requireSender(event), payload),
  );
  ipcMain.handle(ASSET_CENTER_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeAssetCenter(requireSender(event), payload),
  );
  ipcMain.handle(
    AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeExtensionManagement(requireSender(event), payload),
  );
  ipcMain.handle(
    AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeAutomationLocalRuntimeManagement(requireSender(event), payload),
  );
  ipcMain.handle(
    AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeAutomationPermissionManagement(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.execute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeAutomationTargetSelection(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.execute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeAutomationSessionControl(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.projectOpenContent,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.openContentProject(requireSender(event), payload, () =>
        options.selectContentWorkspace(event),
      ),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.projectOpenCatalog,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.openCatalogProject(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.projectRemove,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.removeProjects(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.projectConversationDelete,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.deleteProjectConversations(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.conversationDelete,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.deleteHomeConversations(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.projectRequestProfile,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.requestProjectProfile(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.homeActivate,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.activateHome(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.tabActivate,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.activateProjectTab(requireSender(event), payload),
  );
  ipcMain.handle(DESKTOP_SHELL_CHANNELS.tabClose, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.closeProjectTab(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.workbenchUpdate,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.updateWorkbench(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.applicationSidebarUpdate,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.updateApplicationSidebar(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.sceneTransition,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.transitionScene(requireSender(event), payload),
  );
  return () => {
    for (const channel of [
      CHARACTER_FOUNDATION_HOST_CHANNEL,
      CHARACTER_AUTHORING_HOST_CHANNEL,
      ...Object.values(CHARACTER_PORTABLE_HOST_CHANNELS),
      WORLD_FOUNDATION_HOST_CHANNEL,
      WORLD_AUTHORING_HOST_CHANNEL,
      PROJECT_AUTHORING_HOST_CHANNEL,
      PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
      CHARACTER_AVATAR_HOST_CHANNEL,
      DESKTOP_AGENT_CHANNELS.bootstrapGet,
      DESKTOP_AGENT_CHANNELS.connectionDetach,
      AGENT_LAUNCH_HOST_CHANNEL,
      ASSISTANT_RESOURCE_HOST_CHANNEL,
      DESKTOP_WORKSPACE_GRANT_CHANNEL,
      DESKTOP_AGENT_CHANNELS.messageSend,
      DESKTOP_AGENT_AUTOMATION_CHANNEL,
      DESKTOP_APPLICATION_SETTINGS_CHANNELS.snapshotGet,
      DESKTOP_APPLICATION_SETTINGS_CHANNELS.update,
      DESKTOP_APPLICATION_SETTINGS_CHANNELS.agentAdvancedOpen,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.children,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.search,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.thumbnailResolve,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewResolve,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.quickPreviewRelease,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryPlan,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryApply,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryCancel,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.execute,
      DESKTOP_PROJECT_PORTABILITY_CHANNELS.inspect,
      DESKTOP_PROJECT_PORTABILITY_CHANNELS.plan,
      DESKTOP_PROJECT_PORTABILITY_CHANNELS.resume,
      DESKTOP_PROJECT_PORTABILITY_CHANNELS.execute,
      DESKTOP_PROJECT_PORTABILITY_CHANNELS.cancel,
      DESKTOP_PREVIEW_CHANNELS.snapshotGet,
      DESKTOP_PREVIEW_CHANNELS.requestExecute,
      TEXT_EDITOR_HOST_CHANNELS.execute,
      DESKTOP_CANVAS_CHANNELS.snapshotGet,
      DESKTOP_CANVAS_CHANNELS.materialActionsResolve,
      DESKTOP_CANVAS_CHANNELS.textFilePreviewRead,
      DESKTOP_CANVAS_CHANNELS.intentExecute,
      DESKTOP_CANVAS_CHANNELS.previewVariantResolve,
      DESKTOP_CANVAS_CHANNELS.embeddedPreviewResolve,
      DESKTOP_CANVAS_CHANNELS.embeddedPreviewRelease,
      DESKTOP_CANVAS_CHANNELS.mediaRequestExecute,
      DESKTOP_CUT_CHANNELS.snapshotGet,
      DESKTOP_CUT_CHANNELS.requestExecute,
      DESKTOP_CUT_CHANNELS.draftCreate,
      DESKTOP_CUT_CHANNELS.viewClose,
      DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
      DESKTOP_SHELL_CHANNELS.snapshotGet,
      ASSET_CENTER_HOST_CHANNEL,
      AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
      AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL,
      AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL,
      DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.execute,
      DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.execute,
      DESKTOP_SHELL_CHANNELS.projectOpenContent,
      DESKTOP_SHELL_CHANNELS.projectOpenCatalog,
      DESKTOP_SHELL_CHANNELS.projectRemove,
      DESKTOP_SHELL_CHANNELS.projectConversationDelete,
      DESKTOP_SHELL_CHANNELS.conversationDelete,
      DESKTOP_SHELL_CHANNELS.projectRequestProfile,
      DESKTOP_SHELL_CHANNELS.homeActivate,
      DESKTOP_SHELL_CHANNELS.tabActivate,
      DESKTOP_SHELL_CHANNELS.tabClose,
      DESKTOP_SHELL_CHANNELS.workbenchUpdate,
      DESKTOP_SHELL_CHANNELS.applicationSidebarUpdate,
      DESKTOP_SHELL_CHANNELS.sceneTransition,
    ]) {
      ipcMain.removeHandler(channel);
    }
  };
}

function requireSender(event: IpcMainInvokeEvent): {
  readonly webContentsId: number;
  readonly frameUrl: string;
} {
  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) throw new Error('Desktop IPC request has no sender frame URL.');
  return {
    webContentsId: event.sender.id,
    frameUrl,
  };
}

function requireCharacterPortableExportResult<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Character portable destination completed without export bytes.');
  }
  return value;
}
