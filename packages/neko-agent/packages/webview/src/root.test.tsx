import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  WebviewFoundationProvider,
  createWebviewFoundation,
} from '@neko/ui/foundation';
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
  return {
    AppShell: () => {
      const foundation = useWebviewFoundation();
      return <span data-testid="foundation-runtime">{foundation.runtimeId}</span>;
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
