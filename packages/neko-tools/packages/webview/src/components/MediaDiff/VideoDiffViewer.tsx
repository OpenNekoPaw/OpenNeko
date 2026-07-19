/**
 * VideoDiffViewer Component
 *
 * Real-time H264 dual-stream video diff viewer.
 * Uses StreamingVideoDiffViewer for WebGL-accelerated diff rendering
 * via WebSocket H264 streams from neko-engine.
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { formatMediaTimeCentiseconds } from '@neko/neko-client';
import { PlayIcon, PauseIcon } from '@neko/ui/icons';
import { Button, Slider } from '@neko/ui/primitives';
import { useTranslation } from '../../i18n/I18nContext';
import { useMediaDiffRuntime } from '../../runtime/MediaDiffRuntimeContext';
import { getLogger } from '../../utils/logger';

const logger = getLogger('VideoDiffViewer');
import type { VideoDiffViewerProps } from './types';
import {
  StreamingVideoDiffViewer,
  type StreamingVideoDiffViewerHandle,
} from './streaming/StreamingVideoDiffViewer';
import type { DiffMode } from './streaming/DiffRenderer';

// =============================================================================
// Keyframe Diff Downsampling
// =============================================================================

interface KeyframeDiff {
  time: number;
  similarity: number;
}

/**
 * Downsample keyframe diffs to a maximum count for rendering performance.
 * Merges adjacent keyframes by averaging their similarity scores.
 */
function downsampleKeyframeDiffs(
  keyframeDiffs: KeyframeDiff[],
  maxCount: number = 500,
): KeyframeDiff[] {
  if (keyframeDiffs.length <= maxCount) {
    return keyframeDiffs;
  }

  const bucketSize = Math.ceil(keyframeDiffs.length / maxCount);
  const downsampled: KeyframeDiff[] = [];

  for (let i = 0; i < keyframeDiffs.length; i += bucketSize) {
    const bucket = keyframeDiffs.slice(i, i + bucketSize);
    const avgSimilarity = bucket.reduce((sum, kf) => sum + kf.similarity, 0) / bucket.length;
    const midTime = bucket[Math.floor(bucket.length / 2)]?.time ?? bucket[0]?.time ?? 0;

    downsampled.push({
      time: midTime,
      similarity: avgSimilarity,
    });
  }

  return downsampled;
}

// =============================================================================
// Timeline Seek Controls
// =============================================================================

interface SeekControlsProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  diffRegions?: Array<{ start: number; end: number }>;
  /** Disable Play while git show is extracting the previous version */
  isFetchingPrevious?: boolean;
}

