/**
 * AudioPlayerControls - Playback controls for audio diff viewer.
 * Pure UI shell for audio playback controls.
 */

import { memo } from 'react';
import { PauseIcon, PlayIcon } from '@neko/ui/icons';
import { Button, Slider } from '@neko/ui/primitives';
import { useTranslation } from '../../../i18n/I18nContext';
import { formatTime } from './audioUtils';

interface AudioPlayerControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playingVersion: 'current' | 'previous' | 'both';
  onPlayingVersionChange: (version: 'current' | 'previous' | 'both') => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  /** Disable Play while git show is extracting the previous version */
  isFetchingPrevious?: boolean;
}

export const AudioPlayerControls = memo(function AudioPlayerControls({
  currentTime,
  duration,
  isPlaying,
  playingVersion,
  onPlayingVersionChange,
  onPlayPause,
  onSeek,
  isFetchingPrevious,
}: AudioPlayerControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <Button
        variant="default"
        size="md"
        className={`h-8 w-8 rounded p-0 ${isFetchingPrevious ? 'opacity-40' : ''}`}
        onClick={isFetchingPrevious ? undefined : onPlayPause}
        disabled={isFetchingPrevious}
        title={
          isFetchingPrevious ? t('mediaDiff.audio.fetchingPrevious') : isPlaying ? 'Pause' : 'Play'
        }
      >
        {isPlaying ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
      </Button>

      <div className="flex items-center gap-1 text-xs">
        <Button
          size="xs"
          variant={playingVersion === 'previous' ? 'danger' : 'secondary'}
          className="px-2 py-1"
          onClick={() => onPlayingVersionChange('previous')}
        >
          {t('mediaDiff.audio.previous')}
        </Button>
        <Button
          size="xs"
          variant={playingVersion === 'both' ? 'default' : 'secondary'}
          className="px-2 py-1"
          onClick={() => onPlayingVersionChange('both')}
        >
          {t('mediaDiff.audio.playBoth')}
        </Button>
        <Button
          size="xs"
          variant={playingVersion === 'current' ? 'default' : 'secondary'}
          className="px-2 py-1"
          onClick={() => onPlayingVersionChange('current')}
        >
          {t('mediaDiff.audio.current')}
        </Button>
      </div>

      <span className="text-xs text-[var(--vscode-foreground)] font-mono min-w-[100px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div className="flex-1">
        <Slider
          label={t('mediaDiff.audio.seek')}
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onPreviewChange={onSeek}
          onCommit={onSeek}
        />
      </div>
    </div>
  );
});
