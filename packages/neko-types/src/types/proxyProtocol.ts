/**
 * Proxy Protocol
 *
 * Defines types for video proxy file generation and management.
 *
 * Proxy files are lower-resolution versions of original media used for
 * smoother editing. The Engine generates them via hardware-accelerated
 * transcoding (H.264, 1Mbps, 1/4 resolution capped at 960x540).
 *
 * Flow:
 *   Webview → Extension (ProxyService) → Engine (videos:proxy)
 */

// =============================================================================
// Proxy Status
// =============================================================================

/** Proxy generation status */
export type ProxyStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'stale';

// =============================================================================
// Proxy Manifest (persisted in .neko/proxies/manifest.json)
// =============================================================================

/** Single proxy entry in the manifest */
export interface ProxyEntry {
  /** Original source file path (relative to project dir) */
  source: string;
  /** Proxy file path (relative to project dir) */
  proxy: string;
  /** Original file size in bytes */
  sourceSize: number;
  /** Original file mtime (ms since epoch) */
  sourceModified: number;
  /** Proxy resolution string (e.g. "960x540") */
  proxyResolution: string;
  /** Current status */
  status: ProxyStatus;
  /** Error message if status is 'failed' */
  error?: string;
  /** Generation timestamp (ms since epoch) */
  createdAt: number;
}

/** Proxy manifest file structure */
export interface ProxyManifest {
  /** Manifest format version */
  version: 1;
  /** Map of resourceId → ProxyEntry */
  proxies: Record<string, ProxyEntry>;
}
