/**
 * PyramidThumbnailGenerator - Dynamic-interval thumbnail for video timeline
 *
 * Architecture:
 *   Single dynamic level: interval = TARGET_THUMB_WIDTH_PX / pixelsPerSecond
 *   Clamped to [0.5s, 60s], snapped to 0.5s steps
 *
 * Data flow:
 *   MediaRequestProxy → videos:capture (Rust) → ImageBitmap → dataUrl
 *
 * Key features:
 * - Dynamic interval: thumbnail density adapts to zoom level (~80px per thumb)
 * - On-demand loading: only loads thumbnails needed for current viewport
 * - Memory efficient: uses LRU cache with size limit
 * - Concurrent requests: bounded parallelism (4 concurrent) to Rust backend
 */

import { getMediaProxy } from '../services/mediaProxyFactory';

// =============================================================================
// Types
// =============================================================================

/** Thumbnail resolution level */
export type ThumbnailLevel = 'L1' | 'L2' | 'L3';

/** Single thumbnail data */
export interface ThumbnailFrame {
  /** Time in seconds */
  time: number;
  /** Data URL (JPEG) */
  dataUrl: string;
  /** Whether this is a placeholder */
  isPlaceholder?: boolean;
}

/** Level thumbnail data */
export interface LevelThumbnailData {
  level: ThumbnailLevel;
  /** Frames per second for this level */
  framesPerSecond: number;
  /** Thumbnail frames */
  frames: ThumbnailFrame[];
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Whether this level is complete */
  isComplete: boolean;
}

/** Pyramid thumbnail data structure */
export interface PyramidThumbnailData {
  /** Video duration in seconds */
  duration: number;
  /** Video width */
  width: number;
  /** Video height */
  height: number;
  /** L1 overview data */
  l1: LevelThumbnailData | null;
  /** L2 navigation data (loaded progressively) */
  l2: LevelThumbnailData | null;
  /** L3 detail data (loaded on-demand for viewport) */
  l3: LevelThumbnailData | null;
}

/** Viewport for on-demand loading */
export interface ThumbnailViewport {
  startTime: number;
  endTime: number;
  /** Pixels per second (determines required resolution) */
  pixelsPerSecond: number;
  /** Target thumbnail height */
  height: number;
}

/** Progress callback */
export type ThumbnailProgressCallback = (progress: {
  level: ThumbnailLevel;
  percent: number;
  message: string;
}) => void;

// =============================================================================
// Constants
// =============================================================================

/** Default thumbnail height */
const DEFAULT_THUMBNAIL_HEIGHT = 60;

/** JPEG quality for thumbnails */
const THUMBNAIL_QUALITY = 0.6;

/** Maximum cached frames per level */
const MAX_CACHED_FRAMES = 500;

/** Max concurrent thumbnail requests to Rust */
const MAX_CONCURRENT_REQUESTS = 4;

/** Target thumbnail width in pixels — used to compute dynamic interval */
const TARGET_THUMB_WIDTH_PX = 80;

/** Compute dynamic interval (seconds) from pixelsPerSecond, clamped to [0.5, 60] */
function computeInterval(pixelsPerSecond: number): number {
  if (pixelsPerSecond <= 0) return 30;
  const raw = TARGET_THUMB_WIDTH_PX / pixelsPerSecond;
  return Math.max(0.5, Math.min(60, Math.round(raw * 2) / 2)); // snap to 0.5s steps
}

// =============================================================================
// PyramidThumbnailGenerator
// =============================================================================

export class PyramidThumbnailGenerator {
  private _videoPath = '';
  private _duration = 0;
  private _width = 0;
  private _height = 0;
  private _disposed = false;

  // Cached thumbnail data
  private _cache: Map<number, ThumbnailFrame> = new Map(); // time -> frame

  constructor() {}

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Initialize the generator with a video source
   */
  async initialize(videoPath: string): Promise<PyramidThumbnailData> {
    if (this._disposed) {
      throw new Error('Generator has been disposed');
    }

    this._videoPath = videoPath;

    // Get media info
    const mediaInfo = await getMediaProxy().probeMediaInfo(videoPath);
    this._duration = mediaInfo.duration;
    this._width = mediaInfo.width;
    this._height = mediaInfo.height;

    return this._buildPyramidData();
  }

  /**
   * Get thumbnails for a viewport with dynamic interval based on zoom level.
   * Interval is computed so each thumbnail is ~80px wide on screen.
   */
  async getThumbnailsForViewport(viewport: ThumbnailViewport): Promise<LevelThumbnailData> {
    const { startTime, endTime, pixelsPerSecond, height } = viewport;
    const interval = computeInterval(pixelsPerSecond);

    const frames = await this._generateFramesConcurrent(
      startTime,
      endTime,
      interval,
      height || DEFAULT_THUMBNAIL_HEIGHT,
      this._cache,
      'L2',
    );

    return {
      level: 'L2',
      framesPerSecond: 1 / interval,
      frames,
      startTime,
      endTime,
      isComplete: true,
    };
  }

