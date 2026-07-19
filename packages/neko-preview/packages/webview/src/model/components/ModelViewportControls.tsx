import { useState } from 'react';
import { Popover, SegmentedControl, ToolbarButton, ToolbarSeparator } from '@neko/ui';
import {
  AxesIcon,
  CameraIcon,
  CubeIcon,
  FrameSelectionIcon,
  GridIcon,
  InspectIcon,
  LightIcon,
  MannequinIcon,
  MoveIcon,
  PanoramaIcon,
  PointerIcon,
  RotateIcon,
  ScaleIcon,
} from '@neko/ui/icons';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { ThreeReferencePresetOption } from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';
import {
  MODEL_CAMERA_PLACEMENTS,
  MODEL_LIGHT_PLACEMENTS,
  type ModelCameraPlacementId,
  type ModelLightPlacementId,
} from '../modelCreationPresets';

export type ModelViewportMode = 'navigate' | 'inspect';
export type ModelTransformMode = 'translate' | 'rotate' | 'scale';

export interface ModelViewportControlsProps {
  readonly axesVisible: boolean;
  readonly disabled: boolean;
  readonly gridVisible: boolean;
  readonly hasTransformSelection: boolean;
  readonly viewportMode: ModelViewportMode;
  readonly transformMode: ModelTransformMode;
  readonly activePresetId?: string;
  readonly availablePresets: readonly ThreeReferencePresetOption[];
  readonly canAddLight: boolean;
  readonly onViewportModeChange: (mode: ModelViewportMode) => void;
  readonly onTransformModeChange: (mode: ModelTransformMode) => void;
  readonly onFrameModel: () => void;
  readonly onAxesVisibleChange: (visible: boolean) => void;
  readonly onGridVisibleChange: (visible: boolean) => void;
  readonly onPresetRequest: (presetId: string) => void;
  readonly onAddCamera: (placementId: ModelCameraPlacementId) => void;
  readonly onAddLight: (placementId: ModelLightPlacementId) => void;
  readonly onPanoramaRequest: () => void;
}

export function ModelViewportControls({
  axesVisible,
  activePresetId,
  availablePresets,
  canAddLight,
  disabled,
  gridVisible,
  onAxesVisibleChange,
  onFrameModel,
  onGridVisibleChange,
  onAddCamera,
  onAddLight,
  onPanoramaRequest,
  onPresetRequest,
  onTransformModeChange,
  onViewportModeChange,
  transformMode,
  hasTransformSelection,
  viewportMode,
}: ModelViewportControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const transformDisabled = disabled || !hasTransformSelection || viewportMode !== 'inspect';

  return (
    <>
      <div className="model-preview__view-controls" data-testid="model-preview-view-controls">
        <SegmentedControl
          label={t('preview.model.viewMode')}
          value={viewportMode}
          options={[
            { value: 'navigate', label: t('preview.model.view.navigate') },
            { value: 'inspect', label: t('preview.model.view.inspect') },
          ]}
          onValueChange={(value) => onViewportModeChange(asViewportMode(value))}
        />
      </div>
      <div
        className="model-preview__viewport-toolbar neko-floating-toolbar"
        data-active-indicator="button"
        data-density="compact"
        data-testid="model-preview-viewport-toolbar"
        data-orientation="horizontal"
        data-shape="pill"
        aria-label={t('preview.model.viewportTools')}
        aria-orientation="horizontal"
        role="toolbar"
        {...getKeyboardBoundaryMetadata({
          scope: 'popover',
          ownerId: 'model-preview-viewport-toolbar',
          priority: 20,
          ownedKeys: ['Enter', 'Escape', 'Space', 'Tab', 'ArrowLeft', 'ArrowRight'],
        })}
      >
        <div
          aria-label={t('preview.model.viewMode')}
          className="model-preview__toolbar-mode-group neko-toolbar-mode-group"
          data-active-mode={viewportMode}
          data-model-preview-toolbar-group="navigation"
          role="group"
        >
          <ToolbarButton
            active={viewportMode === 'navigate'}
            disabled={disabled}
            icon={<PointerIcon size={18} />}
            title={t('preview.model.view.navigate')}
            onClick={() => onViewportModeChange('navigate')}
          />
          <ToolbarButton
            active={viewportMode === 'inspect'}
            disabled={disabled}
            icon={<InspectIcon size={18} />}
            title={t('preview.model.view.inspect')}
            onClick={() => onViewportModeChange('inspect')}
          />
        </div>
        <ToolbarSeparator orientation="vertical" />
        <div
          aria-label={t('preview.model.addReferenceContent')}
          className="model-preview__creation-group"
          data-model-preview-toolbar-group="creation"
          role="group"
        >
          <PresetMenu
            activePresetId={activePresetId}
            disabled={disabled}
            icon={<MannequinIcon size={18} />}
            options={availablePresets.filter((preset) => preset.presetKind === 'mannequin')}
            title={t('preview.model.addMannequin')}
            onSelect={onPresetRequest}
          />
          <PresetMenu
            activePresetId={activePresetId}
            disabled={disabled}
            icon={<CubeIcon size={18} />}
            options={availablePresets.filter(
              (preset) => preset.presetKind === 'prop' || preset.presetKind === 'environment',
            )}
            title={t('preview.model.addObject')}
            onSelect={onPresetRequest}
          />
          <ToolbarButton
            disabled={disabled}
            icon={<PanoramaIcon size={18} />}
            title={t('preview.model.addPanorama')}
            onClick={onPanoramaRequest}
          />
          <CreationMenu
            disabled={disabled}
            icon={<CameraIcon size={18} />}
            options={MODEL_CAMERA_PLACEMENTS}
            title={t('preview.model.addCamera')}
            onSelect={onAddCamera}
          />
          <CreationMenu
            disabled={disabled || !canAddLight}
            icon={<LightIcon size={18} />}
            options={MODEL_LIGHT_PLACEMENTS}
            title={canAddLight ? t('preview.model.addLight') : t('preview.model.lightLimitReached')}
            onSelect={onAddLight}
          />
        </div>
        <ToolbarSeparator orientation="vertical" />
        {(['translate', 'rotate', 'scale'] as const).map((mode) => (
          <ToolbarButton
            key={mode}
            active={viewportMode === 'inspect' && transformMode === mode}
            disabled={transformDisabled}
            icon={transformModeIcon(mode)}
            title={t(`preview.model.transform.${mode}`)}
            onClick={() => onTransformModeChange(mode)}
          />
        ))}
        <ToolbarSeparator orientation="vertical" />
        <ToolbarButton
          active={gridVisible}
          disabled={disabled}
          icon={<GridIcon size={18} />}
          title={
            gridVisible ? t('preview.model.hideGroundGrid') : t('preview.model.showGroundGrid')
          }
          onClick={() => onGridVisibleChange(!gridVisible)}
        />
        <ToolbarButton
          active={axesVisible}
          disabled={disabled}
          icon={<AxesIcon size={18} />}
          title={axesVisible ? t('preview.model.hideAxes') : t('preview.model.showAxes')}
          onClick={() => onAxesVisibleChange(!axesVisible)}
        />
        <ToolbarSeparator orientation="vertical" />
        <ToolbarButton
          disabled={disabled}
          icon={<FrameSelectionIcon size={18} />}
          title={t('preview.model.frameModel')}
          onClick={onFrameModel}
        />
      </div>
    </>
  );
}

