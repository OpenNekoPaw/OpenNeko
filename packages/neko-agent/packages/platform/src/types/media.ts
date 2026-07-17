/**
 * Media Types - Media management types
 */

/**
 * Media type enum
 */
export type MediaType = 'video' | 'audio' | 'image' | 'subtitle';

/**
 * Media status
 */
export type MediaStatus = 'pending' | 'downloading' | 'cached' | 'failed';

/**
 * Media metadata
 */
export interface MediaMetadata {
  /** Duration in seconds (for video/audio) */
  duration?: number;
  /** Width in pixels (for video/image) */
  width?: number;
  /** Height in pixels (for video/image) */
  height?: number;
  /** Frame rate (for video) */
  frameRate?: number;
  /** Bitrate in bps */
  bitrate?: number;
  /** Codec info */
  codec?: string;
  /** File size in bytes */
  fileSize?: number;
  /** MIME type */
  mimeType?: string;
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Media item
 */
export interface MediaItem {
  /** Unique media ID */
  id: string;
  /** Media name */
  name: string;
  /** Media type */
  type: MediaType;
  /** Source URL or path */
  source: string;
  /** Cached local path (if cached) */
  cachedPath?: string;
  /** Thumbnail path (if generated) */
  thumbnailPath?: string;
  /** Media status */
  status: MediaStatus;
  /** Media metadata */
  metadata?: MediaMetadata;
  /** Creation timestamp */
  createdAt: number;
  /** Last accessed timestamp */
  lastAccessedAt?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Media download options
 */
export interface MediaDownloadOptions {
  /** Force re-download even if cached */
  force?: boolean;
  /** Download timeout in milliseconds */
  timeout?: number;
  /** Progress callback */
  onProgress?: (progress: number) => void;
  /** Custom headers for download */
  headers?: Record<string, string>;
}

/**
 * Thumbnail options
 */
export interface ThumbnailOptions {
  /** Thumbnail width */
  width?: number;
  /** Thumbnail height */
  height?: number;
  /** Timestamp in seconds (for video) */
  timestamp?: number;
  /** Output format */
  format?: 'jpeg' | 'png' | 'webp';
  /** Quality (1-100) */
  quality?: number;
}

/**
 * Media cache config
 */
export interface MediaCacheConfig {
  /** Cache directory path */
  cacheDir: string;
  /** Max cache size in bytes */
  maxSize?: number;
  /** Max cache age in milliseconds */
  maxAge?: number;
  /** Enable automatic cleanup */
  autoCleanup?: boolean;
}

/**
 * Media manager interface
 */
export interface IMediaManager {
  /**
   * Import media from URL or path
   */
  import(source: string, options?: MediaDownloadOptions): Promise<MediaItem>;

  /**
   * Get media by ID
   */
  get(id: string): Promise<MediaItem | undefined>;

  /**
   * List all media items
   */
  list(filter?: { type?: MediaType; status?: MediaStatus }): Promise<MediaItem[]>;

  /**
   * Delete media
   */
  delete(id: string): Promise<boolean>;

  /**
   * Get or generate thumbnail
   */
  getThumbnail(id: string, options?: ThumbnailOptions): Promise<string | undefined>;

  /**
   * Get media metadata
   */
  getMetadata(id: string): Promise<MediaMetadata | undefined>;

  /**
   * Clear cache
   */
  clearCache(): Promise<void>;

  /**
   * Get cache stats
   */
  getCacheStats(): Promise<{ size: number; count: number }>;
}