  /**
   * Get current pyramid data structure
   */
  getPyramidData(): PyramidThumbnailData {
    return this._buildPyramidData();
  }

  /**
   * Clear cached data
   */
  clearCache(): void {
    this._cache.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._disposed = true;
    this._cache.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Build pyramid data structure
   */
  private _buildPyramidData(): PyramidThumbnailData {
    return {
      duration: this._duration,
      width: this._width,
      height: this._height,
      l1: null,
      l2: null,
      l3: null,
    };
  }

  /**
   * Generate frames concurrently with bounded parallelism.
   * Cached frames are returned immediately; only missing frames hit Rust.
   */
  private async _generateFramesConcurrent(
    startTime: number,
    endTime: number,
    interval: number,
    height: number,
    cache: Map<number, ThumbnailFrame>,
    level: ThumbnailLevel,
    onProgress?: ThumbnailProgressCallback,
  ): Promise<ThumbnailFrame[]> {
    const duration = endTime - startTime;
    const frameCount = Math.ceil(duration / interval);

    // Build list of times and separate cached vs uncached
    const times: number[] = [];
    const cachedFrames = new Map<number, ThumbnailFrame>();
    const uncachedTimes: number[] = [];

    for (let i = 0; i < frameCount; i++) {
      const t = startTime + i * interval;
      times.push(t);
      const cached = cache.get(t);
      if (cached) {
        cachedFrames.set(t, cached);
      } else {
        uncachedTimes.push(t);
      }
    }

    // Generate uncached frames with bounded concurrency
    let completed = cachedFrames.size;
    const newFrames = new Map<number, ThumbnailFrame>();

    // Process in batches of MAX_CONCURRENT_REQUESTS
    for (let i = 0; i < uncachedTimes.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = uncachedTimes.slice(i, i + MAX_CONCURRENT_REQUESTS);
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          const dataUrl = await this._generateThumbnail(t, height);
          return { time: t, dataUrl } as ThumbnailFrame;
        }),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const t = batch[j];
        if (result.status === 'fulfilled') {
          newFrames.set(t, result.value);
          this._cacheFrame(cache, t, result.value);
        } else {
          newFrames.set(t, this._createPlaceholder(t, height));
        }
        completed++;
        onProgress?.({
          level,
          percent: (completed / frameCount) * 100,
          message: `Generating ${level}: ${completed}/${frameCount}`,
        });
      }
    }

    // Assemble in order
    return times.map((t) => cachedFrames.get(t) ?? newFrames.get(t)!);
  }

  /**
   * Generate a single thumbnail
   */
  private async _generateThumbnail(time: number, height: number): Promise<string> {
    const scale = this._height > 0 ? height / this._height : 1;

    const imageBitmap = await getMediaProxy().getVideoFrame(this._videoPath, time, {
      scale,
      useThumbnailMode: true,
    });

    if (!imageBitmap) {
      throw new Error(`Failed to get frame at ${time}s`);
    }

    try {
      // Convert to dataUrl
      const aspectRatio = this._width / this._height || 16 / 9;
      const width = Math.round(height * aspectRatio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      ctx.drawImage(imageBitmap, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
    } finally {
      imageBitmap.close();
    }
  }

  /**
   * Create a placeholder thumbnail
   */
  private _createPlaceholder(time: number, height: number): ThumbnailFrame {
    const aspectRatio = this._width / this._height || 16 / 9;
    const width = Math.round(height * aspectRatio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
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
      isPlaceholder: true,
    };
  }

  /**
   * Cache a frame with LRU eviction
   */
  private _cacheFrame(
    cache: Map<number, ThumbnailFrame>,
    time: number,
    frame: ThumbnailFrame,
  ): void {
    // Evict oldest if at capacity
    if (cache.size >= MAX_CACHED_FRAMES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
    cache.set(time, frame);
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a PyramidThumbnailGenerator instance
 */
export function createPyramidThumbnailGenerator(): PyramidThumbnailGenerator {
  return new PyramidThumbnailGenerator();
}

// =============================================================================
// Singleton Cache
// =============================================================================

const generatorCache = new Map<string, PyramidThumbnailGenerator>();

/**
 * Get or create a PyramidThumbnailGenerator for a video
 */
export async function getPyramidThumbnailGenerator(
  videoPath: string,
): Promise<PyramidThumbnailGenerator> {
  let generator = generatorCache.get(videoPath);

  if (!generator) {
    generator = createPyramidThumbnailGenerator();
    await generator.initialize(videoPath);
    generatorCache.set(videoPath, generator);
  }

  return generator;
}

/**
 * Clear all cached generators
 */
export function clearPyramidThumbnailCache(): void {
  for (const generator of generatorCache.values()) {
    generator.dispose();
  }
  generatorCache.clear();
}

/**
 * Clear cached generator for a specific video
 */
export function clearPyramidThumbnailCacheForVideo(videoPath: string): void {
  const generator = generatorCache.get(videoPath);
  if (generator) {
    generator.dispose();
    generatorCache.delete(videoPath);
  }
}
