/**
 * MediaRequestProxy - Webview 端媒体请求代理
 *
 * 职责：
 * - 封装与 Extension Host 的 IPC 通信
 * - 提供类型安全的媒体处理 API
 * - 请求队列管理（优先级排序、并发控制、背压）
 * - 请求超时处理
 *
 * 设计原则：
 * - 接口隔离：仅暴露必要的媒体处理方法
 * - 错误处理：统一的超时和错误处理
 * - 资源管理：Disposable 模式清理监听器
 *
 * Delegates to extracted modules:
 * - media/DataConverters: Buffer → ImageBitmap/AudioBuffer conversion
 * - media/CompatibleModeRenderer: Compatible mode type guards & response processing
 * - media/PerformanceMonitor: Stream stats & bitrate tracking
 */

import type {
  MediaRequest,
  MediaResponse,
  MediaInfo,
  GetVideoFrameResponse,
  GetVideoFrameRangeResponse,
  DecodeAudioSegmentResponse,
  ProbeMediaInfoResponse,
  ExtractSubtitlesResponse,
  ExtractedSubtitleTrack,
  GetWaveformResponse,
  RenderCompositeFrameRequest,
  RenderCompositeFrameResponse,
  CompatibleGetVideoFrameRequest,
  CompatibleGetVideoFrameResponse,
  CompositeLayerConfig,
} from '@neko/shared';
import { MAX_CONCURRENT_REQUESTS, MEDIA_REQUEST_TIMEOUT } from '@neko/shared';
import { getVSCodeAPI } from '../utils/vscodeApi';
import { getLogger } from '../utils/logger';

// Extracted domain modules
import {
  dataUrlToImageBitmap,
  arrayBufferToImageBitmap,
  arrayBufferToAudioBuffer,
  disposeAudioContext,
  isCompatibleModeResponse,
  processCompatibleFrameResponse,
  processCompositeFrameResponse,
  PerformanceMonitor,
  type StreamStats,
  type MediaBitrateInfo,
} from './media';

const logger = getLogger('MediaRequestProxy');

// =============================================================================
// MediaRequestProxy Interface
// =============================================================================

/**
 * 媒体请求代理接口
 */
export interface IMediaRequestProxy {
  /**
   * Extract a single video frame at specified time
   * @returns ImageBitmap ready for canvas rendering
   */
  getVideoFrame(
    videoPath: string,
    timeInSeconds: number,
    options?: MediaRequestOptions,
  ): Promise<ImageBitmap>;

  /**
   * Extract multiple video frames in a time range (streaming, efficient)
   * @returns Array of frames with time and ImageBitmap
   */
  getVideoFrameRange(
    videoPath: string,
    startTime: number,
    duration: number,
    fps: number,
    options?: MediaRequestOptions,
  ): Promise<Array<{ time: number; bitmap: ImageBitmap }>>;

  /**
   * Decode audio segment
   * @returns AudioBuffer ready for Web Audio API
   */
  decodeAudioSegment(
    videoPath: string,
    startTime: number,
    duration: number,
    sampleRate?: number,
    channels?: number,
    options?: MediaRequestOptions,
  ): Promise<AudioBuffer>;

  /**
   * Probe media file metadata
   */
  probeMediaInfo(videoPath: string, options?: MediaRequestOptions): Promise<MediaInfo>;

  /**
   * Extract all subtitle streams from a video file
   * @returns Array of extracted subtitle tracks with cues
   */
  extractSubtitles(
    videoPath: string,
    options?: MediaRequestOptions,
  ): Promise<ExtractedSubtitleTrack[]>;

  /**
   * Generate waveform data via neko-engine (Rust/FFmpeg)
   * Bypasses CSP restrictions - file reading happens on native side
   * @returns Waveform peak data with multi-channel support
   */
  getWaveform(
    filePath: string,
    options?: MediaRequestOptions,
  ): Promise<{
    sampleRate: number;
    channels: number;
    peaksPerSecond: number;
    duration: number;
    peaks: number[][];
  }>;

