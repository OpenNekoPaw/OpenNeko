/**
 * StrokeAnimationPresetPicker - 描边动画预设选择器
 *
 * 提供可视化的描边动画预设选择界面：
 * - 绘制入场/出场动画
 * - 虚线行进动画
 * - 描边脉冲动画
 * - 淡入淡出动画
 */

import { memo, useCallback, useState, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { StrokeAnimationPreset } from '../../types/shapeAnimation';
import { STROKE_ANIMATION_PRESET_I18N_KEYS } from '../../types/shapeAnimation';

// =============================================================================
// Types
// =============================================================================

interface StrokeAnimationPresetPickerProps {
  /** Currently selected preset (optional) */
  selectedPreset?: StrokeAnimationPreset | null;
  /** Duration for the preset animation */
  duration: number;
  /** Max duration */
  maxDuration?: number;
  /** Handler when a preset is selected and applied */
  onApply: (preset: StrokeAnimationPreset, duration: number) => void;
  /** Handler when selection changes without applying */
  onSelect?: (preset: StrokeAnimationPreset | null) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Compact mode - show as dropdown instead of grid */
  compact?: boolean;
}

interface PresetInfo {
  preset: StrokeAnimationPreset;
  icon: string;
  category: 'draw' | 'effect' | 'fade';
}

// =============================================================================
// Preset Data
// =============================================================================

const PRESETS: PresetInfo[] = [
  { preset: 'draw-on', icon: '✏️', category: 'draw' },
  { preset: 'draw-off', icon: '✂️', category: 'draw' },
  { preset: 'draw-on-reverse', icon: '↩️', category: 'draw' },
  { preset: 'draw-off-reverse', icon: '↪️', category: 'draw' },
  { preset: 'dash-march', icon: '〰️', category: 'effect' },
  { preset: 'pulse', icon: '💓', category: 'effect' },
  { preset: 'fade-in', icon: '🌅', category: 'fade' },
  { preset: 'fade-out', icon: '🌆', category: 'fade' },
];

const CATEGORY_LABELS: Record<string, string> = {
  draw: 'Draw',
  effect: 'Effects',
  fade: 'Fade',
};

// =============================================================================
// Preset Preview Component
// =============================================================================

interface PresetPreviewProps {
  preset: StrokeAnimationPreset;
  isSelected: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
  icon: string;
}

const PresetPreview = memo(function PresetPreview({
  preset,
  isSelected,
  onClick,
  disabled,
  label,
  icon,
}: PresetPreviewProps) {
  // Animation preview state
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled) return;
    onClick();
  }, [disabled, onClick]);

  const handleMouseEnter = useCallback(() => {
    setIsAnimating(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsAnimating(false);
  }, []);

  // Get animation style based on preset
  const getAnimationStyle = useMemo(() => {
    if (!isAnimating) return {};

    const baseAnimation = {
      transition: 'all 0.8s ease-in-out',
    };

    switch (preset) {
      case 'draw-on':
        return {
          ...baseAnimation,
          strokeDashoffset: isAnimating ? '0' : '100',
        };
      case 'draw-off':
        return {
          ...baseAnimation,
          strokeDashoffset: isAnimating ? '100' : '0',
        };
      case 'pulse':
        return {
          animation: 'strokePulse 0.8s ease-in-out infinite',
        };
      case 'dash-march':
        return {
          animation: 'dashMarch 0.8s linear infinite',
        };
      case 'fade-in':
        return {
          ...baseAnimation,
          opacity: isAnimating ? 1 : 0,
        };
      case 'fade-out':
        return {
          ...baseAnimation,
          opacity: isAnimating ? 0 : 1,
        };
      default:
        return baseAnimation;
    }
  }, [preset, isAnimating]);

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
        isSelected
          ? 'bg-[var(--vscode-inputOption-activeBackground)] ring-1 ring-[var(--vscode-focusBorder)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      title={label}
    >
      {/* Preview Animation */}
      <div className="w-12 h-8 flex items-center justify-center">
        <svg width="40" height="24" viewBox="0 0 40 24">
          {/* Animated path */}
          <path
            d="M 4 12 Q 12 4, 20 12 T 36 12"
            fill="none"
            stroke="var(--vscode-textLink-foreground)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={preset.includes('dash') ? '4 4' : '100'}
            style={getAnimationStyle}
          />
        </svg>
      </div>

      {/* Icon */}
      <span className="text-sm">{icon}</span>

      {/* Label */}
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] text-center truncate max-w-full">
        {label}
      </span>
    </button>
  );
});

// =============================================================================
// Duration Slider
// =============================================================================

interface DurationSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

