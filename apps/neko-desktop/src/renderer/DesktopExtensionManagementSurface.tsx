import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import { lazy, Suspense, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DesktopAutomationLocalRuntimeManagementRuntime } from './desktop-automation-local-runtime-management-runtime';
import { DesktopAutomationPermissionManagementRuntime } from './desktop-automation-permission-management-runtime';
import { WorkbenchMainPanelSurface } from './WorkbenchMainPanelSurface';

const AgentExtensionManagementRoot = lazy(async () => {
  const module = await import('@neko/agent-webview/extension-management/root');
  return { default: module.AgentExtensionManagementRoot };
});

const AutomationLocalRuntimeManagementRoot = lazy(async () => {
  const module = await import('@neko/automation-webview/local-runtime-management/root');
  return { default: module.AutomationLocalRuntimeManagementRoot };
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
  const localRuntime = useMemo(
    () => new DesktopAutomationLocalRuntimeManagementRuntime(identity, window.openNekoDesktop),
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
          renderDetail={({ content, selectedItemId, tab }) =>
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
                      {tab === 'extensions' && selectedItemId === 'browser-use@openneko' ? (
                        <AutomationLocalRuntimeManagementRoot
                          confirmAction={(message) => window.confirm(message)}
                          interactive={interactive}
                          runtime={localRuntime}
                          sourceId="browser-use.observe.local"
                        />
                      ) : null}
                      {tab === 'extensions' && selectedItemId === 'computer-use@openneko' ? (
                        <>
                          <AutomationLocalRuntimeManagementRoot
                            confirmAction={(message) => window.confirm(message)}
                            interactive={interactive}
                            runtime={localRuntime}
                            sourceId="computer-use.observe.local"
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
