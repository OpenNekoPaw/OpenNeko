import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import { lazy, Suspense, useMemo } from 'react';
import { DesktopAutomationEndpointManagementRuntime } from './desktop-automation-endpoint-management-runtime';
import { DesktopAutomationPermissionManagementRuntime } from './desktop-automation-permission-management-runtime';

const AgentExtensionManagementRoot = lazy(async () => {
  const module = await import('@neko/agent-webview/extension-management/root');
  return { default: module.AgentExtensionManagementRoot };
});

const AutomationEndpointManagementRoot = lazy(async () => {
  const module = await import('@neko/automation-webview/endpoint-management/root');
  return { default: module.AutomationEndpointManagementRoot };
});

const AutomationPermissionManagementRoot = lazy(async () => {
  const module = await import('@neko/automation-webview/permission-management/root');
  return { default: module.AutomationPermissionManagementRoot };
});

export function DesktopExtensionManagementSurface({
  interactive,
  runtime,
}: {
  readonly interactive: boolean;
  readonly runtime: AgentExtensionManagementRuntime;
}): JSX.Element {
  const identity = runtime.identity;
  const endpointRuntime = useMemo(
    () => new DesktopAutomationEndpointManagementRuntime(identity, window.openNekoDesktop),
    [identity],
  );
  const permissionRuntime = useMemo(
    () => new DesktopAutomationPermissionManagementRuntime(identity, window.openNekoDesktop),
    [identity],
  );
  return (
    <Suspense fallback={null}>
      <div className="desktop-extension-management-composition">
        <AgentExtensionManagementRoot
          confirmAction={(message) => window.confirm(message)}
          interactive={interactive}
          runtime={runtime}
        />
        <AutomationEndpointManagementRoot
          confirmAction={(message) => window.confirm(message)}
          interactive={interactive}
          runtime={endpointRuntime}
        />
        <AutomationPermissionManagementRoot interactive={interactive} runtime={permissionRuntime} />
      </div>
    </Suspense>
  );
}
