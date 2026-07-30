/**
 * ModelSelector Component
 */

import { useMemo, useRef, useState } from 'react';
import { useComposerControlMenu } from './composer-menu-runtime';
import type { ChatModelOption } from '@neko/shared';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { ChevronDownIcon } from './DropdownMenu';
import { useTranslation } from '@/i18n/I18nContext';
import {
  buildModelTags,
  groupModelOptionsByProvider,
  shortenModelLabel,
} from './model-option-presentation';
import { ModelTagList } from './ModelTagList';

interface ModelSelectorProps {
  selectedModel: string;
  models: ChatModelOption[];
  onSelect: (modelId: string) => void;
  color?: string;
  disabled?: boolean;
}

export function ModelSelector({
  selectedModel,
  models,
  onSelect,
  color,
  disabled = false,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useComposerControlMenu('agent-model');
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'up',
    estimatedWidth: 360,
  });

  const selectableModels = useMemo(
    () => models.filter((model) => model.providerId && model.modelId),
    [models],
  );
  const groupedModels = useMemo(
    () => groupModelOptionsByProvider(selectableModels, t),
    [selectableModels, t],
  );
  const selectedModelObj = selectableModels.find((model) => model.id === selectedModel);
  const hasSelectableModels = selectableModels.length > 0;
  const canOpen = hasSelectableModels && !disabled;

  const handleTrigger = () => {
    if (!canOpen) return;
    if (!isOpen) setPlacement(getPlacement());
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleTrigger}
        aria-label={t('chat.selectModel')}
        aria-haspopup={canOpen ? 'menu' : undefined}
        aria-expanded={canOpen ? isOpen : false}
        disabled={disabled}
        className={`agent-control-chip ${hasSelectableModels ? '' : 'agent-control-chip-muted'}`}
        style={color && hasSelectableModels ? { color } : undefined}
        title={selectedModelObj?.label ?? t('chat.noModelsAvailable')}
      >
        <span className="agent-control-chip-text">
          {selectedModelObj ? shortenModelLabel(selectedModelObj) : t('chat.noModelsAvailable')}
        </span>
        {canOpen && <ChevronDownIcon className="w-3 h-3" />}
      </button>

      {isOpen && canOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {groupedModels.map((group) => (
            <div key={group.key} className="agent-model-provider-group">
              <div className="agent-model-provider-header">
                <span className="agent-model-provider-name">{group.label}</span>
                <ModelTagList tags={group.tags} className="agent-model-provider-tags" />
              </div>
              {group.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onSelect(model.id);
                    setIsOpen(false);
                  }}
                  className={`agent-dropdown-item agent-dropdown-item-inline-detail ${
                    selectedModel === model.id ? 'agent-dropdown-item-selected' : ''
                  } agent-model-option-row`}
                  role="menuitem"
                >
                  <span className="agent-model-option-name">{shortenModelLabel(model)}</span>
                  <ModelTagList
                    tags={buildModelTags(model, t)}
                    className="agent-model-option-tags"
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
