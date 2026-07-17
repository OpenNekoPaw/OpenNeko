/**
 * ThumbnailService - Video thumbnail generation (dual-mode)
 *
 * Generates video thumbnails via ModeAwareMediaProxy:
 * - Basic mode: Webview-local WebCodecs decoding with PyramidThumbnailGenerator
 * - Compatible mode: Extension FFmpeg extraction (via IPC)
 *
 * Features:
 * - Scale-aware: requests thumbnails at target size to minimize transfer/memory
 * - Request deduplication (pending map)
 * - Concurrency control (max parallel requests)
 * - LRU cache with size limit
 * - Cancellation support (AbortController)
 * - Pyramid thumbnails: L1 (overview), L2 (navigation), L3 (detail)
 */

import type { UrlResolver } from './urlResolverFactory';
import { getFileUri } from '../utils/fileUri';
import { getMediaProxy } from './mediaProxyFactory';
import { getLogger } from '../utils/logger';

const logger = getLogger('ThumbnailService');
import {
  getPyramidThumbnailGenerator,
  clearPyramidThumbnailCacheForVideo,
  type ThumbnailViewport,
} from '../utils/pyramidThumbnail';

// =============================================================================
// Types
// =============================================================================

export interface ThumbnailData {
  time: number;
  dataUrl: string;
}

export interface ThumbnailRequestOptions {
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Priority (higher = more important) */
  priority?: number;
}

export interface IThumbnailService {
  /** Generate thumbnails for a video file */
  getThumbnails(
    filePath: string,
    count: number,
    height: number,
    trimStart?: number,
    trimEnd?: number,
    options?: ThumbnailRequestOptions,
  ): Promise<ThumbnailData[]>;

  /** Generate thumbnails for a viewport (pyramid mode) */
  getThumbnailsForViewport(
    filePath: string,
    viewport: ThumbnailViewport,
    options?: ThumbnailRequestOptions,
  ): Promise<ThumbnailData[]>;

  /** Generate thumbnails at explicit source times */
  getThumbnailsAtTimes(
    filePath: string,
    times: readonly number[],
    height: number,
    options?: ThumbnailRequestOptions,
  ): Promise<ThumbnailData[]>;

  /** Clear thumbnail cache */
  clearCache(): void;

  /** Clear thumbnail cache for a specific file */
  clearCacheForFile(filePath: string): void;

  /** Get cache statistics */
  getCacheStats(): { size: number; maxSize: number };

  /** Dispose resources */
  dispose(): void;
}

// =============================================================================
// Constants
// =============================================================================

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

const DEFAULT_ASPECT_RATIO = 16 / 9;
const THUMBNAIL_QUALITY = 0.6;
// JPEG quality for FFmpeg extraction (2-31, lower=better quality)
// Use high value (low quality) for small thumbnails to reduce transfer size
const THUMBNAIL_JPEG_QUALITY = 15;

// Configuration
const MAX_CACHE_SIZE = 200; // Maximum number of cached thumbnail sets
const MAX_CONCURRENT_REQUESTS = 3; // Maximum parallel thumbnail generations
// Thumbnail 生成属于后台任务，避免抢占预览播放帧的 IPC 资源
const THUMBNAIL_MEDIA_REQUEST_PRIORITY_BASE = -50;

// =============================================================================
// LRU Cache Implementation
// =============================================================================

class LRUCache<K, V> {
  private _cache = new Map<K, V>();
  private _maxSize: number;

  constructor(maxSize: number) {
    this._maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this._cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this._cache.delete(key);
      this._cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Delete if exists (to update position)
    if (this._cache.has(key)) {
      this._cache.delete(key);
    }
    // Evict oldest if at capacity
    while (this._cache.size >= this._maxSize) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey !== undefined) {
        this._cache.delete(oldestKey);
      }
    }
    this._cache.set(key, value);
  }

  has(key: K): boolean {
    return this._cache.has(key);
  }

  delete(key: K): boolean {
    return this._cache.delete(key);
  }

  clear(): void {
    this._cache.clear();
  }

  get size(): number {
    return this._cache.size;
  }

  get maxSize(): number {
    return this._maxSize;
  }
}

