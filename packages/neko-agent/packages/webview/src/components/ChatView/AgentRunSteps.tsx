import { useCallback, useState } from 'react';
import type { AgentWorkItemStep } from '@neko-agent/types';
import { ChevronRightIcon as ChevronIcon } from '@neko/shared/icons';
import { projectAgentWorkItemSteps } from '@/presenters/work-item-presenter';

interface AgentRunStepsProps {
  readonly steps: readonly AgentWorkItemStep[];
  readonly currentStepId?: string;
}

export function AgentRunSteps({ steps, currentStepId }: AgentRunStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpand = useCallback(() => setIsExpanded((value) => !value), []);
  if (steps.length === 0) return null;

  const projection = projectAgentWorkItemSteps(steps, currentStepId);
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={toggleExpand}
        className="flex w-full items-center gap-2 text-[10px] text-[var(--agent-fg-secondary)] transition-colors hover:text-[var(--agent-fg)]"
      >
        <ChevronIcon className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <span>
          Steps: {projection.completedSteps}/{steps.length}
        </span>
        {projection.currentStepName ? (
          <span className="text-[var(--agent-fg)]">- {projection.currentStepName}</span>
        ) : null}
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-1 border-l-2 border-[var(--agent-divider)] pl-2">
          {projection.rows.map((row) => (
            <div
              key={row.step.id}
              className={`flex items-start gap-2 text-[10px] ${
                row.isCurrent ? 'text-[var(--agent-fg)]' : 'text-[var(--agent-fg-secondary)]'
              }`}
            >
              <span className={row.animate ? 'animate-pulse' : ''}>{stepIcon(row.iconKind)}</span>
              <div className="min-w-0 flex-1">
                <span className="font-medium">
                  {row.index + 1}. {row.step.name}
                </span>
                {row.showMessage ? (
                  <div className="truncate text-[var(--agent-fg-secondary)]">
                    {row.step.message}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function stepIcon(kind: 'completed' | 'running' | 'failed' | 'pending'): string {
  switch (kind) {
    case 'completed':
      return '\u2713';
    case 'running':
      return '\u25cf';
    case 'failed':
      return '\u2717';
    case 'pending':
      return '\u25cb';
  }
}

export { ChevronRightIcon as ChevronIcon } from '@neko/shared/icons';
