/**
 * SpeedControl Component
 * 速度控制组件 - 用于调整元素播放速度、倒放和时间重映射
 */

import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { SpeedProperties } from '../../types';
import {
  SPEED_PRESETS,
  createDefaultSpeedProperties,
  formatSpeed,
  formatTime,
  getSpeedAdjustedDuration,
  clampSpeed,
} from '../../utils/speed';

// =============================================================================
// Types
// =============================================================================

interface SpeedControlProps {
  /** Current speed properties */
  speed: SpeedProperties | undefined;
  /** Original media duration */
  originalDuration: number;
  /** Callback when speed changes */
  onChange: (speed: SpeedProperties) => void;
  /** Whether the control is disabled */
  disabled?: boolean;
}

// =============================================================================
// SpeedPresetButton Component
// =============================================================================

interface SpeedPresetButtonProps {
  value: number;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const SpeedPresetButton = memo(function SpeedPresetButton({
  value,
  isSelected,
  onClick,
  disabled,
}: SpeedPresetButtonProps) {
  return (
    <button
      className={`px-2 py-1 text-[10px] rounded transition-colors ${
        isSelected
          ? 'bg-[var(--nk-accent)] text-[var(--nk-accent-fg)]'
          : 'bg-[var(--nk-input-bg)] text-[var(--nk-fg)] hover:bg-[var(--nk-bg-hover)]'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      onClick={onClick}
      disabled={disabled}
    >
      {formatSpeed(value)}
    </button>
  );
});

// =============================================================================
// SpeedSlider Component
// =============================================================================

interface SpeedSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const SpeedSlider = memo(function SpeedSlider({ value, onChange, disabled }: SpeedSliderProps) {
  const { t } = useTranslation();

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      onChange(clampSpeed(newValue));
    },
    [onChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue)) {
        onChange(clampSpeed(newValue));
      }
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <label className="w-16 shrink-0 text-[10px] text-[var(--nk-fg-secondary)]">
        {t('speed.playbackSpeed')}
      </label>
      <input
        type="range"
        min="0.1"
        max="4"
        step="0.05"
        value={value}
        onChange={handleSliderChange}
        disabled={disabled}
        className="nk-prop-slider"
      />
      <input
        type="number"
        min="0.1"
        max="4"
        step="0.05"
        value={value.toFixed(2)}
        onChange={handleInputChange}
        disabled={disabled}
        className="nk-prop-input-sm w-16 text-center disabled:opacity-50"
      />
    </div>
  );
});

// =============================================================================
// ToggleOption Component
// =============================================================================

interface ToggleOptionProps {
  labelKey: string;
  descriptionKey?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const ToggleOption = memo(function ToggleOption({
  labelKey,
  descriptionKey,
  checked,
  onChange,
  disabled,
}: ToggleOptionProps) {
  const { t } = useTranslation();

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-[var(--nk-accent)]"
      />
      <span className="text-[11px] text-[var(--nk-fg)]">{t(labelKey)}</span>
      {descriptionKey && (
        <span className="text-[10px] italic text-[var(--nk-fg-secondary)]">
          {t(descriptionKey)}
        </span>
      )}
    </label>
  );
});

// =============================================================================
// DurationInfo Component
// =============================================================================

interface DurationInfoProps {
  originalDuration: number;
  adjustedDuration: number;
}

const DurationInfo = memo(function DurationInfo({
  originalDuration,
  adjustedDuration,
}: DurationInfoProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1 rounded bg-[var(--nk-input-bg)] p-2 text-[10px]">
      <div className="flex justify-between">
        <span className="text-[var(--nk-fg-secondary)]">{t('speed.originalDuration')}</span>
        <span className="font-mono text-[var(--nk-fg)]">{formatTime(originalDuration)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--nk-fg-secondary)]">{t('speed.adjustedDuration')}</span>
        <span className="font-mono text-[var(--nk-fg)]">{formatTime(adjustedDuration)}</span>
      </div>
    </div>
  );
});

// =============================================================================
// Main SpeedControl Component
// =============================================================================

export const SpeedControl = memo(function SpeedControl({
  speed,
  originalDuration,
  onChange,
  disabled = false,
}: SpeedControlProps) {
  const { t } = useTranslation();

  // Initialize with default values if no speed is set
  const currentSpeed = useMemo(() => {
    return speed ?? createDefaultSpeedProperties();
  }, [speed]);

  // Calculate adjusted duration
  const adjustedDuration = useMemo(() => {
    return getSpeedAdjustedDuration(originalDuration, currentSpeed);
  }, [originalDuration, currentSpeed]);

  // Handle speed value change
  const handleSpeedChange = useCallback(
    (value: number) => {
      onChange({
        ...currentSpeed,
        speed: value,
      });
    },
    [currentSpeed, onChange],
  );

  // Handle reverse toggle
  const handleReverseChange = useCallback(
    (checked: boolean) => {
      onChange({
        ...currentSpeed,
        reverse: checked,
      });
    },
    [currentSpeed, onChange],
  );

  // Handle preserve pitch toggle
  const handlePreservePitchChange = useCallback(
    (checked: boolean) => {
      onChange({
        ...currentSpeed,
        preservePitch: checked,
      });
    },
    [currentSpeed, onChange],
  );

  // Handle preset selection
  const handlePresetSelect = useCallback(
    (preset: number) => {
      onChange({
        ...currentSpeed,
        speed: preset,
      });
    },
    [currentSpeed, onChange],
  );

  // Handle reset
  const handleReset = useCallback(() => {
    onChange(createDefaultSpeedProperties());
  }, [onChange]);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-medium text-[var(--nk-fg)]">{t('speed.title')}</h3>
        <button
          className="text-[10px] text-[var(--nk-accent)] hover:text-[var(--nk-accent-hover)] disabled:opacity-50"
          onClick={handleReset}
          disabled={disabled}
        >
          {t('speed.reset')}
        </button>
      </div>

      {/* Speed Presets */}
      <div className="flex flex-wrap gap-1">
        {SPEED_PRESETS.map((preset) => (
          <SpeedPresetButton
            key={preset}
            value={preset}
            isSelected={currentSpeed.speed === preset}
            onClick={() => handlePresetSelect(preset)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Speed Slider */}
      <SpeedSlider value={currentSpeed.speed} onChange={handleSpeedChange} disabled={disabled} />

      {/* Options */}
      <div className="flex flex-col gap-2">
        <ToggleOption
          labelKey="speed.reverse"
          checked={currentSpeed.reverse}
          onChange={handleReverseChange}
          disabled={disabled}
        />
        <ToggleOption
          labelKey="speed.preservePitch"
          descriptionKey={currentSpeed.preservePitch ? 'speed.pitchPreserved' : 'speed.pitchVaried'}
          checked={currentSpeed.preservePitch}
          onChange={handlePreservePitchChange}
          disabled={disabled}
        />
      </div>

      {/* Duration Info */}
      <DurationInfo originalDuration={originalDuration} adjustedDuration={adjustedDuration} />
    </div>
  );
});

export default SpeedControl;
