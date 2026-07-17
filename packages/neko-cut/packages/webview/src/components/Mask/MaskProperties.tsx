/**
 * MaskProperties Component
 * 蒙版属性控制面板
 */

import { memo, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { MaskInstance, MaskBlendMode } from '../../types/mask';

// =============================================================================
// Types
// =============================================================================

interface MaskPropertiesProps {
  mask: MaskInstance;
  onChange: (mask: MaskInstance) => void;
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

  return (
    <div className="flex items-center gap-2">
      <label className="w-16 text-[10px] text-[var(--vscode-descriptionForeground)] truncate">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="flex-1 h-1 accent-[var(--vscode-button-background)]"
      />
      <span className="w-12 text-[10px] text-[var(--vscode-foreground)] text-right">
        {value.toFixed(step < 1 ? 2 : 0)}
        {unit}
      </span>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const MaskProperties = memo(function MaskProperties({
  mask,
  onChange,
}: MaskPropertiesProps) {
  const { t } = useTranslation();

  const handleFeatherChange = useCallback(
    (feather: number) => {
      onChange({ ...mask, feather });
    },
    [mask, onChange],
  );

  const handleExpansionChange = useCallback(
    (expansion: number) => {
      onChange({ ...mask, expansion });
    },
    [mask, onChange],
  );

  const handleOpacityChange = useCallback(
    (opacity: number) => {
      onChange({ ...mask, opacity });
    },
    [mask, onChange],
  );

  const handleInvertedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...mask, inverted: e.target.checked });
    },
    [mask, onChange],
  );

  const handleBlendModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...mask, blendMode: e.target.value as MaskBlendMode });
    },
    [mask, onChange],
  );

  return (
    <div className="space-y-2">
      {/* Blend Mode */}
      <div className="flex items-center gap-2">
        <label className="w-16 text-[10px] text-[var(--vscode-descriptionForeground)]">
          {t('mask.blendMode.label')}
        </label>
        <select
          value={mask.blendMode}
          onChange={handleBlendModeChange}
          className="flex-1 px-1 py-0.5 text-[10px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
        >
          <option value="add">{t('mask.blendMode.add')}</option>
          <option value="subtract">{t('mask.blendMode.subtract')}</option>
          <option value="intersect">{t('mask.blendMode.intersect')}</option>
          <option value="difference">{t('mask.blendMode.difference')}</option>
        </select>
      </div>

      {/* Feather */}
      <SliderRow
        label={t('mask.feather')}
        value={mask.feather}
        min={0}
        max={100}
        step={1}
        onChange={handleFeatherChange}
        unit="px"
      />

      {/* Expansion */}
      <SliderRow
        label={t('mask.expansion')}
        value={mask.expansion}
        min={-100}
        max={100}
        step={1}
        onChange={handleExpansionChange}
        unit="px"
      />

      {/* Opacity */}
      <SliderRow
        label={t('mask.opacity')}
        value={mask.opacity}
        min={0}
        max={1}
        step={0.01}
        onChange={handleOpacityChange}
        unit="%"
      />

      {/* Inverted */}
      <label className="flex items-center gap-2 text-[10px]">
        <input
          type="checkbox"
          checked={mask.inverted}
          onChange={handleInvertedChange}
          className="accent-[var(--vscode-button-background)]"
        />
        <span className="text-[var(--vscode-foreground)]">{t('mask.inverted')}</span>
      </label>
    </div>
  );
});

export default MaskProperties;
