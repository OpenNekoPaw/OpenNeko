import { useMemo, useState, useCallback } from 'react';
import {
  Message,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
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
import { selectConversationAttentionWorkItems } from '@/presenters/work-item-presenter';
import type { AgentContextPayload } from '@neko/shared';
import type { AmbientCanvasNodeProjection } from '@/presenters/plugin-transfer-presenter';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import type { ForegroundConversationAvailability } from '@/render-lifecycle/conversation-render-contract';
import type { TabViewportSnapshot } from '@/render-runtime/tab-render-runtime';
import { CharacterDialogueHeader } from '@/components/ChatView/CharacterDialogueHeader';
import { EmbodyCharacterHeader } from '@/components/ChatView/EmbodyCharacterHeader';
import { AgentRunStatus } from '@/components/ChatView/AgentRunStatus';
import { useTranslation } from '@/i18n/I18nContext';
import { projectMessageIdentities } from '@/components/ChatView/message-identity';
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
  }) => void;
  onCancel?: () => void;
  entryPromptMenu?: EntryPromptMenu | null;
  onEntryPromptMenuChange?: (menu: EntryPromptMenu | null) => void;
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
      projectMessageIdentities(
        {
          conversationKind,
          characterDialogueSession,
          embodyCharacterSession,
        },
        t,
      ),
    [characterDialogueSession, conversationKind, embodyCharacterSession, t],
  );
  const attentionWorkItems = useMemo(
    () => selectConversationAttentionWorkItems(messages, workItems ?? []),
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
              <ConversationWorkItemShelf workItems={attentionWorkItems} />
            </div>
          ) : (
            <>
              <ConversationWorkItemShelf workItems={attentionWorkItems} />
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
}: {
  readonly workItems: readonly AgentWorkItem[];
}) {
  const { t } = useTranslation();
  if (workItems.length === 0) return null;
  const subAgentItems = workItems.filter(isSubAgentWorkItem);

  return (
    <section
      className="agent-workitem-shelf px-3 py-2"
      aria-label={t('chat.workItems.attentionTitle')}
      aria-live="polite"
    >
      <div className="agent-workitem-shelf-title">
        {t('chat.workItems.attentionTitle')}
        <span className="agent-workitem-shelf-count">{subAgentItems.length}</span>
      </div>
      {subAgentItems.map((item) => (
        <SubAgentCard key={item.id} item={item} />
      ))}
    </section>
  );
}

function isSubAgentWorkItem(item: AgentWorkItem): item is SubAgentWorkItem {
  return item.kind === 'subagent';
}
