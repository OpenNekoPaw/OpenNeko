import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isResourceRef, type DelegateAction, type ResourceRef } from '@neko/shared';
import { dispatchPreviewDelegate } from './previewDelegates';
import { isImagePreviewUrl, isSafeWebviewUrl, WebviewPreviewResolver } from './previewResolver';
import { PreviewRuntime } from './previewRuntime';
import type {
  PreviewPlaybackControl,
  PreviewSourceDescriptor,
  RuntimePreviewVariant,
} from './types';
import { InlineVideoPlayer } from '../components/media/InlineVideoPlayer';
import { InlineAudioPlayer } from '../components/media/InlineAudioPlayer';
import { usePlaybackStore } from '../stores/playbackStore';
import type { PlaybackSurfaceKind } from '../stores/playbackStore';
import { getGlobalVSCodeApi } from '../utils/vscode';
import { t } from '../i18n';

export interface PreviewRendererProps {
  source: PreviewSourceDescriptor;
  runtime?: PreviewRuntime;
  delegateActions?: DelegateAction[];
  surfaceKind?: PlaybackSurfaceKind;
  playbackControl?: PreviewPlaybackControl;
  chrome?: 'contained' | 'full-bleed';
}

export type PreviewRenderer = React.ComponentType<PreviewRendererProps>;

export type PreviewRendererRegistry = Partial<
  Record<PreviewSourceDescriptor['role'], PreviewRenderer>
>;

function createPreviewRendererRegistry(): PreviewRendererRegistry {
  return {
    image: VisualPreviewRenderer,
    'document-cover': VisualPreviewRenderer,
    'video-poster': VisualPreviewRenderer,
    'video-proxy': VideoPreviewRenderer,
    'audio-waveform': AudioPreviewRenderer,
    'model-screenshot': VisualPreviewRenderer,
    'model-turntable': VisualPreviewRenderer,
    'generation-candidate': VisualPreviewRenderer,
    'project-thumbnail': ProjectPreviewRenderer,
    unavailable: FallbackPreviewRenderer,
  };
}

export function PreviewSurface(props: PreviewRendererProps) {
  const registry = useMemo(() => createPreviewRendererRegistry(), []);
  const Renderer = registry[props.source.role] ?? FallbackPreviewRenderer;
  return <Renderer key={props.source.id} {...props} />;
}

// =============================================================================
// Hooks
// =============================================================================

function useResolvedVariant(
  source: PreviewSourceDescriptor,
  role?: PreviewSourceDescriptor['role'],
): RuntimePreviewVariant | undefined {
  const resolver = useMemo(() => new WebviewPreviewResolver(), []);
  const [variant, setVariant] = useState<RuntimePreviewVariant | undefined>();

  useEffect(() => {
    let cancelled = false;
    resolver.resolve({ source, role }).then((nextVariant) => {
      if (!cancelled) {
        setVariant(nextVariant);
      }
    });
    return () => {
      cancelled = true;
      resolver.dispose();
    };
  }, [resolver, role, source]);

  return variant;
}

function useCaptureFrame(
  assetPath: string | undefined,
  nodeId: string,
  resourceRef: ResourceRef | undefined,
): string | null {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!assetPath || requestedRef.current) return;
    const vscode = getGlobalVSCodeApi();
    if (!vscode) return;

    requestedRef.current = true;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (msg.type === 'media:captureFrameResult' && msg.nodeId === nodeId) {
        if (typeof msg.dataUrl === 'string') {
          setFrameUrl(msg.dataUrl);
        }
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({
      type: 'media:captureFrame',
      nodeId,
      assetPath,
      ...(resourceRef ? { resourceRef } : {}),
      time: 1,
    });

    return () => window.removeEventListener('message', handleMessage);
  }, [assetPath, nodeId, resourceRef]);

  return frameUrl;
}

// =============================================================================
// Media stream hook (with pause/resume/seek support)
// =============================================================================

interface MediaStreamState {
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
  startTime: number;
}

const PLAYBACK_PROGRESS_SYNC_INTERVAL_MS = 250;
const PLAYBACK_PROGRESS_SYNC_DELTA_SECONDS = 0.25;

let playbackSurfaceCounter = 0;

function createPlaybackSurfaceId(mediaType: 'video' | 'audio'): string {
  playbackSurfaceCounter += 1;
  return `${mediaType}-${playbackSurfaceCounter.toString(36)}`;
}

