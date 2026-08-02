import { describe, expect, it, vi } from 'vitest';
import { createToolRegistry } from '@neko/agent-runtime/tool-registry';
import { createOpenNekoPiModels } from '@neko/agent-runtime/pi';
import type { ILogger } from '@neko/shared/logger';
import { createDesktopAgentBootstrapRequest } from '../shared/agent-contract';
import { createDesktopBootstrapRequest } from '../shared/bridge-contract';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  createDesktopApplicationSettingsRequest,
  createDesktopApplicationSettingsUpdateRequest,
} from '@neko/host/application-settings';
import {
  createDesktopHomeAssetSearchRequest,
  createDesktopHomeMediaLibraryAddRequest,
  createDesktopHomeMediaLibraryRequest,
  createDesktopHomeExtensionsRequest,
  createDesktopHomePluginMutationRequest,
} from '../shared/home-management-contract';
import {
  createDesktopConversationDeleteRequest,
  createDesktopProjectOpenRequest,
  createDesktopWindowMutationRequest,
} from '../shared/shell-contract';
import { DesktopAppHost } from './app-host';
import type {
  DesktopAgentAppHostComposition,
  DesktopAgentWorkspaceRuntime,
} from './desktop-agent-app-host-composition';
import { createDesktopAgentCredentialRuntime } from './desktop-agent-credential-runtime';
import type { DesktopWorkspaceRegistry } from './desktop-workspace-registry';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { DESKTOP_APP_ORIGIN } from './security';
import { DesktopShellService } from './shell-service';
import {
  DesktopShellStateRepository,
  type DesktopShellStateFilePort,
} from './shell-state-repository';
import {
  DesktopApplicationSettingsRepository,
  type DesktopApplicationSettingsFilePort,
} from './application-settings-repository';
import { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import type {
  DesktopExtensionCatalogSnapshot,
  DesktopExtensionManager,
} from './desktop-extension-manager';
import type { PersonalSkillManager } from '@neko/agent-runtime/pi';

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
        version: '0.0.1',
        logger,
      }),
      version: '0.0.1',
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
      agent: createAgentComposition(),
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
      createDesktopApplicationSettingsUpdateRequest('settings-update-1', 0, {
        ...DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
        theme: 'dark',
      }),
    );
    expect(updated.projection).toMatchObject({
      revision: 1,
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
          1,
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
      version: '0.0.1',
      env: { OPENNEKO_PRIVATE_TEST_VALUE: 'must-not-cross-bridge' },
      locale: 'zh-CN',
      logger,
    });
    const appHost = new DesktopAppHost({
      host,
      version: '0.0.1',
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
      agent: createAgentComposition(),
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
    appHost.windows.rendererLoading('window-1', 'app-1');

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
        rendererEpoch: 1,
      },
      host: {
        kind: 'electron',
        ui: 'graphical',
      },
    });
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
        version: '0.0.1',
        logger,
      }),
      version: '0.0.1',
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
      agent,
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
        createDesktopWindowMutationRequest(
          'request-1',
          fixture.projection.endpointEpoch,
          fixture.projection.window.revision,
        ),
        selectWorkspace,
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
    expect(selectWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('rejects an unknown sender before resolving a Home asset query', async () => {
    const fixture = await createShellAppHost();

    await expect(
      fixture.appHost.searchHomeAssets(
        {
          webContentsId: 11,
          frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
        },
        createDesktopHomeAssetSearchRequest('assets-1', fixture.projection.endpointEpoch, {
          query: '',
          sortBy: 'name',
          sortDirection: 'ascending',
          limit: 20,
        }),
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
  });

  it('rejects a stale Home endpoint before resolving the Resource Browser runtime', async () => {
    const fixture = await createShellAppHost();

    await expect(
      fixture.appHost.searchHomeAssets(
        fixture.sender,
        createDesktopHomeAssetSearchRequest('assets-stale', 'app-1:window-1:0', {
          query: '',
          sortBy: 'name',
          sortDirection: 'ascending',
          limit: 20,
        }),
      ),
    ).rejects.toThrow('endpoint identity is stale');
  });

  it('rejects unknown senders before any global media-library mutation', async () => {
    const fixture = await createShellAppHost();
    const sender = {
      webContentsId: 11,
      frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    };

    await expect(
      fixture.appHost.addHomeMediaLibrary(
        sender,
        createDesktopHomeMediaLibraryAddRequest(
          'media-library-add-1',
          fixture.projection.endpointEpoch,
          'local',
          0,
        ),
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
    await expect(
      fixture.appHost.removeHomeMediaLibrary(
        sender,
        createDesktopHomeMediaLibraryRequest(
          'media-library-remove-1',
          fixture.projection.endpointEpoch,
          'media-library:local:Footage',
          0,
        ),
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
    await expect(
      fixture.appHost.revealHomeMediaLibrary(
        sender,
        createDesktopHomeMediaLibraryRequest(
          'media-library-reveal-1',
          fixture.projection.endpointEpoch,
          'media-library:local:Footage',
          0,
        ),
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
  });

  it('rejects a replaced renderer before opening the workspace picker', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => '/workspace/demo');
    fixture.appHost.windows.rendererLoading(fixture.windowId, 'app-1');
    fixture.appHost.shell.setRendererEpoch(fixture.windowId, 2);

    await expect(
      fixture.appHost.openContentProject(
        fixture.sender,
        createDesktopWindowMutationRequest(
          'request-1',
          fixture.projection.endpointEpoch,
          fixture.projection.window.revision,
        ),
        selectWorkspace,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect(selectWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('returns a current projection without persistence when the picker is cancelled', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => undefined);

    const result = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'request-1',
        fixture.projection.endpointEpoch,
        fixture.projection.window.revision,
      ),
      selectWorkspace,
    );

    expect(result).toEqual({
      schemaVersion: 1,
      requestId: 'request-1',
      status: 'cancelled',
      projection: fixture.projection,
    });
    expect(selectWorkspace).toHaveBeenCalledOnce();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
    expect(fixture.agent.attachWorkspace).not.toHaveBeenCalled();
  });

  it('attaches the Agent composition with the workspace resolution used by Shell', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);

    const result = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'request-1',
        fixture.projection.endpointEpoch,
        fixture.projection.window.revision,
      ),
      async () => resolution.workspacePath,
    );

    expect(result.status).toBe('opened');
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledWith(resolution);
  });

  it('reopens a catalog Project and reattaches its exact Agent workspace', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'open-1',
        fixture.projection.endpointEpoch,
        fixture.projection.window.revision,
      ),
      async () => resolution.workspacePath,
    );
    const tab = opened.projection.window.tabs[0]!;
    const project = opened.projection.catalog.projects[0]!;
    const closed = await fixture.appHost.shell.closeTab(
      fixture.windowId,
      tab.tabId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
    );

    const reopened = await fixture.appHost.openCatalogProject(
      fixture.sender,
      createDesktopProjectOpenRequest(
        'reopen-1',
        project.projectId,
        closed.endpointEpoch,
        closed.window.revision,
      ),
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
    expect(fixture.agent.attachWorkspace).toHaveBeenLastCalledWith(resolution);
    expect(fixture.agent.attachWorkspace).toHaveBeenCalledTimes(2);
  });

  it('deletes a recent conversation through the exact Agent workspace authority', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'open-1',
        fixture.projection.endpointEpoch,
        fixture.projection.window.revision,
      ),
      async () => resolution.workspacePath,
    );
    const project = opened.projection.catalog.projects[0]!;
    const navigation = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      conversationId: 'conversation-1',
    };
    fixture.agent.readHomeProjection.mockReturnValue({
      revision: 1,
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
    const runtime = createAgentWorkspaceRuntime(project.workspaceId);
    const deleteConversation = vi.fn(async () => {
      fixture.agent.readHomeProjection.mockReturnValue({
        revision: 2,
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      });
    });
    fixture.agent.getWorkspace.mockReturnValue({
      ...runtime,
      deleteConversation,
    });
    const projection = await fixture.appHost.shell.getProjection(fixture.windowId);

    const result = await fixture.appHost.deleteHomeConversation(
      fixture.sender,
      createDesktopConversationDeleteRequest(
        'conversation-delete-1',
        navigation,
        projection.endpointEpoch,
        projection.window.revision,
        projection.agentHome.revision,
      ),
    );

    expect(deleteConversation).toHaveBeenCalledWith('conversation-1');
    expect(result.projection.agentHome).toMatchObject({
      revision: 2,
      conversations: [],
    });
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
      revision: `sha256:${'a'.repeat(64)}`,
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
    const result = await fixture.appHost.listHomeExtensions(
      fixture.sender,
      createDesktopHomeExtensionsRequest('extensions-1', fixture.projection.endpointEpoch),
    );

    expect(result.skills).toEqual([
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
    expect(result.skillDiscovery).toEqual({
      diagnostics: [{ code: 'invalid_metadata', source: 'personal', count: 2 }],
      duplicateCount: 1,
    });
    expect(result.extensions).toEqual([
      expect.objectContaining({
        id: 'computer-use@openneko',
        mcpServerIds: ['computer-use'],
        hasSkills: true,
      }),
    ]);
    expect(result.extensionDiscovery).toEqual({
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

  it('rejects a stale Home endpoint before reading global Skills or extensions', async () => {
    const fixture = await createShellAppHost();

    await expect(
      fixture.appHost.listHomeExtensions(
        fixture.sender,
        createDesktopHomeExtensionsRequest('extensions-stale', 'stale-endpoint'),
      ),
    ).rejects.toThrow('endpoint identity is stale');
    expect(fixture.agent.readGlobalSkillCatalog).not.toHaveBeenCalled();
    expect(fixture.extensionManager.readCatalog).not.toHaveBeenCalled();
  });

  it('rejects plugin mutation while an Agent turn is active before changing the repository', async () => {
    const fixture = await createShellAppHost();
    vi.mocked(fixture.agent.hasActiveTurns).mockReturnValue(true);
    const catalogRevision = `sha256:${'a'.repeat(64)}`;

    await expect(
      fixture.appHost.removeHomeExtensionPlugin(
        fixture.sender,
        createDesktopHomePluginMutationRequest(
          'plugin-remove-1',
          fixture.projection.endpointEpoch,
          'computer-use@openneko',
          catalogRevision,
        ),
      ),
    ).rejects.toThrow('Agent turn is active');
    expect(fixture.extensionManager.removePlugin).not.toHaveBeenCalled();
  });

  it('derives the Agent View grant from Shell and keeps incomplete startup unavailable', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'open-1',
        fixture.projection.endpointEpoch,
        fixture.projection.window.revision,
      ),
      async () => resolution.workspacePath,
    );
    const tab = opened.projection.window.tabs[0];
    if (!tab) throw new Error('Expected an opened Project Tab.');

    await expect(
      fixture.appHost.createAgentBootstrap(
        fixture.sender,
        createDesktopAgentBootstrapRequest('agent-1', tab.projectId, tab.viewId, tab.viewEpoch),
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

  it('rejects forged and stale Agent View identities before creating a connection', async () => {
    const fixture = await createShellAppHost();
    const resolution = createWorkspaceResolution();
    fixture.registry.resolve.mockResolvedValue(resolution);
    const opened = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'open-1',
        fixture.projection.endpointEpoch,
        fixture.projection.window.revision,
      ),
      async () => resolution.workspacePath,
    );
    const tab = opened.projection.window.tabs[0];
    if (!tab) throw new Error('Expected an opened Project Tab.');
    const publish = vi.fn();

    await expect(
      fixture.appHost.createAgentBootstrap(
        fixture.sender,
        createDesktopAgentBootstrapRequest(
          'agent-forged',
          tab.projectId,
          'view-forged',
          tab.viewEpoch,
        ),
        publish,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
    await expect(
      fixture.appHost.createAgentBootstrap(
        fixture.sender,
        createDesktopAgentBootstrapRequest(
          'agent-stale',
          tab.projectId,
          tab.viewId,
          tab.viewEpoch + 1,
        ),
        publish,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-stale-view-epoch' });
    expect(publish).not.toHaveBeenCalled();
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
  readonly registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
  };
} {
  let content: string | null = null;
  const file: DesktopShellStateFilePort = {
    readTextIfExists: async () => content,
    writeTextAtomic: async (next) => {
      content = next;
    },
  };
  const registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
  } = {
    resolve: vi.fn(async () => {
      throw new Error('Workspace resolution is not expected by this AppHost test.');
    }),
    dispose: vi.fn(async () => undefined),
  };
  return {
    registry,
    service: new DesktopShellService({
      applicationInstanceId,
      stateRepository: new DesktopShellStateRepository(file),
      workspaceRegistry: registry,
      startupTarget: 'restore',
      createIdentity: () => 'window-1',
    }),
  };
}

async function createShellAppHost(options?: {
  readonly configureShell?: (shell: DesktopShellService) => void;
}) {
  const logger = createLogger();
  const fixture = createShellFixture('app-1');
  const agent = createAgentComposition();
  const extensionManager = createExtensionManager();
  const appHost = new DesktopAppHost({
    host: createElectronNekoHostPorts({
      homedir: '/Users/fixture',
      nekoHome: '/Users/fixture/.openneko',
      version: '0.0.1',
      logger,
    }),
    version: '0.0.1',
    instanceId: 'app-1',
    logger,
    shell: fixture.service,
    agent,
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
  appHost.shell.setRendererEpoch(windowId, lifecycle.rendererEpoch);
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

function createExtensionManager(): DesktopExtensionManager & {
  readonly readCatalog: ReturnType<typeof vi.fn<() => Promise<DesktopExtensionCatalogSnapshot>>>;
} {
  return {
    readCatalog: vi.fn<() => Promise<DesktopExtensionCatalogSnapshot>>(async () => ({
      revision: `sha256:${'a'.repeat(64)}`,
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
  let content: string | null = null;
  const file: DesktopApplicationSettingsFilePort = {
    readTextIfExists: async () => content,
    writeTextAtomic: async (next) => {
      content = next;
    },
  };
  return new DesktopApplicationSettingsService(new DesktopApplicationSettingsRepository(file));
}

function createAgentComposition(): DesktopAgentAppHostComposition & {
  readonly attachWorkspace: ReturnType<typeof vi.fn>;
  readonly setHomeWorkspaceScope: ReturnType<typeof vi.fn>;
  readonly getWorkspace: ReturnType<typeof vi.fn>;
  readonly readGlobalSkillCatalog: ReturnType<typeof vi.fn>;
  readonly readHomeProjection: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
} {
  const credentialRuntime = createDesktopAgentCredentialRuntime({
    secrets: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    prompt: {
      text: async () => null,
      select: async () => null,
      notify: () => undefined,
    },
  });
  return {
    credentialRuntime,
    setHomeWorkspaceScope: vi.fn<(workspaceIds: readonly string[]) => void>(),
    attachWorkspace: vi.fn(async (workspace: AssetWorkspaceResolution) =>
      createAgentWorkspaceRuntime(workspace.workspaceId),
    ),
    getWorkspace: vi.fn(() => undefined),
    readGlobalSkillCatalog: vi.fn(async () => ({
      records: [],
      diagnostics: [],
      warnings: [],
    })),
    hasActiveTurns: vi.fn(() => false),
    reconcilePluginRuntime: vi.fn(async () => new Map()),
    readHomeProjection: vi.fn(() => ({
      revision: 0,
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    })),
    subscribeHomeProjection: vi.fn(() => () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

function createAgentWorkspaceRuntime(workspaceId: string): DesktopAgentWorkspaceRuntime {
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
    deleteConversation: unavailable,
    clearAllConversations: unavailable,
    openConversation: unavailable,
    startTurn: () => {
      throw new Error('Agent turn start is not expected by this AppHost test.');
    },
    executeTurn: unavailable,
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
