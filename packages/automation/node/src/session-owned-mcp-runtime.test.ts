import { describe, expect, it, vi } from 'vitest';
import type { AutomationTarget } from '@neko/automation-contracts';
import {
  createSessionOwnedAutomationMcpRuntime,
  type AutomationMcpClientPort,
} from './session-owned-mcp-runtime';

const target: AutomationTarget = {
  kind: 'browser',
  targetKey: 'target-1',
  browserProfileId: 'profile-1',
  browserSessionId: 'browser-session-1',
  tabId: 'tab-1',
  origin: 'https://example.test',
  allowedDomains: ['example.test'],
  label: 'Example',
};

describe('session-owned Automation MCP runtime', () => {
  it('uses a disposable qualification client that never becomes a session', async () => {
    const fixture = createFixture();

    await expect(fixture.runtime.inspectTools({})).resolves.toEqual([
      { name: 'browser_get_state', inputSchema: { type: 'object' } },
    ]);
    expect(fixture.qualification.connect).toHaveBeenCalledOnce();
    expect(fixture.qualification.disconnect).toHaveBeenCalledOnce();
    await expect(
      fixture.runtime.callTool({
        providerSessionId: 'qualification',
        name: 'browser_get_state',
        arguments: {},
      }),
    ).rejects.toThrow("Automation MCP session 'qualification' is unavailable.");
  });

  it('routes each session to its exclusive MCP client and closes only the exact owner', async () => {
    const fixture = createFixture();
    await fixture.runtime.openSession(openInput('session-a'));
    await fixture.runtime.openSession(openInput('session-b'));

    await fixture.runtime.callTool({
      providerSessionId: 'session-a',
      name: 'browser_get_state',
      arguments: { include_screenshot: false },
    });
    await fixture.runtime.callTool({
      providerSessionId: 'session-b',
      name: 'browser_get_state',
      arguments: {},
    });

    expect(fixture.sessionClients.get('session-a')?.callTool).toHaveBeenCalledOnce();
    expect(fixture.sessionClients.get('session-b')?.callTool).toHaveBeenCalledOnce();
    await fixture.runtime.closeSession('session-a');
    expect(fixture.sessionClients.get('session-a')?.disconnect).toHaveBeenCalledOnce();
    await expect(
      fixture.runtime.callTool({
        providerSessionId: 'session-a',
        name: 'browser_get_state',
        arguments: {},
      }),
    ).rejects.toThrow("Automation MCP session 'session-a' is unavailable.");
    await expect(
      fixture.runtime.callTool({
        providerSessionId: 'session-b',
        name: 'browser_get_state',
        arguments: {},
      }),
    ).resolves.toEqual({ content: [] });
  });

  it('rejects target substitution and releases every remaining session on disposal', async () => {
    const fixture = createFixture();
    await fixture.runtime.openSession(openInput('session-a'));
    await fixture.runtime.openSession(openInput('session-b'));

    await expect(
      fixture.runtime.revalidateTarget({
        providerSessionId: 'session-a',
        expected: { ...target, tabId: 'tab-other' },
      }),
    ).rejects.toThrow('Automation MCP target does not belong to the provider session.');
    expect(fixture.revalidate).not.toHaveBeenCalled();

    await fixture.runtime.dispose();
    expect(fixture.sessionClients.get('session-a')?.disconnect).toHaveBeenCalledOnce();
    expect(fixture.sessionClients.get('session-b')?.disconnect).toHaveBeenCalledOnce();
  });

  it('rejects a client factory that shares one MCP client between sessions', async () => {
    const shared = createClient();
    const runtime = createSessionOwnedAutomationMcpRuntime({
      clients: {
        createQualificationClient: () => createClient(),
        createSessionClient: () => shared,
      },
      targets: { revalidate: vi.fn(async () => target) },
    });

    await runtime.openSession(openInput('session-a'));
    await expect(runtime.openSession(openInput('session-b'))).rejects.toThrow(
      'Automation MCP client is already owned by another qualification or session.',
    );
    expect(shared.connect).toHaveBeenCalledOnce();
  });
});

function createFixture() {
  const qualification = createClient();
  const sessionClients = new Map<string, ReturnType<typeof createClient>>();
  const revalidate = vi.fn(async () => target);
  const runtime = createSessionOwnedAutomationMcpRuntime({
    clients: {
      createQualificationClient: () => qualification,
      createSessionClient: ({ sessionId }) => {
        const client = createClient();
        sessionClients.set(sessionId, client);
        return client;
      },
    },
    targets: { revalidate },
  });
  return { runtime, qualification, sessionClients, revalidate };
}

function createClient(): AutomationMcpClientPort & {
  readonly connect: ReturnType<typeof vi.fn>;
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly callTool: ReturnType<typeof vi.fn>;
} {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    listTools: vi.fn(async () => [{ name: 'browser_get_state', inputSchema: { type: 'object' } }]),
    callTool: vi.fn(async () => ({ content: [] })),
  };
}

function openInput(sessionId: string) {
  return {
    sessionId,
    target,
    mode: 'observe' as const,
    timeoutMs: 30_000,
  };
}