function getMonotonicTimeMs(): number {
  return performance.now();
}

function useMediaStream(
  assetPath: string | undefined,
  mediaType: 'video' | 'audio',
  surfaceKind: PlaybackSurfaceKind,
  resourceRef: ResourceRef | undefined,
) {
  const [surfaceId] = useState(() => createPlaybackSurfaceId(mediaType));
  const [stream, setStream] = useState<MediaStreamState | null>(null);
  const [probing, setProbing] = useState(false);
  const isPausedRef = useRef(false);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const streamDurationRef = useRef(0);
  const stoppedPlaybackRef = useRef(true);

  const [savedStartTime] = useState(() => {
    const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
    if (!sourceKey) return 0;
    const playbackStore = usePlaybackStore.getState();
    return (
      (playbackStore.activePlayback?.sourceKey === sourceKey
        ? playbackStore.activePlayback.currentTime
        : playbackStore.getPlayback(sourceKey)?.currentTime) ?? 0
    );
  });
  const currentTimeRef = useRef(savedStartTime);
  const lastProgressSyncRef = useRef({
    currentTime: savedStartTime,
    updatedAtMs: 0,
  });

  const startPlayback = useCallback(
    (resumeFromTime?: number) => {
      const vscode = getGlobalVSCodeApi();
      const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
      if (!vscode || !sourceKey) return;

      const playbackStore = usePlaybackStore.getState();
      const active = playbackStore.activePlayback;
      if (active && active.sourceKey === sourceKey && active.surfaceId !== surfaceId) {
        playbackStore.requestHandoff({
          sourceKey,
          ...(assetPath ? { assetPath } : {}),
          mediaType,
          fromSurfaceId: active.surfaceId,
          toKind: surfaceKind,
          startTime: active.currentTime,
        });
        return;
      }

      setProbing(true);
      isPausedRef.current = false;
      stoppedPlaybackRef.current = false;

      const sourceHandoff = playbackStore.consumeHandoff(sourceKey, surfaceKind);
      const startTime =
        resumeFromTime ??
        sourceHandoff?.startTime ??
        playbackStore.getPlayback(sourceKey)?.currentTime ??
        savedStartTime;

      const handleMessage = (event: MessageEvent) => {
        const msg = event.data as Record<string, unknown>;
        if (msg.type === 'media:probeResult' && msg.nodeId === surfaceId) {
          if (msg.error) {
            setProbing(false);
            return;
          }
          const mediaInfo = msg.mediaInfo as Record<string, unknown>;
          vscode.postMessage({
            type: 'media:play',
            nodeId: surfaceId,
            ...(assetPath ? { assetPath } : {}),
            ...(resourceRef ? { resourceRef } : {}),
            mediaInfo,
            mediaType,
            startTime,
            speed: 1.0,
          });
        }
        if (msg.type === 'media:streamReady' && msg.nodeId === surfaceId) {
          setProbing(false);
          if (msg.error) return;
          const mediaInfo = msg.mediaInfo as Record<string, unknown>;
          const dur = (mediaInfo?.duration as number) ?? 0;
          streamDurationRef.current = dur;
          usePlaybackStore.getState().startActivePlayback({
            sourceKey,
            ...(assetPath ? { assetPath } : {}),
            mediaType,
            surfaceId,
            surfaceKind,
            currentTime: startTime,
            duration: dur,
          });
          currentTimeRef.current = startTime;
          lastProgressSyncRef.current = {
            currentTime: startTime,
            updatedAtMs: getMonotonicTimeMs(),
          };
          setStream({
            videoStreamUrl: (msg.videoStreamUrl as string) ?? null,
            audioStreamUrl: (msg.audioStreamUrl as string) ?? null,
            width: (mediaInfo?.width as number) ?? 640,
            height: (mediaInfo?.height as number) ?? 360,
            fps: (mediaInfo?.fps as number) ?? 30,
            duration: dur,
            startTime,
          });
        }
      };

      listenerRef.current = handleMessage;
      window.addEventListener('message', handleMessage);
      vscode.postMessage({
        type: 'media:probe',
        nodeId: surfaceId,
        ...(assetPath ? { assetPath } : {}),
        ...(resourceRef ? { resourceRef } : {}),
        mediaType,
      });
    },
    [assetPath, mediaType, resourceRef, savedStartTime, surfaceId, surfaceKind],
  );

  const pausePlayback = useCallback(
    (currentTime: number) => {
      const vscode = getGlobalVSCodeApi();
      const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
      if (!vscode || !sourceKey) return;
      vscode.postMessage({ type: 'media:pause', nodeId: surfaceId });
      isPausedRef.current = true;
      lastProgressSyncRef.current = {
        currentTime,
        updatedAtMs: getMonotonicTimeMs(),
      };
      usePlaybackStore.getState().savePlayback(sourceKey, {
        currentTime,
        duration: streamDurationRef.current,
        wasPlaying: true,
      });
      usePlaybackStore.getState().updateActivePlayback(sourceKey, surfaceId, {
        currentTime,
        isPlaying: false,
      });
      currentTimeRef.current = currentTime;
    },
    [assetPath, resourceRef, surfaceId],
  );

  const resumePlayback = useCallback(() => {
    const vscode = getGlobalVSCodeApi();
    const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
    if (!vscode || !sourceKey) return;
    vscode.postMessage({ type: 'media:resume', nodeId: surfaceId });
    isPausedRef.current = false;
    usePlaybackStore.getState().updateActivePlayback(sourceKey, surfaceId, { isPlaying: true });
  }, [assetPath, resourceRef, surfaceId]);

  const seekPlayback = useCallback(
    (time: number) => {
      const vscode = getGlobalVSCodeApi();
      const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
      if (!vscode || !sourceKey) return;
      vscode.postMessage({ type: 'media:seek', nodeId: surfaceId, time });
      lastProgressSyncRef.current = {
        currentTime: time,
        updatedAtMs: getMonotonicTimeMs(),
      };
      usePlaybackStore.getState().updateActivePlayback(sourceKey, surfaceId, { currentTime: time });
      currentTimeRef.current = time;
    },
    [assetPath, resourceRef, surfaceId],
  );

  const updatePlaybackProgress = useCallback(
    (currentTime: number) => {
      const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
      if (!sourceKey) return false;
      currentTimeRef.current = currentTime;
      const now = getMonotonicTimeMs();
      const last = lastProgressSyncRef.current;
      const shouldSync =
        Math.abs(currentTime - last.currentTime) >= PLAYBACK_PROGRESS_SYNC_DELTA_SECONDS ||
        now - last.updatedAtMs >= PLAYBACK_PROGRESS_SYNC_INTERVAL_MS;
      if (!shouldSync) return false;

      lastProgressSyncRef.current = { currentTime, updatedAtMs: now };
      usePlaybackStore.getState().updateActivePlayback(sourceKey, surfaceId, {
        currentTime,
        duration: streamDurationRef.current,
      });
      return true;
    },
    [assetPath, resourceRef, surfaceId],
  );

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);

  const stopPlayback = useCallback(
    (currentTime: number) => {
      if (stoppedPlaybackRef.current) return;
      stoppedPlaybackRef.current = true;
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current);
        listenerRef.current = null;
      }
      const vscode = getGlobalVSCodeApi();
      if (vscode && createMediaPlaybackSourceKey(assetPath, resourceRef)) {
        vscode.postMessage({ type: 'media:stop', nodeId: surfaceId });
      }
      const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
      if (sourceKey) {
        const playbackStore = usePlaybackStore.getState();
        playbackStore.savePlayback(sourceKey, {
          currentTime,
          duration: streamDurationRef.current,
          wasPlaying: false,
        });
        lastProgressSyncRef.current = {
          currentTime,
          updatedAtMs: getMonotonicTimeMs(),
        };
        playbackStore.stopActivePlayback(sourceKey, surfaceId, currentTime);
      }
      setStream(null);
      isPausedRef.current = false;
    },
    [assetPath, resourceRef, surfaceId],
  );

  usePlaybackHandoff({
    assetPath,
    resourceRef,
    mediaType,
    surfaceId,
    surfaceKind,
    stream,
    probing,
    getCurrentTime,
    startPlayback,
    stopPlayback,
  });

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current);
      }
    };
  }, []);

  return {
    stream,
    probing,
    isPaused: isPausedRef.current,
    surfaceId,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
  };
}

