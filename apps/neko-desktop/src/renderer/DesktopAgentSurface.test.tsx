// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import type { AgentHostRuntimeAdapter, AgentInteractionProjection } from '@neko/agent-contracts';
import type { AgentComposerWorkspacePresentation } from '@neko/agent-webview/root';
import { projectAgentConfigurationPolicy } from '@neko/agent-runtime/application';
import { DesktopAgentSurface, prepareDesktopAgentSurfaceResources } from './DesktopAgentSurface';
import { createDesktopI18n } from './i18n';

vi.mock('@neko/agent-webview/root', async () => {
  const { useEffect } = await import('react');
  return {
    AgentWebviewRoot: ({
      hostRuntimeAdapter,
      agentPresentation,
      initialConversation,
      composerWorkspace,
      locale,
      presentation,
    }: {
      readonly hostRuntimeAdapter: AgentHostRuntimeAdapter;
      readonly agentPresentation?: AgentInteractionProjection;
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
      readonly locale: string;
      readonly presentation: string;
    }) => {
      useEffect(
        () => () => {
          hostRuntimeAdapter.send({
            type: 'projectionDetach',
            key: {
              attachmentId: 'attachment-test',
              tabId: 'tab-test',
              conversationId: 'conversation-test',
            },
            reason: 'endpoint-replaced',
          });
        },
        [hostRuntimeAdapter],
      );
      if (hostRuntimeAdapter.runtimeId.includes('connection-failing')) {
        throw new Error('agent surface failed');
      }
      return (
        <div
          data-testid="agent-root"
          data-initial-conversation-id={initialConversation?.id}
          data-initial-conversation-title={initialConversation?.title}
          data-presentation={presentation}
          data-agent-presentation={agentPresentation?.phase}
          data-composer-workspace={
            composerWorkspace?.kind === 'workspace'
              ? composerWorkspace.label
              : (composerWorkspace?.kind ?? 'none')
          }
        >
          {hostRuntimeAdapter.runtimeId}:{locale}
        </div>
      );
    },
  };
});

