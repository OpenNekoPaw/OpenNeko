/**
 * PreviewPanel - H.264 流预览面板（音视频同步）
 *
 * 架构：
 * - Extension 通过 WebSocket 推送 H.264 视频流和 PCM 音频流
 * - Webview 使用 WebCodecs 解码视频，Web Audio API 播放音频
 * - FrameScheduler 基于音频主时钟进行帧调度（render/skip/wait）
 * - 无音频时降级到墙钟驱动
 */

import { useRef, useEffect, useCallback, useState, useMemo, memo, type CSSProperties } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { useTranslation } from '../../i18n/I18nContext';
import { getLogger } from '../../utils/logger';

const logger = getLogger('PreviewPanel');
import { useMediaInfoCache } from '../../hooks/useMediaInfoCache';
import { PREVIEW_QUALITY } from '../../constants';
import { postMessage } from '../../utils/vscodeApi';
import { getMediaProxy } from '../../services/mediaProxyFactory';
import {
  addFrameServerMessageListener,
  getLatestFrameServerConfig,
  getLatestFrameServerStream,
  type FrameServerMessage,
} from '../../services/frameServerMessages';
import {
  EngineAvStreamLifecycle,
  PlaybackPerformanceMonitor,
  type EngineAvAudioStreamClient,
  type EngineAvFrameScheduler,
  type EngineAvVideoStreamClient,
} from '@neko/neko-client';
import type { ProjectData } from '@neko/shared';
import {
  buildCompositeLayers,
  buildPausedPreviewOverlayElements,
  hasVisibleScene3DAtTime,
} from './compositeUtils';
import { PerformanceOverlay } from './PerformanceOverlay';
import { ShapeLayerRenderer } from '../ShapeRenderer';
import type { ShapeInstance } from '../../types/shape';

// =============================================================================
// PreviewPanel Component
// =============================================================================

export interface PreviewPanelProps {
  onCaptureScreenshot?: () => Promise<void>;
  isCapturingScreenshot?: boolean;
}

export interface PreviewPanelRef {
  captureScreenshot: () => Promise<void>;
}

type PreviewInitDiagnostic = {
  readonly code: 'cut.engine.stream-unavailable' | 'cut.preview.initialization-failed';
  readonly message: string;
};

interface PreviewCanvasOverlayProps {
  project: ProjectData;
  currentTime: number;
  visible: boolean;
  displaySize: { width: number; height: number } | null;
}

function projectCoordToPixels(value: number, axisSize: number): number {
  return value >= 0 && value <= 1 ? value * axisSize : value;
}

