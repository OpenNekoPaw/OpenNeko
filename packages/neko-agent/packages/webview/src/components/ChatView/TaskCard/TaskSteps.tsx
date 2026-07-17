/**
 * TaskSteps - Expandable step list for task progress tracking
 */

import { useState, useCallback } from 'react';
import type { TaskStep } from '@/components/TaskListView';
import { projectAgentWorkItemSteps } from '@/presenters/work-item-presenter';
import { formatDuration, getStepIcon, getToneColor } from './task-utils';
import { ChevronRightIcon as ChevronIcon } from '@neko/shared/icons';

interface TaskStepsProps {
  steps: TaskStep[];
  currentStepId?: string;
}

export function TaskSteps({ steps, currentStepId }: TaskStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!steps || steps.length === 0) return null;

  const projection = projectAgentWorkItemSteps(steps, currentStepId);

  return (
    <div className="mb-2">
      {/* Steps header */}
      <button
        onClick={toggleExpand}
        className="flex w-full items-center gap-2 text-[10px] text-[var(--agent-fg-secondary)] transition-colors hover:text-[var(--agent-fg)]"
      >
        <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <span>
          Steps: {projection.completedSteps}/{steps.length}
        </span>
        {projection.currentStepName && (
          <span className="text-[var(--agent-fg)]">- {projection.currentStepName}</span>
        )}
      </button>

      {/* Steps list (expanded) */}
      {isExpanded && (
        <div className="mt-2 space-y-1 border-l-2 border-[var(--agent-divider)] pl-2">
          {projection.rows.map((row) => (
            <div
              key={row.step.id}
              className={`flex items-start gap-2 text-[10px] ${
                row.isCurrent ? 'text-[var(--agent-fg)]' : 'text-[var(--agent-fg-secondary)]'
              }`}
            >
              {/* Status icon */}
              <span
                className={`flex-shrink-0 ${row.animate ? 'animate-pulse' : ''}`}
                style={{ color: getToneColor(row.tone) }}
              >
                {getStepIcon(row.iconKind)}
              </span>

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {row.index + 1}. {row.step.name}
                  </span>
                  {row.showDuration && row.durationSeconds !== null && (
                    <span className="text-[var(--agent-fg-secondary)]">
                      ({formatDuration(row.durationSeconds)})
                    </span>
                  )}
                </div>
                {row.showMessage && (
                  <div className="truncate text-[var(--agent-fg-secondary)]">
                    {row.step.message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ChevronRightIcon as ChevronIcon } from '@neko/shared/icons';
