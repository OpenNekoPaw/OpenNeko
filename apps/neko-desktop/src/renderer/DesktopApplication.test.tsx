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
          requestProfile: vi.fn(),
        },
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

  it('sends layout controls through the revision-bound Workbench bridge', async () => {
    const base = createProjection();
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      revision: 1,
      main: {
        views: [
          {
            viewId: 'view-1',
            viewEpoch: 1,
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            kind: 'agent' as const,
            ownerId: 'view-1',
          },
        ],
        activeViewId: 'view-1',
        split: 'none' as const,
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
          requestProfile: vi.fn(),
        },
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
    const timeline = [...container.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'Timeline',
    );
    expect(timeline).toBeDefined();
    await act(async () => {
      timeline?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 2,
        timeline: expect.objectContaining({ visible: true }),
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
          requestProfile: vi.fn(),
        },
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
          requestProfile: vi.fn(),
        },
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
    assets: { search: vi.fn() },
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
    executeIntent: vi.fn(),
    resolvePreviewVariant: vi.fn(),
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
