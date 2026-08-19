import { SegmentedControl } from '@neko/ui';
import { isAgentEntryMode, type AgentEntryMode } from '@neko/agent-contracts';
import type { HomeExperienceEntryProjection } from '../../presenters/home-experience-entry-presenter';
import { useTranslation } from '../../i18n/I18nContext';

interface HomeExperienceModeSelectorProps {
  readonly projection: HomeExperienceEntryProjection;
  readonly selectionPending?: boolean;
  readonly onChange?: (mode: AgentEntryMode) => void;
}

export function HomeExperienceModeSelector({
  projection,
  selectionPending = false,
  onChange,
}: HomeExperienceModeSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const label = t('chat.entryExperience.label');
  const visibleMode = projection.options.some((option) => option.mode === projection.mode)
    ? projection.mode
    : 'assistant';
  return (
    <nav className="agent-entry-experience-selector" aria-label={label}>
      <SegmentedControl
        appearance="neutral"
        density="compact"
        label={label}
        maxWidth={480}
        value={visibleMode}
        onValueChange={(value) => onChange?.(parseAgentEntryMode(value))}
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

function parseAgentEntryMode(value: string): AgentEntryMode {
  if (isAgentEntryMode(value)) return value;
  throw new Error(`Unsupported Agent Entry experience mode '${value}'.`);
}
