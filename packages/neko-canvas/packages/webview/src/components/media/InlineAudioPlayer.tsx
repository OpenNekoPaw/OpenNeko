import { useRef, useState, useCallback, useEffect } from 'react';
import {
  EngineAvStreamLifecycle,
  formatTime,
  type EngineAvAudioStreamClient,
} from '@neko/neko-client';
import { ProgressBar } from '@neko/ui/creative';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { t } from '../../i18n';
import { getLogger } from '../../utils/logger';

const logger = getLogger('InlineAudioPlayer');

const DEFAULT_VOLUME = 0.8;
const WAVEFORM_BAR_HEIGHTS = [
  30, 48, 66, 42, 58, 74, 50, 36, 62, 82, 56, 40, 68, 52, 34, 78, 64, 46, 72, 54, 38, 60, 84, 52,
  44, 70, 58, 36, 76, 62, 48, 80, 56, 42, 68, 50, 74, 46, 64, 34,
] as const;

export type AudioPlayerLayout = 'transport' | 'node-card';

export interface InlineAudioPlayerProps {
  audioStreamUrl: string;
  duration: number;
  audioLayout?: AudioPlayerLayout;
  startTime?: number;
  onPause: (currentTime: number) => void;
  onResume: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onStop: (currentTime: number) => void;
  playbackState?: 'playing' | 'paused';
  playbackRequestId?: string;
  playbackStartTime?: number;
  onEnded?: (currentTime: number) => void;
}

