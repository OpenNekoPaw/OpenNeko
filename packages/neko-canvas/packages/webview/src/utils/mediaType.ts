/**
 * Media Type Detection - Detect media types from file extensions
 */

// =============================================================================
// Constants
// =============================================================================

/** Map of file extensions to media type categories */
const MEDIA_EXTENSIONS: Record<string, 'image' | 'video' | 'audio'> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  svg: 'image',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  m4v: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
};

// =============================================================================
// Functions
// =============================================================================

/**
 * Detect media type from a file name by its extension.
 * Returns null if the extension is not recognized.
 */
export function detectMediaType(fileName: string): 'image' | 'video' | 'audio' | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_EXTENSIONS[ext] ?? null;
}
