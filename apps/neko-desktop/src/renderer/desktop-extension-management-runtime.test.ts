import { describe, expect, it, vi } from 'vitest';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';

describe('DesktopExtensionManagementRuntime', () => {
  it('projects the exact owner Window and fails visibly after disposal', async () => {
    const execute = vi.fn(async (request) => ({
      requestId: request.requestId,
      route: request.route,
      projection: {
        identity: request.identity,
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [],
        extensionDiscovery: { diagnostics: [] },
      },
    }));
    const runtime = new DesktopExtensionManagementRuntime(
      { windowId: 'window-1' },
      {
        extensionManagement: { execute },
      },
    );
    await expect(runtime.getSnapshot()).resolves.toMatchObject({
      identity: { windowId: 'window-1' },
    });
    runtime.dispose();
    await expect(runtime.getSnapshot()).rejects.toThrow('disposed');
  });
});
