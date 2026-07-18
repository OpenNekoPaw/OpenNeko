import type { DocumentCanvasNode, ModelCanvasNode, TextCanvasNode } from './canvas';

export type CanvasDroppedAssetKind =
  'media' | 'text' | 'script' | 'document' | 'model' | 'canvas' | 'project';

export type CanvasTextFileFormat = NonNullable<TextCanvasNode['data']['format']>;

export type NkProjectType = 'nkv';

export interface DroppedMediaCanvasAsset {
  kind: 'media';
  name: string;
  path: string;
  mediaType: 'image' | 'video' | 'audio';
  /** Runtime-only safe URL for immediate webview display/playback. */
  runtimeAssetPath?: string;
  /** Original local file path, kept for compatibility with import payloads. */
  originalPath?: string;
}

export interface DroppedScriptCanvasAsset {
  kind: 'script';
  name: string;
  path: string;
  title: string;
}

export interface DroppedTextCanvasAsset {
  kind: 'text';
  name: string;
  path: string;
  title: string;
  content: string;
  format: CanvasTextFileFormat;
}

export interface DroppedDocumentCanvasAsset {
  kind: 'document';
  name: string;
  path: string;
  title: string;
  docType: DocumentCanvasNode['data']['docType'];
}

export interface DroppedModelCanvasAsset {
  kind: 'model';
  name: string;
  path: string;
  modelName: string;
  modelType: ModelCanvasNode['data']['modelType'];
  role: ModelCanvasNode['data']['role'];
}

export interface DroppedCanvasEmbedAsset {
  kind: 'canvas';
  name: string;
  path: string;
  title: string;
}

export interface DroppedProjectAsset {
  kind: 'project';
  name: string;
  path: string;
  title: string;
  projectType: NkProjectType;
}

export type CanvasDroppedAsset =
  | DroppedMediaCanvasAsset
  | DroppedTextCanvasAsset
  | DroppedScriptCanvasAsset
  | DroppedDocumentCanvasAsset
  | DroppedModelCanvasAsset
  | DroppedCanvasEmbedAsset
  | DroppedProjectAsset;

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
const DOCUMENT_EXTENSIONS: Record<string, DroppedDocumentCanvasAsset['docType']> = {
  pdf: 'pdf',
  docx: 'docx',
  epub: 'epub',
  cbz: 'cbz',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  log: 'text',
};
const MODEL_EXTENSIONS = new Set(['safetensors', 'ckpt', 'pt', 'pth', 'bin']);
const CANVAS_EXTENSIONS = new Set(['nkc']);

const PROJECT_EXTENSIONS: Record<string, NkProjectType> = {
  nkv: 'nkv',
};

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function inferCanvasMediaType(
  fileName: string,
): DroppedMediaCanvasAsset['mediaType'] | null {
  return MEDIA_EXTENSIONS[getFileExtension(fileName)] ?? null;
}

export function inferCanvasDocumentType(
  fileName: string,
): DroppedDocumentCanvasAsset['docType'] | null {
  return DOCUMENT_EXTENSIONS[getFileExtension(fileName)] ?? null;
}

export function inferCanvasTextFileFormat(fileName: string): CanvasTextFileFormat | null {
  return TEXT_EXTENSIONS[getFileExtension(fileName)] ?? null;
}

export function inferCanvasModelType(
  fileName: string,
): DroppedModelCanvasAsset['modelType'] | null {
  const lowerName = fileName.toLowerCase();
  const ext = getFileExtension(fileName);
  if (!MODEL_EXTENSIONS.has(ext)) {
    return null;
  }

  if (lowerName.includes('controlnet')) {
    return 'controlnet';
  }
  if (lowerName.includes('vae')) {
    return 'vae';
  }
  if (lowerName.includes('lora') || lowerName.includes('lycoris')) {
    return 'lora';
  }
  return 'checkpoint';
}

export function inferNkProjectType(fileName: string): NkProjectType | null {
  return PROJECT_EXTENSIONS[getFileExtension(fileName)] ?? null;
}

export function inferCanvasDroppedAssetKind(fileName: string): CanvasDroppedAssetKind | null {
  if (inferCanvasMediaType(fileName)) {
    return 'media';
  }
  if (inferCanvasTextFileFormat(fileName)) {
    return 'text';
  }
  if (inferCanvasDocumentType(fileName)) {
    return 'document';
  }
  if (inferCanvasModelType(fileName)) {
    return 'model';
  }
  if (CANVAS_EXTENSIONS.has(getFileExtension(fileName))) {
    return 'canvas';
  }
  if (inferNkProjectType(fileName)) {
    return 'project';
  }
  return null;
}
