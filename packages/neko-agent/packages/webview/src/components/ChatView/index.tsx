import { useMemo, useState, useCallback } from 'react';
import {
  Message,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
  type AgentLlmConfig,
  type AgentModelSlots,
  type AgentQueuedMessageItem,
} from '@neko-agent/types';
import { MessageList } from '@/components/ChatView/MessageList';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { InputArea, MessageAttachment } from '@/components/ChatView/InputArea';
import type {
  ComposerMenuState,
  EntryPromptMenu,
  SelectedFileReference,
} from '@/components/ChatView/InputArea/types';
import { DropZone } from '@/components/ChatView/DropZone';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { AgentWorkItem, SubAgentWorkItem } from '@/components/AgentWorkItem';
import type { AgentContextPayload, TaskRunScope } from '@neko/shared';
import type { AmbientCanvasNodeProjection } from '@/presenters/plugin-transfer-presenter';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import type { ForegroundConversationAvailability } from '@/render-lifecycle/conversation-render-contract';
import type { TabViewportSnapshot } from '@/render-runtime/tab-render-runtime';
import { CharacterDialogueHeader } from '@/components/ChatView/CharacterDialogueHeader';
import { EmbodyCharacterHeader } from '@/components/ChatView/EmbodyCharacterHeader';
import { AgentRunStatus } from '@/components/ChatView/AgentRunStatus';
import { useTranslation } from '@/i18n/I18nContext';
import { projectMessageIdentities } from '@/components/ChatView/message-identity';
import { TaskCard, BatchTaskCard } from '@/components/ChatView/TaskCard';
import { SubAgentCard } from '@/components/ChatView/SubAgentCard';
interface ChatViewProps {
  messages: Message[];
  inputValue: string;
  isThinking: boolean;
  /** Conversation-owned run state used by composer controls; independent from thinking visuals. */
  isRunActive?: boolean;
  queuedMessageCount?: number;
  queuedMessages?: readonly AgentQueuedMessageItem[];
  streamingMessageId: string | null;
  activeConversationId: string | null;
  conversationKind?: ConversationKind;
  characterDialogueSession?: CharacterDialogueSessionProjection;
  embodyCharacterSession?: EmbodyCharacterSessionProjection;
  isConversationSwitching?: boolean;
  composerDisabled?: boolean;
  foregroundConversationAvailability?: ForegroundConversationAvailability;
  activationProgress?: readonly ActivationProgressTimeline[];
  viewport?: TabViewportSnapshot;
  onViewportChange?: (viewport: TabViewportSnapshot) => void;
  // Unified work items
  workItems?: AgentWorkItem[];
  pluginsAvailable?: PluginsAvailable;
  contextChips?: readonly AgentContextPayload[];
  ambientNodes?: readonly AmbientCanvasNodeProjection[];
  onCancelTask?: (taskScope: TaskRunScope) => void;
  onRetryTask?: (taskScope: TaskRunScope) => void;
  onViewTaskResult?: (taskScope: TaskRunScope, resultRef?: string) => void;
  // Code diff actions
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
  // Input callbacks
  onInputChange: (value: string) => void;
  onPromoteQueuedMessage?: (queueItemId: string) => void;
  onCancelQueuedMessage?: (queueItemId: string) => void;
  onEditQueuedMessage?: (queueItemId: string) => void;
  onSend: (input?: {
    messageText?: string;
    displayMessageText?: string;
    attachments?: MessageAttachment[];
    contextPayloads?: AgentContextPayload[];
    fileReferences?: SelectedFileReference[];
    agentModels?: AgentModelSlots;
    llmConfig?: AgentLlmConfig;
  }) => void;
  onCancel?: () => void;
  entryPromptMenu?: EntryPromptMenu | null;
  onEntryPromptMenuChange?: (menu: EntryPromptMenu | null) => void;
  llmConfig?: AgentLlmConfig;
  onLlmConfigChange?: (config: AgentLlmConfig) => void;
  composerMenuState?: ComposerMenuState;
  onComposerMenuStateChange?: (state: ComposerMenuState) => void;
  /** Session-bound attached files (managed by parent) */
  attachedFiles?: MessageAttachment[];
  /** Callback to update attached files */
  onAttachedFilesChange?: (files: MessageAttachment[]) => void;
  /** Session-bound @file references selected from the mention menu. */
  selectedFileReferences?: SelectedFileReference[];
  onSelectedFileReferencesChange?: (references: SelectedFileReference[]) => void;
  isComposing?: boolean;
  onCompositionChange?: (isComposing: boolean) => void;
  focusRequestOwner?: string;
  focusRequestEnabled?: boolean;
  focusRequestTarget?: 'none' | 'input';
  focusRequestRevision?: number;
  /** Current agent execution state (null when idle) */
  agentState?: AgentState | null;
}

