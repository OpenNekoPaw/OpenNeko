// =============================================================================
// Generated Asset Types — Cross-plugin asset reference schema (ADR-4)
//
// Binary data is stored by host/cache services. Cross-layer payloads should use
// stable refs such as `assetRef`; host adapters project paths into render URIs.
// =============================================================================

import type { PerceptualAssetRef } from '@neko/media';

/**
 * Discriminator for generated asset types.
 */
export type GeneratedAssetType = 'generated-image' | 'generated-audio' | 'generated-video';

/**
 * Base fields shared by all generated assets.
 *
 * `path` is host/cache-owned implementation state. It is retained on the
 * canonical generated asset record for local host side effects, but it must not
 * be persisted as Agent/Webview stable identity.
 */
export interface BaseGeneratedAsset {
  /** Asset type discriminator */
  type: GeneratedAssetType;
  /** Globally unique identifier (e.g. `crypto.randomUUID()`) */
  id: string;
  /**
   * Host-local asset path for projection, indexing, and explicit open/reveal
   * side effects. Persisted cross-layer metadata should prefer `assetRef`.
   */
  path: string;
  /** Stable host-agnostic reference for persistence and tool backfill. */
  assetRef?: PerceptualAssetRef;
  /** Revision/digest and generation lineage used by Quality and promotion flows. */
  lifecycle?: import('./generated-asset-lifecycle').GeneratedAssetRevisionRef;
  /** MIME type of the stored file */
  mimeType: string;
  /** ISO 8601 timestamp of generation */
  generatedAt: string;
  /** Prompt used to generate this asset */
  prompt?: string;
  /** Model / provider identifier (e.g. `fal.ai/flux`, `dashscope/wanx`) */
  model?: string;
  /** Source canvas node or upstream node identifier for lineage tracing */
  sourceNodeId?: string;
}

// -----------------------------------------------------------------------------
// Image
// -----------------------------------------------------------------------------

export interface GeneratedImage extends BaseGeneratedAsset {
  type: 'generated-image';
  /** Pixel width */
  width: number;
  /** Pixel height */
  height: number;
  /** Aspect ratio label (e.g. '16:9', '1:1') */
  ratio: string;
}

// -----------------------------------------------------------------------------
// Audio
// -----------------------------------------------------------------------------

export interface GeneratedAudio extends BaseGeneratedAsset {
  type: 'generated-audio';
  /** Duration in seconds */
  duration: number;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channels: number;
}

// -----------------------------------------------------------------------------
// Video
// -----------------------------------------------------------------------------

export interface GeneratedVideo extends BaseGeneratedAsset {
  type: 'generated-video';
  /** Duration in seconds */
  duration: number;
  /** Pixel width */
  width: number;
  /** Pixel height */
  height: number;
  /** Frames per second */
  fps: number;
}

// -----------------------------------------------------------------------------
// Union + type guards
// -----------------------------------------------------------------------------

/** Any generated asset variant */
export type GeneratedAsset = GeneratedImage | GeneratedAudio | GeneratedVideo;

/** Type guard: narrows `GeneratedAsset` to `GeneratedImage` */
export function isGeneratedImage(asset: GeneratedAsset): asset is GeneratedImage {
  return asset.type === 'generated-image';
}

/** Type guard: narrows `GeneratedAsset` to `GeneratedAudio` */
export function isGeneratedAudio(asset: GeneratedAsset): asset is GeneratedAudio {
  return asset.type === 'generated-audio';
}

/** Type guard: narrows `GeneratedAsset` to `GeneratedVideo` */
export function isGeneratedVideo(asset: GeneratedAsset): asset is GeneratedVideo {
  return asset.type === 'generated-video';
}

export type GeneratedImageWithoutPath = Omit<GeneratedImage, 'path'>;
export type GeneratedAudioWithoutPath = Omit<GeneratedAudio, 'path'>;
export type GeneratedVideoWithoutPath = Omit<GeneratedVideo, 'path'>;

export type GeneratedAssetWithoutPath<T extends BaseGeneratedAsset = GeneratedAsset> =
  T extends GeneratedImage
    ? Omit<T, 'path'>
    : T extends GeneratedAudio
      ? Omit<T, 'path'>
      : T extends GeneratedVideo
        ? Omit<T, 'path'>
        : Omit<T, 'path'>;