describe('DesktopAgentSurface', () => {
  afterEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('bootstraps the exact Project View and mounts the package-owned Root', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const detachSession = vi.fn(async () => undefined);
    installBridge(getBootstrap, undefined, detachSession);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TestAgentSurface
          composerWorkspace={{ kind: 'workspace', label: 'OpenNeko' }}
          initialConversation={{ id: 'conversation-1', title: 'Conversation one' }}
        />,
      );
    });
    await act(async () => undefined);

    expect(getBootstrap).toHaveBeenCalledWith(
      'workbench-1',
      'agent-surface-1',
      'project-1',
      'view-1',
      'conversation-1',
    );
    expect(container.textContent).toContain('neko.agent.webview.electron:connection-1:en');
    expect(
      container
        .querySelector('[data-testid="agent-root"]')
        ?.getAttribute('data-initial-conversation-id'),
    ).toBe('conversation-1');
    expect(
      container
        .querySelector('[data-testid="agent-root"]')
        ?.getAttribute('data-initial-conversation-title'),
    ).toBe('Conversation one');
    expect(
      container.querySelector('[data-testid="agent-root"]')?.getAttribute('data-presentation'),
    ).toBe('desktop-dock');
    expect(container.querySelector('[data-owner-root="agent"]')?.getAttribute('data-view-id')).toBe(
      'view-1',
    );
    expect(
      container
        .querySelector('[data-testid="agent-root"]')
        ?.getAttribute('data-composer-workspace'),
    ).toBe('OpenNeko');
    await act(async () => root.unmount());
    expect(detachSession).toHaveBeenCalledWith(readyBootstrap().connection);
  });

  it('restores the exact Workspace conversation projected by the active Scene', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    installBridge(getBootstrap);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TestAgentSurface
          agentPresentation={{
            phase: 'session',
            conversationId: 'workspace-conversation-1',
            binding: {
              kind: 'workspace',
              workspaceId: 'workspace-1',
              workspaceGrantId: 'workspace-grant-1',
            },
          }}
        />,
      );
    });
    await act(async () => undefined);

    const agentRoot = container.querySelector('[data-testid="agent-root"]');
    expect(agentRoot?.getAttribute('data-agent-presentation')).toBe('session');
    expect(agentRoot?.getAttribute('data-initial-conversation-id')).toBe(
      'workspace-conversation-1',
    );
    await act(async () => root.unmount());
  });

  it('balances StrictMode bootstrap leases without detaching the active session early', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const detachSession = vi.fn(async () => undefined);
    installBridge(getBootstrap, undefined, detachSession);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <TestAgentSurface />
        </StrictMode>,
      );
    });
    await act(async () => undefined);

    expect(getBootstrap).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('neko.agent.webview.electron:connection-1:en');
    expect(detachSession).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    expect(detachSession).toHaveBeenCalledTimes(2);
  });

  it('starts the Agent module and owner bootstrap concurrently', async () => {
    const started: string[] = [];
    let resolveModule: (() => void) | undefined;
    let resolveBootstrap: ((value: ReturnType<typeof readyBootstrap>) => void) | undefined;
    const moduleReady = new Promise<void>((resolve) => {
      resolveModule = resolve;
    });
    const bootstrapReady = new Promise<ReturnType<typeof readyBootstrap>>((resolve) => {
      resolveBootstrap = resolve;
    });

    const operation = prepareDesktopAgentSurfaceResources({
      loadModule: () => {
        started.push('module');
        return moduleReady;
      },
      getBootstrap: () => {
        started.push('bootstrap');
        return bootstrapReady;
      },
    });

    expect(started).toEqual(['module', 'bootstrap']);
    resolveModule?.();
    resolveBootstrap?.(readyBootstrap());
    await expect(operation).resolves.toEqual(readyBootstrap());
  });

  it('renders the startup diagnostic without mounting an adapter', async () => {
    const getBootstrap = vi.fn(async () => ({
      requestId: 'request-1',
      status: 'unavailable' as const,
      diagnostic: {
        code: 'desktop-agent-capability-unavailable' as const,
        severity: 'error' as const,
        missingRequirements: ['projection-effects'] as const,
        message: 'Projection effects are unavailable.',
      },
    }));
    installBridge(getBootstrap);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<TestAgentSurface />);
    });
    await act(async () => undefined);

    expect(container.textContent).toContain('Projection effects are unavailable.');
    expect(container.querySelector('[data-testid="agent-root"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('mounts Assistant draft through the same Root and detaches its exact launch identity', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const attach = vi.fn(async () => launchCatalog('assistant:1', 'launch-1'));
    const detach = vi.fn(async () => undefined);
    installBridge(getBootstrap, { attach, detach });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<TestLaunchAgentSurface assistantSpaceId="assistant:1" />);
    });
    await act(async () => undefined);

    const rootNode = container.querySelector('[data-testid="agent-root"]');
    expect(attach).toHaveBeenCalledWith(
      'workbench-assistant-1',
      'agent-surface-assistant-1',
      'agent-view:window-1',
      {
        phase: 'draft',
        draftId: 'draft-launch-1',
        binding: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:1',
          baseGrantIds: [],
        },
        bindingReceipt: null,
      },
    );
    expect(rootNode?.getAttribute('data-agent-presentation')).toBe('draft');
    expect(container.textContent).toContain('neko.agent.webview.electron.launch:launch-1:en');

    await act(async () => root.unmount());
    expect(detach).toHaveBeenCalledWith(launchCatalog('assistant:1', 'launch-1').connection);
  });

  it('keeps the Root DOM identity while replacing the adapter by exact launch identity', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const attach = vi
      .fn()
      .mockResolvedValueOnce(launchCatalog('assistant:1', 'launch-1'))
      .mockResolvedValueOnce(launchCatalog('assistant:2', 'launch-2'));
    const detach = vi.fn(async () => undefined);
    installBridge(getBootstrap, { attach, detach });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<TestLaunchAgentSurface assistantSpaceId="assistant:1" />));
    await act(async () => undefined);
    const firstRoot = container.querySelector('[data-testid="agent-root"]');
    await act(async () => root.render(<TestLaunchAgentSurface assistantSpaceId="assistant:2" />));
    await act(async () => undefined);

    expect(container.querySelector('[data-testid="agent-root"]')).toBe(firstRoot);
    expect(container.textContent).toContain('neko.agent.webview.electron.launch:launch-2:en');
    expect(detach).toHaveBeenCalledWith(launchCatalog('assistant:1', 'launch-1').connection);
    await act(async () => root.unmount());
  });

  it('keeps the Root DOM identity while attaching an Assistant committed session', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const getAssistantBootstrap = vi.fn(async () => readyAssistantBootstrap());
    const attach = vi.fn(async () => launchCatalog('assistant:1', 'launch-1'));
    const detach = vi.fn(async () => undefined);
    installBridge(getBootstrap, { attach, detach, getAssistantBootstrap });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<TestLaunchAgentSurface assistantSpaceId="assistant:1" />));
    await act(async () => undefined);
    const firstRoot = container.querySelector('[data-testid="agent-root"]');
    await act(async () =>
      root.render(
        <TestLaunchAgentSurface assistantSpaceId="assistant:1" conversationId="conversation:1" />,
      ),
    );
    await act(async () => undefined);

    const sessionRoot = container.querySelector('[data-testid="agent-root"]');
    expect(sessionRoot).toBe(firstRoot);
    expect(sessionRoot?.getAttribute('data-agent-presentation')).toBe('session');
    expect(sessionRoot?.getAttribute('data-initial-conversation-id')).toBe('conversation:1');
    expect(container.textContent).toContain(
      'neko.agent.webview.electron:assistant-connection-1:en',
    );
    expect(getAssistantBootstrap).toHaveBeenCalledWith(
      'workbench-assistant-1',
      'agent-surface-assistant-1',
      'assistant:1',
      'conversation:1',
      'agent-view:window-1',
    );
    expect(detach).toHaveBeenCalledWith(launchCatalog('assistant:1', 'launch-1').connection);
    await act(async () => root.unmount());
  });

  it('does not render a new session phase through the previous launch adapter', async () => {
    let resolveSession: ((value: ReturnType<typeof readyAssistantBootstrap>) => void) | undefined;
    const sessionBootstrap = new Promise<ReturnType<typeof readyAssistantBootstrap>>((resolve) => {
      resolveSession = resolve;
    });
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const getAssistantBootstrap = vi.fn(() => sessionBootstrap);
    const attach = vi.fn(async () => launchCatalog('assistant:1', 'launch-1'));
    const detach = vi.fn(async () => undefined);
    installBridge(getBootstrap, { attach, detach, getAssistantBootstrap });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<TestLaunchAgentSurface assistantSpaceId="assistant:1" />));
    await act(async () => undefined);
    const agentRoot = container.querySelector('[data-testid="agent-root"]');
    expect(agentRoot?.getAttribute('data-agent-presentation')).toBe('draft');

    await act(async () =>
      root.render(
        <TestLaunchAgentSurface assistantSpaceId="assistant:1" conversationId="conversation:1" />,
      ),
    );

    expect(container.querySelector('[data-testid="agent-root"]')).toBe(agentRoot);
    expect(agentRoot?.getAttribute('data-agent-presentation')).toBe('draft');
    expect(agentRoot?.closest('.desktop-agent-root')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('.desktop-agent-status')).not.toBeNull();

    resolveSession?.(readyAssistantBootstrap());
    await act(async () => undefined);
    expect(container.querySelector('[data-testid="agent-root"]')).toBe(agentRoot);
    expect(agentRoot?.getAttribute('data-agent-presentation')).toBe('session');
    expect(agentRoot?.closest('.desktop-agent-root')?.hasAttribute('hidden')).toBe(false);
    await act(async () => root.unmount());
  });
});

