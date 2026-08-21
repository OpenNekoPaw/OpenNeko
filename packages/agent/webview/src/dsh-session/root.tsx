import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DshPermissionHostProjection } from '@neko/agent-contracts/dsh-permission-host';
import type {
  DshConversationCreationTarget,
  DshComposerConfigurationProjection,
  DshComposerMentionProjection,
  DshComposerMaterializedAssetProjection,
  DshComposerImageInput,
  DshComposerSubmitInput,
  DshSessionHostEvent,
  DshSessionHostProjection,
  DshSessionImageAttachmentIdentity,
  DshSessionUserMessageBlock,
  DshImageAttachmentPreviewHostResult,
} from '@neko/agent-contracts/dsh-session-host';
import type {
  AgentContextPayload,
  AgentCharacterDialogueTargetOption,
  AgentInputCatalogEntry,
  AgentWorldExperienceTargetOption,
} from '@neko/agent-contracts';
import { parseAgentInputTrigger } from '@neko/agent-contracts';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import type { ChatModelOption } from '@neko/ai-contracts';
import { InputArea } from '../components/ChatView/InputArea/InputArea';
import { InputAreaProvider } from '../components/ChatView/InputAreaContext';
import { ReferenceToken } from '../components/ChatView/InputArea/ReferenceToken';
import type {
  GenerationParams,
  MessageAttachment,
  MentionItem,
  SelectedFileReference,
  SelectedCharacterLaunch,
  SelectedWorldLaunch,
} from '../components/ChatView/InputArea/types';
import { resolveAgentInputInvocationIntent } from '../components/ChatView/InputArea/slash-command-catalog';
import type { AgentComposerWorkspacePresentation } from '../components/ComposerWorkspaceContext';
import { AuthoringTargetSelector } from '../components/ChatView/AuthoringTargetSelector';
import type { DshEntryProjectSelection } from '../components/ChatView/AuthoringTargetSelector';
import { CharacterDialogueTargetSelector } from '../components/ChatView/CharacterDialogueTargetSelector';
import { HomeExperienceQuickActions } from '../components/ChatView/HomeExperienceQuickActions';
import { WorldExperienceTargetSelector } from '../components/ChatView/WorldExperienceTargetSelector';
import {
  ChevronDownIcon,
  CodeIcon,
  Dialog,
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
import { projectContentLocatorPath } from '../presenters/content-locator-presenter';
import { projectPathReferenceToken } from '../presenters/reference-token-presenter';

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
  readonly mentionItems?: readonly DshComposerMentionProjection[];
  readonly mentionDiagnostic?: string;
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
  readonly onRemoveQueuedMessage?: (messageId: string) => void;
  readonly onRestartRuntime: () => void;
  readonly onRequestMentions?: (filter: string) => void;
  readonly onMaterializeAsset?: (
    assetId: string,
  ) => Promise<DshComposerMaterializedAssetProjection | undefined>;
  readonly onResolveImageAttachmentPreview?: (
    attachmentId: string,
  ) => Promise<DshImageAttachmentPreviewHostResult['preview']>;
  readonly onSubmit: (
    target: DshConversationCreationTarget,
    input: DshComposerSubmitInput,
  ) => Promise<boolean>;
}

