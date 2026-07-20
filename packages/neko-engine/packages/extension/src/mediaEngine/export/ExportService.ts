/**
 * Export Service
 *
 * Delegates timeline export to Rust-side `timelines:export` via NativeEngine.
 * The Rust ExportService handles GPU compositing, encoding, and muxing internally.
 */

import type { NativeEngine as NativeEngineType } from '@neko-engine/host-napi';
import { getLogger } from '../../base/logger';
import { createNativeEngineBinding } from '../nativeEngineBinding';

const logger = getLogger('ExportService');

// =============================================================================
// Coordinate Transform Utility
// =============================================================================

interface WebTransform {
  x: number; // 0-1 normalized (0.5 = center)
  y: number; // 0-1 normalized (0.5 = center)
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number; // 0-1 normalized
  anchorY: number; // 0-1 normalized
}

interface RustTransform {
  x: number; // pixel coordinates
  y: number; // pixel coordinates
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number; // pixel coordinates
  anchorY: number; // pixel coordinates
}

/**
 * Convert Web normalized coordinates to Rust pixel coordinates
 * Web uses 0-1 normalized coords (0.5, 0.5 = center)
 * Rust uses pixel coords (0, 0 = top-left)
 */
export function webTransformToRust(
  web: WebTransform,
  canvasWidth: number,
  canvasHeight: number,
  layerWidth: number,
  layerHeight: number,
): RustTransform {
  const scaledWidth = layerWidth * web.scaleX;
  const scaledHeight = layerHeight * web.scaleY;

  // Calculate center position in pixels
  const centerX = web.x * canvasWidth;
  const centerY = web.y * canvasHeight;

  // Calculate top-left position (accounting for anchor)
  const x = centerX - scaledWidth * web.anchorX;
  const y = centerY - scaledHeight * web.anchorY;

  // Convert anchor from normalized to pixel coordinates
  const anchorX = web.anchorX * scaledWidth;
  const anchorY = web.anchorY * scaledHeight;

  return {
    x,
    y,
    scaleX: web.scaleX,
    scaleY: web.scaleY,
    rotation: web.rotation,
    anchorX,
    anchorY,
  };
}

// =============================================================================
// Export Configuration
// =============================================================================

export interface ExportConfig {
  /** Output file path */
  outputPath: string;
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Frame rate (fps) */
  fps: number;
  /** Duration in seconds */
  duration: number;
  /** Video codec */
  videoCodec?: 'h264' | 'h265' | 'vp9' | 'prores';
  /** Video bitrate in bps */
  videoBitrate?: number;
  /** Encoding preset */
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  /** Codec profile (e.g., 'high', 'main', 'baseline' for H.264) */
  profile?: 'high' | 'main' | 'baseline';
  /** Container format */
  container?: 'mp4' | 'mov' | 'webm' | 'mkv';
  /** Include audio */
  includeAudio?: boolean;
  /** Audio codec */
  audioCodec?: 'aac' | 'mp3' | 'opus' | 'flac';
  /** Audio bitrate in bps */
  audioBitrate?: number;
  /** Audio sample rate */
  audioSampleRate?: number;
  /** Audio channels */
  audioChannels?: number;
  /** Background color [r, g, b, a] (0-1) */
  backgroundColor?: [number, number, number, number];
  /** Audio sources for export (file paths with time ranges) */
  audioSources?: AudioSource[];
}

export interface AudioSource {
  /** Source file path */
  path: string;
  /** Start time in timeline (seconds) */
  startTime: number;
  /** Duration in timeline (seconds) */
  duration: number;
  /** Trim start from source (seconds) */
  trimStart: number;
  /** Volume (0-1) */
  volume: number;
}

export interface ExportProgress {
  /** Current frame number */
  currentFrame: number;
  /** Total frames */
  totalFrames: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated remaining time in milliseconds */
  estimatedRemainingMs: number;
  /** Current phase */
  phase: 'initializing' | 'rendering' | 'encoding' | 'finalizing';
  /** Performance statistics (optional) */
  performanceStats?: {
    avgRenderTime: number;
    avgEncodeTime: number;
    avgDecodeTime?: number;
    currentFps: number;
    memoryUsedMB?: number;
    vramUsedMB?: number;
    cpuUsage?: number;
    gpuUsage?: number;
  };
}

export interface ExportResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  /** Total export time in milliseconds */
  totalTimeMs?: number;
  /** Total frames rendered */
  framesRendered?: number;
  /** Average frame render time in milliseconds */
  avgFrameTimeMs?: number;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

// =============================================================================
// Track Layer Definition
// =============================================================================

