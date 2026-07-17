/**
 * Unified Media Utilities
 *
 * Single source of truth for media type detection, MIME mapping, and file
 * extension utilities. All packages MUST use these functions instead of
 * maintaining their own implementations.
 *
 * Replaces duplicate implementations in:
 * - neko-assets/FileService.ts
 * - neko-assets/AssetDiffService.ts
 * - neko-cut/AssetService.ts
 * - neko-canvas/assetLibrary.ts
 * - neko-agent/media-manager.ts
 *
 * NOTE: This module has NO Node.js dependencies — safe to use in Webview.
 */

import type { AssetMediaType } from '../types/asset/entity';

// =============================================================================
// Extension → Media Type Mapping
// =============================================================================

/**
 * Comprehensive extension-to-media-type mapping.
 * Merged from all packages to ensure no supported format is missing.
 */
const EXTENSION_TO_MEDIA_TYPE: Record<string, AssetMediaType> = {
  // Video
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  flv: 'video',
  m4v: 'video',
  ts: 'video',
  wmv: 'video',
  // Audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  aac: 'audio',
  m4a: 'audio',
  flac: 'audio',
  wma: 'audio',
  opus: 'audio',
  // Image
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  svg: 'image',
  tiff: 'image',
  tif: 'image',
  // Text (includes subtitles — previously 'subtitle' in neko-agent)
  txt: 'text',
  md: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',
  csv: 'text',
  xml: 'text',
  srt: 'text',
  vtt: 'text',
  ass: 'text',
  ssa: 'text',
  sub: 'text',
  // Document
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  ppt: 'document',
  pptx: 'document',
  xls: 'document',
  xlsx: 'document',
  epub: 'document',
  cbz: 'document',
  cbr: 'document',
  fdx: 'document',
};

// =============================================================================
// Extension → MIME Type Mapping
// =============================================================================

/**
 * Comprehensive extension-to-MIME mapping.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  // Video
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  flv: 'video/x-flv',
  m4v: 'video/x-m4v',
  ts: 'video/mp2t',
  wmv: 'video/x-ms-wmv',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  // Image
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  // Text
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  yaml: 'application/x-yaml',
  yml: 'application/x-yaml',
  csv: 'text/csv',
  xml: 'application/xml',
  // Subtitle
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  ass: 'text/x-ssa',
  ssa: 'text/x-ssa',
  sub: 'text/x-sub',
  // Document
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  epub: 'application/epub+zip',
  cbz: 'application/x-cbz',
  cbr: 'application/vnd.comicbook-rar',
  fdx: 'application/xml+fdx',
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Extract file extension (lowercase, without dot).
 *
 * @example
 * getFileExtension('/path/to/video.MP4')  // 'mp4'
 * getFileExtension('image.png')           // 'png'
 * getFileExtension('no-extension')        // ''
 */
export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) return '';
  // Handle paths with directory separators after the dot
  const afterDot = filePath.slice(lastDot + 1);
  if (afterDot.includes('/') || afterDot.includes('\\')) return '';
  return afterDot.toLowerCase();
}

/**
 * Detect the asset media type from a file path.
 *
 * Returns the appropriate {@link AssetMediaType}:
 * - `'video'` — mp4, mov, avi, mkv, webm, flv, m4v, ts, wmv
 * - `'audio'` — mp3, wav, ogg, aac, m4a, flac, wma, opus
 * - `'image'` — jpg, jpeg, png, gif, webp, bmp, svg, tiff
 * - `'text'`  — txt, md, json, yaml, csv, xml, srt, vtt, ass, ssa, sub
 * - `'document'` — pdf, doc, docx, ppt, pptx, xls, xlsx, epub, cbz, fdx
 * - `'sequence'` — image files with 3+ consecutive digits (e.g., frame_001.png)
 * - `'image'` as fallback for unknown extensions
 *
 * @example
 * detectMediaType('/project/clip.mp4')       // 'video'
 * detectMediaType('frame_001.png')           // 'sequence'
 * detectMediaType('subtitle.srt')            // 'text'
 */
export function detectMediaType(filePath: string): AssetMediaType {
  const ext = getFileExtension(filePath);

  // Check for image sequence pattern BEFORE extension lookup
  // Image files with 3+ consecutive digits in the name are treated as sequences
  if (ext && EXTENSION_TO_MEDIA_TYPE[ext] === 'image' && isImageSequence(filePath)) {
    return 'sequence';
  }

  return EXTENSION_TO_MEDIA_TYPE[ext] ?? 'image';
}

/**
 * Get the MIME type for a file path.
 *
 * @returns MIME string, or `'application/octet-stream'` for unknown types.
 *
 * @example
 * getMimeType('video.mp4')    // 'video/mp4'
 * getMimeType('unknown.xyz')  // 'application/octet-stream'
 */
export function getMimeType(filePath: string): string {
  const ext = getFileExtension(filePath);
  return EXTENSION_TO_MIME[ext] ?? 'application/octet-stream';
}

/**
 * Check if a file path corresponds to a known media file (video, audio, or image).
 */
export function isMediaFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  const type = EXTENSION_TO_MEDIA_TYPE[ext];
  return type === 'video' || type === 'audio' || type === 'image';
}

/**
 * Check if a file path looks like part of an image sequence.
 *
 * Detects patterns like:
 * - frame_001.png, frame_002.png
 * - shot_0001.exr
 * - render.1234.png
 *
 * Requires 3+ consecutive digits in the file name (not in directory path).
 */
export function isImageSequence(filePath: string): boolean {
  // Extract just the filename (handle both / and \ separators)
  const parts = filePath.split(/[/\\]/);
  const fileName = parts[parts.length - 1] ?? '';
  // Remove extension before checking
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  return /\d{3,}/.test(nameWithoutExt);
}

/**
 * Check if a file path corresponds to a document file (PDF, Word, PPT, etc.).
 */
export function isDocumentFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return EXTENSION_TO_MEDIA_TYPE[ext] === 'document';
}

/**
 * Check if a file extension is a subtitle format.
 * Useful for neko-agent which previously had a separate 'subtitle' type.
 */
export function isSubtitleFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ['srt', 'vtt', 'ass', 'ssa', 'sub'].includes(ext);
}

/**
 * Get all supported extensions for a given media type.
 */
export function getExtensionsForType(type: AssetMediaType): string[] {
  return Object.entries(EXTENSION_TO_MEDIA_TYPE)
    .filter(([, t]) => t === type)
    .map(([ext]) => ext);
}