function createMediaPlaybackSourceKey(
  assetPath: string | undefined,
  resourceRef: ResourceRef | undefined,
): string | undefined {
  if (assetPath) return assetPath;
  if (resourceRef) return `resource:${resourceRef.id}`;
  return undefined;
}

interface PlaybackHandoffOptions {
  assetPath: string | undefined;
  resourceRef: ResourceRef | undefined;
  mediaType: 'video' | 'audio';
  surfaceId: string;
  surfaceKind: PlaybackSurfaceKind;
  stream: MediaStreamState | null;
  probing: boolean;
  getCurrentTime: () => number;
  startPlayback: (resumeFromTime?: number) => void;
  stopPlayback: (currentTime: number) => void;
}

function usePlaybackHandoff({
  assetPath,
  resourceRef,
  mediaType,
  surfaceId,
  surfaceKind,
  stream,
  probing,
  getCurrentTime,
  startPlayback,
  stopPlayback,
}: PlaybackHandoffOptions): void {
  const sourceKey = createMediaPlaybackSourceKey(assetPath, resourceRef);
  const requestedMountHandoffRef = useRef(false);
  const handledHandoffRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sourceKey || !stream) return;
    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const request = state.handoffRequest;
      const requestKey = request ? handoffRequestKey(request) : null;
      if (
        request?.sourceKey === sourceKey &&
        request.fromSurfaceId === surfaceId &&
        requestKey &&
        handledHandoffRef.current !== requestKey
      ) {
        handledHandoffRef.current = requestKey;
        stopPlayback(request.startTime);
      }
    });
    return unsubscribe;
  }, [sourceKey, stopPlayback, stream, surfaceId]);

  useEffect(() => {
    if (!sourceKey || stream || probing) return;
    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const request = state.handoffRequest;
      if (
        request?.sourceKey === sourceKey &&
        request.toKind === surfaceKind &&
        state.activePlayback === null
      ) {
        const consumed = usePlaybackStore.getState().consumeHandoff(sourceKey, surfaceKind);
        if (consumed) {
          startPlayback(consumed.startTime);
        }
      }
    });
    return unsubscribe;
  }, [probing, sourceKey, startPlayback, stream, surfaceKind]);

  useEffect(() => {
    if (surfaceKind !== 'overlay' || !sourceKey || stream || probing) return;
    if (requestedMountHandoffRef.current) return;
    const active = usePlaybackStore.getState().activePlayback;
    if (
      active &&
      active.sourceKey === sourceKey &&
      active.surfaceId !== surfaceId &&
      active.isPlaying
    ) {
      requestedMountHandoffRef.current = true;
      usePlaybackStore.getState().requestHandoff({
        sourceKey,
        ...(assetPath ? { assetPath } : {}),
        mediaType,
        fromSurfaceId: active.surfaceId,
        toKind: 'overlay',
        startTime: active.currentTime,
      });
    }
  }, [assetPath, mediaType, probing, sourceKey, stream, surfaceId, surfaceKind]);

  useEffect(() => {
    if (!stream) return;
    return () => {
      const active = usePlaybackStore.getState().activePlayback;
      if (
        surfaceKind === 'overlay' &&
        sourceKey &&
        active?.sourceKey === sourceKey &&
        active.surfaceId === surfaceId &&
        active.isPlaying
      ) {
        usePlaybackStore.getState().requestHandoff({
          sourceKey,
          ...(assetPath ? { assetPath } : {}),
          mediaType,
          fromSurfaceId: surfaceId,
          toKind: 'inline',
          startTime: getCurrentTime(),
        });
      }
      stopPlayback(getCurrentTime());
    };
  }, [
    assetPath,
    getCurrentTime,
    mediaType,
    sourceKey,
    stopPlayback,
    stream,
    surfaceId,
    surfaceKind,
  ]);
}

