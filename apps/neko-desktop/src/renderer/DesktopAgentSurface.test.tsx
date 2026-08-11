// @vitest-environment jsdom

import { act, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import type {
  AgentHostRuntimeAdapter,
  AgentInteractionProjection,
  ToolCall,
} from '@neko/agent-contracts';
import type {
  AgentComposerWorkspacePresentation,
  AgentToolCallAccessoryRenderer,
} from '@neko/agent-webview/root';
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
      conversationFeed,
      locale,
      presentation,
      toolCallAccessoryRenderer,
    }: {
      readonly hostRuntimeAdapter: AgentHostRuntimeAdapter;
      readonly agentPresentation?: AgentInteractionProjection;
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
      readonly locale: string;
      readonly presentation: string;
      readonly conversationFeed?: { readonly conversationId: string; readonly content: ReactNode };
      readonly toolCallAccessoryRenderer?: AgentToolCallAccessoryRenderer;
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
          {conversationFeed?.content}
          <div data-agent-tool-call-id="tool-call-1" data-testid="tool-call-timeline-item">
            {toolCallAccessoryRenderer?.({
              conversationId: initialConversation?.id ?? null,
              toolCall: automationToolCall(),
            })}
          </div>
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

  it('mounts exact Automation target selection only for the ready Conversation connection', async () => {
    installBridge(vi.fn(async () => readyBootstrap()));
    const execute = vi.mocked(window.openNekoDesktop.automationTargetSelection.execute);
    execute.mockImplementation(async (request) => ({
      requestId: request.requestId,
      route: request.route,
      pending: request.route === 'pending.list' ? [targetSelectionProjection()] : [],
    }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TestAgentSurface
          agentPresentation={{
            phase: 'session',
            conversationId: 'conversation-1',
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

    expect(container.querySelector('[data-automation-target-selection="true"]')).toBeTruthy();
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        connection: readyBootstrap().connection,
        conversationId: 'conversation-1',
        route: 'pending.list',
      }),
    );
    const target = container.querySelector<HTMLButtonElement>(
      '.automation-target-selection__candidate',
    );
    await act(async () => target?.click());
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversationId: 'conversation-1',
        route: 'selection.resolve',
        decision: {
          authorizationId: 'authorization-1',
          decision: 'select',
          targetKey: 'target-1',
        },
      }),
    );
    await act(async () => root.unmount());
  });

  it('mounts exact Automation live control with the ready Conversation and removes terminal state', async () => {
    installBridge(vi.fn(async () => readyBootstrap()));
    const execute = vi.mocked(window.openNekoDesktop.automationSessionControl.execute);
    let active = true;
    execute.mockImplementation(async (request) => {
      if (request.route === 'session.control') active = false;
      return {
        requestId: request.requestId,
        route: request.route,
        controls: active ? [sessionControlProjection()] : [],
      };
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TestAgentSurface
          agentPresentation={{
            phase: 'session',
            conversationId: 'conversation-1',
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

    const control = container.querySelector<HTMLElement>(
      '[data-automation-session-control="true"]',
    );
    expect(control).toBeTruthy();
    expect(
      container.querySelector('[data-testid="tool-call-timeline-item"]')?.contains(control ?? null),
    ).toBe(true);
    expect(control?.closest('[data-owner-root="agent"]')).toBeTruthy();
    expect(control?.textContent).toContain('Fixture Window');
    expect(control?.textContent).not.toMatch(/processId|windowId|tabId|endpointId/u);
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        connection: readyBootstrap().connection,
        conversationId: 'conversation-1',
        route: 'controls.list',
      }),
    );
    const takeover = container.querySelector<HTMLButtonElement>(
      '[data-automation-control-action="take-over"]',
    );
    await act(async () => takeover?.click());
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversationId: 'conversation-1',
        route: 'session.control',
        command: {
          sessionId: 'session-1',
          owner: sessionControlProjection().owner,
          action: 'take-over',
        },
      }),
    );
    expect(container.querySelector('[data-automation-session-control="true"]')).toBeNull();
    expect(container.querySelector('[data-testid="tool-call-timeline-item"]')).toBeTruthy();
    await act(async () => root.unmount());
  });

  it('keeps the exact Automation selection runtime active through StrictMode replay', async () => {
    installBridge(vi.fn(async () => readyBootstrap()));
    const execute = vi.mocked(window.openNekoDesktop.automationTargetSelection.execute);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const presentation = {
      phase: 'session' as const,
      conversationId: 'conversation-1',
      binding: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
    };

    await act(async () => {
      root.render(
        <StrictMode>
          <TestAgentSurface agentPresentation={presentation} />
        </StrictMode>,
      );
    });
    await act(async () => undefined);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        route: 'pending.list',
      }),
    );
    expect(container.textContent).not.toContain('runtime is disposed');
    expect(container.querySelector('[data-testid="agent-root"]')).toBeTruthy();
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

    expect(container.textContent).toContain(
      'The Agent runtime required by this panel is unavailable.',
    );
    expect(container.querySelector('[data-testid="agent-root"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('renders an invalid persisted Conversation as a local non-retryable Surface diagnostic', async () => {
    const getBootstrap = vi.fn(async () => ({
      requestId: 'request-conversation-unavailable',
      status: 'unavailable' as const,
      diagnostic: {
        code: 'desktop-agent-conversation-unavailable' as const,
        severity: 'error' as const,
        conversationId: 'conversation-1',
        fieldNames: ['lifecycle'],
        message: 'Host-only stored record diagnostic.',
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

    expect(container.textContent).toContain(
      'This conversation uses stored data that the current app cannot open.',
    );
    expect(container.textContent).not.toContain('Host-only stored record diagnostic.');
    expect(container.querySelector('[data-testid="agent-root"]')).toBeNull();
    expect(container.querySelector('.desktop-agent-failure__retry')).toBeNull();
    await act(async () => root.unmount());
  });

  it('renders a typed Workspace attach failure as a local translated diagnostic', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const attach = vi.fn(async () => ({
      requestId: 'attach-workspace-unavailable',
      status: 'unavailable' as const,
      diagnostic: {
        code: 'agent-workspace-binding-unavailable',
        owner: 'workspace',
        message: "Workspace grant 'workspace-grant:private' is not present.",
      },
    }));
    installBridge(getBootstrap, { attach, detach: vi.fn(async () => undefined) });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <TestAgentSurface
          agentPresentation={{
            phase: 'draft',
            draftId: 'draft-workspace-unavailable',
            binding: {
              kind: 'workspace',
              workspaceId: 'workspace-1',
              workspaceGrantId: 'workspace-grant:private',
            },
            bindingReceipt: null,
          }}
        />,
      ),
    );
    await act(async () => undefined);

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'Workspace access for this Agent panel is currently unavailable.',
    );
    expect(alert?.textContent).not.toContain('workspace-grant:private');
    expect(container.querySelector('.desktop-agent-failure__retry')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-root"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('mounts Assistant draft through the same Root and detaches its exact launch identity', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const attach = vi.fn(async () => launchReady('assistant:1', 'launch-1'));
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
      .mockResolvedValueOnce(launchReady('assistant:1', 'launch-1'))
      .mockResolvedValueOnce(launchReady('assistant:2', 'launch-2'));
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
    const attach = vi.fn(async () => launchReady('assistant:1', 'launch-1'));
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
        <TestLaunchAgentSurface
          assistantSpaceId="assistant:1"
          conversationId="conversation:1"
          conversationFeed={<div data-testid="room-authority-feed">Room authority</div>}
        />,
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
    expect(container.querySelector('[data-testid="room-authority-feed"]')?.textContent).toBe(
      'Room authority',
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
    const attach = vi.fn(async () => launchReady('assistant:1', 'launch-1'));
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

  it('contains an async launch error, sanitizes transport details, and retries in place', async () => {
    const getBootstrap = vi.fn(async () => readyBootstrap());
    const attach = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'neko:agent:launch': Workspace grant 'workspace-grant:private' is not present.",
        ),
      )
      .mockResolvedValueOnce(launchReady('assistant:1', 'launch-retry'));
    installBridge(getBootstrap, { attach, detach: vi.fn(async () => undefined) });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <div data-testid="sibling-surface">Canvas</div>
          <TestLaunchAgentSurface assistantSpaceId="assistant:1" />
        </>,
      );
    });
    await act(async () => undefined);

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The Agent panel could not connect');
    expect(alert?.textContent).not.toContain('workspace-grant:private');
    expect(alert?.textContent).not.toContain('Error invoking remote method');
    expect(container.querySelector('[data-testid="sibling-surface"]')?.textContent).toBe('Canvas');
    expect(container.querySelector('[data-testid="agent-root"]')).toBeNull();

    await act(async () => {
      const retry = container.querySelector<HTMLButtonElement>('.desktop-agent-failure__retry');
      if (!retry) throw new Error('Agent failure fixture requires a retry action.');
      retry.click();
    });
    await act(async () => undefined);

    expect(attach).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="agent-root"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
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
  conversationFeed,
}: {
  readonly assistantSpaceId: string;
  readonly conversationId?: string;
  readonly conversationFeed?: ReactNode;
}) {
  const i18n = createDesktopI18n('en');
  return (
    <I18nProvider service={i18n.i18nService}>
      <DesktopAgentSurface
        binding="launch"
        workbenchInstanceId="workbench-assistant-1"
        agentSurfaceId="agent-surface-assistant-1"
        viewId="agent-view:window-1"
        conversationFeed={conversationFeed}
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
      automationEndpoints: { execute: vi.fn() },
      automationPermissions: { execute: vi.fn() },
      automationTargetSelection: {
        execute: vi.fn(async (request) => ({
          requestId: request.requestId,
          route: request.route,
          pending: [],
        })),
        subscribe: vi.fn(() => () => undefined),
      },
      automationSessionControl: {
        execute: vi.fn(async (request) => ({
          requestId: request.requestId,
          route: request.route,
          controls: [],
        })),
        subscribe: vi.fn(() => () => undefined),
      },
      agentLaunch: {
        attach: launch?.attach ?? vi.fn(),
        authorizeResource: vi.fn(),
        bindTarget: vi.fn(),
        configureEntryTarget: vi.fn(),
        updateConfiguration: vi.fn(),
        searchWorkspaceMentions: vi.fn(),
        submitDraft: vi.fn(),
        detach: launch?.detach ?? vi.fn(),
      },
      workspaceGrants: {
        chooseDirectory: vi.fn(),
        createContentProject: vi.fn(),
        selectProject: vi.fn(),
        selectAuthoringLibrary: vi.fn(),
      },
      agent: {
        getBootstrap,
        getAssistantBootstrap: launch?.getAssistantBootstrap ?? vi.fn(),
        detach: detachSession,
        send: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
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
      characterFoundation: {
        getSnapshot: vi.fn(async () => ({
          character: {
            projects: [],
            versions: [],
            relationships: [],
            characterRuns: [],
            dialogueRuns: [],
            rooms: [],
            roomRuns: [],
            storylineVersions: [],
            storylineRuns: [],
            storylineObservationCandidates: [],
            memoryScopes: [],
            presentationConfigurations: [],
          },
          diagnostics: [],
        })),
        execute: vi.fn(async () => ({
          character: {
            projects: [],
            versions: [],
            relationships: [],
            characterRuns: [],
            dialogueRuns: [],
            rooms: [],
            roomRuns: [],
            storylineVersions: [],
            storylineRuns: [],
            storylineObservationCandidates: [],
            memoryScopes: [],
            presentationConfigurations: [],
          },
          diagnostics: [],
        })),
      },
      characterAuthoring: {
        getSnapshot: vi.fn(async () => {
          throw new Error('Character authoring is not expected by this test.');
        }),
        execute: vi.fn(async () => {
          throw new Error('Character authoring is not expected by this test.');
        }),
      },
      worldFoundation: {
        getSnapshot: vi.fn(async () => ({
          world: { projects: [], versions: [], runtimes: [] },
          diagnostics: [],
        })),
        execute: vi.fn(async () => ({
          world: { projects: [], versions: [], runtimes: [] },
          diagnostics: [],
        })),
      },
      worldAuthoring: {
        getSnapshot: vi.fn(async () => {
          throw new Error('World authoring is not expected by this test.');
        }),
        execute: vi.fn(async () => {
          throw new Error('World authoring is not expected by this test.');
        }),
      },
      characterAvatar: {
        openSurface: vi.fn(),
        releaseSurface: vi.fn(),
      },
      characterRoomWorkbench: {
        getSnapshot: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      resources: createResourceBridgeMock(),
      projectAuthoring: {
        getNavigation: vi.fn(),
      },
      projectLocalAuthoring: {
        createTarget: vi.fn(),
      },
      projectPortability: {
        inspect: vi.fn(),
        plan: vi.fn(),
        resume: vi.fn(),
        execute: vi.fn(),
        cancel: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      preview: { getSnapshot: vi.fn(), execute: vi.fn() },
      textEditor: { execute: vi.fn(), subscribe: vi.fn(() => () => undefined) },
      canvas: {
        getSnapshot: vi.fn(),
        resolveMaterialActions: vi.fn(),
        readTextFilePreview: vi.fn(),
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

function targetSelectionProjection() {
  return {
    authorizationId: 'authorization-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use@openneko',
      providerId: 'cua-driver',
      kind: 'computer' as const,
      upstreamRelease: '0.19.2',
      deliverySource: { kind: 'github-release' as const },
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

function automationToolCall(): ToolCall {
  return {
    id: 'tool-call-1',
    name: 'automation_cua-driver_screenshot',
    arguments: {},
  };
}

function sessionControlProjection() {
  return {
    sessionId: 'session-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use@openneko',
      providerId: 'cua-driver',
      kind: 'computer' as const,
      upstreamRelease: '0.19.2',
    },
    target: {
      kind: 'computer' as const,
      targetKey: 'target-1',
      label: 'Fixture Window',
    },
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
    defaultMediaModels: {},
    mediaUnderstandingModels: {
      image: {
        category: 'image' as const,
        purpose: 'image.understand' as const,
        status: 'missing' as const,
      },
      audio: {
        category: 'audio' as const,
        purpose: 'audio.understand' as const,
        status: 'missing' as const,
      },
      video: {
        category: 'video' as const,
        purpose: 'video.understand' as const,
        status: 'missing' as const,
      },
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

function launchReady(assistantSpaceId: string, connectionId: string) {
  return {
    requestId: `attach:${connectionId}`,
    status: 'ready' as const,
    catalog: launchCatalog(assistantSpaceId, connectionId),
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
