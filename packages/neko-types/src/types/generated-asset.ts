// =============================================================================
// Generated Asset Types — Cross-plugin asset reference schema (ADR-4)
//
// Binary data is stored by host/cache services. Cross-layer payloads should use
// stable refs such as `assetRef`; host adapters project paths into render URIs.
// =============================================================================

import type { ShotScale, CameraMovement } from './canvas';

/**
 * Discriminator for generated asset types.
 */
export type GeneratedAssetType =
  'generated-image' | 'generated-audio' | 'generated-video' | 'generated-storyboard';

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
  assetRef?: import('./perception-card').PerceptualAssetRef;
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
  /** Stable creative entity bindings inherited from the source context */
  characterIds?: readonly string[];
  /** Source canvas node or upstream node identifier for lineage tracing */
  sourceNodeId?: string;
  /** Source dialogue/voice cue identifier for generated audio or lip-sync lineage. */
  sourceCueId?: string;
  /** Speaker creative entity identifier for generated dialogue audio lineage. */
  speakerEntityId?: string;
  /** Voice representation or voice asset used by generated dialogue audio. */
  voiceAssetId?: string;
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
  /** Optional storyboard metadata linking image to a shot */
  shotMeta?: {
    sceneIndex: number;
    shotIndex: number;
    shotScale?: ShotScale;
    cameraMovement?: CameraMovement;
  };
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
// Storyboard (composite — references multiple GeneratedImage items)
// -----------------------------------------------------------------------------

/** A single scene within a storyboard */
export interface GeneratedStoryboardScene {
  sceneIndex: number;
  /** Scene heading text (e.g. 'INT. CAFE - DAY') */
  heading: string;
  /** Ordered shot images belonging to this scene */
  shots: GeneratedImage[];
}

export interface GeneratedStoryboard extends BaseGeneratedAsset {
  type: 'generated-storyboard';
  /** Scenes with their constituent shots */
  scenes: GeneratedStoryboardScene[];
}

// -----------------------------------------------------------------------------
// Union + type guards
// -----------------------------------------------------------------------------

/** Any generated asset variant */
export type GeneratedAsset = GeneratedImage | GeneratedAudio | GeneratedVideo | GeneratedStoryboard;

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

/** Type guard: narrows `GeneratedAsset` to `GeneratedStoryboard` */
export function isGeneratedStoryboard(asset: GeneratedAsset): asset is GeneratedStoryboard {
  return asset.type === 'generated-storyboard';
}

// -----------------------------------------------------------------------------
// Webview-safe variant (with pre-computed webviewUri)
// -----------------------------------------------------------------------------

/**
 * A GeneratedAsset augmented with a webview-safe URI.
 * Created by the extension host via `toWebviewAsset()` before sending to webview.
 */
export type WebviewGeneratedAsset<T extends BaseGeneratedAsset = GeneratedAsset> = T & {
  /** `vscode-resource://` URI safe for use in `<img>`, `<video>`, `<audio>` src */
  webviewUri: string;
};

export type GeneratedImageWithoutPath = Omit<GeneratedImage, 'path'>;
export type GeneratedAudioWithoutPath = Omit<GeneratedAudio, 'path'>;
export type GeneratedVideoWithoutPath = Omit<GeneratedVideo, 'path'>;

export interface GeneratedStoryboardSceneWithoutPath extends Omit<
  GeneratedStoryboardScene,
  'shots'
> {
  shots: GeneratedImageWithoutPath[];
}

export interface GeneratedStoryboardWithoutPath extends Omit<
  GeneratedStoryboard,
  'path' | 'scenes'
> {
  scenes: GeneratedStoryboardSceneWithoutPath[];
}

export type GeneratedAssetWithoutPath<T extends BaseGeneratedAsset = GeneratedAsset> =
  T extends GeneratedStoryboard
    ? GeneratedStoryboardWithoutPath
    : T extends GeneratedImage
      ? Omit<T, 'path'>
      : T extends GeneratedAudio
        ? Omit<T, 'path'>
        : T extends GeneratedVideo
          ? Omit<T, 'path'>
          : Omit<T, 'path'>;

export type PathlessGeneratedAsset =
  | GeneratedImageWithoutPath
  | GeneratedAudioWithoutPath
  | GeneratedVideoWithoutPath
  | GeneratedStoryboardWithoutPath;

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
export function stripGeneratedAssetPath(asset: GeneratedStoryboard): GeneratedStoryboardWithoutPath;
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
    case 'generated-storyboard': {
      const { path: _path, scenes, ...assetWithoutPath } = asset;
      return {
        ...assetWithoutPath,
        scenes: scenes.map((scene) => ({
          ...scene,
          shots: scene.shots.map((shot) => {
            const { path: _shotPath, ...shotWithoutPath } = shot;
            return shotWithoutPath;
          }),
        })),
      };
    }
  }
}

export function isPublicGeneratedAssetResultUri(value: string): boolean {
  if (value.length === 0) return false;
  const normalized = value.replace(/\\/g, '/');
  if (normalized.includes('/.neko/.cache/')) return false;
  if (normalized.startsWith('.neko/.cache/')) return false;
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false;
  if (/^file:/i.test(value)) return false;
  return true;
}

// -----------------------------------------------------------------------------
// Durable generated asset roots
// -----------------------------------------------------------------------------

export type GeneratedAssetMediaKind = 'image' | 'audio' | 'video' | 'storyboard' | 'file';

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
  storyboard: 'storyboard',
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
  if (input.mimeType === 'application/vnd.neko.storyboard+json') return 'storyboard';
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
