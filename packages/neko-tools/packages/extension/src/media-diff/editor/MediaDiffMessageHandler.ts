/**
 * MediaDiffMessageHandler - Webview Message Handler
 *
 * Thin dispatcher that routes webview messages to domain-specific handlers.
 * All business logic lives in `./handlers/`:
 *   - AnalysisPipeline: diff initialization, Git/local analysis orchestration
 *   - FrameOperations: seek, frame extraction, element inspection
 *   - VisualizationHandler: image data, waveform, early extraction
 *   - StreamingController: video/audio stream lifecycle and playback control
 *
 * Concurrency Design:
 * - Each handler manages its own AbortController for cancellation scoping
 * - dispose() only cancels this handler's analysis, not the shared service
 * - Multiple editors can run analyses concurrently without interference
 */

import * as vscode from 'vscode';
import type { MediaDiffRequest, MediaDiffResponse } from '@neko/shared';
import type { EngineClient } from '@neko/neko-client/EngineClient';
import type { IScheduler } from '../../contracts/IScheduler';
import type { ITempFileService } from '../../contracts/ITempFileService';
import type { IMediaDiffService } from '../services/MediaDiffService';
import type { IHandlerContext } from './handlers/types';
import { MediaDiffRequestState, type IMediaDiffRequestState } from './MediaDiffRequestState';
import {
  initializeDiff,
  initializeLocalDiff,
  cancelCurrentAnalysis,
  handleSeek,
  handleGetFrame,
  handleInspectElement,
  handleStartStreaming,
  handleStopStreaming,
  handleStreamControl,
  handleStartAudioStreaming,
  handleStopAudioStreaming,
  handleAudioStreamControl,
} from './handlers';

// =============================================================================
// Message Handler
// =============================================================================

/**
 * Handles messages for media diff webview.
 *
 * Implements IHandlerContext so domain-specific handler functions
 * can read/write shared state directly.
 */
export class MediaDiffMessageHandler implements vscode.Disposable, IHandlerContext {
  // ── IHandlerContext — mutable state ─────────────────────────────────
  isDisposed = false;
  readonly requestState: IMediaDiffRequestState;
  /** Cached diff result — used to avoid redundant probe calls in handleStartStreaming */
  lastDiffResult: import('@neko/shared').DiffResult | null = null;
  /** Last ref used for diff (for re-analysis with time range) */
  lastRef: string = 'HEAD';
  /** User-specified time range for analysis (video/audio only) */
  timeRange: { startTime?: number; endTime?: number } = {};

  // ── Streaming state ────────────────────────────────────────────────
  /** Current version video stream ID */
  currentStreamId: string | null = null;
  /** Previous version video stream ID */
  previousStreamId: string | null = null;
  /** Current version audio stream ID (video mode, may be null if no audio track) */
  currentAudioStreamId: string | null = null;
  /** Previous version audio stream ID (video mode) */
  previousAudioStreamId: string | null = null;
  /** Current version audio-only stream ID (audio diff mode) */
  currentAudioOnlyStreamId: string | null = null;
  /** Previous version audio-only stream ID (audio diff mode) */
  previousAudioOnlyStreamId: string | null = null;

  // ── Frame operations state ─────────────────────────────────────────
  /** Debounce timer for seek requests to avoid VideoToolbox session exhaustion */
  seekDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pending frame extraction promises for concurrency control */
  activeFrameExtractions = 0;

