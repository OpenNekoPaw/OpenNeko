/**
 * PreviewControls Component
 * 预览面板控制器 - 播放控制、视频质量、分辨率
 */

import { useState, useRef, useEffect, memo } from 'react';
import {
  CameraIcon,
  LoadingIcon,
  MoreHorizontalIcon,
  PictureInPictureIcon,
  SettingsIcon,
  VolumeIcon,
  VolumeOffIcon,
} from '@neko/ui/icons';
import { useTranslation } from '../i18n/I18nContext';
import { useEditorStore } from '../stores/editor-store';
import { formatTimeFull } from '../utils';
import { PREVIEW_CONTROL_ACTION_PLACEMENTS } from './PreviewControls.presenter';

export type ResolutionPreset =
  | '720p@60fps'
  | '1080p@30fps'
  | '1080p@60fps'
  | '4k@30fps'
  | '4k@60fps';

export interface PreviewControlsProps {
  // Playback state
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  playbackSpeed: number;

  // Playback controls
  seek: (time: number) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;

  // Preview quality
  previewQuality: 'full' | 'high' | 'medium' | 'low';
  setPreviewQuality: (quality: 'full' | 'high' | 'medium' | 'low') => void;

  // Audio controls
  previewVolume: number;
  previewMuted: boolean;
  setPreviewVolume: (volume: number) => void;
  togglePreviewMute: () => void;

  // Resolution settings
  resolution: { width: number; height: number };
  fps: number;
  onResolutionChange?: (resolution: { width: number; height: number }) => void;
  onFpsChange?: (fps: number) => void;

  // Fullscreen
  isFullscreen?: boolean;
  onFullscreenToggle?: () => void;

  // Screenshot
  onCaptureScreenshot?: () => void;
  isCapturingScreenshot?: boolean;
}

// Dropdown component for selections
interface DropdownProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}

