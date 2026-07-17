import { memo } from 'react';
import type { Message } from '@neko-agent/types';
import { ToolCallDisplay, ToolCallGroupDisplay } from '@/components/ChatView/ToolCallDisplay';
import { DiffBlock } from '@/components/ChatView/DiffBlock';
import { TaskCard, BatchTaskCard } from '@/components/ChatView/TaskCard';
import { SubAgentCard } from '@/components/ChatView/SubAgentCard';
import { ProcessRecordsGroup } from '@/components/ChatView/ProcessRecordsGroup';
import { ContentBlockItem } from '@/components/ChatView/ContentBlockItem';
import { MessageActions } from '@/components/ChatView/MessageActions';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import { MarkdownRenderer, ThinkingBlock } from '@/components/ChatView/MessageContent';
import { ImagePreview, AudioCard, VideoCard } from '@/components/ChatView/MediaPreview';
import { MessageAvatar } from '@/components/ChatView/MessageAvatar';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import {
  selectMessageLevelSubAgentWorkItems,
  selectMessageTaskWorkItems,
} from '@/components/AgentWorkItem';
import {
  deriveToolCallsFromContentBlocks,
  projectContentBlocksDisplay,
  projectContentBlocksUi,
  type ContentBlockUiProjection,
} from '@/presenters/content-block-presenter';
import {
  projectMessageAttachments,
  type MessageAttachmentProjection,
} from '@/presenters/message-attachment-presenter';
import {
  projectAttachmentReferenceToken,
  projectMessageContextReferenceToken,
} from '@/presenters/reference-token-presenter';
import { AgentHostMessages } from '@/messages';
import { projectMarkdownResourceRendering } from '@/presenters/markdown-resource-rendering-presenter';
import {
  DEFAULT_MESSAGE_IDENTITIES,
  selectMessageIdentity,
  type MessageIdentityMap,
} from '@/components/ChatView/message-identity';
import { ReferenceToken } from '@/components/ChatView/InputArea/ReferenceToken';
import { createAgentMarkdownSessionKey } from '@/markdown/agent-markdown-session-registry';

type MessageContextReference = NonNullable<Message['contextReferences']>[number];

interface MessageItemProps {
  message: Message;
  conversationId: string | null;
  identities?: MessageIdentityMap;
  // P2: Message operations
  onEditMessage?: (messageId: string) => void;
  onResendFrom?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
  // Layout options
  showAvatar?: boolean;
  isGrouped?: boolean;
}

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Attachment preview component
function AttachmentDisplay({ projection }: { projection: MessageAttachmentProjection }) {
  if (projection.previewKind === 'image' && projection.previewSrc) {
    return <ImagePreview src={projection.previewSrc} alt={projection.name} className="mt-1" />;
  }

  if (projection.previewKind === 'audio' && projection.previewSrc) {
    return (
      <AudioCard
        src={projection.previewSrc}
        title={projection.name}
        className="mt-1 w-full max-w-[400px]"
      />
    );
  }

  if (projection.previewKind === 'video' && projection.previewSrc) {
    return (
      <VideoCard
        src={projection.previewSrc}
        title={projection.name}
        className="mt-1 w-full max-w-[500px]"
      />
    );
  }

  const token = projectAttachmentReferenceToken(projection.attachment);
  return (
    <ReferenceToken
      kind={token.kind}
      label={token.label}
      title={token.title}
      meta={token.meta}
      thumbnailSrc={token.thumbnailSrc}
      variant="inline"
      className="mt-1"
    />
  );
}

function MessageContextReferenceDisplay({ reference }: { reference: MessageContextReference }) {
  const token = projectMessageContextReferenceToken(reference);
  return (
    <ReferenceToken
      kind={token.kind}
      label={token.label}
      title={token.title}
      meta={token.meta}
      thumbnailSrc={token.thumbnailSrc}
      onClick={() =>
        AgentHostMessages.revealContextSource(
          reference.type,
          reference.id,
          reference.navigationData,
        )
      }
    />
  );
}

/**
 * Render a single content block
 */
