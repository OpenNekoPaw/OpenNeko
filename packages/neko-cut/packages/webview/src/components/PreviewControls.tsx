/**
 * PreviewControls Component
 * 预览面板控制器 - 播放控制、视频质量、分辨率
 */

import { memo } from 'react';
import { RightPanelIcon, RightPanelOffIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { useTranslation } from '../i18n/I18nContext';
import { formatTimeFull } from '../utils';

export interface PreviewControlsProps {
  readonly currentTime: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly propertyPanelVisible: boolean;
  readonly volume: number;
  readonly onStart: () => void;
  readonly onPrevious: () => void;
  readonly onToggle: () => void;
  readonly onNext: () => void;
  readonly onEnd: () => void;
  readonly onVolume: (volume: number) => void;
  readonly onToggleMute: () => void;
  readonly onTogglePropertyPanel: () => void;
  readonly onFullscreen?: () => void;
}

export const PreviewControls = memo(function PreviewControls({
  currentTime,
  duration,
  playing,
  propertyPanelVisible,
  volume,
  onStart,
  onPrevious,
  onToggle,
  onNext,
  onEnd,
  onVolume,
  onToggleMute,
  onTogglePropertyPanel,
  onFullscreen,
}: PreviewControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="cut-preview-controls flex items-center px-3 py-2 bg-vscode-editor-bg border-b border-vscode-panel-border">
      {/* Left: Playback Controls */}
      <div className="cut-preview-primary-controls flex items-center gap-1 flex-shrink-0">
        <button
          aria-label={t('timeline.controls.goToStart')}
          onClick={onStart}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.goToStart')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          aria-label={t('timeline.basic.previousFrame')}
          onClick={onPrevious}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.rewind5s')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M11 18V6l-8.5 6zm.5-6l8.5 6V6z" />
          </svg>
        </button>

        <button
          aria-label={playing ? t('timeline.controls.pause') : t('timeline.controls.play')}
          onClick={onToggle}
          className="p-2 bg-vscode-button hover:bg-vscode-button-hover rounded"
          title={playing ? t('timeline.controls.pause') : t('timeline.controls.play')}
        >
          {playing ? (
            <svg className="w-4 h-4 fill-current text-vscode-button-fg" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 fill-current text-vscode-button-fg" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          aria-label={t('timeline.basic.nextFrame')}
          onClick={onNext}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.forward5s')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>

        <button
          aria-label={t('timeline.controls.goToEnd')}
          onClick={onEnd}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.goToEnd')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>

        <div className="w-px h-4 bg-vscode-panel-border mx-2" />

        <output className="text-xs text-vscode-description font-mono">
          {formatTimeFull(currentTime)} / {formatTimeFull(duration)}
        </output>
      </div>

      <div className="cut-preview-secondary-controls flex items-center gap-2 min-w-0 mx-2 flex-1 justify-end">
        {/* Volume Controls */}
        <div className="cut-preview-volume flex items-center gap-2">
          {/* Mute/Unmute Button */}
          <button
            aria-label={t('timeline.basic.globalVolume')}
            onClick={onToggleMute}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={volume === 0 ? t('preview.unmute') : t('preview.mute')}
          >
            {volume === 0 ? (
              <VolumeOffIcon className="w-4 h-4" />
            ) : (
              <VolumeIcon className="w-4 h-4" />
            )}
          </button>

          {/* Volume Slider */}
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(volume * 100)}
            onChange={(e) => {
              const newVolume = Number.parseInt(e.target.value) / 100;
              onVolume(newVolume);
            }}
            className="w-20 h-1 bg-vscode-input-bg rounded-lg appearance-none cursor-pointer accent-vscode-button"
            style={{
              background: `linear-gradient(to right, var(--vscode-button-background) 0%, var(--vscode-button-background) ${volume * 100}%, var(--vscode-input-background) ${volume * 100}%, var(--vscode-input-background) 100%)`,
            }}
            title={`${t('preview.volume')}: ${Math.round(volume * 100)}%`}
          />

          {/* Volume Percentage */}
          <span className="text-xs text-vscode-description font-mono w-8 text-right">
            {`${Math.round(volume * 100)}%`}
          </span>
        </div>

        {/* Fullscreen Button */}
        {onFullscreen && (
          <button
            aria-label={t('timeline.basic.fullscreen')}
            onClick={onFullscreen}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={t('preview.fullscreen')}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
        )}

        <button
          aria-label={t('timeline.controls.propertyPanel')}
          aria-pressed={propertyPanelVisible}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          onClick={onTogglePropertyPanel}
          title={t('timeline.controls.propertyPanel')}
          type="button"
        >
          {propertyPanelVisible ? (
            <RightPanelIcon className="w-4 h-4" />
          ) : (
            <RightPanelOffIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
});