function TestAgentSurface({
  agentPresentation,
  composerWorkspace,
  initialConversation,
}: {
  readonly agentPresentation?: AgentInteractionProjection;
  readonly composerWorkspace?: AgentComposerWorkspacePresentation;
  readonly initialConversation?: { readonly id: string; readonly title: string };
}): JSX.Element {
  const i18n = createDesktopI18n('en');
  return (
    <I18nProvider service={i18n.i18nService}>
      <DesktopAgentSurface
        agentPresentation={agentPresentation}
        binding="workspace"
        workbenchInstanceId="workbench-1"
        agentSurfaceId="agent-surface-1"
        composerWorkspace={composerWorkspace}
        initialConversation={initialConversation}
        tab={{
          tabId: 'tab-1',
          projectId: 'project-1',
          viewId: 'view-1',
          viewInstanceId: 'view-instance-2',
        }}
      />
    </I18nProvider>
  );
}

function TestLaunchAgentSurface({
  assistantSpaceId,
  conversationId,
}: {
  readonly assistantSpaceId: string;
  readonly conversationId?: string;
}) {
  const i18n = createDesktopI18n('en');
  return (
    <I18nProvider service={i18n.i18nService}>
      <DesktopAgentSurface
        binding="launch"
        workbenchInstanceId="workbench-assistant-1"
        agentSurfaceId="agent-surface-assistant-1"
        viewId="agent-view:window-1"
        agentPresentation={
          conversationId
            ? {
                phase: 'session',
                conversationId,
                binding: { kind: 'assistant', assistantSpaceId, baseGrantIds: [] },
              }
            : {
                phase: 'draft',
                draftId: 'draft-launch-1',
                binding: { kind: 'assistant', assistantSpaceId, baseGrantIds: [] },
                bindingReceipt: null,
              }
        }
      />
    </I18nProvider>
  );
}

