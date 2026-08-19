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
        skills: [],
        mcp: [
          {
            id: 'browser-use',
            name: 'Browser Use',
            description: 'Official contribution.',
            status: 'unsupported' as const,
            diagnosticCode: 'dsh-mcp-management-api-unavailable',
          },
        ],
        diagnostics: [{ code: 'mcp_management_unsupported' as const, count: 1 }],
      },
    }));
    const runtime = new DesktopExtensionManagementRuntime(
      { windowId: 'window-1' },
      { extensionManagement: { execute } },
    );
    await expect(runtime.getSnapshot()).resolves.toMatchObject({
      mcp: [{ id: 'browser-use', status: 'unsupported' }],
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
