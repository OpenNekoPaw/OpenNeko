/**
 * Mask Types
 * 蒙版类型定义
 *
 * Canonical source for UI mask types.
 * Only Point2D and BezierPoint are imported from @neko/shared (geometry primitives).
 */

// =============================================================================
// Engine Type Re-exports (geometry primitives, not migrated)
// =============================================================================

export type { Point2D, BezierPoint } from '@neko/shared';

import type { Point2D, BezierPoint } from '@neko/shared';

// =============================================================================
// Mask Core Types (migrated from neko-types)
// =============================================================================

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

// =============================================================================
// Webview-Specific Extensions: Mask Tracking (Future)
// =============================================================================

/**
 * Mask tracking data (for motion tracking)
 * 蒙版跟踪数据（用于运动跟踪）
 */
export interface MaskTrackingData {
  /** Whether tracking is enabled */
  enabled: boolean;
  /** Tracked keyframes */
  keyframes: MaskTrackingKeyframe[];
}

/**
 * Mask tracking keyframe
 * 蒙版跟踪关键帧
 */
export interface MaskTrackingKeyframe {
  /** Time in seconds */
  time: number;
  /** Tracked position offset */
  position: Point2D;
  /** Tracked scale */
  scale: Point2D;
  /** Tracked rotation */
  rotation: number;
}

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Create default rectangle mask
 */
export function createRectangleMask(): RectangleMask {
  return {
    type: 'rectangle',
    centerX: 50,
    centerY: 50,
    width: 50,
    height: 50,
    rotation: 0,
    cornerRadius: 0,
  };
}

/**
 * Create default ellipse mask
 */
export function createEllipseMask(): EllipseMask {
  return {
    type: 'ellipse',
    centerX: 50,
    centerY: 50,
    width: 50,
    height: 50,
    rotation: 0,
  };
}

/**
 * Create default polygon mask (triangle)
 */
