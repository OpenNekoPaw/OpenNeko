/**
 * Media Proxy Factory
 *
 * Provides singleton access to the media proxy.
 * Uses MediaRequestProxy for compatible mode (Extension FFmpeg via NAPI).
 */

import { MediaRequestProxy, type IMediaRequestProxy } from './MediaRequestProxy';

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: MediaRequestProxy | null = null;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Get the singleton media proxy instance
 *
 * Uses MediaRequestProxy for compatible mode (Extension FFmpeg via NAPI).
 */
export function getMediaProxy(): IMediaRequestProxy {
  if (!instance) {
    instance = new MediaRequestProxy();
  }
  return instance;
}
