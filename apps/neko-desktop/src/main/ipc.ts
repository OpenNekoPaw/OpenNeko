import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { DESKTOP_AGENT_CHANNELS } from '../shared/agent-contract';
import { DESKTOP_AGENT_AUTOMATION_CHANNEL } from '../shared/agent-automation-contract';
import { DESKTOP_BRIDGE_CHANNELS } from '../shared/bridge-contract';
import { DESKTOP_SHELL_CHANNELS } from '../shared/shell-contract';
import { DESKTOP_RESOURCE_BROWSER_CHANNELS } from '../shared/resource-browser-bridge-contract';
import { DESKTOP_PREVIEW_CHANNELS } from '../shared/preview-bridge-contract';
import { DESKTOP_CANVAS_CHANNELS } from '../shared/canvas-bridge-contract';
import { DESKTOP_CUT_CHANNELS } from '../shared/cut-bridge-contract';
import { DESKTOP_HOME_MANAGEMENT_CHANNELS } from '../shared/home-management-contract';
import { DESKTOP_APPLICATION_SETTINGS_CHANNELS } from '@neko/host/application-settings';
import { DESKTOP_PROJECT_PORTABILITY_CHANNELS } from '@neko-assets/domain/contracts';
import type { DesktopAppHost } from './app-host';

export function registerDesktopIpc(
  appHost: DesktopAppHost,
  options: {
    readonly selectContentWorkspace: (event: IpcMainInvokeEvent) => Promise<string | undefined>;
  },
): () => void {
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
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsSearch,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.searchHomeAssets(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsImport,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.importHomeAssets(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRemove,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.removeHomeAsset(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.libraryThumbnailResolve,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.resolveHomeLibraryThumbnail(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesSearch,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.searchHomeMediaLibraries(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesChildren,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.readHomeMediaLibraryChildren(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesAdd,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.addHomeMediaLibrary(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRelink,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.relinkHomeMediaLibrary(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRemove,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.removeHomeMediaLibrary(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesReveal,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.revealHomeMediaLibrary(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionsList,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.listHomeExtensions(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPluginInstall,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.installHomeExtensionPlugin(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPluginRemove,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.removeHomeExtensionPlugin(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionMarketplacesRefresh,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.refreshHomeExtensionMarketplaces(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPersonalSkillInstall,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.installHomePersonalSkill(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPersonalSkillRemove,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.removeHomePersonalSkill(requireSender(event), payload),
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
    DESKTOP_SHELL_CHANNELS.projectRemoveRecent,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.removeRecentProject(requireSender(event), payload),
  );
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.conversationDelete,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.deleteHomeConversation(requireSender(event), payload),
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
  return () => {
    for (const channel of [
      DESKTOP_AGENT_CHANNELS.bootstrapGet,
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
      DESKTOP_CANVAS_CHANNELS.snapshotGet,
      DESKTOP_CANVAS_CHANNELS.materialActionsResolve,
      DESKTOP_CANVAS_CHANNELS.intentExecute,
      DESKTOP_CANVAS_CHANNELS.previewVariantResolve,
      DESKTOP_CANVAS_CHANNELS.mediaRequestExecute,
      DESKTOP_CUT_CHANNELS.snapshotGet,
      DESKTOP_CUT_CHANNELS.requestExecute,
      DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
      DESKTOP_SHELL_CHANNELS.snapshotGet,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsSearch,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsImport,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRemove,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.libraryThumbnailResolve,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesSearch,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesChildren,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesAdd,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRelink,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRemove,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesReveal,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionsList,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPluginInstall,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPluginRemove,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionMarketplacesRefresh,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPersonalSkillInstall,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionPersonalSkillRemove,
      DESKTOP_SHELL_CHANNELS.projectOpenContent,
      DESKTOP_SHELL_CHANNELS.projectOpenCatalog,
      DESKTOP_SHELL_CHANNELS.projectRemoveRecent,
      DESKTOP_SHELL_CHANNELS.conversationDelete,
      DESKTOP_SHELL_CHANNELS.projectRequestProfile,
      DESKTOP_SHELL_CHANNELS.homeActivate,
      DESKTOP_SHELL_CHANNELS.tabActivate,
      DESKTOP_SHELL_CHANNELS.tabClose,
      DESKTOP_SHELL_CHANNELS.workbenchUpdate,
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
