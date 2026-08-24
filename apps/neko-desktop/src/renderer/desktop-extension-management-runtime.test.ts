import { describe, expect, it, vi } from 'vitest';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';
import type { AgentExtensionManagementHostRequest } from '@neko/agent-contracts/extension-management-host';

describe('DesktopExtensionManagementRuntime', () => {
  it('reads the DSH-owned projection without exposing mutation commands', async () => {
    const execute = vi.fn(async (request: AgentExtensionManagementHostRequest) => ({
      requestId: 'request-1',
      route: request.route,
      projection: {
        identity: { windowId: 'window-1' },
        catalogScope: 'global' as const,
        skills: [],
        mcp: [],
        diagnostics: [],
      },
    }));
    const runtime = new DesktopExtensionManagementRuntime(
      { windowId: 'window-1' },
      { extensionManagement: { execute } },
    );
    await expect(runtime.getSnapshot()).resolves.toMatchObject({
      mcp: [],
      diagnostics: [],
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
