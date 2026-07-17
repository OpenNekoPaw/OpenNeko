/** H.264 WebSocket decoder backed by WebCodecs. */

import { getLogger } from './utils/logger';

const logger = getLogger('H264');
const H264_HEADER_SIZE = 25;
const DEFAULT_BACKPRESSURE_POLICY: H264BackpressurePolicy = {
  maxDecodeQueueDepth: 4,
  dropDeltaFramesWhenBacklogged: false,
  preserveKeyframes: true,
};

interface ParsedH264Packet {
  readonly pts: number;
  readonly isKeyframe: boolean;
  readonly duration: number;
  readonly nalData: Uint8Array;
}

export interface H264BackpressurePolicy {
  readonly maxDecodeQueueDepth: number;
  readonly dropDeltaFramesWhenBacklogged: boolean;
  readonly preserveKeyframes: boolean;
}

export interface H264StreamClientConfig {
  readonly websocketUrl: string;
  readonly width: number;
  readonly height: number;
  readonly codecString?: string;
  readonly onFrame?: (frame: VideoFrame) => void;
  readonly onConnectionChange?: (connected: boolean) => void;
  readonly onError?: (error: Error) => void;
  readonly onPacketReceived?: (sizeBytes: number) => void;
  readonly onStreamEnd?: () => void;
  readonly backpressure?: H264BackpressurePolicy;
}

export interface H264StreamClientStats {
  readonly packetsReceived: number;
  readonly framesDecoded: number;
  readonly framesDropped: number;
  readonly framesDroppedBeforeDecode: number;
  readonly isConnected: boolean;
  readonly isDecoderReady: boolean;
  readonly avgDecodeTimeMs: number;
  readonly avgLatencyMs: number;
  readonly decodeQueueDepth: number;
  readonly hardwareAcceleration: boolean;
}

interface NormalizedH264StreamClientConfig {
  readonly websocketUrl: string;
  readonly width: number;
  readonly height: number;
  readonly codecString: string;
  readonly onFrame: (frame: VideoFrame) => void;
  readonly onConnectionChange: (connected: boolean) => void;
  readonly onError: (error: Error) => void;
  readonly onPacketReceived: (sizeBytes: number) => void;
  readonly onStreamEnd: () => void;
}

export class H264StreamClient {
  private static readonly EOF_TIMEOUT_MS = 500;

  private readonly config: NormalizedH264StreamClientConfig;
  private ws: WebSocket | null = null;
  private decoder: VideoDecoder | null = null;
  private disposed = false;
  private waitingForKeyframe = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eofTimer: ReturnType<typeof setTimeout> | null = null;
  private streamEndFired = false;
  private backpressure: H264BackpressurePolicy;
  private readonly maxSamples = 60;
  private readonly decodeStartTimes = new Map<number, number>();
  private readonly pendingFrames = new Map<number, number>();
  private decodeTimeSamples: number[] = [];
  private latencySamples: number[] = [];
  private stats: H264StreamClientStats = {
    packetsReceived: 0,
    framesDecoded: 0,
    framesDropped: 0,
    framesDroppedBeforeDecode: 0,
    isConnected: false,
    isDecoderReady: false,
    avgDecodeTimeMs: 0,
    avgLatencyMs: 0,
    decodeQueueDepth: 0,
    hardwareAcceleration: false,
  };

  constructor(config: H264StreamClientConfig) {
    if (!Number.isInteger(config.width) || config.width <= 0) {
      throw new Error('H264StreamClient width must be a positive integer.');
    }
    if (!Number.isInteger(config.height) || config.height <= 0) {
      throw new Error('H264StreamClient height must be a positive integer.');
    }
    this.backpressure = normalizeBackpressurePolicy(config.backpressure);
    this.config = {
      websocketUrl: config.websocketUrl,
      width: config.width,
      height: config.height,
      codecString: config.codecString ?? 'avc1.42001f',
      onFrame: config.onFrame ?? (() => undefined),
      onConnectionChange: config.onConnectionChange ?? (() => undefined),
      onError: config.onError ?? (() => undefined),
      onPacketReceived: config.onPacketReceived ?? (() => undefined),
      onStreamEnd: config.onStreamEnd ?? (() => undefined),
    };
  }

  async connect(): Promise<void> {
    if (this.disposed) return;
    await this.initDecoder();
    this.setupWebSocket();
  }

  dispose(): void {
    this.disposed = true;
    this.clearEofTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.closeDecoder();
    this.clearFrameTracking();
    this.stats = { ...this.stats, isConnected: false, isDecoderReady: false, decodeQueueDepth: 0 };
  }

  getStats(): H264StreamClientStats {
    return { ...this.stats };
  }

