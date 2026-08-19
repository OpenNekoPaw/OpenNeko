import { useEffect, useState, type ReactNode } from 'react';
import type { DshPermissionHostProjection } from '@neko/agent-contracts/dsh-permission-host';
import type {
  DshComposerConfigurationProjection,
  DshSessionHostEvent,
  DshSessionHostProjection,
} from '@neko/agent-contracts/dsh-session-host';
import type {
  AgentCharacterDialogueTargetOption,
  AgentWorldExperienceTargetOption,
} from '@neko/agent-contracts';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import type { ChatModelOption } from '@neko/ai-contracts';
import { InputArea } from '../components/ChatView/InputArea/InputArea';
import { InputAreaProvider } from '../components/ChatView/InputAreaContext';
import type {
  GenerationParams,
  SelectedCharacterLaunch,
  SelectedWorldLaunch,
} from '../components/ChatView/InputArea/types';
import type {
  AgentComposerWorkspacePresentation,
  AgentComposerWorkspaceTarget,
} from '../components/ComposerWorkspaceContext';
import { AuthoringTargetSelector } from '../components/ChatView/AuthoringTargetSelector';
import { CharacterDialogueTargetSelector } from '../components/ChatView/CharacterDialogueTargetSelector';
import { HomeExperienceQuickActions } from '../components/ChatView/HomeExperienceQuickActions';
import { WorldExperienceTargetSelector } from '../components/ChatView/WorldExperienceTargetSelector';
import {
  ChevronDownIcon,
  CodeIcon,
  ErrorIcon,
  LoadingIcon,
  MarkdownDocumentView,
  RefreshIcon,
  SegmentedControl,
  SuccessIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation as useUiTranslation } from '@neko/ui/i18n/react';
import { AgentPresentationI18nProvider, useTranslation } from '../i18n/I18nContext';

import '../index.css';
import './root.css';

export interface DshAgentViewProps {
  readonly agentSurfaceId: string;
  readonly conversationFeed?: ReactNode;
  readonly conversationId?: string;
  readonly surfaceKind: 'entry' | 'assistant' | 'workspace';
  readonly entryContext?: DshEntryContextPresentation;
  readonly composerConfiguration?: DshComposerConfigurationProjection;
  readonly composerConfigurationError?: string;
  readonly configuring: boolean;
  readonly draft: string;
  readonly errorMessage?: string;
  readonly loading: boolean;
  readonly permissions: readonly DshPermissionHostProjection[];
  readonly projection?: DshSessionHostProjection;
  readonly runtime?: DshRuntimeHostProjection;
  readonly submitting: boolean;
  readonly onCancelPermission: (permission: DshPermissionHostProjection) => void;
  readonly onCancelTurn: () => void;
  readonly onDecidePermission: (permission: DshPermissionHostProjection, optionId: string) => void;
  readonly onDraftChange: (value: string) => void;
  readonly onModelChange: (modelOptionId: string) => void;
  readonly onMediaModelChange?: (
    category: 'image' | 'video' | 'audio',
    modelOptionId: string,
  ) => void;
  readonly onPermissionPresetChange: (permissionPresetId: string) => void;
  readonly onRestartRuntime: () => void;
  readonly onSubmit: () => void;
}

export interface DshEntryContextPresentation {
  readonly workspace: Pick<
    Extract<AgentComposerWorkspacePresentation, { readonly kind: 'entry' }>,
    'projects' | 'onSelectProject'
  >;
  readonly loadCharacterTargets: () => Promise<
    DshEntryTargetCatalog<AgentCharacterDialogueTargetOption>
  >;
  readonly loadWorldTargets: () => Promise<DshEntryTargetCatalog<AgentWorldExperienceTargetOption>>;
}

export interface DshEntryTargetCatalog<T> {
  readonly targets: readonly T[];
  readonly diagnostics: readonly string[];
}

export function DshAgentView(props: DshAgentViewProps): JSX.Element {
  const { locale } = useUiTranslation();
  return (
    <AgentPresentationI18nProvider locale={locale}>
      <DshAgentViewContent {...props} />
    </AgentPresentationI18nProvider>
  );
}

