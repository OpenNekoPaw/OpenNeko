import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { StreamConfig } from '@neko-tools/contracts';
import type { PcmAudioClient } from '@neko/media/browser';
import { useMediaDiffRuntime } from '../runtime/MediaDiffRuntimeContext';
import { DiffRenderer, type DiffMode } from '../components/MediaDiff/streaming/DiffRenderer';
import { getLogger } from '../utils/logger';

const logger = getLogger('useVideoDiffStreaming');
const SYNC_THRESHOLD_SECONDS = 0.08;

export interface UseVideoDiffStreamingOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  streamConfig: StreamConfig;
  diffMode: DiffMode;
  sliderPosition: number;
  onTimeUpdate?: (time: number) => void;
  onError?: (error: string) => void;
  audioContext?: AudioContext;
  onStreamEnd?: () => void;
}

export interface UseVideoDiffStreamingResult {
  seek: (time: number) => void;
  renderStaticPair: (blobUrlA: string, blobUrlB: string) => Promise<void>;
  pauseAudio: () => void;
  resumeAudio: () => void;
}

export function useVideoDiffStreaming({
  canvasRef,
  streamConfig,
  diffMode,
  sliderPosition,
  onTimeUpdate,
  onError,
  audioContext,
  onStreamEnd,
}: UseVideoDiffStreamingOptions): UseVideoDiffStreamingResult {
  const { streamClientFactory, rafScheduler } = useMediaDiffRuntime();
  const rendererRef = useRef<DiffRenderer>();
  const currentVideoRef = useRef<HTMLVideoElement>();
  const previousVideoRef = useRef<HTMLVideoElement>();
  const audioClientRef = useRef<PcmAudioClient>();
  const animationRef = useRef<number | null>(null);

  const seek = useCallback((time: number) => {
    if (currentVideoRef.current) currentVideoRef.current.currentTime = time;
    if (previousVideoRef.current) previousVideoRef.current.currentTime = time;
  }, []);

  const renderStaticPair = useCallback(async (blobUrlA: string, blobUrlB: string) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const [blobA, blobB] = await Promise.all([
      fetch(blobUrlA).then((response) => response.blob()),
      fetch(blobUrlB).then((response) => response.blob()),
    ]);
    const [bitmapA, bitmapB] = await Promise.all([
      createImageBitmap(blobA),
      createImageBitmap(blobB),
    ]);
    renderer.renderPair(bitmapA, bitmapB);
  }, []);

  const pauseAudio = useCallback(() => {
    currentVideoRef.current?.pause();
    previousVideoRef.current?.pause();
    void audioClientRef.current?.pause();
  }, []);

  const resumeAudio = useCallback(() => {
    void currentVideoRef.current?.play();
    void previousVideoRef.current?.play();
    void audioClientRef.current?.resume();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new DiffRenderer({
      canvas,
      width: streamConfig.width,
      height: streamConfig.height,
      rafScheduler,
    });
    renderer.setMode(diffMode);
    renderer.setSliderPosition(sliderPosition);
    rendererRef.current = renderer;
    const currentVideo = createVideo(streamConfig.currentVideo.url, streamConfig.playbackRate);
    const previousVideo = createVideo(streamConfig.previousVideo.url, streamConfig.playbackRate);
    currentVideoRef.current = currentVideo;
    previousVideoRef.current = previousVideo;
    let disposed = false;
    let audioClient: PcmAudioClient | undefined;

    const start = async (): Promise<void> => {
      await Promise.all([waitForMetadata(currentVideo), waitForMetadata(previousVideo)]);
      currentVideo.currentTime = streamConfig.startTime;
      previousVideo.currentTime = streamConfig.startTime;
      if (streamConfig.currentAudio) {
        if (!audioContext) throw new Error('Media diff AudioContext requires a user gesture.');
        audioClient = streamClientFactory.createAudioClient({
          descriptor: streamConfig.currentAudio,
          playbackRate: streamConfig.playbackRate,
          volume: 1,
          onError: (error) => onError?.(error.message),
        });
        await audioClient.connect(audioContext);
        audioClientRef.current = audioClient;
      }
      if (disposed) return;
      await Promise.all([currentVideo.play(), previousVideo.play()]);
      const tick = (): void => {
        if (disposed) return;
        const masterTime = audioClient?.isClockReady
          ? audioClient.getCurrentTime()
          : currentVideo.currentTime;
        if (Math.abs(currentVideo.currentTime - masterTime) > SYNC_THRESHOLD_SECONDS) {
          currentVideo.currentTime = masterTime;
        }
        if (Math.abs(previousVideo.currentTime - masterTime) > SYNC_THRESHOLD_SECONDS) {
          previousVideo.currentTime = masterTime;
        }
        if (currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          renderer.renderPair(currentVideo, previousVideo);
          onTimeUpdate?.(masterTime);
        }
        if (masterTime >= streamConfig.duration) {
          onStreamEnd?.();
          return;
        }
        animationRef.current = rafScheduler.requestFrame(tick);
      };
      animationRef.current = rafScheduler.requestFrame(tick);
    };
    void start().catch((error: unknown) => {
      logger.error('Native media diff playback failed', error);
      onError?.(error instanceof Error ? error.message : String(error));
    });
    return () => {
      disposed = true;
      rafScheduler.cancelFrame(animationRef.current);
      currentVideo.pause();
      previousVideo.pause();
      currentVideo.removeAttribute('src');
      previousVideo.removeAttribute('src');
      currentVideo.load();
      previousVideo.load();
      audioClient?.dispose();
      renderer.dispose();
      rendererRef.current = undefined;
      currentVideoRef.current = undefined;
      previousVideoRef.current = undefined;
      audioClientRef.current = undefined;
    };
  }, [audioContext, canvasRef, rafScheduler, streamClientFactory, streamConfig]);

  useEffect(() => rendererRef.current?.setMode(diffMode), [diffMode]);
  useEffect(() => rendererRef.current?.setSliderPosition(sliderPosition), [sliderPosition]);

  return useMemo(
    () => ({ seek, renderStaticPair, pauseAudio, resumeAudio }),
    [pauseAudio, renderStaticPair, resumeAudio, seek],
  );
}

function createVideo(url: string, playbackRate: number): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.playbackRate = playbackRate;
  video.src = url;
  video.load();
  return video;
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', loaded);
      video.removeEventListener('error', failed);
    };
    const loaded = (): void => {
      cleanup();
      resolve();
    };
    const failed = (): void => {
      cleanup();
      reject(new Error('Media diff video metadata failed to load.'));
    };
    video.addEventListener('loadedmetadata', loaded, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
}