export function ChatView({
  messages,
  inputValue,
  isThinking,
  isRunActive = isThinking,
  queuedMessageCount = 0,
  queuedMessages = [],
  streamingMessageId,
  activeConversationId,
  conversationKind = 'chat',
  characterDialogueSession,
  embodyCharacterSession,
  isConversationSwitching = false,
  composerDisabled = false,
  foregroundConversationAvailability = { kind: 'ready' },
  activationProgress = [],
  viewport,
  onViewportChange,
  workItems,
  pluginsAvailable,
  contextChips,
  ambientNodes,
  onCancelTask,
  onRetryTask,
  onViewTaskResult,
  onAcceptDiff,
  onRejectDiff,
  onInputChange,
  onPromoteQueuedMessage,
  onCancelQueuedMessage,
  onEditQueuedMessage,
  onSend,
  onCancel,
  entryPromptMenu,
  onEntryPromptMenuChange,
  llmConfig,
  onLlmConfigChange,
  composerMenuState,
  onComposerMenuStateChange,
  attachedFiles,
  onAttachedFilesChange,
  selectedFileReferences,
  onSelectedFileReferencesChange,
  isComposing,
  onCompositionChange,
  focusRequestOwner,
  focusRequestEnabled,
  focusRequestTarget,
  focusRequestRevision,
  agentState = null,
}: ChatViewProps) {
  const { t } = useTranslation();
  const isEmpty = messages.length === 0 && !isThinking;
  const messageIdentities = useMemo(
    () =>
      projectMessageIdentities({
        conversationKind,
        characterDialogueSession,
        embodyCharacterSession,
      }),
    [characterDialogueSession, conversationKind, embodyCharacterSession],
  );
  const unanchoredWorkItems = useMemo(
    () => selectUnanchoredWorkItems(messages, workItems ?? []),
    [messages, workItems],
  );
  // P2: Dropped files state for DropZone integration
  const [droppedFiles, setDroppedFiles] = useState<MessageAttachment[]>([]);

  const handleFilesDropped = useCallback((files: MessageAttachment[]) => {
    setDroppedFiles(files);
  }, []);

  const handleDroppedFilesProcessed = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  return (
    <DropZone onFilesDropped={handleFilesDropped} disabled={isRunActive}>
      <div className="agent-chat-view flex-1 flex flex-col overflow-hidden relative h-full">
        {conversationKind === 'character-dialogue' && characterDialogueSession && (
          <CharacterDialogueHeader session={characterDialogueSession} />
        )}

        {conversationKind === 'embody-character' && embodyCharacterSession && (
          <EmbodyCharacterHeader session={embodyCharacterSession} />
        )}

        {/* Messages Container */}
        <MessageActionsProvider
          activeConversationId={activeConversationId}
          workItems={workItems}
          pluginsAvailable={pluginsAvailable}
          contextChips={contextChips}
          ambientNodes={ambientNodes}
          onCancelTask={onCancelTask}
          onRetryTask={onRetryTask}
          onViewTaskResult={onViewTaskResult}
          onAcceptDiff={onAcceptDiff}
          onRejectDiff={onRejectDiff}
        >
          {foregroundConversationAvailability.kind !== 'ready' ? (
            <div
              className="agent-chat-empty-scroll flex flex-1 items-center justify-center overflow-y-auto px-6 text-center text-sm text-[var(--vscode-descriptionForeground,var(--agent-fg-muted))]"
              role={foregroundConversationAvailability.kind === 'loading' ? 'status' : 'alert'}
            >
              {foregroundConversationAvailability.kind === 'loading'
                ? t('chat.conversation.loading')
                : foregroundConversationAvailability.diagnostic}
            </div>
          ) : isEmpty ? (
            <div className="agent-chat-empty-scroll flex-1 overflow-y-auto">
              <ConversationWorkItemShelf
                workItems={unanchoredWorkItems}
                pluginsAvailable={pluginsAvailable}
                onCancelTask={onCancelTask}
                onRetryTask={onRetryTask}
                onViewTaskResult={onViewTaskResult}
              />
            </div>
          ) : (
            <>
              <ConversationWorkItemShelf
                workItems={unanchoredWorkItems}
                pluginsAvailable={pluginsAvailable}
                onCancelTask={onCancelTask}
                onRetryTask={onRetryTask}
                onViewTaskResult={onViewTaskResult}
              />
              <MessageList
                messages={messages}
                isThinking={isThinking}
                streamingMessageId={streamingMessageId}
                activeConversationId={activeConversationId}
                identities={messageIdentities}
                activationProgress={activationProgress}
                viewport={viewport}
                onViewportChange={onViewportChange}
              />
            </>
          )}
        </MessageActionsProvider>

        <AgentRunStatus agentState={agentState} />

        {/* Input Area */}
        <InputArea
          inputValue={inputValue}
          isThinking={isThinking}
          isRunActive={isRunActive}
          queuedMessageCount={queuedMessageCount}
          queuedMessages={queuedMessages}
          droppedFiles={droppedFiles}
          onDroppedFilesProcessed={handleDroppedFilesProcessed}
          onInputChange={onInputChange}
          onPromoteQueuedMessage={onPromoteQueuedMessage}
          onCancelQueuedMessage={onCancelQueuedMessage}
          onEditQueuedMessage={onEditQueuedMessage}
          onSend={onSend}
          onCancel={onCancel}
          entryPromptMenu={entryPromptMenu}
          onEntryPromptMenuChange={onEntryPromptMenuChange}
          llmConfig={llmConfig}
          onLlmConfigChange={onLlmConfigChange}
          composerMenuState={composerMenuState}
          onComposerMenuStateChange={onComposerMenuStateChange}
          disabled={
            composerDisabled ||
            isConversationSwitching ||
            foregroundConversationAvailability.kind !== 'ready'
          }
          attachedFiles={attachedFiles}
          onAttachedFilesChange={onAttachedFilesChange}
          selectedFileReferences={selectedFileReferences}
          onSelectedFileReferencesChange={onSelectedFileReferencesChange}
          isComposing={isComposing}
          onCompositionChange={onCompositionChange}
          focusRequestOwner={focusRequestOwner}
          focusRequestEnabled={focusRequestEnabled}
          focusRequestTarget={focusRequestTarget}
          focusRequestRevision={focusRequestRevision}
        />
      </div>
    </DropZone>
  );
}

