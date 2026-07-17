/**
 * BatchTaskCard - Compact display for multiple tasks
 */

import type { BackgroundTask } from '@/components/TaskListView';
import type { TaskRunScope } from '@neko/shared';
import { useTranslation } from '@/i18n/I18nContext';
import { projectBackgroundTaskBatch } from '@/presenters/work-item-presenter';
import {
  getBatchBadgeIcon,
  getBatchBadgeToneColor,
  getBatchHeaderBackground,
  getToneColor,
  getTypeIcon,
} from './task-utils';

interface BatchTaskCardProps {
  tasks: BackgroundTask[];
  onCancel?: (taskScope: TaskRunScope) => void;
  onCancelAll?: () => void;
  onViewResult?: (taskScope: TaskRunScope) => void;
}

export function BatchTaskCard({
  tasks,
  onCancel: _onCancel,
  onCancelAll,
  onViewResult,
}: BatchTaskCardProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) return null;

  const projection = projectBackgroundTaskBatch(tasks);

  return (
    <div className="mt-2 border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ background: getBatchHeaderBackground(projection.tone) }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{getTypeIcon(projection.taskType)}</span>
          <span className="text-[12px] font-medium">{t(projection.titleKey)}</span>
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
            ({t('tasks.tasks', { count: tasks.length })})
          </span>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="px-3 py-2">
        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {projection.badges.map((badge) => {
            const color = getBatchBadgeToneColor(badge.tone);
            return (
              <span
                key={badge.status}
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.animate ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
                  color,
                }}
              >
                {getBatchBadgeIcon(badge.iconKind)} {badge.count} {t(badge.labelKey).toLowerCase()}
              </span>
            );
          })}
        </div>

        {/* Overall progress bar */}
        {projection.showProgress && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] text-[var(--vscode-descriptionForeground)] mb-1">
              <span>{t('tasks.overallProgress')}</span>
              <span>{projection.totalProgress}%</span>
            </div>
            <div className="h-2 bg-[var(--vscode-progressBar-background)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out bg-[var(--vscode-charts-blue,#3794ff)]"
                style={{ width: `${projection.totalProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Individual task list (compact) */}
        <div className="max-h-[200px] overflow-y-auto space-y-1 mb-2">
          {projection.rows.map((row) => (
            <div
              key={row.task.id}
              className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--vscode-input-background)] text-[10px]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getToneColor(row.statusTone) }}
              />
              <span className="flex-1 truncate text-[var(--vscode-descriptionForeground)]">
                #{row.index + 1}: {row.promptPreview}
              </span>
              <span className="flex-shrink-0" style={{ color: getToneColor(row.statusTone) }}>
                {row.statusDisplay}
              </span>
              {row.showViewResult && onViewResult && (
                <button
                  onClick={() => onViewResult(row.task.scope)}
                  className="text-[var(--vscode-textLink-foreground)] hover:underline"
                >
                  {t('common.view')}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--vscode-panel-border)]">
          {projection.showCancelAll && onCancelAll && (
            <button
              onClick={onCancelAll}
              className="text-[10px] px-2 py-1 text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
            >
              {t('tasks.cancelAll')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
