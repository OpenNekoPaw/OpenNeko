/**
 * Video Frame Provider
 *
 * Provides frame data for video layers using NativeEngine's captureFrame API.
 */

import type { TrackLayer, FrameProvider } from './ExportService';
import type { NativeEngine as NativeEngineType } from '@neko-engine/host-napi';
import { getLogger } from '../../base/logger';
import { createNativeEngineBinding } from '../nativeEngineBinding';

const logger = getLogger('VideoFrameProvider');

// =============================================================================
// Frame Cache
// =============================================================================

interface CachedFrame {
  data: Buffer;
  width: number;
  height: number;
  timestamp: number;
}

class FrameCache {
  private _cache: Map<string, CachedFrame> = new Map();
  private _maxSize: number;

  constructor(maxSize: number = 30) {
    this._maxSize = maxSize;
  }

  private _makeKey(source: string, time: number): string {
    const roundedTime = Math.round(time * 30) / 30;
    return `${source}:${roundedTime.toFixed(3)}`;
  }

  get(source: string, time: number): CachedFrame | null {
    const key = this._makeKey(source, time);
    return this._cache.get(key) ?? null;
  }

  set(source: string, time: number, frame: CachedFrame): void {
    if (this._cache.size >= this._maxSize) {
      const firstKey = this._cache.keys().next().value;
      if (firstKey) {
        this._cache.delete(firstKey);
      }
    }

    const key = this._makeKey(source, time);
    this._cache.set(key, frame);
  }

  clear(): void {
    this._cache.clear();
  }
}

// =============================================================================
// Video Frame Provider
// =============================================================================

class VideoFrameProvider implements FrameProvider {
  private _engine: NativeEngineType | null = null;
  private _cache: FrameCache;
  private _initialized = false;

  constructor() {
    this._cache = new FrameCache(30);
  }

  /**
   * Initialize by loading NativeEngine
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    try {
      this._engine = await createNativeEngineBinding();
      this._initialized = true;
      logger.info('Initialized with NativeEngine');
    } catch (error) {
      logger.error('Failed to initialize', error);
      throw new Error(`VideoFrameProvider initialization failed: ${error}`);
    }
  }

  /**
   * Initialize with an existing NativeEngine instance
   */
  initializeWithEngine(engine: NativeEngineType): void {
    this._engine = engine;
    this._initialized = true;
  }

  /**
   * Get frame data for a layer at a specific time
   */
  async getFrameData(
    layer: TrackLayer,
    localTime: number,
  ): Promise<{ data: Buffer; width: number; height: number } | null> {
    if (!this._engine) {
      throw new Error('VideoFrameProvider not initialized');
    }

    if (!layer.source) {
      return null;
    }

    if (layer.type !== 'video' && layer.type !== 'image') {
      return null;
    }

    // Check cache first
    const cached = this._cache.get(layer.source, localTime);
    if (cached) {
      return { data: cached.data, width: cached.width, height: cached.height };
    }

    try {
      const responseJson = await this._engine.captureFrame(layer.source, localTime, 100, 'rgba');
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok' || !response.data) {
        return null;
      }

      const frameData = response.data;
      const buffer = Buffer.from(frameData.data, 'base64');

      // Cache the result
      this._cache.set(layer.source, localTime, {
        data: buffer,
        width: frameData.width,
        height: frameData.height,
        timestamp: frameData.timestamp ?? localTime,
      });

      return { data: buffer, width: frameData.width, height: frameData.height };
    } catch (error) {
      logger.error(`Failed to decode frame for ${layer.source} at ${localTime}`, error);
      return null;
    }
  }

  /**
   * Clear the frame cache
   */
  clearCache(): void {
    this._cache.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._cache.clear();
    this._engine = null;
    this._initialized = false;
  }
}

/**
 * Create and initialize a VideoFrameProvider
 */
export async function createVideoFrameProvider(): Promise<VideoFrameProvider> {
  const provider = new VideoFrameProvider();
  await provider.initialize();
  return provider;
}