function DshAgentViewContent(props: DshAgentViewProps): JSX.Element {
  const { locale } = useTranslation();
  const copy = locale === 'zh-cn' ? ZH_COPY : EN_COPY;
  const [entryExperience, setEntryExperience] = useState<'assistant' | 'authoring'>('assistant');
  const [entryDetail, setEntryDetail] = useState<'project' | 'character' | 'world'>('character');
  const [entryDetailExpanded, setEntryDetailExpanded] = useState(false);
  const [entryWorkspaceTarget, setEntryWorkspaceTarget] = useState<AgentComposerWorkspaceTarget>();
  const [entryCharacterTargets, setEntryCharacterTargets] = useState<
    readonly AgentCharacterDialogueTargetOption[]
  >([]);
  const [entryCharacterTargetsStatus, setEntryCharacterTargetsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle');
  const [entryWorldTargets, setEntryWorldTargets] = useState<
    readonly AgentWorldExperienceTargetOption[]
  >([]);
  const [entryWorldTargetsStatus, setEntryWorldTargetsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle');
  const [entryCharacterLaunches, setEntryCharacterLaunches] = useState<
    readonly SelectedCharacterLaunch[]
  >([]);
  const [entryWorldLaunch, setEntryWorldLaunch] = useState<SelectedWorldLaunch>();
  const [entryContextDiagnostic, setEntryContextDiagnostic] = useState<string>();
  const runtimeReady = props.runtime?.status === 'running';
  const hasEvents = (props.projection?.events.length ?? 0) > 0;
  const showEmptyState =
    props.conversationId === undefined && !hasEvents && !props.conversationFeed;
  const emptyTitle =
    props.surfaceKind === 'entry'
      ? entryExperience === 'assistant'
        ? copy.entryEmptyTitle
        : copy.entryAuthoringEmptyTitle
      : props.surfaceKind === 'assistant'
        ? copy.assistantEmptyTitle
        : copy.workspaceEmptyTitle;
  const compositionClass =
    props.surfaceKind === 'workspace'
      ? 'agent-workspace-initial-composition'
      : 'agent-entry-composition';
  const centerGroupClass =
    props.surfaceKind === 'workspace'
      ? 'agent-workspace-initial-center-group'
      : 'agent-entry-center-group';
  useEffect(() => {
    if (!entryDetailExpanded || entryDetail !== 'character' || !props.entryContext) {
      return;
    }
    let active = true;
    setEntryCharacterTargetsStatus('loading');
    setEntryContextDiagnostic(undefined);
    void props.entryContext.loadCharacterTargets().then(
      (catalog) => {
        if (!active) return;
        setEntryCharacterTargets(catalog.targets);
        setEntryCharacterTargetsStatus('ready');
        setEntryContextDiagnostic(projectCatalogDiagnostic(catalog.diagnostics));
      },
      (error: unknown) => {
        if (!active) return;
        setEntryCharacterTargets([]);
        setEntryCharacterTargetsStatus('unavailable');
        setEntryContextDiagnostic(describeError(error));
      },
    );
    return () => {
      active = false;
    };
  }, [entryDetail, entryDetailExpanded, props.entryContext]);
  useEffect(() => {
    if (!entryDetailExpanded || entryDetail !== 'world' || !props.entryContext) {
      return;
    }
    let active = true;
    setEntryWorldTargetsStatus('loading');
    setEntryContextDiagnostic(undefined);
    void props.entryContext.loadWorldTargets().then(
      (catalog) => {
        if (!active) return;
        setEntryWorldTargets(catalog.targets);
        setEntryWorldTargetsStatus('ready');
        setEntryContextDiagnostic(projectCatalogDiagnostic(catalog.diagnostics));
      },
      (error: unknown) => {
        if (!active) return;
        setEntryWorldTargets([]);
        setEntryWorldTargetsStatus('unavailable');
        setEntryContextDiagnostic(describeError(error));
      },
    );
    return () => {
      active = false;
    };
  }, [entryDetail, entryDetailExpanded, props.entryContext]);
  const chooseEntryDetail = (detail: 'project' | 'character' | 'world'): void => {
    if (!props.entryContext) {
      throw new Error('Agent Entry context presentation is unavailable.');
    }
    setEntryDetail(detail);
    setEntryDetailExpanded(true);
    setEntryContextDiagnostic(undefined);
  };
  const composer = (
    <DshComposer
      copy={copy}
      surfaceKind={props.surfaceKind}
      configuration={props.composerConfiguration}
      configurationError={props.composerConfigurationError}
      configuring={props.configuring}
      currentTurn={props.projection?.currentTurn}
      disabled={props.submitting || !runtimeReady}
      draft={props.draft}
      onCancel={props.onCancelTurn}
      onDraftChange={props.onDraftChange}
      onModelChange={props.onModelChange}
      onMediaModelChange={props.onMediaModelChange}
      onPermissionPresetChange={props.onPermissionPresetChange}
      onSubmit={props.onSubmit}
      entryExperience={entryExperience}
      entryContextAvailable={props.entryContext !== undefined}
      entryWorkspaceTarget={entryWorkspaceTarget}
      selectedCharacterLaunches={entryCharacterLaunches}
      selectedWorldLaunch={entryWorldLaunch}
      onChooseEntryDetail={chooseEntryDetail}
      onClearEntryWorkspaceTarget={() => setEntryWorkspaceTarget(undefined)}
      onRemoveCharacterLaunch={(characterVersionId) =>
        setEntryCharacterLaunches((current) =>
          current.filter((selection) => selection.characterVersionId !== characterVersionId),
        )
      }
      onRemoveWorldLaunch={() => setEntryWorldLaunch(undefined)}
      presentation={
        showEmptyState
          ? props.surfaceKind === 'workspace'
            ? 'workspace'
            : 'entry'
          : 'conversation'
      }
    />
  );

  return (
    <div
      className="dsh-agent-view agent-chat-view flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-agent-surface={props.agentSurfaceId}
      data-agent-surface-kind={props.surfaceKind}
      data-entry-detail={entryDetailExpanded ? entryDetail : 'closed'}
      data-dsh-runtime-status={props.runtime?.status ?? 'loading'}
      data-empty-state={showEmptyState}
      data-presentation="desktop-dock"
    >
      {showEmptyState ? (
        <div className={`${compositionClass} flex-1`}>
          {props.surfaceKind === 'entry' ? (
            <div className="agent-entry-experience-selector">
              <SegmentedControl
                appearance="neutral"
                density="compact"
                label={copy.entryExperience}
                maxWidth={480}
                options={[
                  { value: 'assistant', label: copy.entryConversation },
                  { value: 'authoring', label: copy.entryCreation },
                ]}
                value={entryExperience}
                onValueChange={(value) => {
                  if (value !== 'assistant' && value !== 'authoring') {
                    throw new Error(`Unsupported Entry experience '${value}'.`);
                  }
                  setEntryExperience(value);
                  setEntryDetail(value === 'authoring' ? 'project' : 'character');
                  setEntryDetailExpanded(false);
                  setEntryContextDiagnostic(undefined);
                  if (value === 'authoring') {
                    setEntryCharacterLaunches([]);
                    setEntryWorldLaunch(undefined);
                  } else {
                    setEntryWorkspaceTarget(undefined);
                  }
                }}
              />
            </div>
          ) : null}
          <div className={centerGroupClass}>
            <div className="agent-empty-state agent-empty-state--desktop-dock select-none px-3">
              <section
                className="agent-entry-intro w-full min-w-0"
                aria-labelledby="neko-agent-empty-title"
              >
                <h2
                  className="agent-empty-title text-[28px] font-semibold leading-9 text-[var(--agent-fg)]"
                  id="neko-agent-empty-title"
                >
                  {emptyTitle}
                </h2>
              </section>
            </div>
            {renderRuntimeState(props, copy)}
            {composer}
            {props.surfaceKind === 'entry' && props.entryContext ? (
              <HomeExperienceQuickActions
                key={`${entryExperience}:${entryDetail}:${entryDetailExpanded ? 'open' : 'closed'}`}
                mode={entryExperience}
                detailExpanded={entryDetailExpanded}
                disabled={props.submitting}
                title={
                  entryExperience === 'authoring'
                    ? copy.chooseProject
                    : entryDetail === 'world'
                      ? copy.chooseWorld
                      : copy.chooseCharacter
                }
                onExpandedChange={setEntryDetailExpanded}
              >
                {entryExperience === 'authoring' ? (
                  <AuthoringTargetSelector
                    presentation={props.entryContext.workspace}
                    selected={entryWorkspaceTarget}
                    pending={props.submitting}
                    onChange={async (target) => {
                      setEntryWorkspaceTarget(target);
                      setEntryContextDiagnostic(undefined);
                    }}
                  />
                ) : entryDetail === 'character' ? (
                  <CharacterDialogueTargetSelector
                    targets={entryCharacterTargets}
                    selected={entryCharacterLaunches}
                    loading={
                      entryCharacterTargetsStatus === 'idle' ||
                      entryCharacterTargetsStatus === 'loading'
                    }
                    pending={props.submitting}
                    onChange={setEntryCharacterLaunches}
                  />
                ) : (
                  <WorldExperienceTargetSelector
                    targets={entryWorldTargets}
                    selected={entryWorldLaunch}
                    loading={
                      entryWorldTargetsStatus === 'idle' || entryWorldTargetsStatus === 'loading'
                    }
                    pending={props.submitting}
                    onChange={setEntryWorldLaunch}
                  />
                )}
                {entryContextDiagnostic ? <p role="alert">{entryContextDiagnostic}</p> : null}
              </HomeExperienceQuickActions>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div
            className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-auto-hide"
            aria-live="polite"
          >
            {props.conversationFeed}
            {props.projection?.events.map((event, index) => (
              <DshSessionEvent copy={copy} event={event} key={eventKey(event, index)} />
            ))}
            {renderRuntimeState(props, copy)}
          </div>
          <DshPermissionPanel
            copy={copy}
            permissions={props.permissions}
            onCancel={props.onCancelPermission}
            onDecide={props.onDecidePermission}
          />
          {composer}
        </>
      )}
    </div>
  );
}

function DshComposer({
  copy,
  surfaceKind,
  configuration,
  configurationError,
  configuring,
  currentTurn,
  disabled,
  draft,
  onCancel,
  onDraftChange,
  onModelChange,
  onMediaModelChange,
  onPermissionPresetChange,
  onSubmit,
  entryExperience,
  entryContextAvailable,
  entryWorkspaceTarget,
  selectedCharacterLaunches,
  selectedWorldLaunch,
  onChooseEntryDetail,
  onClearEntryWorkspaceTarget,
  onRemoveCharacterLaunch,
  onRemoveWorldLaunch,
  presentation,
}: {
  readonly copy: DshAgentCopy;
  readonly surfaceKind: 'entry' | 'assistant' | 'workspace';
  readonly configuration?: DshComposerConfigurationProjection;
  readonly configurationError?: string;
  readonly configuring: boolean;
  readonly currentTurn?: number;
  readonly disabled: boolean;
  readonly draft: string;
  readonly onCancel: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onModelChange: (modelOptionId: string) => void;
  readonly onMediaModelChange?: (
    category: 'image' | 'video' | 'audio',
    modelOptionId: string,
  ) => void;
  readonly onPermissionPresetChange: (permissionPresetId: string) => void;
  readonly onSubmit: () => void;
  readonly entryExperience: 'assistant' | 'authoring';
  readonly entryContextAvailable: boolean;
  readonly entryWorkspaceTarget?: AgentComposerWorkspaceTarget;
  readonly selectedCharacterLaunches: readonly SelectedCharacterLaunch[];
  readonly selectedWorldLaunch?: SelectedWorldLaunch;
  readonly onChooseEntryDetail: (detail: 'project' | 'character' | 'world') => void;
  readonly onClearEntryWorkspaceTarget: () => void;
  readonly onRemoveCharacterLaunch: (characterVersionId: string) => void;
  readonly onRemoveWorldLaunch: () => void;
  readonly presentation: 'entry' | 'workspace' | 'conversation';
}): JSX.Element {
  const models: ChatModelOption[] = (configuration?.models ?? []).map((model) => ({
    id: model.id,
    label: model.label,
    providerId: model.providerId,
    modelId: model.modelId,
    providerLabel: model.providerLabel,
    category: model.category,
    capabilities: model.capabilities,
  }));
  const generationParams: GenerationParams = {
    ratio: '16:9',
    resolution: '1080p',
    videoDuration: 'auto',
    videoFps: 24,
    audioDuration: 'auto',
    audioType: 'sfx',
  };
  const configurationDiagnostic = configurationError ?? configuration?.diagnostic;
  return (
    <InputAreaProvider
      isBusy={configuring || currentTurn !== undefined}
      modelCatalogStatus={configuration === undefined ? 'loading' : 'ready'}
      selectedModel={configuration?.selectedModelOptionId ?? ''}
      availableModels={models}
      onModelSelect={onModelChange}
      mediaModelSelection={{
        image: configuration?.selectedMediaModelOptionIds.image ?? 'none',
        video: configuration?.selectedMediaModelOptionIds.video ?? 'none',
        audio: configuration?.selectedMediaModelOptionIds.audio ?? 'none',
      }}
      availableMediaModels={models.filter((model) => model.category !== 'llm')}
      mediaModelOptOutEnabled={false}
      mediaUnderstandingSelection={{ image: '', video: '', audio: '' }}
      onMediaModelSelect={onMediaModelChange ?? (() => undefined)}
      onMediaUnderstandingModelSelect={() => undefined}
      sessionMode="agent"
      onSessionModeChange={() => undefined}
      executionMode="ask"
      onExecutionModeChange={() => undefined}
      contextTokenCount={0}
      isCompressing={false}
      mediaModelCallCount={0}
      contextChips={[]}
      onRemoveContextChip={() => undefined}
      genCategory="image"
      genParams={generationParams}
      onGenCategoryChange={() => undefined}
      onGenParamsChange={() => undefined}
    >
      <div className="dsh-composer-adapter" data-dsh-adapter="input-area">
        <InputArea
          presentation={presentation}
          inputValue={draft}
          isThinking={currentTurn !== undefined}
          isRunActive={currentTurn !== undefined}
          queueingEnabled={false}
          onInputChange={onDraftChange}
          onSend={() => {
            if (configurationDiagnostic || disabled || draft.trim().length === 0) return false;
            onSubmit();
            return true;
          }}
          onCancel={onCancel}
          disabled={disabled || configuring || configuration === undefined}
          attachmentsDisabled
          runtimeMode={
            configuration === undefined
              ? undefined
              : {
                  current: configuration.permissionPresetId,
                  options: configuration.permissionPresets.map((preset) => ({
                    id: preset.id,
                    label: formatPermissionPresetLabel(preset.id, preset.label),
                    disabled: !preset.selectable,
                    ...(preset.description === undefined
                      ? {}
                      : { description: preset.description }),
                  })),
                  onChange: onPermissionPresetChange,
                }
          }
          submissionBlocked={configurationDiagnostic !== undefined}
          submissionBlockedReason={configurationDiagnostic}
          workspaceCanvas={
            configuration?.context
              ? {
                  workspaceLabel: configuration.context.workspaceLabel,
                  showCanvasIndex: true,
                  canvas: {
                    workspaceId: configuration.context.workspaceId,
                    defaultTarget: {
                      kind: 'workspace-board' as const,
                      workspaceId: configuration.context.workspaceId,
                    },
                    options: [
                      {
                        id: 'workspace-board',
                        label: configuration.context.canvas.label,
                        target: {
                          kind: 'workspace-board' as const,
                          workspaceId: configuration.context.workspaceId,
                        },
                      },
                    ],
                    selectedId: 'workspace-board',
                    loading: false,
                    onSelect: async () => undefined,
                  },
                }
              : undefined
          }
          entryContextActions={
            presentation === 'entry' && surfaceKind === 'entry'
              ? entryExperience === 'authoring'
                ? [
                    {
                      kind: 'project' as const,
                      label: copy.chooseProject,
                      onInvoke: () => onChooseEntryDetail('project'),
                      disabled: !entryContextAvailable,
                      ...(!entryContextAvailable
                        ? { disabledReason: copy.entryContextUnavailable }
                        : {}),
                    },
                  ]
                : [
                    {
                      kind: 'character' as const,
                      label: copy.chooseCharacter,
                      onInvoke: () => onChooseEntryDetail('character'),
                      disabled: !entryContextAvailable,
                      ...(!entryContextAvailable
                        ? { disabledReason: copy.entryContextUnavailable }
                        : {}),
                    },
                    {
                      kind: 'world' as const,
                      label: copy.chooseWorld,
                      onInvoke: () => onChooseEntryDetail('world'),
                      disabled: !entryContextAvailable,
                      ...(!entryContextAvailable
                        ? { disabledReason: copy.entryContextUnavailable }
                        : {}),
                    },
                  ]
              : undefined
          }
          entryContextActionsDisabled={false}
          entryWorkspaceTarget={entryExperience === 'authoring' ? entryWorkspaceTarget : undefined}
          selectedCharacterLaunches={
            entryExperience === 'assistant' ? selectedCharacterLaunches : []
          }
          selectedWorldLaunch={entryExperience === 'assistant' ? selectedWorldLaunch : undefined}
          onClearEntryWorkspaceTarget={async () => onClearEntryWorkspaceTarget()}
          onRemoveCharacterLaunch={onRemoveCharacterLaunch}
          onRemoveWorldLaunch={onRemoveWorldLaunch}
        />
      </div>
    </InputAreaProvider>
  );
}

function DshSessionEvent({
  copy,
  event,
}: {
  readonly copy: DshAgentCopy;
  readonly event: DshSessionHostEvent;
}): JSX.Element | null {
  if (event.kind === 'message') {
    const isUser = event.role === 'user';
    return (
      <div
        className={`agent-message-list-item py-0.5 ${isUser ? '' : 'agent-assistant-document-row'}`}
      >
        <div className="agent-transcript-rail">
          <article
            className={`agent-message-row group ${isUser ? '' : 'agent-assistant-turn-row'}`}
          >
            <div className={`flex gap-2 px-2 py-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="w-5 flex-shrink-0 pt-0.5">
                <span
                  aria-label={isUser ? copy.you : copy.agent}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[8px] font-semibold leading-none ${isUser ? 'border-[var(--agent-composer-send-border)] bg-[var(--agent-composer-send-bg)] text-[var(--agent-composer-send-fg)]' : 'border-[var(--agent-bubble-assistant-border)] bg-[var(--agent-bubble-assistant-bg)] text-[var(--agent-fg)]'}`}
                >
                  {isUser ? copy.youAvatar : 'AI'}
                </span>
              </div>
              <div
                className={`min-w-0 flex-1 ${isUser ? 'flex max-w-[85%] flex-col items-end' : 'max-w-none'}`}
              >
                {isUser ? (
                  <div className="agent-user-prompt block w-fit max-w-full min-w-0 whitespace-pre-wrap break-words">
                    {event.text}
                  </div>
                ) : (
                  <div className="agent-assistant-turn">
                    <div className="agent-turn-answer agent-turn-text-lane">
                      <MarkdownDocumentView className="markdown-content" value={event.text} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </article>
        </div>
      </div>
    );
  }
  if (event.kind === 'tool') return <DshToolEvent copy={copy} event={event} />;
  if (event.kind === 'turn' && event.phase === 'start') return null;
  const diagnostic = event.kind === 'diagnostic';
  return (
    <div className="agent-message-list-item py-0.5">
      <div className="agent-transcript-rail">
        <div
          className={diagnostic ? 'agent-inline-diagnostic' : 'agent-turn-activity-meta'}
          role={diagnostic ? 'alert' : 'status'}
        >
          {diagnostic ? <ErrorIcon className="agent-inline-diagnostic__icon" /> : null}
          <span>
            {diagnostic
              ? `${event.code}: ${event.message}`
              : event.kind === 'cancel'
                ? copy.cancelled
                : copy.turnEnded.replace('{turn}', String(event.turn)) +
                  (event.reason ? ` · ${event.reason}` : '')}
          </span>
        </div>
      </div>
    </div>
  );
}

function DshToolEvent({
  copy,
  event,
}: {
  readonly copy: DshAgentCopy;
  readonly event: Extract<DshSessionHostEvent, { readonly kind: 'tool' }>;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const expandable = event.rawInput !== undefined || event.rawOutput !== undefined;
  const tone =
    event.status === 'failed'
      ? 'is-danger'
      : event.status === 'completed'
        ? 'is-success'
        : 'is-info';
  const icon =
    event.status === 'failed' ? (
      <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />
    ) : event.status === 'completed' ? (
      <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />
    ) : event.status === 'in_progress' ? (
      <LoadingIcon className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
    ) : (
      <CodeIcon className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
    );

  return (
    <div className="agent-message-list-item py-0.5">
      <div className="agent-transcript-rail">
        <div className="agent-turn-activity ml-7">
          <div className={`agent-inline-card ${tone}`} data-agent-tool-call-id={event.toolCallId}>
            <button
              className="agent-inline-header flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] transition-colors"
              disabled={!expandable}
              type="button"
              onClick={() => setExpanded((value) => !value)}
            >
              {icon}
              <span className="shrink-0 font-medium text-[var(--agent-fg)]">
                {event.title ?? event.toolCallId}
              </span>
              <span className="flex-1 truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
                {copy.toolStatus[event.status]}
              </span>
              {expandable ? (
                <ChevronDownIcon
                  className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              ) : null}
            </button>
            {expanded ? (
              <div className="border-t border-[var(--agent-divider)] px-3 py-2 text-[10px]">
                <ToolPayload label={copy.input} value={event.rawInput} />
                <ToolPayload label={copy.output} value={event.rawOutput} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolPayload({
  label,
  value,
}: {
  readonly label: string;
  readonly value: unknown;
}): JSX.Element | null {
  if (value === undefined) return null;
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-0.5 text-[var(--agent-fg-secondary)] opacity-80">{label}</div>
      <pre className="agent-code-block max-h-[150px] w-full max-w-full overflow-x-auto p-1.5 font-mono">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function DshPermissionPanel({
  copy,
  onCancel,
  onDecide,
  permissions,
}: {
  readonly copy: DshAgentCopy;
  readonly onCancel: (permission: DshPermissionHostProjection) => void;
  readonly onDecide: (permission: DshPermissionHostProjection, optionId: string) => void;
  readonly permissions: readonly DshPermissionHostProjection[];
}): JSX.Element | null {
  if (permissions.length === 0) return null;
  return (
    <section className="agent-pending-approval-panel" aria-label={copy.permissions}>
      <div className="agent-pending-approval-heading">
        <WarningIcon className="h-4 w-4 shrink-0" />
        <span>{copy.permissions}</span>
      </div>
      <div className="agent-pending-approval-list">
        {permissions.map((permission) => (
          <article
            className="agent-pending-approval-item"
            key={`${permission.dshSessionId}:${permission.turn}:${permission.toolCallId}`}
          >
            <div className="agent-pending-approval-content">
              <p className="agent-pending-approval-question">{permission.title}</p>
            </div>
            <div className="agent-pending-approval-actions">
              {permission.options.map((option) => (
                <button
                  className={
                    option.kind.startsWith('allow')
                      ? 'neko-button'
                      : 'neko-button neko-button-secondary'
                  }
                  data-permission-kind={option.kind}
                  key={option.optionId}
                  type="button"
                  onClick={() => onDecide(permission, option.optionId)}
                >
                  {option.name}
                </button>
              ))}
              <button
                className="neko-button neko-button-secondary"
                type="button"
                onClick={() => onCancel(permission)}
              >
                {copy.cancelPermission}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderRuntimeState(props: DshAgentViewProps, copy: DshAgentCopy): JSX.Element | null {
  if (props.runtime?.status === 'unavailable') {
    return (
      <div className="dsh-agent-runtime-diagnostic agent-inline-diagnostic" role="alert">
        <ErrorIcon className="agent-inline-diagnostic__icon" />
        <div className="agent-inline-diagnostic__content">
          <strong>{copy.runtimeUnavailableTitle}</strong>
          <span>{props.runtime.diagnostic.message}</span>
          <button
            className="neko-button neko-button-secondary"
            type="button"
            onClick={props.onRestartRuntime}
          >
            <RefreshIcon size={13} />
            <span>{copy.restartRuntime}</span>
          </button>
        </div>
      </div>
    );
  }
  const message =
    props.runtime?.status === 'restarting'
      ? copy.restartingRuntime
      : props.errorMessage
        ? props.errorMessage
        : props.loading && props.conversationId
          ? copy.loading
          : undefined;
  if (!message) return null;
  return (
    <div
      className="dsh-agent-runtime-diagnostic agent-inline-diagnostic"
      role={props.errorMessage ? 'alert' : 'status'}
    >
      {props.errorMessage ? (
        <ErrorIcon className="agent-inline-diagnostic__icon" />
      ) : (
        <LoadingIcon className="agent-inline-diagnostic__icon" />
      )}
      <span>{message}</span>
    </div>
  );
}

function eventKey(event: DshSessionHostEvent, index: number): string {
  if (event.kind === 'message') return `message:${event.messageId ?? index}`;
  if (event.kind === 'tool') return `tool:${event.turn}:${event.toolCallId}`;
  if (event.kind === 'turn') return `turn:${event.turn}:${event.phase}:${index}`;
  if (event.kind === 'diagnostic') return `diagnostic:${event.code}:${index}`;
  return `cancel:${event.turn ?? 'session'}:${event.toolCallId ?? index}`;
}

interface DshAgentCopy {
  readonly agent: string;
  readonly assistantEmptyTitle: string;
  readonly cancelPermission: string;
  readonly cancelTurn: string;
  readonly cancelled: string;
  readonly composer: string;
  readonly attach: string;
  readonly attachmentsUnavailable: string;
  readonly board: string;
  readonly chooseCharacter: string;
  readonly chooseProject: string;
  readonly chooseWorld: string;
  readonly entryEmptyTitle: string;
  readonly entryAuthoringEmptyTitle: string;
  readonly entryContext: string;
  readonly entryContextUnavailable: string;
  readonly entryConversation: string;
  readonly entryCreation: string;
  readonly entryExperience: string;
  readonly input: string;
  readonly loadingConfiguration: string;
  readonly model: string;
  readonly modelRequired: string;
  readonly loading: string;
  readonly output: string;
  readonly permissions: string;
  readonly placeholder: string;
  readonly restartRuntime: string;
  readonly restartingRuntime: string;
  readonly runtimeUnavailableTitle: string;
  readonly send: string;
  readonly selectModel: string;
  readonly toolStatus: Readonly<Record<'pending' | 'in_progress' | 'completed' | 'failed', string>>;
  readonly turnEnded: string;
  readonly you: string;
  readonly youAvatar: string;
  readonly unavailable: string;
  readonly workspaceEmptyTitle: string;
  readonly workspaceContext: string;
}

const EN_COPY: DshAgentCopy = {
  agent: 'Agent',
  assistantEmptyTitle: 'What would you like to talk about?',
  cancelPermission: 'Cancel request',
  cancelTurn: 'Cancel current turn',
  cancelled: 'The operation was cancelled.',
  composer: 'Message',
  attach: 'Add context',
  attachmentsUnavailable:
    'Attachments are unavailable until the authorized resource picker is connected.',
  board: 'Board',
  chooseCharacter: 'Choose character',
  chooseProject: 'Choose project',
  chooseWorld: 'Choose world',
  entryEmptyTitle: 'Hi, start creating with a conversation',
  entryAuthoringEmptyTitle: 'What should we create?',
  entryContext: 'Conversation context',
  entryContextUnavailable: 'Product context selection is unavailable.',
  entryConversation: 'Conversation',
  entryCreation: 'Creation',
  entryExperience: 'Entry experience',
  input: 'Input',
  loadingConfiguration: 'Loading model configuration…',
  loading: 'Loading DSH session…',
  output: 'Result',
  model: 'Model',
  modelRequired: 'Select a configured model before sending.',
  permissions: 'Pending permissions',
  placeholder: 'Ask the DSH Agent…',
  restartRuntime: 'Restart DSH',
  restartingRuntime: 'Restarting DSH runtime…',
  runtimeUnavailableTitle: 'DSH runtime unavailable',
  send: 'Send message',
  selectModel: 'Select model',
  toolStatus: {
    pending: 'Pending',
    in_progress: 'Running',
    completed: 'Completed',
    failed: 'Failed',
  },
  turnEnded: 'Turn {turn} ended',
  you: 'You',
  youAvatar: 'ME',
  unavailable: 'Unavailable',
  workspaceEmptyTitle: 'Start creating',
  workspaceContext: 'Workspace and Canvas context',
};

const ZH_COPY: DshAgentCopy = {
  agent: 'Agent',
  assistantEmptyTitle: '想聊些什么？',
  cancelPermission: '取消请求',
  cancelTurn: '取消当前回合',
  cancelled: '操作已取消。',
  composer: '消息',
  attach: '添加上下文',
  attachmentsUnavailable: '授权资源选择器接入前，附件上下文暂不可用。',
  board: '画板',
  chooseCharacter: '选择角色',
  chooseProject: '选择项目',
  chooseWorld: '选择世界',
  entryEmptyTitle: 'Hi，用对话开启创作',
  entryAuthoringEmptyTitle: '这次要创作什么？',
  entryContext: '对话上下文',
  entryContextUnavailable: '产品上下文选择暂不可用。',
  entryConversation: '对话',
  entryCreation: '创作',
  entryExperience: '入口模式',
  input: '输入',
  loadingConfiguration: '正在加载模型配置…',
  loading: '正在加载 DSH 会话…',
  output: '结果',
  model: '模型',
  modelRequired: '发送前请选择已配置的模型。',
  permissions: '待处理权限',
  placeholder: '向 DSH Agent 提问…',
  restartRuntime: '重启 DSH',
  restartingRuntime: '正在重启 DSH 运行时…',
  runtimeUnavailableTitle: 'DSH 运行时不可用',
  send: '发送消息',
  selectModel: '选择模型',
  toolStatus: { pending: '等待中', in_progress: '运行中', completed: '已完成', failed: '失败' },
  turnEnded: '回合 {turn} 已结束',
  you: '你',
  youAvatar: '我',
  unavailable: '不可用',
  workspaceEmptyTitle: '开始创作',
  workspaceContext: '工作区与画布上下文',
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function projectCatalogDiagnostic(diagnostics: readonly string[]): string | undefined {
  return diagnostics.length === 0 ? undefined : diagnostics.join('\n');
}

function formatPermissionPresetLabel(permissionPresetId: string, advertisedLabel: string): string {
  if (permissionPresetId === 'read-only') return 'Read Only';
  if (permissionPresetId === 'workspace-write') return 'Workspace Write';
  if (permissionPresetId === 'danger-full-access') return 'Full access';
  return advertisedLabel;
}
