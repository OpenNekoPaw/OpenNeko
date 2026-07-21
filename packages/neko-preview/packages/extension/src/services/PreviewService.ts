/**
 * PreviewService - Media preview orchestration service
 *
 * Connects to neko-engine's Frame Server via EngineClient (HTTP) for:
 * - Media probing (metadata extraction)
 * - Video playback control (start/stop/seek via H.264 stream)
 * - Waveform data generation
 *
 * Architecture:
 * PreviewService → EngineClient (HTTP) → neko-engine Frame Server → Rust EngineApi
 */

import * as vscode from 'vscode';
import { resolveNekoExtension } from '@neko/shared/vscode/extension';
import { EngineClient, MediaPlaybackService } from '@neko/neko-client';
import type { PlaybackHandle } from '@neko/neko-client';
import type {
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
  UpdatePreviewAssetMetadataRequest,
} from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('PreviewService');

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

import type { MediaInfo } from '../types/api';
export type { MediaInfo } from '../types/api';

// =============================================================================
// PreviewService
// =============================================================================

export class PreviewService implements vscode.Disposable {
  private _client: EngineClient | null = null;
  private _playback: MediaPlaybackService | null = null;
  private _port: number | null = null;
  private _disposed = false;

  /**
   * Try to create a PreviewService instance.
   * Returns null if engine connection fails.
   */
  static async tryCreate(): Promise<PreviewService | null> {
    const service = new PreviewService();
    const initialized = await service.initialize();
    if (initialized) {
      return service;
    }
    await service.dispose();
    return null;
  }

  private constructor() {}

  private async initialize(): Promise<boolean> {
    try {
      logger.info('Connecting to neko-engine Frame Server...');

      // 1. Ensure engine extension is activated
      const ext = resolveNekoExtension(ENGINE_EXTENSION_ID, (id) =>
        vscode.extensions.getExtension(id),
      );
      if (!ext) {
        logger.error(`OpenNeko feature ${ENGINE_EXTENSION_ID} is unavailable`);
        return false;
      }

      if (!ext.isActive) {
        await ext.activate();
      }

      // 2. Ensure Frame Server is running → get port
      const result = await vscode.commands.executeCommand<{ port: number } | null>(
        'neko.engine.ensureFrameServer',
      );
      if (!result) {
        logger.error('ensureFrameServer returned null');
        return false;
      }

      this._port = result.port;
      this._client = new EngineClient(result.port);
      this._playback = new MediaPlaybackService(this._client);
      logger.info(`Connected to Frame Server on port ${this._port}`);

      return true;
    } catch (error) {
      logger.error(`Failed to initialize: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  // =========================================================================
  // Properties
  // =========================================================================

  get isAvailable(): boolean {
    return this._client !== null && this._port !== null && !this._disposed;
  }

  get port(): number | null {
    return this._port;
  }

  getStreamWebSocketUrl(streamId: string): string | null {
    if (!this._playback) return null;
    return this._playback.getStreamWebSocketUrl(streamId);
  }

  getAudioWebSocketUrl(streamId: string): string | null {
    if (!this._playback) return null;
    return this._playback.getAudioWebSocketUrl(streamId);
  }

  getPreviewBaseUrl(): string | null {
    if (!this._port) return null;
    return `http://127.0.0.1:${this._port}`;
  }

  // =========================================================================
  // Media Probing
  // =========================================================================

  async probeMedia(filePath: string): Promise<MediaInfo> {
    if (!this._playback) throw new Error('PreviewService not available');
    const probe = await this._playback.probeMedia(filePath);
    return {
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      codec: probe.codec,
      format: probe.format,
      bitrate: probe.bitrate,
      hasAudio: probe.hasAudio,
      audioCodec: probe.audioCodec,
      audioSampleRate: probe.audioSampleRate,
      audioChannels: probe.audioChannels,
    };
  }

  async registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest> {
    if (!this._client || this._disposed) {
      throw new Error('PreviewService not available');
    }
    return this._client.registerPreviewAsset(request);
  }

  async requestPreviewVariant(
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<PreviewVariant> {
    if (!this._client || this._disposed) {
      throw new Error('PreviewService not available');
    }
    return this._client.requestPreviewVariant(assetId, request);
  }

  async updatePreviewAssetMetadata(
    assetId: string,
    request: UpdatePreviewAssetMetadataRequest,
  ): Promise<PreviewManifest> {
    if (!this._client || this._disposed) {
      throw new Error('PreviewService not available');
    }
    return this._client.updatePreviewAssetMetadata(assetId, request);
  }

  async unregisterPreviewAsset(assetIdOrToken: string): Promise<void> {
    if (!this._client || this._disposed) return;
    await this._client.unregisterPreviewAsset(assetIdOrToken);
  }

  // =========================================================================
  // Video Playback Control
  // =========================================================================

  async startVideoPlayback(
    filePath: string,
    mediaInfo: MediaInfo,
    startTime: number = 0,
    speed: number = 1.0,
  ): Promise<{ videoStreamId: string | null; audioStreamId: string | null }> {
    if (!this._playback) return { videoStreamId: null, audioStreamId: null };
    const handle = await this._playback.startPlayback(filePath, {
      hasAudio: mediaInfo.hasAudio,
      startTime,
      speed,
    });
    return { videoStreamId: handle.videoStreamId, audioStreamId: handle.audioStreamId };
  }

  async stopStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void> {
    if (!this._playback) return;
    await this._playback.stopPlayback(this.toHandle(videoStreamId, audioStreamId));
  }

  async seekStreams(
    videoStreamId: string | null,
    audioStreamId: string | null,
    time: number,
  ): Promise<void> {
    if (!this._playback) return;
    await this._playback.seekPlayback(this.toHandle(videoStreamId, audioStreamId), time);
  }

  async setStreamSpeed(
    videoStreamId: string | null,
    audioStreamId: string | null,
    speed: number,
  ): Promise<void> {
    if (!this._playback) return;
    await this._playback.setPlaybackSpeed(this.toHandle(videoStreamId, audioStreamId), speed);
  }

  async pauseStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void> {
    if (!this._playback) return;
    await this._playback.pausePlayback(this.toHandle(videoStreamId, audioStreamId));
  }

  async resumeStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void> {
    if (!this._playback) return;
    await this._playback.resumePlayback(this.toHandle(videoStreamId, audioStreamId));
  }

  // =========================================================================
  // Audio Operations
  // =========================================================================

  async getWaveform(
    filePath: string,
  ): Promise<{ peaks: number[]; duration: number; sampleRate: number }> {
    if (!this._playback) throw new Error('PreviewService not available');
    const result = await this._playback.getWaveform(filePath);
    return { peaks: result.peaks, duration: result.duration, sampleRate: result.sampleRate };
  }

  async captureFrame(filePath: string, time: number, quality: number = 80): Promise<string> {
    if (!this._playback) throw new Error('PreviewService not available');
    return this._playback.captureFrame(filePath, time, { quality });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private toHandle(videoStreamId: string | null, audioStreamId: string | null): PlaybackHandle {
    return { videoStreamId, audioStreamId, videoStreamUrl: null, audioStreamUrl: null };
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    // No need to stop Frame Server — managed by neko-engine extension
    this._playback = null;
    this._client = null;
    this._port = null;
    logger.info('PreviewService disposed');
  }
}
