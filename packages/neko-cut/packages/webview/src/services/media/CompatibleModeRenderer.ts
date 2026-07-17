/**
 * CompatibleModeRenderer - Extension-side decoding for compatible mode preview
 *
 * Responsibilities:
 * - Compatible mode video frame extraction (via Extension FFmpeg)
 * - Composite frame rendering (multi-layer compositing via Extension)
 * - Type guards for compatible mode responses
 *
 * Design:
 * - Delegates IPC communication to the caller (MediaRequestProxy)
 * - Uses DataConverters for buffer-to-bitmap conversion
 * - All methods are pure functions that operate on response data
 */

import type { CompatibleGetVideoFrameResponse, RenderCompositeFrameResponse } from '@neko/shared';
import type { ILogger } from '@neko/shared';
import { dataUrlToImageBitmap, arrayBufferToImageBitmap } from './DataConverters';

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for Compatible Mode Response
 */
export function isCompatibleModeResponse(
  message: unknown,
): message is RenderCompositeFrameResponse | CompatibleGetVideoFrameResponse {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;

  return (
    typeof msg.type === 'string' &&
    (msg.type === 'media:response:compatibleGetVideoFrame' ||
      msg.type === 'media:response:renderCompositeFrame') &&
    typeof msg.requestId === 'string'
  );
}

// =============================================================================
// Response Processors
// =============================================================================

/**
 * Process a compatible mode video frame response into an ImageBitmap.
 * Called after the IPC round-trip is complete.
 */
export async function processCompatibleFrameResponse(
  response: CompatibleGetVideoFrameResponse,
  logger: ILogger,
): Promise<ImageBitmap> {
  if (response.error) {
    throw new Error(response.error);
  }

  if (!response.payload?.imageData && !response.payload?.imageDataUrl) {
    throw new Error('No image data in response');
  }

  // Prefer binary data; data URLs remain a supported transport alternative.
  if (response.payload.imageData) {
    return arrayBufferToImageBitmap(
      response.payload.imageData.buffer as ArrayBuffer,
      'image/jpeg',
      logger,
    );
  }
  return dataUrlToImageBitmap(response.payload.imageDataUrl!);
}

/**
 * Process a composite frame response into an ImageBitmap.
 * Handles both raw RGBA and encoded JPEG formats.
 * Called after the IPC round-trip is complete.
 */
export async function processCompositeFrameResponse(
  response: RenderCompositeFrameResponse,
  logger: ILogger,
): Promise<ImageBitmap> {
  if (response.error) {
    throw new Error(response.error);
  }

  if (!response.payload?.imageData && !response.payload?.imageDataUrl) {
    throw new Error('No image data in response');
  }

  // Prefer binary data; data URLs remain a supported transport alternative.
  if (response.payload.imageData) {
    const buffer = response.payload.imageData.buffer as ArrayBuffer;
    const imgWidth = response.payload.width;
    const imgHeight = response.payload.height;

    // Check if this is raw RGBA data (width * height * 4 === bufferSize)
    if (imgWidth && imgHeight && buffer.byteLength === imgWidth * imgHeight * 4) {
      const clamped = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(clamped, imgWidth, imgHeight);
      return createImageBitmap(imageData);
    }

    // Otherwise treat as encoded image (JPEG)
    return arrayBufferToImageBitmap(buffer, 'image/jpeg', logger);
  }
  return dataUrlToImageBitmap(response.payload.imageDataUrl!);
}
