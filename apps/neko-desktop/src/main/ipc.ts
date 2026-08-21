import { ipcMain, type IpcMainInvokeEvent } from 'electron';
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
import { AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL } from '@neko/automation-contracts/local-runtime-management';
import { AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL } from '@neko/automation-contracts/permission-management';
import { DESKTOP_WORKSPACE_GRANT_CHANNEL } from '@neko/host/desktop-workspace-grant-contract';
import { DSH_PERMISSION_HOST_CHANNEL } from '@neko/agent-contracts/dsh-permission-host';
import {
  CHARACTER_FOUNDATION_HOST_CHANNEL,
  CHARACTER_AUTHORING_HOST_CHANNEL,
  CHARACTER_PORTABLE_HOST_CHANNELS,
  parseCharacterPortableHostRequest,
  CHARACTER_AVATAR_HOST_CHANNEL,
  CHARACTER_ROOM_WORKBENCH_CHANNELS,
} from '@neko/chara/contracts';
import {
  WORLD_AUTHORING_HOST_CHANNEL,
  WORLD_MANAGEMENT_HOST_CHANNEL,
  WORLD_PORTABLE_HOST_CHANNELS,
  WORLD_RUNTIME_HOST_CHANNEL,
  parseWorldPortableHostRequest,
} from '@neko/world/contracts';
import {
  PROJECT_AUTHORING_HOST_CHANNEL,
  PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
} from '@neko/project/contracts';
import type { DesktopAppHost } from './app-host';
import type { DesktopDshPermissionHost } from './desktop-dsh-permission-host';
import { DSH_SESSION_HOST_CHANNEL } from '@neko/agent-contracts/dsh-session-host';
import type { DesktopDshSessionHost } from './desktop-dsh-session-host';
import { DSH_RUNTIME_HOST_CHANNEL } from '@neko/agent-contracts/dsh-runtime-host';
import type { DesktopDshRuntimeHost } from './desktop-dsh-runtime-host';
import { AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL } from '@neko/agent-contracts/extension-management-host';
import type { DesktopDshExtensionManagementHost } from './desktop-dsh-extension-management-host';

