import { createHash, randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
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
  webContents,
} from 'electron';
import { ConsoleLogger, ConsoleTransport, LogLevel, type ILogger } from '@neko/shared/logger';
import { ManagedFileLogTransport } from '@neko/shared/logger/node';
import {
  createNodeTextEditorMarkdownReferenceCatalog,
  NodeTextEditorMarkdownMediaService,
} from '@neko/text-editor-node';
import { modeForTextDocument } from '@neko/text-editor-domain';
import { DESKTOP_BRIDGE_CHANNELS, type DesktopLifecycleEvent } from '../shared/bridge-contract';
import {
  DESKTOP_SHELL_CHANNELS,
  resolveDesktopWindowWorkspaceWorkbench,
  type DesktopShellProjectionEvent,
} from '@neko/host/desktop-shell-contract';
import { closeMainView } from '@neko/host/desktop-workbench-contract';
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
  desktopRendererContentSecurityPolicyOptions,
  DESKTOP_APP_ORIGIN,
  createDesktopWebPreferences,
} from './security';
import { DesktopShellService } from '@neko/host/desktop-shell-service';
import { DesktopProjectRegistrationService } from '@neko/host/desktop-project-registration-service';
import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
  serializeDesktopShellStoredState,
} from '@neko/host/desktop-shell-state';
import {
  createAgentRuntimeSettingsAuthority,
  createAgentPromptImageAdmissionService,
  createAgentRuntimeSettingsRepository,
  createPersistentAgentConversationContextAuthority,
  createDshDomainConversationService,
  createDshConversationTurnContextResolver,
  createDshTurnCanvasTargetOwner,
  createDshConversationCanvasSelection,
  createDshCanvasArtifactDeliveryService,
  projectDshConversationTitle,
  type DshDomainConversationService,
} from '@neko/agent-runtime/application';
import {
  canvasGenerationModelSupportsPurpose,
  createCanvasWorkspaceIndexService,
  projectCanvasGenerationModels,
} from '@neko/canvas-domain';
import { createCanvasWorkspaceIndexNodeAdapter } from '@neko/canvas-node';
import { createPersistentExportJobStore, initializeExportJobTables } from '@neko/cut-node';
import { createCharacterAgentConversationAdapter } from './character-agent-conversation-adapter';
import { DesktopCharacterAvatarRuntime } from './desktop-character-avatar-runtime';
import { setRootLogger as setAgentRootLogger } from '@neko/agent-runtime';
import { NodeVideoThumbnail } from '@neko/media/node';
import {
  NodeProjectEntityAuthoringService,
  readProjectEntityResources,
  readProjectEntityManagementResources,
} from '@neko/entity-node';
import { createDesktopGenerationExecutionProviderResolver } from './desktop-generation-execution-provider';
import { createEncryptedDesktopSecretPort } from './encrypted-desktop-secret-port';
import {
  createDshCanvasArtifactContentRead,
  DesktopDshCanvasArtifactDelivery,
} from './desktop-dsh-canvas-artifact-delivery';
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
  CharacterGlobalCatalogFileRepository,
  createCharacterAuthoringFileRepository,
  createCharacterPortableArchivePort,
  createPersistentCharacterRuntimeRepositories,
  initializeCharacterRuntimePersistenceTables,
} from '@neko/chara-node';
import {
  WorldGlobalCatalogFileRepository,
  createPersistentWorldRuntimeRepositories,
  createWorldAuthoringFileRepository,
  createWorldPortableArchivePort,
  createWorldPortableWorkspaceRepository,
  initializeWorldRuntimePersistenceTables,
} from '@neko/world-node';
import {
  WorldAuthoringHostService,
  createWorldFoundationActionHandlers,
  WorldAuthoringService,
  WorldDshAuthoringService,
  WorldGlobalCatalogService,
  WorldManagementService,
  WorldPortablePackageService,
  WorldRuntimeService,
  WorldRuntimeWorkbenchService,
} from '@neko/world-domain/application';
import {
  CharacterAuthoringService,
  CharacterDshAuthoringService,
  CharacterCreationSourceService,
  CharacterAuthoringHostService,
  CharacterAvatarAuthorityService,
  CharacterCompanionContinuityService,
  CharacterConversationLaunchService,
  CharacterFoundationCommandService,
  CharacterFoundationService,
  CharacterGlobalCatalogService,
  CharacterVersionReferenceInventoryService,
  CharacterVersionDeletionService,
  CharaOwnedCharacterVersionReferenceReader,
  CharacterInteractionService,
  CharacterPresentationService,
  CharacterPortablePackageService,
  CharacterRoomInteractionService,
  CharacterRoomService,
  CharacterStorylineService,
  createCharacterDurableCatalogPort,
  UserCharacterRelationshipService,
} from '@neko/chara-domain/application';
import {
  ProjectAuthoringNavigationService,
  ProjectCharacterVersionReferenceReader,
  ProjectCompositionService,
  ProjectCompositionCommitService,
  ProjectContentService,
  ProjectCreativeWorkspaceService,
  ProjectGlobalReferenceMutationService,
  ProjectDependencyService,
  ProjectLocalAuthoringService,
  ProjectWorkspaceObjectMutationService,
} from '@neko/project-domain/application';
import {
  ProjectEntityCharacterAssociationRepository,
  ProjectLocalAuthoringCommitRepository,
  ProjectMembershipRepository,
} from '@neko/project-node';
import type { ProjectGlobalReference } from '@neko/project-domain/contracts';
import { createDesktopCharacterCreationSourceAuthority } from './desktop-character-creation-source-authority';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  AssetCenterNodeRuntime,
  ResourceBrowserNodeRuntime,
  WorkspaceAssetMaterializationService,
  createProjectContentReadService,
  readProjectContentReferences,
  resolveProjectWorkspaceContentLocator,
  type ResourceBrowserNodeRuntimeOptions,
} from '@neko/assets-node';
import {
  DesktopResourceRegistry,
  registerDesktopResourceRequestAuthorization,
} from './desktop-resource-registry';
import { DesktopPreviewRuntime } from './desktop-preview-runtime';
import { DesktopTextEditorRuntime } from './desktop-text-editor-runtime';
import {
  CanvasAudioExtractionService,
  CanvasGenerationNodeRuntime,
  listAvailableProjectMediaLibraryDestinations,
} from '@neko/canvas-node';
import {
  CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES,
  type CanvasHostRuntimeIdentity,
} from '@neko/canvas-domain';
import { resolveGenerationModelParameterProfile } from '@neko/generation-domain';
import { GenerationApplicationRuntime } from '@neko/generation-domain/job';
import {
  PromptGenerationService,
  createAiSdkPromptCompletionPort,
} from '@neko/generation-domain/prompt';
import { GENERATION_PROVIDER_CAPABILITIES } from '@neko/generation-domain/provider-capabilities';
import { createMediaPlatform, createNodeGenerationJobOwner } from '@neko/generation-domain/media';
import { createNodeHostContentReadService } from '@neko/content-domain/node';
import { createNodeDocumentLowLevelAccess } from '@neko/content-domain/document/node';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import { isWorkspaceFileContentLocator, type ContentLocator } from '@neko/content-domain';
import {
  createPreviewResourceProjectionService,
  type PreviewResourceSource,
} from '@neko/preview-domain/resource-projection';
import { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import { DesktopCutRuntime } from './desktop-cut-runtime';
import { createDesktopGenerationRequestAssetMaterializer } from './desktop-generation-request-asset-materializer';
import { createCutCanvasHandoffPayload, parseCutCanvasHandoffPayload } from '@neko/cut-domain';
import { openDesktopCanvasDocument } from './desktop-creative-document-runtime';
import { createDesktopNativeThemeController } from './desktop-native-theme';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
  readDesktopApplicationSettingsStateDiagnostics,
  serializeDesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-state';
import { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import { DesktopAiModelSettingsService } from '@neko/host/ai-model-settings-service';
import { projectDesktopDshProviderCapability } from './desktop-dsh-provider-capability-projection';
import { DesktopStorageSettingsRuntime } from './desktop-storage-settings-runtime';
import {
  DESKTOP_APPLICATION_SETTINGS_CHANNELS,
  type DesktopApplicationSettingsProjectionEvent,
} from '@neko/host/application-settings';
import { buildConfigFilePath } from '@neko/host/files';
import {
  FileProviderCredentialSource,
  FileUserConfigManager,
  ProviderCredentialAuthority,
  WorkspaceConfigManagerAuthority,
} from '@neko/host/settings';
import {
  listGlobalMediaLibraryConnections,
  resolveGlobalMediaLibraryTarget,
} from '@neko/assets-node';
import { ProjectPortabilityRuntime } from '@neko/assets-node';
import { DesktopWorkspaceGrantAuthority } from '@neko/host/desktop-workspace-grant-authority';
import { DSH_PERMISSION_CHANGED_CHANNEL } from '@neko/agent-contracts/dsh-permission-host';
import type { DshAcpProviderCapabilityProjection } from '@neko/agent-contracts/dsh-acp';
import {
  DSH_SESSION_CHANGED_CHANNEL,
  type DshComposerSubmitInput,
} from '@neko/agent-contracts/dsh-session-host';
import {
  DSH_RUNTIME_CHANGED_CHANNEL,
  type DshRuntimeHostProjection,
} from '@neko/agent-contracts/dsh-runtime-host';
import { startDesktopDshProductRuntime } from './desktop-dsh-runtime-bootstrap';
import { resolveDesktopBuiltinSkillRoot } from './desktop-builtin-skill-root';
import {
  createDesktopDshProductHandlers,
  type DesktopDshProductHandlerAssembly,
} from './desktop-dsh-product-handlers';
import { DesktopDshPermissionHost } from './desktop-dsh-permission-host';
import { createDesktopDshComposerConfiguration } from './desktop-dsh-composer-configuration';
import { DesktopDshSessionHost } from './desktop-dsh-session-host';
import { createDesktopDshPromptReferenceBytePort } from './desktop-dsh-prompt-reference-byte-port';
import { resolveDesktopDshSessionEventAdmission } from './desktop-dsh-turn-canvas-event-admission';
import {
  resolveDesktopDshConversationContext,
  resolveDesktopDshSurfaceConversationContext,
} from './desktop-dsh-conversation-context';
import { DesktopDshRuntimeHost } from './desktop-dsh-runtime-host';
import { DesktopDshExtensionManagementHost } from './desktop-dsh-extension-management-host';
import { createDesktopDshSkillAuthoringService } from './desktop-dsh-skill-authoring';
import { importPersonalDshSkill } from './desktop-dsh-skill-import';
import {
  COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
  createPersistentProfessionalApplicationBindingRepository,
  createProfessionalApplicationService,
  initializeProfessionalApplicationBindingTables,
} from '@neko/professional-apps-node';
import {
  createDesktopProfessionalApplicationNativePort,
  DesktopProfessionalApplicationAdapter,
  DesktopUnavailableProfessionalApplicationContentAuthorization,
} from './desktop-professional-application-adapters';
import { DesktopProfessionalApplicationHost } from './desktop-professional-application-host';
import { createDesktopDshProviderRuntimeProjection } from './desktop-dsh-provider-runtime';
import { createDesktopResourceBrowserIdentity } from '../shared/resource-browser-bridge-contract';

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
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await startDesktop();
}

async function startDesktop(): Promise<void> {
  await app.whenReady();
  if (process.platform === 'darwin' && !app.isPackaged) {
    const dock = app.dock;
    if (!dock) throw new Error('macOS Desktop Dock is unavailable after app readiness.');
    dock.setIcon(path.join(app.getAppPath(), 'resources', 'app-icon.png'));
  }

  const userData = app.getPath('userData');
  const homedir = app.getPath('home');
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
    await initializeProfessionalApplicationBindingTables(localMetadataStore);
    await initializeCharacterRuntimePersistenceTables(localMetadataStore);
    await initializeWorldRuntimePersistenceTables(localMetadataStore);
    agentRuntimeSettings = await createAgentRuntimeSettingsAuthority({
      scopeId: assistantSpaceId,
      repository: agentRuntimeSettingsRepository,
    });
  } catch (error) {
    await localMetadataStore.dispose();
    throw error;
  }
  const applicationSettings = new DesktopApplicationSettingsService(applicationSettingsRepository);
  const professionalApplicationBindings = createPersistentProfessionalApplicationBindingRepository({
    store: localMetadataStore,
  });
  const characterGlobalCatalog = new CharacterGlobalCatalogFileRepository(globalStorage.root);
  const worldGlobalCatalog = new WorldGlobalCatalogFileRepository(globalStorage.root);
  const characterGlobalCatalogService = new CharacterGlobalCatalogService({
    repository: characterGlobalCatalog,
  });
  const worldGlobalCatalogService = new WorldGlobalCatalogService({
    repository: worldGlobalCatalog,
  });
  const characterRuntimeRepositories = createPersistentCharacterRuntimeRepositories({
    metadataStore: localMetadataStore,
    publications: characterGlobalCatalog,
  });
  const worldRuntimeRepositories = createPersistentWorldRuntimeRepositories({
    metadataStore: localMetadataStore,
    publications: worldGlobalCatalog,
  });
  const worldManagement = new WorldManagementService({
    globalCatalog: worldGlobalCatalog,
    runtime: worldRuntimeRepositories.catalog,
  });
  const initialApplicationSettings = await applicationSettings.initialize();
  const applicationSettingsStateDiagnostics = readDesktopApplicationSettingsStateDiagnostics(
    await applicationSettingsRepository.read(),
  );
  const agentRuntimeSettingsDiagnostic = agentRuntimeSettings.diagnostic();
  nativeTheme.themeSource = initialApplicationSettings.preferences.theme;
  const applicationInstanceId = randomUUID();
  const secrets = createEncryptedDesktopSecretPort({
    filePath: path.join(userData, 'secrets', 'provider-credentials.json'),
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
  await initializeExportJobTables(localMetadataStore);
  const metadataRepositories = workspaceRegistry.metadataRepositories;
  if (!metadataRepositories) {
    throw new Error('Desktop runtime requires the local metadata repositories.');
  }
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
  const providerCredentials = new ProviderCredentialAuthority(
    secrets,
    new FileProviderCredentialSource({
      filePath: buildConfigFilePath(homedir),
    }),
  );
  const applicationAgentConfig = workspaceConfigAuthority.getApplicationConfig();
  const dshDialogueCapabilities: {
    current?: () => Promise<DshAcpProviderCapabilityProjection>;
  } = {};
  const aiModelSettings = new DesktopAiModelSettingsService(
    applicationAgentConfig,
    providerCredentials,
    {
      read: async () => {
        const read = dshDialogueCapabilities.current;
        if (read === undefined) {
          throw new Error('Desktop DSH Provider capability authority is not initialized.');
        }
        const projection = await read();
        return {
          status: 'available' as const,
          providers: projection.providers.map(projectDesktopDshProviderCapability),
          protocols: projection.protocols,
          diagnostics: projection.diagnostics.map((diagnostic) => diagnostic.message),
        };
      },
    },
    { read: () => GENERATION_PROVIDER_CAPABILITIES },
  );
  const storageSettings = new DesktopStorageSettingsRuntime({
    homedir,
    repositories: metadataRepositories,
    applicationSettings,
    selectDirectory: async (defaultPath) => {
      const selection = await dialog.showOpenDialog({
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      return selection.canceled ? undefined : selection.filePaths[0];
    },
    openDirectory: async (targetPath) => {
      const error = await shell.openPath(targetPath);
      if (error) throw new Error(`Could not open storage directory: ${error}`);
    },
  });
  const retainedProjects = await workspaceRegistry.listProjects([assistantSpaceId]);
  const experimentalCreativeCapabilitiesReady = !app.isPackaged;
  const shellService = new DesktopShellService({
    applicationInstanceId,
    experimentalCreativeCapabilitiesReady,
    stateRepository: shellStateRepository,
    workspaceRegistry,
    workspaceGrantAuthority,
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
  const generationRuntime = new GenerationApplicationRuntime({
    createOwner: async ({ owner, root }) => {
      const configManager =
        owner.kind === 'workspace'
          ? workspaceConfigAuthority.getWorkspaceConfig({
              workspaceId: owner.workspaceId,
              workspacePath: root,
            })
          : workspaceConfigAuthority.getApplicationConfig();
      const providerResolver = createDesktopGenerationExecutionProviderResolver({
        config: configManager,
        credentials: providerCredentials,
      });
      const media = createMediaPlatform({
        configManager,
        providerResolver,
        requestAssetMaterializer: createDesktopGenerationRequestAssetMaterializer(root),
      });
      return createNodeGenerationJobOwner({
        owner,
        root,
        homedir,
        mediaExecution: media.service,
        promptExecution: new PromptGenerationService(
          configManager,
          providerResolver,
          createAiSdkPromptCompletionPort(),
        ),
      });
    },
  });
  const projectCharacterVersionReferences = new ProjectCharacterVersionReferenceReader({
    readDependencySnapshots: async (signal) => {
      const projects = await workspaceRegistry.listProjects([assistantSpaceId]);
      return await Promise.all(
        projects.map(async (project) => {
          signal?.throwIfAborted();
          if (project.unavailable) {
            throw new Error(
              `Project '${project.projectId}' is unavailable: ${project.unavailable.message}`,
            );
          }
          const workspace = await shellService.resolveAgentWorkspace(project.workspaceId);
          requireProjectIdentity(workspace.workspaceId, project.projectId);
          const characters = createCharacterAuthoringFileRepository({
            workspaceRoot: workspace.workspacePath,
            scope: { kind: 'project', projectId: project.projectId },
          });
          const worlds = createWorldAuthoringFileRepository({
            workspaceRoot: workspace.workspacePath,
            scope: { kind: 'project', projectId: project.projectId },
          });
          return await new ProjectDependencyService({
            characters,
            worlds,
            references: {
              readReferences: async (projectId) => {
                const snapshot = await readProjectContentReferences({
                  workspacePath: workspace.workspacePath,
                  projectId,
                });
                return {
                  owners: snapshot.owners,
                  coveredOwnerKinds: (['canvas', 'cut', 'entity-representation'] as const).filter(
                    (kind) => !snapshot.requirements.missingOwnerKinds.includes(kind),
                  ),
                  diagnostics: snapshot.diagnostics.map((diagnostic) => ({
                    ownerKind: diagnostic.ownerKind,
                    ownerId: diagnostic.ownerId,
                    message: `Project document '${diagnostic.ownerId}' is invalid.`,
                  })),
                };
              },
            },
          }).read(project.projectId, signal);
        }),
      );
    },
  });
  const agentCharacterVersionReferenceReader = {
    ownerKind: 'agent' as const,
    readReferences: async (): Promise<never> => {
      throw new Error('DSH Conversation reference authority is not composed.');
    },
  };
  const characterFoundation = new CharacterFoundationService({
    globalCatalog: characterGlobalCatalog,
    runtime: characterRuntimeRepositories.catalog,
  });
  const canvasWorkspaceIndexService = createCanvasWorkspaceIndexService({
    read: {
      listExactCanvasDocuments: async (workspaceId) => {
        const workspace = await requireWorkspaceForCanvasIndex(workspaceId);
        return createCanvasWorkspaceIndexNodeAdapter({
          workspaceRoot: workspace.workspacePath,
          host,
        }).listExactCanvasDocuments(workspaceId);
      },
      readExactCanvasSummary: async (workspaceId, canvasIdentity) => {
        const workspace = await requireWorkspaceForCanvasIndex(workspaceId);
        return createCanvasWorkspaceIndexNodeAdapter({
          workspaceRoot: workspace.workspacePath,
          host,
        }).readExactCanvasSummary(workspaceId, canvasIdentity);
      },
    },
  });

  async function requireWorkspaceForCanvasIndex(workspaceId: string) {
    if (workspaceRegistry.restore === undefined) {
      throw new Error('Desktop Workspace registry cannot restore exact Canvas workspaces.');
    }
    const workspace = await workspaceRegistry.restore(workspaceId);
    if (workspace.workspaceId !== workspaceId) {
      throw new Error(
        `Desktop Canvas index resolved '${workspace.workspaceId}' instead of '${workspaceId}'.`,
      );
    }
    return workspace;
  }

  const assistantSpaceRoot = path.join(globalStorage.root, 'assistant-spaces', 'local-user');
  await mkdir(assistantSpaceRoot, { recursive: true });
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
  const canvasDocumentEntryAccess = createNodeDocumentLowLevelAccess();
  const previewRuntime = new DesktopPreviewRuntime({
    shell: shellService,
    resources: resourceRegistry,
    resolveRestoredSource: async ({ projectId, workspaceId, contentLocator, signal }) => {
      signal.throwIfAborted();
      const workspace = await shellService.resolveAgentWorkspace(workspaceId);
      signal.throwIfAborted();
      if (isWorkspaceFileContentLocator(contentLocator) && !contentLocator.selector) {
        return {
          absolutePath: await resolveProjectWorkspaceContentLocator(
            {
              projectId,
              workspaceRoot: workspace.workspacePath,
              globalMediaLibraryRoot: globalStorage.mediaLibraries,
            },
            contentLocator,
          ),
        };
      }
      const contentRead = createProjectContentReadService({
        projectId,
        workspaceRoot: workspace.workspacePath,
        globalMediaLibraryRoot: globalStorage.mediaLibraries,
        documentEntryReader: {
          readEntry: (sourcePath, entryPath) =>
            canvasDocumentEntryAccess.readEntry(sourcePath, entryPath),
        },
      });
      const loaded = await contentRead.read(contentLocator, {
        maxBytes: 64 * 1024 * 1024,
        signal,
      });
      if (loaded.status !== 'ready') {
        throw new Error(`Preview content is unavailable: ${loaded.diagnostic.code}.`);
      }
      return { bytes: loaded.bytes };
    },
  });
  const textEditorRuntime = new DesktopTextEditorRuntime({
    shell: shellService,
    referenceCatalog: createNodeTextEditorMarkdownReferenceCatalog({
      files: host.files,
      globalMediaLibraryRoot: globalStorage.mediaLibraries,
      resolveWorkspace: (workspaceId) => shellService.resolveAgentWorkspace(workspaceId),
    }),
    media: new NodeTextEditorMarkdownMediaService({
      globalMediaLibraryRoot: globalStorage.mediaLibraries,
      resolveWorkspace: (workspaceId) => shellService.resolveAgentWorkspace(workspaceId),
      resources: resourceRegistry,
    }),
  });
  const cutRuntime = new DesktopCutRuntime({
    shell: shellService,
    host,
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    resources: resourceRegistry,
    createExportJobStore: (workspaceId) =>
      createPersistentExportJobStore({
        metadataStore: localMetadataStore,
        workspaceId,
      }),
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
  if (workspaceRegistry.restore) {
    for (const workspaceRecord of await metadataRepositories.workspaces.listAll()) {
      try {
        const workspace = await workspaceRegistry.restore(workspaceRecord.workspaceId);
        await cutRuntime.recoverExportJobs({
          workspaceId: workspace.workspaceId,
          workspacePath: workspace.workspacePath,
        });
      } catch (error: unknown) {
        logger.warn(
          `Cut Export Jobs for Workspace '${workspaceRecord.workspaceId}' could not be recovered.`,
          { message: error instanceof Error ? error.message : String(error) },
        );
      }
    }
  }
  const canvasUsesChineseLabels = app.getLocale().toLocaleLowerCase().startsWith('zh');
  const canvasGenerationRuntime = new CanvasGenerationNodeRuntime({
    createContentReader: (workspaceRoot, projectId) =>
      createProjectContentReadService({
        projectId,
        workspaceRoot,
        globalMediaLibraryRoot: globalStorage.mediaLibraries,
        documentEntryReader: {
          readEntry: (sourcePath, entryPath) =>
            canvasDocumentEntryAccess.readEntry(sourcePath, entryPath),
        },
      }),
    generation: {
      getWorkspaceJobs: (input) =>
        generationRuntime.getJobs({
          owner: { kind: 'workspace', workspaceId: input.workspaceId },
          root: input.workspaceRoot,
        }),
      validateBinding: ({ workspace, binding }) => {
        const config = workspaceConfigAuthority.getWorkspaceConfig({
          workspaceId: workspace.workspaceId,
          workspacePath: workspace.workspacePath,
        });
        const provider = config.getProvider(binding.providerId);
        const model = config.getModel(binding.modelId);
        if (!provider || provider.enabled === false) {
          throw new Error(`Canvas Generation provider '${binding.providerId}' is unavailable.`);
        }
        if (!model || model.enabled === false || model.providerId !== binding.providerId) {
          throw new Error(
            `Canvas Generation model '${binding.modelId}' is not available from provider '${binding.providerId}'.`,
          );
        }
        if (!canvasGenerationModelSupportsPurpose(model, binding.purpose)) {
          throw new Error(
            `Canvas Generation model '${binding.modelId}' does not support purpose '${binding.purpose}'.`,
          );
        }
      },
    },
  });
  type CanvasPreviewProjectionOwner = {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly workspace: AssetWorkspaceResolution;
    readonly purpose: 'viewer-source';
  };
  const canvasPreviewResources =
    createPreviewResourceProjectionService<CanvasPreviewProjectionOwner>({
      resolveSource: async ({ source, requestedMediaType, owner }) => {
        const contentType = requireCanvasPreviewContentType(source, requestedMediaType);
        if (source.file.authority === 'workspace' && source.selector === undefined) {
          if (owner.purpose === 'viewer-source' && isCanvasTextContentType(contentType)) {
            const contentRead = createNodeHostContentReadService({
              workspaceRoot: owner.workspace.workspacePath,
              documentEntryReader: {
                readEntry: (sourcePath, entryPath) =>
                  canvasDocumentEntryAccess.readEntry(sourcePath, entryPath),
              },
            });
            const loaded = await contentRead.read(source, {
              maxBytes: CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES,
            });
            if (loaded.status !== 'ready') {
              throw new Error(
                `Canvas embedded text preview is unavailable: ${loaded.diagnostic.code}.`,
              );
            }
            return readyCanvasPreviewBytes(loaded.bytes, loaded.mimeType ?? contentType);
          }
          const absolutePath = await resolveWorkspaceContentLocator(owner.workspace, {
            file: source.file,
          });
          if (owner.purpose === 'viewer-source' || contentType.startsWith('image/')) {
            const metadata = await lstat(absolutePath);
            return {
              status: 'ready',
              source: {
                kind: 'file',
                absolutePath,
                mediaType: contentType,
                sourceFingerprint: `${metadata.mtimeMs}:${metadata.size}`,
                byteLength: metadata.size,
              },
            };
          }
          return readyCanvasPreviewBytes(
            await createDesktopThumbnailPng(absolutePath, { width: 640, height: 400 }),
            'image/png',
          );
        }
        const contentRead = createProjectContentReadService({
          projectId: owner.identity.projectId,
          workspaceRoot: owner.workspace.workspacePath,
          globalMediaLibraryRoot: globalStorage.mediaLibraries,
          documentEntryReader: {
            readEntry: (sourcePath, entryPath) =>
              canvasDocumentEntryAccess.readEntry(sourcePath, entryPath),
          },
        });
        const loaded = await contentRead.read(source, {
          maxBytes:
            owner.purpose === 'viewer-source' && isCanvasTextContentType(contentType)
              ? CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES
              : 64 * 1024 * 1024,
        });
        if (loaded.status !== 'ready') {
          throw new Error(`Canvas preview content is unavailable: ${loaded.diagnostic.code}.`);
        }
        return readyCanvasPreviewBytes(loaded.bytes, loaded.mimeType ?? contentType);
      },
      registerSource: async ({ owner, source }) => {
        const resourceOwner = {
          windowId: owner.identity.windowId,
          viewId: owner.identity.viewId,
          sessionId: `canvas-preview:${owner.identity.sessionId}:${owner.identity.viewInstanceId}`,
          rendererSessionId: owner.identity.rendererSessionId,
        };
        return {
          status: 'ready',
          lease:
            source.kind === 'file'
              ? await resourceRegistry.registerFile(resourceOwner, source)
              : registerCanvasPreviewBytes(
                  resourceRegistry,
                  resourceOwner,
                  source.bytes,
                  source.mediaType,
                ),
        };
      },
    });
  const canvasRuntime = new DesktopCanvasRuntime({
    shell: {
      resolveCanvasViewGrant: (windowId, identity) =>
        shellService.resolveCanvasViewGrant(windowId, identity),
      closeCanvasView: async (identity) => {
        const projection = await shellService.getProjection(identity.windowId);
        const owner = resolveDesktopWindowWorkspaceWorkbench(
          projection.window,
          identity.workspaceId,
        );
        const view = owner.layout.main.views.find(
          (candidate) =>
            candidate.kind === 'canvas' &&
            candidate.viewId === identity.viewId &&
            candidate.viewInstanceId === identity.viewInstanceId &&
            candidate.documentId === identity.documentId,
        );
        if (!view) throw new Error('Desktop Canvas View is unavailable for clean deletion.');
        await shellService.updateWorkbench(
          identity.windowId,
          projection.rendererSessionId,
          owner.workbenchInstanceId,
          closeMainView(owner.layout, identity.viewId),
        );
      },
    },
    host,
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    audioExtraction: new CanvasAudioExtractionService({
      globalMediaLibraryRoot: globalStorage.mediaLibraries,
      ...(canvasUsesChineseLabels
        ? {
            messages: {
              sourceUnavailable: '所选视频文件不可用。',
              videoStreamUnavailable: '所选文件不包含视频流。',
              audioStreamUnavailable: '该视频不包含可分离的音轨。',
              probeFailed: '无法检查该视频的媒体流。',
              extractionFailed: '无法从该视频生成音频文件。',
              outputUnavailable: '工作区音频派生目录不可用。',
            },
          }
        : {}),
    }),
    watchFile: (directory, fileName, onChange) =>
      watch(directory, (_eventType, changedFileName) => {
        if (changedFileName !== null && changedFileName.toString() !== fileName) return;
        void onChange();
      }),
    materialActionLabels: {
      preview: canvasUsesChineseLabels ? '主面板预览' : 'Open Main Preview',
      reveal: canvasUsesChineseLabels ? '在访达中显示' : 'Reveal in Finder',
      openInCut: canvasUsesChineseLabels ? '打开剪辑' : 'Open Cut',
      editText: canvasUsesChineseLabels ? '编辑文本' : 'Edit text',
      addToCut: canvasUsesChineseLabels ? '剪辑' : 'Edit',
      separateAudio: canvasUsesChineseLabels ? '音频分离' : 'Separate audio',
      copyToProjectMediaLibrary: canvasUsesChineseLabels ? '存为素材' : 'Save material',
      copyToGlobalMediaLibrary: canvasUsesChineseLabels
        ? '复制到全局媒体库'
        : 'Copy to global Media Library',
      regenerate: canvasUsesChineseLabels ? '重新生成' : 'Regenerate',
    },
    generation: canvasGenerationRuntime,
    resolveGenerationModels: ({ workspace }) => {
      const config = workspaceConfigAuthority.getWorkspaceConfig({
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath,
      });
      return projectCanvasGenerationModels({
        providers: config.getEnabledProviders(),
        models: config.getEnabledModels(),
        resolveParameterProfile: (model) => {
          const provider = config.getProvider(model.providerId);
          if (!provider) {
            throw new Error(
              `Canvas Generation model "${model.id}" has no configured provider "${model.providerId}".`,
            );
          }
          return resolveGenerationModelParameterProfile({
            providerType: provider.type,
            modelName: model.name,
          });
        },
        getDefaultModelRef: (type) => config.getDefaultModelRef(type),
      });
    },
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
            file: {
              authority: 'workspace',
              path: relativePath.split(path.sep).join('/'),
            },
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
      const libraries = (
        await listAvailableProjectMediaLibraryDestinations({
          projectId: identity.projectId,
          workspace,
          globalMediaLibraryRoot: globalStorage.mediaLibraries,
        })
      ).map((destination) => ({
        name: destination.libraryName,
        targetRoot: destination.targetRoot,
      }));
      const library = await selectCanvasMediaLibrary({
        owner: requireOwnerWindow(identity.windowId),
        title: canvasUsesChineseLabels ? '选择项目媒体库' : 'Select project Media Library',
        names: libraries.map((candidate) => candidate.name),
      });
      if (!library) return undefined;
      const selected = libraries.find((candidate) => candidate.name === library);
      if (!selected) throw new Error('Selected project Media Library is no longer available.');
      const targetRoot = await realpath(selected.targetRoot);
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
    previewResource: async ({ absolutePath, identity, locator, workspace }) => {
      const label = canvasContentDisplayName(locator);
      const shellProjection = await shellService.getProjection(identity.windowId);
      const tab = shellProjection.window.tabs.find(
        (candidate) => candidate.projectId === identity.projectId,
      );
      if (!tab || shellProjection.rendererSessionId !== identity.rendererSessionId) {
        throw new Error('Canvas Preview owner is stale.');
      }
      let source:
        | { readonly absolutePath: string; readonly bytes?: never }
        | { readonly absolutePath?: never; readonly bytes: Uint8Array };
      if (absolutePath) {
        source = { absolutePath };
      } else {
        const contentRead = createProjectContentReadService({
          projectId: identity.projectId,
          workspaceRoot: workspace.workspacePath,
          globalMediaLibraryRoot: globalStorage.mediaLibraries,
          documentEntryReader: {
            readEntry: (sourcePath, entryPath) =>
              canvasDocumentEntryAccess.readEntry(sourcePath, entryPath),
          },
        });
        const loaded = await contentRead.read(locator, { maxBytes: 64 * 1024 * 1024 });
        if (loaded.status !== 'ready') {
          throw new Error(`Canvas Preview content is unavailable: ${loaded.diagnostic.code}.`);
        }
        source = { bytes: loaded.bytes };
      }
      await previewRuntime.open({
        identity: {
          projectId: identity.projectId,
          workspaceId: identity.workspaceId,
          windowId: identity.windowId,
          viewId: `resource-browser:${tab.viewId}`,
          viewInstanceId: tab.viewInstanceId,
          rendererSessionId: shellProjection.rendererSessionId,
        },
        item: {
          resourceId: `canvas-content:${identity.documentId}:${JSON.stringify(locator)}`,
          source: 'files',
          role: 'content',
          depth: 0,
          kind: 'file',
          label,
          locator,
          capabilities: ['preview'],
        },
        ...source,
      });
    },
    resolveEditText: async ({ target }) =>
      target.locator.file.authority === 'workspace' &&
      target.locator.selector === undefined &&
      modeForTextDocument(target.locator.file.path) !== undefined,
    editText: async ({ identity, target }) => {
      if (target.locator.file.authority !== 'workspace' || target.locator.selector !== undefined) {
        throw new Error('Canvas Text Editor requires a Workspace File locator.');
      }
      await textEditorRuntime.openWorkspaceFile({
        windowId: identity.windowId,
        rendererSessionId: identity.rendererSessionId,
        workspaceId: identity.workspaceId,
        contentLocator: { file: target.locator.file },
        displayLabel: path.posix.basename(target.locator.file.path),
      });
    },
    resolveCut: async ({ absolutePath, identity, target }) =>
      cutRuntime.supportsOpen({
        resourceId: `canvas-content:${identity.documentId}:${target.nodeId}`,
        source: 'files',
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
        source: 'files' as const,
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
    resolveAddToCut: async ({ identity }) => {
      const availability = await cutRuntime.resolveAvailableCanvasHandoffTarget(identity);
      if (availability.status === 'available') {
        return {
          status: 'available' as const,
          executionPayload: createCutCanvasHandoffPayload(availability.target),
        };
      }
      return {
        status: 'unavailable' as const,
        diagnostic: {
          code:
            availability.diagnostic.code === 'desktop-cut-project-owner-unavailable'
              ? ('cut-project-owner-unavailable' as const)
              : ('cut-canvas-source-stale' as const),
          message: canvasUsesChineseLabels
            ? availability.diagnostic.code === 'desktop-cut-project-owner-unavailable'
              ? '当前画布未绑定到有效的项目工作区。'
              : '当前画布视图已失效，请重新打开画布。'
            : availability.diagnostic.message,
        },
      };
    },
    addToCut: async ({ identity, target, executionPayload }) => {
      const label =
        target.locator.file.authority === 'workspace'
          ? path.posix.basename(target.locator.file.path)
          : target.nodeId;
      await cutRuntime.addCanvasMaterial({
        identity,
        nodeId: target.nodeId,
        label,
        locator: target.locator,
        target: parseCutCanvasHandoffPayload(executionPayload),
      });
    },
    projectPreviewResource: ({
      identity,
      workspace,
      locator,
      purpose,
      descriptorId,
      displayName,
      mediaType,
    }) =>
      canvasPreviewResources.project({
        descriptorId,
        source: locator,
        displayName,
        owner: { identity, workspace, purpose },
        requestedMediaType: requireCanvasPreviewContentType(locator, mediaType),
      }),
    releasePreviewResourceProjection: (descriptorId) =>
      canvasPreviewResources.release(descriptorId),
  });
  const dshCanvasArtifactDelivery = new DesktopDshCanvasArtifactDelivery({
    applicationInstanceId,
    metadataStore: localMetadataStore,
    workspaceRegistry,
    host,
    readImageAttachment: (sessionId, attachmentId) =>
      dshProduct.runtime.client.readImageAttachment({ sessionId, attachmentId }),
    coordinateCanvasMutation: (target, operation) =>
      canvasRuntime.coordinateCanvasDocumentMutation(target, operation),
    createContentRead: (workspacePath) =>
      createDshCanvasArtifactContentRead({
        workspacePath,
        documentEntryReader: {
          readEntry: (sourcePath, entryPath) =>
            canvasDocumentEntryAccess.readEntry(sourcePath, entryPath),
        },
      }),
    createIdentity: randomUUID,
  });
  const resourceBrowser = new ResourceBrowserNodeRuntime({
    globalAssetRoot: globalStorage.assets,
    globalMediaLibraryRoot: globalStorage.mediaLibraries,
    assetLibraryMemberships: metadataRepositories.assetLibraryMemberships,
    localMetadataRepositories: metadataRepositories,
    shell: shellService,
    host,
    canvas: canvasRuntime,
    cut: {
      addResource: (input) => cutRuntime.addResource(input).then(() => undefined),
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
        title: chinese ? '将目录添加到全局媒体库' : 'Add Directory to Global Media Library',
        buttonLabel: chinese ? '添加目录' : 'Add Directory',
        properties: ['openDirectory'],
      });
      if (result.canceled) return undefined;
      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new Error('Desktop media source picker returned no directory.');
      }
      return selectedPath;
    },
    selectWorkspaceFiles: async (windowId) => {
      const owner = requireOwnerWindow(windowId);
      const chinese = app.getLocale().toLocaleLowerCase().startsWith('zh');
      const result = await dialog.showOpenDialog(owner, {
        title: chinese ? '导入项目文件' : 'Import Project Files',
        buttonLabel: chinese ? '导入' : 'Import',
        properties: ['openFile', 'multiSelections'],
      });
      return result.canceled ? undefined : result.filePaths;
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
      registerResourceTree: async (owner, tree) => {
        const shellProjection = await shellService.getProjection(owner.windowId);
        return resourceRegistry.registerResourceTree(
          {
            windowId: owner.windowId,
            viewId: owner.viewId,
            sessionId: owner.sessionId,
            rendererSessionId: shellProjection.rendererSessionId,
          },
          tree,
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
  const characterRooms = new CharacterRoomService(characterRuntimeRepositories.room);
  const agentConversationContexts = createPersistentAgentConversationContextAuthority({
    metadataStore: localMetadataStore,
  });
  const dshCanvasArtifactDeliveryService = createDshCanvasArtifactDeliveryService({
    contexts: agentConversationContexts,
    delivery: dshCanvasArtifactDelivery,
    diagnostics: {
      report: (diagnostic) =>
        logger.warn('DSH Canvas skipped an invalid content Tool projection.', {
          code: diagnostic.code,
          toolCallId: diagnostic.toolCallId,
          toolName: diagnostic.toolName,
          message: diagnostic.message,
        }),
    },
  });
  const dshTurnCanvasTargets = createDshTurnCanvasTargetOwner();
  // Composed after its dependency callbacks while preserving an explicit unavailable state.
  // eslint-disable-next-line prefer-const
  let dshDomainConversations: DshDomainConversationService | undefined;
  const requireDshDomainConversations = (): DshDomainConversationService => {
    if (!dshDomainConversations) {
      throw new Error('DSH domain Conversation service is not composed.');
    }
    return dshDomainConversations;
  };
  const characterAgentConversations = createCharacterAgentConversationAdapter({
    conversations: {
      publish: (input) => requireDshDomainConversations().publish(input),
      archivePublishedConversation: (conversationId) =>
        requireDshDomainConversations().archivePublishedConversation(conversationId),
      submitTurn: (input) => requireDshDomainConversations().submitTurn(input),
    },
  });
  const characterConversationLaunches = new CharacterConversationLaunchService({
    repository: characterRuntimeRepositories.conversationLaunch,
    publications: characterGlobalCatalog,
    displayNames: characterGlobalCatalogService,
    agentConversations: characterAgentConversations,
  });
  const characterPresentation = new CharacterPresentationService(
    characterRuntimeRepositories.presentation,
  );
  const characterCompanionContinuity = new CharacterCompanionContinuityService(
    characterRuntimeRepositories.companionContinuity,
  );
  const characterAvatarAuthority = new CharacterAvatarAuthorityService(
    characterRuntimeRepositories.avatarAuthority,
  );
  const characterAvatar = new DesktopCharacterAvatarRuntime({
    globalAssetRoot: globalStorage.assets,
    assetLibraryMemberships: metadataRepositories.assetLibraryMemberships,
    resources: resourceRegistry,
    authority: characterAvatarAuthority,
  });
  const characterInteractions = new CharacterInteractionService({
    repository: characterRuntimeRepositories.interaction,
    displayNames: characterGlobalCatalogService,
    agentConversations: characterAgentConversations,
    roomViews: {
      materializeRoomView: (roomRunId, participantId, signal) =>
        characterRooms.materializeView({ roomRunId, participantId }, signal),
    },
    presentationTurns: characterPresentation,
  });
  const worldRuntime = new WorldRuntimeService({
    repository: worldRuntimeRepositories.runtime,
    actionHandlers: createWorldFoundationActionHandlers(),
  });
  const characterRoomInteractions = new CharacterRoomInteractionService({
    repository: characterRuntimeRepositories.roomInteraction,
    roomRuns: characterRooms,
    displayNames: characterGlobalCatalogService,
    agentConversations: characterAgentConversations,
  });
  const characterCreationSourceAuthority = createDesktopCharacterCreationSourceAuthority({
    workspaces: workspaceGrantAuthority,
    assets: {
      requireRepresentation: async () => {
        throw new Error(
          'Character creation from an Asset requires a validated manifest-backed representation resolver.',
        );
      },
    },
  });
  const characterFoundationCommands = new CharacterFoundationCommandService({
    relationships: new UserCharacterRelationshipService(characterRuntimeRepositories.relationship),
    interactions: characterInteractions,
    rooms: characterRooms,
    roomInteractions: characterRoomInteractions,
    presentation: characterPresentation,
    companionContinuity: characterCompanionContinuity,
  });
  const worldRuntimeWorkbench = new WorldRuntimeWorkbenchService({
    runtime: worldRuntime,
    repository: worldRuntimeRepositories.runtime,
    availableActions: ['world.foundation.fact.delete', 'world.foundation.fact.set'],
  });
  const projectManagement = new DesktopProjectRegistrationService({
    shell: shellService,
    conversations: {
      archiveConversations: async (navigations) => {
        for (const navigation of navigations) {
          await requireDshDomainConversations().archivePublishedConversation(
            navigation.conversationId,
          );
        }
      },
      deleteUnavailableConversation: async (navigation) => {
        await requireDshDomainConversations().deleteUnavailableConversation(
          navigation.conversationId,
        );
      },
    },
  });
  const resolveCharacterRepository = (input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly authority: import('@neko/chara-domain/contracts').CharacterAuthoringAuthority;
  }) => {
    requireProjectIdentity(input.workspace.workspaceId, input.authority.projectId);
    return createCharacterAuthoringFileRepository({
      workspaceRoot: input.workspace.workspacePath,
      scope: input.authority,
    });
  };
  const resolveCharacterAuthoring = async (input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly authority: import('@neko/chara-domain/contracts').CharacterAuthoringAuthority;
    readonly characterProjectId: string;
  }) => {
    const repository = resolveCharacterRepository(input);
    const storylines = new CharacterStorylineService(repository);
    const references = new CharacterVersionReferenceInventoryService({
      chara: new CharaOwnedCharacterVersionReferenceReader({
        catalog: createCharacterDurableCatalogPort({
          authoring: repository,
          runtime: characterRuntimeRepositories.catalog,
        }),
        lineage: repository,
        storylines,
      }),
      agent: agentCharacterVersionReferenceReader,
      project: projectCharacterVersionReferences,
    });
    return new CharacterAuthoringHostService({
      scope: input.authority,
      characterProjectId: input.characterProjectId,
      catalog: repository,
      authoring: new CharacterAuthoringService({ repository, lineage: repository }),
      storylines,
      lineage: repository,
      references,
      deletion: new CharacterVersionDeletionService({
        repository,
        lineage: repository,
        references,
      }),
    });
  };
  const resolveWorldAuthoring = async (input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly authority: import('@neko/world-domain/contracts').WorldAuthoringAuthority;
    readonly worldProjectId: string;
  }) => {
    requireProjectIdentity(input.workspace.workspaceId, input.authority.projectId);
    const repository = createWorldAuthoringFileRepository({
      workspaceRoot: input.workspace.workspacePath,
      scope: input.authority,
    });
    return new WorldAuthoringHostService({
      scope: input.authority,
      catalog: repository,
      authoring: new WorldAuthoringService({ repository }),
    });
  };
  const resolveWorldPortablePackage = (input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly authority: import('@neko/world-domain/contracts').WorldAuthoringAuthority;
  }) =>
    new WorldPortablePackageService(
      createWorldPortableWorkspaceRepository({
        workspaceRoot: input.workspace.workspacePath,
        authority: input.authority,
      }),
      createWorldPortableArchivePort(),
    );
  const createProjectLocalAuthoring = (input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly workspaceId: string;
    readonly projectId: string;
  }) => {
    const characters = createCharacterAuthoringFileRepository({
      workspaceRoot: input.workspace.workspacePath,
      scope: { kind: 'project', projectId: input.projectId },
    });
    const worlds = createWorldAuthoringFileRepository({
      workspaceRoot: input.workspace.workspacePath,
      scope: { kind: 'project', projectId: input.projectId },
    });
    const authority = { workspaceId: input.workspaceId, projectId: input.projectId };
    const characterAuthoring = new CharacterAuthoringService({ repository: characters });
    const worldAuthoring = new WorldAuthoringService({ repository: worlds });
    return new ProjectLocalAuthoringService({
      characters: {
        prepareProject: (create, signal) =>
          new CharacterCreationSourceService({
            authority: characterCreationSourceAuthority,
            projects: characterAuthoring,
          }).prepareProject(create, signal),
        prepareWorkspaceCopy: (copy, signal) =>
          characterGlobalCatalogService.prepareWorkspaceCopy(copy, signal),
      },
      commit: new ProjectLocalAuthoringCommitRepository(input.workspace.workspacePath, authority),
      entities: new NodeProjectEntityAuthoringService({
        workspace: {
          workspaceId: input.workspaceId,
          workspacePath: input.workspace.workspacePath,
        },
      }),
      worlds: {
        prepareProject: (create, signal) => worldAuthoring.prepareProject(create, signal),
        prepareWorkspaceCopy: (copy, signal) =>
          worldGlobalCatalogService.prepareWorkspaceCopy(copy, signal),
      },
      now: () => new Date().toISOString(),
    });
  };
  const createProjectCreativeWorkspace = (input: {
    readonly workspace: AssetWorkspaceResolution;
    readonly workspaceId: string;
    readonly projectId: string;
  }) => {
    requireProjectIdentity(input.workspace.workspaceId, input.projectId);
    if (input.workspace.workspaceId !== input.workspaceId) {
      throw new Error('Project Creative Workspace binding belongs to another Workspace.');
    }
    const membership = new ProjectMembershipRepository(input.workspace.workspacePath, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
    const characters = createCharacterAuthoringFileRepository({
      workspaceRoot: input.workspace.workspacePath,
      scope: { kind: 'project', projectId: input.projectId },
    });
    const worlds = createWorldAuthoringFileRepository({
      workspaceRoot: input.workspace.workspacePath,
      scope: { kind: 'project', projectId: input.projectId },
    });
    const referenceReader = {
      readGlobalReferences: async (projectId: string) => {
        const projection = await membership.read();
        return {
          projectId,
          targets: projection.targets.map((fact) => fact.target),
          references: projection.globalReferences.map(
            (fact): ProjectGlobalReference => fact.reference,
          ),
        };
      },
    };
    const composition = new ProjectCompositionService({
      content: {
        readContentDocuments: async (projectId, signal) => {
          const projection = await membership.read();
          const contentRead = createNodeHostContentReadService({
            workspaceRoot: input.workspace.workspacePath,
          });
          return {
            projectId,
            documents: await Promise.all(
              projection.targets.flatMap((fact) => {
                if (fact.target.kind !== 'content-document') return [];
                const documentId = fact.target.documentId;
                return [
                  contentRead
                    .stat(
                      { file: { authority: 'workspace', path: documentId } },
                      signal ? { signal } : undefined,
                    )
                    .then((source) => ({
                      documentId,
                      label: documentId,
                      ...(source.status === 'ready' && source.modifiedAt
                        ? { updatedAt: source.modifiedAt }
                        : {}),
                      ...(source.status === 'unavailable'
                        ? {
                            diagnostic: `Content document '${documentId}' is unavailable (${source.diagnostic.code}).`,
                          }
                        : {}),
                    })),
                ];
              }),
            ),
          };
        },
      },
      characters,
      worlds,
      references: referenceReader,
      globalCharacters: characterGlobalCatalog,
      globalWorlds: worldGlobalCatalog,
    });
    const commits = new ProjectCompositionCommitService({ repository: membership });
    return new ProjectCreativeWorkspaceService({
      composition,
      mutations: new ProjectGlobalReferenceMutationService({
        references: referenceReader,
        globalCharacters: characterGlobalCatalog,
        globalWorlds: worldGlobalCatalog,
        commits,
      }),
      objectMutations: new ProjectWorkspaceObjectMutationService({
        localAuthoring: createProjectLocalAuthoring(input),
        characters: new CharacterGlobalCatalogService({
          workspace: characters,
          repository: characterGlobalCatalog,
        }),
        worlds: new WorldGlobalCatalogService({
          workspace: worlds,
          repository: worldGlobalCatalog,
        }),
      }),
    });
  };
  const dshProviderRefresh: {
    current?: () => Promise<'applied' | 'pending'>;
  } = {};
  const appHost = new DesktopAppHost({
    host,
    logger,
    shell: shellService,
    projectManagement,
    projectAuthoring: {
      getNavigation: async ({ workspace, projectId }) => {
        requireProjectIdentity(workspace.workspaceId, projectId);
        const characters = createCharacterAuthoringFileRepository({
          workspaceRoot: workspace.workspacePath,
          scope: { kind: 'project', projectId },
        });
        const worlds = createWorldAuthoringFileRepository({
          workspaceRoot: workspace.workspacePath,
          scope: { kind: 'project', projectId },
        });
        return new ProjectAuthoringNavigationService({
          characters,
          worlds,
          references: {
            readReferences: async (projectId) => {
              const snapshot = await readProjectContentReferences({
                workspacePath: workspace.workspacePath,
                projectId,
              });
              return {
                owners: snapshot.owners,
                coveredOwnerKinds: (['canvas', 'cut', 'entity-representation'] as const).filter(
                  (kind) => !snapshot.requirements.missingOwnerKinds.includes(kind),
                ),
                diagnostics: snapshot.diagnostics.map((diagnostic) => ({
                  ownerKind: diagnostic.ownerKind,
                  ownerId: diagnostic.ownerId,
                  message: `Project document '${diagnostic.ownerId}' is invalid.`,
                })),
              };
            },
          },
        }).read({ projectId });
      },
      getContent: async ({ workspace, workspaceId, projectId }) => {
        requireProjectIdentity(workspace.workspaceId, projectId);
        const characters = createCharacterAuthoringFileRepository({
          workspaceRoot: workspace.workspacePath,
          scope: { kind: 'project', projectId },
        });
        const worlds = createWorldAuthoringFileRepository({
          workspaceRoot: workspace.workspacePath,
          scope: { kind: 'project', projectId },
        });
        return new ProjectContentService({
          associations: new ProjectEntityCharacterAssociationRepository(
            workspace.workspacePath,
            projectId,
          ),
          characters,
          worlds,
          entities: {
            readProjectContentEntities: async (signal) => ({
              projectId,
              ...(await readProjectEntityManagementResources({
                workspace: {
                  workspaceId,
                  workspacePath: workspace.workspacePath,
                },
                derivedProjection: {
                  repository: metadataRepositories.projectEntityProjections,
                  partition: {
                    scope: 'workspace',
                    workspaceId,
                    domain: 'project-entity-projection',
                  },
                },
                ...(signal ? { signal } : {}),
              })),
            }),
          },
        }).read(projectId);
      },
      getCreativeWorkspace: async (input) => createProjectCreativeWorkspace(input).read(input),
      mutateCreativeWorkspaceReference: async (input) =>
        createProjectCreativeWorkspace(input).mutate(input),
      mutateCreativeWorkspaceObject: async (input) =>
        createProjectCreativeWorkspace(input).mutateObject(input),
      createLocalTarget: async ({ workspace, workspaceId, projectId, create }) => {
        const service = createProjectLocalAuthoring({ workspace, workspaceId, projectId });
        const authority = { workspaceId, projectId };
        if (create.kind === 'world-project') {
          const result = await service.createWorld(authority, {
            worldProjectId: create.worldProjectId,
            title: create.title,
            draft: create.draft,
          });
          return { status: 'created', target: result.target };
        }
        const result = await service.createCharacter(
          authority,
          {
            characterProjectId: create.characterProjectId,
            displayName: create.displayName,
            draft: create.draft,
            sources: create.sources,
          },
          create.entity,
        );
        return { status: 'created', target: result.target };
      },
      getCharacterSnapshot: async (input) =>
        (await resolveCharacterAuthoring(input)).getSnapshot(input.characterProjectId),
      executeCharacter: async (input) =>
        (await resolveCharacterAuthoring(input)).execute(input.command),
      getCharacterPortableExportScope: async (input) =>
        new CharacterPortablePackageService(
          resolveCharacterRepository(input),
          createCharacterPortableArchivePort(),
        ).getExportScope(input.characterProjectId),
      exportCharacterPackage: async (input) =>
        (
          await new CharacterPortablePackageService(
            resolveCharacterRepository(input),
            createCharacterPortableArchivePort(),
          ).exportPackage({
            characterProjectId: input.characterProjectId,
            ...input.selection,
            maxEmbeddedAssetBytes: 256 * 1024 * 1024,
          })
        ).archiveBytes,
      importCharacterGlobalPackage: async (input) =>
        (
          await new CharacterPortablePackageService(
            undefined,
            createCharacterPortableArchivePort(),
          ).importIntoGlobal({
            archiveBytes: input.archiveBytes,
            globalCatalog: characterGlobalCatalogService,
            ...(input.target === undefined ? {} : { target: input.target }),
          })
        ).globalCharacter.globalCharacterId,
      getWorldSnapshot: async (input) =>
        (await resolveWorldAuthoring(input)).getSnapshot(input.worldProjectId),
      executeWorld: async (input) => (await resolveWorldAuthoring(input)).execute(input.command),
    },
    generationLifecycle: generationRuntime,
    workspaceConfigLifecycle: workspaceConfigAuthority,
    workspaceGrants: workspaceGrantAuthority,
    conversationContexts: agentConversationContexts,
    characterFoundation,
    characterFoundationCommands,
    worldManagement,
    worldPortable: {
      exportPackage: async (input) =>
        resolveWorldPortablePackage(input).exportAuthoringPackage(input.selection),
      importGlobal: async (input) =>
        (async () => {
          const receipt = await new WorldPortablePackageService(
            undefined,
            createWorldPortableArchivePort(),
          ).importIntoGlobal({
            archiveBytes: input.archiveBytes,
            globalCatalog: worldGlobalCatalogService,
            ...(input.target === undefined ? {} : { target: input.target }),
          });
          return {
            kind: 'import-completed' as const,
            worldProjectId: receipt.worldVersion.globalWorldId,
            worldVersionId: receipt.worldVersion.worldVersionId,
          };
        })(),
    },
    worldRuntime: worldRuntimeWorkbench,
    characterAvatar,
    characterRoomWorkbench: characterRooms,
    resourceBrowser,
    assetCenter,
    projectPortability,
    preview: previewRuntime,
    textEditor: textEditorRuntime,
    canvas: canvasRuntime,
    canvasWorkspaceIndexService,
    cut: cutRuntime,
    settings: applicationSettings,
    aiModelSettings,
    refreshAiModelExecutionConfiguration: () => {
      workspaceConfigAuthority.reloadAll();
      const refresh = dshProviderRefresh.current;
      if (refresh === undefined) {
        throw new Error('Desktop DSH Provider runtime refresh is not initialized.');
      }
      return refresh();
    },
    storageSettings,
    openAgentAdvancedSettings: () => openHostPath(buildConfigFilePath(homedir)),
    instanceId: applicationInstanceId,
  });
  let dshHandlers: DesktopDshProductHandlerAssembly | undefined;
  const dshHomeProjectionRefresh: { current?: () => Promise<void> } = {};
  let dshHomeRefreshPending = false;
  const refreshDshHomeAfterProjectionChange = async (): Promise<void> => {
    if (dshHomeProjectionRefresh.current === undefined) {
      dshHomeRefreshPending = true;
      return;
    }
    await dshHomeProjectionRefresh.current();
  };
  const publishDshChanged = (channel: string, event: { readonly conversationId: string }) => {
    for (const owner of windowsById.values()) {
      if (!owner.isDestroyed()) owner.webContents.send(channel, event);
    }
  };
  const publishDshRuntimeChanged = (projection: DshRuntimeHostProjection) => {
    for (const owner of windowsById.values()) {
      if (!owner.isDestroyed()) owner.webContents.send(DSH_RUNTIME_CHANGED_CHANNEL, projection);
    }
  };
  const projectDshProviderRuntime = () =>
    createDesktopDshProviderRuntimeProjection({
      providers: applicationAgentConfig.getEnabledProviders(),
      models: applicationAgentConfig.getEnabledModels(),
      credentials: providerCredentials,
    });
  const dshCanvasArtifactDeliveryTrigger: {
    current?: (
      dshSessionId: string,
      conversationId: string,
      trigger: { readonly kind: 'completed-tool'; readonly toolCallId: string },
    ) => Promise<void>;
  } = {};
  const dshProduct = await startDesktopDshProductRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    userDataRoot: userData,
    builtinSkillRoot: resolveDesktopBuiltinSkillRoot({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }),
    environment: process.env,
    providers: projectDshProviderRuntime,
    onProviderProjection: (projection) => {
      for (const diagnostic of projection.diagnostics) {
        logger.warn('DSH provider is unavailable.', {
          providerId: diagnostic.providerId,
          ...(diagnostic.modelId === undefined ? {} : { modelId: diagnostic.modelId }),
          message: diagnostic.message,
        });
      }
    },
    metadataStore: localMetadataStore,
    resolveWorkspaceSessionCwd: async (context) => {
      const resolution = await workspaceGrantAuthority.resolveAuthorizedWorkspace(
        context.workspaceGrantId,
        context.workspaceId,
      );
      return resolution.workspace.workspacePath;
    },
    onStderr: (chunk) => logger.warn('DSH runtime diagnostic.', { message: chunk.trimEnd() }),
    createHandlers: ({ bindings, skillAuthoringBridge, personalSkillRoot }) => {
      const skillAuthoring = createDesktopDshSkillAuthoringService({
        assistantSpaceId,
        personalSkillRoot,
        workspaceGrants: workspaceGrantAuthority,
        bridge: skillAuthoringBridge,
      });
      const assembly = createDesktopDshProductHandlers({
        bindings,
        contexts: agentConversationContexts,
        workspaceGrants: workspaceGrantAuthority,
        coordinateCanvasMutation: (target, operation) =>
          canvasRuntime.coordinateCanvasDocumentMutation(target, operation),
        generationRuntime,
        generationProjection: {
          projectSnapshot: async ({ context, request, snapshot }) => {
            if (context.binding.kind === 'assistant') return { status: 'accepted' };
            if (context.binding.kind !== 'workspace') {
              return {
                status: 'blocked',
                diagnostic: {
                  code: 'dsh-generation-canvas-context-unsupported',
                  message: `Generation Canvas projection is unavailable for ${context.binding.kind} Conversation context.`,
                },
              };
            }
            const canvasTurnTarget = dshTurnCanvasTargets.read(request.sessionId, request.turn);
            if (!canvasTurnTarget) {
              const diagnostic = {
                code: 'dsh-generation-canvas-target-missing',
                message: `DSH turn ${request.turn} has no bound Canvas target admission.`,
              } as const;
              host.diagnostics?.report({
                ...diagnostic,
                severity: 'error',
                metadata: {
                  dshSessionId: request.sessionId,
                  conversationId: context.conversationId,
                  toolCallId: request.toolCallId,
                },
              });
              return { status: 'blocked', diagnostic };
            }
            return dshCanvasArtifactDelivery.projectGenerationJob({
              workspaceId: context.binding.workspaceId,
              dshSessionId: request.sessionId,
              turn: request.turn,
              toolCallId: request.toolCallId,
              canvasTurnTarget,
              snapshot,
            });
          },
        },
        configuration: workspaceConfigAuthority,
        assistant: { assistantSpaceId, root: assistantSpaceRoot },
        skillAuthoring,
        cutRuntime,
        character: {
          resolveService: async (input) => {
            requireProjectIdentity(input.workspaceId, input.projectId);
            const repository = createCharacterAuthoringFileRepository({
              workspaceRoot: input.workspacePath,
              scope: { kind: 'project', projectId: input.projectId },
            });
            return new CharacterDshAuthoringService({
              scope: { kind: 'project', projectId: input.projectId },
              characterProjectId: input.characterProjectId,
              catalog: repository,
              authoring: new CharacterAuthoringService({ repository, lineage: repository }),
            });
          },
        },
        world: {
          resolveService: async (input) => {
            requireProjectIdentity(input.workspaceId, input.projectId);
            const repository = createWorldAuthoringFileRepository({
              workspaceRoot: input.workspacePath,
              scope: { kind: 'project', projectId: input.projectId },
            });
            return new WorldDshAuthoringService({
              scope: { kind: 'project', projectId: input.projectId },
              worldProjectId: input.worldProjectId,
              catalog: repository,
              authoring: new WorldAuthoringService({ repository }),
            });
          },
        },
        onPermissionChanged: (conversationId) =>
          publishDshChanged(DSH_PERMISSION_CHANGED_CHANNEL, { conversationId }),
        onSessionUpdate: async (notification, delivery) => {
          const binding = await bindings.getByDshSessionId(notification.sessionId);
          if (!binding) {
            throw new Error(
              `DSH Session '${notification.sessionId}' update has no Conversation binding.`,
            );
          }
          if (
            !delivery.replay &&
            notification.update.sessionUpdate === 'tool_call_update' &&
            notification.update.status === 'completed'
          ) {
            if (dshCanvasArtifactDeliveryTrigger.current === undefined) {
              throw new Error('DSH Canvas artifact delivery is not initialized.');
            }
            await dshCanvasArtifactDeliveryTrigger.current(
              notification.sessionId,
              binding.conversationId,
              {
                kind: 'completed-tool',
                toolCallId: notification.update.toolCallId,
              },
            );
          }
          publishDshChanged(DSH_SESSION_CHANGED_CHANNEL, {
            conversationId: binding.conversationId,
          });
        },
        onSessionEvent: async (notification) => {
          const { binding } = await resolveDesktopDshSessionEventAdmission({
            event: notification,
            projection: dshProduct.runtime.client.projection,
            targets: dshTurnCanvasTargets,
            resolveBinding: () => bindings.getByDshSessionId(notification.sessionId),
          });
          if (notification.type === 'turn/end' && !notification.replay) {
            const terminals = dshProduct.runtime.client.projection
              .snapshot(notification.sessionId)
              .events.filter(
                (event) =>
                  event.kind === 'turn' &&
                  event.phase === 'end' &&
                  event.completedAt === notification.time,
              );
            if (terminals.length !== 1) {
              throw new Error('DSH turn/end has no projected turn identity.');
            }
            const terminal = terminals[0];
            if (terminal?.kind !== 'turn' || terminal.phase !== 'end') {
              throw new Error('DSH turn/end projected an invalid turn identity.');
            }
            dshTurnCanvasTargets.releaseTurn(notification.sessionId, terminal.turn);
          }
          publishDshChanged(DSH_SESSION_CHANGED_CHANNEL, {
            conversationId: binding.conversationId,
          });
          if (notification.type === 'turn/start' || notification.type === 'turn/end') {
            await refreshDshHomeAfterProjectionChange();
          }
          if (notification.type === 'turn/end' && !notification.replay) {
            setTimeout(() => {
              void dshProduct.runtime.flushPendingConfigurationRefresh().catch(() => undefined);
            }, 0);
          }
        },
        onContextPressure: async (notification) => {
          const binding = await bindings.getByDshSessionId(notification.sessionId);
          if (!binding) {
            throw new Error(
              `DSH Session '${notification.sessionId}' context pressure has no Conversation binding.`,
            );
          }
          publishDshChanged(DSH_SESSION_CHANGED_CHANNEL, {
            conversationId: binding.conversationId,
          });
        },
      });
      dshHandlers = assembly;
      return assembly;
    },
  });
  dshDialogueCapabilities.current = () => dshProduct.runtime.client.readProviderCapabilities();
  dshProviderRefresh.current = () => dshProduct.runtime.deferConfigurationRefresh();
  dshCanvasArtifactDeliveryTrigger.current = async (dshSessionId, conversationId, trigger) => {
    try {
      const snapshot = dshProduct.runtime.client.projection.snapshot(dshSessionId);
      const tool = [...snapshot.events]
        .reverse()
        .find((event) => event.kind === 'tool' && event.toolCallId === trigger.toolCallId);
      if (tool?.kind !== 'tool') {
        throw new Error(`DSH Tool '${trigger.toolCallId}' has no projected turn identity.`);
      }
      await dshCanvasArtifactDeliveryService.deliverCompletedTool({
        conversationId,
        dshSessionId,
        toolCallId: trigger.toolCallId,
        events: snapshot.events,
        canvasTurnTarget: dshTurnCanvasTargets.read(dshSessionId, tool.turn),
      });
    } catch (error) {
      host.diagnostics?.report({
        code: 'dsh-canvas-artifact-delivery-failed',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        metadata: { dshSessionId, conversationId },
      });
    }
  };
  if (!dshHandlers) throw new Error('DSH runtime did not compose its product handlers.');
  dshHomeProjectionRefresh.current = () => dshProduct.runtime.conversations.home.refresh();
  if (dshHomeRefreshPending) {
    dshHomeRefreshPending = false;
    await dshHomeProjectionRefresh.current();
  }
  shellService.setAgentHomeProjectionSource(dshProduct.runtime.conversations.home);
  shellService.setAgentCapabilityReady(true);
  const dshPermissionHost = new DesktopDshPermissionHost({
    permissions: dshHandlers.permissions,
    windows: appHost.windows,
    publishChanged: (event) => publishDshChanged(DSH_PERMISSION_CHANGED_CHANNEL, event),
  });
  const resolveDshAgentSurfaceScope = async (input: {
    readonly windowId: string;
    readonly workbenchInstanceId: string;
    readonly agentSurfaceId: string;
  }) => {
    const grant = await shellService.resolveAgentSurfaceGrant(input.windowId, {
      workbenchInstanceId: input.workbenchInstanceId,
      agentSurfaceId: input.agentSurfaceId,
    });
    const scope = grant.interaction.scope;
    const binding =
      scope.kind === 'workspace'
        ? {
            kind: 'workspace' as const,
            workspaceId: scope.workspaceId,
            workspaceGrantId: scope.workspaceGrantId,
          }
        : {
            kind: 'assistant' as const,
            assistantSpaceId:
              scope.kind === 'assistant' ? scope.assistantSpaceId : assistantSpaceId,
            baseGrantIds: [] as const,
          };
    const context = resolveDesktopDshSurfaceConversationContext({
      surfaceBinding: binding,
      workbench: grant.workbench,
    });
    let mentionIdentity;
    if (scope.kind === 'workspace') {
      const projection = await shellService.getProjection(input.windowId);
      const project = projection.catalog.projects.find(
        (candidate) => candidate.workspaceId === scope.workspaceId,
      );
      const tab = projection.window.tabs.find(
        (candidate) =>
          candidate.viewId === grant.interaction.agentViewId &&
          candidate.projectId === project?.projectId,
      );
      if (!project || !tab) {
        throw new Error(
          `Agent Surface '${input.agentSurfaceId}' has no exact Workspace Project View for mentions.`,
        );
      }
      mentionIdentity = createDesktopResourceBrowserIdentity({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        windowId: input.windowId,
        projectViewId: tab.viewId,
        projectViewInstanceId: tab.viewInstanceId,
        rendererSessionId: projection.rendererSessionId,
      });
    }
    return {
      grant,
      binding,
      context,
      ...(mentionIdentity === undefined ? {} : { mentionIdentity }),
      ...(scope.kind === 'unbound' || scope.conversationId === undefined
        ? {}
        : { conversationId: scope.conversationId }),
    };
  };
  const workspaceAssetMaterialization = new WorkspaceAssetMaterializationService({
    globalAssetRoot: globalStorage.assets,
    memberships: metadataRepositories.assetLibraryMemberships,
  });
  const dshComposerConfiguration = createDesktopDshComposerConfiguration({
    resolveSurface: async (input) => {
      const resolved = await resolveDshAgentSurfaceScope(input);
      return {
        windowId: input.windowId,
        binding: resolved.binding,
        ...(resolved.conversationId === undefined
          ? {}
          : { conversationId: resolved.conversationId }),
        ...(resolved.mentionIdentity === undefined
          ? {}
          : { mentionIdentity: resolved.mentionIdentity }),
      };
    },
    contexts: agentConversationContexts,
    canvas: canvasWorkspaceIndexService,
    canvasSelection: createDshConversationCanvasSelection(dshProduct.runtime.conversations.catalog),
    workspaceGrants: workspaceGrantAuthority,
    configuration: workspaceConfigAuthority,
    sessions: dshProduct.runtime.conversations.conversations,
    preTurnInputCatalog: dshProduct.runtime.client,
    lookupCwd: { resolve: dshProduct.runtime.resolveSessionCwd },
    executionCatalog: dshProduct.executionCatalog,
    resourceBrowser,
    assets: {
      materialize: ({ assetId, workspaceRoot }) =>
        workspaceAssetMaterialization.materialize({
          request: { assetId },
          workspaceRoot,
        }),
    },
    entities: {
      search: async ({ workspace, query, limit }) => {
        const resources = await readProjectEntityResources({ workspace });
        const normalizedQuery = query.toLocaleLowerCase();
        return resources.entities
          .filter((entity) => {
            if (normalizedQuery.length === 0) return true;
            return [entity.names.canonical, entity.names.display, ...entity.names.aliases].some(
              (name) => name?.toLocaleLowerCase().includes(normalizedQuery),
            );
          })
          .slice(0, limit);
      },
    },
    permissions: {
      read: (conversationId) =>
        conversationId === undefined
          ? dshProduct.runtime.client.readPermissionPresets()
          : dshProduct.runtime.conversations.conversations.readPermissionPresets(conversationId),
      set: async (conversationId, permissionPresetId) => {
        await dshProduct.runtime.conversations.conversations.setSessionMode(
          conversationId,
          permissionPresetId,
        );
        return dshProduct.runtime.conversations.conversations.readPermissionPresets(conversationId);
      },
    },
  });
  dshProduct.runtime.subscribe((projection) => {
    if (projection.status !== 'running') {
      dshComposerConfiguration.resetSessionExecutions();
    }
  });
  const dshPromptContext = createDshConversationTurnContextResolver({
    contexts: agentConversationContexts,
    workspaceGrants: workspaceGrantAuthority,
    canvas: canvasWorkspaceIndexService,
  });
  dshDomainConversations = createDshDomainConversationService({
    publication: dshProduct.runtime.conversations.publication,
    archive: dshProduct.runtime.conversations.archive,
    conversations: dshProduct.runtime.conversations.conversations,
    turnContext: dshPromptContext,
    turnCanvasTargets: dshTurnCanvasTargets,
    projection: dshProduct.runtime.client.projection,
  });
  const dshPromptImageAdmission = createAgentPromptImageAdmissionService();
  const dshPromptReferenceBytes = createDesktopDshPromptReferenceBytePort({
    contexts: agentConversationContexts,
    workspaceGrants: workspaceGrantAuthority,
    createContentRead: (workspacePath) =>
      createNodeHostContentReadService({ workspaceRoot: workspacePath }),
  });
  const dshPromptImages: ConstructorParameters<typeof DesktopDshSessionHost>[0]['promptImages'] = {
    admit: async ({ conversationId, windowId, ...input }) =>
      dshPromptImageAdmission.admit({
        ...input,
        referenceBytes: dshPromptReferenceBytes.authorize({ conversationId, windowId }),
      }),
  };
  const dshSessionHost = new DesktopDshSessionHost({
    bindings: dshProduct.runtime.bindings,
    catalog: dshProduct.runtime.conversations.catalog,
    conversations: dshProduct.runtime.conversations.conversations,
    branchConversation: (input) => dshProduct.runtime.conversations.branchConversation(input),
    turnCanvasTargets: dshTurnCanvasTargets,
    promptContext: dshPromptContext,
    promptImages: dshPromptImages,
    openWrittenFile: async ({ windowId, rendererSessionId, conversationId, reference }) => {
      const context = await agentConversationContexts.readContext(conversationId);
      if (context?.kind !== 'workspace' && context?.kind !== 'authoring') {
        throw new Error(
          `Agent Conversation '${conversationId}' has no Workspace document authority.`,
        );
      }
      await textEditorRuntime.openWorkspaceFile({
        windowId,
        rendererSessionId,
        workspaceId: context.workspaceId,
        contentLocator: reference.contentLocator,
        displayLabel: reference.title,
      });
    },
    imagePreviews: {
      project: ({ windowId, rendererSessionId, conversationId, attachment, read }) => {
        const lease = resourceRegistry.registerResourceTree(
          {
            windowId,
            rendererSessionId,
            sessionId: conversationId,
            viewId: dshImagePreviewViewId(conversationId),
          },
          {
            entries: [
              {
                virtualPath: 'image',
                byteLength: attachment.byteLength,
                contentType: attachment.mediaType,
                read,
              },
            ],
            release: () => undefined,
          },
        );
        return {
          url: new URL('image', lease.url).toString(),
          mediaType: attachment.mediaType,
          byteLength: attachment.byteLength,
          width: attachment.width,
          height: attachment.height,
        };
      },
      release: (windowId, conversationId) => {
        resourceRegistry.releaseView(windowId, dshImagePreviewViewId(conversationId));
      },
    },
    composer: dshComposerConfiguration,
    createConversation: async ({
      requestId,
      windowId,
      rendererSessionId,
      workbenchInstanceId,
      agentSurfaceId,
      permissionPresetId,
      target,
      initialInput,
    }) => {
      const resolved = await resolveDshAgentSurfaceScope({
        windowId,
        workbenchInstanceId,
        agentSurfaceId,
      });
      const { grant } = resolved;
      if (grant.interaction.phase !== 'draft') {
        throw new Error(`Agent Surface '${agentSurfaceId}' already has a Conversation.`);
      }
      const scope = grant.interaction.scope;
      if (target.kind === 'character-dialogue') {
        if (!experimentalCreativeCapabilitiesReady) {
          throw new Error('Character Dialogue is unavailable in the Release composition.');
        }
        requirePlainCharacterMessage(initialInput);
        const catalog = await characterGlobalCatalog.readCatalog();
        for (const participant of target.participants) {
          const publication = catalog.versions.find(
            (candidate) => candidate.characterVersionId === participant.characterVersionId,
          );
          if (publication?.globalCharacterId !== participant.globalCharacterId) {
            throw new Error(
              `CharacterVersion '${participant.characterVersionId}' does not belong to GlobalCharacter '${participant.globalCharacterId}'.`,
            );
          }
        }
        const launched = await characterConversationLaunches.launch({
          requestId,
          userId: 'user:local',
          userDisplayName: 'You',
          selection: {
            mode: target.mode,
            characters: target.participants.map((participant) => ({
              characterVersionId: participant.characterVersionId,
              ...(participant.roleProfileId === undefined
                ? {}
                : { roleProfileId: participant.roleProfileId }),
              ...('storyline' in participant && participant.storyline !== undefined
                ? { storyline: participant.storyline }
                : {}),
            })),
          },
        });
        const conversationId =
          launched.topology === 'dialogue'
            ? launched.primaryAgentSessionId
            : launched.interactionAgentSessionId;
        const context = (() => {
          if (launched.topology === 'dialogue') {
            return {
              kind: 'character' as const,
              characterId: launched.characterProjectId,
              characterVersionId: launched.characterVersionId,
              characterRunId: launched.characterRunId,
              dialogueRunId: launched.dialogueRunId,
            };
          }
          const participant = launched.participants[0];
          if (participant === undefined) {
            throw new Error(
              `Character Room '${launched.roomRunId}' has no interaction participant.`,
            );
          }
          return {
            kind: 'room' as const,
            scope: 'participant' as const,
            roomId: launched.characterRoomId,
            roomRunId: launched.roomRunId,
            participantId: participant.participantId,
            characterRunId: participant.characterRunId,
          };
        })();
        await dshProduct.runtime.conversations.conversations.setSessionMode(
          conversationId,
          permissionPresetId,
        );
        return {
          conversationId,
          completeInitialTurn: async () => {
            await shellService.attachAgentConversation({
              windowId,
              rendererSessionId,
              agentViewId: grant.interaction.agentViewId,
              draftId: scope.draftId,
              context,
              conversationId,
            });
          },
        };
      }
      const context = await resolveDesktopDshConversationContext({
        windowId,
        target,
        surfaceBinding: resolved.binding,
        surfaceContext: resolved.context,
        surfaceIsUnbound: scope.kind === 'unbound',
        projects: shellService,
        workspaceGrants: workspaceGrantAuthority,
        authoringTargets: {
          require: async ({ workspace, projectId, target }) => {
            const creativeWorkspace = await createProjectCreativeWorkspace({
              workspace,
              workspaceId: workspace.workspaceId,
              projectId,
            }).read({ projectId });
            const items =
              target.kind === 'content-document'
                ? creativeWorkspace.composition.content
                : target.kind === 'character-project'
                  ? creativeWorkspace.composition.characters
                  : creativeWorkspace.composition.worlds;
            const available = items.some((item) => {
              if (item.diagnostic !== undefined || item.target.kind !== target.kind) return false;
              if (item.target.kind === 'content-document' && target.kind === 'content-document') {
                return item.target.documentId === target.documentId;
              }
              if (item.target.kind === 'character-project' && target.kind === 'character-project') {
                return item.target.characterProjectId === target.characterProjectId;
              }
              return (
                item.target.kind === 'world-project' &&
                target.kind === 'world-project' &&
                item.target.worldProjectId === target.worldProjectId
              );
            });
            if (!available) {
              throw new Error(
                `Agent authoring target '${JSON.stringify(target)}' is unavailable in Project '${projectId}'.`,
              );
            }
          },
        },
      });
      const published = await dshProduct.runtime.conversations.publication.publish({
        context: context.context,
        title: projectDshConversationTitle(initialInput),
        ...(initialInput.kind === 'command' || initialInput.canvasTurnTarget === undefined
          ? {}
          : { canvasSelection: initialInput.canvasTurnTarget }),
      });
      await dshProduct.runtime.conversations.conversations.setSessionMode(
        published.conversationId,
        permissionPresetId,
      );
      await shellService.attachAgentConversation({
        windowId,
        rendererSessionId,
        agentViewId: grant.interaction.agentViewId,
        draftId: scope.draftId,
        context: context.surfaceBinding,
        conversationId: published.conversationId,
      });
      return { conversationId: published.conversationId };
    },
    domainTurns: {
      submit: async ({ requestId, conversationId, windowId, running, input }) => {
        const context = await agentConversationContexts.readContext(conversationId);
        if (context?.kind !== 'character' && context?.kind !== 'room') return false;
        if (running) {
          throw new Error(
            `Character Conversation '${conversationId}' cannot start another turn while its exact turn is active.`,
          );
        }
        const message = requirePlainCharacterMessage(input);
        await dshComposerConfiguration.applyConversation(conversationId, windowId);
        if (context.kind === 'character') {
          const dialogueRunId = context.dialogueRunId;
          const characterRunId = context.characterRunId;
          if (dialogueRunId === undefined || characterRunId === undefined) {
            throw new Error(
              `Character Conversation '${conversationId}' is missing its exact Run or Dialogue binding.`,
            );
          }
          await characterInteractions.submitTurn({
            topology: 'dialogue',
            dialogueRunId,
            characterRunId,
            requestId,
            message,
          });
        } else {
          await characterInteractions.submitTurn({
            topology: 'chatroom',
            roomRunId: context.roomRunId,
            primaryAgentSessionId: conversationId,
            requestId,
            message,
          });
        }
        return true;
      },
    },
    projection: dshProduct.runtime.client.projection,
    windows: appHost.windows,
    publishChanged: (event) => publishDshChanged(DSH_SESSION_CHANGED_CHANNEL, event),
  });
  const dshRuntimeHost = new DesktopDshRuntimeHost({
    runtime: dshProduct.runtime,
    windows: appHost.windows,
  });
  const dshExtensionManagementHost = new DesktopDshExtensionManagementHost({
    runtime: dshProduct.runtime,
    windows: appHost.windows,
    skills: {
      async add(sender) {
        const senderContents = webContents.fromId(sender.webContentsId);
        if (!senderContents) throw new Error('DSH Skill import requires live WebContents.');
        const owner = BrowserWindow.fromWebContents(senderContents);
        if (!owner) throw new Error('DSH Skill import requires an owning window.');
        const selection = await dialog.showOpenDialog(owner, {
          title: '添加 Skill',
          properties: ['openDirectory'],
        });
        const selectedDirectory = selection.filePaths[0];
        if (selection.canceled || selectedDirectory === undefined) return false;
        await importPersonalDshSkill({
          selectedDirectory,
          personalSkillRoot: path.join(dshProduct.prepared.profile.dshHome, 'skills'),
          disabledSkillRoot: path.join(dshProduct.prepared.profile.dshHome, 'disabled-skills'),
          bridge: dshProduct.runtime.client,
        });
        return true;
      },
    },
  });
  const professionalApplicationNative = createDesktopProfessionalApplicationNativePort();
  const professionalApplicationAdapter = new DesktopProfessionalApplicationAdapter(
    professionalApplicationNative,
    process.platform,
  );
  const professionalApplicationService = createProfessionalApplicationService({
    profiles: [COMFYUI_PROFESSIONAL_APPLICATION_PROFILE],
    bindings: professionalApplicationBindings,
    discovery: professionalApplicationAdapter,
    launcher: professionalApplicationAdapter,
    contentAuthorization: new DesktopUnavailableProfessionalApplicationContentAuthorization(),
  });
  const professionalApplicationHost = new DesktopProfessionalApplicationHost({
    service: professionalApplicationService,
    windows: appHost.windows,
    selection: {
      async selectApplicationIdentity(sender) {
        const senderContents = webContents.fromId(sender.webContentsId);
        if (!senderContents) {
          throw new Error('Professional application selection requires live WebContents.');
        }
        const owner = BrowserWindow.fromWebContents(senderContents);
        if (!owner) {
          throw new Error(
            'Professional application selection requires a registered BrowserWindow.',
          );
        }
        const selection = await dialog.showOpenDialog(owner, {
          title: 'Select Professional Application',
          buttonLabel: 'Select Application',
          properties: ['openFile'],
        });
        if (selection.canceled) return undefined;
        const selectedPath = selection.filePaths[0];
        if (!selectedPath || selection.filePaths.length !== 1) {
          throw new Error('Professional application selection requires exactly one application.');
        }
        return professionalApplicationAdapter.identifySelectedApplication(selectedPath);
      },
    },
  });
  const unsubscribeDshRuntimeStatus = dshProduct.runtime.subscribe(publishDshRuntimeChanged);
  const disposeIpc = registerDesktopIpc(appHost, {
    dshPermissions: dshPermissionHost,
    dshRuntime: dshRuntimeHost,
    dshSessions: dshSessionHost,
    dshExtensions: dshExtensionManagementHost,
    professionalApplications: professionalApplicationHost,
    saveCharacterPackage: async (event, produce) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('Character package export requires a registered BrowserWindow.');
      const selection = await dialog.showSaveDialog(owner, {
        title: 'Export Character Package',
        buttonLabel: 'Export',
        defaultPath: 'character.neko-character',
        filters: [{ name: 'OpenNeko Character', extensions: ['neko-character'] }],
      });
      if (selection.canceled || !selection.filePath) return false;
      await writeFile(selection.filePath, await produce());
      return true;
    },
    readCharacterPackage: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('Character package import requires a registered BrowserWindow.');
      const selection = await dialog.showOpenDialog(owner, {
        title: 'Import Character Package',
        buttonLabel: 'Preview Import',
        properties: ['openFile'],
        filters: [{ name: 'OpenNeko Character', extensions: ['neko-character'] }],
      });
      if (selection.canceled) return undefined;
      const selectedPath = selection.filePaths[0];
      if (!selectedPath) throw new Error('Character package picker returned no selected file.');
      const metadata = await lstat(selectedPath);
      if (!metadata.isFile() || metadata.size > 512 * 1024 * 1024) {
        throw new Error('Character package source is not a bounded regular file.');
      }
      return readFile(selectedPath);
    },
    saveWorldPackage: async (event, produce) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('World package export requires a registered BrowserWindow.');
      const selection = await dialog.showSaveDialog(owner, {
        title: 'Export World Package',
        buttonLabel: 'Export',
        defaultPath: 'world.neko-world',
        filters: [{ name: 'OpenNeko World', extensions: ['neko-world'] }],
      });
      if (selection.canceled || !selection.filePath) return false;
      await writeFile(selection.filePath, await produce());
      return true;
    },
    readWorldPackage: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('World package import requires a registered BrowserWindow.');
      const selection = await dialog.showOpenDialog(owner, {
        title: 'Import World Package',
        buttonLabel: 'Preview Import',
        properties: ['openFile'],
        filters: [{ name: 'OpenNeko World', extensions: ['neko-world'] }],
      });
      if (selection.canceled) return undefined;
      const selectedPath = selection.filePaths[0];
      if (!selectedPath) throw new Error('World package picker returned no selected file.');
      const metadata = await lstat(selectedPath);
      if (!metadata.isFile() || metadata.size > 512 * 1024 * 1024) {
        throw new Error('World package source is not a bounded regular file.');
      }
      return readFile(selectedPath);
    },
    selectWorkspaceGrant: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('Desktop workspace picker requires a registered BrowserWindow.');
      const selectedPath = await chooseWorkspaceDirectory(
        owner,
        resolveDefaultWorkspacePath(
          homedir,
          applicationSettings.current.preferences.defaultWorkspaceLocator,
        ),
      );
      return selectedPath
        ? { label: path.basename(selectedPath), hostResource: selectedPath }
        : undefined;
    },
    selectContentWorkspace: async (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('Desktop workspace picker requires a registered BrowserWindow.');
      const result = await dialog.showOpenDialog(owner, {
        title: 'Open Content Project',
        buttonLabel: 'Open Project',
        defaultPath: resolveDefaultWorkspacePath(
          homedir,
          applicationSettings.current.preferences.defaultWorkspaceLocator,
        ),
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
              hasShadow: true,
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
    unsubscribeDshRuntimeStatus();
    disposeIpc();
    await dshProduct.runtime.dispose();
    await appHost.dispose();
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

async function chooseWorkspaceDirectory(
  owner: BrowserWindow,
  defaultPath: string,
): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(owner, {
    title: 'Open Workspace',
    buttonLabel: 'Open Workspace',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return undefined;
  const selectedPath = result.filePaths[0];
  if (!selectedPath) {
    throw new Error('Desktop workspace picker completed without a selected directory.');
  }
  return selectedPath;
}

function resolveDefaultWorkspacePath(homedir: string, locator: string): string {
  const prefix = '${HOME}/';
  if (!locator.startsWith(prefix)) {
    throw new Error('Default Workspace locator must use the HOME variable.');
  }
  return path.resolve(homedir, locator.slice(prefix.length));
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
  const thumbnail = await createDesktopThumbnailPng(targetPath, size);
  return `data:image/png;base64,${Buffer.from(thumbnail).toString('base64')}`;
}

async function createDesktopThumbnailPng(
  targetPath: string,
  size: { readonly width: number; readonly height: number },
): Promise<Uint8Array> {
  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(targetPath, size);
    if (!thumbnail.isEmpty()) return thumbnail.toPNG();
  } catch {
    // Native thumbnail errors may contain the private absolute source path.
  }
  throw new Error('Desktop could not project a thumbnail for this resource.');
}

function readyCanvasPreviewBytes(
  bytes: Uint8Array,
  mediaType: string,
): {
  readonly status: 'ready';
  readonly source: PreviewResourceSource;
} {
  return {
    status: 'ready',
    source: {
      kind: 'bytes',
      bytes,
      mediaType,
      sourceFingerprint: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      byteLength: bytes.byteLength,
    },
  };
}

function registerCanvasPreviewBytes(
  resourceRegistry: DesktopResourceRegistry,
  owner: {
    readonly windowId: string;
    readonly viewId: string;
    readonly sessionId: string;
    readonly rendererSessionId: string;
  },
  bytes: Uint8Array,
  contentType: string,
) {
  const lease = resourceRegistry.registerResourceTree(owner, {
    entries: [
      {
        virtualPath: 'preview',
        byteLength: bytes.byteLength,
        contentType,
        read: async (signal) => {
          if (signal.aborted) throw signal.reason;
          return bytes;
        },
      },
    ],
    release: () => undefined,
  });
  return {
    url: new URL('preview', lease.url).toString(),
    sourceFingerprint: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteLength: bytes.byteLength,
    mediaType: contentType,
    release: () => lease.release(),
  };
}

function dshImagePreviewViewId(conversationId: string): string {
  return `dsh-image-previews:${conversationId}`;
}

function requireCanvasPreviewContentType(
  locator: ContentLocator,
  declared: string | undefined,
): string {
  if (declared?.includes('/')) return declared;
  const sourcePath = locator.selector?.kind === 'entry' ? locator.selector.path : locator.file.path;
  switch (path.posix.extname(sourcePath).toLocaleLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    case '.avif':
      return 'image/avif';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.md':
    case '.markdown':
      return 'text/markdown';
    case '.txt':
    case '.log':
    case '.fountain':
      return 'text/plain';
    case '.json':
      return 'application/json';
    case '.pdf':
      return 'application/pdf';
    default:
      throw new Error('Canvas preview content type is unavailable.');
  }
}

function isCanvasTextContentType(contentType: string): boolean {
  return (
    contentType.startsWith('text/') ||
    contentType === 'application/json' ||
    contentType.endsWith('+json')
  );
}

function canvasContentDisplayName(locator: ContentLocator): string {
  return path.posix.basename(
    locator.selector?.kind === 'entry' ? locator.selector.path : locator.file.path,
  );
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

function projectIdForWorkspace(workspaceId: string): string {
  if (!workspaceId.trim()) throw new Error('Workspace identity is required.');
  return `content:${workspaceId}`;
}

function requireProjectIdentity(workspaceId: string, projectId: string): void {
  const expected = projectIdForWorkspace(workspaceId);
  if (projectId !== expected) {
    throw new Error(`Project '${projectId}' does not match authorized Workspace '${workspaceId}'.`);
  }
}

function requirePlainCharacterMessage(input: DshComposerSubmitInput): string {
  if (
    input.kind !== 'message' ||
    input.text.trim().length === 0 ||
    input.references.length > 0 ||
    input.images.length > 0 ||
    input.contextPayloads.length > 0 ||
    input.canvasTurnTarget !== undefined
  ) {
    throw new Error(
      'Character Dialogue currently accepts one plain text message through its Chara-owned turn context.',
    );
  }
  return input.text.trim();
}
