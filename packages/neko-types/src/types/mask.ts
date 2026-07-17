/**
 * Shared mask operation primitives.
 *
 * This host-agnostic contract is used by @neko/shared operations. Feature
 * Webviews own rendering and editor helpers on top of this shape.
 */
// =============================================================================
// Masks
// =============================================================================

import { Point2D, BezierPoint } from './geometry';

/** Mask blend mode */
export type MaskBlendMode = 'add' | 'subtract' | 'intersect' | 'difference';

/** Mask shape type */
export type MaskShapeType = 'rectangle' | 'ellipse' | 'polygon' | 'bezier';

/** Base mask shape */
interface BaseMaskShape {
  type: MaskShapeType;
}

/** Rectangle mask shape */
export interface RectangleMask extends BaseMaskShape {
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

/** Ellipse mask shape */
export interface EllipseMask extends BaseMaskShape {
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

/** Polygon mask shape */
export interface PolygonMask extends BaseMaskShape {
  type: 'polygon';
  /** Polygon vertices (0-100% coordinates) */
  points: Point2D[];
}

/** Bezier mask shape */
export interface BezierMask extends BaseMaskShape {
  type: 'bezier';
  /** Bezier control points */
  points: BezierPoint[];
  /** Whether the path is closed */
  closed: boolean;
}

export type MaskShape = RectangleMask | EllipseMask | PolygonMask | BezierMask;

// -----------------------------------------------------------------------------
// Mask Animation (蒙版动画)
// -----------------------------------------------------------------------------

/** Easing type for mask keyframes */
export type MaskEasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** Mask shape keyframe (for animating mask shape) */
export interface MaskShapeKeyframe {
  /** Unique identifier */
  id: string;
  /** Time offset relative to element startTime (seconds) */
  time: number;
  /** Shape state at this keyframe */
  shape: MaskShape;
  /** Easing function to next keyframe */
  easing: MaskEasingType;
}

/** Mask property keyframe */
export interface MaskPropertyKeyframe {
  /** Unique identifier */
  id: string;
  /** Time offset relative to element startTime (seconds) */
  time: number;
  /** Property value at this keyframe */
  value: number;
  /** Easing function to next keyframe */
  easing: MaskEasingType;
}

/** Animatable mask property with keyframes */
export interface AnimatableMaskProperty {
  /** Base value when no keyframes exist */
  baseValue: number;
  /** Keyframes sorted by time */
  keyframes: MaskPropertyKeyframe[];
}

/** Mask animation data */
export interface MaskAnimationData {
  /** Shape keyframes (for animating the entire shape) */
  shapeKeyframes?: MaskShapeKeyframe[];
  /** Feather animation */
  feather?: AnimatableMaskProperty;
  /** Expansion animation */
  expansion?: AnimatableMaskProperty;
  /** Opacity animation */
  opacity?: AnimatableMaskProperty;
}

/** Mask instance */
export interface MaskInstance {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Whether mask is enabled */
  enabled: boolean;
  /** Mask shape */
  shape: MaskShape;
  /** Whether mask is inverted */
  inverted: boolean;
  /** Feather amount (0-100) */
  feather: number;
  /** Expansion amount (-100 to 100) */
  expansion: number;
  /** Opacity (0-100) */
  opacity: number;
  /** Blend mode for multiple masks */
  blendMode: MaskBlendMode;
  /** Render order (lower = first) */
  order: number;
  /** Animation data for keyframe animation */
  animation?: MaskAnimationData;
}
