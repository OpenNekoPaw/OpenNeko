/**
 * TimelineControls Component
 * 时间线主面板控件 - 轨道、编辑、视图、缩放与导出操作
 */

import { memo } from 'react';
import { PackageIcon, RightPanelIcon, RightPanelOffIcon } from '@neko/ui/icons';
import { MainPanelControlLayer } from '@neko/ui/workbench';
import { useTranslation } from '../../i18n/I18nContext';
import { TRACK_LABEL_WIDTH } from '../../constants';

export interface TimelineControlsProps {
  readonly zoomLevel: number;
  readonly setZoomLevel: (zoom: number) => void;
  readonly snappingEnabled: boolean;
  readonly rippleEditingEnabled: boolean;
  readonly frameAlignEnabled: boolean;
  readonly showClipThumbnails: boolean;
  readonly showMinimap: boolean;
  readonly toggleSnapping: () => void;
  readonly toggleRippleEditing: () => void;
  readonly toggleFrameAlign: () => void;
  readonly toggleClipThumbnails: () => void;
  readonly toggleMinimap: () => void;
  readonly addTrack: (type: 'media' | 'audio' | 'text' | 'subtitle' | 'shape') => void;
  readonly onSplit?: () => void;
  readonly onDelete?: () => void;
  readonly onCopy?: () => void;
  readonly onPaste?: () => void;
  readonly hasSelection?: boolean;
  readonly hasClipboard?: boolean;
  readonly onAddKeyframe?: () => void;
  readonly onPrevKeyframe?: () => void;
  readonly onNextKeyframe?: () => void;
  readonly hasKeyframeAtCurrentTime?: boolean;
  readonly propertyPanelVisible: boolean;
  readonly onOpenPackage: () => void;
  readonly onTogglePropertyPanel: () => void;
  readonly onExport: () => void;
}

