/**
 * FrameOperations — frame extraction and seek.
 *
 * Handles:
 * - Debounced seek requests (prevents VideoToolbox session exhaustion)
 * - Concurrent frame extraction with semaphore control
 */

import type { IHandlerContext } from './types';
import { MAX_CONCURRENT_FRAMES } from './types';
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
    ctx.pendingSeekCompletion?.resolve();
    ctx.pendingSeekCompletion = null;
  }

  return new Promise<void>((resolve, reject) => {
    const completion = { resolve, reject };
    ctx.pendingSeekCompletion = completion;
    ctx.seekDebounceTimer = ctx.scheduler.scheduleOnce(async () => {
      ctx.seekDebounceTimer = null;
      try {
        await Promise.all([
          handleGetFrame(ctx, time, 'current', requestId),
          handleGetFrame(ctx, time, 'previous', requestId),
        ]);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        if (ctx.pendingSeekCompletion === completion) {
          ctx.pendingSeekCompletion = null;
        }
      }
    }, 50);
  });
}

/**
 * Handle get frame request for video through the Node/FFmpeg runtime.
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

  if (!filePath) {
    throw new Error(`No ${version} file is available for frame extraction.`);
  }

  // Wait if too many concurrent extractions
  while (ctx.activeFrameExtractions >= MAX_CONCURRENT_FRAMES) {
    await ctx.scheduler.wait(50);
  }
  ctx.activeFrameExtractions++;

  try {
    const imageBuffer = dataUrlToArrayBuffer(
      await ctx.requireMediaRuntime().captureFrame(filePath, time),
    );
    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:frameData',
      payload: {
        time,
        version,
        imageBuffer,
      },
    });
  } finally {
    ctx.activeFrameExtractions--;
  }
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error('Frame capture returned an invalid data URL.');
  const bytes = Buffer.from(dataUrl.slice(separator + 1), 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
