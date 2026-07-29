import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  nativeImage,
  nativeTheme,
  safeStorage,
  shell,
} from 'electron';
import { ConsoleLogger } from '@neko/shared/logger';
import { DESKTOP_BRIDGE_CHANNELS, type DesktopLifecycleEvent } from '../shared/bridge-contract';
import { DESKTOP_SHELL_CHANNELS, type DesktopShellProjectionEvent } from '../shared/shell-contract';
import { DESKTOP_VITE_CSP_NONCE } from '../shared/vite-development-security';
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
import { createDesktopAgentAppHostComposition } from './desktop-agent-app-host-composition';
import { createDesktopAgentCredentialRuntime } from './desktop-agent-credential-runtime';
import { createDesktopAgentControllerComposition } from './desktop-agent-controller-composition';
import { createEncryptedDesktopSecretPort } from './encrypted-desktop-secret-port';
import { createMacOSProtectedAuthPrompt } from './macos-protected-auth-prompt';
import { closeDesktopWindows } from './window-lifecycle';
import { resolveGlobalStorageLayout } from '@neko/shared/types/storage';
import { DesktopResourceBrowserRuntime } from './desktop-resource-browser-runtime';
import {
  DesktopMediaDescriptorRegistry,
  registerDesktopMediaProtocol,
} from './desktop-media-protocol';
import { DesktopPreviewRuntime } from './desktop-preview-runtime';
import { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import { DesktopCutRuntime } from './desktop-cut-runtime';
import { createDesktopWorkspaceFileLocator } from './desktop-content-locator';
import { createDesktopNativeThemeController } from './desktop-native-theme';
import {
  createNodeDesktopApplicationSettingsFilePort,
  DesktopApplicationSettingsRepository,
} from './application-settings-repository';
import { DesktopApplicationSettingsService } from './application-settings-service';
import {
  DESKTOP_APPLICATION_SETTINGS_CHANNELS,
  type DesktopApplicationSettingsProjectionEvent,
} from '../shared/application-settings-contract';
import { buildConfigFilePath } from '@neko/platform/files';

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
  const globalStorage = resolveGlobalStorageLayout(homedir);
  const applicationSettings = new DesktopApplicationSettingsService(
    new DesktopApplicationSettingsRepository(
      createNodeDesktopApplicationSettingsFilePort(
        path.join(userData, 'state', 'desktop-application-settings.v1.json'),
      ),
    ),
  );
  const initialApplicationSettings = await applicationSettings.initialize();
  nativeTheme.themeSource = initialApplicationSettings.preferences.theme;
  const applicationInstanceId = randomUUID();
  const secrets = createEncryptedDesktopSecretPort({
    filePath: path.join(userData, 'secrets', 'agent-credentials.v1.json'),
    encryption: {
      assertAvailable: () => {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error('Electron safeStorage encryption is unavailable.');
        }
        if (
          process.platform === 'linux' &&
          safeStorage.getSelectedStorageBackend() === 'basic_text'
        ) {
          throw new Error('Electron safeStorage selected the insecure basic_text backend.');
        }
      },
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(Buffer.from(value)),
    },
  });
  const host = createElectronNekoHostPorts({
    homedir,
    nekoHome: globalStorage.root,
    version: app.getVersion(),
    logger,
    secrets,
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
  const credentialRuntime = createDesktopAgentCredentialRuntime({
    secrets,
    prompt: createMacOSProtectedAuthPrompt({
      openExternal: async (url) => {
        await shell.openExternal(url);
      },
      reportFailure: (message) => {
        host.diagnostics?.report({
          code: 'desktop-agent-auth-notification-failed',
          severity: 'error',
          message,
        });
      },
    }),
  });
  const shellService = new DesktopShellService({
    applicationInstanceId,
    stateRepository: new DesktopShellStateRepository(
      createNodeDesktopShellStateFilePort(path.join(userData, 'state', 'desktop-shell-state.json')),
    ),
    workspaceRegistry,
    startupTarget: initialApplicationSettings.preferences.startupTarget,
  });
  const agentComposition = createDesktopAgentAppHostComposition({
    userDataRoot: globalStorage.root,
    userHome: homedir,
    hostId: `electron:${applicationInstanceId}`,
    credentialRuntime,
  });
  const windowsById = new Map<string, BrowserWindow>();
  const nativeThemeController = createDesktopNativeThemeController({
    nativeTheme,
    listWindows: () => windowsById.values(),
  });
  applicationSettings.subscribe((event) => {
    nativeTheme.themeSource = event.projection.preferences.theme;
  });
  const requireOwnerWindow = (windowId: string): BrowserWindow => {
    const owner = windowsById.get(windowId);
    if (!owner || owner.isDestroyed()) {
      throw new Error(`Desktop Agent Window '${windowId}' is unavailable.`);
    }
    return owner;
  };
  const openHostPath = async (targetPath: string): Promise<void> => {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  };
  const mediaRegistry = new DesktopMediaDescriptorRegistry();
  const previewRuntime = new DesktopPreviewRuntime({
    shell: shellService,
    mediaRegistry,
    resolveWebContentsId: (windowId) => requireOwnerWindow(windowId).webContents.id,
  });
  const canvasRuntime = new DesktopCanvasRuntime({
    shell: shellService,
    host,
    requestSource: async ({ identity, sourceKind, workspace }) => {
      const owner = requireOwnerWindow(identity.windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showOpenDialog(owner, {
        title: chinese ? '添加到画布' : 'Add to Canvas',
        buttonLabel: chinese ? '添加' : 'Add',
        properties: ['openFile'],
        filters: canvasSourceFilters(sourceKind),
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop Canvas source picker returned no file.');
      }
      return createDesktopWorkspaceFileLocator(workspace, selectedPath);
    },
    previewResource: async ({ absolutePath, identity, locator }) => {
      if (locator.kind !== 'workspace-file') {
        throw new Error('Desktop Canvas Preview requires a workspace-file ContentLocator.');
      }
      const label = path.basename(absolutePath);
      await previewRuntime.open({
        identity: {
          projectId: identity.projectId,
          workspaceId: identity.workspaceId,
          windowId: identity.windowId,
          viewId: `resource-browser:${identity.viewId}`,
          viewEpoch: identity.viewEpoch,
          endpointEpoch: identity.endpointEpoch,
        },
        item: {
          resourceId: `canvas-content:${identity.documentId}:${locator.path}`,
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'file',
          label,
          locator,
          capabilities: ['preview'],
        },
        absolutePath,
      });
    },
    createPreviewVariant: ({ absolutePath }) =>
      createDesktopThumbnailDataUrl(absolutePath, { width: 640, height: 400 }),
  });
  const cutRuntime = new DesktopCutRuntime({
    shell: shellService,
    host,
    mediaRegistry,
    resolveWebContentsId: (windowId) => requireOwnerWindow(windowId).webContents.id,
    selectMediaFiles: async ({ identity, trackKind }) => {
      const owner = requireOwnerWindow(identity.windowId);
      const result = await dialog.showOpenDialog(owner, {
        title: app.getLocale().toLocaleLowerCase().startsWith('zh')
          ? `添加${trackKind === 'Video' ? '视频' : trackKind === 'Audio' ? '音频' : '字幕'}`
          : `Add ${trackKind}`,
        properties: ['openFile', 'multiSelections'],
        filters:
          trackKind === 'Video'
            ? [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }]
            : trackKind === 'Audio'
              ? [
                  {
                    name: 'Audio',
                    extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov'],
                  },
                ]
              : [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }],
      });
      return result.canceled ? undefined : result.filePaths;
    },
    selectExportDestination: async ({
      identity,
      workspacePath,
      outputName,
      container,
    }) => {
      const owner = requireOwnerWindow(identity.windowId);
      const fileName = `${outputName.replace(/\.(?:mp4|mov)$/iu, '')}.${container}`;
      const result = await dialog.showSaveDialog(owner, {
        title: app.getLocale().toLocaleLowerCase().startsWith('zh')
          ? '导出 Cut'
          : 'Export Cut',
        defaultPath: path.join(workspacePath, 'exports', fileName),
        filters:
          container === 'mov'
            ? [{ name: 'QuickTime Movie', extensions: ['mov'] }]
            : [{ name: 'MPEG-4 Video', extensions: ['mp4'] }],
      });
      if (result.canceled || !result.filePath) return undefined;
      const relativePath = path.relative(workspacePath, result.filePath);
      if (
        !relativePath ||
        path.isAbsolute(relativePath) ||
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`)
      ) {
        throw new Error('Desktop Cut export target must remain inside the granted workspace.');
      }
      return relativePath.split(path.sep).join('/');
    },
  });
  const resourceBrowser = new DesktopResourceBrowserRuntime({
    shell: shellService,
    host,
    canvas: canvasRuntime,
    cut: {
      addResource: (input) => cutRuntime.addResource(input).then(() => undefined),
    },
    openPreview: (input) => previewRuntime.open(input).then(() => undefined),
    openCut: (input) => cutRuntime.open(input),
    createThumbnail: (targetPath) =>
      createDesktopThumbnailDataUrl(targetPath, { width: 160, height: 100 }),
    selectSource: async (windowId) => {
      const owner = requireOwnerWindow(windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showOpenDialog(owner, {
        title: chinese ? '添加媒体来源' : 'Add Media Source',
        buttonLabel: chinese ? '添加来源' : 'Add Source',
        properties: ['openDirectory'],
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop media source picker returned no directory.');
      }
      return selectedPath;
    },
  });
  const agentControllerComposition = createDesktopAgentControllerComposition({
    host,
    userHome: homedir,
    credentialRuntime,
    contentInteraction: {
      openContent: async ({ identity, absolutePath }) => {
        requireOwnerWindow(identity.windowId);
        await openHostPath(absolutePath);
      },
      revealDocument: async ({ identity, absolutePath }) => {
        requireOwnerWindow(identity.windowId);
        await openHostPath(absolutePath);
      },
      selectWorkspaceWriteTarget: async ({ identity, workspaceId, suggestedLocator }) => {
        const owner = requireOwnerWindow(identity.windowId);
        const workspace = agentComposition.getWorkspace(workspaceId);
        if (!workspace) {
          throw new Error(`Desktop Agent Workspace '${workspaceId}' is not attached.`);
        }
        const result = await dialog.showSaveDialog(owner, {
          title: 'Save SVG',
          defaultPath: path.join(workspace.workspace.workspacePath, suggestedLocator.path),
          filters: [{ name: 'SVG image', extensions: ['svg'] }],
        });
        if (result.canceled || !result.filePath) return undefined;
        const relativePath = path.relative(workspace.workspace.workspacePath, result.filePath);
        if (
          relativePath.length === 0 ||
          path.isAbsolute(relativePath) ||
          relativePath === '..' ||
          relativePath.startsWith(`..${path.sep}`)
        ) {
          throw new Error('Desktop Agent SVG target must remain inside the granted workspace.');
        }
        return {
          kind: 'workspace-file',
          path: relativePath.split(path.sep).join('/'),
        };
      },
      didWriteWorkspaceContent: async ({ identity, contentLocator }) => {
        requireOwnerWindow(identity.windowId);
        const workspace = agentComposition.getWorkspace(identity.workspaceId);
        if (!workspace) {
          throw new Error(`Desktop Agent Workspace '${identity.workspaceId}' is not attached.`);
        }
        shell.showItemInFolder(path.join(workspace.workspace.workspacePath, contentLocator.path));
      },
    },
    configInteraction: {
      openUserConfig: async ({ identity, absolutePath }) => {
        requireOwnerWindow(identity.windowId);
        await openHostPath(absolutePath);
      },
      openWorkspaceConfig: async ({ identity, absolutePath }) => {
        requireOwnerWindow(identity.windowId);
        await openHostPath(absolutePath);
      },
    },
    reportError: (error) => {
      host.diagnostics?.report({
        code: 'desktop-agent-controller-effect-failed',
        severity: 'error',
        message: error.message,
      });
    },
  });
  const appHost = new DesktopAppHost({
    host,
    version: app.getVersion(),
    logger,
    shell: shellService,
    agent: agentComposition,
    agentControllerComposition,
    resourceBrowser,
    preview: previewRuntime,
    canvas: canvasRuntime,
    cut: cutRuntime,
    settings: applicationSettings,
    openAgentAdvancedSettings: () => openHostPath(buildConfigFilePath(homedir)),
    instanceId: applicationInstanceId,
  });
  if (!appHost.agentBridge.startup.ready) {
    logger.warn('Desktop Agent capability is unavailable.', {
      diagnostic: appHost.agentBridge.startup.diagnostic,
    });
  }
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
  const disposeMediaProtocol = registerDesktopMediaProtocol(mediaRegistry);
  let shutdownStarted = false;
  let shutdownComplete = false;

  const createWindow = async (): Promise<void> => {
    const windowId = await appHost.shell.claimWindowId();
    logger.info('Desktop Shell Window identity claimed.', { windowId });
    let window: BrowserWindow | undefined;
    let registered = false;
    try {
      const allowedOrigin = developmentUrl ? new URL(developmentUrl).origin : DESKTOP_APP_ORIGIN;
      const createdWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        show: false,
        backgroundColor: nativeThemeController.backgroundColor,
        title: 'OpenNeko',
        ...(process.platform === 'darwin'
          ? {
              titleBarStyle: 'hiddenInset' as const,
              trafficLightPosition: { x: 18, y: 16 },
            }
          : {}),
        webPreferences: createDesktopWebPreferences(path.join(__dirname, 'preload.cjs')),
      });
      window = createdWindow;
      windowsById.set(windowId, createdWindow);
      const rendererRecovery = new DesktopRendererRecovery();
      const registration = appHost.windows.register({
        windowId,
        webContentsId: createdWindow.webContents.id,
        allowedOrigin,
      });
      registered = true;
      const disposeSecurity = configureDesktopWindowSecurity(
        createdWindow,
        allowedOrigin,
        developmentUrl
          ? {
              viteDevelopmentNonce: DESKTOP_VITE_CSP_NONCE,
            }
          : undefined,
      );
      appHost.windows.addDisposable(registration.windowId, { dispose: disposeSecurity });
      const disposeShellSubscription = appHost.shell.subscribe(registration.windowId, (event) =>
        sendShellProjectionEvent(createdWindow, event),
      );
      appHost.windows.addDisposable(registration.windowId, {
        dispose: () => {
          disposeShellSubscription();
          appHost.shell.releaseWindow(registration.windowId);
        },
      });
      const disposeSettingsSubscription = appHost.settings.subscribe((event) =>
        sendApplicationSettingsProjectionEvent(createdWindow, event),
      );
      appHost.windows.addDisposable(registration.windowId, {
        dispose: disposeSettingsSubscription,
      });
      appHost.windows.addDisposable(registration.windowId, {
        dispose: () => {
          appHost.agentBridge.detachWindow(registration.windowId);
        },
      });
      appHost.windows.addDisposable(registration.windowId, {
        dispose: () => {
          appHost.detachWindowResources(registration.windowId, registration.webContentsId);
        },
      });
      appHost.windows.addDisposable(registration.windowId, {
        dispose: () => {
          windowsById.delete(registration.windowId);
        },
      });

      createdWindow.webContents.on('did-start-loading', () => {
        appHost.agentBridge.detachWindow(registration.windowId);
        appHost.detachRendererSubscriptions(registration.webContentsId);
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
      windowsById.delete(windowId);
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
    nativeThemeController.dispose();
    disposeIpc();
    await appHost.dispose();
    disposeMediaProtocol();
    mediaRegistry.dispose();
    disposeProtocol?.();
  }
}

function readDevelopmentUrl(): string | undefined {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
    ? undefined
    : MAIN_WINDOW_VITE_DEV_SERVER_URL;
}

async function createDesktopThumbnailDataUrl(
  targetPath: string,
  size: { readonly width: number; readonly height: number },
): Promise<string> {
  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(targetPath, size);
    if (!thumbnail.isEmpty()) return thumbnail.toDataURL();
  } catch {
    // Native thumbnail errors may contain the private absolute source path.
  }
  throw new Error('Desktop could not project a thumbnail for this resource.');
}

function canvasSourceFilters(
  sourceKind: 'image' | 'video' | 'audio' | 'document' | 'canvas',
): Array<{ readonly name: string; readonly extensions: string[] }> {
  switch (sourceKind) {
    case 'image':
      return [
        { name: 'Images', extensions: ['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'] },
      ];
    case 'video':
      return [{ name: 'Videos', extensions: ['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm'] }];
    case 'audio':
      return [{ name: 'Audio', extensions: ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav'] }];
    case 'canvas':
      return [{ name: 'Neko Canvas', extensions: ['nkc'] }];
    case 'document':
      return [{ name: 'Documents', extensions: ['*'] }];
  }
}

function sendLifecycleEvent(window: BrowserWindow, event: DesktopLifecycleEvent): void {
  if (!window.isDestroyed()) {
    window.webContents.send(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent, event);
  }
}

function sendShellProjectionEvent(window: BrowserWindow, event: DesktopShellProjectionEvent): void {
  if (!window.isDestroyed()) {
    window.webContents.send(DESKTOP_SHELL_CHANNELS.projectionEvent, event);
  }
}

function sendApplicationSettingsProjectionEvent(
  window: BrowserWindow,
  event: DesktopApplicationSettingsProjectionEvent,
): void {
  if (!window.isDestroyed()) {
    window.webContents.send(
      DESKTOP_APPLICATION_SETTINGS_CHANNELS.projectionEvent,
      event,
    );
  }
}
