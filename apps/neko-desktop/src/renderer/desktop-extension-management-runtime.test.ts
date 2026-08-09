import { describe, expect, it, vi } from 'vitest';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';

describe('DesktopExtensionManagementRuntime', () => {
  it('projects the exact owner Window and fails visibly after disposal', async () => {
    const execute = vi.fn(async (request) => ({
      requestId: request.requestId,
      route: request.route,
      projection: {
        identity: request.identity,
        operations: [],
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
    await runtime.enablePlugin('computer-use@openneko');
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        route: 'plugin.enable',
        pluginId: 'computer-use@openneko',
        identity: { windowId: 'window-1' },
      }),
    );
    await runtime.updatePlugin('computer-use@openneko');
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        route: 'plugin.update',
        pluginId: 'computer-use@openneko',
        identity: { windowId: 'window-1' },
      }),
    );
    await runtime.cancelPluginOperation('artifact-operation-1');
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        route: 'plugin.operation.cancel',
        operationId: 'artifact-operation-1',
        identity: { windowId: 'window-1' },
      }),
    );
    runtime.dispose();
    await expect(runtime.getSnapshot()).rejects.toThrow('disposed');
  });
});
