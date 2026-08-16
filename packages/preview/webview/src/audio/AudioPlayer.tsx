import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';
import { formatMediaTime } from '@neko/media';
import { PauseIcon, PlayIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { useTranslation } from '../i18n/I18nContext';
import { CoverView } from './CoverView';
import { AudioControls } from './AudioControls';
import type { PreviewMediaViewerSnapshot } from '../root/viewer-snapshot';
import type { PreviewViewerPlayback } from '../root/viewer-kernel';
import { useProgrammaticMediaPlayback } from '../shared/useProgrammaticMediaPlayback';
import '../styles/player.css';

const LIGHTWEIGHT_WAVEFORM_BAR_HEIGHTS = [
  30, 48, 66, 42, 58, 74, 50, 36, 62, 82, 56, 40, 68, 52, 34, 78, 64, 46, 72, 54, 38, 60, 84, 52,
  44, 70, 58, 36, 76, 62, 48, 80, 56, 42, 68, 50, 74, 46, 64, 34,
] as const;

export interface AudioPlayerProps {
  readonly sourceUrl: string;
  readonly displayName?: string;
  readonly autoPlay?: boolean;
  readonly compact?: boolean;
  readonly ambient?: boolean;
  readonly controls?: boolean;
  readonly initialSnapshot?: PreviewMediaViewerSnapshot;
  readonly onSnapshotChange?: (snapshot: PreviewMediaViewerSnapshot) => void;
  readonly playback?: PreviewViewerPlayback;
}

export function AudioPlayer({
  sourceUrl,
  displayName,
  autoPlay = false,
  compact = false,
  ambient = false,
  controls = true,
  initialSnapshot,
  onSnapshotChange,
  playback,
}: AudioPlayerProps) {
  return (
    <SourceAudioPlayer
      sourceUrl={sourceUrl}
      displayName={displayName ?? ''}
      autoPlay={autoPlay}
      compact={compact}
      ambient={ambient}
      controls={controls}
      initialSnapshot={initialSnapshot}
      onSnapshotChange={onSnapshotChange}
      playback={playback}
    />
  );
}

function SourceAudioPlayer({
  sourceUrl,
  displayName,
  autoPlay,
  compact,
  ambient,
  controls,
  initialSnapshot,
  onSnapshotChange,
  playback,
}: Required<
  Pick<
    AudioPlayerProps,
    'sourceUrl' | 'displayName' | 'autoPlay' | 'compact' | 'ambient' | 'controls'
  >
> &
  Pick<AudioPlayerProps, 'initialSnapshot' | 'onSnapshotChange' | 'playback'>) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(initialSnapshot?.currentTime ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(initialSnapshot?.volume ?? 1);
  const [speed, setSpeed] = useState(initialSnapshot?.playbackRate ?? 1);
  const [error, setError] = useState<string>();
  const consumedRequestRef = useRef<string>();
  const programmaticPlayback = useProgrammaticMediaPlayback();
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotChangeRef.current = onSnapshotChange;

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = initialSnapshot?.playbackRate ?? 1;
      audio.volume = initialSnapshot?.volume ?? 1;
    }
    return () => {
      if (audio) {
        onSnapshotChangeRef.current?.({
          currentTime: audio.currentTime,
          playbackRate: audio.playbackRate,
          volume: audio.volume,
        });
        programmaticPlayback.pause(audio);
      }
    };
  }, [programmaticPlayback, sourceUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !autoPlay) return;
    setError(undefined);
    programmaticPlayback.play(audio, () => {
      setIsPlaying(false);
      setError(audio.error ? t('preview.audio.playbackFailed') : undefined);
    });
  }, [autoPlay, programmaticPlayback, sourceUrl, t]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playback) return;
    if (
      consumedRequestRef.current !== playback.requestId &&
      typeof playback.startTimeSeconds === 'number'
    ) {
      consumedRequestRef.current = playback.requestId;
      audio.currentTime = Math.max(0, playback.startTimeSeconds);
    }
    if (playback.state === 'playing') {
      setError(undefined);
      programmaticPlayback.play(audio, () => {
        setIsPlaying(false);
        setError(audio.error ? t('preview.audio.playbackFailed') : undefined);
      });
    } else {
      programmaticPlayback.pause(audio);
    }
  }, [playback?.requestId, playback?.startTimeSeconds, playback?.state, programmaticPlayback, t]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(undefined);
    if (audio.paused) {
      void audio.play().catch(() => {
        setIsPlaying(false);
        setError(audio.error ? t('preview.audio.playbackFailed') : undefined);
      });
    } else {
      audio.pause();
    }
  }, [t]);
  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(duration, time));
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );
  const changeVolume = useCallback((next: number) => {
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
  }, []);
  const changeSpeed = useCallback((next: number) => {
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, []);

  return (
    <div
      className={
        compact && !ambient
          ? 'neko-preview-lightweight-audio'
          : ambient
            ? 'neko-preview-ambient-audio'
            : 'neko-audio-bg flex flex-col items-center w-full h-full px-8 pt-6 pb-5 overflow-hidden'
      }
    >
      <audio
        ref={audioRef}
        className={compact ? 'neko-preview-lightweight-audio__element' : undefined}
        src={sourceUrl}
        aria-label={displayName}
        autoPlay={autoPlay}
        controls={false}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(
            Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
          );
          const restoredTime = initialSnapshot?.currentTime ?? 0;
          event.currentTarget.currentTime = Math.max(
            0,
            Math.min(event.currentTarget.duration || restoredTime, restoredTime),
          );
          setCurrentTime(event.currentTarget.currentTime);
          setError(undefined);
        }}
        onTimeUpdate={(event) => {
          const nextTime = event.currentTarget.currentTime;
          setCurrentTime(nextTime);
          onSnapshotChange?.({ currentTime: nextTime, playbackRate: speed, volume });
          playback?.onTimeUpdate?.(nextTime, duration);
        }}
        onPlay={() => {
          setIsPlaying(true);
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onEnded={(event) => {
          setIsPlaying(false);
          if (!ambient) {
            playback?.onEnded?.(event.currentTarget.currentTime, duration);
          }
        }}
        onError={() => {
          setIsPlaying(false);
          setError(t('preview.audio.playbackFailed'));
        }}
      />
      {compact && !ambient ? (
        <LightweightAudioControls
          interactive={controls}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          volume={volume}
          error={error}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onScrub={setCurrentTime}
          onToggleMute={() => changeVolume(volume > 0 ? 0 : 1)}
        />
      ) : !compact && !ambient ? (
        <div className="relative flex-1 flex items-center justify-center w-full min-h-[120px] py-2">
          <CoverView fileName={displayName} isPlaying={isPlaying} />
        </div>
      ) : null}
      {controls && !compact && !ambient ? (
        <div
          className={
            compact
              ? 'min-w-0 flex-1'
              : 'flex flex-col items-center gap-1 pt-3 pb-1 shrink-0 w-full max-w-[400px]'
          }
        >
          <div className="font-semibold text-[17px] text-neko-preview-text-primary whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center tracking-[-0.01em]">
            {displayName}
          </div>
          {error ? <div className="text-xs text-red-400">{error}</div> : null}
        </div>
      ) : null}
      {controls && !compact && !ambient ? (
        <div className="shrink-0 w-full">
          <AudioControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            speed={speed}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onScrub={setCurrentTime}
            onVolumeChange={changeVolume}
            onSpeedChange={changeSpeed}
          />
        </div>
      ) : null}
    </div>
  );
}

