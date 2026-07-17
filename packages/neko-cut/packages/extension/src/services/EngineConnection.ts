/**
 * EngineConnection - Lightweight connection to neko-engine's unified Frame Server
 *
 * Responsibilities:
 * - Port discovery via neko-engine extension command
 * - Lazy initialization of EngineClient
 * - Singleton caching (shared across all documents)
 *
 * Design:
 * - No lifecycle management (Frame Server is managed by neko-engine)
 * - No per-document instances (all documents share one connection)
 * - Graceful degradation when engine is unavailable
 */

import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client';
import { getLogger } from '../base';

const logger = getLogger('EngineConnection');

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

// =============================================================================
// EngineConnection
// =============================================================================

export class EngineConnection {
  private _client: EngineClient | null = null;
  private _port: number | null = null;
  private _initPromise: Promise<EngineClient | null> | null = null;

  /**
   * Get or create the EngineClient instance (lazy init + singleton)
   * Returns null if engine is unavailable
   */
  async ensureClient(): Promise<EngineClient | null> {
    // Return cached client if available
    if (this._client) {
      return this._client;
    }

    // Reuse in-flight initialization
    if (this._initPromise) {
      return this._initPromise;
    }

    // Start initialization
    this._initPromise = this.initialize();
    const client = await this._initPromise;
    this._initPromise = null;

    return client;
  }

  /**
   * Get the current port (if initialized)
   */
  get port(): number | null {
    return this._port;
  }

  /**
   * Check if the connection is available
   */
  get isAvailable(): boolean {
    return this._client !== null && this._port !== null;
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  private async initialize(): Promise<EngineClient | null> {
    try {
      logger.info('Connecting to neko-engine Frame Server...');

      // 1. Ensure engine extension is activated
      const ext = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
      if (!ext) {
        logger.error(`Extension ${ENGINE_EXTENSION_ID} not installed`);
        return null;
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
        return null;
      }

      this._port = result.port;
      this._client = new EngineClient(result.port);
      logger.info(`Connected to Frame Server on port ${this._port}`);

      return this._client;
    } catch (error) {
      logger.error(`Failed to initialize: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
