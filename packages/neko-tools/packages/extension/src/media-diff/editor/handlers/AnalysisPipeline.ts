/**
 * AnalysisPipeline — diff analysis orchestration.
 *
 * Handles Git-mode and local-file diff initialization, including:
 * - Previous-file extraction via `git show`
 * - MD5 identity check (fast-path skip)
 * - Fire-and-forget parallel pipelines (frames + waveform + SSIM/PSNR)
 * - Sequential analysis for image/timeline types
 */

import type { DiffResult, MediaDiffResponse } from '@neko/shared';
import type { IHandlerContext } from './types';
import { sendVisualizationData, sendVisualizationDataForLocal } from './VisualizationHandler';
import {
  startEarlyWaveform,
  startEarlyFrameExtraction,
  sendWaveformFromResult,
} from './VisualizationHandler';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('AnalysisPipeline');

// ── File extension detection ──────────────────────────────────────────

const VIDEO_EXTS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v',
  '.flv',
  '.wmv',
  '.mpg',
  '.mpeg',
  '.ts',
  '.mts',
]);

const AUDIO_EXTS = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.aac',
  '.ogg',
  '.wma',
  '.m4a',
  '.opus',
  '.aiff',
  '.aif',
]);

/**
 * Quick media type detection from file extension (no I/O).
 * Used for fast-path: show video/audio UI before full analysis completes.
 * Returns null for non-video/audio types (they don't benefit from lazy loading).
 */
function detectMediaTypeFromExtension(filePath: string): 'video' | 'audio' | null {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return null;
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return null;
}

// ── MD5 identity check ───────────────────────────────────────────────

/**
 * Compute MD5 hash of a file (streaming, memory-efficient for large files).
 */
async function computeFileHash(filePath: string): Promise<string> {
  const crypto = await import('crypto');
  const fs = await import('fs');
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data: Buffer) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Check if two files are identical by MD5 hash.
 * Returns true if files have the same content.
 */
async function areFilesIdentical(pathA: string, pathB: string): Promise<boolean> {
  try {
    const [hashA, hashB] = await Promise.all([computeFileHash(pathA), computeFileHash(pathB)]);
    const identical = hashA === hashB;
    if (identical) {
      logger.debug(`Files are identical (MD5: ${hashA})`);
    }
    return identical;
  } catch (error) {
    logger.warn('MD5 check failed, proceeding with diff:', error);
    return false;
  }
}

// ── Previous file extraction ──────────────────────────────────────────

/**
 * Ensure previous file path is available for frame extraction.
 * In Git mode, extracts the previous version directly to a temp file
 * via `git show` — never loads file content into extension memory.
 */
async function ensurePreviousFilePath(ctx: IHandlerContext, ref: string): Promise<void> {
  // Already have a path (local comparison or previously cached)
  if (ctx.previousUri || ctx.requestState.hasPreviousFileForRef(ref)) return;

  await ctx.requestState.clearPreviousFilePath();

  try {
    const path = await import('path');

    const ext = path.extname(ctx.fileUri.fsPath) || '.mp4';
    const tmpPath = ctx.tempFileService.createTempPath('media-diff-prev', ext);

    // Zero-copy: git show pipes directly to file, no memory buffering
    await ctx.diffService.extractPreviousToFile(ctx.fileUri, ref, tmpPath);
    await ctx.requestState.setPreviousFilePath(tmpPath, ref);
  } catch (error) {
    // File may not exist in the ref (new file) — not an error
    logger.warn('Could not extract previous version:', error);
  }
}

// ── Cancellation ──────────────────────────────────────────────────────

/**
 * Cancel the current analysis for this handler only.
 * Does NOT affect analyses from other handlers sharing the same diffService.
 */
export function cancelCurrentAnalysis(ctx: IHandlerContext): void {
  ctx.requestState.cancelCurrentAnalysis();
}

// ── Fetch state broadcast ─────────────────────────────────────────────

/**
 * Broadcast git-fetch state to webview so Play button can be disabled
 * while the previous-version file is being extracted.
 */
function sendFetchState(ctx: IHandlerContext, state: 'fetching' | 'ready'): void {
  ctx.sendMessage({ type: 'mediaDiff:fetchState', state } as Partial<MediaDiffResponse>);
}

// ── Analysis pipelines ────────────────────────────────────────────────

/**
 * Initialize diff analysis (Git mode).
 */
