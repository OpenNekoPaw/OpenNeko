/**
 * Media Module - Extracted domain modules from MediaRequestProxy
 *
 * - DataConverters: Pure buffer-to-bitmap/audio conversion functions
 * - CompatibleModeRenderer: Extension-side decoding type guards and response processors
 * - PerformanceMonitor: Engine stream stats and media bitrate tracking
 */

// Data Converters
export {
  dataUrlToImageBitmap,
  arrayBufferToImageBitmap,
  arrayBufferToAudioBuffer,
  disposeAudioContext,
} from './DataConverters';

// Compatible Mode Renderer
export {
  isCompatibleModeResponse,
  processCompatibleFrameResponse,
  processCompositeFrameResponse,
} from './CompatibleModeRenderer';

// Performance Monitor
export { PerformanceMonitor, type StreamStats, type MediaBitrateInfo } from './PerformanceMonitor';