function PresetMenu({
  activePresetId,
  disabled,
  icon,
  onSelect,
  options,
  title,
}: {
  readonly activePresetId?: string;
  readonly disabled: boolean;
  readonly icon: React.JSX.Element;
  readonly options: readonly ThreeReferencePresetOption[];
  readonly title: string;
  readonly onSelect: (presetId: string) => void;
}): React.JSX.Element {
  return (
    <CreationMenu
      activeId={activePresetId}
      disabled={disabled || options.length === 0}
      icon={icon}
      options={options.map((option) => ({
        id: option.presetId,
        labelKey: option.labelKey,
        presetId: option.presetId,
      }))}
      title={title}
      onSelect={onSelect}
    />
  );
}

interface CreationMenuOption<TId extends string> {
  readonly id: TId;
  readonly labelKey: string;
  readonly presetId?: string;
}

function CreationMenu<TId extends string>({
  activeId,
  disabled,
  icon,
  onSelect,
  options,
  title,
}: {
  readonly activeId?: string;
  readonly disabled: boolean;
  readonly icon: React.JSX.Element;
  readonly options: readonly CreationMenuOption<TId>[];
  readonly title: string;
  readonly onSelect: (id: TId) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover
      align="start"
      open={open}
      side="top"
      onOpenChange={setOpen}
      trigger={
        <ToolbarButton
          active={options.some((option) => option.id === activeId)}
          disabled={disabled}
          icon={icon}
          title={title}
        />
      }
    >
      <div
        className="model-preview__creation-menu"
        aria-label={title}
        role="menu"
        onKeyDown={moveCreationMenuFocus}
      >
        {options.map((option) => (
          <button
            key={option.id}
            className="model-preview__creation-menu-item"
            data-creation-option-id={option.id}
            data-preset-id={option.presetId}
            disabled={option.id === activeId}
            role="menuitem"
            type="button"
            onClick={() => {
              onSelect(option.id);
              setOpen(false);
            }}
          >
            <span>{t(option.labelKey)}</span>
            {option.id === activeId ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function moveCreationMenuFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  ];
  if (items.length === 0) return;
  event.preventDefault();
  const currentIndex = items.findIndex((item) => item === document.activeElement);
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowUp'
          ? currentIndex <= 0
            ? items.length - 1
            : currentIndex - 1
          : currentIndex < 0 || currentIndex === items.length - 1
            ? 0
            : currentIndex + 1;
  items[nextIndex]?.focus();
}

function asViewportMode(value: string): ModelViewportMode {
  if (value === 'navigate' || value === 'inspect') return value;
  throw new Error(`Unknown Model Preview viewport mode: ${value}`);
}

function transformModeIcon(mode: ModelTransformMode): React.JSX.Element {
  switch (mode) {
    case 'translate':
      return <MoveIcon size={18} />;
    case 'rotate':
      return <RotateIcon size={18} />;
    case 'scale':
      return <ScaleIcon size={18} />;
  }
}
