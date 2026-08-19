/**
 * ModeSelector Component
 * Shared mode selector. Runtime-backed surfaces provide their canonical options.
 */

import { useState, useRef } from 'react';
import { useComposerControlMenu } from './composer-menu-runtime';
import type { ShellExecutionMode } from '@neko/agent-contracts';
import { useClickOutsideSingle } from './useClickOutside';
import { ChevronDownIcon } from './DropdownMenu';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { useTranslation } from '../../../i18n/I18nContext';

interface ModeSelectorProps {
  mode: string;
  onChange: (mode: string) => void;
  options?: readonly ModeSelectorOption[];
  disabled?: boolean;
  disabledReason?: string;
  availableModes?: Readonly<Record<ShellExecutionMode, boolean>>;
}

export interface ModeSelectorOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export function ModeSelector({
  mode,
  onChange,
  options,
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

  const defaultOptions: Array<{
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
  const modeOptions: readonly ModeSelectorOption[] =
    options ??
    defaultOptions.map((option) => ({
      id: option.value,
      label: t(option.labelKey),
      description: t(option.descriptionKey),
      disabled: availableModes?.[option.value] === false,
    }));
  const currentMode = modeOptions.find((option) => option.id === mode);

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
        <span className="agent-control-chip-text">{currentMode?.label ?? mode}</span>
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
          {modeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-stacked ${
                mode === option.id ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitemradio"
              aria-label={option.label}
              aria-checked={mode === option.id}
              disabled={option.disabled}
            >
              <div>{option.label}</div>
              {option.description ? (
                <div className="agent-dropdown-item-description">{option.description}</div>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
