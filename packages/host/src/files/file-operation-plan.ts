import * as path from 'path';

export type FileOpenViewer = 'default' | 'video' | 'audio';

export interface OpenFilePlan {
  cleanPath: string;
  viewer: FileOpenViewer;
}

export interface SaveDialogFilterPlan {
  name: string;
  extensions: string[];
}

export interface SvgDownloadPlan {
  defaultFileName: string;
  filters: SaveDialogFilterPlan[];
  content: string;
}

export interface FileOperationSuccessPlan {
  ok: true;
  filePath: string;
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus']);
const DEFAULT_SVG_DOWNLOAD_FILE_NAME = 'diagram.svg';

export function createOpenFilePlan(filePath: string): OpenFilePlan | null {
  if (!filePath) return null;

  const cleanPath = stripFileProtocol(filePath);
  return {
    cleanPath,
    viewer: detectFileOpenViewer(cleanPath),
  };
}

export function stripFileProtocol(filePath: string): string {
  return filePath.replace(/^file:\/\//, '');
}

export function detectFileOpenViewer(filePath: string): FileOpenViewer {
  const extension = path.extname(filePath).replace(/^\./, '').toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'default';
}

export function buildSvgDownloadPlan(input: {
  svg: string;
  filename?: string;
}): SvgDownloadPlan | null {
  if (!input.svg) return null;

  return {
    defaultFileName: input.filename || DEFAULT_SVG_DOWNLOAD_FILE_NAME,
    filters: [
      { name: 'SVG Files', extensions: ['svg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    content: input.svg,
  };
}

export function buildSvgDownloadSavedMessage(filePath: string): string {
  return `SVG saved to ${filePath}`;
}

export function buildConfigFilePath(homeDir: string): string {
  return path.join(homeDir, '.neko', 'config.toml');
}