export async function initializeDiff(ctx: IHandlerContext, ref: string = 'HEAD'): Promise<void> {
  ctx.lastRef = ref;

  // If previousUri is set, this is a local file comparison
  if (ctx.previousUri) {
    return initializeLocalDiff(ctx);
  }

  if (ctx.isDisposed) return;

  // Cancel any previous analysis for this handler
  const abortController = ctx.requestState.beginAnalysis();

  // Track whether the background pipeline took ownership of abortController cleanup
  let pipelineOwnsCleanup = false;

  try {
    // Fast path: detect video/audio from extension and show UI immediately.
    // Send preliminary result BEFORE any I/O so webview renders Play button.
    const mediaType = detectMediaTypeFromExtension(ctx.fileUri.fsPath);
    if (mediaType === 'video' || mediaType === 'audio') {
      ctx.sendMessage({
        type: 'mediaDiff:result',
        payload: {
          mediaType,
          similarity: -1,
          details: { analysisInProgress: true },
        },
      });
    }

    // For video/audio: extract previous version to temp file (needed for all subsequent ops).
    if (mediaType === 'video' || mediaType === 'audio') {
      // Broadcast fetch state so the webview can disable Play until the file is ready.
      // handleStartStreaming awaits this.fetchPromise to avoid the race condition
      // where the user clicks Play before git show finishes (3-30s).
      sendFetchState(ctx, 'fetching');
      const fetchPromise = ensurePreviousFilePath(ctx, ref);
      ctx.requestState.fetchPromise = fetchPromise;
      await fetchPromise;
      ctx.requestState.clearFetchPromise(fetchPromise);
      sendFetchState(ctx, 'ready');

      // MD5 check: skip expensive diff if files are identical
      const prevPath = ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath;
      if (prevPath && (await areFilesIdentical(ctx.fileUri.fsPath, prevPath))) {
        ctx.sendMessage({
          type: 'mediaDiff:result',
          payload: {
            mediaType,
            similarity: 1.0,
            details: { identical: true },
          },
        });
        return;
      }

      // ── Fire-and-forget pipeline: frame extraction + waveform + diff ──
      // IMPORTANT: Do NOT await — handleMessage must return immediately
      // so subsequent messages (streamControl, seek, etc.) are not blocked
      // by the long-running SSIM/PSNR analysis (5-30s).
      // Pipeline takes ownership of abortController cleanup.
      pipelineOwnsCleanup = true;
      const previousPath = prevPath;
      runAnalysisPipeline(ctx, mediaType, previousPath, ref, abortController);
      return;
    } else {
      // Non-video/audio: sequential path (image/timeline)
      const result = await ctx.diffService.analyze(
        ctx.fileUri,
        ref,
        { generateHeatmap: true },
        (progress, stage) => {
          ctx.sendMessage({
            type: 'mediaDiff:progress',
            payload: { progress, stage },
          });
        },
        abortController.signal,
      );

      if (ctx.isDisposed) return;

      ctx.sendMessage({
        type: 'mediaDiff:result',
        payload: result,
      });

      await sendVisualizationData(ctx, result, ref);
    }
  } catch (error) {
    if (abortController.signal.aborted) return; // Silently ignore cancelled
    ctx.sendMessage({
      type: 'mediaDiff:error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Only clean up if the background pipeline didn't take ownership
    if (!pipelineOwnsCleanup) {
      ctx.requestState.clearAbortController(abortController);
    }
  }
}

/**
 * Initialize local file diff analysis (two local files comparison).
 */
export async function initializeLocalDiff(ctx: IHandlerContext): Promise<void> {
  if (ctx.isDisposed) return;
  if (!ctx.previousUri) {
    ctx.sendMessage({
      type: 'mediaDiff:error',
      error: 'No previous file specified for local comparison',
    });
    return;
  }

  // Cancel any previous analysis for this handler
  const abortController = ctx.requestState.beginAnalysis();

  let pipelineOwnsCleanup = false;

  try {
    // Fast path: detect video/audio from extension and show UI immediately
    const mediaType = detectMediaTypeFromExtension(ctx.fileUri.fsPath);

    // MD5 check: skip expensive diff if files are identical
    if (await areFilesIdentical(ctx.fileUri.fsPath, ctx.previousUri.fsPath)) {
      const detectedType = mediaType ?? 'image';
      ctx.sendMessage({
        type: 'mediaDiff:result',
        payload: {
          mediaType: detectedType,
          similarity: 1.0,
          details: { identical: true },
        },
      });
      return;
    }

    if (mediaType === 'video' || mediaType === 'audio') {
      ctx.sendMessage({
        type: 'mediaDiff:result',
        payload: {
          mediaType,
          similarity: -1,
          details: { analysisInProgress: true },
        },
      });

      // ── Fire-and-forget pipeline ──
      // IMPORTANT: Do NOT await — handleMessage must return immediately
      // so subsequent messages (streamControl, seek, etc.) are not blocked.
      pipelineOwnsCleanup = true;
      runLocalAnalysisPipeline(ctx, mediaType, abortController);
      return;
    } else {
      // Non-video/audio: sequential path
      const result = await ctx.diffService.analyzeLocalFiles(
        ctx.fileUri,
        ctx.previousUri,
        { generateHeatmap: true },
        (progress, stage) => {
          ctx.sendMessage({
            type: 'mediaDiff:progress',
            payload: { progress, stage },
          });
        },
        abortController.signal,
      );

      if (ctx.isDisposed) return;

      ctx.sendMessage({
        type: 'mediaDiff:result',
        payload: result,
      });

      await sendVisualizationDataForLocal(ctx, result);
    }
  } catch (error) {
    if (abortController.signal.aborted) return;
    ctx.sendMessage({
      type: 'mediaDiff:error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (!pipelineOwnsCleanup) {
      ctx.requestState.clearAbortController(abortController);
    }
  }
}

/**
 * Run analysis pipeline for Git mode (fire-and-forget).
 * Runs frame extraction, waveform, and SSIM/PSNR in parallel.
 * Each task sends its own message to webview independently.
 * Errors are caught and reported per-task — never propagates.
 */
function runAnalysisPipeline(
  ctx: IHandlerContext,
  mediaType: 'video' | 'audio',
  previousPath: string | undefined,
  ref: string,
  abortController: AbortController,
): void {
  const run = async () => {
    try {
      const parallelTasks: Promise<void>[] = [];

      // Task A: Extract t=0 preview frames (fast, ~200ms)
      parallelTasks.push(
        sendVisualizationData(ctx, { mediaType, similarity: -1 } as DiffResult, ref).catch((err) =>
          logger.warn('Frame extraction failed:', err),
        ),
      );

      // Task B: Early waveform (audio) or early frame extraction (video), ~200-500ms
      if (ctx.engineClient && previousPath) {
        if (mediaType === 'audio') {
          startEarlyWaveform(
            ctx,
            ctx.engineClient,
            ctx.fileUri.fsPath,
            previousPath,
            abortController.signal,
          );
        } else if (mediaType === 'video') {
          startEarlyFrameExtraction(
            ctx,
            ctx.engineClient,
            ctx.fileUri.fsPath,
            previousPath,
            abortController.signal,
          );
        }
      }

      // Task C: Full diff analysis (SSIM/PSNR, 5-30s)
      const diffOptions: Record<string, unknown> = { generateHeatmap: true };
      if (previousPath) {
        diffOptions.currentPath = ctx.fileUri.fsPath;
        diffOptions.previousPath = previousPath;
      }
      if (ctx.timeRange.startTime !== undefined) diffOptions.startTime = ctx.timeRange.startTime;
      if (ctx.timeRange.endTime !== undefined) diffOptions.endTime = ctx.timeRange.endTime;

      parallelTasks.push(
        ctx.diffService
          .analyze(
            ctx.fileUri,
            ref,
            diffOptions,
            (progress, stage) => {
              ctx.sendMessage({
                type: 'mediaDiff:progress',
                payload: { progress, stage },
              });
            },
            abortController.signal,
          )
          .then((result) => {
            if (ctx.isDisposed) return;
            ctx.lastDiffResult = result;
            ctx.sendMessage({ type: 'mediaDiff:result', payload: result });
            sendWaveformFromResult(ctx, result);
          }),
      );

      await Promise.all(parallelTasks);
    } catch (error) {
      if (abortController.signal.aborted) return;
      ctx.sendMessage({
        type: 'mediaDiff:error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      ctx.requestState.clearAbortController(abortController);
    }
  };
  void run();
}

/**
 * Run analysis pipeline for local file comparison (fire-and-forget).
 * Same pattern as runAnalysisPipeline but uses analyzeLocalFiles.
 */
function runLocalAnalysisPipeline(
  ctx: IHandlerContext,
  mediaType: 'video' | 'audio',
  abortController: AbortController,
): void {
  const previousUri = ctx.previousUri!;
  const run = async () => {
    try {
      const parallelTasks: Promise<void>[] = [];

      // Task A: Frame extraction / visualization
      parallelTasks.push(
        sendVisualizationDataForLocal(ctx, { mediaType, similarity: -1 } as DiffResult).catch(
          (err) => logger.warn('Local frame extraction failed:', err),
        ),
      );

      // Task B: Early waveform (audio) or early frame extraction (video)
      if (ctx.engineClient) {
        if (mediaType === 'audio') {
          startEarlyWaveform(
            ctx,
            ctx.engineClient,
            ctx.fileUri.fsPath,
            previousUri.fsPath,
            abortController.signal,
          );
        } else if (mediaType === 'video') {
          startEarlyFrameExtraction(
            ctx,
            ctx.engineClient,
            ctx.fileUri.fsPath,
            previousUri.fsPath,
            abortController.signal,
          );
        }
      }

      // Task C: Full diff analysis
      const localDiffOptions: Record<string, unknown> = { generateHeatmap: true };
      if (ctx.timeRange.startTime !== undefined)
        localDiffOptions.startTime = ctx.timeRange.startTime;
      if (ctx.timeRange.endTime !== undefined) localDiffOptions.endTime = ctx.timeRange.endTime;

      parallelTasks.push(
        ctx.diffService
          .analyzeLocalFiles(
            ctx.fileUri,
            previousUri,
            localDiffOptions,
            (progress, stage) => {
              ctx.sendMessage({
                type: 'mediaDiff:progress',
                payload: { progress, stage },
              });
            },
            abortController.signal,
          )
          .then((result) => {
            if (ctx.isDisposed) return;
            ctx.lastDiffResult = result;
            ctx.sendMessage({ type: 'mediaDiff:result', payload: result });
            sendWaveformFromResult(ctx, result);
          }),
      );

      await Promise.all(parallelTasks);
    } catch (error) {
      if (abortController.signal.aborted) return;
      ctx.sendMessage({
        type: 'mediaDiff:error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      ctx.requestState.clearAbortController(abortController);
    }
  };
  void run();
}