export type PathlessGeneratedAsset =
  GeneratedImageWithoutPath | GeneratedAudioWithoutPath | GeneratedVideoWithoutPath;

/**
 * Host-neutral generated asset projection for short-lived render surfaces.
 * `renderUri` is produced by the owning host adapter; persisted identity remains
 * the generated asset id, `assetRef`, and source metadata. Managed filesystem
 * paths stay in host/cache services and are intentionally not part of this DTO.
 */
export type RenderableGeneratedAsset<T extends BaseGeneratedAsset = GeneratedAsset> =
  GeneratedAssetWithoutPath<T> & {
    renderUri: string;
  };

/** Removes host paths before a generated asset crosses into a render projection. */
export function stripRenderableGeneratedAssetPath(
  asset: (GeneratedAsset & { readonly renderUri: string }) | RenderableGeneratedAsset,
): RenderableGeneratedAsset {
  if (!('path' in asset)) return asset;
  return {
    ...stripGeneratedAssetPath(asset),
    renderUri: asset.renderUri,
  };
}

export function stripGeneratedAssetPath(asset: GeneratedImage): GeneratedImageWithoutPath;
export function stripGeneratedAssetPath(asset: GeneratedAudio): GeneratedAudioWithoutPath;
export function stripGeneratedAssetPath(asset: GeneratedVideo): GeneratedVideoWithoutPath;
export function stripGeneratedAssetPath(asset: GeneratedAsset): PathlessGeneratedAsset;
export function stripGeneratedAssetPath(asset: GeneratedAsset): PathlessGeneratedAsset {
  switch (asset.type) {
    case 'generated-image': {
      const { path: _path, ...assetWithoutPath } = asset;
      return assetWithoutPath;
    }
    case 'generated-audio': {
      const { path: _path, ...assetWithoutPath } = asset;
      return assetWithoutPath;
    }
    case 'generated-video': {
      const { path: _path, ...assetWithoutPath } = asset;
      return assetWithoutPath;
    }
  }
}

export function isPublicGeneratedAssetResultUri(value: string): boolean {
  if (value.length === 0) return false;
  const normalized = value.replace(/\\/g, '/');
  if (normalized.split('/').some((segment) => segment.startsWith('.'))) return false;
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false;
  if (/^file:/i.test(value)) return false;
  return true;
}

// -----------------------------------------------------------------------------
// Durable generated asset roots
// -----------------------------------------------------------------------------

export type GeneratedAssetMediaKind = 'image' | 'audio' | 'video' | 'file';

export interface ResolveGeneratedAssetMediaKindInput {
  readonly mediaKind?: string;
  readonly mimeType?: string;
}

export const WORKSPACE_GENERATED_ASSET_ROOT = 'neko/generated';

/** Standard durable generated asset sub-directory names under `neko/generated/`. */
export const GENERATED_ASSET_DIRS = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'file',
} as const;

export function resolveGeneratedAssetMediaKind(
  input: ResolveGeneratedAssetMediaKindInput,
): GeneratedAssetMediaKind {
  if (input.mediaKind) {
    const sanitized = sanitizeGeneratedAssetPathSegment(input.mediaKind);
    if (isGeneratedAssetMediaKind(sanitized)) return sanitized;
  }
  if (input.mimeType?.startsWith('image/')) return 'image';
  if (input.mimeType?.startsWith('audio/')) return 'audio';
  if (input.mimeType?.startsWith('video/')) return 'video';
  return 'file';
}

export function resolveWorkspaceGeneratedAssetRelativeDirectory(
  input: ResolveGeneratedAssetMediaKindInput,
): string {
  return `${WORKSPACE_GENERATED_ASSET_ROOT}/${resolveGeneratedAssetMediaKind(input)}`;
}

export function sanitizeGeneratedAssetPathSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'file';
}

function isGeneratedAssetMediaKind(value: string): value is GeneratedAssetMediaKind {
  return Object.prototype.hasOwnProperty.call(GENERATED_ASSET_DIRS, value);
}
