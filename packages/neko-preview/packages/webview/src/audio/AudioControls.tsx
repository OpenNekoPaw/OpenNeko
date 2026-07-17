/**
 * AudioControls - Modern playback controls for audio preview
 *
 * Layout (top to bottom):
 *   1. Volume slider + Speed button
 *   2. Progress bar + time display
 *   3. Transport controls (skip back / play / skip forward)
 */

import { useCallback } from 'react';
import { formatTime } from '@neko/neko-client';
import { useTranslation } from '../i18n/I18nContext';
import { ProgressBar } from '../shared/ProgressBar';
import { MacIconButton } from '../shared/MacIconButton';
import { MacButton } from '../shared/MacButton';
import { MacSlider } from '../shared/MacSlider';
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeOffIcon,
} from '@neko/ui/icons';

export type ViewMode = 'cover' | 'lyrics' | 'waveform' | 'spectrum';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

interface AudioControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  speed: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onScrub?: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onSpeedChange: (speed: number) => void;
}

export function AudioControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  speed,
  onTogglePlay,
  onSeek,
  onScrub,
  onVolumeChange,
  onSpeedChange,
}: AudioControlsProps) {
  const { t } = useTranslation();

  const handleSpeedClick = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    onSpeedChange(SPEED_OPTIONS[nextIndex] ?? 1.0);
  }, [speed, onSpeedChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          onTogglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onSeek(Math.max(0, currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          onSeek(Math.min(duration, currentTime + 5));
          break;
        case 'ArrowUp':
          e.preventDefault();
          onVolumeChange(Math.min(1, volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          onVolumeChange(Math.max(0, volume - 0.05));
          break;
        case 'Home':
          e.preventDefault();
          onSeek(0);
          break;
        case 'End':
          e.preventDefault();
          onSeek(duration);
          break;
      }
    },
    [onTogglePlay, onSeek, onVolumeChange, currentTime, duration, volume],
  );

  return (
    <div tabIndex={0} onKeyDown={handleKeyDown} className="w-full outline-none">
      {/* Row 1: Volume + Speed (above progress bar) */}
      <div className="flex items-center justify-between gap-4 pb-2">
        {/* Volume */}
        <div className="flex items-center gap-1.5">
          <MacIconButton
            size="sm"
            onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
            title={volume > 0 ? t('preview.audio.mute') : t('preview.audio.unmute')}
          >
            {volume > 0 ? (
              <VolumeIcon className="w-4 h-4" />
            ) : (
              <VolumeOffIcon className="w-4 h-4" />
            )}
          </MacIconButton>
          <MacSlider
            value={volume}
            min={0}
            max={1}
            step={0.05}
            onChange={onVolumeChange}
            className="w-16"
            title={t('preview.audio.volumeLabel', {
              percent: Math.round(volume * 100).toString(),
            })}
          />
        </div>

        {/* Speed */}
        <MacButton
          variant="secondary"
          size="sm"
          onClick={handleSpeedClick}
          title={t('preview.audio.speedLabel')}
          className="min-w-[36px] text-[11px] font-semibold"
        >
          {speed === 1 ? '1x' : `${speed}x`}
        </MacButton>
      </div>

      {/* Row 2: Progress bar + time */}
      <div className="w-full pb-1 flex-shrink-0">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeekCommit={onSeek}
          onSeeking={onScrub}
        />
        <div className="flex justify-between text-[11px] text-neko-preview-text-secondary pt-1 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Row 3: Transport controls (skip back / play / skip forward) */}
      <div className="flex items-center justify-center gap-6 py-2">
        <MacIconButton
          size="md"
          onClick={() => onSeek(Math.max(0, currentTime - 10))}
          title={t('preview.audio.skipBack')}
        >
          <SkipBackIcon className="w-5 h-5" />
        </MacIconButton>

        <MacIconButton
          size="xl"
          variant="primary"
          onClick={onTogglePlay}
          title={isPlaying ? t('preview.audio.pauseButton') : t('preview.audio.playButton')}
        >
          {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
        </MacIconButton>

        <MacIconButton
          size="md"
          onClick={() => onSeek(Math.min(duration, currentTime + 10))}
          title={t('preview.audio.skipForward')}
        >
          <SkipForwardIcon className="w-5 h-5" />
        </MacIconButton>
      </div>
    </div>
  );
}
