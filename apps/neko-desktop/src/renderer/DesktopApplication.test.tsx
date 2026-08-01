// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/shared/i18n/react';
import { createDefaultDesktopWorkbenchLayout } from '../shared/workbench-contract';
import type { DesktopShellProjection } from '../shared/shell-contract';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
} from '../shared/application-settings-contract';
import { DesktopApplication } from './DesktopShell';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { createDesktopI18n } from './i18n';
import { DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION } from '../shared/home-management-contract';
import type { DesktopProjectPortabilityRequest } from '../shared/project-portability-contract';

vi.mock('./DesktopAgentSurface', () => ({
  DesktopAgentSurface: ({
    initialConversation,
  }: {
    readonly initialConversation?: { readonly id: string; readonly title: string };
  }) => (
    <div
      data-testid="desktop-agent-surface"
      data-initial-conversation-id={initialConversation?.id}
      data-initial-conversation-title={initialConversation?.title}
    />
  ),
}));

describe('DesktopApplication', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('owns exactly one Shell subscription while mounted under React StrictMode', async () => {
    const projection = createProjection();
    let activeSubscriptions = 0;
    const subscribe = vi.fn(() => {
      activeSubscriptions += 1;
      return () => {
        activeSubscriptions -= 1;
      };
    });
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe,
        },
        projects: {
          open: vi.fn(),
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(),
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <TestApplication />
        </StrictMode>,
      );
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(activeSubscriptions).toBe(1);
    expect(container.textContent).toContain('Start creating');

    await act(async () => root.unmount());
    expect(activeSubscriptions).toBe(0);
    container.remove();
  });

  it('dispatches global Asset Center and Project resources through independent owners', async () => {
    const base = createProjection();
    const project = {
      projectId: 'content:workspace-1',
      workspaceId: 'workspace-1',
      profile: 'content' as const,
      displayName: 'Fixture',
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
    };
    const tab = {
      tabId: 'tab-1',
      projectId: project.projectId,
      viewId: 'view-1',
      viewEpoch: 1,
    };
    const projection: DesktopShellProjection = {
      ...base,
      catalog: {
        revision: 1,
        projects: [project],
      },
      window: {
        ...base.window,
        activeTarget: { kind: 'project', tabId: tab.tabId },
        tabs: [tab],
      },
    };
    const activateHome = vi.fn(async () => ({
      ...projection,
      window: {
        ...projection.window,
        activeTarget: { kind: 'home' as const },
      },
    }));
    const updateWorkbench = vi.fn(async () => projection);
    const projectPortability = createProjectPortabilityBridgeMock();
    projectPortability.inspect.mockImplementation(
      async (request: DesktopProjectPortabilityRequest) => ({
      version: 1,
      requestId: request.requestId,
      identity: request.identity,
      portability: {
        state: 'linked-ready',
        requirementRevision: 'requirements:abc',
        libraries: [],
      },
      }),
    );
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open: vi.fn(),
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome,
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update: updateWorkbench },
        resources: createResourceBridgeMock(),
        projectPortability,
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TestApplication />));

    const projectResources = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.getAttribute('aria-label') === 'Project resources',
    );
    await act(async () => projectResources?.click());
    await waitForDom(() => updateWorkbench.mock.calls.length === 1);

    expect(updateWorkbench).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceDock: { presentation: 'docked', width: 320 },
        main: projection.window.workbench.main,
      }),
      projection.window.revision,
      projection.window.workbench.revision,
    );
    expect(activateHome).not.toHaveBeenCalled();

    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const portabilityControl = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.getAttribute('aria-label') === 'Project portability',
    );
    await act(async () => portabilityControl?.click());
    await waitForDom(() => projectPortability.inspect.mock.calls.length === 1);
    expect(document.body.textContent).toContain(
      'Linked media is available on this machine. Other machines may require relinking.',
    );
    expect(projectPortability.plan).not.toHaveBeenCalled();

    const assetCenter = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Asset Center',
    );
    await act(async () => assetCenter?.click());
    await waitForDom(() => activateHome.mock.calls.length === 1);

    expect(activateHome).toHaveBeenCalledWith(projection.window.revision);
    expect(updateWorkbench).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders extension contributions and confirms installation before dispatch', async () => {
    const projection = createProjection();
    const home = createHomeBridgeMock();
    const catalogRevision = 'a'.repeat(64);
    home.extensions.list.mockResolvedValue({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'extensions-1',
      catalogRevision,
      skills: [],
      skillDiscovery: { diagnostics: [], duplicateCount: 0 },
      extensions: [
        {
          id: 'computer-use@openneko',
          name: 'computer-use',
          displayName: 'Computer Use',
          description: 'Control Mac apps.',
          version: '1.0.2',
          developer: 'OpenAI',
          marketplace: 'openneko',
          category: 'Productivity',
          installed: false,
          enabled: false,
          canInstall: true,
          canRemove: false,
          agentStatus: 'not-installed',
          runtimeDiagnosticCode: '',
          iconDataUrl: '',
          mcpServerIds: ['computer-use'],
          hasSkills: true,
          appIds: [],
        },
      ],
      extensionDiscovery: { diagnostics: [] },
    });
    home.extensions.installPlugin.mockResolvedValue({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'extensions-install-1',
      status: 'completed',
      operation: 'plugin-install',
      targetId: 'computer-use@openneko',
      catalogRevision: 'b'.repeat(64),
    });
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirm);
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home,
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open: vi.fn(),
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(async () => projection),
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TestApplication />));

    const navigationButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Extensions',
    );
    await act(async () => navigationButton?.click());
    const extensionTab = [...container.querySelectorAll('button')]
      .filter((button) => button.textContent?.trim() === 'Extensions')
      .at(-1);
    await act(async () => extensionTab?.click());

    expect(home.extensions.list).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Computer Use');
    expect(container.textContent).toContain('MCP: computer-use');
    expect(container.textContent).toContain('Skill contribution');
    expect(container.textContent).not.toContain('Built-in capabilities');

    const install = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Install',
    );
    await act(async () => install?.click());
    expect(home.extensions.installPlugin).not.toHaveBeenCalled();

    await act(async () => install?.click());
    await waitForDom(() => home.extensions.installPlugin.mock.calls.length === 1);
    expect(confirm).toHaveBeenLastCalledWith(
      'Install extension "Computer Use" and make its supported Skills and MCP tools available to the Agent?',
    );
    expect(home.extensions.installPlugin).toHaveBeenCalledWith(
      'computer-use@openneko',
      catalogRevision,
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it('opens application Settings from Home without requiring a Project and returns to Home', async () => {
    const projection = createProjection();
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open: vi.fn(),
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(),
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TestApplication />));

    const settingsButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Desktop settings"]',
    );
    expect(settingsButton?.disabled).toBe(false);
    await act(async () => settingsButton?.click());
    expect(container.textContent).toContain('Startup destination');

    const back = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Back to OpenNeko',
    );
    await act(async () => back?.click());
    expect(container.textContent).toContain('Start creating');
    await act(async () => root.unmount());
    container.remove();
  });

  it('opens another Project from the unified Home Project selector', async () => {
    const base = createProjection();
    const projection: DesktopShellProjection = {
      ...base,
      catalog: {
        revision: 1,
        projects: [
          {
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            profile: 'content',
            displayName: 'Fixture',
            createdAt: '2026-07-28T00:00:00.000Z',
            updatedAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      },
    };
    const openContent = vi.fn(async () => ({
      schemaVersion: 1 as const,
      requestId: 'open-project-1',
      status: 'cancelled' as const,
      projection,
    }));
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open: vi.fn(),
          openContent,
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(),
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TestApplication />));

    const projectSelector = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Project"]',
    );
    expect(projectSelector?.value).toBe('content:workspace-1');
    await act(async () => {
      if (!projectSelector) return;
      projectSelector.value = '';
      projectSelector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(openContent).toHaveBeenCalledOnce();
    expect(projectSelector?.value).toBe('content:workspace-1');
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps Media Library directory connections independent from the Asset Library', async () => {
    const projection = createProjection();
    const mediaSearch = vi.fn(async () => ({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'media-search',
      status: 'ready' as const,
      revision: 0,
      items: [
        {
          id: 'media-library:local:Footage:root',
          owner: 'media-library' as const,
          libraryId: 'media-library:local:Footage',
          libraryLabel: 'Footage',
          label: 'Footage',
          description: 'local',
          kind: 'library' as const,
          locationKind: 'local' as const,
          relativePath: '',
          mediaType: 'directory',
          availability: 'available' as const,
        },
      ],
    }));
    const children = vi.fn(async () => ({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'media-children',
      status: 'ready' as const,
      revision: 0,
      items: [
        {
          id: 'media-library:local:Footage:shots',
          owner: 'media-library' as const,
          libraryId: 'media-library:local:Footage',
          libraryLabel: 'Footage',
          label: 'shots',
          description: '.',
          kind: 'directory' as const,
          locationKind: 'local' as const,
          relativePath: 'shots',
          mediaType: 'directory',
          availability: 'available' as const,
        },
      ],
    }));
    const assetSearch = vi.fn(async () => ({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'asset-search',
      status: 'ready' as const,
      revision: 0,
      items: [
        {
          id: 'asset-library:abc123',
          owner: 'asset-library' as const,
          label: 'owned.png',
          kind: 'asset' as const,
          mediaType: 'image',
          availability: 'available' as const,
        },
      ],
    }));
    const addLibrary = vi.fn(async () => ({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'media-add',
      status: 'added' as const,
      libraryId: 'media-library:local:Footage',
      revision: 1,
    }));
    const revealLibrary = vi.fn(async () => ({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'media-reveal',
      status: 'revealed' as const,
      libraryId: 'media-library:local:Footage',
      revision: 0,
    }));
    const removeLibrary = vi.fn(async () => ({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'media-remove',
      status: 'removed' as const,
      libraryId: 'media-library:local:Footage',
      revision: 1,
    }));
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: {
          assets: {
            search: assetSearch,
            importFiles: vi.fn(),
            remove: vi.fn(),
          },
          libraryThumbnails: { resolve: vi.fn() },
          mediaLibraries: {
            search: mediaSearch,
            children,
            addLibrary,
            relinkLibrary: vi.fn(),
            revealLibrary,
            removeLibrary,
          },
          extensions: createExtensionsBridgeMock(),
        },
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open: vi.fn(),
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(),
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TestApplication />));

    const assetCenter = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Asset Center'),
    );
    await act(async () => assetCenter?.click());
    await waitForDom(() =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].some((button) =>
        button.textContent?.includes('Connect directory'),
      ) &&
      [...container.querySelectorAll<HTMLElement>('article')].some((entry) =>
        entry.textContent?.includes('Footage'),
      ),
    );

    const add = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Connect directory'),
    );
    await act(async () => add?.click());
    expect(addLibrary).toHaveBeenCalledWith('local', 0);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });

    const reveal = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Show in file manager'),
    );
    const searchCountBeforeReveal = mediaSearch.mock.calls.length;
    await act(async () => reveal?.click());
    expect(revealLibrary).toHaveBeenCalledWith('media-library:local:Footage', 0);
    await waitForDom(
      () =>
        mediaSearch.mock.calls.length > searchCountBeforeReveal &&
        [...container.querySelectorAll<HTMLElement>('article')].some((entry) =>
          entry.textContent?.includes('Footage'),
        ),
    );

    expect(container.textContent).not.toContain('Browse');
    expect(container.textContent).not.toContain('Open folder');
    const libraryEntry = [...container.querySelectorAll<HTMLElement>('article')].find((entry) =>
      entry.textContent?.includes('Footage'),
    );
    await act(async () =>
      libraryEntry?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });
    expect(children).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryId: 'media-library:local:Footage',
        relativePath: '',
      }),
    );

    const back = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Libraries',
    );
    await act(async () => back?.click());
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });

    const remove = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Remove'),
    );
    const searchCountBeforeCancel = mediaSearch.mock.calls.length;
    await act(async () => remove?.click());
    expect(removeLibrary).not.toHaveBeenCalled();
    await waitForDom(
      () =>
        mediaSearch.mock.calls.length > searchCountBeforeCancel &&
        [...container.querySelectorAll<HTMLButtonElement>('button')].some((button) =>
          button.textContent?.includes('Remove'),
        ),
    );
    const removeAfterCancel = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Remove'),
    );
    await act(async () => removeAfterCancel?.click());
    expect(window.confirm).toHaveBeenCalledWith(
      'Remove the connection to "Footage"? External files are preserved.',
    );
    await waitForDom(() => removeLibrary.mock.calls.length === 1);
    expect(removeLibrary).toHaveBeenCalledWith('media-library:local:Footage', 0);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });
    const assetLibrary = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Asset Library',
    );
    await act(async () => assetLibrary?.click());
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });
    expect(
      container.querySelector<HTMLInputElement>('input[placeholder="Search assets"]'),
    ).not.toBeNull();
    expect(assetSearch).toHaveBeenCalled();
    expect(assetSearch).toHaveBeenCalledWith(
      expect.not.objectContaining({ facet: expect.anything() }),
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it('exposes distinct cleanup actions for recent Projects and Agent conversations', async () => {
    const base = createProjection();
    const projection: DesktopShellProjection = {
      ...base,
      catalog: {
        revision: 1,
        projects: [
          {
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            profile: 'content',
            displayName: 'Fixture',
            createdAt: '2026-07-28T00:00:00.000Z',
            updatedAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      },
      agentHome: {
        revision: 1,
        attention: { needsInput: 0, needsReview: 0, running: 0 },
        conversations: [
          {
            navigation: {
              projectId: 'content:workspace-1',
              workspaceId: 'workspace-1',
              conversationId: 'conversation-1',
            },
            title: 'Conversation one',
            updatedAt: '2026-07-28T00:01:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-07-28T00:01:00.000Z',
            },
          },
        ],
      },
    };
    const open = vi.fn();
    const removeRecent = vi.fn(async () => projection);
    const deleteConversation = vi.fn(async () => projection);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open,
          openContent: vi.fn(),
          removeRecent,
          requestProfile: vi.fn(),
        },
        conversations: { delete: deleteConversation },
        tabs: {
          activateHome: vi.fn(),
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<TestApplication />));

    const removeProjectButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Fixture from recent projects"]',
    );
    const deleteConversationButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete conversation Conversation one"]',
    );
    expect(removeProjectButton).not.toBeNull();
    expect(deleteConversationButton).not.toBeNull();

    await act(async () => removeProjectButton?.click());
    expect(removeRecent).toHaveBeenCalledWith('content:workspace-1', 0, 1);
    expect(open).not.toHaveBeenCalled();

    await act(async () => deleteConversationButton?.click());
    expect(deleteConversation).toHaveBeenCalledWith(
      {
        projectId: 'content:workspace-1',
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
      },
      0,
      1,
    );
    expect(open).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    confirm.mockRestore();
    container.remove();
  });

  it('sends primary-sidebar display selection through the revision-bound Workbench bridge', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const base = createProjection();
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      revision: 1,
      main: {
        views: [
          {
            viewId: 'cut:view-1:story',
            viewEpoch: 1,
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            kind: 'cut' as const,
            ownerId: 'cut-session:story',
            displayLabel: 'story.otio',
            documentId: 'cuts/story.otio',
          },
        ],
        groups: [
          {
            groupId: 'main:primary',
            viewIds: ['cut:view-1:story'],
            activeViewId: 'cut:view-1:story',
          },
        ],
        activeGroupId: 'main:primary',
      },
    };
    const projection: DesktopShellProjection = {
      ...base,
      catalog: {
        revision: 1,
        projects: [
          {
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            profile: 'content',
            displayName: 'Demo',
            createdAt: '2026-07-28T00:00:00.000Z',
            updatedAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      },
      window: {
        ...base.window,
        revision: 2,
        activeTarget: { kind: 'project', tabId: 'tab-1' },
        tabs: [
          {
            tabId: 'tab-1',
            projectId: 'content:workspace-1',
            viewId: 'view-1',
            viewEpoch: 1,
          },
        ],
        workbench,
      },
      domains: [
        { surface: 'agent', status: 'ready', ownerSlice: 'P1.3' },
        {
          surface: 'media-library',
          status: 'unavailable',
          ownerSlice: 'P1.4',
          diagnosticCode: 'desktop-domain-surface-unavailable',
        },
        {
          surface: 'canvas',
          status: 'unavailable',
          ownerSlice: 'P1.4',
          diagnosticCode: 'desktop-domain-surface-unavailable',
        },
      ],
    };
    const update = vi.fn(async (nextWorkbench) => ({
      ...projection,
      projectionRevision: projection.projectionRevision + 1,
      window: {
        ...projection.window,
        revision: projection.window.revision + 1,
        workbench: nextWorkbench,
      },
    }));
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open: vi.fn(),
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(),
          activate: vi.fn(),
          close: vi.fn(),
        },
        workbench: { update },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<TestApplication />));
    const display = [...container.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'Display',
    );
    expect(display).toBeDefined();
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.getAttribute('aria-label') === 'Timeline',
      ),
    ).toBe(false);
    await act(async () => {
      display?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const mainOnly = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Main only',
    );
    expect(mainOnly).toBeDefined();
    await act(async () => {
      mainOnly?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 2,
        display: expect.objectContaining({ mode: 'main-only' }),
      }),
      2,
      1,
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it('navigates a Home conversation through its stable Project identity', async () => {
    const base = createProjection();
    const projection: DesktopShellProjection = {
      ...base,
      catalog: {
        revision: 1,
        projects: [
          {
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            profile: 'content',
            displayName: 'Fixture',
            createdAt: '2026-07-28T00:00:00.000Z',
            updatedAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      },
      window: {
        ...base.window,
        revision: 2,
        tabs: [
          {
            tabId: 'tab-1',
            projectId: 'content:workspace-1',
            viewId: 'view-1',
            viewEpoch: 1,
          },
        ],
      },
      agentHome: {
        revision: 1,
        attention: { needsInput: 0, needsReview: 0, running: 0 },
        conversations: [
          {
            navigation: {
              projectId: 'content:workspace-1',
              workspaceId: 'workspace-1',
              conversationId: 'conversation-1',
            },
            title: 'Conversation one',
            updatedAt: '2026-07-28T00:01:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-07-28T00:01:00.000Z',
            },
          },
        ],
      },
    };
    const activeProjection: DesktopShellProjection = {
      ...projection,
      projectionRevision: 2,
      window: {
        ...projection.window,
        revision: 3,
        activeTarget: { kind: 'project', tabId: 'tab-1' },
      },
      domains: [
        {
          surface: 'agent',
          status: 'ready',
          ownerSlice: 'P1.3',
        },
      ],
    };
    const activate = vi.fn(async () => activeProjection);
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open: vi.fn(),
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(),
          activate,
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TestApplication />));
    const conversationButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Conversation one'),
    );
    expect(conversationButton).toBeDefined();

    await act(async () => {
      conversationButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(activate).toHaveBeenCalledWith('tab-1', 2);
    expect(
      container
        .querySelector('[data-testid="desktop-agent-surface"]')
        ?.getAttribute('data-initial-conversation-id'),
    ).toBe('conversation-1');
    expect(
      container
        .querySelector('[data-testid="desktop-agent-surface"]')
        ?.getAttribute('data-initial-conversation-title'),
    ).toBe('Conversation one');
    await act(async () => root.unmount());
    container.remove();
  });

  it('reopens a closed Project before activating its Home conversation', async () => {
    const base = createProjection();
    const conversation = {
      navigation: {
        projectId: 'content:workspace-1',
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
      },
      title: 'Conversation one',
      updatedAt: '2026-07-28T00:01:00.000Z',
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: '2026-07-28T00:01:00.000Z',
      },
    };
    const projection: DesktopShellProjection = {
      ...base,
      catalog: {
        revision: 1,
        projects: [
          {
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            profile: 'content',
            displayName: 'Fixture',
            createdAt: '2026-07-28T00:00:00.000Z',
            updatedAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      },
      agentHome: {
        revision: 1,
        attention: { needsInput: 0, needsReview: 0, running: 0 },
        conversations: [conversation],
      },
    };
    const reopenedProjection: DesktopShellProjection = {
      ...projection,
      projectionRevision: 2,
      window: {
        ...projection.window,
        revision: 1,
        activeTarget: {
          kind: 'project',
          tabId: 'tab:window-1:content:workspace-1',
        },
        tabs: [
          {
            tabId: 'tab:window-1:content:workspace-1',
            projectId: 'content:workspace-1',
            viewId: 'view-reopened',
            viewEpoch: 1,
          },
        ],
      },
      domains: [{ surface: 'agent', status: 'ready', ownerSlice: 'P1.3' }],
    };
    const open = vi.fn(async () => ({
      schemaVersion: 1 as const,
      requestId: 'reopen-1',
      status: 'opened' as const,
      projection: reopenedProjection,
    }));
    const activate = vi.fn();
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        bootstrap: { get: vi.fn() },
        lifecycle: { subscribe: vi.fn(() => () => undefined) },
        settings: createSettingsBridgeMock(),
        home: createHomeBridgeMock(),
        shell: {
          getSnapshot: vi.fn(async () => projection),
          subscribe: vi.fn(() => () => undefined),
        },
        projects: {
          open,
          openContent: vi.fn(),
          removeRecent: vi.fn(),
          requestProfile: vi.fn(),
        },
        conversations: { delete: vi.fn() },
        tabs: {
          activateHome: vi.fn(),
          activate,
          close: vi.fn(),
        },
        workbench: { update: vi.fn() },
        resources: createResourceBridgeMock(),
        projectPortability: createProjectPortabilityBridgeMock(),
        preview: createPreviewBridgeMock(),
        canvas: createCanvasBridgeMock(),
        cut: createCutBridgeMock(),
      } satisfies typeof window.openNekoDesktop,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TestApplication />));
    const conversationButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Conversation one'),
    );

    await act(async () => {
      conversationButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(open).toHaveBeenCalledWith('content:workspace-1');
    expect(activate).not.toHaveBeenCalled();
    expect(
      container
        .querySelector('[data-testid="desktop-agent-surface"]')
        ?.getAttribute('data-initial-conversation-id'),
    ).toBe('conversation-1');
    await act(async () => root.unmount());
    container.remove();
  });
});

