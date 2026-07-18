/**
 * Engine-first preview contracts shared by Extension Host, Webview-facing code,
 * and engine clients.
 *
 * Keep this file platform-neutral: no DOM, React, or VSCode types.
 */

export type PreviewAssetKind = 'image' | 'video' | 'audio' | 'document' | 'unknown';

export type PreviewManifestStatus = 'ready' | 'requires-proxy' | 'stream-required' | 'unsupported';

export type PreviewProjectionType =
  'flat' | 'equirectangular' | 'cylindrical' | 'cubemap' | 'fisheye' | 'unknown';

export type PreviewProjectionConfidence =
  'explicit' | 'manual' | 'trusted-filename' | 'heuristic' | 'none';

export type PreviewDynamicRange = 'sdr' | 'hdr' | 'unknown';

export type PreviewToneMapping = 'none' | 'aces' | 'reinhard' | 'filmic';

export type PanoramaViewMode = 'sphere' | 'flat' | 'little-planet' | 'cylindrical';

export type PreviewVariantRole =
  'source' | 'proxy' | 'thumbnail' | 'fov-crop' | 'tile' | 'stream' | 'screenshot' | 'unsupported';

export interface PreviewDimensions {
  readonly width: number;
  readonly height: number;
}

export interface PanoramaCoverageAngle {
  readonly horizontalDeg: number;
  readonly verticalDeg: number;
}

export interface PreviewProjectionMetadata {
  readonly type: PreviewProjectionType;
  readonly confidence: PreviewProjectionConfidence;
  readonly source: 'metadata' | 'filename' | 'aspect-ratio' | 'extension' | 'manual' | 'unknown';
  readonly requiresConfirmation?: boolean;
  readonly croppedAreaPixels?: PreviewDimensions;
  readonly fullPanoPixels?: PreviewDimensions;
  readonly coverageAngle?: PanoramaCoverageAngle;
}

export interface PreviewCodecMetadata {
  readonly container?: string;
  readonly imageFormat?: string;
  readonly videoCodec?: string;
  readonly audioCodec?: string;
  readonly pixelFormat?: string;
  readonly colorSpace?: string;
  readonly durationSecs?: number;
  readonly fps?: number;
  readonly hasAudio?: boolean;
}

export interface PreviewMediaMetadata {
  readonly dimensions?: PreviewDimensions;
  readonly fileSizeBytes: number;
  readonly mimeType: string;
  readonly dynamicRange: PreviewDynamicRange;
  readonly bitDepth?: number;
  readonly codec?: PreviewCodecMetadata;
}

export interface PreviewErrorState {
  readonly code:
    | 'unsupported-format'
    | 'proxy-required'
    | 'probe-failed'
    | 'source-missing'
    | 'engine-unavailable'
    | 'unknown';
  readonly message: string;
  readonly recoverable: boolean;
}

export interface PreviewStreamDescriptor {
  readonly streamId: string;
  readonly wsUrl?: string;
  readonly audioStreamId?: string;
  readonly audioWsUrl?: string;
  readonly container: 'h264-annexb' | 'h264-avcc' | 'fmp4' | 'native' | 'unknown';
  readonly codecString?: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
}

export interface PreviewTileTemplate {
  readonly urlTemplate: string;
  readonly tileSize: number;
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly overlap?: number;
}

export interface PreviewVariant {
  readonly id: string;
  readonly assetId: string;
  readonly role: PreviewVariantRole;
  readonly url?: string;
  readonly token?: string;
  readonly mimeType?: string;
  readonly dimensions?: PreviewDimensions;
  readonly fileSizeBytes?: number;
  readonly tileTemplate?: PreviewTileTemplate;
  readonly stream?: PreviewStreamDescriptor;
  readonly viewState?: PanoramaViewState;
  readonly error?: PreviewErrorState;
}

export interface PanoramaViewState {
  readonly mode: PanoramaViewMode;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly fovDeg: number;
  readonly exposure: number;
  readonly toneMapping: PreviewToneMapping;
}

export interface PreviewManifest {
  readonly manifestVersion: 1;
  readonly assetId: string;
  readonly token: string;
  readonly kind: PreviewAssetKind;
  readonly status: PreviewManifestStatus;
  readonly sourceName: string;
  readonly sourceUrl?: string;
  readonly projection: PreviewProjectionMetadata;
  readonly media: PreviewMediaMetadata;
  readonly defaultViewState?: PanoramaViewState;
  readonly variants: readonly PreviewVariant[];
  readonly error?: PreviewErrorState;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface RegisterPreviewAssetRequest {
  readonly source: string;
  readonly kind?: PreviewAssetKind;
  readonly expectedProjection?: PreviewProjectionType;
  readonly explicitOpen?: boolean;
}

export interface UpdatePreviewAssetMetadataRequest {
  readonly projectionType?: PreviewProjectionType;
  readonly coverageAngle?: PanoramaCoverageAngle;
  readonly defaultViewState?: PanoramaViewState;
}

export interface PreviewVariantRequest {
  readonly role: PreviewVariantRole;
  readonly viewState?: PanoramaViewState;
  readonly projectionType?: PreviewProjectionType;
  readonly coverageAngle?: PanoramaCoverageAngle;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly format?: 'jpeg' | 'png' | 'webp';
}

export const DEFAULT_PANORAMA_VIEW_STATE: PanoramaViewState = {
  mode: 'sphere',
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  fovDeg: 75,
  exposure: 0,
  toneMapping: 'aces',
};

export const DEFAULT_PANORAMA_COVERAGE_ANGLE: PanoramaCoverageAngle = {
  horizontalDeg: 360,
  verticalDeg: 180,
};

export function normalizeCoverageAngle(
  raw?: Partial<PanoramaCoverageAngle> | null,
): PanoramaCoverageAngle {
  return {
    horizontalDeg: normalizeCoverageComponent(raw?.horizontalDeg, 360),
    verticalDeg: normalizeCoverageComponent(raw?.verticalDeg, 180),
  };
}

export function allowedPanoramaViewModesForProjection(
  projectionType: PreviewProjectionType,
): readonly PanoramaViewMode[] {
  switch (projectionType) {
    case 'equirectangular':
      return ['sphere', 'flat', 'little-planet'];
    case 'cylindrical':
      return ['cylindrical', 'flat'];
    case 'flat':
    case 'cubemap':
    case 'fisheye':
    case 'unknown':
      return ['flat'];
  }
}

export function defaultPanoramaViewModeForProjection(
  projectionType: PreviewProjectionType,
): PanoramaViewMode {
  switch (projectionType) {
    case 'equirectangular':
      return 'sphere';
    case 'cylindrical':
      return 'cylindrical';
    case 'flat':
    case 'cubemap':
    case 'fisheye':
    case 'unknown':
      return 'flat';
  }
}

export function normalizePanoramaViewModeForProjection(
  projectionType: PreviewProjectionType,
  mode: PanoramaViewMode,
): PanoramaViewMode {
  const allowedModes = allowedPanoramaViewModesForProjection(projectionType);
  return allowedModes.includes(mode) ? mode : defaultPanoramaViewModeForProjection(projectionType);
}

function normalizeCoverageComponent(value: unknown, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, max)
    : max;
}