function buildElementTransformStyle(
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    anchorX: number;
    anchorY: number;
  },
  projectWidth: number,
  projectHeight: number,
): CSSProperties {
  const x = projectCoordToPixels(transform.x, projectWidth);
  const y = projectCoordToPixels(transform.y, projectHeight);

  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    transform: `translate(${-transform.anchorX * 100}%, ${-transform.anchorY * 100}%) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
    transformOrigin: `${transform.anchorX * 100}% ${transform.anchorY * 100}%`,
  };
}

const PreviewCanvasOverlay = memo(function PreviewCanvasOverlay({
  project,
  currentTime,
  visible,
  displaySize,
}: PreviewCanvasOverlayProps) {
  const overlays = useMemo(
    () => (visible ? buildPausedPreviewOverlayElements(project, currentTime) : []),
    [visible, project, currentTime],
  );

  if (!visible || !displaySize || overlays.length === 0) {
    return null;
  }

  const { width: projectWidth, height: projectHeight } = project.resolution;
  const scaleX = displaySize.width / projectWidth;
  const scaleY = displaySize.height / projectHeight;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${projectWidth}px`,
          height: `${projectHeight}px`,
          transform: `scale(${scaleX}, ${scaleY})`,
          transformOrigin: 'top left',
        }}
      >
        {overlays.map((overlay) => {
          if (overlay.type === 'shape') {
            const shapes = (
              overlay.element as typeof overlay.element & {
                shapes?: ShapeInstance[];
              }
            ).shapes;
            if (!Array.isArray(shapes) || shapes.length === 0) return null;

            return (
              <div
                key={overlay.element.id}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: overlay.opacity,
                  zIndex: overlay.zIndex,
                }}
              >
                <ShapeLayerRenderer shapes={shapes} width={projectWidth} height={projectHeight} />
              </div>
            );
          }

          if (overlay.type === 'subtitle') {
            const shadow = overlay.element.shadow;

            return (
              <div
                key={overlay.element.id}
                style={{
                  ...buildElementTransformStyle(overlay.transform, projectWidth, projectHeight),
                  opacity: overlay.opacity,
                  zIndex: overlay.zIndex,
                  color: overlay.element.color,
                  backgroundColor:
                    overlay.element.backgroundColor === 'transparent'
                      ? 'transparent'
                      : overlay.element.backgroundColor,
                  fontSize: `${overlay.element.fontSize}px`,
                  fontFamily: overlay.element.fontFamily,
                  textAlign: overlay.element.textAlign as CSSProperties['textAlign'],
                  WebkitTextStroke:
                    (overlay.element.strokeWidth ?? 0) > 0
                      ? `${overlay.element.strokeWidth}px ${overlay.element.strokeColor}`
                      : undefined,
                  textShadow: shadow
                    ? `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
                    : undefined,
                  whiteSpace: 'pre-wrap',
                  maxWidth: `${projectWidth * 0.9}px`,
                  padding: '8px 16px',
                  borderRadius: '8px',
                }}
              >
                {overlay.element.text}
              </div>
            );
          }

          const shadow = overlay.element.shadow;

          return (
            <div
              key={overlay.element.id}
              style={{
                ...buildElementTransformStyle(overlay.transform, projectWidth, projectHeight),
                opacity: overlay.opacity,
                zIndex: overlay.zIndex,
                color: overlay.element.color,
                backgroundColor:
                  overlay.element.backgroundColor === 'transparent'
                    ? 'transparent'
                    : overlay.element.backgroundColor,
                fontSize: `${overlay.element.fontSize}px`,
                fontFamily: overlay.element.fontFamily,
                fontWeight: overlay.element.fontWeight,
                fontStyle: overlay.element.fontStyle,
                textAlign: overlay.element.textAlign as CSSProperties['textAlign'],
                lineHeight: overlay.element.lineHeight,
                letterSpacing:
                  overlay.element.letterSpacing !== undefined
                    ? `${overlay.element.letterSpacing}px`
                    : undefined,
                WebkitTextStroke:
                  (overlay.element.strokeWidth ?? 0) > 0
                    ? `${overlay.element.strokeWidth}px ${overlay.element.strokeColor}`
                    : undefined,
                textDecoration: overlay.element.textDecoration ?? 'none',
                textShadow: shadow
                  ? `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
                  : undefined,
                whiteSpace: 'pre-wrap',
                maxWidth: `${projectWidth}px`,
              }}
            >
              {overlay.element.content}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const PreviewPanel = memo(function PreviewPanel({
  onCaptureScreenshot,
  isCapturingScreenshot: _isCapturingScreenshot,
}: PreviewPanelProps = {}) {
  const { t } = useTranslation();
  const {
    project,
    currentTime,
    seekRevision,
    isPlaying,
    playbackSpeed,
    previewQuality,
    previewVolume,
    previewMuted,
  } = useEditorStore();
  const showFpsCounter = useEditorStore((state) => state.showFpsCounter);
  const currentFps = useEditorStore((state) => state.currentFps);
  const performanceStats = useEditorStore((state) => state.performanceStats);
  const setCurrentFps = useEditorStore((state) => state.setCurrentFps);
  const setPerformanceStats = useEditorStore((state) => state.setPerformanceStats);
  const setIsPiPActive = useEditorStore((state) => state.setIsPiPActive);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const mediaInfoRef = useRef({ bitrate: '', codec: '', resolution: '' });

  // H.264 stream client
  const h264ClientRef = useRef<EngineAvVideoStreamClient | null>(null);
  // Audio stream client (master clock)
  const audioClientRef = useRef<EngineAvAudioStreamClient | null>(null);
  // Frame scheduler (A/V sync)
  const schedulerRef = useRef<EngineAvFrameScheduler | null>(null);
  const lifecycleRef = useRef<EngineAvStreamLifecycle | null>(null);
  // Shared AudioContext (created on user gesture)
  const audioCtxRef = useRef<AudioContext | null>(null);
  // rAF handle for playback loop
  const animFrameRef = useRef<number>(0);
  // Wall-clock fallback refs
  const playStartTimeRef = useRef<number>(0);
  const playWallTimeRef = useRef<number>(0);
  // Track clock source to detect wall→audio transition
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');

  if (!lifecycleRef.current) {
    lifecycleRef.current = new EngineAvStreamLifecycle({
      callbacks: {
        onClientsChanged: ({ videoClient, audioClient, scheduler }) => {
          h264ClientRef.current = videoClient;
          audioClientRef.current = audioClient;
          schedulerRef.current = scheduler;
        },
      },
    });
  }

  // Performance monitor
  const perfMonitorRef = useRef<PlaybackPerformanceMonitor>(new PlaybackPerformanceMonitor());
  const [frameServerPort, setFrameServerPort] = useState<number | null>(null);
  const [streamWsUrl, setStreamWsUrl] = useState<string | null>(null);
  const [audioWsUrl, setAudioWsUrl] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);

  // State
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [initError, setInitError] = useState<PreviewInitDiagnostic | null>(null);

  // Media info cache
  const mediaInfo = useMediaInfoCache();
  mediaInfoRef.current = mediaInfo;

  // Current time ref for closures
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;

  // isPlaying ref for rAF closure
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const pausedCompositeState = useMemo(() => {
    if (!project || isPlaying) {
      return { enabled: false, layers: [] as ReturnType<typeof buildCompositeLayers> };
    }

    if (hasVisibleScene3DAtTime(project, currentTime)) {
      return { enabled: false, layers: [] as ReturnType<typeof buildCompositeLayers> };
    }

    const layers = buildCompositeLayers(project, currentTime);
    return { enabled: layers.length > 0, layers };
  }, [project, currentTime, isPlaying]);

  // ==========================================================================
  // Frame Server Port & Stream Configuration
  // ==========================================================================

  useEffect(() => {
    const handleFrameServerMessage = (message: FrameServerMessage) => {
      if (message.type === 'frameServer:config' && typeof message.port === 'number') {
        logger.info(`Received frame server config, port: ${message.port}`);
        setFrameServerPort(message.port);
      }
      if (message.type === 'frameServer:streamCreated') {
        logger.info(
          `Stream created: video=${message.streamId}, audio=${message.audioStreamId ?? 'none'}`,
        );
        setStreamWsUrl(typeof message.wsUrl === 'string' ? message.wsUrl : null);
        setAudioWsUrl(typeof message.audioWsUrl === 'string' ? message.audioWsUrl : null);
        setIsStreamReady(Boolean(message.wsUrl));
        setHasVideoFrame(false);
      }
      if (message.type === 'frameServer:streamStopped') {
        logger.info(`Stream stopped: ${message.streamId}`);
        setStreamWsUrl(null);
        setAudioWsUrl(null);
        setIsStreamReady(false);
        setHasVideoFrame(false);
      }
    };

    const cachedConfig = getLatestFrameServerConfig();
    if (cachedConfig) {
      handleFrameServerMessage(cachedConfig);
    }

    const cachedStream = getLatestFrameServerStream();
    if (cachedStream) {
      handleFrameServerMessage(cachedStream);
    }

    return addFrameServerMessageListener(handleFrameServerMessage);
  }, []);

  const unlockAudio = useCallback(() => {
    if (!audioWsUrl) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    setAudioUnlocked(true);
  }, [audioWsUrl]);

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
    };
  }, [unlockAudio]);

  // ==========================================================================
  // Frame Rendering
  // ==========================================================================

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

    perfMonitorRef.current.recordFrame();
    const renderStart = performance.now();
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    setHasVideoFrame((ready) => (ready ? ready : true));
    perfMonitorRef.current.recordRenderTime(performance.now() - renderStart);
    frame.close();
  }, []);

  // ==========================================================================
  // H.264 + Audio Stream Client Setup
  // ==========================================================================

  useEffect(() => {
    if (!streamWsUrl || !project || !canvasRef.current) {
      return;
    }

    // Reset performance monitor for new stream
    const monitor = perfMonitorRef.current;
    monitor.reset();

    let cancelled = false;
    void lifecycleRef.current
      ?.start(
        {
          video: {
            websocketUrl: streamWsUrl,
            width: project.resolution.width,
            height: project.resolution.height,
            onFrame: (frame: VideoFrame) => {
              const scheduler = schedulerRef.current;
              if (scheduler) {
                scheduler.enqueue(frame);
              } else {
                renderFrame(frame);
              }
            },
            onConnectionChange: (connected: boolean) => {
              logger.info(`H.264 stream ${connected ? 'connected' : 'disconnected'}`);
              if (connected) {
                setInitError(null);
              }
            },
            onError: (error: Error) => {
              logger.error('H.264 stream error:', error);
              setInitError(toPreviewInitDiagnostic(error));
            },
            onPacketReceived: (sizeBytes: number) => {
              monitor.recordPacketSize(sizeBytes);
            },
          },
          audio:
            audioWsUrl && audioUnlocked
              ? {
                  websocketUrl: audioWsUrl,
                  volume: 1.0,
                  onConnectionChange: (connected) => {
                    logger.info(`Audio stream ${connected ? 'connected' : 'disconnected'}`);
                  },
                  onError: (err) => {
                    logger.warn('Audio stream error:', err);
                  },
                }
              : undefined,
          fps: project.fps || 25,
          schedulerMode: 'video',
          videoFrameRoute: 'callback',
        },
        { audioContext: audioCtxRef.current ?? undefined },
      )
      .then(() => {
        const audioClient = audioClientRef.current;
        if (!audioClient) return;
        audioClient.setClockPlaybackRate(playbackSpeedRef.current);
        if (isPlayingRef.current) {
          audioClient.resume();
        } else {
          audioClient.pause();
        }
      })
      .catch((error) => {
        if (!cancelled) {
          logger.error('Stream lifecycle error:', error);
          const lifecycleError = error instanceof Error ? error : new Error(String(error));
          setInitError(toPreviewInitDiagnostic(lifecycleError));
        }
      });

    // Reset clock source for new stream
    clockSourceRef.current = 'wall';
    playWallTimeRef.current = performance.now();
    playStartTimeRef.current = currentTimeRef.current;

    return () => {
      cancelled = true;
      audioClientRef.current?.setVolume(0);
      lifecycleRef.current?.stop();
      monitor.reset();
      setHasVideoFrame(false);
    };
  }, [
    streamWsUrl,
    audioWsUrl,
    audioUnlocked,
    project?.resolution.width,
    project?.resolution.height,
    project?.fps,
    renderFrame,
  ]);

  // ==========================================================================
  // rAF Playback Loop (A/V sync)
  // ==========================================================================

  const updatePlaybackTime = useCallback(() => {
    if (!isPlayingRef.current || !project) return;

    // Determine master clock time
    let newTime: number;
    const audioClient = audioClientRef.current;

    if (audioClient && audioClient.isClockReady) {
      // Detect wall→audio clock transition: re-align scheduler offset without flushing
      if (clockSourceRef.current === 'wall') {
        clockSourceRef.current = 'audio';
        const audioTimeUs = audioClient.getCurrentTime() * 1_000_000;
        schedulerRef.current?.switchClock(audioTimeUs);
        logger.info('Clock source switched: wall -> audio');
      }
      newTime = audioClient.getCurrentTime();
    } else {
      // Wall-clock fallback: don't advance until first video frame arrives
      const h264Stats = h264ClientRef.current?.getStats();
      if (!h264Stats || h264Stats.framesDecoded === 0) {
        playWallTimeRef.current = performance.now();
        newTime = playStartTimeRef.current;
      } else {
        const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
        newTime = playStartTimeRef.current + elapsed * playbackSpeed;
      }
    }

    // Frame scheduling: render/skip/wait based on master clock
    const scheduler = schedulerRef.current;
    if (scheduler) {
      const masterClockUs = newTime * 1_000_000;
      const result = scheduler.schedule(masterClockUs);
      if (result.action === 'render' && result.frame) {
        renderFrame(result.frame);
      }
    }

    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [project, renderFrame]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [isPlaying, updatePlaybackTime]);

  // ==========================================================================
  // Playback Control
  // ==========================================================================

  // Project ref for non-reactive checks in effects that should not re-trigger on project changes
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!frameServerPort || !projectRef.current) return;

    if (!isPlaying) {
      // Pause: engine stops encoding loop, stream stays alive
      audioClientRef.current?.pause();
      postMessage({ type: 'media:frameServer:projectPlayback:pause' });
      return;
    }

    // Resume playback (stream already created at editor open)
    // Initialize wall-clock refs
    playStartTimeRef.current = currentTimeRef.current;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';
    audioClientRef.current?.setClockPlaybackRate(playbackSpeedRef.current);
    audioClientRef.current?.resume();

    logger.info('Resuming H264 push for playback');
    postMessage({
      type: 'media:frameServer:projectPlayback:resume',
      payload: {
        startTime: currentTimeRef.current,
        speed: playbackSpeedRef.current,
      },
    });

    return () => {
      audioClientRef.current?.pause();
      postMessage({ type: 'media:frameServer:projectPlayback:pause' });
    };
  }, [frameServerPort, isPlaying]);

  // ==========================================================================
  // Scrubbing & Seek (paused or during playback)
  // ==========================================================================

  const lastHandledSeekRevisionRef = useRef<number>(seekRevision);

  useEffect(() => {
    if (!frameServerPort || !project) return;
    if (seekRevision === lastHandledSeekRevisionRef.current) return;
    lastHandledSeekRevisionRef.current = seekRevision;

    // Actual seek: flush stale frames and reset decoders
    schedulerRef.current?.flush();
    h264ClientRef.current?.resetDecoder?.();
    audioClientRef.current?.resetClock();
    clockSourceRef.current = 'wall';

    if (isPlaying) {
      // Seek during playback: restart stream from new position
      playStartTimeRef.current = currentTime;
      playWallTimeRef.current = performance.now();

      postMessage({
        type: 'media:frameServer:projectPlayback:resume',
        payload: {
          startTime: currentTime,
          speed: playbackSpeed,
        },
      });
    } else {
      // Seek when paused: request single frame at target time
      postMessage({
        type: 'media:frameServer:projectPlayback:seek',
        payload: {
          projectData: project,
          seekTime: currentTime,
        },
      });
    }
  }, [seekRevision, currentTime, isPlaying, project, playbackSpeed]);

  // ==========================================================================
  // Composite High-Quality Frame (when paused)
  // ==========================================================================

  useEffect(() => {
    if (!project || isPlaying || !isStreamReady || !pausedCompositeState.enabled) return;

    const abortController = new AbortController();

    const fetchCompositeFrame = async () => {
      try {
        const layers = pausedCompositeState.layers;
        if (layers.length === 0) return;

        const bitmap = await getMediaProxy().renderCompositeFrame(
          layers,
          currentTime,
          project.resolution.width,
          project.resolution.height,
          [0, 0, 0, 255],
          { signal: abortController.signal },
        );

        // Race check: ensure still paused and not aborted
        if (abortController.signal.aborted) {
          bitmap.close();
          return;
        }

        // Render composite frame to Canvas
        const canvas = canvasRef.current;
        if (!canvas) {
          bitmap.close();
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bitmap.close();
          return;
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        logger.warn('Composite frame failed:', err);
      }
    };

    fetchCompositeFrame();

    return () => {
      abortController.abort();
    };
  }, [currentTime, isPlaying, isStreamReady, project, pausedCompositeState]);

  // ==========================================================================
  // Canvas Resize
  // ==========================================================================

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !project) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    const handleResize = () => {
      const containerRect = container.getBoundingClientRect();
      const { width: projectWidth, height: projectHeight } = project.resolution;
      const aspectRatio = projectWidth / projectHeight;

      const availableWidth = containerRect.width - 32;
      const availableHeight = containerRect.height - 32;

      let displayWidth: number;
      let displayHeight: number;

      if (availableWidth / availableHeight > aspectRatio) {
        displayHeight = availableHeight;
        displayWidth = displayHeight * aspectRatio;
      } else {
        displayWidth = availableWidth;
        displayHeight = displayWidth / aspectRatio;
      }

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      setDisplaySize({ width: displayWidth, height: displayHeight });
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize();

    return () => observer.disconnect();
  }, [project?.resolution]);

  // Set canvas internal resolution
  useEffect(() => {
    if (!canvasRef.current || !project) return;

    const canvas = canvasRef.current;
    const scale = PREVIEW_QUALITY[previewQuality];
    const scaledWidth = Math.round(project.resolution.width * scale);
    const scaledHeight = Math.round(project.resolution.height * scale);

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
  }, [project?.resolution, previewQuality]);

  // Notify engine of quality change (resolution/bitrate hot-update)
  // Also fires after stream creation (streamWsUrl change) to apply initial quality
  useEffect(() => {
    if (!project || !frameServerPort || !streamWsUrl) return;

    const scale = PREVIEW_QUALITY[previewQuality];
    const width = Math.round(project.resolution.width * scale);
    const height = Math.round(project.resolution.height * scale);

    logger.info(
      `Sending quality update: ${width}x${height} (scale=${scale}, quality=${previewQuality})`,
    );
    postMessage({
      type: 'media:frameServer:projectPlayback:quality',
      payload: { width, height },
    });
  }, [previewQuality, project?.resolution, frameServerPort, streamWsUrl]);

  // ==========================================================================
  // Preview Volume Sync — apply previewVolume/previewMuted to AudioStreamClient
  // ==========================================================================

  useEffect(() => {
    const audioClient = audioClientRef.current;
    if (!audioClient) return;
    audioClient.setVolume(previewMuted ? 0 : previewVolume);
  }, [previewVolume, previewMuted]);

  // ==========================================================================
  // Timeline Hot-Update — send project changes to engine during playback
  // ==========================================================================

  useEffect(() => {
    if (!frameServerPort || !project || !isPlaying) return;
    postMessage({
      type: 'media:frameServer:projectPlayback:update',
      payload: { projectData: project },
    });
  }, [project, isPlaying, frameServerPort]);

  useEffect(() => {
    if (!frameServerPort || !isPlaying) return;

    playStartTimeRef.current = currentTimeRef.current;
    playWallTimeRef.current = performance.now();
    audioClientRef.current?.setClockPlaybackRate(playbackSpeed);
    postMessage({
      type: 'media:frameServer:projectPlayback:speed',
      payload: { speed: playbackSpeed },
    });
  }, [playbackSpeed, frameServerPort, isPlaying]);

  // ==========================================================================
  // Screenshot Capture
  // ==========================================================================

  const captureScreenshot = useCallback(async () => {
    if (!isStreamReady || !project || !canvasRef.current) {
      logger.error('Cannot capture: stream is not ready or no project');
      return;
    }

    try {
      const canvas = canvasRef.current;

      postMessage({
        type: 'media:frameServer:projectPlayback:seek',
        payload: {
          projectData: project,
          seekTime: currentTime,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 0.95);
      });

      if (!blob) {
        throw new Error('Failed to export frame to blob');
      }

      const timestamp = Math.floor(currentTime * 1000);
      const filename = `screenshot_${timestamp}ms.png`;
      const arrayBuffer = await blob.arrayBuffer();

      postMessage({
        type: 'saveBlob',
        data: arrayBuffer,
        filename,
        mimeType: 'image/png',
      });

      logger.info('Screenshot sent to extension');
    } catch (error) {
      logger.error('Screenshot capture failed:', error);
      throw error;
    }
  }, [isStreamReady, project, currentTime]);

  useEffect(() => {
    if (onCaptureScreenshot) {
      (
        window as unknown as { __previewPanelCaptureScreenshot: typeof captureScreenshot }
      ).__previewPanelCaptureScreenshot = captureScreenshot;
    }
  }, [onCaptureScreenshot, captureScreenshot]);

  // ==========================================================================
  // Picture-in-Picture
  // ==========================================================================

  const togglePiP = useCallback(async () => {
    if (!canvasRef.current) return;

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    const video = pipVideoRef.current;
    if (!video) return;

    if (!video.srcObject) {
      const stream = canvasRef.current.captureStream();
      video.srcObject = stream;
      video.muted = true;
      await video.play();
    }

    await video.requestPictureInPicture();
  }, []);

  useEffect(() => {
    const video = pipVideoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => {
      setIsPiPActive(false);
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
  }, [setIsPiPActive]);

  useEffect(() => {
    (window as unknown as { __previewPanelTogglePiP: typeof togglePiP }).__previewPanelTogglePiP =
      togglePiP;
    return () => {
      delete (window as unknown as { __previewPanelTogglePiP?: typeof togglePiP })
        .__previewPanelTogglePiP;
    };
  }, [togglePiP]);

  // ==========================================================================
  // Performance Stats
  // ==========================================================================

  useEffect(() => {
    if (!isPlaying || !h264ClientRef.current) {
      return;
    }

    const fetchStats = () => {
      const client = h264ClientRef.current;
      if (!client) return;

      const stats = client.getStats();
      const snapshot = perfMonitorRef.current.getSnapshot();
      const schedStats = schedulerRef.current?.getStats();

      perfMonitorRef.current.recordDroppedFrames(stats.framesDropped - snapshot.droppedFrames);

      setCurrentFps(snapshot.measuredFps);
      setPerformanceStats({
        currentTime: currentTimeRef.current,
        frameIndex: Math.floor(currentTimeRef.current * (project?.fps || 30)),
        targetFps: project?.fps || 30,
        resolution: (() => {
          const scale = PREVIEW_QUALITY[previewQuality];
          const w = Math.round((project?.resolution.width ?? 0) * scale);
          const h = Math.round((project?.resolution.height ?? 0) * scale);
          return `${w}x${h}`;
        })(),
        bitrate: mediaInfoRef.current.bitrate,
        mode: 'compatible',
        decodeTime: stats.avgDecodeTimeMs,
        renderTime: snapshot.avgRenderTimeMs,
        compositeTime: stats.avgLatencyMs,
        frameTimeP50: snapshot.frameTimeP50,
        frameTimeP95: snapshot.frameTimeP95,
        frameTimeP99: snapshot.frameTimeP99,
        measuredFps: snapshot.measuredFps,
        bitrateKbps: snapshot.bitrateKbps,
        memoryUsedMB: snapshot.memoryUsedMB,
        memoryTotalMB: 0,
        cpuLoad: 0,
        gpuBackend: stats.hardwareAcceleration ? 'HW' : 'SW',
        gpuLoad: 0,
        cachedFrames: schedStats?.queueLength ?? 0,
        cacheHitRate: 0,
        droppedFrames:
          stats.framesDropped + (schedStats?.skipped ?? 0) + (schedStats?.backpressure ?? 0),
        renderErrors: 0,
      });

      // Fetch engine-side pipeline stats (async, non-blocking)
      getMediaProxy()
        .getStreamStats()
        .then((engineStats) => {
          if (engineStats) {
            setPerformanceStats({
              engineHwDecodeMs: engineStats.video.hwDecodeMs,
              engineNv12ImportMs: engineStats.video.nv12ImportMs,
              engineNv12ToRgbaMs: engineStats.video.nv12ToRgbaMs,
              engineCompositeMs: engineStats.video.compositeMs,
              engineRgbaToNv12Ms: engineStats.video.rgbaToNv12Ms,
              engineCpuReadbackMs: engineStats.video.cpuReadbackMs,
              engineEncodeSubmitMs: engineStats.video.encodeSubmitMs,
              engineEncodeTimeMs: engineStats.video.encodeTimeMs ?? 0,
              engineAvgFps: engineStats.video.avgFps,
              engineAudioMixMs: engineStats.audioMixMs,
              engineCpuUsagePercent: engineStats.cpuUsagePercent,
              enginePeakMemoryBytes: engineStats.peakMemoryBytes,
            });
          }
        })
        .catch(() => {
          // Ignore — engine stats are best-effort
        });
    };

    // Run first fetch immediately, then every 1s
    fetchStats();
    const intervalId = setInterval(fetchStats, 1000);
    return () => clearInterval(intervalId);
  }, [isPlaying, streamWsUrl, project, setCurrentFps, setPerformanceStats, previewQuality]);

  // ==========================================================================
  // Cleanup on unmount
  // ==========================================================================

  useEffect(() => {
    return () => {
      audioClientRef.current?.setVolume(0);
      lifecycleRef.current?.dispose();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <span className="text-vscode-description">{t('preview.noProjectLoaded')}</span>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black gap-4">
        <div
          className="text-vscode-error flex items-center gap-2"
          data-diagnostic-code={initError.code}
          role="alert"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>{initError.message}</span>
        </div>
        {initError.code === 'cut.preview.initialization-failed' ? (
          <span className="text-vscode-description text-sm">{t('preview.gpuRequired')}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-vscode-bg">
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="border border-vscode-panel-border shadow-lg bg-black"
            style={{ display: isStreamReady ? 'block' : 'none' }}
          />

          <PreviewCanvasOverlay
            project={project}
            currentTime={currentTime}
            visible={pausedCompositeState.enabled && !isPlaying && isStreamReady}
            displaySize={displaySize}
          />

          {/* FPS Counter */}
          {isStreamReady && hasVideoFrame && showFpsCounter && (
            <PerformanceOverlay
              performanceStats={performanceStats}
              currentFps={currentFps}
              targetFps={project?.fps || 30}
              clockSource={clockSourceRef.current}
            />
          )}

          {/* Hidden video element for PiP */}
          <video ref={pipVideoRef} style={{ display: 'none' }} playsInline muted />

          {/* Loading overlay */}
          {!isStreamReady && (
            <div
              className="flex items-center justify-center bg-black border border-vscode-panel-border max-w-full max-h-full"
              style={{
                aspectRatio: `${project.resolution.width} / ${project.resolution.height}`,
                width: Math.min(project.resolution.width, 800),
              }}
            >
              <div className="flex flex-col items-center gap-2 text-vscode-description">
                <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-xs">{t('preview.initializingGpu')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function toPreviewInitDiagnostic(error: Error): PreviewInitDiagnostic {
  return {
    code:
      error.message === 'WebSocket connection error'
        ? 'cut.engine.stream-unavailable'
        : 'cut.preview.initialization-failed',
    message: error.message,
  };
}
