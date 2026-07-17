/**
 * TaskCard - Inline task status card displayed in conversation
 *
 * ADR-3: Enhanced with multi-image grid (ImageGridCard).
 */

import { useState, useCallback, type ReactNode } from 'react';
import type { BackgroundTask } from '@/components/TaskListView';
import type { TaskRunScope } from '@neko/shared';
import { useTranslation } from '@/i18n/I18nContext';
import { RichContentRenderer } from '@/components/ChatView/RichContent';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import {
  type AgentWorkItemStatusTone,
  projectBackgroundTaskCard,
  projectBackgroundTaskResultContent,
} from '@/presenters/work-item-presenter';
import {
  SuccessIcon,
  ErrorIcon,
  ToolLoadingSpinner as LoadingSpinner,
} from '@/components/ChatView/ToolCallDisplay';
import { CheckIcon, CloseIcon, CopyIcon, OpenIcon, RefreshIcon } from '@neko/shared/icons';
import { getLogger } from '@/utils/logger';
import { TaskSteps, ChevronIcon } from './TaskSteps';
import {
  getTaskTypeLabel,
  getToneColor,
  TaskTypeIcon,
  formatDuration,
  formatETA,
} from './task-utils';

interface TaskCardProps {
  task: BackgroundTask;
  onCancel?: (taskScope: TaskRunScope) => void;
  onRetry?: (taskScope: TaskRunScope) => void;
  onViewResult?: (taskScope: TaskRunScope, resultRef?: string) => void;
  /** Available neko-suite plugins for "Send to" buttons (ADR-5) */
  plugins?: PluginsAvailable;
}

const compactActionClass =
  'inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded border border-[var(--agent-input-border)] bg-[var(--agent-surface)] px-2 text-[10px] font-medium text-[var(--agent-fg)] transition-colors hover:border-[var(--agent-accent)] hover:bg-[var(--agent-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--agent-accent)]';

const logger = getLogger('TaskCard');

