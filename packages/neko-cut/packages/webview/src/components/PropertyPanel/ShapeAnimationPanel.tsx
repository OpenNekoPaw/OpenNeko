/**
 * ShapeAnimationPanel - 形状动画控制面板
 *
 * 用于管理形状图层的动画属性：
 * - 变换动画（位置、缩放、旋转、透明度）
 * - 描边动画（宽度、描边绘制、虚线）
 * - 填充动画（透明度）
 * - 动画预设
 */

import { memo, useCallback, useState, useMemo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { AnimatedShapeInstance } from '../../types/shape';
import type {
  ShapeAnimationState,
  StrokeAnimationPreset,
  ShapeAnimatablePropertyName,
} from '../../types/shapeAnimation';
import type { AnimatableProperty, AnimationKeyframe } from '../../types/animation';
import {
  createDefaultShapeAnimationState,
  applyStrokeAnimationPreset,
  hasKeyframes,
  getAllKeyframeTimes,
  STROKE_ANIMATION_PRESET_I18N_KEYS,
  SHAPE_ANIMATABLE_PROPERTY_I18N_KEYS,
} from '../../types/shapeAnimation';
// Note: EASING_TYPE_I18N_KEYS reserved for future easing selector UI

// =============================================================================
// Types
// =============================================================================

interface ShapeAnimationPanelProps {
  /** Selected shape instance */
  shape: AnimatedShapeInstance | null;
  /** Current playback time (relative to element start) */
  currentTime: number;
  /** Element duration */
  duration: number;
  /** Update shape animation handler */
  onUpdateAnimation: (shapeId: string, animation: ShapeAnimationState) => void;
  /** Add keyframe handler */
  onAddKeyframe: (shapeId: string, propertyPath: string, time: number, value: number) => void;
  /** Remove keyframe handler */
  onRemoveKeyframe: (shapeId: string, propertyPath: string, keyframeId: string) => void;
  /** Update keyframe handler */
  onUpdateKeyframe: (
    shapeId: string,
    propertyPath: string,
    keyframeId: string,
    updates: Partial<AnimationKeyframe>,
  ) => void;
  /** Seek to time handler */
  onSeekToTime: (time: number) => void;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// Helper Components
// =============================================================================

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  badge?: string | number;
}

const CollapsibleSection = memo(function CollapsibleSection({
  title,
  children,
  defaultExpanded = true,
  badge,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="nk-prop-group">
      <button className="nk-prop-group-header" onClick={() => setExpanded(!expanded)}>
        <span className={`nk-prop-group-chevron ${expanded ? 'expanded' : ''}`}>▶</span>
        <span className="nk-prop-group-title flex-1 text-left">{title}</span>
        {badge !== undefined && <span className="nk-badge ml-auto text-[10px]">{badge}</span>}
      </button>
      {expanded && <div className="nk-prop-group-body">{children}</div>}
    </div>
  );
});

// =============================================================================
// Property Row Component
// =============================================================================

interface PropertyRowProps {
  label: string;
  property: AnimatableProperty;
  propertyPath: string;
  currentTime: number;
  duration: number;
  onAddKeyframe: (time: number, value: number) => void;
  onRemoveKeyframe: (keyframeId: string) => void;
  onUpdateKeyframe: (keyframeId: string, updates: Partial<AnimationKeyframe>) => void;
  onSeekToTime: (time: number) => void;
  disabled: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const PropertyRow = memo(function PropertyRow({
  label,
  property,
  currentTime,
  // duration reserved for future timeline visualization
  // duration,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onSeekToTime,
  disabled,
  min,
  max,
  step = 0.1,
  unit,
}: PropertyRowProps) {
  const { t } = useTranslation();
  const [showKeyframes, setShowKeyframes] = useState(false);

  const hasKf = hasKeyframes(property);
  const currentKeyframe = property.keyframes.find((kf) => Math.abs(kf.time - currentTime) < 0.01);

  // Get current value (interpolated or base)
  const getCurrentValue = useCallback(() => {
    if (property.keyframes.length === 0) return property.baseValue;

    const sorted = [...property.keyframes].sort((a, b) => a.time - b.time);
    if (currentTime <= sorted[0].time) return sorted[0].value;
    if (currentTime >= sorted[sorted.length - 1].time) {
      return sorted[sorted.length - 1].value;
    }

    // Simple linear interpolation for display
    for (let i = 0; i < sorted.length - 1; i++) {
      if (currentTime >= sorted[i].time && currentTime <= sorted[i + 1].time) {
        const progress = (currentTime - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
        return sorted[i].value + (sorted[i + 1].value - sorted[i].value) * progress;
      }
    }
    return property.baseValue;
  }, [property, currentTime]);

  const currentValue = getCurrentValue();

  const handleAddKeyframe = useCallback(() => {
    onAddKeyframe(currentTime, currentValue);
  }, [onAddKeyframe, currentTime, currentValue]);

  const handleValueChange = useCallback(
    (newValue: number) => {
      if (currentKeyframe) {
        onUpdateKeyframe(currentKeyframe.id, { value: newValue });
      } else if (hasKf) {
        // Add new keyframe at current time
        onAddKeyframe(currentTime, newValue);
      }
    },
    [currentKeyframe, hasKf, onAddKeyframe, onUpdateKeyframe, currentTime],
  );

  return (
    <div className="space-y-1">
      <div className="nk-prop-row">
        {/* Property Label */}
        <label
          className="truncate text-[11px] text-[var(--nk-fg-secondary)]"
          style={{ width: '80px', flexShrink: 0 }}
        >
          {label}
        </label>

        {/* Value Input */}
        <div className="flex-1 flex items-center gap-1">
          <input
            type="number"
            value={currentValue.toFixed(2)}
            onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="nk-prop-input flex-1 disabled:opacity-50"
          />
          {unit && <span className="nk-prop-unit">{unit}</span>}
        </div>

        {/* Keyframe Toggle */}
        <button
          onClick={currentKeyframe ? () => onRemoveKeyframe(currentKeyframe.id) : handleAddKeyframe}
          disabled={disabled}
          className={`p-1 text-[11px] rounded transition-colors ${
            currentKeyframe
              ? 'bg-[var(--nk-bg-active)] text-[var(--nk-accent)]'
              : hasKf
                ? 'text-[var(--nk-accent)]'
                : 'text-[var(--nk-fg-secondary)] hover:text-[var(--nk-fg)]'
          }`}
          title={currentKeyframe ? t('animation.removeKeyframe') : t('animation.addKeyframe')}
        >
          ◆
        </button>

        {/* Show/Hide Keyframes */}
        {hasKf && (
          <button
            onClick={() => setShowKeyframes(!showKeyframes)}
            disabled={disabled}
            className="p-1 text-[10px] text-[var(--nk-fg-secondary)] hover:text-[var(--nk-fg)]"
            title={t('animation.showKeyframes')}
          >
            {showKeyframes ? '▼' : '▶'} ({property.keyframes.length})
          </button>
        )}
      </div>

      {/* Keyframe List */}
      {showKeyframes && hasKf && (
        <div className="ml-20 space-y-1">
          {property.keyframes
            .sort((a, b) => a.time - b.time)
            .map((kf) => (
              <div
                key={kf.id}
                className={`vscode-list-item flex cursor-pointer items-center gap-2 px-2 py-1 text-[10px] ${
                  Math.abs(kf.time - currentTime) < 0.01 ? 'active' : ''
                }`}
                onClick={() => onSeekToTime(kf.time)}
              >
                <span className="font-mono">{kf.time.toFixed(2)}s</span>
                <span className="flex-1">{kf.value.toFixed(2)}</span>
                <span className="text-[var(--nk-fg-secondary)]">{kf.easing}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveKeyframe(kf.id);
                  }}
                  disabled={disabled}
                  className="icon-button h-4 w-4 rounded"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Transform Section
// =============================================================================

interface TransformSectionProps {
  animation: ShapeAnimationState;
  currentTime: number;
  duration: number;
  onAddKeyframe: (propertyPath: string, time: number, value: number) => void;
  onRemoveKeyframe: (propertyPath: string, keyframeId: string) => void;
  onUpdateKeyframe: (
    propertyPath: string,
    keyframeId: string,
    updates: Partial<AnimationKeyframe>,
  ) => void;
  onSeekToTime: (time: number) => void;
  disabled: boolean;
}

const TransformSection = memo(function TransformSection({
  animation,
  currentTime,
  duration,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onSeekToTime,
  disabled,
}: TransformSectionProps) {
  const { t } = useTranslation();

  const properties: {
    key: keyof typeof animation.transform;
    path: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  }[] = [
    { key: 'x', path: 'transform.x', min: 0, max: 100, unit: '%' },
    { key: 'y', path: 'transform.y', min: 0, max: 100, unit: '%' },
    { key: 'scaleX', path: 'transform.scaleX', min: 0, max: 10, step: 0.01 },
    { key: 'scaleY', path: 'transform.scaleY', min: 0, max: 10, step: 0.01 },
    { key: 'rotation', path: 'transform.rotation', min: -360, max: 360, unit: 'deg' },
    { key: 'opacity', path: 'transform.opacity', min: 0, max: 1, step: 0.01 },
  ];

  return (
    <div className="space-y-2">
      {properties.map(({ key, path, min, max, step, unit }) => {
        const prop = animation.transform[key];
        if (typeof prop === 'number') return null; // Skip anchor values

        const i18nKey = SHAPE_ANIMATABLE_PROPERTY_I18N_KEYS[key as ShapeAnimatablePropertyName];

        return (
          <PropertyRow
            key={key}
            label={i18nKey ? t(i18nKey) : key}
            property={prop as AnimatableProperty}
            propertyPath={path}
            currentTime={currentTime}
            duration={duration}
            onAddKeyframe={(time, value) => onAddKeyframe(path, time, value)}
            onRemoveKeyframe={(kfId) => onRemoveKeyframe(path, kfId)}
            onUpdateKeyframe={(kfId, updates) => onUpdateKeyframe(path, kfId, updates)}
            onSeekToTime={onSeekToTime}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            unit={unit}
          />
        );
      })}
    </div>
  );
});

// =============================================================================
// Stroke Animation Section
// =============================================================================

interface StrokeSectionProps {
  animation: ShapeAnimationState;
  currentTime: number;
  duration: number;
  onAddKeyframe: (propertyPath: string, time: number, value: number) => void;
  onRemoveKeyframe: (propertyPath: string, keyframeId: string) => void;
  onUpdateKeyframe: (
    propertyPath: string,
    keyframeId: string,
    updates: Partial<AnimationKeyframe>,
  ) => void;
  onApplyPreset: (preset: StrokeAnimationPreset) => void;
  onSeekToTime: (time: number) => void;
  disabled: boolean;
}

const StrokeSection = memo(function StrokeSection({
  animation,
  currentTime,
  duration,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onApplyPreset,
  onSeekToTime,
  disabled,
}: StrokeSectionProps) {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = useState<StrokeAnimationPreset | ''>('');

  const properties: {
    key: keyof typeof animation.stroke;
    path: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  }[] = [
    { key: 'width', path: 'stroke.width', min: 0, max: 50, unit: 'px' },
    { key: 'opacity', path: 'stroke.opacity', min: 0, max: 1, step: 0.01 },
    { key: 'trimStart', path: 'stroke.trimStart', min: 0, max: 1, step: 0.01 },
    { key: 'trimEnd', path: 'stroke.trimEnd', min: 0, max: 1, step: 0.01 },
    { key: 'dashOffset', path: 'stroke.dashOffset', min: -1000, max: 1000 },
  ];

  const presets: StrokeAnimationPreset[] = [
    'draw-on',
    'draw-off',
    'draw-on-reverse',
    'draw-off-reverse',
    'dash-march',
    'pulse',
    'fade-in',
    'fade-out',
  ];

  const handleApplyPreset = useCallback(() => {
    if (selectedPreset) {
      onApplyPreset(selectedPreset);
      setSelectedPreset('');
    }
  }, [selectedPreset, onApplyPreset]);

  return (
    <div className="space-y-3">
      {/* Preset Selector */}
      <div className="space-y-1">
        <label className="nk-label">{t('shape.stroke.preset.title')}</label>
        <div className="flex gap-2">
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value as StrokeAnimationPreset | '')}
            disabled={disabled}
            className="nk-select flex-1"
          >
            <option value="">{t('shape.stroke.preset.select')}</option>
            {presets.map((preset) => (
              <option key={preset} value={preset}>
                {t(STROKE_ANIMATION_PRESET_I18N_KEYS[preset])}
              </option>
            ))}
          </select>
          <button
            onClick={handleApplyPreset}
            disabled={disabled || !selectedPreset}
            className="nk-btn-primary text-[11px] disabled:opacity-50"
          >
            {t('common.apply')}
          </button>
        </div>
      </div>

      {/* Property Editors */}
      {properties.map(({ key, path, min, max, step, unit }) => {
        const i18nKey =
          SHAPE_ANIMATABLE_PROPERTY_I18N_KEYS[
            `stroke${key.charAt(0).toUpperCase() + key.slice(1)}` as ShapeAnimatablePropertyName
          ];

        return (
          <PropertyRow
            key={key}
            label={i18nKey ? t(i18nKey) : key}
            property={animation.stroke[key]}
            propertyPath={path}
            currentTime={currentTime}
            duration={duration}
            onAddKeyframe={(time, value) => onAddKeyframe(path, time, value)}
            onRemoveKeyframe={(kfId) => onRemoveKeyframe(path, kfId)}
            onUpdateKeyframe={(kfId, updates) => onUpdateKeyframe(path, kfId, updates)}
            onSeekToTime={onSeekToTime}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            unit={unit}
          />
        );
      })}
    </div>
  );
});

// =============================================================================
// Fill Animation Section
// =============================================================================

interface FillSectionProps {
  animation: ShapeAnimationState;
  currentTime: number;
  duration: number;
  onAddKeyframe: (propertyPath: string, time: number, value: number) => void;
  onRemoveKeyframe: (propertyPath: string, keyframeId: string) => void;
  onUpdateKeyframe: (
    propertyPath: string,
    keyframeId: string,
    updates: Partial<AnimationKeyframe>,
  ) => void;
  onSeekToTime: (time: number) => void;
  disabled: boolean;
}

const FillSection = memo(function FillSection({
  animation,
  currentTime,
  duration,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onSeekToTime,
  disabled,
}: FillSectionProps) {
  const { t } = useTranslation();

  return (
    <PropertyRow
      label={t('shape.animation.fillOpacity')}
      property={animation.fill.opacity}
      propertyPath="fill.opacity"
      currentTime={currentTime}
      duration={duration}
      onAddKeyframe={(time, value) => onAddKeyframe('fill.opacity', time, value)}
      onRemoveKeyframe={(kfId) => onRemoveKeyframe('fill.opacity', kfId)}
      onUpdateKeyframe={(kfId, updates) => onUpdateKeyframe('fill.opacity', kfId, updates)}
      onSeekToTime={onSeekToTime}
      disabled={disabled}
      min={0}
      max={1}
      step={0.01}
    />
  );
});

// =============================================================================
// Keyframe Timeline Mini
// =============================================================================

interface KeyframeTimelineMiniProps {
  animation: ShapeAnimationState;
  currentTime: number;
  duration: number;
  onSeekToTime: (time: number) => void;
}

const KeyframeTimelineMini = memo(function KeyframeTimelineMini({
  animation,
  currentTime,
  duration,
  onSeekToTime,
}: KeyframeTimelineMiniProps) {
  const allTimes = useMemo(() => getAllKeyframeTimes(animation), [animation]);

  if (allTimes.length === 0) return null;

  return (
    <div className="relative h-6 overflow-hidden rounded bg-[var(--nk-input-bg)]">
      {/* Timeline Bar */}
      <div className="absolute inset-0">
        {/* Keyframe Markers */}
        {allTimes.map((time, i) => (
          <button
            key={i}
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 transform rounded-sm bg-[var(--nk-accent)] transition-transform hover:scale-125"
            style={{ left: `${(time / duration) * 100}%` }}
            onClick={() => onSeekToTime(time)}
            title={`${time.toFixed(2)}s`}
          />
        ))}

        {/* Current Time Indicator */}
        <div
          className="absolute bottom-0 top-0 w-0.5 bg-[var(--nk-fg)]"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>

      {/* Time Labels */}
      <div className="absolute bottom-0 left-0 px-1 text-[9px] text-[var(--nk-fg-secondary)]">
        0s
      </div>
      <div className="absolute bottom-0 right-0 px-1 text-[9px] text-[var(--nk-fg-secondary)]">
        {duration.toFixed(1)}s
      </div>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const ShapeAnimationPanel = memo(function ShapeAnimationPanel({
  shape,
  currentTime,
  duration,
  onUpdateAnimation,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onSeekToTime,
  disabled = false,
}: ShapeAnimationPanelProps) {
  const { t } = useTranslation();

  // Get or create animation state
  const animation = useMemo(() => {
    return shape?.animation || createDefaultShapeAnimationState();
  }, [shape?.animation]);

  // Initialize animation if shape doesn't have one
  const handleInitAnimation = useCallback(() => {
    if (shape && !shape.animation) {
      onUpdateAnimation(shape.id, createDefaultShapeAnimationState());
    }
  }, [shape, onUpdateAnimation]);

  // Apply stroke preset
  const handleApplyStrokePreset = useCallback(
    (preset: StrokeAnimationPreset) => {
      if (!shape) return;

      const newStroke = applyStrokeAnimationPreset(
        animation.stroke,
        preset,
        duration,
        'ease-in-out',
      );

      onUpdateAnimation(shape.id, {
        ...animation,
        stroke: newStroke,
      });
    },
    [shape, animation, duration, onUpdateAnimation],
  );

  // Wrap handlers
  const handleAddKeyframe = useCallback(
    (propertyPath: string, time: number, value: number) => {
      if (shape) {
        onAddKeyframe(shape.id, propertyPath, time, value);
      }
    },
    [shape, onAddKeyframe],
  );

  const handleRemoveKeyframe = useCallback(
    (propertyPath: string, keyframeId: string) => {
      if (shape) {
        onRemoveKeyframe(shape.id, propertyPath, keyframeId);
      }
    },
    [shape, onRemoveKeyframe],
  );

  const handleUpdateKeyframe = useCallback(
    (propertyPath: string, keyframeId: string, updates: Partial<AnimationKeyframe>) => {
      if (shape) {
        onUpdateKeyframe(shape.id, propertyPath, keyframeId, updates);
      }
    },
    [shape, onUpdateKeyframe],
  );

  if (!shape) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[var(--nk-fg-secondary)]">
        {t('shape.animation.selectShape')}
      </div>
    );
  }

  return (
    <div className="nk-prop-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--nk-border)] px-2 py-1.5">
        <span className="text-[11px] font-medium text-[var(--nk-fg)]">
          {t('shape.animation.title')}
        </span>
        <span className="text-[10px] text-[var(--nk-fg-secondary)]">{shape.name}</span>
      </div>

      {/* Mini Timeline */}
      <div className="border-b border-[var(--nk-border)] px-2 py-1.5">
        <KeyframeTimelineMini
          animation={animation}
          currentTime={currentTime}
          duration={duration}
          onSeekToTime={onSeekToTime}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!shape.animation ? (
          <div className="p-4 text-center">
            <p className="mb-2 text-[11px] text-[var(--nk-fg-secondary)]">
              {t('shape.animation.noAnimation')}
            </p>
            <button
              onClick={handleInitAnimation}
              disabled={disabled}
              className="nk-btn-primary text-[11px] disabled:opacity-50"
            >
              {t('shape.animation.enable')}
            </button>
          </div>
        ) : (
          <>
            <CollapsibleSection
              title={t('shape.animation.transform')}
              badge={getAllKeyframeTimes(animation).length || undefined}
            >
              <TransformSection
                animation={animation}
                currentTime={currentTime}
                duration={duration}
                onAddKeyframe={handleAddKeyframe}
                onRemoveKeyframe={handleRemoveKeyframe}
                onUpdateKeyframe={handleUpdateKeyframe}
                onSeekToTime={onSeekToTime}
                disabled={disabled}
              />
            </CollapsibleSection>

            <CollapsibleSection title={t('shape.animation.stroke')}>
              <StrokeSection
                animation={animation}
                currentTime={currentTime}
                duration={duration}
                onAddKeyframe={handleAddKeyframe}
                onRemoveKeyframe={handleRemoveKeyframe}
                onUpdateKeyframe={handleUpdateKeyframe}
                onApplyPreset={handleApplyStrokePreset}
                onSeekToTime={onSeekToTime}
                disabled={disabled}
              />
            </CollapsibleSection>

            <CollapsibleSection title={t('shape.animation.fill')} defaultExpanded={false}>
              <FillSection
                animation={animation}
                currentTime={currentTime}
                duration={duration}
                onAddKeyframe={handleAddKeyframe}
                onRemoveKeyframe={handleRemoveKeyframe}
                onUpdateKeyframe={handleUpdateKeyframe}
                onSeekToTime={onSeekToTime}
                disabled={disabled}
              />
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  );
});

export default ShapeAnimationPanel;