const SeekControls = memo(function SeekControls({
  currentTime,
  duration,
  onSeek,
  isPlaying,
  onPlayPause,
  diffRegions,
  isFetchingPrevious,
}: SeekControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4 border-t border-[var(--tools-divider)] bg-[var(--tools-bg)] p-3">
      {/* Play/Pause button — disabled while previous version is being fetched */}
      <Button
        variant="secondary"
        size="md"
        className={`h-8 w-8 rounded-full p-0 ${isFetchingPrevious ? 'opacity-40' : ''}`}
        onClick={isFetchingPrevious ? undefined : onPlayPause}
        disabled={isFetchingPrevious}
        title={
          isFetchingPrevious ? t('mediaDiff.video.fetchingPrevious') : isPlaying ? 'Pause' : 'Play'
        }
      >
        {isPlaying ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
      </Button>
      <span className="min-w-[100px] font-mono text-xs text-[var(--tools-fg)]">
        {formatMediaTimeCentiseconds(currentTime)} / {formatMediaTimeCentiseconds(duration)}
      </span>
      <div className="flex-1 relative">
        {/* Diff region overlay on the timeline */}
        {diffRegions && duration > 0 && (
          <div className="absolute inset-0 flex items-center pointer-events-none">
            {diffRegions.map((region, i) => {
              const left = (region.start / duration) * 100;
              const width = ((region.end - region.start) / duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute h-3 rounded-sm bg-red-500/30 border border-red-500/50"
                  style={{ left: `${left}%`, width: `${Math.max(0.5, width)}%` }}
                />
              );
            })}
          </div>
        )}
        <Slider
          className="relative z-10"
          label={t('mediaDiff.video.seek')}
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

// =============================================================================
// Video Details Panel
// =============================================================================

interface VideoDetailsProps {
  details?: {
    duration: { current: number; previous: number };
    resolution: {
      current: { width: number; height: number };
      previous: { width: number; height: number };
    };
    fps: { current: number; previous: number };
    codec?: { current: string; previous: string };
    keyframeDiffs?: Array<{ time: number; similarity: number }>;
  };
}

export const VideoDetails = memo(function VideoDetails({ details }: VideoDetailsProps) {
  const { t } = useTranslation();
  const displayKeyframeDiffs = useMemo(
    () => downsampleKeyframeDiffs(details?.keyframeDiffs ?? [], 500),
    [details?.keyframeDiffs],
  );

  if (!details || !details.duration) return null;

  return (
    <div className="border-t border-[var(--tools-divider)] bg-[var(--tools-panel)] p-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="mb-1 text-[var(--tools-fg-secondary)]">
            {t('mediaDiff.video.duration')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {formatMediaTimeCentiseconds(details.duration.previous)}
            </span>
            <span>&rarr;</span>
            <span className="text-green-400">
              {formatMediaTimeCentiseconds(details.duration.current)}
            </span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[var(--tools-fg-secondary)]">
            {t('mediaDiff.video.resolution')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {details.resolution.previous.width}&times;{details.resolution.previous.height}
            </span>
            <span>&rarr;</span>
            <span className="text-green-400">
              {details.resolution.current.width}&times;{details.resolution.current.height}
            </span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[var(--tools-fg-secondary)]">
            {t('mediaDiff.video.frameRate')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{details.fps.previous.toFixed(2)} fps</span>
            <span>&rarr;</span>
            <span className="text-green-400">{details.fps.current.toFixed(2)} fps</span>
          </div>
        </div>
        {details.codec && (
          <div>
            <div className="mb-1 text-[var(--tools-fg-secondary)]">
              {t('mediaDiff.video.codec')}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">{details.codec.previous}</span>
              <span>&rarr;</span>
              <span className="text-green-400">{details.codec.current}</span>
            </div>
          </div>
        )}
      </div>
      {displayKeyframeDiffs.length > 0 && (
        <div className="mt-3 border-t border-[var(--tools-divider)] pt-3">
          <div className="mb-2 text-xs text-[var(--tools-fg-secondary)]">
            {t('mediaDiff.video.keyframeSimilarities')}
            {details.keyframeDiffs && details.keyframeDiffs.length > 500 && (
              <span className="ml-2 text-[10px] opacity-60">
                (showing {displayKeyframeDiffs.length} of {details.keyframeDiffs.length})
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {displayKeyframeDiffs.map((kf, i) => {
              const percentage = Math.round(kf.similarity * 100);
              let bgColor = 'bg-red-500';
              if (percentage >= 90) bgColor = 'bg-green-500';
              else if (percentage >= 70) bgColor = 'bg-yellow-500';
              else if (percentage >= 50) bgColor = 'bg-orange-500';

              return (
                <div
                  key={i}
                  className={`flex-1 h-6 ${bgColor} rounded flex items-center justify-center text-white text-[10px] font-medium`}
                  title={`${formatMediaTimeCentiseconds(kf.time)}: ${percentage}%`}
                >
                  {percentage}%
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Main VideoDiffViewer Component
// =============================================================================

export const VideoDiffViewer = memo(function VideoDiffViewer({
  viewMode,
  details,
  currentFrameSrc,
  previousFrameSrc,
  currentTime = 0,
  onTimeChange,
  sliderPosition = 0.5,
  onSliderChange,
  streamConfig,
  onStreamControl,
  isFetchingPrevious,
  isLoading,
  error,
}: VideoDiffViewerProps) {
  const { t } = useTranslation();
  const { audioContextFactory } = useMediaDiffRuntime();
  const [localTime, setLocalTime] = useState(currentTime);
  const [localSliderPosition, setLocalSliderPosition] = useState(sliderPosition);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamingRef = useRef<StreamingVideoDiffViewerHandle>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Track time from streaming frame PTS
  const handleTimeUpdate = useCallback((time: number) => {
    setLocalTime(time);
  }, []);

  const duration =
    streamConfig?.duration ??
    Math.max(details?.duration?.current ?? 0, details?.duration?.previous ?? 0);

  // Map DiffViewMode to streaming DiffMode
  const diffMode: DiffMode =
    viewMode === 'side-by-side'
      ? 'side-by-side'
      : viewMode === 'overlay'
        ? 'heatmap'
        : viewMode === 'onion-skin'
          ? 'flicker'
          : viewMode === 'slider'
            ? 'curtain'
            : 'side-by-side';

  const handleSeek = useCallback(
    (time: number) => {
      setLocalTime(time);
      onTimeChange?.(time);
      // Local reset: arm seek filter, flush buffer, reset decoders
      streamingRef.current?.seek(time);
      // Remote: tell extension to seek both engine streams
      onStreamControl?.('seek', { time });
    },
    [onTimeChange, onStreamControl],
  );

  const handleSliderChange = useCallback(
    (position: number) => {
      setLocalSliderPosition(position);
      onSliderChange?.(position);
    },
    [onSliderChange],
  );

  const handlePlayPause = useCallback(() => {
    // Pre-create AudioContext during user gesture to satisfy autoplay policy
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = audioContextFactory.create({ sampleRate: 48000 });
    }
    // Resume AudioContext if it was suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextFactory.resume(audioContextRef.current).catch(() => {});
    }
    setIsPlaying((prev) => {
      const next = !prev;
      onStreamControl?.(next ? 'play' : 'pause');
      if (next) {
        // Resuming: unmute audio
        streamingRef.current?.resumeAudio();
      } else {
        // Pausing: mute audio + extract frames at current time for static display
        streamingRef.current?.pauseAudio();
        if (streamConfig) {
          onTimeChange?.(localTime);
        }
      }
      return next;
    });
  }, [audioContextFactory, onStreamControl, onTimeChange, localTime, streamConfig]);

  useEffect(() => {
    return () => {
      const audioContext = audioContextRef.current;
      if (audioContext) {
        void audioContextFactory.close(audioContext).catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [audioContextFactory]);

  // Handle stream end (one video finished) — do NOT auto-pause,
  // the longer video continues rendering via renderSingle
  const handleStreamEnd = useCallback(() => {
    logger.debug('One stream ended, other continues');
  }, []);

  // ── Dual-mode: render static frames through DiffRenderer when paused ────
  // When paused and streamConfig exists, the StreamingVideoDiffViewer stays
  // mounted (pipeline alive for quick resume). We render extracted JPEG frames
  // through the same DiffRenderer for higher-quality pixel-precise display.
  useEffect(() => {
    if (!isPlaying && streamConfig && currentFrameSrc && previousFrameSrc) {
      void streamingRef.current?.renderStaticPair(currentFrameSrc, previousFrameSrc);
    }
  }, [isPlaying, streamConfig, currentFrameSrc, previousFrameSrc]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--tools-danger)]">
        <div className="text-center">
          <div className="text-2xl mb-2">{'\u26A0\uFE0F'}</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="tools-spinner mx-auto mb-2 h-8 w-8 animate-spin" />
          <div className="text-sm text-[var(--tools-fg-secondary)]">
            {t('mediaDiff.video.analyzing')}
          </div>
        </div>
      </div>
    );
  }

  // Before first play: show Play overlay + controls (no streamConfig yet —
  // streams are created lazily on first Play click, neko-preview pattern)
  if (!streamConfig) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex flex-1 items-center justify-center bg-[var(--tools-bg)]">
          {isFetchingPrevious ? (
            // git show in progress — previous version not yet available
            <div className="text-center">
              <div className="tools-spinner mx-auto mb-2 h-8 w-8 animate-spin" />
              <div className="text-sm text-[var(--tools-fg-secondary)]">
                {t('mediaDiff.video.fetchingPrevious')}
              </div>
            </div>
          ) : isPlaying ? (
            // Streams being created after Play click
            <div className="text-center">
              <div className="tools-spinner mx-auto mb-2 h-8 w-8 animate-spin" />
              <div className="text-sm text-[var(--tools-fg-secondary)]">
                {t('mediaDiff.video.startingStreams')}
              </div>
            </div>
          ) : (
            <Button
              variant="default"
              size="md"
              className="h-16 w-16 rounded-full p-0"
              onClick={handlePlayPause}
              title={t('mediaDiff.video.playTitle')}
            >
              <PlayIcon size={28} />
            </Button>
          )}
        </div>
        <SeekControls
          currentTime={localTime}
          duration={duration}
          onSeek={handleSeek}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          diffRegions={details?.diffRegions}
          isFetchingPrevious={isFetchingPrevious}
        />
        <VideoDetails details={details} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <StreamingVideoDiffViewer
        ref={streamingRef}
        streamConfig={streamConfig}
        diffMode={diffMode}
        sliderPosition={localSliderPosition}
        onSliderChange={handleSliderChange}
        onStreamControl={onStreamControl}
        onTimeUpdate={handleTimeUpdate}
        onError={setStreamError}
        audioContext={audioContextRef.current ?? undefined}
        onStreamEnd={handleStreamEnd}
      />
      {streamError && (
        <div className="border-t border-[color-mix(in_srgb,var(--tools-danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--tools-danger)_12%,transparent)] px-3 py-2 text-xs text-[var(--tools-danger)]">
          Stream error: {streamError}
        </div>
      )}
      <SeekControls
        currentTime={localTime}
        duration={duration}
        onSeek={handleSeek}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        diffRegions={details?.diffRegions}
        isFetchingPrevious={isFetchingPrevious}
      />
      <VideoDetails details={details} />
    </div>
  );
});
