/**
 * FMP4StreamClient - Unified A/V fMP4 stream player
 *
 * Connects to neko-engine's media stream via WebSocket,
 * receives fMP4 segments (init + media), and plays them
 * via MediaSource Extensions (MSE) on a <video> element.
 *
 * Wire protocol:
 * [type: u8 (1B)] [fMP4 payload...]
 *   type = 0x01: Init segment (ftyp + moov) — sent once
 *   type = 0x02: Media segment (moof + mdat) — sent periodically
 *   type = 0x03: Flush segment (final partial segment)
 */

import { getLogger } from './utils/logger';

const logger = getLogger('FMP4');

// =============================================================================
// Constants
// =============================================================================

const MSG_TYPE_INIT = 0x01;
const MSG_TYPE_SEGMENT = 0x02;
const MSG_TYPE_FLUSH = 0x03;

/** MIME type for MSE SourceBuffer: H.264 High Profile + Opus in MP4 */
const MIME_TYPE = 'video/mp4; codecs="avc1.640028, opus"';
/** Fallback: video-only */
const MIME_TYPE_VIDEO_ONLY = 'video/mp4; codecs="avc1.640028"';

// =============================================================================
// Types
// =============================================================================

export interface FMP4StreamClientConfig {
  /** WebSocket URL (e.g., ws://127.0.0.1:PORT/v1/streams/STREAM_ID) */
  websocketUrl: string;
  /** Target <video> element for playback */
  videoElement: HTMLVideoElement;
  /** Initial volume (0.0 - 1.0) */
  volume?: number;
  /** Callback on connection state change */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback when playback time updates */
  onTimeUpdate?: (time: number) => void;
}

export interface FMP4StreamStats {
  packetsReceived: number;
  segmentsAppended: number;
  initReceived: boolean;
  isConnected: boolean;
  isSourceOpen: boolean;
  bufferedSeconds: number;
}

// =============================================================================
// FMP4StreamClient
// =============================================================================

export class FMP4StreamClient {
  private config: Required<FMP4StreamClientConfig>;
  private ws: WebSocket | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private disposed = false;

  private stats: FMP4StreamStats = {
    packetsReceived: 0,
    segmentsAppended: 0,
    initReceived: false,
    isConnected: false,
    isSourceOpen: false,
    bufferedSeconds: 0,
  };

  /** Queue for segments received before SourceBuffer is ready */
  private pendingSegments: Uint8Array[] = [];
  /** Whether SourceBuffer is currently updating */
  private isAppending = false;
  /** MIME type actually used */
  private mimeType: string = MIME_TYPE;