function handoffRequestKey(request: {
  readonly fromSurfaceId: string;
  readonly sourceKey?: string;
  readonly toKind: PlaybackSurfaceKind;
  readonly startTime: number;
}): string {
  return `${request.sourceKey ?? ''}:${request.fromSurfaceId}:${request.toKind}:${request.startTime}`;
}

// =============================================================================
// Renderers
// =============================================================================

function VisualPreviewRenderer({
  source,
  surfaceKind = 'inline',
  chrome = 'contained',
}: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(source);
  const url = variant?.runtimeUrl ?? getStableSafeUrl(source);

  if (!url) {
    return renderFallbackPreview({ source, chrome });
  }

  return (
    <div
      className={getVisualPreviewFrameClassName(surfaceKind, chrome)}
      data-preview-surface="visual"
      data-preview-chrome={chrome}
    >
      <img
        src={url}
        alt={source.title ?? source.id}
        className={getVisualPreviewImageClassName(surfaceKind, chrome)}
      />
    </div>
  );
}

function getVisualPreviewFrameClassName(
  surfaceKind: PlaybackSurfaceKind,
  chrome: NonNullable<PreviewRendererProps['chrome']>,
): string {
  if (chrome === 'full-bleed') {
    return 'relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black/20';
  }
  const base =
    'relative flex min-h-[80px] items-center justify-center overflow-hidden rounded border border-[var(--node-border)] bg-black/20';
  if (surfaceKind === 'overlay') {
    return `${base} max-h-[52vh]`;
  }
  return base;
}

