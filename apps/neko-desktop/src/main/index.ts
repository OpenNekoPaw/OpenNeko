import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { ConsoleLogger } from '@neko/shared/logger';
import { DESKTOP_BRIDGE_CHANNELS, type DesktopLifecycleEvent } from '../shared/bridge-contract';
import {
  DESKTOP_SHELL_CHANNELS,
  type DesktopShellProjectionEvent,
} from '../shared/shell-contract';
import { DesktopAppHost } from './app-host';
import { registerDesktopAppProtocol, registerDesktopAppScheme } from './app-protocol';
import { createDesktopWorkspaceRegistry } from './desktop-workspace-registry';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { registerDesktopIpc } from './ipc';
import { DesktopRendererRecovery } from './renderer-recovery';
import {
  configureDesktopWindowSecurity,
  DESKTOP_APP_ORIGIN,
  createDesktopWebPreferences,
} from './security';
import { DesktopShellService } from './shell-service';
import {
  createNodeDesktopShellStateFilePort,
  DesktopShellStateRepository,
} from './shell-state-repository';
import { closeDesktopWindows } from './window-lifecycle';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const logger = new ConsoleLogger('Desktop');

void bootstrapDesktop().catch((error: unknown) => {
  logger.error('Desktop startup failed.', error);
  app.exit(1);
});

async function bootstrapDesktop(): Promise<void> {
  registerDesktopAppScheme();
  app.enableSandbox();
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await startDesktop();
}

