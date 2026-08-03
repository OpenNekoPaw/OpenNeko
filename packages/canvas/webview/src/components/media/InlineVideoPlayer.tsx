import { useRef, useState, useCallback, useEffect } from 'react';
import type { HtmlVideoDescriptor } from '@neko/media';
import { formatMediaTime } from '@neko/media';
import { ProgressBar } from '@neko/ui/creative';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { t } from '../../i18n';
import { getLogger } from '../../utils/logger';
import type { PreviewPlaybackInteractionHandler } from '../../preview/types';

const logger = getLogger('InlineVideoPlayer');
const DEFAULT_VOLUME = 0.8;
const PLAYBACK_SEEK_EPSILON_SECONDS = 0.001;

export interface InlineVideoPlayerProps {
  video: HtmlVideoDescriptor | null;
  hasAudio: boolean;
  width: number;
  height: number;
  fps: number;
  duration: number;
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
  onPlaybackInteraction?: PreviewPlaybackInteractionHandler;
}

export function InlineVideoPlayer({
  video,
  hasAudio,
  duration,
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
  onPlaybackInteraction,
}: InlineVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef(0);
  const currentTimeRef = useRef(startTime);
  const handledPlaybackRequestRef = useRef<string>();
  const handledPlaybackStateRef = useRef<'playing' | 'paused'>();
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);

  const disposeStreams = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = false;
    const element = videoRef.current;
    if (element) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
  }, []);

  useEffect(() => {
    return () => {
      handledPlaybackRequestRef.current = undefined;
      handledPlaybackStateRef.current = undefined;
      disposeStreams();
    };
  }, [disposeStreams, playbackRate, video]);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = (): void => {
      const element = videoRef.current;
      const nextTime = element?.currentTime ?? currentTimeRef.current;
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      onTimeUpdate?.(nextTime);
      if (nextTime >= duration) {
        setIsPlaying(false);
        disposeStreams();
        onStop(duration);
        onEnded?.(duration);
        return;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [disposeStreams, duration, isPlaying, onEnded, onStop, onTimeUpdate]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
    onPause(currentTimeRef.current);
  }, [onPause]);

  const resume = useCallback(() => {
    const element = videoRef.current;
    if (!element || !video) return;
    if (element.src === video.url && element.readyState >= HTMLMediaElement.HAVE_METADATA) {
      void element.play().then(() => {
        setIsPlaying(true);
        onResume();
      });
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const start = async (): Promise<void> => {
      if (generation !== generationRef.current) return;
      element.crossOrigin = 'anonymous';
      element.muted = isMuted;
      element.defaultMuted = false;
      element.volume = DEFAULT_VOLUME;
      element.playsInline = true;
      element.playbackRate = playbackRate;
      element.src = video.url;
      element.load();
      await waitForVideoMetadata(element);
      element.currentTime = startTime;
      currentTimeRef.current = startTime;
      await element.play();
      if (generation !== generationRef.current) return;
      startingRef.current = false;
      setIsPlaying(true);
      onResume();
    };
    void start().catch((error: unknown) => {
      if (generation !== generationRef.current) return;
      disposeStreams();
      setIsPlaying(false);
      logger.error(`Inline video playback failed: ${error}`);
    });
  }, [disposeStreams, isMuted, onResume, playbackRate, startTime, video]);

  useEffect(() => {
    const requestChanged =
      playbackRequestId !== undefined && handledPlaybackRequestRef.current !== playbackRequestId;
    const stateChanged =
      playbackState !== undefined && handledPlaybackStateRef.current !== playbackState;
    if (!requestChanged && !stateChanged) return;
    if (requestChanged) handledPlaybackRequestRef.current = playbackRequestId;
    if (
      requestChanged &&
      playbackStartTime !== undefined &&
      Math.abs(currentTimeRef.current - playbackStartTime) > PLAYBACK_SEEK_EPSILON_SECONDS
    ) {
      onSeek(playbackStartTime);
    }
    const nextState = playbackState ?? (requestChanged ? 'playing' : undefined);
    if (!nextState) return;
    handledPlaybackStateRef.current = nextState;
    if (nextState === 'paused' && isPlaying) pause();
    if (nextState === 'playing' && !isPlaying) resume();
  }, [isPlaying, onSeek, pause, playbackRequestId, playbackStartTime, playbackState, resume]);

  const handleSeek = useCallback(
    (time: number) => {
      currentTimeRef.current = time;
      setCurrentTime(time);
      onTimeUpdate?.(time);
      onSeek(time);
    },
    [onSeek, onTimeUpdate],
  );

  const handleToggleMute = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      const element = videoRef.current;
      if (element) element.muted = nextMuted;
    },
    [isMuted],
  );

  const playbackLabel = isPlaying ? t('toolbar.playbackPause') : t('toolbar.playbackPlay');
  const muteLabel = isMuted ? t('media.unmute') : t('media.mute');

  return (
    <div className="relative flex-1 bg-black overflow-hidden group">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        crossOrigin="anonymous"
        playsInline
      />
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-1 px-2 pb-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.7) 100%)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeekCommit={handleSeek}
          onSeeking={setCurrentTime}
          variant="video"
          formatTooltip={formatMediaTime}
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="canvas-video-toggle-playback"
            className="flex h-6 w-6 items-center justify-center rounded text-white/85 hover:text-white"
            onClick={() => {
              if (onPlaybackInteraction) {
                onPlaybackInteraction(isPlaying ? 'paused' : 'playing', currentTimeRef.current);
                return;
              }
              if (isPlaying) {
                pause();
                return;
              }
              resume();
            }}
            aria-label={playbackLabel}
            title={playbackLabel}
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <span className="text-[10px] tabular-nums text-white/80 whitespace-nowrap">
            {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
          </span>
          <div className="flex-1" />
          {hasAudio ? (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center text-white/80 hover:text-white"
              onClick={handleToggleMute}
              aria-label={muteLabel}
              title={muteLabel}
            >
              {isMuted ? <VolumeOffIcon size={12} /> : <VolumeIcon size={12} />}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function waitForVideoMetadata(element: HTMLVideoElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('error', onError);
    };
    const onLoaded = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('Canvas inline video metadata failed to load.'));
    };
    element.addEventListener('loadedmetadata', onLoaded, { once: true });
    element.addEventListener('error', onError, { once: true });
  });
}