function TestApplication(): JSX.Element {
  const i18n = createDesktopI18n('en');
  return (
    <I18nProvider service={i18n.i18nService}>
      <DesktopApplicationSettingsProvider
        value={{
          projection: {
            schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
            revision: 0,
            eventSequence: 0,
            preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          },
          update: vi.fn(),
          openAgentAdvanced: vi.fn(),
        }}
      >
        <DesktopApplication />
      </DesktopApplicationSettingsProvider>
    </I18nProvider>
  );
}

function createResourceBridgeMock() {
  return {
    getSnapshot: vi.fn(),
    children: vi.fn(),
    resolveThumbnail: vi.fn(),
    resolveQuickPreview: vi.fn(),
    releaseQuickPreview: vi.fn(),
    planRecovery: vi.fn(),
    applyRecovery: vi.fn(),
    cancelRecovery: vi.fn(),
    search: vi.fn(),
    execute: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

function createProjectPortabilityBridgeMock() {
  return {
    inspect: vi.fn(),
    plan: vi.fn(),
    resume: vi.fn(),
    execute: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

function createSettingsBridgeMock() {
  return {
    get: vi.fn(),
    update: vi.fn(),
    openAgentAdvanced: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

function createHomeBridgeMock() {
  return {
    assets: {
      search: vi.fn(),
      importFiles: vi.fn(),
      remove: vi.fn(),
    },
    libraryThumbnails: { resolve: vi.fn() },
    mediaLibraries: {
      search: vi.fn(),
      children: vi.fn(),
      addLibrary: vi.fn(),
      relinkLibrary: vi.fn(),
      removeLibrary: vi.fn(),
      revealLibrary: vi.fn(),
    },
    extensions: createExtensionsBridgeMock(),
  };
}

function createExtensionsBridgeMock() {
  return {
    list: vi.fn(),
    installPlugin: vi.fn(),
    removePlugin: vi.fn(),
    refreshMarketplaces: vi.fn(),
    installPersonalSkill: vi.fn(),
    removePersonalSkill: vi.fn(),
  };
}

function createPreviewBridgeMock() {
  return {
    getSnapshot: vi.fn(),
    execute: vi.fn(),
  };
}

function createCanvasBridgeMock() {
  return {
    getSnapshot: vi.fn(),
    resolveMaterialActions: vi.fn(),
    executeIntent: vi.fn(),
    resolvePreviewVariant: vi.fn(),
    executeMediaRequest: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

function createCutBridgeMock() {
  return {
    getSnapshot: vi.fn(),
    execute: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

async function waitForDom(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
  }
  throw new Error('Desktop test DOM condition was not reached.');
}

function createProjection(): DesktopShellProjection {
  return {
    schemaVersion: 1,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 1,
    catalog: {
      revision: 0,
      projects: [],
    },
    window: {
      windowId: 'window-1',
      revision: 0,
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
    },
    agentHome: {
      revision: 0,
      conversations: [],
      attention: {
        needsInput: 0,
        needsReview: 0,
        running: 0,
      },
    },
    domains: [],
  };
}