function getVisualPreviewImageClassName(
  surfaceKind: PlaybackSurfaceKind,
  chrome: NonNullable<PreviewRendererProps['chrome']>,
): string {
  if (surfaceKind === 'overlay' && chrome === 'full-bleed') {
    return 'h-full max-h-full w-full object-contain';
  }
  if (surfaceKind === 'overlay') {
    return 'max-h-[52vh] w-full object-contain';
  }
  return 'h-full w-full object-contain';
}

function VideoPreviewRenderer({
  source,
  surfaceKind = 'inline',
  playbackControl,
  chrome = 'contained',
}: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(source, 'video-poster');
  const thumbnailUrl =
    readImagePreviewUrl(variant?.runtimeUrl) ?? readImagePreviewUrl(getStableSafeUrl(source));
  const assetPath = source.asset?.path;
  const resourceRef = readPreviewSourceResourceRef(source);
  const capturedFrame = useCaptureFrame(assetPath, source.id, resourceRef);
  const canStartPlayback = Boolean(assetPath || resourceRef);
  const {
    stream,
    probing,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
  } = useMediaStream(assetPath, 'video', surfaceKind, resourceRef);

  const posterUrl = capturedFrame ?? thumbnailUrl;
  const consumedPlaybackRequestRef = useRef<string | undefined>();

  useEffect(() => {
    if (
      !playbackControl?.requestId ||
      consumedPlaybackRequestRef.current === playbackControl.requestId ||
      playbackControl.state !== 'playing' ||
      stream ||
      probing ||
      !canStartPlayback
    ) {
      return;
    }
    consumedPlaybackRequestRef.current = playbackControl.requestId;
    startPlayback(playbackControl.startTimeSeconds);
  }, [
    canStartPlayback,
    playbackControl?.requestId,
    playbackControl?.startTimeSeconds,
    playbackControl?.state,
    probing,
    startPlayback,
    stream,
  ]);

  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      const synced = updatePlaybackProgress(currentTime);
      if (!synced || !stream) return;
      playbackControl?.onTimeUpdate?.({
        sourceId: source.id,
        currentTime,
        duration: stream.duration,
      });
    },
    [playbackControl?.onTimeUpdate, source.id, stream, updatePlaybackProgress],
  );

  const handleEnded = useCallback(
    (currentTime: number) => {
      playbackControl?.onEnded?.({
        sourceId: source.id,
        mediaType: 'video',
        currentTime,
        duration: stream?.duration ?? currentTime,
      });
    },
    [playbackControl?.onEnded, source.id, stream?.duration],
  );

  if (stream) {
    return (
      <div
        className={getMediaPreviewFrameClassName(chrome, 'bg-black')}
        data-preview-surface="video"
        data-preview-chrome={chrome}
      >
        <InlineVideoPlayer
          videoStreamUrl={stream.videoStreamUrl}
          audioStreamUrl={stream.audioStreamUrl}
          width={stream.width}
          height={stream.height}
          fps={stream.fps}
          duration={stream.duration}
          startTime={stream.startTime}
          onPause={pausePlayback}
          onResume={resumePlayback}
          onSeek={seekPlayback}
          onTimeUpdate={handleTimeUpdate}
          onStop={stopPlayback}
          playbackState={playbackControl?.state}
          playbackRequestId={playbackControl?.requestId}
          playbackStartTime={playbackControl?.startTimeSeconds}
          onEnded={handleEnded}
        />
      </div>
    );
  }

  return (
    <div
      className={getMediaPreviewFrameClassName(chrome, 'bg-black/30')}
      data-preview-surface="video"
      data-preview-chrome={chrome}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={source.title ?? source.id}
          className="h-full w-full object-cover"
        />
      ) : null}
      <button
        type="button"
        className="absolute inset-0 flex items-center justify-center text-white/80 hover:text-white"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          startPlayback();
        }}
        disabled={probing || !canStartPlayback}
      >
        {probing ? '...' : '▶'}
      </button>
    </div>
  );
}