export function InlineAudioPlayer({
  audioStreamUrl,
  duration,
  audioLayout = 'transport',
  startTime = 0,
  onPause,
  onResume,
  onSeek,
  onTimeUpdate,
  onStop,
  playbackState,
  playbackRequestId,
  playbackStartTime,
  onEnded,
}: InlineAudioPlayerProps) {
  const audioClientRef = useRef<EngineAvAudioStreamClient | null>(null);
  const lifecycleRef = useRef<EngineAvStreamLifecycle | null>(null);
  const animFrameRef = useRef<number>(0);
  const playStartTimeRef = useRef(startTime);
  const playWallTimeRef = useRef(0);
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');
  const currentTimeRef = useRef(startTime);
  const handledPlaybackRequestRef = useRef<string | undefined>();
  const handledPlaybackStateRef = useRef<'playing' | 'paused' | undefined>();
  const completedRef = useRef(false);
  const completePlaybackRef = useRef<(() => void) | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [volume] = useState(DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useState(false);

  if (!lifecycleRef.current) {
    lifecycleRef.current = new EngineAvStreamLifecycle({
      callbacks: {
        onClientsChanged: ({ audioClient }) => {
          audioClientRef.current = audioClient;
        },
        onStreamEnd: () => {
          completePlaybackRef.current?.();
        },
      },
    });
  }

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // =========================================================================
  // Playback loop
  // =========================================================================

  const completePlayback = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const endedAt = duration;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setIsPlaying(false);
    setCurrentTime(endedAt);
    currentTimeRef.current = endedAt;
    onStop(endedAt);
    onEnded?.(endedAt);
  }, [duration, onEnded, onStop]);
  completePlaybackRef.current = completePlayback;

  const updatePlaybackTime = useCallback(() => {
    if (completedRef.current) return;

    const audioClient = audioClientRef.current;

    let newTime: number;
    if (audioClient?.isClockReady) {
      if (clockSourceRef.current === 'wall') {
        clockSourceRef.current = 'audio';
      }
      newTime = audioClient.getCurrentTime();
    } else {
      const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
      newTime = playStartTimeRef.current + elapsed;
    }

    if (newTime >= duration) {
      completePlayback();
      return;
    }

    setCurrentTime(newTime);
    onTimeUpdate?.(newTime);
    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [completePlayback, duration, onTimeUpdate]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, updatePlaybackTime]);

  // =========================================================================
  // Connect stream on mount
  // =========================================================================

  useEffect(() => {
    void lifecycleRef.current
      ?.start({
        audio: {
          websocketUrl: audioStreamUrl,
          volume: DEFAULT_VOLUME,
          onError: (err) => logger.warn(`Audio error: ${err}`),
        },
      })
      .catch((err) => logger.warn(`Inline audio lifecycle error: ${err}`));

    setIsPlaying(true);
    setCurrentTime(startTime);
    playStartTimeRef.current = startTime;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';
    completedRef.current = false;

    return () => {
      audioClientRef.current?.setVolume(0);
      lifecycleRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startTime is only used for initial value; including it would restart the stream on pause
  }, [audioStreamUrl]);

  // =========================================================================
  // Controls
  // =========================================================================

  const handleTogglePlay = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) {
        setIsPlaying(false);
        audioClientRef.current?.pause();
        onPause(currentTimeRef.current);
      } else {
        completedRef.current = false;
        setIsPlaying(true);
        audioClientRef.current?.resume();
        playStartTimeRef.current = currentTimeRef.current;
        playWallTimeRef.current = performance.now();
        clockSourceRef.current = 'wall';
        onResume();
      }
    },
    [isPlaying, onPause, onResume],
  );

  const handleSeekCommit = useCallback(
    (time: number) => {
      completedRef.current = false;
      setCurrentTime(time);
      currentTimeRef.current = time;
      onTimeUpdate?.(time);
      playStartTimeRef.current = time;
      playWallTimeRef.current = performance.now();
      clockSourceRef.current = 'wall';
      audioClientRef.current?.resetClock();
      onSeek(time);
    },
    [onSeek, onTimeUpdate],
  );

  const applyControlledPlaybackState = useCallback(
    (nextState: 'playing' | 'paused') => {
      if (nextState === 'paused') {
        if (!isPlaying) return;
        setIsPlaying(false);
        audioClientRef.current?.pause();
        onPause(currentTimeRef.current);
        return;
      }
      if (isPlaying) return;
      completedRef.current = false;
      setIsPlaying(true);
      audioClientRef.current?.resume();
      playStartTimeRef.current = currentTimeRef.current;
      playWallTimeRef.current = performance.now();
      clockSourceRef.current = 'wall';
      onResume();
    },
    [isPlaying, onPause, onResume],
  );

  useEffect(() => {
    const requestChanged =
      playbackRequestId !== undefined && handledPlaybackRequestRef.current !== playbackRequestId;
    const stateChanged =
      playbackState !== undefined && handledPlaybackStateRef.current !== playbackState;
    if (!requestChanged && !stateChanged) return;

    if (requestChanged) {
      handledPlaybackRequestRef.current = playbackRequestId;
    }
    if (requestChanged && playbackStartTime !== undefined) {
      handleSeekCommit(playbackStartTime);
    }
    const nextState = playbackState ?? (requestChanged ? 'playing' : undefined);
    if (!nextState) return;
    handledPlaybackStateRef.current = nextState;
    applyControlledPlaybackState(nextState);
  }, [
    applyControlledPlaybackState,
    handleSeekCommit,
    playbackRequestId,
    playbackStartTime,
    playbackState,
  ]);

  const handleSeeking = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleToggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      audioClientRef.current?.setVolume(newMuted ? 0 : volume);
    },
    [isMuted, volume],
  );

  // =========================================================================
  // Render
  // =========================================================================

  const playbackLabel = isPlaying ? t('toolbar.playbackPause') : t('toolbar.playbackPlay');
  const muteLabel = isMuted ? t('media.unmute') : t('media.mute');

  return (
    <AudioPlayerSurface
      layout={audioLayout}
      currentTime={currentTime}
      duration={duration}
      isPlaying={isPlaying}
      isMuted={isMuted}
      onTogglePlay={handleTogglePlay}
      onSeekCommit={handleSeekCommit}
      onSeeking={handleSeeking}
      onToggleMute={handleToggleMute}
      playbackLabel={playbackLabel}
      muteLabel={muteLabel}
    />
  );
}

interface AudioPlayerSurfaceProps {
  readonly layout?: AudioPlayerLayout;
  readonly currentTime: number;
  readonly duration: number;
  readonly isPlaying: boolean;
  readonly isMuted?: boolean;
  readonly disabled?: boolean;
  readonly onTogglePlay: (event?: React.MouseEvent) => void;
  readonly onSeekCommit?: (time: number) => void;
  readonly onSeeking?: (time: number) => void;
  readonly onToggleMute?: (event: React.MouseEvent) => void;
  readonly playbackLabel: string;
  readonly muteLabel?: string;
}

