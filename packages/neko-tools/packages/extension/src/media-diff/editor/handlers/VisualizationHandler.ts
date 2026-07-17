/**
 * VisualizationHandler — visualization data dispatch.
 *
 * Handles:
 * - Image data (Git mode and local mode)
 * - Waveform data (from diff result or early extraction)
 * - Early frame extraction (parallel with diff)
 * - Early waveform extraction (parallel with diff)
 */

import type { DiffResult } from '@neko/shared';
import type { EngineClient } from '@neko/neko-client/EngineClient';
import type { IHandlerContext } from './types';
import { handleSeek } from './FrameOperations';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('VisualizationHandler');

// ── MIME type mapping ─────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

/**
 * Get MIME type from file path
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  return MIME_TYPES[ext ?? ''] ?? 'application/octet-stream';
}

// ── Visualization dispatch ────────────────────────────────────────────

/**
 * Send visualization data based on media type (Git mode).
 */
export async function sendVisualizationData(
  ctx: IHandlerContext,
  result: DiffResult,
  ref: string = 'HEAD',
): Promise<void> {
  if (ctx.isDisposed) return;

  switch (result.mediaType) {
    case 'image':
      await sendImageData(ctx, ref);
      break;

    case 'audio':
      // Skip sending empty waveform for preliminary results.
      // Task B (startEarlyWaveform) will send real waveform data in ~500ms.
      if (result.visualization) {
        ctx.sendMessage({
          type: 'mediaDiff:waveformData',
          payload: {
            currentWaveform: result.visualization?.currentWaveform ?? [],
            previousWaveform: result.visualization?.previousWaveform ?? [],
          },
        });
      }
      break;

    case 'video':
      // Skip frame extraction for preliminary calls (engine may not be active yet).
      // Frames are extracted on-demand when user interacts (seek/play).
      if (result.visualization) {
        await handleSeek(ctx, 0);
      }
      break;

    case 'timeline':
      break;
  }
}

/**
 * Send visualization data for local file comparison.
 */
export async function sendVisualizationDataForLocal(
  ctx: IHandlerContext,
  result: DiffResult,
): Promise<void> {
  if (ctx.isDisposed) return;

  switch (result.mediaType) {
    case 'image':
      await sendImageDataForLocal(ctx);
      break;

    case 'audio':
      // Skip sending empty waveform for preliminary results.
      // Task B (startEarlyWaveform) will send real waveform data in ~500ms.
      if (result.visualization) {
        ctx.sendMessage({
          type: 'mediaDiff:waveformData',
          payload: {
            currentWaveform: result.visualization?.currentWaveform ?? [],
            previousWaveform: result.visualization?.previousWaveform ?? [],
          },
        });
      }
      break;

    case 'video':
      // Skip frame extraction for preliminary calls (engine may not be active yet)
      if (result.visualization) {
        await handleSeek(ctx, 0);
      }
      break;

    case 'timeline':
      break;
  }
}

// ── Image data ────────────────────────────────────────────────────────

/**
 * Send image data to webview (Git mode).
 */
async function sendImageData(ctx: IHandlerContext, ref: string = 'HEAD'): Promise<void> {
  try {
    const versions = await ctx.diffService.getFileVersions(ctx.fileUri, ref);

    // Handle new file case
    if (versions.isNewFile) {
      ctx.sendMessage({
        type: 'mediaDiff:imageData',
        payload: {
          currentImage: versions.current,
          previousImage: null, // No previous version for new files
          mimeType: getMimeType(ctx.fileUri.fsPath),
          isNewFile: true,
        },
      });
      return;
    }

    ctx.sendMessage({
      type: 'mediaDiff:imageData',
      payload: {
        currentImage: versions.current,
        previousImage: versions.previous,
        mimeType: getMimeType(ctx.fileUri.fsPath),
      },
    });
  } catch (error) {
    logger.error('Failed to send image data:', error);
  }
}

/**
 * Send image data for local file comparison.
 */
async function sendImageDataForLocal(ctx: IHandlerContext): Promise<void> {
  if (!ctx.previousUri) return;

  try {
    const versions = await ctx.diffService.getLocalFileVersions(ctx.fileUri, ctx.previousUri);

    ctx.sendMessage({
      type: 'mediaDiff:imageData',
      payload: {
        currentImage: versions.current,
        previousImage: versions.previous,
        mimeType: getMimeType(ctx.fileUri.fsPath),
      },
    });
  } catch (error) {
    logger.error('Failed to send local image data:', error);
  }
}

// ── Waveform helpers ────────────────────────────────────────���─────────

/**
 * Send waveform data extracted from a completed analysis result.
 * Works for both audio (direct waveform) and video (embedded audio diff).
 */
export function sendWaveformFromResult(ctx: IHandlerContext, result: DiffResult): void {
  if (ctx.isDisposed) return;
  const currentWaveform = result.visualization?.currentWaveform ?? [];
  const previousWaveform = result.visualization?.previousWaveform ?? [];
  if (currentWaveform.length === 0 && previousWaveform.length === 0) return;
  ctx.sendMessage({
    type: 'mediaDiff:waveformData',
    payload: { currentWaveform, previousWaveform },
  });
}

/**
 * Start early waveform extraction in parallel with diff analysis.
 *
 * Dispatches `audios:waveform` for both files — resolves in ~500ms,
 * well before the full `audios:diff` completes (5-30s). The early
 * waveform is sent immediately; it gets replaced by the authoritative
 * waveform from `sendWaveformFromResult()` when the full diff finishes.
 *
 * Fire-and-forget: errors are logged but never propagate.
 * Supports cancellation via AbortSignal.
 */
export function startEarlyWaveform(
  ctx: IHandlerContext,
  engine: EngineClient,
  currentPath: string,
  previousPath: string,
  signal: AbortSignal,
): Promise<void> {
  return Promise.all([engine.waveform(currentPath), engine.waveform(previousPath)])
    .then(([wfA, wfB]) => {
      if (ctx.isDisposed || signal.aborted) return;
      ctx.sendMessage({
        type: 'mediaDiff:waveformData',
        payload: {
          currentWaveform: wfA.peaks,
          previousWaveform: wfB.peaks,
        },
      });
    })
    .catch((err) => {
      if (signal.aborted) return; // Silently ignore cancelled requests
      logger.warn('Early waveform extraction failed (non-fatal):', err);
    });
}

/**
 * Start early frame extraction in parallel with diff analysis.
 *
 * Dispatches `extractFrame` at t=0 for both video files — resolves in ~200ms,
 * well before the full `videos:diff` completes (5-60s). Sends frames to
 * webview immediately so the user sees a preview instead of a black screen.
 *
 * Fire-and-forget: errors are logged but never propagate.
 * Supports cancellation via AbortSignal.
 */
export function startEarlyFrameExtraction(
  ctx: IHandlerContext,
  engine: EngineClient,
  currentPath: string,
  previousPath: string,
  signal: AbortSignal,
): void {
  const extract = async (filePath: string, version: 'current' | 'previous') => {
    try {
      const imageBuffer = await engine.extractFrame(filePath, 0);
      if (ctx.isDisposed || signal.aborted || !imageBuffer) return;
      ctx.sendMessage({
        type: 'mediaDiff:frameData',
        payload: { time: 0, version, imageBuffer },
      });
    } catch (err) {
      if (signal.aborted) return;
      logger.warn(`Early frame extraction (${version}) failed (non-fatal):`, err);
    }
  };
  void extract(currentPath, 'current');
  void extract(previousPath, 'previous');
}
