/**
 * SubAgentCard - Inline status card for child-agent execution.
 */

import { useState, useCallback } from 'react';
import type { SubAgentWorkItem } from '@/components/AgentWorkItem';
import {
  projectSubAgentCard,
  type AgentWorkItemStatusTone,
} from '@/presenters/work-item-presenter';
import {
  SuccessIcon,
  ErrorIcon,
  ToolLoadingSpinner as LoadingSpinner,
} from '@/components/ChatView/ToolCallDisplay';
import { TaskSteps, ChevronIcon } from '@/components/ChatView/TaskCard/TaskSteps';

interface SubAgentCardProps {
  item: SubAgentWorkItem;
}

export function SubAgentCard({ item }: SubAgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setIsExpanded((prev) => !prev), []);

  const projection = projectSubAgentCard(item);
  const { isActive, isCompleted, isFailed } = projection.status;
  const toneClass = toInlineToneClass(projection.tone);

  return (
    <div className="my-1">
      <div className={`agent-inline-card ${toneClass}`}>
        <button
          type="button"
          onClick={toggleExpanded}
          className="agent-inline-header flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px]"
        >
          {isActive && <LoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />}
          {isCompleted && <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />}
          {isFailed && <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />}
          <span className="shrink-0 text-[10px] font-semibold">SA</span>
          <span className="truncate font-medium text-[var(--agent-fg)]">{item.title}</span>
          {projection.showProgressLabel && projection.progressLabel && (
            <span className="shrink-0 text-[var(--agent-fg-secondary)]">
              {projection.progressLabel}
            </span>
          )}
          <span className="flex-1" />
          <span className="agent-badge hidden shrink-0 text-[10px] sm:inline-flex">
            {projection.typeLabel}
          </span>
          <ChevronIcon
            className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        </button>

        {isExpanded && (
          <div className="border-t border-[var(--agent-divider)] p-2 text-[10px] text-[var(--agent-fg)]">
            {projection.showSummary && item.summary && (
              <div className="mb-2 line-clamp-3 text-[var(--agent-fg-secondary)]">
                {item.summary}
              </div>
            )}
            <div className="mb-2 flex flex-wrap gap-1">
              {projection.metaBadges.map((badge) => (
                <span key={badge.label} className="agent-badge text-[10px]">
                  {badge.label}: {badge.value}
                </span>
              ))}
            </div>
            {projection.showProgressBar && (
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--agent-input-bg)]">
                <div
                  className="h-full rounded-full bg-[var(--agent-info)] transition-all duration-500"
                  style={{ width: `${projection.progressBarPercent}%` }}
                />
              </div>
            )}
            {projection.showSteps && item.steps && (
              <TaskSteps steps={item.steps} currentStepId={item.currentStepId} />
            )}
            {projection.showChildren && (
              <div className="mb-2 rounded-md border border-[var(--agent-divider)] px-2 py-1.5">
                <div className="mb-1 text-[var(--agent-fg-secondary)]">children</div>
                <div className="flex flex-wrap gap-1">
                  {projection.childIds.map((childId) => (
                    <span key={childId} className="agent-badge max-w-[160px] truncate text-[10px]">
                      {childId}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {projection.showError && item.error && (
              <div className="mb-2 rounded-md bg-[color-mix(in_srgb,var(--agent-danger)_12%,transparent)] px-2 py-1.5 text-[var(--agent-danger)]">
                {item.error}
              </div>
            )}
            {projection.showResponse && item.subAgent.response && (
              <pre className="agent-code-block max-h-[180px] whitespace-pre-wrap p-2">
                {item.subAgent.response}
              </pre>
            )}
            <div className="mt-2 border-t border-[var(--agent-divider)] pt-1 text-[var(--agent-fg-secondary)]">
              parent: {projection.parentAgentId}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toInlineToneClass(tone: AgentWorkItemStatusTone): string {
  if (tone === 'success') return 'is-success';
  if (tone === 'danger') return 'is-danger';
  if (tone === 'info') return 'is-info';
  return '';
}