export function createPolygonMask(): PolygonMask {
  return {
    type: 'polygon',
    points: [
      { x: 50, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ],
  };
}

/**
 * Create default bezier point
 */
export function createBezierPoint(x: number, y: number): BezierPoint {
  return {
    anchor: { x, y },
    handleIn: { x: 0, y: 0 },
    handleOut: { x: 0, y: 0 },
    linkedHandles: true,
  };
}

/**
 * Create default bezier mask (rectangle-ish)
 */
export function createBezierMask(): BezierMask {
  return {
    type: 'bezier',
    points: [
      createBezierPoint(25, 25),
      createBezierPoint(75, 25),
      createBezierPoint(75, 75),
      createBezierPoint(25, 75),
    ],
    closed: true,
  };
}

/**
 * Create a new mask instance
 */
export function createMaskInstance(
  shapeType: MaskShapeType = 'rectangle',
  name?: string,
): MaskInstance {
  let shape: MaskShape;
  switch (shapeType) {
    case 'rectangle':
      shape = createRectangleMask();
      break;
    case 'ellipse':
      shape = createEllipseMask();
      break;
    case 'polygon':
      shape = createPolygonMask();
      break;
    case 'bezier':
      shape = createBezierMask();
      break;
  }

  return {
    id: `mask-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: name || `Mask ${shapeType}`,
    enabled: true,
    shape,
    feather: 0,
    expansion: 0,
    opacity: 100,
    inverted: false,
    blendMode: 'add',
    order: 0,
  };
}

/**
 * Clone a mask instance
 */
export function cloneMaskInstance(mask: MaskInstance): MaskInstance {
  return {
    ...mask,
    id: `mask-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    shape: structuredClone(mask.shape),
    animation: mask.animation ? structuredClone(mask.animation) : undefined,
  };
}

// =============================================================================
// Webview-Specific Extensions: Animation Utility Functions
// =============================================================================

/**
 * Generate unique keyframe ID
 */
function generateMaskKeyframeId(): string {
  return `mkf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an animatable mask property
 * 创建可动画蒙版属性
 */
export function createAnimatableMaskProperty(baseValue: number): AnimatableMaskProperty {
  return {
    baseValue,
    keyframes: [],
  };
}

/**
 * Create a mask property keyframe
 * 创建蒙版属性关键帧
 */
export function createMaskPropertyKeyframe(
  time: number,
  value: number,
  easing: MaskEasingType = 'linear',
): MaskPropertyKeyframe {
  return {
    id: generateMaskKeyframeId(),
    time,
    value,
    easing,
  };
}

/**
 * Create a mask shape keyframe
 * 创建蒙版形状关键帧
 */
export function createMaskShapeKeyframe(
  time: number,
  shape: MaskShape,
  easing: MaskEasingType = 'linear',
): MaskShapeKeyframe {
  return {
    id: generateMaskKeyframeId(),
    time,
    shape: structuredClone(shape),
    easing,
  };
}

/**
 * Insert keyframe in sorted order (by time)
 * 按时间顺序插入关键帧
 */
export function insertMaskKeyframeSorted<T extends { time: number }>(
  keyframes: T[],
  newKeyframe: T,
): T[] {
  const result = [...keyframes];
  const insertIndex = result.findIndex((kf) => kf.time > newKeyframe.time);
  if (insertIndex === -1) {
    result.push(newKeyframe);
  } else {
    result.splice(insertIndex, 0, newKeyframe);
  }
  return result;
}

/**
 * Remove keyframe by ID
 * 根据 ID 删除关键帧
 */
export function removeMaskKeyframeById<T extends { id: string }>(
  keyframes: T[],
  keyframeId: string,
): T[] {
  return keyframes.filter((kf) => kf.id !== keyframeId);
}

/**
 * Get keyframe at specific time (within tolerance)
 * 获取指定时间的关键帧（在容差范围内）
 */
export function getMaskKeyframeAtTime<T extends { time: number }>(
  keyframes: T[],
  time: number,
  tolerance: number = 0.01,
): T | undefined {
  return keyframes.find((kf) => Math.abs(kf.time - time) <= tolerance);
}

/**
 * Apply easing to a progress value
 * 对进度值应用缓动
 */
export function applyMaskEasing(progress: number, easing: MaskEasingType): number {
  switch (easing) {
    case 'linear':
      return progress;
    case 'ease-in':
      return progress * progress;
    case 'ease-out':
      return progress * (2 - progress);
    case 'ease-in-out':
      return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    default:
      return progress;
  }
}

/**
 * Get animated mask property value at specific time
 * 获取蒙版属性在指定时间的动画值
 *
 * @param property - Animatable mask property
 * @param localTime - Time relative to element start (seconds)
 * @returns Interpolated value at the given time
 */
export function getAnimatedMaskPropertyValue(
  property: AnimatableMaskProperty | undefined,
  localTime: number,
): number {
  if (!property) return 0;

  const { baseValue, keyframes } = property;

  // No keyframes - return base value
  if (!keyframes || keyframes.length === 0) {
    return baseValue;
  }

  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (localTime <= sorted[0].time) {
    return sorted[0].value;
  }

  // After last keyframe
  if (localTime >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value;
  }

  // Find surrounding keyframes
  let prevIndex = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].time <= localTime && sorted[i + 1].time > localTime) {
      prevIndex = i;
      break;
    }
  }

  const prevFrame = sorted[prevIndex];
  const nextFrame = sorted[prevIndex + 1];

  // Calculate interpolation progress
  const duration = nextFrame.time - prevFrame.time;
  const progress = duration > 0 ? (localTime - prevFrame.time) / duration : 0;

  // Apply easing and interpolate
  const easedProgress = applyMaskEasing(progress, prevFrame.easing);
  return prevFrame.value + (nextFrame.value - prevFrame.value) * easedProgress;
}

/**
 * Linear interpolation helper
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate Point2D
 */
function lerpPoint2D(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

/**
 * Interpolate BezierPoint
 */
function lerpBezierPoint(a: BezierPoint, b: BezierPoint, t: number): BezierPoint {
  return {
    anchor: lerpPoint2D(a.anchor, b.anchor, t),
    handleIn: lerpPoint2D(a.handleIn, b.handleIn, t),
    handleOut: lerpPoint2D(a.handleOut, b.handleOut, t),
    linkedHandles: t < 0.5 ? a.linkedHandles : b.linkedHandles,
  };
}

/**
 * Interpolate between two mask shapes of the same type
 * 在两个相同类型的蒙版形状之间插值
 */
export function interpolateMaskShapes(
  shapeA: MaskShape,
  shapeB: MaskShape,
  t: number,
): MaskShape | null {
  // Can only interpolate shapes of the same type
  if (shapeA.type !== shapeB.type) {
    return null;
  }

  switch (shapeA.type) {
    case 'rectangle': {
      const b = shapeB as RectangleMask;
      return {
        type: 'rectangle',
        centerX: lerp(shapeA.centerX, b.centerX, t),
        centerY: lerp(shapeA.centerY, b.centerY, t),
        width: lerp(shapeA.width, b.width, t),
        height: lerp(shapeA.height, b.height, t),
        rotation: lerp(shapeA.rotation, b.rotation, t),
        cornerRadius: lerp(shapeA.cornerRadius, b.cornerRadius, t),
      };
    }
    case 'ellipse': {
      const b = shapeB as EllipseMask;
      return {
        type: 'ellipse',
        centerX: lerp(shapeA.centerX, b.centerX, t),
        centerY: lerp(shapeA.centerY, b.centerY, t),
        width: lerp(shapeA.width, b.width, t),
        height: lerp(shapeA.height, b.height, t),
        rotation: lerp(shapeA.rotation, b.rotation, t),
      };
    }
    case 'polygon': {
      const b = shapeB as PolygonMask;
      // Can only interpolate if same number of points
      if (shapeA.points.length !== b.points.length) {
        return null;
      }
      return {
        type: 'polygon',
        points: shapeA.points.map((pt, i) => lerpPoint2D(pt, b.points[i], t)),
      };
    }
    case 'bezier': {
      const b = shapeB as BezierMask;
      // Can only interpolate if same number of points
      if (shapeA.points.length !== b.points.length) {
        return null;
      }
      return {
        type: 'bezier',
        points: shapeA.points.map((pt, i) => lerpBezierPoint(pt, b.points[i], t)),
        closed: t < 0.5 ? shapeA.closed : b.closed,
      };
    }
    default:
      return null;
  }
}

/**
 * Get animated mask shape at specific time
 * 获取蒙版形状在指定时间的动画值
 *
 * @param shapeKeyframes - Shape keyframes array
 * @param baseShape - Base shape when no keyframes exist
 * @param localTime - Time relative to element start (seconds)
 * @returns Interpolated shape at the given time
 */
export function getAnimatedMaskShape(
  shapeKeyframes: MaskShapeKeyframe[] | undefined,
  baseShape: MaskShape,
  localTime: number,
): MaskShape {
  if (!shapeKeyframes || shapeKeyframes.length === 0) {
    return baseShape;
  }

  // Sort keyframes by time
  const sorted = [...shapeKeyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (localTime <= sorted[0].time) {
    return sorted[0].shape;
  }

  // After last keyframe
  if (localTime >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].shape;
  }

  // Find surrounding keyframes
  let prevIndex = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].time <= localTime && sorted[i + 1].time > localTime) {
      prevIndex = i;
      break;
    }
  }

  const prevFrame = sorted[prevIndex];
  const nextFrame = sorted[prevIndex + 1];

  // Calculate interpolation progress
  const duration = nextFrame.time - prevFrame.time;
  const progress = duration > 0 ? (localTime - prevFrame.time) / duration : 0;

  // Apply easing
  const easedProgress = applyMaskEasing(progress, prevFrame.easing);

  // Interpolate shapes
  const interpolated = interpolateMaskShapes(prevFrame.shape, nextFrame.shape, easedProgress);

  // If interpolation failed (different types/incompatible), return previous frame shape
  return interpolated ?? prevFrame.shape;
}

/**
 * Get computed mask properties at a specific time
 * 获取蒙版在指定时间的计算后属性值
 *
 * @param mask - Mask instance
 * @param localTime - Time relative to element start (seconds)
 * @returns Computed mask properties
 */
export function getComputedMaskAtTime(
  mask: MaskInstance,
  localTime: number,
): {
  shape: MaskShape;
  feather: number;
  expansion: number;
  opacity: number;
} {
  const animation = mask.animation;

  return {
    shape: getAnimatedMaskShape(animation?.shapeKeyframes, mask.shape, localTime),
    feather: animation?.feather
      ? getAnimatedMaskPropertyValue(animation.feather, localTime)
      : mask.feather,
    expansion: animation?.expansion
      ? getAnimatedMaskPropertyValue(animation.expansion, localTime)
      : mask.expansion,
    opacity: animation?.opacity
      ? getAnimatedMaskPropertyValue(animation.opacity, localTime)
      : mask.opacity,
  };
}

/**
 * Check if mask has any animation data
 * 检查蒙版是否有动画数据
 */
export function hasMaskAnimation(mask: MaskInstance): boolean {
  const animation = mask.animation;
  if (!animation) return false;

  const hasShapeKeyframes =
    animation.shapeKeyframes !== undefined && animation.shapeKeyframes.length > 0;
  const hasFeatherKeyframes =
    animation.feather !== undefined && animation.feather.keyframes.length > 0;
  const hasExpansionKeyframes =
    animation.expansion !== undefined && animation.expansion.keyframes.length > 0;
  const hasOpacityKeyframes =
    animation.opacity !== undefined && animation.opacity.keyframes.length > 0;

  return hasShapeKeyframes || hasFeatherKeyframes || hasExpansionKeyframes || hasOpacityKeyframes;
}

/**
 * Get all unique keyframe times from mask animation
 * 获取蒙版动画中所有唯一的关键帧时间
 */
export function getMaskKeyframeTimes(mask: MaskInstance): number[] {
  const times = new Set<number>();
  const animation = mask.animation;

  if (!animation) return [];

  animation.shapeKeyframes?.forEach((kf) => times.add(kf.time));
  animation.feather?.keyframes.forEach((kf) => times.add(kf.time));
  animation.expansion?.keyframes.forEach((kf) => times.add(kf.time));
  animation.opacity?.keyframes.forEach((kf) => times.add(kf.time));

  return Array.from(times).sort((a, b) => a - b);
}

/**
 * Add keyframe to mask property animation
 * 向蒙版属性动画添加关键帧
 */
export function addMaskPropertyKeyframe(
  mask: MaskInstance,
  property: 'feather' | 'expansion' | 'opacity',
  time: number,
  value: number,
  easing: MaskEasingType = 'linear',
): MaskInstance {
  const newKeyframe = createMaskPropertyKeyframe(time, value, easing);

  // Get or create animation data
  const animation = mask.animation ?? {};
  const existingProp = animation[property];

  let updatedProp: AnimatableMaskProperty;
  if (existingProp) {
    updatedProp = {
      ...existingProp,
      keyframes: insertMaskKeyframeSorted(existingProp.keyframes, newKeyframe),
    };
  } else {
    updatedProp = {
      baseValue: mask[property],
      keyframes: [newKeyframe],
    };
  }

  return {
    ...mask,
    animation: {
      ...animation,
      [property]: updatedProp,
    },
  };
}

/**
 * Remove keyframe from mask property animation
 * 从蒙版属性动画中删除关键帧
 */
export function removeMaskPropertyKeyframe(
  mask: MaskInstance,
  property: 'feather' | 'expansion' | 'opacity',
  keyframeId: string,
): MaskInstance {
  const animation = mask.animation;
  if (!animation) return mask;

  const existingProp = animation[property];
  if (!existingProp) return mask;

  const updatedKeyframes = removeMaskKeyframeById(existingProp.keyframes, keyframeId);

  return {
    ...mask,
    animation: {
      ...animation,
      [property]: {
        ...existingProp,
        keyframes: updatedKeyframes,
      },
    },
  };
}

/**
 * Add shape keyframe to mask animation
 * 向蒙版动画添加形状关键帧
 */
export function addMaskShapeKeyframe(
  mask: MaskInstance,
  time: number,
  shape: MaskShape,
  easing: MaskEasingType = 'linear',
): MaskInstance {
  const newKeyframe = createMaskShapeKeyframe(time, shape, easing);

  const animation = mask.animation ?? {};
  const existingKeyframes = animation.shapeKeyframes ?? [];

  return {
    ...mask,
    animation: {
      ...animation,
      shapeKeyframes: insertMaskKeyframeSorted(existingKeyframes, newKeyframe),
    },
  };
}

/**
 * Remove shape keyframe from mask animation
 * 从蒙版动画中删除形状关键帧
 */
export function removeMaskShapeKeyframe(mask: MaskInstance, keyframeId: string): MaskInstance {
  const animation = mask.animation;
  if (!animation || !animation.shapeKeyframes) return mask;

  return {
    ...mask,
    animation: {
      ...animation,
      shapeKeyframes: removeMaskKeyframeById(animation.shapeKeyframes, keyframeId),
    },
  };
}
