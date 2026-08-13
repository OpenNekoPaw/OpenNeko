import { describe, expect, it, vi } from 'vitest';
import { createToolRegistry } from '@neko/agent-runtime/tool-registry';
import { createOpenNekoPiModels } from '@neko/agent-runtime/pi';
import type { ILogger } from '@neko/shared/logger';
import {
  createDesktopAgentBootstrapRequest,
  createDesktopAssistantAgentBootstrapRequest,
  createDesktopAgentDetachRequest,
  createDesktopAgentMessageRequest,
} from '../shared/agent-contract';
import { createDesktopBootstrapRequest } from '../shared/bridge-contract';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  createDesktopApplicationSettingsRequest,
  createDesktopApplicationSettingsUpdateRequest,
} from '@neko/host/application-settings';
import { createAgentExtensionManagementHostRequest } from '@neko/agent-contracts/extension-management-host';
import { parseAutomationLocalRuntimeManagementHostRequest } from '@neko/automation-contracts/local-runtime-management';
import { parseAutomationPermissionManagementHostRequest } from '@neko/automation-contracts/permission-management';
import { createAutomationTargetSelectionCoordinator } from '@neko/automation-node';
import { type AgentHomeNavigationIdentity } from '@neko/agent-contracts';
import {
  createDesktopConversationDeleteRequest,
  createDesktopProjectSelectionRequest,
  createDesktopProjectOpenRequest,
  createDesktopWindowMutationRequest,
  resolveActiveDesktopWindowWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { DesktopAppHost, type DesktopAppHostOptions } from './app-host';
import { createDesktopSceneTransitionRequest } from '@neko/host/desktop-scene-contract';
import {
  createDesktopContentProjectTargetRequest,
  createDesktopWorkspaceAuthoringLibraryTargetRequest,
  createDesktopWorkspaceDirectoryTargetRequest,
} from '@neko/host/desktop-workspace-grant-contract';
import { createAssetCenterHostRequest } from '@neko/assets-domain/asset-center';
import {
  AgentConversationLifecycleUnavailableError,
  createAgentConversationLifecycleService,
  createAgentDomainBindingApplicationService,
  createAgentLaunchDraftSubmissionApplicationService,
  createInMemoryAgentConversationLifecycleRepository,
  projectAgentConfigurationPolicy,
  type AgentConversationLifecycleService,
  type AssistantResourceService,
  type AgentAppHost,
  type AgentWorkspaceRuntime,
} from '@neko/agent-runtime/application';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';
import type { DesktopWorkspaceRegistry } from './desktop-workspace-registry';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { DESKTOP_APP_ORIGIN } from './security';
import { DesktopShellService } from '@neko/host/desktop-shell-service';
import { DesktopProjectRegistrationService } from '@neko/host/desktop-project-registration-service';
import { createInMemoryDesktopShellStateRepository } from '@neko/host/testing/desktop-shell-state';
import {
  DesktopApplicationSettingsService,
  type DesktopApplicationSettingsRepositoryPort,
  type DesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-service';
import type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionManager,
} from '@neko/agent-runtime/extensions';
import type { PersonalSkillManager } from '@neko/agent-runtime/pi';
import type { DesktopAgentLaunchRuntime } from './desktop-agent-launch-runtime';
import { DesktopWorkspaceGrantAuthority } from '@neko/host/desktop-workspace-grant-authority';
import { AssetCenterNodeRuntime, type AssetCenterNodeRuntimeOptions } from '@neko/assets-node';
import { TEXT_EDITOR_HOST_ROUTES, type TextEditorRuntimeIdentity } from '@neko/text-editor-domain';
import {
  RESOURCE_BROWSER_ROUTES,
  type ResourceBrowserProjection,
} from '@neko/assets-domain/resource-browser/contract';
import { DesktopWorkbenchContractError } from '@neko/host/desktop-workbench-contract';
import type { ResourceBrowserNodeRuntime } from '@neko/assets-node';
import { CharacterFoundationService } from '@neko/chara/application';
import { WorldFoundationService } from '@neko/world/application';
import type { RoomRun, RoomView } from '@neko/chara/contracts';
import {
  createCharacterAuthoringCommandRequest,
  createCharacterAuthoringSnapshotRequest,
  createCharacterPortableHostRequest,
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  createWorldAuthoringCommandRequest,
  createWorldAuthoringSnapshotRequest,
} from '@neko/world/contracts';
import {
  createProjectAuthoringCatalogHostRequest,
  createProjectAuthoringNavigationHostRequest,
  createProjectContentHostRequest,
  createProjectLocalAuthoringHostRequest,
  createProjectLocalAuthoringRetryHostRequest,
} from '@neko/project/contracts';

const standardCapabilityConstraint = async (input: {
  readonly context: { readonly kind: 'assistant' | 'workspace' | 'character' | 'room' | 'world' };
}) => ({
  owner: { kind: input.context.kind, id: 'test-binding' },
  skills: 'configured' as const,
  tools: 'configured' as const,
  references: 'configured' as const,
});

describe('DesktopAppHost', () => {
  it('delegates Character Foundation commands to the package owner and returns its projection', async () => {
    const commands = { execute: vi.fn(async () => undefined) };
    const fixture = await createShellAppHost({ characterFoundationCommands: commands });
    await expect(
      fixture.appHost.executeCharacterFoundationRequest(fixture.sender, {
        requestId: 'character-request-1',
        operation: 'character-project-set-review',
        input: { characterProjectId: 'character-project:a', reviewStatus: 'ready' },
      }),
    ).resolves.toMatchObject({
      requestId: 'character-request-1',
      snapshot: { character: { projects: [], versions: [] }, diagnostics: [] },
    });
    expect(commands.execute).toHaveBeenCalledOnce();
    await fixture.appHost.dispose();
  });

  it('returns the Chara-owned conversation launch catalog without executing a command', async () => {
    const commands = { execute: vi.fn(async () => undefined) };
    const fixture = await createShellAppHost({ characterFoundationCommands: commands });

    await expect(
      fixture.appHost.executeCharacterFoundationRequest(fixture.sender, {
        requestId: 'character-launch-catalog-request-1',
        operation: 'conversation-launch-catalog-get',
      }),
    ).resolves.toEqual({
      requestId: 'character-launch-catalog-request-1',
      catalog: { targets: [], diagnostics: [] },
    });
    expect(commands.execute).not.toHaveBeenCalled();
    await fixture.appHost.dispose();
  });

  it('delegates World Foundation commands to the package owner and returns its projection', async () => {
    const commands = { execute: vi.fn(async () => undefined) };
    const fixture = await createShellAppHost({ worldFoundationCommands: commands });
    await expect(
      fixture.appHost.executeWorldFoundationRequest(fixture.sender, {
        requestId: 'world-request-1',
        operation: 'world-project-create',
        input: {
          worldProjectId: 'world-project:a',
          title: 'Archive City',
          draft: {
            background: 'A city of archives.',
            worldBook: [],
            locations: [],
            organizations: [],
            rules: [],
            initialFacts: [],
          },
        },
      }),
    ).resolves.toMatchObject({
      requestId: 'world-request-1',
      snapshot: { world: { projects: [], versions: [], runtimes: [] }, diagnostics: [] },
    });
    expect(commands.execute).toHaveBeenCalledOnce();
    await fixture.appHost.dispose();
  });

  it('maps only Main View capacity failures to an owner-bound Resource Browser rejection', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'resource-browser:project-view-1',
      viewInstanceId: 'view-instance-1',
      rendererSessionId: 'renderer-session-1',
    } as const;
    const resourceProjection: ResourceBrowserProjection = {
      identity,
      source: 'files',
      query: '',
      items: [],
    };
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new DesktopWorkbenchContractError(
          'desktop-workbench-main-view-capacity-reached',
          'Desktop Workbench supports at most eight open Main Views.',
        ),
      )
      .mockResolvedValueOnce(resourceProjection);
    const resourceBrowser = { execute } as unknown as ResourceBrowserNodeRuntime;
    const fixture = await createShellAppHost({ resourceBrowser });
    const request = {
      requestId: 'open-ninth-view',
      identity: { ...identity, windowId: fixture.windowId },
      route: RESOURCE_BROWSER_ROUTES.editText,
      resourceId: 'content:ninth',
    } as const;
    const before = await fixture.appHost.shell.getProjection(fixture.windowId);

    await expect(fixture.appHost.executeResourceBrowser(fixture.sender, request)).resolves.toEqual({
      requestId: request.requestId,
      identity: request.identity,
      status: 'rejected',
      rejection: { code: 'main-view-capacity-reached', maximum: 8 },
    });
    expect(await fixture.appHost.shell.getProjection(fixture.windowId)).toEqual(before);
    await expect(
      fixture.appHost.executeResourceBrowser(fixture.sender, {
        ...request,
        requestId: 'retry-ninth-view',
      }),
    ).resolves.toEqual({
      requestId: 'retry-ninth-view',
      identity: request.identity,
      status: 'completed',
      projection: resourceProjection,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('keeps Desktop settings sender-bound and opens Agent configuration through its owner action', async () => {
    const logger = createLogger();
    const settings = createSettingsService();
    await settings.initialize();
    const openAgentAdvancedSettings = vi.fn(async () => undefined);
    const shell = createShellService('app-1');
    const agent = createAgentComposition();
    const appHost = new DesktopAppHost({
      host: createElectronNekoHostPorts({
        homedir: '/Users/fixture',
        nekoHome: '/Users/fixture/.openneko',
        logger,
      }),
      instanceId: 'app-1',
      logger,
      shell,
      projectManagement: createProjectManagementService(shell, agent),
      projectAuthoring: createProjectAuthoring(),
      agent,
      assistantWorkspace: createAssistantWorkspaceResolution(),
      agentLaunch: createAgentLaunchRuntime(),
      agentLaunchSubmission: createAgentLaunchSubmission(),
      workspaceGrants: createWorkspaceGrantAuthority(),
      authoringLibraryRoots: createAuthoringLibraryRoots(),
      conversationLifecycle: createConversationLifecycle(),
      extensionManager: createExtensionManager(),
      personalSkillManager: createPersonalSkillManager(),
      automationLocalRuntimes: createAutomationLocalRuntimes(),
      automationPermissions: createAutomationPermissions(),
      automationTargetSelections: createAutomationTargetSelectionCoordinator(),
      automationSessions: createAutomationSessions(),
      characterFoundation: createCharacterFoundationService(),
      characterFoundationCommands: createCharacterFoundationCommands(),
      worldFoundation: createWorldFoundationService(),
      worldFoundationCommands: createWorldFoundationCommands(),
      characterInteractions: createCharacterInteractions(),
      characterRoomConversations: createCharacterRoomConversations(),
      characterRoomWorkbench: createCharacterRoomWorkbench(),
      settings,
      openAgentAdvancedSettings,
    });
    appHost.windows.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });
    const sender = {
      webContentsId: 10,
      frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    };

    expect(
      appHost.createApplicationSettingsSnapshot(
        sender,
        createDesktopApplicationSettingsRequest('settings-get-1'),
      ).projection.preferences,
    ).toEqual(DEFAULT_DESKTOP_APPLICATION_PREFERENCES);
    const updated = await appHost.updateApplicationSettings(
      sender,
      createDesktopApplicationSettingsUpdateRequest('settings-update-1', {
        ...DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
        theme: 'dark',
      }),
    );
    expect(updated.projection).toMatchObject({
      preferences: { theme: 'dark' },
    });
    await expect(
      appHost.openAgentAdvancedSettings(
        sender,
        createDesktopApplicationSettingsRequest('settings-agent-1'),
      ),
    ).resolves.toMatchObject({ status: 'opened' });
    expect(openAgentAdvancedSettings).toHaveBeenCalledOnce();
    await expect(
      appHost.updateApplicationSettings(
        {
          webContentsId: 11,
          frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
        },
        createDesktopApplicationSettingsUpdateRequest(
          'settings-foreign-1',
          DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
        ),
      ),
    ).rejects.toThrow(/Unknown Desktop IPC sender/);
    await expect(appHost.executeAgentAutomation(sender, {})).rejects.toThrow(
      'unavailable outside an isolated fixture',
    );
    await appHost.dispose();
  });

  it('derives bootstrap identity from the registered sender and redacts host environment', async () => {
    const logger = createLogger();
    const host = createElectronNekoHostPorts({
      homedir: '/Users/fixture',
      nekoHome: '/Users/fixture/Library/Application Support/OpenNeko',
      env: { OPENNEKO_PRIVATE_TEST_VALUE: 'must-not-cross-bridge' },
      locale: 'zh-CN',
      logger,
    });
    const shell = createShellService('app-1');
    const agent = createAgentComposition();
    const appHost = new DesktopAppHost({
      host,
      instanceId: 'app-1',
      logger,
      shell,
      projectManagement: createProjectManagementService(shell, agent),
      projectAuthoring: createProjectAuthoring(),
      agent,
      assistantWorkspace: createAssistantWorkspaceResolution(),
      agentLaunch: createAgentLaunchRuntime(),
      agentLaunchSubmission: createAgentLaunchSubmission(),
      workspaceGrants: createWorkspaceGrantAuthority(),
      authoringLibraryRoots: createAuthoringLibraryRoots(),
      conversationLifecycle: createConversationLifecycle(),
      extensionManager: createExtensionManager(),
      personalSkillManager: createPersonalSkillManager(),
      automationLocalRuntimes: createAutomationLocalRuntimes(),
      automationPermissions: createAutomationPermissions(),
      automationTargetSelections: createAutomationTargetSelectionCoordinator(),
      automationSessions: createAutomationSessions(),
      characterFoundation: createCharacterFoundationService(),
      characterFoundationCommands: createCharacterFoundationCommands(),
      worldFoundation: createWorldFoundationService(),
      worldFoundationCommands: createWorldFoundationCommands(),
      characterInteractions: createCharacterInteractions(),
      characterRoomConversations: createCharacterRoomConversations(),
      characterRoomWorkbench: createCharacterRoomWorkbench(),
      settings: createSettingsService(),
      openAgentAdvancedSettings: vi.fn(async () => undefined),
    });
    appHost.windows.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });
    const loading = appHost.windows.rendererLoading('window-1', 'app-1');

    const projection = await appHost.createBootstrapProjection(
      {
        webContentsId: 10,
        frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
      },
      createDesktopBootstrapRequest('request-1'),
    );

    expect(projection).toMatchObject({
      requestId: 'request-1',
      application: {
        applicationId: 'neko-desktop',
        instanceId: 'app-1',
      },
      window: {
        windowId: 'window-1',
        rendererSessionId: loading.rendererSessionId,
      },
      host: {
        id: 'openneko-desktop-electron',
        kind: 'electron',
        ui: 'graphical',
        displayName: 'OpenNeko Desktop',
      },
    });
    expect(Object.keys(projection.host).sort()).toEqual(['displayName', 'id', 'kind', 'ui']);
    expect(JSON.stringify(projection)).not.toContain('must-not-cross-bridge');
    expect(JSON.stringify(projection)).not.toContain('/Users/fixture');
  });

  it('fails visibly after disposal', async () => {
    const logger = createLogger();
    const agent = createAgentComposition();
    const shell = createShellService('app-1');
    const appHost = new DesktopAppHost({
      host: createElectronNekoHostPorts({
        homedir: '/Users/fixture',
        nekoHome: '/Users/fixture/.openneko',
        logger,
      }),
      instanceId: 'app-1',
      logger,
      shell,
      projectManagement: createProjectManagementService(shell, agent),
      projectAuthoring: createProjectAuthoring(),
      agent,
      assistantWorkspace: createAssistantWorkspaceResolution(),
      agentLaunch: createAgentLaunchRuntime(),
      agentLaunchSubmission: createAgentLaunchSubmission(),
      workspaceGrants: createWorkspaceGrantAuthority(),
      authoringLibraryRoots: createAuthoringLibraryRoots(),
      conversationLifecycle: createConversationLifecycle(),
      extensionManager: createExtensionManager(),
      personalSkillManager: createPersonalSkillManager(),
      automationLocalRuntimes: createAutomationLocalRuntimes(),
      automationPermissions: createAutomationPermissions(),
      automationTargetSelections: createAutomationTargetSelectionCoordinator(),
      automationSessions: createAutomationSessions(),
      characterFoundation: createCharacterFoundationService(),
      characterFoundationCommands: createCharacterFoundationCommands(),
      worldFoundation: createWorldFoundationService(),
      worldFoundationCommands: createWorldFoundationCommands(),
      characterInteractions: createCharacterInteractions(),
      characterRoomConversations: createCharacterRoomConversations(),
      characterRoomWorkbench: createCharacterRoomWorkbench(),
      settings: createSettingsService(),
      openAgentAdvancedSettings: vi.fn(async () => undefined),
    });
    await appHost.dispose();

    expect(agent.dispose).toHaveBeenCalledOnce();
    await expect(
      appHost.createBootstrapProjection(
        {
          webContentsId: 10,
          frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
        },
        createDesktopBootstrapRequest('request-1'),
      ),
    ).rejects.toThrow('Desktop AppHost is disposed');
  });

  it('rejects an unknown sender before opening the workspace picker', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => '/workspace/demo');

    await expect(
      fixture.appHost.openContentProject(
        {
          webContentsId: 11,
          frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
        },
        createDesktopWindowMutationRequest('request-1', fixture.projection.rendererSessionId),
        selectWorkspace,
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
    expect(selectWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('binds Scene transitions to the registered sender Window and Host authority', async () => {
    const fixture = await createShellAppHost();
    const request = createDesktopSceneTransitionRequest({
      requestId: 'scene-transition-1',
      rendererSessionId: fixture.projection.rendererSessionId,
      windowId: fixture.windowId,
      sceneId: activeScene(fixture.projection).sceneId,
      intent: { kind: 'open-settings', sectionId: 'appearance' },
    });

    await expect(fixture.appHost.transitionScene(fixture.sender, request)).resolves.toMatchObject({
      status: 'transitioned',
      requestId: request.requestId,
      scene: {
        context: { kind: 'settings', settingsSectionId: 'appearance' },
        slots: {
          leftManager: { kind: 'settings-navigation', settingsSectionId: 'appearance' },
          main: { kind: 'settings-main', settingsSectionId: 'appearance' },
        },
      },
    });
    await expect(
      fixture.appHost.transitionScene(fixture.sender, {
        ...request,
        requestId: 'scene-transition-foreign',
        windowId: 'window-other',
      }),
    ).rejects.toThrow('belongs to another Window');
  });

  it('keeps directory target selection inert until the Draft is submitted', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const chooseRequest = createDesktopWorkspaceDirectoryTargetRequest({
      requestId: 'workspace-choose-1',
      rendererSessionId: fixture.projection.rendererSessionId,
      windowId: fixture.windowId,
    });
    const initialScene = activeScene(fixture.projection);
    const initialConversationCount = fixture.projection.agentHome.conversations.length;
    const foreignPicker = vi.fn(async () => ({
      label: 'foreign',
      hostResource: '/Users/fixture/foreign',
    }));
    await expect(
      fixture.appHost.resolveWorkspaceTarget(
        { webContentsId: 11, frameUrl: `${DESKTOP_APP_ORIGIN}/index.html` },
        chooseRequest,
        foreignPicker,
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
    expect(foreignPicker).not.toHaveBeenCalled();

    await expect(
      fixture.appHost.resolveWorkspaceTarget(fixture.sender, chooseRequest, async () => undefined),
    ).resolves.toEqual({
      requestId: 'workspace-choose-1',
      status: 'cancelled',
    });
    expect(await fixture.appHost.shell.getSceneProjection(fixture.windowId)).toEqual(initialScene);
    expect(fixture.registry.resolve).not.toHaveBeenCalled();

    const resolution: AssetWorkspaceResolution = {
      workspaceId: 'workspace-explicit',
      workspacePath: '/Users/fixture/demo',
      displayName: 'demo',
      locator: { kind: 'variable', value: '${HOME}/demo' },
    };
    fixture.registry.resolve.mockResolvedValue(resolution);
    const selected = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      { ...chooseRequest, requestId: 'workspace-choose-2' },
      async () => ({ label: 'demo', hostResource: '/Users/fixture/demo' }),
    );
    expect(selected.status).toBe('authorized');
    expect(JSON.stringify(selected)).not.toContain('/Users/fixture');
    if (selected.status !== 'authorized')
      throw new Error('Expected an authorized Workspace grant.');
    const afterSelection = await fixture.appHost.shell.getProjection(fixture.windowId);
    expect(activeScene(afterSelection)).toEqual(initialScene);
    expect(afterSelection.agentHome.conversations).toHaveLength(initialConversationCount);
    expect(afterSelection.catalog.projects).toHaveLength(0);
    expect(afterSelection.window.tabs).toHaveLength(0);
    expect(fixture.registry.resolve).toHaveBeenCalledWith('/Users/fixture/demo');
    if (initialScene.context.kind !== 'agent' || initialScene.context.scope.kind !== 'unbound') {
      throw new Error('Expected the exact unbound Entry Draft to remain active.');
    }
    const entryConnection = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(afterSelection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(afterSelection),
      viewId: initialScene.context.agentViewId,
      connectionId: 'launch-entry-workspace-1',
      draftId: initialScene.context.scope.draftId,
      binding: {
        kind: 'workspace',
        workspaceId: resolution.workspaceId,
        workspaceGrantId: selected.grant.workspaceGrantId,
      },
    });
    vi.spyOn(agentLaunch, 'readCatalog').mockReturnValue(entryConnection);
    const transitionScene = vi.spyOn(fixture.appHost.shell, 'transitionScene');
    const submitRequest = {
      requestId: 'workspace-first-submit-1',
      operation: 'submit-draft' as const,
      connection: entryConnection.connection,
      input: {
        draft: entryConnection.interaction,
        entryTargetReceipt: null,
        input: { kind: 'message' as const, text: 'Continue in the selected workspace' },
        references: [],
        resourceGrantIds: [],
        configuration: {
          modelCatalogEntryId: 'openai:gpt-5',
          providerId: 'openai',
          modelId: 'gpt-5',
          executionMode: 'ask' as const,
        },
      },
    };
    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, submitRequest),
    ).resolves.toMatchObject({ status: 'committed' });
    expect(transitionScene).not.toHaveBeenCalled();
    const workspaceSessionProjection = await fixture.appHost.shell.getProjection(fixture.windowId);
    expect(activeScene(workspaceSessionProjection)).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'workspace',
          draftId: initialScene.context.scope.draftId,
          workspaceId: 'workspace-explicit',
          workspaceGrantId: selected.grant.workspaceGrantId,
          conversationId: expect.stringMatching(/^conversation:/),
        },
      },
      slots: { interaction: { phase: 'session' } },
    });
    expect(workspaceSessionProjection.catalog.projects).toHaveLength(1);
    expect(workspaceSessionProjection.window.tabs).toHaveLength(1);
    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, submitRequest),
    ).resolves.toMatchObject({ status: 'committed' });
    const replayedProjection = await fixture.appHost.shell.getProjection(fixture.windowId);
    expect(replayedProjection.catalog.projects).toHaveLength(1);
    expect(replayedProjection.window.tabs).toHaveLength(1);
    expect(activeScene(replayedProjection)).toEqual(activeScene(workspaceSessionProjection));
    const workspaceConversationCount = workspaceSessionProjection.agentHome.conversations.length;
    const workspaceDraft = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'workspace-new-conversation',
        rendererSessionId: workspaceSessionProjection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(workspaceSessionProjection).sceneId,
        intent: { kind: 'new-agent-conversation' },
      }),
    );
    expect(workspaceDraft).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: {
            kind: 'workspace',
            workspaceId: 'workspace-explicit',
            workspaceGrantId: selected.grant.workspaceGrantId,
            draftId: expect.stringMatching(/^draft:/u),
          },
        },
        slots: { interaction: { phase: 'draft' } },
      },
    });
    expect(
      (await fixture.appHost.shell.getProjection(fixture.windowId)).agentHome.conversations,
    ).toHaveLength(workspaceConversationCount);
  });

  it('registers Entry Content targets and authorizes configured libraries without navigation', async () => {
    const fixture = await createShellAppHost();
    const initialScene = activeScene(fixture.projection);
    fixture.registry.resolve.mockImplementation(async (hostResource) => ({
      workspaceId: hostResource.includes('characters') ? 'library-characters' : 'workspace-novel',
      workspacePath: hostResource,
      displayName: hostResource.includes('characters') ? 'Characters' : 'Novel',
      locator: { kind: 'variable' as const, value: '${HOME}/target' },
    }));
    const created = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      createDesktopContentProjectTargetRequest({
        requestId: 'content-create-1',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
      }),
      async () => ({ label: 'Novel', hostResource: '/Users/fixture/novel' }),
    );
    expect(created).toMatchObject({
      status: 'authorized-project',
      workspaceId: 'workspace-novel',
      projectId: 'content:workspace-novel',
    });
    const afterCreate = await fixture.appHost.shell.getProjection(fixture.windowId);
    expect(activeScene(afterCreate)).toEqual(initialScene);
    expect(afterCreate.window.tabs).toHaveLength(0);
    expect(afterCreate.catalog.projects).toHaveLength(1);

    const library = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      createDesktopWorkspaceAuthoringLibraryTargetRequest({
        requestId: 'library-select-1',
        rendererSessionId: afterCreate.rendererSessionId,
        windowId: fixture.windowId,
        library: 'character',
      }),
      async () => {
        throw new Error('Configured library selection must not open the native picker.');
      },
    );
    expect(library).toMatchObject({ status: 'authorized', workspaceId: 'library-characters' });
    expect(JSON.stringify(library)).not.toContain('/Users/fixture');
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toEqual(
      initialScene,
    );
  });

  it('binds Agent launch attach to the exact unbound Entry Draft identity', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'unbound') {
      throw new Error('Agent launch AppHost fixture requires an unbound Entry Draft.');
    }
    const draft = {
      phase: 'draft' as const,
      draftId: scene.context.scope.draftId,
      binding: { kind: 'unbound' as const },
      bindingReceipt: null,
    };
    const workbench = activeWorkbench(fixture.projection);
    const agentSurfaceId = currentAgentSurfaceId(fixture.projection);
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId,
      viewId: scene.context.agentViewId,
      connectionId: 'launch-entry-1',
      draftId: scene.context.scope.draftId,
      binding: draft.binding,
    });
    vi.spyOn(agentLaunch, 'attach').mockResolvedValue(catalog);

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-entry-attach-1',
        operation: 'attach',
        workbenchInstanceId: workbench.workbenchInstanceId,
        agentSurfaceId,
        viewId: scene.context.agentViewId,
        draft,
      }),
    ).resolves.toMatchObject({ status: 'ready', catalog });
    expect(agentLaunch.attach).toHaveBeenCalledWith({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId,
      viewId: scene.context.agentViewId,
      draft,
    });
    await fixture.appHost.dispose();
  });

  it('restores the exact Workspace grant on Draft attach after the process authority is rebuilt', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const workspace = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(workspace);
    const selected = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      createDesktopWorkspaceDirectoryTargetRequest({
        requestId: 'restart-workspace-grant',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
      }),
      async () => ({ label: workspace.displayName, hostResource: workspace.workspacePath }),
    );
    if (selected.status !== 'authorized') throw new Error('Expected Workspace authorization.');
    const opened = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restart-workspace-open',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: selected.grant.workspaceGrantId },
      }),
    );
    if (opened.status !== 'transitioned') throw new Error('Expected Workspace Scene.');
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const scene = activeScene(projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
      throw new Error('Workspace grant restart fixture requires a Workspace Draft.');
    }
    const draft = {
      phase: 'draft' as const,
      draftId: scene.context.scope.draftId,
      binding: {
        kind: 'workspace' as const,
        workspaceId: scene.context.scope.workspaceId,
        workspaceGrantId: scene.context.scope.workspaceGrantId,
      },
      bindingReceipt: null,
    };
    const workbench = activeWorkbench(projection);
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(projection),
      viewId: scene.context.agentViewId,
      connectionId: 'launch-workspace-restart',
      draftId: draft.draftId,
      binding: draft.binding,
    });
    vi.spyOn(agentLaunch, 'attach').mockResolvedValue(catalog);
    fixture.appHost.workspaceGrants.releaseWindow(fixture.windowId);
    const restore = vi.spyOn(fixture.appHost.workspaceGrants, 'restore');
    const request = {
      operation: 'attach' as const,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(projection),
      viewId: scene.context.agentViewId,
      draft,
    };

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-workspace-after-restart',
        ...request,
      }),
    ).resolves.toEqual({
      requestId: 'launch-workspace-after-restart',
      status: 'ready',
      catalog,
    });
    expect(restore).toHaveBeenCalledWith(
      fixture.windowId,
      selected.grant.workspaceGrantId,
      workspace.workspaceId,
    );
    await expect(
      fixture.appHost.workspaceGrants.resolveAuthorizedWorkspace(
        selected.grant.workspaceGrantId,
        workspace.workspaceId,
      ),
    ).resolves.toMatchObject({ workspaceGrantId: selected.grant.workspaceGrantId });

    fixture.appHost.workspaceGrants.releaseWindow(fixture.windowId);
    fixture.registry.resolve.mockRejectedValueOnce(
      new Error(`/private/workspaces/${workspace.workspaceId} is unavailable`),
    );
    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-workspace-restore-unavailable',
        ...request,
      }),
    ).resolves.toEqual({
      requestId: 'launch-workspace-restore-unavailable',
      status: 'unavailable',
      diagnostic: {
        code: 'agent-workspace-binding-unavailable',
        owner: 'workspace',
        message: 'The exact Workspace access for this Agent draft is unavailable.',
      },
    });
    expect(agentLaunch.attach).toHaveBeenCalledTimes(1);
    await expect(fixture.appHost.shell.getProjection(fixture.windowId)).resolves.toMatchObject({
      window: expect.any(Object),
    });
    await fixture.appHost.dispose();
  });

  it('enters an authorized Workspace without consulting Project fact projections', async () => {
    const fixture = await createShellAppHost();
    const workspace = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(workspace);
    const selected = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      createDesktopWorkspaceDirectoryTargetRequest({
        requestId: 'composition-independent-workspace-grant',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
      }),
      async () => ({ label: workspace.displayName, hostResource: workspace.workspacePath }),
    );
    if (selected.status !== 'authorized') throw new Error('Expected Workspace authorization.');

    await expect(
      fixture.appHost.transitionScene(
        fixture.sender,
        createDesktopSceneTransitionRequest({
          requestId: 'composition-independent-workspace-open',
          rendererSessionId: fixture.projection.rendererSessionId,
          windowId: fixture.windowId,
          sceneId: activeScene(fixture.projection).sceneId,
          intent: { kind: 'open-workspace', workspaceGrantId: selected.grant.workspaceGrantId },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: { kind: 'workspace', workspaceId: workspace.workspaceId },
        },
      },
    });
  });

  it('delegates Entry target configuration only for the sender-bound launch connection', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent') throw new Error('Expected an Agent Scene.');
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(fixture.projection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      viewId: scene.context.agentViewId,
      connectionId: 'launch-entry-target',
      draftId: scene.context.scope.draftId,
      binding: { kind: 'unbound' },
    });
    const binding = {
      kind: 'authoring' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      authority: { kind: 'content-project' as const, contentProjectId: 'content-1' },
      target: { kind: 'content-project' as const, contentProjectId: 'content-1' },
    };
    const intent = {
      mode: 'authoring' as const,
      targetReceipt: {
        targetReceiptId: 'target-receipt-1',
        draftId: catalog.connection.draftId,
        connectionId: catalog.connection.connectionId,
        mode: 'authoring' as const,
        binding,
      },
    };
    vi.mocked(agentLaunch.configureEntryTarget).mockResolvedValueOnce(intent);
    vi.mocked(agentLaunch.readCatalog).mockReturnValue(catalog);

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'configure-entry-target-1',
        operation: 'configure-entry-target',
        connection: catalog.connection,
        mode: 'authoring',
        binding,
      }),
    ).resolves.toEqual({
      requestId: 'configure-entry-target-1',
      status: 'entry-configured',
      intent,
      catalog,
    });
    expect(agentLaunch.configureEntryTarget).toHaveBeenCalledWith(
      catalog.connection,
      'authoring',
      binding,
    );

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'configure-entry-target-cross-window',
        operation: 'configure-entry-target',
        connection: { ...catalog.connection, windowId: 'window-other' },
        mode: 'assistant',
        binding: null,
      }),
    ).rejects.toThrow('sender-bound Desktop identity');
    await fixture.appHost.dispose();
  });

  it('routes Draft mention search through the sender-bound launch connection and receipt', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent') throw new Error('Expected an Agent Scene.');
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(fixture.projection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      viewId: scene.context.agentViewId,
      connectionId: 'launch-workspace-search',
      draftId: scene.context.scope.draftId,
      binding: {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
    });
    const bindingReceiptId = catalog.interaction.bindingReceipt?.bindingReceiptId;
    if (!bindingReceiptId) throw new Error('Expected a Workspace binding receipt.');
    vi.mocked(agentLaunch.searchWorkspaceMentions).mockResolvedValueOnce({
      bindingReceiptId,
      filter: 'hero',
      files: [
        {
          locator: { kind: 'workspace-file', path: 'hero.md' },
          name: 'hero.md',
          type: 'file',
          referenceReceipt: {
            catalogEntryId: 'mention:hero',
            referenceId: 'workspace-reference:hero',
            ownerKind: 'workspace',
            ownerId: 'workspace-1',
            bindingReceiptId,
          },
        },
      ],
      mentionExtras: [],
    });

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-workspace-search-1',
        operation: 'search-workspace-mentions',
        connection: catalog.connection,
        bindingReceiptId,
        filter: 'hero',
      }),
    ).resolves.toMatchObject({
      requestId: 'launch-workspace-search-1',
      status: 'mentions',
      projection: { bindingReceiptId, filter: 'hero' },
    });
    expect(agentLaunch.searchWorkspaceMentions).toHaveBeenCalledWith(
      catalog.connection,
      bindingReceiptId,
      'hero',
    );
    await fixture.appHost.dispose();
  });

  it('materializes the configured default Assistant for an unbound Draft submit', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'unbound') {
      throw new Error('Unbound first-submit fixture requires an Entry Draft.');
    }
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(fixture.projection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      viewId: scene.context.agentViewId,
      connectionId: 'launch-unbound-submit',
      draftId: scene.context.scope.draftId,
      binding: { kind: 'unbound' },
    });
    vi.mocked(agentLaunch.readCatalog).mockReturnValue(catalog);
    const attachAgentConversation = vi.spyOn(fixture.appHost.shell, 'attachAgentConversation');

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'unbound-first-submit',
        operation: 'submit-draft',
        connection: catalog.connection,
        input: {
          draft: catalog.interaction,
          entryTargetReceipt: null,
          input: { kind: 'message', text: 'Create a plan' },
          references: [],
          resourceGrantIds: [],
          configuration: {
            modelCatalogEntryId: 'openai:gpt-5',
            providerId: 'openai',
            modelId: 'gpt-5',
            executionMode: 'ask',
          },
        },
      }),
    ).resolves.toMatchObject({
      status: 'committed',
      projection: {
        session: {
          phase: 'session',
          conversationId: 'conversation:lifecycle-1',
          binding: {
            kind: 'assistant',
            assistantSpaceId: 'assistant-space:local-user',
          },
        },
      },
    });
    expect(attachAgentConversation).toHaveBeenCalledOnce();
    expect(agentLaunch.commitResourceGrants).toHaveBeenCalledWith(
      catalog.connection,
      'conversation:lifecycle-1',
      [],
    );
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'assistant',
          assistantSpaceId: 'assistant-space:local-user',
          conversationId: 'conversation:lifecycle-1',
        },
      },
      slots: { interaction: { phase: 'session' } },
    });
    await fixture.appHost.conversationLifecycle.waitForProviderIdle();
    await fixture.appHost.dispose();
  });

  it('commits a Character Dialogue receipt into its exact runtime Conversation and Scene', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const materialize = vi.fn(async () => ({
      conversationId: 'conversation:character:character-run-entry-1',
      context: {
        kind: 'character' as const,
        characterId: 'character-project-entry-1',
        characterVersionId: 'character-version-entry-1',
        characterRunId: 'character-run-entry-1',
        dialogueRunId: 'dialogue-run-entry-1',
      },
    }));
    const fixture = await createShellAppHost({
      agentLaunch,
      runtimeEntry: { validate: vi.fn(async () => undefined), materialize },
    });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'unbound') {
      throw new Error('Character first-submit fixture requires an Entry Draft.');
    }
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(fixture.projection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      viewId: scene.context.agentViewId,
      connectionId: 'launch-character-submit',
      draftId: scene.context.scope.draftId,
      binding: { kind: 'unbound' },
    });
    vi.mocked(agentLaunch.readCatalog).mockReturnValue(catalog);
    const entryTargetReceipt = {
      targetReceiptId: 'target-receipt-character-entry-1',
      draftId: catalog.interaction.draftId,
      connectionId: catalog.connection.connectionId,
      mode: 'character-dialogue' as const,
      binding: {
        kind: 'character-dialogue' as const,
        mode: 'companion' as const,
        participants: [
          {
            characterProjectId: 'character-project-entry-1',
            characterVersionId: 'character-version-entry-1',
          },
        ],
      },
    };

    const result = await fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
      requestId: 'character-first-submit',
      operation: 'submit-draft',
      connection: catalog.connection,
      input: {
        draft: catalog.interaction,
        entryTargetReceipt,
        input: { kind: 'message', text: 'Hello character' },
        references: [],
        resourceGrantIds: [],
        configuration: {
          modelCatalogEntryId: 'openai:gpt-5',
          providerId: 'openai',
          modelId: 'gpt-5',
          executionMode: 'ask',
        },
      },
    });

    expect(result).toMatchObject({
      status: 'committed',
      projection: {
        session: {
          conversationId: 'conversation:character:character-run-entry-1',
          binding: {
            kind: 'character',
            characterRunId: 'character-run-entry-1',
            dialogueRunId: 'dialogue-run-entry-1',
          },
        },
      },
    });
    expect(materialize).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'character-first-submit', receipt: entryTargetReceipt }),
    );
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toMatchObject({
      context: {
        kind: 'character-interaction',
        owner: {
          kind: 'character',
          characterRunId: 'character-run-entry-1',
          dialogueRunId: 'dialogue-run-entry-1',
        },
      },
    });
    await fixture.appHost.conversationLifecycle.waitForProviderIdle();
    await fixture.appHost.dispose();
  });

  it('commits an exactly bound Assistant Draft first submit once', async () => {
    let finishProvider: (() => void) | undefined;
    const providerCompletion = new Promise<void>((resolve) => {
      finishProvider = resolve;
    });
    const providerStart = vi.fn(() => providerCompletion);
    const materializeSession = vi.fn(async () => undefined);
    let identity = 0;
    const conversationLifecycle = createAgentConversationLifecycleService({
      repository: createInMemoryAgentConversationLifecycleRepository(),
      grants: { validate: async () => undefined, resolveForTurn: async () => [] },
      domainContext: {
        resolveCapabilityConstraint: standardCapabilityConstraint,
        resolveForTurn: async () => [],
      },
      scratch: {
        create: async () => undefined,
        release: async () => undefined,
        authorizePreview: async () => ({
          previewSessionId: 'preview-1',
          descriptorId: 'descriptor-1',
        }),
      },
      publication: {
        publishToAssets: async () => ({ assetId: 'asset-1' }),
        publishToWorkspace: async () => ({ documentId: 'document-1' }),
      },
      session: { materialize: materializeSession },
      provider: { start: providerStart },
      reportError: vi.fn(),
      createIdentity: () => `first-submit-${(identity += 1)}`,
      now: () => '2026-08-03T00:00:00.000Z',
    });
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ conversationLifecycle, agentLaunch });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'unbound') {
      throw new Error('Assistant first-submit fixture requires an unbound Entry Draft.');
    }
    const launchCatalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(fixture.projection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      viewId: scene.context.agentViewId,
      connectionId: 'launch-first-submit',
      draftId: scene.context.scope.draftId,
      binding: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
    });
    const connection = launchCatalog.connection;
    vi.spyOn(agentLaunch, 'readCatalog').mockReturnValue(launchCatalog);
    const request = {
      requestId: 'first-submit-request-1',
      operation: 'submit-draft' as const,
      connection,
      input: {
        draft: launchCatalog.interaction,
        entryTargetReceipt: null,
        input: { kind: 'message' as const, text: 'Create a plan' },
        references: [],
        resourceGrantIds: ['grant:entry-1'],
        configuration: {
          modelCatalogEntryId: 'openai:gpt-5',
          providerId: 'openai',
          modelId: 'gpt-5',
          executionMode: 'ask' as const,
        },
      },
    };

    const transitionScene = vi.spyOn(fixture.appHost.shell, 'transitionScene');
    const attachAgentConversation = vi.spyOn(fixture.appHost.shell, 'attachAgentConversation');
    const first = await fixture.appHost.executeAgentLaunchRequest(fixture.sender, request);
    expect(providerStart).toHaveBeenCalledOnce();
    expect(attachAgentConversation).toHaveBeenCalledOnce();
    expect(materializeSession).toHaveBeenCalledOnce();
    expect(materializeSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: 'conversation:first-submit-1',
        context: expect.objectContaining({
          kind: 'assistant',
          assistantSpaceId: 'assistant-space:local-user',
        }),
        title: 'Create a plan',
      }),
    );
    expect(first).toMatchObject({ status: 'committed' });
    expect(transitionScene).not.toHaveBeenCalled();
    const committedScene = await fixture.appHost.shell.getSceneProjection(fixture.windowId);
    expect(committedScene).toMatchObject({
      context: {
        kind: 'agent',
        scope: { kind: 'assistant', conversationId: 'conversation:first-submit-1' },
      },
      slots: { interaction: { phase: 'session' } },
    });
    expect(JSON.stringify(committedScene)).not.toContain('projectId');
    if (committedScene.context.kind !== 'agent') {
      throw new Error('Expected the committed Assistant Agent Scene.');
    }
    vi.mocked(fixture.agent.getWorkspace).mockReturnValue(
      createAgentWorkspaceRuntime('assistant-space:local-user'),
    );
    const committedProjection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const workbenchInstanceId = activeWorkbench(committedProjection).workbenchInstanceId;
    const agentSurfaceId = currentAgentSurfaceId(committedProjection);
    const sessionConnection = {
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId,
      agentSurfaceId,
      assistantSpaceId: 'assistant-space:local-user',
      workspaceId: 'assistant-space:local-user',
      viewId: committedScene.context.agentViewId,
      connectionId: 'connection:first-submit-1',
    };
    vi.spyOn(fixture.appHost.agentBridge, 'createBootstrap').mockReturnValue({
      requestId: 'assistant-bootstrap-first-submit',
      status: 'ready',
      connection: sessionConnection,
    });
    const bootstrap = await fixture.appHost.createAgentBootstrap(
      fixture.sender,
      createDesktopAssistantAgentBootstrapRequest(
        'assistant-bootstrap-first-submit',
        workbenchInstanceId,
        agentSurfaceId,
        'assistant-space:local-user',
        'conversation:first-submit-1',
        committedScene.context.agentViewId,
      ),
      vi.fn(),
    );
    expect(providerStart).toHaveBeenCalledOnce();
    if (bootstrap.status !== 'ready') {
      throw new Error('Expected a ready Assistant Agent bootstrap.');
    }
    const sendProjectionControl = vi
      .spyOn(fixture.appHost.agentBridge, 'sendProjectionControl')
      .mockResolvedValue({ requestId: 'projection-attach-first-submit', status: 'accepted' });
    await fixture.appHost.sendAgentMessage(
      fixture.sender,
      createDesktopAgentMessageRequest('projection-attach-first-submit', bootstrap.connection, {
        type: 'projectionAttach',
        key: {
          attachmentId: 'attachment:first-submit-1',
          tabId: 'tab:first-submit-1',
          conversationId: 'conversation:first-submit-1',
        },
      }),
    );
    expect(providerStart).toHaveBeenCalledOnce();
    expect(sendProjectionControl).toHaveBeenCalledOnce();
    expect(attachAgentConversation.mock.invocationCallOrder[0]).toBeLessThan(
      providerStart.mock.invocationCallOrder[0]!,
    );
    await fixture.appHost.sendAgentMessage(
      fixture.sender,
      createDesktopAgentMessageRequest(
        'projection-attach-first-submit-replay',
        bootstrap.connection,
        {
          type: 'projectionAttach',
          key: {
            attachmentId: 'attachment:first-submit-2',
            tabId: 'tab:first-submit-1',
            conversationId: 'conversation:first-submit-1',
          },
        },
      ),
    );
    expect(providerStart).toHaveBeenCalledOnce();
    finishProvider?.();
    await conversationLifecycle.waitForProviderIdle();
    const second = await fixture.appHost.executeAgentLaunchRequest(fixture.sender, request);
    expect(second).toMatchObject({
      requestId: request.requestId,
      status: 'committed',
      projection: {
        session: {
          phase: 'session',
          conversationId: 'conversation:first-submit-1',
          binding: {
            kind: 'assistant',
            assistantSpaceId: 'assistant-space:local-user',
          },
        },
        turnId: 'turn:first-submit-2',
        turnStatus: 'completed',
      },
    });
    expect(providerStart).toHaveBeenCalledOnce();
    const sendAgentMessage = vi.spyOn(fixture.appHost.agentBridge, 'send');
    const assistantConversationCount = (await fixture.appHost.shell.getProjection(fixture.windowId))
      .agentHome.conversations.length;
    await expect(
      fixture.appHost.sendAgentMessage(
        fixture.sender,
        createDesktopAgentMessageRequest('assistant-new-conversation', bootstrap.connection, {
          type: 'newConversation',
        }),
      ),
    ).resolves.toEqual({ requestId: 'assistant-new-conversation', status: 'accepted' });
    expect(sendAgentMessage).not.toHaveBeenCalled();
    const assistantDraftProjection = await fixture.appHost.shell.getProjection(fixture.windowId);
    expect(activeScene(assistantDraftProjection)).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'assistant',
          assistantSpaceId: 'assistant-space:local-user',
          draftId: expect.stringMatching(/^draft:/u),
        },
      },
      slots: { interaction: { phase: 'draft' } },
    });
    expect(assistantDraftProjection.agentHome.conversations).toHaveLength(
      assistantConversationCount,
    );
    await fixture.appHost.dispose();
  });

  it('returns a local unavailable bootstrap for one invalid persisted Conversation', async () => {
    const conversationLifecycle = createConversationLifecycle();
    const fixture = await createShellAppHost({ conversationLifecycle });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'unbound') {
      throw new Error('Invalid lifecycle fixture requires an unbound Agent Draft.');
    }
    const committed = await conversationLifecycle.firstSubmit({
      requestId: 'invalid-lifecycle-first-submit',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      input: { kind: 'message', text: 'Retained historical conversation' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: firstSubmitConfiguration(),
    });
    await fixture.appHost.shell.attachAgentConversation({
      windowId: fixture.windowId,
      rendererSessionId: fixture.projection.rendererSessionId,
      agentViewId: scene.context.agentViewId,
      draftId: scene.context.scope.draftId,
      context: committed.context,
      conversationId: committed.conversationId,
    });
    vi.mocked(fixture.agent.getWorkspace).mockReturnValue(
      createAgentWorkspaceRuntime('assistant-space:local-user'),
    );
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const workbenchInstanceId = activeWorkbench(projection).workbenchInstanceId;
    const agentSurfaceId = currentAgentSurfaceId(projection);
    const readFirstSubmitRecord = vi
      .spyOn(conversationLifecycle, 'readFirstSubmitRecord')
      .mockRejectedValue(
        new AgentConversationLifecycleUnavailableError(
          committed.conversationId,
          ['lifecycle'],
          new Error('Host-only decode detail.'),
        ),
      );
    const createBootstrap = vi.spyOn(fixture.appHost.agentBridge, 'createBootstrap');
    const request = createDesktopAssistantAgentBootstrapRequest(
      'invalid-lifecycle-bootstrap',
      workbenchInstanceId,
      agentSurfaceId,
      'assistant-space:local-user',
      committed.conversationId,
      scene.context.agentViewId,
    );

    await expect(
      fixture.appHost.createAgentBootstrap(fixture.sender, request, vi.fn()),
    ).resolves.toEqual({
      requestId: 'invalid-lifecycle-bootstrap',
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-agent-conversation-unavailable',
        severity: 'error',
        conversationId: committed.conversationId,
        fieldNames: ['lifecycle'],
        message: 'The stored Agent Conversation cannot be opened by the current application.',
      },
    });
    expect(createBootstrap).not.toHaveBeenCalled();

    readFirstSubmitRecord.mockRestore();
    createBootstrap.mockReturnValue({
      requestId: 'valid-lifecycle-bootstrap',
      status: 'ready',
      connection: {
        applicationInstanceId: 'app-1',
        windowId: fixture.windowId,
        workbenchInstanceId,
        agentSurfaceId,
        assistantSpaceId: 'assistant-space:local-user',
        workspaceId: 'assistant-space:local-user',
        viewId: scene.context.agentViewId,
        connectionId: 'connection-valid-lifecycle',
      },
    });
    await expect(
      fixture.appHost.createAgentBootstrap(
        fixture.sender,
        { ...request, requestId: 'valid-lifecycle-bootstrap' },
        vi.fn(),
      ),
    ).resolves.toMatchObject({ status: 'ready' });
    expect(createBootstrap).toHaveBeenCalledOnce();
  });

  it('keeps the exact committed Scene when initial provider execution fails', async () => {
    const providerError = new Error('exact provider unavailable');
    const reportError = vi.fn();
    let identity = 0;
    const conversationLifecycle = createAgentConversationLifecycleService({
      repository: createInMemoryAgentConversationLifecycleRepository(),
      grants: { validate: async () => undefined, resolveForTurn: async () => [] },
      domainContext: {
        resolveCapabilityConstraint: standardCapabilityConstraint,
        resolveForTurn: async () => [],
      },
      scratch: {
        create: async () => undefined,
        release: async () => undefined,
        authorizePreview: async () => ({
          previewSessionId: 'preview-provider-failure',
          descriptorId: 'descriptor-provider-failure',
        }),
      },
      publication: {
        publishToAssets: async () => ({ assetId: 'asset-provider-failure' }),
        publishToWorkspace: async () => ({ documentId: 'document-provider-failure' }),
      },
      session: { materialize: async () => undefined },
      provider: {
        start: async () => {
          throw providerError;
        },
      },
      reportError,
      createIdentity: () => `provider-failure-${(identity += 1)}`,
      now: () => '2026-08-08T00:00:00.000Z',
    });
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ conversationLifecycle, agentLaunch });
    const entryScene = activeScene(fixture.projection);
    if (entryScene.context.kind !== 'agent' || entryScene.context.scope.kind !== 'unbound') {
      throw new Error('Provider failure fixture requires an unbound Entry Draft.');
    }
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(fixture.projection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      viewId: entryScene.context.agentViewId,
      connectionId: 'launch-provider-failure',
      draftId: entryScene.context.scope.draftId,
      binding: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
    });
    vi.spyOn(agentLaunch, 'readCatalog').mockReturnValue(catalog);
    const request = {
      requestId: 'first-submit-provider-failure',
      operation: 'submit-draft' as const,
      connection: catalog.connection,
      input: {
        draft: catalog.interaction,
        entryTargetReceipt: null,
        input: { kind: 'message' as const, text: 'Use only this provider' },
        references: [],
        resourceGrantIds: [],
        configuration: {
          modelCatalogEntryId: 'openai:gpt-5',
          providerId: 'openai',
          modelId: 'gpt-5',
          executionMode: 'ask' as const,
        },
      },
    };

    const first = await fixture.appHost.executeAgentLaunchRequest(fixture.sender, request);
    expect(first).toMatchObject({ status: 'committed', projection: { turnStatus: 'running' } });
    const committedScene = activeScene(await fixture.appHost.shell.getProjection(fixture.windowId));
    expect(committedScene).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'assistant',
          conversationId: 'conversation:provider-failure-1',
        },
      },
      slots: { interaction: { phase: 'session' } },
    });

    await conversationLifecycle.waitForProviderIdle();
    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, request),
    ).resolves.toMatchObject({
      status: 'committed',
      projection: {
        session: { conversationId: 'conversation:provider-failure-1' },
        turnStatus: 'failed',
        diagnostic: 'exact provider unavailable',
      },
    });
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toEqual(
      committedScene,
    );
    await fixture.appHost.dispose();
  });

  it('restores an exact Assistant Conversation from lifecycle context without Project fallback', async () => {
    let identity = 0;
    const conversationLifecycle = createAgentConversationLifecycleService({
      repository: createInMemoryAgentConversationLifecycleRepository(),
      grants: { validate: async () => undefined, resolveForTurn: async () => [] },
      domainContext: {
        resolveCapabilityConstraint: standardCapabilityConstraint,
        resolveForTurn: async () => [],
      },
      scratch: {
        create: async () => undefined,
        release: async () => undefined,
        authorizePreview: async () => ({
          previewSessionId: 'preview-1',
          descriptorId: 'descriptor-1',
        }),
      },
      publication: {
        publishToAssets: async () => ({ assetId: 'asset-1' }),
        publishToWorkspace: async () => ({ documentId: 'document-1' }),
      },
      session: { materialize: async () => undefined },
      provider: { start: async () => undefined },
      reportError: vi.fn(),
      createIdentity: () => `restore-${(identity += 1)}`,
      now: () => '2026-08-03T00:00:00.000Z',
    });
    const record = await conversationLifecycle.firstSubmit({
      requestId: 'restore-submit-1',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      input: { kind: 'message', text: 'Restore me' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: firstSubmitConfiguration(),
    });
    const fixture = await createShellAppHost({ conversationLifecycle });
    setAgentHomeConversation(fixture.agent, {
      conversationId: record.conversationId,
      owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
    });
    const settings = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'open-settings-before-restore',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: { kind: 'open-settings' },
      }),
    );
    if (settings.status !== 'transitioned') throw new Error('Expected Settings transition.');
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const restored = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restore-assistant-1',
        rendererSessionId: projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(projection).sceneId,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: record.conversationId,
            owner: {
              kind: 'assistant',
              assistantSpaceId: 'assistant-space:local-user',
            },
          },
        },
      }),
    );

    expect(restored).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: {
            kind: 'assistant',
            assistantSpaceId: 'assistant-space:local-user',
            conversationId: record.conversationId,
          },
        },
        slots: { interaction: { phase: 'session' } },
      },
    });
    expect(JSON.stringify(restored)).not.toContain('projectId');
    const restoredScene = restored.status === 'transitioned' ? restored.scene : undefined;
    if (!restoredScene || restoredScene.context.kind !== 'agent') {
      throw new Error('Expected an exact restored Assistant Scene.');
    }
    const assistantProjection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const assistantWorkbench = activeWorkbench(assistantProjection);
    const assistantSurfaceId = currentAgentSurfaceId(assistantProjection);
    const createBootstrap = vi.spyOn(fixture.appHost.agentBridge, 'createBootstrap');
    await fixture.appHost.createAgentBootstrap(
      fixture.sender,
      createDesktopAssistantAgentBootstrapRequest(
        'assistant-bootstrap-restored',
        assistantWorkbench.workbenchInstanceId,
        assistantSurfaceId,
        'assistant-space:local-user',
        record.conversationId,
        restoredScene.context.agentViewId,
      ),
      vi.fn(),
    );
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledWith(
      createAssistantWorkspaceResolution(),
    );
    expect(createBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        initialConversationId: record.conversationId,
        initialConversationMessage: {
          id: record.initialInput.messageId,
          role: 'user',
          content: 'Restore me',
          timestamp: Date.parse('2026-08-03T00:00:00.000Z'),
        },
      }),
    );
    await fixture.appHost.dispose();
  });

  it('restores a persisted Character conversation without dispatching a new turn', async () => {
    const conversationLifecycle = createConversationLifecycle();
    const characterInteractions = createCharacterInteractions();
    const readConversationContext = vi
      .spyOn(conversationLifecycle, 'readConversationContext')
      .mockResolvedValue({
        kind: 'character',
        characterId: 'character-1',
        characterVersionId: 'character-version-1',
        characterRunId: 'character-run-1',
        dialogueRunId: 'dialogue-run-1',
      });
    const fixture = await createShellAppHost({
      conversationLifecycle,
      characterInteractions,
    });
    const navigation = {
      conversationId: 'conversation-character-1',
      owner: {
        kind: 'character' as const,
        characterId: 'character-1',
        characterRunId: 'character-run-1',
        dialogueRunId: 'dialogue-run-1',
      },
    };
    setAgentHomeConversation(fixture.agent, navigation);
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);

    const result = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restore-character-unavailable',
        rendererSessionId: projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(projection).sceneId,
        intent: { kind: 'restore-conversation', navigation },
      }),
    );

    expect(result).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'character-interaction',
          owner: navigation.owner,
          scope: { conversationId: navigation.conversationId },
        },
      },
    });
    expect(readConversationContext).toHaveBeenCalledWith('conversation-character-1');
    expect(characterInteractions.prepareTurn).not.toHaveBeenCalled();
    expect(characterInteractions.freezePreparedTurn).not.toHaveBeenCalled();
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toMatchObject({
      context: { kind: 'character-interaction', owner: navigation.owner },
    });
    await fixture.appHost.dispose();
  });

  it('restores a persisted Room conversation without dispatching a message', async () => {
    const conversationLifecycle = createConversationLifecycle();
    vi.spyOn(conversationLifecycle, 'readConversationContext').mockResolvedValue({
      kind: 'room',
      scope: 'interaction',
      roomId: 'character-room-1',
      roomRunId: 'room-run-1',
    });
    const submitUserMessage = vi.fn(async () => ({ run: {} as RoomRun, outcomes: [] }));
    const fixture = await createShellAppHost({
      conversationLifecycle,
      characterRoomConversations: { submitUserMessage },
    });
    const navigation = {
      conversationId: 'conversation-room-1',
      owner: { kind: 'room' as const, roomId: 'character-room-1', roomRunId: 'room-run-1' },
    };
    setAgentHomeConversation(fixture.agent, navigation);
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const restored = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restore-room-conversation',
        rendererSessionId: projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(projection).sceneId,
        intent: { kind: 'restore-conversation', navigation },
      }),
    );
    expect(restored).toMatchObject({
      status: 'transitioned',
      scene: {
        context: { kind: 'character-interaction', owner: navigation.owner },
        slots: {
          cutPanel: {
            kind: 'character-timeline-stack',
            owner: navigation.owner,
            timelines: [
              { kind: 'character-storyline-timeline' },
              { kind: 'character-room-event-timeline' },
            ],
          },
        },
      },
    });
    expect(submitUserMessage).not.toHaveBeenCalled();
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toMatchObject({
      context: { kind: 'character-interaction', owner: navigation.owner },
    });
    await fixture.appHost.dispose();
  });

  it('rejects restore when navigation owner differs from immutable lifecycle context', async () => {
    const conversationLifecycle = createConversationLifecycle();
    const record = await conversationLifecycle.firstSubmit({
      requestId: 'restore-owner-mismatch-submit',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      input: { kind: 'message', text: 'Do not restore under another owner' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: firstSubmitConfiguration(),
    });
    const fixture = await createShellAppHost({ conversationLifecycle });
    const navigation = {
      conversationId: record.conversationId,
      owner: { kind: 'assistant' as const, assistantSpaceId: 'assistant-space:other' },
    };
    setAgentHomeConversation(fixture.agent, navigation);
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);

    await expect(
      fixture.appHost.transitionScene(
        fixture.sender,
        createDesktopSceneTransitionRequest({
          requestId: 'restore-owner-mismatch',
          rendererSessionId: projection.rendererSessionId,
          windowId: fixture.windowId,
          sceneId: activeScene(projection).sceneId,
          intent: { kind: 'restore-conversation', navigation },
        }),
      ),
    ).rejects.toThrow('lifecycle context does not match its navigation owner');
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toEqual(
      activeScene(projection),
    );
    await fixture.appHost.dispose();
  });

  it('projects exact Assistant Resources and authorized Preview without Workspace fallback', async () => {
    const conversationLifecycle = createConversationLifecycle();
    const record = await conversationLifecycle.firstSubmit({
      requestId: 'assistant-resource-submit',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      input: { kind: 'message', text: 'Create a note' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: firstSubmitConfiguration(),
    });
    const preview = {
      identity: {
        previewSessionId: 'preview:assistant:1',
        windowId: 'window-1',
        owner: {
          kind: 'assistant-scratch' as const,
          assistantSpaceId: 'assistant-space:local-user',
          conversationId: record.conversationId,
          scratchArtifactId: 'scratch:1',
        },
      },
      status: 'unavailable' as const,
      diagnostic: { code: 'preview-unsupported-kind' as const, message: 'unsupported' },
    };
    const assistantResources: AssistantResourceService = {
      snapshot: vi.fn(async (identity) => ({
        identity,
        baseGrants: [],
        scratchArtifacts: [],
      })),
      authorizePreview: vi.fn(async () => preview),
      readPreview: vi.fn(() => preview),
      releasePreview: vi.fn(),
    };
    const fixture = await createShellAppHost({ conversationLifecycle, assistantResources });
    setAgentHomeConversation(fixture.agent, {
      conversationId: record.conversationId,
      owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
    });
    const restored = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'assistant-resource-restore',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: record.conversationId,
            owner: {
              kind: 'assistant',
              assistantSpaceId: 'assistant-space:local-user',
            },
          },
        },
      }),
    );
    if (restored.status !== 'transitioned') throw new Error('Expected Assistant restore.');
    const identity = {
      assistantSpaceId: 'assistant-space:local-user',
      conversationId: record.conversationId,
      windowId: fixture.windowId,
    };
    const snapshot = await fixture.appHost.executeAssistantResourceRequest(fixture.sender, {
      requestId: 'assistant-resource-snapshot',
      identity,
      route: 'snapshot.get',
    });
    expect(snapshot).toMatchObject({ route: 'snapshot.get', projection: { identity } });
    await fixture.appHost.executeAssistantResourceRequest(fixture.sender, {
      requestId: 'assistant-resource-preview',
      identity,
      route: 'preview.authorize',
      scratchArtifactId: 'scratch:1',
    });
    expect(await fixture.appHost.shell.getSceneProjection(fixture.windowId)).toMatchObject({
      context: {
        kind: 'agent',
        scope: { kind: 'assistant', conversationId: record.conversationId },
      },
      slots: {
        main: {
          kind: 'assistant-preview',
          previewSessionId: 'preview:assistant:1',
          scratchArtifactId: 'scratch:1',
        },
      },
    });
    await expect(
      fixture.appHost.executeAssistantResourceRequest(fixture.sender, {
        requestId: 'assistant-resource-wrong-owner',
        identity: { ...identity, assistantSpaceId: 'assistant-space:other' },
        route: 'snapshot.get',
      }),
    ).rejects.toThrow('exact active Scene');
    await fixture.appHost.executeAssistantResourceRequest(fixture.sender, {
      requestId: 'assistant-resource-release',
      identity,
      route: 'preview.release',
      previewSessionId: 'preview:assistant:1',
    });
    expect(assistantResources.releasePreview).toHaveBeenCalledOnce();
    expect(
      (await fixture.appHost.shell.getSceneProjection(fixture.windowId)).slots.main,
    ).toBeUndefined();
    await fixture.appHost.dispose();
  });

  it('restores Workspace context only through its exact persisted grant and Workspace identity', async () => {
    let identity = 0;
    const conversationLifecycle = createAgentConversationLifecycleService({
      repository: createInMemoryAgentConversationLifecycleRepository(),
      grants: { validate: async () => undefined, resolveForTurn: async () => [] },
      domainContext: {
        resolveCapabilityConstraint: standardCapabilityConstraint,
        resolveForTurn: async () => [],
      },
      scratch: {
        create: async () => undefined,
        release: async () => undefined,
        authorizePreview: async () => ({
          previewSessionId: 'preview-1',
          descriptorId: 'descriptor-1',
        }),
      },
      publication: {
        publishToAssets: async () => ({ assetId: 'asset-1' }),
        publishToWorkspace: async () => ({ documentId: 'document-1' }),
      },
      session: { materialize: async () => undefined },
      provider: { start: async () => undefined },
      reportError: vi.fn(),
      createIdentity: () => `workspace-restore-${(identity += 1)}`,
      now: () => '2026-08-03T00:00:00.000Z',
    });
    const fixture = await createShellAppHost({ conversationLifecycle });
    const workspace = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(workspace);
    const selected = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      createDesktopWorkspaceDirectoryTargetRequest({
        requestId: 'restore-workspace-grant',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
      }),
      async () => ({ label: 'Demo', hostResource: workspace.workspacePath }),
    );
    if (selected.status !== 'authorized') throw new Error('Expected Workspace authorization.');
    const opened = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restore-workspace-open',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: selected.grant.workspaceGrantId },
      }),
    );
    if (opened.status !== 'transitioned') throw new Error('Expected Workspace Scene.');
    const record = await conversationLifecycle.firstSubmit({
      requestId: 'restore-workspace-submit',
      entryTargetReceipt: null,
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: selected.grant.workspaceGrantId,
      },
      input: { kind: 'message', text: 'Restore this Workspace' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: firstSubmitConfiguration(),
    });
    setAgentHomeConversation(fixture.agent, {
      conversationId: record.conversationId,
      owner: { kind: 'workspace', workspaceId: workspace.workspaceId },
    });
    const afterOpen = await fixture.appHost.shell.getProjection(fixture.windowId);
    await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restore-workspace-settings',
        rendererSessionId: afterOpen.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(afterOpen).sceneId,
        intent: { kind: 'open-settings' },
      }),
    );
    const settings = await fixture.appHost.shell.getProjection(fixture.windowId);
    const restored = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restore-workspace-conversation',
        rendererSessionId: settings.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(settings).sceneId,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: record.conversationId,
            owner: { kind: 'workspace', workspaceId: workspace.workspaceId },
          },
        },
      }),
    );

    expect(restored).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: {
            kind: 'workspace',
            workspaceId: workspace.workspaceId,
            workspaceGrantId: selected.grant.workspaceGrantId,
            conversationId: record.conversationId,
          },
        },
        slots: {
          interaction: { phase: 'session' },
          main: { kind: 'workspace-main', workspaceId: workspace.workspaceId },
          rightManager: { kind: 'workspace-resources', workspaceId: workspace.workspaceId },
        },
      },
    });
    const committed = await fixture.appHost.shell.getProjection(fixture.windowId);
    const activeProject = committed.catalog.projects.find(
      (candidate) => candidate.workspaceId === workspace.workspaceId,
    );
    const activeTab = committed.window.tabs.find(
      (candidate) => candidate.projectId === activeProject?.projectId,
    );
    expect(activeProject).toBeDefined();
    expect(activeTab).toBeDefined();
    expect(committed.window.activeTarget).toEqual({
      kind: 'project',
      tabId: activeTab?.tabId,
    });
    expect(activeWorkbench(committed).layout.main.views).toContainEqual(
      expect.objectContaining({
        projectId: activeProject?.projectId,
        workspaceId: workspace.workspaceId,
      }),
    );
    expect(activeScene(committed)).toEqual(
      restored.status === 'transitioned' ? restored.scene : undefined,
    );
    expect(fixture.registry.resolve).toHaveBeenCalledWith(workspace.workspacePath);
    if (!activeTab) throw new Error('Expected the restored Workspace Project Tab.');
    const workspaceWorkbench = activeWorkbench(committed);
    const workspaceSurfaceId = currentAgentSurfaceId(committed);
    vi.mocked(fixture.agent.getWorkspace).mockReturnValue(
      createAgentWorkspaceRuntime(workspace.workspaceId),
    );
    const createBootstrap = vi.spyOn(fixture.appHost.agentBridge, 'createBootstrap');
    await fixture.appHost.createAgentBootstrap(
      fixture.sender,
      createDesktopAgentBootstrapRequest(
        'workspace-bootstrap-restored',
        workspaceWorkbench.workbenchInstanceId,
        workspaceSurfaceId,
        activeTab.projectId,
        activeTab.viewId,
      ),
      vi.fn(),
    );
    expect(createBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        initialConversationId: record.conversationId,
        initialConversationMessage: {
          id: record.initialInput.messageId,
          role: 'user',
          content: 'Restore this Workspace',
          timestamp: Date.parse('2026-08-03T00:00:00.000Z'),
        },
      }),
    );
    await fixture.appHost.dispose();
  });

  it('returns unavailable for a missing-context Conversation before reading lifecycle state', async () => {
    const workspace = createWorkspaceResolution();
    const conversationId = 'pi-only-conversation';
    const workspaceGrantId = 'workspace-grant:grant-1';
    const conversationLifecycle = createAgentConversationLifecycleService({
      repository: createInMemoryAgentConversationLifecycleRepository(),
      grants: { validate: async () => undefined, resolveForTurn: async () => [] },
      domainContext: {
        resolveCapabilityConstraint: standardCapabilityConstraint,
        resolveForTurn: async () => [],
      },
      scratch: {
        create: async () => undefined,
        release: async () => undefined,
        authorizePreview: async () => ({
          previewSessionId: 'preview-1',
          descriptorId: 'descriptor-1',
        }),
      },
      publication: {
        publishToAssets: async () => ({ assetId: 'asset-1' }),
        publishToWorkspace: async () => ({ documentId: 'document-1' }),
      },
      session: { materialize: async () => undefined },
      provider: { start: async () => undefined },
      reportError: vi.fn(),
      createIdentity: () => 'pi-only-unused',
      now: () => '2026-08-05T00:00:00.000Z',
    });
    const fixture = await createShellAppHost({ conversationLifecycle });
    const readConversationContext = vi.spyOn(conversationLifecycle, 'readConversationContext');
    fixture.registry.resolve.mockResolvedValue(workspace);
    const selected = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      createDesktopWorkspaceDirectoryTargetRequest({
        requestId: 'pi-only-workspace-grant',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
      }),
      async () => ({ label: 'Demo', hostResource: workspace.workspacePath }),
    );
    if (selected.status !== 'authorized') throw new Error('Expected Workspace authorization.');
    expect(selected.grant.workspaceGrantId).toBe(workspaceGrantId);
    const opened = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'open-pi-only-workspace',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId },
      }),
    );
    if (opened.status !== 'transitioned') throw new Error('Expected Workspace Scene.');
    setAgentHomeConversation(
      fixture.agent,
      {
        conversationId,
        owner: { kind: 'workspace', workspaceId: workspace.workspaceId },
      },
      {
        fieldNames: ['context'],
        message: `Agent Conversation '${conversationId}' context is not present.`,
      },
    );
    const beforeRestore = await fixture.appHost.shell.getProjection(fixture.windowId);
    await expect(
      fixture.appHost.transitionScene(
        fixture.sender,
        createDesktopSceneTransitionRequest({
          requestId: 'restore-pi-only-conversation',
          rendererSessionId: beforeRestore.rendererSessionId,
          windowId: fixture.windowId,
          sceneId: activeScene(beforeRestore).sceneId,
          intent: {
            kind: 'restore-conversation',
            navigation: {
              conversationId,
              owner: { kind: 'workspace', workspaceId: workspace.workspaceId },
            },
          },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: {
        message: `Agent Conversation '${conversationId}' context is not present.`,
        metadata: {
          owner: 'agent-conversation-authority',
          intentKind: 'restore-conversation',
          conversationOwnerKind: 'workspace',
        },
      },
    });
    expect(readConversationContext).not.toHaveBeenCalled();
    expect(activeScene(await fixture.appHost.shell.getProjection(fixture.windowId))).toEqual(
      activeScene(beforeRestore),
    );
    await fixture.appHost.dispose();
  });

  it('keeps a canonical Assistant conversation active for bootstrap and later messages', async () => {
    const assistantSpaceId = 'assistant-space:local-user';
    const repository = createInMemoryAgentConversationLifecycleRepository();
    const conversationLifecycle = createAgentConversationLifecycleService({
      repository,
      grants: { validate: async () => undefined, resolveForTurn: async () => [] },
      domainContext: {
        resolveCapabilityConstraint: standardCapabilityConstraint,
        resolveForTurn: async () => [],
      },
      scratch: {
        create: async () => undefined,
        release: async () => undefined,
        authorizePreview: async () => ({
          previewSessionId: 'preview-1',
          descriptorId: 'descriptor-1',
        }),
      },
      publication: {
        publishToAssets: async () => ({ assetId: 'asset-1' }),
        publishToWorkspace: async () => ({ documentId: 'document-1' }),
      },
      session: { materialize: async () => undefined },
      provider: { start: async () => undefined },
      reportError: vi.fn(),
      createIdentity: () => 'pi-only-assistant-unused',
      now: () => '2026-08-05T00:00:00.000Z',
    });
    const conversationId = (
      await conversationLifecycle.firstSubmit({
        requestId: 'canonical-assistant-submit',
        entryTargetReceipt: null,
        context: { kind: 'assistant', assistantSpaceId, baseGrantIds: [] },
        input: { kind: 'message', text: 'Continue this Assistant conversation' },
        references: [],
        contextReferences: [],
        resourceGrantIds: [],
        configuration: firstSubmitConfiguration(),
      })
    ).conversationId;
    const fixture = await createShellAppHost({ conversationLifecycle });
    setAgentHomeConversation(fixture.agent, {
      conversationId,
      owner: { kind: 'assistant', assistantSpaceId },
    });
    const restored = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'restore-pi-only-assistant',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId,
            owner: { kind: 'assistant', assistantSpaceId },
          },
        },
      }),
    );
    if (
      restored.status !== 'transitioned' ||
      restored.scene.context.kind !== 'agent' ||
      restored.scene.context.scope.kind !== 'assistant'
    ) {
      throw new Error('Expected the Pi-only Assistant Scene.');
    }
    vi.mocked(fixture.agent.getWorkspace).mockReturnValue(
      createAgentWorkspaceRuntime(assistantSpaceId),
    );
    const assistantProjection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const assistantWorkbench = activeWorkbench(assistantProjection);
    const assistantSurfaceId = currentAgentSurfaceId(assistantProjection);
    const createBootstrap = vi.spyOn(fixture.appHost.agentBridge, 'createBootstrap');
    await fixture.appHost.createAgentBootstrap(
      fixture.sender,
      createDesktopAssistantAgentBootstrapRequest(
        'bootstrap-pi-only-assistant',
        assistantWorkbench.workbenchInstanceId,
        assistantSurfaceId,
        assistantSpaceId,
        conversationId,
        restored.scene.context.agentViewId,
      ),
      vi.fn(),
    );
    expect(createBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        initialConversationId: conversationId,
        initialConversationMessage: expect.objectContaining({
          role: 'user',
          content: 'Continue this Assistant conversation',
        }),
      }),
    );

    const send = vi.spyOn(fixture.appHost.agentBridge, 'send').mockResolvedValue({
      requestId: 'pi-only-assistant-get-conversations',
      status: 'accepted',
    });
    await expect(
      fixture.appHost.sendAgentMessage(
        fixture.sender,
        createDesktopAgentMessageRequest(
          'pi-only-assistant-get-conversations',
          {
            applicationInstanceId: 'app-1',
            windowId: fixture.windowId,
            workbenchInstanceId: assistantWorkbench.workbenchInstanceId,
            agentSurfaceId: assistantSurfaceId,
            assistantSpaceId,
            workspaceId: assistantSpaceId,
            viewId: restored.scene.context.agentViewId,
            connectionId: 'pi-only-assistant-connection',
          },
          { type: 'getConversations' },
        ),
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'pi-only-assistant-get-conversations',
      }),
      expect.objectContaining({
        assistantSpaceId,
        workspaceId: assistantSpaceId,
        viewId: restored.scene.context.agentViewId,
      }),
    );
    await fixture.appHost.dispose();
  });

  it('rejects a replaced renderer before opening the workspace picker', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => '/workspace/demo');
    const replacement = fixture.appHost.windows.rendererLoading(fixture.windowId, 'app-1');
    fixture.appHost.shell.setRendererSessionId(fixture.windowId, replacement.rendererSessionId);

    await expect(
      fixture.appHost.openContentProject(
        fixture.sender,
        createDesktopWindowMutationRequest('request-1', fixture.projection.rendererSessionId),
        selectWorkspace,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-request-mismatch' });
    expect(selectWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('returns a current projection without persistence when the picker is cancelled', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => undefined);

    const result = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('request-1', fixture.projection.rendererSessionId),
      selectWorkspace,
    );

    expect(result).toEqual({
      requestId: 'request-1',
      status: 'cancelled',
      projection: fixture.projection,
    });
    expect(selectWorkspace).toHaveBeenCalledOnce();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
    expect(fixture.agent.attachWorkspace).not.toHaveBeenCalled();
  });

  it('opens a selected directory as a fresh Workspace Agent Scene', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);

    const result = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('request-1', fixture.projection.rendererSessionId),
      async () => resolution.workspacePath,
    );

    expect(result.status).toBe('opened');
    expect(activeScene(result.projection)).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'workspace',
          workspaceId: resolution.workspaceId,
        },
      },
      slots: {
        interaction: { kind: 'agent', phase: 'draft' },
        main: { kind: 'workspace-main', workspaceId: resolution.workspaceId },
        rightManager: { kind: 'workspace-resources', workspaceId: resolution.workspaceId },
      },
    });
    expect(activeScene(result.projection).context).not.toHaveProperty('scope.conversationId');
    expect(result.projection.conversationNavigation.groups).toEqual([
      expect.objectContaining({
        kind: 'project',
        workspaceId: resolution.workspaceId,
        conversations: [],
      }),
    ]);
    expect(result.projection.conversationNavigation.recentProjectIds).toEqual([
      `content:${resolution.workspaceId}`,
    ]);
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledWith(resolution);
  });

  it('delegates Project authoring navigation only for the exact sender grant and registered Project', async () => {
    const projectAuthoring = createProjectAuthoring();
    vi.mocked(projectAuthoring.getNavigation).mockResolvedValue([
      {
        kind: 'authoring-target',
        target: { kind: 'content-project', contentProjectId: 'content:placeholder' },
        identity: 'content-project:content:placeholder',
        label: 'Demo',
      },
    ]);
    const fixture = await createShellAppHost({ projectAuthoring });
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'project-authoring-open',
        fixture.projection.rendererSessionId,
      ),
      async () => resolution.workspacePath,
    );
    const project = opened.projection.catalog.projects[0]!;
    const scene = activeScene(opened.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
      throw new Error('Project authoring fixture requires an exact Workspace Scene.');
    }
    vi.mocked(projectAuthoring.getNavigation).mockResolvedValue([
      {
        kind: 'authoring-target',
        target: { kind: 'content-project', contentProjectId: project.projectId },
        identity: `content-project:${project.projectId}`,
        label: project.displayName,
      },
    ]);
    const request = createProjectAuthoringNavigationHostRequest({
      requestId: 'project-authoring-navigation',
      rendererSessionId: opened.projection.rendererSessionId,
      windowId: fixture.windowId,
      binding: {
        workspaceId: resolution.workspaceId,
        workspaceGrantId: scene.context.scope.workspaceGrantId,
        contentProjectId: project.projectId,
      },
    });

    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, request),
    ).resolves.toMatchObject({
      requestId: request.requestId,
      workspaceId: resolution.workspaceId,
      contentProjectId: project.projectId,
      navigation: [{ identity: `content-project:${project.projectId}` }],
    });
    expect(projectAuthoring.getNavigation).toHaveBeenCalledWith({
      workspace: resolution,
      contentProjectId: project.projectId,
      contentLabel: project.displayName,
    });

    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, {
        ...request,
        requestId: 'project-authoring-workspace-mismatch',
        workspaceId: 'workspace-other',
      }),
    ).rejects.toThrow('grant resolves to another Workspace');
    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, {
        ...request,
        requestId: 'project-authoring-unregistered',
        contentProjectId: 'content:unregistered',
      }),
    ).rejects.toThrow('is not registered for this Workspace');

    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, {
        ...request,
        requestId: 'project-authoring-after-sibling-failure',
      }),
    ).resolves.toMatchObject({ contentProjectId: project.projectId });
    await fixture.appHost.dispose();
  });

  it('rejects a Project authoring grant from another Window without consuming the owner port', async () => {
    const projectAuthoring = createProjectAuthoring();
    const fixture = await createShellAppHost({ projectAuthoring });
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'project-authoring-window-open',
        fixture.projection.rendererSessionId,
      ),
      async () => resolution.workspacePath,
    );
    const scene = activeScene(opened.projection);
    const project = opened.projection.catalog.projects[0]!;
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
      throw new Error('Project authoring fixture requires an exact Workspace Scene.');
    }
    const otherWindowId = await fixture.appHost.shell.claimWindowId();
    fixture.appHost.windows.register({
      windowId: otherWindowId,
      webContentsId: 11,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });
    const otherLifecycle = fixture.appHost.windows.rendererLoading(otherWindowId, 'app-1');
    fixture.appHost.shell.setRendererSessionId(otherWindowId, otherLifecycle.rendererSessionId);

    await expect(
      fixture.appHost.getProjectAuthoringNavigation(
        { webContentsId: 11, frameUrl: `${DESKTOP_APP_ORIGIN}/index.html` },
        createProjectAuthoringNavigationHostRequest({
          requestId: 'project-authoring-cross-window',
          rendererSessionId: otherLifecycle.rendererSessionId,
          windowId: otherWindowId,
          binding: {
            workspaceId: resolution.workspaceId,
            workspaceGrantId: scene.context.scope.workspaceGrantId,
            contentProjectId: project.projectId,
          },
        }),
      ),
    ).rejects.toThrow();
    expect(projectAuthoring.getNavigation).not.toHaveBeenCalled();
    await fixture.appHost.dispose();
  });

  it('delegates Project Content only after exact sender and Project authority validation', async () => {
    const projectAuthoring = createProjectAuthoring();
    const fixture = await createShellAppHost({ projectAuthoring });
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'project-content-open',
        fixture.projection.rendererSessionId,
      ),
      async () => resolution.workspacePath,
    );
    const project = opened.projection.catalog.projects[0]!;
    const scene = activeScene(opened.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
      throw new Error('Project Content fixture requires an exact Workspace Scene.');
    }
    const request = createProjectContentHostRequest({
      requestId: 'project-content-read',
      rendererSessionId: opened.projection.rendererSessionId,
      windowId: fixture.windowId,
      binding: {
        workspaceId: resolution.workspaceId,
        workspaceGrantId: scene.context.scope.workspaceGrantId,
        contentProjectId: project.projectId,
      },
    });

    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, request),
    ).resolves.toMatchObject({
      requestId: request.requestId,
      contentProjectId: project.projectId,
      projection: { contentProjectId: project.projectId },
    });
    expect(projectAuthoring.getContent).toHaveBeenCalledWith({
      workspace: resolution,
      workspaceId: resolution.workspaceId,
      contentProjectId: project.projectId,
    });

    vi.mocked(projectAuthoring.getContent).mockClear();
    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, {
        ...request,
        requestId: 'project-content-wrong-workspace',
        workspaceId: 'workspace-other',
      }),
    ).rejects.toThrow('grant resolves to another Workspace');
    expect(projectAuthoring.getContent).not.toHaveBeenCalled();

    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, {
        ...request,
        requestId: 'project-content-after-failure',
      }),
    ).resolves.toMatchObject({ contentProjectId: project.projectId });
    await fixture.appHost.dispose();
  });

  it('aggregates every registered Project target and isolates one Project catalog failure', async () => {
    const projectAuthoring = createProjectAuthoring();
    const fixture = await createShellAppHost({ projectAuthoring });
    const firstWorkspace = {
      ...createWorkspaceResolution(),
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/first',
      displayName: 'First',
      locator: { kind: 'variable' as const, value: '${HOME}/workspace/first' },
    };
    const secondWorkspace = {
      ...createWorkspaceResolution(),
      workspaceId: '22222222-2222-4222-8222-222222222222',
      workspacePath: '/workspace/second',
      displayName: 'Second',
      locator: { kind: 'variable' as const, value: '${HOME}/workspace/second' },
    };
    fixture.registry.resolve.mockImplementation(async (identity: string) => {
      if (identity === firstWorkspace.workspacePath || identity === firstWorkspace.workspaceId) {
        return firstWorkspace;
      }
      if (identity === secondWorkspace.workspacePath || identity === secondWorkspace.workspaceId) {
        return secondWorkspace;
      }
      throw new Error(`Unknown Workspace '${identity}'.`);
    });
    const firstOpened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'aggregate-project-first',
        fixture.projection.rendererSessionId,
      ),
      async () => firstWorkspace.workspacePath,
    );
    const secondOpened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'aggregate-project-second',
        firstOpened.projection.rendererSessionId,
      ),
      async () => secondWorkspace.workspacePath,
    );
    const [firstProject, secondProject] = secondOpened.projection.catalog.projects;
    if (!firstProject || !secondProject) throw new Error('Expected two registered Projects.');
    vi.mocked(projectAuthoring.getNavigation).mockImplementation(async (input) => {
      if (input.contentProjectId === firstProject.projectId) {
        throw new Error('First Project catalog is unreadable.');
      }
      return [
        {
          kind: 'authoring-target',
          target: { kind: 'content-project', contentProjectId: secondProject.projectId },
          identity: `content-project:${secondProject.projectId}`,
          label: secondProject.displayName,
        },
        {
          kind: 'authoring-target',
          target: { kind: 'character-project', characterProjectId: 'character-1' },
          identity: 'character-project:character-1',
          label: 'Aster',
        },
        {
          kind: 'authoring-target',
          target: { kind: 'world-project', worldProjectId: 'world-1' },
          identity: 'world-project:world-1',
          label: 'Cinder Sea',
        },
      ];
    });

    const request = createProjectAuthoringCatalogHostRequest({
      requestId: 'project-authoring-catalog',
      rendererSessionId: secondOpened.projection.rendererSessionId,
      windowId: fixture.windowId,
    });
    await expect(
      fixture.appHost.getProjectAuthoringNavigation(fixture.sender, request),
    ).resolves.toMatchObject({
      requestId: request.requestId,
      projects: [
        {
          contentProjectId: secondProject.projectId,
          navigation: [
            { identity: `content-project:${secondProject.projectId}` },
            { identity: 'character-project:character-1' },
            { identity: 'world-project:world-1' },
          ],
        },
      ],
      diagnostics: [
        {
          contentProjectId: firstProject.projectId,
          message: 'First Project catalog is unreadable.',
        },
      ],
    });
    await fixture.appHost.dispose();
  });

  it('delegates exact project-local Character and World authoring requests to owner ports', async () => {
    const projectAuthoring = createProjectAuthoring();
    vi.mocked(projectAuthoring.getCharacterSnapshot).mockResolvedValue(
      characterAuthoringSnapshot(),
    );
    vi.mocked(projectAuthoring.executeCharacter).mockResolvedValue(characterAuthoringSnapshot());
    vi.mocked(projectAuthoring.getWorldSnapshot).mockResolvedValue(worldAuthoringSnapshot());
    vi.mocked(projectAuthoring.executeWorld).mockResolvedValue(worldAuthoringSnapshot());
    const fixture = await createShellAppHost({ projectAuthoring });
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'domain-authoring-open',
        fixture.projection.rendererSessionId,
      ),
      async () => resolution.workspacePath,
    );
    const scene = activeScene(opened.projection);
    const project = opened.projection.catalog.projects[0]!;
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
      throw new Error('Domain authoring fixture requires an exact Workspace Scene.');
    }
    const characterBinding = {
      workspaceId: resolution.workspaceId,
      workspaceGrantId: scene.context.scope.workspaceGrantId,
      authority: { kind: 'content-project' as const, contentProjectId: project.projectId },
      characterProjectId: 'character-1',
    };
    const worldBinding = {
      workspaceId: resolution.workspaceId,
      workspaceGrantId: scene.context.scope.workspaceGrantId,
      contentProjectId: project.projectId,
      worldProjectId: 'world-1',
    };

    await expect(
      fixture.appHost.executeCharacterAuthoringRequest(
        fixture.sender,
        createCharacterAuthoringSnapshotRequest({
          requestId: 'character-authoring-snapshot',
          rendererSessionId: opened.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding: characterBinding,
        }),
      ),
    ).resolves.toMatchObject({
      ...characterBinding,
      snapshot: { project: { characterProjectId: 'character-1' } },
    });
    await fixture.appHost.executeCharacterAuthoringRequest(
      fixture.sender,
      createCharacterAuthoringCommandRequest({
        requestId: 'character-authoring-command',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId: fixture.windowId,
        binding: characterBinding,
        command: {
          operation: 'character-project-set-review',
          input: { characterProjectId: 'character-1', reviewStatus: 'ready' },
        },
      }),
    );
    expect(projectAuthoring.executeCharacter).toHaveBeenCalledWith({
      workspace: resolution,
      authority: { kind: 'content-project', contentProjectId: project.projectId },
      characterProjectId: 'character-1',
      command: {
        operation: 'character-project-set-review',
        input: { characterProjectId: 'character-1', reviewStatus: 'ready' },
      },
    });

    await expect(
      fixture.appHost.executeWorldAuthoringRequest(
        fixture.sender,
        createWorldAuthoringSnapshotRequest({
          requestId: 'world-authoring-snapshot',
          rendererSessionId: opened.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding: worldBinding,
        }),
      ),
    ).resolves.toMatchObject({
      ...worldBinding,
      snapshot: { project: { worldProjectId: 'world-1' } },
    });
    await fixture.appHost.executeWorldAuthoringRequest(
      fixture.sender,
      createWorldAuthoringCommandRequest({
        requestId: 'world-authoring-command',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId: fixture.windowId,
        binding: worldBinding,
        command: {
          operation: 'world-project-set-review',
          input: { worldProjectId: 'world-1', reviewStatus: 'ready' },
        },
      }),
    );
    expect(projectAuthoring.executeWorld).toHaveBeenCalledWith({
      workspace: resolution,
      contentProjectId: project.projectId,
      worldProjectId: 'world-1',
      command: {
        operation: 'world-project-set-review',
        input: { worldProjectId: 'world-1', reviewStatus: 'ready' },
      },
    });
    await expect(
      fixture.appHost.executeProjectLocalAuthoringRequest(
        fixture.sender,
        createProjectLocalAuthoringHostRequest({
          requestId: 'project-local-character-create',
          rendererSessionId: opened.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding: {
            workspaceId: resolution.workspaceId,
            workspaceGrantId: scene.context.scope.workspaceGrantId,
            contentProjectId: project.projectId,
          },
          create: {
            kind: 'character-project',
            characterProjectId: 'character-created',
            displayName: 'Created Character',
            draft: characterAuthoringSnapshot().project.draft,
            sources: { evidence: [], assetRepresentations: [] },
            entity: {
              kind: 'create',
              entityId: 'entity-created',
              name: 'Created Character',
            },
          },
        }),
      ),
    ).resolves.toMatchObject({
      target: { kind: 'character-project', characterProjectId: 'character-created' },
    });
    expect(projectAuthoring.createLocalTarget).toHaveBeenCalledWith({
      workspace: resolution,
      workspaceId: resolution.workspaceId,
      contentProjectId: project.projectId,
      create: expect.objectContaining({
        kind: 'character-project',
        characterProjectId: 'character-created',
        entity: expect.objectContaining({ kind: 'create', entityId: 'entity-created' }),
      }),
    });
    const receipt = {
      authority: {
        workspaceId: resolution.workspaceId,
        contentProjectId: project.projectId,
      },
      target: {
        kind: 'character-project' as const,
        characterProjectId: 'character-created',
      },
      entityId: 'entity-created',
      completedSteps: ['character-project'] as const,
      nextStep: 'project-entity' as const,
    };
    vi.mocked(projectAuthoring.createLocalTarget).mockResolvedValueOnce({
      status: 'incomplete',
      target: receipt.target,
      receipt,
    });
    await expect(
      fixture.appHost.executeProjectLocalAuthoringRequest(
        fixture.sender,
        createProjectLocalAuthoringHostRequest({
          requestId: 'project-local-character-incomplete',
          rendererSessionId: opened.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding: {
            workspaceId: resolution.workspaceId,
            workspaceGrantId: scene.context.scope.workspaceGrantId,
            contentProjectId: project.projectId,
          },
          create: {
            kind: 'character-project',
            characterProjectId: 'character-created',
            displayName: 'Created Character',
            draft: characterAuthoringSnapshot().project.draft,
            sources: { evidence: [], assetRepresentations: [] },
            entity: {
              kind: 'create',
              entityId: 'entity-created',
              name: 'Created Character',
            },
          },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'incomplete',
      target: receipt.target,
      receipt,
    });
    await expect(
      fixture.appHost.executeProjectLocalAuthoringRequest(
        fixture.sender,
        createProjectLocalAuthoringRetryHostRequest({
          requestId: 'project-local-character-retry',
          rendererSessionId: opened.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding: {
            workspaceId: resolution.workspaceId,
            workspaceGrantId: scene.context.scope.workspaceGrantId,
            contentProjectId: project.projectId,
          },
          receipt,
          entity: { kind: 'create', entityId: 'entity-created', name: 'Created Character' },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'created',
      target: { kind: 'character-project', characterProjectId: 'character-created' },
    });
    expect(projectAuthoring.retryLocalCharacter).toHaveBeenCalledWith({
      workspace: resolution,
      workspaceId: resolution.workspaceId,
      contentProjectId: project.projectId,
      receipt,
      entity: { kind: 'create', entityId: 'entity-created', name: 'Created Character' },
    });
    await fixture.appHost.dispose();
  });

  it('binds project-local Character package preview and commit to one exact sender receipt', async () => {
    const projectAuthoring = createProjectAuthoring();
    vi.mocked(projectAuthoring.previewCharacterPackage).mockResolvedValue({
      destination: { kind: 'content-project', contentProjectId: 'pending' },
      characterProjectId: 'character-imported',
      displayName: 'Imported',
      characterVersionIds: ['character-version-1'],
      branchHeadCharacterVersionIds: ['character-version-1'],
      unlinkedCharacterVersionIds: [],
      characterStorylineIds: [],
      embeddedAssets: [],
      externalDependencies: [],
      conflicts: [],
      canCommit: true,
    });
    vi.mocked(projectAuthoring.commitCharacterPackage).mockResolvedValue('character-imported');
    const fixture = await createShellAppHost({ projectAuthoring });
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'portable-project-open',
        fixture.projection.rendererSessionId,
      ),
      async () => resolution.workspacePath,
    );
    const scene = activeScene(opened.projection);
    const project = opened.projection.catalog.projects[0]!;
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
      throw new Error('Portable project fixture requires an exact Workspace Scene.');
    }
    const binding = {
      workspaceId: resolution.workspaceId,
      workspaceGrantId: scene.context.scope.workspaceGrantId,
      authority: { kind: 'content-project' as const, contentProjectId: project.projectId },
    };
    const previewRequest = createCharacterPortableHostRequest(
      {
        requestId: 'portable-preview',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId: fixture.windowId,
      },
      binding,
      { kind: 'import-preview' },
    );
    const archiveBytes = new Uint8Array([1, 2, 3]);
    const preview = await fixture.appHost.previewCharacterPortableImport(
      fixture.sender,
      previewRequest,
      archiveBytes,
    );
    if (preview.status !== 'preview-ready') {
      throw new Error('Portable project fixture requires a preview receipt.');
    }
    expect(projectAuthoring.previewCharacterPackage).toHaveBeenCalledWith({
      workspace: resolution,
      authority: binding.authority,
      archiveBytes,
    });

    await expect(
      fixture.appHost.commitCharacterPortableImport(
        fixture.sender,
        createCharacterPortableHostRequest(
          {
            requestId: 'portable-wrong-destination',
            rendererSessionId: opened.projection.rendererSessionId,
            windowId: fixture.windowId,
          },
          {
            ...binding,
            authority: { kind: 'content-project', contentProjectId: 'content-project-other' },
          },
          { kind: 'import-commit', importReceiptId: preview.importReceiptId },
        ),
      ),
    ).rejects.toThrow('does not match its sender and exact destination');
    expect(projectAuthoring.commitCharacterPackage).not.toHaveBeenCalled();
    await expect(
      fixture.appHost.commitCharacterPortableImport(fixture.sender, {
        ...createCharacterPortableHostRequest(
          {
            requestId: 'portable-wrong-renderer',
            rendererSessionId: 'renderer-session-other',
            windowId: fixture.windowId,
          },
          binding,
          { kind: 'import-commit', importReceiptId: preview.importReceiptId },
        ),
      }),
    ).rejects.toThrow('does not match its sender and exact destination');

    const commitRequest = createCharacterPortableHostRequest(
      {
        requestId: 'portable-commit',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId: fixture.windowId,
      },
      binding,
      { kind: 'import-commit', importReceiptId: preview.importReceiptId },
    );
    await expect(
      fixture.appHost.commitCharacterPortableImport(fixture.sender, commitRequest),
    ).resolves.toEqual({
      requestId: 'portable-commit',
      status: 'installed',
      characterProjectId: 'character-imported',
    });
    expect(projectAuthoring.commitCharacterPackage).toHaveBeenCalledWith({
      workspace: resolution,
      authority: binding.authority,
      archiveBytes,
    });
    await expect(
      fixture.appHost.commitCharacterPortableImport(fixture.sender, {
        ...commitRequest,
        requestId: 'portable-reused-receipt',
      }),
    ).rejects.toThrow('does not match its sender and exact destination');
    const cancellationPreview = await fixture.appHost.previewCharacterPortableImport(
      fixture.sender,
      { ...previewRequest, requestId: 'portable-cancellation-preview' },
      archiveBytes,
    );
    if (cancellationPreview.status !== 'preview-ready') {
      throw new Error('Portable cancellation fixture requires a preview receipt.');
    }
    const cancelRequest = createCharacterPortableHostRequest(
      {
        requestId: 'portable-cancel',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId: fixture.windowId,
      },
      binding,
      { kind: 'import-cancel', importReceiptId: cancellationPreview.importReceiptId },
    );
    await expect(
      fixture.appHost.cancelCharacterPortableImport(fixture.sender, cancelRequest),
    ).resolves.toEqual({ requestId: 'portable-cancel', status: 'cancelled' });
    await expect(
      fixture.appHost.commitCharacterPortableImport(fixture.sender, {
        ...cancelRequest,
        requestId: 'portable-commit-after-cancel',
        operation: 'import-commit',
      }),
    ).rejects.toThrow('does not match its sender and exact destination');
    vi.mocked(projectAuthoring.getCharacterSnapshot).mockResolvedValue(
      characterAuthoringSnapshot(),
    );
    await expect(
      fixture.appHost.executeCharacterAuthoringRequest(
        fixture.sender,
        createCharacterAuthoringSnapshotRequest({
          requestId: 'portable-sibling-still-available',
          rendererSessionId: opened.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding: { ...binding, characterProjectId: 'character-1' },
        }),
      ),
    ).resolves.toMatchObject({ snapshot: { project: { characterProjectId: 'character-1' } } });
    await fixture.appHost.dispose();
  });

  it('delegates standalone Character authoring only for the configured library grant', async () => {
    const projectAuthoring = createProjectAuthoring();
    vi.mocked(projectAuthoring.getCharacterSnapshot).mockResolvedValue(
      characterAuthoringSnapshot(),
    );
    const fixture = await createShellAppHost({ projectAuthoring });
    const libraryWorkspace = {
      workspaceId: 'library-characters',
      workspacePath: '/libraries/characters',
      displayName: 'Characters',
      locator: { kind: 'variable' as const, value: '${HOME}/.neko/characters' },
    };
    fixture.registry.resolve.mockResolvedValue(libraryWorkspace);
    const selected = await fixture.appHost.resolveWorkspaceTarget(
      fixture.sender,
      createDesktopWorkspaceAuthoringLibraryTargetRequest({
        requestId: 'character-library-select',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        library: 'character',
      }),
      async () => {
        throw new Error('Configured Character library must not open a native picker.');
      },
    );
    if (selected.status !== 'authorized') {
      throw new Error('Standalone Character authoring requires an authorized library grant.');
    }
    const binding = {
      workspaceId: selected.workspaceId,
      workspaceGrantId: selected.grant.workspaceGrantId,
      authority: { kind: 'standalone-library' as const },
      characterProjectId: 'character-1',
    };

    await expect(
      fixture.appHost.executeCharacterAuthoringRequest(
        fixture.sender,
        createCharacterAuthoringSnapshotRequest({
          requestId: 'character-standalone-snapshot',
          rendererSessionId: fixture.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding,
        }),
      ),
    ).resolves.toMatchObject({
      ...binding,
      snapshot: { project: { characterProjectId: 'character-1' } },
    });
    expect(projectAuthoring.getCharacterSnapshot).toHaveBeenCalledWith({
      workspace: libraryWorkspace,
      authority: { kind: 'standalone-library' },
      characterProjectId: 'character-1',
    });
    vi.mocked(projectAuthoring.getCharacterPortableExportScope).mockResolvedValue({
      characterProjectId: 'character-1',
      displayName: 'Lin',
      characterVersionIds: [],
      branchHeadCharacterVersionIds: [],
      unlinkedCharacterVersionIds: [],
      characterStorylines: [],
      authoringTestSnapshotIds: [],
      representations: [],
    });
    await expect(
      fixture.appHost.getCharacterPortableExportScope(
        fixture.sender,
        createCharacterPortableHostRequest(
          {
            requestId: 'character-standalone-export-scope',
            rendererSessionId: fixture.projection.rendererSessionId,
            windowId: fixture.windowId,
          },
          {
            workspaceId: binding.workspaceId,
            workspaceGrantId: binding.workspaceGrantId,
            authority: binding.authority,
          },
          { kind: 'export-scope', characterProjectId: binding.characterProjectId },
        ),
      ),
    ).resolves.toMatchObject({
      requestId: 'character-standalone-export-scope',
      status: 'scope-ready',
      scope: { characterProjectId: 'character-1' },
    });
    expect(projectAuthoring.getCharacterPortableExportScope).toHaveBeenCalledWith({
      workspace: libraryWorkspace,
      authority: { kind: 'standalone-library' },
      characterProjectId: 'character-1',
    });
    vi.mocked(projectAuthoring.exportCharacterPackage).mockResolvedValue(new Uint8Array([9, 8, 7]));
    await expect(
      fixture.appHost.createCharacterPortableExport(
        fixture.sender,
        createCharacterPortableHostRequest(
          {
            requestId: 'character-standalone-export',
            rendererSessionId: fixture.projection.rendererSessionId,
            windowId: fixture.windowId,
          },
          {
            workspaceId: binding.workspaceId,
            workspaceGrantId: binding.workspaceGrantId,
            authority: binding.authority,
          },
          {
            kind: 'export',
            characterProjectId: binding.characterProjectId,
            selection: {
              characterStorylineIds: [],
              authoringTestSnapshotIds: [],
              embeddedRepresentationIds: [],
            },
          },
        ),
      ),
    ).resolves.toMatchObject({
      result: { requestId: 'character-standalone-export', status: 'exported' },
      archiveBytes: new Uint8Array([9, 8, 7]),
    });
    expect(projectAuthoring.exportCharacterPackage).toHaveBeenCalledWith({
      workspace: libraryWorkspace,
      authority: { kind: 'standalone-library' },
      characterProjectId: 'character-1',
      selection: {
        characterStorylineIds: [],
        authoringTestSnapshotIds: [],
        embeddedRepresentationIds: [],
      },
    });

    const beforeStudio = await fixture.appHost.shell.getProjection(fixture.windowId);
    await expect(
      fixture.appHost.transitionScene(
        fixture.sender,
        createDesktopSceneTransitionRequest({
          requestId: 'character-standalone-open-studio',
          rendererSessionId: beforeStudio.rendererSessionId,
          windowId: fixture.windowId,
          sceneId: activeScene(beforeStudio).sceneId,
          intent: {
            kind: 'open-character-authoring',
            workspaceGrantId: selected.grant.workspaceGrantId,
            authority: { kind: 'standalone-library', library: 'character' },
            characterProjectId: 'character-1',
          },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'transitioned',
      scene: {
        slots: {
          main: {
            kind: 'character-authoring',
            authority: { kind: 'standalone-library', library: 'character' },
            characterProjectId: 'character-1',
          },
        },
      },
    });
    expect(projectAuthoring.getCharacterSnapshot).toHaveBeenCalledTimes(2);
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledWith(libraryWorkspace);

    fixture.registry.resolve.mockResolvedValue({
      ...libraryWorkspace,
      workspaceId: 'workspace-impostor',
      workspacePath: '/projects/impostor',
    });
    const impostorGrant = fixture.appHost.workspaceGrants.authorize({
      windowId: fixture.windowId,
      label: 'Impostor',
      hostResource: '/projects/impostor',
    });
    await expect(
      fixture.appHost.executeCharacterAuthoringRequest(fixture.sender, {
        ...createCharacterAuthoringSnapshotRequest({
          requestId: 'character-standalone-impostor',
          rendererSessionId: fixture.projection.rendererSessionId,
          windowId: fixture.windowId,
          binding: {
            ...binding,
            workspaceId: 'workspace-impostor',
            workspaceGrantId: impostorGrant.workspaceGrantId,
          },
        }),
      }),
    ).rejects.toThrow('requires the configured Character library');
    expect(projectAuthoring.getCharacterSnapshot).toHaveBeenCalledTimes(2);
    await fixture.appHost.dispose();
  });

  it('reopens a catalog Project and reattaches its exact Agent workspace', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('open-1', fixture.projection.rendererSessionId),
      async () => resolution.workspacePath,
    );
    const tab = opened.projection.window.tabs[0]!;
    const project = opened.projection.catalog.projects[0]!;
    const closed = await fixture.appHost.shell.closeTab(
      fixture.windowId,
      tab.tabId,
      opened.projection.rendererSessionId,
    );

    const reopened = await fixture.appHost.openCatalogProject(
      fixture.sender,
      createDesktopProjectOpenRequest('reopen-1', project.projectId, closed.rendererSessionId),
    );

    expect(reopened).toMatchObject({
      requestId: 'reopen-1',
      status: 'opened',
      projection: {
        window: {
          activeTarget: { kind: 'project' },
          tabs: [{ projectId: project.projectId }],
        },
      },
    });
    expect(activeScene(reopened.projection)).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'workspace',
          workspaceId: resolution.workspaceId,
        },
      },
      slots: {
        interaction: { kind: 'agent', phase: 'draft' },
        main: { kind: 'workspace-main', workspaceId: resolution.workspaceId },
        rightManager: {
          kind: 'workspace-resources',
          workspaceId: resolution.workspaceId,
        },
      },
    });
    expect(activeScene(reopened.projection).context).not.toHaveProperty('scope.conversationId');
    expect(fixture.agent.attachWorkspace).toHaveBeenLastCalledWith(resolution);
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledTimes(2);
  });

  it('strictly removes a Project without deleting its Workspace conversations', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    fixture.registry.removeProjects.mockResolvedValue(true);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('open-1', fixture.projection.rendererSessionId),
      async () => resolution.workspacePath,
    );
    const project = opened.projection.catalog.projects[0]!;
    const projectConversation = {
      conversationId: 'conversation:project-1',
      owner: { kind: 'workspace' as const, workspaceId: project.workspaceId },
    };
    setAgentHomeConversation(fixture.agent, projectConversation);
    await expect(
      fixture.appHost.removeProjects(fixture.sender, {
        requestId: 'remove-invalid-payload',
        rendererSessionId: opened.projection.rendererSessionId,
        projectId: project.projectId,
      }),
    ).rejects.toMatchObject({ code: 'invalid-desktop-shell-payload' });
    expect(fixture.registry.removeProjects).not.toHaveBeenCalled();
    expect(fixture.agent.deleteConversation).not.toHaveBeenCalled();

    const removed = await fixture.appHost.removeProjects(
      fixture.sender,
      createDesktopProjectSelectionRequest(
        'remove-batch',
        [project.projectId],
        opened.projection.rendererSessionId,
      ),
    );

    expect(fixture.registry.removeProjects).toHaveBeenCalledWith([project.workspaceId]);
    expect(fixture.agent.deleteConversation).not.toHaveBeenCalled();
    expect(removed).toMatchObject({
      requestId: 'remove-batch',
      projection: {
        catalog: { projects: [] },
        window: { tabs: [] },
        conversationNavigation: {
          recentProjectIds: [],
          groups: [
            {
              kind: 'workspace',
              workspaceId: project.workspaceId,
              conversations: [expect.objectContaining({ navigation: projectConversation })],
            },
          ],
        },
      },
    });
  });

  it('deletes exact Project Workspace conversations while retaining the Project', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('open-1', fixture.projection.rendererSessionId),
      async () => resolution.workspacePath,
    );
    const project = opened.projection.catalog.projects[0]!;
    const projectConversation = {
      conversationId: 'conversation:project-1',
      owner: { kind: 'workspace' as const, workspaceId: project.workspaceId },
    };
    setAgentHomeConversation(fixture.agent, projectConversation);
    fixture.agent.deleteConversation.mockImplementation(async () => {
      fixture.agent.readHomeProjection.mockReturnValue({
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      });
    });

    const cleaned = await fixture.appHost.deleteProjectConversations(
      fixture.sender,
      createDesktopProjectSelectionRequest(
        'cleanup-project-conversations',
        [project.projectId],
        opened.projection.rendererSessionId,
      ),
    );

    expect(fixture.agent.deleteConversation).toHaveBeenCalledWith(
      projectConversation.conversationId,
    );
    expect(fixture.registry.removeProjects).not.toHaveBeenCalled();
    expect(cleaned).toMatchObject({
      requestId: 'cleanup-project-conversations',
      projection: {
        catalog: { projects: [expect.objectContaining({ projectId: project.projectId })] },
        window: { tabs: [expect.objectContaining({ projectId: project.projectId })] },
        conversationNavigation: {
          recentProjectIds: [project.projectId],
          groups: [
            expect.objectContaining({
              kind: 'project',
              projectId: project.projectId,
              conversations: [],
            }),
          ],
        },
      },
    });
  });

  it('deletes a recent conversation through the exact Agent workspace authority', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('open-1', fixture.projection.rendererSessionId),
      async () => resolution.workspacePath,
    );
    const project = opened.projection.catalog.projects[0]!;
    const navigation = {
      conversationId: 'conversation-1',
      owner: { kind: 'workspace' as const, workspaceId: project.workspaceId },
    };
    fixture.agent.readHomeProjection.mockReturnValue({
      conversations: [
        {
          navigation,
          title: 'Conversation one',
          updatedAt: '2026-07-29T00:00:00.000Z',
          attention: 'none',
          lastActivity: {
            kind: 'conversation-updated',
            occurredAt: '2026-07-29T00:00:00.000Z',
          },
        },
      ],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    });
    const deleteConversation = vi.fn(async () => {
      fixture.agent.readHomeProjection.mockReturnValue({
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      });
    });
    fixture.agent.deleteConversation.mockImplementation(deleteConversation);
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);

    const result = await fixture.appHost.deleteHomeConversations(
      fixture.sender,
      createDesktopConversationDeleteRequest(
        'conversation-delete-1',
        [navigation],
        projection.rendererSessionId,
      ),
    );

    expect(deleteConversation).toHaveBeenCalledWith('conversation-1');
    expect(result.projection.agentHome).toMatchObject({
      conversations: [],
    });
  });

  it('deletes a standalone Assistant conversation without resolving a Project', async () => {
    const fixture = await createShellAppHost();
    const navigation = {
      conversationId: 'conversation-assistant',
      owner: {
        kind: 'assistant' as const,
        assistantSpaceId: 'assistant-space:local-user',
      },
    };
    fixture.agent.readHomeProjection.mockReturnValue({
      conversations: [
        {
          navigation,
          title: 'Assistant conversation',
          updatedAt: '2026-08-04T00:00:00.000Z',
          attention: 'none',
          lastActivity: {
            kind: 'conversation-updated',
            occurredAt: '2026-08-04T00:00:00.000Z',
          },
        },
      ],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    });
    const deleteConversation = vi.fn(async () => {
      fixture.agent.readHomeProjection.mockReturnValue({
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      });
    });
    fixture.agent.deleteConversation.mockImplementation(deleteConversation);
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);

    const result = await fixture.appHost.deleteHomeConversations(
      fixture.sender,
      createDesktopConversationDeleteRequest(
        'assistant-conversation-delete',
        [navigation],
        projection.rendererSessionId,
      ),
    );

    expect(deleteConversation).toHaveBeenCalledWith(navigation.conversationId);
    expect(result.projection.agentHome.conversations).toEqual([]);
  });

  it('deletes an unavailable Workspace conversation without resolving or attaching its Project', async () => {
    const fixture = await createShellAppHost();
    const navigation = {
      conversationId: 'conversation-unavailable-workspace',
      owner: {
        kind: 'workspace' as const,
        workspaceId: 'e3693443-338c-4b44-956c-fe8db0c077fa',
      },
    };
    setAgentHomeConversation(fixture.agent, navigation, {
      fieldNames: ['context'],
      message: 'Conversation context is unavailable.',
    });
    fixture.agent.deleteConversation.mockImplementation(async () => {
      fixture.agent.readHomeProjection.mockReturnValue({
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      });
    });
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);

    const result = await fixture.appHost.deleteHomeConversations(
      fixture.sender,
      createDesktopConversationDeleteRequest(
        'delete-unavailable-conversation',
        [navigation],
        projection.rendererSessionId,
      ),
    );

    expect(fixture.agent.deleteConversation).toHaveBeenCalledWith(navigation.conversationId);
    expect(fixture.agent.getWorkspace).not.toHaveBeenCalled();
    expect(fixture.agent.attachWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
    expect(result.projection.agentHome.conversations).toEqual([]);
  });

  it('validates every Conversation identity before a batch deletion starts', async () => {
    const fixture = await createShellAppHost();
    const availableNavigation = {
      conversationId: 'conversation:available-for-batch',
      owner: {
        kind: 'workspace' as const,
        workspaceId: 'workspace:unavailable-batch',
      },
    };
    const missingNavigation = {
      conversationId: 'conversation:missing-from-batch',
      owner: availableNavigation.owner,
    };
    setAgentHomeConversation(fixture.agent, availableNavigation, {
      fieldNames: ['context'],
      message: 'Conversation context is unavailable.',
    });
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);

    await expect(
      fixture.appHost.deleteHomeConversations(
        fixture.sender,
        createDesktopConversationDeleteRequest(
          'delete-conversation-batch',
          [availableNavigation, missingNavigation],
          projection.rendererSessionId,
        ),
      ),
    ).rejects.toThrow(
      "Desktop Agent Home conversation 'conversation:missing-from-batch' is not present",
    );

    expect(fixture.agent.deleteConversation).not.toHaveBeenCalled();
  });

  it('projects sanitized global Skills and verified extensions without a Project', async () => {
    const fixture = await createShellAppHost();
    fixture.agent.readGlobalSkillCatalog.mockResolvedValue({
      records: [
        {
          name: 'audio-mixing',
          description: 'Mix audio.',
          source: { kind: 'builtin' as const },
          fingerprint: 'builtin-must-stay-in-main',
          locator: {
            kind: 'skill' as const,
            value: '/Applications/OpenNeko.app/Contents/Resources/skills/audio-mixing/SKILL.md',
            fingerprint: 'builtin-must-stay-in-main',
          },
        },
        {
          name: 'story-planner',
          description: 'Plan a story.',
          source: { kind: 'personal' as const },
          fingerprint: 'must-stay-in-main',
          locator: {
            kind: 'skill' as const,
            value: '/Users/fixture/.agents/skills/story-planner/SKILL.md',
            fingerprint: 'must-stay-in-main',
          },
        },
        {
          name: 'shot-list',
          description: 'Build a shot list.',
          source: { kind: 'plugin' as const, pluginId: 'story-tools' },
          fingerprint: 'plugin-must-stay-in-main',
          locator: {
            kind: 'skill' as const,
            value: '/Users/fixture/.openneko/extensions/story-tools/shot-list/SKILL.md',
            fingerprint: 'plugin-must-stay-in-main',
          },
        },
      ],
      diagnostics: [
        {
          code: 'invalid_metadata' as const,
          source: 'builtin' as const,
        },
        {
          code: 'invalid_metadata' as const,
          source: 'personal' as const,
        },
        {
          code: 'invalid_metadata' as const,
          source: 'personal' as const,
        },
      ],
      warnings: [
        {
          code: 'duplicate-skill' as const,
          skillName: 'story-planner',
          selectedSource: 'personal' as const,
          shadowedSource: 'builtin' as const,
        },
        {
          code: 'duplicate-skill' as const,
          skillName: 'story-planner',
          selectedSource: 'personal' as const,
          shadowedSource: 'plugin' as const,
        },
      ],
      commands: { records: [], diagnostics: [] },
    });
    fixture.extensionManager.readCatalog.mockResolvedValue({
      records: [
        {
          id: 'computer-use',
          name: 'computer-use',
          displayName: 'Computer Use',
          description: 'Control Mac apps.',
          localization: {},
          version: '1.0.2',
          developer: 'OpenAI',
          enabled: true,
          canEnable: false,
          canDisable: true,
          canRemove: false,
          deliverySource: 'bundled',
          agentStatus: 'ready',
          runtimeDiagnosticCode: '',
          componentReadiness: {
            skills: { status: 'ready', diagnosticCode: '' },
            mcp: { status: 'ready', diagnosticCode: '' },
            apps: { status: 'absent', diagnosticCode: '' },
          },
          iconDataUrl: '',
          mcpServerIds: ['computer-use'],
          hasSkills: true,
          appIds: [],
        },
      ],
      runtimeDescriptors: [],
      diagnostics: [{ code: 'runtime_failed', count: 1 }],
    });
    const extensions = await openExtensionsScene(fixture);
    const result = await fixture.appHost.executeExtensionManagement(
      fixture.sender,
      createAgentExtensionManagementHostRequest({
        route: 'snapshot.get',
        requestId: 'extensions-1',
        identity: extensions.identity,
      }),
    );

    expect(result.projection.skills).toEqual([
      {
        id: 'personal:personal:story-planner',
        name: 'story-planner',
        description: 'Plan a story.',
        source: 'personal',
        sourceId: 'personal',
        managementId: `skill:${'a'.repeat(64)}`,
        canOpenInEditor: true,
        canShowInFolder: true,
        canRemove: true,
      },
      {
        id: 'plugin:story-tools:shot-list',
        name: 'shot-list',
        description: 'Build a shot list.',
        source: 'plugin',
        sourceId: 'story-tools',
        managementId: '',
        canOpenInEditor: false,
        canShowInFolder: false,
        canRemove: false,
      },
    ]);
    expect(result.projection.skillDiscovery).toEqual({
      diagnostics: [{ code: 'invalid_metadata', source: 'personal', count: 2 }],
      duplicateCount: 1,
    });
    expect(result.projection.extensions).toEqual([
      expect.objectContaining({
        id: 'computer-use',
        mcpServerIds: ['computer-use'],
        hasSkills: true,
      }),
    ]);
    expect(result.projection.extensionDiscovery).toEqual({
      diagnostics: [{ code: 'runtime_failed', count: 1 }],
    });
    expect(fixture.agent.attachWorkspace).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('must-stay-in-main');
    expect(JSON.stringify(result)).not.toContain('/Users/fixture');
    expect(JSON.stringify(result)).not.toContain('story-planner/SKILL.md');
    expect(JSON.stringify(result)).not.toContain('audio-mixing');
    expect(JSON.stringify(result)).not.toContain('builtin-must-stay-in-main');
    expect(JSON.stringify(result)).not.toContain('ownerSlice');
    expect(JSON.stringify(result)).not.toContain('canvas');
    expect(JSON.stringify(result)).not.toContain('command');
  });

  it('rejects the removed Extensions endpoint field before reading global Skills or extensions', async () => {
    const fixture = await createShellAppHost();
    const extensions = await openExtensionsScene(fixture);

    await expect(
      fixture.appHost.executeExtensionManagement(fixture.sender, {
        route: 'snapshot.get',
        requestId: 'extensions-removed-endpoint',
        rendererSessionId: 'removed-endpoint',
        identity: extensions.identity,
      }),
    ).rejects.toThrow('unsupported fields');
    expect(fixture.agent.readGlobalSkillCatalog).not.toHaveBeenCalled();
    expect(fixture.extensionManager.readCatalog).not.toHaveBeenCalled();
  });

  it('rejects foreign Extensions owners and sessions that no longer match the active Scene', async () => {
    const fixture = await createShellAppHost();
    const extensions = await openExtensionsScene(fixture);
    const request = createAgentExtensionManagementHostRequest({
      route: 'snapshot.get',
      requestId: 'extensions-owner-1',
      identity: extensions.identity,
    });

    await expect(
      fixture.appHost.executeExtensionManagement(fixture.sender, {
        ...request,
        identity: { ...request.identity, windowId: 'window-2' },
      }),
    ).rejects.toThrow('belongs to another Window');
    await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'leave-extensions-1',
        rendererSessionId: extensions.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(extensions.projection).sceneId,
        intent: { kind: 'open-settings', sectionId: 'general' },
      }),
    );
    await expect(
      fixture.appHost.executeExtensionManagement(fixture.sender, request),
    ).rejects.toThrow('does not match the active Scene');
  });

  it('keeps local runtime authorization sender-bound and passes no Host path contract', async () => {
    const automationLocalRuntimes: DesktopAppHostOptions['automationLocalRuntimes'] = {
      list: vi.fn(async () => []),
      openInstallationGuide: vi.fn(async () => []),
      copyInstallationCommand: vi.fn(async () => []),
      authorizeAsset: vi.fn(async () => []),
      recheck: vi.fn(async () => []),
      disconnect: vi.fn(async () => []),
    };
    const fixture = await createShellAppHost({ automationLocalRuntimes });
    const extensions = await openExtensionsScene(fixture);
    const request = parseAutomationLocalRuntimeManagementHostRequest({
      requestId: 'local-runtime-authorize-1',
      identity: extensions.identity,
      route: 'asset.authorize',
      sourceId: 'browser-use.observe.local',
      assetKey: 'provider-runtime',
    });

    await fixture.appHost.executeAutomationLocalRuntimeManagement(fixture.sender, request);
    expect(automationLocalRuntimes.authorizeAsset).toHaveBeenCalledWith(
      'browser-use.observe.local',
      'provider-runtime',
      fixture.windowId,
    );
    expect(JSON.stringify(request)).not.toContain('/Users');
    expect(Object.keys(automationLocalRuntimes).sort()).toEqual([
      'authorizeAsset',
      'copyInstallationCommand',
      'disconnect',
      'list',
      'openInstallationGuide',
      'recheck',
    ]);
    await expect(
      fixture.appHost.executeAutomationLocalRuntimeManagement(fixture.sender, {
        ...request,
        identity: { windowId: 'window-2' },
      }),
    ).rejects.toThrow('belongs to another Window');
  });

  it('keeps explicit OS permission requests sender-bound to the Extensions scene', async () => {
    const automationPermissions: DesktopAppHostOptions['automationPermissions'] = {
      list: vi.fn(async () => []),
      request: vi.fn(async () => []),
    };
    const fixture = await createShellAppHost({ automationPermissions });
    const extensions = await openExtensionsScene(fixture);
    const request = parseAutomationPermissionManagementHostRequest({
      requestId: 'permission-request-1',
      identity: extensions.identity,
      route: 'permission.request',
      permission: 'accessibility',
    });

    await fixture.appHost.executeAutomationPermissionManagement(fixture.sender, request);
    expect(automationPermissions.request).toHaveBeenCalledExactlyOnceWith('accessibility');
    expect(automationPermissions.list).not.toHaveBeenCalled();
    await expect(
      fixture.appHost.executeAutomationPermissionManagement(fixture.sender, {
        ...request,
        identity: { windowId: 'window-2' },
      }),
    ).rejects.toThrow('belongs to another Window');
  });

  it('routes Automation selection and live control only through the exact active Agent Conversation surface', async () => {
    const automationTargetSelections = createAutomationTargetSelectionCoordinator();
    const automationSessions: DesktopAppHostOptions['automationSessions'] = {
      listSessionControls: vi.fn(() => [sessionControlProjection()]),
      controlSession: vi.fn(async () => undefined),
      subscribeSessionControls: vi.fn(() => () => undefined),
    };
    const fixture = await createShellAppHost({
      automationTargetSelections,
      automationSessions,
    });
    const workbench = activeWorkbench(fixture.projection);
    const interaction = {
      kind: 'agent' as const,
      agentSurfaceId: 'agent-surface-1',
      agentViewId: 'view-1',
      phase: 'session' as const,
      scope: {
        kind: 'workspace' as const,
        draftId: 'draft-1',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
        conversationId: 'conversation-1',
      },
    };
    vi.spyOn(fixture.appHost.shell, 'resolveAgentSurfaceGrant').mockResolvedValue({
      windowId: fixture.windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId: interaction.agentSurfaceId,
      workbench,
      interaction,
    });
    vi.spyOn(fixture.appHost.shell, 'resolveAgentViewGrant').mockResolvedValue({
      windowId: fixture.windowId,
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'view-1',
    });
    vi.spyOn(fixture.appHost.agentBridge, 'assertConnection').mockImplementation(() => undefined);
    const connection = {
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId: interaction.agentSurfaceId,
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'view-1',
      connectionId: 'connection-1',
    };
    const pending = automationTargetSelections.select(targetSelectionProjection());

    await expect(
      fixture.appHost.executeAutomationTargetSelection(fixture.sender, {
        requestId: 'selection-list-1',
        connection,
        conversationId: 'conversation-1',
        route: 'pending.list',
      }),
    ).resolves.toMatchObject({
      requestId: 'selection-list-1',
      route: 'pending.list',
      pending: [{ authorizationId: 'authorization-1' }],
    });
    await expect(
      fixture.appHost.executeAutomationTargetSelection(fixture.sender, {
        requestId: 'selection-poison-1',
        connection,
        conversationId: 'conversation-other',
        route: 'pending.list',
      }),
    ).rejects.toThrow('exact active Agent Conversation surface');
    await expect(
      fixture.appHost.executeAutomationTargetSelection(fixture.sender, {
        requestId: 'selection-poison-2',
        connection: { ...connection, workspaceId: 'workspace-other' },
        conversationId: 'conversation-1',
        route: 'pending.list',
      }),
    ).rejects.toThrow('exact active Agent Conversation surface');
    await expect(
      fixture.appHost.executeAutomationTargetSelection(fixture.sender, {
        requestId: 'selection-cancel-1',
        connection,
        conversationId: 'conversation-1',
        route: 'selection.resolve',
        decision: { authorizationId: 'authorization-1', decision: 'cancel' },
      }),
    ).resolves.toMatchObject({ pending: [] });
    await expect(pending).resolves.toBeUndefined();

    await expect(
      fixture.appHost.executeAutomationSessionControl(fixture.sender, {
        requestId: 'session-controls-list-1',
        connection,
        conversationId: 'conversation-1',
        route: 'controls.list',
      }),
    ).resolves.toMatchObject({
      requestId: 'session-controls-list-1',
      controls: [{ sessionId: 'session-1' }],
    });
    await expect(
      fixture.appHost.executeAutomationSessionControl(fixture.sender, {
        requestId: 'session-controls-poison-1',
        connection,
        conversationId: 'conversation-other',
        route: 'controls.list',
      }),
    ).rejects.toThrow('exact active Agent Conversation surface');
    await expect(
      fixture.appHost.executeAutomationSessionControl(fixture.sender, {
        requestId: 'session-controls-poison-2',
        connection,
        conversationId: 'conversation-1',
        route: 'session.control',
        command: {
          sessionId: 'session-1',
          owner: {
            conversationId: 'conversation-other',
            runId: 'run-1',
            toolCallId: 'tool-call-1',
          },
          action: 'take-over',
        },
      }),
    ).rejects.toThrow('belongs to another Conversation');
    const command = {
      sessionId: 'session-1',
      owner: {
        conversationId: 'conversation-1',
        runId: 'run-1',
        toolCallId: 'tool-call-1',
      },
      action: 'take-over' as const,
    };
    await expect(
      fixture.appHost.executeAutomationSessionControl(fixture.sender, {
        requestId: 'session-controls-takeover-1',
        connection,
        conversationId: 'conversation-1',
        route: 'session.control',
        command,
      }),
    ).resolves.toMatchObject({ route: 'session.control' });
    expect(automationSessions.controlSession).toHaveBeenCalledExactlyOnceWith(command);
  });

  it('delegates plugin mutation ownership to the extension application service', async () => {
    const fixture = await createShellAppHost();
    const extensions = await openExtensionsScene(fixture);
    vi.mocked(fixture.extensionManager.removePlugin).mockRejectedValue(
      new Error("OpenNeko extension 'computer-use' runtime is owned."),
    );

    await expect(
      fixture.appHost.executeExtensionManagement(
        fixture.sender,
        createAgentExtensionManagementHostRequest({
          route: 'plugin.remove',
          requestId: 'plugin-remove-1',
          identity: extensions.identity,
          pluginId: 'computer-use',
        }),
      ),
    ).rejects.toThrow('runtime is owned');
    expect(fixture.extensionManager.removePlugin).toHaveBeenCalledWith('computer-use');
    expect(fixture.agent.hasActiveTurns).not.toHaveBeenCalled();

    await fixture.appHost.executeExtensionManagement(
      fixture.sender,
      createAgentExtensionManagementHostRequest({
        route: 'sources.rescan',
        requestId: 'sources-rescan-1',
        identity: extensions.identity,
      }),
    );
    expect(fixture.extensionManager.rescanSources).toHaveBeenCalledOnce();
  });

  it('delegates personal Skill host actions through an opaque current management identity', async () => {
    const fixture = await createShellAppHost();
    const extensions = await openExtensionsScene(fixture);
    const managementId = `skill:${'a'.repeat(64)}`;

    await fixture.appHost.executeExtensionManagement(
      fixture.sender,
      createAgentExtensionManagementHostRequest({
        route: 'skill.open',
        requestId: 'skill-open-1',
        identity: extensions.identity,
        managementId,
      }),
    );
    await fixture.appHost.executeExtensionManagement(
      fixture.sender,
      createAgentExtensionManagementHostRequest({
        route: 'skill.reveal',
        requestId: 'skill-reveal-1',
        identity: extensions.identity,
        managementId,
      }),
    );

    expect(fixture.personalSkillManager.openInEditor).toHaveBeenCalledWith(
      managementId,
      expect.any(Array),
    );
    expect(fixture.personalSkillManager.showInFolder).toHaveBeenCalledWith(
      managementId,
      expect.any(Array),
    );
    expect(
      JSON.stringify(vi.mocked(fixture.personalSkillManager.openInEditor).mock.calls),
    ).not.toContain('/Users');
  });

  it('keeps the selected local Plugin path in Main and delegates only the authorized path', async () => {
    const selectLocalPluginDirectory = vi.fn(async () => '/Users/fixture/Downloads/local-plugin');
    const fixture = await createShellAppHost({ selectLocalPluginDirectory });
    const extensions = await openExtensionsScene(fixture);

    await fixture.appHost.executeExtensionManagement(
      fixture.sender,
      createAgentExtensionManagementHostRequest({
        route: 'plugin.install',
        requestId: 'plugin-install-1',
        identity: extensions.identity,
      }),
    );

    expect(selectLocalPluginDirectory).toHaveBeenCalledWith(fixture.windowId);
    expect(fixture.extensionManager.installLocalPlugin).toHaveBeenCalledWith(
      '/Users/fixture/Downloads/local-plugin',
    );
  });

  it('cleans up an Asset Center Preview after leaving its Scene without projecting into the new Scene', async () => {
    const assetCenter = createAssetCenterRuntime();
    const fixture = await createShellAppHost({ assetCenter });
    const opened = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'open-asset-center-1',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: { kind: 'open-asset-center' },
      }),
    );
    if (opened.status !== 'transitioned' || opened.scene.context.kind !== 'asset-center') {
      throw new Error('Expected an Asset Center scene.');
    }
    const identity = {
      windowId: fixture.windowId,
      assetCenterSessionId: opened.scene.context.assetCenterSessionId,
    };
    await fixture.appHost.executeAssetCenter(
      fixture.sender,
      createAssetCenterHostRequest({
        route: 'attach',
        requestId: 'asset-center-attach-1',
        identity,
        initialViewMode: 'grid',
      }),
    );
    const beforeLeave = await fixture.appHost.shell.getProjection(fixture.windowId);
    await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'leave-asset-center-1',
        rendererSessionId: beforeLeave.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(beforeLeave).sceneId,
        intent: { kind: 'open-settings', sectionId: 'general' },
      }),
    );
    const projectPreview = vi.spyOn(fixture.appHost.shell, 'projectAssetCenterPreview');

    await expect(
      fixture.appHost.executeAssetCenter(
        fixture.sender,
        createAssetCenterHostRequest({
          route: 'session.detach',
          requestId: 'asset-center-detach-after-leave-1',
          identity,
        }),
      ),
    ).resolves.toMatchObject({
      route: 'session.detach',
      projection: { identity, preview: { status: 'empty' } },
    });
    expect(projectPreview).not.toHaveBeenCalled();
    expect(() => assetCenter.getSnapshot(identity)).toThrow('unavailable');
  });

  it('delegates canonical Asset Center batch routes only for the bound sender and session', async () => {
    const assetCenter = createAssetCenterRuntime();
    const fixture = await createShellAppHost({ assetCenter });
    const opened = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'open-asset-center-batch',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: activeScene(fixture.projection).sceneId,
        intent: { kind: 'open-asset-center' },
      }),
    );
    if (opened.status !== 'transitioned' || opened.scene.context.kind !== 'asset-center') {
      throw new Error('Expected an Asset Center scene.');
    }
    const identity = {
      windowId: fixture.windowId,
      assetCenterSessionId: opened.scene.context.assetCenterSessionId,
    };
    await fixture.appHost.executeAssetCenter(
      fixture.sender,
      createAssetCenterHostRequest({
        route: 'attach',
        requestId: 'asset-center-batch-attach',
        identity,
        initialViewMode: 'grid',
      }),
    );
    const removeAssets = vi
      .spyOn(assetCenter, 'removeAssets')
      .mockImplementation(async () => assetCenter.getSnapshot(identity));
    const moveItems = vi
      .spyOn(assetCenter, 'moveItems')
      .mockImplementation(async () => assetCenter.getSnapshot(identity));
    const itemIds = ['global-asset-library:item-1', 'global-asset-library:item-2'];

    await expect(
      fixture.appHost.executeAssetCenter(
        fixture.sender,
        createAssetCenterHostRequest({
          route: 'assets.remove',
          requestId: 'asset-center-remove-many',
          identity,
          itemIds,
        }),
      ),
    ).resolves.toMatchObject({ route: 'assets.remove', projection: { identity } });
    await expect(
      fixture.appHost.executeAssetCenter(
        fixture.sender,
        createAssetCenterHostRequest({
          route: 'items.move',
          requestId: 'asset-center-move-many',
          identity,
          itemIds,
        }),
      ),
    ).resolves.toMatchObject({ route: 'items.move', projection: { identity } });
    expect(removeAssets).toHaveBeenCalledWith(expect.objectContaining({ identity, itemIds }));
    expect(moveItems).toHaveBeenCalledWith(expect.objectContaining({ identity, itemIds }));

    await expect(
      fixture.appHost.executeAssetCenter(
        { webContentsId: 11, frameUrl: fixture.sender.frameUrl },
        createAssetCenterHostRequest({
          route: 'items.move',
          requestId: 'asset-center-move-forged-sender',
          identity,
          itemIds,
        }),
      ),
    ).rejects.toThrow();
    expect(moveItems).toHaveBeenCalledTimes(1);
  });

  it('derives the Agent View grant from Shell and keeps incomplete startup unavailable', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('open-1', fixture.projection.rendererSessionId),
      async () => resolution.workspacePath,
    );
    const tab = opened.projection.window.tabs[0];
    if (!tab) throw new Error('Expected an opened Project Tab.');
    const workbench = activeWorkbench(opened.projection);
    const agentSurfaceId = currentAgentSurfaceId(opened.projection);

    await expect(
      fixture.appHost.createAgentBootstrap(
        fixture.sender,
        createDesktopAgentBootstrapRequest(
          'agent-1',
          workbench.workbenchInstanceId,
          agentSurfaceId,
          tab.projectId,
          tab.viewId,
        ),
        vi.fn(),
      ),
    ).resolves.toMatchObject({
      requestId: 'agent-1',
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-agent-capability-unavailable',
      },
    });
  });

  it('rejects a forged Agent View identity before creating a connection', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest('open-1', fixture.projection.rendererSessionId),
      async () => resolution.workspacePath,
    );
    const tab = opened.projection.window.tabs[0];
    if (!tab) throw new Error('Expected an opened Project Tab.');
    const workbench = activeWorkbench(opened.projection);
    const agentSurfaceId = currentAgentSurfaceId(opened.projection);
    const publish = vi.fn();

    await expect(
      fixture.appHost.createAgentBootstrap(
        fixture.sender,
        createDesktopAgentBootstrapRequest(
          'agent-forged',
          workbench.workbenchInstanceId,
          agentSurfaceId,
          tab.projectId,
          'view-forged',
        ),
        publish,
      ),
    ).rejects.toThrow('exact Agent Surface View');
    expect(publish).not.toHaveBeenCalled();
  });

  it('routes exact projection cleanup by sender connection while business messages stay active-Scene fenced', async () => {
    const fixture = await createShellAppHost();
    const currentWorkbench = activeWorkbench(fixture.projection);
    const currentScene = currentWorkbench.scene;
    if (currentScene.context.kind !== 'agent') {
      throw new Error('Expected the fixture Entry Agent Scene.');
    }
    const connection = {
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: currentWorkbench.workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      assistantSpaceId: 'assistant-space:local-user',
      workspaceId: 'assistant-space:local-user',
      viewId: currentScene.context.agentViewId,
      connectionId: 'connection-current-1',
    };
    const cleanup = vi
      .spyOn(fixture.appHost.agentBridge, 'sendProjectionControl')
      .mockResolvedValue({
        requestId: 'projection-detach-1',
        status: 'accepted',
      });

    await expect(
      fixture.appHost.sendAgentMessage(
        fixture.sender,
        createDesktopAgentMessageRequest('projection-detach-1', connection, {
          type: 'projectionDetach',
          key: {
            attachmentId: 'attachment-1',
            tabId: 'tab-1',
            conversationId: 'conversation-1',
          },
          reason: 'endpoint-replaced',
        }),
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
    expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({ connection }), {
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
    });

    await expect(
      fixture.appHost.sendAgentMessage(
        fixture.sender,
        createDesktopAgentMessageRequest('business-current-1', connection, {
          type: 'getConversations',
        }),
      ),
    ).rejects.toThrow('exact Agent Surface');
  });

  it('detaches an exact Agent connection through its sender-bound Window', async () => {
    const fixture = await createShellAppHost();
    const current = activeWorkbench(fixture.projection);
    if (current.scene.context.kind !== 'agent') {
      throw new Error('Expected the fixture Entry Agent Scene.');
    }
    const connection = {
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: current.workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      assistantSpaceId: 'assistant-space:local-user',
      workspaceId: 'assistant-space:local-user',
      viewId: current.scene.context.agentViewId,
      connectionId: 'connection-detach-1',
    };
    const detachConnection = vi
      .spyOn(fixture.appHost.agentBridge, 'detachConnection')
      .mockImplementation(() => undefined);

    await expect(
      fixture.appHost.detachAgentConnection(
        fixture.sender,
        createDesktopAgentDetachRequest('detach-connection-1', connection),
      ),
    ).resolves.toEqual({ requestId: 'detach-connection-1', status: 'detached' });

    expect(detachConnection).toHaveBeenCalledWith(connection, {
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
    });
    await fixture.appHost.dispose();
  });

  it('recursively detaches Agent connections with the exact Window resource owner', async () => {
    const fixture = await createShellAppHost();
    const detachWindow = vi.spyOn(fixture.appHost.agentBridge, 'detachWindow');

    fixture.appHost.detachWindowResources(fixture.windowId, fixture.sender.webContentsId);

    expect(detachWindow).toHaveBeenCalledOnce();
    expect(detachWindow).toHaveBeenCalledWith(fixture.windowId);
    await fixture.appHost.dispose();
  });

  it('subscribes a restored Text Editor only after execute returns its canonical identity', async () => {
    const callOrder: string[] = [];
    let restoredIdentity: TextEditorRuntimeIdentity | undefined;
    const textEditor = {
      execute: vi.fn(
        async (
          _windowId: string,
          request: { readonly requestId: string; readonly identity: TextEditorRuntimeIdentity },
        ) => {
          callOrder.push('execute');
          restoredIdentity = { ...request.identity, sessionId: 'text-document:new' };
          return {
            requestId: request.requestId,
            identity: restoredIdentity,
            status: 'ready' as const,
            projection: {
              identity: {
                owner: {
                  kind: 'window' as const,
                  windowId: request.identity.windowId,
                  projectId: request.identity.projectId,
                },
                workspaceId: request.identity.workspaceId,
                documentId: request.identity.documentId,
                locator: { kind: 'workspace-file' as const, path: request.identity.documentId },
              },
              sessionId: restoredIdentity.sessionId,
              editSequence: 0,
              mode: 'markdown' as const,
              source: '# Restored\n',
              dirty: false,
              conflict: false,
              diagnostics: [],
            },
          };
        },
      ),
      subscribe: vi.fn(async (_windowId: string, identity: TextEditorRuntimeIdentity) => {
        callOrder.push('subscribe');
        expect(identity).toEqual(restoredIdentity);
        return () => undefined;
      }),
      dispose: vi.fn(),
    } as unknown as NonNullable<DesktopAppHostOptions['textEditor']>;
    const fixture = await createShellAppHost({ textEditor });
    const originalIdentity: TextEditorRuntimeIdentity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: fixture.windowId,
      viewId: 'text-editor-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'notes/readme.md',
      sessionId: 'text-document:old',
      rendererSessionId: fixture.projection.rendererSessionId,
    };

    await expect(
      fixture.appHost.executeTextEditorRequest(
        fixture.sender,
        {
          route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
          requestId: 'projection-restore',
          identity: originalIdentity,
        },
        vi.fn(),
      ),
    ).resolves.toMatchObject({
      status: 'ready',
      identity: { sessionId: 'text-document:new' },
    });
    expect(callOrder).toEqual(['execute', 'subscribe']);
    expect(textEditor.subscribe).toHaveBeenCalledWith(
      fixture.windowId,
      expect.objectContaining({ sessionId: 'text-document:new' }),
      expect.any(Function),
    );
    await expect(
      fixture.appHost.executeTextEditorRequest(
        {
          webContentsId: 11,
          frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
        },
        {
          route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
          requestId: 'projection-foreign-sender',
          identity: originalIdentity,
        },
        vi.fn(),
      ),
    ).rejects.toThrow('Unknown Desktop IPC sender');
    expect(textEditor.execute).toHaveBeenCalledOnce();
    await fixture.appHost.dispose();
  });
});

