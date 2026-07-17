/**
 * Handler Context — shared state passed to domain-specific handlers.
 *
 * All mutable state lives in MediaDiffMessageHandler; handlers receive
 * a reference to this context so they can read/write shared fields
 * without owning them.
 */

import type * as vscode from 'vscode';
import type { EngineClient } from '@neko/neko-client/EngineClient';
import type { DiffResult, MediaDiffResponse } from '@neko/shared';
import type { IScheduledTask, IScheduler } from '../../../contracts/IScheduler';
import type { ITempFileService } from '../../../contracts/ITempFileService';
import type { IMediaDiffService } from '../../services/MediaDiffService';
import type { IMediaDiffRequestState } from '../MediaDiffRequestState';

export interface IHandlerContext {
  // ── Immutable references ────────────────────────────────────────────
  readonly webview: vscode.Webview;
  readonly fileUri: vscode.Uri;
  readonly previousUri?: vscode.Uri;
  readonly diffService: IMediaDiffService;
  readonly engineClient: EngineClient | null;
  readonly scheduler: IScheduler;
  readonly tempFileService: ITempFileService;
  readonly requestState: IMediaDiffRequestState;
  /** Session ID for grouping streams from this handler */
  readonly sessionId: string;

  // ── Mutable state ───────────────────────────────────────────────────
  isDisposed: boolean;
  /** Cached diff result — used to avoid redundant probe calls in handleStartStreaming */
  lastDiffResult: DiffResult | null;
  /** Last ref used for diff (for re-analysis with time range) */
  lastRef: string;
  /** User-specified time range for analysis (video/audio only) */
  timeRange: { startTime?: number; endTime?: number };

  // ── Streaming state ─────────────────────────────────────────────────
  /** Current version video stream ID */
  currentStreamId: string | null;
  /** Previous version video stream ID */
  previousStreamId: string | null;
  /** Current version audio stream ID (video mode, may be null if no audio track) */
  currentAudioStreamId: string | null;
  /** Previous version audio stream ID (video mode) */
  previousAudioStreamId: string | null;
  /** Current version audio-only stream ID (audio diff mode) */
  currentAudioOnlyStreamId: string | null;
  /** Previous version audio-only stream ID (audio diff mode) */
  previousAudioOnlyStreamId: string | null;

  // ── Frame operations state ──────────────────────────────────────────
  /** Debounce timer for seek requests to avoid VideoToolbox session exhaustion */
  seekDebounceTimer: IScheduledTask | null;
  /** Pending frame extraction promises for concurrency control */
  activeFrameExtractions: number;

  // ── Helpers ─────────────────────────────────────────────────────────
  /** Send message to webview (no-op if disposed) */
  sendMessage(message: Partial<MediaDiffResponse>): void;
  /** Assert engine client is available. Throws into caller's try/catch. */
  requireEngine(): EngineClient;
}

/** Maximum concurrent frame extractions (shared constant) */
export const MAX_CONCURRENT_FRAMES = 4;