function ConversationWorkItemShelf({
  workItems,
  pluginsAvailable,
  onCancelTask,
  onRetryTask,
  onViewTaskResult,
}: {
  readonly workItems: readonly AgentWorkItem[];
  readonly pluginsAvailable?: PluginsAvailable;
  readonly onCancelTask?: (taskScope: TaskRunScope) => void;
  readonly onRetryTask?: (taskScope: TaskRunScope) => void;
  readonly onViewTaskResult?: (taskScope: TaskRunScope, resultRef?: string) => void;
}) {
  if (workItems.length === 0) return null;
  const taskItems = workItems.filter(isTaskWorkItem);
  const subAgentItems = workItems.filter(isSubAgentWorkItem);

  return (
    <div className="agent-workitem-shelf px-3 py-2">
      {taskItems.length === 1 && (
        <TaskCard
          task={taskItems[0].task}
          onCancel={onCancelTask}
          onRetry={onRetryTask}
          onViewResult={onViewTaskResult}
          plugins={pluginsAvailable}
        />
      )}
      {taskItems.length > 1 && (
        <BatchTaskCard
          tasks={taskItems.map((item) => item.task)}
          onCancel={onCancelTask}
          onCancelAll={() => taskItems.forEach((item) => onCancelTask?.(item.task.scope))}
          onViewResult={onViewTaskResult}
        />
      )}
      {subAgentItems.map((item) => (
        <SubAgentCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function selectUnanchoredWorkItems(
  messages: readonly Message[],
  workItems: readonly AgentWorkItem[],
): AgentWorkItem[] {
  if (workItems.length === 0) return [];
  const linkedIds = new Set(messages.flatMap((message) => message.workItemIds ?? []));
  return workItems.filter((item) => !linkedIds.has(item.id));
}

function isTaskWorkItem(
  item: AgentWorkItem,
): item is Extract<AgentWorkItem, { kind: 'media-task' | 'tool-background-task' }> {
  return item.kind !== 'subagent';
}

function isSubAgentWorkItem(item: AgentWorkItem): item is SubAgentWorkItem {
  return item.kind === 'subagent';
}
