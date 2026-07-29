import { useState, type ReactElement } from 'react';
import { Button, Popover, ToolbarButton } from '@neko/ui/primitives';
import { PlusIcon } from '@neko/shared/icons';
import { t } from '../../i18n';
import { createCanvasAddActionIcon } from '../adapters/sharedCanvasUiAdapter';
import { CANVAS_ADD_ACTION_GROUPS, type CanvasAddActionId } from '../../utils/canvasAddActions';

export interface CanvasAddActionPopoverProps {
  readonly onSelectAction: (actionId: CanvasAddActionId) => void;
}

export function CanvasAddActionPopover({
  onSelectAction,
}: CanvasAddActionPopoverProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      align="start"
      side="top"
      open={open}
      onOpenChange={setOpen}
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
        className="flex min-w-48 flex-col gap-2"
        data-canvas-add-action-popover="true"
        role="menu"
      >
        {CANVAS_ADD_ACTION_GROUPS.map((group) => (
          <section
            key={group.id}
            aria-label={t(group.labelKey)}
            data-canvas-add-action-group={group.id}
            role="group"
          >
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase text-[var(--neko-fg-secondary)]">
              {t(group.labelKey)}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.actions.map((action) => (
                <Button
                  key={action.id}
                  className="justify-start"
                  data-canvas-add-action={action.id}
                  leadingIcon={createCanvasAddActionIcon(action.nodeType)}
                  role="menuitem"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    onSelectAction(action.id);
                    setOpen(false);
                  }}
                >
                  {t(action.labelKey)}
                </Button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Popover>
  );
}
