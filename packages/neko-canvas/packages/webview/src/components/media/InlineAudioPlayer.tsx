import { useRef, useState, useCallback, useEffect } from 'react';
import { formatMediaTime as formatTime, type PcmStreamDescriptor } from '@neko/media';
import { PcmAudioClient } from '@neko/media/browser';
import { ProgressBar } from '@neko/ui/creative';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { t } from '../../i18n';
import { getLogger } from '../../utils/logger';

const logger = getLogger('InlineAudioPlayer');

const DEFAULT_VOLUME = 0.8;
const PLAYBACK_SEEK_EPSILON_SECONDS = 0.001;
const WAVEFORM_BAR_HEIGHTS = [
  30, 48, 66, 42, 58, 74, 50, 36, 62, 82, 56, 40, 68, 52, 34, 78, 64, 46, 72, 54, 38, 60, 84, 52,
  44, 70, 58, 36, 76, 62, 48, 80, 56, 42, 68, 50, 74, 46, 64, 34,
] as const;

export type AudioPlayerLayout = 'transport' | 'node-card';

export interface InlineAudioPlayerProps {
  audio: PcmStreamDescriptor;
  audioContext?: AudioContext;
  duration: number;
  audioLayout?: AudioPlayerLayout;
  startTime?: number;
  playbackRate?: number;
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
  audio,
  audioContext,
  duration,
  audioLayout = 'transport',
  startTime = 0,
  playbackRate = 1,
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
  const clientRef = useRef<PcmAudioClient>();
  const ownedContextRef = useRef<AudioContext>();
  const currentTimeRef = useRef(startTime);
  const startingRef = useRef(false);
  const handledPlaybackRequestRef = useRef<string | undefined>();
  const handledPlaybackStateRef = useRef<'playing' | 'paused' | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);

  const activateContext = useCallback((): AudioContext => {
    if (audioContext && audioContext.state !== 'closed') {
      if (audioContext.state === 'suspended') void audioContext.resume();
      return audioContext;
    }
    let context = ownedContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContext({ sampleRate: audio.sampleRate });
      ownedContextRef.current = context;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }, [audio.sampleRate, audioContext]);

  useEffect(() => {
    currentTimeRef.current = startTime;
    setCurrentTime(startTime);
    startingRef.current = false;
    clientRef.current?.dispose();
    clientRef.current = undefined;
    return () => {
      startingRef.current = false;
      clientRef.current?.dispose();
      clientRef.current = undefined;
    };
  }, [audio, playbackRate, startTime]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = (): void => {
      const nextTime = clientRef.current?.isClockReady
        ? clientRef.current.getCurrentTime()
        : currentTimeRef.current;
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      onTimeUpdate?.(nextTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, onTimeUpdate]);

  useEffect(() => {
    return () => {
      const context = ownedContextRef.current;
      if (context && context.state !== 'closed') void context.close();
    };
  }, []);

  const pause = useCallback(() => {
    void clientRef.current?.pause();
    setIsPlaying(false);
    onPause(currentTimeRef.current);
  }, [onPause]);

  const resume = useCallback(() => {
    const context = activateContext();
    const existingClient = clientRef.current;
    if (existingClient?.isClockReady) {
      void existingClient.resume().then(() => {
        setIsPlaying(true);
        onResume();
      });
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    currentTimeRef.current = startTime;
    setCurrentTime(startTime);
    const client = new PcmAudioClient({
      descriptor: audio,
      playbackRate,
      volume: DEFAULT_VOLUME,
      onError: (error) => logger.warn(`Canvas PCM error: ${error.message}`),
      onPlaybackEnd: () => {
        startingRef.current = false;
        if (clientRef.current === client) {
          client.dispose();
          clientRef.current = undefined;
        }
        currentTimeRef.current = duration;
        setCurrentTime(duration);
        setIsPlaying(false);
        onStop(duration);
        onEnded?.(duration);
      },
    });
    clientRef.current = client;
    void client
      .prepare(context)
      .then(() => client.startAt(context.currentTime + 0.1))
      .then(() => {
        startingRef.current = false;
        if (clientRef.current !== client) return;
        setIsPlaying(true);
        onResume();
      })
      .catch((error: unknown) => {
        startingRef.current = false;
        if (clientRef.current === client) {
          client.dispose();
          clientRef.current = undefined;
        }
        logger.warn(`Inline audio playback failed: ${String(error)}`);
      });
  }, [activateContext, audio, duration, onEnded, onResume, onStop, playbackRate, startTime]);

  const handleTogglePlay = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      if (isPlaying) pause();
      else resume();
    },
    [isPlaying, pause, resume],
  );

  const handleSeekCommit = useCallback(
    (time: number) => {
      setCurrentTime(time);
      currentTimeRef.current = time;
      onTimeUpdate?.(time);
      onSeek(time);
    },
    [onSeek, onTimeUpdate],
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
    if (
      requestChanged &&
      playbackStartTime !== undefined &&
      Math.abs(currentTimeRef.current - playbackStartTime) > PLAYBACK_SEEK_EPSILON_SECONDS
    ) {
      handleSeekCommit(playbackStartTime);
    }
    const nextState = playbackState ?? (requestChanged ? 'playing' : undefined);
    if (!nextState) return;
    handledPlaybackStateRef.current = nextState;
    if (nextState === 'paused' && isPlaying) pause();
    if (nextState === 'playing' && !isPlaying) resume();
  }, [
    handleSeekCommit,
    isPlaying,
    pause,
    playbackRequestId,
    playbackStartTime,
    playbackState,
    resume,
  ]);

  const handleSeeking = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleToggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      clientRef.current?.setVolume(newMuted ? 0 : DEFAULT_VOLUME);
    },
    [isMuted],
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
  readonly showPlaybackButton?: boolean;
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
  showPlaybackButton = true,
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

  const showTimeline = Boolean(onSeekCommit) || duration > 0;
  return (
    <div className="canvas-audio-transport-shell" onMouseDown={(event) => event.stopPropagation()}>
      <div
        className="canvas-audio-transport"
        data-testid="canvas-audio-transport"
        data-state={showTimeline ? 'ready' : 'idle'}
      >
        {showPlaybackButton ? (
          <AudioPlaybackButton
            isPlaying={isPlaying}
            label={playbackLabel}
            onClick={onTogglePlay}
            disabled={disabled}
          />
        ) : null}

        {showTimeline ? (
          <>
            <span className="canvas-audio-transport-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="canvas-audio-transport-seek">
              {onSeekCommit ? (
                <ProgressBar
                  currentTime={currentTime}
                  duration={duration}
                  onSeekCommit={onSeekCommit}
                  onSeeking={onSeeking}
                  formatTooltip={formatTime}
                />
              ) : (
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--control-border)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={Math.min(currentTime, duration)}
                >
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{
                      width: `${duration > 0 ? Math.min(1, currentTime / duration) * 100 : 0}%`,
                    }}
                  />
                </div>
              )}
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
