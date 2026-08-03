import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import type {
  AgentHostRuntimeAdapter,
  AgentLaunchCatalogProjection,
  AgentRootPresentation,
} from '@neko/agent-contracts';
import type { DesktopAgentBootstrapProjection } from '../shared/agent-contract';
import type { DesktopProjectTabProjection } from '@neko/host/desktop-shell-contract';
import { createElectronAgentHostRuntimeAdapter } from './desktop-agent-host-runtime-adapter';
import {
  createElectronAgentLaunchHostRuntimeAdapter,
  type ElectronAgentLaunchHostRuntimeAdapter,
} from './desktop-agent-launch-host-runtime-adapter';
import { loadDesktopAgentWebviewRootModule } from './desktop-agent-module';
import type { AgentComposerWorkspacePresentation } from '@neko/agent-webview/root';

const AgentWebviewRoot = lazy(() =>
  loadDesktopAgentWebviewRootModule().then((module) => ({ default: module.AgentWebviewRoot })),
);

type DesktopAgentSurfaceState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly adapter: AgentHostRuntimeAdapter }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

type DesktopAgentSurfaceProps =
  | {
      readonly binding: 'workspace';
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly initialInput?: { readonly id: string; readonly value: string };
      readonly tab: DesktopProjectTabProjection;
      readonly agentPresentation?: AgentRootPresentation;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
    }
  | {
      readonly binding: 'launch';
      readonly agentPresentation: AgentRootPresentation;
      readonly viewId: string;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
    };

export function DesktopAgentSurface(props: DesktopAgentSurfaceProps): JSX.Element {
  const [state, setState] = useState<DesktopAgentSurfaceState>({ kind: 'loading' });
  const launchAdapterRef = useRef<ElectronAgentLaunchHostRuntimeAdapter>();
  const { locale, t } = useTranslation();
  const viewId = props.binding === 'workspace' ? props.tab.viewId : props.viewId;
  const viewEpoch = props.binding === 'workspace' ? props.tab.viewEpoch : undefined;
  const projectId = props.binding === 'workspace' ? props.tab.projectId : undefined;
  const agentPresentation = props.agentPresentation;
  const binding = props.binding;

  useEffect(() => {
    let active = true;
    let bootstrapOperation: Promise<DesktopAgentBootstrapProjection | AgentLaunchCatalogProjection>;
    if (binding === 'workspace') {
      if (projectId === undefined || viewEpoch === undefined) {
        throw new Error('Workspace-bound Agent requires Project and View epoch identities.');
      }
      bootstrapOperation = prepareDesktopAgentSurfaceResources({
        loadModule: loadDesktopAgentWebviewRootModule,
        getBootstrap: () =>
          window.openNekoDesktop.agent.getBootstrap(projectId, viewId, viewEpoch),
      });
    } else if (agentPresentation === undefined) {
      throw new Error('Launch-bound Agent requires an explicit presentation.');
    } else if (agentPresentation.kind === 'session') {
      const sessionPresentation = agentPresentation;
      if (sessionPresentation.scope.kind !== 'assistant') {
        bootstrapOperation = Promise.reject(
          new Error('Launch-bound Agent session requires Assistant scope.'),
        );
      } else {
        const assistantSpaceId = sessionPresentation.scope.assistantSpaceId;
        bootstrapOperation = prepareDesktopAgentSurfaceResources({
          loadModule: loadDesktopAgentWebviewRootModule,
          getBootstrap: () =>
            window.openNekoDesktop.agent.getAssistantBootstrap(
              assistantSpaceId,
              sessionPresentation.conversationId,
              viewId,
            ),
        });
      }
    } else {
      bootstrapOperation = Promise.all([
        loadDesktopAgentWebviewRootModule(),
        window.openNekoDesktop.agentLaunch.attach(viewId, agentPresentation.scope),
      ]).then(([, catalog]) => catalog);
    }
    void bootstrapOperation
      .then((bootstrap) => {
        if (!active) {
          if (!('status' in bootstrap)) {
            reportCleanupFailure(window.openNekoDesktop.agentLaunch.detach(bootstrap.connection));
          }
          return;
        }
        if ('status' in bootstrap && bootstrap.status === 'unavailable') {
          setState({ kind: 'unavailable', message: bootstrap.diagnostic.message });
          return;
        }
        if (!('status' in bootstrap)) {
          const launchAdapter = createElectronAgentLaunchHostRuntimeAdapter({
            bridge: window.openNekoDesktop,
            catalog: bootstrap,
          });
          const previous = launchAdapterRef.current;
          launchAdapterRef.current = launchAdapter;
          setState({ kind: 'ready', adapter: launchAdapter });
          if (previous) reportCleanupFailure(previous.dispose());
          return;
        }
        const previous = launchAdapterRef.current;
        launchAdapterRef.current = undefined;
        setState({
          kind: 'ready',
          adapter: createElectronAgentHostRuntimeAdapter({
            bridge: window.openNekoDesktop,
            bootstrap,
          }),
        });
        if (previous) reportCleanupFailure(previous.dispose());
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: describeError(error) });
      });
    return () => {
      active = false;
    };
  }, [agentPresentation, binding, projectId, viewEpoch, viewId]);

  useEffect(
    () => () => {
      const adapter = launchAdapterRef.current;
      launchAdapterRef.current = undefined;
      if (adapter) reportCleanupFailure(adapter.dispose());
    },
    [],
  );

  if (state.kind === 'loading') {
    return <AgentSurfaceStatus message={t('agent.connecting')} />;
  }
  if (state.kind === 'unavailable' || state.kind === 'error') {
    return <AgentSurfaceStatus message={state.message} error />;
  }
  return (
    <div className="desktop-agent-root" data-owner-root="agent" data-view-id={viewId}>
      <Suspense fallback={<AgentSurfaceStatus message={t('agent.loading')} />}>
        <AgentWebviewRoot
          hostRuntimeAdapter={state.adapter}
          agentPresentation={props.agentPresentation}
          composerWorkspace={props.composerWorkspace}
          initialConversation={
            props.binding === 'workspace'
              ? props.initialConversation
              : props.agentPresentation.kind === 'session'
                ? { id: props.agentPresentation.conversationId, title: '' }
                : undefined
          }
          initialInput={props.binding === 'workspace' ? props.initialInput : undefined}
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

function reportCleanupFailure(operation: Promise<void>): void {
  void operation.catch((error: unknown) => {
    queueMicrotask(() => {
      throw error;
    });
  });
}
