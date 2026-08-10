import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import { lazy, Suspense, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DesktopAutomationEndpointManagementRuntime } from './desktop-automation-endpoint-management-runtime';
import { DesktopAutomationPermissionManagementRuntime } from './desktop-automation-permission-management-runtime';
import { WorkbenchMainPanelSurface } from './WorkbenchMainPanelSurface';

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
  detailLabel,
  detailTarget,
  interactive,
  onDetailVisibilityChange,
  runtime,
}: {
  readonly detailLabel: string;
  readonly detailTarget: Element | undefined;
  readonly interactive: boolean;
  readonly onDetailVisibilityChange: (visible: boolean) => void;
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
          onDetailVisibilityChange={onDetailVisibilityChange}
          renderDetail={({ content, tab }) =>
            detailTarget
              ? createPortal(
                  <WorkbenchMainPanelSurface
                    label={detailLabel}
                    panelId="extension-detail"
                    role="detail"
                    size="compact"
                  >
                    <div
                      className="desktop-extension-configuration-composition"
                      data-extension-configuration-kind={tab}
                    >
                      {content}
                      {tab === 'extensions' ? (
                        <>
                          <AutomationEndpointManagementRoot
                            confirmAction={(message) => window.confirm(message)}
                            interactive={interactive}
                            runtime={endpointRuntime}
                          />
                          <AutomationPermissionManagementRoot
                            interactive={interactive}
                            runtime={permissionRuntime}
                          />
                        </>
                      ) : null}
                    </div>
                  </WorkbenchMainPanelSurface>,
                  detailTarget,
                )
              : null
          }
          runtime={runtime}
        />
      </div>
    </Suspense>
  );
}
