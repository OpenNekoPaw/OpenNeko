// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import type { AutomationEndpointManagementRuntime } from '@neko/automation-contracts/endpoint-management';
import type { AutomationPermissionManagementRuntime } from '@neko/automation-contracts/permission-management';
import { DesktopExtensionManagementSurface } from './DesktopExtensionManagementSurface';

let capturedEndpointRuntime: AutomationEndpointManagementRuntime | undefined;
let capturedPermissionRuntime: AutomationPermissionManagementRuntime | undefined;

vi.mock('@neko/agent-webview/extension-management/root', () => ({
  AgentExtensionManagementRoot: () => null,
}));

vi.mock('@neko/automation-webview/endpoint-management/root', () => ({
  AutomationEndpointManagementRoot: ({
    runtime,
  }: {
    readonly runtime: AutomationEndpointManagementRuntime;
  }) => {
    capturedEndpointRuntime = runtime;
    return null;
  },
}));

vi.mock('@neko/automation-webview/permission-management/root', () => ({
  AutomationPermissionManagementRoot: ({
    runtime,
  }: {
    readonly runtime: AutomationPermissionManagementRuntime;
  }) => {
    capturedPermissionRuntime = runtime;
    return null;
  },
}));

describe('DesktopExtensionManagementSurface', () => {
  it('keeps the endpoint runtime usable through React StrictMode lifecycle replay', async () => {
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        automationEndpoints: {
          execute: vi.fn(async (request) => ({
            requestId: request.requestId,
            route: request.route,
            projection: { identity: request.identity, endpoints: [] },
          })),
        },
        automationPermissions: {
          execute: vi.fn(async (request) => ({
            requestId: request.requestId,
            route: request.route,
            projection: { identity: request.identity, permissions: [] },
          })),
        },
      },
    });
    const runtime = { identity: { windowId: 'window-1' } } as AgentExtensionManagementRuntime;

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <StrictMode>
          <DesktopExtensionManagementSurface interactive runtime={runtime} />
        </StrictMode>,
      );
    });

    expect(capturedEndpointRuntime).toBeDefined();
    await expect(capturedEndpointRuntime?.getSnapshot()).resolves.toMatchObject({
      identity: { windowId: 'window-1' },
      endpoints: [],
    });
    expect(capturedPermissionRuntime).toBeDefined();
    await expect(capturedPermissionRuntime?.getSnapshot()).resolves.toMatchObject({
      identity: { windowId: 'window-1' },
      permissions: [],
    });
    act(() => root.unmount());
  });
});
