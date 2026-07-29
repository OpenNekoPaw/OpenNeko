import { memo, useCallback, useState } from 'react';
import type { ContentBlock, ToolCall } from '@neko-agent/types';
import type { ContentBlockProcessGroupProjection } from '@/presenters/content-block-presenter';
import { ContentBlockItem } from '@/components/ChatView/ContentBlockItem';
import { MessageAvatar } from '@/components/ChatView/MessageAvatar';
import type { MessageSpeakerIdentity } from '@/components/ChatView/message-identity';
import { useTranslation } from '@/i18n/I18nContext';
import { ChevronIcon, ToolLoadingSpinner } from '@/components/ChatView/ToolCallDisplay';

interface ProcessRecordsGroupProps {
  processGroup: ContentBlockProcessGroupProjection;
  conversationId: string | null;
  messageId: string;
  workItemIds?: string[];
  siblingBlocks: ContentBlock[];
  ambientToolCalls?: readonly ToolCall[];
  isFirst?: boolean;
  isStreaming: boolean;
  assistantIdentity?: MessageSpeakerIdentity;
}

function ProcessRecordsGroupComponent({
  processGroup,
  conversationId,
  messageId,
  workItemIds,
  siblingBlocks,
  ambientToolCalls,
  isFirst = false,
  isStreaming,
  assistantIdentity,
}: ProcessRecordsGroupProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const isRunning = processGroup.isStreaming;
  const summaryParts = [
    t('chat.processRecords.steps', { count: processGroup.blockCount }),
    processGroup.toolCallCount > 0
      ? t('chat.processRecords.tools', { count: processGroup.toolCallCount })
      : null,
    processGroup.thinkingCount > 0
      ? t('chat.processRecords.thinking', { count: processGroup.thinkingCount })
      : null,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);

  return (
    <div className="agent-message-row group">
      <div className="flex gap-2 px-2 py-1">
        <div className="flex-shrink-0 w-5 pt-0.5">
          {isFirst ? (
            <MessageAvatar
              role="assistant"
              label={assistantIdentity?.avatarLabel}
              imageUri={assistantIdentity?.avatarUri}
              title={assistantIdentity?.title}
            />
          ) : (
            <div className="w-5" />
          )}
        </div>
        <div className="flex-1 min-w-0 max-w-[85%]">
          <button
            type="button"
            className="flex w-fit max-w-full items-center gap-1.5 rounded-md border border-[var(--agent-divider)] bg-[var(--agent-bubble-assistant-bg)] px-2 py-1 text-left text-[11px] text-[var(--agent-fg-secondary)] transition-colors hover:bg-[var(--agent-hover)]"
            aria-expanded={isExpanded}
            onClick={toggleExpand}
          >
            {isRunning ? (
              <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
            ) : (
              <ChevronIcon
                className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            )}
            <span className="shrink-0 font-medium text-[var(--agent-fg)]">
              {t('chat.processRecords.title')}
            </span>
            <span className="min-w-0 truncate">{summaryParts.join(' / ')}</span>
            <span className="shrink-0 text-[var(--agent-accent)]">
              {isExpanded ? t('chat.processRecords.hide') : t('chat.processRecords.show')}
            </span>
          </button>

          {isExpanded && (
            <div className="mt-1 border-l border-[var(--agent-divider)] pl-2">
              {processGroup.projections.map((projection, index) => (
                <ContentBlockItem
                  key={projection.id}
                  projection={projection}
                  isFirst={false}
                  isLast={index === processGroup.projections.length - 1}
                  isStreaming={isStreaming}
                  conversationId={conversationId}
                  messageId={messageId}
                  workItemIds={workItemIds}
                  siblingBlocks={siblingBlocks}
                  ambientToolCalls={ambientToolCalls}
                  assistantIdentity={assistantIdentity}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ProcessRecordsGroup = memo(ProcessRecordsGroupComponent);
