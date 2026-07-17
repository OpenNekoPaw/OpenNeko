/**
 * Platform-neutral panoramic preview routing contracts.
 *
 * Keep this file free of DOM, React, VSCode, and Node APIs. Extension hosts can
 * provide optional metadata text after reading a bounded file prefix.
 */

export const PANORAMIC_IMAGE_VIEW_TYPE = 'neko.preview.panoramicImage';
export const PANORAMIC_VIDEO_VIEW_TYPE = 'neko.preview.panoramicVideo';
export const OPEN_PANORAMIC_IMAGE_COMMAND = 'neko.preview.openPanoramicImage';
export const OPEN_PANORAMIC_VIDEO_COMMAND = 'neko.preview.openPanoramicVideo';

export type PanoramicPreviewKind = 'image' | 'video';
export type PanoramicPreviewRouteConfidence = 'explicit' | 'high';
export type PanoramicPreviewRouteSignal =
  | 'extension'
  | 'gpano-metadata'
  | 'trusted-filename'
  | 'manual';

export interface PanoramicPreviewRoute {
  readonly kind: PanoramicPreviewKind;
  readonly command: typeof OPEN_PANORAMIC_IMAGE_COMMAND | typeof OPEN_PANORAMIC_VIDEO_COMMAND;
  readonly viewType: typeof PANORAMIC_IMAGE_VIEW_TYPE | typeof PANORAMIC_VIDEO_VIEW_TYPE;
  readonly confidence: PanoramicPreviewRouteConfidence;
  readonly signal: PanoramicPreviewRouteSignal;
}

export interface PanoramicPreviewRouteInput {
  readonly filePath: string;
  readonly mediaType?: string;
  readonly explicitOpen?: boolean;
  readonly metadataText?: string;
}

export interface PanoramicPreviewDimensions {
  readonly width: number;
  readonly height: number;
}

const SUPPORTED_PANORAMIC_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'hdr', 'exr']);
const SUPPORTED_PANORAMIC_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm', 'm4v']);
const HDR_IMAGE_EXTENSIONS = new Set(['hdr', 'exr']);
const TRUSTED_FILENAME_HINT =
  /(^|[._-])(pano|360|halfpano|180pano|pano180|equirect|equirectangular)([._-]|$)/i;

export function getPanoramicPreviewRoute(
  input: PanoramicPreviewRouteInput,
): PanoramicPreviewRoute | null {
  const kind = inferPanoramicPreviewKind(input.filePath, input.mediaType);
  if (!kind) return null;

  if (kind === 'image') {
    return getPanoramicImageRoute(input.filePath, input.explicitOpen === true, input.metadataText);
  }

  return getPanoramicVideoRoute(input.filePath, input.explicitOpen === true);
}

export function isSupportedPanoramicPreviewPath(
  filePath: string,
  kind: PanoramicPreviewKind,
): boolean {
  const extension = getPanoramicFileExtension(filePath);
  if (!extension) return false;
  return kind === 'image'
    ? SUPPORTED_PANORAMIC_IMAGE_EXTENSIONS.has(extension)
    : SUPPORTED_PANORAMIC_VIDEO_EXTENSIONS.has(extension);
}

export function isHighConfidencePanoramicImagePath(
  filePath: string,
  metadataText?: string,
): boolean {
  return getPanoramicImageRoute(filePath, false, metadataText) !== null;
}

export function hasTrustedPanoramicFilenameHint(filePath: string): boolean {
  return TRUSTED_FILENAME_HINT.test(getBaseName(filePath));
}

export function containsGpanoEquirectangularMetadata(metadataText: string): boolean {
  const text = metadataText.toLowerCase();
  if (!text.includes('gpano')) return false;
  return (
    text.includes('equirectangular') ||
    text.includes('usepanoramaviewer="true"') ||
    text.includes('usepanoramaviewer>true') ||
    text.includes('fullpanowidthpixels') ||
    text.includes('croppedareaimagewidthpixels')
  );
}

export function isLowConfidencePanoramicAspectRatio(
  dimensions: PanoramicPreviewDimensions,
): boolean {
  if (dimensions.height <= 0) return false;
  const ratio = dimensions.width / dimensions.height;
  return Math.abs(ratio - 2) <= 0.01;
}

export function getPanoramicFileExtension(filePath: string): string | null {
  const baseName = getBaseName(filePath);
  const index = baseName.lastIndexOf('.');
  if (index < 0 || index === baseName.length - 1) return null;
  return baseName.slice(index + 1).toLowerCase();
}

function getPanoramicImageRoute(
  filePath: string,
  explicitOpen: boolean,
  metadataText?: string,
): PanoramicPreviewRoute | null {
  const extension = getPanoramicFileExtension(filePath);
  if (!extension || !SUPPORTED_PANORAMIC_IMAGE_EXTENSIONS.has(extension)) return null;

  if (explicitOpen) {
    return {
      kind: 'image',
      command: OPEN_PANORAMIC_IMAGE_COMMAND,
      viewType: PANORAMIC_IMAGE_VIEW_TYPE,
      confidence: 'explicit',
      signal: 'manual',
    };
  }

  if (HDR_IMAGE_EXTENSIONS.has(extension)) {
    return {
      kind: 'image',
      command: OPEN_PANORAMIC_IMAGE_COMMAND,
      viewType: PANORAMIC_IMAGE_VIEW_TYPE,
      confidence: 'high',
      signal: 'extension',
    };
  }

  if (metadataText && containsGpanoEquirectangularMetadata(metadataText)) {
    return {
      kind: 'image',
      command: OPEN_PANORAMIC_IMAGE_COMMAND,
      viewType: PANORAMIC_IMAGE_VIEW_TYPE,
      confidence: 'high',
      signal: 'gpano-metadata',
    };
  }

  if (hasTrustedPanoramicFilenameHint(filePath)) {
    return {
      kind: 'image',
      command: OPEN_PANORAMIC_IMAGE_COMMAND,
      viewType: PANORAMIC_IMAGE_VIEW_TYPE,
      confidence: 'high',
      signal: 'trusted-filename',
    };
  }

  return null;
}

function getPanoramicVideoRoute(
  filePath: string,
  explicitOpen: boolean,
): PanoramicPreviewRoute | null {
  const extension = getPanoramicFileExtension(filePath);
  if (!extension || !SUPPORTED_PANORAMIC_VIDEO_EXTENSIONS.has(extension)) return null;

  if (explicitOpen) {
    return {
      kind: 'video',
      command: OPEN_PANORAMIC_VIDEO_COMMAND,
      viewType: PANORAMIC_VIDEO_VIEW_TYPE,
      confidence: 'explicit',
      signal: 'manual',
    };
  }

  if (!hasTrustedPanoramicFilenameHint(filePath)) return null;

  return {
    kind: 'video',
    command: OPEN_PANORAMIC_VIDEO_COMMAND,
    viewType: PANORAMIC_VIDEO_VIEW_TYPE,
    confidence: 'high',
    signal: 'trusted-filename',
  };
}

function inferPanoramicPreviewKind(
  filePath: string,
  mediaType: string | undefined,
): PanoramicPreviewKind | null {
  if (mediaType === 'image' || mediaType === 'video') return mediaType;
  const extension = getPanoramicFileExtension(filePath);
  if (!extension) return null;
  if (SUPPORTED_PANORAMIC_IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (SUPPORTED_PANORAMIC_VIDEO_EXTENSIONS.has(extension)) return 'video';
  return null;
}

function getBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}
