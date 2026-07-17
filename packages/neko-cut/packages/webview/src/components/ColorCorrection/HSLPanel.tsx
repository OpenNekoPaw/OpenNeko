/**
 * HSLPanel Component
 * HSL per-color adjustment — adjust hue/saturation/luminance per color range
 */

import { memo, useCallback, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { HSLAdjustment, HSLColorRange, HSLRangeAdjustment } from '../../types/colorCorrection';
import { DEFAULT_HSL_RANGE } from '../../types/colorCorrection';

// =============================================================================
// Types
// =============================================================================

interface HSLPanelProps {
  hsl: HSLAdjustment;
  onChange: (hsl: HSLAdjustment) => void;
}

// 8 color ranges in hue order
const HSL_COLOR_RANGES: HSLColorRange[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'magenta',
];

// Color indicators for each range (approximate hue colors)
const RANGE_COLORS: Record<HSLColorRange, string> = {
  red: '#ff4444',
  orange: '#ff8800',
  yellow: '#ffcc00',
  green: '#44bb44',
  cyan: '#44cccc',
  blue: '#4488ff',
  purple: '#8844ff',
  magenta: '#ff44cc',
};

// =============================================================================
// Slider Row
// =============================================================================

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const SliderRow = memo(function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: SliderRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] w-8 shrink-0">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[var(--vscode-button-background)]"
      />
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] w-8 text-right tabular-nums">
        {value}
      </span>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const HSLPanel = memo(function HSLPanel({ hsl, onChange }: HSLPanelProps) {
  const { t } = useTranslation();
  const [activeRange, setActiveRange] = useState<HSLColorRange>('red');

  const handleRangeChange = useCallback(
    (field: keyof HSLRangeAdjustment, value: number) => {
      onChange({
        ...hsl,
        [activeRange]: {
          ...hsl[activeRange],
          [field]: value,
        },
      });
    },
    [hsl, activeRange, onChange],
  );

  const handleReset = useCallback(() => {
    onChange({
      ...hsl,
      [activeRange]: { ...DEFAULT_HSL_RANGE },
    });
  }, [hsl, activeRange, onChange]);

  const current = hsl[activeRange];
  const isModified = current.hue !== 0 || current.saturation !== 0 || current.luminance !== 0;

  return (
    <div className="space-y-2">
      {/* Color range selector */}
      <div className="flex gap-0.5 flex-wrap">
        {HSL_COLOR_RANGES.map((range) => {
          const rangeData = hsl[range];
          const modified =
            rangeData.hue !== 0 || rangeData.saturation !== 0 || rangeData.luminance !== 0;
          return (
            <button
              key={range}
              className={`relative px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                activeRange === range
                  ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                  : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              onClick={() => setActiveRange(range)}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-0.5"
                style={{ backgroundColor: RANGE_COLORS[range] }}
              />
              {t(`colorCorrection.hsl.ranges.${range}`)}
              {modified && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--vscode-button-background)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Adjustments for selected range */}
      <div className="space-y-1.5">
        <SliderRow
          label={t('colorCorrection.hsl.hue')}
          value={current.hue}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => handleRangeChange('hue', v)}
        />
        <SliderRow
          label={t('colorCorrection.hsl.saturation')}
          value={current.saturation}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleRangeChange('saturation', v)}
        />
        <SliderRow
          label={t('colorCorrection.hsl.luminance')}
          value={current.luminance}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => handleRangeChange('luminance', v)}
        />
      </div>

      {/* Reset button */}
      {isModified && (
        <button
          className="text-[10px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors"
          onClick={handleReset}
        >
          {t('colorCorrection.reset')} {t(`colorCorrection.hsl.ranges.${activeRange}`)}
        </button>
      )}
    </div>
  );
});
