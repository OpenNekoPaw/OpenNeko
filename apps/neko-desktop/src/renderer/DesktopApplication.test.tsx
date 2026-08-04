// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import { AGENT_HOME_PROJECTION_VERSION } from '@neko/agent-contracts';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import {
  DESKTOP_SCENE_CONTRACT_VERSION,
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import {
  DESKTOP_SHELL_CONTRACT_VERSION,
  projectDesktopConversationNavigation,
  type DesktopShellProjection,
  type DesktopShellProjectionEvent,
} from '@neko/host/desktop-shell-contract';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
} from '@neko/host/application-settings';
import { DesktopApplication } from './DesktopShell';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { createDesktopI18n } from './i18n';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';
import {
  createDefaultAssetCenterFilter,
  type AssetCenterSessionProjection,
} from '@neko/assets-domain/asset-center/contract';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('./DesktopExtensionManagementSurface', () => ({
  DesktopExtensionManagementSurface: ({
    runtime,
  }: {
    readonly runtime: DesktopExtensionManagementRuntime;
  }) => (
    <div
      data-extension-management-root="agent"
      data-extension-management-session={runtime.identity.extensionManagementSessionId}
    />
  ),
}));

vi.mock('./DesktopAssetManagementSurface', () => ({
  DesktopAssetManagementSurface: () => <div data-asset-management-root="assets" />,
}));

vi.mock('./DesktopAssetCenterMainSurface', () => ({
  DesktopAssetCenterMainSurface: ({
    projection,
  }: {
    readonly projection: AssetCenterSessionProjection;
  }) => (
    <div
      data-asset-preview-surface="preview-webview-adapter"
      data-preview-session={
        projection.preview.status === 'ready' ? projection.preview.previewSessionId : undefined
      }
    />
  ),
}));

