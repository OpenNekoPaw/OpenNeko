import { memo } from 'react';
import type { Message, ToolCall } from '@neko/agent-contracts';
import { SubAgentCard } from './SubAgentCard';
import { ContentBlockItem } from './ContentBlockItem';
import { MessageActions } from './MessageActions';
import { MarkdownRenderer } from './MessageContent';
import { MessageAvatar } from './MessageAvatar';
import type { PluginsAvailable } from './SendToMenu';
import { useMessageActions } from './MessageActionsContext';
import { selectMessageLevelSubAgentWorkItems } from '../AgentWorkItem';
import {
  deriveToolCallsFromContentBlocks,
  projectAssistantTurn,
  projectContentBlocksUi,
} from '../../presenters/content-block-presenter';
import {
  projectMessageAttachments,
  type MessageAttachmentProjection,
} from '../../presenters/message-attachment-presenter';
import {
  projectAttachmentReferenceToken,
  projectMessageContextReferenceToken,
} from '../../presenters/reference-token-presenter';
import { useAgentHostMessages } from '../../host-runtime-context';
import { selectMessageIdentity, type MessageIdentityMap } from './message-identity';
import { ReferenceToken } from './InputArea/ReferenceToken';
import { AssistantTurnActivity } from './AssistantTurnActivity';
import { useTranslation } from '../../i18n/I18nContext';
import { ErrorIcon } from '@neko/ui/icons';
import { formatMessageTime } from './message-time';

type MessageContextReference = NonNullable<Message['contextReferences']>[number];

interface MessageItemProps {
  message: Message;
  conversationId: string | null;
  identities: MessageIdentityMap;
  // P2: Message operations
  onEditMessage?: (messageId: string) => void;
  onResendFrom?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
  // Layout options
  showAvatar?: boolean;
  isGrouped?: boolean;
  ambientToolCalls?: readonly ToolCall[];
}

// Attachment preview component
function AttachmentDisplay({ projection }: { projection: MessageAttachmentProjection }) {
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
  const agentHostMessages = useAgentHostMessages();
  const token = projectMessageContextReferenceToken(reference);
  return (
    <ReferenceToken
      kind={token.kind}
      label={token.label}
      title={token.title}
      meta={token.meta}
      thumbnailSrc={token.thumbnailSrc}
      onClick={() =>
        agentHostMessages.revealContextSource(
          reference.type,
          reference.id,
          reference.contentLocator,
          reference.navigationData,
        )
      }
    />
  );
}

function AssistantContentBlocks({
  message,
  isStreaming,
  conversationId,
  pluginsAvailable,
  ambientToolCalls,
}: {
  message: Message;
  isStreaming?: boolean;
  conversationId: string | null;
  pluginsAvailable?: PluginsAvailable;
  ambientToolCalls?: readonly ToolCall[];
}) {
  if (message.contentBlocks && message.contentBlocks.length > 0) {
    const contentBlocks = message.contentBlocks;
    const projections = projectContentBlocksUi(
      contentBlocks,
      isStreaming,
      contentBlocks,
      deriveToolCallsFromContentBlocks(contentBlocks),
      pluginsAvailable,
      ambientToolCalls,
    );
    const turn = projectAssistantTurn(projections, message.turnTiming);

    return (
      <div className="agent-assistant-turn">
        {turn.actionable.map((projection) => (
          <ContentBlockItem
            key={projection.id}
            projection={projection}
            conversationId={conversationId}
            messageId={message.id}
            workItemIds={message.workItemIds}
          />
        ))}

        <AssistantTurnActivity
          projections={turn.activity}
          summary={turn.activitySummary}
          conversationId={conversationId}
          messageId={message.id}
        />

        {turn.answer.length > 0 && (
          <div className="agent-turn-answer">
            {turn.answer.map((projection) => (
              <ContentBlockItem
                key={projection.id}
                projection={projection}
                conversationId={conversationId}
                messageId={message.id}
                workItemIds={message.workItemIds}
              />
            ))}
          </div>
        )}

        {turn.deliverables.length > 0 && (
          <div className="agent-turn-deliverables">
            {turn.deliverables.map((projection) => (
              <ContentBlockItem
                key={projection.id}
                projection={projection}
                conversationId={conversationId}
                messageId={message.id}
                workItemIds={message.workItemIds}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (message.content.trim().length > 0) {
    return (
      <div className="agent-assistant-turn">
        <div className="agent-turn-answer agent-turn-text-lane">
          <MarkdownRenderer content={message.content} isStreaming={isStreaming ?? false} />
        </div>
      </div>
    );
  }

  return null;
}

function InlineErrorMessage({ content, label }: { content: string; label: string }) {
  return (
    <div className="agent-inline-diagnostic" role="alert">
      <span aria-hidden="true">
        <ErrorIcon className="agent-inline-diagnostic__icon" />
      </span>
      <div className="agent-inline-diagnostic__content">
        <strong>{label}</strong>
        <span>{content}</span>
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
  identities,
  showAvatar = true,
  isGrouped = false,
  ambientToolCalls,
}: MessageItemProps) {
  const { t } = useTranslation();
  const { pluginsAvailable, workItems } = useMessageActions();
  // 找出与这条消息关联的工作项
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

  return (
    <div className={`agent-message-row group ${isUser ? '' : 'agent-assistant-turn-row'}`}>
      <div className={`flex gap-2 px-2 py-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
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

        <div
          className={`flex-1 min-w-0 ${
            isUser ? 'flex max-w-[85%] flex-col items-end' : 'max-w-none'
          }`}
        >
          {!isGrouped && isUser && (
            <div className="mb-0.5 flex flex-row-reverse items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--neko-foreground)]">
                {identity.displayName}
              </span>
              <span className="text-[10px] text-[var(--neko-descriptionForeground)] opacity-0 transition-opacity group-hover:opacity-100">
                {formatMessageTime(message.timestamp)}
              </span>
              {message.editedAt && (
                <span className="text-[10px] text-[var(--neko-descriptionForeground)]">
                  (edited)
                </span>
              )}
            </div>
          )}

          {isUser ? (
            <div className="agent-user-prompt block w-fit max-w-full min-w-0">
              {message.contextReferences && message.contextReferences.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {message.contextReferences.map((ref) => (
                    <MessageContextReferenceDisplay key={ref.id} reference={ref} />
                  ))}
                </div>
              )}
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
            <InlineErrorMessage content={message.content} label={t('chat.message.error')} />
          ) : (
            <AssistantContentBlocks
              message={message}
              isStreaming={isStreaming}
              conversationId={conversationId}
              pluginsAvailable={pluginsAvailable}
              ambientToolCalls={ambientToolCalls}
            />
          )}

          {relatedSubAgents.map((item) => (
            <div key={item.id} className="mt-2 w-full">
              <SubAgentCard item={item} />
            </div>
          ))}

          {!isStreaming && (
            <div
              className={`mt-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${isUser ? 'self-end' : ''}`}
            >
              {!isUser && (
                <span className="text-[10px] text-[var(--neko-descriptionForeground)]">
                  {formatMessageTime(message.timestamp)}
                </span>
              )}
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
