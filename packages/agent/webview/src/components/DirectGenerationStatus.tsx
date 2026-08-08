import type { DirectGenerationOperationProjection } from '@neko/generation';
import { useTranslation } from '../i18n/I18nContext';

export type DirectGenerationUiState =
  | { readonly phase: 'running'; readonly mediaKind: 'image' | 'video' | 'audio' }
  | { readonly phase: 'failed'; readonly message: string }
  | { readonly phase: 'completed'; readonly projection: DirectGenerationOperationProjection };

export function DirectGenerationStatus({ state }: { readonly state: DirectGenerationUiState }) {
  const { t } = useTranslation();
  const failed =
    state.phase === 'failed' ||
    (state.phase === 'completed' && state.projection.phase !== 'succeeded');
  return (
    <div
      className={`fixed right-4 top-12 z-[59] w-[360px] max-w-[calc(100vw-2rem)] break-words rounded-lg border px-3 py-2 text-sm shadow-lg animate-slide-in ${
        failed
          ? 'border-[var(--neko-inputValidation-errorBorder,var(--agent-border))] bg-[var(--neko-inputValidation-errorBackground,var(--agent-elevated))] text-[var(--neko-inputValidation-errorForeground,var(--agent-fg))]'
          : 'border-[var(--agent-border)] bg-[var(--agent-elevated)] text-[var(--agent-fg)]'
      }`}
      data-direct-generation-status={state.phase}
      role={failed ? 'alert' : 'status'}
    >
      <div className="font-medium">{t('chat.directGeneration.title')}</div>
      <div className="mt-1 opacity-90">{projectMessage(state, t)}</div>
    </div>
  );
}

function projectMessage(
  state: DirectGenerationUiState,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (state.phase === 'running') {
    return t(`chat.directGeneration.running.${state.mediaKind}`);
  }
  if (state.phase === 'failed') return state.message;
  if (state.projection.phase === 'succeeded') {
    return t('chat.directGeneration.succeeded', {
      count: state.projection.resultLocators.length,
      jobId: state.projection.jobId,
    });
  }
  return (
    state.projection.diagnostic?.message ??
    t('chat.directGeneration.ended', {
      jobId: state.projection.jobId,
      phase: state.projection.phase,
    })
  );
}