interface LightweightAudioControlsProps {
  readonly interactive: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly isPlaying: boolean;
  readonly volume: number;
  readonly error?: string;
  readonly onTogglePlay: () => void;
  readonly onSeek: (time: number) => void;
  readonly onScrub: (time: number) => void;
  readonly onToggleMute: () => void;
}

function LightweightAudioControls({
  interactive,
  currentTime,
  duration,
  isPlaying,
  volume,
  error,
  onTogglePlay,
  onSeek,
  onScrub,
  onToggleMute,
}: LightweightAudioControlsProps) {
  const { t } = useTranslation();
  const boundedDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const boundedTime = Math.max(0, Math.min(currentTime, boundedDuration));
  const progress = boundedDuration > 0 ? boundedTime / boundedDuration : 0;
  const commitRangeValue = (event: SyntheticEvent<HTMLInputElement>): void => {
    onSeek(Number(event.currentTarget.value));
  };
  const handleRangeKeyUp = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      commitRangeValue(event);
    }
  };
  const stopNodeDrag = (event: MouseEvent<HTMLElement>): void => event.stopPropagation();
  const playbackLabel = isPlaying ? t('preview.audio.pauseButton') : t('preview.audio.playButton');
  const muteLabel = volume > 0 ? t('preview.audio.mute') : t('preview.audio.unmute');

  return (
    <div className="neko-preview-lightweight-audio__player" onMouseDown={stopNodeDrag}>
      <div
        className="neko-preview-lightweight-audio__waveform"
        data-testid="preview-lightweight-audio-waveform"
      >
        <div className="neko-preview-lightweight-audio__bars" aria-hidden="true">
          {LIGHTWEIGHT_WAVEFORM_BAR_HEIGHTS.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="neko-preview-lightweight-audio__bar"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <span
          className="neko-preview-lightweight-audio__playhead"
          style={{ left: `${progress * 100}%` }}
          aria-hidden="true"
        />
        {interactive ? (
          <input
            className="neko-preview-lightweight-audio__seek"
            type="range"
            min={0}
            max={boundedDuration}
            step={0.1}
            value={boundedTime}
            disabled={boundedDuration <= 0}
            aria-label={t('preview.audio.seek')}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onScrub(Number(event.currentTarget.value))
            }
            onPointerUp={commitRangeValue}
            onKeyUp={handleRangeKeyUp}
          />
        ) : null}
        {error ? (
          <span className="neko-preview-lightweight-audio__error" role="alert">
            {error}
          </span>
        ) : null}
      </div>

      <div className="neko-preview-lightweight-audio__controls">
        <span className="neko-preview-lightweight-audio__time">
          {formatMediaTime(boundedTime)} /{' '}
          {boundedDuration > 0 ? formatMediaTime(boundedDuration) : '--:--'}
        </span>
        {interactive ? (
          <>
            <button
              type="button"
              data-testid="preview-lightweight-audio-toggle-playback"
              className="neko-preview-lightweight-audio__button is-primary"
              onClick={onTogglePlay}
              aria-label={playbackLabel}
              title={playbackLabel}
            >
              {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
            </button>
            <button
              type="button"
              className="neko-preview-lightweight-audio__button is-volume"
              onClick={onToggleMute}
              aria-label={muteLabel}
              title={muteLabel}
            >
              {volume > 0 ? <VolumeIcon size={14} /> : <VolumeOffIcon size={14} />}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
