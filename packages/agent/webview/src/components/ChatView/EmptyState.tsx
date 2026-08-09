import { useTranslation } from '../../i18n/I18nContext';
import type { SkillSummary } from './InputArea/types';
import type { HomeExperienceEntryProjection } from '../../presenters/home-experience-entry-presenter';

export type EmptyStateEntryAction = 'start-chat' | 'roleplay';

interface EmptyStateProps {
  selectedAction?: EmptyStateEntryAction;
  disabled?: boolean;
  onEntryAction?: (action: EmptyStateEntryAction) => void;
  presentation?: 'default' | 'desktop-dock';
  draftScope?: 'unbound' | 'assistant' | 'workspace' | 'character' | 'room' | 'world';
  skills?: readonly SkillSummary[];
  onSkillSelect?: (skill: SkillSummary) => void;
  experienceProjection?: HomeExperienceEntryProjection;
}

const EMPTY_STATE_ENTRIES: readonly {
  action: EmptyStateEntryAction;
  labelKey: string;
  helperKey: string;
}[] = [
  {
    action: 'start-chat',
    labelKey: 'chat.emptyState.entry.startChat',
    helperKey: 'chat.emptyState.entry.startChatHelper',
  },
  {
    action: 'roleplay',
    labelKey: 'chat.emptyState.entry.roleplay',
    helperKey: 'chat.emptyState.entry.roleplayHelper',
  },
];

export function EmptyState({
  selectedAction = 'start-chat',
  disabled = false,
  onEntryAction,
  presentation = 'default',
  draftScope,
  skills = [],
  onSkillSelect,
  experienceProjection,
}: EmptyStateProps) {
  const { t } = useTranslation();
  const entries = EMPTY_STATE_ENTRIES;
  const selectedEntry = entries.find((entry) => entry.action === selectedAction);
  const suggestedSkills = skills
    .filter((skill) => skill.enabled)
    .slice(0, experienceProjection?.showSkillSuggestions === false ? 0 : 4);
  const draftPresentation = draftScope !== undefined;

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
                (draftPresentation
                  ? 'chat.emptyState.scope.activeDescription'
                  : 'chat.emptyState.desktopDockDescription'),
            )}
          </p>
          {draftPresentation ? null : (
            <div className="agent-empty-actions mt-4 grid grid-cols-1 gap-1.5">
              {entries.map((entry) => (
                <button
                  key={entry.action}
                  type="button"
                  onClick={() => onEntryAction?.(entry.action)}
                  disabled={disabled}
                  className={`agent-empty-action flex min-h-9 w-full min-w-0 items-center rounded-md border px-3 py-2 text-left text-[12px] leading-5 transition-colors disabled:cursor-default disabled:opacity-60 ${
                    selectedAction === entry.action
                      ? 'agent-empty-action-selected border-[var(--agent-empty-action-hover-border)]'
                      : 'border-[var(--agent-empty-action-border)] bg-[var(--agent-empty-action-bg)]'
                  }`}
                  aria-pressed={selectedAction === entry.action}
                >
                  <span className="min-w-0 flex-1 break-words">{t(entry.labelKey)}</span>
                </button>
              ))}
            </div>
          )}
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

        {draftPresentation ? null : (
          <div className="agent-empty-actions mt-5 grid grid-cols-1 gap-1.5">
            {entries.map((entry) => (
              <button
                key={entry.action}
                type="button"
                onClick={() => onEntryAction?.(entry.action)}
                disabled={disabled}
                className={`agent-empty-action group flex min-h-9 w-full min-w-0 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-center text-[12px] leading-5 text-[var(--agent-fg)] transition-colors hover:border-[var(--agent-empty-action-hover-border)] hover:bg-[var(--agent-empty-action-hover-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--agent-accent)] disabled:cursor-default disabled:opacity-60 ${
                  selectedAction === entry.action
                    ? 'agent-empty-action-selected border-[var(--agent-empty-action-hover-border)]'
                    : 'border-[var(--agent-empty-action-border)] bg-[var(--agent-empty-action-bg)]'
                }`}
                aria-pressed={selectedAction === entry.action}
              >
                <span className="min-w-0 flex-1 break-words text-center">{t(entry.labelKey)}</span>
              </button>
            ))}
          </div>
        )}

        {experienceProjection ? null : (
          <p className="agent-empty-mode-hint mt-3 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
            {selectedEntry ? t(selectedEntry.helperKey) : null}
          </p>
        )}

        <p className="agent-empty-disclaimer mt-4 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
          {t('chat.emptyState.disclaimer')}
        </p>
      </section>
    </div>
  );
}