function readImagePreviewUrl(url: string | undefined): string | undefined {
  return url && isImagePreviewUrl(url) ? url : undefined;
}

function AudioPreviewRenderer({
  source,
  delegateActions,
  surfaceKind = 'inline',
  playbackControl,
  chrome = 'contained',
}: PreviewRendererProps): React.ReactNode {
  const assetPath = source.asset?.path;
  const resourceRef = readPreviewSourceResourceRef(source);
  const canStartPlayback = Boolean(assetPath || resourceRef);
  const {
    stream,
    probing,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
  } = useMediaStream(assetPath, 'audio', surfaceKind, resourceRef);
  const consumedPlaybackRequestRef = useRef<string | undefined>();

  useEffect(() => {
    if (
      !playbackControl?.requestId ||
      consumedPlaybackRequestRef.current === playbackControl.requestId ||
      playbackControl.state !== 'playing' ||
      stream ||
      probing ||
      !canStartPlayback
    ) {
      return;
    }
    consumedPlaybackRequestRef.current = playbackControl.requestId;
    startPlayback(playbackControl.startTimeSeconds);
  }, [
    canStartPlayback,
    playbackControl?.requestId,
    playbackControl?.startTimeSeconds,
    playbackControl?.state,
    probing,
    startPlayback,
    stream,
  ]);

  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      const synced = updatePlaybackProgress(currentTime);
      if (!synced || !stream) return;
      playbackControl?.onTimeUpdate?.({
        sourceId: source.id,
        currentTime,
        duration: stream.duration,
      });
    },
    [playbackControl?.onTimeUpdate, source.id, stream, updatePlaybackProgress],
  );

  const handleEnded = useCallback(
    (currentTime: number) => {
      playbackControl?.onEnded?.({
        sourceId: source.id,
        mediaType: 'audio',
        currentTime,
        duration: stream?.duration ?? currentTime,
      });
    },
    [playbackControl?.onEnded, source.id, stream?.duration],
  );

  if (stream && stream.audioStreamUrl) {
    return (
      <div
        className={getAudioPreviewFrameClassName(chrome)}
        data-preview-surface="audio"
        data-preview-chrome={chrome}
      >
        <InlineAudioPlayer
          audioStreamUrl={stream.audioStreamUrl}
          duration={stream.duration}
          startTime={stream.startTime}
          onPause={pausePlayback}
          onResume={resumePlayback}
          onSeek={seekPlayback}
          onTimeUpdate={handleTimeUpdate}
          onStop={stopPlayback}
          playbackState={playbackControl?.state}
          playbackRequestId={playbackControl?.requestId}
          playbackStartTime={playbackControl?.startTimeSeconds}
          onEnded={handleEnded}
        />
      </div>
    );
  }

  return (
    <div
      className={getAudioPreviewFrameClassName(chrome)}
      data-preview-surface="audio"
      data-preview-chrome={chrome}
    >
      <div className="mb-2 flex h-8 items-end gap-0.5">
        {Array.from({ length: 24 }).map((_, index) => (
          <div
            key={index}
            className="w-1 rounded-sm bg-[var(--node-selected)] opacity-70"
            style={{ height: `${20 + ((index * 17) % 60)}%` }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--node-selected)] text-xs text-white"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            startPlayback();
          }}
          disabled={probing || !canStartPlayback}
        >
          {probing ? '...' : '▶'}
        </button>
        <span className="truncate text-xs text-[var(--node-fg-secondary)]">
          {source.title ?? source.asset?.path ?? source.id}
        </span>
        {delegateActions && delegateActions.length > 0 && (
          <button
            type="button"
            className="ml-auto flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1 text-xs"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
            }}
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

function getMediaPreviewFrameClassName(
  chrome: NonNullable<PreviewRendererProps['chrome']>,
  backgroundClass: string,
): string {
  const frame =
    chrome === 'full-bleed'
      ? 'relative h-full min-h-0 w-full overflow-hidden'
      : 'relative min-h-[90px] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--control-border)]';
  return `${frame} ${backgroundClass}`;
}

function getAudioPreviewFrameClassName(
  chrome: NonNullable<PreviewRendererProps['chrome']>,
): string {
  return chrome === 'full-bleed'
    ? 'h-full min-h-0 w-full bg-black/20 p-2'
    : 'rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-black/20 p-2';
}

function readPreviewSourceResourceRef(source: PreviewSourceDescriptor): ResourceRef | undefined {
  const ref = source.metadata?.['resourceRef'];
  return isResourceRef(ref) ? ref : undefined;
}

function useProjectThumbnail(assetPath: string | undefined, nodeId: string): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!assetPath || requestedRef.current) return;
    const vscode = getGlobalVSCodeApi();
    if (!vscode) return;

    const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
    requestedRef.current = true;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (msg.type === 'project:thumbnailResult' && msg.nodeId === nodeId) {
        if (typeof msg.dataUrl === 'string') {
          setThumbnailUrl(msg.dataUrl);
        }
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({
      type: 'project:resolveThumbnail',
      nodeId,
      projectPath: assetPath,
      projectType: ext,
    });

    return () => window.removeEventListener('message', handleMessage);
  }, [assetPath, nodeId]);

  return thumbnailUrl;
}

