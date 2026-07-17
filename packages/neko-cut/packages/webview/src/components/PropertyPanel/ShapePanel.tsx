/**
 * ShapePanel - Shape property editor panel
 *
 * Orchestrates shape instance editing:
 * - Geometry properties (position, size, rotation, etc.)
 * - Fill style (solid, gradient)
 * - Stroke style
 * - Shadow effects
 */

import { memo, useCallback } from 'react';
import type {
  ShapeInstance,
  Shape,
  ShapeStyle,
  ShapeFill,
  ShapeStroke,
  ShapeShadow,
  ShapeType,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
  BezierShape,
} from '../../types/shape';
import { useTranslation } from '../../i18n/I18nContext';
import { CollapsibleSection, CheckboxInput } from './inputs';
import {
  RectangleEditor,
  EllipseEditor,
  PolygonEditor,
  StarEditor,
  LineEditor,
} from './ShapeGeometryEditors';
import { FillEditor, StrokeEditor, ShadowEditor } from './ShapeStyleEditors';

// =============================================================================
// Types
// =============================================================================

interface ShapePanelProps {
  /** Selected shape instance */
  shape: ShapeInstance | null;
  /** Shape change handler */
  onShapeChange: (shapeId: string, updates: Partial<ShapeInstance>) => void;
  /** Shape geometry change handler */
  onGeometryChange: (shapeId: string, updates: Partial<Shape>) => void;
  /** Shape style change handler */
  onStyleChange: (shapeId: string, updates: Partial<ShapeStyle>) => void;
  /** Add shape handler */
  onAddShape: (shapeType: ShapeType) => void;
  /** Remove shape handler */
  onRemoveShape: (shapeId: string) => void;
  /** Duplicate shape handler */
  onDuplicateShape: (shapeId: string) => void;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// Main Component
// =============================================================================

export const ShapePanel = memo(function ShapePanel({
  shape,
  onShapeChange,
  onGeometryChange,
  onStyleChange,
  onAddShape,
  onRemoveShape,
  onDuplicateShape,
  disabled = false,
}: ShapePanelProps) {
  const { t } = useTranslation();

  // Shape type for add dropdown
  const shapeTypes: { value: ShapeType; labelKey: string }[] = [
    { value: 'rectangle', labelKey: 'shape.type.rectangle' },
    { value: 'ellipse', labelKey: 'shape.type.ellipse' },
    { value: 'polygon', labelKey: 'shape.type.polygon' },
    { value: 'star', labelKey: 'shape.type.star' },
    { value: 'line', labelKey: 'shape.type.line' },
    { value: 'bezier', labelKey: 'shape.type.bezier' },
  ];

  // Handle geometry change
  const handleGeometryChange = useCallback(
    (updates: Partial<Shape>) => {
      if (!shape) return;
      onGeometryChange(shape.id, updates);
    },
    [shape, onGeometryChange],
  );

  // Handle fill change
  const handleFillChange = useCallback(
    (updates: Partial<ShapeFill>) => {
      if (!shape) return;
      onStyleChange(shape.id, {
        fill: { ...shape.style.fill, ...updates },
      });
    },
    [shape, onStyleChange],
  );

  // Handle stroke change
  const handleStrokeChange = useCallback(
    (updates: Partial<ShapeStroke>) => {
      if (!shape) return;
      onStyleChange(shape.id, {
        stroke: { ...shape.style.stroke, ...updates },
      });
    },
    [shape, onStyleChange],
  );

  // Handle shadow change
  const handleShadowChange = useCallback(
    (updates: Partial<ShapeShadow>) => {
      if (!shape) return;
      onStyleChange(shape.id, {
        shadow: { ...shape.style.shadow, ...updates },
      });
    },
    [shape, onStyleChange],
  );

  // Render geometry editor based on shape type
  const renderGeometryEditor = () => {
    if (!shape) return null;

    switch (shape.shape.shapeType) {
      case 'rectangle':
        return (
          <RectangleEditor
            shape={shape.shape as RectangleShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'ellipse':
        return (
          <EllipseEditor
            shape={shape.shape as EllipseShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'polygon':
        return (
          <PolygonEditor
            shape={shape.shape as PolygonShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'star':
        return (
          <StarEditor
            shape={shape.shape as StarShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'line':
        return (
          <LineEditor
            shape={shape.shape as LineShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'bezier':
        return (
          <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            <p>
              {t('shape.properties.closed')}: {(shape.shape as BezierShape).closed ? 'Yes' : 'No'}
            </p>
            <p className="mt-1 text-[10px]">(Bezier points can be edited directly on canvas)</p>
          </div>
        );
      default:
        return null;
    }
  };

  // No shape selected
  if (!shape) {
    return (
      <div className="p-4 text-center">
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-4">
          {t('shape.noShapes')}
        </p>
        <div className="space-y-2">
          {shapeTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => onAddShape(type.value)}
              disabled={disabled}
              className="w-full px-3 py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 transition-colors"
            >
              + {t(type.labelKey)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="nk-prop-panel">
      {/* Shape Info Header */}
      <div className="flex items-center justify-between border-b border-[var(--nk-border)] p-2">
        <div>
          <div className="text-[11px] font-medium text-[var(--nk-fg)]">{shape.name}</div>
          <div className="text-[10px] text-[var(--nk-fg-secondary)]">
            {t(`shape.type.${shape.shape.shapeType}`)}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onDuplicateShape(shape.id)}
            disabled={disabled}
            className="icon-button"
            title={t('shape.duplicateShape')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
          <button
            onClick={() => onRemoveShape(shape.id)}
            disabled={disabled}
            className="icon-button text-[var(--nk-red)]"
            title={t('shape.removeShape')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Visibility and Lock */}
      <div className="flex gap-4 border-b border-[var(--nk-border)] p-2">
        <CheckboxInput
          label="Visible"
          checked={shape.visible}
          onChange={(v) => onShapeChange(shape.id, { visible: v })}
          disabled={disabled}
        />
        <CheckboxInput
          label="Locked"
          checked={shape.locked}
          onChange={(v) => onShapeChange(shape.id, { locked: v })}
          disabled={disabled}
        />
      </div>

      {/* Geometry */}
      <CollapsibleSection titleKey="shape.properties.centerX">
        {renderGeometryEditor()}
      </CollapsibleSection>

      {/* Fill */}
      <CollapsibleSection titleKey="shape.fill.title">
        <FillEditor fill={shape.style.fill} onChange={handleFillChange} disabled={disabled} />
      </CollapsibleSection>

      {/* Stroke */}
      <CollapsibleSection titleKey="shape.stroke.title">
        <StrokeEditor
          stroke={shape.style.stroke}
          onChange={handleStrokeChange}
          disabled={disabled}
        />
      </CollapsibleSection>

      {/* Shadow */}
      <CollapsibleSection titleKey="shape.shadow.title" defaultExpanded={false}>
        <ShadowEditor
          shadow={shape.style.shadow}
          onChange={handleShadowChange}
          disabled={disabled}
        />
      </CollapsibleSection>

      {/* Add Shape */}
      <div className="p-2">
        <div className="mb-2 text-[10px] text-[var(--nk-fg-secondary)]">{t('shape.addShape')}</div>
        <div className="flex flex-wrap gap-1">
          {shapeTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => onAddShape(type.value)}
              disabled={disabled}
              className="nk-btn-secondary px-2 py-1 text-[10px] disabled:opacity-50"
            >
              {t(type.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default ShapePanel;