export interface DshEntryContextPresentation {
  readonly workspace: Pick<
    Extract<AgentComposerWorkspacePresentation, { readonly kind: 'entry' }>,
    'projects'
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
  const [entryDetailExpanded, setEntryDetailExpanded] = useState(true);
  const [entryWorkspaceTarget, setEntryWorkspaceTarget] = useState<DshEntryProjectSelection>();
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
  const conversationTitle = props.projection?.title ?? copy.newConversation;
  const runtimeReady = props.runtime?.status === 'running';
  const hasEvents = (props.projection?.events.length ?? 0) > 0;
  const activeTurnStart = findActiveTurnStart(props.projection);
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
      key={props.conversationId ?? `draft:${props.agentSurfaceId}`}
      copy={copy}
      surfaceKind={props.surfaceKind}
      configuration={props.composerConfiguration}
      conversationId={props.conversationId}
      configurationError={props.composerConfigurationError}
      mentionItems={props.mentionItems ?? []}
      mentionDiagnostic={props.mentionDiagnostic}
      configuring={props.configuring}
      currentTurn={props.projection?.currentTurn}
      contextPressure={props.projection?.contextPressure}
      inbox={props.projection?.inbox}
      submitting={props.submitting}
      disabled={!runtimeReady}
      draft={props.draft}
      onCancel={props.onCancelTurn}
      onDraftChange={props.onDraftChange}
      onModelChange={props.onModelChange}
      onMediaModelChange={props.onMediaModelChange}
      onPermissionPresetChange={props.onPermissionPresetChange}
      onRemoveQueuedMessage={props.onRemoveQueuedMessage}
      onRequestMentions={props.onRequestMentions}
      onMaterializeAsset={props.onMaterializeAsset}
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
      <header className="dsh-agent-titlebar" aria-label={copy.conversationTitle}>
        <h1 className="dsh-agent-titlebar__title" title={conversationTitle}>
          {conversationTitle}
        </h1>
      </header>
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
                  setEntryDetailExpanded(true);
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
                    projects={props.entryContext.workspace.projects}
                    selected={entryWorkspaceTarget}
                    pending={props.submitting}
                    onChange={(target) => {
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
              <DshSessionEvent
                copy={copy}
                event={event}
                key={eventKey(event, index)}
                onResolveImageAttachmentPreview={props.onResolveImageAttachmentPreview}
              />
            ))}
            {activeTurnStart ? (
              <DshActiveTurnStatus
                copy={copy}
                startedAt={activeTurnStart.startedAt}
                turn={activeTurnStart.turn}
              />
            ) : null}
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
  conversationId,
  configurationError,
  mentionItems,
  mentionDiagnostic,
  configuring,
  currentTurn,
  contextPressure,
  inbox,
  submitting,
  disabled,
  draft,
  onCancel,
  onDraftChange,
  onModelChange,
  onMediaModelChange,
  onPermissionPresetChange,
  onRemoveQueuedMessage,
  onRequestMentions,
  onMaterializeAsset,
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
  readonly conversationId?: string;
  readonly configurationError?: string;
  readonly mentionItems: readonly DshComposerMentionProjection[];
  readonly mentionDiagnostic?: string;
  readonly configuring: boolean;
  readonly currentTurn?: number;
  readonly contextPressure?: DshSessionHostProjection['contextPressure'];
  readonly inbox?: DshSessionHostProjection['inbox'];
  readonly submitting: boolean;
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
  readonly onRemoveQueuedMessage?: (messageId: string) => void;
  readonly onRequestMentions?: (filter: string) => void;
  readonly onMaterializeAsset?: (
    assetId: string,
  ) => Promise<DshComposerMaterializedAssetProjection | undefined>;
  readonly onSubmit: (
    target: DshConversationCreationTarget,
    input: DshComposerSubmitInput,
  ) => Promise<boolean>;
  readonly entryExperience: 'assistant' | 'authoring';
  readonly entryContextAvailable: boolean;
  readonly entryWorkspaceTarget?: DshEntryProjectSelection;
  readonly selectedCharacterLaunches: readonly SelectedCharacterLaunch[];
  readonly selectedWorldLaunch?: SelectedWorldLaunch;
  readonly onChooseEntryDetail: (detail: 'project' | 'character' | 'world') => void;
  readonly onClearEntryWorkspaceTarget: () => void;
  readonly onRemoveCharacterLaunch: (characterVersionId: string) => void;
  readonly onRemoveWorldLaunch: () => void;
  readonly presentation: 'entry' | 'workspace' | 'conversation';
}): JSX.Element {
  const { t } = useTranslation();
  const [inputDiagnostic, setInputDiagnostic] = useState<string>();
  const suppressInputDiagnosticClearRef = useRef(false);
  const [contextChips, setContextChips] = useState<readonly AgentContextPayload[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState('workspace-board');
  const selectedCanvasScopeRef = useRef<string>();
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
  const canvasCatalog = configuration?.context?.canvas;
  const canvasSelectionScope =
    canvasCatalog === undefined
      ? undefined
      : `${conversationId ?? 'draft'}:${canvasCatalog.workspaceId}`;
  const effectiveSelectedCanvasId =
    canvasSelectionScope !== undefined && selectedCanvasScopeRef.current === canvasSelectionScope
      ? selectedCanvasId
      : 'workspace-board';
  const selectedCanvasOption = canvasCatalog?.options.find((option) => {
    const optionId =
      option.target.kind === 'workspace-board' ? 'workspace-board' : option.target.canvasId;
    return optionId === effectiveSelectedCanvasId;
  });
  const canvasSelectionDiagnostic =
    canvasCatalog === undefined ||
    (selectedCanvasOption !== undefined && selectedCanvasOption.disabled !== true)
      ? undefined
      : (selectedCanvasOption?.diagnostic ?? t('chat.input.workspaceCanvas.unavailable'));
  const inputCatalog = useMemo(() => projectDshInputCatalog(configuration), [configuration]);
  const inputCatalogBindingKind = configuration?.context ? 'workspace' : 'assistant';
  const projectedMentionItems: MentionItem[] = mentionItems.map((mention) => ({
    id: mention.id,
    kind: mention.kind,
    label: mention.label,
    ...(mention.description === undefined ? {} : { description: mention.description }),
    source: mention.source,
    ...(mention.contentLocator === undefined ? {} : { contentLocator: mention.contentLocator }),
    ...(mention.assetId === undefined ? {} : { assetId: mention.assetId }),
    ...(mention.contextPayload === undefined ? {} : { contextPayload: mention.contextPayload }),
    ...(mention.mediaType === undefined ? {} : { mediaType: mention.mediaType }),
  }));
  const entryTargetMissing =
    presentation === 'entry' &&
    surfaceKind === 'entry' &&
    entryExperience === 'authoring' &&
    entryWorkspaceTarget === undefined;
  const submissionBlocked =
    configurationDiagnostic !== undefined ||
    entryTargetMissing ||
    canvasSelectionDiagnostic !== undefined;
  const queuedMessages = [...(inbox?.nextTurn ?? []), ...(inbox?.nextStep ?? [])].map(
    (message) => ({
      id: message.messageId,
      conversationId: conversationId ?? '',
      content: message.content
        .map((block) => (block.type === 'text' ? block.text : `@${block.name}`))
        .join(' '),
      createdAt: message.createdAt,
      source: 'user' as const,
    }),
  );
  const submitTarget = (): DshConversationCreationTarget =>
    entryExperience === 'authoring' && entryWorkspaceTarget !== undefined
      ? { kind: 'project', projectId: entryWorkspaceTarget.projectId }
      : { kind: 'surface' };
  const resolveCanvasTurnTarget = () => {
    if (canvasCatalog === undefined) return undefined;
    if (selectedCanvasOption === undefined || selectedCanvasOption.disabled === true) {
      throw new Error(
        selectedCanvasOption?.diagnostic ?? t('chat.input.workspaceCanvas.unavailable'),
      );
    }
    return selectedCanvasOption.target;
  };
  const submitComposerInput = async (input?: {
    readonly messageText?: string;
    readonly attachments?: MessageAttachment[];
    readonly fileReferences?: SelectedFileReference[];
    readonly contextPayloads?: AgentContextPayload[];
  }): Promise<boolean> => {
    if (submissionBlocked || disabled) return false;
    try {
      const messageText = input?.messageText ?? draft;
      const references = (input?.fileReferences ?? []).map((reference) => ({
        label: reference.label,
        contentLocator: reference.contentLocator,
      }));
      const images = projectComposerImages(input?.attachments ?? []);
      const submittedContextPayloads = input?.contextPayloads ?? [];
      const trigger = parseAgentInputTrigger(messageText);
      if (trigger?.trigger === 'mention') {
        throw new Error(
          `Agent reference '@${trigger.name}' is unknown, stale, or was not selected from this Workspace.`,
        );
      }
      if (trigger !== null && (trigger.trigger === 'command' || trigger.trigger === 'skill')) {
        if (references.length > 0 || images.length > 0 || submittedContextPayloads.length > 0) {
          throw new Error('DSH commands and Skills do not accept attached Workspace context.');
        }
        const executableTrigger =
          trigger.trigger === 'command'
            ? { ...trigger, trigger: 'command' as const }
            : { ...trigger, trigger: 'skill' as const };
        const intent = resolveAgentInputInvocationIntent({
          trigger: executableTrigger,
          entries: inputCatalog,
          phase: 'session',
          bindingKind: inputCatalogBindingKind,
        });
        const canvasTurnTarget = intent.kind === 'skill' ? resolveCanvasTurnTarget() : undefined;
        const submitInput: DshComposerSubmitInput =
          intent.kind === 'command'
            ? { kind: 'command', line: messageText.trim() }
            : {
                kind: 'skill',
                skillName: intent.skillName,
                displayText: `$${intent.skillName}${intent.args === undefined ? '' : ` ${intent.args}`}`,
                ...(intent.args === undefined ? {} : { args: intent.args }),
                ...(canvasTurnTarget === undefined ? {} : { canvasTurnTarget }),
              };
        const accepted = await onSubmit(submitTarget(), submitInput);
        if (accepted) setInputDiagnostic(undefined);
        return accepted;
      }
      if (
        messageText.trim().length === 0 &&
        references.length === 0 &&
        images.length === 0 &&
        submittedContextPayloads.length === 0
      ) {
        return false;
      }
      const canvasTurnTarget = resolveCanvasTurnTarget();
      const accepted = await onSubmit(submitTarget(), {
        kind: 'message',
        text: messageText.trim(),
        references,
        images,
        contextPayloads: submittedContextPayloads,
        ...(canvasTurnTarget === undefined ? {} : { canvasTurnTarget }),
      });
      if (accepted) setInputDiagnostic(undefined);
      return accepted;
    } catch (error) {
      setInputDiagnostic(describeError(error));
      return false;
    }
  };
  useEffect(() => {
    if (canvasCatalog === undefined) return;
    const scope = `${conversationId ?? 'draft'}:${canvasCatalog.workspaceId}`;
    if (selectedCanvasScopeRef.current === scope) return;
    selectedCanvasScopeRef.current = scope;
    setSelectedCanvasId('workspace-board');
  }, [canvasCatalog, conversationId]);
  return (
    <InputAreaProvider
      isBusy={configuring || submitting || currentTurn !== undefined}
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
      contextTokenCount={contextPressure?.projectedTokens ?? contextPressure?.pressureTokens ?? 0}
      maxContextTokens={contextPressure?.contextWindow}
      isCompressing={false}
      mediaModelCallCount={0}
      inputCatalog={inputCatalog}
      inputCatalogPhase="session"
      inputCatalogBindingKind={inputCatalogBindingKind}
      onSlashCommand={() => setInputDiagnostic(undefined)}
      onRequestFiles={onRequestMentions}
      mentionItems={projectedMentionItems}
      contextChips={[...contextChips]}
      onAddContextChip={(payload) =>
        setContextChips((current) =>
          current.some((item) => item.id === payload.id) ? current : [...current, payload],
        )
      }
      onRemoveContextChip={(id) =>
        setContextChips((current) => current.filter((payload) => payload.id !== id))
      }
      genCategory="image"
      genParams={generationParams}
      onGenCategoryChange={() => undefined}
      onGenParamsChange={() => undefined}
    >
      <div className="dsh-composer-adapter" data-dsh-adapter="input-area">
        <InputArea
          presentation={presentation}
          inputValue={draft}
          isThinking={submitting || currentTurn !== undefined}
          isRunActive={submitting || currentTurn !== undefined}
          queueingEnabled={currentTurn !== undefined}
          queuedMessageCount={queuedMessages.length}
          queuedMessages={queuedMessages}
          onCancelQueuedMessage={onRemoveQueuedMessage}
          onInputChange={(value) => {
            if (suppressInputDiagnosticClearRef.current) {
              suppressInputDiagnosticClearRef.current = false;
            } else {
              setInputDiagnostic(undefined);
            }
            onDraftChange(value);
          }}
          onDraftConsumed={() => {
            suppressInputDiagnosticClearRef.current = true;
          }}
          onRejectedDraftRestored={() => {
            suppressInputDiagnosticClearRef.current = true;
          }}
          onSend={submitComposerInput}
          onMaterializeAsset={async (assetId) => {
            if (!onMaterializeAsset) {
              setInputDiagnostic('Workspace Asset materialization is unavailable.');
              return undefined;
            }
            try {
              const materialized = await onMaterializeAsset(assetId);
              if (!materialized) return undefined;
              setInputDiagnostic(undefined);
              return {
                id: `asset:${materialized.assetId}:${materialized.contentLocator.file.path}`,
                kind: 'asset',
                label: materialized.label,
                contentLocator: materialized.contentLocator,
                source: materialized.source,
                ...(materialized.mediaType === undefined
                  ? {}
                  : { mediaType: materialized.mediaType }),
              };
            } catch (error) {
              setInputDiagnostic(describeError(error));
              return undefined;
            }
          }}
          onCancel={onCancel}
          disabled={disabled || configuring || configuration === undefined}
          attachmentAccept="image/png,image/jpeg,image/webp,image/gif"
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
                  disabled: currentTurn !== undefined || submitting,
                }
          }
          submissionBlocked={submissionBlocked}
          submissionBlockedReason={
            inputDiagnostic ??
            canvasSelectionDiagnostic ??
            mentionDiagnostic ??
            configurationDiagnostic
          }
          workspaceCanvas={
            configuration?.context
              ? {
                  workspaceLabel: configuration.context.workspaceLabel,
                  showCanvasIndex: true,
                  canvas: {
                    workspaceId: configuration.context.canvas.workspaceId,
                    defaultTarget: configuration.context.canvas.defaultTarget,
                    options: configuration.context.canvas.options.map((option) => ({
                      id:
                        option.target.kind === 'workspace-board'
                          ? 'workspace-board'
                          : option.target.canvasId,
                      label: option.label,
                      target: option.target,
                      ...(option.summary === undefined ? {} : { summary: option.summary }),
                      ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
                      ...(option.diagnostic === undefined ? {} : { diagnostic: option.diagnostic }),
                    })),
                    selectedId: effectiveSelectedCanvasId,
                    loading: false,
                    ...(canvasSelectionDiagnostic === undefined &&
                    configuration.context.canvas.diagnostics.length === 0
                      ? {}
                      : {
                          diagnostic:
                            canvasSelectionDiagnostic ??
                            configuration.context.canvas.diagnostics.join(' '),
                        }),
                    onSelect: async (optionId) => {
                      const option = configuration.context?.canvas.options.find((candidate) =>
                        candidate.target.kind === 'workspace-board'
                          ? optionId === 'workspace-board'
                          : candidate.target.canvasId === optionId,
                      );
                      if (option === undefined || option.disabled === true) {
                        setInputDiagnostic(
                          option?.diagnostic ?? t('chat.input.workspaceCanvas.unavailable'),
                        );
                        return;
                      }
                      if (canvasSelectionScope !== undefined) {
                        selectedCanvasScopeRef.current = canvasSelectionScope;
                      }
                      setSelectedCanvasId(optionId);
                      setInputDiagnostic(undefined);
                    },
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

function projectComposerImages(
  attachments: readonly MessageAttachment[],
): readonly DshComposerImageInput[] {
  return attachments.map((attachment) => {
    if (attachment.type !== 'image') {
      throw new Error(`DSH attachment '${attachment.name}' is not a supported image.`);
    }
    const preview = attachment.preview;
    if (preview === undefined) {
      throw new Error(`DSH image attachment '${attachment.name}' has no readable image content.`);
    }
    const parsed = parseComposerImageDataUrl(preview);
    if (parsed === undefined) {
      throw new Error(`DSH image attachment '${attachment.name}' must be PNG, JPEG, WebP or GIF.`);
    }
    return {
      name: attachment.name,
      mimeType: parsed.mimeType,
      data: parsed.data,
    };
  });
}

function parseComposerImageDataUrl(
  value: string,
): { readonly mimeType: DshComposerImageInput['mimeType']; readonly data: string } | undefined {
  for (const mimeType of ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const) {
    const prefix = `data:${mimeType};base64,`;
    if (!value.startsWith(prefix)) continue;
    const data = value.slice(prefix.length);
    return data.length === 0 ? undefined : { mimeType, data };
  }
  return undefined;
}

function projectDshInputCatalog(
  configuration: DshComposerConfigurationProjection | undefined,
): readonly AgentInputCatalogEntry[] {
  const catalog = configuration?.inputCatalog;
  if (!catalog) return [];
  const commands: readonly AgentInputCatalogEntry[] = catalog.commands.map((command) => ({
    id: `dsh-command:${command.name}`,
    name: command.name,
    description:
      command.inputHint === undefined
        ? command.description
        : `${command.description} ${command.inputHint}`,
    trigger: 'command',
    prefix: '/',
    phaseRequirement: 'session',
    bindingRequirement: 'any',
    source: { kind: 'personal', ownerId: 'dsh', sourceId: command.name },
    availability: { status: 'available' },
    executable: {
      kind: 'command',
      commandId: command.name,
      handlerId: 'dsh-command',
    },
  }));
  const skills: readonly AgentInputCatalogEntry[] = catalog.skills.map((skill) => ({
    id: `dsh-skill:${skill.name}`,
    name: skill.name,
    description: skill.description,
    trigger: 'skill',
    prefix: '$',
    phaseRequirement: 'session',
    bindingRequirement: 'any',
    source: { kind: 'personal', ownerId: 'dsh', sourceId: skill.provider },
    availability: catalog.skillsComplete
      ? { status: 'available' }
      : {
          status: 'unavailable',
          diagnostic: {
            owner: 'dsh',
            code: 'SKILL_CATALOG_INCOMPLETE',
            message: configuration.inputCatalogDiagnostic ?? 'The DSH Skill catalog is incomplete.',
          },
        },
    executable: {
      kind: 'skill',
      skillName: skill.name,
      activationId: `dsh-skill:${skill.name}`,
    },
  }));
  return [...commands, ...skills];
}

type DshImagePreviewState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly preview: DshImageAttachmentPreviewHostResult['preview'];
    }
  | { readonly status: 'unavailable'; readonly diagnostic: string };

function UserMessageImageAttachment({
  block,
  copy,
  onResolve,
}: {
  readonly block: Extract<
    import('@neko/agent-contracts/dsh-session-host').DshSessionUserMessageBlock,
    { readonly type: 'image' }
  >;
  readonly copy: DshAgentCopy;
  readonly onResolve?: DshAgentViewProps['onResolveImageAttachmentPreview'];
}): JSX.Element {
  const [state, setState] = useState<DshImagePreviewState>({ status: 'loading' });
  const [open, setOpen] = useState(false);
  const { attachmentId, byteLength, height, mediaType, width } = block.attachment;
  useEffect(() => {
    let active = true;
    setOpen(false);
    if (onResolve === undefined) {
      setState({
        status: 'unavailable',
        diagnostic: copy.imagePreviewResolverUnavailable,
      });
      return () => {
        active = false;
      };
    }
    setState({ status: 'loading' });
    void onResolve(attachmentId).then(
      (preview) => {
        if (!active) return;
        try {
          assertImagePreviewMatches(
            { attachmentId, byteLength, height, mediaType, width },
            preview,
          );
          setState({ status: 'ready', preview });
        } catch (error) {
          setState({ status: 'unavailable', diagnostic: describeError(error) });
        }
      },
      (error: unknown) => {
        if (!active) return;
        setState({ status: 'unavailable', diagnostic: describeError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [
    attachmentId,
    byteLength,
    copy.imagePreviewResolverUnavailable,
    height,
    mediaType,
    onResolve,
    width,
  ]);

  const unavailable = state.status === 'unavailable';
  const title = unavailable ? `${block.label}: ${state.diagnostic}` : block.label;
  return (
    <span
      className="agent-message-image-attachment"
      data-agent-message-image="true"
      data-image-preview-status={state.status}
    >
      {state.status === 'ready' ? (
        <button
          aria-label={`${copy.openImagePreview}: ${block.label}`}
          className="agent-message-image-preview-button"
          data-agent-reference-token="true"
          data-reference-kind="image"
          title={block.label}
          type="button"
          onClick={() => setOpen(true)}
        >
          <img
            alt=""
            className="agent-message-image-thumbnail"
            decoding="async"
            loading="lazy"
            src={state.preview.url}
            onError={() => {
              setOpen(false);
              setState({
                status: 'unavailable',
                diagnostic: copy.imagePreviewLoadFailed,
              });
            }}
          />
          <span className="agent-message-image-label">{block.label}</span>
        </button>
      ) : (
        <ReferenceToken
          kind="image"
          label={block.label}
          meta={
            state.status === 'loading' ? copy.imagePreviewLoading : copy.imagePreviewUnavailable
          }
          title={title}
        />
      )}
      {state.status === 'ready' ? (
        <Dialog
          className="agent-image-preview-dialog"
          closeLabel={copy.closeImagePreview}
          description={`${state.preview.width} × ${state.preview.height}`}
          onOpenChange={setOpen}
          open={open}
          title={block.label}
        >
          <img
            alt={block.label}
            className="agent-image-preview-full"
            decoding="async"
            src={state.preview.url}
            onError={() => {
              setOpen(false);
              setState({
                status: 'unavailable',
                diagnostic: copy.imagePreviewLoadFailed,
              });
            }}
          />
        </Dialog>
      ) : null}
    </span>
  );
}

function assertImagePreviewMatches(
  attachment: DshSessionImageAttachmentIdentity,
  preview: DshImageAttachmentPreviewHostResult['preview'],
): void {
  if (
    preview.mediaType !== attachment.mediaType ||
    preview.byteLength !== attachment.byteLength ||
    preview.width !== attachment.width ||
    preview.height !== attachment.height
  ) {
    throw new Error(
      `DSH image attachment '${attachment.attachmentId}' preview metadata does not match.`,
    );
  }
}

function DshSessionEvent({
  copy,
  event,
  onResolveImageAttachmentPreview,
}: {
  readonly copy: DshAgentCopy;
  readonly event: DshSessionHostEvent;
  readonly onResolveImageAttachmentPreview?: DshAgentViewProps['onResolveImageAttachmentPreview'];
}): JSX.Element | null {
  if (event.kind === 'thought') {
    return (
      <div className="agent-message-list-item py-0.5">
        <div className="agent-transcript-rail">
          <details
            className="agent-turn-activity ml-7"
            data-agent-thought-state={event.state}
            open={event.state === 'streaming' ? true : undefined}
          >
            <summary className="agent-turn-activity-summary">
              <span className="font-medium text-[var(--agent-fg)]">{copy.thought}</span>
            </summary>
            <div className="agent-turn-activity-list">
              <div className="agent-turn-activity-item">
                <div className="agent-turn-activity-detail">
                  <MarkdownDocumentView className="markdown-content" value={event.text} />
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    );
  }
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
                  <UserMessageContent
                    content={event.content}
                    copy={copy}
                    onResolveImageAttachmentPreview={onResolveImageAttachmentPreview}
                  />
                ) : (
                  <div className="agent-assistant-turn">
                    <div
                      className="agent-turn-answer agent-turn-text-lane"
                      data-agent-message-state={event.state}
                    >
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
  if (event.kind === 'command') return <DshCommandEvent copy={copy} event={event} />;
  if (event.kind === 'turn' && event.phase === 'start') return null;
  const diagnostic = event.kind === 'diagnostic';
  const turnDuration =
    event.kind === 'turn'
      ? copy.turnDuration.replace(
          '{duration}',
          formatTurnDuration(copy, event.completedAt - event.startedAt),
        )
      : undefined;
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
                  ` · ${turnDuration}` +
                  (event.reason ? ` · ${event.reason}` : '')}
          </span>
        </div>
      </div>
    </div>
  );
}

function UserMessageContent({
  content,
  copy,
  onResolveImageAttachmentPreview,
}: {
  readonly content: readonly DshSessionUserMessageBlock[];
  readonly copy: DshAgentCopy;
  readonly onResolveImageAttachmentPreview?: DshAgentViewProps['onResolveImageAttachmentPreview'];
}): JSX.Element {
  const primaryBlocks = content.filter((block) => block.type !== 'image');
  const imageBlocks = content.filter(
    (block): block is Extract<DshSessionUserMessageBlock, { readonly type: 'image' }> =>
      block.type === 'image',
  );
  return (
    <div className="agent-user-prompt block w-fit max-w-full min-w-0 whitespace-pre-wrap break-words">
      {primaryBlocks.length > 0 ? (
        <div className="agent-user-prompt-primary">
          {primaryBlocks.map((block, index) =>
            block.type === 'text' ? (
              <span key={`text:${index}`}>{block.text}</span>
            ) : (
              <UserMessageResourceToken key={`resource:${index}:${block.label}`} block={block} />
            ),
          )}
        </div>
      ) : null}
      {imageBlocks.length > 0 ? (
        <div className="agent-message-image-grid">
          {imageBlocks.map((block, index) => (
            <UserMessageImageAttachment
              key={`image:${index}:${block.attachment.attachmentId}`}
              block={block}
              copy={copy}
              onResolve={onResolveImageAttachmentPreview}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserMessageResourceToken({
  block,
}: {
  readonly block: Extract<
    DshSessionHostEvent,
    { readonly kind: 'message'; readonly role: 'user' }
  >['content'][number] & { readonly type: 'resource' };
}): JSX.Element {
  const projection = projectPathReferenceToken({
    path: projectContentLocatorPath(block.contentLocator),
    label: block.label,
  });
  return (
    <ReferenceToken
      kind={projection.kind}
      label={projection.label}
      title={projection.title}
      meta={projection.meta}
      thumbnailSrc={projection.thumbnailSrc}
      variant="attached"
      className="agent-user-resource-token"
    />
  );
}

function findActiveTurnStart(
  projection: DshSessionHostProjection | undefined,
): Extract<DshSessionHostEvent, { readonly kind: 'turn'; readonly phase: 'start' }> | undefined {
  const currentTurn = projection?.currentTurn;
  if (!projection || currentTurn === undefined) return undefined;
  return projection.events.find(
    (
      event,
    ): event is Extract<DshSessionHostEvent, { readonly kind: 'turn'; readonly phase: 'start' }> =>
      event.kind === 'turn' && event.phase === 'start' && event.turn === currentTurn,
  );
}

function DshActiveTurnStatus({
  copy,
  startedAt,
  turn,
}: {
  readonly copy: DshAgentCopy;
  readonly startedAt: number;
  readonly turn: number;
}): JSX.Element {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    setCurrentTime(Date.now());
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt, turn]);
  const duration = formatTurnDuration(copy, Math.max(0, currentTime - startedAt));

  return (
    <div className="agent-message-list-item py-0.5" data-agent-active-turn={turn}>
      <div className="agent-transcript-rail">
        <div className="agent-turn-activity-meta flex items-center gap-1.5" role="status">
          <LoadingIcon className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
          <span>
            {copy.turnInProgress.replace('{turn}', String(turn))} ·{' '}
            {copy.turnElapsed.replace('{duration}', duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatTurnDuration(copy: DshAgentCopy, durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return copy.durationSeconds.replace('{seconds}', String(seconds));
  }
  return copy.durationMinutesSeconds
    .replace('{minutes}', String(minutes))
    .replace('{seconds}', String(seconds).padStart(2, '0'));
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
              <span className="min-w-0 max-w-[70%] truncate font-medium text-[var(--agent-fg)]">
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
                <ToolPayload copy={copy} label={copy.input} value={event.rawInput} />
                <ToolPayload copy={copy} label={copy.output} value={event.rawOutput} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DshCommandEvent({
  copy,
  event,
}: {
  readonly copy: DshAgentCopy;
  readonly event: Extract<DshSessionHostEvent, { readonly kind: 'command' }>;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const expandable = event.text !== undefined;
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
    ) : (
      <LoadingIcon className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
    );
  const status =
    event.status === 'running' ? copy.toolStatus.in_progress : copy.toolStatus[event.status];
  return (
    <div className="agent-message-list-item py-0.5">
      <div className="agent-transcript-rail">
        <div className="agent-turn-activity ml-7">
          <div className={`agent-inline-card ${tone}`} data-agent-command-id={event.commandId}>
            <button
              className="agent-inline-header flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] transition-colors"
              disabled={!expandable}
              type="button"
              onClick={() => setExpanded((value) => !value)}
            >
              {icon}
              <span className="min-w-0 max-w-[70%] truncate font-medium text-[var(--agent-fg)]">
                /{event.name}
                {event.args === undefined ? '' : ` ${event.args}`}
              </span>
              <span className="flex-1 truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
                {status}
              </span>
              {expandable ? (
                <ChevronDownIcon
                  className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              ) : null}
            </button>
            {expanded && event.text !== undefined ? (
              <div className="border-t border-[var(--agent-divider)] px-3 py-2 text-[10px]">
                <MarkdownDocumentView className="markdown-content" value={event.text} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolPayload({
  copy,
  label,
  value,
}: {
  readonly copy: DshAgentCopy;
  readonly label: string;
  readonly value: unknown;
}): JSX.Element | null {
  const [fullyExpanded, setFullyExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  if (value === undefined) return null;
  const serialized = JSON.stringify(value, null, 2);
  const copyPayload = async (): Promise<void> => {
    try {
      if (navigator.clipboard?.writeText === undefined) {
        throw new Error('Clipboard API is unavailable.');
      }
      await navigator.clipboard.writeText(serialized);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-0.5 flex items-center gap-2 text-[var(--agent-fg-secondary)]">
        <span className="mr-auto opacity-80">{label}</span>
        <button
          className="rounded px-1 py-0.5 text-[10px] hover:bg-[var(--agent-bg-hover)]"
          type="button"
          onClick={() => setFullyExpanded((current) => !current)}
        >
          {fullyExpanded ? copy.collapsePayload : copy.expandPayload}
        </button>
        <button
          className="rounded px-1 py-0.5 text-[10px] hover:bg-[var(--agent-bg-hover)]"
          type="button"
          onClick={() => void copyPayload()}
        >
          {copyStatus === 'copied'
            ? copy.copiedPayload
            : copyStatus === 'failed'
              ? copy.copyPayloadFailed
              : copy.copyPayload}
        </button>
      </div>
      <pre
        className={`agent-code-block w-full max-w-full overflow-x-auto p-1.5 font-mono ${
          fullyExpanded ? 'max-h-none overflow-y-visible' : 'max-h-[150px] overflow-y-auto'
        }`}
        data-agent-tool-payload={label}
      >
        {serialized}
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
  if (event.kind === 'thought') return `thought:${event.turn}:${event.step}:${event.messageId}`;
  if (event.kind === 'tool') return `tool:${event.turn}:${event.toolCallId}`;
  if (event.kind === 'command') return `command:${event.commandId}`;
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
  readonly conversationTitle: string;
  readonly collapsePayload: string;
  readonly copiedPayload: string;
  readonly copyPayload: string;
  readonly copyPayloadFailed: string;
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
  readonly expandPayload: string;
  readonly input: string;
  readonly imagePreviewLoading: string;
  readonly imagePreviewUnavailable: string;
  readonly imagePreviewResolverUnavailable: string;
  readonly imagePreviewLoadFailed: string;
  readonly closeImagePreview: string;
  readonly openImagePreview: string;
  readonly loadingConfiguration: string;
  readonly model: string;
  readonly newConversation: string;
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
  readonly thought: string;
  readonly turnDuration: string;
  readonly durationSeconds: string;
  readonly durationMinutesSeconds: string;
  readonly turnElapsed: string;
  readonly turnEnded: string;
  readonly turnInProgress: string;
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
  conversationTitle: 'Conversation title',
  collapsePayload: 'Collapse',
  copiedPayload: 'Copied',
  copyPayload: 'Copy',
  copyPayloadFailed: 'Copy failed',
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
  expandPayload: 'Show all',
  input: 'Input',
  imagePreviewLoading: 'Loading preview',
  imagePreviewUnavailable: 'Preview unavailable',
  imagePreviewResolverUnavailable: 'Image preview authorization is unavailable.',
  imagePreviewLoadFailed: 'The authorized image preview could not be loaded.',
  closeImagePreview: 'Close image preview',
  openImagePreview: 'Open image preview',
  loadingConfiguration: 'Loading model configuration…',
  loading: 'Loading DSH session…',
  output: 'Result',
  model: 'Model',
  newConversation: 'New conversation',
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
  thought: 'Reasoning',
  turnDuration: 'Ran for {duration}',
  durationSeconds: '{seconds}s',
  durationMinutesSeconds: '{minutes}m {seconds}s',
  turnElapsed: '{duration} elapsed',
  turnEnded: 'Turn {turn} ended',
  turnInProgress: 'Turn {turn} in progress',
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
  conversationTitle: '会话标题',
  collapsePayload: '收起',
  copiedPayload: '已复制',
  copyPayload: '复制',
  copyPayloadFailed: '复制失败',
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
  expandPayload: '展开全部',
  input: '输入',
  imagePreviewLoading: '正在加载预览',
  imagePreviewUnavailable: '预览不可用',
  imagePreviewResolverUnavailable: '图片预览授权不可用。',
  imagePreviewLoadFailed: '无法加载已授权的图片预览。',
  closeImagePreview: '关闭图片预览',
  openImagePreview: '打开图片预览',
  loadingConfiguration: '正在加载模型配置…',
  loading: '正在加载 DSH 会话…',
  output: '结果',
  model: '模型',
  newConversation: '新会话',
  modelRequired: '发送前请选择已配置的模型。',
  permissions: '待处理权限',
  placeholder: '向 DSH Agent 提问…',
  restartRuntime: '重启 DSH',
  restartingRuntime: '正在重启 DSH 运行时…',
  runtimeUnavailableTitle: 'DSH 运行时不可用',
  send: '发送消息',
  selectModel: '选择模型',
  toolStatus: { pending: '等待中', in_progress: '运行中', completed: '已完成', failed: '失败' },
  thought: '思考过程',
  turnDuration: '用时 {duration}',
  durationSeconds: '{seconds}秒',
  durationMinutesSeconds: '{minutes}分{seconds}秒',
  turnElapsed: '已用时 {duration}',
  turnEnded: '回合 {turn} 已结束',
  turnInProgress: '回合 {turn} 处理中',
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
