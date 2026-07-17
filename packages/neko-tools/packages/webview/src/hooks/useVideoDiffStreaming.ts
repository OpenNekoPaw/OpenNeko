import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { StreamConfig } from '@neko/shared';
import type { AudioStreamClient, H264StreamClient } from '@neko/neko-client';
import { useMediaDiffRuntime } from '../runtime/MediaDiffRuntimeContext';
import { FramePairBuffer } from '../components/MediaDiff/streaming/FramePairBuffer';
import { DiffRenderer, type DiffMode } from '../components/MediaDiff/streaming/DiffRenderer';
import { getLogger } from '../utils/logger';

const logger = getLogger('useVideoDiffStreaming');

const SEEK_FILTER_TOLERANCE_SEC = 2.0;

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
  const rendererRef = useRef<DiffRenderer | null>(null);
  const bufferRef = useRef<FramePairBuffer | null>(null);
  const clientARef = useRef<H264StreamClient | null>(null);
  const clientBRef = useRef<H264StreamClient | null>(null);
  const audioClientRef = useRef<AudioStreamClient | null>(null);
  const seekFilterRef = useRef<number | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onErrorRef = useRef(onError);
  const onStreamEndRef = useRef(onStreamEnd);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onStreamEndRef.current = onStreamEnd;
  }, [onStreamEnd]);

  const seek = useCallback((time: number) => {
    seekFilterRef.current = time;
    bufferRef.current?.flush();
    clientARef.current?.resetDecoder();
    clientBRef.current?.resetDecoder();
    audioClientRef.current?.resetClock();
  }, []);

  const renderStaticPair = useCallback(async (blobUrlA: string, blobUrlB: string) => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }

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
    audioClientRef.current?.pause();
  }, []);

  const resumeAudio = useCallback(() => {
    audioClientRef.current?.resume();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const { port, currentStreamId, previousStreamId, currentAudioStreamId, width, height, fps } =
      streamConfig;

    logger.debug('Pipeline setup', {
      port,
      currentStreamId,
      previousStreamId,
      width,
      height,
      fps,
    });

    const renderer = new DiffRenderer({ canvas, width, height, rafScheduler });
    renderer.setMode(diffMode);
    renderer.setSliderPosition(sliderPosition);
    rendererRef.current = renderer;

    const halfFrameUs = 1_000_000 / fps / 2;
    let pairCount = 0;
    let singleCount = 0;
    const buffer = new FramePairBuffer({
      toleranceUs: halfFrameUs,
      maxBufferSize: 10,
      onPair: (pair) => {
        pairCount++;
        if (pairCount <= 3 || pairCount % 30 === 0) {
          logger.debug(`Pair #${pairCount}`, {
            ptsA: pair.frameA.timestamp,
            ptsB: pair.frameB.timestamp,
          });
        }
        renderer.renderPair(pair.frameA, pair.frameB);
        onTimeUpdateRef.current?.(pair.frameA.timestamp / 1_000_000);
      },
      onSingle: (frame, side) => {
        singleCount++;
        if (singleCount <= 3 || singleCount % 30 === 0) {
          logger.debug(`Single #${singleCount}`, { side, pts: frame.timestamp });
        }
        renderer.renderSingle(frame, side);
        onTimeUpdateRef.current?.(frame.timestamp / 1_000_000);
      },
    });
    bufferRef.current = buffer;

    const baseUrl = `ws://127.0.0.1:${port}/v1/streams`;

    const filterFrame = (frame: VideoFrame, feed: (videoFrame: VideoFrame) => void) => {
      const seekTarget = seekFilterRef.current;
      if (seekTarget !== null) {
        const frameSec = frame.timestamp / 1_000_000;
        if (Math.abs(frameSec - seekTarget) > SEEK_FILTER_TOLERANCE_SEC) {
          frame.close();
          return;
        }

        seekFilterRef.current = null;
      }

      feed(frame);
    };

    let frameCountA = 0;
    let frameCountB = 0;

    const clientA = streamClientFactory.createVideoStreamClient({
      websocketUrl: `${baseUrl}/${currentStreamId}`,
      width,
      height,
      onFrame: (frame) => {
        frameCountA++;
        if (frameCountA <= 5 || frameCountA % 60 === 0) {
          logger.debug(`Frame A #${frameCountA}`, {
            pts: frame.timestamp,
            size: `${frame.displayWidth}x${frame.displayHeight}`,
          });
        }
        filterFrame(frame, (videoFrame) => buffer.feedA(videoFrame));
      },
      onError: (err) => {
        logger.error('Stream A error', err);
        onErrorRef.current?.(err.message);
      },
      onConnectionChange: (connected) => {
        logger.debug(`Stream A connection: ${connected ? 'OPEN' : 'CLOSED'}`);
      },
      onStreamEnd: () => {
        logger.debug('Stream A ended (EOF)');
        buffer.markEndOfStream('A');
        onStreamEndRef.current?.();
      },
    });

    const clientB = streamClientFactory.createVideoStreamClient({
      websocketUrl: `${baseUrl}/${previousStreamId}`,
      width,
      height,
      onFrame: (frame) => {
        frameCountB++;
        if (frameCountB <= 5 || frameCountB % 60 === 0) {
          logger.debug(`Frame B #${frameCountB}`, {
            pts: frame.timestamp,
            size: `${frame.displayWidth}x${frame.displayHeight}`,
          });
        }
        filterFrame(frame, (videoFrame) => buffer.feedB(videoFrame));
      },
      onError: (err) => {
        logger.error('Stream B error', err);
        onErrorRef.current?.(err.message);
      },
      onConnectionChange: (connected) => {
        logger.debug(`Stream B connection: ${connected ? 'OPEN' : 'CLOSED'}`);
      },
      onStreamEnd: () => {
        logger.debug('Stream B ended (EOF)');
        buffer.markEndOfStream('B');
        onStreamEndRef.current?.();
      },
    });

    clientARef.current = clientA;
    clientBRef.current = clientB;

    void clientA.connect();
    void clientB.connect();

    if (currentAudioStreamId) {
      const audioClient = streamClientFactory.createAudioStreamClient({
        websocketUrl: `${baseUrl}/${currentAudioStreamId}`,
        volume: 1.0,
        onError: (err) => {
          logger.error('Audio error', err);
        },
        onConnectionChange: (connected) => {
          logger.debug(`Audio connection: ${connected ? 'OPEN' : 'CLOSED'}`);
        },
        onStreamEnd: () => {
          logger.debug('Audio stream ended (EOF)');
        },
      });

      audioClientRef.current = audioClient;
      void audioClient.connect(audioContext);
    } else {
      logger.debug('No audio stream ID — skipping audio');
    }

    return () => {
      clientA.dispose();
      clientB.dispose();
      audioClientRef.current?.dispose();
      buffer.dispose();
      renderer.dispose();
      clientARef.current = null;
      clientBRef.current = null;
      audioClientRef.current = null;
      bufferRef.current = null;
      rendererRef.current = null;
      seekFilterRef.current = null;
    };
  }, [audioContext, canvasRef, rafScheduler, streamClientFactory, streamConfig]);

  useEffect(() => {
    rendererRef.current?.setMode(diffMode);
  }, [diffMode]);

  useEffect(() => {
    rendererRef.current?.setSliderPosition(sliderPosition);
  }, [sliderPosition]);

  return useMemo(
    () => ({
      seek,
      renderStaticPair,
      pauseAudio,
      resumeAudio,
    }),
    [pauseAudio, renderStaticPair, resumeAudio, seek],
  );
}