function ContentBlockRenderer({
  projection,
  conversationId,
  messageId,
  workItemIds,
  contextChips,
  ambientNodes,
  onAcceptDiff,
  onRejectDiff,
}: {
  projection: ContentBlockUiProjection;
  conversationId: string | null;
  messageId: string;
  workItemIds?: string[];
  contextChips?: ReturnType<typeof useMessageActions>['contextChips'];
  ambientNodes?: ReturnType<typeof useMessageActions>['ambientNodes'];
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
}) {
  switch (projection.renderKind) {
    case 'thinking':
      return (
        <div className="mb-2">
          <ThinkingBlock
            content={projection.thinking}
            isComplete={projection.isThinkingComplete}
            sessionKey={createAgentMarkdownSessionKey({
              conversationId,
              messageId,
              itemId: projection.id,
            })}
          />
        </div>
      );

    case 'markdown': {
      const markdownResources = !projection.renderStreaming
        ? projectMarkdownResourceRendering({
            markdown: projection.content,
            siblingBlocks: projection.siblingBlocks,
            toolCalls: projection.toolCalls,
            contextChips,
            ambientNodes,
          })
        : undefined;
      return (
        <div className="agent-bubble agent-bubble-assistant block w-fit max-w-full min-w-0 rounded-2xl rounded-tl-md px-2.5 py-1.5 text-[13px] leading-relaxed">
          <MarkdownRenderer
            content={projection.content}
            isStreaming={projection.renderStreaming}
            markdownResources={markdownResources}
            sessionKey={createAgentMarkdownSessionKey({
              conversationId,
              messageId,
              itemId: projection.id,
            })}
          />
        </div>
      );
    }

    case 'tool':
      return (
        <div className="w-full">
          <ToolCallDisplay
            toolCall={projection.toolCall}
            conversationId={conversationId}
            workItemIds={workItemIds}
          />
        </div>
      );

    case 'toolGroup':
      return (
        <div className="w-full">
          <ToolCallGroupDisplay
            projection={projection}
            conversationId={conversationId}
            workItemIds={workItemIds}
          />
        </div>
      );

    case 'diff':
      return (
        <div className="w-full">
          <DiffBlock diff={projection.codeDiff} onAccept={onAcceptDiff} onReject={onRejectDiff} />
        </div>
      );

    case 'composite':
      return (
        <div className="w-full">
          <RichContentRenderer
            kind={projection.richContent.kind}
            data={projection.richContent.data}
          />
        </div>
      );

    case 'canvasLifecycle':
      return (
        <ContentBlockItem
          projection={projection}
          isFirst={false}
          isLast={false}
          isStreaming={false}
          conversationId={conversationId}
          workItemIds={workItemIds}
        />
      );

    case 'empty':
      return null;
  }
}

/**
 * Render assistant message content using content blocks (chronological order)
 */
function AssistantContentBlocks({
  message,
  isStreaming,
  conversationId,
  onAcceptDiff,
  onRejectDiff,
  pluginsAvailable,
  contextChips,
  ambientNodes,
}: {
  message: Message;
  isStreaming?: boolean;
  conversationId: string | null;
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
  pluginsAvailable?: PluginsAvailable;
  contextChips?: ReturnType<typeof useMessageActions>['contextChips'];
  ambientNodes?: ReturnType<typeof useMessageActions>['ambientNodes'];
}) {
  // If contentBlocks available, render them in order
  if (message.contentBlocks && message.contentBlocks.length > 0) {
    const contentBlocks = message.contentBlocks;
    const projections = projectContentBlocksUi(
      contentBlocks,
      isStreaming,
      undefined,
      contentBlocks,
      deriveToolCallsFromContentBlocks(contentBlocks),
      pluginsAvailable,
    );

    const displayProjection = projectContentBlocksDisplay(projections);
    const displayItems = displayProjection.items;

    return (
      <div className="space-y-2">
        {displayItems.map((displayItem, index) =>
          displayItem.kind === 'projection' ? (
            <ContentBlockRenderer
              key={displayItem.projection.id}
              projection={displayItem.projection}
              conversationId={conversationId}
              messageId={message.id}
              workItemIds={message.workItemIds}
              contextChips={contextChips}
              ambientNodes={ambientNodes}
              onAcceptDiff={onAcceptDiff}
              onRejectDiff={onRejectDiff}
            />
          ) : (
            <ProcessRecordsGroup
              key={displayItem.processGroup.id}
              processGroup={displayItem.processGroup}
              conversationId={conversationId}
              messageId={message.id}
              workItemIds={message.workItemIds}
              siblingBlocks={contentBlocks}
              isFirst={index === 0}
              isStreaming={isStreaming ?? false}
            />
          ),
        )}
      </div>
    );
  }

  return null;
}

