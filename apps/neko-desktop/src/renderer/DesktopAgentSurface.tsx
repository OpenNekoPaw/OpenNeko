import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, OpenIcon, RefreshIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import type {
  AgentInteractionProjection,
  AgentLaunchHostResult,
  CharacterDialogueHandoffIntent,
  CharacterCreationHandoffIntent,
  DesktopAgentConnectionIdentity,
} from '@neko/agent-contracts';
import { TOOL_NAMES_CHARA } from '@neko/agent-contracts';
import { parseCharacterProductHandoff, type CharacterProductHandoff } from '@neko/chara/contracts';
import { AutomationTargetSelectionRoot } from '@neko/automation-webview/target-selection/root';
import {
  AutomationSessionControlProvider,
  AutomationSessionControlTimelineItem,
} from '@neko/automation-webview/session-control/root';
import type { AutomationTargetSelectionRuntime } from '@neko/automation-contracts/target-selection';
import type { AutomationSessionControlRuntime } from '@neko/automation-contracts/session-control';
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
import type {
  AgentComposerWorkspacePresentation,
  AgentToolCallAccessoryRenderer,
} from '@neko/agent-webview/root';
import { createDesktopAutomationTargetSelectionRuntime } from './desktop-automation-target-selection-runtime';
import { createDesktopAutomationSessionControlRuntime } from './desktop-automation-session-control-runtime';

const AgentWebviewRoot = lazy(() =>
  loadDesktopAgentWebviewRootModule().then((module) => ({ default: module.AgentWebviewRoot })),
);

const renderAutomationSessionControl: AgentToolCallAccessoryRenderer = ({
  conversationId,
  toolCall,
}) => (
  <AutomationSessionControlTimelineItem
    conversationId={conversationId}
    isRunning={toolCall.result === undefined}
    toolCallId={toolCall.id}
    toolName={toolCall.name}
  />
);

function CharacterProductHandoffAccessory({
  onHandoff,
  toolCall,
}: {
  readonly onHandoff?: (handoff: CharacterProductHandoff) => void;
  readonly toolCall: Parameters<AgentToolCallAccessoryRenderer>[0]['toolCall'];
}): JSX.Element | null {
  const { t } = useTranslation();
  if (toolCall.name !== TOOL_NAMES_CHARA.FILL_CHARACTER_DRAFT || !toolCall.result?.success) {
    return null;
  }
  const data = readRecord(toolCall.result.data);
  const rawHandoffs = data?.['handoffs'];
  if (!Array.isArray(rawHandoffs)) {
    return (
      <p className="desktop-character-handoff__diagnostic" role="alert">
        {t('characterHandoff.invalidResult')}
      </p>
    );
  }
  let handoffs: readonly CharacterProductHandoff[];
  try {
    handoffs = rawHandoffs.map(parseCharacterProductHandoff);
  } catch {
    return (
      <p className="desktop-character-handoff__diagnostic" role="alert">
        {t('characterHandoff.invalidResult')}
      </p>
    );
  }
  const viewCharacter = handoffs.find((handoff) => handoff.kind === 'open-character');
  const openStudio = handoffs.find((handoff) => handoff.kind === 'open-character-studio');
  if (!viewCharacter && !openStudio) return null;
  return (
    <div className="desktop-character-handoff" data-character-product-handoff="true">
      {viewCharacter ? (
        <Button
          disabled={!onHandoff}
          leadingIcon={<OpenIcon size={13} />}
          size="xs"
          variant="secondary"
          onClick={() => onHandoff?.(viewCharacter)}
        >
          {t('characterHandoff.viewCharacter')}
        </Button>
      ) : null}
      {openStudio ? (
        <Button
          disabled={!onHandoff}
          leadingIcon={<OpenIcon size={13} />}
          size="xs"
          variant="secondary"
          onClick={() => onHandoff?.(openStudio)}
        >
          {t('characterHandoff.openStudio')}
        </Button>
      ) : null}
    </div>
  );
}

