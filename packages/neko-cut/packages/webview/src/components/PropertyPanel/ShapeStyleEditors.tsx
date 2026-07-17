/**
 * Shape style editors (Fill, Gradient, Stroke, Shadow).
 * Extracted from ShapePanel.tsx.
 */

import { memo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  ShapeFill,
  ShapeStroke,
  ShapeShadow,
  GradientFill,
  GradientStop,
} from '../../types/shape';
import { NumberInput, ColorInput, SelectInput, CheckboxInput } from './inputs';

// =============================================================================
// Gradient Editor
// =============================================================================

interface GradientEditorProps {
  gradient: GradientFill;
  onChange: (updates: Partial<GradientFill>) => void;
  disabled?: boolean;
}

const GradientEditor = memo(function GradientEditor({
  gradient,
  onChange,
  disabled,
}: GradientEditorProps) {
  const { t } = useTranslation();

  const gradientTypeOptions = [
    { value: 'linear', label: t('shape.gradient.linear') },
    { value: 'radial', label: t('shape.gradient.radial') },
  ];

  const handleStopChange = (index: number, updates: Partial<GradientStop>) => {
    const newStops = [...gradient.stops];
    newStops[index] = { ...newStops[index], ...updates };
    onChange({ stops: newStops });
  };

  const addStop = () => {
    const newStops = [...gradient.stops, { offset: 1, color: '#ffffff' }];
    onChange({ stops: newStops });
  };

  const removeStop = (index: number) => {
    if (gradient.stops.length <= 2) return;
    const newStops = gradient.stops.filter((_, i) => i !== index);
    onChange({ stops: newStops });
  };

  return (
    <div className="space-y-2 pl-2 border-l-2 border-[var(--vscode-panel-border)]">
      <SelectInput
        label={t('shape.gradient.type')}
        value={gradient.type}
        onChange={(v) => onChange({ type: v as GradientFill['type'] })}
        options={gradientTypeOptions}
        disabled={disabled}
      />

      {gradient.type === 'linear' && (
        <NumberInput
          label={t('shape.gradient.angle')}
          value={gradient.angle || 0}
          onChange={(v) => onChange({ angle: v })}
          min={0}
          max={360}
          step={1}
          unit="°"
          disabled={disabled}
        />
      )}

      {gradient.type === 'radial' && (
        <>
          <NumberInput
            label={t('shape.gradient.centerX')}
            value={(gradient.centerX ?? 0.5) * 100}
            onChange={(v) => onChange({ centerX: v / 100 })}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.gradient.centerY')}
            value={(gradient.centerY ?? 0.5) * 100}
            onChange={(v) => onChange({ centerY: v / 100 })}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.gradient.radius')}
            value={(gradient.radius ?? 0.5) * 100}
            onChange={(v) => onChange({ radius: v / 100 })}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
          />
        </>
      )}

      <div className="space-y-1">
        <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
          {t('shape.gradient.stops')}
        </div>
        {gradient.stops.map((stop, index) => (
          <div key={index} className="flex items-center gap-1">
            <input
              type="color"
              value={stop.color}
              onChange={(e) => handleStopChange(index, { color: e.target.value })}
              disabled={disabled}
              className="w-6 h-6 p-0 border border-[var(--vscode-input-border)] rounded cursor-pointer"
            />
            <input
              type="number"
              value={Math.round(stop.offset * 100)}
              onChange={(e) =>
                handleStopChange(index, { offset: parseFloat(e.target.value) / 100 })
              }
              min={0}
              max={100}
              disabled={disabled}
              className="w-14 px-1 py-0.5 text-[10px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
            />
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">%</span>
            {gradient.stops.length > 2 && (
              <button
                onClick={() => removeStop(index)}
                disabled={disabled}
                className="text-[var(--vscode-errorForeground)] hover:opacity-80"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addStop}
          disabled={disabled}
          className="text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline"
        >
          + {t('shape.gradient.addStop')}
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// Fill Editor
// =============================================================================

interface FillEditorProps {
  fill: ShapeFill;
  onChange: (updates: Partial<ShapeFill>) => void;
  disabled?: boolean;
}

export const FillEditor = memo(function FillEditor({ fill, onChange, disabled }: FillEditorProps) {
  const { t } = useTranslation();

  const fillTypeOptions = [
    { value: 'none', label: t('shape.fill.none') },
    { value: 'solid', label: t('shape.fill.solid') },
    { value: 'gradient', label: t('shape.fill.gradient') },
  ];

  return (
    <>
      <SelectInput
        label={t('shape.fill.type')}
        value={fill.type}
        onChange={(v) => onChange({ type: v as ShapeFill['type'] })}
        options={fillTypeOptions}
        disabled={disabled}
      />

      {fill.type === 'solid' && (
        <>
          <ColorInput
            label={t('shape.fill.color')}
            value={fill.color || '#ffffff'}
            onChange={(v) => onChange({ color: v })}
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.fill.opacity')}
            value={fill.opacity}
            onChange={(v) => onChange({ opacity: v })}
            min={0}
            max={1}
            step={0.01}
            disabled={disabled}
          />
        </>
      )}

      {fill.type === 'gradient' && fill.gradient && (
        <GradientEditor
          gradient={fill.gradient}
          onChange={(g) => onChange({ gradient: { ...fill.gradient!, ...g } })}
          disabled={disabled}
        />
      )}
    </>
  );
});

// =============================================================================
// Stroke Editor
// =============================================================================

interface StrokeEditorProps {
  stroke: ShapeStroke;
  onChange: (updates: Partial<ShapeStroke>) => void;
  disabled?: boolean;
}

export const StrokeEditor = memo(function StrokeEditor({
  stroke,
  onChange,
  disabled,
}: StrokeEditorProps) {
  const { t } = useTranslation();

  const lineCapOptions = [
    { value: 'butt', label: t('shape.stroke.cap.butt') },
    { value: 'round', label: t('shape.stroke.cap.round') },
    { value: 'square', label: t('shape.stroke.cap.square') },
  ];

  const lineJoinOptions = [
    { value: 'miter', label: t('shape.stroke.join.miter') },
    { value: 'round', label: t('shape.stroke.join.round') },
    { value: 'bevel', label: t('shape.stroke.join.bevel') },
  ];

  return (
    <>
      <CheckboxInput
        label={t('shape.stroke.enabled')}
        checked={stroke.enabled}
        onChange={(v) => onChange({ enabled: v })}
        disabled={disabled}
      />

      {stroke.enabled && (
        <>
          <ColorInput
            label={t('shape.stroke.color')}
            value={stroke.color}
            onChange={(v) => onChange({ color: v })}
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.stroke.width')}
            value={stroke.width}
            onChange={(v) => onChange({ width: v })}
            min={0.1}
            max={50}
            step={0.5}
            unit="px"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.stroke.opacity')}
            value={stroke.opacity}
            onChange={(v) => onChange({ opacity: v })}
            min={0}
            max={1}
            step={0.01}
            disabled={disabled}
          />
          <SelectInput
            label={t('shape.stroke.lineCap')}
            value={stroke.lineCap}
            onChange={(v) => onChange({ lineCap: v as ShapeStroke['lineCap'] })}
            options={lineCapOptions}
            disabled={disabled}
          />
          <SelectInput
            label={t('shape.stroke.lineJoin')}
            value={stroke.lineJoin}
            onChange={(v) => onChange({ lineJoin: v as ShapeStroke['lineJoin'] })}
            options={lineJoinOptions}
            disabled={disabled}
          />
        </>
      )}
    </>
  );
});

// =============================================================================
// Shadow Editor
// =============================================================================

interface ShadowEditorProps {
  shadow: ShapeShadow;
  onChange: (updates: Partial<ShapeShadow>) => void;
  disabled?: boolean;
}

export const ShadowEditor = memo(function ShadowEditor({
  shadow,
  onChange,
  disabled,
}: ShadowEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <CheckboxInput
        label={t('shape.shadow.enabled')}
        checked={shadow.enabled}
        onChange={(v) => onChange({ enabled: v })}
        disabled={disabled}
      />

      {shadow.enabled && (
        <>
          <ColorInput
            label={t('shape.shadow.color')}
            value={shadow.color}
            onChange={(v) => onChange({ color: v })}
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.shadow.blur')}
            value={shadow.blur}
            onChange={(v) => onChange({ blur: v })}
            min={0}
            max={100}
            step={1}
            unit="px"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.shadow.offsetX')}
            value={shadow.offsetX}
            onChange={(v) => onChange({ offsetX: v })}
            min={-100}
            max={100}
            step={1}
            unit="px"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.shadow.offsetY')}
            value={shadow.offsetY}
            onChange={(v) => onChange({ offsetY: v })}
            min={-100}
            max={100}
            step={1}
            unit="px"
            disabled={disabled}
          />
        </>
      )}
    </>
  );
});
