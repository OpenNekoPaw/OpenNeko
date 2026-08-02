import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import type { AgentHostRuntimeAdapter } from '@neko/agent-contracts';
import type { DesktopAgentBootstrapProjection } from '../shared/agent-contract';
import type { DesktopProjectTabProjection } from '../shared/shell-contract';
import { createElectronAgentHostRuntimeAdapter } from './desktop-agent-host-runtime-adapter';
import { loadDesktopAgentWebviewRootModule } from './desktop-agent-module';

const AgentWebviewRoot = lazy(() =>
  loadDesktopAgentWebviewRootModule().then((module) => ({ default: module.AgentWebviewRoot })),
);

type DesktopAgentSurfaceState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly adapter: AgentHostRuntimeAdapter }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export function DesktopAgentSurface({
  initialConversation,
  initialInput,
  tab,
}: {
  readonly initialConversation?: { readonly id: string; readonly title: string };
  readonly initialInput?: { readonly id: string; readonly value: string };
  readonly tab: DesktopProjectTabProjection;
}): JSX.Element {
  const [state, setState] = useState<DesktopAgentSurfaceState>({ kind: 'loading' });
  const { locale, t } = useTranslation();

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    void prepareDesktopAgentSurfaceResources({
      loadModule: loadDesktopAgentWebviewRootModule,
      getBootstrap: () =>
        window.openNekoDesktop.agent.getBootstrap(tab.projectId, tab.viewId, tab.viewEpoch),
    })
      .then((bootstrap) => {
        if (!active) return;
        if (bootstrap.status === 'unavailable') {
          setState({ kind: 'unavailable', message: bootstrap.diagnostic.message });
          return;
        }
        setState({
          kind: 'ready',
          adapter: createElectronAgentHostRuntimeAdapter({
            bridge: window.openNekoDesktop,
            bootstrap,
          }),
        });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: describeError(error) });
      });
    return () => {
      active = false;
    };
  }, [tab.projectId, tab.viewEpoch, tab.viewId]);

  if (state.kind === 'loading') {
    return <AgentSurfaceStatus message={t('agent.connecting')} />;
  }
  if (state.kind === 'unavailable' || state.kind === 'error') {
    return <AgentSurfaceStatus message={state.message} error />;
  }
  return (
    <div className="desktop-agent-root" data-owner-root="agent" data-view-id={tab.viewId}>
      <Suspense fallback={<AgentSurfaceStatus message={t('agent.loading')} />}>
        <AgentWebviewRoot
          hostRuntimeAdapter={state.adapter}
          initialConversation={initialConversation}
          initialInput={initialInput}
          locale={locale}
          presentation="desktop-dock"
        />
      </Suspense>
    </div>
  );
}

export async function prepareDesktopAgentSurfaceResources(input: {
  readonly loadModule: () => Promise<unknown>;
  readonly getBootstrap: () => Promise<DesktopAgentBootstrapProjection>;
}): Promise<DesktopAgentBootstrapProjection> {
  const [, bootstrap] = await Promise.all([input.loadModule(), input.getBootstrap()]);
  return bootstrap;
}

function AgentSurfaceStatus({
  message,
  error = false,
}: {
  readonly message: string;
  readonly error?: boolean;
}): JSX.Element {
  return (
    <div className={`desktop-agent-status ${error ? 'is-error' : ''}`} role="status">
      {message}
    </div>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
