import { describe, expect, it, vi } from 'vitest';
import { DesktopAutomationEndpointManagementRuntime } from './desktop-automation-endpoint-management-runtime';

describe('DesktopAutomationEndpointManagementRuntime', () => {
  it('routes only typed endpoint configuration and authorization removal', async () => {
    const execute = vi.fn(async (request) => ({
      requestId: request.requestId,
      route: request.route,
      projection: { identity: request.identity, endpoints: [] },
    }));
    const runtime = new DesktopAutomationEndpointManagementRuntime(
      { windowId: 'window-1' },
      { automationEndpoints: { execute } },
    );

    await runtime.configure({
      connectorId: 'browser-use.observe.endpoint',
      endpointId: 'endpoint-1',
      url: 'https://browser.example/mcp',
      authorization: { kind: 'none' },
    });
    await runtime.remove('browser-use.observe.endpoint', 'endpoint-1');

    expect(execute.mock.calls.map(([request]) => request.route)).toEqual([
      'endpoint.configure',
      'endpoint.remove',
    ]);
    expect(
      execute.mock.calls.some(([request]) =>
        ['start', 'stop', 'install', 'update'].includes(request.route),
      ),
    ).toBe(false);
  });
});
