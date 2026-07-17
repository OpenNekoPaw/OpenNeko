import {
  isDocumentFile,
  type AgentContextPayload,
  type AttachmentType,
  type MessageAttachment,
} from '@neko/shared';

export type ReferenceTokenProjectionKind =
  'file' | 'image' | 'video' | 'audio' | 'canvas' | 'clip' | 'entity';

export type ReferenceTokenProjectionVariant = 'ambient' | 'attached' | 'inline';

export interface ReferenceTokenProjection {
  kind: ReferenceTokenProjectionKind;
  label: string;
  title: string;
  meta: string | null;
  countLabel: string | null;
  thumbnailSrc: string | null;
  variant?: ReferenceTokenProjectionVariant;
}

export type ReferenceMediaType = 'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

export interface PathReferenceTokenInput {
  path: string;
  label?: string;
  mediaType?: ReferenceMediaType;
  thumbnailUri?: string;
}

export interface MessageContextReferenceTokenInput {
  type: string;
  id: string;
  label: string;
  summary?: string;
  thumbnailUri?: string;
  mediaType?: ReferenceMediaType;
  navigationData?: Record<string, string>;
}

export interface AmbientCanvasReferenceTokenInput {
  label: string;
  title: string;
  meta?: string | null;
  countLabel?: string | null;
}

export function projectPathReferenceToken(
  reference: PathReferenceTokenInput,
): ReferenceTokenProjection {
  const kind = inferReferenceKindFromPath(reference.path, reference.mediaType);
  return {
    kind,
    label: reference.label || formatReferenceBasename(reference.path),
    title: reference.path,
    meta: formatReferenceParentPath(reference.path),
    countLabel: null,
    thumbnailSrc: reference.thumbnailUri ?? null,
  };
}

export function projectAttachmentReferenceToken(
  attachment: MessageAttachment,
): ReferenceTokenProjection {
  const sizeLabel = formatReferenceSize(attachment.size);
  const sourceTitle = attachment.path || attachment.name;
  return {
    kind: toAttachmentReferenceKind(attachment),
    label: attachment.name,
    title: sizeLabel ? `${sourceTitle} (${sizeLabel})` : sourceTitle,
    meta: joinReferenceMeta([formatReferenceParentPath(attachment.path), sizeLabel]),
    countLabel: null,
    thumbnailSrc: attachment.preview ?? null,
  };
}

export function projectContextPayloadReferenceToken(
  payload: AgentContextPayload,
): ReferenceTokenProjection {
  return {
    kind: toContextReferenceKind(payload.type),
    label: payload.label,
    title: payload.summary || payload.label,
    meta: null,
    countLabel: null,
    thumbnailSrc: null,
  };
}

export function projectMessageContextReferenceToken(
  reference: MessageContextReferenceTokenInput,
): ReferenceTokenProjection {
  const path = reference.navigationData?.filePath ?? reference.navigationData?.path;
  const pathToken = path
    ? projectPathReferenceToken({
        path,
        label: reference.label,
        mediaType: reference.mediaType,
        thumbnailUri: reference.thumbnailUri,
      })
    : null;

  return {
    kind: pathToken?.kind ?? toContextReferenceKind(reference.type),
    label: reference.label,
    title: reference.summary || path || reference.label,
    meta: pathToken?.meta ?? null,
    countLabel: null,
    thumbnailSrc: reference.thumbnailUri ?? null,
  };
}

export function projectAmbientCanvasReferenceToken(
  input: AmbientCanvasReferenceTokenInput,
): ReferenceTokenProjection {
  return {
    kind: 'canvas',
    label: input.label,
    title: input.title,
    meta: input.meta ?? null,
    countLabel: input.countLabel ?? null,
    thumbnailSrc: null,
    variant: 'ambient',
  };
}

export function toAttachmentTypeFromPathReference(
  reference: PathReferenceTokenInput,
): AttachmentType {
  const kind = inferReferenceKindFromPath(reference.path, reference.mediaType);
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  return 'file';
}

export function inferReferenceKindFromPath(
  path: string,
  mediaType?: ReferenceMediaType,
): ReferenceTokenProjectionKind {
  if (mediaType === 'document' || isDocumentFile(path)) {
    return 'file';
  }
  if (mediaType === 'image' || hasExtension(path, IMAGE_EXTENSIONS)) {
    return 'image';
  }
  if (mediaType === 'video' || mediaType === 'sequence' || hasExtension(path, VIDEO_EXTENSIONS)) {
    return 'video';
  }
  if (mediaType === 'audio' || hasExtension(path, AUDIO_EXTENSIONS)) {
    return 'audio';
  }
  return 'file';
}

export function formatReferenceBasename(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function formatReferenceParentPath(path: string | undefined): string | null {
  if (!path) return null;
  const normalized = path.replaceAll('\\', '/');
  const separatorIndex = normalized.lastIndexOf('/');
  if (separatorIndex <= 0) return null;
  return normalized.slice(0, separatorIndex);
}

export function formatReferenceSize(bytes: number | undefined): string | null {
  if (bytes === undefined || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toAttachmentReferenceKind(attachment: MessageAttachment): ReferenceTokenProjectionKind {
  if (attachment.type === 'image') return 'image';
  if (attachment.type === 'video') return 'video';
  if (attachment.type === 'audio') return 'audio';
  return inferReferenceKindFromPath(attachment.path ?? attachment.name);
}

function toContextReferenceKind(type: string): ReferenceTokenProjectionKind {
  if (
    type === 'canvas-node' ||
    type === 'canvas-storyboard-action-intent' ||
    type === 'model-scene' ||
    type === 'sketch-layer'
  ) {
    return 'canvas';
  }
  if (type === 'asset' || type === 'entity' || type === 'character' || type === 'scene') {
    return 'entity';
  }
  if (type === 'cut-clip') {
    return 'clip';
  }
  if (type === 'image') {
    return 'image';
  }
  if (type === 'media') {
    return 'video';
  }
  if (type === 'audio-clip') {
    return 'audio';
  }
  return 'file';
}

function joinReferenceMeta(parts: readonly (string | null)[]): string | null {
  const label = parts.filter(Boolean).join(' · ');
  return label || null;
}

function hasExtension(path: string, extensions: readonly string[]): boolean {
  const normalized = path.toLowerCase();
  return extensions.some((extension) => normalized.endsWith(extension));
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.flac', '.ogg'];
