import { describe, expect, it, vi, type Mock } from 'vitest';
import type { MCPConnectionInfo, MCPServerConfig } from '@neko/agent-contracts';
import type { AutomationTarget } from '@neko/automation-contracts';
import { createSessionOwnedAutomationMcpRuntime } from '@neko/automation-node';
import type { HostSecretPort } from '@neko/host/ports';
import { createDesktopAutomationEndpointHost } from './desktop-automation-endpoint-host';

const browserTarget: AutomationTarget = {
  kind: 'browser',
  targetKey: 'target-1',
  browserProfileId: 'profile-1',
  browserSessionId: 'browser-session-1',
  tabId: 'tab-1',
  origin: 'https://example.test',
  allowedDomains: ['example.test'],
  label: 'Example',
};

describe('Desktop Automation endpoint Host', () => {
  it('uses encrypted Host secrets and the canonical HTTP MCP client without process lifecycle', async () => {
    const secrets = memorySecrets();
    const configs: MCPServerConfig[] = [];
    const disconnect = vi.fn(async () => undefined);
    const host = createDesktopAutomationEndpointHost({
      secrets,
      createClient: (config) => {
        configs.push(config);
        return createClient({ disconnect });
      },
    });

    const projection = await host.management.configure({
      connectorId: 'browser-use.observe.endpoint',
      endpointId: 'endpoint-1',
      url: 'https://browser.example/mcp',
      authorization: { kind: 'header', name: 'X-API-Key', secret: 'host-secret' },
    });

    expect([...secrets.values.keys()]).toEqual([
      'openneko.automation.endpoint:browser-use.observe.endpoint',
    ]);
    expect(configs[0]).toMatchObject({
      transport: 'http',
      url: 'https://browser.example/mcp',
      headers: { 'X-API-Key': 'host-secret' },
    });
    expect(configs[0]).not.toHaveProperty('command');
    expect(JSON.stringify(projection)).not.toContain('host-secret');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(Object.keys(host).sort()).toEqual(['createSessionClients', 'management']);
    expect('start' in host || 'stop' in host || 'update' in host || 'terminate' in host).toBe(
      false,
    );
  });

  it('opens distinct qualification and session-owned connections from the exact stored endpoint', async () => {
    const secrets = memorySecrets();
    await writeBrowserEndpoint(secrets, 'endpoint-1');
    const configs: MCPServerConfig[] = [];
    const clients: ReturnType<typeof createClient>[] = [];
    const host = createDesktopAutomationEndpointHost({
      secrets,
      createClient: (config) => {
        configs.push(config);
        const client = createClient({
          tools: [
            {
              name: 'browser_get_state',
              description: 'Read browser state',
              inputSchema: { type: 'object' },
              annotations: { readOnlyHint: true },
            },
          ],
        });
        clients.push(client);
        return client;
      },
    });
    const factory = host.createSessionClients({
      connectorId: 'browser-use.observe.endpoint',
      endpointId: 'endpoint-1',
    });
    const qualification = factory.createQualificationClient();
    const session = factory.createSessionClient({
      sessionId: 'session-1',
      target: browserTarget,
      mode: 'observe',
      timeoutMs: 30_000,
    });

    await qualification.connect({});
    await expect(qualification.listTools({})).resolves.toMatchObject([
      { name: 'browser_get_state', annotations: { readOnlyHint: true } },
    ]);
    await qualification.disconnect();
    await session.connect({});
    await expect(
      session.callTool({ name: 'browser_get_state', arguments: { include_screenshot: false } }),
    ).resolves.toEqual({ content: [{ type: 'text', text: 'state' }], isError: false });
    await session.disconnect();

    expect(configs).toHaveLength(2);
    expect(configs.map((config) => config.id)).toEqual([
      'automation:user-managed-endpoint:qualification:endpoint-1',
      'automation:user-managed-endpoint:session:session-1',
    ]);
    expect(configs.every((config) => config.transport === 'http')).toBe(true);
    expect(
      configs.every((config) => config.headers?.['Authorization'] === 'Bearer host-secret'),
    ).toBe(true);
    expect(clients.every((client) => client.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it('rejects stale configuration and mismatched MCP identity without another source or process path', async () => {
    const secrets = memorySecrets();
    await writeBrowserEndpoint(secrets, 'endpoint-1');
    const createClientSpy = vi.fn(() => createClient());
    const host = createDesktopAutomationEndpointHost({ secrets, createClient: createClientSpy });
    const stale = host
      .createSessionClients({
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-stale',
      })
      .createQualificationClient();

    await expect(stale.connect({})).rejects.toThrow('connection identity is stale');
    expect(createClientSpy).not.toHaveBeenCalled();

    const disconnect = vi.fn(async () => undefined);
    const mismatchedHost = createDesktopAutomationEndpointHost({
      secrets,
      createClient: () =>
        createClient({
          disconnect,
          connection: {
            protocolVersion: '2025-11-25',
            server: { name: 'other-server', version: '1.0.0' },
            capabilities: { tools: {} },
          },
        }),
    });
    const runtime = createSessionOwnedAutomationMcpRuntime({
      clients: mismatchedHost.createSessionClients({
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-1',
      }),
      targets: { revalidate: async () => browserTarget },
    });

    await expect(runtime.inspectTools({})).rejects.toThrow(
      'MCP identity does not match the reviewed connector',
    );
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('retains the concrete endpoint client when disconnect fails so cleanup can be retried', async () => {
    const secrets = memorySecrets();
    await writeBrowserEndpoint(secrets, 'endpoint-1');
    const disconnect = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('disconnect failed'))
      .mockResolvedValueOnce(undefined);
    const host = createDesktopAutomationEndpointHost({
      secrets,
      createClient: () => createClient({ disconnect }),
    });
    const runtime = createSessionOwnedAutomationMcpRuntime({
      clients: host.createSessionClients({
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-1',
      }),
      targets: { revalidate: async () => browserTarget },
    });
    await runtime.openSession({
      sessionId: 'session-1',
      target: browserTarget,
      mode: 'observe',
      timeoutMs: 30_000,
    });

    await expect(runtime.closeSession('session-1')).rejects.toThrow('disconnect failed');
    await expect(
      runtime.callTool({
        providerSessionId: 'session-1',
        name: 'browser_get_state',
        arguments: {},
      }),
    ).resolves.toEqual({ content: [{ type: 'text', text: 'state' }], isError: false });
    await expect(runtime.closeSession('session-1')).resolves.toBeUndefined();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});

function createClient(
  options: {
    readonly disconnect?: Mock<() => Promise<void>>;
    readonly connection?: MCPConnectionInfo;
    readonly tools?: readonly {
      readonly name: string;
      readonly description: string;
      readonly inputSchema: Readonly<Record<string, unknown>>;
      readonly annotations?: { readonly readOnlyHint?: boolean };
    }[];
  } = {},
) {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: options.disconnect ?? vi.fn(async () => undefined),
    getConnectionInfo: () =>
      options.connection ?? {
        protocolVersion: '2025-11-25',
        server: { name: 'browser-use', version: '0.1.0' },
        capabilities: { tools: {} },
      },
    listTools: vi.fn(async () => [...(options.tools ?? [])]),
    callTool: vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'state' }],
      isError: false,
    })),
  };
}

function memorySecrets(): HostSecretPort & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key) => values.get(key),
    set: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

async function writeBrowserEndpoint(secrets: HostSecretPort, endpointId: string): Promise<void> {
  await secrets.set(
    'openneko.automation.endpoint:browser-use.observe.endpoint',
    JSON.stringify({
      connectorId: 'browser-use.observe.endpoint',
      endpointId,
      url: 'https://browser.example/mcp',
      authorization: { kind: 'bearer', secret: 'host-secret' },
    }),
  );
}