  /**
   * Get engine-side stream pipeline stats (timelines:stream_stats)
   * Returns null if no active stream or stats unavailable
   */
  getStreamStats(): Promise<StreamStats | null>;

  // =========================================================================
  // Compatible Mode Methods (Extension-side decoding for preview)
  // =========================================================================

  /**
   * Get a single video frame via Extension (compatible mode)
   * @returns ImageBitmap ready for canvas rendering
   */
  compatibleGetVideoFrame(
    videoPath: string,
    timeInSeconds: number,
    width?: number,
    height?: number,
    options?: MediaRequestOptions,
  ): Promise<ImageBitmap>;

  /**
   * Render composite frame via Extension (compatible mode)
   * @returns ImageBitmap of the composited frame
   */
  renderCompositeFrame(
    layers: CompositeLayerConfig[],
    time: number,
    width: number,
    height: number,
    backgroundColor?: [number, number, number, number],
    options?: MediaRequestOptions,
  ): Promise<ImageBitmap>;

  /**
   * Get media bitrate info from Extension
   * @param mediaPath Media file path
   * @returns Bitrate information
   */
  getMediaBitrate(mediaPath: string): Promise<MediaBitrateInfo>;

  /**
   * Cancel all pending requests
   */
  cancelAllPendingRequests(): void;

  /**
   * Get number of pending requests
   */
  readonly pendingRequestCount: number;

  /**
   * Dispose resources
   */
  dispose(): void;
}

/**
 * 媒体请求可选参数
 * - signal：用于中止等待（不会取消 Extension 侧 FFmpeg 进程，只是在 Webview 侧提前拒绝并忽略返回）
 */
export interface MediaRequestOptions {
  signal?: AbortSignal;
  /**
   * 请求优先级（数值越大越优先）
   * 用于在预览/播放等交互场景下，优先调度关键帧请求，避免被缩略图/预加载等后台任务拖垮。
   */
  priority?: number;
  /**
   * 单次请求超时（毫秒），默认使用 MEDIA_REQUEST_TIMEOUT
   * 注意：超时从"实际发送给 Extension Host"开始计时（而不是进入队列时）
   */
  timeoutMs?: number;
  /**
   * Phase 2: JPEG quality (2-31, lower is better, default: 3)
   */
  quality?: number;
  /**
   * Phase 2: Scale factor (0-1, default: 1.0 = no scaling)
   */
  scale?: number;
  /**
   * Maximum frames to extract (for memory control in Webview)
   */
  maxFrames?: number;
  /**
   * Use thumbnail mode for non-sequential access (e.g., thumbnail generation)
   * Uses keyframe preview decoder which is faster for random access
   */
  useThumbnailMode?: boolean;
}

// =============================================================================
// MediaRequestProxy Implementation
// =============================================================================

class MediaRequestProxy implements IMediaRequestProxy {
  private requestIdCounter = 0;

