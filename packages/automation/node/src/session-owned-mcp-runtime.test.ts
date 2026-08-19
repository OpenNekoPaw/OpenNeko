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
  it('uses a disposable inspection client that never becomes a session', async () => {
    const fixture = createFixture();

    await expect(fixture.runtime.inspectTools({})).resolves.toEqual([
      { name: 'browser_get_state', inputSchema: { type: 'object' } },
    ]);
    expect(fixture.inspection.connect).toHaveBeenCalledOnce();
    expect(fixture.inspection.disconnect).toHaveBeenCalledOnce();
    await expect(
      fixture.runtime.callTool({
        providerSessionId: 'inspection',
        name: 'browser_get_state',
        arguments: {},
      }),
    ).rejects.toThrow("Automation MCP session 'inspection' is unavailable.");
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
        createInspectionClient: () => createClient(),
        createSessionClient: () => shared,
      },
      targets: { revalidate: vi.fn(async () => target) },
    });

    await runtime.openSession(openInput('session-a'));
    await expect(runtime.openSession(openInput('session-b'))).rejects.toThrow(
      'Automation MCP client is already owned by another inspection or session.',
    );
    expect(shared.connect).toHaveBeenCalledOnce();
  });

  it('preserves inspection failure when cleanup also fails', async () => {
    const inspection = createClient();
    inspection.listTools.mockRejectedValueOnce(new Error('inspection failed'));
    inspection.disconnect.mockRejectedValueOnce(new Error('cleanup failed'));
    const runtime = createSessionOwnedAutomationMcpRuntime({
      clients: {
        createInspectionClient: () => inspection,
        createSessionClient: () => createClient(),
      },
      targets: { revalidate: vi.fn(async () => target) },
    });

    const failure = await runtime.inspectTools({}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toMatchObject([
      { message: 'inspection failed' },
      { message: 'cleanup failed' },
    ]);
  });

  it('retains exact session ownership when disconnect fails so cleanup can be retried', async () => {
    const client = createClient();
    client.disconnect.mockRejectedValueOnce(new Error('disconnect failed'));
    const runtime = createSessionOwnedAutomationMcpRuntime({
      clients: {
        createInspectionClient: () => createClient(),
        createSessionClient: () => client,
      },
      targets: { revalidate: vi.fn(async () => target) },
    });
    await runtime.openSession(openInput('session-a'));

    await expect(runtime.closeSession('session-a')).rejects.toThrow('disconnect failed');
    await expect(
      runtime.callTool({
        providerSessionId: 'session-a',
        name: 'browser_get_state',
        arguments: {},
      }),
    ).resolves.toEqual({ content: [] });
    await expect(runtime.closeSession('session-a')).resolves.toBeUndefined();
    expect(client.disconnect).toHaveBeenCalledTimes(2);
  });
});

function createFixture() {
  const inspection = createClient();
  const sessionClients = new Map<string, ReturnType<typeof createClient>>();
  const revalidate = vi.fn(async () => target);
  const runtime = createSessionOwnedAutomationMcpRuntime({
    clients: {
      createInspectionClient: () => inspection,
      createSessionClient: ({ sessionId }) => {
        const client = createClient();
        sessionClients.set(sessionId, client);
        return client;
      },
    },
    targets: { revalidate },
  });
  return { runtime, inspection, sessionClients, revalidate };
}

function createClient(): AutomationMcpClientPort & {
  readonly connect: ReturnType<typeof vi.fn>;
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly listTools: ReturnType<typeof vi.fn>;
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
