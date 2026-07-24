/**
 * Media Engine - Extension Host
 *
 * Provides the compatible mode (Native FFmpeg + wgpu) implementation
 * and the MediaEngineManager for engine lifecycle management.
 *
 * Usage:
 * ```typescript
 * import {
 *   createMediaEngineManager,
 *   IMediaEngineManager,
 * } from './mediaEngine';
 *
 * // In service bootstrap
 * const manager = createMediaEngineManager(context.globalStorageUri);
 * services.set(IMediaEngineManager, manager);
 *
 * // Use compatible mode engine
 * const engine = await manager.getCompatibleEngine();
 * const decoder = await engine.createVideoDecoder({ source: filePath });
 * ```
 */

// Service identifiers
// Manager
export {
  MediaEngineManager,
  createMediaEngineManager,
  type MediaEngineManagerConfig,
} from './MediaEngineManager';

// Native engine
export { NativeMediaEngine } from './NativeMediaEngine';
