import { describe, expect, it, vi } from 'vitest';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';

describe('DesktopExtensionManagementRuntime', () => {
  it('projects the exact owner session and fails visibly after disposal', async () => {
    const execute = vi.fn(async (request) => ({
      schemaVersion: 1 as const,
      requestId: request.requestId,
      route: request.route,
      projection: {
        identity: request.identity,
        catalogRevision: `sha256:${'a'.repeat(64)}`,
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [],
        extensionDiscovery: { diagnostics: [] },
      },
    }));
    const runtime = new DesktopExtensionManagementRuntime(
      { extensionManagementSessionId: 'extension-management:1', windowId: 'window-1' },
      'endpoint-1',
      {
        extensionManagement: { execute },
      },
    );
    await expect(runtime.getSnapshot()).resolves.toMatchObject({
      identity: { extensionManagementSessionId: 'extension-management:1', windowId: 'window-1' },
    });
    runtime.dispose();
    await expect(runtime.getSnapshot()).rejects.toThrow('disposed');
  });
});
