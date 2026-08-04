import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import * as path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  nativeImage,
  nativeTheme,
  safeStorage,
  session,
  shell,
  systemPreferences,
} from 'electron';
import { ConsoleLogger } from '@neko/shared/logger';
import { DESKTOP_BRIDGE_CHANNELS, type DesktopLifecycleEvent } from '../shared/bridge-contract';
import {
  DESKTOP_SHELL_CHANNELS,
  type DesktopShellProjectionEvent,
} from '@neko/host/desktop-shell-contract';
import { DESKTOP_VITE_CSP_NONCE } from '../shared/vite-development-security';
import { DesktopAppHost } from './app-host';
import {
  registerDesktopOpenNekoProtocol,
  registerDesktopOpenNekoScheme,
} from './desktop-openneko-protocol';
import { createDesktopWorkspaceRegistry } from './desktop-workspace-registry';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { registerDesktopIpc } from './ipc';
import { DesktopRendererRecovery } from './renderer-recovery';
import {
  configureDesktopWindowSecurity,
  DESKTOP_APP_ORIGIN,
  createDesktopWebPreferences,
} from './security';
import { DesktopShellService } from '@neko/host/desktop-shell-service';
import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
} from '@neko/host/desktop-shell-state';
import {
  createAgentAppHost,
  createAgentConversationLifecycleService,
  createAssistantResourceService,
  createPersistentAgentConversationLifecycleRepository,
  AGENT_CONVERSATION_LIFECYCLE_MIGRATIONS,
} from '@neko/agent-runtime/application';
import { NodePiConversationCatalogReader } from '@neko/agent-runtime/pi';
import { NodeVideoThumbnail } from '@neko/media/node';
import {
  resolveDesktopAgentAutomationLaunch,
  resolveDesktopFunctionalCutExport,
  resolveDesktopFunctionalWorkspace,
  resolveDesktopFunctionalWindowMode,
  resolveDesktopRuntimeHome,
} from './desktop-functional-fixture';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';
import { createAgentControllerComposition } from '@neko/agent-runtime/application';
import { createEncryptedDesktopSecretPort } from './encrypted-desktop-secret-port';
import { createMacOSProtectedAuthPrompt } from './macos-protected-auth-prompt';
import { closeDesktopWindows } from './window-lifecycle';
import {
  DESKTOP_STATE_AUTHORITY_KEYS,
  migrateDesktopStateToSqlite,
  resolveGlobalStorageLayout,
  SqliteVersionedJsonStateRepository,
} from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import {
  AssetCenterNodeRuntime,
  ResourceBrowserNodeRuntime,
  type ResourceBrowserNodeRuntimeOptions,
} from '@neko/assets-node';
import {
  DesktopResourceRegistry,
  registerDesktopResourceRequestAuthorization,
} from './desktop-resource-registry';
import { DesktopPreviewRuntime } from './desktop-preview-runtime';
import { CanvasGenerationNodeRuntime } from '@neko/canvas-node';
import { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import { DesktopCanvasMediaRuntime } from './desktop-canvas-media-runtime';
import { DesktopCutRuntime } from './desktop-cut-runtime';
import { createDesktopNativeThemeController } from './desktop-native-theme';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-state';
import { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import {
  DESKTOP_APPLICATION_SETTINGS_CHANNELS,
  type DesktopApplicationSettingsProjectionEvent,
} from '@neko/host/application-settings';
import { buildConfigFilePath } from '@neko/host/files';
import { ConfigManager, FileUserConfigManager } from '@neko/host/settings';
import { resolveDesktopBuiltinSkillRoot } from './desktop-builtin-skill-root';
import { listWorkspaceLinkedMediaLibraries } from '@neko/assets-node';
import {
  listGlobalMediaLibraryConnections,
  resolveGlobalMediaLibraryTarget,
} from '@neko/assets-node';
import {
  createAgentExtensionManager,
  createAgentExtensionSupport,
  createOpenNekoExtensionRepository,
} from '@neko/agent-runtime/extensions';
import { createPersonalSkillManager } from '@neko/agent-runtime/pi';
import { ProjectPortabilityRuntime } from '@neko/assets-node';
import { createDesktopRetiredJsonStatePort } from './desktop-state-migration-adapter';
import { createDesktopAgentLaunchRuntime } from './desktop-agent-launch-runtime';
import { createDesktopAssistantPreviewRuntime } from './desktop-assistant-preview-runtime';
import { DesktopWorkspaceGrantAuthority } from '@neko/host/desktop-workspace-grant-authority';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const logger = new ConsoleLogger('Desktop');

void bootstrapDesktop().catch((error: unknown) => {
  logger.error('Desktop startup failed.', error);
  app.exit(1);
});

async function bootstrapDesktop(): Promise<void> {
  registerDesktopOpenNekoScheme();
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

  const homedir = resolveDesktopRuntimeHome({
    systemHome: app.getPath('home'),
    argv: process.argv,
    environment: process.env,
  });
  const functionalWorkspace = resolveDesktopFunctionalWorkspace({
    argv: process.argv,
    environment: process.env,
    fixtureHome: homedir,
  });
  const functionalWorkspacePickerCancellationMarker = functionalWorkspace
    ? path.join(homedir, '.openneko-functional-cancel-workspace-picker-once')
    : undefined;
  const functionalWindowMode = resolveDesktopFunctionalWindowMode(process.argv);
  const functionalCutExport = resolveDesktopFunctionalCutExport({
    argv: process.argv,
    environment: process.env,
    workspace: functionalWorkspace,
  });
  const userData = app.getPath('userData');
  const agentAutomationLaunch = resolveDesktopAgentAutomationLaunch({
    argv: process.argv,
    fixtureHome: homedir,
    userDataRoot: userData,
    workspace: functionalWorkspace,
  });
  const globalStorage = resolveGlobalStorageLayout(homedir);
  const localMetadataStore = createNodeSqliteLocalMetadataStore({ homedir });
  await localMetadataStore.open({
    databasePath: globalStorage.database,
    busyTimeoutMs: 5_000,
  });
  const shellStateCodec = {
    createEmpty: createEmptyDesktopShellState,
    parse: parseDesktopShellStoredState,
    readStorageRevision: (state: ReturnType<typeof createEmptyDesktopShellState>) =>
      state.storageRevision,
  };
  const applicationSettingsCodec = {
    createEmpty: createDefaultDesktopApplicationSettingsState,
    parse: parseDesktopApplicationSettingsStoredState,
    readStorageRevision: (state: ReturnType<typeof createDefaultDesktopApplicationSettingsState>) =>
      state.storageRevision,
  };
  const retiredJsonState = createDesktopRetiredJsonStatePort({
    shellStatePath: path.join(userData, 'state', 'desktop-shell-state.json'),
    applicationSettingsPath: path.join(userData, 'state', 'desktop-application-settings.v1.json'),
  });
  try {
    await migrateDesktopStateToSqlite({
      store: localMetadataStore,
      retiredJson: retiredJsonState,
      shellCodec: shellStateCodec,
      settingsCodec: applicationSettingsCodec,
      digest: (content) => createHash('sha256').update(content).digest('hex'),
    });
    await localMetadataStore.migrateNamespace(AGENT_CONVERSATION_LIFECYCLE_MIGRATIONS);
  } catch (error) {
    await localMetadataStore.dispose();
    throw error;
  }
  const applicationSettingsRepository = new SqliteVersionedJsonStateRepository({
    store: localMetadataStore,
    authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
    codec: applicationSettingsCodec,
  });
  const applicationSettings = new DesktopApplicationSettingsService(applicationSettingsRepository);
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
  const developmentUrl = readDevelopmentUrl();
  const rendererOrigin = developmentUrl ? new URL(developmentUrl).origin : DESKTOP_APP_ORIGIN;
  const resourceRegistry = new DesktopResourceRegistry({
    allowedOrigins: [rendererOrigin],
  });
  const disposeResourceAuthorization = registerDesktopResourceRequestAuthorization(
    session.defaultSession,
    resourceRegistry,
  );
  logger.info('Desktop OpenNeko resource registry initialized.');
  const workspaceRegistry = await createDesktopWorkspaceRegistry({ homedir });
  const workspaceGrantAuthority = new DesktopWorkspaceGrantAuthority({
    resolver: workspaceRegistry,
  });
  logger.info('Desktop workspace registry initialized.');
  const credentialRuntime = createAgentCredentialRuntime({
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
    stateRepository: new SqliteVersionedJsonStateRepository({
      store: localMetadataStore,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
      codec: shellStateCodec,
    }),
    workspaceRegistry,
    workspaceGrantAuthority,
    startupTarget: initialApplicationSettings.preferences.startupTarget,
  });
  const assistantSpaceId = 'assistant-space:local-user';
  const agentCatalogReader = await NodePiConversationCatalogReader.create({
    userDataRoot: globalStorage.root,
  });
  const agentComposition = createAgentAppHost({
    userDataRoot: globalStorage.root,
    userHome: homedir,
    hostId: `electron:${applicationInstanceId}`,
    credentialRuntime,
    catalogReader: agentCatalogReader,
    homeConversationWorkspaceIds: [assistantSpaceId],
    builtinSkillRoot: resolveDesktopBuiltinSkillRoot({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }),
  });
  const assistantSpaceRoot = path.join(globalStorage.root, 'assistant-spaces', 'local-user');
  await mkdir(assistantSpaceRoot, { recursive: true });
  const assistantAgentWorkspace = await agentComposition.attachWorkspace({
    workspaceId: assistantSpaceId,
    workspacePath: assistantSpaceRoot,
    displayName: 'Assistant',
    locator: { kind: 'relative', value: 'assistant-spaces/local-user' },
  });
  const extensionManager = createAgentExtensionManager({
    repository: createOpenNekoExtensionRepository({
      marketplaceRoot: path.join(
        app.isPackaged ? process.resourcesPath : app.getAppPath(),
        ...(app.isPackaged ? [] : ['resources']),
        'extension-marketplace',
      ),
      installRoot: path.join(globalStorage.root, 'extensions', 'plugins'),
      trashItem: (absolutePath) => shell.trashItem(absolutePath),
    }),
    agentSupport: createAgentExtensionSupport(),
  });
  const initialExtensionSnapshot = await extensionManager.readCatalog();
  extensionManager.setRuntimeReadiness(
    initialExtensionSnapshot.revision,
    await agentComposition.reconcilePluginRuntime(initialExtensionSnapshot),
  );
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
  const personalSkillManager = createPersonalSkillManager({
    personalSkillRoot: path.join(homedir, '.agents', 'skills'),
    selectDirectory: async (windowId) => {
      const result = await dialog.showOpenDialog(requireOwnerWindow(windowId), {
        title: app.getLocale().toLocaleLowerCase().startsWith('zh')
          ? '安装个人 Skill'
          : 'Install Personal Skill',
        buttonLabel: app.getLocale().toLocaleLowerCase().startsWith('zh') ? '安装' : 'Install',
        properties: ['openDirectory'],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },
    trashItem: (absolutePath) => shell.trashItem(absolutePath),
  });
  const openHostPath = async (targetPath: string): Promise<void> => {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  };
  const previewRuntime = new DesktopPreviewRuntime({
    shell: shellService,
    resources: resourceRegistry,
  });
  const cutRuntime = new DesktopCutRuntime({
    shell: shellService,
    host,
    resources: resourceRegistry,
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
    selectExportDestination: async ({ identity, workspacePath, outputName, container }) => {
      if (functionalCutExport) return functionalCutExport;
      const owner = requireOwnerWindow(identity.windowId);
      const fileName = `${outputName.replace(/\.(?:mp4|mov)$/iu, '')}.${container}`;
      const result = await dialog.showSaveDialog(owner, {
        title: app.getLocale().toLocaleLowerCase().startsWith('zh') ? '导出 Cut' : 'Export Cut',
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
  const canvasUsesChineseLabels = app.getLocale().toLocaleLowerCase().startsWith('zh');
  const canvasGenerationRuntime = new CanvasGenerationNodeRuntime({ homedir });
  const canvasRuntime = new DesktopCanvasRuntime({
    shell: shellService,
    host,
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    materialActionLabels: {
      preview: canvasUsesChineseLabels ? '预览' : 'Preview',
      reveal: canvasUsesChineseLabels ? '在访达中显示' : 'Reveal in Finder',
      openInCut: canvasUsesChineseLabels ? '在剪辑中打开' : 'Open in Cut',
      copyToProjectMediaLibrary: canvasUsesChineseLabels
        ? '复制到项目媒体库'
        : 'Copy to project Media Library',
      copyToGlobalMediaLibrary: canvasUsesChineseLabels
        ? '复制到全局媒体库'
        : 'Copy to global Media Library',
      regenerate: canvasUsesChineseLabels ? '重新生成' : 'Regenerate',
    },
    generation: canvasGenerationRuntime,
    media: new DesktopCanvasMediaRuntime({
      resources: resourceRegistry,
    }),
    requestSource: async ({ identity, sourceKind, sourceMode, workspace }) => {
      const owner = requireOwnerWindow(identity.windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showOpenDialog(owner, {
        title: chinese ? '添加到画布' : 'Add to Canvas',
        buttonLabel: chinese ? '添加' : 'Add',
        ...(sourceMode === 'reference' ? { defaultPath: workspace.workspacePath } : {}),
        properties: ['openFile'],
        filters: canvasSourceFilters(sourceKind),
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop Canvas source picker returned no file.');
      }
      if (sourceMode === 'reference') {
        const relativePath = path.relative(workspace.workspacePath, selectedPath);
        if (
          !relativePath ||
          relativePath === '..' ||
          relativePath.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relativePath)
        ) {
          throw new Error(
            'Desktop Canvas reference selection must belong to the active workspace.',
          );
        }
        return {
          kind: 'workspace-reference',
          locator: {
            kind: 'workspace-file',
            path: relativePath.split(path.sep).join('/'),
          },
          title: path.basename(selectedPath),
        };
      }
      return {
        kind: 'external-import',
        source: {
          absolutePath: selectedPath,
          sourceName: path.basename(selectedPath),
        },
      };
    },
    requestProjectMediaLibraryCopy: async ({ identity, workspace, suggestedFileName }) => {
      const libraries = (await listWorkspaceLinkedMediaLibraries(workspace.workspacePath)).filter(
        (library) => library.availability === 'available',
      );
      const library = await selectCanvasMediaLibrary({
        owner: requireOwnerWindow(identity.windowId),
        title: canvasUsesChineseLabels ? '选择项目媒体库' : 'Select project Media Library',
        names: libraries.map((candidate) => candidate.name),
      });
      if (!library) return undefined;
      const selected = libraries.find((candidate) => candidate.name === library);
      if (!selected) throw new Error('Selected project Media Library is no longer available.');
      const targetRoot = await realpath(
        path.join(workspace.workspacePath, ...selected.workspacePath.split('/')),
      );
      const destination = await selectCanvasMediaLibraryDestination({
        owner: requireOwnerWindow(identity.windowId),
        title: canvasUsesChineseLabels ? '复制到项目媒体库' : 'Copy to project Media Library',
        targetRoot,
        suggestedFileName,
      });
      return destination ? { libraryName: selected.name, ...destination } : undefined;
    },
    requestGlobalMediaLibraryCopy: async ({ identity, suggestedFileName }) => {
      const libraries = (
        await listGlobalMediaLibraryConnections(globalStorage.mediaLibraries)
      ).filter((library) => library.availability === 'available');
      const libraryId = await selectCanvasMediaLibrary({
        owner: requireOwnerWindow(identity.windowId),
        title: canvasUsesChineseLabels ? '选择全局媒体库' : 'Select global Media Library',
        names: libraries.map((candidate) => candidate.name),
        identities: libraries.map((candidate) => candidate.libraryId),
      });
      if (!libraryId) return undefined;
      const targetRoot = await resolveGlobalMediaLibraryTarget({
        mediaLibraryRoot: globalStorage.mediaLibraries,
        libraryId,
      });
      const destination = await selectCanvasMediaLibraryDestination({
        owner: requireOwnerWindow(identity.windowId),
        title: canvasUsesChineseLabels ? '复制到全局媒体库' : 'Copy to global Media Library',
        targetRoot,
        suggestedFileName,
      });
      return destination ? { globalLibraryId: libraryId, ...destination } : undefined;
    },
    previewResource: async ({ absolutePath, identity, locator }) => {
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
          resourceId: `canvas-content:${identity.documentId}:${JSON.stringify(locator)}`,
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
    resolveCut: async ({ absolutePath, identity, target }) =>
      cutRuntime.supportsOpen({
        resourceId: `canvas-content:${identity.documentId}:${target.nodeId}`,
        facet: 'files',
        role: 'content',
        depth: 0,
        kind: 'file',
        label: path.basename(absolutePath),
        locator: target.locator,
        capabilities: ['open-cut'],
      }),
    openInCut: async ({ absolutePath, identity, target }) => {
      const item = {
        resourceId: `canvas-content:${identity.documentId}:${target.nodeId}`,
        facet: 'files' as const,
        role: 'content' as const,
        depth: 0,
        kind: 'file' as const,
        label: path.basename(absolutePath),
        locator: target.locator,
        capabilities: ['open-cut'] as const,
      };
      await cutRuntime.open({
        identity: {
          projectId: identity.projectId,
          workspaceId: identity.workspaceId,
          windowId: identity.windowId,
          viewId: `canvas-material:${identity.viewId}`,
          viewEpoch: identity.viewEpoch,
          endpointEpoch: identity.endpointEpoch,
        },
        item,
        absolutePath,
      });
    },
    createPreviewVariant: ({ absolutePath }) =>
      createDesktopThumbnailDataUrl(absolutePath, { width: 640, height: 400 }),
  });
  const resourceBrowser = new ResourceBrowserNodeRuntime({
    globalAssetRoot: globalStorage.assets,
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    localMetadataRepositories: workspaceRegistry.metadataRepositories,
    shell: shellService,
    host,
    canvas: canvasRuntime,
    cut: {
      addResource: (input) => cutRuntime.addResource(input).then(() => undefined),
    },
    openPreview: (input) => previewRuntime.open(input).then(() => undefined),
    openQuickPreview: (input) => previewRuntime.openQuickPreview(input),
    releaseQuickPreview: (windowId, previewSessionId) =>
      previewRuntime.releaseQuickPreview(windowId, previewSessionId),
    openCut: (input) => cutRuntime.open(input),
    createThumbnail: (targetPath) =>
      createDesktopThumbnailDataUrl(targetPath, { width: 160, height: 100 }),
    createGlobalLibraryThumbnail: createDesktopGlobalLibraryThumbnailFactory(),
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
    selectConfiguredGlobalMediaLibrary: async ({ windowId, libraries }) => {
      const owner = requireOwnerWindow(windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      return selectCanvasMediaLibrary({
        owner,
        title: chinese ? '关联全局媒体库' : 'Link Global Media Library',
        names: libraries.map(
          (library) => `${library.name} (${library.locationKind.toLocaleUpperCase()})`,
        ),
        identities: libraries.map((library) => library.libraryId),
      });
    },
    selectGlobalMediaLibrarySource: async (windowId) => {
      if (functionalWorkspace) return functionalWorkspace;
      const owner = requireOwnerWindow(windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showOpenDialog(owner, {
        title: chinese ? '连接媒体库目录' : 'Connect Media Library Directory',
        buttonLabel: chinese ? '连接目录' : 'Connect Directory',
        properties: ['openDirectory'],
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop global media-library picker returned no directory.');
      }
      return selectedPath;
    },
    selectGlobalAssetSources: async (windowId) => {
      if (functionalWorkspace) {
        return [path.join(functionalWorkspace, 'media', 'frame.png')];
      }
      const owner = requireOwnerWindow(windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showOpenDialog(owner, {
        title: chinese ? '导入资产' : 'Import Assets',
        buttonLabel: chinese ? '导入' : 'Import',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: chinese ? '支持的素材' : 'Supported Materials',
            extensions: [
              'aac',
              'avi',
              'avif',
              'bmp',
              'flac',
              'gif',
              'glb',
              'gltf',
              'jpeg',
              'jpg',
              'm4a',
              'm4v',
              'mkv',
              'mov',
              'mp3',
              'mp4',
              'nkc',
              'nkv',
              'obj',
              'ogg',
              'opus',
              'ply',
              'png',
              'stl',
              'svg',
              'wav',
              'webm',
              'webp',
            ],
          },
        ],
      });
      if (result.canceled) return undefined;
      if (result.filePaths.length === 0) {
        throw new Error('Desktop global Asset picker returned no files.');
      }
      return result.filePaths;
    },
    trashGlobalAsset: (assetPath) => shell.trashItem(assetPath),
  });
  const assetCenter = new AssetCenterNodeRuntime({
    resourceBrowser,
    resources: {
      registerFile: (owner, resource) => resourceRegistry.registerFile(owner, resource),
      releaseSession: (sessionId) => resourceRegistry.releaseSession(sessionId),
    },
  });
  const metadataRepositories = workspaceRegistry.metadataRepositories;
  if (!metadataRepositories) {
    throw new Error('Desktop project portability requires the local metadata repository.');
  }
  const projectPortability = new ProjectPortabilityRuntime({
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    metadataRepositories,
    shell: shellService,
    selectDestination: async ({ windowId, projectDisplayName }) => {
      const owner = requireOwnerWindow(windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showSaveDialog(owner, {
        title: chinese ? '创建便携项目快照' : 'Create Portable Project Snapshot',
        buttonLabel: chinese ? '创建快照' : 'Create Snapshot',
        defaultPath: path.join(
          app.getPath('documents'),
          `${portableSnapshotName(projectDisplayName)}-portable`,
        ),
      });
      if (result.canceled) return undefined;
      if (!result.filePath) {
        throw new Error('Desktop portable snapshot picker returned no destination.');
      }
      return result.filePath;
    },
  });
  const agentControllerComposition = createAgentControllerComposition({
    host,
    userHome: homedir,
    credentialRuntime,
    resources: resourceRegistry,
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
  const agentLaunch = createDesktopAgentLaunchRuntime({
    agent: agentComposition,
    config: new ConfigManager({
      userConfigManager: new FileUserConfigManager({
        filePath: buildConfigFilePath(homedir),
      }),
    }),
    readTextResource: (hostResource) => host.files.readText(hostResource),
    selectResource: async ({ windowId, resourceKind }) => {
      const owner = requireOwnerWindow(windowId);
      if (resourceKind === 'microphone') {
        if (process.platform !== 'darwin') {
          throw new Error('Desktop microphone authorization is unavailable on this platform.');
        }
        const authorized = await systemPreferences.askForMediaAccess('microphone');
        return authorized ? { label: 'Microphone' } : undefined;
      }
      if (functionalWorkspace) {
        const selectedPath =
          resourceKind === 'directory'
            ? functionalWorkspace
            : path.join(functionalWorkspace, 'agent-reference.txt');
        return { label: path.basename(selectedPath), hostResource: selectedPath };
      }
      const result = await dialog.showOpenDialog(owner, {
        title: resourceKind === 'directory' ? 'Authorize Directory' : 'Authorize File',
        buttonLabel: 'Authorize',
        properties: [resourceKind === 'directory' ? 'openDirectory' : 'openFile'],
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop Agent authorization completed without a selected resource.');
      }
      return { label: path.basename(selectedPath), hostResource: selectedPath };
    },
  });
  const resolveScratchRoot = (ref: {
    readonly conversationId: string;
    readonly scratchArtifactId: string;
  }): string =>
    path.join(globalStorage.root, 'assistant-scratch', ref.conversationId, ref.scratchArtifactId);
  const conversationLifecycle = createAgentConversationLifecycleService({
    repository: createPersistentAgentConversationLifecycleRepository({
      metadataStore: localMetadataStore,
    }),
    grants: {
      validate: ({ context, resourceGrantIds }) =>
        agentLaunch.validateResourceGrants(context, resourceGrantIds),
      resolveForTurn: ({ context, resourceGrantIds }) =>
        agentLaunch.resolveResourceContexts(context, resourceGrantIds),
    },
    scratch: {
      create: async (ref) => {
        await mkdir(resolveScratchRoot(ref), { recursive: true });
      },
      release: async (ref) => {
        const artifactRoot = resolveScratchRoot(ref);
        const artifactStat = await lstat(artifactRoot).catch((error: unknown) => {
          if (isMissingPathError(error)) return undefined;
          throw error;
        });
        if (!artifactStat?.isDirectory()) {
          throw new Error(
            `Assistant Scratch artifact '${ref.scratchArtifactId}' has no Host handle.`,
          );
        }
        await rm(artifactRoot, { recursive: true, force: false });
      },
      authorizePreview: async () => {
        throw new Error('Assistant Scratch Preview authorization is unavailable.');
      },
    },
    publication: {
      publishToAssets: async () => {
        throw new Error('Assistant Scratch publication to Assets is unavailable.');
      },
      publishToWorkspace: async () => {
        throw new Error('Assistant Scratch publication to Workspace is unavailable.');
      },
    },
    provider: {
      start: async (request) => {
        const workspace =
          request.context.kind === 'assistant'
            ? assistantAgentWorkspace
            : (agentComposition.getWorkspace(request.context.workspaceId) ??
              (await agentComposition.attachWorkspace(
                await shellService.resolveAgentWorkspace(request.context.workspaceId),
              )));
        await workspace.createConversation(request.conversationId);
        const startInitialTurn = agentControllerComposition.startInitialTurn;
        if (!startInitialTurn) {
          throw new Error('Agent initial-turn provider adapter is unavailable.');
        }
        await startInitialTurn({
          workspace,
          conversationId: request.conversationId,
          turnId: request.turnId,
          messageText: request.messageText,
          providerId: request.configuration.providerId,
          modelId: request.configuration.modelId,
          locale: 'en',
          contextPayloads: request.contextPayloads,
        });
      },
    },
    createIdentity: randomUUID,
    now: () => new Date().toISOString(),
    conversationContextMigration: {
      resolveExactWorkspaceIdentity: async (conversationId) => {
        const storedConversation = agentComposition.findConversation(conversationId);
        return storedConversation
          ? {
              workspaceId: storedConversation.workspaceId,
              workspaceGrantId: `workspace-grant:migrated:${conversationId}`,
            }
          : undefined;
      },
    },
  });
  const assistantPreview = createDesktopAssistantPreviewRuntime({
    resolveScratchRoot,
    resources: resourceRegistry,
  });
  const assistantResources = createAssistantResourceService({
    lifecycle: conversationLifecycle,
    grants: agentLaunch,
    preview: assistantPreview,
  });
  const appHost = new DesktopAppHost({
    host,
    version: app.getVersion(),
    logger,
    shell: shellService,
    agent: agentComposition,
    agentControllerComposition,
    agentLaunch,
    workspaceGrants: workspaceGrantAuthority,
    conversationLifecycle,
    assistantResources,
    assistantPreviewLifecycle: assistantPreview,
    resourceBrowser,
    assetCenter,
    projectPortability,
    preview: previewRuntime,
    canvas: canvasRuntime,
    cut: cutRuntime,
    settings: applicationSettings,
    extensionManager,
    personalSkillManager,
    openAgentAdvancedSettings: () => openHostPath(buildConfigFilePath(homedir)),
    instanceId: applicationInstanceId,
    ...(agentAutomationLaunch
      ? {
          agentAutomation: {
            reloadRenderer: (windowId: string) => {
              const owner = requireOwnerWindow(windowId);
              setTimeout(() => {
                if (!owner.isDestroyed()) owner.webContents.reload();
              }, 0);
            },
            closeApplication: (windowId: string) => {
              const owner = requireOwnerWindow(windowId);
              setTimeout(() => {
                if (!owner.isDestroyed()) owner.close();
              }, 0);
            },
          },
        }
      : {}),
  });
  if (!appHost.agentBridge.startup.ready) {
    logger.warn('Desktop Agent capability is unavailable.', {
      diagnostic: appHost.agentBridge.startup.diagnostic,
    });
  }
  const disposeIpc = registerDesktopIpc(appHost, {
    selectWorkspaceGrant: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('Desktop workspace picker requires a registered BrowserWindow.');
      if (
        functionalWorkspacePickerCancellationMarker &&
        (await consumeFunctionalMarker(functionalWorkspacePickerCancellationMarker))
      ) {
        return undefined;
      }
      const selectedPath = functionalWorkspace ?? (await chooseWorkspaceDirectory(owner));
      return selectedPath
        ? { label: path.basename(selectedPath), hostResource: selectedPath }
        : undefined;
    },
    selectContentWorkspace: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('Desktop workspace picker requires a registered BrowserWindow.');
      if (functionalWorkspace) return functionalWorkspace;
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
  const rendererRoot = path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME);
  const disposeProtocol = registerDesktopOpenNekoProtocol(rendererRoot, resourceRegistry);
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
      resourceRegistry.bindWindow(registration.windowId, registration.webContentsId);
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
          resourceRegistry.unbindWindow(registration.windowId);
        },
      });
      appHost.windows.addDisposable(registration.windowId, {
        dispose: () => {
          windowsById.delete(registration.windowId);
        },
      });

      createdWindow.webContents.on('did-start-loading', () => {
        appHost.agentBridge.detachWindow(registration.windowId);
        appHost.detachWindowResources(registration.windowId, registration.webContentsId);
        resourceRegistry.releaseWindow(registration.windowId);
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
        if (functionalWindowMode === 'visible') createdWindow.show();
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
    await localMetadataStore.dispose();
    resourceRegistry.dispose();
    disposeResourceAuthorization();
    disposeProtocol();
  }
}

async function consumeFunctionalMarker(markerPath: string): Promise<boolean> {
  try {
    await rm(markerPath, { force: false });
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

async function chooseWorkspaceDirectory(owner: BrowserWindow): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(owner, {
    title: 'Open Workspace',
    buttonLabel: 'Open Workspace',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return undefined;
  const selectedPath = result.filePaths[0];
  if (!selectedPath) {
    throw new Error('Desktop workspace picker completed without a selected directory.');
  }
  return selectedPath;
}

async function selectCanvasMediaLibrary(input: {
  readonly owner: BrowserWindow;
  readonly title: string;
  readonly names: readonly string[];
  readonly identities?: readonly string[];
}): Promise<string | undefined> {
  if (input.names.length === 0) {
    throw new Error('No writable Media Library destination is available.');
  }
  if (input.identities && input.identities.length !== input.names.length) {
    throw new Error('Desktop Media Library selection identities are inconsistent.');
  }
  const cancelLabel = app.getLocale().toLocaleLowerCase().startsWith('zh') ? '取消' : 'Cancel';
  const result = await dialog.showMessageBox(input.owner, {
    type: 'question',
    title: input.title,
    message: input.title,
    buttons: [...input.names, cancelLabel],
    cancelId: input.names.length,
    defaultId: 0,
    noLink: true,
  });
  if (result.response === input.names.length) return undefined;
  const selected = input.identities?.[result.response] ?? input.names[result.response];
  if (!selected) throw new Error('Desktop Media Library selection is invalid.');
  return selected;
}

async function selectCanvasMediaLibraryDestination(input: {
  readonly owner: BrowserWindow;
  readonly title: string;
  readonly targetRoot: string;
  readonly suggestedFileName: string;
}): Promise<
  | {
      readonly destinationDirectory: string;
      readonly fileName: string;
      readonly conflictPolicy: 'fail-if-exists' | 'replace';
    }
  | undefined
> {
  const resolvedRoot = await realpath(input.targetRoot);
  const result = await dialog.showSaveDialog(input.owner, {
    title: input.title,
    defaultPath: path.join(resolvedRoot, input.suggestedFileName),
  });
  if (result.canceled || !result.filePath) return undefined;
  const relativePath = path.relative(resolvedRoot, result.filePath);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Desktop Media Library copy target must remain inside the selected library.');
  }
  const fileName = path.basename(relativePath).normalize('NFC');
  const nativeDirectory = path.dirname(relativePath);
  const destinationDirectory =
    nativeDirectory === '.'
      ? ''
      : nativeDirectory
          .split(path.sep)
          .map((segment) => segment.normalize('NFC'))
          .join('/');
  return {
    destinationDirectory,
    fileName,
    conflictPolicy: (await desktopPathExists(result.filePath)) ? 'replace' : 'fail-if-exists',
  };
}

async function desktopPathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
    return true;
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      Reflect.get(error, 'code') === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}

function readDevelopmentUrl(): string | undefined {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
    ? undefined
    : MAIN_WINDOW_VITE_DEV_SERVER_URL;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'ENOENT';
}

function portableSnapshotName(displayName: string): string {
  const sanitized = displayName
    .trim()
    .replaceAll(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')
    .replaceAll(/[. ]+$/gu, '');
  return sanitized || 'OpenNeko-project';
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

function createDesktopGlobalLibraryThumbnailFactory(): ResourceBrowserNodeRuntimeOptions['createGlobalLibraryThumbnail'] {
  const videoThumbnail = new NodeVideoThumbnail();
  const runBounded = createBoundedOperationRunner(4);
  return (input) =>
    runBounded(async () => {
      if (input.signal?.aborted) {
        throw input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error('Desktop global Library thumbnail request was cancelled.');
      }
      const size =
        input.variant === 'icon' ? { width: 160, height: 100 } : { width: 640, height: 400 };
      if (input.mediaType === 'image') {
        return createDesktopThumbnailDataUrl(input.absolutePath, size);
      }
      const png = await videoThumbnail.createPng({
        sourcePath: input.absolutePath,
        ...size,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    });
}

function createBoundedOperationRunner(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Desktop bounded operation limit must be a positive integer.');
  }
  let active = 0;
  const queued: Array<() => void> = [];
  const release = (): void => {
    active -= 1;
    queued.shift()?.();
  };
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= limit) {
      await new Promise<void>((resolve) => {
        queued.push(resolve);
      });
    }
    active += 1;
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

function canvasSourceFilters(
  sourceKind: 'image' | 'video' | 'audio' | 'model' | 'document' | 'canvas',
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
    case 'model':
      return [{ name: '3D Models', extensions: ['glb', 'gltf', 'obj', 'ply', 'stl'] }];
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
    window.webContents.send(DESKTOP_APPLICATION_SETTINGS_CHANNELS.projectionEvent, event);
  }
}