  /**
   * 已发送到 Extension Host、等待响应的请求
   */
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeoutId: number;
      requestType: MediaRequest['type'];
      startedAt: number;
      timeoutMs: number;
      signal?: AbortSignal;
      abortListener?: () => void;
    }
  >();

  /**
   * 待发送队列（带优先级），用于控制并发/背压
   */
  private queuedRequests: Array<{
    request: MediaRequest;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abortListener?: () => void;
    priority: number;
    timeoutMs: number;
    enqueuedAt: number;
  }> = [];

  private activeCount = 0;
  private readonly maxConcurrent: number;
  private readonly performanceMonitor = new PerformanceMonitor();

  constructor(
    private readonly timeout = MEDIA_REQUEST_TIMEOUT,
    maxConcurrent = MAX_CONCURRENT_REQUESTS,
  ) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
    // Listen to Extension responses
    window.addEventListener('message', this.handleMessage);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  async getVideoFrame(
    videoPath: string,
    timeInSeconds: number,
    options?: MediaRequestOptions,
  ): Promise<ImageBitmap> {
    const requestId = this.generateRequestId();

    const request: MediaRequest = {
      type: 'media:getVideoFrame',
      requestId,
      timestamp: Date.now(),
      payload: {
        videoPath,
        timeInSeconds,
        quality: options?.quality, // Phase 2: Pass quality parameter
        scale: options?.scale, // Phase 2: Pass scale parameter
      },
    };

    const response = await this.sendRequest<GetVideoFrameResponse>(request, options);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.payload) {
      throw new Error('No payload in response');
    }

    // Handle both supported image transports.
    if (response.payload.imageDataUrl) {
      return dataUrlToImageBitmap(response.payload.imageDataUrl);
    } else if (response.payload.imageBuffer) {
      return arrayBufferToImageBitmap(
        response.payload.imageBuffer,
        response.payload.mimeType || 'image/jpeg',
        logger,
      );
    }

    throw new Error('Invalid response payload format');
  }

  async getVideoFrameRange(
    videoPath: string,
    startTime: number,
    duration: number,
    fps: number,
    options?: MediaRequestOptions,
  ): Promise<Array<{ time: number; bitmap: ImageBitmap }>> {
    const requestId = this.generateRequestId();

    const request: MediaRequest = {
      type: 'media:getVideoFrameRange',
      requestId,
      timestamp: Date.now(),
      payload: {
        videoPath,
        startTime,
        duration,
        fps,
        quality: options?.quality, // Phase 2: Pass quality parameter
        scale: options?.scale, // Phase 2: Pass scale parameter
        maxFrames: options?.maxFrames, // Pass maxFrames limit to Extension
      },
    };

    const response = await this.sendRequest<GetVideoFrameRangeResponse>(request, options);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.payload || !response.payload.frames) {
      throw new Error('No payload in response');
    }

    // Convert frames to ImageBitmaps
    // Skip corrupted frames instead of failing entire batch
    const results: Array<{ time: number; bitmap: ImageBitmap }> = [];
    let skippedCount = 0;

    for (const frame of response.payload.frames) {
      try {
        let bitmap: ImageBitmap;
        if (frame.imageDataUrl) {
          bitmap = await dataUrlToImageBitmap(frame.imageDataUrl);
        } else if (frame.imageBuffer) {
          const mimeType = response.payload.mimeType || 'image/jpeg';
          bitmap = await arrayBufferToImageBitmap(frame.imageBuffer, mimeType, logger);
        } else {
          throw new Error('Frame has no image data');
        }
        results.push({ time: frame.time, bitmap });
      } catch (error) {
        // Skip corrupted frame, continue with others
        skippedCount++;
        if (skippedCount <= 3) {
          logger.warn(`Skipped corrupted frame at ${frame.time.toFixed(2)}s:`, error);
        }
      }
    }

    if (skippedCount > 0) {
      logger.warn(`Skipped ${skippedCount}/${response.payload.frames.length} corrupted frames`);
    }

    return results;
  }

  async decodeAudioSegment(
    videoPath: string,
    startTime: number,
    duration: number,
    sampleRate = 48000,
    channels = 2,
    options?: MediaRequestOptions,
  ): Promise<AudioBuffer> {
    const requestId = this.generateRequestId();

    const request: MediaRequest = {
      type: 'media:decodeAudioSegment',
      requestId,
      timestamp: Date.now(),
      payload: { videoPath, startTime, duration, sampleRate, channels },
    };

    const response = await this.sendRequest<DecodeAudioSegmentResponse>(request, options);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.payload) {
      throw new Error('No payload in response');
    }

    // Convert ArrayBuffer to AudioBuffer
    return arrayBufferToAudioBuffer(
      response.payload.buffer,
      response.payload.sampleRate,
      response.payload.channels,
    );
  }

  async probeMediaInfo(videoPath: string, options?: MediaRequestOptions): Promise<MediaInfo> {
    const requestId = this.generateRequestId();

    const request: MediaRequest = {
      type: 'media:probeMediaInfo',
      requestId,
      timestamp: Date.now(),
      payload: { videoPath },
    };

    const response = await this.sendRequest<ProbeMediaInfoResponse>(request, options);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.payload) {
      throw new Error('No payload in response');
    }

    return response.payload;
  }

  async extractSubtitles(
    videoPath: string,
    options?: MediaRequestOptions,
  ): Promise<ExtractedSubtitleTrack[]> {
    const requestId = this.generateRequestId();

    const request: MediaRequest = {
      type: 'media:extractSubtitles',
      requestId,
      timestamp: Date.now(),
      payload: { videoPath },
    };

    const response = await this.sendRequest<ExtractSubtitlesResponse>(request, options);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.payload?.tracks ?? [];
  }

  async getWaveform(
    filePath: string,
    options?: MediaRequestOptions,
  ): Promise<{
    sampleRate: number;
    channels: number;
    peaksPerSecond: number;
    duration: number;
    peaks: number[][];
  }> {
    const requestId = this.generateRequestId();

    const request: MediaRequest = {
      type: 'media:getWaveform',
      requestId,
      timestamp: Date.now(),
      payload: { filePath },
    };

    const response = await this.sendRequest<GetWaveformResponse>(request, options);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.payload) {
      throw new Error('No payload in waveform response');
    }

    return response.payload;
  }

  // =========================================================================
  // Compatible Mode Methods
  // =========================================================================

  async compatibleGetVideoFrame(
    videoPath: string,
    timeInSeconds: number,
    width?: number,
    height?: number,
    options?: MediaRequestOptions,
  ): Promise<ImageBitmap> {
    const requestId = this.generateRequestId();

    const request: CompatibleGetVideoFrameRequest = {
      type: 'media:compatibleGetVideoFrame',
      requestId,
      timestamp: Date.now(),
      payload: {
        videoPath,
        timeInSeconds,
        width,
        height,
      },
    };

    const response = await this.sendCompatibleRequest<CompatibleGetVideoFrameResponse>(
      request,
      options,
    );

    return processCompatibleFrameResponse(response, logger);
  }

  async renderCompositeFrame(
    layers: CompositeLayerConfig[],
    time: number,
    width: number,
    height: number,
    backgroundColor?: [number, number, number, number],
    options?: MediaRequestOptions,
  ): Promise<ImageBitmap> {
    const requestId = this.generateRequestId();

    const request: RenderCompositeFrameRequest = {
      type: 'media:renderCompositeFrame',
      requestId,
      timestamp: Date.now(),
      payload: {
        layers,
        time,
        width,
        height,
        backgroundColor,
      },
    };

    const response = await this.sendCompatibleRequest<RenderCompositeFrameResponse>(
      request,
      options,
    );

    return processCompositeFrameResponse(response, logger);
  }

  // =========================================================================
  // Stats & Bitrate (delegated to PerformanceMonitor)
  // =========================================================================

  /**
   * Get engine-side stream pipeline stats (timelines:stream_stats)
   */
  async getStreamStats(): Promise<StreamStats | null> {
    const requestId = this.generateRequestId();
    const vscode = getVSCodeAPI();
    return this.performanceMonitor.getStreamStats(requestId, vscode);
  }

  /**
   * Get media bitrate info from Extension
   */
  async getMediaBitrate(mediaPath: string): Promise<MediaBitrateInfo> {
    const requestId = this.generateRequestId();
    const vscode = getVSCodeAPI();
    return this.performanceMonitor.getMediaBitrate(requestId, mediaPath, vscode);
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  dispose(): void {
    window.removeEventListener('message', this.handleMessage);

    // Reject all queued requests
    for (const queued of this.queuedRequests) {
      if (queued.signal && queued.abortListener) {
        queued.signal.removeEventListener('abort', queued.abortListener);
      }
      queued.reject(new Error('MediaRequestProxy disposed'));
    }
    this.queuedRequests = [];

    // Reject all in-flight requests
    for (const [_requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      if (pending.signal && pending.abortListener) {
        pending.signal.removeEventListener('abort', pending.abortListener);
      }
      pending.reject(new Error('MediaRequestProxy disposed'));
    }

    this.pendingRequests.clear();
    this.activeCount = 0;
    this.performanceMonitor.dispose();
    disposeAudioContext();
  }

  /**
   * Cancel all pending requests
   * Useful when playback stops to prevent timeout errors from queued requests
   */
  cancelAllPendingRequests(): void {
    const queuedCount = this.queuedRequests.length;
    const inFlightCount = this.pendingRequests.size;
    const total = queuedCount + inFlightCount;
    if (total === 0) return;

    // Cancel queued (not yet sent) requests
    for (const queued of this.queuedRequests) {
      if (queued.signal && queued.abortListener) {
        queued.signal.removeEventListener('abort', queued.abortListener);
      }
      queued.reject(new Error('Request cancelled'));
    }
    this.queuedRequests = [];

    // Cancel in-flight (sent, awaiting response) requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      if (pending.signal && pending.abortListener) {
        pending.signal.removeEventListener('abort', pending.abortListener);
      }
      pending.reject(new Error('Request cancelled'));
      this.pendingRequests.delete(requestId);
    }

    this.activeCount = 0;
  }

  /**
   * Get number of pending requests
   */
  get pendingRequestCount(): number {
    return this.pendingRequests.size + this.queuedRequests.length;
  }

  // ===========================================================================
  // Private: Request Queue Management
  // ===========================================================================

  /**
   * Send compatible mode request to Extension Host and wait for response
   * These requests use different types than standard MediaRequest/MediaResponse
   */
  private sendCompatibleRequest<
    T extends RenderCompositeFrameResponse | CompatibleGetVideoFrameResponse,
  >(
    request: RenderCompositeFrameRequest | CompatibleGetVideoFrameRequest,
    options?: MediaRequestOptions,
  ): Promise<T> {
    // Reuse the same queue mechanism but with a type assertion
    // The request structure is compatible with MediaRequest
    return this.sendRequest(request as unknown as MediaRequest, options) as unknown as Promise<T>;
  }

  /**
   * Send request to Extension Host and wait for response
   */
  private sendRequest<T extends MediaResponse>(
    request: MediaRequest,
    options?: MediaRequestOptions,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const vscode = getVSCodeAPI();
      if (!vscode) {
        reject(new Error('VSCode API not available'));
        return;
      }

      const signal = options?.signal;
      const priority = options?.priority ?? 0;
      const timeoutMs = options?.timeoutMs ?? this.timeout;
      if (signal?.aborted) {
        reject(this.createAbortError());
        return;
      }

      // Enqueue request; timeout starts when actually sent (not when queued)
      const queued = {
        request,
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
        abortListener: undefined as (() => void) | undefined,
        priority,
        timeoutMs,
        enqueuedAt: Date.now(),
      };

      if (signal) {
        const requestId = request.requestId;
        const abortListener = () => {
          // 1) If still in queue: remove and reject immediately
          const removed = this.removeQueuedRequest(requestId);
          if (removed) {
            if (removed.signal && removed.abortListener) {
              removed.signal.removeEventListener('abort', removed.abortListener);
            }
            removed.reject(this.createAbortError());
            return;
          }

          // 2) If already sent: abort waiting (won't cancel Extension-side task)
          this.abortInFlightRequest(requestId);
        };
        queued.abortListener = abortListener;
        signal.addEventListener('abort', abortListener, { once: true });
      }

      this.enqueueRequest(queued);
      this.processQueue();
    });
  }

  private enqueueRequest(request: {
    request: MediaRequest;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abortListener?: () => void;
    priority: number;
    timeoutMs: number;
    enqueuedAt: number;
  }): void {
    // Insert by priority (higher priority first, same priority preserves order)
    const insertIndex = this.queuedRequests.findIndex((r) => r.priority < request.priority);
    if (insertIndex === -1) {
      this.queuedRequests.push(request);
    } else {
      this.queuedRequests.splice(insertIndex, 0, request);
    }
  }

  private processQueue(): void {
    const vscode = getVSCodeAPI();
    if (!vscode) return;

    while (this.activeCount < this.maxConcurrent && this.queuedRequests.length > 0) {
      const queued = this.queuedRequests.shift();
      if (!queued) break;

      // May have been aborted while waiting in queue
      if (queued.signal?.aborted) {
        if (queued.signal && queued.abortListener) {
          queued.signal.removeEventListener('abort', queued.abortListener);
        }
        queued.reject(this.createAbortError());
        continue;
      }

      this.activeCount++;
      const startedAt = Date.now();

      // Setup timeout (starts from "actual send", not from enqueue)
      const timeoutId = window.setTimeout(() => {
        this.finalizeInFlightRequest(
          queued.request.requestId,
          new Error(`Request timeout after ${queued.timeoutMs}ms`),
        );
      }, queued.timeoutMs);

      // Store pending request (in-flight)
      this.pendingRequests.set(queued.request.requestId, {
        resolve: queued.resolve,
        reject: queued.reject,
        timeoutId,
        requestType: queued.request.type,
        startedAt,
        timeoutMs: queued.timeoutMs,
        signal: queued.signal,
        abortListener: queued.abortListener,
      });

      // Send to Extension Host
      vscode.postMessage(queued.request);
    }
  }

  private removeQueuedRequest(requestId: string): {
    request: MediaRequest;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abortListener?: () => void;
    priority: number;
    timeoutMs: number;
    enqueuedAt: number;
  } | null {
    const index = this.queuedRequests.findIndex((r) => r.request.requestId === requestId);
    if (index === -1) return null;
    const [removed] = this.queuedRequests.splice(index, 1);
    return removed || null;
  }

  private abortInFlightRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;
    this.finalizeInFlightRequest(requestId, this.createAbortError());
  }

  private finalizeInFlightRequest(
    requestId: string,
    error?: Error,
    response?: MediaResponse,
  ): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
    this.pendingRequests.delete(requestId);
    this.activeCount = Math.max(0, this.activeCount - 1);

    if (error) {
      // Track timeouts: log queue state for bottleneck diagnosis
      if (error.message.startsWith('Request timeout after')) {
        logger.warn('Request timeout:', {
          requestId,
          type: pending.requestType,
          timeoutMs: pending.timeoutMs,
          elapsedMs: Date.now() - pending.startedAt,
          active: this.activeCount,
          queued: this.queuedRequests.length,
        });
      }
      pending.reject(error);
    } else if (response) {
      pending.resolve(response);
    }

    // Release concurrency slot, continue scheduling
    this.processQueue();
  }

  private createAbortError(): Error {
    // Prefer DOMException for standard AbortError detection in VSCode Webview/browser
    if (typeof DOMException !== 'undefined') {
      return new DOMException('Request aborted', 'AbortError') as unknown as Error;
    }
    const error = new Error('Request aborted');
    (error as unknown as { name: string }).name = 'AbortError';
    return error;
  }

  // ===========================================================================
  // Private: Message Handling
  // ===========================================================================

  /**
   * Handle incoming message from Extension Host
   */
  private handleMessage = (event: MessageEvent): void => {
    const message = event.data;

    // Delegate stats/bitrate responses to PerformanceMonitor
    if (this.performanceMonitor.handleResponse(message)) {
      return;
    }

    // Check if this is a media response (including compatible mode responses)
    if (!this.isMediaResponse(message) && !isCompatibleModeResponse(message)) {
      return;
    }

    const response = message as
      | MediaResponse
      | RenderCompositeFrameResponse
      | CompatibleGetVideoFrameResponse;
    this.finalizeInFlightRequest(response.requestId, undefined, response as MediaResponse);
  };

  /**
   * Type guard for MediaResponse
   */
  private isMediaResponse(message: unknown): message is MediaResponse {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const msg = message as Record<string, unknown>;

    return (
      typeof msg.type === 'string' &&
      msg.type.startsWith('media:response:') &&
      !msg.type.includes('compatible') &&
      !msg.type.includes('renderComposite') &&
      typeof msg.requestId === 'string'
    );
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${this.requestIdCounter++}`;
  }
}

// =============================================================================
// Export
// =============================================================================

/**
 * Export the class for use in mediaProxyFactory
 */
export { MediaRequestProxy };
