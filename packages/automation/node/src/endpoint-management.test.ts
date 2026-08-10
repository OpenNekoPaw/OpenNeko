import { describe, expect, it, vi } from 'vitest';
import type { AutomationEndpointSecretPort } from './endpoint-management';
import { BROWSER_USE_OBSERVE_PROFILE } from './browser-use';
import { createAutomationEndpointManagementService } from './endpoint-management';

const connector = {
  connectorId: 'browser-use.observe.endpoint',
  displayName: 'Browser Use 0.13.7',
  profile: BROWSER_USE_OBSERVE_PROFILE,
  expectedServer: { name: 'browser-use', version: '0.1.0' },
} as const;

describe('Automation endpoint management service', () => {
  it('persists authorization through the secret port and projects only secret-free readiness', async () => {
    const secrets = memorySecrets();
    const probe = {
      inspect: vi.fn(async () => ({
        server: connector.expectedServer,
        operations: BROWSER_USE_OBSERVE_PROFILE.operations.map((operation) => ({
          name: operation.name,
          inputSchemaDigest: operation.inputSchemaDigest,
          annotations: {},
        })),
      })),
    };
    const service = createAutomationEndpointManagementService({
      connectors: [connector],
      secrets,
      probe,
    });

    const [projection] = await service.configure({
      connectorId: connector.connectorId,
      endpointId: 'endpoint-1',
      url: 'http://127.0.0.1:8931/mcp',
      authorization: { kind: 'bearer', secret: 'host-only-token' },
    });

    expect(projection).toMatchObject({
      configured: true,
      authorizationState: 'configured',
      healthStatus: 'reachable',
      providerStatus: 'matched',
      qualificationStatus: 'qualified',
    });
    expect(JSON.stringify(projection)).not.toContain('host-only-token');
    expect(probe.inspect).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: connector.connectorId,
        endpointId: 'endpoint-1',
      }),
    );
    expect(JSON.parse(secrets.values.get(connector.connectorId) ?? '{}')).toMatchObject({
      authorization: { secret: 'host-only-token' },
    });
  });

  it('keeps unreachable, provider mismatch and schema drift as distinct current facts', async () => {
    const cases = [
      {
        inspect: async () => {
          throw new Error('offline');
        },
        expected: { healthStatus: 'unreachable', diagnostics: ['endpoint-unreachable'] },
      },
      {
        inspect: async () => ({ server: { name: 'other', version: '1' }, operations: [] }),
        expected: { providerStatus: 'mismatched', diagnostics: ['provider-mismatch'] },
      },
      {
        inspect: async () => ({
          server: connector.expectedServer,
          operations: [
            {
              name: 'browser_get_state',
              inputSchemaDigest:
                'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              annotations: {},
            },
          ],
        }),
        expected: {
          providerStatus: 'matched',
          qualificationStatus: 'failed',
          diagnostics: expect.arrayContaining(['operation-schema-changed', 'operation-unreviewed']),
        },
      },
    ] as const;

    for (const current of cases) {
      const secrets = memorySecrets();
      const service = createAutomationEndpointManagementService({
        connectors: [connector],
        secrets,
        probe: { inspect: current.inspect },
      });
      await secrets.write(
        connector.connectorId,
        JSON.stringify({
          connectorId: connector.connectorId,
          endpointId: 'endpoint-1',
          url: 'https://endpoint.example/mcp',
          authorization: { kind: 'none' },
        }),
      );
      expect((await service.list())[0]).toMatchObject(current.expected);
    }
  });

  it('removes only the exact stored authorization and exposes no process lifecycle port', async () => {
    const secrets = memorySecrets();
    const service = createAutomationEndpointManagementService({
      connectors: [connector],
      secrets,
      probe: {
        inspect: async () => {
          throw new Error('not used');
        },
      },
    });
    await secrets.write(
      connector.connectorId,
      JSON.stringify({
        connectorId: connector.connectorId,
        endpointId: 'endpoint-1',
        url: 'https://endpoint.example/mcp',
        authorization: { kind: 'none' },
      }),
    );

    await expect(service.remove(connector.connectorId, 'stale')).rejects.toThrow(
      'identity is stale',
    );
    expect(await service.remove(connector.connectorId, 'endpoint-1')).toMatchObject([
      { configured: false },
    ]);
    expect(secrets.values.has(connector.connectorId)).toBe(false);
    expect('start' in service || 'stop' in service || 'update' in service).toBe(false);
  });

  it('isolates a malformed connector record from valid siblings', async () => {
    const secrets = memorySecrets();
    const second = { ...connector, connectorId: 'browser-use.second.endpoint' };
    await secrets.write(connector.connectorId, '{not json');
    await secrets.write(
      second.connectorId,
      JSON.stringify({
        connectorId: second.connectorId,
        endpointId: 'endpoint-2',
        url: 'https://endpoint.example/mcp',
        authorization: { kind: 'none' },
      }),
    );
    const service = createAutomationEndpointManagementService({
      connectors: [connector, second],
      secrets,
      probe: {
        inspect: async () => ({
          server: connector.expectedServer,
          operations: BROWSER_USE_OBSERVE_PROFILE.operations.map((operation) => ({
            name: operation.name,
            inputSchemaDigest: operation.inputSchemaDigest,
            annotations: {},
          })),
        }),
      },
    });

    expect(await service.list()).toMatchObject([
      { configured: false, diagnostics: ['configuration-invalid'] },
      { configured: true, qualificationStatus: 'qualified' },
    ]);
  });
});

function memorySecrets(): AutomationEndpointSecretPort & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    read: async (connectorId) => values.get(connectorId),
    write: async (connectorId, value) => {
      values.set(connectorId, value);
    },
    delete: async (connectorId) => {
      values.delete(connectorId);
    },
  };
}
