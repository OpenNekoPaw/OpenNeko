/**
 * Media Processing Protocol - Compatible Mode Types
 *
 * Compatible mode rendering protocol for Extension-side rendering.
 */

// =============================================================================
// Compatible Mode Rendering Protocol (Extension-side rendering for preview)
// =============================================================================

/**
 * Base media request type (for compatible mode requests)
 */
interface BaseMediaRequest {
  /** Request ID for matching response */
  requestId: string;
  /** Request timestamp */
  timestamp: number;
}

/**
 * Composite layer configuration for Extension-side rendering
 */
export interface CompositeLayerConfig {
  /** Source element ID (for transition matching) */
  elementId?: string;
  /** Video/image file path */
  source: string;
  /** Source media time point (seconds) */
  sourceTime: number;
  /** Transform settings */
  transform: {
    /** X position (pixels) */
    x: number;
    /** Y position (pixels) */
    y: number;
    /** X scale factor (1.0 = original) */
    scaleX: number;
    /** Y scale factor (1.0 = original) */
    scaleY: number;
    /** Rotation in degrees */
    rotation: number;
    /** Anchor X (0-1, default 0.5 = center) */
    anchorX: number;
    /** Anchor Y (0-1, default 0.5 = center) */
    anchorY: number;
  };
  /** Opacity (0-1) */
  opacity: number;
  /** Z-index for ordering (higher = on top) */
  zIndex: number;
  /** Applied effects (evaluated at current time) */
  effects?: CompositeEffect[];
  /** Applied masks (geometry for GPU rasterization) */
  masks?: CompositeMask[];
  /** Transition to/from paired layer */
  transition?: CompositeTransition;
  /** Blend mode for compositing (e.g. 'normal', 'multiply', 'screen') */
  blendMode?: string;
}

// =============================================================================
// Composite Effect (evaluated parameters at a specific time)
// =============================================================================

/** Effect with pre-evaluated parameters for composite rendering */
export interface CompositeEffect {
  /** Effect type identifier (e.g., 'gaussian-blur', 'chromatic-aberration') */
  type: string;
  /** Evaluated parameters at current time (static + animated) */
  parameters: Record<string, number | string | boolean>;
  /** Application order (lower = applied first) */
  order: number;
}

// =============================================================================
// Composite Mask (geometry for Rust GPU rasterization)
// =============================================================================

/** Mask with geometry data for GPU SDF rasterization */
export interface CompositeMask {
  /** Mask shape geometry */
  shape: CompositeMaskShape;
  /** Whether mask is inverted */
  inverted: boolean;
  /** Feather amount (0-100) */
  feather: number;
  /** Expansion amount (-100 to 100) */
  expansion: number;
  /** Opacity (0-100) */
  opacity: number;
  /** Blend mode for multiple masks */
  blendMode: 'add' | 'subtract' | 'intersect' | 'difference';
}

/** Rectangle mask shape (SDF: sdBox) */
export interface RectMaskShape {
  type: 'rectangle';
  /** Center X (0-100%) */
  centerX: number;
  /** Center Y (0-100%) */
  centerY: number;
  /** Width (0-100%) */
  width: number;
  /** Height (0-100%) */
  height: number;
  /** Rotation in degrees */
  rotation: number;
  /** Corner radius (0-100%) */
  cornerRadius: number;
}

/** Ellipse mask shape (SDF: sdEllipse) */
export interface EllipseMaskShape {
  type: 'ellipse';
  /** Center X (0-100%) */
  centerX: number;
  /** Center Y (0-100%) */
  centerY: number;
  /** Width (0-100%) */
  width: number;
  /** Height (0-100%) */
  height: number;
  /** Rotation in degrees */
  rotation: number;
}

/** Polygon mask shape (SDF: sdPolygon) */
export interface PolygonMaskShape {
  type: 'polygon';
  /** Polygon vertices as [x, y] pairs (0-100% coordinates) */
  points: Array<{ x: number; y: number }>;
}

/** Bezier mask shape (tessellated to polygon for SDF) */
export interface BezierMaskShape {
  type: 'bezier';
  /** Bezier control points */
  controlPoints: Array<{
    position: { x: number; y: number };
    handleIn?: { x: number; y: number };
    handleOut?: { x: number; y: number };
  }>;
  /** Whether the path is closed */
  closed: boolean;
}

/** Union of all mask shape types */
export type CompositeMaskShape =
  RectMaskShape | EllipseMaskShape | PolygonMaskShape | BezierMaskShape;

// =============================================================================
// Composite Transition (for paired layers)
// =============================================================================

/** Transition between two composite layers */
export interface CompositeTransition {
  /** Transition type (engine-supported, e.g., 'fade', 'wipe-left') */
  type: string;
  /** Transition progress (0.0 = start, 1.0 = end) */
  progress: number;
  /** Index of paired layer in the layers array */
  pairedLayerIndex: number;
  /** Easing type */
  easing: string;
}

/**
 * Render composite frame request (Compatible mode)
 * Extension端使用 FFmpeg + wgpu 合成多层并返回渲染结果
 */
export interface RenderCompositeFrameRequest extends BaseMediaRequest {
  type: 'media:renderCompositeFrame';
  payload: {
    /** Layers to composite (ordered by zIndex) */
    layers: CompositeLayerConfig[];
    /** Timeline time point (seconds) */
    time: number;
    /** Output width in pixels */
    width: number;
    /** Output height in pixels */
    height: number;
    /** Background color RGBA (0-255) */
    backgroundColor?: [number, number, number, number];
  };
}

/**
 * Render composite frame response
 */
export interface RenderCompositeFrameResponse {
  requestId: string;
  type: 'media:response:renderCompositeFrame';
  error?: string;
  payload?: {
    /** Binary JPEG data (preferred, more efficient) */
    imageData?: Uint8Array;
    /** Rendered image as a data URL transport alternative */
    imageDataUrl?: string;
    /** Image width */
    width: number;
    /** Image height */
    height: number;
  };
}

/**
 * Get single video frame request (Compatible mode)
 * For compatible mode preview - Extension端解码单帧
 */
export interface CompatibleGetVideoFrameRequest extends BaseMediaRequest {
  type: 'media:compatibleGetVideoFrame';
  payload: {
    /** Video file path */
    videoPath: string;
    /** Time point (seconds) */
    timeInSeconds: number;
    /** Output width (optional, use original if not specified) */
    width?: number;
    /** Output height (optional, use original if not specified) */
    height?: number;
  };
}

/**
 * Get single video frame response (Compatible mode)
 */
export interface CompatibleGetVideoFrameResponse {
  requestId: string;
  type: 'media:response:compatibleGetVideoFrame';
  error?: string;
  payload?: {
    /** Frame image as binary JPEG data (preferred, more efficient) */
    imageData?: Uint8Array;
    /** Frame image as a data URL transport alternative */
    imageDataUrl?: string;
    /** Frame width */
    width: number;
    /** Frame height */
    height: number;
  };
}

/**
 * All compatible mode request types
 */
export type CompatibleModeRequest = RenderCompositeFrameRequest | CompatibleGetVideoFrameRequest;

/**
 * All compatible mode response types
 */
export type CompatibleModeResponse = RenderCompositeFrameResponse | CompatibleGetVideoFrameResponse;
