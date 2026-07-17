/**
 * Media Engine Mode Types
 *
 * Defines the runtime mode for the media processing architecture.
 * Only compatible mode is supported, using Native FFmpeg + wgpu via NAPI.
 */

// =============================================================================
// Engine Mode
// =============================================================================

/**
 * Media engine runtime mode
 *
 * - compatible: Native FFmpeg + wgpu (runs in Extension Host via NAPI)
 */
export type MediaEngineMode = 'compatible';

/**
 * Media engine state
 */
export type MediaEngineState = 'uninitialized' | 'initializing' | 'ready' | 'error' | 'disposed';

// =============================================================================
// Download Status
// =============================================================================

/**
 * Download status for compatible mode components
 */
export interface DownloadStatus {
  /** Whether compatible mode is installed */
  installed: boolean;
  /** Installed version (if installed) */
  version?: string;
  /** Installed size in bytes (if installed) */
  size?: number;
  /** Download progress (0-100, if downloading) */
  progress?: number;
  /** Download state */
  state: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'completed' | 'error';
  /** Error message (if state is error) */
  error?: string;
}