type DesktopAgentSurfaceState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly connectionKey: string;
      readonly adapter: DesktopAgentSurfaceRuntimeAdapter;
      readonly connection?: DesktopAgentConnectionIdentity;
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
      readonly characterCreationHandoff?: CharacterCreationHandoffIntent;
      readonly onCharacterCreationHandoffConsumed?: (intentId: string) => void;
      readonly characterDialogueHandoff?: CharacterDialogueHandoffIntent;
      readonly onCharacterDialogueHandoffConsumed?: (intentId: string) => void;
      readonly onCharacterProductHandoff?: (handoff: CharacterProductHandoff) => void;
      readonly composerWorkspace?: AgentComposerWorkspacePresentation;
      readonly conversationFeed?: ReactNode;
    }
  | {
      readonly binding: 'launch';
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly agentPresentation: AgentInteractionProjection;
      readonly viewId: string;
      readonly characterCreationHandoff?: CharacterCreationHandoffIntent;
      readonly onCharacterCreationHandoffConsumed?: (intentId: string) => void;
      readonly characterDialogueHandoff?: CharacterDialogueHandoffIntent;
      readonly onCharacterDialogueHandoffConsumed?: (intentId: string) => void;
      readonly onCharacterProductHandoff?: (handoff: CharacterProductHandoff) => void;
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
          connection: bootstrap.connection,
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

  const automationConnection =
    state.kind === 'ready' && state.connectionKey === connectionKey ? state.connection : undefined;
  const automationConversationId =
    state.kind === 'ready' && state.connectionKey === connectionKey
      ? state.agentPresentation?.phase === 'session'
        ? state.agentPresentation.conversationId
        : state.initialConversation?.id
      : undefined;
  const automationSessionControlRuntime = useMemo(
    () =>
      automationConnection && automationConversationId
        ? createDesktopAutomationSessionControlRuntime({
            connection: automationConnection,
            conversationId: automationConversationId,
            bridge: window.openNekoDesktop.automationSessionControl,
          })
        : undefined,
    [automationConnection, automationConversationId],
  );

  const activeAdapter = state.kind === 'ready' ? state.adapter : undefined;
  const withAuthoritativeFeed = (status: JSX.Element): JSX.Element =>
    props.conversationFeed ? (
      <div className="desktop-agent-conversation-fallback">
        {props.conversationFeed}
        {status}
      </div>
    ) : (
      status
    );
  let content: JSX.Element;
  if (state.kind === 'loading') {
    content = withAuthoritativeFeed(<AgentSurfaceStatus message={t('agent.connecting')} />);
  } else if (
    state.connectionKey === connectionKey &&
    (state.kind === 'unavailable' || state.kind === 'error')
  ) {
    content = withAuthoritativeFeed(
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
      />,
    );
  } else if (state.kind !== 'ready') {
    content = withAuthoritativeFeed(<AgentSurfaceStatus message={t('agent.connecting')} />);
  } else {
    const connectionReady = state.connectionKey === connectionKey;
    content = (
      <div className="desktop-agent-composition">
        <div
          className="desktop-agent-root"
          data-owner-root="agent"
          data-view-id={viewId}
          hidden={!connectionReady}
        >
          <Suspense fallback={<AgentSurfaceStatus message={t('agent.loading')} />}>
            <DesktopAutomationSessionControlBoundary runtime={automationSessionControlRuntime}>
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
                characterCreationHandoff={props.characterCreationHandoff}
                onCharacterCreationHandoffConsumed={props.onCharacterCreationHandoffConsumed}
                characterDialogueHandoff={props.characterDialogueHandoff}
                onCharacterDialogueHandoffConsumed={props.onCharacterDialogueHandoffConsumed}
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
                toolCallAccessoryRenderer={({ conversationId, toolCall }) => (
                  <>
                    {automationSessionControlRuntime
                      ? renderAutomationSessionControl({ conversationId, toolCall })
                      : null}
                    <CharacterProductHandoffAccessory
                      onHandoff={props.onCharacterProductHandoff}
                      toolCall={toolCall}
                    />
                  </>
                )}
              />
            </DesktopAutomationSessionControlBoundary>
          </Suspense>
        </div>
        {connectionReady && state.connection ? (
          <DesktopAutomationTargetSelectionSurface
            connection={state.connection}
            conversationId={
              state.agentPresentation?.phase === 'session'
                ? state.agentPresentation.conversationId
                : state.initialConversation?.id
            }
          />
        ) : null}
        {connectionReady ? null : <AgentSurfaceStatus message={t('agent.connecting')} />}
      </div>
    );
  }
  return (
    <>
      {content}
      <DesktopAgentAdapterDisposer adapter={activeAdapter} />
    </>
  );
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function DesktopAutomationTargetSelectionSurface({
  connection,
  conversationId,
}: {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly conversationId?: string;
}): JSX.Element | null {
  const runtime = useMemo(
    () =>
      conversationId
        ? createDesktopAutomationTargetSelectionRuntime({
            connection,
            conversationId,
            bridge: window.openNekoDesktop.automationTargetSelection,
          })
        : undefined,
    [connection, conversationId],
  );
  return runtime ? (
    <>
      <AutomationTargetSelectionRoot runtime={runtime} />
      <DesktopAutomationTargetSelectionRuntimeDisposer runtime={runtime} />
    </>
  ) : null;
}

function DesktopAutomationTargetSelectionRuntimeDisposer({
  runtime,
}: {
  readonly runtime: AutomationTargetSelectionRuntime;
}): null {
  const disposals = useRef(new Map<AutomationTargetSelectionRuntime, { cancelled: boolean }>());
  useEffect(() => {
    const scheduledDisposals = disposals.current;
    const scheduled = scheduledDisposals.get(runtime);
    if (scheduled) {
      scheduled.cancelled = true;
      scheduledDisposals.delete(runtime);
    }
    return () => {
      const disposal = { cancelled: false };
      scheduledDisposals.set(runtime, disposal);
      queueMicrotask(() => {
        if (disposal.cancelled || scheduledDisposals.get(runtime) !== disposal) return;
        scheduledDisposals.delete(runtime);
        runtime.dispose();
      });
    };
  }, [runtime]);
  return null;
}

function DesktopAutomationSessionControlBoundary({
  children,
  runtime,
}: {
  readonly children: ReactNode;
  readonly runtime?: AutomationSessionControlRuntime;
}): JSX.Element {
  return (
    <AutomationSessionControlProvider runtime={runtime}>
      {children}
      {runtime ? <DesktopAutomationSessionControlRuntimeDisposer runtime={runtime} /> : null}
    </AutomationSessionControlProvider>
  );
}

function DesktopAutomationSessionControlRuntimeDisposer({
  runtime,
}: {
  readonly runtime: AutomationSessionControlRuntime;
}): null {
  const disposals = useRef(new Map<AutomationSessionControlRuntime, { cancelled: boolean }>());
  useEffect(() => {
    const scheduledDisposals = disposals.current;
    const scheduled = scheduledDisposals.get(runtime);
    if (scheduled) {
      scheduled.cancelled = true;
      scheduledDisposals.delete(runtime);
    }
    return () => {
      const disposal = { cancelled: false };
      scheduledDisposals.set(runtime, disposal);
      queueMicrotask(() => {
        if (disposal.cancelled || scheduledDisposals.get(runtime) !== disposal) return;
        scheduledDisposals.delete(runtime);
        runtime.dispose();
      });
    };
  }, [runtime]);
  return null;
}

function DesktopAgentAdapterDisposer({
  adapter,
}: {
  readonly adapter: DesktopAgentSurfaceRuntimeAdapter | undefined;
}): null {
  const disposals = useRef(new Map<DesktopAgentSurfaceRuntimeAdapter, { cancelled: boolean }>());
  useEffect(() => {
    if (!adapter) return;
    const scheduledDisposals = disposals.current;
    const scheduled = scheduledDisposals.get(adapter);
    if (scheduled) {
      scheduled.cancelled = true;
      scheduledDisposals.delete(adapter);
    }
    return () => {
      const disposal = { cancelled: false };
      scheduledDisposals.set(adapter, disposal);
      // StrictMode replays setup after cleanup in the same turn; child cleanup also finishes first.
      queueMicrotask(() => {
        if (disposal.cancelled || scheduledDisposals.get(adapter) !== disposal) return;
        scheduledDisposals.delete(adapter);
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
