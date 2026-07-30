import { useState, type ReactElement } from 'react';
import { Popover, ToolbarButton } from '@neko/ui/primitives';
import { PlusIcon } from '@neko/shared/icons';
import { t } from '../../i18n';
import { createCanvasAddActionIcon } from '../adapters/sharedCanvasUiAdapter';
import {
  CANVAS_ADD_ACTIONS,
  CANVAS_ADD_SOURCE_MODES,
  getCanvasAddAction,
  type CanvasAddActionId,
  type CanvasAddSourceModeId,
  type CanvasAddSourceKind,
} from '../../utils/canvasAddActions';

export interface CanvasAddActionPopoverProps {
  readonly onSelectAction: (
    actionId: CanvasAddActionId,
    sourceMode?: CanvasAddSourceModeId,
  ) => void;
  readonly availableSourceModes: readonly CanvasAddSourceModeId[];
  readonly availableGenerationKinds: readonly CanvasAddSourceKind[];
}

export function CanvasAddActionPopover({
  onSelectAction,
  availableSourceModes,
  availableGenerationKinds,
}: CanvasAddActionPopoverProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [sourceActionId, setSourceActionId] = useState<CanvasAddActionId | undefined>();
  const sourceAction = sourceActionId ? getCanvasAddAction(sourceActionId) : undefined;
  const sourceKind = sourceAction?.sourceKind;
  const visibleSourceModes = sourceKind
    ? CANVAS_ADD_SOURCE_MODES.filter((mode) =>
        mode.id === 'create'
          ? availableGenerationKinds.includes(sourceKind)
          : availableSourceModes.includes(mode.id),
      )
    : [];
  const visibleActions = CANVAS_ADD_ACTIONS.filter(
    (action) =>
      action.mode === 'direct' ||
      (action.sourceKind !== undefined &&
        (availableGenerationKinds.includes(action.sourceKind) || availableSourceModes.length > 0)),
  );

  const close = (): void => {
    setOpen(false);
    setSourceActionId(undefined);
  };

  return (
    <Popover
      align="start"
      contentClassName="canvas-add-action-popover-surface"
      side="top"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSourceActionId(undefined);
      }}
      trigger={
        <ToolbarButton
          aria-expanded={open}
          data-canvas-toolbar-action="open-add-node-popover"
          data-canvas-toolbar-kind="common-action"
          icon={<PlusIcon size={18} />}
          title={t('toolbar.addNode')}
          active={open}
        />
      }
    >
      <div
        aria-label={t('toolbar.addNode')}
        className="canvas-add-action-popover"
        data-canvas-add-action-popover="true"
        role="menu"
      >
        <div className="canvas-add-action-popover__title">
          {sourceAction ? t(sourceAction.labelKey) : t('toolbar.addNode')}
        </div>
        {sourceAction
          ? visibleSourceModes.map((mode) => (
              <button
                key={mode.id}
                className="canvas-add-action-popover__action"
                data-canvas-add-source-mode={mode.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  onSelectAction(sourceAction.id, mode.id);
                  close();
                }}
              >
                <span className="canvas-add-action-popover__source-mode-mark" aria-hidden="true" />
                <span className="canvas-add-action-popover__content">
                  <span className="canvas-add-action-popover__label">{t(mode.labelKey)}</span>
                  <span className="canvas-add-action-popover__description">
                    {t(mode.descriptionKey)}
                  </span>
                </span>
              </button>
            ))
          : visibleActions.map((action) => (
              <button
                key={action.id}
                className="canvas-add-action-popover__action"
                data-canvas-add-action={action.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  if (action.mode === 'source') {
                    setSourceActionId(action.id);
                    return;
                  }
                  onSelectAction(action.id);
                  close();
                }}
              >
                <span className="canvas-add-action-popover__icon">
                  {createCanvasAddActionIcon(action.id)}
                </span>
                <span className="canvas-add-action-popover__content">
                  <span className="canvas-add-action-popover__label">
                    {t(action.labelKey)}
                    {action.badgeKey ? (
                      <span className="canvas-add-action-popover__badge">{t(action.badgeKey)}</span>
                    ) : null}
                  </span>
                  {action.descriptionKey ? (
                    <span className="canvas-add-action-popover__description">
                      {t(action.descriptionKey)}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
      </div>
    </Popover>
  );
}
