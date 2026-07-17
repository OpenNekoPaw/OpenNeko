/**
 * VideoPlayer - Main video preview component
 *
 * Connects to neko-engine's H.264 stream via WebSocket,
 * decodes with WebCodecs, and renders to Canvas.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  EngineAvAudioStreamClient,
  EngineAvFrameScheduler,
  EngineAvVideoStreamClient,
  AudioStreamStats,
  FrameSchedulerStats,
  H264StreamClientStats,
} from '@neko/neko-client';
import { EngineAvStreamLifecycle } from '@neko/neko-client';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { useTranslation } from '../i18n/I18nContext';
import { VideoControls } from './VideoControls';
import { PictureInPictureIcon, PlayIcon } from '@neko/ui/icons';
import type { MediaInfo, PreviewInitMessage } from '../shared/types';
import { getLogger } from '../utils/logger';
import {
  createVideoSeekGate,
  shouldAcceptVideoFrameAfterSeek,
  type VideoSeekGate,
} from './videoPlayback';

const logger = getLogger('VideoPlayer');

/** Auto-hide delay for controls overlay (ms) */
const CONTROLS_HIDE_DELAY = 3000;

interface SyncStats {
  scheduler: FrameSchedulerStats | null;
  h264: H264StreamClientStats | null;
  audio: AudioStreamStats | null;
}

function formatSyncStats(stats: SyncStats): string {
  const { scheduler, h264, audio } = stats;

  const lines: string[] = ['=== Sync Stats ==='];

  if (scheduler) {
    lines.push(`Video Queue: ${scheduler.queueLength} frames`);
    lines.push(
      `Rendered: ${scheduler.rendered} | Skipped: ${scheduler.skipped} | Backpressure: ${scheduler.backpressure}`,
    );
    const deltaMs = (scheduler.lastSyncDelta / 1000).toFixed(1);
    const threshMs = (scheduler.syncThresholdUs / 1000).toFixed(1);
    const avOffMs = (scheduler.avOffsetUs / 1000).toFixed(1);
    lines.push(`Sync Δ: ${deltaMs}ms | Threshold: ±${threshMs}ms | A/V Offset: ${avOffMs}ms`);
  } else {
    lines.push('Video: no scheduler');
  }

  lines.push('--- H.264 ---');
  if (h264) {
    lines.push(
      `Packets: ${h264.packetsReceived} | Decoded: ${h264.framesDecoded} | Dropped: ${h264.framesDropped}`,
    );
  } else {
    lines.push('H.264: not connected');
  }

  lines.push('--- Audio ---');
  if (audio) {
    const clockStatus = audio.isClockReady ? 'ready' : 'waiting';
    const prebufStatus = audio.prebuffering ? 'buffering' : 'done';
    lines.push(
      `Packets: ${audio.packetsReceived} | Clock: ${clockStatus} | Prebuffer: ${prebufStatus}`,
    );
    lines.push(`Drift: ${audio.driftMs >= 0 ? '+' : ''}${audio.driftMs.toFixed(1)}ms`);
  } else {
    lines.push('Audio: not connected');
  }

  return lines.join('\n');
}

