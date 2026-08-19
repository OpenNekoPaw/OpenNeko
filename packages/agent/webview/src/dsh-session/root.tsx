import { useState, type ReactNode } from 'react';
import type { DshPermissionHostProjection } from '@neko/agent-contracts/dsh-permission-host';
import type {
  DshComposerConfigurationProjection,
  DshSessionHostEvent,
  DshSessionHostProjection,
} from '@neko/agent-contracts/dsh-session-host';
import type { ShellExecutionMode } from '@neko/agent-contracts';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import type { ChatModelOption } from '@neko/ai-contracts';
import { InputArea } from '../components/ChatView/InputArea/InputArea';
import { InputAreaProvider } from '../components/ChatView/InputAreaContext';
import type { GenerationParams } from '../components/ChatView/InputArea/types';
import {
  ChevronDownIcon,
  CodeIcon,
  ErrorIcon,
  LoadingIcon,
  MarkdownDocumentView,
  RefreshIcon,
  SegmentedControl,
  StopIcon,
  SuccessIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';

import '../index.css';
import './root.css';

export interface DshAgentViewProps {
  readonly agentSurfaceId: string;
  readonly conversationFeed?: ReactNode;
  readonly conversationId?: string;
  readonly entryKind?: 'assistant' | 'authoring';
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
  readonly onModeChange: (mode: ShellExecutionMode) => void;
  readonly onRestartRuntime: () => void;
  readonly onSubmit: () => void;
}

export function DshAgentView(props: DshAgentViewProps): JSX.Element {
  const { locale } = useTranslation();
  const copy = locale === 'zh-cn' ? ZH_COPY : EN_COPY;
  const runtimeReady = props.runtime?.status === 'running';
  const hasEvents = (props.projection?.events.length ?? 0) > 0;
  const showEmptyState = !hasEvents && !props.conversationFeed;
  const entryKind = props.entryKind ?? 'authoring';
  const emptyTitle = entryKind === 'assistant' ? copy.assistantEmptyTitle : copy.emptyTitle;
  const composer = (
    <DshComposer
      copy={copy}
      entryKind={entryKind}
      configuration={props.composerConfiguration}
      configurationError={props.composerConfigurationError}
      configuring={props.configuring}
      currentTurn={props.projection?.currentTurn}
      disabled={props.submitting || !runtimeReady}
      draft={props.draft}
      onCancel={props.onCancelTurn}
      onDraftChange={props.onDraftChange}
      onModelChange={props.onModelChange}
      onModeChange={props.onModeChange}
      onSubmit={props.onSubmit}
    />
  );

  return (
    <div
      className="dsh-agent-view agent-chat-view flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-agent-surface={props.agentSurfaceId}
      data-dsh-runtime-status={props.runtime?.status ?? 'loading'}
      data-empty-state={showEmptyState}
      data-presentation="desktop-dock"
    >
      {showEmptyState ? (
        <div className="agent-entry-composition flex-1">
          {entryKind === 'assistant' ? (
            <div className="agent-entry-experience-selector">
              <SegmentedControl
                appearance="neutral"
                density="compact"
                label={copy.entryExperience}
                maxWidth={480}
                options={[
                  { value: 'assistant', label: copy.entryConversation },
                  { value: 'authoring', label: copy.entryCreation, disabled: true },
                ]}
                value="assistant"
                onValueChange={(value) => {
                  if (value !== 'assistant') {
                    throw new Error(
                      'Assistant entry cannot switch to Authoring before DSH binding exists.',
                    );
                  }
                }}
              />
            </div>
          ) : null}
          <div className="agent-entry-center-group">
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
  entryKind,
  configuration,
  configurationError,
  configuring,
  currentTurn,
  disabled,
  draft,
  onCancel,
  onDraftChange,
  onModelChange,
  onModeChange,
  onSubmit,
}: {
  readonly copy: DshAgentCopy;
  readonly entryKind: 'assistant' | 'authoring';
  readonly configuration?: DshComposerConfigurationProjection;
  readonly configurationError?: string;
  readonly configuring: boolean;
  readonly currentTurn?: number;
  readonly disabled: boolean;
  readonly draft: string;
  readonly onCancel: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onModelChange: (modelOptionId: string) => void;
  readonly onModeChange: (mode: ShellExecutionMode) => void;
  readonly onSubmit: () => void;
}): JSX.Element {
  const models: ChatModelOption[] = (configuration?.models ?? []).map((model) => ({
    id: model.id,
    label: model.label,
    providerId: model.providerId,
    modelId: model.modelId,
    providerLabel: model.providerId,
    category: 'llm',
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
      isBusy={disabled || configuring}
      modelCatalogStatus={configuration === undefined ? 'loading' : 'ready'}
      selectedModel={configuration?.selectedModelOptionId ?? ''}
      availableModels={models}
      onModelSelect={onModelChange}
      mediaModelSelection={{ image: '', video: '', audio: '' }}
      availableMediaModels={[]}
      mediaUnderstandingSelection={{ image: '', video: '', audio: '' }}
      onMediaModelSelect={() => undefined}
      onMediaUnderstandingModelSelect={() => undefined}
      sessionMode="agent"
      onSessionModeChange={() => undefined}
      executionMode={configuration?.executionMode ?? 'ask'}
      onExecutionModeChange={onModeChange}
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
          presentation="entry"
          inputValue={draft}
          isThinking={false}
          isRunActive={false}
          onInputChange={onDraftChange}
          onSend={() => {
            if (configurationDiagnostic || disabled || draft.trim().length === 0) return false;
            onSubmit();
            return true;
          }}
          onCancel={onCancel}
          disabled={disabled || configuring || configuration === undefined}
          attachmentsDisabled
          availableExecutionModes={
            Object.fromEntries(
              (configuration?.modes ?? []).map((mode) => [mode.id, mode.available]),
            ) as Record<ShellExecutionMode, boolean>
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
            entryKind === 'assistant'
              ? [
                  { kind: 'character', label: '选择角色', disabled: true },
                  { kind: 'world', label: '选择世界', disabled: true },
                ]
              : undefined
          }
        />
        {currentTurn !== undefined ? (
          <button
            type="button"
            className="agent-composer-action-button agent-composer-stop"
            aria-label={copy.cancelTurn}
            title={copy.cancelTurn}
            onClick={onCancel}
          >
            <StopIcon size={14} />
          </button>
        ) : null}
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
  readonly chooseWorld: string;
  readonly emptyTitle: string;
  readonly entryContext: string;
  readonly entryContextUnavailable: string;
  readonly entryConversation: string;
  readonly entryCreation: string;
  readonly entryExperience: string;
  readonly input: string;
  readonly executionMode: string;
  readonly loadingConfiguration: string;
  readonly modeLabels: Readonly<Record<ShellExecutionMode, string>>;
  readonly model: string;
  readonly modelAndMode: string;
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
  chooseWorld: 'Choose world',
  emptyTitle: 'Hi, start creating with a conversation',
  entryContext: 'Conversation context',
  entryContextUnavailable: 'Character and World context is not connected to DSH yet.',
  entryConversation: 'Conversation',
  entryCreation: 'Creation',
  entryExperience: 'Entry experience',
  executionMode: 'Execution mode',
  input: 'Input',
  loadingConfiguration: 'Loading model configuration…',
  loading: 'Loading DSH session…',
  output: 'Result',
  modeLabels: { plan: 'Plan', ask: 'Ask', auto: 'Auto' },
  model: 'Model',
  modelAndMode: 'Model and execution mode',
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
  chooseWorld: '选择世界',
  emptyTitle: 'Hi，用对话开启创作',
  entryContext: '对话上下文',
  entryContextUnavailable: '角色和世界上下文尚未接入 DSH。',
  entryConversation: '对话',
  entryCreation: '创作',
  entryExperience: '入口模式',
  executionMode: '执行模式',
  input: '输入',
  loadingConfiguration: '正在加载模型配置…',
  loading: '正在加载 DSH 会话…',
  output: '结果',
  modeLabels: { plan: 'Plan', ask: 'Ask', auto: 'Auto' },
  model: '模型',
  modelAndMode: '模型与执行模式',
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
  workspaceContext: '工作区与画布上下文',
};
