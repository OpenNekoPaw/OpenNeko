import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { contentLocatorKey, type DelegateAction, type ContentLocator } from '@neko/shared';
import {
  formatMediaTime as formatTime,
  isMediaTransport,
  isMediaTransportUrl,
  type HtmlVideoDescriptor,
  type PcmStreamDescriptor,
} from '@neko/media';
import { dispatchPreviewDelegate } from './previewDelegates';
import { isImagePreviewUrl, isSafeWebviewUrl, WebviewPreviewResolver } from './previewResolver';
import { PreviewRuntime } from './previewRuntime';
import type {
  PreviewPlaybackControl,
  PreviewSourceDescriptor,
  RuntimePreviewVariant,
} from './types';
import { InlineVideoPlayer } from '../components/media/InlineVideoPlayer';
import {
  AudioPlayerSurface,
  InlineAudioPlayer,
  type AudioPlayerLayout,
} from '../components/media/InlineAudioPlayer';
import { usePlaybackStoreApi } from '../stores/canvasStoreScope';
import type { PlaybackSurfaceKind } from '../stores/playbackStore';
import { useOptionalCanvasHost } from '../host-runtime';
import { t } from '../i18n';

export interface PreviewRendererProps {
  source: PreviewSourceDescriptor;
  runtime?: PreviewRuntime;
  delegateActions?: DelegateAction[];
  surfaceKind?: PlaybackSurfaceKind;
  playbackControl?: PreviewPlaybackControl;
  chrome?: 'contained' | 'full-bleed';
  audioLayout?: AudioPlayerLayout;
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
    'generation-candidate': VisualPreviewRenderer,
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
  const host = useOptionalCanvasHost();
  const resolver = useMemo(() => new WebviewPreviewResolver(host), [host]);
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
  contentLocator: ContentLocator | undefined,
): string | null {
  const host = useOptionalCanvasHost();
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!assetPath || requestedRef.current) return;
    const hostPort = host;
    if (!hostPort) return;

    requestedRef.current = true;

    const handleMessage = (message: unknown) => {
      if (!isRecord(message)) return;
      const msg = message;
      if (msg.type === 'media:captureFrameResult' && msg.nodeId === nodeId) {
        if (typeof msg.dataUrl === 'string') {
          setFrameUrl(msg.dataUrl);
        }
      }
    };

    const unsubscribe = hostPort.subscribe(handleMessage);
    hostPort.postMessage({
      type: 'media:captureFrame',
      nodeId,
      assetPath,
      ...(contentLocator ? { contentLocator } : {}),
      time: 1,
    });

    return unsubscribe;
  }, [assetPath, host, nodeId, contentLocator]);

  return frameUrl;
}

// =============================================================================
// Media stream hook (with pause/resume/seek support)
// =============================================================================

interface MediaStreamState {
  video: HtmlVideoDescriptor | null;
  audio: PcmStreamDescriptor | null;
  audioContext: AudioContext | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
  startTime: number;
  playbackRate: number;
}

