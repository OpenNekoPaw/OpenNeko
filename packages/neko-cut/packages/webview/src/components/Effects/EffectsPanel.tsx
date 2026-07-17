/**
 * EffectsPanel Component
 * 视频特效面板 - 添加和管理视频特效
 */

import { memo, useCallback, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  EffectInstance,
  EffectDefinition,
  EffectCategory,
  EffectParameterValue,
} from '../../types/effects';
import { BUILT_IN_EFFECTS, getEffectDefinition, createEffectInstance } from '../../types/effects';

// =============================================================================
// Types
// =============================================================================

interface EffectsPanelProps {
  effects: EffectInstance[] | undefined;
  onChange: (effects: EffectInstance[]) => void;
  disabled?: boolean;
}

// =============================================================================
// Effect Item Component
// =============================================================================

interface EffectItemProps {
  effect: EffectInstance;
  definition: EffectDefinition | undefined;
  onToggle: () => void;
  onRemove: () => void;
  onParameterChange: (key: string, value: EffectParameterValue) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

const EffectItem = memo(function EffectItem({
  effect,
  definition,
  onToggle,
  onRemove,
  onParameterChange,
  expanded,
  onToggleExpand,
}: EffectItemProps) {
  const { t } = useTranslation();

  if (!definition) return null;

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-[var(--vscode-editor-background)] cursor-pointer"
        onClick={onToggleExpand}
      >
        <span
          className={`transform transition-transform text-[10px] ${expanded ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <input
          type="checkbox"
          checked={effect.enabled}
          onChange={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="accent-[var(--vscode-button-background)]"
        />
        <span className="flex-1 text-[11px] text-[var(--vscode-foreground)]">
          {t(definition.nameKey)}
        </span>
        <button
          className="p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={t('effects.removeEffect')}
        >
          ✕
        </button>
      </div>

      {/* Parameters */}
      {expanded && (
        <div className="px-2 py-2 space-y-2 bg-[var(--vscode-sideBar-background)]">
          {definition.parameters.map((param) => (
            <EffectParameter
              key={param.key}
              param={param}
              value={effect.parameters[param.key]}
              onChange={(value) => onParameterChange(param.key, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Effect Parameter Component
// =============================================================================

interface EffectParameterProps {
  param: EffectDefinition['parameters'][0];
  value: EffectParameterValue | undefined;
  onChange: (value: EffectParameterValue) => void;
}

const EffectParameter = memo(function EffectParameter({
  param,
  value,
  onChange,
}: EffectParameterProps) {
  const { t } = useTranslation();
  const currentValue = value ?? param.defaultValue;

  const handleNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
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
    },
    [onChange],
  );

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  // Render based on parameter type
  switch (param.type) {
    case 'number':
    case 'angle':
    case 'range':
      return (
        <div className="flex items-center gap-2">
          <label className="w-20 text-[10px] text-[var(--vscode-descriptionForeground)] truncate">
            {t(param.nameKey)}
          </label>
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 100}
            step={param.step ?? 1}
            value={currentValue as number}
            onChange={handleNumberChange}
            className="flex-1 h-1 accent-[var(--vscode-button-background)]"
          />
          <span className="w-12 text-[10px] text-[var(--vscode-foreground)] text-right">
            {(currentValue as number).toFixed(param.step && param.step < 1 ? 1 : 0)}
            {param.unit || ''}
          </span>
        </div>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-[10px]">
          <input
            type="checkbox"
            checked={currentValue as boolean}
            onChange={handleBooleanChange}
            className="accent-[var(--vscode-button-background)]"
          />
          <span className="text-[var(--vscode-foreground)]">{t(param.nameKey)}</span>
        </label>
      );

    case 'select':
      return (
        <div className="flex items-center gap-2">
          <label className="w-20 text-[10px] text-[var(--vscode-descriptionForeground)] truncate">
            {t(param.nameKey)}
          </label>
          <select
            value={currentValue as string}
            onChange={handleSelectChange}
            className="flex-1 px-1 py-0.5 text-[10px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
          >
            {param.options?.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
      );

    case 'color':
      return (
        <div className="flex items-center gap-2">
          <label className="w-20 text-[10px] text-[var(--vscode-descriptionForeground)] truncate">
            {t(param.nameKey)}
          </label>
          <input
            type="color"
            value={currentValue as string}
            onChange={handleColorChange}
            className="w-8 h-6 p-0 border-0 bg-transparent cursor-pointer"
          />
          <span className="text-[10px] text-[var(--vscode-foreground)]">
            {currentValue as string}
          </span>
        </div>
      );

    default:
      return null;
  }
});

// =============================================================================
// Add Effect Menu Component
// =============================================================================

interface AddEffectMenuProps {
  onSelect: (effectType: string) => void;
  onClose: () => void;
}

const AddEffectMenu = memo(function AddEffectMenu({ onSelect, onClose }: AddEffectMenuProps) {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<EffectCategory | 'all'>('all');

  const categories: (EffectCategory | 'all')[] = ['all', 'blur', 'sharpen', 'stylize', 'keying'];

  const filteredEffects =
    selectedCategory === 'all'
      ? BUILT_IN_EFFECTS
      : BUILT_IN_EFFECTS.filter((e) => e.category === selectedCategory);

  return (
    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded shadow-lg">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--vscode-panel-border)]">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
              selectedCategory === cat
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
            }`}
            onClick={() => setSelectedCategory(cat)}
          >
            {t(`effects.category.${cat}`)}
          </button>
        ))}
      </div>

      {/* Effects List */}
      <div className="max-h-48 overflow-y-auto p-1">
        {filteredEffects.map((effect) => (
          <button
            key={effect.type}
            className="w-full px-2 py-1.5 text-left text-[11px] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
            onClick={() => {
              onSelect(effect.type);
              onClose();
            }}
          >
            {t(effect.nameKey)}
            {effect.gpuAccelerated && (
              <span className="ml-2 text-[9px] text-[var(--vscode-descriptionForeground)]">
                GPU
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const EffectsPanel = memo(function EffectsPanel({
  effects = [],
  onChange,
  disabled = false,
}: EffectsPanelProps) {
  const { t } = useTranslation();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [expandedEffects, setExpandedEffects] = useState<Set<string>>(new Set());

  // Handle add effect
  const handleAddEffect = useCallback(
    (effectType: string) => {
      const newEffect = createEffectInstance(effectType);
      if (newEffect) {
        newEffect.order = effects.length;
        onChange([...effects, newEffect]);
        setExpandedEffects((prev) => new Set(prev).add(newEffect.id));
      }
    },
    [effects, onChange],
  );

  // Handle remove effect
  const handleRemoveEffect = useCallback(
    (effectId: string) => {
      onChange(effects.filter((e) => e.id !== effectId));
      setExpandedEffects((prev) => {
        const next = new Set(prev);
        next.delete(effectId);
        return next;
      });
    },
    [effects, onChange],
  );

  // Handle toggle effect enabled
  const handleToggleEffect = useCallback(
    (effectId: string) => {
      onChange(effects.map((e) => (e.id === effectId ? { ...e, enabled: !e.enabled } : e)));
    },
    [effects, onChange],
  );

  // Handle parameter change
  const handleParameterChange = useCallback(
    (effectId: string, key: string, value: EffectParameterValue) => {
      onChange(
        effects.map((e) =>
          e.id === effectId ? { ...e, parameters: { ...e.parameters, [key]: value } } : e,
        ),
      );
    },
    [effects, onChange],
  );

  // Handle toggle expand
  const handleToggleExpand = useCallback((effectId: string) => {
    setExpandedEffects((prev) => {
      const next = new Set(prev);
      if (next.has(effectId)) {
        next.delete(effectId);
      } else {
        next.add(effectId);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-2">
      {/* Add Effect Button */}
      <div className="relative">
        <button
          className="w-full px-3 py-1.5 text-[10px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setShowAddMenu(!showAddMenu)}
          disabled={disabled}
        >
          + {t('effects.addEffect')}
        </button>
        {showAddMenu && !disabled && (
          <AddEffectMenu onSelect={handleAddEffect} onClose={() => setShowAddMenu(false)} />
        )}
      </div>

      {/* Effects List */}
      {effects.length === 0 ? (
        <div className="text-[10px] text-[var(--vscode-descriptionForeground)] text-center py-4">
          {t('effects.noEffects')}
        </div>
      ) : (
        <div className="space-y-1">
          {effects.map((effect) => (
            <EffectItem
              key={effect.id}
              effect={effect}
              definition={getEffectDefinition(effect.type)}
              onToggle={() => handleToggleEffect(effect.id)}
              onRemove={() => handleRemoveEffect(effect.id)}
              onParameterChange={(key, value) => handleParameterChange(effect.id, key, value)}
              expanded={expandedEffects.has(effect.id)}
              onToggleExpand={() => handleToggleExpand(effect.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default EffectsPanel;
