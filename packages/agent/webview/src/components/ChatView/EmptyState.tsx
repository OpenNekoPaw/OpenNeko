import { useTranslation } from '../../i18n/I18nContext';
import type { SkillSummary } from './InputArea/types';
import type { HomeExperienceEntryProjection } from '../../presenters/home-experience-entry-presenter';

interface EmptyStateProps {
  disabled?: boolean;
  presentation?: 'default' | 'desktop-dock';
  draftScope?: 'unbound' | 'assistant' | 'workspace' | 'character' | 'room' | 'world';
  skills?: readonly SkillSummary[];
  onSkillSelect?: (skill: SkillSummary) => void;
  experienceProjection?: HomeExperienceEntryProjection;
}

export function EmptyState({
  disabled = false,
  presentation = 'default',
  draftScope,
  skills = [],
  onSkillSelect,
  experienceProjection,
}: EmptyStateProps) {
  const { t } = useTranslation();
  const suggestedSkills = skills
    .filter((skill) => skill.enabled)
    .slice(0, experienceProjection?.showSkillSuggestions === false ? 0 : 4);

  if (presentation === 'desktop-dock') {
    return (
      <div className="agent-empty-state agent-empty-state--desktop-dock flex min-h-0 flex-1 select-none items-end overflow-y-auto px-3 pb-4">
        <section
          className="agent-empty-panel w-full min-w-0"
          aria-labelledby="neko-agent-empty-title"
        >
          <h2
            id="neko-agent-empty-title"
            className="agent-empty-title text-[15px] font-semibold leading-6 text-[var(--agent-fg)]"
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
          <p className="mt-1 text-[12px] leading-5 text-[var(--agent-empty-muted)]">
            {t(
              experienceProjection?.descriptionKey ??
                (draftScope !== undefined
                  ? 'chat.emptyState.scope.activeDescription'
                  : 'chat.emptyState.desktopDockDescription'),
            )}
          </p>
          {suggestedSkills.length > 0 ? (
            <div className="agent-empty-skill-suggestions mt-4">
              <p className="agent-empty-skill-label">{t('chat.emptyState.desktopDockSkills')}</p>
              <div className="agent-empty-skill-list">
                {suggestedSkills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    disabled={disabled}
                    className="agent-empty-skill-button"
                    title={skill.description}
                    onClick={() => onSkillSelect?.(skill)}
                  >
                    {skill.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
          <p className="agent-empty-copy mt-1 max-w-full text-[12px] leading-5 text-[var(--agent-empty-copy)]">
            {t(experienceProjection?.descriptionKey ?? 'chat.emptyState.description')}
          </p>
        </div>

        <p className="agent-empty-disclaimer mt-4 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
          {t('chat.emptyState.disclaimer')}
        </p>
      </section>
    </div>
  );
}
