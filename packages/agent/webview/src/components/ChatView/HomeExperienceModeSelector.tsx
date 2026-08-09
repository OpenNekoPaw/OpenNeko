import type { AgentEntryExperienceMode } from '../../entry-experience-mode';
import type { HomeExperienceEntryProjection } from '../../presenters/home-experience-entry-presenter';
import { useTranslation } from '../../i18n/I18nContext';

interface HomeExperienceModeSelectorProps {
  projection: HomeExperienceEntryProjection;
  selectionPending?: boolean;
  onChange?: (mode: AgentEntryExperienceMode) => void;
}

export function HomeExperienceModeSelector({
  projection,
  selectionPending = false,
  onChange,
}: HomeExperienceModeSelectorProps) {
  const { t } = useTranslation();
  return (
    <div
      className="agent-entry-experience-selector"
      role="tablist"
      aria-label={t('chat.entryExperience.label')}
    >
      {projection.options.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="tab"
          aria-selected={projection.mode === option.mode}
          className="agent-entry-experience-option"
          disabled={selectionPending}
          onClick={() => onChange?.(option.mode)}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}
