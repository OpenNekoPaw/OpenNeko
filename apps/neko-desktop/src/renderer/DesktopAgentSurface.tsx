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
import type { AgentEntryScopeActions } from '@neko/agent-webview/root';

const AgentWebviewRoot = lazy(() =>
  loadDesktopAgentWebviewRootModule().then((module) => ({ default: module.AgentWebviewRoot })),
);

type DesktopAgentSurfaceState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly connectionKey: string;
      readonly adapter: AgentHostRuntimeAdapter;
      readonly agentPresentation?: AgentRootPresentation;
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly initialInput?: { readonly id: string; readonly value: string };
    }
  | { readonly kind: 'unavailable'; readonly connectionKey: string; readonly message: string }
  | { readonly kind: 'error'; readonly connectionKey: string; readonly message: string };

type DesktopAgentSurfaceProps =
  | {
      readonly binding: 'workspace';
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly initialInput?: { readonly id: string; readonly value: string };
      readonly tab: DesktopProjectTabProjection;
      readonly agentPresentation?: AgentRootPresentation;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
      readonly entryScopeActions?: AgentEntryScopeActions;
    }
  | {
      readonly binding: 'launch';
      readonly agentPresentation: AgentRootPresentation;
      readonly viewId: string;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
      readonly entryScopeActions?: AgentEntryScopeActions;
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
  const connectionKey = createDesktopAgentConnectionKey(props);

  useEffect(() => {
    let active = true;
    let bootstrapOperation: Promise<DesktopAgentBootstrapProjection | AgentLaunchCatalogProjection>;
    if (binding === 'workspace') {
      if (projectId === undefined || viewEpoch === undefined) {
        throw new Error('Workspace-bound Agent requires Project and View epoch identities.');
      }
      bootstrapOperation = prepareDesktopAgentSurfaceResources({
        loadModule: loadDesktopAgentWebviewRootModule,
        getBootstrap: () => window.openNekoDesktop.agent.getBootstrap(projectId, viewId, viewEpoch),
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
          setState({
            kind: 'unavailable',
            connectionKey,
            message: bootstrap.diagnostic.message,
          });
          return;
        }
        if (!('status' in bootstrap)) {
          const launchAdapter = createElectronAgentLaunchHostRuntimeAdapter({
            bridge: window.openNekoDesktop,
            catalog: bootstrap,
          });
          const previous = launchAdapterRef.current;
          launchAdapterRef.current = launchAdapter;
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
          if (previous) reportCleanupFailure(previous.dispose());
          return;
        }
        const previous = launchAdapterRef.current;
        launchAdapterRef.current = undefined;
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
        if (previous) reportCleanupFailure(previous.dispose());
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ kind: 'error', connectionKey, message: describeError(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [binding, connectionKey, projectId, viewEpoch, viewId]);

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
  if (
    state.connectionKey === connectionKey &&
    (state.kind === 'unavailable' || state.kind === 'error')
  ) {
    return <AgentSurfaceStatus message={state.message} error />;
  }
  if (state.kind !== 'ready') {
    return <AgentSurfaceStatus message={t('agent.connecting')} />;
  }
  const connectionReady = state.connectionKey === connectionKey;
  return (
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
            entryScopeActions={props.entryScopeActions}
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

function createDesktopAgentConnectionKey(props: DesktopAgentSurfaceProps): string {
  const viewId = props.binding === 'workspace' ? props.tab.viewId : props.viewId;
  const viewEpoch = props.binding === 'workspace' ? props.tab.viewEpoch : 'launch';
  const presentation = props.agentPresentation;
  if (!presentation) {
    if (props.binding !== 'workspace') {
      throw new Error('Launch-bound Agent requires an explicit presentation identity.');
    }
    return ['workspace', props.tab.projectId, viewId, viewEpoch, 'implicit-session'].join(':');
  }
  const scope =
    presentation.scope.kind === 'unbound'
      ? ['unbound', presentation.scope.draftId]
      : presentation.scope.kind === 'assistant'
        ? ['assistant', presentation.scope.assistantSpaceId]
        : ['workspace', presentation.scope.workspaceId, presentation.scope.workspaceGrantId];
  return [
    props.binding,
    viewId,
    viewEpoch,
    presentation.kind,
    presentation.kind === 'session' ? presentation.conversationId : presentation.draftId,
    ...scope,
  ].join(':');
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
