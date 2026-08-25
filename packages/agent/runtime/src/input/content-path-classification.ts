import { isTextualDocumentFormat, type DocumentFormat } from '@neko/content-domain';
import { detectDocumentFormat, isSupportedDocumentPath } from '@neko/content-domain/document';
import { detectMediaType, getFileExtension, getMimeType } from '@neko/media';

export type AgentContentPathClass =
  | 'text'
  | 'document'
  | 'image'
  | 'audio'
  | 'video'
  | 'score'
  | 'archive'
  | 'executable'
  | 'canvas-project'
  | 'cut-project'
  | 'unknown';

export interface AgentContentPathClassification {
  readonly kind: AgentContentPathClass;
  readonly mimeType: string;
  readonly documentFormat?: DocumentFormat;
  readonly mediaType?: 'text' | 'document' | 'image' | 'sequence' | 'audio' | 'video';
  readonly processorRequirement?: string;
  readonly domainOwner?: 'canvas' | 'cut';
}

const SCORE_EXTENSIONS = new Set(['mid', 'midi', 'musicxml', 'mxl']);
const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'tar', 'tgz', 'gz', 'rar']);
const EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'dll',
  'dylib',
  'so',
  'app',
  'dmg',
  'pkg',
  'msi',
  'wasm',
  'bin',
]);
const SOURCE_TEXT_EXTENSIONS = new Set([
  'c',
  'cc',
  'cpp',
  'css',
  'go',
  'h',
  'hpp',
  'ini',
  'java',
  'js',
  'jsx',
  'kt',
  'less',
  'log',
  'lua',
  'mjs',
  'cjs',
  'php',
  'properties',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'toml',
  'ts',
  'tsx',
]);

export function classifyAgentContentPath(filePath: string): AgentContentPathClassification {
  const extension = getFileExtension(filePath);
  const mimeType = getMimeType(filePath);
  if (extension === 'nkc') {
    return { kind: 'canvas-project', mimeType, domainOwner: 'canvas' };
  }
  if (extension === 'otio') {
    return { kind: 'cut-project', mimeType, domainOwner: 'cut' };
  }
  if (SCORE_EXTENSIONS.has(extension)) {
    return { kind: 'score', mimeType, processorRequirement: 'score-analysis' };
  }
  if (isSupportedDocumentPath(filePath)) {
    const documentFormat = detectDocumentFormat(filePath);
    return isTextualDocumentFormat(documentFormat)
      ? { kind: 'text', mimeType, documentFormat, mediaType: 'text' }
      : { kind: 'document', mimeType, documentFormat, mediaType: 'document' };
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { kind: 'archive', mimeType, processorRequirement: 'bounded archive' };
  }
  if (EXECUTABLE_EXTENSIONS.has(extension)) {
    return {
      kind: 'executable',
      mimeType,
      processorRequirement: 'isolated executable/native-binary',
    };
  }
  if (SOURCE_TEXT_EXTENSIONS.has(extension)) {
    return { kind: 'text', mimeType, mediaType: 'text' };
  }
  if (mimeType.startsWith('image/')) {
    const mediaType = detectMediaType(filePath);
    return {
      kind: 'image',
      mimeType,
      mediaType: mediaType === 'sequence' ? 'sequence' : 'image',
    };
  }
  if (mimeType.startsWith('audio/')) return { kind: 'audio', mimeType, mediaType: 'audio' };
  if (mimeType.startsWith('video/')) return { kind: 'video', mimeType, mediaType: 'video' };
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/x-yaml'
  ) {
    return { kind: 'text', mimeType, mediaType: 'text' };
  }
  return { kind: 'unknown', mimeType };
}
