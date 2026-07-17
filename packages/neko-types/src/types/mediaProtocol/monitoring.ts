/**
 * Media Processing Protocol - Performance Monitoring Types
 *
 * Performance stats and media bitrate monitoring types.
 */

// =============================================================================
// Performance Stats Protocol (Compat Mode Monitoring)
// =============================================================================

/**
 * Extension performance statistics for compat mode
 * Sent periodically from Extension to Webview during playback
 */
export interface ExtensionPerformanceStats {
  /** CPU usage percentage (0-100) */
  cpuUsage: number;
  /** Memory usage in MB */
  memoryUsedMB: number;
  /** Total memory in MB */
  memoryTotalMB: number;
  /** Number of cached frames in Extension */
  cachedFrames: number;
  /** Cache hit count */
  cacheHitCount: number;
  /** Cache miss count */
  cacheMissCount: number;
  /** Cache hit rate (0-100) */
  cacheHitRate: number;
  /** Number of dropped frames */
  droppedFrames: number;
  /** Number of decode errors */
  decodeErrors: number;
  /** Average decode time in ms */
  avgDecodeTimeMs: number;
  /** Average render time in ms (wgpu composite) */
  avgRenderTimeMs: number;
}

/**
 * Media bitrate information
 */
export interface MediaBitrateInfo {
  /** Video bitrate in bps */
  videoBitrate: number;
  /** Audio bitrate in bps */
  audioBitrate: number;
  /** Total bitrate in bps */
  totalBitrate: number;
  /** Formatted video bitrate string (e.g., "10 Mbps") */
  videoBitrateStr: string;
  /** Formatted total bitrate string */
  totalBitrateStr: string;
}

/**
 * Webview → Extension: Request performance stats
 */
export interface GetPerformanceStatsRequest {
  type: 'media:getPerformanceStats';
  requestId: string;
  timestamp: number;
}

/**
 * Extension → Webview: Performance stats response
 */
export interface GetPerformanceStatsResponse {
  type: 'media:response:getPerformanceStats';
  requestId: string;
  payload?: ExtensionPerformanceStats;
  error?: string;
}

/**
 * Extension → Webview: Performance stats notification (pushed periodically)
 */
export interface PerformanceStatsNotification {
  type: 'media:performanceStats';
  payload: ExtensionPerformanceStats;
}

/**
 * Webview → Extension: Request media bitrate info
 */
export interface GetMediaBitrateRequest {
  type: 'media:getMediaBitrate';
  requestId: string;
  timestamp: number;
  payload: {
    /** Media file path */
    mediaPath: string;
  };
}

/**
 * Extension → Webview: Media bitrate response
 */
export interface GetMediaBitrateResponse {
  type: 'media:response:getMediaBitrate';
  requestId: string;
  payload?: MediaBitrateInfo;
  error?: string;
}