export function TaskCard({ task, onCancel, onRetry, onViewResult }: TaskCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const projection = projectBackgroundTaskCard(task);
  const resultReference = getTaskResultReference(task);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const copyResultReference = useCallback(async () => {
    if (!resultReference) return;

    try {
      await navigator.clipboard.writeText(resultReference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error('Failed to copy task result reference:', error);
    }
  }, [resultReference]);

  const toneClass = toInlineToneClass(projection.tone);

  return (
    <div className="my-1">
      <div className={`agent-inline-card overflow-hidden ${toneClass}`}>
        {/* Compact header */}
        <div
          className="agent-inline-header flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px]"
          onClick={toggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleExpand();
            }
          }}
        >
          {/* Status indicator */}
          {projection.status.isActive && (
            <LoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
          )}
          {projection.status.isCompleted && (
            <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />
          )}
          {projection.status.isFailed && (
            <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />
          )}

          {/* Task type icon + name */}
          <TaskTypeIcon type={projection.taskType} className="h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-[var(--agent-fg)]">
              {t(projection.titleKey)}
            </div>
          </div>

          {/* Progress or status */}
          {projection.progressLabel && (
            <span className="shrink-0 text-[var(--agent-fg-secondary)]">
              {projection.progressLabel}
            </span>
          )}

          {/* Provider badge */}
          <span className="agent-badge hidden shrink-0 text-[10px] sm:inline-flex">
            {projection.providerName}
          </span>

          {/* Action buttons */}
          {projection.showCancel && onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel(task.scope);
              }}
              className="agent-danger-link inline-flex h-6 shrink-0 cursor-pointer items-center rounded px-1.5 text-[10px]"
              title={t('tasks.cancel')}
              aria-label={t('tasks.cancel')}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          )}

          {projection.showRetry && onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry(task.scope);
              }}
              className={compactActionClass}
              title={t('tasks.retry')}
              aria-label={t('tasks.retry')}
            >
              <RefreshIcon className="h-3 w-3" />
            </button>
          )}

          {projection.showViewResult && resultReference && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void copyResultReference();
              }}
              className={compactActionClass}
              title={t('tasks.copyResultReference')}
              aria-label={t('common.copy')}
            >
              {copied ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
              <span>{t('common.copy')}</span>
            </button>
          )}

          {projection.showViewResult && onViewResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewResult(task.scope, resultReference ?? undefined);
              }}
              className={compactActionClass}
              title={t('tasks.viewInVSCode')}
              aria-label={t('tasks.viewInVSCode')}
            >
              <OpenIcon className="h-3 w-3" />
              <span>{t('tasks.viewInVSCode')}</span>
            </button>
          )}

          <ChevronIcon
            className={`h-3 w-3 shrink-0 text-[var(--agent-fg-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Error message (always show if failed) */}
        {projection.showCollapsedError && task.error && !isExpanded && (
          <div className="border-t border-[color-mix(in_srgb,var(--agent-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--agent-danger)_12%,transparent)] px-2 py-1 text-[10px] text-[var(--agent-danger)]">
            {task.error}
          </div>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-[var(--agent-divider)] p-2 text-[10px] text-[var(--agent-fg)]">
            {/* Prompt */}
            <div className="mb-2 line-clamp-2 text-[var(--agent-fg-secondary)]">{task.prompt}</div>

            {/* Progress Bar (for active tasks) */}
            {projection.showProgressBar && (
              <div className="mb-2">
                {projection.showProgressLabel && (
                  <div className="mb-1 flex items-center justify-between text-[var(--agent-fg-secondary)]">
                    <span>{t('tasks.progress')}</span>
                    <div className="flex items-center gap-2">
                      <span>{projection.progressLabel}</span>
                      {projection.showEta && projection.etaSeconds !== null && (
                        <span className="text-[var(--agent-info)]">
                          ETA: {formatETA(projection.etaSeconds)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--agent-input-bg)]">
                  {!projection.useIndeterminateProgress ? (
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${projection.progressBarPercent}%`,
                        backgroundColor: getToneColor(projection.tone),
                      }}
                    />
                  ) : (
                    // Indeterminate animation for models without progress reporting
                    <div
                      className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full"
                      style={{ backgroundColor: getToneColor(projection.tone) }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Task Steps */}
            {projection.showSteps && task.steps && (
              <TaskSteps steps={task.steps} currentStepId={task.currentStepId} />
            )}

            {/* Error message */}
            {projection.showExpandedError && task.error && (
              <div className="mb-2 flex gap-1.5 rounded bg-[color-mix(in_srgb,var(--agent-danger)_12%,transparent)] px-2 py-1.5 text-[var(--agent-danger)]">
                <ErrorIcon className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="min-w-0 break-words">{task.error}</span>
              </div>
            )}

            {/* Result preview (for completed tasks) — ADR-3 enhanced */}
            {projection.showResultPreview && <ResultPreview task={task} />}

            {/* Provider info */}
            <div className="border-t border-[var(--agent-divider)] pt-1.5 text-[var(--agent-fg-secondary)]">
              {t('tasks.provider')}: {task.providerName}
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

function getTaskResultReference(task: BackgroundTask): string | null {
  const assetRef = task.result?.assets?.find((asset) => asset.assetRef?.uri)?.assetRef?.uri;
  if (assetRef) return assetRef;

  return task.result?.urls.find((url) => url.length > 0) ?? null;
}

// ---------------------------------------------------------------------------
// ResultPreview - Completed task result display (ADR-3/4 enhanced)
//
// When `result.assets` is available, uses host-projected render URIs plus
// stable asset metadata as the authoritative display source.
// Otherwise uses protocol-level `result.urls`.
// ---------------------------------------------------------------------------

function ResultPreview({ task }: { task: BackgroundTask }) {
  const projection = projectBackgroundTaskResultContent(task);
  const { contentKind, contentData, displayWidth, displayHeight, displayDuration, mediaType } =
    projection;

  return (
    <div className="mb-2 rounded border border-[var(--agent-divider)] bg-[color-mix(in_srgb,var(--agent-surface)_70%,transparent)] p-2">
      {/* Media result — registry-driven rendering (ADR-6 §6.2) */}
      {contentKind && contentData && (
        <RichContentRenderer kind={contentKind} data={contentData} inline openOnClick={false} />
      )}

      {/* Result metadata */}
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <ResultBadge>{getTaskTypeLabel(mediaType)}</ResultBadge>
        {displayWidth && displayHeight && (
          <ResultBadge>
            {displayWidth}x{displayHeight}
          </ResultBadge>
        )}
        {displayDuration && displayDuration > 0 && (
          <ResultBadge>{formatDuration(displayDuration)}</ResultBadge>
        )}
      </div>
    </div>
  );
}

function ResultBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--agent-elevated)] px-2 py-0.5 text-[10px] text-[var(--agent-fg-secondary)]">
      {children}
    </span>
  );
}
