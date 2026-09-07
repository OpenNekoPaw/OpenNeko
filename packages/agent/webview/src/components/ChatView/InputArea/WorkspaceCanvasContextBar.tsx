import { ChevronDownIcon, FolderIcon } from '@neko/ui/icons';
import type { AgentComposerCanvasPresentation } from '../../ComposerWorkspaceContext';
import { useTranslation } from '../../../i18n/I18nContext';

export interface WorkspaceCanvasContextBarProps {
  readonly workspaceLabel: string;
  readonly canvas?: AgentComposerCanvasPresentation;
  readonly disabled?: boolean;
  readonly showCanvasIndex?: boolean;
}

export function WorkspaceCanvasContextBar({
  workspaceLabel,
  canvas,
  disabled = false,
  showCanvasIndex = true,
}: WorkspaceCanvasContextBarProps): JSX.Element | null {
  const { t } = useTranslation();
  const selectedOption = canvas?.options.find((option) => option.id === canvas.selectedId);
  const selectedLabel =
    canvas === undefined
      ? t('chat.input.workspaceCanvas.unavailable')
      : (selectedOption?.label ?? t('chat.input.workspaceCanvas.unavailable'));

  return (
    <div
      className="agent-workspace-canvas-context-bar"
      data-workspace-canvas-context="true"
      aria-label={t('chat.input.workspaceCanvas.label')}
    >
      <FolderIcon size={14} />
      <span className="agent-workspace-canvas-workspace-label" title={workspaceLabel}>
        {workspaceLabel}
      </span>
      {showCanvasIndex && canvas ? (
        <span className="agent-workspace-canvas-select-control">
          <select
            className="agent-workspace-canvas-select"
            value={canvas.selectedId}
            disabled={canvas.loading || disabled}
            aria-label={t('chat.input.workspaceCanvas.canvasIndex')}
            title={selectedLabel}
            onChange={(event) => {
              void canvas.onSelect(event.target.value);
            }}
            onDoubleClick={() => {
              if (selectedOption !== undefined && selectedOption.disabled !== true) {
                void canvas.onOpen?.(selectedOption.id);
              }
            }}
          >
            {canvas.options.map((option) => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
            {selectedOption === undefined ? (
              <option value={canvas.selectedId} disabled>
                {selectedLabel}
              </option>
            ) : null}
          </select>
          <span className="agent-workspace-canvas-select-chevron" aria-hidden="true">
            <ChevronDownIcon size={12} />
          </span>
        </span>
      ) : showCanvasIndex ? (
        <span className="agent-workspace-canvas-default">{selectedLabel}</span>
      ) : null}
      {showCanvasIndex ? canvas?.creationControl : null}
      {canvas?.diagnostic ? (
        <span className="agent-workspace-canvas-diagnostic" role="alert">
          {canvas.diagnostic}
        </span>
      ) : null}
    </div>
  );
}