export function VideoPlayer() {
  const { t } = useTranslation();
  const { postMessage } = useVscodeReady();

  // State
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const hasRenderedFrameRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [syncStats, setSyncStats] = useState<SyncStats>({
    scheduler: null,
    h264: null,
    audio: null,
  });

  // PiP state
  const [isPiPActive, setIsPiPActive] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<EngineAvVideoStreamClient | null>(null);
  const audioClientRef = useRef<EngineAvAudioStreamClient | null>(null);
  const schedulerRef = useRef<EngineAvFrameScheduler | null>(null);
  const lifecycleRef = useRef<EngineAvStreamLifecycle | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const playWallTimeRef = useRef<number>(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusThrottleRef = useRef<number>(0);
  const statsThrottleRef = useRef<number>(0);
  const videoStreamUrlRef = useRef<string | null>(null);
  const audioStreamUrlRef = useRef<string | null>(null);
  /** Track clock source to detect wall→audio transition */
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');
  /** Seek gate. When set, onFrame rejects stale frames outside the post-seek target window. */
  const seekGateRef = useRef<VideoSeekGate | null>(null);

  if (!lifecycleRef.current) {
    lifecycleRef.current = new EngineAvStreamLifecycle({
      callbacks: {
        onClientsChanged: ({ videoClient, audioClient, scheduler }) => {
          clientRef.current = videoClient;
          audioClientRef.current = audioClient;
          schedulerRef.current = scheduler;
        },
      },
    });
  }

  // =========================================================================
  // Keyboard shortcut: 'D' toggles stats overlay
  // =========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        // Ignore if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setShowStats((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // =========================================================================
  // Controls auto-hide
  // =========================================================================

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying]);

  // =========================================================================
  // Frame rendering
  // =========================================================================

  /** Render a single VideoFrame to the canvas, then close it. */
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

    // Resize canvas to match frame dimensions
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
    }

    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    hasRenderedFrameRef.current = true;
    frame.close();
  }, []);

  /**
   * onFrame callback passed to H264StreamClient.
   * Instead of rendering directly, enqueue to FrameScheduler for
   * clock-based scheduling.
   *
   * After seek, stale frames may still arrive from the WebSocket buffer.
   * These are filtered out by comparing their PTS to the target video PTS
   * window before enqueueing them into the scheduler.
   */
  const onFrame = useCallback(
    (frame: VideoFrame) => {
      if (!shouldAcceptVideoFrameAfterSeek(frame.timestamp, seekGateRef.current)) {
        frame.close();
        return;
      }
      seekGateRef.current = null;

      const scheduler = schedulerRef.current;
      if (scheduler) {
        scheduler.enqueue(frame);
      } else {
        // No scheduler yet — render immediately (shouldn't happen)
        renderFrame(frame);
      }
    },
    [renderFrame],
  );

  const startPreviewVideoLifecycle = useCallback(
    async (input: { readonly videoStreamUrl?: string; readonly audioStreamUrl?: string }) => {
      if (input.videoStreamUrl !== undefined) {
        videoStreamUrlRef.current = input.videoStreamUrl;
      }
      if (input.audioStreamUrl !== undefined) {
        audioStreamUrlRef.current = input.audioStreamUrl;
      }

      const videoStreamUrl = videoStreamUrlRef.current;
      if (!videoStreamUrl) {
        return;
      }

      const info = mediaInfo;
      await lifecycleRef.current?.start(
        {
          video: {
            websocketUrl: videoStreamUrl,
            width: info?.width || 1920,
            height: info?.height || 1080,
            onFrame,
            onConnectionChange: setIsConnected,
            onError: (err) => {
              logger.error('Stream error:', err);
              setError(err.message);
            },
          },
          audio: audioStreamUrlRef.current
            ? {
                websocketUrl: audioStreamUrlRef.current,
                volume,
                onConnectionChange: (connected) => {
                  logger.info(`Audio stream connected: ${connected}`);
                },
                onError: (err) => {
                  logger.warn('Audio stream error:', err);
                },
              }
            : undefined,
          fps: info?.fps || 25,
          schedulerMode: 'video',
          videoFrameRoute: 'callback',
        },
        { audioContext: audioCtxRef.current ?? undefined },
      );
    },
    [mediaInfo, onFrame, volume],
  );

  // =========================================================================
  // Time tracking during playback
  // =========================================================================

  // RAF animation loop — defined entirely inside useEffect to avoid stale closures
  // and ensure React 18 concurrent mode flushes renders on every frame.
  useEffect(() => {
    if (!isPlaying || !mediaInfo) return;

    let rafId: number;

    const tick = () => {
      // Use audio master clock if available, otherwise fall back to wall clock
      let newTime: number;
      const audioClient = audioClientRef.current;
      if (audioClient && audioClient.isClockReady) {
        // Detect wall→audio clock transition: reset scheduler's A/V offset
        // because the master clock domain has changed.
        if (clockSourceRef.current === 'wall') {
          clockSourceRef.current = 'audio';
          schedulerRef.current?.flush();
          logger.info('Clock source switched: wall -> audio, scheduler flushed');
        }
        newTime = audioClient.getCurrentTime();
      } else {
        // Wall-clock fallback: don't advance until the first video frame arrives,
        // so the clock doesn't run ahead while the stream is still connecting.
        const h264Stats = clientRef.current?.getStats();
        if (!h264Stats || h264Stats.framesDecoded === 0) {
          // No frames yet — keep resetting the wall-clock base
          playWallTimeRef.current = performance.now();
          newTime = playStartTimeRef.current;
        } else {
          const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
          newTime = playStartTimeRef.current + elapsed * speed;
        }
      }

      if (newTime >= mediaInfo.duration) {
        // Reached end — pause stream (keep clients alive for seek-back)
        setCurrentTime(mediaInfo.duration);
        setIsPlaying(false);
        schedulerRef.current?.flush();
        audioClientRef.current?.pause();
        postMessage({ type: 'preview:eof' });
        postMessage({
          type: 'preview:statusUpdate',
          playbackState: 'stopped',
          currentTime: mediaInfo.duration,
        });
        return;
      }

      // --- Frame scheduling: render/skip/wait based on master clock ---
      const scheduler = schedulerRef.current;
      if (scheduler) {
        const masterClockUs = newTime * 1_000_000;
        const result = scheduler.schedule(masterClockUs);
        if (result.action === 'render' && result.frame) {
          renderFrame(result.frame);
        }
        // Log scheduling decisions periodically or when frames are skipped
        if (result.skipped > 0) {
          logger.debug(
            `Schedule: skipped=${result.skipped} action=${result.action} delta=${(result.deltaUs / 1000).toFixed(1)}ms queue=${scheduler.getStats().queueLength}`,
          );
        }
      }

      setCurrentTime(newTime);

      // Throttle status updates to ~1/sec
      const now = performance.now();
      if (now - statusThrottleRef.current > 1000) {
        statusThrottleRef.current = now;
        postMessage({
          type: 'preview:statusUpdate',
          playbackState: 'playing',
          currentTime: newTime,
        });

        // Periodic diagnostic log
        const h264 = clientRef.current?.getStats();
        const sched = schedulerRef.current?.getStats();
        const audio = audioClientRef.current?.getStats();
        const clockSrc = audioClient && audioClient.isClockReady ? 'audio' : 'wall';
        logger.debug(
          `Tick: time=${newTime.toFixed(2)}s clock=${clockSrc} h264=[recv=${h264?.packetsReceived} dec=${h264?.framesDecoded} drop=${h264?.framesDropped}] sched=[q=${sched?.queueLength} rend=${sched?.rendered} skip=${sched?.skipped} bp=${sched?.backpressure}] ${audio ? `audio=[prebuf=${audio.prebuffering} drift=${audio.driftMs.toFixed(1)}ms]` : 'audio=none'}`,
        );
      }

      // Collect stats for debug overlay (~2/sec)
      if (showStats && now - statsThrottleRef.current > 500) {
        statsThrottleRef.current = now;
        setSyncStats({
          scheduler: schedulerRef.current?.getStats() ?? null,
          h264: clientRef.current?.getStats() ?? null,
          audio: audioClientRef.current?.getStats() ?? null,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, mediaInfo, speed, showStats, renderFrame, postMessage]);

  // =========================================================================
  // Extension message handling
  // =========================================================================

  useExtensionMessage((msg) => {
    switch (msg.type) {
      case 'preview:init': {
        const { mediaInfo: info } = (msg as PreviewInitMessage).payload;
        setMediaInfo(info);
        setIsLoading(false);

        // Request first frame as poster
        postMessage({ type: 'preview:captureFrame', time: 0 });
        break;
      }

      case 'preview:streamReady': {
        const { streamUrl, audioStreamUrl } = msg.payload as {
          streamId: string;
          streamUrl: string;
          audioStreamId?: string;
          audioStreamUrl?: string;
        };
        logger.info(
          `streamReady received: streamUrl=${streamUrl} audioStreamUrl=${audioStreamUrl}`,
        );
        void startPreviewVideoLifecycle({
          videoStreamUrl: streamUrl,
          audioStreamUrl,
        }).catch((err) => {
          logger.error('Stream start failed:', err);
          setError(err instanceof Error ? err.message : String(err));
        });
        break;
      }

      case 'preview:streamReconnect': {
        // EOF closed WebSockets — reconnect to the same streamIds
        const { streamUrl: reconnStreamUrl, audioStreamUrl: reconnAudioUrl } = msg.payload as {
          streamId: string;
          streamUrl?: string;
          audioStreamId?: string;
          audioStreamUrl?: string;
        };
        logger.info(`streamReconnect: video=${reconnStreamUrl} audio=${reconnAudioUrl}`);

        void startPreviewVideoLifecycle({
          videoStreamUrl: reconnStreamUrl,
          audioStreamUrl: reconnAudioUrl,
        }).catch((err) => {
          logger.error('Stream reconnect failed:', err);
          setError(err instanceof Error ? err.message : String(err));
        });
        break;
      }

      case 'preview:frameData': {
        const { imageDataUrl } = msg.payload;
        setPosterUrl(imageDataUrl);
        break;
      }

      default:
        break;
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Mute immediately to prevent audio pop, then dispose
      audioClientRef.current?.setVolume(0);
      lifecycleRef.current?.dispose();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // =========================================================================
  // Playback controls
  // =========================================================================

  const handlePlay = useCallback(() => {
    if (!mediaInfo) return;

    // Create / resume AudioContext in user gesture for autoplay policy
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    const startTime = currentTime >= mediaInfo.duration ? 0 : currentTime;
    setCurrentTime(startTime);
    setIsPlaying(true);
    playStartTimeRef.current = startTime;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';

    postMessage({ type: 'preview:play', startTime, speed });
    postMessage({ type: 'preview:statusUpdate', playbackState: 'playing', currentTime: startTime });
  }, [mediaInfo, currentTime, speed, postMessage]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    schedulerRef.current?.flush();
    audioClientRef.current?.pause();
    postMessage({ type: 'preview:pause' });
    postMessage({ type: 'preview:statusUpdate', playbackState: 'paused', currentTime });
  }, [postMessage, currentTime]);

  const handleResume = useCallback(() => {
    // Resume AudioContext in user gesture
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    // Flush stale frames accumulated during pause
    schedulerRef.current?.flush();
    setIsPlaying(true);
    playStartTimeRef.current = currentTime;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';
    audioClientRef.current?.resume();
    postMessage({ type: 'preview:resume' });
    postMessage({ type: 'preview:statusUpdate', playbackState: 'playing', currentTime });
  }, [currentTime, postMessage]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else if (clientRef.current) {
      // Stream exists — resume
      handleResume();
    } else {
      // No stream yet (lost or never created) — start fresh
      handlePlay();
    }
  }, [isPlaying, handlePlay, handlePause, handleResume]);

  /** Scrub: drag-preview only — updates UI time without backend seek */
  const handleScrub = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  /** Seek: commits to backend on mouseup */
  const handleSeek = useCallback(
    (time: number) => {
      setCurrentTime(time);
      if (isPlaying) {
        playStartTimeRef.current = time;
        playWallTimeRef.current = performance.now();
      }
      // Arm seek gate before flushing: reject WebSocket-buffered stale frames
      // from either side of the target, preventing A/V offset corruption.
      seekGateRef.current = createVideoSeekGate(
        time,
        schedulerRef.current?.getStats() ?? null,
        mediaInfo?.fps ?? 25,
      );
      // Flush queued frames so stale pre-seek frames aren't rendered
      schedulerRef.current?.flush();
      // Reset decoders so they start clean from the next keyframe
      clientRef.current?.resetDecoder?.();
      audioClientRef.current?.resetClock();
      // Audio clock is re-prebuffering, so clock source returns to wall
      clockSourceRef.current = 'wall';
      postMessage({ type: 'preview:seek', time });
    },
    [isPlaying, mediaInfo?.fps, postMessage],
  );

  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      if (isPlaying) {
        playStartTimeRef.current = currentTime;
        playWallTimeRef.current = performance.now();
      }
      postMessage({ type: 'preview:speed', speed: newSpeed });
    },
    [isPlaying, currentTime, postMessage],
  );

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    audioClientRef.current?.setVolume(newVolume);
  }, []);

  // =========================================================================
  // Picture-in-Picture
  // =========================================================================

  const handleTogglePiP = useCallback(async () => {
    if (!canvasRef.current) return;

    // If PiP is active, exit
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    const video = pipVideoRef.current;
    if (!video) return;

    // Lazy-init: capture canvas stream and set as video source
    if (!video.srcObject) {
      // No argument = auto-capture on every canvas repaint
      const stream = canvasRef.current.captureStream();
      video.srcObject = stream;
      video.muted = true;
      await video.play();
    }

    await video.requestPictureInPicture();
  }, []);

  // PiP event listeners
  useEffect(() => {
    const video = pipVideoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => {
      setIsPiPActive(false);
      // Clean up stream tracks
      const stream = video.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);
    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neko-preview-text-secondary">
        <div className="w-8 h-8 border-3 border-vscode-panel-border border-t-vscode-button rounded-full animate-spin" />
        <span>{t('preview.video.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-vscode-error p-5 text-center">
        {t('preview.video.error', { error })}
      </div>
    );
  }

  if (!mediaInfo) {
    return (
      <div className="flex items-center justify-center h-full text-vscode-error p-5 text-center">
        {t('preview.video.noMediaInfo')}
      </div>
    );
  }

  return (
    <div className="absolute inset-0" onMouseMove={showControls}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
        {/* Hidden video element for PiP */}
        <video ref={pipVideoRef} style={{ display: 'none' }} playsInline muted />

        {/* Canvas for H.264 decoded frames — stays visible when paused to retain last frame */}
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{
            display: hasRenderedFrameRef.current || isPlaying ? 'block' : 'none',
            visibility: isPiPActive ? 'hidden' : 'visible',
          }}
        />

        {/* Poster image — only shown before first frame is decoded */}
        {!hasRenderedFrameRef.current && !isPlaying && posterUrl && (
          <img
            src={posterUrl}
            className="max-w-full max-h-full object-contain"
            alt="Video preview"
          />
        )}

        {/* Stats debug overlay (toggle with 'D' key) */}
        {showStats && (
          <div className="absolute top-2 left-2 px-3 py-2 bg-black/75 rounded text-[11px] font-mono leading-relaxed text-white/90 whitespace-pre pointer-events-none z-20">
            {formatSyncStats(syncStats)}
          </div>
        )}

        {/* PiP active overlay */}
        {isPiPActive && isPlaying && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 cursor-default">
            <div className="w-12 h-12 opacity-70">
              <PictureInPictureIcon className="w-12 h-12 text-white/70" />
            </div>
            <span className="text-sm text-white/70">{t('preview.video.pipActive')}</span>
          </div>
        )}

        {/* Play overlay when paused */}
        {!isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer transition-[background] duration-150 hover:bg-black/20"
            onClick={handleTogglePlay}
          >
            <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center transition-all duration-150 hover:scale-110 hover:bg-white/25">
              <PlayIcon className="ml-1 text-white" size={28} />
            </div>
          </div>
        )}
      </div>

      {/* Controls overlay at bottom */}
      <div
        className={`absolute bottom-0 left-0 right-0 pt-10 z-10 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'linear-gradient(transparent 0%, rgba(0, 0, 0, 0.85) 100%)' }}
      >
        <VideoControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={mediaInfo.duration}
          speed={speed}
          volume={volume}
          isConnected={isConnected}
          isPiPActive={isPiPActive}
          showStats={showStats}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onScrub={handleScrub}
          onSpeedChange={handleSpeedChange}
          onVolumeChange={handleVolumeChange}
          onTogglePiP={handleTogglePiP}
          onToggleStats={() => setShowStats((prev) => !prev)}
          visible={controlsVisible}
        />
      </div>
    </div>
  );
}
