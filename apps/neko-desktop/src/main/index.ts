import { randomUUID } from 'node:crypto';
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
import { ConsoleLogger, ConsoleTransport, LogLevel, type ILogger } from '@neko/shared/logger';
import { ManagedFileLogTransport } from '@neko/shared/logger/node';
import { createNodeTextEditorMarkdownReferenceCatalog } from '@neko/text-editor-node';
import type { AgentBoundDomainBinding } from '@neko/agent-contracts';
import { DESKTOP_BRIDGE_CHANNELS, type DesktopLifecycleEvent } from '../shared/bridge-contract';
import {
  DESKTOP_SHELL_CHANNELS,
  type DesktopShellProjectionEvent,
} from '@neko/host/desktop-shell-contract';
import { DesktopAppHost } from './app-host';
import {
  registerDesktopOpenNekoProtocol,
  registerDesktopOpenNekoScheme,
} from './desktop-openneko-protocol';
import {
  createDesktopWorkspaceRegistry,
  type DesktopWorkspaceRegistry,
} from './desktop-workspace-registry';
import { DesktopWorkspaceBoardDelivery } from './desktop-workspace-board-delivery';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { registerDesktopIpc } from './ipc';
import { DesktopRendererRecovery } from './renderer-recovery';
import {
  configureDesktopWindowSecurity,
  desktopRendererContentSecurityPolicyOptions,
  DESKTOP_APP_ORIGIN,
  createDesktopWebPreferences,
} from './security';
import { DesktopShellService } from '@neko/host/desktop-shell-service';
import { DesktopProjectManagementService } from '@neko/host/desktop-project-management-service';
import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
  serializeDesktopShellStoredState,
} from '@neko/host/desktop-shell-state';
import {
  createAgentAppHost,
  createAgentConversationLifecycleService,
  createAgentDomainBindingApplicationService,
  createAgentLaunchDraftSubmissionApplicationService,
  createAgentRuntimeSettingsAuthority,
  createAgentRuntimeSettingsRepository,
  createAssistantResourceService,
  createPersistentAgentConversationLifecycleRepository,
  initializeAgentConversationLifecycleTables,
} from '@neko/agent-runtime/application';
import { setRootLogger as setAgentRootLogger } from '@neko/agent-runtime';
import { NodePiConversationCatalogReader } from '@neko/agent-runtime/pi';
import { NodeVideoThumbnail } from '@neko/media/node';
import {
  NodeProjectEntityInspectorRuntime,
  NodeProjectEntityProjectionRuntime,
} from '@neko/entity-node';
import {
  resolveDesktopAgentAutomationLaunch,
  consumeDesktopFunctionalWorkspaceSelection,
  resolveDesktopFunctionalCutExport,
  resolveDesktopFunctionalWorkspace,
  resolveDesktopFunctionalWindowMode,
  resolveDesktopFunctionalUserDataRoot,
  resolveDesktopRuntimeHome,
} from './desktop-functional-fixture';
import { DESKTOP_AGENT_AUTOMATION_RENDERER_ARGUMENT } from '../shared/agent-automation-contract';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';
import {
  createAgentControllerComposition,
  isAgentLaunchConversationCreationCommand,
} from '@neko/agent-runtime/application';
import { searchAgentWorkspaceMentions } from '@neko/agent-runtime/runtime/host-controller';
import { createEncryptedDesktopSecretPort } from './encrypted-desktop-secret-port';
import { createMacOSProtectedAuthPrompt } from './macos-protected-auth-prompt';
import { closeDesktopWindows } from './window-lifecycle';
import {
  DESKTOP_STATE_AUTHORITY_KEYS,
  initializeAssetLibraryMembershipTables,
  resolveManagedLogFile,
  resolveGlobalStorageLayout,
  SqliteJsonStateRepository,
  type InvalidJsonStateRejection,
} from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import {
  AssetCenterNodeRuntime,
  ResourceBrowserNodeRuntime,
  searchWorkspaceLinkedMediaLibraryContentLocators,
  type ResourceBrowserNodeRuntimeOptions,
} from '@neko/assets-node';
import {
  DesktopResourceRegistry,
  registerDesktopResourceRequestAuthorization,
} from './desktop-resource-registry';
import { DesktopPreviewRuntime } from './desktop-preview-runtime';
import { DesktopTextEditorRuntime } from './desktop-text-editor-runtime';
import { CanvasGenerationNodeRuntime } from '@neko/canvas-node';
import {
  createDirectGenerationOperationPort,
  WorkspaceGenerationApplicationRuntime,
} from '@neko/generation/job';
import {
  createContentReadMediaRequestAssetMaterializer,
  createMediaPlatform,
  createNodeWorkspaceGenerationJobOwner,
} from '@neko/generation/media';
import { createNodeHostContentReadService } from '@neko/content/node';
import { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import { DesktopCanvasMediaRuntime } from './desktop-canvas-media-runtime';
import {
  createDesktopCutCanvasHandoffPayload,
  DesktopCutRuntime,
  parseDesktopCutCanvasHandoffPayload,
} from './desktop-cut-runtime';
import { openDesktopCanvasDocument } from './desktop-creative-document-runtime';
import { createDesktopNativeThemeController } from './desktop-native-theme';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
  readDesktopApplicationSettingsStateDiagnostics,
  serializeDesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-state';
import { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import {
  DESKTOP_APPLICATION_SETTINGS_CHANNELS,
  type DesktopApplicationSettingsProjectionEvent,
} from '@neko/host/application-settings';
import { buildConfigFilePath } from '@neko/host/files';
import {
  FileProviderCredentialSource,
  FileUserConfigManager,
  WorkspaceConfigManagerAuthority,
  modelSupportsPurpose,
} from '@neko/host/settings';
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
import {
  createDesktopAgentConversationReferenceResolver,
  createDesktopAgentLaunchRuntime,
} from './desktop-agent-launch-runtime';
import { createDesktopAssistantPreviewRuntime } from './desktop-assistant-preview-runtime';
import { DesktopWorkspaceGrantAuthority } from '@neko/host/desktop-workspace-grant-authority';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let logger: ILogger = new ConsoleLogger('Desktop');

void bootstrapDesktop().catch((error: unknown) => {
  logger.error('Desktop startup failed.', error);
  app.exit(1);
});

async function bootstrapDesktop(): Promise<void> {
  registerDesktopOpenNekoScheme();
  app.enableSandbox();
  const functionalUserDataRoot = resolveDesktopFunctionalUserDataRoot({
    argv: process.argv,
    environment: process.env,
  });
  if (functionalUserDataRoot) app.setPath('userData', functionalUserDataRoot);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await startDesktop();
}

async function startDesktop(): Promise<void> {
  await app.whenReady();

  const userData = app.getPath('userData');
  const homedir = resolveDesktopRuntimeHome({
    systemHome: app.getPath('home'),
    userDataRoot: userData,
    argv: process.argv,
    environment: process.env,
  });
  const consoleTransport = new ConsoleTransport();
  const managedLogTransports = new Set<ManagedFileLogTransport>();
  const createManagedLogTransport = (owner: string, filePath: string) => {
    const transport = new ManagedFileLogTransport({
      filePath,
      onFailure: (error) => {
        logger.error(`Managed ${owner} log is unavailable.`, error);
      },
    });
    managedLogTransports.add(transport);
    return transport;
  };
  const desktopLogTransport = createManagedLogTransport(
    'Desktop',
    resolveManagedLogFile(homedir, { kind: 'desktop' }),
  );
  logger = new ConsoleLogger('Desktop', LogLevel.Info, [consoleTransport, desktopLogTransport]);
  const agentLogger = new ConsoleLogger('Agent', LogLevel.Info, [
    consoleTransport,
    createManagedLogTransport('Agent', resolveManagedLogFile(homedir, { kind: 'agent' })),
  ]);
  setAgentRootLogger(agentLogger);
  const workspaceLoggers = new Map<string, ILogger>();
  logger.info('Desktop Electron runtime is ready.');
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
  const agentAutomationLaunch = resolveDesktopAgentAutomationLaunch({
    argv: process.argv,
    workspace: functionalWorkspace,
  });
  const globalStorage = resolveGlobalStorageLayout(homedir);
  const assistantSpaceId = 'assistant-space:local-user';
  const localMetadataStore = createNodeSqliteLocalMetadataStore({ homedir });
  await localMetadataStore.open({
    databasePath: globalStorage.database,
    busyTimeoutMs: 5_000,
  });
  const shellStateCodec = {
    createEmpty: createEmptyDesktopShellState,
    parse: parseDesktopShellStoredState,
    serialize: serializeDesktopShellStoredState,
  };
  const applicationSettingsCodec = {
    createEmpty: createDefaultDesktopApplicationSettingsState,
    parse: parseDesktopApplicationSettingsStoredState,
    serialize: serializeDesktopApplicationSettingsStoredState,
  };
  const shellStateRepository = new SqliteJsonStateRepository({
    store: localMetadataStore,
    authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
    codec: shellStateCodec,
  });
  const applicationSettingsRepository = new SqliteJsonStateRepository({
    store: localMetadataStore,
    authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
    codec: applicationSettingsCodec,
  });
  const agentRuntimeSettingsRepository = createAgentRuntimeSettingsRepository({
    metadataStore: localMetadataStore,
    scopeId: assistantSpaceId,
  });
  let agentRuntimeSettings;
  let stateRejections: readonly InvalidJsonStateRejection[] = [];
  try {
    await shellStateRepository.prepare();
    const rejections = await Promise.all([
      shellStateRepository.inspectInvalidState(),
      applicationSettingsRepository.inspectInvalidState(),
    ]);
    stateRejections = rejections.filter(
      (rejection): rejection is InvalidJsonStateRejection => rejection !== undefined,
    );
    await initializeAssetLibraryMembershipTables(localMetadataStore);
    await initializeAgentConversationLifecycleTables(localMetadataStore);
    agentRuntimeSettings = await createAgentRuntimeSettingsAuthority({
      scopeId: assistantSpaceId,
      repository: agentRuntimeSettingsRepository,
    });
  } catch (error) {
    await localMetadataStore.dispose();
    throw error;
  }
  const applicationSettings = new DesktopApplicationSettingsService(applicationSettingsRepository);
  const initialApplicationSettings = await applicationSettings.initialize();
  const applicationSettingsStateDiagnostics = readDesktopApplicationSettingsStateDiagnostics(
    await applicationSettingsRepository.read(),
  );
  const agentRuntimeSettingsDiagnostic = agentRuntimeSettings.diagnostic();
  nativeTheme.themeSource = initialApplicationSettings.preferences.theme;
  const applicationInstanceId = randomUUID();
  const secrets = createEncryptedDesktopSecretPort({
    filePath: path.join(userData, 'secrets', 'agent-credentials.json'),
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
  const workspaceRegistry = await createDesktopWorkspaceRegistry({
    homedir,
    metadataStore: localMetadataStore,
  });
  const metadataRepositories = workspaceRegistry.metadataRepositories;
  if (!metadataRepositories) {
    throw new Error('Desktop runtime requires the local metadata repositories.');
  }
  const entityProjectionRuntime = new NodeProjectEntityProjectionRuntime({
    homedir,
    metadataStore: localMetadataStore,
    projections: metadataRepositories.entityAssetProjections,
  });
  const workspaceGrantAuthority = new DesktopWorkspaceGrantAuthority({
    resolver: workspaceRegistry,
  });
  logger.info('Desktop workspace registry initialized.');
  const workspaceConfigAuthority = new WorkspaceConfigManagerAuthority({
    userConfigManager: new FileUserConfigManager({
      filePath: buildConfigFilePath(homedir),
    }),
    assistantRuntimeSettings: agentRuntimeSettings,
  });
  const credentialRuntime = createAgentCredentialRuntime({
    secrets,
    configCredentials: new FileProviderCredentialSource({
      filePath: buildConfigFilePath(homedir),
    }),
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
  const retainedProjects = await workspaceRegistry.listProjects([assistantSpaceId]);
  const workspaceBoardDelivery = new DesktopWorkspaceBoardDelivery({
    applicationInstanceId,
    metadataStore: localMetadataStore,
    workspaceRegistry,
    host,
    createIdentity: randomUUID,
  });
  const boardRestoringWorkspaceRegistry: DesktopWorkspaceRegistry = {
    metadataRepositories: workspaceRegistry.metadataRepositories,
    listProjects: (excludedWorkspaceIds) => workspaceRegistry.listProjects(excludedWorkspaceIds),
    removeProjects: (workspaceIds) => workspaceRegistry.removeProjects(workspaceIds),
    resolve: async (workspacePath) => {
      const workspace = await workspaceRegistry.resolve(workspacePath);
      await workspaceBoardDelivery.flushWorkspace(workspace);
      return workspace;
    },
    restore: workspaceRegistry.restore
      ? async (workspaceId) => {
          const workspace = await workspaceRegistry.restore!(workspaceId);
          await workspaceBoardDelivery.flushWorkspace(workspace);
          return workspace;
        }
      : undefined,
    dispose: () => workspaceRegistry.dispose(),
  };
  const shellService = new DesktopShellService({
    applicationInstanceId,
    stateRepository: shellStateRepository,
    workspaceRegistry: boardRestoringWorkspaceRegistry,
    workspaceGrantAuthority,
    startupTarget: initialApplicationSettings.preferences.startupTarget,
    retainedProjects,
    startupStateDiagnostics: [
      ...stateRejections.map((rejection) => ({
        code: 'desktop-stored-state-invalid' as const,
        severity: 'error' as const,
        authorityKey: rejection.authorityKey,
        rejectionId: rejection.rejectionId,
        message: `Stored Desktop state '${rejection.authorityKey}' was rejected: ${rejection.diagnostic}`,
      })),
      ...applicationSettingsStateDiagnostics,
      ...(agentRuntimeSettingsDiagnostic
        ? [
            {
              code: 'desktop-shell-component-invalid' as const,
              severity: 'error' as const,
              component: 'agent-runtime-settings' as const,
              message: agentRuntimeSettingsDiagnostic.message,
            },
          ]
        : []),
    ],
  });
  const generationRuntime = new WorkspaceGenerationApplicationRuntime({
    createOwner: async ({ workspaceId, workspaceRoot }) => {
      const configManager = workspaceConfigAuthority.getWorkspaceConfig({
        workspaceId,
        workspacePath: workspaceRoot,
      });
      const media = createMediaPlatform({
        configManager,
        requestAssetMaterializer: createContentReadMediaRequestAssetMaterializer({
          contentRead: createNodeHostContentReadService({ workspaceRoot }),
          encodeBase64: (bytes) => Buffer.from(bytes).toString('base64'),
        }),
      });
      return createNodeWorkspaceGenerationJobOwner({
        workspaceId,
        workspaceRoot,
        homedir,
        execution: media.service,
      });
    },
  });
  const agentCatalogReader = await NodePiConversationCatalogReader.create({
    userDataRoot: globalStorage.root,
  });
  const agentComposition = createAgentAppHost({
    userDataRoot: globalStorage.root,
    userHome: homedir,
    hostId: `electron:${applicationInstanceId}`,
    credentialRuntime,
    catalogReader: agentCatalogReader,
    resolveWorkspaceGenerationJobs: (workspace) =>
      generationRuntime.getWorkspaceJobs({
        workspaceId: workspace.workspaceId,
        workspaceRoot: workspace.workspacePath,
      }),
    assistantSpaceIds: [assistantSpaceId],
    creatorVisibleArtifactDelivery: workspaceBoardDelivery,
    createWorkspaceLogger: (workspace) => {
      if (workspace.workspaceId === assistantSpaceId) return agentLogger;
      const existing = workspaceLoggers.get(workspace.workspaceId);
      if (existing) return existing;
      const workspaceLogger = new ConsoleLogger('Workspace', LogLevel.Info, [
        consoleTransport,
        createManagedLogTransport(
          `Workspace '${workspace.workspaceId}'`,
          resolveManagedLogFile(homedir, {
            kind: 'workspace',
            workspaceId: workspace.workspaceId,
          }),
        ),
      ]);
      workspaceLoggers.set(workspace.workspaceId, workspaceLogger);
      return workspaceLogger;
    },
    builtinSkillRoot: resolveDesktopBuiltinSkillRoot({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }),
  });
  const assistantSpaceRoot = path.join(globalStorage.root, 'assistant-spaces', 'local-user');
  await mkdir(assistantSpaceRoot, { recursive: true });
  const assistantWorkspace = {
    workspaceId: assistantSpaceId,
    workspacePath: assistantSpaceRoot,
    displayName: 'Assistant',
    locator: { kind: 'relative' as const, value: 'assistant-spaces/local-user' },
  };
  await agentComposition.attachWorkspace(assistantWorkspace);
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
    initialExtensionSnapshot,
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
  const textEditorRuntime = new DesktopTextEditorRuntime({
    shell: shellService,
    referenceCatalog: createNodeTextEditorMarkdownReferenceCatalog({
      files: host.files,
      resolveWorkspace: (workspaceId) => shellService.resolveAgentWorkspace(workspaceId),
    }),
  });
  const cutRuntime = new DesktopCutRuntime({
    shell: shellService,
    host,
    resources: resourceRegistry,
    draftLabel: app.getLocale().toLocaleLowerCase().startsWith('zh')
      ? '未命名剪辑'
      : 'Untitled Cut',
    selectDraftDestination: async ({ identity, workspacePath, defaultName }) => {
      const owner = requireOwnerWindow(identity.windowId);
      const result = await dialog.showSaveDialog(owner, {
        title: app.getLocale().toLocaleLowerCase().startsWith('zh') ? '保存剪辑' : 'Save Cut',
        defaultPath: path.join(workspacePath, defaultName),
        filters: [{ name: 'OpenTimelineIO', extensions: ['otio'] }],
      });
      if (result.canceled || !result.filePath) return undefined;
      const relativePath = path.relative(workspacePath, result.filePath);
      if (
        !relativePath ||
        path.isAbsolute(relativePath) ||
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`)
      ) {
        throw new Error('Desktop Cut document target must remain inside the granted workspace.');
      }
      return relativePath.split(path.sep).join('/');
    },
    confirmDiscardDraft: async ({ identity, label }) => {
      const owner = requireOwnerWindow(identity.windowId);
      const usesChinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showMessageBox(owner, {
        type: 'warning',
        title: usesChinese ? '放弃未保存的剪辑？' : 'Discard unsaved Cut?',
        message: usesChinese
          ? `“${label}”尚未保存。是否放弃更改？`
          : `“${label}” has not been saved. Discard changes?`,
        buttons: usesChinese ? ['取消', '放弃'] : ['Cancel', 'Discard'],
        defaultId: 0,
        cancelId: 0,
      });
      return result.response === 1;
    },
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
  const canvasGenerationRuntime = new CanvasGenerationNodeRuntime({
    generation: generationRuntime,
  });
  const canvasRuntime = new DesktopCanvasRuntime({
    shell: shellService,
    host,
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    materialActionLabels: {
      preview: canvasUsesChineseLabels ? '预览' : 'Preview',
      reveal: canvasUsesChineseLabels ? '在访达中显示' : 'Reveal in Finder',
      openInCut: canvasUsesChineseLabels ? '打开剪辑' : 'Open Cut',
      addToCut: canvasUsesChineseLabels ? '添加到剪辑' : 'Add to Cut',
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
          viewInstanceId: identity.viewInstanceId,
          rendererSessionId: identity.rendererSessionId,
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
        capabilities: ['open-creative-document'],
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
        capabilities: ['open-creative-document'] as const,
      };
      await cutRuntime.openAlongsideCanvas({
        identity: {
          projectId: identity.projectId,
          workspaceId: identity.workspaceId,
          windowId: identity.windowId,
          viewId: `canvas-material:${identity.viewId}`,
          viewInstanceId: identity.viewInstanceId,
          rendererSessionId: identity.rendererSessionId,
        },
        item,
        absolutePath,
      });
    },
    resolveAddToCut: async ({ identity }) =>
      createDesktopCutCanvasHandoffPayload(await cutRuntime.resolveCanvasHandoffTarget(identity)),
    addToCut: async ({ identity, target, executionPayload }) => {
      const label =
        target.locator.kind === 'workspace-file' || target.locator.kind === 'generated-output'
          ? path.posix.basename(target.locator.path)
          : target.nodeId;
      await cutRuntime.addCanvasMaterial({
        identity,
        nodeId: target.nodeId,
        label,
        locator: target.locator,
        target: parseDesktopCutCanvasHandoffPayload(executionPayload),
      });
    },
    createPreviewVariant: ({ absolutePath }) =>
      createDesktopThumbnailDataUrl(absolutePath, { width: 640, height: 400 }),
  });
  const resourceBrowser = new ResourceBrowserNodeRuntime({
    globalAssetRoot: globalStorage.assets,
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    assetLibraryMemberships: metadataRepositories.assetLibraryMemberships,
    localMetadataRepositories: metadataRepositories,
    refreshEntityProjections: (workspace) => entityProjectionRuntime.refresh(workspace),
    shell: shellService,
    host,
    canvas: canvasRuntime,
    cut: {
      addResource: (input) => cutRuntime.addResource(input).then(() => undefined),
    },
    entity: {
      executeIntent: ({ intent, workspace }) =>
        new NodeProjectEntityInspectorRuntime({
          workspace,
          projections: workspaceRegistry.metadataRepositories?.entityAssetProjections,
        }).execute(intent),
    },
    openPreview: (input) => previewRuntime.open(input).then(() => undefined),
    openTextEditor: (input) => textEditorRuntime.open(input).then(() => undefined),
    openQuickPreview: (input) => previewRuntime.openQuickPreview(input),
    releaseQuickPreview: (windowId, previewSessionId) =>
      previewRuntime.releaseQuickPreview(windowId, previewSessionId),
    openCreativeDocument: (input) =>
      input.kind === 'canvas'
        ? openDesktopCanvasDocument({ shell: shellService, ...input })
        : cutRuntime.open(input),
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
    trashWorkspaceItem: (absolutePath) => shell.trashItem(absolutePath),
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
    selectGlobalLibraryMoveDestination: async ({ windowId, owner, defaultPath }) => {
      const desktopWindow = requireOwnerWindow(windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showOpenDialog(desktopWindow, {
        title: chinese ? '选择移动目标目录' : 'Choose Move Destination',
        buttonLabel: chinese ? '移动到这里' : 'Move Here',
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
        message:
          owner === 'global-asset-library'
            ? chinese
              ? '目标目录必须位于资产库内。'
              : 'The destination must remain inside the Asset Library.'
            : chinese
              ? '目标目录必须位于当前媒体库内。'
              : 'The destination must remain inside the current Media Library.',
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop Asset Center move picker returned no directory.');
      }
      return selectedPath;
    },
  });
  const assetCenter = new AssetCenterNodeRuntime({
    resourceBrowser,
    resources: {
      registerFile: async (owner, resource) => {
        const shellProjection = await shellService.getProjection(owner.windowId);
        return resourceRegistry.registerFile(
          {
            windowId: owner.windowId,
            viewId: owner.viewId,
            sessionId: owner.sessionId,
            rendererSessionId: shellProjection.rendererSessionId,
          },
          {
            absolutePath: resource.absolutePath,
            mediaType: resource.mediaType,
          },
        );
      },
      releaseSession: (sessionId) => resourceRegistry.releaseSession(sessionId),
    },
  });
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
  const conversationReferenceResolver = createDesktopAgentConversationReferenceResolver({
    authorizeWorkspace: async (binding) => {
      await workspaceGrantAuthority.resolveAuthorizedWorkspace(
        binding.workspaceGrantId,
        binding.workspaceId,
      );
    },
  });
  const agentControllerComposition = createAgentControllerComposition({
    host,
    userHome: homedir,
    credentialRuntime,
    resolveWorkspaceConfig: ({ workspaceId, workspacePath }) =>
      workspaceConfigAuthority.getWorkspaceConfig({ workspaceId, workspacePath }),
    resources: {
      registerFile: (owner, source) =>
        resourceRegistry.registerFile(
          {
            windowId: owner.windowId,
            viewId: owner.viewId,
            sessionId: owner.sessionId,
            rendererSessionId: owner.connectionId,
          },
          {
            absolutePath: source.absolutePath,
            mediaType: source.mediaType,
          },
        ),
    },
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
    searchLinkedMediaLibraryFiles: (workspace, input) =>
      searchWorkspaceLinkedMediaLibraryContentLocators({
        workspace,
        files: host.files,
        query: input.query,
        limit: input.limit,
      }),
    configInteraction: {
      openUserConfig: async ({ identity, absolutePath }) => {
        requireOwnerWindow(identity.windowId);
        await openHostPath(absolutePath);
      },
    },
    conversationReferences: conversationReferenceResolver,
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
    config: workspaceConfigAuthority.getApplicationConfig(),
    readTextResource: (hostResource) => host.files.readText(hostResource),
    workspaceMentions: {
      search: async ({ binding, filter }) => {
        const resolution = await workspaceGrantAuthority.resolveAuthorizedWorkspace(
          binding.workspaceGrantId,
          binding.workspaceId,
        );
        const projection = await searchAgentWorkspaceMentions({
          workspace: resolution.workspace,
          host,
          filter,
          purpose: 'entry',
          searchLinkedMediaLibraryFiles: (input) =>
            searchWorkspaceLinkedMediaLibraryContentLocators({
              workspace: resolution.workspace,
              files: host.files,
              query: input.query,
              limit: input.limit,
            }),
          reportMentionContributorError: (error) => {
            host.diagnostics?.report({
              code: 'desktop-agent-media-library-mention-search-failed',
              severity: 'error',
              message: error.message,
              metadata: { workspaceId: resolution.workspace.workspaceId },
            });
          },
        });
        return {
          filter: projection.filter,
          files: projection.files,
          mentionExtras: projection.mentionExtras,
        };
      },
    },
    readWorkspaceSkillCatalog: async (binding) => {
      const resolution = await workspaceGrantAuthority.resolveAuthorizedWorkspace(
        binding.workspaceGrantId,
        binding.workspaceId,
      );
      const workspace =
        agentComposition.getWorkspace(binding.workspaceId) ??
        (await agentComposition.attachWorkspace(resolution.workspace));
      return workspace.readSkillCatalog(true);
    },
    resolveWorkspaceReferenceContext: async ({ binding, reference }) => {
      if (reference.kind === 'entity') {
        await workspaceGrantAuthority.resolveAuthorizedWorkspace(
          binding.workspaceGrantId,
          binding.workspaceId,
        );
        return {
          type: reference.entity.type === 'character' ? 'character' : 'entity',
          id: reference.entity.id,
          label: reference.entity.label,
          summary: reference.entity.summary,
          data: {
            source: reference.entity.source ?? 'entity-graph',
            ...(reference.entity.entityType === undefined
              ? {}
              : { entityType: reference.entity.entityType }),
          },
        };
      }
      if (reference.file.type !== 'file') {
        throw new Error(
          `Agent Workspace reference '${reference.file.name}' is not a readable file.`,
        );
      }
      const [resolved] = await conversationReferenceResolver.resolveWorkspaceReferences({
        context: binding,
        references: [
          {
            id: JSON.stringify(reference.file.locator),
            contentLocator: reference.file.locator,
            label: reference.file.name,
            ...(reference.file.mediaType === undefined
              ? {}
              : { mediaType: reference.file.mediaType }),
            ...(reference.file.source === undefined ? {} : { source: reference.file.source }),
          },
        ],
      });
      if (!resolved) {
        throw new Error(`Agent Workspace reference '${reference.file.name}' was not resolved.`);
      }
      return resolved;
    },
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
  const agentDomainBindings = createAgentDomainBindingApplicationService({
    assistant: {
      resolve: async (binding) =>
        binding.assistantSpaceId === assistantWorkspace.workspaceId
          ? { status: 'available', binding, contextPayloads: [] }
          : {
              status: 'unavailable',
              diagnostic: {
                code: 'assistant-space-unavailable',
                owner: `assistant:${binding.assistantSpaceId}`,
                message: `Assistant Space '${binding.assistantSpaceId}' is unavailable.`,
              },
            },
    },
    workspace: {
      resolve: async (binding) => {
        await workspaceGrantAuthority.resolveAuthorizedWorkspace(
          binding.workspaceGrantId,
          binding.workspaceId,
        );
        return { status: 'available', binding, contextPayloads: [] };
      },
    },
  });
  const resolveScratchRoot = (ref: {
    readonly conversationId: string;
    readonly scratchArtifactId: string;
  }): string =>
    path.join(globalStorage.root, 'assistant-scratch', ref.conversationId, ref.scratchArtifactId);
  const resolveConversationWorkspace = async (context: AgentBoundDomainBinding) => {
    if (context.kind === 'assistant') {
      return agentComposition.attachWorkspace(assistantWorkspace);
    }
    if (context.kind !== 'workspace') {
      throw new Error(`Desktop ${context.kind} Conversation provider is unavailable.`);
    }
    return (
      agentComposition.getWorkspace(context.workspaceId) ??
      (await agentComposition.attachWorkspace(
        (
          await workspaceGrantAuthority.resolveAuthorizedWorkspace(
            context.workspaceGrantId,
            context.workspaceId,
          )
        ).workspace,
      ))
    );
  };
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
    domainContext: {
      resolveForTurn: async ({ conversationId, context, references }) => {
        const resolution = await agentDomainBindings.resolve(context);
        if (resolution.status === 'unavailable') {
          throw new Error(
            `[${resolution.diagnostic.owner}/${resolution.diagnostic.code}] ${resolution.diagnostic.message}`,
          );
        }
        const referenceContexts = await agentLaunch.resolveReferenceContexts(
          conversationId,
          context,
          references,
        );
        return [...resolution.contextPayloads, ...referenceContexts];
      },
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
    session: {
      materialize: async (request) => {
        const workspace = await resolveConversationWorkspace(request.context);
        await workspace.ensureConversation(request.conversationId, request.title);
      },
    },
    provider: {
      start: async (request) => {
        const workspace = await resolveConversationWorkspace(request.context);
        if (isAgentLaunchConversationCreationCommand(request.input)) {
          return;
        }
        if (!agentControllerComposition.startInitialTurn) {
          throw new Error('Agent initial-turn provider adapter is unavailable.');
        }
        const commandArtifactActivationId =
          request.input.kind === 'command'
            ? parseCommandArtifactHandlerId(request.input.handlerId)
            : undefined;
        await agentControllerComposition.startInitialTurn({
          workspace,
          conversationId: request.conversationId,
          turnId: request.turnId,
          messageText:
            request.input.kind === 'message' ? request.input.text : (request.input.args ?? ''),
          configuration: request.configuration,
          context: request.context,
          locale: 'en',
          contextPayloads: request.contextPayloads,
          ...(request.input.kind === 'skill'
            ? {
                skillName: request.input.skillName,
                skillActivationId: request.input.activationId,
                additionalInstructions: request.input.args,
              }
            : request.input.kind === 'command'
              ? {
                  skillName: request.input.commandId,
                  skillActivationId: commandArtifactActivationId,
                  additionalInstructions: request.input.args,
                }
              : {}),
        });
      },
    },
    reportError: (error) => {
      host.diagnostics?.report({
        code: 'desktop-agent-provider-execution-failed',
        severity: 'error',
        message: error.message,
      });
    },
    createIdentity: randomUUID,
    now: () => new Date().toISOString(),
  });
  const agentLaunchSubmission = createAgentLaunchDraftSubmissionApplicationService({
    launch: agentLaunch,
    entry: {
      materialize: async () => {
        const requested = {
          kind: 'assistant' as const,
          assistantSpaceId: assistantWorkspace.workspaceId,
          baseGrantIds: [] as const,
        };
        const resolution = await agentDomainBindings.resolve(requested);
        if (resolution.status === 'unavailable') {
          throw new Error(
            `[${resolution.diagnostic.owner}/${resolution.diagnostic.code}] ${resolution.diagnostic.message}`,
          );
        }
        if (resolution.binding.kind !== 'assistant') {
          throw new Error('Agent Entry owner materialized a non-Assistant binding.');
        }
        return resolution.binding;
      },
    },
    bindings: agentDomainBindings,
    lifecycle: conversationLifecycle,
    resources: {
      validate: ({ connection, conversationId, resourceGrantIds, references }) => {
        agentLaunch.validateResourceGrantCommit(connection, conversationId, resourceGrantIds);
        agentLaunch.validateReferenceCommit(connection, conversationId, references);
      },
      commit: async ({ connection, conversationId, resourceGrantIds, references }) => {
        await agentLaunch.commitResourceGrants(connection, conversationId, resourceGrantIds);
        agentLaunch.commitReferences(connection, conversationId, references);
      },
    },
    scene: {
      validate: async ({ connection, draftId, conversationId }) => {
        const surface = await shellService.resolveAgentSurfaceGrant(
          connection.windowId,
          connection,
        );
        if (
          surface.interaction.scope.draftId !== draftId ||
          (conversationId === undefined
            ? surface.interaction.phase !== 'draft' ||
              surface.interaction.agentViewId !== connection.viewId
            : surface.interaction.phase !== 'session' ||
              surface.interaction.scope.kind === 'unbound' ||
              surface.interaction.scope.conversationId !== conversationId)
        ) {
          throw new Error('Agent Draft submit is not the exact active Draft presentation.');
        }
      },
      handoff: async ({ connection, draftId, conversationId, context }) => {
        const projection = await shellService.getProjection(connection.windowId);
        await shellService.attachAgentConversation({
          windowId: connection.windowId,
          rendererSessionId: projection.rendererSessionId,
          agentViewId: connection.viewId,
          draftId,
          context,
          conversationId,
        });
      },
    },
    commands: {
      validate: (intent) => {
        if (isAgentLaunchConversationCreationCommand(intent)) {
          if (intent.args !== undefined) {
            throw new Error('Agent Draft command /new does not accept arguments.');
          }
          return;
        }
        parseCommandArtifactHandlerId(intent.handlerId);
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
  const projectManagement = new DesktopProjectManagementService({
    shell: shellService,
    conversations: {
      deleteConversations: async (conversations) => {
        for (const conversation of conversations) {
          await agentComposition.deleteConversation(conversation.conversationId);
        }
      },
    },
  });
  const appHost = new DesktopAppHost({
    host,
    logger,
    shell: shellService,
    projectManagement,
    agent: agentComposition,
    assistantWorkspace,
    agentControllerComposition,
    agentLaunch,
    agentLaunchSubmission,
    generationLifecycle: generationRuntime,
    resolveDirectGeneration: async (workspace) => {
      const config = workspaceConfigAuthority.getWorkspaceConfig({
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath,
      });
      const jobs = await generationRuntime.getWorkspaceJobs({
        workspaceId: workspace.workspaceId,
        workspaceRoot: workspace.workspacePath,
      });
      return createDirectGenerationOperationPort({
        jobs,
        bindings: {
          validate: ({ purpose, providerId, modelId }) => {
            const provider = config.getProvider(providerId);
            const model = config.getModel(modelId);
            if (!provider || provider.enabled === false) {
              throw new Error(`Direct Generation provider '${providerId}' is unavailable.`);
            }
            if (!model || model.enabled === false || model.providerId !== providerId) {
              throw new Error(
                `Direct Generation model '${modelId}' is not available from provider '${providerId}'.`,
              );
            }
            if (!modelSupportsPurpose(model, purpose)) {
              throw new Error(
                `Direct Generation model '${modelId}' does not support purpose '${purpose}'.`,
              );
            }
          },
        },
      });
    },
    workspaceConfigLifecycle: workspaceConfigAuthority,
    workspaceGrants: workspaceGrantAuthority,
    conversationLifecycle,
    assistantResources,
    assistantPreviewLifecycle: assistantPreview,
    resourceBrowser,
    assetCenter,
    projectPortability,
    preview: previewRuntime,
    textEditor: textEditorRuntime,
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
      const selectedPath =
        (functionalWorkspace
          ? await consumeDesktopFunctionalWorkspaceSelection({
              argv: process.argv,
              fixtureHome: homedir,
            })
          : undefined) ??
        functionalWorkspace ??
        (await chooseWorkspaceDirectory(owner));
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
              hasShadow: false,
              titleBarStyle: 'hiddenInset' as const,
              trafficLightPosition: { x: 18, y: 16 },
            }
          : {}),
        webPreferences: {
          ...createDesktopWebPreferences(path.join(__dirname, 'preload.cjs')),
          ...(agentAutomationLaunch
            ? { additionalArguments: [DESKTOP_AGENT_AUTOMATION_RENDERER_ARGUMENT] }
            : {}),
        },
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
        desktopRendererContentSecurityPolicyOptions(Boolean(developmentUrl)),
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
        appHost.shell.setRendererSessionId(registration.windowId, event.rendererSessionId);
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
      let textEditorCloseApproved = false;
      let textEditorClosePromptActive = false;
      createdWindow.on('close', (closeEvent) => {
        if (
          !textEditorCloseApproved &&
          !shutdownStarted &&
          textEditorRuntime.hasDirtySessions(registration.windowId)
        ) {
          closeEvent.preventDefault();
          if (textEditorClosePromptActive) return;
          textEditorClosePromptActive = true;
          void promptTextEditorClose(createdWindow)
            .then(async (decision) => {
              if (decision === 'cancel') return;
              const result = await textEditorRuntime.closeWindow(registration.windowId, decision);
              if (result !== 'closed') return;
              textEditorCloseApproved = true;
              createdWindow.close();
            })
            .catch((error: unknown) => {
              appHost.reportError(
                'desktop-text-editor-close-failed',
                'Desktop Text Editor could not complete the Window close decision.',
                error,
              );
            })
            .finally(() => {
              textEditorClosePromptActive = false;
            });
          return;
        }
        const event = appHost.windows.windowClosing(
          registration.windowId,
          appHost.applicationIdentity.instanceId,
        );
        sendLifecycleEvent(createdWindow, event);
      });
      createdWindow.on('focus', () => {
        void resourceBrowser.reconcileWindow(registration.windowId).catch((error: unknown) => {
          appHost.reportError(
            'desktop-resource-browser-focus-reconciliation-failed',
            `Failed to reconcile Resource Browser for Window '${registration.windowId}'.`,
            error,
          );
        });
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
    void closeDirtyTextEditorsForApplication()
      .then(async (proceed) => {
        if (!proceed) {
          shutdownStarted = false;
          return;
        }
        await shutdownDesktop();
        shutdownComplete = true;
        app.quit();
      })
      .catch((error: unknown) => {
        shutdownStarted = false;
        appHost.reportError(
          'desktop-shutdown-failed',
          'Desktop shutdown did not release every owned resource.',
          error,
        );
      });
  });

  await createWindow();

  async function shutdownDesktop(): Promise<void> {
    await closeDesktopWindows(BrowserWindow.getAllWindows());
    nativeThemeController.dispose();
    disposeIpc();
    await appHost.dispose();
    await entityProjectionRuntime.dispose();
    await localMetadataStore.dispose();
    resourceRegistry.dispose();
    disposeResourceAuthorization();
    disposeProtocol();
    for (const transport of managedLogTransports) transport.dispose();
    managedLogTransports.clear();
    workspaceLoggers.clear();
  }

  async function closeDirtyTextEditorsForApplication(): Promise<boolean> {
    for (const [windowId, owner] of windowsById) {
      if (owner.isDestroyed() || !textEditorRuntime.hasDirtySessions(windowId)) continue;
      const decision = await promptTextEditorClose(owner);
      if (decision === 'cancel') return false;
      if ((await textEditorRuntime.closeWindow(windowId, decision)) !== 'closed') return false;
    }
    return true;
  }

  async function promptTextEditorClose(
    owner: BrowserWindow,
  ): Promise<import('@neko/text-editor-domain').TextDocumentCloseDecision> {
    const zh = app.getLocale().toLocaleLowerCase().startsWith('zh');
    const result = await dialog.showMessageBox(owner, {
      type: 'warning',
      title: zh ? '保存文档更改' : 'Save document changes',
      message: zh ? '文档包含未保存的更改。' : 'A document has unsaved changes.',
      detail: zh
        ? '关闭前保存、更改后放弃，或取消并返回编辑器。'
        : 'Save before closing, discard the changes, or cancel and return to the editor.',
      buttons: zh ? ['保存', '放弃', '取消'] : ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel';
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

function parseCommandArtifactHandlerId(handlerId: string): string {
  const prefix = 'command-artifact:';
  if (!handlerId.startsWith(prefix) || handlerId.length === prefix.length) {
    throw new Error(`Agent Draft command has no registered launch handler '${handlerId}'.`);
  }
  return handlerId.slice(prefix.length);
}
