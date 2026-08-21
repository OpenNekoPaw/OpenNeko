import type { CanonicalCanvasNodeType } from './types/canvas';
import type { CanvasGenerationKind } from './types/canvas-generation-node';

export interface CanvasNodeSize {
  readonly width: number;
  readonly height: number;
}

/** Canonical authoring sizes for newly created Canvas nodes. Persisted creator sizes stay authoritative. */
export const CANVAS_NODE_DEFAULT_SIZES = {
  markdown: { width: 120, height: 80 },
  media: { width: 120, height: 90 },
  group: { width: 160, height: 110 },
  job: { width: 120, height: 75 },
  file: { width: 110, height: 75 },
  'canvas-embed': { width: 120, height: 80 },
  generation: { width: 120, height: 90 },
} as const satisfies Readonly<Record<CanonicalCanvasNodeType, CanvasNodeSize>>;

export const CANVAS_AUDIO_NODE_DEFAULT_SIZE = {
  width: CANVAS_NODE_DEFAULT_SIZES.media.width,
  height: 60,
} as const satisfies CanvasNodeSize;

export const CANVAS_IMAGE_PROJECTION_DEFAULT_WIDTH = 104;
export const CANVAS_IMAGE_PROJECTION_MIN_HEIGHT = 52;

export const CANVAS_GENERATION_NODE_DEFAULT_SIZES = {
  prompt: { width: 120, height: 80 },
  image: CANVAS_NODE_DEFAULT_SIZES.generation,
  audio: { width: 120, height: 60 },
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

export function resolveCanvasGenerationNodeDefaultSize(kind: CanvasGenerationKind): CanvasNodeSize {
  return { ...CANVAS_GENERATION_NODE_DEFAULT_SIZES[kind] };
}
