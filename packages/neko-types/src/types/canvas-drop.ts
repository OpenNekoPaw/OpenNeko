export type CanvasDroppedAssetKind = 'media' | 'text' | 'file' | 'canvas';
export type CanvasTextFileFormat = 'plain' | 'markdown';

export interface DroppedMediaCanvasAsset {
  kind: 'media';
  name: string;
  path: string;
  mediaType: 'image' | 'video' | 'audio';
  contentLocator: WorkspaceFileContentLocator;
  /** Runtime-only safe URL for immediate webview display/playback. */
  runtimeAssetPath?: string;
  /** Original local file path, never persisted by the Webview. */
  originalPath?: string;
}

export interface DroppedTextCanvasAsset {
  kind: 'text';
  name: string;
  path: string;
  title: string;
  content: string;
  format: CanvasTextFileFormat;
}

export interface DroppedFileCanvasAsset {
  kind: 'file';
  name: string;
  path: string;
  title: string;
  contentLocator: WorkspaceFileContentLocator;
}

export interface DroppedCanvasEmbedAsset {
  kind: 'canvas';
  name: string;
  path: string;
  title: string;
}

export type CanvasDroppedAsset =
  | DroppedMediaCanvasAsset
  | DroppedTextCanvasAsset
  | DroppedFileCanvasAsset
  | DroppedCanvasEmbedAsset;

const MEDIA_EXTENSIONS: Record<string, DroppedMediaCanvasAsset['mediaType']> = {
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

const TEXT_EXTENSIONS: Record<string, CanvasTextFileFormat> = {
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plain',
  log: 'plain',
  fountain: 'plain',
};

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function inferCanvasMediaType(
  fileName: string,
): DroppedMediaCanvasAsset['mediaType'] | null {
  return MEDIA_EXTENSIONS[getFileExtension(fileName)] ?? null;
}

export function inferCanvasTextFileFormat(fileName: string): CanvasTextFileFormat | null {
  return TEXT_EXTENSIONS[getFileExtension(fileName)] ?? null;
}

export function inferCanvasDroppedAssetKind(fileName: string): CanvasDroppedAssetKind | null {
  if (inferCanvasMediaType(fileName)) return 'media';
  if (inferCanvasTextFileFormat(fileName)) return 'text';
  const extension = getFileExtension(fileName);
  if (extension === 'nkc') return 'canvas';
  return extension.length > 0 ? 'file' : null;
}
import type { WorkspaceFileContentLocator } from './content-locator';
