import { useRef, useState, useCallback, useEffect } from 'react';
import { PcmAudioClient } from '@neko/media/browser';
import type { PcmStreamDescriptor } from '@neko/media';
import { formatMediaTime } from '@neko/media';
import { ProgressBar } from '@neko/ui/creative';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { getLogger } from '../../utils/logger';

const logger = getLogger('InlineAudioPlayer');
const BAR_COUNT = 24;
const DEFAULT_VOLUME = 0.8;

export interface InlineAudioPlayerProps {
  audio: PcmStreamDescriptor;
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

export function InlineAudioPlayer({
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
}: InlineAudioPlayerProps) {
  const clientRef = useRef<PcmAudioClient>();
  const contextRef = useRef<AudioContext>();
  const currentTimeRef = useRef(startTime);
  const startingRef = useRef(false);
  const handledRequestRef = useRef<string>();
  const handledStateRef = useRef<'playing' | 'paused'>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);

  const activateContext = useCallback((): AudioContext => {
    let context = contextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContext({ sampleRate: 48_000 });
      contextRef.current = context;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }, []);

  useEffect(() => {
    return () => {
      startingRef.current = false;
      clientRef.current?.dispose();
      clientRef.current = undefined;
    };
  }, [audio, playbackRate]);

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
      const context = contextRef.current;
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
        logger.warn(`Inline audio playback failed: ${error}`);
      });
  }, [activateContext, audio, duration, onEnded, onResume, onStop, playbackRate, startTime]);

  useEffect(() => {
    const requestChanged =
      playbackRequestId !== undefined && handledRequestRef.current !== playbackRequestId;
    const stateChanged = playbackState !== undefined && handledStateRef.current !== playbackState;
    if (!requestChanged && !stateChanged) return;
    if (requestChanged) handledRequestRef.current = playbackRequestId;
    if (requestChanged && playbackStartTime !== undefined) onSeek(playbackStartTime);
    const nextState = playbackState ?? (requestChanged ? 'playing' : undefined);
    if (!nextState) return;
    handledStateRef.current = nextState;
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

  const progress = duration > 0 ? currentTime / duration : 0;
  return (
    <div className="flex flex-col gap-2 p-3" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex h-12 items-end justify-center gap-[2px]">
        {Array.from({ length: BAR_COUNT }).map((_, index) => (
          <div
            key={index}
            className={`w-1.5 rounded-sm bg-[var(--node-selected)] ${isPlaying ? 'animate-audio-bar' : ''}`}
            style={{
              height: `${20 + ((index * 17 + 7) % 60)}%`,
              opacity: progress > 0 && index / BAR_COUNT <= progress ? 0.9 : 0.3,
              animationDelay: isPlaying ? `${(index * 120) % 800}ms` : undefined,
            }}
          />
        ))}
      </div>
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        onSeekCommit={handleSeek}
        onSeeking={setCurrentTime}
        formatTooltip={formatMediaTime}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--node-selected)] text-white hover:opacity-90"
          onClick={isPlaying ? pause : resume}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </button>
        <span className="min-w-[70px] text-center text-[11px] tabular-nums text-[var(--node-fg-secondary)]">
          {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center text-[var(--node-fg-secondary)] hover:text-[var(--node-fg)]"
          onClick={(event) => {
            event.stopPropagation();
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            clientRef.current?.setVolume(nextMuted ? 0 : DEFAULT_VOLUME);
          }}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeOffIcon size={14} /> : <VolumeIcon size={14} />}
        </button>
      </div>
      <style>{`
        @keyframes audio-bar-pulse {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.4); }
        }
        .animate-audio-bar {
          animation: audio-bar-pulse 0.8s ease-in-out infinite;
          transform-origin: bottom;
        }
      `}</style>
    </div>
  );
}
