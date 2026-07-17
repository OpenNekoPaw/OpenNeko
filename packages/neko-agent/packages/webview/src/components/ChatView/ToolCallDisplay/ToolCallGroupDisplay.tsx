import { memo, useState, useCallback } from 'react';
import type { ToolCall } from '@neko-agent/types';
import type { ToolGroupContentBlockProjection } from '@/presenters/content-block-presenter';
import { ChevronIcon, SuccessIcon, ErrorIcon, ToolLoadingSpinner } from './icons';
import { ToolCallDisplay } from './ToolCallDisplay';

interface ToolCallGroupDisplayProps {
  projection: ToolGroupContentBlockProjection;
  conversationId: string | null;
  workItemIds?: string[];
}

function ToolCallGroupDisplayComponent({
  projection,
  conversationId,
  workItemIds,
}: ToolCallGroupDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const hasFailures = projection.failureCount > 0;
  const hasPending = projection.pendingCount > 0;
  const toneClass = hasFailures ? 'is-danger' : hasPending ? 'is-info' : 'is-success';
  const statusLabel = formatGroupStatus(projection);

  return (
    <div className="my-1">
      <div className={`agent-inline-card ${toneClass}`}>
        <button
          type="button"
          className="agent-inline-header flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--agent-hover)]"
          onClick={toggleExpand}
          aria-expanded={isExpanded}
        >
          {hasPending ? (
            <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
          ) : hasFailures ? (
            <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />
          ) : (
            <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />
          )}
          <span className="shrink-0 font-medium text-[var(--agent-fg)]">
            {projection.toolName} x{projection.count}
          </span>
          {projection.targetLabel && (
            <span className="truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
              {projection.targetLabel}
            </span>
          )}
          <span className="flex-1" />
          <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">
            {statusLabel}
          </span>
          {projection.durationLabel && (
            <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">
              {projection.durationLabel}
            </span>
          )}
          <ChevronIcon
            className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {isExpanded && (
          <div className="border-t border-[var(--agent-divider)] px-2 py-1.5">
            <div className="space-y-1">
              {projection.toolCalls.map((toolCall: ToolCall) => (
                <ToolCallDisplay
                  key={toolCall.id}
                  toolCall={toolCall}
                  conversationId={conversationId}
                  workItemIds={workItemIds}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatGroupStatus(projection: ToolGroupContentBlockProjection): string {
  if (projection.failureCount > 0) {
    return `${projection.successCount} ok / ${projection.failureCount} failed`;
  }
  if (projection.pendingCount > 0) {
    return `${projection.pendingCount} pending`;
  }
  return `${projection.successCount} succeeded`;
}

export const ToolCallGroupDisplay = memo(ToolCallGroupDisplayComponent);