function ProjectPreviewRenderer({
  source,
  delegateActions,
}: PreviewRendererProps): React.ReactNode {
  const assetPath = source.asset?.path;
  const ext = assetPath?.split('.').pop()?.toLowerCase() ?? '';
  const thumbnailUrl = useProjectThumbnail(assetPath, source.id);
  const typeLabel = resolveProjectTypeLabel(source.metadata?.['projectType'], ext);

  return (
    <div className="relative flex min-h-[80px] flex-col overflow-hidden rounded border border-[var(--node-border)] bg-black/20">
      {thumbnailUrl ? (
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={source.title ?? source.id}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-[var(--node-fg-secondary)]">
          <span className="text-sm font-medium uppercase opacity-40">{ext || 'nk'}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--node-border)] px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-[var(--node-fg)]">
            {source.title ?? source.asset?.path ?? source.id}
          </div>
          <div className="text-[10px] text-[var(--node-fg-secondary)]">{typeLabel}</div>
        </div>
        {delegateActions && delegateActions.length > 0 && (
          <button
            type="button"
            className="flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1 text-xs"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
            }}
          >
            {t('preview.open')}
          </button>
        )}
      </div>
    </div>
  );
}

function resolveProjectTypeLabel(value: unknown, defaultExt: string): string {
  void value;
  void defaultExt;
  return t('node.project');
}

function getStableSafeUrl(source: PreviewSourceDescriptor): string | undefined {
  const variant = source.variants?.find((v) => v.role === source.role);
  const url = variant?.sourcePath;
  if (!url) {
    return undefined;
  }
  if (source.role === 'video-poster') {
    return isImagePreviewUrl(url) ? url : undefined;
  }
  return isSafeWebviewUrl(url) ? url : undefined;
}

function renderFallbackPreview({
  source,
  delegateActions,
  chrome = 'contained',
}: PreviewRendererProps): React.ReactNode {
  return (
    <div
      className={
        chrome === 'full-bleed'
          ? 'flex h-full min-h-0 w-full items-center justify-between gap-2 bg-black/20 px-2 text-xs text-[var(--node-fg-secondary)]'
          : 'flex min-h-[72px] items-center justify-between gap-2 rounded border border-dashed border-[var(--node-border)] bg-black/20 px-2 text-xs text-[var(--node-fg-secondary)]'
      }
      data-preview-surface="fallback"
      data-preview-chrome={chrome}
    >
      <span className="min-w-0 truncate">{source.title ?? source.asset?.path ?? source.id}</span>
      {delegateActions && delegateActions.length > 0 && (
        <button
          type="button"
          className="flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
          }}
        >
          Open
        </button>
      )}
    </div>
  );
}

function FallbackPreviewRenderer(props: PreviewRendererProps): React.ReactNode {
  return renderFallbackPreview(props);
}
