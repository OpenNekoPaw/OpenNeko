import { memo } from 'react';
import {
  DownloadIcon,
  FileIcon,
  FrameSelectionIcon,
  GridIcon,
  LayersIcon,
  PlusIcon,
  RedoIcon,
  ScissorsIcon,
  TrashIcon,
  UndoIcon,
  VolumeLowIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@neko/ui/icons';
import { MainPanelControlLayer } from '@neko/ui/workbench';
import { useTranslation } from '../../i18n/I18nContext';
import { MAX_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND, TRACK_HEADER_WIDTH } from './timelineMath';

export interface TimelineControlsProps {
  readonly pixelsPerSecond: number;
  readonly snappingEnabled: boolean;
  readonly overviewVisible: boolean;
  readonly hasSelection: boolean;
  readonly canSplit: boolean;
  readonly canAddAudioTrack: boolean;
  readonly canAddSubtitleTrack: boolean;
  readonly onPixelsPerSecond: (value: number) => void;
  readonly onToggleSnapping: () => void;
  readonly onToggleOverview: () => void;
  readonly onLinkMedia: () => void;
  readonly onAddAudioTrack: () => void;
  readonly onAddSubtitleTrack: () => void;
  readonly onSplit: () => void;
  readonly onDelete: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onFitAll: () => void;
  readonly onExport: () => void;
}

export const TimelineControls = memo(function TimelineControls(props: TimelineControlsProps) {
  const { t } = useTranslation();
  return (
    <MainPanelControlLayer
      id="cut-main-panel-tools"
      visible
      placement="timeline-header"
      className="cut-main-panel-tools"
      label={t('timeline.controls.addTrack')}
    >
      <div className="cut-basic-timeline-toolbar">
        <div className="cut-basic-track-toolbar" style={{ width: TRACK_HEADER_WIDTH }}>
          <ToolbarButton label={t('timeline.controls.addMedia')} onClick={props.onLinkMedia}>
            <PlusIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            disabled={!props.canAddAudioTrack}
            label={t('timeline.controls.audioTrack')}
            onClick={props.onAddAudioTrack}
          >
            <VolumeLowIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            disabled={!props.canAddSubtitleTrack}
            label={t('timeline.controls.subtitleTrack')}
            onClick={props.onAddSubtitleTrack}
          >
            <FileIcon size={16} />
          </ToolbarButton>
        </div>
        <div className="cut-basic-timeline-actions">
          <ToolbarButton
            disabled={!props.canSplit}
            label={t('timeline.controls.split')}
            onClick={props.onSplit}
          >
            <ScissorsIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            disabled={!props.hasSelection}
            label={t('timeline.controls.delete')}
            onClick={props.onDelete}
          >
            <TrashIcon size={16} />
          </ToolbarButton>
          <ToolbarButton label={t('timeline.controls.undo')} onClick={props.onUndo}>
            <UndoIcon size={16} />
          </ToolbarButton>
          <ToolbarButton label={t('timeline.controls.redo')} onClick={props.onRedo}>
            <RedoIcon size={16} />
          </ToolbarButton>
          <span className="cut-basic-toolbar-separator" />
          <ToolbarButton
            active={props.snappingEnabled}
            label={t('timeline.controls.snapping')}
            onClick={props.onToggleSnapping}
          >
            <GridIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            active={props.overviewVisible}
            label={t('timeline.controls.minimap')}
            onClick={props.onToggleOverview}
          >
            <LayersIcon size={16} />
          </ToolbarButton>
          <ToolbarButton label={t('timeline.controls.fitAll')} onClick={props.onFitAll}>
            <FrameSelectionIcon size={16} />
          </ToolbarButton>
          <span className="cut-basic-toolbar-separator" />
          <span aria-hidden="true">
            <ZoomOutIcon size={14} />
          </span>
          <input
            aria-label={t('timeline.controls.zoom')}
            min={MIN_PIXELS_PER_SECOND}
            max={MAX_PIXELS_PER_SECOND}
            onChange={(event) => props.onPixelsPerSecond(Number(event.currentTarget.value))}
            type="range"
            value={props.pixelsPerSecond}
          />
          <span aria-hidden="true">
            <ZoomInIcon size={14} />
          </span>
          <ToolbarButton label={t('timeline.controls.export')} onClick={props.onExport}>
            <DownloadIcon size={16} />
          </ToolbarButton>
        </div>
      </div>
    </MainPanelControlLayer>
  );
});

function ToolbarButton(props: {
  readonly active?: boolean;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.active}
      className="cut-basic-toolbar-button"
      data-active={props.active ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}
