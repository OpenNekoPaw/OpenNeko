import { describe, expect, it, vi } from 'vitest';
import { DesktopAutomationLocalRuntimeManagementRuntime } from './desktop-automation-local-runtime-management-runtime';

describe('DesktopAutomationLocalRuntimeManagementRuntime', () => {
  it('sends only opaque source/asset/runtime identities through the typed bridge', async () => {
    const execute = vi.fn(async (request) => ({
      requestId: request.requestId,
      route: request.route,
      projection: { identity: { windowId: 'window-1' }, runtimes: [] },
    }));
    const runtime = new DesktopAutomationLocalRuntimeManagementRuntime(
      { windowId: 'window-1' },
      { automationLocalRuntimes: { execute } },
    );

    await runtime.authorizeAsset('browser-use.observe.local', 'provider-runtime');
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { windowId: 'window-1' },
        route: 'asset.authorize',
        sourceId: 'browser-use.observe.local',
        assetKey: 'provider-runtime',
      }),
    );
    expect(JSON.stringify(execute.mock.calls)).not.toContain('/');
  });
});
