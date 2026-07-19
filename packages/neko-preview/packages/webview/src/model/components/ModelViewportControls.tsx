import { SegmentedControl, ToolbarButton, ToolbarSeparator, toCodiconClassName } from '@neko/ui';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { useTranslation } from '../../i18n/I18nContext';

export type ModelViewportMode = 'navigate' | 'inspect';
export type ModelTransformMode = 'translate' | 'rotate' | 'scale';

export interface ModelViewportControlsProps {
  readonly axesVisible: boolean;
  readonly disabled: boolean;
  readonly gridVisible: boolean;
  readonly hasSelection: boolean;
  readonly viewportMode: ModelViewportMode;
  readonly transformMode: ModelTransformMode;
  readonly onViewportModeChange: (mode: ModelViewportMode) => void;
  readonly onTransformModeChange: (mode: ModelTransformMode) => void;
  readonly onFrameModel: () => void;
  readonly onAxesVisibleChange: (visible: boolean) => void;
  readonly onGridVisibleChange: (visible: boolean) => void;
}

export function ModelViewportControls({
  axesVisible,
  disabled,
  gridVisible,
  hasSelection,
  onAxesVisibleChange,
  onFrameModel,
  onGridVisibleChange,
  onTransformModeChange,
  onViewportModeChange,
  transformMode,
  viewportMode,
}: ModelViewportControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const transformDisabled = disabled || !hasSelection || viewportMode !== 'inspect';

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
            icon={<span className={toCodiconClassName('cursor')} />}
            title={t('preview.model.view.navigate')}
            onClick={() => onViewportModeChange('navigate')}
          />
          <ToolbarButton
            active={viewportMode === 'inspect'}
            disabled={disabled}
            icon={<span className={toCodiconClassName('inspect')} />}
            title={t('preview.model.view.inspect')}
            onClick={() => onViewportModeChange('inspect')}
          />
        </div>
        <ToolbarSeparator orientation="vertical" />
        {(['translate', 'rotate', 'scale'] as const).map((mode) => (
          <ToolbarButton
            key={mode}
            active={viewportMode === 'inspect' && transformMode === mode}
            disabled={transformDisabled}
            icon={<span className={toCodiconClassName(transformIcon(mode))} />}
            title={t(`preview.model.transform.${mode}`)}
            onClick={() => onTransformModeChange(mode)}
          />
        ))}
        <ToolbarSeparator orientation="vertical" />
        <ToolbarButton
          active={gridVisible}
          disabled={disabled}
          icon={<span className={toCodiconClassName('table')} />}
          title={
            gridVisible ? t('preview.model.hideGroundGrid') : t('preview.model.showGroundGrid')
          }
          onClick={() => onGridVisibleChange(!gridVisible)}
        />
        <ToolbarButton
          active={axesVisible}
          disabled={disabled}
          icon={<span className={toCodiconClassName('type-hierarchy')} />}
          title={axesVisible ? t('preview.model.hideAxes') : t('preview.model.showAxes')}
          onClick={() => onAxesVisibleChange(!axesVisible)}
        />
        <ToolbarSeparator orientation="vertical" />
        <ToolbarButton
          disabled={disabled}
          icon={<span className={toCodiconClassName('screen-normal')} />}
          title={t('preview.model.frameModel')}
          onClick={onFrameModel}
        />
      </div>
    </>
  );
}

function asViewportMode(value: string): ModelViewportMode {
  if (value === 'navigate' || value === 'inspect') return value;
  throw new Error(`Unknown Model Preview viewport mode: ${value}`);
}

function transformIcon(mode: ModelTransformMode): 'move' | 'symbol-ruler' | 'sync' {
  switch (mode) {
    case 'translate':
      return 'move';
    case 'rotate':
      return 'sync';
    case 'scale':
      return 'symbol-ruler';
  }
}
