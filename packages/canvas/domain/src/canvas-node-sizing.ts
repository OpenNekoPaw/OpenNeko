import type { CanonicalCanvasNodeType } from './types/canvas';
import type { CanvasGenerationKind } from './types/canvas-generation-node';

export interface CanvasNodeSize {
  readonly width: number;
  readonly height: number;
}

/** Canonical authoring sizes for newly created Canvas nodes. Persisted creator sizes stay authoritative. */
export const CANVAS_NODE_DEFAULT_SIZES = {
  markdown: { width: 240, height: 160 },
  media: { width: 240, height: 180 },
  group: { width: 320, height: 220 },
  job: { width: 240, height: 150 },
  file: { width: 220, height: 150 },
  'canvas-embed': { width: 240, height: 160 },
  generation: { width: 240, height: 180 },
} as const satisfies Readonly<Record<CanonicalCanvasNodeType, CanvasNodeSize>>;

export const CANVAS_AUDIO_NODE_DEFAULT_SIZE = {
  width: CANVAS_NODE_DEFAULT_SIZES.media.width,
  height: 120,
} as const satisfies CanvasNodeSize;

export const CANVAS_IMAGE_PROJECTION_DEFAULT_WIDTH = 208;
export const CANVAS_IMAGE_PROJECTION_MIN_HEIGHT = 104;

export const CANVAS_GENERATION_NODE_DEFAULT_SIZES = {
  prompt: { width: 240, height: 160 },
  image: CANVAS_NODE_DEFAULT_SIZES.generation,
  audio: { width: 240, height: 120 },
  video: CANVAS_NODE_DEFAULT_SIZES.generation,
} as const satisfies Readonly<Record<CanvasGenerationKind, CanvasNodeSize>>;

export const CANVAS_DEFAULT_NODE_MIN_SIZE = {
  width: 160,
  height: 100,
} as const satisfies CanvasNodeSize;

export const CANVAS_DEFAULT_CONTAINER_MIN_SIZE = {
  width: 220,
  height: 150,
} as const satisfies CanvasNodeSize;

export const CANVAS_NODE_MIN_SIZES = {
  markdown: CANVAS_DEFAULT_NODE_MIN_SIZE,
  media: CANVAS_DEFAULT_NODE_MIN_SIZE,
  group: CANVAS_DEFAULT_CONTAINER_MIN_SIZE,
  generation: { width: 180, height: 100 },
  job: { width: 200, height: 120 },
  file: { width: 160, height: 120 },
  'canvas-embed': { width: 180, height: 120 },
} as const satisfies Readonly<Record<CanonicalCanvasNodeType, CanvasNodeSize>>;

export function resolveCanvasNodeDefaultSize(type: CanonicalCanvasNodeType): CanvasNodeSize {
  return { ...CANVAS_NODE_DEFAULT_SIZES[type] };
}

export function resolveCanvasGenerationNodeDefaultSize(kind: CanvasGenerationKind): CanvasNodeSize {
  return { ...CANVAS_GENERATION_NODE_DEFAULT_SIZES[kind] };
}
