/**
 * ColorCorrectionPanel Component
 * 颜色校正面板组件 - 调整视频/图像的颜色
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  ColorCorrection,
  BasicColorAdjustment,
  HSLAdjustment,
  LUTAdjustment,
  ColorWheelValue,
} from '../../types/colorCorrection';
import {
  createDefaultColorCorrection,
  COLOR_CORRECTION_PRESETS,
} from '../../types/colorCorrection';
import { BasicAdjustments } from './BasicAdjustments';
import { CurvesPanel } from './CurvesPanel';
import { ColorWheelsPanel } from './ColorWheelsPanel';
import { HSLPanel } from './HSLPanel';
import { LUTPanel } from './LUTPanel';

// =============================================================================
// Types
// =============================================================================

interface ColorCorrectionPanelProps {
  colorCorrection: ColorCorrection | undefined;
  onChange: (colorCorrection: ColorCorrection) => void;
  disabled?: boolean;
}

type TabType = 'basic' | 'curves' | 'colorWheels' | 'hsl' | 'lut';

// =============================================================================
// Tab Button Component
// =============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton = memo(function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      className={`px-2 py-1 text-[10px] rounded transition-colors ${
        active
          ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
          : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const ColorCorrectionPanel = memo(function ColorCorrectionPanel({
  colorCorrection,
  onChange,
  disabled = false,
}: ColorCorrectionPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('basic');

  // Ensure we have a color correction object
  const cc = colorCorrection ?? createDefaultColorCorrection();

  // Handle enable/disable toggle
  const handleToggleEnabled = useCallback(() => {
    onChange({
      ...cc,
      enabled: !cc.enabled,
    });
  }, [cc, onChange]);

  // Handle reset
  const handleReset = useCallback(() => {
    onChange(createDefaultColorCorrection());
  }, [onChange]);

  // Handle preset selection
  const handlePresetSelect = useCallback(
    (presetKey: string) => {
      const preset = COLOR_CORRECTION_PRESETS[presetKey];
      if (preset) {
        onChange({
          ...createDefaultColorCorrection(),
          ...preset,
          enabled: true,
        });
      }
    },
    [onChange],
  );

  // Handle basic adjustment change
  const handleBasicChange = useCallback(
    (basic: BasicColorAdjustment) => {
      onChange({
        ...cc,
        basic,
      });
    },
    [cc, onChange],
  );

  // Handle curves change
  const handleCurvesChange = useCallback(
    (curves: ColorCorrection['curves']) => {
      onChange({
        ...cc,
        curves,
      });
    },
    [cc, onChange],
  );

  // Handle LUT change
  const handleLUTChange = useCallback(
    (lut: LUTAdjustment) => {
      onChange({
        ...cc,
        lut,
      });
    },
    [cc, onChange],
  );

  // Listen for colorCorrection:lutLoaded from Extension Host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type?: string; lutId?: string; name?: string };
      if (msg.type === 'colorCorrection:lutLoaded' && msg.lutId) {
        handleLUTChange({
          enabled: true,
          lutId: msg.lutId,
          intensity: 100,
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleLUTChange]);

  // Handle HSL change
  const handleHSLChange = useCallback(
    (hsl: HSLAdjustment) => {
      onChange({
        ...cc,
        hsl,
      });
    },
    [cc, onChange],
  );

  // Handle color wheels change
  const handleColorWheelsChange = useCallback(
    (wheel: 'shadows' | 'midtones' | 'highlights' | 'global', settings: ColorWheelValue) => {
      onChange({
        ...cc,
        colorWheels: {
          ...cc.colorWheels,
          [wheel]: settings,
        },
      });
    },
    [cc, onChange],
  );

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            checked={cc.enabled}
            onChange={handleToggleEnabled}
            disabled={disabled}
            className="accent-[var(--vscode-button-background)]"
          />
          <span className="text-[var(--vscode-foreground)]">{t('colorCorrection.enabled')}</span>
        </label>
        <button
          className="px-2 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleReset}
          disabled={disabled}
        >
          {t('colorCorrection.reset')}
        </button>
      </div>

      {/* Presets */}
      <div className="space-y-1">
        <label className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {t('colorCorrection.presets')}
        </label>
        <select
          className="w-full px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] disabled:opacity-50"
          value=""
          onChange={(e) => handlePresetSelect(e.target.value)}
          disabled={disabled}
        >
          <option value="">{t('colorCorrection.preset.none')}</option>
          {Object.keys(COLOR_CORRECTION_PRESETS).map((key) => (
            <option key={key} value={key}>
              {t(`colorCorrection.preset.${key}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--vscode-panel-border)] pb-1">
        <TabButton active={activeTab === 'basic'} onClick={() => setActiveTab('basic')}>
          {t('colorCorrection.tabs.basic')}
        </TabButton>
        <TabButton active={activeTab === 'curves'} onClick={() => setActiveTab('curves')}>
          {t('colorCorrection.tabs.curves')}
        </TabButton>
        <TabButton active={activeTab === 'colorWheels'} onClick={() => setActiveTab('colorWheels')}>
          {t('colorCorrection.tabs.colorWheels')}
        </TabButton>
        <TabButton active={activeTab === 'hsl'} onClick={() => setActiveTab('hsl')}>
          {t('colorCorrection.tabs.hsl')}
        </TabButton>
        <TabButton active={activeTab === 'lut'} onClick={() => setActiveTab('lut')}>
          {t('colorCorrection.tabs.lut')}
        </TabButton>
      </div>

      {/* Tab Content */}
      <div className="pt-1">
        {activeTab === 'basic' && (
          <BasicAdjustments basic={cc.basic} onChange={handleBasicChange} />
        )}
        {activeTab === 'curves' && <CurvesPanel curves={cc.curves} onChange={handleCurvesChange} />}
        {activeTab === 'colorWheels' && (
          <ColorWheelsPanel colorWheels={cc.colorWheels} onChange={handleColorWheelsChange} />
        )}
        {activeTab === 'hsl' && <HSLPanel hsl={cc.hsl} onChange={handleHSLChange} />}
        {activeTab === 'lut' && <LUTPanel lut={cc.lut} onChange={handleLUTChange} />}
      </div>
    </div>
  );
});

export default ColorCorrectionPanel;