async function startDesktop(): Promise<void> {
  await app.whenReady();
  logger.info('Desktop Electron runtime is ready.');

  const homedir = app.getPath('home');
  const userData = app.getPath('userData');
  const applicationInstanceId = randomUUID();
  const host = createElectronNekoHostPorts({
    homedir,
    nekoHome: userData,
    version: app.getVersion(),
    logger,
    openExternal: async (uri) => {
      await shell.openExternal(uri);
    },
    revealPath: (targetPath) => {
      shell.showItemInFolder(targetPath);
    },
  });
  logger.info('Desktop Host ports initialized.');
  const workspaceRegistry = await createDesktopWorkspaceRegistry({ homedir });
  logger.info('Desktop workspace registry initialized.');
  const shellService = new DesktopShellService({
    applicationInstanceId,
    stateRepository: new DesktopShellStateRepository(
      createNodeDesktopShellStateFilePort(
        path.join(userData, 'state', 'desktop-shell-state.json'),
      ),
    ),
    workspaceRegistry,
  });
  const appHost = new DesktopAppHost({
    host,
    version: app.getVersion(),
    logger,
    shell: shellService,
    instanceId: applicationInstanceId,
  });
  const disposeIpc = registerDesktopIpc(appHost, {
    selectContentWorkspace: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('Desktop workspace picker requires a registered BrowserWindow.');
      const result = await dialog.showOpenDialog(owner, {
        title: 'Open Content Project',
        buttonLabel: 'Open Project',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop workspace picker completed without a selected directory.');
      }
      return selectedPath;
    },
  });
  logger.info('Desktop AppHost and IPC initialized.');
  const developmentUrl = readDevelopmentUrl();
  const rendererRoot = path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME);
  const disposeProtocol = developmentUrl ? undefined : registerDesktopAppProtocol(rendererRoot);
  let shutdownStarted = false;
  let shutdownComplete = false;

  const createWindow = async (): Promise<void> => {
    const windowId = await appHost.shell.claimWindowId();
    logger.info('Desktop Shell Window identity claimed.', { windowId });
    let window: BrowserWindow | undefined;
    let registered = false;
    try {
      const allowedOrigin = developmentUrl
        ? new URL(developmentUrl).origin
        : DESKTOP_APP_ORIGIN;
      const createdWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        show: false,
        backgroundColor: '#0b0d12',
        title: 'OpenNeko',
        webPreferences: createDesktopWebPreferences(path.join(__dirname, 'preload.cjs')),
      });
      window = createdWindow;
      const rendererRecovery = new DesktopRendererRecovery();
      const registration = appHost.windows.register({
        windowId,
        webContentsId: createdWindow.webContents.id,
        allowedOrigin,
      });
      registered = true;
      const disposeSecurity = configureDesktopWindowSecurity(createdWindow, allowedOrigin);
      appHost.windows.addDisposable(registration.windowId, { dispose: disposeSecurity });
      const disposeShellSubscription = appHost.shell.subscribe(
        registration.windowId,
        (event) => sendShellProjectionEvent(createdWindow, event),
      );
      appHost.windows.addDisposable(registration.windowId, {
        dispose: () => {
          disposeShellSubscription();
          appHost.shell.releaseWindow(registration.windowId);
        },
      });

      createdWindow.webContents.on('did-start-loading', () => {
        const event = appHost.windows.rendererLoading(
          registration.windowId,
          appHost.applicationIdentity.instanceId,
        );
        appHost.shell.setRendererEpoch(registration.windowId, event.rendererEpoch);
        sendLifecycleEvent(createdWindow, event);
      });
      createdWindow.webContents.on('did-finish-load', () => {
        const event = appHost.windows.rendererReady(
          registration.windowId,
          appHost.applicationIdentity.instanceId,
        );
        sendLifecycleEvent(createdWindow, event);
        createdWindow.show();
      });
      createdWindow.webContents.on('render-process-gone', (_event, details) => {
        if (shutdownStarted) return;
        appHost.reportError(
          'desktop-renderer-process-gone',
          `Desktop renderer exited: ${details.reason}.`,
        );
        try {
          if (!rendererRecovery.recover(createdWindow)) {
            appHost.reportError(
              'desktop-renderer-recovery-exhausted',
              `Desktop renderer recovery is unavailable for Window '${registration.windowId}'.`,
            );
          }
        } catch (error) {
          appHost.reportError(
            'desktop-renderer-recovery-failed',
            `Failed to reload Desktop renderer for Window '${registration.windowId}'.`,
            error,
          );
        }
      });
      createdWindow.on('close', () => {
        const event = appHost.windows.windowClosing(
          registration.windowId,
          appHost.applicationIdentity.instanceId,
        );
        sendLifecycleEvent(createdWindow, event);
      });
      createdWindow.on('closed', () => {
        try {
          appHost.windows.disposeWindow(registration.windowId);
        } catch (error) {
          appHost.reportError(
            'desktop-window-dispose-failed',
            `Failed to dispose Desktop window '${registration.windowId}'.`,
            error,
          );
        }
      });

      if (developmentUrl) {
        await createdWindow.loadURL(developmentUrl);
      } else {
        await createdWindow.loadURL(`${DESKTOP_APP_ORIGIN}/index.html`);
      }
      logger.info('Desktop renderer loaded.', { windowId });
    } catch (error) {
      const cleanupErrors: unknown[] = [error];
      try {
        if (registered) {
          appHost.windows.disposeWindow(windowId);
        } else {
          appHost.shell.releaseWindow(windowId);
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        if (window && !window.isDestroyed()) window.destroy();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length === 1) throw error;
      throw new AggregateError(
        cleanupErrors,
        `Failed to create and clean up Desktop Window '${windowId}'.`,
      );
    }
  };

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((error: unknown) => {
        appHost.reportError(
          'desktop-window-create-failed',
          'Failed to create Desktop window.',
          error,
        );
      });
    }
  });
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('window-all-closed', () => {
    app.quit();
  });
  app.on('before-quit', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    void shutdownDesktop()
      .catch((error: unknown) => {
        appHost.reportError(
          'desktop-shutdown-failed',
          'Desktop shutdown did not release every owned resource.',
          error,
        );
      })
      .finally(() => {
        shutdownComplete = true;
        app.quit();
      });
  });

  await createWindow();

  async function shutdownDesktop(): Promise<void> {
    await closeDesktopWindows(BrowserWindow.getAllWindows());
    disposeIpc();
    disposeProtocol?.();
    await appHost.dispose();
  }
}

function readDevelopmentUrl(): string | undefined {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
    ? undefined
    : MAIN_WINDOW_VITE_DEV_SERVER_URL;
}

function sendLifecycleEvent(window: BrowserWindow, event: DesktopLifecycleEvent): void {
  if (!window.isDestroyed()) {
    window.webContents.send(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, event);
  }
}

function sendShellProjectionEvent(
  window: BrowserWindow,
  event: DesktopShellProjectionEvent,
): void {
  if (!window.isDestroyed()) {
    window.webContents.send(DESKTOP_SHELL_CHANNELS.projectionEvent, event);
  }
}