export function AudioPlayerSurface({
  layout = 'transport',
  currentTime,
  duration,
  isPlaying,
  isMuted = false,
  disabled = false,
  onTogglePlay,
  onSeekCommit,
  onSeeking,
  onToggleMute,
  playbackLabel,
  muteLabel = t('media.mute'),
}: AudioPlayerSurfaceProps) {
  if (layout === 'node-card') {
    return (
      <CanvasAudioNodePlayer
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        isMuted={isMuted}
        disabled={disabled}
        onTogglePlay={onTogglePlay}
        onSeekCommit={onSeekCommit}
        onSeeking={onSeeking}
        onToggleMute={onToggleMute}
        playbackLabel={playbackLabel}
        muteLabel={muteLabel}
      />
    );
  }

  const isIdle = !onSeekCommit;
  return (
    <div className="canvas-audio-transport-shell" onMouseDown={(event) => event.stopPropagation()}>
      <div
        className="canvas-audio-transport"
        data-testid="canvas-audio-transport"
        data-state={isIdle ? 'idle' : 'ready'}
      >
        <AudioPlaybackButton
          isPlaying={isPlaying}
          label={playbackLabel}
          onClick={onTogglePlay}
          disabled={disabled}
        />

        {!isIdle ? (
          <>
            <span className="canvas-audio-transport-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="canvas-audio-transport-seek">
              <ProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeekCommit={onSeekCommit}
                onSeeking={onSeeking}
                formatTooltip={formatTime}
              />
            </div>

            <AudioMuteButton isMuted={isMuted} label={muteLabel} onClick={onToggleMute} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function CanvasAudioNodePlayer({
  currentTime,
  duration,
  isPlaying,
  isMuted,
  disabled,
  onTogglePlay,
  onSeekCommit,
  onSeeking,
  onToggleMute,
  playbackLabel,
  muteLabel,
}: Required<
  Pick<
    AudioPlayerSurfaceProps,
    | 'currentTime'
    | 'duration'
    | 'isPlaying'
    | 'isMuted'
    | 'disabled'
    | 'onTogglePlay'
    | 'playbackLabel'
    | 'muteLabel'
  >
> &
  Pick<AudioPlayerSurfaceProps, 'onSeekCommit' | 'onSeeking' | 'onToggleMute'>) {
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const handleRangeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSeeking?.(Number(event.currentTarget.value));
  };
  const commitRangeValue = (event: React.SyntheticEvent<HTMLInputElement>) => {
    onSeekCommit?.(Number(event.currentTarget.value));
  };
  const handleRangeKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      commitRangeValue(event);
    }
  };

  return (
    <div className="canvas-audio-node-player" onMouseDown={(event) => event.stopPropagation()}>
      <div className="canvas-audio-node-waveform" data-testid="canvas-audio-waveform">
        <div className="canvas-audio-node-waveform-bars" aria-hidden="true">
          {WAVEFORM_BAR_HEIGHTS.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="canvas-audio-node-waveform-bar"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <span
          className="canvas-audio-node-playhead"
          style={{ left: `${progress * 100}%` }}
          aria-hidden="true"
        />
        <input
          className="canvas-audio-node-waveform-seek"
          type="range"
          min={0}
          max={Math.max(duration, 0)}
          step={0.1}
          value={Math.min(currentTime, Math.max(duration, 0))}
          disabled={!onSeekCommit || duration <= 0}
          aria-label={t('media.seek')}
          onChange={handleRangeChange}
          onPointerUp={commitRangeValue}
          onKeyUp={handleRangeKeyUp}
        />
      </div>

      <div className="canvas-audio-node-controls" data-testid="canvas-audio-node-controls">
        <span className="canvas-audio-node-time">
          {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '--:--'}
        </span>
        <div className="canvas-audio-node-playback">
          <AudioPlaybackButton
            isPlaying={isPlaying}
            label={playbackLabel}
            onClick={onTogglePlay}
            disabled={disabled}
          />
        </div>
        <div className="canvas-audio-node-volume">
          <AudioMuteButton isMuted={isMuted} label={muteLabel} onClick={onToggleMute} />
        </div>
      </div>
    </div>
  );
}

function AudioPlaybackButton({
  isPlaying,
  label,
  onClick,
  disabled = false,
}: {
  readonly isPlaying: boolean;
  readonly label: string;
  readonly onClick: (event?: React.MouseEvent) => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="canvas-audio-transport-button"
      data-variant="primary"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
    </button>
  );
}

function AudioMuteButton({
  isMuted,
  label,
  onClick,
}: {
  readonly isMuted: boolean;
  readonly label: string;
  readonly onClick?: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className="canvas-audio-transport-button"
      data-variant="secondary"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
    >
      {isMuted ? <VolumeOffIcon size={14} /> : <VolumeIcon size={14} />}
    </button>
  );
}
