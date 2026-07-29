import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { DESKTOP_AGENT_CHANNELS } from '../shared/agent-contract';
import { DESKTOP_BRIDGE_CHANNELS } from '../shared/bridge-contract';
import { DESKTOP_SHELL_CHANNELS } from '../shared/shell-contract';
import { DESKTOP_RESOURCE_BROWSER_CHANNELS } from '../shared/resource-browser-bridge-contract';
import { DESKTOP_PREVIEW_CHANNELS } from '../shared/preview-bridge-contract';
import { DESKTOP_CANVAS_CHANNELS } from '../shared/canvas-bridge-contract';
import { DESKTOP_CUT_CHANNELS } from '../shared/cut-bridge-contract';
import { DESKTOP_HOME_MANAGEMENT_CHANNELS } from '../shared/home-management-contract';
import { DESKTOP_APPLICATION_SETTINGS_CHANNELS } from '../shared/application-settings-contract';
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
  ipcMain.handle(
    DESKTOP_CUT_CHANNELS.snapshotGet,
    (event: IpcMainInvokeEvent, payload: unknown) =>
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
    DESKTOP_RESOURCE_BROWSER_CHANNELS.execute,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.executeResourceBrowser(requireSender(event), payload),
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
    DESKTOP_AGENT_CHANNELS.messageSend,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.sendAgentMessage(requireSender(event), payload),
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
    DESKTOP_HOME_MANAGEMENT_CHANNELS.pluginsList,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.listHomePlugins(requireSender(event), payload),
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
      DESKTOP_APPLICATION_SETTINGS_CHANNELS.snapshotGet,
      DESKTOP_APPLICATION_SETTINGS_CHANNELS.update,
      DESKTOP_APPLICATION_SETTINGS_CHANNELS.agentAdvancedOpen,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.children,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.search,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.thumbnailResolve,
      DESKTOP_RESOURCE_BROWSER_CHANNELS.execute,
      DESKTOP_PREVIEW_CHANNELS.snapshotGet,
      DESKTOP_PREVIEW_CHANNELS.requestExecute,
      DESKTOP_CANVAS_CHANNELS.snapshotGet,
      DESKTOP_CANVAS_CHANNELS.intentExecute,
      DESKTOP_CANVAS_CHANNELS.previewVariantResolve,
      DESKTOP_CUT_CHANNELS.snapshotGet,
      DESKTOP_CUT_CHANNELS.requestExecute,
      DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
      DESKTOP_SHELL_CHANNELS.snapshotGet,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsSearch,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.pluginsList,
      DESKTOP_SHELL_CHANNELS.projectOpenContent,
      DESKTOP_SHELL_CHANNELS.projectOpenCatalog,
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
