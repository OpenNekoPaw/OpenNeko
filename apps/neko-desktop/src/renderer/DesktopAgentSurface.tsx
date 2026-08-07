import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import type { AgentLaunchCatalogProjection, AgentRootPresentation } from '@neko/agent-contracts';
import type { DesktopAgentBootstrapProjection } from '../shared/agent-contract';
import type { DesktopProjectTabProjection } from '@neko/host/desktop-shell-contract';
import {
  createElectronAgentHostRuntimeAdapter,
  type ElectronAgentHostRuntimeAdapter,
} from './desktop-agent-host-runtime-adapter';
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
  | {
      readonly kind: 'ready';
      readonly connectionKey: string;
      readonly adapter: DesktopAgentSurfaceRuntimeAdapter;
      readonly agentPresentation?: AgentRootPresentation;
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly initialInput?: { readonly id: string; readonly value: string };
    }
  | { readonly kind: 'unavailable'; readonly connectionKey: string; readonly message: string }
  | { readonly kind: 'error'; readonly connectionKey: string; readonly message: string };

type DesktopAgentSurfaceRuntimeAdapter =
  ElectronAgentHostRuntimeAdapter | ElectronAgentLaunchHostRuntimeAdapter;

export type DesktopAgentSurfaceProps =
  | {
      readonly binding: 'workspace';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly initialInput?: { readonly id: string; readonly value: string };
      readonly tab: DesktopProjectTabProjection;
      readonly agentPresentation?: AgentRootPresentation;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
    }
  | {
      readonly binding: 'launch';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly agentPresentation: AgentRootPresentation;
      readonly viewId: string;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
    };