// =============================================================================
// Request Queue Implementation
// =============================================================================

interface QueuedRequest {
  key: string;
  execute: () => Promise<ThumbnailData[]>;
  resolve: (value: ThumbnailData[]) => void;
  reject: (reason: Error) => void;
  priority: number;
  signal?: AbortSignal;
}

class RequestQueue {
  private _queue: QueuedRequest[] = [];
  private _activeCount = 0;
  private _maxConcurrent: number;

  constructor(maxConcurrent: number) {
    this._maxConcurrent = maxConcurrent;
  }

  enqueue(request: QueuedRequest): void {
    // Insert by priority (higher priority first)
    const insertIndex = this._queue.findIndex((r) => r.priority < request.priority);
    if (insertIndex === -1) {
      this._queue.push(request);
    } else {
      this._queue.splice(insertIndex, 0, request);
    }
    logger.info(
      `Enqueued ${request.key}, queue length: ${this._queue.length}, active: ${this._activeCount}`,
    );
    this._processQueue();
  }

  private async _processQueue(): Promise<void> {
    logger.info(
      `_processQueue called, active: ${this._activeCount}, max: ${this._maxConcurrent}, queue: ${this._queue.length}`,
    );
    while (this._activeCount < this._maxConcurrent && this._queue.length > 0) {
      const request = this._queue.shift();
      if (!request) break;

      // Check if aborted before starting
      if (request.signal?.aborted) {
        logger.info(`Request ${request.key} was aborted before execution`);
        request.reject(new Error('Request aborted'));
        continue;
      }

      logger.info(`Starting execution of ${request.key}`);
      this._activeCount++;

      try {
        const result = await request.execute();
        logger.info(`Completed ${request.key}`);
        request.resolve(result);
      } catch (error) {
        logger.error(`Failed ${request.key}`, error);
        request.reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        this._activeCount--;
        // Process next in queue
        this._processQueue();
      }
    }
  }

  get activeCount(): number {
    return this._activeCount;
  }

  get queueLength(): number {
    return this._queue.length;
  }
}

// =============================================================================
// Implementation
// =============================================================================

class ThumbnailService implements IThumbnailService {
  private _cache: LRUCache<string, ThumbnailData[]>;
  private _pending = new Map<string, Promise<ThumbnailData[]>>();
  private _requestQueue: RequestQueue;
  private _urlResolver: UrlResolver;

