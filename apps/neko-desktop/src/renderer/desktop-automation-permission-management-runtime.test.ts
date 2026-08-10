import { describe, expect, it, vi } from 'vitest';
import { DesktopAutomationPermissionManagementRuntime } from './desktop-automation-permission-management-runtime';

describe('DesktopAutomationPermissionManagementRuntime', () => {
  it('routes only exact permission snapshot and request operations', async () => {
    const execute = vi.fn(async (request) => ({
      requestId: request.requestId,
      route: request.route,
      projection: { identity: request.identity, permissions: [] },
    }));
    const runtime = new DesktopAutomationPermissionManagementRuntime(
      { windowId: 'window-1' },
      { automationPermissions: { execute } },
    );

    await runtime.getSnapshot();
    await runtime.request('screen-recording');

    expect(execute.mock.calls.map(([request]) => request.route)).toEqual([
      'snapshot.get',
      'permission.request',
    ]);
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      permission: 'screen-recording',
      identity: { windowId: 'window-1' },
    });
  });
});
