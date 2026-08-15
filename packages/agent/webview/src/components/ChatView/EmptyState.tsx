import { useTranslation } from '../../i18n/I18nContext';
import type { HomeExperienceEntryProjection } from '../../presenters/home-experience-entry-presenter';

interface EmptyStateProps {
  presentation?: 'default' | 'desktop-dock';
  draftScope?: 'unbound' | 'assistant' | 'workspace' | 'character' | 'room' | 'world';
  experienceProjection?: HomeExperienceEntryProjection;
}

export function EmptyState({
  presentation = 'default',
  draftScope,
  experienceProjection,
}: EmptyStateProps) {
  const { t } = useTranslation();

  if (presentation === 'desktop-dock') {
    return (
      <div className="agent-empty-state agent-empty-state--desktop-dock select-none px-3">
        <section
          className="agent-entry-intro w-full min-w-0"
          aria-labelledby="neko-agent-empty-title"
        >
          <h2
            id="neko-agent-empty-title"
            className="agent-empty-title text-[28px] font-semibold leading-9 text-[var(--agent-fg)]"
          >
            {t(
              experienceProjection?.titleKey ??
                (draftScope === 'assistant'
                  ? 'chat.emptyState.scope.assistantActiveTitle'
                  : draftScope === 'workspace'
                    ? 'chat.emptyState.scope.workspaceActiveTitle'
                    : 'chat.emptyState.desktopDockTitle'),
            )}
          </h2>
        </section>
      </div>
    );
  }

  return (
    <div className="agent-empty-state flex min-h-0 flex-1 select-none items-center justify-center overflow-y-auto px-3 py-5 sm:px-4 sm:py-7">
      <section
        className="agent-empty-panel w-full min-w-0 max-w-[min(920px,100%)]"
        aria-labelledby="neko-agent-empty-title"
      >
        <div className="min-w-0">
          <h2
            id="neko-agent-empty-title"
            className="agent-empty-title text-[13px] font-semibold leading-5 text-[var(--agent-fg)]"
          >
            {t(experienceProjection?.titleKey ?? 'chat.emptyState.title')}
          </h2>
          {experienceProjection ? null : (
            <p className="agent-empty-copy mt-1 max-w-full text-[12px] leading-5 text-[var(--agent-empty-copy)]">
              {t('chat.emptyState.description')}
            </p>
          )}
        </div>

        {experienceProjection ? null : (
          <p className="agent-empty-disclaimer mt-4 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
            {t('chat.emptyState.disclaimer')}
          </p>
        )}
      </section>
    </div>
  );
}
