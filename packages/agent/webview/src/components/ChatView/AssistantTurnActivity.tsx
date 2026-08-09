import { memo, useCallback, useState } from 'react';
import type { ToolCall } from '@neko/agent-contracts';
import type {
  AssistantTurnActivitySummary,
  ContentBlockUiProjection,
  ToolGroupContentBlockProjection,
} from '../../presenters/content-block-presenter';
import { projectToolCallDisplayState } from '../../presenters/tool-call-presenter';
import { useTranslation } from '../../i18n/I18nContext';
import { MarkdownRenderer } from './MessageContent';
import { DocumentImageThumbnails } from './ToolCallDisplay/DocumentImageThumbnails';
import {
  ChevronIcon,
  ErrorIcon,
  SuccessIcon,
  ToolLoadingSpinner,
  WarningIcon,
} from './ToolCallDisplay/icons';
import { createAgentMarkdownSessionKey } from '../../markdown/agent-markdown-session-registry';

interface AssistantTurnActivityProps {
  readonly projections: readonly ContentBlockUiProjection[];
  readonly summary: AssistantTurnActivitySummary;
  readonly conversationId: string | null;
  readonly messageId: string;
}

function AssistantTurnActivityComponent({
  projections,
  summary,
  conversationId,
  messageId,
}: AssistantTurnActivityProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setIsExpanded((value) => !value), []);

  if (projections.length === 0) return null;

  const summaryParts = [
    summary.toolCallCount > 0
      ? t('chat.processRecords.tools', { count: summary.toolCallCount })
      : null,
    summary.thinkingCount > 0
      ? t('chat.processRecords.thinking', { count: summary.thinkingCount })
      : null,
    summary.toolCallCount === 0 && summary.thinkingCount === 0
      ? t('chat.processRecords.steps', { count: summary.blockCount })
      : null,
  ].filter((part): part is string => typeof part === 'string');

  return (
    <section className="agent-turn-activity" aria-label={t('chat.processRecords.title')}>
      <button
        type="button"
        className="agent-turn-activity-summary"
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
      >
        {summary.isStreaming ? (
          <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
        ) : (
          <ChevronIcon
            className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        )}
        <span className="font-medium text-[var(--agent-fg)]">{t('chat.processRecords.title')}</span>
        <span className="min-w-0 truncate">{summaryParts.join(' · ')}</span>
      </button>

      {isExpanded && (
        <div className="agent-turn-activity-list">
          {projections.map((projection) => (
            <ActivityProjection
              key={projection.id}
              projection={projection}
              conversationId={conversationId}
              messageId={messageId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityProjection({
  projection,
  conversationId,
  messageId,
}: {
  readonly projection: ContentBlockUiProjection;
  readonly conversationId: string | null;
  readonly messageId: string;
}) {
  const { t } = useTranslation();
  switch (projection.renderKind) {
    case 'thinking':
      return (
        <div className="agent-turn-activity-item">
          <div className="agent-turn-activity-item-title">
            <span className="agent-turn-activity-dot" />
            <span>{t('chat.processRecords.thinkingLabel')}</span>
          </div>
          <div className="agent-turn-activity-detail">
            <MarkdownRenderer
              content={projection.thinking}
              isStreaming={projection.isThinkingComplete === false}
              sessionKey={createAgentMarkdownSessionKey({
                conversationId,
                messageId,
                itemId: projection.id,
              })}
            />
          </div>
        </div>
      );
    case 'markdown':
      return (
        <div className="agent-turn-activity-item">
          <div className="agent-turn-activity-detail">
            <MarkdownRenderer
              content={projection.content}
              isStreaming={projection.renderStreaming}
              sessionKey={createAgentMarkdownSessionKey({
                conversationId,
                messageId,
                itemId: projection.id,
              })}
            />
          </div>
        </div>
      );
    case 'tool':
      return <ActivityTool toolCall={projection.toolCall} />;
    case 'toolGroup':
      return <ActivityToolGroup projection={projection} />;
    case 'diff':
    case 'composite':
    case 'canvasLifecycle':
    case 'empty':
      throw new Error(`Turn activity received non-activity projection '${projection.renderKind}'.`);
  }
}

function ActivityTool({ toolCall }: { readonly toolCall: ToolCall }) {
  const projection = projectToolCallDisplayState(toolCall);
  const statusIcon = projection.needsConfirmation ? (
    <WarningIcon className="h-3 w-3 shrink-0 text-[var(--agent-warning-fg)]" />
  ) : projection.isPending ? (
    <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
  ) : projection.isFailed ? (
    <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />
  ) : (
    <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />
  );

  return (
    <div className="agent-turn-activity-item">
      <div className="agent-turn-activity-tool-row">
        {statusIcon}
        <span className="shrink-0 font-medium text-[var(--agent-fg)]">{toolCall.name}</span>
        {projection.summary && (
          <span className="min-w-0 truncate font-mono text-[10px]">{projection.summary}</span>
        )}
        <span className="flex-1" />
        {toolCall.result?.duration !== undefined && (
          <span className="shrink-0 text-[10px]">{toolCall.result.duration}ms</span>
        )}
      </div>
      {projection.documentThumbnails.length > 0 && (
        <DocumentImageThumbnails thumbnails={projection.documentThumbnails} />
      )}
    </div>
  );
}

function ActivityToolGroup({
  projection,
}: {
  readonly projection: ToolGroupContentBlockProjection;
}) {
  return (
    <div className="agent-turn-activity-item">
      <div className="agent-turn-activity-tool-row">
        {projection.pendingCount > 0 ? (
          <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
        ) : projection.failureCount > 0 ? (
          <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />
        ) : (
          <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />
        )}
        <span className="shrink-0 font-medium text-[var(--agent-fg)]">
          {projection.toolName} ×{projection.count}
        </span>
        {projection.targetLabel && (
          <span className="min-w-0 truncate font-mono text-[10px]">{projection.targetLabel}</span>
        )}
        <span className="flex-1" />
        {projection.durationLabel && (
          <span className="shrink-0 text-[10px]">{projection.durationLabel}</span>
        )}
      </div>
      {projection.toolCalls.map((toolCall) => {
        const thumbnails = projectToolCallDisplayState(toolCall).documentThumbnails;
        return thumbnails.length > 0 ? (
          <DocumentImageThumbnails key={toolCall.id} thumbnails={thumbnails} />
        ) : null;
      })}
    </div>
  );
}

export const AssistantTurnActivity = memo(AssistantTurnActivityComponent);
