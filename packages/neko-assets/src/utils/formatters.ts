/**
 * Media Metadata Formatting Utilities
 *
 * Shared by Media Library metadata presentation.
 * Pure functions, no external dependencies.
 */

import type { MediaFileMetadata } from '@neko/shared';

// =============================================================================
// Duration
// =============================================================================

/**
 * Format duration in seconds to a short string.
 *
 * @example
 * formatDuration(90)   // "1:30"
 * formatDuration(3661) // "1:01:01"
 * formatDuration(5.5)  // "0:06"
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// =============================================================================
// File Size
// =============================================================================

/**
 * Format file size in bytes to a human-readable string.
 *
 * @example
 * formatFileSize(1536)       // "1.5 KB"
 * formatFileSize(2621440)    // "2.5 MB"
 * formatFileSize(1073741824) // "1.0 GB"
 */
function formatFileSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// =============================================================================
// Tooltip
// =============================================================================

/**
 * Build tooltip lines from media metadata.
 * Returns an array for flexible formatting (plain text or MarkdownString).
 */
export function buildMetadataTooltipLines(metadata: MediaFileMetadata): string[] {
  const lines: string[] = [];

  if (metadata.width && metadata.height) {
    lines.push(`Resolution: ${metadata.width}x${metadata.height}`);
  }
  if (metadata.duration) {
    lines.push(`Duration: ${formatDuration(metadata.duration)}`);
  }
  if (metadata.frameRate) {
    lines.push(`Frame Rate: ${metadata.frameRate} fps`);
  }
  if (metadata.codec) {
    lines.push(`Codec: ${metadata.codec}`);
  }
  if (metadata.sampleRate) {
    lines.push(`Sample Rate: ${metadata.sampleRate} Hz`);
  }
  if (metadata.channels) {
    lines.push(`Channels: ${metadata.channels}`);
  }
  if (metadata.bitrate) {
    const kbps = Math.round(metadata.bitrate / 1000);
    lines.push(`Bitrate: ${kbps} kbps`);
  }
  if (metadata.fileSize) {
    lines.push(`Size: ${formatFileSize(metadata.fileSize)}`);
  }

  return lines;
}
