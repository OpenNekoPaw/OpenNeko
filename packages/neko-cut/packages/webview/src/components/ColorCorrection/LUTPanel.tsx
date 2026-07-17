/**
 * LUTPanel Component
 * LUT (Look-Up Table) — load .cube files for color grading
 */

import { memo, useCallback } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { LUTAdjustment } from '../../types/colorCorrection';
import { postMessage } from '../../utils/vscodeApi';

// =============================================================================
// Types
// =============================================================================

interface LUTPanelProps {
  lut: LUTAdjustment;
  onChange: (lut: LUTAdjustment) => void;
}

// =============================================================================
// Main Component
// =============================================================================

export const LUTPanel = memo(function LUTPanel({ lut, onChange }: LUTPanelProps) {
  const { t } = useTranslation();

  const handleLoadLut = useCallback(() => {
    // Request Extension Host to open file dialog and load .cube file
    postMessage({
      type: 'colorCorrection:loadLut',
    });
  }, []);

  const handleIntensityChange = useCallback(
    (intensity: number) => {
      onChange({
        ...lut,
        intensity,
      });
    },
    [lut, onChange],
  );

  const handleToggle = useCallback(() => {
    onChange({
      ...lut,
      enabled: !lut.enabled,
    });
  }, [lut, onChange]);

  const handleRemove = useCallback(() => {
    onChange({
      ...lut,
      enabled: false,
      lutId: null,
      intensity: 100,
    });
  }, [lut, onChange]);

  return (
    <div className="space-y-3">
      {/* Load button */}
      <button className="nk-btn-primary w-full justify-center text-[11px]" onClick={handleLoadLut}>
        {t('colorCorrection.lut.loadLut')}
      </button>

      {/* Loaded LUT info */}
      {lut.lutId ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={lut.enabled}
                onChange={handleToggle}
                className="accent-[var(--nk-accent)]"
              />
              <span className="max-w-[120px] truncate text-[var(--nk-fg)]">{lut.lutId}</span>
            </label>
            <button
              className="text-[10px] text-[var(--nk-fg-secondary)] transition-colors hover:text-[var(--nk-red)]"
              onClick={handleRemove}
            >
              ✕
            </button>
          </div>

          {/* Intensity slider */}
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[10px] text-[var(--nk-fg-secondary)]">
              {t('colorCorrection.lut.intensity')}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={lut.intensity}
              onChange={(e) => handleIntensityChange(Number(e.target.value))}
              disabled={!lut.enabled}
              className="nk-prop-slider"
            />
            <span className="w-8 text-right text-[10px] tabular-nums text-[var(--nk-fg-secondary)]">
              {lut.intensity}%
            </span>
          </div>
        </div>
      ) : (
        <p className="py-2 text-center text-[10px] text-[var(--nk-fg-secondary)]">
          {t('colorCorrection.lut.noLut')}
          <br />
          <span className="text-[9px]">{t('colorCorrection.lut.supportedFormats')}</span>
        </p>
      )}
    </div>
  );
});
