/**
 * Media Engine Manager
 *
 * Core manager for the media processing architecture.
 * Handles engine lifecycle for compatible mode (Native FFmpeg + wgpu).
 *
 * Note: Compatible mode is always available via Rust N-API (no download needed).
 */

import * as vscode from 'vscode';
import type { MediaEngineMode, MediaInfo } from '@neko/shared';

import { NativeMediaEngine, createNativeMediaEngine } from './NativeMediaEngine';
import { getLogger } from '../base/logger';

const logger = getLogger('MediaEngineManager');

// =============================================================================
// Types
// =============================================================================

/**
 * Manager configuration
 */
export interface MediaEngineManagerConfig {
  /** Default mode preference */
  defaultMode?: 'compatible';
}

// =============================================================================
// Media Engine Manager
// =============================================================================

/**
 * Manages the compatible mode media engine instance
 *
 * Responsibilities:
 * - Extension-session lifecycle management for the NativeMediaEngine wrapper
 * - Provide access to NativeMediaEngine (FFmpeg + wgpu via N-API)
 */
export class MediaEngineManager implements vscode.Disposable {
  private _config: MediaEngineManagerConfig;

  // Engine instance (lazy initialized)
  private _compatibleEngine: NativeMediaEngine | null = null;

  // Current state
  private _currentMode: MediaEngineMode | null = null;
  private _disposables: vscode.Disposable[] = [];

  constructor(config: MediaEngineManagerConfig = {}) {
    this._config = {
      defaultMode: 'compatible',
      ...config,
    };
  }

  // =========================================================================
  // Properties
  // =========================================================================

  /**
   * Current active mode
   */
  get currentMode(): MediaEngineMode | null {
    return this._currentMode;
  }

  /**
   * Whether compatible mode is installed
   * Always true since Rust N-API bundles FFmpeg
   */
  get isCompatibleModeInstalled(): boolean {
    return true;
  }

  /**
   * Current frame server port if the compatible engine has already started one.
   * This is read-only and never starts the engine or the server.
   */
  get frameServerPort(): number | undefined {
    return this._compatibleEngine?.engine?.getFrameServerPort() ?? undefined;
  }

  // =========================================================================
  // Engine Access
  // =========================================================================

  /**
   * Get or create compatible mode engine
   */
  async getCompatibleEngine(): Promise<NativeMediaEngine> {
    if (!this._compatibleEngine) {
      this._compatibleEngine = await createNativeMediaEngine();
    }

    this._currentMode = 'compatible';
    return this._compatibleEngine;
  }

  // =========================================================================
  // Engine Lifecycle
  // =========================================================================

  /**
   * Dispose current engine wrappers for this extension session.
   *
   * The underlying Rust EngineApi remains process-scoped today because
   * host-napi owns it behind a global singleton.
   */
  async disposeEngines(): Promise<void> {
    if (this._compatibleEngine) {
      await this._compatibleEngine.dispose();
      this._compatibleEngine = null;
    }

    this._currentMode = null;
  }

  /**
   * Check if a media file can be processed
   */
  canProcess(_mediaInfo: MediaInfo): boolean {
    // Compatible mode is always available via Rust N-API
    return true;
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this.disposeEngines().catch((err) => logger.error('Failed to dispose engines', err));
    this._disposables.forEach((d) => d.dispose());
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MediaEngineManager instance
 */
export function createMediaEngineManager(
  _globalStorageUri?: vscode.Uri,
  config?: MediaEngineManagerConfig,
): MediaEngineManager {
  return new MediaEngineManager(config);
}
