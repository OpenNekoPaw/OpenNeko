/**
 * MediaInfoService - Media metadata extraction via FFmpeg
 *
 * Uses Extension FFmpeg probe for reliable duration extraction
 * instead of HTML5 video/audio elements which have codec limitations.
 */

import { getMediaProxy } from './mediaProxyFactory';
import { DEFAULT_VIDEO_DURATION, DEFAULT_IMAGE_DURATION } from '../constants';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaInfoService');

// =============================================================================
// Types
// =============================================================================

export interface MediaInfo {
  duration: number;
  width?: number;
  height?: number;
}

export interface IMediaInfoService {
  /** Get media duration in seconds */
  getDuration(filePath: string): Promise<number>;
  /** Get full media info (duration, dimensions) */
  getMediaInfo(filePath: string): Promise<MediaInfo>;
  /** Preload media info without blocking */
  preload(filePath: string): void;
  /** Clear all cached info */
  clearCache(): void;
}

// =============================================================================
// Constants
// =============================================================================

// Image extensions (don't need duration from metadata)
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

// =============================================================================
// Implementation
// =============================================================================

class MediaInfoService implements IMediaInfoService {
  private _cache = new Map<string, MediaInfo>();
  private _pending = new Map<string, Promise<MediaInfo>>();

  async getDuration(filePath: string): Promise<number> {
    const info = await this.getMediaInfo(filePath);
    return info.duration;
  }

  async getMediaInfo(filePath: string): Promise<MediaInfo> {
    // Check cache
    const cached = this._cache.get(filePath);
    if (cached) {
      return cached;
    }

    // Check pending request (dedup)
    const pending = this._pending.get(filePath);
    if (pending) {
      return pending;
    }

    // Check if image (no metadata needed)
    const ext = this._getExtension(filePath);
    if (IMAGE_EXTENSIONS.has(ext)) {
      const info: MediaInfo = { duration: DEFAULT_IMAGE_DURATION };
      this._cache.set(filePath, info);
      return info;
    }

    // Create new request using FFmpeg probe
    const promise = this._fetchMediaInfoViaFFmpeg(filePath);
    this._pending.set(filePath, promise);

    try {
      const info = await promise;
      this._cache.set(filePath, info);
      return info;
    } finally {
      this._pending.delete(filePath);
    }
  }

  preload(filePath: string): void {
    // Fire and forget
    this.getMediaInfo(filePath).catch(() => {
      // Ignore errors in preload
    });
  }

  clearCache(): void {
    this._cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filePath.slice(lastDot + 1).toLowerCase();
  }

  /**
   * Fetch media info via Extension FFmpeg probe
   * This is more reliable than HTML5 video/audio elements
   */
  private async _fetchMediaInfoViaFFmpeg(filePath: string): Promise<MediaInfo> {
    try {
      const probeResult = await getMediaProxy().probeMediaInfo(filePath, {
        timeoutMs: 10000,
      });

      return {
        duration: probeResult.duration > 0 ? probeResult.duration : DEFAULT_VIDEO_DURATION,
        width: probeResult.width || undefined,
        height: probeResult.height || undefined,
      };
    } catch (error) {
      logger.warn('FFmpeg probe failed for: ' + filePath, error);
      return { duration: DEFAULT_VIDEO_DURATION };
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: MediaInfoService | null = null;

export function getMediaInfoService(): IMediaInfoService {
  if (!instance) {
    instance = new MediaInfoService();
  }
  return instance;
}
