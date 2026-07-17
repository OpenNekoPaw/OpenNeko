/**
 * TransitionPicker Component
 * 转场选择器组件 - 用于选择和配置转场效果
 */

import { memo, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { Transition, EasingType } from '../../types';
import {
  TRANSITION_PRESETS,
  createTransitionFromPreset,
  type TransitionPreset,
} from '../../types/transition';

// =============================================================================
// Types
// =============================================================================

interface TransitionPickerProps {
  /** Current transition */
  transition: Transition | null;
  /** Callback when transition changes */
  onChange: (transition: Transition | null) => void;
  /** Whether to show duration control */
  showDuration?: boolean;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

// =============================================================================
// EasingType Options (for the dropdown)
// =============================================================================

const EASING_OPTIONS: { value: EasingType; labelKey: string }[] = [
  { value: 'linear', labelKey: 'animation.easing.linear' },
  { value: 'ease-in', labelKey: 'animation.easing.easeIn' },
  { value: 'ease-out', labelKey: 'animation.easing.easeOut' },
  { value: 'ease-in-out', labelKey: 'animation.easing.easeInOut' },
  { value: 'ease-in-cubic', labelKey: 'animation.easing.easeInCubic' },
  { value: 'ease-out-cubic', labelKey: 'animation.easing.easeOutCubic' },
  { value: 'ease-in-out-cubic', labelKey: 'animation.easing.easeInOutCubic' },
];

// =============================================================================
// TransitionPresetCard Component
// =============================================================================

interface TransitionPresetCardProps {
  preset: TransitionPreset;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const TransitionPresetCard = memo(function TransitionPresetCard({
  preset,
  isSelected,
  onClick,
  disabled,
}: TransitionPresetCardProps) {
  const { t } = useTranslation();

  return (
    <button
      className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded border px-1.5 py-1.5 transition-colors ${
        isSelected
          ? 'border-[var(--nk-border-focus)] bg-[var(--nk-bg-active)]'
          : 'border-[var(--nk-border)] bg-[var(--nk-input-bg)] hover:bg-[var(--nk-bg-hover)]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={onClick}
      disabled={disabled}
      title={t(preset.i18nKey)}
    >
      <span className="text-base leading-none">{preset.icon}</span>
      <span className="w-full truncate text-center text-[9px] leading-tight text-[var(--nk-fg)]">
        {t(preset.i18nKey)}
      </span>
    </button>
  );
});

// =============================================================================
// NoneTransitionCard Component
// =============================================================================

interface NoneTransitionCardProps {
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const NoneTransitionCard = memo(function NoneTransitionCard({
  isSelected,
  onClick,
  disabled,
}: NoneTransitionCardProps) {
  const { t } = useTranslation();

  return (
    <button
      className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded border px-1.5 py-1.5 transition-colors ${
        isSelected
          ? 'border-[var(--nk-border-focus)] bg-[var(--nk-bg-active)]'
          : 'border-[var(--nk-border)] bg-[var(--nk-input-bg)] hover:bg-[var(--nk-bg-hover)]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={onClick}
      disabled={disabled}
      title={t('transition.type.none')}
    >
      <span className="text-base leading-none">x</span>
      <span className="w-full truncate text-center text-[9px] leading-tight text-[var(--nk-fg)]">
        {t('transition.type.none')}
      </span>
    </button>
  );
});

// =============================================================================
// DurationControl Component
// =============================================================================

interface DurationControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const DurationControl = memo(function DurationControl({
  value,
  onChange,
  disabled,
}: DurationControlProps) {
  const { t } = useTranslation();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue) && newValue > 0) {
        onChange(newValue);
      }
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <label className="w-16 shrink-0 text-[10px] text-[var(--nk-fg-secondary)]">
        {t('transition.duration')}
      </label>
      <input
        type="range"
        min="0.1"
        max="2"
        step="0.1"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="nk-prop-slider"
      />
      <span className="w-10 text-right font-mono text-[10px] text-[var(--nk-fg)]">
        {value.toFixed(1)}s
      </span>
    </div>
  );
});

// =============================================================================
// EasingControl Component
// =============================================================================

interface EasingControlProps {
  value: EasingType;
  onChange: (value: EasingType) => void;
  disabled?: boolean;
}

const EasingControl = memo(function EasingControl({
  value,
  onChange,
  disabled,
}: EasingControlProps) {
  const { t } = useTranslation();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as EasingType);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <label className="w-16 shrink-0 text-[10px] text-[var(--nk-fg-secondary)]">
        {t('transition.easing')}
      </label>
      <select
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="nk-select flex-1 disabled:opacity-50"
      >
        {EASING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
});

// =============================================================================
// Main TransitionPicker Component
// =============================================================================

export const TransitionPicker = memo(function TransitionPicker({
  transition,
  onChange,
  showDuration = true,
  disabled = false,
}: TransitionPickerProps) {
  const { t } = useTranslation();

  // Handle preset selection
  const handlePresetSelect = useCallback(
    (preset: TransitionPreset) => {
      const newTransition = createTransitionFromPreset(preset);
      // Preserve existing duration if we have one
      if (transition?.duration) {
        newTransition.duration = transition.duration;
      }
      onChange(newTransition);
    },
    [transition, onChange],
  );

  // Handle remove transition
  const handleRemoveTransition = useCallback(() => {
    onChange(null);
  }, [onChange]);

  // Handle duration change
  const handleDurationChange = useCallback(
    (duration: number) => {
      if (transition) {
        onChange({
          ...transition,
          duration,
        });
      }
    },
    [transition, onChange],
  );

  // Handle easing change
  const handleEasingChange = useCallback(
    (easing: EasingType) => {
      if (transition) {
        onChange({
          ...transition,
          easing,
        });
      }
    },
    [transition, onChange],
  );

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3">
      {/* Title */}
      <h3 className="text-[12px] font-medium text-[var(--nk-fg)]">
        {t('transition.selectTransition')}
      </h3>

      {/* Transition Grid */}
      <div className="grid max-h-56 grid-cols-[repeat(auto-fit,minmax(58px,1fr))] gap-1.5 overflow-y-auto pr-1">
        {/* None option */}
        <NoneTransitionCard
          isSelected={!transition}
          onClick={handleRemoveTransition}
          disabled={disabled}
        />

        {/* Preset options */}
        {TRANSITION_PRESETS.map((preset) => (
          <TransitionPresetCard
            key={preset.type}
            preset={preset}
            isSelected={transition?.type === preset.type}
            onClick={() => handlePresetSelect(preset)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Duration & Easing Controls (only show when a transition is selected) */}
      {transition && (
        <div className="flex flex-col gap-2 border-t border-[var(--nk-border)] pt-2">
          {showDuration && (
            <DurationControl
              value={transition.duration}
              onChange={handleDurationChange}
              disabled={disabled}
            />
          )}
          <EasingControl
            value={transition.easing}
            onChange={handleEasingChange}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
});

export default TransitionPicker;
