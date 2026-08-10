import { SegmentedControl } from '@neko/ui';
import type { AgentEntryExperienceMode } from '../../entry-experience-mode';
import type { HomeExperienceEntryProjection } from '../../presenters/home-experience-entry-presenter';
import { useTranslation } from '../../i18n/I18nContext';

interface HomeExperienceModeSelectorProps {
  readonly projection: HomeExperienceEntryProjection;
  readonly selectionPending?: boolean;
  readonly onChange?: (mode: AgentEntryExperienceMode) => void;
}

export function HomeExperienceModeSelector({
  projection,
  selectionPending = false,
  onChange,
}: HomeExperienceModeSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const label = t('chat.entryExperience.label');
  return (
    <nav className="agent-entry-experience-selector" aria-label={label}>
      <SegmentedControl
        appearance="neutral"
        density="comfortable"
        label={label}
        maxWidth={544}
        value={projection.mode}
        onValueChange={(value) => onChange?.(parseAgentEntryExperienceMode(value))}
        options={projection.options.map((option) => ({
          value: option.mode,
          label: t(option.labelKey),
          disabled: selectionPending || option.disabled,
          ...(option.descriptionKey === undefined ? {} : { description: t(option.descriptionKey) }),
        }))}
      />
    </nav>
  );
}

function parseAgentEntryExperienceMode(value: string): AgentEntryExperienceMode {
  if (
    value === 'assistant' ||
    value === 'workspace' ||
    value === 'character' ||
    value === 'world'
  ) {
    return value;
  }
  throw new Error(`Unsupported Agent Entry experience mode '${value}'.`);
}
