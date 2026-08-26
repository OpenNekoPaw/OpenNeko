import type { CanonicalCanvasNodeType } from './types/canvas';
import type { CanvasGenerationKind } from './types/canvas-generation-node';
import { resolveCanvasTextFilePreviewKind } from './canvas-text-file-preview';

export interface CanvasNodeSize {
  readonly width: number;
  readonly height: number;
}

export interface CanvasImageDimensions {
  readonly width: number;
  readonly height: number;
}

/** Canonical authoring sizes for newly created Canvas nodes. Persisted creator sizes stay authoritative. */
export const CANVAS_NODE_DEFAULT_SIZES = {
  markdown: { width: 240, height: 160 },
  media: { width: 120, height: 90 },
  group: { width: 160, height: 110 },
  job: { width: 120, height: 75 },
  file: { width: 110, height: 75 },
  'canvas-embed': { width: 120, height: 80 },
  generation: { width: 120, height: 90 },
} as const satisfies Readonly<Record<CanonicalCanvasNodeType, CanvasNodeSize>>;

export const CANVAS_TEXT_REFERENCE_NODE_DEFAULT_SIZE = CANVAS_NODE_DEFAULT_SIZES.markdown;

export const CANVAS_AUDIO_NODE_DEFAULT_SIZE = {
  width: 240,
  height: 100,
} as const satisfies CanvasNodeSize;

export const CANVAS_AUDIO_NODE_MIN_SIZE = {
  width: 180,
  height: 90,
} as const satisfies CanvasNodeSize;

/** Maximum Canvas-unit extent for a newly authored image node. */
export const CANVAS_IMAGE_NODE_MAX_SIZE = 120;
/** Minimum long edge used by image resize gestures without changing its aspect ratio. */
export const CANVAS_IMAGE_NODE_MIN_LONG_EDGE = 50;

export const CANVAS_GENERATION_NODE_DEFAULT_SIZES = {
  prompt: { width: 120, height: 80 },
  image: CANVAS_NODE_DEFAULT_SIZES.generation,
  audio: CANVAS_AUDIO_NODE_DEFAULT_SIZE,
  video: CANVAS_NODE_DEFAULT_SIZES.generation,
} as const satisfies Readonly<Record<CanvasGenerationKind, CanvasNodeSize>>;

export const CANVAS_DEFAULT_NODE_MIN_SIZE = {
  width: 80,
  height: 50,
} as const satisfies CanvasNodeSize;

export const CANVAS_DEFAULT_CONTAINER_MIN_SIZE = {
  width: 110,
  height: 75,
} as const satisfies CanvasNodeSize;

export const CANVAS_NODE_MIN_SIZES = {
  markdown: CANVAS_DEFAULT_NODE_MIN_SIZE,
  media: CANVAS_DEFAULT_NODE_MIN_SIZE,
  group: CANVAS_DEFAULT_CONTAINER_MIN_SIZE,
  generation: { width: 90, height: 50 },
  job: { width: 100, height: 60 },
  file: { width: 80, height: 60 },
  'canvas-embed': { width: 90, height: 60 },
} as const satisfies Readonly<Record<CanonicalCanvasNodeType, CanvasNodeSize>>;

export function resolveCanvasNodeDefaultSize(type: CanonicalCanvasNodeType): CanvasNodeSize {
  return { ...CANVAS_NODE_DEFAULT_SIZES[type] };
}

export function resolveCanvasFileNodeDefaultSize(input: {
  readonly path: string;
  readonly mediaType?: string;
}): CanvasNodeSize {
  return resolveCanvasTextFilePreviewKind(input)
    ? { ...CANVAS_TEXT_REFERENCE_NODE_DEFAULT_SIZE }
    : resolveCanvasNodeDefaultSize('file');
}

export function resolveCanvasGenerationNodeDefaultSize(kind: CanvasGenerationKind): CanvasNodeSize {
  return { ...CANVAS_GENERATION_NODE_DEFAULT_SIZES[kind] };
}

export function resolveCanvasImageNodeSize(dimensions: unknown): CanvasNodeSize | undefined {
  const intrinsic = readImageDimensions(dimensions);
  if (!intrinsic) return undefined;
  const scale = CANVAS_IMAGE_NODE_MAX_SIZE / Math.max(intrinsic.width, intrinsic.height);
  return {
    width: intrinsic.width * scale,
    height: intrinsic.height * scale,
  };
}

export function readCanvasImageDimensions(value: unknown): CanvasImageDimensions | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const input = value as { readonly width?: unknown; readonly height?: unknown };
  return isPositiveFiniteAxis(input.width) && isPositiveFiniteAxis(input.height)
    ? { width: input.width, height: input.height }
    : undefined;
}

export function resolveCanvasImageNodeMinSize(size: CanvasNodeSize): CanvasNodeSize {
  if (!isPositiveFiniteAxis(size.width) || !isPositiveFiniteAxis(size.height)) {
    return { ...CANVAS_DEFAULT_NODE_MIN_SIZE };
  }
  const scale = Math.min(1, CANVAS_IMAGE_NODE_MIN_LONG_EDGE / Math.max(size.width, size.height));
  return {
    width: size.width * scale,
    height: size.height * scale,
  };
}

function isPositiveFiniteAxis(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readImageDimensions(input: unknown): CanvasImageDimensions | undefined {
  const dimensions = readCanvasImageDimensions(input);
  if (dimensions) return dimensions;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const aspectRatio = (input as { readonly aspectRatio?: unknown }).aspectRatio;
  const match =
    typeof aspectRatio === 'string'
      ? aspectRatio.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/)
      : null;
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return isPositiveFiniteAxis(width) && isPositiveFiniteAxis(height)
    ? { width, height }
    : undefined;
}