const DurationSlider = memo(function DurationSlider({
  value,
  onChange,
  min = 0.1,
  max = 5,
  disabled = false,
}: DurationSliderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-[var(--vscode-descriptionForeground)] w-12">
        {t('shape.strokePreset.duration')}
      </label>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={0.1}
        disabled={disabled}
        className="flex-1 h-1 appearance-none bg-[var(--vscode-input-background)] rounded-full"
      />
      <span className="text-[11px] text-[var(--vscode-foreground)] w-10 text-right">
        {value.toFixed(1)}s
      </span>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const StrokeAnimationPresetPicker = memo(function StrokeAnimationPresetPicker({
  selectedPreset,
  duration: initialDuration,
  maxDuration = 5,
  onApply,
  onSelect,
  disabled = false,
  compact = false,
}: StrokeAnimationPresetPickerProps) {
  const { t } = useTranslation();
  const [localPreset, setLocalPreset] = useState<StrokeAnimationPreset | null>(
    selectedPreset || null,
  );
  const [duration, setDuration] = useState(initialDuration);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Group presets by category
  const groupedPresets = useMemo(() => {
    const groups: Record<string, PresetInfo[]> = {};
    PRESETS.forEach((p) => {
      if (!groups[p.category]) {
        groups[p.category] = [];
      }
      groups[p.category].push(p);
    });
    return groups;
  }, []);

  const handleSelectPreset = useCallback(
    (preset: StrokeAnimationPreset) => {
      setLocalPreset(preset);
      onSelect?.(preset);
    },
    [onSelect],
  );

  const handleApply = useCallback(() => {
    if (localPreset) {
      onApply(localPreset, duration);
    }
  }, [localPreset, duration, onApply]);

  const handleClear = useCallback(() => {
    setLocalPreset(null);
    onSelect?.(null);
  }, [onSelect]);

  // Compact dropdown mode
  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={localPreset || ''}
            onChange={(e) => handleSelectPreset(e.target.value as StrokeAnimationPreset)}
            disabled={disabled}
            className="flex-1 px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
          >
            <option value="">{t('shape.stroke.preset.select')}</option>
            {PRESETS.map((p) => (
              <option key={p.preset} value={p.preset}>
                {p.icon} {t(STROKE_ANIMATION_PRESET_I18N_KEYS[p.preset])}
              </option>
            ))}
          </select>
          <button
            onClick={handleApply}
            disabled={disabled || !localPreset}
            className="px-3 py-1 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded disabled:opacity-50"
          >
            {t('common.apply')}
          </button>
        </div>
        {localPreset && (
          <DurationSlider
            value={duration}
            onChange={setDuration}
            max={maxDuration}
            disabled={disabled}
          />
        )}
      </div>
    );
  }

  // Full grid mode
  return (
    <div className="space-y-3">
      {/* Category Tabs */}
      <div className="flex gap-1 border-b border-[var(--vscode-panel-border)]">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-2 py-1 text-[10px] rounded-t transition-colors ${
            activeCategory === null
              ? 'bg-[var(--vscode-tab-activeBackground)] text-[var(--vscode-foreground)]'
              : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
          }`}
        >
          All
        </button>
        {Object.keys(groupedPresets).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2 py-1 text-[10px] rounded-t transition-colors ${
              activeCategory === cat
                ? 'bg-[var(--vscode-tab-activeBackground)] text-[var(--vscode-foreground)]'
                : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
            }`}
          >
            {CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {/* Preset Grid */}
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.filter((p) => activeCategory === null || p.category === activeCategory).map(
          (p) => (
            <PresetPreview
              key={p.preset}
              preset={p.preset}
              isSelected={localPreset === p.preset}
              onClick={() => handleSelectPreset(p.preset)}
              disabled={disabled}
              label={t(STROKE_ANIMATION_PRESET_I18N_KEYS[p.preset])}
              icon={p.icon}
            />
          ),
        )}
      </div>

      {/* Duration Control */}
      {localPreset && (
        <div className="space-y-2 p-2 bg-[var(--vscode-input-background)] rounded">
          <DurationSlider
            value={duration}
            onChange={setDuration}
            max={maxDuration}
            disabled={disabled}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleApply}
          disabled={disabled || !localPreset}
          className="flex-1 py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded disabled:opacity-50"
        >
          {t('shape.strokePreset.apply')}
        </button>
        {localPreset && (
          <button
            onClick={handleClear}
            disabled={disabled}
            className="px-3 py-1.5 text-[11px] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes strokePulse {
          0%, 100% { stroke-width: 2px; }
          50% { stroke-width: 4px; }
        }
        @keyframes dashMarch {
          to { stroke-dashoffset: -16; }
        }
      `}</style>
    </div>
  );
});

export default StrokeAnimationPresetPicker;