export const TimelineControls = memo(function TimelineControls({
  zoomLevel,
  setZoomLevel,
  snappingEnabled,
  rippleEditingEnabled,
  frameAlignEnabled,
  showClipThumbnails,
  showMinimap,
  toggleSnapping,
  toggleRippleEditing,
  toggleFrameAlign,
  toggleClipThumbnails,
  toggleMinimap,
  addTrack,
  onSplit,
  onDelete,
  onCopy,
  onPaste,
  hasSelection = false,
  hasClipboard = false,
  onAddKeyframe,
  onPrevKeyframe,
  onNextKeyframe,
  hasKeyframeAtCurrentTime = false,
  propertyPanelVisible,
  onOpenPackage,
  onTogglePropertyPanel,
  onExport,
}: TimelineControlsProps) {
  const { t } = useTranslation();

  return (
    <MainPanelControlLayer
      id="cut-main-panel-tools"
      visible={true}
      placement="timeline-header"
      className="cut-main-panel-tools"
      label={t('timeline.controls.addTrack')}
    >
      <div className="h-10 flex items-center justify-between bg-vscode-editor-bg border-b border-vscode-panel-border px-3">
        <div className="flex items-center gap-1 shrink-0" style={{ width: TRACK_LABEL_WIDTH }}>
          <button
            onClick={() => addTrack('media')}
            className="p-1.5 rounded hover:bg-vscode-toolbar-hover active:scale-90 active:bg-blue-500/40"
            title={t('timeline.controls.mediaTrack')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
            </svg>
          </button>
          <button
            onClick={() => addTrack('audio')}
            className="p-1.5 rounded hover:bg-vscode-toolbar-hover active:scale-90 active:bg-green-500/40"
            title={t('timeline.controls.audioTrack')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </button>
          <button
            onClick={() => addTrack('text')}
            className="p-1.5 rounded hover:bg-vscode-toolbar-hover active:scale-90 active:bg-yellow-500/40"
            title={t('timeline.controls.textTrack')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M5 4v3h5.5v12h3V7H19V4z" />
            </svg>
          </button>
          <button
            onClick={() => addTrack('subtitle')}
            className="p-1.5 rounded hover:bg-vscode-toolbar-hover active:scale-90 active:bg-purple-500/40"
            title={t('timeline.controls.subtitleTrack')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z" />
            </svg>
          </button>
          <button
            onClick={() => addTrack('shape')}
            className="p-1.5 rounded hover:bg-vscode-toolbar-hover active:scale-90 active:bg-cyan-500/40"
            title={t('timeline.controls.shapeTrack')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M11 7h2v10h-2V7zm-4 4h2v6H7v-6zm8 2h2v4h-2v-4zm-4-8L2 9l9 4 9-4-9-4z" />
            </svg>
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onSplit}
            disabled={!hasSelection || !onSplit}
            className={`p-1.5 rounded ${
              hasSelection && onSplit
                ? 'hover:bg-vscode-toolbar-hover'
                : 'opacity-40 cursor-not-allowed'
            }`}
            title={t('timeline.controls.split')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M11 5v6H5v2h6v6h2v-6h6v-2h-6V5h-2z" transform="rotate(45 12 12)" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            disabled={!hasSelection || !onDelete}
            className={`p-1.5 rounded ${
              hasSelection && onDelete
                ? 'hover:bg-vscode-toolbar-hover'
                : 'opacity-40 cursor-not-allowed'
            }`}
            title={t('timeline.controls.delete')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
          <button
            onClick={onCopy}
            disabled={!hasSelection || !onCopy}
            className={`p-1.5 rounded ${
              hasSelection && onCopy
                ? 'hover:bg-vscode-toolbar-hover'
                : 'opacity-40 cursor-not-allowed'
            }`}
            title={t('timeline.controls.copy')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
          </button>
          <button
            onClick={onPaste}
            disabled={!hasClipboard || !onPaste}
            className={`p-1.5 rounded ${
              hasClipboard && onPaste
                ? 'hover:bg-vscode-toolbar-hover'
                : 'opacity-40 cursor-not-allowed'
            }`}
            title={t('timeline.controls.paste')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z" />
            </svg>
          </button>

          <div className="w-px h-5 bg-vscode-panel-border mx-1" />

          <button
            onClick={onPrevKeyframe}
            disabled={!hasSelection || !onPrevKeyframe}
            className={`p-1.5 rounded ${
              hasSelection && onPrevKeyframe
                ? 'hover:bg-vscode-toolbar-hover'
                : 'opacity-40 cursor-not-allowed'
            }`}
            title={t('timeline.controls.prevKeyframe')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
              <circle cx="7" cy="12" r="2" />
            </svg>
          </button>
          <button
            onClick={onAddKeyframe}
            disabled={!hasSelection || !onAddKeyframe}
            className={`p-1.5 rounded ${
              !hasSelection || !onAddKeyframe
                ? 'opacity-40 cursor-not-allowed'
                : hasKeyframeAtCurrentTime
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                  : 'hover:bg-vscode-toolbar-hover'
            }`}
            title={
              hasKeyframeAtCurrentTime
                ? t('timeline.controls.removeKeyframe')
                : t('timeline.controls.addKeyframe')
            }
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z" />
            </svg>
          </button>
          <button
            onClick={onNextKeyframe}
            disabled={!hasSelection || !onNextKeyframe}
            className={`p-1.5 rounded ${
              hasSelection && onNextKeyframe
                ? 'hover:bg-vscode-toolbar-hover'
                : 'opacity-40 cursor-not-allowed'
            }`}
            title={t('timeline.controls.nextKeyframe')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              <circle cx="17" cy="12" r="2" />
            </svg>
          </button>

          <div className="w-px h-5 bg-vscode-panel-border mx-1" />

          <button
            onClick={toggleSnapping}
            className={`p-1.5 rounded transition-colors ${
              snappingEnabled
                ? 'bg-vscode-button text-vscode-button-fg'
                : 'text-vscode-description hover:text-vscode-fg hover:bg-vscode-toolbar-hover'
            }`}
            title={t('timeline.controls.snapping')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M20 6h-3V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM9 4h6v2H9V4zm11 16H4V8h16v12z" />
            </svg>
          </button>
          <button
            onClick={toggleRippleEditing}
            className={`p-1.5 rounded transition-colors ${
              rippleEditingEnabled
                ? 'bg-vscode-button text-vscode-button-fg'
                : 'text-vscode-description hover:text-vscode-fg hover:bg-vscode-toolbar-hover'
            }`}
            title={t('timeline.controls.rippleEditing')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M7 14l5-5 5 5z M7 10l5-5 5 5z" />
            </svg>
          </button>
          <button
            onClick={toggleFrameAlign}
            className={`p-1.5 rounded transition-colors ${
              frameAlignEnabled
                ? 'bg-vscode-button text-vscode-button-fg'
                : 'text-vscode-description hover:text-vscode-fg hover:bg-vscode-toolbar-hover'
            }`}
            title={t('timeline.controls.frameAlign')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M3 5v14h18V5H3zm16 12H5V7h14v10zM7 9h2v6H7zm4 0h2v6h-2zm4 0h2v6h-2z" />
            </svg>
          </button>
          <button
            onClick={toggleClipThumbnails}
            className={`p-1.5 rounded transition-colors ${
              showClipThumbnails
                ? 'bg-vscode-button text-vscode-button-fg'
                : 'text-vscode-description hover:text-vscode-fg hover:bg-vscode-toolbar-hover'
            }`}
            title={t('timeline.controls.clipThumbnails')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v2H5zm0-4h14v2H5zm0-4h14v2H5z" />
            </svg>
          </button>
          <button
            onClick={toggleMinimap}
            className={`p-1.5 rounded transition-colors ${
              showMinimap
                ? 'bg-vscode-button text-vscode-button-fg'
                : 'text-vscode-description hover:text-vscode-fg hover:bg-vscode-toolbar-hover'
            }`}
            title={t('timeline.controls.minimap')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M3 5v14h18V5H3zm16 12H5V7h14v10zm-2-2H7V9h10v6z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onTogglePropertyPanel}
            className={`p-1.5 rounded transition-colors ${
              propertyPanelVisible
                ? 'bg-vscode-button text-vscode-button-fg'
                : 'text-vscode-description hover:text-vscode-fg hover:bg-vscode-toolbar-hover'
            }`}
            title={
              propertyPanelVisible ? t('preview.hidePropertyPanel') : t('preview.showPropertyPanel')
            }
            aria-label={
              propertyPanelVisible ? t('preview.hidePropertyPanel') : t('preview.showPropertyPanel')
            }
            aria-controls="cut-property-panel"
            aria-expanded={propertyPanelVisible}
            aria-pressed={propertyPanelVisible}
            data-cut-control="toggle-property-panel"
          >
            {propertyPanelVisible ? <RightPanelIcon size={16} /> : <RightPanelOffIcon size={16} />}
          </button>

          <div className="w-px h-5 bg-vscode-panel-border mx-1" />

          <button
            onClick={() => setZoomLevel(zoomLevel / 1.5)}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={t('timeline.controls.zoomOut')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z" />
            </svg>
          </button>
          <span className="text-xs text-vscode-description font-mono min-w-[3rem] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel(zoomLevel * 1.5)}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={t('timeline.controls.zoomIn')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7h-1v2H7v1h2v2h1v-2h2V9h-2z" />
            </svg>
          </button>

          <div className="w-px h-5 bg-vscode-panel-border mx-1" />

          <button
            type="button"
            onClick={onOpenPackage}
            className="p-1.5 rounded text-vscode-description hover:text-vscode-fg hover:bg-vscode-toolbar-hover"
            title={t('preview.packageProject')}
            aria-label={t('preview.packageProject')}
            data-cut-control="package-project"
          >
            <PackageIcon size={16} />
          </button>
          <button
            onClick={onExport}
            className="p-1.5 bg-vscode-button hover:bg-vscode-button-hover rounded"
            title={t('timeline.controls.exportVideo')}
          >
            <svg className="w-4 h-4 fill-current text-vscode-button-fg" viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
          </button>
        </div>
      </div>
    </MainPanelControlLayer>
  );
});