interface MediaDescription {
  readonly duration: number;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly hasAudio?: boolean;
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

function normalizePlaybackStartTime(startTime: number, duration: number): number {
  const normalized = Number.isFinite(startTime) ? Math.max(0, startTime) : 0;
  return duration > 0 && normalized >= duration ? 0 : normalized;
}

function useMediaStream(
  assetPath: string | undefined,
  mediaType: 'video' | 'audio',
  surfaceKind: PlaybackSurfaceKind,
  contentLocator: ContentLocator | undefined,
  knownDuration: number,
  persistence: 'surface' | 'transient',
) {
  const host = useOptionalCanvasHost();
  const playbackStoreApi = usePlaybackStoreApi();
  const [surfaceId] = useState(() => createPlaybackSurfaceId(mediaType));
  const [stream, setStream] = useState<MediaStreamState | null>(null);
  const [mediaDescription, setMediaDescription] = useState<MediaDescription>(() => ({
    duration: knownDuration,
  }));
  const [probing, setProbing] = useState(false);
  const isPausedRef = useRef(false);
  const mediaInfoRef = useRef<Record<string, unknown> | null>(null);
  const pendingPlaybackStartRef = useRef<number | null>(null);
  const requestProbeRef = useRef<() => void>(() => undefined);
  const streamDurationRef = useRef(0);
  const stoppedPlaybackRef = useRef(true);
  const playbackRequestSentRef = useRef(false);
  const playbackAudioContextRef = useRef<AudioContext>();

  const closePlaybackAudioContext = useCallback(() => {
    const context = playbackAudioContextRef.current;
    playbackAudioContextRef.current = undefined;
    if (context && context.state !== 'closed') void context.close();
  }, []);

  const primePlaybackAudioContext = useCallback((): AudioContext => {
    let context = playbackAudioContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContext({ sampleRate: 48_000 });
      playbackAudioContextRef.current = context;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }, []);

  const [savedStartTime] = useState(() => {
    if (persistence === 'transient') return 0;
    const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
    if (!sourceKey) return 0;
    const playbackStore = playbackStoreApi.getState();
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

  const postPlaybackRequest = useCallback(
    (mediaInfo: Record<string, unknown>, startTime: number) => {
      const hostPort = host;
      if (!hostPort) return;
      playbackRequestSentRef.current = true;
      hostPort.postMessage({
        type: 'media:play',
        nodeId: surfaceId,
        ...(assetPath ? { assetPath } : {}),
        ...(contentLocator ? { contentLocator } : {}),
        mediaInfo,
        mediaType,
        startTime,
        speed: 1.0,
      });
    },
    [assetPath, host, mediaType, contentLocator, surfaceId],
  );

  useEffect(() => {
    const hostPort = host;
    const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
    if (!hostPort || !sourceKey) {
      setProbing(false);
      return;
    }

    mediaInfoRef.current = null;
    pendingPlaybackStartRef.current = null;
    streamDurationRef.current = knownDuration;
    setMediaDescription({ duration: knownDuration });
    let probeRequested = false;
    const requestProbe = () => {
      if (probeRequested) return;
      probeRequested = true;
      setProbing(true);
      hostPort.postMessage({
        type: 'media:probe',
        nodeId: surfaceId,
        ...(assetPath ? { assetPath } : {}),
        ...(contentLocator ? { contentLocator } : {}),
        mediaType,
      });
    };
    requestProbeRef.current = requestProbe;

    const handleMessage = (message: unknown) => {
      if (!isRecord(message)) return;
      const msg = message;
      if (msg.type === 'media:probeResult' && msg.nodeId === surfaceId) {
        setProbing(false);
        if (msg.error) {
          probeRequested = false;
          pendingPlaybackStartRef.current = null;
          closePlaybackAudioContext();
          return;
        }
        if (!isRecord(msg.mediaInfo)) {
          throw new Error(`Media probe for "${sourceKey}" returned invalid mediaInfo.`);
        }
        const mediaInfo = msg.mediaInfo;
        const description = readMediaDescription(mediaInfo, knownDuration);
        mediaInfoRef.current = mediaInfo;
        streamDurationRef.current = description.duration;
        setMediaDescription(description);

        const pendingStartTime = pendingPlaybackStartRef.current;
        if (pendingStartTime !== null) {
          pendingPlaybackStartRef.current = null;
          postPlaybackRequest(mediaInfo, pendingStartTime);
        }
      }
      if (msg.type === 'media:streamReady' && msg.nodeId === surfaceId) {
        setProbing(false);
        if (stoppedPlaybackRef.current) {
          closePlaybackAudioContext();
          return;
        }
        if (msg.error) {
          closePlaybackAudioContext();
          return;
        }
        if (!isRecord(msg.mediaInfo)) {
          throw new Error(`Media stream for "${sourceKey}" returned invalid mediaInfo.`);
        }
        const description = readMediaDescription(msg.mediaInfo, knownDuration);
        const startTime = currentTimeRef.current;
        const video = readHtmlVideoDescriptor(msg.video);
        const audio = readPcmStreamDescriptor(msg.audio);
        if (mediaType === 'video' && !video) {
          throw new Error(`Media stream for "${sourceKey}" returned no HTML video descriptor.`);
        }
        if (mediaType === 'audio' && !audio) {
          throw new Error(`Media stream for "${sourceKey}" returned no PCM audio descriptor.`);
        }
        const audioContext = audio
          ? (playbackAudioContextRef.current ?? primePlaybackAudioContext())
          : null;
        if (!audio) closePlaybackAudioContext();
        streamDurationRef.current = description.duration;
        setMediaDescription(description);
        if (persistence === 'surface') {
          playbackStoreApi.getState().startActivePlayback({
            sourceKey,
            ...(assetPath ? { assetPath } : {}),
            mediaType,
            surfaceId,
            surfaceKind,
            currentTime: startTime,
            duration: description.duration,
          });
        }
        lastProgressSyncRef.current = {
          currentTime: startTime,
          updatedAtMs: getMonotonicTimeMs(),
        };
        setStream({
          video,
          audio,
          audioContext,
          width: description.width ?? 640,
          height: description.height ?? 360,
          fps: description.fps ?? 30,
          duration: description.duration,
          startTime: typeof msg.startTime === 'number' ? msg.startTime : startTime,
          playbackRate: typeof msg.playbackRate === 'number' ? msg.playbackRate : 1,
        });
      }
    };

    const unsubscribe = hostPort.subscribe(handleMessage);
    requestProbe();

    return () => {
      unsubscribe();
      requestProbeRef.current = () => undefined;
    };
  }, [
    assetPath,
    closePlaybackAudioContext,
    knownDuration,
    host,
    mediaType,
    postPlaybackRequest,
    persistence,
    primePlaybackAudioContext,
    contentLocator,
    surfaceId,
    surfaceKind,
  ]);

  const startPlayback = useCallback(
    (resumeFromTime?: number) => {
      const hostPort = host;
      const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
      if (!hostPort || !sourceKey) return;

      const playbackStore = playbackStoreApi.getState();
      if (persistence === 'surface') {
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
      }

      isPausedRef.current = false;
      stoppedPlaybackRef.current = false;
      primePlaybackAudioContext();

      const sourceHandoff = playbackStore.consumeHandoff(sourceKey, surfaceKind);
      const requestedStartTime =
        resumeFromTime ??
        (persistence === 'surface' ? sourceHandoff?.startTime : undefined) ??
        (persistence === 'surface'
          ? playbackStore.getPlayback(sourceKey)?.currentTime
          : undefined) ??
        savedStartTime;
      const startTime = normalizePlaybackStartTime(requestedStartTime, streamDurationRef.current);
      currentTimeRef.current = startTime;
      const mediaInfo = mediaInfoRef.current;
      if (mediaInfo) {
        postPlaybackRequest(mediaInfo, startTime);
        return;
      }
      pendingPlaybackStartRef.current = startTime;
      requestProbeRef.current();
    },
    [
      assetPath,
      host,
      mediaType,
      postPlaybackRequest,
      persistence,
      primePlaybackAudioContext,
      contentLocator,
      savedStartTime,
      surfaceId,
      surfaceKind,
    ],
  );

  const pausePlayback = useCallback(
    (currentTime: number) => {
      const hostPort = host;
      const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
      if (!hostPort || !sourceKey) return;
      hostPort.postMessage({ type: 'media:pause', nodeId: surfaceId });
      isPausedRef.current = true;
      lastProgressSyncRef.current = {
        currentTime,
        updatedAtMs: getMonotonicTimeMs(),
      };
      if (persistence === 'surface') {
        playbackStoreApi.getState().savePlayback(sourceKey, {
          currentTime,
          duration: streamDurationRef.current,
          wasPlaying: true,
        });
        playbackStoreApi.getState().updateActivePlayback(sourceKey, surfaceId, {
          currentTime,
          isPlaying: false,
        });
      }
      currentTimeRef.current = currentTime;
    },
    [assetPath, host, persistence, contentLocator, surfaceId],
  );

  const resumePlayback = useCallback(() => {
    const hostPort = host;
    const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
    if (!hostPort || !sourceKey) return;
    hostPort.postMessage({ type: 'media:resume', nodeId: surfaceId });
    isPausedRef.current = false;
    if (persistence === 'surface') {
      playbackStoreApi.getState().updateActivePlayback(sourceKey, surfaceId, { isPlaying: true });
    }
  }, [assetPath, host, persistence, contentLocator, surfaceId]);

  const seekPlayback = useCallback(
    (time: number) => {
      const hostPort = host;
      const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
      if (!hostPort || !sourceKey) return;
      hostPort.postMessage({ type: 'media:seek', nodeId: surfaceId, time });
      lastProgressSyncRef.current = {
        currentTime: time,
        updatedAtMs: getMonotonicTimeMs(),
      };
      if (persistence === 'surface') {
        playbackStoreApi.getState().updateActivePlayback(sourceKey, surfaceId, {
          currentTime: time,
        });
      }
      currentTimeRef.current = time;
    },
    [assetPath, host, persistence, contentLocator, surfaceId],
  );

  const updatePlaybackProgress = useCallback(
    (currentTime: number) => {
      const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
      if (!sourceKey) return false;
      currentTimeRef.current = currentTime;
      if (persistence === 'transient') return false;
      const now = getMonotonicTimeMs();
      const last = lastProgressSyncRef.current;
      const shouldSync =
        Math.abs(currentTime - last.currentTime) >= PLAYBACK_PROGRESS_SYNC_DELTA_SECONDS ||
        now - last.updatedAtMs >= PLAYBACK_PROGRESS_SYNC_INTERVAL_MS;
      if (!shouldSync) return false;

      lastProgressSyncRef.current = { currentTime, updatedAtMs: now };
      playbackStoreApi.getState().updateActivePlayback(sourceKey, surfaceId, {
        currentTime,
        duration: streamDurationRef.current,
      });
      return true;
    },
    [assetPath, persistence, contentLocator, surfaceId],
  );

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);

  const stopPlayback = useCallback(
    (currentTime: number) => {
      const playbackRequestSent = playbackRequestSentRef.current;
      pendingPlaybackStartRef.current = null;
      playbackRequestSentRef.current = false;
      stoppedPlaybackRef.current = true;
      const hostPort = host;
      if (
        playbackRequestSent &&
        hostPort &&
        createMediaPlaybackSourceKey(assetPath, contentLocator)
      ) {
        hostPort.postMessage({ type: 'media:stop', nodeId: surfaceId });
      }
      const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
      if (playbackRequestSent && sourceKey && persistence === 'surface') {
        const playbackStore = playbackStoreApi.getState();
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
      closePlaybackAudioContext();
    },
    [assetPath, closePlaybackAudioContext, host, persistence, contentLocator, surfaceId],
  );

  useEffect(
    () => () => {
      stopPlayback(currentTimeRef.current);
    },
    [stopPlayback],
  );
  useEffect(() => closePlaybackAudioContext, [closePlaybackAudioContext]);

  usePlaybackHandoff({
    enabled: persistence === 'surface',
    assetPath,
    contentLocator,
    mediaType,
    surfaceId,
    surfaceKind,
    stream,
    probing,
    getCurrentTime,
    startPlayback,
    stopPlayback,
  });

  return {
    stream,
    mediaDescription,
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

function readMediaDescription(
  mediaInfo: Record<string, unknown>,
  knownDuration: number,
): MediaDescription {
  const duration = readPositiveFiniteNumber(mediaInfo['duration']) ?? knownDuration;
  return {
    duration,
    ...(readPositiveFiniteNumber(mediaInfo['width']) !== undefined
      ? { width: readPositiveFiniteNumber(mediaInfo['width']) }
      : {}),
    ...(readPositiveFiniteNumber(mediaInfo['height']) !== undefined
      ? { height: readPositiveFiniteNumber(mediaInfo['height']) }
      : {}),
    ...(readPositiveFiniteNumber(mediaInfo['fps']) !== undefined
      ? { fps: readPositiveFiniteNumber(mediaInfo['fps']) }
      : {}),
    ...(typeof mediaInfo['hasAudio'] === 'boolean' ? { hasAudio: mediaInfo['hasAudio'] } : {}),
  };
}

function readPositiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createMediaPlaybackSourceKey(
  assetPath: string | undefined,
  contentLocator: ContentLocator | undefined,
): string | undefined {
  if (assetPath) return assetPath;
  if (contentLocator) return `content:${contentLocatorKey(contentLocator)}`;
  return undefined;
}

interface PlaybackHandoffOptions {
  enabled: boolean;
  assetPath: string | undefined;
  contentLocator: ContentLocator | undefined;
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
  enabled,
  assetPath,
  contentLocator,
  mediaType,
  surfaceId,
  surfaceKind,
  stream,
  probing,
  getCurrentTime,
  startPlayback,
  stopPlayback,
}: PlaybackHandoffOptions): void {
  const playbackStoreApi = usePlaybackStoreApi();
  const sourceKey = createMediaPlaybackSourceKey(assetPath, contentLocator);
  const requestedMountHandoffRef = useRef(false);
  const handledHandoffRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !sourceKey || !stream) return;
    const unsubscribe = playbackStoreApi.subscribe((state) => {
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
  }, [enabled, sourceKey, stopPlayback, stream, surfaceId]);

  useEffect(() => {
    if (!enabled || !sourceKey || stream || probing) return;
    const unsubscribe = playbackStoreApi.subscribe((state) => {
      const request = state.handoffRequest;
      if (
        request?.sourceKey === sourceKey &&
        request.toKind === surfaceKind &&
        state.activePlayback === null
      ) {
        const consumed = playbackStoreApi.getState().consumeHandoff(sourceKey, surfaceKind);
        if (consumed) {
          startPlayback(consumed.startTime);
        }
      }
    });
    return unsubscribe;
  }, [enabled, probing, sourceKey, startPlayback, stream, surfaceKind]);

  useEffect(() => {
    if (!enabled || surfaceKind !== 'overlay' || !sourceKey || stream || probing) return;
    if (requestedMountHandoffRef.current) return;
    const active = playbackStoreApi.getState().activePlayback;
    if (
      active &&
      active.sourceKey === sourceKey &&
      active.surfaceId !== surfaceId &&
      active.isPlaying
    ) {
      requestedMountHandoffRef.current = true;
      playbackStoreApi.getState().requestHandoff({
        sourceKey,
        ...(assetPath ? { assetPath } : {}),
        mediaType,
        fromSurfaceId: active.surfaceId,
        toKind: 'overlay',
        startTime: active.currentTime,
      });
    }
  }, [assetPath, enabled, mediaType, probing, sourceKey, stream, surfaceId, surfaceKind]);

  useEffect(() => {
    if (!enabled || !stream) return;
    return () => {
      const active = playbackStoreApi.getState().activePlayback;
      if (
        surfaceKind === 'overlay' &&
        sourceKey &&
        active?.sourceKey === sourceKey &&
        active.surfaceId === surfaceId &&
        active.isPlaying
      ) {
        playbackStoreApi.getState().requestHandoff({
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
    enabled,
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
  const contentLocator = readPreviewSourceContentLocator(source);
  const knownDuration = readPreviewSourceDuration(source);
  const capturedFrame = useCaptureFrame(assetPath, source.id, contentLocator);
  const canStartPlayback = Boolean(assetPath || contentLocator);
  const {
    stream,
    probing,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
    mediaDescription,
    surfaceId,
  } = useMediaStream(
    assetPath,
    'video',
    surfaceKind,
    contentLocator,
    knownDuration,
    playbackControl?.persistence ?? 'surface',
  );

  const posterUrl = capturedFrame ?? thumbnailUrl;
  const consumedPlaybackRequestRef = useRef<string | undefined>();
  const onPlaybackTimeUpdate = playbackControl?.onTimeUpdate;
  const onPlaybackEnded = playbackControl?.onEnded;

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

  useEffect(() => {
    if (playbackControl?.state === 'stopped') {
      stopPlayback(playbackControl.startTimeSeconds ?? 0);
    }
  }, [playbackControl?.startTimeSeconds, playbackControl?.state, stopPlayback]);

  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      const synced = updatePlaybackProgress(currentTime);
      if (!synced || !stream) return;
      onPlaybackTimeUpdate?.({
        sourceId: source.id,
        currentTime,
        duration: stream.duration,
      });
    },
    [onPlaybackTimeUpdate, source.id, stream, updatePlaybackProgress],
  );

  const handleEnded = useCallback(
    (currentTime: number) => {
      onPlaybackEnded?.({
        sourceId: source.id,
        mediaType: 'video',
        currentTime,
        duration: stream?.duration ?? currentTime,
      });
    },
    [onPlaybackEnded, source.id, stream?.duration],
  );

  if (stream) {
    return (
      <div
        className={getMediaPreviewFrameClassName(chrome, 'bg-black')}
        data-preview-surface="video"
        data-preview-chrome={chrome}
        data-media-duration={String(stream.duration)}
      >
        <InlineVideoPlayer
          video={stream.video}
          audio={stream.audio}
          audioContext={stream.audioContext ?? undefined}
          width={stream.width}
          height={stream.height}
          fps={stream.fps}
          duration={stream.duration}
          startTime={stream.startTime}
          playbackRate={stream.playbackRate}
          onPause={pausePlayback}
          onResume={resumePlayback}
          onSeek={seekPlayback}
          onTimeUpdate={handleTimeUpdate}
          onStop={stopPlayback}
          playbackState={
            playbackControl?.state === 'stopped' ? 'paused' : (playbackControl?.state ?? 'playing')
          }
          playbackRequestId={
            playbackControl?.requestId ?? `${surfaceId}:${stream.startTime}:${stream.playbackRate}`
          }
          playbackStartTime={playbackControl?.startTimeSeconds ?? stream.startTime}
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
      data-media-duration={
        mediaDescription.duration > 0 ? String(mediaDescription.duration) : undefined
      }
      data-preview-controlled-idle={playbackControl ? 'true' : undefined}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={source.title ?? source.id}
          className="h-full w-full object-cover"
        />
      ) : null}
      {mediaDescription.duration > 0 ? (
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          {formatTime(mediaDescription.duration)}
        </span>
      ) : null}
      {playbackControl ? null : (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center text-white/80 hover:text-white"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            startPlayback();
          }}
          disabled={probing || !canStartPlayback}
          aria-label={t('toolbar.playbackPlay')}
          title={t('toolbar.playbackPlay')}
        >
          {probing ? '...' : '▶'}
        </button>
      )}
    </div>
  );
}

function readImagePreviewUrl(url: string | undefined): string | undefined {
  return url && isImagePreviewUrl(url) ? url : undefined;
}

function AudioPreviewRenderer({
  source,
  surfaceKind = 'inline',
  playbackControl,
  chrome = 'contained',
  audioLayout = 'transport',
}: PreviewRendererProps): React.ReactNode {
  const assetPath = source.asset?.path;
  const contentLocator = readPreviewSourceContentLocator(source);
  const knownDuration = readPreviewSourceDuration(source);
  const canStartPlayback = Boolean(assetPath || contentLocator);
  const {
    stream,
    probing,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
    mediaDescription,
    surfaceId,
  } = useMediaStream(
    assetPath,
    'audio',
    surfaceKind,
    contentLocator,
    knownDuration,
    playbackControl?.persistence ?? 'surface',
  );
  const consumedPlaybackRequestRef = useRef<string | undefined>();
  const onPlaybackTimeUpdate = playbackControl?.onTimeUpdate;
  const onPlaybackEnded = playbackControl?.onEnded;

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

  useEffect(() => {
    if (playbackControl?.state === 'stopped') {
      stopPlayback(playbackControl.startTimeSeconds ?? 0);
    }
  }, [playbackControl?.startTimeSeconds, playbackControl?.state, stopPlayback]);

  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      const synced = updatePlaybackProgress(currentTime);
      if (!synced || !stream) return;
      onPlaybackTimeUpdate?.({
        sourceId: source.id,
        currentTime,
        duration: stream.duration,
      });
    },
    [onPlaybackTimeUpdate, source.id, stream, updatePlaybackProgress],
  );

  const handleEnded = useCallback(
    (currentTime: number) => {
      onPlaybackEnded?.({
        sourceId: source.id,
        mediaType: 'audio',
        currentTime,
        duration: stream?.duration ?? currentTime,
      });
    },
    [onPlaybackEnded, source.id, stream?.duration],
  );

  if (stream?.audio) {
    return (
      <div
        className={getAudioPreviewFrameClassName(chrome)}
        data-preview-surface="audio"
        data-preview-chrome={chrome}
        data-media-duration={String(stream.duration)}
      >
        <InlineAudioPlayer
          audio={stream.audio}
          audioContext={stream.audioContext ?? undefined}
          duration={stream.duration}
          audioLayout={audioLayout}
          startTime={stream.startTime}
          playbackRate={stream.playbackRate}
          onPause={pausePlayback}
          onResume={resumePlayback}
          onSeek={seekPlayback}
          onTimeUpdate={handleTimeUpdate}
          onStop={stopPlayback}
          playbackState={
            playbackControl?.state === 'stopped' ? 'paused' : (playbackControl?.state ?? 'playing')
          }
          playbackRequestId={
            playbackControl?.requestId ?? `${surfaceId}:${stream.startTime}:${stream.playbackRate}`
          }
          playbackStartTime={playbackControl?.startTimeSeconds ?? stream.startTime}
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
      data-media-duration={
        mediaDescription.duration > 0 ? String(mediaDescription.duration) : undefined
      }
      data-preview-controlled-idle={playbackControl ? 'true' : undefined}
    >
      <AudioPlayerSurface
        layout={audioLayout}
        currentTime={playbackControl?.startTimeSeconds ?? 0}
        duration={mediaDescription.duration}
        isPlaying={false}
        disabled={probing || !canStartPlayback}
        showPlaybackButton={!playbackControl}
        onTogglePlay={(event) => {
          event?.stopPropagation();
          startPlayback();
        }}
        playbackLabel={t('toolbar.playbackPlay')}
        muteLabel={t('media.mute')}
      />
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
  return chrome === 'full-bleed' ? 'h-full min-h-0 w-full' : 'h-full min-h-[90px] w-full';
}

function readPreviewSourceContentLocator(
  source: PreviewSourceDescriptor,
): ContentLocator | undefined {
  return source.contentLocator;
}

function readPreviewSourceDuration(source: PreviewSourceDescriptor): number {
  return readPositiveFiniteNumber(source.metadata?.['duration']) ?? 0;
}

function readHtmlVideoDescriptor(value: unknown): HtmlVideoDescriptor | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !isMediaTransport(value['transport']) ||
    typeof value['url'] !== 'string' ||
    !isMediaTransportUrl(value['url'], value['transport']) ||
    typeof value['mimeType'] !== 'string' ||
    typeof value['durationSeconds'] !== 'number' ||
    (value['preparationProfile'] !== 'h264-mp4-direct' &&
      value['preparationProfile'] !== 'av1-mp4-direct' &&
      value['preparationProfile'] !== 'vp8-webm-direct' &&
      value['preparationProfile'] !== 'h264-mp4-remux' &&
      value['preparationProfile'] !== 'vp9-mp4-remux' &&
      value['preparationProfile'] !== 'h264-sdr-transcode')
  ) {
    return null;
  }
  return {
    version: 1,
    transport: value['transport'],
    url: value['url'],
    mimeType: value['mimeType'],
    durationSeconds: value['durationSeconds'],
    preparationProfile: value['preparationProfile'],
  };
}

function readPcmStreamDescriptor(value: unknown): PcmStreamDescriptor | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !isMediaTransport(value['transport']) ||
    value['protocol'] !== 'neko-pcm-f32le-v1' ||
    typeof value['streamUrl'] !== 'string' ||
    !isMediaTransportUrl(value['streamUrl'], value['transport']) ||
    typeof value['sampleRate'] !== 'number' ||
    typeof value['channels'] !== 'number'
  ) {
    return null;
  }
  return {
    version: 1,
    transport: value['transport'],
    protocol: 'neko-pcm-f32le-v1',
    streamUrl: value['streamUrl'],
    sampleRate: value['sampleRate'],
    channels: value['channels'],
  };
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

function renderFallbackPreview(
  { source, delegateActions, chrome = 'contained' }: PreviewRendererProps,
  host?: ReturnType<typeof useOptionalCanvasHost>,
): React.ReactNode {
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
            dispatchPreviewDelegate(host, {
              action: delegateActions[0]!,
              asset: source.asset,
            });
          }}
        >
          Open
        </button>
      )}
    </div>
  );
}

function FallbackPreviewRenderer(props: PreviewRendererProps): React.ReactNode {
  const host = useOptionalCanvasHost();
  return renderFallbackPreview(props, host);
}