describe('DesktopApplication scene lifecycle', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('owns one Shell subscription and commits Sidebar state only through Sidebar CAS', async () => {
    const projection = createProjection();
    const updateWorkbench = vi.fn();
    const updateApplicationSidebar = vi.fn(async () => ({
      ...projection,
      projectionRevision: projection.projectionRevision + 1,
      window: {
        ...projection.window,
        applicationSidebar: {
          ...projection.window.applicationSidebar,
          revision: 1,
          visible: false,
        },
      },
    }));
    let activeSubscriptions = 0;
    const subscribe = vi.fn(() => {
      activeSubscriptions += 1;
      return () => {
        activeSubscriptions -= 1;
      };
    });
    installBridge({
      projection,
      subscribe,
      updateApplicationSidebar,
      updateWorkbench,
    });
    const { container, root } = await renderApplication(true);

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(activeSubscriptions).toBe(1);
    expect(container.querySelectorAll('[data-neko-controlled-workbench="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-primary-sidebar="application"]')).toHaveLength(1);

    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse sidebar"]',
    );
    if (!collapse) throw new Error('Desktop fixture requires the Sidebar toggle.');
    await act(async () => collapse.click());
    await waitFor(() => updateApplicationSidebar.mock.calls.length === 1);
    expect(updateApplicationSidebar).toHaveBeenCalledWith('window-1', false, 240, 0);
    expect(updateWorkbench).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(activeSubscriptions).toBe(0);
  });

  it('keeps the Workbench and PrimarySidebar mounted while Host switches to Settings', async () => {
    const assistant = createProjection();
    const settings = {
      ...assistant,
      projectionRevision: assistant.projectionRevision + 1,
      window: {
        ...assistant.window,
        revision: assistant.window.revision + 1,
        scene: settingsScene(),
      },
    };
    let snapshot = assistant;
    const transition = vi.fn(async () => {
      snapshot = settings;
      return {
        status: 'transitioned' as const,
        requestId: 'transition-1',
        scene: settings.window.scene,
      };
    });
    installBridge({
      projection: assistant,
      getSnapshot: vi.fn(async () => snapshot),
      transition,
    });
    const { container, root } = await renderApplication();
    const workbench = container.querySelector('[data-neko-controlled-workbench="true"]');
    const sidebar = container.querySelector('[data-primary-sidebar="application"]');
    const settingsButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Desktop settings"]',
    );
    if (!workbench || !sidebar || !settingsButton) {
      throw new Error('Desktop fixture requires Workbench navigation.');
    }

    await act(async () => settingsButton.click());
    await waitFor(() => container.querySelector('[data-settings-surface="main"]') !== null);
    expect(transition).toHaveBeenCalledWith(
      'window-1',
      { kind: 'open-settings' },
      assistant.window.revision,
      assistant.window.scene.revision,
    );
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).toBe(workbench);
    expect(container.querySelector('[data-primary-sidebar="application"]')).toBe(sidebar);
    expect(container.querySelector('[data-settings-surface="navigation"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('routes every Start Creating action to a fresh Host-owned Entry Draft transition', async () => {
    const projection = createProjection();
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'start-creating-1',
      scene: projection.window.scene,
    }));
    installBridge({ projection, transition });
    const { container, root } = await renderApplication();
    const startCreating = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Start creating',
    );
    if (!startCreating) throw new Error('Desktop fixture requires Start Creating navigation.');

    await act(async () => startCreating.click());
    await waitFor(() => transition.mock.calls.length === 1);

    expect(transition).toHaveBeenCalledWith(
      'window-1',
      { kind: 'open-agent-entry' },
      projection.window.revision,
      projection.window.scene.revision,
    );
    await act(async () => root.unmount());
  });

  it('shows owner-qualified unavailable without replacing the current scene', async () => {
    const projection = createProjection();
    const getSnapshot = vi.fn(async () => projection);
    const transition = vi.fn(async () => ({
      status: 'unavailable' as const,
      requestId: 'transition-1',
      diagnostic: {
        code: 'desktop-scene-owner-unavailable' as const,
        severity: 'error' as const,
        message: 'Asset Center owner is unavailable.',
        metadata: {
          owner: 'workspace-authority' as const,
          intentKind: 'open-workspace' as const,
        },
      },
    }));
    installBridge({ projection, getSnapshot, transition });
    const { container, root } = await renderApplication();
    const assetCenter = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Asset Center',
    );
    if (!assetCenter) throw new Error('Desktop fixture requires Asset Center navigation.');
    await act(async () => assetCenter.click());
    await waitFor(() => container.textContent?.includes('Asset Center owner is unavailable.'));

    expect(transition).toHaveBeenCalledWith(
      'window-1',
      { kind: 'open-asset-center' },
      projection.window.revision,
      projection.window.scene.revision,
    );
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Connecting to Agent');
    await act(async () => root.unmount());
  });

  it('applies exact Shell events without creating another Workbench owner', async () => {
    const projection = createProjection();
    let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
    installBridge({
      projection,
      subscribe: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
    });
    const { container, root } = await renderApplication();
    const workbench = container.querySelector('[data-neko-controlled-workbench="true"]');
    const settings = {
      ...projection,
      projectionRevision: projection.projectionRevision + 1,
      window: {
        ...projection.window,
        revision: projection.window.revision + 1,
        scene: settingsScene(),
      },
    };
    await act(async () => {
      listener?.({
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        applicationInstanceId: projection.applicationInstanceId,
        windowId: projection.window.windowId,
        rendererEpoch: 1,
        sequence: 1,
        projection: settings,
      });
    });
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).toBe(workbench);
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('disposes the exact Extensions runtime when Settings replaces its Scene slots', async () => {
    const assistant = createProjection();
    const projection = {
      ...assistant,
      window: { ...assistant.window, scene: extensionsScene('extension-management:window-1:1') },
    };
    let listener: ((event: DesktopShellProjectionEvent) => void) | undefined;
    const dispose = vi.spyOn(DesktopExtensionManagementRuntime.prototype, 'dispose');
    installBridge({
      projection,
      subscribe: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
    });
    const { container, root } = await renderApplication();
    expect(
      container.querySelector(
        '[data-extension-management-session="extension-management:window-1:1"]',
      ),
    ).not.toBeNull();

    const settings = {
      ...projection,
      projectionRevision: projection.projectionRevision + 1,
      window: {
        ...projection.window,
        revision: projection.window.revision + 1,
        scene: settingsScene(),
      },
    };
    await act(async () => {
      listener?.({
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        applicationInstanceId: projection.applicationInstanceId,
        windowId: projection.window.windowId,
        rendererEpoch: 1,
        sequence: 1,
        projection: settings,
      });
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-extension-management-root="agent"]')).toBeNull();
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('composes Asset management and Preview with shared panels and a resizable compact split', async () => {
    const base = createProjection();
    const assetCenterSessionId = 'asset-center:window-1:1';
    const scene = assetCenterPreviewScene();
    const projection: DesktopShellProjection = {
      ...base,
      window: { ...base.window, scene },
    };
    const sessionProjection: AssetCenterSessionProjection = {
      schemaVersion: 1,
      identity: {
        assetCenterSessionId,
        windowId: scene.windowId,
      },
      revision: 1,
      filter: createDefaultAssetCenterFilter(),
      catalog: { status: 'loading' },
      preview: {
        status: 'ready',
        itemId: 'global-asset-library:item-1',
        previewSessionId: 'preview:asset-center:1',
      },
    };
    const assetCenterExecute = vi.fn(
      async (request: { readonly requestId: string; readonly route: string }) => ({
        schemaVersion: 1 as const,
        requestId: request.requestId,
        route: request.route,
        projection: sessionProjection,
      }),
    );
    installBridge({ projection, assetCenterExecute });

    const { container, root } = await renderApplication(true);
    await waitFor(
      () => container.querySelector('[data-preview-session="preview:asset-center:1"]') !== null,
    );

    expectManagementSplit(container, 'asset-management', 'asset-preview');
    expect(container.querySelector('[data-asset-management-root="assets"]')).not.toBeNull();
    expect(
      container.querySelector('[data-asset-preview-surface="preview-webview-adapter"]'),
    ).not.toBeNull();
    await act(async () => root.unmount());
    await act(async () => Promise.resolve());
    expect(assetCenterExecute.mock.calls.map(([request]) => request.route)).toEqual([
      'attach',
      'preview.detach',
    ]);
  });

  it('keeps low-information Project selection in the full management Main', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-1',
      workspaceId: 'workspace-1',
      profile: 'content' as const,
      displayName: 'Project one',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    };
    const projection: DesktopShellProjection = {
      ...base,
      catalog: { revision: 1, projects: [project] },
      window: { ...base.window, scene: projectManagementScene() },
    };
    installBridge({ projection });

    const { container, root } = await renderApplication();
    const projectButton = container.querySelector<HTMLButtonElement>(
      '.management-surface-row__select',
    );
    if (!projectButton) throw new Error('Project management fixture requires a Project row.');
    await act(async () => projectButton.click());
    await waitFor(() => projectButton.getAttribute('aria-pressed') === 'true');

    const shell = container.querySelector<HTMLElement>('[data-neko-controlled-workbench="true"]');
    expect(shell?.dataset.mainSplit).toBe('none');
    expect(shell?.dataset.mainComposition).toBe('continuous');
    expect(container.querySelector('[data-workbench-main-panel="project-detail"]')).toBeNull();
    expect(container.querySelector('[data-workbench-main-shell="secondary"]')).toBeNull();
    expect(container.querySelector('[data-workbench-main-gutter="true"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open project: Project one"]')).not.toBeNull();
    expect(container.textContent).toContain('Project one');
    await act(async () => root.unmount());
  });

  it('routes recent Project and conversation actions with their exact projection identities', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-1',
      workspaceId: 'workspace-1',
      profile: 'content' as const,
      displayName: 'Project one',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    };
    const conversation = {
      navigation: {
        conversationId: 'conversation-1',
        owner: { kind: 'workspace' as const, workspaceId: project.workspaceId },
      },
      title: 'Conversation one',
      updatedAt: '2026-07-29T00:00:00.000Z',
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: '2026-07-29T00:00:00.000Z',
      },
    };
    const catalog = { revision: 3, projects: [project] };
    const agentHome = {
      schemaVersion: AGENT_HOME_PROJECTION_VERSION,
      revision: 4,
      conversations: [conversation],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome),
    };
    const transition = vi.fn(
      async (
        _windowId: string,
        _intent: unknown,
        _windowRevision: number,
        _sceneRevision: number,
      ) => ({
        status: 'transitioned' as const,
        requestId: 'recent-transition',
        scene: projection.window.scene,
      }),
    );
    const deleteConversation = vi.fn(async () => projection);
    const removeRecentProject = vi.fn(async () => projection);
    installBridge({
      projection,
      transition,
      deleteConversation,
      removeRecentProject,
    });
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { container, root } = await renderApplication();

    const projectButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.home-project-link'),
    ].find((button) => button.textContent?.includes(project.displayName));
    const conversationButton = [
      ...container.querySelectorAll<HTMLButtonElement>('.home-project-link'),
    ].find((button) => button.textContent?.includes(conversation.title));
    if (!projectButton || !conversationButton) {
      throw new Error('Desktop fixture requires recent Project and conversation actions.');
    }
    await act(async () => projectButton.click());
    await waitFor(() => transition.mock.calls.length === 1);
    await act(async () => conversationButton.click());
    await waitFor(() => transition.mock.calls.length === 2);
    expect(transition).toHaveBeenNthCalledWith(
      1,
      projection.window.windowId,
      { kind: 'open-project-workspace', projectId: project.projectId },
      projection.window.revision,
      projection.window.scene.revision,
    );
    expect(transition).toHaveBeenNthCalledWith(
      2,
      projection.window.windowId,
      { kind: 'restore-conversation', navigation: conversation.navigation },
      projection.window.revision,
      projection.window.scene.revision,
    );

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Project one from recent projects"]',
    );
    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete conversation Conversation one"]',
    );
    if (!removeButton || !deleteButton) {
      throw new Error('Desktop fixture requires recent removal actions.');
    }
    await act(async () => removeButton.click());
    await waitFor(() => removeRecentProject.mock.calls.length === 1);
    expect(removeRecentProject).toHaveBeenCalledWith(
      project.projectId,
      projection.window.revision,
      projection.catalog.revision,
    );
    await act(async () => deleteButton.click());
    await waitFor(() => deleteConversation.mock.calls.length === 1);
    expect(deleteConversation).toHaveBeenCalledWith(
      conversation.navigation,
      projection.window.revision,
      projection.agentHome.revision,
    );
    await act(async () => root.unmount());
  });

  it('groups standalone Assistant conversations and expands beyond the bounded initial list', async () => {
    const base = createProjection();
    const conversations = Array.from({ length: 6 }, (_, index) => ({
      navigation: {
        conversationId: `assistant-conversation-${index + 1}`,
        owner: {
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-space:local-user',
        },
      },
      title: `Assistant conversation ${index + 1}`,
      updatedAt: `2026-08-0${index + 1}T00:00:00.000Z`,
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: `2026-08-0${index + 1}T00:00:00.000Z`,
      },
    }));
    const catalog = { revision: 1, projects: [] };
    const agentHome = {
      schemaVersion: AGENT_HOME_PROJECTION_VERSION,
      revision: 2,
      conversations,
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    } as const;
    const projection: DesktopShellProjection = {
      ...base,
      catalog,
      agentHome,
      conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome),
    };
    const transition = vi.fn(async () => ({
      status: 'transitioned' as const,
      requestId: 'assistant-transition',
      scene: projection.window.scene,
    }));
    installBridge({ projection, transition });
    const { container, root } = await renderApplication();

    const group = container.querySelector<HTMLElement>(
      '.primary-conversation-group[data-group-kind="assistant"]',
    );
    if (!group) throw new Error('Desktop fixture requires a standalone Assistant group.');
    expect(group.textContent).toContain('Personal assistant');
    expect(group.querySelectorAll('.primary-recent-conversation-row')).toHaveLength(5);
    expect(group.textContent).not.toContain('Assistant conversation 1');
    expect(group.textContent).toContain('Assistant conversation 6');

    const expand = group.querySelector<HTMLButtonElement>(
      '.primary-conversation-group__expand',
    );
    if (!expand) throw new Error('Desktop fixture requires the conversation expand action.');
    expect(expand.textContent).toContain('Show more');
    await act(async () => expand.click());
    expect(group.querySelectorAll('.primary-recent-conversation-row')).toHaveLength(6);
    expect(expand.textContent).toContain('Show less');

    const oldest = [...group.querySelectorAll<HTMLButtonElement>('.home-conversation-link')].find(
      (button) => button.textContent?.includes('Assistant conversation 1'),
    );
    if (!oldest) throw new Error('Expanded Assistant conversation is missing.');
    await act(async () => oldest.click());
    await waitFor(() => transition.mock.calls.length === 1);
    expect(transition).toHaveBeenCalledWith(
      projection.window.windowId,
      { kind: 'restore-conversation', navigation: conversations[0]?.navigation },
      projection.window.revision,
      projection.window.scene.revision,
    );
    await act(async () => root.unmount());
  });

  it('keeps the Workspace Agent layout mounted when the authoritative Main group is empty', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-empty',
      workspaceId: 'workspace-empty',
      profile: 'content' as const,
      displayName: 'Empty Workspace',
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    };
    const tab = {
      tabId: 'tab:workspace-empty',
      projectId: project.projectId,
      viewId: 'agent-view:workspace-empty',
      viewEpoch: 1,
    };
    const sceneId = 'scene:window-1:workspace-empty';
    const projection: DesktopShellProjection = {
      ...base,
      catalog: { revision: 1, projects: [project] },
      window: {
        ...base.window,
        activeTarget: { kind: 'project', tabId: tab.tabId },
        tabs: [tab],
        workbench: {
          ...createDefaultDesktopWorkbenchLayout('window-1'),
          display: {
            ...createDefaultDesktopWorkbenchLayout('window-1').display,
            mode: 'chat-main',
          },
        },
        scene: parseDesktopWorkbenchSceneProjection({
          schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
          sceneId,
          windowId: 'window-1',
          revision: 1,
          context: {
            kind: 'agent',
            agentViewId: tab.viewId,
            scope: {
              kind: 'workspace',
              draftId: 'draft-workspace-empty',
              workspaceId: project.workspaceId,
              workspaceGrantId: 'workspace-grant:empty',
            },
          },
          slots: {
            interaction: {
              kind: 'agent',
              agentViewId: tab.viewId,
              phase: 'draft',
              scope: {
                kind: 'workspace',
                draftId: 'draft-workspace-empty',
                workspaceId: project.workspaceId,
                workspaceGrantId: 'workspace-grant:empty',
              },
            },
            rightManager: { kind: 'workspace-resources', workspaceId: project.workspaceId },
            status: { kind: 'scene-status', sceneId },
          },
        }),
      },
    };
    installBridge({ projection });

    const { container, root } = await renderApplication();

    expect(container.querySelector('[data-empty-main="true"]')).not.toBeNull();
    expect(container.querySelector('.agent-workspace')).not.toBeNull();
    expect(container.querySelector('[data-neko-controlled-workbench="true"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});

function installBridge({
  getSnapshot = vi.fn(async () => projection),
  projection,
  subscribe = vi.fn(() => () => undefined),
  transition = vi.fn(),
  deleteConversation = vi.fn(),
  removeRecentProject = vi.fn(),
  updateApplicationSidebar = vi.fn(),
  updateWorkbench = vi.fn(),
  assetCenterExecute = vi.fn(),
}: {
  readonly getSnapshot?: () => Promise<DesktopShellProjection>;
  readonly projection: DesktopShellProjection;
  readonly subscribe?: (listener: (event: DesktopShellProjectionEvent) => void) => () => void;
  readonly transition?: ReturnType<typeof vi.fn>;
  readonly deleteConversation?: ReturnType<typeof vi.fn>;
  readonly removeRecentProject?: ReturnType<typeof vi.fn>;
  readonly updateApplicationSidebar?: ReturnType<typeof vi.fn>;
  readonly updateWorkbench?: ReturnType<typeof vi.fn>;
  readonly assetCenterExecute?: ReturnType<typeof vi.fn>;
}): void {
  Object.defineProperty(window, 'openNekoDesktop', {
    configurable: true,
    value: {
      shell: { getSnapshot, subscribe },
      scenes: { transition },
      conversations: { delete: deleteConversation },
      projects: { removeRecent: removeRecentProject },
      applicationSidebar: { update: updateApplicationSidebar },
      workbench: { update: updateWorkbench },
      assetCenter: { execute: assetCenterExecute },
      agentLaunch: {
        attach: vi.fn(() => new Promise(() => undefined)),
        authorizeResource: vi.fn(),
        detach: vi.fn(),
      },
      projectPortability: undefined,
    },
  });
}

async function renderApplication(strict = false) {
  const i18n = createDesktopI18n('en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const application = (
    <I18nProvider service={i18n.i18nService}>
      <DesktopApplicationSettingsProvider
        value={{
          projection: {
            schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
            revision: 0,
            eventSequence: 0,
            preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          },
          update: async () => undefined,
          openAgentAdvanced: async () => undefined,
        }}
      >
        <DesktopApplication />
      </DesktopApplicationSettingsProvider>
    </I18nProvider>
  );
  await act(async () => root.render(strict ? <StrictMode>{application}</StrictMode> : application));
  await waitFor(() => container.querySelector('[data-neko-controlled-workbench="true"]') !== null);
  return { container, root };
}

function createProjection(): DesktopShellProjection {
  const catalog = { revision: 0, projects: [] } as const;
  const agentHome = {
    schemaVersion: AGENT_HOME_PROJECTION_VERSION,
    revision: 0,
    conversations: [],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  } as const;
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 2,
    catalog,
    window: {
      windowId: 'window-1',
      revision: 1,
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
      scene: createDefaultDesktopAgentScene('window-1', 'assistant-space:test'),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome,
    conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome),
    domains: [],
  };
}

function settingsScene() {
  const sceneId = 'scene:window-1:settings';
  return parseDesktopWorkbenchSceneProjection({
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId,
    windowId: 'window-1',
    revision: 1,
    context: { kind: 'settings', settingsSectionId: 'general' },
    slots: {
      leftManager: { kind: 'settings-navigation', settingsSectionId: 'general' },
      main: { kind: 'settings-main', settingsSectionId: 'general' },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function extensionsScene(extensionManagementSessionId: string) {
  const sceneId = 'scene:window-1:extensions';
  return parseDesktopWorkbenchSceneProjection({
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId,
    windowId: 'window-1',
    revision: 1,
    context: { kind: 'extensions', extensionManagementSessionId },
    slots: {
      main: { kind: 'extension-management', extensionManagementSessionId },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function assetCenterPreviewScene() {
  const sceneId = 'scene:window-1:asset-center';
  const assetCenterSessionId = 'asset-center:window-1:1';
  return parseDesktopWorkbenchSceneProjection({
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId,
    windowId: 'window-1',
    revision: 1,
    context: { kind: 'asset-center', assetCenterSessionId },
    slots: {
      main: { kind: 'asset-management', assetCenterSessionId },
      secondaryMain: {
        kind: 'asset-preview',
        assetCenterSessionId,
        previewSessionId: 'preview:asset-center:1',
      },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function projectManagementScene() {
  const sceneId = 'scene:window-1:project-management';
  const projectManagementSessionId = 'project-management:window-1:1';
  return parseDesktopWorkbenchSceneProjection({
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId,
    windowId: 'window-1',
    revision: 1,
    context: { kind: 'project-management', projectManagementSessionId },
    slots: {
      main: { kind: 'project-management', projectManagementSessionId },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function expectManagementSplit(
  container: HTMLElement,
  managementPanelId: string,
  detailPanelId: string,
): void {
  const shell = container.querySelector<HTMLElement>('[data-neko-controlled-workbench="true"]');
  expect(shell?.dataset.mainSplit).toBe('columns');
  expect(shell?.dataset.mainComposition).toBe('independent-shells');
  expect(shell?.style.getPropertyValue('--neko-controlled-main-split-ratio')).toBe('34%');
  expect(
    container.querySelector(
      `[data-workbench-main-panel="${managementPanelId}"][data-panel-size="compact"]`,
    ),
  ).not.toBeNull();
  expect(container.querySelector(`[data-workbench-main-panel="${detailPanelId}"]`)).not.toBeNull();
  expect(container.querySelector('[data-workbench-main-shell="primary"]')).not.toBeNull();
  expect(container.querySelector('[data-workbench-main-shell="secondary"]')).not.toBeNull();
  expect(container.querySelector('[data-workbench-main-gutter="true"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Resize Main split"]')).not.toBeNull();
}

async function waitFor(assertion: () => boolean | undefined): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (assertion()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error('Desktop application fixture did not reach the expected state.');
}
