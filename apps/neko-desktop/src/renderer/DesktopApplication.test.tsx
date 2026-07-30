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
      schemaVersion: 5 as const,
      requestId: 'media-search',
      status: 'ready' as const,
      items: [
        {
          id: 'media-library:local:Footage:root',
          libraryId: 'media-library:local:Footage',
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
      schemaVersion: 5 as const,
      requestId: 'media-children',
      status: 'ready' as const,
      items: [
        {
          id: 'media-library:local:Footage:shots',
          libraryId: 'media-library:local:Footage',
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
      schemaVersion: 5 as const,
      requestId: 'asset-search',
      status: 'ready' as const,
      items: [
        {
          id: 'asset:owned.png',
          label: 'owned.png',
          kind: 'asset' as const,
          mediaType: 'image',
          availability: 'available' as const,
        },
      ],
    }));
    const addLibrary = vi.fn(async () => ({
      schemaVersion: 5 as const,
      requestId: 'media-add',
      status: 'added' as const,
      libraryId: 'media-library:local:Footage',
    }));
    const revealLibrary = vi.fn(async () => ({
      schemaVersion: 5 as const,
      requestId: 'media-reveal',
      status: 'revealed' as const,
      libraryId: 'media-library:local:Footage',
    }));
    const removeLibrary = vi.fn(async () => ({
      schemaVersion: 5 as const,
      requestId: 'media-remove',
      status: 'removed' as const,
      libraryId: 'media-library:local:Footage',
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
          assets: { search: assetSearch },
          mediaLibraries: {
            search: mediaSearch,
            children,
            addLibrary,
            revealLibrary,
            removeLibrary,
          },
          plugins: { list: vi.fn() },
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
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });

    const add = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Connect directory'),
    );
    await act(async () => add?.click());
    expect(addLibrary).toHaveBeenCalledWith('local');
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });

    const reveal = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Show in file manager'),
    );
    await act(async () => reveal?.click());
    expect(revealLibrary).toHaveBeenCalledWith('media-library:local:Footage');

    const browse = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Browse'),
    );
    await act(async () => browse?.click());
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });
    expect(children).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryId: 'media-library:local:Footage',
        relativePath: '',
      }),
    );

    const back = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Back'),
    );
    await act(async () => back?.click());
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    });

    const remove = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Remove'),
    );
    await act(async () => remove?.click());
    expect(removeLibrary).not.toHaveBeenCalled();
    await act(async () => remove?.click());
    expect(window.confirm).toHaveBeenCalledWith(
      'Remove the “Footage” Media Library connection? Source files will not be deleted.',
    );
    expect(removeLibrary).toHaveBeenCalledWith('media-library:local:Footage');
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
      container.querySelector<HTMLInputElement>(
        'input[placeholder="Search creative assets"]',
      ),
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
    search: vi.fn(),
    execute: vi.fn(),
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
    },
    mediaLibraries: {
      search: vi.fn(),
      children: vi.fn(),
      addLibrary: vi.fn(),
      removeLibrary: vi.fn(),
      revealLibrary: vi.fn(),
    },
    plugins: { list: vi.fn() },
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
