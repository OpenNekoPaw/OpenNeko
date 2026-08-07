import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import { lazy, Suspense } from 'react';

const AgentExtensionManagementRoot = lazy(async () => {
  const module = await import('@neko/agent-webview/extension-management/root');
  return { default: module.AgentExtensionManagementRoot };
});

export function DesktopExtensionManagementSurface({
  interactive,
  runtime,
}: {
  readonly interactive: boolean;
  readonly runtime: AgentExtensionManagementRuntime;
}): JSX.Element {
  return (
    <Suspense fallback={null}>
      <AgentExtensionManagementRoot
        confirmAction={(message) => window.confirm(message)}
        interactive={interactive}
        runtime={runtime}
      />
    </Suspense>
  );
}
