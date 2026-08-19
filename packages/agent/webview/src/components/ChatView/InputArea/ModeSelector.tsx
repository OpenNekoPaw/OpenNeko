/**
 * ModeSelector Component
 * Shell execution mode selector (plan/ask/auto)
 */

import { useState, useRef } from 'react';
import { useComposerControlMenu } from './composer-menu-runtime';
import { ShellExecutionMode } from '@neko/agent-contracts';
import { useClickOutsideSingle } from './useClickOutside';
import { ChevronDownIcon } from './DropdownMenu';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { useTranslation } from '../../../i18n/I18nContext';

interface ModeSelectorProps {
  mode: ShellExecutionMode;
  onChange: (mode: ShellExecutionMode) => void;
  disabled?: boolean;
  disabledReason?: string;
  availableModes?: Readonly<Record<ShellExecutionMode, boolean>>;
}

export function ModeSelector({
  mode,
  onChange,
  disabled = false,
  disabledReason,
  availableModes,
}: ModeSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('execution-mode');
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'up',
    estimatedWidth: 220,
  });

  const MODE_OPTIONS: Array<{
    value: ShellExecutionMode;
    labelKey: string;
    descriptionKey: string;
  }> = [
    {
      value: 'plan',
      labelKey: 'chat.executionMode.plan',
      descriptionKey: 'chat.executionMode.planDesc',
    },
    {
      value: 'ask',
      labelKey: 'chat.executionMode.ask',
      descriptionKey: 'chat.executionMode.askDesc',
    },
    {
      value: 'auto',
      labelKey: 'chat.executionMode.auto',
      descriptionKey: 'chat.executionMode.autoDesc',
    },
  ];

  const currentMode = MODE_OPTIONS.find((option) => option.value === mode);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('chat.executionMode.title')}
        className="agent-control-chip agent-execution-mode-trigger"
        title={disabledReason ?? `${t('chat.executionMode.title')} (Shift+Tab)`}
      >
        <span className="agent-control-chip-text">
          {currentMode ? t(currentMode.labelKey) : mode}
        </span>
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-mode absolute ${dropdownPositionClass(placement)}`}
          role="menu"
          aria-label={t('chat.executionMode.title')}
        >
          <div className="agent-dropdown-header" role="presentation">
            {t('chat.executionMode.title')}
          </div>
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-stacked ${
                mode === option.value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitemradio"
              aria-label={t(option.labelKey)}
              aria-checked={mode === option.value}
              disabled={availableModes?.[option.value] === false}
            >
              <div>{t(option.labelKey)}</div>
              <div className="agent-dropdown-item-description">{t(option.descriptionKey)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