export interface TrackLayer {
  /** Unique layer ID */
  id: string;
  /** Layer type */
  type: 'video' | 'image' | 'text' | 'shape' | 'effect';
  /** Start time in seconds (relative to timeline) */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Layer source (file path for video/image, content for text) */
  source?: string;
  /** Layer width (for non-video sources) */
  width?: number;
  /** Layer height (for non-video sources) */
  height?: number;
  /** Z-index (layer order) */
  zIndex: number;
  /** Blend mode */
  blendMode?: string;
  /** Initial opacity */
  opacity?: number;
  /** Transform */
  transform?: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    anchorX: number;
    anchorY: number;
  };
  /** Keyframe animations */
  animations?: Array<{
    property: string;
    keyframes: Array<{
      time: number;
      value: { valueType: string; number?: number; x?: number; y?: number };
      easing?: string;
      interpolation?: string;
    }>;
    defaultValue?: { valueType: string; number?: number; x?: number; y?: number };
  }>;
  /** Mask layer ID */
  maskLayerId?: string;
  /** Effects to apply */
  effects?: Array<{
    type: string;
    params: Record<string, number | string | boolean>;
  }>;
}

// =============================================================================
// Frame Provider Interface
// =============================================================================

/**
 * Interface for providing frame data for layers.
 * Note: In the new architecture, frame data is handled by Rust side.
 * This interface is kept for backward compatibility.
 */
export interface FrameProvider {
  getFrameData(
    layer: TrackLayer,
    localTime: number,
  ): Promise<{ data: Buffer; width: number; height: number } | null>;
}

// =============================================================================
// Export Service
// =============================================================================

/** Default progress poll interval in milliseconds */
const PROGRESS_POLL_INTERVAL_MS = 200;

/**
 * Export Service — delegates to Rust-side `timelines:export`
 *
 * The Rust ExportService handles the full pipeline:
 * - Frame decoding
 * - GPU compositing (wgpu)
 * - Animation evaluation
 * - Video/audio encoding
 * - Muxing to output file
 */
export class ExportService {
  private _engine: NativeEngineType | null = null;
  private _isInitialized = false;
  private _currentJobId: string | null = null;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _pendingExportResolver: ((result: ExportResult) => void) | null = null;

  constructor() {}

  /**
   * Initialize the export service by loading NativeEngine
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      this._engine = await createNativeEngineBinding();
      this._isInitialized = true;
      logger.info('Initialized with NativeEngine');
    } catch (error) {
      logger.error('Failed to initialize', error);
      throw new Error(`Export service initialization failed: ${error}`);
    }
  }

  /**
   * Initialize with an existing NativeEngine instance (avoids creating a second one)
   */
  initializeWithEngine(engine: NativeEngineType): void {
    this._engine = engine;
    this._isInitialized = true;
    logger.info('Initialized with existing NativeEngine');
  }

  /**
   * Export timeline to video file
   *
   * Constructs an ExportJobConfig and dispatches `timelines:export` to Rust side.
   * Progress is polled via `tasks:probe`.
   */
  async export(
    config: ExportConfig,
    layers: TrackLayer[],
    _frameProvider: FrameProvider,
    progressCallback?: ExportProgressCallback,
  ): Promise<ExportResult> {
    if (!this._isInitialized || !this._engine) {
      throw new Error('Export service not initialized');
    }

    const startTime = Date.now();
    const totalFrames = Math.ceil(config.duration * config.fps);

    try {
      // Phase: Initializing
      progressCallback?.({
        currentFrame: 0,
        totalFrames,
        percentage: 0,
        elapsedMs: 0,
        estimatedRemainingMs: 0,
        phase: 'initializing',
      });

      // Build ExportJobConfig for Rust side
      const jobId = `export_${Date.now()}`;
      const exportJobConfig = this._buildExportJobConfig(jobId, config, layers);

      // Dispatch timelines:export
      const responseJson = await this._engine.dispatchAction(
        'timelines',
        'export',
        null,
        JSON.stringify(exportJobConfig),
      );
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok') {
        return {
          success: false,
          error: response.error?.message ?? 'Export dispatch failed',
        };
      }

      // Extract job ID from response (Rust may assign its own)
      this._currentJobId = response.data?.jobId ?? response.data?.job_id ?? jobId;

      // Start progress polling
      const result = await this._pollProgress(
        this._currentJobId!,
        totalFrames,
        startTime,
        progressCallback,
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this._stopPolling();
      this._currentJobId = null;
    }
  }

