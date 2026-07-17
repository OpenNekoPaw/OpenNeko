/**
 * BasicAdjustments Component
 * 基础调整组件 - 曝光、对比度、色温等
 */

import { memo, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { BasicColorAdjustment } from '../../types/colorCorrection';

// =============================================================================
// Types
// =============================================================================

interface BasicAdjustmentsProps {
  basic: BasicColorAdjustment;
  onChange: (basic: BasicColorAdjustment) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
}

// =============================================================================
// Slider Row Component
// =============================================================================

const SliderRow = memo(function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = '',
}: SliderRowProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue)) {
        onChange(Math.max(min, Math.min(max, newValue)));
      }
    },
    [onChange, min, max],
  );

  const handleDoubleClick = useCallback(() => {
    // Reset to default (0 for most adjustments)
    onChange(0);
  }, [onChange]);

  return (
    <div className="flex items-center gap-2">
      <label className="w-24 text-[10px] text-[var(--nk-fg-secondary)] truncate">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        onDoubleClick={handleDoubleClick}
        className="nk-prop-slider cursor-pointer"
      />
      <input
        type="number"
        value={value.toFixed(step < 1 ? 2 : 0)}
        onChange={handleInputChange}
        className="nk-prop-input-sm w-14 text-right"
      />
      {unit && <span className="w-4 text-[10px] text-[var(--nk-fg-secondary)]">{unit}</span>}
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const BasicAdjustments = memo(function BasicAdjustments({
  basic,
  onChange,
}: BasicAdjustmentsProps) {
  const { t } = useTranslation();

  const handleChange = useCallback(
    (key: keyof BasicColorAdjustment, value: number) => {
      onChange({
        ...basic,
        [key]: value,
      });
    },
    [basic, onChange],
  );

  return (
    <div className="space-y-2">
      {/* Exposure & Contrast */}
      <div className="space-y-1.5">
        <SliderRow
          label={t('colorCorrection.basic.exposure')}
          value={basic.exposure}
          min={-3}
          max={3}
          step={0.01}
          onChange={(v) => handleChange('exposure', v)}
        />
        <SliderRow
          label={t('colorCorrection.basic.contrast')}
          value={basic.contrast}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('contrast', v)}
        />
      </div>

      {/* Highlights & Shadows */}
      <div className="space-y-1.5 border-t border-[var(--nk-border)] pt-1">
        <SliderRow
          label={t('colorCorrection.basic.highlights')}
          value={basic.highlights}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('highlights', v)}
        />
        <SliderRow
          label={t('colorCorrection.basic.shadows')}
          value={basic.shadows}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('shadows', v)}
        />
        <SliderRow
          label={t('colorCorrection.basic.whites')}
          value={basic.whites}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('whites', v)}
        />
        <SliderRow
          label={t('colorCorrection.basic.blacks')}
          value={basic.blacks}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('blacks', v)}
        />
      </div>

      {/* Temperature & Tint */}
      <div className="space-y-1.5 border-t border-[var(--nk-border)] pt-1">
        <SliderRow
          label={t('colorCorrection.basic.temperature')}
          value={basic.temperature}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('temperature', v)}
        />
        <SliderRow
          label={t('colorCorrection.basic.tint')}
          value={basic.tint}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('tint', v)}
        />
      </div>

      {/* Saturation & Vibrance */}
      <div className="space-y-1.5 border-t border-[var(--nk-border)] pt-1">
        <SliderRow
          label={t('colorCorrection.basic.saturation')}
          value={basic.saturation}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('saturation', v)}
        />
        <SliderRow
          label={t('colorCorrection.basic.vibrance')}
          value={basic.vibrance}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleChange('vibrance', v)}
        />
      </div>
    </div>
  );
});

export default BasicAdjustments;