  updateBackpressurePolicy(policy: H264BackpressurePolicy): void {
    this.backpressure = normalizeBackpressurePolicy(policy);
  }

  resetDecoder(): void {
    if (this.disposed) return;
    this.clearEofTimer();
    this.clearFrameTracking();
    this.stats = { ...this.stats, framesDecoded: 0, decodeQueueDepth: 0 };
    if (this.decoder?.state === 'configured') {
      try {
        this.decoder.reset();
        this.decoder.configure(this.decoderConfig());
        this.waitingForKeyframe = true;
        this.stats = { ...this.stats, isDecoderReady: true };
        return;
      } catch (error) {
        logger.warn('Fast H.264 decoder reset failed; recreating decoder.', error);
      }
    }
    this.createDecoder();
  }

  private async initDecoder(): Promise<void> {
    if (typeof VideoDecoder === 'undefined') {
      this.config.onError(new Error('WebCodecs VideoDecoder not available'));
      return;
    }
    const support = await VideoDecoder.isConfigSupported(this.decoderConfig());
    if (!support.supported) {
      this.config.onError(new Error(`H.264 codec not supported: ${this.config.codecString}`));
      return;
    }
    this.stats = { ...this.stats, hardwareAcceleration: true };
    this.createDecoder();
  }

  private createDecoder(): void {
    this.closeDecoder();
    if (typeof VideoDecoder === 'undefined') return;
    this.decoder = new VideoDecoder({
      output: (frame) => this.handleDecodedFrame(frame),
      error: (error) => {
        logger.error('H.264 decoder error', error);
        this.stats = { ...this.stats, isDecoderReady: false };
        this.config.onError(error);
      },
    });
    this.decoder.configure(this.decoderConfig());
    this.stats = { ...this.stats, isDecoderReady: true };
    this.waitingForKeyframe = true;
  }

