/**
 * MaskPanel Component
 * 蒙版面板组件 - 添加和管理蒙版
 */

import { memo, useCallback, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { MaskInstance, MaskShapeType } from '../../types/mask';
import { createMaskInstance } from '../../types/mask';
import { MaskEditor } from './MaskEditor';
import { MaskProperties } from './MaskProperties';

// =============================================================================
// Types
// =============================================================================

interface MaskPanelProps {
  masks: MaskInstance[] | undefined;
  onChange: (masks: MaskInstance[]) => void;
  disabled?: boolean;
}

// =============================================================================
// Mask Item Component
// =============================================================================

interface MaskItemProps {
  mask: MaskInstance;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onChange: (mask: MaskInstance) => void;
}

const MaskItem = memo(function MaskItem({
  mask,
  index,
  isSelected,
  onSelect,
  onToggle,
  onRemove,
  onChange,
}: MaskItemProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`border rounded overflow-hidden ${
        isSelected ? 'border-[var(--vscode-focusBorder)]' : 'border-[var(--vscode-panel-border)]'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer ${
          isSelected
            ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
            : 'bg-[var(--vscode-editor-background)] hover:bg-[var(--vscode-list-hoverBackground)]'
        }`}
        onClick={onSelect}
      >
        <input
          type="checkbox"
          checked={mask.enabled}
          onChange={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="accent-[var(--vscode-button-background)]"
        />
        <span className="flex-1 text-[11px] text-[var(--vscode-foreground)]">
          {t(`mask.shape.${mask.shape.type}`)} {index + 1}
        </span>
        <span className="text-[9px] text-[var(--vscode-descriptionForeground)]">
          {t(`mask.blendMode.${mask.blendMode}`)}
        </span>
        <button
          className="p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={t('mask.remove')}
        >
          ✕
        </button>
      </div>

      {/* Properties (when selected) */}
      {isSelected && (
        <div className="px-2 py-2 bg-[var(--vscode-sideBar-background)]">
          <MaskProperties mask={mask} onChange={onChange} />
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Add Mask Menu Component
// =============================================================================

interface AddMaskMenuProps {
  onSelect: (shapeType: MaskShapeType) => void;
  onClose: () => void;
}

const AddMaskMenu = memo(function AddMaskMenu({ onSelect, onClose }: AddMaskMenuProps) {
  const { t } = useTranslation();

  const shapeTypes: MaskShapeType[] = ['rectangle', 'ellipse', 'polygon', 'bezier'];

  return (
    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded shadow-lg">
      <div className="p-1">
        {shapeTypes.map((type) => (
          <button
            key={type}
            className="w-full px-2 py-1.5 text-left text-[11px] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
            onClick={() => {
              onSelect(type);
              onClose();
            }}
          >
            {t(`mask.shape.${type}`)}
          </button>
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const MaskPanel = memo(function MaskPanel({
  masks = [],
  onChange,
  disabled = false,
}: MaskPanelProps) {
  const { t } = useTranslation();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [selectedMaskIndex, setSelectedMaskIndex] = useState<number | null>(null);

  // Handle add mask
  const handleAddMask = useCallback(
    (shapeType: MaskShapeType) => {
      const newMask = createMaskInstance(shapeType);
      onChange([...masks, newMask]);
      setSelectedMaskIndex(masks.length);
    },
    [masks, onChange],
  );

  // Handle remove mask
  const handleRemoveMask = useCallback(
    (index: number) => {
      onChange(masks.filter((_, i) => i !== index));
      if (selectedMaskIndex === index) {
        setSelectedMaskIndex(null);
      } else if (selectedMaskIndex !== null && selectedMaskIndex > index) {
        setSelectedMaskIndex(selectedMaskIndex - 1);
      }
    },
    [masks, onChange, selectedMaskIndex],
  );

  // Handle toggle mask enabled
  const handleToggleMask = useCallback(
    (index: number) => {
      onChange(masks.map((m, i) => (i === index ? { ...m, enabled: !m.enabled } : m)));
    },
    [masks, onChange],
  );

  // Handle mask change
  const handleMaskChange = useCallback(
    (index: number, mask: MaskInstance) => {
      onChange(masks.map((m, i) => (i === index ? mask : m)));
    },
    [masks, onChange],
  );

  const selectedMask = selectedMaskIndex !== null ? masks[selectedMaskIndex] : null;

  return (
    <div className="space-y-2">
      {/* Mask Editor Canvas */}
      {selectedMask && !disabled && (
        <MaskEditor
          mask={selectedMask}
          onChange={(mask) =>
            selectedMaskIndex !== null && handleMaskChange(selectedMaskIndex, mask)
          }
        />
      )}

      {/* Add Mask Button */}
      <div className="relative">
        <button
          className="w-full px-3 py-1.5 text-[10px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setShowAddMenu(!showAddMenu)}
          disabled={disabled}
        >
          + {t('mask.add')}
        </button>
        {showAddMenu && !disabled && (
          <AddMaskMenu onSelect={handleAddMask} onClose={() => setShowAddMenu(false)} />
        )}
      </div>

      {/* Masks List */}
      {masks.length === 0 ? (
        <div className="text-[10px] text-[var(--vscode-descriptionForeground)] text-center py-4">
          {t('mask.noMasks')}
        </div>
      ) : (
        <div className="space-y-1">
          {masks.map((mask, index) => (
            <MaskItem
              key={mask.id}
              mask={mask}
              index={index}
              isSelected={selectedMaskIndex === index}
              onSelect={() => setSelectedMaskIndex(index)}
              onToggle={() => handleToggleMask(index)}
              onRemove={() => handleRemoveMask(index)}
              onChange={(mask) => handleMaskChange(index, mask)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default MaskPanel;
