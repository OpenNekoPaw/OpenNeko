import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WebviewFoundationProvider, createWebviewFoundation } from '@neko/ui/foundation';
import type { AgentHostRuntimeAdapter } from '@neko-agent/types';
import { AgentWebviewRoot } from './root';

vi.mock('@/components/ChatView/RichContent', () => ({
  registerDefaultRenderers: vi.fn(),
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/AppShell', async () => {
  const { useWebviewFoundation } =
    await vi.importActual<typeof import('@neko/ui/foundation')>('@neko/ui/foundation');
  const { useAgentHostRuntimeAdapter } =
    await vi.importActual<typeof import('@/host-runtime-context')>('@/host-runtime-context');
  return {
    AppShell: ({ presentation }: { readonly presentation?: string }) => {
      const foundation = useWebviewFoundation();
      const adapter = useAgentHostRuntimeAdapter();
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