function createLogger(): ILogger {
  return {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => createLogger(),
    setLevel: vi.fn(),
  };
}

function createShellService(applicationInstanceId: string): DesktopShellService {
  return createShellFixture(applicationInstanceId).service;
}

function createShellFixture(applicationInstanceId: string): {
  readonly service: DesktopShellService;
  readonly workspaceGrants: DesktopWorkspaceGrantAuthority;
  readonly registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
    readonly removeProjects: ReturnType<typeof vi.fn>;
  };
} {
  let identity = 0;
  const repository = createInMemoryDesktopShellStateRepository();
  const registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
    readonly removeProjects: ReturnType<typeof vi.fn>;
  } = {
    listProjects: vi.fn(async () => []),
    removeProjects: vi.fn(async () => false),
    resolve: vi.fn(async () => {
      throw new Error('Workspace resolution is not expected by this AppHost test.');
    }),
    dispose: vi.fn(async () => undefined),
  };
  const workspaceGrants = createWorkspaceGrantAuthority(registry);
  return {
    registry,
    workspaceGrants,
    service: new DesktopShellService({
      applicationInstanceId,
      stateRepository: repository,
      workspaceRegistry: registry,
      workspaceGrantAuthority: workspaceGrants,
      createIdentity: () => {
        identity += 1;
        return identity === 1 ? 'window-1' : `shell-identity-${identity}`;
      },
    }),
  };
}

