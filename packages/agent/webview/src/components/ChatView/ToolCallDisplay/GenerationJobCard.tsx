import type { ToolCall } from '@neko/agent-contracts';
import type { PreviewMediaDescriptor } from '@neko/preview-domain';
import { AgentPreviewCollection } from '../MediaPreview/AgentPreviewCollection';
import { useTranslation } from '../../../i18n/I18nContext';
import type { GenerationJobCardProjection } from '../../../presenters/tool-call-presenter';
import { ErrorIcon, SuccessIcon, ToolLoadingSpinner, WarningIcon } from './icons';

interface GenerationJobCardProps {
  readonly toolCall: ToolCall;
  readonly job: GenerationJobCardProjection;
  readonly imageDescriptors: readonly PreviewMediaDescriptor[];
  readonly videoDescriptors: readonly PreviewMediaDescriptor[];
  readonly audioDescriptors: readonly PreviewMediaDescriptor[];
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isFailed: boolean;
}

export function GenerationJobCard({
  toolCall,
  job,
  imageDescriptors,
  videoDescriptors,
  audioDescriptors,
  isPending,
  isSuccess,
  isFailed,
}: GenerationJobCardProps) {
  const { t } = useTranslation();
  const prompt = readString(toolCall.arguments, 'prompt');
  const boardState = job.boardDelivery
    ? projectBoardPresentationState(job.boardDelivery.status)
    : undefined;

  return (
    <div className="my-1" data-testid="generation-job-card">
      <div
        className={`agent-inline-card ${isFailed ? 'is-danger' : isSuccess ? 'is-success' : 'is-info'}`}
      >
        <div className="agent-inline-header flex min-w-0 items-center gap-1.5 px-2 py-1.5">
          {isPending && (
            <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info)]" />
          )}
          {isSuccess && <SuccessIcon className="h-3 w-3 shrink-0 text-[var(--agent-success)]" />}
          {isFailed && <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--agent-danger)]" />}
          <span className="shrink-0 text-[11px] font-medium text-[var(--agent-fg)]">
            {t('toolCalls.generation.title')}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--agent-fg-secondary)]">
            {job.modelId ?? toolCall.name}
          </span>
          <span className="shrink-0 text-[10px] text-[var(--agent-fg-secondary)]">
            {formatGenerationStatus(job.phase, t)}
          </span>
        </div>

        <div className="border-t border-[var(--agent-divider)] px-2 py-2">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px]">
            <span className="text-[var(--agent-fg-secondary)]">
              {t('toolCalls.generation.model')}
            </span>
            <span className="truncate font-mono text-[var(--agent-fg)]">
              {[job.providerId, job.modelId].filter(Boolean).join('/') || toolCall.name}
            </span>
            <span className="text-[var(--agent-fg-secondary)]">
              {t('toolCalls.generation.job')}
            </span>
            <span className="truncate font-mono text-[var(--agent-fg)]" title={job.jobId}>
              {job.jobId}
            </span>
            {prompt && (
              <>
                <span className="text-[var(--agent-fg-secondary)]">
                  {t('toolCalls.generation.prompt')}
                </span>
                <span className="line-clamp-2 text-[var(--agent-fg)]" title={prompt}>
                  {prompt}
                </span>
              </>
            )}
          </div>

          {!isSuccess && !isFailed && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="text-[var(--agent-fg-secondary)]">
                  {formatGenerationStage(job.stage, t)}
                </span>
                <span className="font-mono tabular-nums text-[var(--agent-fg)]">
                  {Math.round(job.percent)}%
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded bg-[var(--agent-elevated)]"
                role="progressbar"
                aria-label={t('toolCalls.generation.progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={job.percent}
              >
                <div
                  className="h-full bg-[var(--agent-info)] transition-[width] duration-200"
                  style={{ width: `${job.percent}%` }}
                />
              </div>
            </div>
          )}

          {isFailed && toolCall.result?.error && (
            <div className="mt-2 text-[10px] text-[var(--agent-danger)]">
              {toolCall.result.error}
            </div>
          )}

          {isSuccess && imageDescriptors.length > 0 && (
            <div className="mt-2">
              <div className="agent-produced-outputs-title">{t('chat.toolCall.outputs')}</div>
              <AgentPreviewCollection descriptors={imageDescriptors} className="mt-1" />
            </div>
          )}
          {isSuccess && videoDescriptors.length > 0 && (
            <div className="mt-2 space-y-2">
              <div className="agent-produced-outputs-title">{t('chat.toolCall.outputs')}</div>
              <AgentPreviewCollection descriptors={videoDescriptors} />
            </div>
          )}
          {isSuccess && audioDescriptors.length > 0 && (
            <div className="mt-2 space-y-2">
              <div className="agent-produced-outputs-title">{t('chat.toolCall.outputs')}</div>
              <AgentPreviewCollection descriptors={audioDescriptors} />
            </div>
          )}

          {job.boardDelivery && (
            <div
              className={`mt-2 flex items-start gap-1.5 border-t border-[var(--agent-divider)] pt-2 text-[10px] ${
                boardState === 'incomplete'
                  ? 'text-[var(--agent-warning-fg)]'
                  : 'text-[var(--agent-fg-secondary)]'
              }`}
            >
              {boardState === 'incomplete' ? (
                <WarningIcon className="mt-0.5 h-3 w-3 shrink-0" />
              ) : boardState === 'pending' ? (
                <ToolLoadingSpinner className="mt-0.5 h-3 w-3 shrink-0 text-[var(--agent-info)]" />
              ) : (
                <SuccessIcon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--agent-success)]" />
              )}
              <div className="min-w-0">
                <div>
                  {boardState === 'pending'
                    ? t('toolCalls.generation.boardPending')
                    : boardState === 'incomplete'
                      ? t('toolCalls.generation.boardBlocked')
                      : t('toolCalls.generation.boardSaved')}
                </div>
                {job.boardDelivery.diagnostics.map((diagnostic) => (
                  <div key={diagnostic.code} className="mt-0.5">
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function projectBoardPresentationState(
  status: NonNullable<GenerationJobCardProjection['boardDelivery']>['status'],
): 'pending' | 'complete' | 'incomplete' {
  if (status === 'queued' || status === 'claimed') return 'pending';
  if (status === 'projected' || status === 'noop') return 'complete';
  return 'incomplete';
}

function formatGenerationStatus(phase: string, t: (key: string) => string): string {
  if (phase === 'succeeded') return t('toolCalls.completed');
  if (phase === 'failed' || phase === 'outcome-unknown') return t('toolCalls.failed');
  if (phase === 'cancelled') return t('toolCalls.generation.cancelled');
  return t('toolCalls.executing');
}

function formatGenerationStage(stage: string, t: (key: string) => string): string {
  switch (stage) {
    case 'queued':
      return t('toolCalls.generation.queued');
    case 'submitting':
      return t('toolCalls.generation.submitting');
    case 'waiting-provider':
      return t('toolCalls.generation.generating');
    case 'committing-result':
      return t('toolCalls.generation.saving');
    case 'completed':
      return t('toolCalls.completed');
    default:
      return stage;
  }
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}
