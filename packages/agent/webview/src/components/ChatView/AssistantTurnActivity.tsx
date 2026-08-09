import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
  const now = useElapsedClock(summary.isRunning, summary.startedAt);

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
  const duration = useMemo(() => {
    if (summary.startedAt === undefined) return null;
    const totalSeconds = Math.floor(
      Math.max(0, (summary.completedAt ?? now) - summary.startedAt) / 1_000,
    );
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0
      ? t('chat.processRecords.duration.minutesSeconds', { minutes, seconds })
      : t('chat.processRecords.duration.seconds', { seconds });
  }, [now, summary.completedAt, summary.startedAt, t]);
  const summaryTitle = summary.isRunning
    ? duration
      ? t('chat.processRecords.processing', { duration })
      : t('chat.processRecords.processingWithoutDuration')
    : duration
      ? t('chat.processRecords.processed', { duration })
      : t('chat.processRecords.processedWithoutDuration');
  const hasDetails = projections.length > 0;

  if (!hasDetails && summary.startedAt === undefined) return null;

  const summaryIcon = summary.isRunning ? (
    <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
  ) : hasDetails ? (
    <ChevronIcon
      className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
    />
  ) : null;

  return (
    <section
      className="agent-turn-activity"
      aria-label={hasDetails ? t('chat.processRecords.details') : summaryTitle}
    >
      {hasDetails ? (
        <button
          type="button"
          className="agent-turn-activity-summary"
          aria-expanded={isExpanded}
          onClick={toggleExpanded}
        >
          {summaryIcon}
          <span className="font-medium text-[var(--agent-fg)]">{summaryTitle}</span>
        </button>
      ) : (
        <div
          className="agent-turn-activity-summary"
          role={summary.isRunning ? 'status' : undefined}
        >
          {summaryIcon}
          <span className="font-medium text-[var(--agent-fg)]">{summaryTitle}</span>
        </div>
      )}

      {hasDetails && isExpanded && (
        <div className="agent-turn-activity-list">
          <div className="agent-turn-activity-meta">{summaryParts.join(' · ')}</div>
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

function useElapsedClock(isRunning: boolean, startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning || startedAt === undefined) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isRunning, startedAt]);
  return now;
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
