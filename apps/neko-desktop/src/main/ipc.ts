import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { DESKTOP_BRIDGE_CHANNELS } from '../shared/bridge-contract';
import { DESKTOP_SHELL_CHANNELS } from '../shared/shell-contract';
import type { DesktopAppHost } from './app-host';

export function registerDesktopIpc(
  appHost: DesktopAppHost,
  options: {
    readonly selectContentWorkspace: (
      event: IpcMainInvokeEvent,
    ) => Promise<string | undefined>;
  },
): () => void {
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
    DESKTOP_SHELL_CHANNELS.projectOpenContent,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.openContentProject(
        requireSender(event),
        payload,
        () => options.selectContentWorkspace(event),
      ),
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
  ipcMain.handle(
    DESKTOP_SHELL_CHANNELS.tabClose,
    (event: IpcMainInvokeEvent, payload: unknown) =>
      appHost.closeProjectTab(requireSender(event), payload),
  );
  return () => {
    for (const channel of [
      DESKTOP_BRIDGE_CHANNELS.bootstrapGet,
      DESKTOP_SHELL_CHANNELS.snapshotGet,
      DESKTOP_SHELL_CHANNELS.projectOpenContent,
      DESKTOP_SHELL_CHANNELS.projectRequestProfile,
      DESKTOP_SHELL_CHANNELS.homeActivate,
      DESKTOP_SHELL_CHANNELS.tabActivate,
      DESKTOP_SHELL_CHANNELS.tabClose,
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
