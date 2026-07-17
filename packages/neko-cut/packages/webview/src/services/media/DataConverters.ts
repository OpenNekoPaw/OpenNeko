/**
 * DataConverters - Pure data conversion utilities for media buffers
 *
 * Responsibilities:
 * - Convert base64 data URLs to ImageBitmap
 * - Convert raw ArrayBuffer to ImageBitmap
 * - Convert raw PCM ArrayBuffer to AudioBuffer
 * - Manage AudioContext lifecycle for fallback buffer creation
 *
 * Design:
 * - All functions are stateless except AudioContext fallback
 * - AudioContext is lazily created and can be disposed
 */

import type { ILogger } from '@neko/shared';

// =============================================================================
// AudioContext Lifecycle
// =============================================================================

let audioBufferContext: AudioContext | null = null;

/**
 * Dispose the shared AudioContext used for fallback buffer creation.
 * Should be called when the proxy is disposed.
 */
export function disposeAudioContext(): void {
  if (audioBufferContext) {
    audioBufferContext.close().catch(() => {});
    audioBufferContext = null;
  }
}

// =============================================================================
// Image Conversion
// =============================================================================

/**
 * Convert base64 data URL to ImageBitmap
 */
export async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}

/**
 * Convert raw ArrayBuffer to ImageBitmap (more efficient than base64)
 */
export async function arrayBufferToImageBitmap(
  buffer: ArrayBuffer,
  mimeType: string,
  logger: ILogger,
): Promise<ImageBitmap> {
  if (buffer.byteLength === 0) {
    throw new Error('Empty image buffer received');
  }
  const blob = new Blob([buffer], { type: mimeType });
  try {
    return await createImageBitmap(blob);
  } catch (error) {
    logger.error(
      `createImageBitmap failed: bufferSize=${buffer.byteLength}, mimeType=${mimeType}`,
      error,
    );
    throw error;
  }
}

// =============================================================================
// Audio Conversion
// =============================================================================

/**
 * Convert raw PCM ArrayBuffer to AudioBuffer
 */
export async function arrayBufferToAudioBuffer(
  buffer: ArrayBuffer,
  sampleRate: number,
  channels: number,
): Promise<AudioBuffer> {
  const frameCount = Math.floor(buffer.byteLength / (channels * 4)); // Float32 = 4 bytes
  let audioBuffer: AudioBuffer;

  // Prefer AudioBuffer constructor: avoids creating AudioContext on every decode
  // (which triggers browser AudioContext count limits)
  try {
    audioBuffer = new AudioBuffer({
      length: frameCount,
      numberOfChannels: channels,
      sampleRate,
    });
  } catch {
    // Fallback: reuse a single AudioContext only for createBuffer (not for playback)
    if (!audioBufferContext || audioBufferContext.sampleRate !== sampleRate) {
      audioBufferContext?.close().catch(() => {});
      audioBufferContext = new AudioContext({ sampleRate });
    }
    audioBuffer = audioBufferContext.createBuffer(channels, frameCount, sampleRate);
  }

  // Copy PCM data to AudioBuffer
  const float32Data = new Float32Array(buffer);

  for (let channel = 0; channel < channels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);

    for (let i = 0; i < frameCount; i++) {
      channelData[i] = float32Data[i * channels + channel] || 0;
    }
  }

  return audioBuffer;
}
