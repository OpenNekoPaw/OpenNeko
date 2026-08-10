import { describe, expect, it } from 'vitest';
import {
  parseAutomationEndpointConfigurationInput,
  parseAutomationEndpointManagementHostRequest,
  parseAutomationEndpointManagementProjection,
} from './endpoint-management';

describe('Automation endpoint management contracts', () => {
  it('accepts HTTPS and loopback HTTP while rejecting ambient credential surfaces', () => {
    expect(
      parseAutomationEndpointConfigurationInput({
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-1',
        url: 'http://127.0.0.1:8931/mcp',
        authorization: { kind: 'bearer', secret: 'secret' },
      }),
    ).toMatchObject({ url: 'http://127.0.0.1:8931/mcp' });

    expect(() =>
      parseAutomationEndpointConfigurationInput({
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-1',
        url: 'http://example.com/mcp',
        authorization: { kind: 'none' },
      }),
    ).toThrow('HTTPS or loopback HTTP');
    expect(() =>
      parseAutomationEndpointConfigurationInput({
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-1',
        url: 'https://example.com/mcp?token=secret',
        authorization: { kind: 'none' },
      }),
    ).toThrow('must not contain credentials, query, or fragment');
    expect(() =>
      parseAutomationEndpointConfigurationInput({
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-1',
        url: 'https://example.com/mcp',
        authorization: { kind: 'header', name: 'Cookie', secret: 'secret' },
      }),
    ).toThrow('header is not allowed');
  });

  it('keeps secret-bearing input out of the endpoint projection', () => {
    const projection = parseAutomationEndpointManagementProjection({
      identity: { windowId: 'window-1' },
      endpoints: [
        {
          connectorId: 'browser-use.observe.endpoint',
          displayName: 'Browser Use 0.13.7',
          providerKind: 'browser',
          upstreamRelease: '0.13.7',
          configured: true,
          endpointId: 'endpoint-1',
          endpointUrl: 'https://browser.example/mcp',
          authorizationState: 'configured',
          healthStatus: 'reachable',
          providerStatus: 'matched',
          qualificationStatus: 'qualified',
          diagnostics: [],
        },
      ],
    });

    expect(JSON.stringify(projection)).not.toContain('secret');
    expect(() =>
      parseAutomationEndpointManagementProjection({
        ...projection,
        endpoints: [{ ...projection.endpoints[0], authorization: 'secret' }],
      }),
    ).toThrow('unsupported or missing fields');
  });

  it('strictly binds mutation routes to exact endpoint identities', () => {
    expect(
      parseAutomationEndpointManagementHostRequest({
        requestId: 'request-1',
        identity: { windowId: 'window-1' },
        route: 'endpoint.remove',
        connectorId: 'browser-use.observe.endpoint',
        endpointId: 'endpoint-1',
      }),
    ).toMatchObject({ route: 'endpoint.remove', endpointId: 'endpoint-1' });
  });
});