export function registerDesktopIpc(
  appHost: DesktopAppHost,
  options: {
    readonly dshPermissions?: DesktopDshPermissionHost;
    readonly dshRuntime?: DesktopDshRuntimeHost;
    readonly dshSessions?: DesktopDshSessionHost;
    readonly dshExtensions?: DesktopDshExtensionManagementHost;
    readonly selectContentWorkspace: (event: IpcMainInvokeEvent) => Promise<string | undefined>;
    readonly selectWorkspaceGrant: (
      event: IpcMainInvokeEvent,
    ) => Promise<{ readonly label: string; readonly hostResource: string } | undefined>;
    readonly saveCharacterPackage: (
      event: IpcMainInvokeEvent,
      produce: () => Promise<Uint8Array>,
    ) => Promise<boolean>;
    readonly readCharacterPackage: (event: IpcMainInvokeEvent) => Promise<Uint8Array | undefined>;
    readonly saveWorldPackage: (
      event: IpcMainInvokeEvent,
      produce: () => Promise<Uint8Array>,
    ) => Promise<boolean>;
    readonly readWorldPackage: (event: IpcMainInvokeEvent) => Promise<Uint8Array | undefined>;
  },
): () => void {
  if (options.dshPermissions) {
    ipcMain.handle(DSH_PERMISSION_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
      options.dshPermissions?.execute(requireSender(event), payload),
    );
  }
  if (options.dshSessions) {
    ipcMain.handle(DSH_SESSION_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
      options.dshSessions?.execute(requireSender(event), payload),
    );
  }
  if (options.dshRuntime) {
    ipcMain.handle(DSH_RUNTIME_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
      options.dshRuntime?.execute(requireSender(event), payload),
    );
  }
  if (options.dshExtensions) {
    ipcMain.handle(
      AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        options.dshExtensions?.execute(requireSender(event), payload),
    );
  }
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
    CHARACTER_PORTABLE_HOST_CHANNELS.importPackage,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      const request = parseCharacterPortableHostRequest(payload);
      if (request.operation !== 'import') {
        throw new Error('Character portable import channel requires an import request.');
      }
      const archiveBytes = await options.readCharacterPackage(event);
      return archiveBytes
        ? appHost.importCharacterPortablePackage(requireSender(event), request, archiveBytes)
        : { requestId: request.requestId, status: 'cancelled' as const };
    },
  );
  ipcMain.handle(WORLD_MANAGEMENT_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeWorldManagementRequest(requireSender(event), payload),
  );
  ipcMain.handle(
    WORLD_PORTABLE_HOST_CHANNELS.exportPackage,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      const request = parseWorldPortableHostRequest(payload);
      if (request.operation !== 'export') {
        throw new Error('World portable export channel requires an export request.');
      }
      let result: Awaited<ReturnType<typeof appHost.createWorldPortableExport>> | undefined;
      const saved = await options.saveWorldPackage(event, async () => {
        result = await appHost.createWorldPortableExport(requireSender(event), request);
        return result.archiveBytes;
      });
      return saved
        ? requireWorldPortableExportResult(result).result
        : { requestId: request.requestId, status: 'cancelled' as const };
    },
  );
  ipcMain.handle(
    WORLD_PORTABLE_HOST_CHANNELS.importPackage,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      const request = parseWorldPortableHostRequest(payload);
      if (request.operation !== 'import') {
        throw new Error('World portable import channel requires an import request.');
      }
      const archiveBytes = await options.readWorldPackage(event);
      return archiveBytes
        ? appHost.importWorldPortablePackage(requireSender(event), request, archiveBytes)
        : { requestId: request.requestId, status: 'cancelled' as const };
    },
  );
  ipcMain.handle(WORLD_AUTHORING_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeWorldAuthoringRequest(requireSender(event), payload),
  );
  ipcMain.handle(WORLD_RUNTIME_HOST_CHANNEL, (event: IpcMainInvokeEvent, payload: unknown) =>
    appHost.executeWorldRuntimeRequest(requireSender(event), payload),
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
    DESKTOP_CANVAS_CHANNELS.previewResourceResolve,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resolveCanvasPreviewResource(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.previewResourceRelease,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.releaseCanvasPreviewResource(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.workspaceIndexCatalogRead,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.readCanvasWorkspaceIndexCatalog(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_CANVAS_CHANNELS.workspaceDocumentOpen,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.openCanvasWorkspaceDocument(requireSender(event), payload),
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
    DESKTOP_SHELL_CHANNELS.projectConversationArchive,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.archiveProjectConversations(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.conversationArchive,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.archiveConversations(requireSender(event), payload),
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
      WORLD_MANAGEMENT_HOST_CHANNEL,
      ...Object.values(WORLD_PORTABLE_HOST_CHANNELS),
      WORLD_AUTHORING_HOST_CHANNEL,
      WORLD_RUNTIME_HOST_CHANNEL,
      PROJECT_AUTHORING_HOST_CHANNEL,
      PROJECT_LOCAL_AUTHORING_HOST_CHANNEL,
      CHARACTER_AVATAR_HOST_CHANNEL,
      DESKTOP_WORKSPACE_GRANT_CHANNEL,
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
      DESKTOP_CANVAS_CHANNELS.previewResourceResolve,
      DESKTOP_CANVAS_CHANNELS.previewResourceRelease,
      DESKTOP_CANVAS_CHANNELS.workspaceIndexCatalogRead,
      DESKTOP_CANVAS_CHANNELS.workspaceDocumentOpen,
      DESKTOP_CUT_CHANNELS.snapshotGet,
      DESKTOP_CUT_CHANNELS.requestExecute,
      DESKTOP_CUT_CHANNELS.draftCreate,
      DESKTOP_CUT_CHANNELS.viewClose,
      DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
      DESKTOP_SHELL_CHANNELS.snapshotGet,
      ASSET_CENTER_HOST_CHANNEL,
      AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL,
      AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL,
      DESKTOP_SHELL_CHANNELS.projectOpenContent,
      DESKTOP_SHELL_CHANNELS.projectOpenCatalog,
      DESKTOP_SHELL_CHANNELS.projectRemove,
      DESKTOP_SHELL_CHANNELS.projectConversationArchive,
      DESKTOP_SHELL_CHANNELS.conversationArchive,
      DESKTOP_SHELL_CHANNELS.projectRequestProfile,
      DESKTOP_SHELL_CHANNELS.homeActivate,
      DESKTOP_SHELL_CHANNELS.tabActivate,
      DESKTOP_SHELL_CHANNELS.tabClose,
      DESKTOP_SHELL_CHANNELS.workbenchUpdate,
      DESKTOP_SHELL_CHANNELS.applicationSidebarUpdate,
      DESKTOP_SHELL_CHANNELS.sceneTransition,
      ...(options.dshPermissions ? [DSH_PERMISSION_HOST_CHANNEL] : []),
      ...(options.dshRuntime ? [DSH_RUNTIME_HOST_CHANNEL] : []),
      ...(options.dshSessions ? [DSH_SESSION_HOST_CHANNEL] : []),
      ...(options.dshExtensions ? [AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL] : []),
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

function requireWorldPortableExportResult<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('World portable destination completed without export bytes.');
  }
  return value;
}
