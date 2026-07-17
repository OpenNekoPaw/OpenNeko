import { useRef, useState, useCallback, useEffect } from 'react';
import {
  EngineAvStreamLifecycle,
  formatTime,
  type EngineAvAudioStreamClient,
  type EngineAvFrameScheduler,
  type EngineAvVideoStreamClient,
} from '@neko/neko-client';
import { ProgressBar } from '@neko/ui/creative';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { getLogger } from '../../utils/logger';
import {
  createInlineVideoSeekGate,
  resetInlineVideoPlaybackForSeek,
  shouldAcceptInlineVideoFrameAfterSeek,
  type InlineVideoSeekGate,
} from './inlineVideoPlayback';

const logger = getLogger('InlineVideoPlayer');

const DEFAULT_VOLUME = 0.8;

export interface InlineVideoPlayerProps {
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
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

export function InlineVideoPlayer({
  videoStreamUrl,
  audioStreamUrl,
  width,
  height,
  fps,
  duration,
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
}: InlineVideoPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<EngineAvVideoStreamClient | null>(null);
  const audioClientRef = useRef<EngineAvAudioStreamClient | null>(null);
  const schedulerRef = useRef<EngineAvFrameScheduler | null>(null);
  const lifecycleRef = useRef<EngineAvStreamLifecycle | null>(null);
  const animFrameRef = useRef<number>(0);
  const playStartTimeRef = useRef(startTime);
  const playWallTimeRef = useRef(0);
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');
  const currentTimeRef = useRef(startTime);
  const seekGateRef = useRef<InlineVideoSeekGate | null>(null);
  const handledPlaybackRequestRef = useRef<string | undefined>();
  const handledPlaybackStateRef = useRef<'playing' | 'paused' | undefined>();
  const completedRef = useRef(false);
  const completePlaybackRef = useRef<(() => void) | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);

  if (!lifecycleRef.current) {
    lifecycleRef.current = new EngineAvStreamLifecycle({
      callbacks: {
        onClientsChanged: ({ videoClient, audioClient, scheduler }) => {
          clientRef.current = videoClient;
          audioClientRef.current = audioClient;
          schedulerRef.current = scheduler;
        },
        onStreamEnd: (kind) => {
          if (kind === 'video' || !videoStreamUrl) {
            completePlaybackRef.current?.();
          }
        },
      },
    });
  }

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // =========================================================================
  // Frame rendering
  // =========================================================================

  const renderFrame = useCallback((frame: VideoFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      frame.close();
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      frame.close();
      return;
    }
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
    }
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    frame.close();
  }, []);

  const onFrame = useCallback(
    (frame: VideoFrame) => {
      if (!shouldAcceptInlineVideoFrameAfterSeek(frame.timestamp, seekGateRef.current)) {
        frame.close();
        return;
      }
      seekGateRef.current = null;

      const scheduler = schedulerRef.current;
      if (scheduler) {
        scheduler.enqueue(frame);
      } else {
        renderFrame(frame);
      }
    },
    [renderFrame],
  );

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
    schedulerRef.current?.flush();
    onStop(endedAt);
    onEnded?.(endedAt);
  }, [duration, onEnded, onStop]);
  completePlaybackRef.current = completePlayback;

  const updatePlaybackTime = useCallback(() => {
    if (completedRef.current) return;

    let newTime: number;
    const audioClient = audioClientRef.current;

    if (audioClient?.isClockReady) {
      if (clockSourceRef.current === 'wall') {
        clockSourceRef.current = 'audio';
        schedulerRef.current?.flush();
      }
      newTime = audioClient.getCurrentTime();
    } else {
      const h264Stats = clientRef.current?.getStats();
      if (!h264Stats || h264Stats.framesDecoded === 0) {
        playWallTimeRef.current = performance.now();
        newTime = playStartTimeRef.current;
      } else {
        const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
        newTime = playStartTimeRef.current + elapsed;
      }
    }

    if (newTime >= duration) {
      completePlayback();
      return;
    }

    const scheduler = schedulerRef.current;
    if (scheduler) {
      const masterClockUs = newTime * 1_000_000;
      const result = scheduler.schedule(masterClockUs);
      if (result.action === 'render' && result.frame) {
        renderFrame(result.frame);
      }
    }

    setCurrentTime(newTime);
    onTimeUpdate?.(newTime);
    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [completePlayback, duration, onTimeUpdate, renderFrame]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, updatePlaybackTime]);

  // =========================================================================
  // Connect streams on mount
  // =========================================================================

  useEffect(() => {
    void lifecycleRef.current
      ?.start({
        video: videoStreamUrl
          ? {
              websocketUrl: videoStreamUrl,
              width,
              height,
              onFrame,
              onError: (err) => logger.error(`H264 error: ${err}`),
            }
          : undefined,
        audio: audioStreamUrl
          ? {
              websocketUrl: audioStreamUrl,
              volume: DEFAULT_VOLUME,
              onError: (err) => logger.warn(`Audio error: ${err}`),
            }
          : undefined,
        fps,
        schedulerMode: 'video',
        videoFrameRoute: 'callback',
      })
      .catch((err) => logger.error(`Inline video lifecycle error: ${err}`));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startTime is only used for initial value; including it would restart streams on pause
  }, [videoStreamUrl, audioStreamUrl, width, height, fps, onFrame]);

  // =========================================================================
  // Controls
  // =========================================================================

  const handleTogglePlay = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) {
        setIsPlaying(false);
        schedulerRef.current?.flush();
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
      onTimeUpdate?.(time);
      seekGateRef.current = createInlineVideoSeekGate(
        time,
        schedulerRef.current?.getStats() ?? null,
        fps,
      );
      resetInlineVideoPlaybackForSeek({
        time,
        now: () => performance.now(),
        clock: {
          currentTimeRef,
          playStartTimeRef,
          playWallTimeRef,
          clockSourceRef,
        },
        pipeline: {
          scheduler: schedulerRef.current,
          videoClient: clientRef.current,
          audioClient: audioClientRef.current,
        },
      });
      onSeek(time);
    },
    [fps, onSeek, onTimeUpdate],
  );

  const applyControlledPlaybackState = useCallback(
    (nextState: 'playing' | 'paused') => {
      if (nextState === 'paused') {
        if (!isPlaying) return;
        setIsPlaying(false);
        schedulerRef.current?.flush();
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
      audioClientRef.current?.setVolume(newMuted ? 0 : DEFAULT_VOLUME);
    },
    [isMuted],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="relative flex-1 bg-black overflow-hidden group">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={{ display: 'block' }}
      />

      {/* Controls overlay — gradient background */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-1 px-2 pb-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.7) 100%)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeekCommit={handleSeekCommit}
          onSeeking={handleSeeking}
          variant="video"
          formatTooltip={formatTime}
        />

        {/* Button row */}
        <div className="flex items-center gap-1.5">
          {/* Play/Pause */}
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-white/85 hover:text-white"
            onClick={handleTogglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>

          {/* Time display */}
          <span className="text-[10px] tabular-nums text-white/80 whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Mute toggle */}
          {audioStreamUrl && (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center text-white/80 hover:text-white"
              onClick={handleToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeOffIcon size={12} /> : <VolumeIcon size={12} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
