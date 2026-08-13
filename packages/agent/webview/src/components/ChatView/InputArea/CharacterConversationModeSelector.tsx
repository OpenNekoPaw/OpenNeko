import { useRef, useState } from 'react';
import { ChevronDownIcon } from './DropdownMenu';
import { useComposerControlMenu } from './composer-menu-runtime';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { useTranslation } from '../../../i18n/I18nContext';
import type { CharacterConversationMode } from './types';

interface CharacterConversationModeSelectorProps {
  readonly mode: CharacterConversationMode;
  readonly onChange: (mode: CharacterConversationMode) => void;
  readonly disabled?: boolean;
}

const MODE_OPTIONS: Readonly<
  Record<
    CharacterConversationMode,
    {
      readonly labelKey: string;
      readonly descriptionKey: string;
    }
  >
> = {
  companion: {
    labelKey: 'chat.entryExperience.characterDialogue.modeDaily',
    descriptionKey: 'chat.entryExperience.characterDialogue.modeDailyDescription',
  },
  narrative: {
    labelKey: 'chat.entryExperience.characterDialogue.modeNarrative',
    descriptionKey: 'chat.entryExperience.characterDialogue.modeNarrativeDescription',
  },
};
const MODE_ORDER = [
  'companion',
  'narrative',
] as const satisfies readonly CharacterConversationMode[];

export function CharacterConversationModeSelector({
  mode,
  onChange,
  disabled = false,
}: CharacterConversationModeSelectorProps): JSX.Element {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('character-conversation-mode');
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'up',
    estimatedWidth: 240,
  });
  const label = t('chat.entryExperience.characterDialogue.modeLabel');
  const current = MODE_OPTIONS[mode];

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-label={`${label}: ${t(current.labelKey)}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="agent-control-chip agent-character-conversation-mode-trigger"
        title={label}
      >
        <span className="agent-control-chip-text">{t(current.labelKey)}</span>
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen ? (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-mode absolute ${dropdownPositionClass(placement)}`}
          role="menu"
          aria-label={label}
        >
          <div className="agent-dropdown-header" role="presentation">
            {label}
          </div>
          {MODE_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                onChange(value);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-stacked ${
                mode === value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitemradio"
              aria-checked={mode === value}
            >
              <div>{t(MODE_OPTIONS[value].labelKey)}</div>
              <div className="agent-dropdown-item-description">
                {t(MODE_OPTIONS[value].descriptionKey)}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
