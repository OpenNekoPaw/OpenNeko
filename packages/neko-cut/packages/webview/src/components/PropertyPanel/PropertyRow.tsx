/**
 * PropertyRow Component
 * 属性行组件 - 显示单个可编辑属性
 */

import { memo, useCallback } from 'react';
import { KeyframeDot } from '../KeyframeIndicator';
import { useTranslation } from '../../i18n/I18nContext';

// Property type definitions
export type PropertyType = 'number' | 'string' | 'boolean' | 'color' | 'select' | 'slider';

export interface PropertyOption {
  value: string;
  labelKey: string;
}

export interface PropertyDefinition {
  key: string;
  labelKey: string;
  type: PropertyType;
  animatable: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: PropertyOption[];
}

interface PropertyRowProps {
  definition: PropertyDefinition;
  value: number | string | boolean | undefined;
  hasKeyframes: boolean;
  isAtKeyframe: boolean;
  onChange: (value: number | string | boolean) => void;
  /** Called when the value is finalized (slider release, input blur) */
  onCommit?: (value: number | string | boolean) => void;
  onAddKeyframe: () => void;
  onRemoveKeyframe?: () => void;
  disabled?: boolean;
}

export const PropertyRow = memo(function PropertyRow({
  definition,
  value,
  hasKeyframes,
  isAtKeyframe,
  onChange,
  onCommit,
  onAddKeyframe,
  onRemoveKeyframe,
  disabled = false,
}: PropertyRowProps) {
  const { t } = useTranslation();

  const handleNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        onChange(val);
      }
    },
    [onChange],
  );

  const handleStringChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleBooleanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange],
  );

  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
      onCommit?.(e.target.value);
    },
    [onChange, onCommit],
  );

  // Commit on slider mouseup / input blur
  const handleNumberCommit = useCallback(
    (e: React.SyntheticEvent<HTMLInputElement>) => {
      const val = parseFloat(e.currentTarget.value);
      if (!isNaN(val)) {
        onCommit?.(val);
      }
    },
    [onCommit],
  );

  const handleStringCommit = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onCommit?.(e.target.value);
    },
    [onCommit],
  );

  const renderInput = () => {
    switch (definition.type) {
      case 'number':
        return (
          <input
            type="number"
            value={typeof value === 'number' ? value : 0}
            min={definition.min}
            max={definition.max}
            step={definition.step ?? 1}
            onChange={handleNumberChange}
            onBlur={handleNumberCommit}
            disabled={disabled}
            className="nk-prop-input"
            style={{ width: '72px', flex: 'none' }}
          />
        );

      case 'slider':
        return (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="range"
              value={typeof value === 'number' ? value : (definition.min ?? 0)}
              min={definition.min ?? 0}
              max={definition.max ?? 1}
              step={definition.step ?? 0.01}
              onChange={handleNumberChange}
              onPointerUp={handleNumberCommit}
              disabled={disabled}
              className="nk-prop-slider"
            />
            <input
              type="number"
              value={typeof value === 'number' ? value : 0}
              min={definition.min}
              max={definition.max}
              step={definition.step ?? 0.01}
              onChange={handleNumberChange}
              onBlur={handleNumberCommit}
              disabled={disabled}
              className="nk-prop-input-sm"
            />
          </div>
        );

      case 'string':
        return (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={handleStringChange}
            onBlur={handleStringCommit}
            disabled={disabled}
            className="nk-prop-input"
          />
        );

      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={typeof value === 'boolean' ? value : false}
            onChange={handleBooleanChange}
            onBlur={() => {
              if (typeof value === 'boolean') onCommit?.(value);
            }}
            disabled={disabled}
            className="w-4 h-4"
            style={{ accentColor: 'var(--nk-accent)' }}
          />
        );

      case 'color':
        return (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="color"
              value={typeof value === 'string' ? value : '#ffffff'}
              onChange={handleStringChange}
              disabled={disabled}
              className="w-7 h-6 cursor-pointer border border-[var(--nk-input-border)] rounded"
              style={{ padding: '1px 2px', background: 'transparent' }}
            />
            <input
              type="text"
              value={typeof value === 'string' ? value : '#ffffff'}
              onChange={handleStringChange}
              disabled={disabled}
              className="nk-prop-input"
              style={{ flex: 1 }}
            />
          </div>
        );

      case 'select':
        return (
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={handleSelectChange}
            disabled={disabled}
            className="nk-prop-input"
          >
            {definition.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        );

      default:
        return null;
    }
  };

  return (
    <div className="nk-prop-row">
      <label className="nk-prop-label">{t(definition.labelKey)}</label>

      <div className="flex-1 flex items-center">{renderInput()}</div>

      {definition.unit && <span className="nk-prop-unit">{definition.unit}</span>}

      {definition.animatable && (
        <div className="flex items-center gap-1">
          <KeyframeDot
            hasKeyframes={hasKeyframes}
            isAtKeyframe={isAtKeyframe}
            onClick={onAddKeyframe}
            disabled={disabled}
          />
          {isAtKeyframe && onRemoveKeyframe && (
            <button
              onClick={onRemoveKeyframe}
              disabled={disabled}
              className="w-4 h-4 flex items-center justify-center rounded icon-button"
              title={t('propertyPanel.removeKeyframe')}
              aria-label={t('propertyPanel.removeKeyframe')}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2 2 L8 8 M8 2 L2 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