  /**
   * Cancel ongoing export
   */
  async cancel(): Promise<void> {
    const currentJobId = this._currentJobId;
    this._currentJobId = null;
    this._finishPendingExport({ success: false, error: 'Export cancelled' });

    if (currentJobId && this._engine) {
      try {
        await this._engine.cancelTask(currentJobId);
        logger.info(`Cancelled job ${currentJobId}`);
      } catch (error) {
        logger.warn('Failed to cancel', error);
      }
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._currentJobId = null;
    this._finishPendingExport({ success: false, error: 'Export cancelled' });
    this._engine = null;
    this._isInitialized = false;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Build ExportJobConfig JSON matching Rust `ExportJobConfig` struct
   */
  private _buildExportJobConfig(
    jobId: string,
    config: ExportConfig,
    layers: TrackLayer[],
  ): Record<string, unknown> {
    // Build timeline tracks from layers
    const tracks = layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      startTime: layer.startTime,
      duration: layer.duration,
      source: layer.source,
      width: layer.width,
      height: layer.height,
      zIndex: layer.zIndex,
      blendMode: layer.blendMode,
      opacity: layer.opacity ?? 1.0,
      transform: layer.transform,
      animations: layer.animations,
      effects: layer.effects,
    }));

    // Build audio tracks from audioSources
    const audioTracks = config.audioSources?.map((src) => ({
      source: src.path,
      startTime: src.startTime,
      duration: src.duration,
      trimStart: src.trimStart,
      volume: src.volume,
    }));

    return {
      jobId,
      outputPath: config.outputPath,
      settings: {
        width: config.width,
        height: config.height,
        fps: config.fps,
        videoCodec: config.videoCodec || 'h264',
        videoBitrate: config.videoBitrate,
        preset: config.preset || 'medium',
        profile: config.profile || 'high',
        container: config.container || 'mp4',
        includeAudio: config.includeAudio ?? false,
        audioCodec: config.audioCodec || 'aac',
        audioBitrate: config.audioBitrate,
        audioSampleRate: config.audioSampleRate || 48000,
        audioChannels: config.audioChannels || 2,
        backgroundColor: config.backgroundColor || [0, 0, 0, 1],
      },
      timeline: {
        duration: config.duration,
        tracks,
        audioTracks,
      },
    };
  }

  /**
   * Poll task progress until completion or cancellation
   */
  private _pollProgress(
    jobId: string,
    totalFrames: number,
    startTime: number,
    progressCallback?: ExportProgressCallback,
  ): Promise<ExportResult> {
    return new Promise((resolve) => {
      this._pendingExportResolver = resolve;
      this._pollTimer = setInterval(async () => {
        if (!this._engine || !this._currentJobId) {
          this._finishPendingExport({ success: false, error: 'Export cancelled' });
          return;
        }

        try {
          const responseJson = await this._engine.getTaskProgress(jobId);
          const response = JSON.parse(responseJson);

          if (response.status !== 'ok') {
            this._finishPendingExport({
              success: false,
              error: response.error?.message ?? 'Progress query failed',
            });
            return;
          }

          const taskData = response.data;
          const status = taskData?.status ?? taskData?.state;
          const progress = taskData?.progress ?? 0;
          const currentFrame = Math.round((progress / 100) * totalFrames);
          const elapsedMs = Date.now() - startTime;
          const estimatedRemainingMs = progress > 0 ? (elapsedMs / progress) * (100 - progress) : 0;

          // Determine phase
          let phase: ExportProgress['phase'] = 'rendering';
          if (progress === 0) phase = 'initializing';
          else if (progress >= 99) phase = 'finalizing';

          progressCallback?.({
            currentFrame,
            totalFrames,
            percentage: progress,
            elapsedMs,
            estimatedRemainingMs,
            phase,
            performanceStats: taskData?.performanceStats,
          });

          // Check completion
          if (status === 'completed' || status === 'done' || progress >= 100) {
            const totalTimeMs = Date.now() - startTime;
            this._finishPendingExport({
              success: true,
              outputPath: taskData?.outputPath ?? undefined,
              totalTimeMs,
              framesRendered: totalFrames,
              avgFrameTimeMs: totalTimeMs / totalFrames,
            });
            return;
          }

          // Check failure
          if (status === 'failed' || status === 'error') {
            this._finishPendingExport({
              success: false,
              error: taskData?.error || 'Export failed',
            });
            return;
          }

          // Check cancellation
          if (status === 'cancelled') {
            this._finishPendingExport({ success: false, error: 'Export cancelled' });
            return;
          }
        } catch (error) {
          // Transient error — keep polling
          logger.warn('Progress poll error', error);
        }
      }, PROGRESS_POLL_INTERVAL_MS);
    });
  }

  /**
   * Stop the progress polling timer
   */
  private _stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Resolve the active export promise exactly once.
   */
  private _finishPendingExport(result: ExportResult): void {
    const resolve = this._pendingExportResolver;
    if (!resolve) {
      this._stopPolling();
      return;
    }

    this._pendingExportResolver = null;
    this._stopPolling();
    resolve(result);
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create and initialize an ExportService
 */
export async function createExportService(): Promise<ExportService> {
  const service = new ExportService();
  await service.initialize();
  return service;
}
