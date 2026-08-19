import { render, screen } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WebviewFoundationProvider, createWebviewFoundation } from '@neko/ui/foundation';
import type { AgentHostRuntimeAdapter, AgentInteractionProjection } from '@neko/agent-contracts';
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
  const { useAgentHostMessages, useAgentHostRuntimeAdapter } =
    await vi.importActual<typeof import('./host-runtime-context')>('./host-runtime-context');
  return {
    AppShell: ({
      agentPresentation,
      presentation,
    }: {
      readonly agentPresentation?: AgentInteractionProjection;
      readonly presentation?: string;
    }) => {
      const foundation = useWebviewFoundation();
      const adapter = useAgentHostRuntimeAdapter();
      const messages = useAgentHostMessages();
      const [hostMessageType, setHostMessageType] = useState('none');
      useEffect(() => {
        const subscription = adapter.subscribe((message) => setHostMessageType(message.type));
        messages.getConversations();
        return () => subscription.dispose();
      }, [adapter, messages]);
      return (
        <>
          <span data-testid="foundation-runtime">{foundation.runtimeId}</span>
          <span data-testid="adapter-runtime">{adapter.runtimeId}</span>
          <span data-testid={`host-message-${adapter.runtimeId}`}>{hostMessageType}</span>
          <span data-testid="presentation">{presentation}</span>
          <span data-testid="agent-presentation">
            {agentPresentation
              ? `${agentPresentation.phase}:${agentPresentation.binding.kind}`
              : 'none'}
          </span>
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

  it('forwards the exact Agent draft presentation to the package-owned shell', () => {
    render(
      <AgentWebviewRoot
        agentPresentation={{
          phase: 'draft',
          draftId: 'draft-1',
          binding: { kind: 'assistant', assistantSpaceId: 'assistant:1', baseGrantIds: [] },
          bindingReceipt: null,
        }}
        hostRuntimeAdapter={createAdapter('assistant-draft-adapter')}
        locale="en"
      />,
    );

    expect(screen.getByTestId('agent-presentation').textContent).toBe('draft:assistant');
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

    expect(screen.getByTestId('host-message-synchronous-adapter').textContent).toBe(
      'conversationList',
    );
  });

  it('keeps inbound and outbound traffic isolated across simultaneously mounted Roots', () => {
    const adapterA = createLoopbackAdapter('adapter-a', 'conversationList');
    const adapterB = createLoopbackAdapter('adapter-b', 'tabState');

    render(
      <>
        <AgentWebviewRoot hostRuntimeAdapter={adapterA} locale="en" />
        <AgentWebviewRoot hostRuntimeAdapter={adapterB} locale="en" />
      </>,
    );

    expect(adapterA.send).toHaveBeenCalledWith({ type: 'getConversations' });
    expect(adapterB.send).toHaveBeenCalledWith({ type: 'getConversations' });
    expect(screen.getByTestId('host-message-adapter-a').textContent).toBe('conversationList');
    expect(screen.getByTestId('host-message-adapter-b').textContent).toBe('tabState');
  });
});

function createAdapter(runtimeId: string): AgentHostRuntimeAdapter {
  return {
    hostKind: 'electron',
    runtimeId,
    send: vi.fn(),
    submitMessage: vi.fn(),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    getState: vi.fn(),
    setState: vi.fn(),
  };
}

function createLoopbackAdapter(
  runtimeId: string,
  responseType: 'conversationList' | 'tabState',
): AgentHostRuntimeAdapter {
  let listener: Parameters<AgentHostRuntimeAdapter['subscribe']>[0] | undefined;
  const adapter = createAdapter(runtimeId);
  vi.mocked(adapter.subscribe).mockImplementation((nextListener) => {
    listener = nextListener;
    return { dispose: vi.fn() };
  });
  vi.mocked(adapter.send).mockImplementation(() => {
    if (responseType === 'conversationList') {
      listener?.({ type: 'conversationList', conversations: [] });
      return;
    }
    listener?.({ type: 'tabState', tabState: { openTabs: [], activeTabId: null } });
  });
  return adapter;
}
