import { describe, expect, it } from 'vitest';
import {
  parseAutomationLocalRuntimeManagementHostRequest,
  parseAutomationLocalRuntimeManagementProjection,
} from './local-runtime-management';

describe('Automation local runtime management contracts', () => {
  it('projects only opaque runtime identities and rejects Host paths', () => {
    const projection = parseAutomationLocalRuntimeManagementProjection({
      identity: { windowId: 'window-1' },
      runtimes: [
        {
          sourceId: 'browser-use.observe.local',
          displayName: 'Browser Use 0.13.7',
          providerKind: 'browser',
          installationGuideUrl: 'https://pypi.org/project/browser-use/0.13.7/',
          installationCommand: 'uvx browser-use --mcp',
          authorized: true,
          runtimeId: 'local-runtime:browser-1',
          state: 'ready',
          assets: [
            {
              key: 'provider-runtime',
              label: 'Browser Use runtime',
              authorized: true,
              runtimeId: 'local-runtime-asset:browser-runtime-1',
              displayName: 'browser-use',
              status: 'valid',
            },
            {
              key: 'browser-executable',
              label: 'Browser executable',
              authorized: true,
              runtimeId: 'local-runtime-asset:browser-executable-1',
              displayName: 'Chromium',
              status: 'valid',
            },
          ],
          diagnostics: [],
        },
      ],
    });

    expect(JSON.stringify(projection)).not.toContain('/Applications');
    expect(JSON.stringify(projection)).not.toContain('/Users');
    expect(() =>
      parseAutomationLocalRuntimeManagementProjection({
        ...projection,
        runtimes: [{ ...projection.runtimes[0], path: '/Applications/CuaDriver.app' }],
      }),
    ).toThrow('unsupported or missing fields');
  });

  it('binds recheck and disconnect to the exact opaque authorization', () => {
    const request = parseAutomationLocalRuntimeManagementHostRequest({
      requestId: 'request-1',
      identity: { windowId: 'window-1' },
      route: 'runtime.disconnect',
      sourceId: 'computer-use.observe.local',
      runtimeId: 'local-runtime:cua-1',
    });
    expect(request).toMatchObject({
      route: 'runtime.disconnect',
      runtimeId: 'local-runtime:cua-1',
    });
    expect(() =>
      parseAutomationLocalRuntimeManagementHostRequest({
        ...request,
        path: '/Applications/CuaDriver.app',
      }),
    ).toThrow('unsupported or missing fields');
  });

  it('rejects inconsistent missing and authorized states', () => {
    expect(() =>
      parseAutomationLocalRuntimeManagementProjection({
        identity: { windowId: 'window-1' },
        runtimes: [
          {
            sourceId: 'computer-use.observe.local',
            displayName: 'Cua Driver 0.19.2',
            providerKind: 'computer',
            installationGuideUrl: 'https://cua.ai/docs/cua-driver/installation',
            installationCommand: '/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"',
            authorized: false,
            runtimeId: '',
            state: 'ready',
            assets: [],
            diagnostics: [],
          },
        ],
      }),
    ).toThrow('state is inconsistent');
  });
});
