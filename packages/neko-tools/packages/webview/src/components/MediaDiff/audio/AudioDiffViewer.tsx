/**
 * AudioDiffViewer - Main audio comparison viewer component.
 * Orchestrates waveform views, player controls, and details panel.
 */

import { memo, useState, useCallback, useMemo } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';
import type { AudioDiffViewerProps } from '../types';
import { OverlayWaveform } from './OverlayWaveform';
import { ThreeTrackWaveform } from './ThreeTrackWaveform';
import { AudioPlayerControls } from './AudioPlayerControls';
import { AudioDetails } from './AudioDetails';
import { useAudioDiffPlayback } from '../../../hooks/useAudioDiffPlayback';

export const AudioDiffViewer = memo(function AudioDiffViewer({
  viewMode,
  details,
  currentWaveform = [],
  previousWaveform = [],
  currentTime = 0,
  onTimeChange,
  playingVersion = 'current',
  onPlayingVersionChange,
  audioStreamConfig,
  onAudioStreamControl,
  isFetchingPrevious,
  isLoading,
  error,
}: AudioDiffViewerProps) {
  const { t } = useTranslation();
  const [localTime, setLocalTime] = useState(currentTime);
  const [localPlayingVersion, setLocalPlayingVersion] = useState(playingVersion);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);

  const duration = Math.max(details?.duration?.current ?? 0, details?.duration?.previous ?? 0);

  const handleTimeChange = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
    },
    [onTimeChange],
  );

  const handlePlayingVersionChange = useCallback(
    (version: 'current' | 'previous' | 'both') => {
      setLocalPlayingVersion(version);
      onPlayingVersionChange?.(version);
    },
    [onPlayingVersionChange],
  );

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const handleScrollOffsetChange = useCallback((offset: number) => {
    setScrollOffset(offset);
  }, []);

  const { isPlaying, togglePlayback, seekTo } = useAudioDiffPlayback({
    audioStreamConfig: audioStreamConfig ?? null,
    playingVersion: localPlayingVersion,
    onTimeChange: handleTimeChange,
    onAudioStreamControl,
  });

  const displayCurrentWaveform = useMemo(
    () =>
      currentWaveform.length > 0
        ? currentWaveform
        : Array.from({ length: 100 }, () => Math.random()),
    [currentWaveform],
  );
  const displayPreviousWaveform = useMemo(
    () =>
      previousWaveform.length > 0
        ? previousWaveform
        : Array.from({ length: 100 }, () => Math.random()),
    [previousWaveform],
  );

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--vscode-button-background)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <div className="text-sm text-[var(--vscode-descriptionForeground)]">
            {t('mediaDiff.audio.loading')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {viewMode === 'side-by-side' && (
        <ThreeTrackWaveform
          currentWaveform={displayCurrentWaveform}
          previousWaveform={displayPreviousWaveform}
          currentTime={localTime}
          duration={duration}
          diffRegions={details?.diffRegions}
          silenceRegions={details?.silenceRegions}
          zoom={zoom}
          scrollOffset={scrollOffset}
          onZoomChange={handleZoomChange}
          onScrollOffsetChange={handleScrollOffsetChange}
          onSeek={handleTimeChange}
        />
      )}
      {(viewMode === 'overlay' || viewMode === 'slider' || viewMode === 'onion-skin') && (
        <OverlayWaveform
          currentWaveform={displayCurrentWaveform}
          previousWaveform={displayPreviousWaveform}
          currentTime={localTime}
          duration={duration}
          zoom={zoom}
          scrollOffset={scrollOffset}
          onZoomChange={handleZoomChange}
          onScrollOffsetChange={handleScrollOffsetChange}
          onSeek={handleTimeChange}
        />
      )}
      <AudioPlayerControls
        currentTime={localTime}
        duration={duration}
        isPlaying={isPlaying}
        playingVersion={localPlayingVersion}
        onPlayingVersionChange={handlePlayingVersionChange}
        onPlayPause={togglePlayback}
        onSeek={seekTo}
        isFetchingPrevious={isFetchingPrevious}
      />
      <AudioDetails details={details} />
    </div>
  );
});
