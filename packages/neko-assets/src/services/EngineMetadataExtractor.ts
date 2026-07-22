/**
 * Engine Metadata Extractor
 *
 * Creates a MetadataExtractor that leverages neko-engine's probeMedia
 * (Rust FFmpeg) for rich media metadata extraction.
 *
 * Falls back gracefully to basic fs.stat metadata when the engine
 * is unavailable or the file is not a video/audio file.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type { MediaFileMetadata, MediaInfo } from '@neko/shared';
import { getMimeType, detectMediaType } from '@neko/shared';

// =============================================================================
// Text Metadata Extraction (migrated from neko-cut AssetService)
// =============================================================================

async function extractTextMetadata(filePath: string, metadata: MediaFileMetadata): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    metadata.characterCount = content.length;
    metadata.wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
    metadata.lineCount = content.split('\n').length;
    metadata.encoding = 'utf-8';

    // Simple language detection based on content
    if (/[\u4e00-\u9fa5]/.test(content)) {
      metadata.language = 'zh-CN';
    } else {
      metadata.language = 'en';
    }
  } catch {
    // Silently ignore — text metadata is best-effort
  }
}

// =============================================================================
// Engine Probe Integration
// =============================================================================

/**
 * Attempt to probe media via neko-engine's internal command.
 * Returns null if the engine is not available or probe fails.
 */
async function probeViaEngine(filePath: string): Promise<MediaInfo | null> {
  try {
    const result = await vscode.commands.executeCommand<MediaInfo | null>(
      'neko.engine.probeInternal',
      filePath,
    );
    return result ?? null;
  } catch {
    // Engine not available — fall back silently
    return null;
  }
}

/**
 * Map engine MediaInfo to MediaFileMetadata fields.
 */
function applyMediaInfo(metadata: MediaFileMetadata, info: MediaInfo): void {
  if (info.duration > 0) metadata.duration = info.duration;
  if (info.width > 0) metadata.width = info.width;
  if (info.height > 0) metadata.height = info.height;
  if (info.fps > 0) metadata.frameRate = info.fps;
  if (info.codec && info.codec !== 'unknown') metadata.codec = info.codec;
  if (info.audioSampleRate) metadata.sampleRate = info.audioSampleRate;
  if (info.audioChannels) metadata.channels = info.audioChannels;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MetadataExtractor that integrates with neko-engine probeMedia.
 *
 * The extractor:
 * 1. Always reads basic metadata via fs.stat (fileSize + mimeType)
 * 2. For video/audio files, attempts to probe via neko-engine for rich metadata
 *    (duration, codec, resolution, fps, audio info)
 * 3. For text files, extracts word/line/character counts and language
 * 4. Falls back gracefully when engine is unavailable
 *
 * This is injected into the Media Library projection.
 */
export function createEngineMetadataExtractor(): (filePath: string) => Promise<MediaFileMetadata> {
  return async (filePath: string): Promise<MediaFileMetadata> => {
    // 1. Basic metadata (always available)
    let fileSize = 0;
    try {
      const stats = await fs.stat(filePath);
      fileSize = stats.size;
    } catch {
      // File may not exist yet (e.g., AI-generated, not yet written)
    }

    const mimeType = getMimeType(filePath);
    const mediaType = detectMediaType(filePath);

    const metadata: MediaFileMetadata = {
      fileSize,
      mimeType,
    };

    // 2. Rich metadata for video/audio/image via engine probeMedia
    if (mediaType === 'video' || mediaType === 'audio' || mediaType === 'image') {
      const info = await probeViaEngine(filePath);
      if (info) {
        applyMediaInfo(metadata, info);
      }
    }

    // 3. Text metadata
    if (mediaType === 'text') {
      await extractTextMetadata(filePath, metadata);
    }

    return metadata;
  };
}
