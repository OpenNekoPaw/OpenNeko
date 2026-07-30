import { getMimeType } from '@neko/shared';

export type VisionMediaKind = 'image' | 'video';

export interface VisionImageMetadata {
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

export interface VisionImagePreprocessPlan {
  readonly outputMediaType: 'image/jpeg';
  readonly jpegQuality: number;
  readonly shouldResize: boolean;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export interface VisionVideoSegment {
  readonly in: number;
  readonly out: number;
}

export interface VisionVideoSampleRange {
  readonly rangeIn: number;
  readonly rangeOut: number;
}

export interface VisionVideoFrameSize {
  readonly width?: number;
  readonly height?: number;
}

export interface VisionPreprocessPolicy {
  readonly maxLongEdge: number;
  readonly maxBytes: number;
  readonly resizedImageQuality: number;
  readonly normalizedImageQuality: number;
  readonly defaultVideoSampleFrames: number;
  readonly maxVideoKeyframes: number;
  readonly videoEdgeSkipRatio: number;
}

export const VISION_IMAGE_OUTPUT_MEDIA_TYPE = 'image/jpeg' as const;

export const DEFAULT_VISION_PREPROCESS_POLICY: VisionPreprocessPolicy = {
  maxLongEdge: 1568,
  maxBytes: 4 * 1024 * 1024,
  resizedImageQuality: 85,
  normalizedImageQuality: 90,
  defaultVideoSampleFrames: 4,
  maxVideoKeyframes: 8,
  videoEdgeSkipRatio: 0.05,
};

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/webm',
  'video/x-m4v',
  'video/mpeg',
]);

export function isVisionImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime);
}

export function isVisionVideoMime(mime: string): boolean {
  return VIDEO_MIMES.has(mime);
}

export function getVisionMediaKindFromMime(mime: string): VisionMediaKind | undefined {
  if (isVisionImageMime(mime)) {
    return 'image';
  }
  if (isVisionVideoMime(mime)) {
    return 'video';
  }
  return undefined;
}

export function getVisionMediaKindFromPath(filePath: string): VisionMediaKind | undefined {
  return getVisionMediaKindFromMime(getMimeType(filePath));
}

export function resolveVisionImageAttachmentMediaType(filePath: string): string {
  const mime = getMimeType(filePath);
  return mime === 'application/octet-stream' ? 'image/png' : mime;
}

export function planVisionImagePreprocess(
  metadata: VisionImageMetadata,
  policy: VisionPreprocessPolicy = DEFAULT_VISION_PREPROCESS_POLICY,
): VisionImagePreprocessPlan {
  const longEdge = Math.max(metadata.width, metadata.height);
  const shouldResize = longEdge > policy.maxLongEdge || metadata.byteLength > policy.maxBytes;
  return {
    outputMediaType: VISION_IMAGE_OUTPUT_MEDIA_TYPE,
    jpegQuality: shouldResize ? policy.resizedImageQuality : policy.normalizedImageQuality,
    shouldResize,
    ...(shouldResize
      ? {
          maxWidth: policy.maxLongEdge,
          maxHeight: policy.maxLongEdge,
        }
      : {}),
  };
}

export function getDefaultVisionVideoMaxFrames(
  policy: VisionPreprocessPolicy = DEFAULT_VISION_PREPROCESS_POLICY,
): number {
  return policy.defaultVideoSampleFrames;
}

export function calculateVisionVideoSampleRange(
  duration: number,
  segment?: VisionVideoSegment,
  policy: VisionPreprocessPolicy = DEFAULT_VISION_PREPROCESS_POLICY,
): VisionVideoSampleRange {
  return {
    rangeIn: segment?.in ?? duration * policy.videoEdgeSkipRatio,
    rangeOut: segment?.out ?? duration * (1 - policy.videoEdgeSkipRatio),
  };
}

export function selectVisionVideoSampleTimestamps(input: {
  readonly keyframes?: readonly number[];
  readonly rangeIn: number;
  readonly rangeOut: number;
  readonly maxFrames: number;
}): number[] {
  if (input.maxFrames <= 0) {
    return [];
  }

  const keyframes = input.keyframes ?? [];
  const inRange = keyframes.filter((time) => time >= input.rangeIn && time <= input.rangeOut);

  if (inRange.length > 0) {
    if (inRange.length <= input.maxFrames) {
      return [...inRange];
    }
    const step = Math.ceil(inRange.length / input.maxFrames);
    return inRange.filter((_, index) => index % step === 0).slice(0, input.maxFrames);
  }

  return uniformVisionVideoSample(input.rangeIn, input.rangeOut, input.maxFrames);
}

export function uniformVisionVideoSample(
  rangeIn: number,
  rangeOut: number,
  count: number,
): number[] {
  const rangeLen = rangeOut - rangeIn;
  if (rangeLen <= 0 || count <= 0) {
    return [];
  }
  if (count === 1) {
    return [rangeIn + rangeLen / 2];
  }
  const step = rangeLen / (count - 1);
  return Array.from({ length: count }, (_, index) => rangeIn + index * step);
}

export function calculateVisionVideoFrameSize(
  width: number,
  height: number,
  policy: VisionPreprocessPolicy = DEFAULT_VISION_PREPROCESS_POLICY,
): VisionVideoFrameSize {
  const longEdge = Math.max(width, height);
  if (longEdge <= policy.maxLongEdge) {
    return {};
  }
  if (width >= height) {
    return { width: policy.maxLongEdge };
  }
  return { height: policy.maxLongEdge };
}
