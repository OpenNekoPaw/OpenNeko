/**
 * FrameOperations — frame extraction, seek, and element inspection.
 *
 * Handles:
 * - Debounced seek requests (prevents VideoToolbox session exhaustion)
 * - Concurrent frame extraction with semaphore control
 * - Lazy content diff for timeline media elements (thumbnail inspection)
 */

import type { IHandlerContext } from './types';
import { MAX_CONCURRENT_FRAMES } from './types';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('FrameOperations');

/**
 * Handle seek request for video — debounced to avoid VideoToolbox exhaustion.
 * Rapid slider dragging can fire dozens of seek events; only the last one matters.
 */
export async function handleSeek(
  ctx: IHandlerContext,
  time: number,
  requestId?: string,
): Promise<void> {
  // Cancel any pending debounced seek
  if (ctx.seekDebounceTimer) {
    ctx.seekDebounceTimer.cancel();
    ctx.seekDebounceTimer = null;
  }

  return new Promise<void>((resolve) => {
    ctx.seekDebounceTimer = ctx.scheduler.scheduleOnce(async () => {
      ctx.seekDebounceTimer = null;
      await Promise.all([
        handleGetFrame(ctx, time, 'current', requestId),
        handleGetFrame(ctx, time, 'previous', requestId),
      ]);
      resolve();
    }, 50);
  });
}

/**
 * Handle get frame request for video — extracts a single frame via neko-engine.
 * Includes concurrency control to prevent VideoToolbox session exhaustion.
 */
export async function handleGetFrame(
  ctx: IHandlerContext,
  time: number,
  version: 'current' | 'previous',
  requestId?: string,
): Promise<void> {
  const filePath =
    version === 'current'
      ? ctx.fileUri.fsPath
      : (ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath);

  if (!filePath) return;

  // Wait if too many concurrent extractions
  while (ctx.activeFrameExtractions >= MAX_CONCURRENT_FRAMES) {
    await ctx.scheduler.wait(50);
  }
  ctx.activeFrameExtractions++;

  try {
    const imageBuffer = await ctx.requireEngine().extractFrame(filePath, time);

    if (imageBuffer) {
      ctx.sendMessage({
        requestId,
        type: 'mediaDiff:frameData',
        payload: {
          time,
          version,
          imageBuffer,
        },
      });
    }
  } catch (error) {
    logger.error(`Failed to extract frame at ${time}s (${version}):`, error);
  } finally {
    ctx.activeFrameExtractions--;
  }
}

/**
 * Handle inspect element request — lazy content diff for timeline media elements.
 * Extracts a low-resolution thumbnail frame from the media source.
 */
export async function handleInspectElement(
  ctx: IHandlerContext,
  src: string,
  requestId?: string,
): Promise<void> {
  if (!src) return;

  const path = await import('path');
  const { resolveMediaSrcPath } = await import('../../../media-lsp/services/resolveMediaSrcPath');
  const projectDir = path.dirname(ctx.fileUri.fsPath);
  const absoluteSrc = await resolveMediaSrcPath(projectDir, src);

  try {
    // Extract a thumbnail frame at t=0 with low resolution
    const imageBuffer = await ctx.requireEngine().extractFrame(absoluteSrc, 0);

    if (imageBuffer) {
      ctx.sendMessage({
        requestId,
        type: 'mediaDiff:elementThumbnail',
        payload: {
          src,
          imageBuffer,
        },
      });
    }
  } catch (error) {
    logger.error(`Failed to inspect element ${src}:`, error);
  }
}