  private closeDecoder(): void {
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close();
      } catch (error) {
        logger.warn('Failed to close H.264 decoder.', error);
      }
    }
    this.decoder = null;
  }

  private decoderConfig(): VideoDecoderConfig {
    return {
      codec: this.config.codecString,
      codedWidth: this.config.width,
      codedHeight: this.config.height,
      hardwareAcceleration: 'prefer-hardware',
      optimizeForLatency: true,
    };
  }

  private setupWebSocket(): void {
    if (this.disposed) return;
    try {
      this.ws = new WebSocket(this.config.websocketUrl);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.stats = { ...this.stats, isConnected: true };
        this.config.onConnectionChange(true);
      };
      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) this.handlePacket(event.data);
      };
      this.ws.onclose = (event) => {
        this.stats = { ...this.stats, isConnected: false };
        this.config.onConnectionChange(false);
        if (event.code === 1000) {
          this.fireStreamEnd();
          return;
        }
        this.tryReconnect();
      };
      this.ws.onerror = (event) => {
        logger.error('H.264 WebSocket error', event);
        this.config.onError(new Error('WebSocket connection error'));
      };
    } catch (error) {
      this.config.onError(error instanceof Error ? error : new Error(String(error)));
      this.tryReconnect();
    }
  }

  private handlePacket(data: ArrayBuffer): void {
    const receiveTime = performance.now();
    this.stats = { ...this.stats, packetsReceived: this.stats.packetsReceived + 1 };
    this.resetEofTimer();
    this.config.onPacketReceived(data.byteLength);
    const packet = parseH264Packet(data);
    if (!packet) return;
    if (!this.decoder || this.decoder.state !== 'configured') {
      this.recordDroppedFrame(false);
      return;
    }
    if (this.waitingForKeyframe) {
      if (!packet.isKeyframe) {
        this.recordDroppedFrame(true);
        return;
      }
      this.waitingForKeyframe = false;
    }
    const queueDepth = this.effectiveDecodeQueueDepth();
    this.stats = { ...this.stats, decodeQueueDepth: queueDepth };
    if (
      this.backpressure.dropDeltaFramesWhenBacklogged &&
      queueDepth > this.backpressure.maxDecodeQueueDepth &&
      !(packet.isKeyframe && this.backpressure.preserveKeyframes)
    ) {
      this.recordDroppedFrame(true);
      return;
    }
    this.pendingFrames.set(packet.pts, receiveTime);
    this.decodeStartTimes.set(packet.pts, performance.now());
    trimTrackingMap(this.pendingFrames);
    trimTrackingMap(this.decodeStartTimes);
    try {
      this.decoder.decode(
        new EncodedVideoChunk({
          type: packet.isKeyframe ? 'key' : 'delta',
          timestamp: packet.pts,
          duration: packet.duration,
          data: packet.nalData,
        }),
      );
    } catch (error) {
      this.pendingFrames.delete(packet.pts);
      this.decodeStartTimes.delete(packet.pts);
      this.recordDroppedFrame(false);
      logger.warn('H.264 decode submission failed.', error);
    }
  }

  private handleDecodedFrame(frame: VideoFrame): void {
    if (this.disposed) {
      frame.close();
      return;
    }
    const now = performance.now();
    const decodeStart = this.decodeStartTimes.get(frame.timestamp);
    this.decodeStartTimes.delete(frame.timestamp);
    if (decodeStart !== undefined) {
      this.decodeTimeSamples = appendSample(
        this.decodeTimeSamples,
        now - decodeStart,
        this.maxSamples,
      );
    }
    const receivedAt = this.pendingFrames.get(frame.timestamp);
    this.pendingFrames.delete(frame.timestamp);
    if (receivedAt !== undefined) {
      this.latencySamples = appendSample(this.latencySamples, now - receivedAt, this.maxSamples);
    }
    this.stats = {
      ...this.stats,
      framesDecoded: this.stats.framesDecoded + 1,
      avgDecodeTimeMs: average(this.decodeTimeSamples),
      avgLatencyMs: average(this.latencySamples),
      decodeQueueDepth: this.effectiveDecodeQueueDepth(),
    };
    this.config.onFrame(frame);
  }

  private recordDroppedFrame(beforeDecode: boolean): void {
    this.stats = {
      ...this.stats,
      framesDropped: this.stats.framesDropped + 1,
      framesDroppedBeforeDecode: this.stats.framesDroppedBeforeDecode + (beforeDecode ? 1 : 0),
    };
  }

  private effectiveDecodeQueueDepth(): number {
    return Math.max(this.decoder?.decodeQueueSize ?? 0, this.decodeStartTimes.size);
  }

  private clearFrameTracking(): void {
    this.pendingFrames.clear();
    this.decodeStartTimes.clear();
    this.decodeTimeSamples = [];
    this.latencySamples = [];
  }

  private tryReconnect(): void {
    if (this.disposed || this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = Math.min(100 * 2 ** this.reconnectAttempts, 5_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setupWebSocket();
    }, delay);
  }

  private resetEofTimer(): void {
    if (this.eofTimer) clearTimeout(this.eofTimer);
    this.streamEndFired = false;
    this.eofTimer = setTimeout(() => {
      this.eofTimer = null;
      this.fireStreamEnd();
    }, H264StreamClient.EOF_TIMEOUT_MS);
  }

  private clearEofTimer(): void {
    if (this.eofTimer) clearTimeout(this.eofTimer);
    this.eofTimer = null;
    this.streamEndFired = false;
  }

  private fireStreamEnd(): void {
    if (this.disposed || this.streamEndFired) return;
    this.streamEndFired = true;
    this.config.onStreamEnd();
  }
}

function parseH264Packet(data: ArrayBuffer): ParsedH264Packet | null {
  if (data.byteLength < H264_HEADER_SIZE) return null;
  const view = new DataView(data);
  const pts = view.getUint32(0, true) + view.getInt32(4, true) * 0x1_0000_0000;
  const duration = view.getUint32(17, true) + view.getInt32(21, true) * 0x1_0000_0000;
  return {
    pts,
    isKeyframe: view.getUint8(16) === 1,
    duration,
    nalData: new Uint8Array(data, H264_HEADER_SIZE),
  };
}

function normalizeBackpressurePolicy(
  policy: H264BackpressurePolicy | undefined,
): H264BackpressurePolicy {
  if (!policy) return DEFAULT_BACKPRESSURE_POLICY;
  if (!Number.isFinite(policy.maxDecodeQueueDepth) || policy.maxDecodeQueueDepth < 0) {
    throw new Error('H.264 maxDecodeQueueDepth must be a non-negative number.');
  }
  return {
    maxDecodeQueueDepth: Math.floor(policy.maxDecodeQueueDepth),
    dropDeltaFramesWhenBacklogged: policy.dropDeltaFramesWhenBacklogged,
    preserveKeyframes: policy.preserveKeyframes,
  };
}

function appendSample(samples: number[], value: number, maxSamples: number): number[] {
  const next = [...samples, value];
  return next.length > maxSamples ? next.slice(next.length - maxSamples) : next;
}

function average(samples: readonly number[]): number {
  return samples.length === 0 ? 0 : samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function trimTrackingMap(map: Map<number, number>): void {
  if (map.size <= 100) return;
  const oldest = map.keys().next().value;
  if (typeof oldest === 'number') map.delete(oldest);
}
