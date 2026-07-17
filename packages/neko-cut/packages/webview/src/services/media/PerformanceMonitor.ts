/**
 * PerformanceMonitor - Engine-side stream stats and media bitrate tracking
 *
 * Responsibilities:
 * - Send stats/bitrate requests to Extension Host via postMessage
 * - Track pending stats requests with timeout handling
 * - Provide type guards for stats/bitrate responses
 *
 * Design:
 * - Maintains its own pending request map (separate from media request queue)
 * - Stats requests bypass the priority queue (lightweight, fire-and-forget)
 * - Requires a requestId generator and vscode API to be passed in
 */

import type { VSCodeAPI } from '../../utils/vscodeApi';

// =============================================================================
// Types
// =============================================================================

/**
 * Engine-side stream pipeline stats
 */
export interface StreamStats {
  video: {
    hwDecodeMs: number;
    nv12ImportMs: number;
    nv12ToRgbaMs: number;
    compositeMs: number;
    rgbaToNv12Ms: number;
    cpuReadbackMs: number;
    encodeSubmitMs: number;
    encodeTimeMs: number;
    avgFps: number;
    cpuUsagePercent: number;
    gpuUsagePercent: number | null;
    peakMemoryBytes: number;
    vramUsageBytes: number | null;
  };
  audioMixMs: number;
  audioFps: number;
  currentTime: number;
  totalDuration: number;
  peakMemoryBytes: number;
  cpuUsagePercent: number;
}

/**
 * Media bitrate information
 */
export interface MediaBitrateInfo {
  videoBitrate: number;
  audioBitrate: number;
  totalBitrate: number;
  videoBitrateStr: string;
  totalBitrateStr: string;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for stream stats response
 */
function isStreamStatsResponse(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const msg = message as Record<string, unknown>;
  return msg.type === 'media:response:getStreamStats' && typeof msg.requestId === 'string';
}

/**
 * Type guard for media bitrate response
 */
function isMediaBitrateResponse(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const msg = message as Record<string, unknown>;
  return msg.type === 'media:response:getMediaBitrate' && typeof msg.requestId === 'string';
}

// =============================================================================
// PerformanceMonitor
// =============================================================================

interface PendingStatsRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class PerformanceMonitor {
  private pendingRequests = new Map<string, PendingStatsRequest>();

  /**
   * Handle an incoming stats/bitrate response message.
   * @returns true if the message was handled, false otherwise
   */
  handleResponse(message: unknown): boolean {
    if (!isStreamStatsResponse(message) && !isMediaBitrateResponse(message)) {
      return false;
    }

    const response = message as { requestId: string; payload?: unknown; error?: string };
    const pending = this.pendingRequests.get(response.requestId);
    if (pending) {
      pending.resolve(response);
    }
    return true;
  }

  /**
   * Get engine-side stream pipeline stats (timelines:stream_stats)
   */
  async getStreamStats(requestId: string, vscode: VSCodeAPI | null): Promise<StreamStats | null> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(null); // Graceful fallback -- don't reject on timeout
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: (response: unknown) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          const resp = response as { payload?: unknown; error?: string };
          if (resp.error || !resp.payload) {
            resolve(null);
          } else {
            resolve(resp.payload as StreamStats);
          }
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          reject(error);
        },
        timeoutId,
      });

      vscode?.postMessage({
        type: 'media:getStreamStats',
        requestId,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get media bitrate info from Extension
   */
  async getMediaBitrate(
    requestId: string,
    mediaPath: string,
    vscode: VSCodeAPI | null,
  ): Promise<MediaBitrateInfo> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Media bitrate request timeout'));
      }, 10000);

      this.pendingRequests.set(requestId, {
        resolve: (response: unknown) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          const resp = response as { payload?: unknown; error?: string };
          if (resp.error) {
            reject(new Error(resp.error));
          } else {
            resolve(resp.payload as MediaBitrateInfo);
          }
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          reject(error);
        },
        timeoutId,
      });

      vscode?.postMessage({
        type: 'media:getMediaBitrate',
        requestId,
        timestamp: Date.now(),
        payload: { mediaPath },
      });
    });
  }

  /**
   * Dispose all pending stats requests
   */
  dispose(): void {
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeoutId);
    });
    this.pendingRequests.clear();
  }
}