// Error message card — prominent red styling for API errors, timeouts, etc.
function ErrorMessageCard({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-[var(--vscode-inputValidation-errorBorder,#be1100)] bg-[var(--vscode-inputValidation-errorBackground,rgba(190,17,0,0.1))] text-[13px] leading-relaxed max-w-full">
      <svg
        className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--vscode-errorForeground,#f14c4c)]"
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM7.25 5v4h1.5V5h-1.5zm0 5v1.5h1.5V10h-1.5z" />
      </svg>
      <div className="min-w-0">
        <div className="text-[var(--vscode-errorForeground,#f14c4c)] font-medium text-[12px] mb-0.5">
          Error
        </div>
        <div className="text-[var(--vscode-foreground)] whitespace-pre-wrap break-words text-[12px] opacity-90">
          {content}
        </div>
      </div>
    </div>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  conversationId,
  onEditMessage,
  onResendFrom,
  onFeedback,
  identities = DEFAULT_MESSAGE_IDENTITIES,
  showAvatar = true,
  isGrouped = false,
}: MessageItemProps) {
  const {
    onCancelTask,
    onRetryTask,
    onViewTaskResult,
    onAcceptDiff,
    onRejectDiff,
    pluginsAvailable,
    contextChips,
    ambientNodes,
    workItems,
  } = useMessageActions();
  // 找出与这条消息关联的工作项
  const relatedTasks = selectMessageTaskWorkItems({ message, workItems }).map((item) => item.task);
  const relatedSubAgents = selectMessageLevelSubAgentWorkItems({ message, workItems });

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isStreaming = message.isStreaming;
  const attachments = projectMessageAttachments(message.attachments);
  const identity = selectMessageIdentity(identities, isUser ? 'user' : 'assistant');

  // System messages (e.g., queued notifications) - centered, subtle styling
  if (isSystem) {
    return (
      <div className="flex justify-center py-1 px-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--agent-bubble-assistant-border)] bg-[var(--agent-bubble-assistant-bg)] px-2.5 py-1 text-[11px] text-[var(--agent-fg-secondary)]">
          {message.isQueued && (
            <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          )}
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  // User messages: right-aligned with avatar on right
  // Assistant messages: left-aligned with avatar on left
  return (
    <div className="agent-message-row group">
      <div className={`flex gap-2 px-2 py-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar - compact 20px */}
        <div className="flex-shrink-0 w-5 pt-0.5">
          {showAvatar && !isGrouped ? (
            <MessageAvatar
              role={isUser ? 'user' : 'assistant'}
              label={identity.avatarLabel}
              imageUri={identity.avatarUri}
              title={identity.title}
            />
          ) : (
            <div className="w-5" />
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 min-w-0 max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}>
          {/* Header: Role name + timestamp */}
          {!isGrouped && (
            <div className={`flex items-center gap-2 mb-0.5 ${isUser ? 'flex-row-reverse' : ''}`}>
              <span
                className={`text-[11px] font-medium ${isUser ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-textLink-foreground)]'}`}
              >
                {identity.displayName}
              </span>
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(message.timestamp)}
              </span>
              {message.editedAt && (
                <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  (edited)
                </span>
              )}
            </div>
          )}

          {/* User message content - compact bubble */}
          {isUser ? (
            <div className="agent-bubble agent-bubble-user block w-fit max-w-full min-w-0 rounded-2xl rounded-tr-md px-2.5 py-1.5 text-[13px] leading-relaxed">
              {/* Context references for user messages */}
              {message.contextReferences && message.contextReferences.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {message.contextReferences.map((ref) => (
                    <MessageContextReferenceDisplay key={ref.id} reference={ref} />
                  ))}
                </div>
              )}
              {/* Attachments for user messages */}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {attachments.map((attachmentProjection) => (
                    <AttachmentDisplay
                      key={attachmentProjection.attachment.id}
                      projection={attachmentProjection}
                    />
                  ))}
                </div>
              )}
              <div className="min-w-0 whitespace-pre-wrap break-words">{message.content}</div>
            </div>
          ) : message.isError ? (
            /* Error message: prominent red card */
            <ErrorMessageCard content={message.content} />
          ) : (
            /* Assistant message: render content blocks in chronological order */
            <AssistantContentBlocks
              message={message}
              isStreaming={isStreaming}
              conversationId={conversationId}
              onAcceptDiff={onAcceptDiff}
              onRejectDiff={onRejectDiff}
              pluginsAvailable={pluginsAvailable}
              contextChips={contextChips}
              ambientNodes={ambientNodes}
            />
          )}

          {/* Background task cards - TaskCard handles all tasks including completed
              ToolCallDisplay skips media preview for backgroundMode tasks */}
          {relatedTasks.length === 1 && (
            <div className="mt-2 w-full">
              <TaskCard
                task={relatedTasks[0]}
                onCancel={onCancelTask}
                onRetry={onRetryTask}
                onViewResult={onViewTaskResult}
                plugins={pluginsAvailable}
              />
            </div>
          )}
          {relatedTasks.length > 1 && (
            <div className="mt-2 w-full">
              <BatchTaskCard
                tasks={relatedTasks}
                onCancel={onCancelTask}
                onCancelAll={() => relatedTasks.forEach((task) => onCancelTask?.(task.scope))}
                onViewResult={onViewTaskResult}
              />
            </div>
          )}
          {relatedSubAgents.map((item) => (
            <div key={item.id} className="mt-2 w-full">
              <SubAgentCard item={item} />
            </div>
          ))}

          {/* Message actions */}
          {!isStreaming && (
            <div
              className={`mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'self-end' : ''}`}
            >
              <MessageActions
                message={message}
                onEdit={isUser && onEditMessage ? () => onEditMessage(message.id) : undefined}
                onResend={isUser && onResendFrom ? () => onResendFrom(message.id) : undefined}
                onFeedback={!isUser && onFeedback ? (fb) => onFeedback(message.id, fb) : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