function createWorkspaceGrantAuthority(
  resolver: Pick<DesktopWorkspaceRegistry, 'resolve'> = {
    resolve: async () => {
      throw new Error('Workspace grant resolution is not expected by this test.');
    },
  },
): DesktopWorkspaceGrantAuthority {
  return new DesktopWorkspaceGrantAuthority({
    resolver: {
      resolve: (hostResource) => resolver.resolve(hostResource),
      restore: async (workspaceId) => {
        const resolution = await resolver.resolve(workspaceId);
        if (resolution.workspaceId !== workspaceId) {
          throw new Error(`Restored Workspace '${workspaceId}' resolved to another identity.`);
        }
        return resolution;
      },
    },
    createIdentity: () => 'grant-1',
  });
}

function createConversationLifecycle() {
  let identity = 0;
  return createAgentConversationLifecycleService({
    repository: createInMemoryAgentConversationLifecycleRepository(),
    grants: { validate: async () => undefined, resolveForTurn: async () => [] },
    domainContext: {
      resolveCapabilityConstraint: standardCapabilityConstraint,
      resolveForTurn: async () => [],
    },
    scratch: {
      create: async () => undefined,
      release: async () => undefined,
      authorizePreview: async () => ({
        previewSessionId: 'preview-1',
        descriptorId: 'descriptor-1',
      }),
    },
    publication: {
      publishToAssets: async () => ({ assetId: 'asset-1' }),
      publishToWorkspace: async () => ({ documentId: 'document-1' }),
    },
    session: { materialize: async () => undefined },
    provider: { start: async () => undefined },
    reportError: vi.fn(),
    createIdentity: () => `lifecycle-${(identity += 1)}`,
    now: () => '2026-08-03T00:00:00.000Z',
  });
}

