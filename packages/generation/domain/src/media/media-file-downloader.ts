/**
 * Media File Downloader
 *
 * Shared utility for downloading remote media outputs to local filesystem.
 * Used by the Desktop Node host after background task completion.
 * Has no dependency on renderer APIs.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaFileDownloader');

/**
 * Formats that Electron webview (Chromium) cannot reliably decode inline.
 * Callers that run inside Electron should provide a `transcodeFile` callback.
 */
const TRANSCODE_NEEDED_EXTENSIONS = new Set(['.opus', '.mkv']);

function needsTranscode(ext: string): boolean {
  return TRANSCODE_NEEDED_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Derive file extension from HTTP Content-Type header.
 * Falls back to generationType / outputType when Content-Type is absent or generic.
 */
export function detectMediaExtension(
  contentType: string,
  generationType: string,
  outputType?: string,
): string {
  const ct = (contentType.split(';')[0] ?? '').trim().toLowerCase();

  // Audio
  if (ct === 'audio/ogg' || ct === 'audio/opus' || ct === 'audio/x-opus') return '.opus';
  if (ct === 'audio/mpeg' || ct === 'audio/mp3') return '.mp3';
  if (ct === 'audio/wav' || ct === 'audio/x-wav' || ct === 'audio/wave') return '.wav';
  if (ct === 'audio/mp4' || ct === 'audio/aac' || ct === 'audio/x-aac') return '.m4a';
  if (ct === 'audio/flac' || ct === 'audio/x-flac') return '.flac';
  if (ct === 'audio/webm') return '.webm';

  // Video
  if (ct === 'video/mp4') return '.mp4';
  if (ct === 'video/webm') return '.webm';
  if (ct === 'video/x-matroska' || ct === 'video/mkv') return '.mkv';
  if (ct === 'video/quicktime') return '.mov';

  // Image
  if (ct === 'image/png') return '.png';
  if (ct === 'image/jpeg') return '.jpg';
  if (ct === 'image/webp') return '.webp';
  if (ct === 'image/gif') return '.gif';

  // Fallback to task-type hint
  const hint = outputType || generationType;
  if (hint.includes('video')) return '.mp4';
  if (hint.includes('audio') || hint.includes('music') || hint.includes('tts')) return '.mp3';
  return '.png';
}

/**
 * Options for downloading media outputs
 */
export interface DownloadMediaOptions {
  /**
   * Optional transcoding callback for formats incompatible with the host environment
   * (e.g. raw Opus → MP3 for the Electron renderer).
   */
  transcodeFile?: (
    srcPath: string,
    destPath: string,
    mediaType: 'video' | 'audio',
  ) => Promise<boolean>;
}

/**
 * Download an array of media outputs to the local filesystem.
 *
 * @param operationId   - Used as filename prefix
 * @param generationType - Used for format fallback detection (e.g. 'text-to-image')
 * @param outputs    - Array of { url?, type? } from the media adapter
 * @param outputDir  - Absolute path to the target directory (created if absent)
 * @param options    - Optional transcoding callback
 * @returns Absolute paths of successfully saved files (same order as outputs)
 */
export async function downloadMediaOutputs(
  operationId: string,
  generationType: string,
  outputs: Array<{ url?: string; type?: string }>,
  outputDir: string,
  options: DownloadMediaOptions = {},
): Promise<string[]> {
  const savedPaths: string[] = [];

  await fs.mkdir(outputDir, { recursive: true });

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    if (!output?.url) {
      throw new Error(`Generated output ${i} is missing a source URL.`);
    }

    const sourcePath = toLocalPath(output.url);
    let remoteBuffer: Buffer | undefined;
    let remoteContentType = '';
    if (!sourcePath) {
      const response = await fetch(output.url);
      if (!response.ok) {
        throw new Error(`Generated output download failed with HTTP ${response.status}.`);
      }
      remoteContentType = response.headers.get('content-type') || '';
      remoteBuffer = Buffer.from(await response.arrayBuffer());
    }
    const detectedExt = sourcePath
      ? path.extname(sourcePath) || detectMediaExtension('', generationType, output.type)
      : detectMediaExtension(remoteContentType, generationType, output.type);
    const rawPath = path.join(outputDir, `${operationId}_${i}${detectedExt}`);
    const rawTempPath = `${rawPath}.part-${randomUUID()}`;
    const transcodeFile = needsTranscode(detectedExt) ? options.transcodeFile : undefined;
    const mediaType = generationType.includes('video') ? 'video' : 'audio';
    const compatExt = mediaType === 'video' ? '.mp4' : '.mp3';
    const compatPath = path.join(outputDir, `${operationId}_${i}${compatExt}`);
    const compatTempPath = `${compatPath}.part-${randomUUID()}`;

    try {
      if (sourcePath) {
        if (path.resolve(sourcePath) !== path.resolve(rawTempPath)) {
          await fs.copyFile(sourcePath, rawTempPath);
        }
      } else {
        if (!remoteBuffer) throw new Error(`Generated output ${i} has no materialized bytes.`);
        await fs.writeFile(rawTempPath, remoteBuffer, { flag: 'wx' });
      }

      if (transcodeFile) {
        const ok = await transcodeFile(rawTempPath, compatTempPath, mediaType);
        if (!ok) throw new Error('Generated output transcode returned false.');
        await fs.link(compatTempPath, compatPath);
        savedPaths.push(compatPath);
        continue;
      }

      await fs.link(rawTempPath, rawPath);
      savedPaths.push(rawPath);
    } catch (error) {
      logger.error('Failed to materialize generated output', { outputIndex: i, error });
      throw error;
    } finally {
      await fs.unlink(rawTempPath).catch(() => undefined);
      await fs.unlink(compatTempPath).catch(() => undefined);
    }
  }

  return savedPaths;
}

function toLocalPath(value: string): string | undefined {
  if (value.startsWith('file://')) return fileURLToPath(value);
  return path.isAbsolute(value) ? value : undefined;
}
