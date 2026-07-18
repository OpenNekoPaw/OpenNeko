import { SegmentedControl, ToolbarButton, ToolbarSeparator, toCodiconClassName } from '@neko/ui';
import { useTranslation } from '../../i18n/I18nContext';

export type ModelViewportMode = 'navigate' | 'inspect';
export type ModelTransformMode = 'translate' | 'rotate' | 'scale';

export interface ModelViewportControlsProps {
  readonly disabled: boolean;
  readonly hasSelection: boolean;
  readonly viewportMode: ModelViewportMode;
  readonly transformMode: ModelTransformMode;
  readonly onViewportModeChange: (mode: ModelViewportMode) => void;
  readonly onTransformModeChange: (mode: ModelTransformMode) => void;
  readonly onFrameModel: () => void;
}

export function ModelViewportControls({
  disabled,
  hasSelection,
  onFrameModel,
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
        className="model-preview__viewport-toolbar"
        data-testid="model-preview-viewport-toolbar"
        role="toolbar"
        aria-label={t('preview.model.viewportTools')}
      >
        <ToolbarButton
          active={viewportMode === 'navigate'}
          disabled={disabled}
          icon={<span className={toCodiconClassName('edit')} />}
          title={t('preview.model.view.navigate')}
          onClick={() => onViewportModeChange('navigate')}
        />
        <ToolbarSeparator />
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
        <ToolbarSeparator />
        <ToolbarButton
          disabled={disabled}
          icon={<span className={toCodiconClassName('refresh')} />}
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

function transformIcon(mode: ModelTransformMode): 'symbol-misc' | 'sync' | 'symbol-structure' {
  switch (mode) {
    case 'translate':
      return 'symbol-misc';
    case 'rotate':
      return 'sync';
    case 'scale':
      return 'symbol-structure';
  }
}
