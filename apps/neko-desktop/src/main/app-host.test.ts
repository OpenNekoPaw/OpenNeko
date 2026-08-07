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
import { type AgentHomeNavigationIdentity } from '@neko/agent-contracts';
import {
  createDesktopConversationDeleteRequest,
  createDesktopProjectOpenRequest,
  createDesktopWindowMutationRequest,
  resolveActiveDesktopWindowWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { DesktopAppHost } from './app-host';
import { createDesktopSceneTransitionRequest } from '@neko/host/desktop-scene-contract';
import { createDesktopWorkspaceGrantChooseRequest } from '@neko/host/desktop-workspace-grant-contract';
import { createAssetCenterHostRequest } from '@neko/assets-domain/asset-center';
import {
  createAgentConversationLifecycleService,
  createInMemoryAgentConversationLifecycleRepository,
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

describe('DesktopAppHost', () => {
  it('keeps Desktop settings sender-bound and opens Agent configuration through its owner action', async () => {
    const logger = createLogger();
    const settings = createSettingsService();
    await settings.initialize();
    const openAgentAdvancedSettings = vi.fn(async () => undefined);
    const appHost = new DesktopAppHost({
      host: createElectronNekoHostPorts({
        homedir: '/Users/fixture',
        nekoHome: '/Users/fixture/.openneko',
        logger,
      }),
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
      agent: createAgentComposition(),
      assistantWorkspace: createAssistantWorkspaceResolution(),
      agentLaunch: createAgentLaunchRuntime(),
      workspaceGrants: createWorkspaceGrantAuthority(),
      conversationLifecycle: createConversationLifecycle(),
      extensionManager: createExtensionManager(),
      personalSkillManager: createPersonalSkillManager(),
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
    const appHost = new DesktopAppHost({
      host,
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
      agent: createAgentComposition(),
      assistantWorkspace: createAssistantWorkspaceResolution(),
      agentLaunch: createAgentLaunchRuntime(),
      workspaceGrants: createWorkspaceGrantAuthority(),
      conversationLifecycle: createConversationLifecycle(),
      extensionManager: createExtensionManager(),
      personalSkillManager: createPersonalSkillManager(),
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
    const appHost = new DesktopAppHost({
      host: createElectronNekoHostPorts({
        homedir: '/Users/fixture',
        nekoHome: '/Users/fixture/.openneko',
        logger,
      }),
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
      agent,
      assistantWorkspace: createAssistantWorkspaceResolution(),
      agentLaunch: createAgentLaunchRuntime(),
      workspaceGrants: createWorkspaceGrantAuthority(),
      conversationLifecycle: createConversationLifecycle(),
      extensionManager: createExtensionManager(),
      personalSkillManager: createPersonalSkillManager(),
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

  it('keeps directory picker cancellation inert and activates only the explicitly authorized Workspace', async () => {
    const fixture = await createShellAppHost();
    const chooseRequest = createDesktopWorkspaceGrantChooseRequest({
      requestId: 'workspace-choose-1',
      rendererSessionId: fixture.projection.rendererSessionId,
      windowId: fixture.windowId,
    });
    const initialScene = activeScene(fixture.projection);
    const foreignPicker = vi.fn(async () => ({
      label: 'foreign',
      hostResource: '/Users/fixture/foreign',
    }));
    await expect(
      fixture.appHost.chooseWorkspaceGrant(
        { webContentsId: 11, frameUrl: `${DESKTOP_APP_ORIGIN}/index.html` },
        chooseRequest,
        foreignPicker,
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
    expect(foreignPicker).not.toHaveBeenCalled();

    await expect(
      fixture.appHost.chooseWorkspaceGrant(fixture.sender, chooseRequest, async () => undefined),
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
    const selected = await fixture.appHost.chooseWorkspaceGrant(
      fixture.sender,
      { ...chooseRequest, requestId: 'workspace-choose-2' },
      async () => ({ label: 'demo', hostResource: '/Users/fixture/demo' }),
    );
    expect(selected.status).toBe('authorized');
    expect(JSON.stringify(selected)).not.toContain('/Users/fixture');
    if (selected.status !== 'authorized')
      throw new Error('Expected an authorized Workspace grant.');
    const transition = await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'workspace-transition-1',
        rendererSessionId: fixture.projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: initialScene.sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: selected.grant.workspaceGrantId },
      }),
    );
    expect(transition).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: { kind: 'workspace', workspaceId: 'workspace-explicit' },
        },
        slots: { interaction: { phase: 'draft' } },
      },
    });
    expect(fixture.registry.resolve).toHaveBeenCalledWith('/Users/fixture/demo');
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledWith(resolution);

    const workspaceProjection = await fixture.appHost.shell.getProjection(fixture.windowId);
    const workspaceWorkbench = activeWorkbench(workspaceProjection);
    const workspaceScene = workspaceWorkbench.scene;
    if (
      workspaceScene.context.kind !== 'agent' ||
      workspaceScene.context.scope.kind !== 'workspace'
    ) {
      throw new Error('Expected an exact Workspace-bound Agent draft.');
    }
    const workspaceConnection = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: workspaceWorkbench.workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(workspaceProjection),
      viewId: workspaceScene.context.agentViewId,
      connectionId: 'launch-workspace-1',
      scope: {
        kind: 'workspace',
        workspaceId: workspaceScene.context.scope.workspaceId,
        workspaceGrantId: workspaceScene.context.scope.workspaceGrantId,
      },
    }).connection;
    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'workspace-first-submit-1',
        operation: 'submit-draft',
        connection: workspaceConnection,
        input: {
          target: {
            kind: 'bound-context',
            context: {
              kind: 'workspace',
              workspaceId: workspaceScene.context.scope.workspaceId,
              workspaceGrantId: workspaceScene.context.scope.workspaceGrantId,
            },
          },
          messageText: 'Continue in the selected workspace',
          resourceGrantIds: [],
          configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
        },
      }),
    ).resolves.toMatchObject({ status: 'committed' });
    expect(await fixture.appHost.shell.getSceneProjection(fixture.windowId)).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'workspace',
          workspaceId: 'workspace-explicit',
          workspaceGrantId: selected.grant.workspaceGrantId,
          conversationId: expect.stringMatching(/^conversation:/),
        },
      },
      slots: { interaction: { phase: 'session' } },
    });
  });

  it('binds Agent launch operations to the exact Assistant Scene and connection identity', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const projection = await bindAssistantDraft(fixture);
    const scene = activeScene(projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'assistant') {
      throw new Error('Agent launch AppHost fixture requires an Assistant Scene.');
    }
    const launchScope = {
      kind: 'assistant' as const,
      assistantSpaceId: scene.context.scope.assistantSpaceId,
    };
    const launchWorkbench = activeWorkbench(projection);
    const launchAgentSurfaceId = currentAgentSurfaceId(projection);
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: launchWorkbench.workbenchInstanceId,
      agentSurfaceId: launchAgentSurfaceId,
      viewId: scene.context.agentViewId,
      connectionId: 'launch-1',
      scope: launchScope,
    });
    vi.spyOn(agentLaunch, 'attach').mockResolvedValue(catalog);
    vi.spyOn(agentLaunch, 'authorizeResource').mockResolvedValue(catalog);

    await fixture.appHost.transitionScene(
      fixture.sender,
      createDesktopSceneTransitionRequest({
        requestId: 'open-settings-before-launch-attach',
        rendererSessionId: projection.rendererSessionId,
        windowId: fixture.windowId,
        sceneId: scene.sceneId,
        intent: { kind: 'open-settings', sectionId: 'general' },
      }),
    );

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-attach-1',
        operation: 'attach',
        workbenchInstanceId: launchWorkbench.workbenchInstanceId,
        agentSurfaceId: launchAgentSurfaceId,
        viewId: scene.context.agentViewId,
        scope: launchScope,
      }),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
    expect(agentLaunch.attach).not.toHaveBeenCalled();

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-attach-forged-surface',
        operation: 'attach',
        workbenchInstanceId: launchWorkbench.workbenchInstanceId,
        agentSurfaceId: 'agent-surface:forged',
        viewId: scene.context.agentViewId,
        scope: launchScope,
      }),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-authorize-1',
        operation: 'authorize-resource',
        connection: catalog.connection,
        resourceKind: 'file',
      }),
    ).resolves.toEqual({ requestId: 'launch-authorize-1', status: 'ready', catalog });
    expect(agentLaunch.authorizeResource).toHaveBeenCalledWith(catalog.connection, 'file');
    await fixture.appHost.dispose();
  });

  it('binds Agent launch attach to the exact unbound Entry Draft identity', async () => {
    const agentLaunch = createAgentLaunchRuntime();
    const fixture = await createShellAppHost({ agentLaunch });
    const scene = activeScene(fixture.projection);
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'unbound') {
      throw new Error('Agent launch AppHost fixture requires an unbound Entry Draft.');
    }
    const scope = { kind: 'unbound' as const, draftId: scene.context.scope.draftId };
    const workbench = activeWorkbench(fixture.projection);
    const agentSurfaceId = currentAgentSurfaceId(fixture.projection);
    const catalog = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId,
      viewId: scene.context.agentViewId,
      connectionId: 'launch-entry-1',
      scope,
    });
    vi.spyOn(agentLaunch, 'attach').mockResolvedValue(catalog);

    await expect(
      fixture.appHost.executeAgentLaunchRequest(fixture.sender, {
        requestId: 'launch-entry-attach-1',
        operation: 'attach',
        workbenchInstanceId: workbench.workbenchInstanceId,
        agentSurfaceId,
        viewId: scene.context.agentViewId,
        scope,
      }),
    ).resolves.toMatchObject({ status: 'ready', catalog });
    expect(agentLaunch.attach).toHaveBeenCalledWith({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId,
      viewId: scene.context.agentViewId,
      scope,
    });
    await fixture.appHost.dispose();
  });

  it('automatically binds an unbound Entry Draft to Assistant and commits first submit once', async () => {
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
    const connection = createLaunchCatalog({
      applicationInstanceId: 'app-1',
      windowId: fixture.windowId,
      workbenchInstanceId: activeWorkbench(fixture.projection).workbenchInstanceId,
      agentSurfaceId: currentAgentSurfaceId(fixture.projection),
      viewId: scene.context.agentViewId,
      connectionId: 'launch-first-submit',
      scope: { kind: 'unbound', draftId: scene.context.scope.draftId },
    }).connection;
    const request = {
      requestId: 'first-submit-request-1',
      operation: 'submit-draft' as const,
      connection,
      input: {
        target: { kind: 'automatic-assistant' as const, draftId: scene.context.scope.draftId },
        messageText: 'Create a plan',
        resourceGrantIds: ['grant:entry-1'],
        configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' as const },
      },
    };

    const transitionScene = vi.spyOn(fixture.appHost.shell, 'transitionScene');
    const attachAgentConversation = vi.spyOn(fixture.appHost.shell, 'attachAgentConversation');
    const first = await fixture.appHost.executeAgentLaunchRequest(fixture.sender, request);
    expect(providerStart).not.toHaveBeenCalled();
    expect(attachAgentConversation).toHaveBeenCalledOnce();
    expect(materializeSession).toHaveBeenCalledOnce();
    expect(materializeSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: 'conversation:first-submit-1',
        context: expect.objectContaining({
          kind: 'assistant',
          assistantSpaceId: 'assistant-space:local-user',
        }),
      }),
    );
    expect(agentLaunch.bindAssistantResourceGrants).toHaveBeenCalledWith(
      connection,
      'assistant-space:local-user',
      ['grant:entry-1'],
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
    expect(providerStart).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(providerStart).toHaveBeenCalledOnce());
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
        conversationId: 'conversation:first-submit-1',
        turnId: 'turn:first-submit-2',
        turnStatus: 'completed',
      },
    });
    expect(providerStart).toHaveBeenCalledOnce();
    await fixture.appHost.dispose();
  });

  it('restores an exact Assistant Conversation from lifecycle context without Project fallback', async () => {
    let identity = 0;
    const conversationLifecycle = createAgentConversationLifecycleService({
      repository: createInMemoryAgentConversationLifecycleRepository(),
      grants: { validate: async () => undefined, resolveForTurn: async () => [] },
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
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      messageText: 'Restore me',
      resourceGrantIds: [],
      configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
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
          id: record.initialMessage.messageId,
          role: 'user',
          content: 'Restore me',
          timestamp: Date.parse('2026-08-03T00:00:00.000Z'),
        },
      }),
    );
    await fixture.appHost.dispose();
  });

  it('returns owner-qualified unavailable before reading Character conversation context', async () => {
    const conversationLifecycle = createConversationLifecycle();
    const readConversationContext = vi.spyOn(conversationLifecycle, 'readConversationContext');
    const fixture = await createShellAppHost({ conversationLifecycle });
    const navigation = {
      conversationId: 'conversation-character-1',
      owner: {
        kind: 'character' as const,
        characterId: 'character-1',
        characterRunId: 'character-run-1',
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
      status: 'unavailable',
      diagnostic: {
        metadata: {
          owner: 'agent-conversation-authority',
          intentKind: 'restore-conversation',
          conversationOwnerKind: 'character',
        },
      },
    });
    expect(readConversationContext).not.toHaveBeenCalled();
    await fixture.appHost.dispose();
  });

  it('rejects restore when navigation owner differs from immutable lifecycle context', async () => {
    const conversationLifecycle = createConversationLifecycle();
    const record = await conversationLifecycle.firstSubmit({
      requestId: 'restore-owner-mismatch-submit',
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      messageText: 'Do not restore under another owner',
      resourceGrantIds: [],
      configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
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
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      messageText: 'Create a note',
      resourceGrantIds: [],
      configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
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
    const selected = await fixture.appHost.chooseWorkspaceGrant(
      fixture.sender,
      createDesktopWorkspaceGrantChooseRequest({
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
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: selected.grant.workspaceGrantId,
      },
      messageText: 'Restore this Workspace',
      resourceGrantIds: [],
      configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
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
          id: record.initialMessage.messageId,
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
    const selected = await fixture.appHost.chooseWorkspaceGrant(
      fixture.sender,
      createDesktopWorkspaceGrantChooseRequest({
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
        context: { kind: 'assistant', assistantSpaceId, baseGrantIds: [] },
        messageText: 'Continue this Assistant conversation',
        resourceGrantIds: [],
        configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
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
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledWith(resolution);
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

    const result = await fixture.appHost.deleteHomeConversation(
      fixture.sender,
      createDesktopConversationDeleteRequest(
        'conversation-delete-1',
        navigation,
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

    const result = await fixture.appHost.deleteHomeConversation(
      fixture.sender,
      createDesktopConversationDeleteRequest(
        'assistant-conversation-delete',
        navigation,
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

    const result = await fixture.appHost.deleteHomeConversation(
      fixture.sender,
      createDesktopConversationDeleteRequest(
        'delete-unavailable-conversation',
        navigation,
        projection.rendererSessionId,
      ),
    );

    expect(fixture.agent.deleteConversation).toHaveBeenCalledWith(navigation.conversationId);
    expect(fixture.agent.getWorkspace).not.toHaveBeenCalled();
    expect(fixture.agent.attachWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
    expect(result.projection.agentHome.conversations).toEqual([]);
  });

  it('projects sanitized global Skills and verified extensions without a Project', async () => {
    const fixture = await createShellAppHost();
    fixture.agent.readGlobalSkillCatalog.mockResolvedValue({
      records: [
        {
          name: 'audio-mixing',
          description: 'Mix audio.',
          source: { kind: 'builtin' as const },
          trusted: true,
          enabled: true,
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
          trusted: true,
          enabled: true,
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
          source: { kind: 'plugin' as const, pluginId: 'story-tools@openneko' },
          trusted: true,
          enabled: true,
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
    });
    fixture.extensionManager.readCatalog.mockResolvedValue({
      records: [
        {
          id: 'computer-use@openneko',
          name: 'computer-use',
          displayName: 'Computer Use',
          description: 'Control Mac apps.',
          version: '1.0.2',
          developer: 'OpenAI',
          marketplace: 'openneko',
          category: 'Productivity',
          installed: true,
          enabled: true,
          canInstall: false,
          canRemove: true,
          agentStatus: 'ready',
          runtimeDiagnosticCode: '',
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
        managementId: '',
        canRemove: false,
      },
      {
        id: 'plugin:story-tools@openneko:shot-list',
        name: 'shot-list',
        description: 'Build a shot list.',
        source: 'plugin',
        sourceId: 'story-tools@openneko',
        managementId: '',
        canRemove: false,
      },
    ]);
    expect(result.projection.skillDiscovery).toEqual({
      diagnostics: [{ code: 'invalid_metadata', source: 'personal', count: 2 }],
      duplicateCount: 1,
    });
    expect(result.projection.extensions).toEqual([
      expect.objectContaining({
        id: 'computer-use@openneko',
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

  it('rejects plugin mutation while an Agent turn is active before changing the repository', async () => {
    const fixture = await createShellAppHost();
    const extensions = await openExtensionsScene(fixture);
    vi.mocked(fixture.agent.hasActiveTurns).mockReturnValue(true);

    await expect(
      fixture.appHost.executeExtensionManagement(
        fixture.sender,
        createAgentExtensionManagementHostRequest({
          route: 'plugin.remove',
          requestId: 'plugin-remove-1',
          identity: extensions.identity,
          pluginId: 'computer-use@openneko',
        }),
      ),
    ).rejects.toThrow('Agent turn is active');
    expect(fixture.extensionManager.removePlugin).not.toHaveBeenCalled();
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
  };
} {
  let identity = 0;
  const repository = createInMemoryDesktopShellStateRepository();
  const registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
  } = {
    listProjects: vi.fn(async () => []),
    removeProject: vi.fn(async () => false),
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
      startupTarget: 'restore',
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

async function createShellAppHost(options?: {
  readonly configureShell?: (shell: DesktopShellService) => void;
  readonly agentLaunch?: DesktopAgentLaunchRuntime;
  readonly conversationLifecycle?: AgentConversationLifecycleService;
  readonly assistantResources?: AssistantResourceService;
  readonly assetCenter?: AssetCenterNodeRuntime;
}) {
  const logger = createLogger();
  const fixture = createShellFixture('app-1');
  const agent = createAgentComposition();
  const extensionManager = createExtensionManager();
  const appHost = new DesktopAppHost({
    host: createElectronNekoHostPorts({
      homedir: '/Users/fixture',
      nekoHome: '/Users/fixture/.openneko',
      logger,
    }),
    instanceId: 'app-1',
    logger,
    shell: fixture.service,
    agent,
    assistantWorkspace: createAssistantWorkspaceResolution(),
    agentLaunch: options?.agentLaunch ?? createAgentLaunchRuntime(),
    workspaceGrants: fixture.workspaceGrants,
    conversationLifecycle: options?.conversationLifecycle ?? createConversationLifecycle(),
    assistantResources: options?.assistantResources,
    assetCenter: options?.assetCenter,
    extensionManager,
    personalSkillManager: createPersonalSkillManager(),
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
    registry: fixture.registry,
    windowId,
    sender: {
      webContentsId: 10,
      frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    },
    projection: await appHost.shell.getProjection(windowId),
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

async function bindAssistantDraft(fixture: Awaited<ReturnType<typeof createShellAppHost>>) {
  const scene = activeScene(fixture.projection);
  if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'unbound') {
    throw new Error('Assistant binding fixture requires an unbound Entry Draft.');
  }
  await fixture.appHost.transitionScene(
    fixture.sender,
    createDesktopSceneTransitionRequest({
      requestId: 'bind-assistant-fixture',
      rendererSessionId: fixture.projection.rendererSessionId,
      windowId: fixture.windowId,
      sceneId: scene.sceneId,
      intent: { kind: 'bind-agent-assistant', draftId: scene.context.scope.draftId },
    }),
  );
  return fixture.appHost.shell.getProjection(fixture.windowId);
}

function createLaunchCatalog(
  connection: Parameters<DesktopAgentLaunchRuntime['attach']>[0] & {
    readonly connectionId: string;
  },
) {
  return {
    connection,
    models: [],
    commands: [],
    skills: [],
    resources: [],
  };
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
} {
  return {
    readCatalog: vi.fn<() => Promise<AgentExtensionCatalogSnapshot>>(async () => ({
      records: [],
      runtimeDescriptors: [],
      diagnostics: [],
    })),
    installPlugin: vi.fn(),
    removePlugin: vi.fn(),
    refreshMarketplaces: vi.fn(),
    setRuntimeReadiness: vi.fn(),
  };
}

function createPersonalSkillManager(): PersonalSkillManager {
  return {
    install: vi.fn(),
    remove: vi.fn(),
    resolveManagementId: vi.fn(async () => undefined),
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
    })),
    hasActiveTurns: vi.fn(() => false),
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
    bindAssistantResourceGrants: vi.fn(async () => undefined),
    resolveResourceContexts: vi.fn(async () => []),
    commitResourceGrants: vi.fn(),
    readConversationResourceGrants: vi.fn(() => []),
    detach: vi.fn(async () => undefined),
    detachWindow: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
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
      sequence: 0,
    }),
    promoteQueuedMessage: () => {
      throw new Error('Agent queue promotion is not expected by this AppHost test.');
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

function createWorkspaceResolution(): AssetWorkspaceResolution {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspacePath: '/workspace/demo',
    displayName: 'Demo',
    locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
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