  constructor(urlResolver?: UrlResolver, maxCacheSize = MAX_CACHE_SIZE) {
    this._urlResolver = urlResolver || this._defaultUrlResolver;
    this._cache = new LRUCache(maxCacheSize);
    this._requestQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS);
  }

  async getThumbnails(
    filePath: string,
    count: number,
    height: number,
    trimStart = 0,
    trimEnd = 0,
    options: ThumbnailRequestOptions = {},
  ): Promise<ThumbnailData[]> {
    const { signal, priority = 0 } = options;

    logger.info(`getThumbnails called: ${filePath}, count=${count}, height=${height}`);

    // Check if aborted
    if (signal?.aborted) {
      logger.info('Request already aborted');
      throw new Error('Request aborted');
    }

    // Generate cache key
    const cacheKey = `${filePath}-${count}-${height}-${trimStart}-${trimEnd}`;

    // Check cache (LRU)
    const cached = this._cache.get(cacheKey);
    if (cached) {
      logger.info(`Returning cached result for ${cacheKey}`);
      return cached;
    }

    // Check pending requests (deduplication)
    const pending = this._pending.get(cacheKey);
    if (pending) {
      logger.info(`Returning pending request for ${cacheKey}`);
      return pending;
    }

    logger.info(`Creating new request for ${cacheKey}`);

    // Create new request
    const requestPromise = new Promise<ThumbnailData[]>((resolve, reject) => {
      // Handle abort
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('Request aborted'));
          },
          { once: true },
        );
      }

      const execute = async (): Promise<ThumbnailData[]> => {
        // Check if image
        const ext = this._getExtension(filePath);
        logger.info(`execute: filePath=${filePath}, ext=${ext}`);
        if (IMAGE_EXTENSIONS.has(ext)) {
          logger.info('Generating image thumbnails');
          return this._generateImageThumbnails(filePath, count, height);
        }

        logger.info('Generating video thumbnails');
        // Generate video thumbnails via media proxy
        return this._generateVideoThumbnails(
          filePath,
          count,
          height,
          trimStart,
          trimEnd,
          signal,
          priority,
        );
      };

      // Enqueue request
      this._requestQueue.enqueue({
        key: cacheKey,
        execute,
        resolve: (result) => {
          // Cache result
          this._cache.set(cacheKey, result);
          this._pending.delete(cacheKey);
          resolve(result);
        },
        reject: (error) => {
          this._pending.delete(cacheKey);
          reject(error);
        },
        priority,
        signal,
      });
    });

    // Store as pending
    this._pending.set(cacheKey, requestPromise);

    return requestPromise;
  }

  /**
   * Generate thumbnails for a viewport using pyramid mode
   * Automatically selects appropriate resolution level based on zoom
   */
  async getThumbnailsForViewport(
    filePath: string,
    viewport: ThumbnailViewport,
    options: ThumbnailRequestOptions = {},
  ): Promise<ThumbnailData[]> {
    const { signal } = options;

    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    try {
      const generator = await getPyramidThumbnailGenerator(filePath);
      const levelData = await generator.getThumbnailsForViewport(viewport);

      return levelData.frames.map((frame) => ({
        time: frame.time,
        dataUrl: frame.dataUrl,
      }));
    } catch (error) {
      logger.error('getThumbnailsForViewport failed:', error);
      // Return empty array on failure
      return [];
    }
  }

  async getThumbnailsAtTimes(
    filePath: string,
    times: readonly number[],
    height: number,
    options: ThumbnailRequestOptions = {},
  ): Promise<ThumbnailData[]> {
    const { signal, priority = 0 } = options;

    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const uniqueTimes = [
      ...new Set(times.map((time) => Math.max(0, Math.round(time * 1000) / 1000))),
    ].sort((a, b) => a - b);

    if (uniqueTimes.length === 0) {
      return [];
    }

    const ext = this._getExtension(filePath);
    if (IMAGE_EXTENSIONS.has(ext)) {
      return this._generateImageThumbnailsAtTimes(filePath, uniqueTimes, height);
    }

    return this._generateVideoThumbnailsAtTimes(filePath, uniqueTimes, height, signal, priority);
  }

  clearCache(): void {
    this._cache.clear();
  }

  clearCacheForFile(filePath: string): void {
    // Clear from LRU cache
    for (const key of Array.from(this._cache['_cache'].keys())) {
      if (key.startsWith(filePath)) {
        this._cache.delete(key);
      }
    }
    // Clear pyramid generator cache
    clearPyramidThumbnailCacheForVideo(filePath);
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this._cache.size,
      maxSize: this._cache.maxSize,
    };
  }

  dispose(): void {
    this._cache.clear();
    this._pending.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _defaultUrlResolver: UrlResolver = async (path: string) => {
    return getFileUri(path);
  };

  private _getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filePath.slice(lastDot + 1).toLowerCase();
  }

  /**
   * Generate thumbnails for image files
   */
  private async _generateImageThumbnails(
    filePath: string,
    count: number,
    height: number,
  ): Promise<ThumbnailData[]> {
    const times = Array.from({ length: count }, () => 0);
    return this._generateImageThumbnailsAtTimes(filePath, times, height);
  }

  /**
   * Generate thumbnails for image files at explicit display/source times.
   */
  private async _generateImageThumbnailsAtTimes(
    filePath: string,
    times: readonly number[],
    height: number,
  ): Promise<ThumbnailData[]> {
    const uri = await this._urlResolver(filePath);

    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (ctx) {
          const aspectRatio = img.width / img.height;
          const width = Math.round(height * aspectRatio);
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);

          resolve(times.map((time) => ({ time, dataUrl })));
        } else {
          resolve([]);
        }
      };

      img.onerror = () => {
        resolve([]);
      };

      img.src = uri;
    });
  }

  private async _generateVideoThumbnailsAtTimes(
    filePath: string,
    times: readonly number[],
    height: number,
    signal?: AbortSignal,
    priority = 0,
  ): Promise<ThumbnailData[]> {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const mediaRequestPriority = THUMBNAIL_MEDIA_REQUEST_PRIORITY_BASE + priority;
    const mediaInfo = await getMediaProxy().probeMediaInfo(filePath, {
      signal,
      priority: mediaRequestPriority,
    });
    const aspectRatio = mediaInfo.width / mediaInfo.height || DEFAULT_ASPECT_RATIO;
    const width = Math.round(height * aspectRatio);
    const scale = mediaInfo.height > 0 ? height / mediaInfo.height : 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }

    const thumbnails: ThumbnailData[] = [];
    for (const requestedTime of times) {
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      const targetTime = Math.min(requestedTime, Math.max(0, mediaInfo.duration - 0.1));

      try {
        const imageBitmap = await getMediaProxy().getVideoFrame(filePath, targetTime, {
          signal,
          priority: mediaRequestPriority,
          scale,
          quality: THUMBNAIL_JPEG_QUALITY,
          useThumbnailMode: true,
        });

        if (imageBitmap) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(imageBitmap, 0, 0, width, height);
          thumbnails.push({
            time: requestedTime,
            dataUrl: canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY),
          });
          imageBitmap.close();
        } else {
          thumbnails.push(this._createPlaceholderThumbnail(requestedTime, width, height));
        }
      } catch (error) {
        if (signal?.aborted) {
          throw new Error('Request aborted');
        }
        logger.warn(`Failed to get frame at ${targetTime.toFixed(3)}s`, error);
        thumbnails.push(this._createPlaceholderThumbnail(requestedTime, width, height));
      }
    }

    return thumbnails;
  }

  /**
   * Generate video thumbnails via media proxy (routes based on mode)
   * Uses keyframe-aligned times for efficient decoding
   */
  private async _generateVideoThumbnails(
    filePath: string,
    count: number,
    height: number,
    trimStart: number,
    trimEnd: number,
    signal?: AbortSignal,
    priority = 0,
  ): Promise<ThumbnailData[]> {
    logger.info(`_generateVideoThumbnails called: ${filePath}`);

    // Check abort
    if (signal?.aborted) {
      logger.info('Request aborted at start');
      throw new Error('Request aborted');
    }

    const thumbnails: ThumbnailData[] = [];

    try {
      const mediaRequestPriority = THUMBNAIL_MEDIA_REQUEST_PRIORITY_BASE + priority;

      logger.info(`Getting media info for ${filePath}`);
      // Get media info first to calculate duration and aspect ratio
      const mediaInfo = await getMediaProxy().probeMediaInfo(filePath, {
        signal,
        priority: mediaRequestPriority,
      });
      logger.info(
        `Media info: duration=${mediaInfo.duration}, ${mediaInfo.width}x${mediaInfo.height}`,
      );

      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      const effectiveDuration = mediaInfo.duration - trimStart - trimEnd;

      // Validate effective duration
      if (effectiveDuration <= 0) {
        const width = Math.round(height * DEFAULT_ASPECT_RATIO);
        const placeholders: ThumbnailData[] = [];
        for (let i = 0; i < count; i++) {
          placeholders.push(this._createPlaceholderThumbnail(0, width, height));
        }
        return placeholders;
      }

      const aspectRatio = mediaInfo.width / mediaInfo.height || DEFAULT_ASPECT_RATIO;
      const width = Math.round(height * aspectRatio);

      // Calculate scale factor for thumbnail-sized output
      const scale = mediaInfo.height > 0 ? height / mediaInfo.height : 1;

      // Select evenly distributed thumbnail times
      // Rust capture API handles keyframe seek internally via FFmpeg
      const thumbnailTimes = this._selectThumbnailTimes(
        count,
        trimStart,
        trimEnd,
        effectiveDuration,
        mediaInfo.duration,
      );

      // Create reusable canvas for converting ImageBitmap to dataUrl
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      // Extract frames at selected times
      logger.info(`Generating ${thumbnailTimes.length} thumbnails for ${filePath}`);
      logger.info(
        `Thumbnail times: [${thumbnailTimes
          .slice(0, 5)
          .map((t) => t.toFixed(3))
          .join(', ')}${thumbnailTimes.length > 5 ? ', ...' : ''}]`,
      );

      for (const targetTime of thumbnailTimes) {
        // Check abort before each frame
        if (signal?.aborted) {
          throw new Error('Request aborted');
        }

        try {
          // Request frame from media proxy with scale hint
          // Use thumbnail mode for better performance (uses keyframe preview decoder)
          const imageBitmap = await getMediaProxy().getVideoFrame(filePath, targetTime, {
            signal,
            priority: mediaRequestPriority,
            scale,
            quality: THUMBNAIL_JPEG_QUALITY,
            useThumbnailMode: true,
          });

          if (imageBitmap) {
            // Draw to canvas (handles any remaining size mismatch)
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(imageBitmap, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
            thumbnails.push({ time: targetTime, dataUrl });
            imageBitmap.close();
          } else {
            logger.warn(`getVideoFrame returned null for time ${targetTime.toFixed(3)}s`);
            thumbnails.push(this._createPlaceholderThumbnail(targetTime, width, height));
          }
        } catch (frameError) {
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }
          logger.warn(`Failed to get frame at ${targetTime.toFixed(3)}s`, frameError);
          thumbnails.push(this._createPlaceholderThumbnail(targetTime, width, height));
        }
      }

      logger.info(`Generated ${thumbnails.length} thumbnails successfully`);
      return thumbnails;
    } catch (error) {
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      // Return placeholders on failure
      const width = Math.round(height * DEFAULT_ASPECT_RATIO);
      const placeholders: ThumbnailData[] = [];
      for (let i = 0; i < count; i++) {
        const progress = count > 1 ? i / (count - 1) : 0;
        placeholders.push(this._createPlaceholderThumbnail(progress * 10, width, height));
      }
      return placeholders;
    }
  }

  /**
   * Select evenly distributed thumbnail times within the effective range.
   * Rust capture API handles keyframe seek internally via FFmpeg's avformat_seek_file.
   */
  private _selectThumbnailTimes(
    count: number,
    trimStart: number,
    _trimEnd: number,
    effectiveDuration: number,
    totalDuration: number,
  ): number[] {
    const selectedTimes: number[] = [];
    for (let i = 0; i < count; i++) {
      const progress = count > 1 ? i / (count - 1) : 0;
      const rawTargetTime = trimStart + progress * effectiveDuration;
      selectedTimes.push(Math.min(rawTargetTime, totalDuration - 0.1));
    }
    return selectedTimes;
  }

  /**
   * Create a placeholder thumbnail for failed frame extraction
   */
  private _createPlaceholderThumbnail(time: number, width: number, height: number): ThumbnailData {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Draw gray background
      ctx.fillStyle = '#374151';
      ctx.fillRect(0, 0, width, height);

      // Draw play icon
      ctx.fillStyle = '#6B7280';
      const iconSize = Math.min(width, height) * 0.3;
      const centerX = width / 2;
      const centerY = height / 2;
      ctx.beginPath();
      ctx.moveTo(centerX - iconSize / 3, centerY - iconSize / 2);
      ctx.lineTo(centerX + iconSize / 2, centerY);
      ctx.lineTo(centerX - iconSize / 3, centerY + iconSize / 2);
      ctx.closePath();
      ctx.fill();
    }

    return {
      time,
      dataUrl: canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY),
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: ThumbnailService | null = null;

export function getThumbnailService(): IThumbnailService {
  if (!instance) {
    instance = new ThumbnailService();
  }
  return instance;
}
