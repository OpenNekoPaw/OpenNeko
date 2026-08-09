import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, RefreshIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import type { AgentInteractionProjection, AgentLaunchHostResult } from '@neko/agent-contracts';
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
      readonly agentPresentation?: AgentInteractionProjection;
      readonly initialConversation?: { readonly id: string; readonly title: string };
      readonly initialInput?: { readonly id: string; readonly value: string };
    }
  | {
      readonly kind: 'unavailable';
      readonly connectionKey: string;
      readonly reason: 'binding' | 'conversation' | 'runtime';
    }
  | { readonly kind: 'error'; readonly connectionKey: string };

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
      readonly agentPresentation?: AgentInteractionProjection;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
      readonly conversationFeed?: ReactNode;
    }
  | {
      readonly binding: 'launch';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly agentPresentation: AgentInteractionProjection;
      readonly viewId: string;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
      readonly conversationFeed?: ReactNode;
    };

export function DesktopAgentSurface(props: DesktopAgentSurfaceProps): JSX.Element {
  const [state, setState] = useState<DesktopAgentSurfaceState>({ kind: 'loading' });
  const [retryAttempt, setRetryAttempt] = useState(0);
  const { locale, t } = useTranslation();
  const viewId = props.binding === 'workspace' ? props.tab.viewId : props.viewId;
  const projectId = props.binding === 'workspace' ? props.tab.projectId : undefined;
  const agentPresentation = props.agentPresentation;
  const binding = props.binding;
  const connectionKey = createDesktopAgentConnectionKey(props);

  useEffect(() => {
    let active = true;
    let bootstrapOperation: Promise<
      | DesktopAgentBootstrapProjection
      | Extract<AgentLaunchHostResult, { readonly status: 'ready' | 'unavailable' }>
    >;
    if (agentPresentation?.phase === 'draft') {
      bootstrapOperation = Promise.all([
        loadDesktopAgentWebviewRootModule(),
        window.openNekoDesktop.agentLaunch.attach(
          props.workbenchInstanceId,
          props.agentSurfaceId,
          viewId,
          agentPresentation,
        ),
      ]).then(([, result]) => result);
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
            agentPresentation?.phase === 'session'
              ? agentPresentation.conversationId
              : props.initialConversation?.id,
          ),
      });
    } else if (agentPresentation === undefined) {
      throw new Error('Launch-bound Agent requires an explicit presentation.');
    } else if (agentPresentation.phase === 'session') {
      const sessionPresentation = agentPresentation;
      if (sessionPresentation.binding.kind !== 'assistant') {
        bootstrapOperation = Promise.reject(
          new Error('Launch-bound Agent session requires Assistant scope.'),
        );
      } else {
        const assistantSpaceId = sessionPresentation.binding.assistantSpaceId;
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
          if (bootstrap.status === 'ready' && 'catalog' in bootstrap) {
            reportCleanupFailure(
              window.openNekoDesktop.agentLaunch.detach(bootstrap.catalog.connection),
            );
          } else if (bootstrap.status === 'ready') {
            reportCleanupFailure(window.openNekoDesktop.agent.detach(bootstrap.connection));
          }
          return;
        }
        if (bootstrap.status === 'unavailable') {
          setState({
            kind: 'unavailable',
            connectionKey,
            reason:
              'owner' in bootstrap.diagnostic
                ? 'binding'
                : bootstrap.diagnostic.code === 'desktop-agent-conversation-unavailable'
                  ? 'conversation'
                  : 'runtime',
          });
          return;
        }
        if ('catalog' in bootstrap) {
          if (agentPresentation?.phase !== 'draft') {
            throw new Error('Agent launch adapter requires a Draft presentation.');
          }
          const catalog = bootstrap.catalog;
          const launchAdapter = createElectronAgentLaunchHostRuntimeAdapter({
            bridge: window.openNekoDesktop,
            catalog,
            draftId: agentPresentation.draftId,
          });
          setState({
            kind: 'ready',
            connectionKey,
            adapter: launchAdapter,
            agentPresentation: catalog.interaction,
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
      .catch(() => {
        if (active) {
          setState({ kind: 'error', connectionKey });
        }
      });
    return () => {
      active = false;
    };
  }, [binding, connectionKey, projectId, retryAttempt, viewId]);

  const activeAdapter = state.kind === 'ready' ? state.adapter : undefined;
  let content: JSX.Element;
  if (state.kind === 'loading') {
    content = <AgentSurfaceStatus message={t('agent.connecting')} />;
  } else if (
    state.connectionKey === connectionKey &&
    (state.kind === 'unavailable' || state.kind === 'error')
  ) {
    content = (
      <AgentSurfaceFailure
        detail={
          state.kind === 'unavailable'
            ? state.reason === 'binding'
              ? t('agent.unavailableDetail')
              : state.reason === 'conversation'
                ? t('agent.conversationUnavailableDetail')
              : t('agent.runtimeUnavailableDetail')
            : t('agent.connectionFailureDetail')
        }
        retryLabel={t('agent.retry')}
        title={t('agent.unavailable')}
        {...(state.kind === 'unavailable' && state.reason === 'conversation'
          ? {}
          : {
              onRetry: () => {
                setState({ kind: 'loading' });
                setRetryAttempt((attempt) => attempt + 1);
              },
            })}
      />
    );
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
                state.agentPresentation?.phase === 'session'
                  ? { id: state.agentPresentation.conversationId, title: '' }
                  : state.initialConversation
              }
              initialInput={state.initialInput}
              locale={locale}
              presentation="desktop-dock"
              conversationFeed={
                props.conversationFeed && state.agentPresentation?.phase === 'session'
                  ? {
                      conversationId: state.agentPresentation.conversationId,
                      content: props.conversationFeed,
                    }
                  : undefined
              }
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
  const scope = projectAgentBindingKey(presentation.binding);
  return [
    props.workbenchInstanceId,
    props.agentSurfaceId,
    props.binding,
    viewId,
    presentation.phase,
    presentation.phase === 'session' ? presentation.conversationId : presentation.draftId,
    ...scope,
  ].join(':');
}

function projectAgentBindingKey(binding: AgentInteractionProjection['binding']): readonly string[] {
  switch (binding.kind) {
    case 'unbound':
      return ['unbound'];
    case 'assistant':
      return ['assistant', binding.assistantSpaceId];
    case 'workspace':
      return ['workspace', binding.workspaceId, binding.workspaceGrantId];
    case 'character':
      return [
        'character',
        binding.characterId,
        binding.characterVersionId,
        binding.characterRunId ?? 'draft',
        binding.roleProfileId ?? binding.dialogueRunId ?? 'unqualified',
      ];
    case 'room':
      return ['room', binding.roomId, binding.roomRunId];
    case 'world':
      return [
        'world',
        binding.worldExperienceId,
        binding.worldExperienceVersionId,
        binding.worldRunId ?? 'draft',
        binding.participantId,
        binding.roleScopeId,
      ];
  }
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

function AgentSurfaceStatus({ message }: { readonly message: string }): JSX.Element {
  return (
    <div className="desktop-agent-status" role="status">
      {message}
    </div>
  );
}

function AgentSurfaceFailure({
  detail,
  onRetry,
  retryLabel,
  title,
}: {
  readonly detail: string;
  readonly onRetry?: () => void;
  readonly retryLabel: string;
  readonly title: string;
}): JSX.Element {
  return (
    <div className="desktop-agent-failure" role="alert">
      <div className="desktop-agent-failure__content">
        <strong>{title}</strong>
        <p>{detail}</p>
        {onRetry ? (
          <Button
            className="desktop-agent-failure__retry"
            leadingIcon={<RefreshIcon size={13} />}
            onClick={onRetry}
            size="xs"
            variant="secondary"
          >
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function reportCleanupFailure(operation: Promise<void>): void {
  void operation.catch((error: unknown) => {
    queueMicrotask(() => {
      throw error;
    });
  });
}