function installBridge(
  getBootstrap: typeof window.openNekoDesktop.agent.getBootstrap,
  launch?: {
    readonly attach: typeof window.openNekoDesktop.agentLaunch.attach;
    readonly detach: typeof window.openNekoDesktop.agentLaunch.detach;
    readonly getAssistantBootstrap?: typeof window.openNekoDesktop.agent.getAssistantBootstrap;
  },
  detachSession: typeof window.openNekoDesktop.agent.detach = vi.fn(async () => undefined),
): void {
  Object.defineProperty(window, 'openNekoDesktop', {
    configurable: true,
    value: {
      assetCenter: { execute: vi.fn() },
      assistantResources: { execute: vi.fn() },
      extensionManagement: { execute: vi.fn() },
      agentLaunch: {
        attach: launch?.attach ?? vi.fn(),
        authorizeResource: vi.fn(),
        bindTarget: vi.fn(),
        bindAssistant: vi.fn(),
        updateConfiguration: vi.fn(),
        searchWorkspaceMentions: vi.fn(),
        submitDraft: vi.fn(),
        detach: launch?.detach ?? vi.fn(),
      },
      workspaceGrants: { chooseDirectory: vi.fn(), selectProject: vi.fn() },
      agent: {
        getBootstrap,
        getAssistantBootstrap: launch?.getAssistantBootstrap ?? vi.fn(),
        detach: detachSession,
        send: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      directGeneration: { submit: vi.fn() },
      bootstrap: { get: vi.fn() },
      lifecycle: { subscribe: vi.fn(() => () => undefined) },
      settings: {
        get: vi.fn(),
        update: vi.fn(),
        openAgentAdvanced: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      shell: {
        getSnapshot: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      projects: {
        open: vi.fn(),
        openContent: vi.fn(),
        remove: vi.fn(),
        deleteConversations: vi.fn(),
        requestProfile: vi.fn(),
      },
      conversations: { delete: vi.fn() },
      tabs: {
        activateHome: vi.fn(),
        activate: vi.fn(),
        close: vi.fn(),
      },
      workbench: { update: vi.fn() },
      applicationSidebar: { update: vi.fn() },
      scenes: { transition: vi.fn() },
      resources: createResourceBridgeMock(),
      projectPortability: {
        inspect: vi.fn(),
        plan: vi.fn(),
        resume: vi.fn(),
        execute: vi.fn(),
        cancel: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      preview: { getSnapshot: vi.fn(), execute: vi.fn() },
      canvas: {
        getSnapshot: vi.fn(),
        resolveMaterialActions: vi.fn(),
        executeIntent: vi.fn(),
        resolvePreviewVariant: vi.fn(),
        executeMediaRequest: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      cut: {
        createDraft: vi.fn(),
        closeView: vi.fn(),
        getSnapshot: vi.fn(),
        execute: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
    } satisfies typeof window.openNekoDesktop,
  });
}

function readyAssistantBootstrap() {
  return {
    requestId: 'assistant-request-1',
    status: 'ready' as const,
    connection: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-assistant-1',
      agentSurfaceId: 'agent-surface-assistant-1',
      assistantSpaceId: 'assistant:1',
      workspaceId: 'assistant:1',
      viewId: 'agent-view:window-1',
      connectionId: 'assistant-connection-1',
    },
  };
}

function launchCatalog(assistantSpaceId: string, connectionId: string) {
  const draftId = 'draft-launch-1';
  const binding = { kind: 'assistant' as const, assistantSpaceId, baseGrantIds: [] };
  return {
    connection: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-assistant-1',
      agentSurfaceId: 'agent-surface-assistant-1',
      viewId: 'agent-view:window-1',
      draftId,
      connectionId,
    },
    interaction: {
      phase: 'draft' as const,
      draftId,
      binding,
      bindingReceipt: {
        bindingReceiptId: `binding:${connectionId}`,
        draftId,
        connectionId,
        binding,
      },
    },
    models: [],
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

function readyBootstrap() {
  return {
    requestId: 'request-1',
    status: 'ready' as const,
    connection: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'view-1',
      connectionId: 'connection-1',
    },
  };
}