  // Reconnection
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: FMP4StreamClientConfig) {
    this.config = {
      websocketUrl: config.websocketUrl,
      videoElement: config.videoElement,
      volume: config.volume ?? 1.0,
      onConnectionChange: config.onConnectionChange ?? (() => {}),
      onError: config.onError ?? (() => {}),
      onTimeUpdate: config.onTimeUpdate ?? (() => {}),
    };
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async connect(): Promise<void> {
    if (this.disposed) return;

    // Check MSE support
    if (typeof MediaSource === 'undefined') {
      this.config.onError(new Error('MediaSource Extensions not available'));
      return;
    }

    // Determine supported MIME type
    if (MediaSource.isTypeSupported(MIME_TYPE)) {
      this.mimeType = MIME_TYPE;
    } else if (MediaSource.isTypeSupported(MIME_TYPE_VIDEO_ONLY)) {
      this.mimeType = MIME_TYPE_VIDEO_ONLY;
      logger.warn('Opus in MP4 not supported, falling back to video-only');
    } else {
      this.config.onError(new Error(`MSE does not support: ${MIME_TYPE}`));
      return;
    }

    this.initMediaSource();
    this.setupWebSocket();

    // Time update listener
    this.config.videoElement.addEventListener('timeupdate', this.onTimeUpdate);
  }

  dispose(): void {
    this.disposed = true;

    this.config.videoElement.removeEventListener('timeupdate', this.onTimeUpdate);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    // Clean up MSE
    if (this.sourceBuffer) {
      try {
        if (this.mediaSource?.readyState === 'open') {
          this.sourceBuffer.abort();
        }
      } catch {
        /* ignore */
      }
      this.sourceBuffer = null;
    }

    if (this.mediaSource) {
      if (this.mediaSource.readyState === 'open') {
        try {
          this.mediaSource.endOfStream();
        } catch {
          /* ignore */
        }
      }
      this.mediaSource = null;
    }

    this.config.videoElement.src = '';
    this.pendingSegments = [];
    this.stats.isConnected = false;
    this.stats.isSourceOpen = false;
  }

  getStats(): FMP4StreamStats {
    this.updateBufferedStats();
    return { ...this.stats };
  }

  // =========================================================================
  // MediaSource Extensions
  // =========================================================================

  private initMediaSource(): void {
    this.mediaSource = new MediaSource();

    this.mediaSource.addEventListener('sourceopen', () => {
      this.stats.isSourceOpen = true;
      logger.info('MediaSource opened');

      try {
        this.sourceBuffer = this.mediaSource!.addSourceBuffer(this.mimeType);
        this.sourceBuffer.mode = 'segments';

        this.sourceBuffer.addEventListener('updateend', () => {
          this.isAppending = false;
          this.flushPendingSegments();
        });

        this.sourceBuffer.addEventListener('error', (e) => {
          logger.error('SourceBuffer error', e);
          this.config.onError(new Error('SourceBuffer error'));
        });

        // Flush any segments that arrived before sourceopen
        this.flushPendingSegments();
      } catch (e) {
        logger.error('Failed to create SourceBuffer', e);
        this.config.onError(e instanceof Error ? e : new Error(String(e)));
      }
    });

    this.mediaSource.addEventListener('sourceended', () => {
      logger.info('MediaSource ended');
    });

    this.mediaSource.addEventListener('sourceclose', () => {
      this.stats.isSourceOpen = false;
    });

    // Attach to video element
    this.config.videoElement.src = URL.createObjectURL(this.mediaSource);
    this.config.videoElement.volume = this.config.volume;
  }

  private appendSegment(data: Uint8Array): void {
    if (!this.sourceBuffer || this.disposed) return;

    if (this.isAppending || this.sourceBuffer.updating) {
      this.pendingSegments.push(data);
      return;
    }

    try {
      this.isAppending = true;
      this.sourceBuffer.appendBuffer(data as unknown as BufferSource);
      this.stats.segmentsAppended++;
    } catch (e) {
      this.isAppending = false;
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        // Evict old data and retry
        this.evictBuffer();
        this.pendingSegments.unshift(data);
      } else {
        logger.error('appendBuffer error', e);
      }
    }
  }

  private flushPendingSegments(): void {
    if (this.pendingSegments.length === 0 || !this.sourceBuffer || this.isAppending) {
      return;
    }

    const next = this.pendingSegments.shift();
    if (next) {
      this.appendSegment(next);
    }
  }

  /** Evict buffered data older than 10 seconds before current time */
  private evictBuffer(): void {
    if (!this.sourceBuffer || this.sourceBuffer.updating) return;

    const video = this.config.videoElement;
    const evictBefore = Math.max(0, video.currentTime - 10);

    if (this.sourceBuffer.buffered.length > 0) {
      const start = this.sourceBuffer.buffered.start(0);
      if (start < evictBefore) {
        try {
          this.sourceBuffer.remove(start, evictBefore);
        } catch {
          /* ignore */
        }
      }
    }
  }

  // =========================================================================
  // Playback Control
  // =========================================================================

  /** Get current playback time in seconds */
  getCurrentTime(): number {
    return this.config.videoElement.currentTime;
  }

  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
    this.config.videoElement.volume = this.config.volume;
  }

  /** Reset MSE state after seek (new init segment expected) */
  resetForSeek(): void {
    this.stats.initReceived = false;
    this.pendingSegments = [];

    if (this.sourceBuffer && !this.sourceBuffer.updating) {
      try {
        this.sourceBuffer.abort();
      } catch {
        /* ignore */
      }
    }
  }

  // =========================================================================
  // WebSocket
  // =========================================================================

  private setupWebSocket(): void {
    if (this.disposed) return;

    try {
      this.ws = new WebSocket(this.config.websocketUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.stats.isConnected = true;
        this.reconnectAttempts = 0;
        this.config.onConnectionChange(true);
        logger.info('WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.handleMessage(event.data);
        }
      };

      this.ws.onclose = () => {
        this.stats.isConnected = false;
        this.config.onConnectionChange(false);
        this.tryReconnect();
      };

      this.ws.onerror = (event) => {
        logger.error('WebSocket error', event);
      };
    } catch (error) {
      logger.error('WebSocket setup failed', error);
      this.tryReconnect();
    }
  }

  private handleMessage(data: ArrayBuffer): void {
    if (data.byteLength < 2) return; // At least type byte + 1 byte payload

    this.stats.packetsReceived++;

    const view = new DataView(data);
    const msgType = view.getUint8(0);
    const payload = new Uint8Array(data, 1);

    switch (msgType) {
      case MSG_TYPE_INIT:
        logger.info(`Init segment received: ${payload.byteLength} bytes`);
        this.stats.initReceived = true;
        this.appendSegment(payload);
        // Auto-play after init
        this.config.videoElement.play().catch(() => {});
        break;

      case MSG_TYPE_SEGMENT:
        if (!this.stats.initReceived) {
          logger.warn('Media segment before init, queuing');
          this.pendingSegments.push(payload);
          return;
        }
        this.appendSegment(payload);
        break;

      case MSG_TYPE_FLUSH:
        if (this.stats.initReceived) {
          this.appendSegment(payload);
        }
        break;

      default:
        logger.warn(`Unknown message type: 0x${msgType.toString(16)}`);
    }
  }

  private tryReconnect(): void {
    if (this.disposed || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(100 * Math.pow(2, this.reconnectAttempts), 5000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setupWebSocket();
    }, delay);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private onTimeUpdate = (): void => {
    this.config.onTimeUpdate(this.config.videoElement.currentTime);
  };

  private updateBufferedStats(): void {
    const video = this.config.videoElement;
    if (video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      this.stats.bufferedSeconds = end - video.currentTime;
    } else {
      this.stats.bufferedSeconds = 0;
    }
  }
}