  /** Session ID for grouping streams from this handler */
  readonly sessionId = `diff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private disposePromise: Promise<void> | null = null;

  constructor(
    readonly webview: vscode.Webview,
    readonly fileUri: vscode.Uri,
    readonly diffService: IMediaDiffService,
    readonly engineClient: EngineClient | null,
    readonly scheduler: IScheduler,
    readonly tempFileService: ITempFileService,
    readonly previousUri?: vscode.Uri,
  ) {
    this.requestState = new MediaDiffRequestState(tempFileService);
  }

  // ── Public API (called by MediaDiffEditorProvider) ──────────────────

  /**
   * Initialize diff analysis
   */
  async initializeDiff(ref: string = 'HEAD'): Promise<void> {
    return initializeDiff(this, ref);
  }

  // ── IHandlerContext — helpers ───────────────────────────────────────

  /**
   * Assert engine client is available. Throws into caller's try/catch.
   */
  requireEngine(): EngineClient {
    if (!this.engineClient) {
      throw new Error('neko-engine not available');
    }
    return this.engineClient;
  }

  /**
   * Send message to webview (no-op if disposed).
   */
  sendMessage(message: Partial<MediaDiffResponse>): void {
    if (!this.isDisposed) {
      this.webview.postMessage(message);
    }
  }

  // ── Message dispatch ───────────────────────────────────────────────

  /**
   * Handle message from webview
   */
  async handleMessage(message: MediaDiffRequest): Promise<void> {
    if (this.isDisposed) return;

    const { type, requestId } = message;

    try {
      switch (type) {
        case 'mediaDiff:init':
          await initializeDiff(this, message.payload.ref);
          break;

        case 'mediaDiff:initLocal':
          await initializeLocalDiff(this);
          break;

        case 'mediaDiff:setViewMode':
          // View mode is handled in webview, just acknowledge
          break;

        case 'mediaDiff:seek':
          // For video: get frame at specific time
          await handleSeek(this, message.payload.time, requestId);
          break;

        case 'mediaDiff:getFrame':
          // For video: get specific frame
          await handleGetFrame(this, message.payload.time, message.payload.version, requestId);
          break;

        case 'mediaDiff:inspectElement':
          // Lazy content diff: extract thumbnail for a media element
          await handleInspectElement(this, message.payload.src, requestId);
          break;

        case 'mediaDiff:cancel':
          // Only cancel this handler's analysis, not the global service
          cancelCurrentAnalysis(this);
          break;

        case 'mediaDiff:getFileHistory':
          await this.handleGetFileHistory(message.payload?.maxCount, requestId);
          break;

        case 'mediaDiff:changeRef':
          // Stop any active streams before switching refs to prevent resource leaks
          await handleStopStreaming(this);
          await handleStopAudioStreaming(this);
          await initializeDiff(this, message.payload.ref);
          break;

        case 'mediaDiff:setTimeRange':
          // Re-run diff with new time range (stop streams first)
          await handleStopStreaming(this);
          await handleStopAudioStreaming(this);
          this.timeRange = {
            startTime: message.payload.startTime,
            endTime: message.payload.endTime,
          };
          await initializeDiff(this, this.lastRef);
          break;

        // ── Streaming lifecycle ──────────────────────────────
        case 'mediaDiff:startStreaming':
          await handleStartStreaming(this, requestId);
          break;

        case 'mediaDiff:stopStreaming':
          await handleStopStreaming(this, requestId);
          break;

        case 'mediaDiff:streamControl':
          await handleStreamControl(this, message.payload.action, message.payload, requestId);
          break;

        // ── Audio-only streaming lifecycle ────────────────
        case 'mediaDiff:startAudioStreaming':
          await handleStartAudioStreaming(this, requestId);
          break;

        case 'mediaDiff:stopAudioStreaming':
          await handleStopAudioStreaming(this, requestId);
          break;

        case 'mediaDiff:audioStreamControl':
          await handleAudioStreamControl(this, message.payload.action, message.payload, requestId);
          break;
      }
    } catch {
      this.sendMessage({
        requestId,
        type: 'mediaDiff:error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Locally owned handlers (too small to extract) ──────────────────

  /**
   * Handle get file history request
   */
  private async handleGetFileHistory(maxCount?: number, requestId?: string): Promise<void> {
    try {
      const commits = await this.diffService.getFileHistory(this.fileUri, maxCount);
      this.sendMessage({
        requestId,
        type: 'mediaDiff:fileHistory',
        payload: { commits },
      });
    } catch {
      this.sendMessage({
        requestId,
        type: 'mediaDiff:fileHistory',
        payload: { commits: [] },
      });
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async disposeAsync(): Promise<void> {
    this.disposePromise ??= this.disposeInternal();
    return this.disposePromise;
  }

  dispose(): void {
    void this.disposeAsync();
  }

  private async disposeInternal(): Promise<void> {
    this.isDisposed = true;
    // Cancel pending seek debounce
    if (this.seekDebounceTimer) {
      this.seekDebounceTimer.cancel();
      this.seekDebounceTimer = null;
    }
    // Only cancel this handler's analysis, NOT the shared service
    cancelCurrentAnalysis(this);

    await Promise.allSettled([
      handleStopStreaming(this),
      handleStopAudioStreaming(this),
      this.requestState.disposeAsync(),
    ]);
  }
}