function targetSelectionProjection() {
  return {
    authorizationId: 'authorization-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use',
      providerId: 'cua-driver',
      kind: 'computer' as const,
      deliverySource: { kind: 'bundled-adapter' as const },
    },
    mode: 'observe' as const,
    timeoutMs: 30_000,
    stepBudget: 1,
    owner: {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    },
    candidates: [
      {
        kind: 'computer' as const,
        targetKey: 'target-1',
        label: 'Editor',
        region: { x: 10, y: 20, width: 800, height: 600 },
      },
    ],
  };
}

function sessionControlProjection() {
  return {
    sessionId: 'session-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use',
      providerId: 'cua-driver',
      kind: 'computer' as const,
    },
    target: { kind: 'computer' as const, targetKey: 'target-1', label: 'Editor' },
    mode: 'observe' as const,
    status: 'active' as const,
    remainingSteps: 1,
    phase: 'observation' as const,
    evidenceStatus: 'none' as const,
    owner: {
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    },
    availableActions: ['pause', 'stop', 'take-over'] as const,
  };
}

async function createShellAppHost(options?: {
  readonly configureShell?: (shell: DesktopShellService) => void;
  readonly agentLaunch?: DesktopAgentLaunchRuntime;
  readonly conversationLifecycle?: AgentConversationLifecycleService;
  readonly assistantResources?: AssistantResourceService;
  readonly assetCenter?: AssetCenterNodeRuntime;
  readonly resourceBrowser?: ResourceBrowserNodeRuntime;
  readonly textEditor?: DesktopAppHostOptions['textEditor'];
  readonly projectAuthoring?: DesktopAppHostOptions['projectAuthoring'];
  readonly characterFoundationCommands?: DesktopAppHostOptions['characterFoundationCommands'];
  readonly worldFoundationCommands?: DesktopAppHostOptions['worldFoundationCommands'];
  readonly characterInteractions?: DesktopAppHostOptions['characterInteractions'];
  readonly characterRoomConversations?: DesktopAppHostOptions['characterRoomConversations'];
  readonly characterRoomWorkbench?: DesktopAppHostOptions['characterRoomWorkbench'];
  readonly automationLocalRuntimes?: DesktopAppHostOptions['automationLocalRuntimes'];
  readonly automationPermissions?: DesktopAppHostOptions['automationPermissions'];
  readonly automationTargetSelections?: DesktopAppHostOptions['automationTargetSelections'];
  readonly automationSessions?: DesktopAppHostOptions['automationSessions'];
  readonly selectLocalPluginDirectory?: DesktopAppHostOptions['selectLocalPluginDirectory'];
  readonly runtimeEntry?: Parameters<
    typeof createAgentLaunchDraftSubmissionApplicationService
  >[0]['runtimeEntry'];
}) {
  const logger = createLogger();
  const fixture = createShellFixture('app-1');
  const agent = createAgentComposition();
  const extensionManager = createExtensionManager();
  const personalSkillManager = createPersonalSkillManager();
  const agentLaunch = options?.agentLaunch ?? createAgentLaunchRuntime();
  const conversationLifecycle = options?.conversationLifecycle ?? createConversationLifecycle();
  const agentDomainBindings = createAgentDomainBindingApplicationService({
    assistant: {
      resolve: async (binding) => ({ status: 'available', binding, contextPayloads: [] }),
    },
    workspace: {
      resolve: async (binding) => {
        await fixture.workspaceGrants.resolveAuthorizedWorkspace(
          binding.workspaceGrantId,
          binding.workspaceId,
        );
        return { status: 'available', binding, contextPayloads: [] };
      },
    },
  });
  const agentLaunchSubmission = createAgentLaunchDraftSubmissionApplicationService({
    launch: agentLaunch,
    entry: {
      materialize: async () => ({
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      }),
    },
    runtimeEntry: options?.runtimeEntry ?? {
      validate: async () => undefined,
      materialize: async () => {
        throw new Error('Formal runtime Entry owner is unavailable in this fixture.');
      },
    },
    bindings: agentDomainBindings,
    lifecycle: conversationLifecycle,
    resources: {
      validate: ({ connection, conversationId, resourceGrantIds, references }) => {
        agentLaunch.validateResourceGrantCommit(connection, conversationId, resourceGrantIds);
        agentLaunch.validateReferenceCommit(connection, conversationId, references);
        return agentLaunch.projectReferenceMessageContexts(connection, conversationId, references);
      },
      commit: async ({ connection, conversationId, resourceGrantIds, references }) => {
        await agentLaunch.commitResourceGrants(connection, conversationId, resourceGrantIds);
        agentLaunch.commitReferences(connection, conversationId, references);
      },
    },
    scene: {
      validate: async ({ connection, draftId, conversationId }) => {
        const surface = await fixture.service.resolveAgentSurfaceGrant(
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
        const projection = await fixture.service.getProjection(connection.windowId);
        await fixture.service.attachAgentConversation({
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
        throw new Error(
          `Agent Draft command '${intent.commandId}' has no registered launch handler '${intent.handlerId}'.`,
        );
      },
    },
  });
  const appHost = new DesktopAppHost({
    host: createElectronNekoHostPorts({
      homedir: '/Users/fixture',
      nekoHome: '/Users/fixture/.openneko',
      logger,
    }),
    instanceId: 'app-1',
    logger,
    shell: fixture.service,
    projectManagement: createProjectManagementService(fixture.service, agent),
    projectAuthoring: options?.projectAuthoring ?? createProjectAuthoring(),
    agent,
    assistantWorkspace: createAssistantWorkspaceResolution(),
    agentLaunch,
    agentLaunchSubmission,
    workspaceGrants: fixture.workspaceGrants,
    authoringLibraryRoots: createAuthoringLibraryRoots(),
    conversationLifecycle,
    assistantResources: options?.assistantResources,
    assetCenter: options?.assetCenter,
    resourceBrowser: options?.resourceBrowser,
    textEditor: options?.textEditor,
    extensionManager,
    selectLocalPluginDirectory: options?.selectLocalPluginDirectory,
    personalSkillManager,
    automationLocalRuntimes: options?.automationLocalRuntimes ?? createAutomationLocalRuntimes(),
    automationPermissions: options?.automationPermissions ?? {
      list: async () => [],
      request: async () => [],
    },
    automationTargetSelections:
      options?.automationTargetSelections ?? createAutomationTargetSelectionCoordinator(),
    automationSessions: options?.automationSessions ?? createAutomationSessions(),
    characterFoundation: createCharacterFoundationService(),
    characterFoundationCommands:
      options?.characterFoundationCommands ?? createCharacterFoundationCommands(),
    worldFoundation: createWorldFoundationService(),
    worldFoundationCommands: options?.worldFoundationCommands ?? createWorldFoundationCommands(),
    characterInteractions: options?.characterInteractions ?? createCharacterInteractions(),
    characterRoomConversations:
      options?.characterRoomConversations ?? createCharacterRoomConversations(),
    characterRoomWorkbench: options?.characterRoomWorkbench ?? createCharacterRoomWorkbench(),
    settings: createSettingsService(),
    openAgentAdvancedSettings: vi.fn(async () => undefined),
  });
  options?.configureShell?.(appHost.shell);
  const windowId = await appHost.shell.claimWindowId();
  appHost.windows.register({
    windowId,
    webContentsId: 10,
    allowedOrigin: DESKTOP_APP_ORIGIN,
  });
  const lifecycle = appHost.windows.rendererLoading(windowId, 'app-1');
  appHost.shell.setRendererSessionId(windowId, lifecycle.rendererSessionId);
  return {
    appHost,
    agent,
    extensionManager,
    personalSkillManager,
    registry: fixture.registry,
    windowId,
    sender: {
      webContentsId: 10,
      frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    },
    projection: await appHost.shell.getProjection(windowId),
  };
}

function createCharacterFoundationService(): CharacterFoundationService {
  return new CharacterFoundationService({
    characterCatalog: {
      readCatalog: async () => ({
        projects: [],
        versions: [],
        relationships: [],
        characterRuns: [],
        dialogueRuns: [],
        rooms: [],
        roomRuns: [],
        storylines: [],
        storylineDrafts: [],
        storylineVersions: [],
        companionContinuities: [],
        presentationConfigurations: [],
        diagnostics: [],
      }),
    },
  });
}

function createProjectAuthoring(): DesktopAppHostOptions['projectAuthoring'] {
  return {
    getNavigation: vi.fn(async () => []),
    getContent: vi.fn(async ({ contentProjectId }) => ({
      contentProjectId,
      characters: [],
      worlds: [],
      elements: [],
      candidates: [],
      diagnostics: [],
    })),
    createLocalTarget: vi.fn(async ({ create }) =>
      create.kind === 'character-project'
        ? {
            status: 'created' as const,
            target: {
              kind: 'character-project' as const,
              characterProjectId: create.characterProjectId,
            },
          }
        : {
            status: 'created' as const,
            target: { kind: 'world-project' as const, worldProjectId: create.worldProjectId },
          },
    ),
    retryLocalCharacter: vi.fn(async ({ receipt }) => ({
      status: 'created' as const,
      target: receipt.target,
    })),
    getCharacterSnapshot: vi.fn(async () => {
      throw new Error('Character authoring snapshot is not expected by this test.');
    }),
    executeCharacter: vi.fn(async () => {
      throw new Error('Character authoring command is not expected by this test.');
    }),
    getCharacterPortableExportScope: vi.fn(async () => {
      throw new Error('Character package export scope is not expected by this test.');
    }),
    exportCharacterPackage: vi.fn(async () => new Uint8Array()),
    previewCharacterPackage: vi.fn(async () => {
      throw new Error('Character package preview is not expected by this test.');
    }),
    commitCharacterPackage: vi.fn(async () => {
      throw new Error('Character package commit is not expected by this test.');
    }),
    getWorldSnapshot: vi.fn(async () => {
      throw new Error('World authoring snapshot is not expected by this test.');
    }),
    executeWorld: vi.fn(async () => {
      throw new Error('World authoring command is not expected by this test.');
    }),
  };
}

function createAuthoringLibraryRoots(): DesktopAppHostOptions['authoringLibraryRoots'] {
  return {
    character: { label: 'Characters', hostResource: '/libraries/characters' },
    world: { label: 'Worlds', hostResource: '/libraries/worlds' },
  };
}

function createCharacterFoundationCommands() {
  return { execute: vi.fn(async () => undefined) };
}

function createWorldFoundationService(): WorldFoundationService {
  return new WorldFoundationService({
    catalog: {
      readCatalog: async () => ({ projects: [], versions: [], runtimes: [], diagnostics: [] }),
    },
  });
}

function createWorldFoundationCommands() {
  return { execute: vi.fn(async () => undefined) };
}

function createCharacterInteractions() {
  return {
    prepareTurn: vi.fn(async () => {
      throw new Error('Character turn preparation is not expected by this test.');
    }),
    freezePreparedTurn: vi.fn(async () => {
      throw new Error('Character turn freezing is not expected by this test.');
    }),
  };
}

function createCharacterRoomConversations() {
  return {
    submitUserMessage: vi.fn(async () => {
      throw new Error('Character Room message submission is not expected by this test.');
    }),
  };
}

function createCharacterRoomWorkbench(projection?: RoomView) {
  return {
    materializeUserView: vi.fn(async () => {
      if (!projection) {
        throw new Error('Character Room Workbench projection is not expected by this test.');
      }
      return structuredClone(projection);
    }),
    subscribeUserView: vi.fn(
      (_roomRunId: string, _userId: string, _listener: (view: RoomView) => void) => vi.fn(),
    ),
  };
}

function createAssetCenterRuntime(): AssetCenterNodeRuntime {
  const resourceBrowser = {
    searchHomeAssets: vi.fn(),
    searchHomeMediaLibraries: vi.fn(),
    readHomeMediaLibraryChildren: vi.fn(),
    resolveHomeLibraryThumbnail: vi.fn(),
    importHomeAssets: vi.fn(),
    removeHomeAssets: vi.fn(),
    moveHomeItems: vi.fn(),
    addHomeMediaLibrary: vi.fn(),
    relinkHomeMediaLibrary: vi.fn(),
    removeHomeMediaLibrary: vi.fn(),
    revealHomeMediaLibrary: vi.fn(),
    resolveAssetCenterSelection: vi.fn(),
  } satisfies AssetCenterNodeRuntimeOptions['resourceBrowser'];
  return new AssetCenterNodeRuntime({
    resourceBrowser,
    resources: {
      registerFile: vi.fn(),
      releaseSession: vi.fn(),
    },
  });
}

function createLaunchCatalog(input: {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly viewId: string;
  readonly draftId: string;
  readonly connectionId: string;
  readonly binding: import('@neko/agent-contracts').AgentDomainBinding;
}): import('@neko/agent-contracts').AgentLaunchCatalogProjection {
  const connection = {
    applicationInstanceId: input.applicationInstanceId,
    windowId: input.windowId,
    workbenchInstanceId: input.workbenchInstanceId,
    agentSurfaceId: input.agentSurfaceId,
    viewId: input.viewId,
    draftId: input.draftId,
    connectionId: input.connectionId,
  };
  return {
    connection,
    interaction: {
      phase: 'draft',
      draftId: input.draftId,
      binding: input.binding,
      bindingReceipt:
        input.binding.kind === 'unbound'
          ? null
          : {
              bindingReceiptId: `binding:${input.connectionId}`,
              draftId: input.draftId,
              connectionId: input.connectionId,
              binding: input.binding,
            },
    },
    models: [],
    defaultMediaModels: {},
    mediaUnderstandingModels: {
      image: { category: 'image', purpose: 'image.understand', status: 'missing' },
      audio: { category: 'audio', purpose: 'audio.understand', status: 'missing' },
      video: { category: 'video', purpose: 'video.understand', status: 'missing' },
    },
    configuration: projectAgentConfigurationPolicy({
      models: [],
      request: null,
      source: 'global-default',
      defaults: {
        executionMode: 'ask',
        temperature: 0.7,
        maximumOutputTokens: 4096,
        thinkingBudget: 0,
      },
    }),
    inputs: [],
  };
}

function firstSubmitConfiguration() {
  const request = {
    modelCatalogEntryId: 'openai:gpt-5',
    providerId: 'openai',
    modelId: 'gpt-5',
    executionMode: 'ask' as const,
    temperature: 0.7,
    maximumOutputTokens: 4096,
    thinkingBudget: 0,
  };
  return {
    request,
    projection: configurationProjection(request),
  };
}

function configurationProjection(
  request: import('@neko/agent-contracts').AgentConfigurationRequest,
) {
  return projectAgentConfigurationPolicy({
    models: [
      {
        id: request.modelCatalogEntryId,
        label: request.modelId,
        providerId: request.providerId,
        modelId: request.modelId,
        modelType: 'llm',
        contextWindow: 128_000,
        maximumOutputTokens: 16_384,
        purposeCapabilities: ['agent.main'],
        availability: { status: 'available' },
      },
    ],
    request,
    source: 'draft-request',
    defaults: {
      executionMode: 'ask',
      temperature: 0.7,
      maximumOutputTokens: 4096,
      thinkingBudget: 0,
    },
  });
}

async function openExtensionsScene(fixture: Awaited<ReturnType<typeof createShellAppHost>>) {
  await fixture.appHost.transitionScene(
    fixture.sender,
    createDesktopSceneTransitionRequest({
      requestId: 'open-extensions-1',
      rendererSessionId: fixture.projection.rendererSessionId,
      windowId: fixture.windowId,
      sceneId: activeScene(fixture.projection).sceneId,
      intent: { kind: 'open-extensions' },
    }),
  );
  const projection = await fixture.appHost.shell.getProjection(fixture.windowId);
  const scene = activeScene(projection);
  if (scene.context.kind !== 'extensions') {
    throw new Error('Expected an Extensions scene.');
  }
  return {
    projection,
    identity: {
      windowId: fixture.windowId,
    },
  };
}

function createExtensionManager(): AgentExtensionManager & {
  readonly readCatalog: ReturnType<typeof vi.fn<() => Promise<AgentExtensionCatalogSnapshot>>>;
  readonly installLocalPlugin: ReturnType<
    typeof vi.fn<(sourcePath: string) => Promise<AgentExtensionCatalogSnapshot>>
  >;
} {
  return {
    readCatalog: vi.fn<() => Promise<AgentExtensionCatalogSnapshot>>(async () => ({
      records: [],
      runtimeDescriptors: [],
      diagnostics: [],
    })),
    installLocalPlugin: vi.fn(async () => ({
      records: [],
      runtimeDescriptors: [],
      diagnostics: [],
    })),
    enablePlugin: vi.fn(),
    disablePlugin: vi.fn(),
    removePlugin: vi.fn(),
    rescanSources: vi.fn(),
    setRuntimeReadiness: vi.fn(),
  };
}

function createPersonalSkillManager(): PersonalSkillManager {
  return {
    install: vi.fn(),
    openInEditor: vi.fn(),
    showInFolder: vi.fn(),
    remove: vi.fn(),
    projectManagement: vi.fn<PersonalSkillManager['projectManagement']>(async (records) =>
      records
        .filter((record) => record.source.kind === 'personal')
        .map((record) => ({
          managementId: `skill:${'a'.repeat(64)}`,
          name: record.name,
          fingerprint: record.fingerprint,
        })),
    ),
  };
}

function createSettingsService(): DesktopApplicationSettingsService {
  let state: DesktopApplicationSettingsStoredState = {
    preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  };
  const repository: DesktopApplicationSettingsRepositoryPort = {
    read: async () => state,
    commit: async (next) => {
      state = next;
      return state;
    },
  };
  return new DesktopApplicationSettingsService(repository);
}

function createAgentComposition(): AgentAppHost & {
  readonly attachWorkspace: ReturnType<typeof vi.fn>;
  readonly getWorkspace: ReturnType<typeof vi.fn>;
  readonly deleteConversation: ReturnType<typeof vi.fn>;
  readonly readGlobalSkillCatalog: ReturnType<typeof vi.fn>;
  readonly readHomeProjection: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
} {
  const credentialRuntime = createAgentCredentialRuntime({
    secrets: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    configCredentials: { read: async () => undefined },
    prompt: {
      text: async () => null,
      select: async () => null,
      notify: () => undefined,
    },
  });
  return {
    credentialRuntime,
    attachWorkspace: vi.fn(async (workspace: AssetWorkspaceResolution) =>
      createAgentWorkspaceRuntime(workspace.workspaceId),
    ),
    getWorkspace: vi.fn(() => undefined),
    deleteConversation: vi.fn(async () => undefined),
    findConversation: vi.fn(() => undefined),
    readGlobalSkillCatalog: vi.fn(async () => ({
      records: [],
      diagnostics: [],
      warnings: [],
      commands: { records: [], diagnostics: [] },
    })),
    hasActiveTurns: vi.fn(() => false),
    listActivePluginTurns: vi.fn(() => []),
    reconcilePluginRuntime: vi.fn(async () => new Map()),
    readHomeProjection: vi.fn(() => ({
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    })),
    readRuntimeResidency: vi.fn(() => []),
    subscribeHomeProjection: vi.fn(() => () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

function setAgentHomeConversation(
  agent: ReturnType<typeof createAgentComposition>,
  navigation: AgentHomeNavigationIdentity,
  unavailable?: {
    readonly fieldNames: readonly string[];
    readonly message: string;
  },
): void {
  agent.readHomeProjection.mockReturnValue({
    conversations: [
      {
        navigation,
        title: navigation.conversationId,
        updatedAt: '2026-08-04T00:00:00.000Z',
        attention: 'none',
        lastActivity: {
          kind: 'conversation-updated',
          occurredAt: '2026-08-04T00:00:00.000Z',
        },
        ...(unavailable === undefined ? {} : { unavailable }),
      },
    ],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  });
}

function createAgentLaunchRuntime(): DesktopAgentLaunchRuntime {
  return {
    attach: vi.fn(async () => {
      throw new Error('Agent launch attach is not expected by this AppHost test.');
    }),
    authorizeResource: vi.fn(async () => {
      throw new Error('Agent launch authorization is not expected by this AppHost test.');
    }),
    readCatalog: vi.fn(() => {
      throw new Error('Agent launch catalog read is not expected by this AppHost test.');
    }),
    validateResourceGrants: vi.fn(async () => undefined),
    bindTarget: vi.fn(async () => {
      throw new Error('Agent launch target binding is not expected by this AppHost test.');
    }),
    configureEntryTarget: vi.fn(async () => {
      throw new Error('Agent Entry target configuration is not expected by this AppHost test.');
    }),
    updateConfiguration: vi.fn(() => {
      throw new Error('Agent launch configuration update is not expected by this AppHost test.');
    }),
    searchWorkspaceMentions: vi.fn(async () => {
      throw new Error('Agent launch mention search is not expected by this AppHost test.');
    }),
    validateDraftSubmit: vi.fn((_connection, input) =>
      configurationProjection(input.configuration),
    ),
    resolveResourceContexts: vi.fn(async () => []),
    validateResourceGrantCommit: vi.fn(),
    validateReferenceCommit: vi.fn(),
    projectReferenceMessageContexts: vi.fn(() => []),
    commitResourceGrants: vi.fn(),
    commitReferences: vi.fn(),
    resolveReferenceContexts: vi.fn(async () => []),
    readConversationResourceGrants: vi.fn(() => []),
    detach: vi.fn(async () => undefined),
    detachWindow: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

function createAgentLaunchSubmission() {
  return {
    submit: vi.fn(async (): Promise<never> => {
      throw new Error('Agent Draft submission is not expected by this AppHost test.');
    }),
  };
}

function createProjectManagementService(
  shell: DesktopShellService,
  agent: AgentAppHost,
): DesktopProjectRegistrationService {
  return new DesktopProjectRegistrationService({
    shell,
    conversations: {
      deleteConversations: async (conversations) => {
        for (const conversation of conversations) {
          await agent.deleteConversation(conversation.conversationId);
        }
      },
    },
  });
}

function createAgentWorkspaceRuntime(workspaceId: string): AgentWorkspaceRuntime {
  const unavailable = async (): Promise<never> => {
    throw new Error('Agent workspace runtime operation is not expected by this AppHost test.');
  };
  return {
    workspaceId,
    workspace: {
      ...createWorkspaceResolution(),
      workspaceId,
    },
    models: createTestPiModels(),
    tools: createToolRegistry(),
    createConversation: unavailable,
    ensureConversation: unavailable,
    checkpointFailedInitialTurn: unavailable,
    deleteConversation: unavailable,
    clearAllConversations: unavailable,
    openConversation: unavailable,
    startTurn: () => {
      throw new Error('Agent turn start is not expected by this AppHost test.');
    },
    executeTurn: unavailable,
    readMessageQueue: (conversationId) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      paused: false,
      sequence: 0,
    }),
    sendQueuedMessageNow: () => {
      throw new Error('Agent queued send-now is not expected by this AppHost test.');
    },
    cancelQueuedMessage: unavailable,
    takeQueuedMessageForEdit: unavailable,
    clearMessageQueue: unavailable,
    cancelTurn: () => {
      throw new Error('Agent cancellation is not expected by this AppHost test.');
    },
    readActiveTurn: () => undefined,
    readConversationEntries: unavailable,
    readContextTokenCount: () => {
      throw new Error('Agent context read is not expected by this AppHost test.');
    },
    clearContext: unavailable,
    compactContext: unavailable,
    readSkillCatalog: unavailable,
    invokeCommand: unavailable,
    readCapabilityPromptFragments: () => [],
    listConversations: () => [],
    readConversationEvidence: () => {
      throw new Error('Agent evidence is not expected by this AppHost test.');
    },
    readConversationProjection: () => {
      throw new Error('Agent projection is not expected by this AppHost test.');
    },
    subscribeConversationProjection: () => {
      throw new Error('Agent projection subscription is not expected by this AppHost test.');
    },
    bindVisiblePresentation: () => {
      throw new Error('Agent visible binding is not expected by this AppHost test.');
    },
    protectConversationRuntime: () => {
      throw new Error('Agent runtime protection is not expected by this AppHost test.');
    },
    readRuntimeResidency: () => ({
      workspaceId,
      visibleBindingCount: 0,
      releaseRequested: false,
      releasable: false,
      conversations: [],
    }),
    dispose: async () => undefined,
  };
}

function createTestPiModels() {
  return createOpenNekoPiModels({
    read: async () => undefined,
    modify: async (_providerId, operation) => operation(undefined),
    delete: async () => undefined,
  });
}

function createAutomationLocalRuntimes(): DesktopAppHostOptions['automationLocalRuntimes'] {
  return {
    list: async () => [],
    openInstallationGuide: async () => [],
    copyInstallationCommand: async () => [],
    authorizeAsset: async () => [],
    recheck: async () => [],
    disconnect: async () => [],
  };
}

function createAutomationPermissions() {
  return {
    list: async () => [],
    request: async () => [],
  };
}

function createAutomationSessions(): DesktopAppHostOptions['automationSessions'] {
  return {
    listSessionControls: vi.fn(() => []),
    controlSession: vi.fn(async () => undefined),
    subscribeSessionControls: vi.fn(() => () => undefined),
  };
}

function createWorkspaceResolution(): AssetWorkspaceResolution {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspacePath: '/workspace/demo',
    displayName: 'Demo',
    locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
  };
}

function characterAuthoringSnapshot() {
  return {
    project: {
      characterProjectId: 'character-1',
      displayName: 'Character',
      draft: {
        summary: 'Summary',
        backgroundStory: createEmptyCharacterBackgroundStory(),
        originSetting: createEmptyCharacterOriginSetting(),
        canon: [],
        knowledgeBoundary: [],
        behaviorPolicy: [],
        expressionPolicy: [],
        representationRefs: [],
      },
      evidence: [],
      candidates: [],
      reviewStatus: 'ready' as const,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    },
    versions: [],
    authoringTestSnapshots: [],
    storylines: [],
    storylineDrafts: [],
    storylineVersions: [],
    lineage: null,
    referenceInventories: [],
    diagnostics: [],
  };
}

function worldAuthoringSnapshot() {
  return {
    project: {
      worldProjectId: 'world-1',
      title: 'World',
      draft: {
        background: 'Background',
        worldBook: [],
        locations: [],
        organizations: [],
        rules: [],
        initialFacts: [],
      },
      sourceRefs: [],
      reviewStatus: 'ready' as const,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    },
    versions: [],
    diagnostics: [],
  };
}

function createAssistantWorkspaceResolution(): AssetWorkspaceResolution {
  return {
    workspaceId: 'assistant-space:local-user',
    workspacePath: '/Users/fixture/.openneko/assistant-spaces/local-user',
    displayName: 'Assistant',
    locator: { kind: 'relative', value: 'assistant-spaces/local-user' },
  };
}

function activeWorkbench(projection: DesktopShellProjection) {
  return resolveActiveDesktopWindowWorkbench(projection.window);
}

function activeScene(projection: DesktopShellProjection) {
  return activeWorkbench(projection).scene;
}

function currentAgentSurfaceId(projection: DesktopShellProjection): string {
  const agentSurfaceId = activeWorkbench(projection).scene.slots.interaction?.agentSurfaceId;
  if (!agentSurfaceId) throw new Error('Expected an exact active Agent Surface.');
  return agentSurfaceId;
}