function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
  disabled,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-vscode-input-bg border-vscode-panel-border text-vscode-description'
            : 'bg-vscode-input-bg border-vscode-panel-border text-vscode-fg hover:border-vscode-focusBorder'
        }`}
      >
        <span>{selectedOption?.label || value}</span>
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 py-1 bg-vscode-dropdown-bg border border-vscode-panel-border rounded shadow-lg z-50 min-w-full">
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-xs text-left transition-colors whitespace-nowrap ${
                option.value === value
                  ? 'bg-vscode-list-activeSelectionBg text-vscode-list-activeSelectionFg'
                  : 'text-vscode-fg hover:bg-vscode-list-hoverBg'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const PreviewControls = memo(function PreviewControls({
  currentTime,
  totalDuration,
  isPlaying,
  playbackSpeed,
  seek,
  togglePlayback,
  setPlaybackSpeed,
  previewQuality,
  setPreviewQuality,
  previewVolume,
  previewMuted,
  setPreviewVolume,
  togglePreviewMute,
  resolution: _resolution,
  fps: _fps,
  onResolutionChange: _onResolutionChange,
  onFpsChange: _onFpsChange,
  isFullscreen = false,
  onFullscreenToggle,
  onCaptureScreenshot,
  isCapturingScreenshot = false,
}: PreviewControlsProps) {
  const { t } = useTranslation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  // FPS counter state from store
  const showFpsCounter = useEditorStore((state) => state.showFpsCounter);
  const toggleFpsCounter = useEditorStore((state) => state.toggleFpsCounter);

  // PiP state from store
  const isPiPActive = useEditorStore((state) => state.isPiPActive);

  // Quality options - display quality name with scale ratio
  const qualityOptions: { value: 'full' | 'high' | 'medium' | 'low'; label: string }[] = [
    { value: 'full', label: `${t('preview.qualityOptions.full')}: 1` },
    { value: 'high', label: `${t('preview.qualityOptions.high')}: 0.75` },
    { value: 'medium', label: `${t('preview.qualityOptions.medium')}: 0.5` },
    { value: 'low', label: `${t('preview.qualityOptions.low')}: 0.25` },
  ];
  const playbackSpeedOptions: { value: number; label: string }[] = [
    { value: 0.5, label: '0.5x' },
    { value: 0.75, label: '0.75x' },
    { value: 1, label: '1x' },
    { value: 1.25, label: '1.25x' },
    { value: 1.5, label: '1.5x' },
    { value: 2, label: '2x' },
  ];
  const placementSummary = PREVIEW_CONTROL_ACTION_PLACEMENTS;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setIsSettingsOpen(false);
      }
      if (overflowRef.current && !overflowRef.current.contains(target)) {
        setIsOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className="cut-preview-controls flex items-center px-3 py-2 bg-vscode-editor-bg border-b border-vscode-panel-border"
      data-action-placements={placementSummary
        .map((action) => `${action.id}:${action.placement}`)
        .join(',')}
    >
      {/* Left: Playback Controls */}
      <div className="cut-preview-primary-controls flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => seek(0)}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.goToStart')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={() => seek(Math.max(0, currentTime - 5))}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.rewind5s')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M11 18V6l-8.5 6zm.5-6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={togglePlayback}
          className="p-2 bg-vscode-button hover:bg-vscode-button-hover rounded"
          title={isPlaying ? t('timeline.controls.pause') : t('timeline.controls.play')}
        >
          {isPlaying ? (
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
          onClick={() => seek(Math.min(totalDuration, currentTime + 5))}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.forward5s')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>

        <button
          onClick={() => seek(totalDuration)}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.goToEnd')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>

        <div className="w-px h-4 bg-vscode-panel-border mx-2" />

        <span className="text-xs text-vscode-description font-mono">
          {formatTimeFull(currentTime)} / {formatTimeFull(totalDuration)}
        </span>
      </div>

      <div className="cut-preview-secondary-controls flex items-center gap-2 min-w-0 mx-2 flex-1 justify-end">
        {/* Volume Controls */}
        <div className="cut-preview-volume flex items-center gap-2">
          {/* Mute/Unmute Button */}
          <button
            onClick={togglePreviewMute}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={previewMuted ? t('preview.unmute') : t('preview.mute')}
          >
            {previewMuted ? (
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
            value={previewMuted ? 0 : Math.round(previewVolume * 100)}
            onChange={(e) => {
              const newVolume = Number.parseInt(e.target.value) / 100;
              setPreviewVolume(newVolume);
              // Unmute if user adjusts volume while muted
              if (previewMuted && newVolume > 0) {
                togglePreviewMute();
              }
            }}
            className="w-20 h-1 bg-vscode-input-bg rounded-lg appearance-none cursor-pointer accent-vscode-button"
            style={{
              background: `linear-gradient(to right, var(--vscode-button-background) 0%, var(--vscode-button-background) ${previewMuted ? 0 : previewVolume * 100}%, var(--vscode-input-background) ${previewMuted ? 0 : previewVolume * 100}%, var(--vscode-input-background) 100%)`,
            }}
            title={`${t('preview.volume')}: ${Math.round(previewVolume * 100)}%`}
          />

          {/* Volume Percentage */}
          <span className="text-xs text-vscode-description font-mono w-8 text-right">
            {previewMuted ? '0%' : `${Math.round(previewVolume * 100)}%`}
          </span>
        </div>

        <div ref={settingsRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsSettingsOpen((value) => !value)}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={t('preview.settings')}
            aria-label={t('preview.settings')}
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
          {isSettingsOpen && (
            <div className="cut-preview-menu right-0">
              <div className="cut-preview-menu-row">
                <span>{t('preview.quality')}</span>
                <Dropdown
                  value={previewQuality}
                  options={qualityOptions}
                  onChange={setPreviewQuality}
                />
              </div>
              <div className="cut-preview-menu-row">
                <span>{t('preview.playbackSpeed')}</span>
                <Dropdown
                  value={playbackSpeed}
                  options={playbackSpeedOptions}
                  onChange={setPlaybackSpeed}
                />
              </div>
            </div>
          )}
        </div>

        <div ref={overflowRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsOverflowOpen((value) => !value)}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={t('preview.moreActions')}
            aria-label={t('preview.moreActions')}
          >
            <MoreHorizontalIcon className="w-4 h-4" />
          </button>
          {isOverflowOpen && (
            <div className="cut-preview-menu right-0">
              <button
                type="button"
                onClick={toggleFpsCounter}
                className="cut-preview-menu-button"
                aria-pressed={showFpsCounter}
              >
                <FpsIcon />
                <span>{t('preview.toggleFps')}</span>
              </button>
              {onCaptureScreenshot && (
                <button
                  type="button"
                  onClick={onCaptureScreenshot}
                  disabled={isCapturingScreenshot}
                  className="cut-preview-menu-button"
                >
                  {isCapturingScreenshot ? (
                    <LoadingIcon className="cut-preview-spinner" />
                  ) : (
                    <CameraIcon className="w-4 h-4" />
                  )}
                  <span>{t('preview.captureScreenshot')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  (
                    window as unknown as { __previewPanelTogglePiP?: () => void }
                  ).__previewPanelTogglePiP?.()
                }
                className="cut-preview-menu-button"
                aria-pressed={isPiPActive}
              >
                <PictureInPictureIcon className="w-4 h-4" />
                <span>
                  {isPiPActive ? t('preview.exitPictureInPicture') : t('preview.pictureInPicture')}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Fullscreen Button */}
        {onFullscreenToggle && (
          <>
            <button
              onClick={onFullscreenToggle}
              className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
              title={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
});

function FpsIcon() {
  return <span className="cut-preview-fps-icon">FPS</span>;
}
