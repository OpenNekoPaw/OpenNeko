import { useRef, useState, useCallback, useEffect } from 'react';
import { PcmAudioClient } from '@neko/media/browser';
import type { HtmlVideoDescriptor, PcmStreamDescriptor } from '@neko/media';
import { formatMediaTime } from '@neko/media';
import { ProgressBar } from '@neko/ui/creative';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { getLogger } from '../../utils/logger';

const logger = getLogger('InlineVideoPlayer');
const DEFAULT_VOLUME = 0.8;
const VIDEO_SYNC_THRESHOLD_SECONDS = 0.08;

export interface InlineVideoPlayerProps {
  video: HtmlVideoDescriptor | null;
  audio: PcmStreamDescriptor | null;
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
}

export function InlineVideoPlayer({
  video,
  audio,
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
}: InlineVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioClientRef = useRef<PcmAudioClient>();
  const audioContextRef = useRef<AudioContext>();
  const animationFrameRef = useRef(0);
  const currentTimeRef = useRef(startTime);
  const handledPlaybackRequestRef = useRef<string>();
  const handledPlaybackStateRef = useRef<'playing' | 'paused'>();
  const generationRef = useRef(0);
  const streamsReadyRef = useRef(false);
  const startingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);

  const activateAudioContext = useCallback((): AudioContext => {
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContext({ sampleRate: 48_000 });
      audioContextRef.current = context;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }, []);

  const disposeStreams = useCallback(() => {
    generationRef.current += 1;
    streamsReadyRef.current = false;
    startingRef.current = false;
    audioClientRef.current?.dispose();
    audioClientRef.current = undefined;
    const element = videoRef.current;
    if (element) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
  }, []);

  useEffect(() => {
    return disposeStreams;
  }, [audio, disposeStreams, playbackRate, video]);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = (): void => {
      const element = videoRef.current;
      const audioClient = audioClientRef.current;
      const nextTime = audioClient?.isClockReady
        ? audioClient.getCurrentTime()
        : (element?.currentTime ?? currentTimeRef.current);
      if (
        element &&
        audioClient?.isClockReady &&
        Math.abs(element.currentTime - nextTime) > VIDEO_SYNC_THRESHOLD_SECONDS
      ) {
        element.currentTime = nextTime;
      }
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

  useEffect(() => {
    return () => {
      disposeStreams();
      const context = audioContextRef.current;
      if (context && context.state !== 'closed') void context.close();
    };
  }, [disposeStreams]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    void audioClientRef.current?.pause();
    setIsPlaying(false);
    onPause(currentTimeRef.current);
  }, [onPause]);

  const resume = useCallback(() => {
    const element = videoRef.current;
    if (!element || !video) return;
    if (streamsReadyRef.current) {
      activateAudioContext();
      void audioClientRef.current?.resume();
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
    const audioContext = audio ? activateAudioContext() : undefined;
    const audioClient = audio
      ? new PcmAudioClient({
          descriptor: audio,
          playbackRate,
          volume: DEFAULT_VOLUME,
          onError: (error) => logger.warn(`Canvas PCM error: ${error.message}`),
        })
      : undefined;
    audioClientRef.current = audioClient;
    const start = async (): Promise<void> => {
      if (audioClient && audioContext) await audioClient.prepare(audioContext);
      if (generation !== generationRef.current) {
        audioClient?.dispose();
        return;
      }
      element.muted = true;
      element.defaultMuted = true;
      element.playsInline = true;
      element.playbackRate = playbackRate;
      element.src = video.url;
      element.load();
      await waitForVideoMetadata(element);
      element.currentTime = startTime;
      currentTimeRef.current = startTime;
      if (audioClient && audioContext) {
        await audioClient.startAt(audioContext.currentTime + 0.1);
      }
      await element.play();
      if (generation !== generationRef.current) return;
      streamsReadyRef.current = true;
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
  }, [activateAudioContext, audio, disposeStreams, onResume, playbackRate, startTime, video]);

  useEffect(() => {
    const requestChanged =
      playbackRequestId !== undefined && handledPlaybackRequestRef.current !== playbackRequestId;
    const stateChanged =
      playbackState !== undefined && handledPlaybackStateRef.current !== playbackState;
    if (!requestChanged && !stateChanged) return;
    if (requestChanged) handledPlaybackRequestRef.current = playbackRequestId;
    if (requestChanged && playbackStartTime !== undefined) onSeek(playbackStartTime);
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
      audioClientRef.current?.setVolume(nextMuted ? 0 : DEFAULT_VOLUME);
    },
    [isMuted],
  );

  return (
    <div className="relative flex-1 bg-black overflow-hidden group">
      <video ref={videoRef} className="w-full h-full object-contain" muted playsInline />
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
            className="flex h-6 w-6 items-center justify-center rounded text-white/85 hover:text-white"
            onClick={isPlaying ? pause : resume}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <span className="text-[10px] tabular-nums text-white/80 whitespace-nowrap">
            {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
          </span>
          <div className="flex-1" />
          {audio ? (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center text-white/80 hover:text-white"
              onClick={handleToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
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