export function DesktopAgentSurface(props: DesktopAgentSurfaceProps): JSX.Element {
  const [state, setState] = useState<DesktopAgentSurfaceState>({ kind: 'loading' });
  const { locale, t } = useTranslation();
  const viewId = props.binding === 'workspace' ? props.tab.viewId : props.viewId;
  const projectId = props.binding === 'workspace' ? props.tab.projectId : undefined;
  const agentPresentation = props.agentPresentation;
  const binding = props.binding;
  const connectionKey = createDesktopAgentConnectionKey(props);

  useEffect(() => {
    let active = true;
    let bootstrapOperation: Promise<DesktopAgentBootstrapProjection | AgentLaunchCatalogProjection>;
    if (agentPresentation?.kind === 'draft') {
      bootstrapOperation = Promise.all([
        loadDesktopAgentWebviewRootModule(),
        window.openNekoDesktop.agentLaunch.attach(
          props.workbenchInstanceId,
          props.agentSurfaceId,
          viewId,
          agentPresentation.scope,
        ),
      ]).then(([, catalog]) => catalog);
    } else if (binding === 'workspace') {
      if (projectId === undefined) {
        throw new Error('Workspace-bound Agent requires a Project identity.');
      }
      bootstrapOperation = prepareDesktopAgentSurfaceResources({
        loadModule: loadDesktopAgentWebviewRootModule,
        getBootstrap: () =>
          window.openNekoDesktop.agent.getBootstrap(
            props.workbenchInstanceId,
            props.agentSurfaceId,
            projectId,
            viewId,
            agentPresentation?.kind === 'session'
              ? agentPresentation.conversationId
              : props.initialConversation?.id,
          ),
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
              props.workbenchInstanceId,
              props.agentSurfaceId,
              assistantSpaceId,
              sessionPresentation.conversationId,
              viewId,
            ),
        });
      }
    } else {
      throw new Error('Launch-bound Agent requires a Draft or Assistant session presentation.');
    }
    void bootstrapOperation
      .then((bootstrap) => {
        if (!active) {
          if (!('status' in bootstrap)) {
            reportCleanupFailure(window.openNekoDesktop.agentLaunch.detach(bootstrap.connection));
          } else if (bootstrap.status === 'ready') {
            reportCleanupFailure(window.openNekoDesktop.agent.detach(bootstrap.connection));
          }
          return;
        }
        if ('status' in bootstrap && bootstrap.status === 'unavailable') {
          setState({
            kind: 'unavailable',
            connectionKey,
            message: bootstrap.diagnostic.message,
          });
          return;
        }
        if (!('status' in bootstrap)) {
          if (agentPresentation?.kind !== 'draft') {
            throw new Error('Agent launch adapter requires a Draft presentation.');
          }
          const launchAdapter = createElectronAgentLaunchHostRuntimeAdapter({
            bridge: window.openNekoDesktop,
            catalog: bootstrap,
            draftId: agentPresentation.draftId,
          });
          setState({
            kind: 'ready',
            connectionKey,
            adapter: launchAdapter,
            ...(agentPresentation ? { agentPresentation } : {}),
            ...(props.binding === 'workspace' && props.initialConversation
              ? { initialConversation: props.initialConversation }
              : {}),
            ...(props.binding === 'workspace' && props.initialInput
              ? { initialInput: props.initialInput }
              : {}),
          });
          return;
        }
        setState({
          kind: 'ready',
          connectionKey,
          adapter: createElectronAgentHostRuntimeAdapter({
            bridge: window.openNekoDesktop,
            bootstrap,
          }),
          ...(agentPresentation ? { agentPresentation } : {}),
          ...(props.binding === 'workspace' && props.initialConversation
            ? { initialConversation: props.initialConversation }
            : {}),
          ...(props.binding === 'workspace' && props.initialInput
            ? { initialInput: props.initialInput }
            : {}),
        });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ kind: 'error', connectionKey, message: describeError(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [binding, connectionKey, projectId, viewId]);

  const activeAdapter = state.kind === 'ready' ? state.adapter : undefined;
  let content: JSX.Element;
  if (state.kind === 'loading') {
    content = <AgentSurfaceStatus message={t('agent.connecting')} />;
  } else if (
    state.connectionKey === connectionKey &&
    (state.kind === 'unavailable' || state.kind === 'error')
  ) {
    content = <AgentSurfaceStatus message={state.message} error />;
  } else if (state.kind !== 'ready') {
    content = <AgentSurfaceStatus message={t('agent.connecting')} />;
  } else {
    const connectionReady = state.connectionKey === connectionKey;
    content = (
      <>
        <div
          className="desktop-agent-root"
          data-owner-root="agent"
          data-view-id={viewId}
          hidden={!connectionReady}
        >
          <Suspense fallback={<AgentSurfaceStatus message={t('agent.loading')} />}>
            <AgentWebviewRoot
              hostRuntimeAdapter={state.adapter}
              agentPresentation={state.agentPresentation}
              composerWorkspace={props.composerWorkspace}
              initialConversation={
                state.agentPresentation?.kind === 'session'
                  ? { id: state.agentPresentation.conversationId, title: '' }
                  : state.initialConversation
              }
              initialInput={state.initialInput}
              locale={locale}
              presentation="desktop-dock"
            />
          </Suspense>
        </div>
        {connectionReady ? null : <AgentSurfaceStatus message={t('agent.connecting')} />}
      </>
    );
  }
  return (
    <>
      {content}
      <DesktopAgentAdapterDisposer adapter={activeAdapter} />
    </>
  );
}

function DesktopAgentAdapterDisposer({
  adapter,
}: {
  readonly adapter: DesktopAgentSurfaceRuntimeAdapter | undefined;
}): null {
  const disposals = useRef(new Map<DesktopAgentSurfaceRuntimeAdapter, { cancelled: boolean }>());
  useEffect(() => {
    if (!adapter) return;
    const scheduled = disposals.current.get(adapter);
    if (scheduled) {
      scheduled.cancelled = true;
      disposals.current.delete(adapter);
    }
    return () => {
      const disposal = { cancelled: false };
      disposals.current.set(adapter, disposal);
      // StrictMode replays setup after cleanup in the same turn; child cleanup also finishes first.
      queueMicrotask(() => {
        if (disposal.cancelled || disposals.current.get(adapter) !== disposal) return;
        disposals.current.delete(adapter);
        reportCleanupFailure(adapter.dispose());
      });
    };
  }, [adapter]);
  return null;
}

function createDesktopAgentSurfaceKey(props: DesktopAgentSurfaceProps): string {
  const viewId = props.binding === 'workspace' ? props.tab.viewId : props.viewId;
  const presentation = props.agentPresentation;
  if (!presentation) {
    if (props.binding !== 'workspace') {
      throw new Error('Launch-bound Agent requires an explicit presentation identity.');
    }
    return ['workspace', props.tab.projectId, viewId, 'implicit-session'].join(':');
  }
  const scope =
    presentation.scope.kind === 'unbound'
      ? ['unbound', presentation.scope.draftId]
      : presentation.scope.kind === 'assistant'
        ? ['assistant', presentation.scope.assistantSpaceId]
        : ['workspace', presentation.scope.workspaceId, presentation.scope.workspaceGrantId];
  return [
    props.workbenchInstanceId,
    props.agentSurfaceId,
    props.binding,
    viewId,
    presentation.kind,
    presentation.kind === 'session' ? presentation.conversationId : presentation.draftId,
    ...scope,
  ].join(':');
}

function createDesktopAgentConnectionKey(props: DesktopAgentSurfaceProps): string {
  return createDesktopAgentSurfaceKey(props);
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
