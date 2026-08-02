import { render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WebviewFoundationProvider, createWebviewFoundation } from '@neko/ui/foundation';
import type { AgentHostRuntimeAdapter } from '@neko-agent/contracts';
import { NEKO_AGENT_HOST_MESSAGE_EVENT } from '@neko-agent/contracts/host-message-event';
import { AgentWebviewRoot } from './root';

vi.mock('./components/ChatView/RichContent', () => ({
  registerDefaultRenderers: vi.fn(),
}));

vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

vi.mock('./components/AppShell', async () => {
  const { useWebviewFoundation } =
    await vi.importActual<typeof import('@neko/ui/foundation')>('@neko/ui/foundation');
  const { useAgentHostRuntimeAdapter } =
    await vi.importActual<typeof import('./host-runtime-context')>('./host-runtime-context');
  return {
    AppShell: ({ presentation }: { readonly presentation?: string }) => {
      const foundation = useWebviewFoundation();
      const adapter = useAgentHostRuntimeAdapter();
      useEffect(() => {
        const listener = (event: Event): void => {
          const message = (event as CustomEvent<{ readonly type: string }>).detail;
          document.body.setAttribute('data-synchronous-host-message', message.type);
        };
        window.addEventListener(NEKO_AGENT_HOST_MESSAGE_EVENT, listener);
        adapter.send({ type: 'getConversations' });
        return () => window.removeEventListener(NEKO_AGENT_HOST_MESSAGE_EVENT, listener);
      }, [adapter]);
      return (
        <>
          <span data-testid="foundation-runtime">{foundation.runtimeId}</span>
          <span data-testid="adapter-runtime">{adapter.runtimeId}</span>
          <span data-testid="presentation">{presentation}</span>
        </>
      );
    },
  };
});

describe('AgentWebviewRoot foundation wiring', () => {
  it('inherits an existing host foundation instead of creating a duplicate runtime', () => {
    const hostFoundation = createWebviewFoundation({
      hostKind: 'electron',
      runtimeId: 'host-foundation',
      locale: 'en',
      theme: { kind: 'light' },
    });

    render(
      <WebviewFoundationProvider value={hostFoundation}>
        <AgentWebviewRoot hostRuntimeAdapter={createAdapter('adapter-foundation')} locale="en" />
      </WebviewFoundationProvider>,
    );

    expect(screen.getByTestId('foundation-runtime').textContent).toBe('host-foundation');
    expect(screen.getByTestId('adapter-runtime').textContent).toBe('adapter-foundation');
  });

  it('uses an explicit host foundation when the Desktop root provides one', () => {
    const explicitFoundation = createWebviewFoundation({
      hostKind: 'electron',
      runtimeId: 'neko.agent.webview.electron',
      locale: 'zh-cn',
      theme: { kind: 'light' },
    });

    render(
      <AgentWebviewRoot
        foundation={explicitFoundation}
        hostRuntimeAdapter={createAdapter('adapter-foundation')}
        locale="zh-cn"
      />,
    );

    expect(screen.getByTestId('foundation-runtime').textContent).toBe(
      'neko.agent.webview.electron',
    );
    expect(screen.getByTestId('adapter-runtime').textContent).toBe('adapter-foundation');
  });

  it('forwards the Desktop dock presentation to the package-owned shell', () => {
    render(
      <AgentWebviewRoot
        hostRuntimeAdapter={createAdapter('desktop-adapter')}
        locale="en"
        presentation="desktop-dock"
      />,
    );

    expect(screen.getByTestId('presentation').textContent).toBe('desktop-dock');
  });

  it('subscribes before a descendant initialization request receives a synchronous response', () => {
    let listener:
      ((message: { readonly type: 'conversationList'; conversations: [] }) => void) | undefined;
    const adapter = createAdapter('synchronous-adapter');
    vi.mocked(adapter.subscribe).mockImplementation((nextListener) => {
      listener = nextListener as typeof listener;
      return { dispose: vi.fn() };
    });
    vi.mocked(adapter.send).mockImplementation(() => {
      listener?.({ type: 'conversationList', conversations: [] });
    });

    render(<AgentWebviewRoot hostRuntimeAdapter={adapter} locale="en" />);

    expect(document.body.getAttribute('data-synchronous-host-message')).toBe('conversationList');
  });
});

function createAdapter(runtimeId: string): AgentHostRuntimeAdapter {
  return {
    hostKind: 'electron',
    runtimeId,
    send: vi.fn(),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    getState: vi.fn(),
    setState: vi.fn(),
  };
}
