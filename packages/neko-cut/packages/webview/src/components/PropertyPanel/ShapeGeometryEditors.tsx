/**
 * Shape geometry editors for each shape type.
 * Extracted from ShapePanel.tsx.
 */

import { memo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
} from '../../types/shape';
import { NumberInput } from './inputs';

// =============================================================================
// Rectangle Editor
// =============================================================================

interface RectangleEditorProps {
  shape: RectangleShape;
  onChange: (updates: Partial<RectangleShape>) => void;
  disabled?: boolean;
}

export const RectangleEditor = memo(function RectangleEditor({
  shape,
  onChange,
  disabled,
}: RectangleEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.centerX')}
        value={shape.centerX}
        onChange={(v) => onChange({ centerX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.centerY')}
        value={shape.centerY}
        onChange={(v) => onChange({ centerY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.width')}
        value={shape.width}
        onChange={(v) => onChange({ width: v })}
        min={0.1}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.height')}
        value={shape.height}
        onChange={(v) => onChange({ height: v })}
        min={0.1}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.rotation')}
        value={shape.rotation}
        onChange={(v) => onChange({ rotation: v })}
        min={-180}
        max={180}
        step={1}
        unit="°"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.cornerRadius')}
        value={shape.cornerRadius}
        onChange={(v) => onChange({ cornerRadius: v })}
        min={0}
        max={50}
        step={1}
        unit="%"
        disabled={disabled}
      />
    </>
  );
});

// =============================================================================
// Ellipse Editor
// =============================================================================

interface EllipseEditorProps {
  shape: EllipseShape;
  onChange: (updates: Partial<EllipseShape>) => void;
  disabled?: boolean;
}

export const EllipseEditor = memo(function EllipseEditor({
  shape,
  onChange,
  disabled,
}: EllipseEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.centerX')}
        value={shape.centerX}
        onChange={(v) => onChange({ centerX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.centerY')}
        value={shape.centerY}
        onChange={(v) => onChange({ centerY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.radiusX')}
        value={shape.radiusX}
        onChange={(v) => onChange({ radiusX: v })}
        min={0.1}
        max={50}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.radiusY')}
        value={shape.radiusY}
        onChange={(v) => onChange({ radiusY: v })}
        min={0.1}
        max={50}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.rotation')}
        value={shape.rotation}
        onChange={(v) => onChange({ rotation: v })}
        min={-180}
        max={180}
        step={1}
        unit="°"
        disabled={disabled}
      />
    </>
  );
});

// =============================================================================
// Polygon Editor
// =============================================================================

interface PolygonEditorProps {
  shape: PolygonShape;
  onChange: (updates: Partial<PolygonShape>) => void;
  disabled?: boolean;
}

export const PolygonEditor = memo(function PolygonEditor({
  shape,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChange: _onChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  disabled: _disabled,
}: PolygonEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
      <p>
        {t('shape.properties.points')}: {shape.points.length}
      </p>
      <p className="mt-1 text-[10px]">(Polygon vertices can be edited directly on canvas)</p>
    </div>
  );
});

// =============================================================================
// Star Editor
// =============================================================================

interface StarEditorProps {
  shape: StarShape;
  onChange: (updates: Partial<StarShape>) => void;
  disabled?: boolean;
}

export const StarEditor = memo(function StarEditor({ shape, onChange, disabled }: StarEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.centerX')}
        value={shape.centerX}
        onChange={(v) => onChange({ centerX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.centerY')}
        value={shape.centerY}
        onChange={(v) => onChange({ centerY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.points')}
        value={shape.points}
        onChange={(v) => onChange({ points: Math.max(3, Math.floor(v)) })}
        min={3}
        max={20}
        step={1}
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.outerRadius')}
        value={shape.outerRadius}
        onChange={(v) => onChange({ outerRadius: v })}
        min={1}
        max={50}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.innerRadiusRatio')}
        value={shape.innerRadiusRatio}
        onChange={(v) => onChange({ innerRadiusRatio: v })}
        min={0.1}
        max={0.9}
        step={0.01}
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.rotation')}
        value={shape.rotation}
        onChange={(v) => onChange({ rotation: v })}
        min={-180}
        max={180}
        step={1}
        unit="°"
        disabled={disabled}
      />
    </>
  );
});

// =============================================================================
// Line Editor
// =============================================================================

interface LineEditorProps {
  shape: LineShape;
  onChange: (updates: Partial<LineShape>) => void;
  disabled?: boolean;
}

export const LineEditor = memo(function LineEditor({ shape, onChange, disabled }: LineEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.startX')}
        value={shape.startX}
        onChange={(v) => onChange({ startX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.startY')}
        value={shape.startY}
        onChange={(v) => onChange({ startY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.endX')}
        value={shape.endX}
        onChange={(v) => onChange({ endX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.endY')}
        value={shape.endY}
        onChange={(v) => onChange({ endY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
    </>
  );
});
