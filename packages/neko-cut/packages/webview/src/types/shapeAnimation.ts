/**
 * Shape Animation Types
 * 形状动画类型定义
 *
 * 支持形状变换动画和描边动画
 */

import type { AnimatableProperty, AnimationKeyframe, EasingType } from './animation';

// =============================================================================
// Shape Transform Animation
// =============================================================================

/**
 * Shape-specific animatable properties
 * 形状特有的可动画属性
 */
export type ShapeAnimatablePropertyName =
  // Common transform properties (shared with elements)
  | 'x'
  | 'y'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  // Shape-specific properties
  | 'width' // For rectangle
  | 'height' // For rectangle
  | 'cornerRadius' // For rectangle
  | 'radiusX' // For ellipse
  | 'radiusY' // For ellipse
  | 'outerRadius' // For star
  | 'innerRadiusRatio' // For star
  | 'points' // For star/polygon (number of points)
  // Stroke animation properties
  | 'strokeWidth'
  | 'strokeOpacity'
  | 'strokeDashOffset'
  | 'strokeTrimStart' // Trim path start (0-1)
  | 'strokeTrimEnd' // Trim path end (0-1)
  // Fill animation properties
  | 'fillOpacity';

/**
 * Property name translation keys for shape animations
 * 形状动画属性名称的翻译键
 */
export const SHAPE_ANIMATABLE_PROPERTY_I18N_KEYS: Partial<
  Record<ShapeAnimatablePropertyName, string>
> = {
  x: 'shape.animation.positionX',
  y: 'shape.animation.positionY',
  scaleX: 'shape.animation.scaleX',
  scaleY: 'shape.animation.scaleY',
  rotation: 'shape.animation.rotation',
  opacity: 'shape.animation.opacity',
  width: 'shape.animation.width',
  height: 'shape.animation.height',
  cornerRadius: 'shape.animation.cornerRadius',
  radiusX: 'shape.animation.radiusX',
  radiusY: 'shape.animation.radiusY',
  outerRadius: 'shape.animation.outerRadius',
  innerRadiusRatio: 'shape.animation.innerRadiusRatio',
  points: 'shape.animation.points',
  strokeWidth: 'shape.animation.strokeWidth',
  strokeOpacity: 'shape.animation.strokeOpacity',
  strokeDashOffset: 'shape.animation.strokeDashOffset',
  strokeTrimStart: 'shape.animation.strokeTrimStart',
  strokeTrimEnd: 'shape.animation.strokeTrimEnd',
  fillOpacity: 'shape.animation.fillOpacity',
};

// =============================================================================
// Shape Transform
// =============================================================================

/**
 * Shape transform with animatable properties
 * 形状变换（支持动画）
 */
export interface ShapeTransform {
  /** Position X (0-100%) */
  x: AnimatableProperty;
  /** Position Y (0-100%) */
  y: AnimatableProperty;
  /** Scale X (1 = 100%) */
  scaleX: AnimatableProperty;
  /** Scale Y (1 = 100%) */
  scaleY: AnimatableProperty;
  /** Rotation in degrees */
  rotation: AnimatableProperty;
  /** Overall opacity (0-1) */
  opacity: AnimatableProperty;
  /** Anchor point X (0-1) - static */
  anchorX: number;
  /** Anchor point Y (0-1) - static */
  anchorY: number;
}

/**
 * Computed shape transform at a specific time
 * 某一时刻的计算形状变换值
 */
export interface ComputedShapeTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  anchorX: number;
  anchorY: number;
}

// =============================================================================
// Stroke Animation
// =============================================================================

/**
 * Stroke animation properties
 * 描边动画属性
 */
export interface StrokeAnimation {
  /** Stroke width (animatable) */
  width: AnimatableProperty;
  /** Stroke opacity (animatable) */
  opacity: AnimatableProperty;
  /** Dash offset for dash animation */
  dashOffset: AnimatableProperty;
  /** Trim path start (0-1, for drawing-on effect) */
  trimStart: AnimatableProperty;
  /** Trim path end (0-1, for drawing-on effect) */
  trimEnd: AnimatableProperty;
}

/**
 * Computed stroke animation values
 * 计算后的描边动画值
 */
export interface ComputedStrokeAnimation {
  width: number;
  opacity: number;
  dashOffset: number;
  trimStart: number;
  trimEnd: number;
}

// =============================================================================
// Shape-Specific Animation
// =============================================================================

/**
 * Rectangle animation properties
 * 矩形动画属性
 */
export interface RectangleAnimation {
  width: AnimatableProperty;
  height: AnimatableProperty;
  cornerRadius: AnimatableProperty;
}

/**
 * Ellipse animation properties
 * 椭圆动画属性
 */
export interface EllipseAnimation {
  radiusX: AnimatableProperty;
  radiusY: AnimatableProperty;
}

/**
 * Star animation properties
 * 星形动画属性
 */
export interface StarAnimation {
  outerRadius: AnimatableProperty;
  innerRadiusRatio: AnimatableProperty;
  points: AnimatableProperty; // Can animate between different point counts
}

/**
 * Polygon animation properties
 * 多边形动画属性
 */
export interface PolygonAnimation {
  // For polygon morphing, we need to interpolate point arrays
  // This is handled specially via path morphing
}

/**
 * Fill animation properties
 * 填充动画属性
 */
export interface FillAnimation {
  opacity: AnimatableProperty;
  // Color animation would require color interpolation
  // Gradient animation would require gradient stop interpolation
}

// =============================================================================
// Complete Shape Animation
// =============================================================================

/**
 * Complete animation state for a shape instance
 * 形状实例的完整动画状态
 */
export interface ShapeAnimationState {
  /** Shape transform animation */
  transform: ShapeTransform;
  /** Stroke animation */
  stroke: StrokeAnimation;
  /** Fill animation */
  fill: FillAnimation;
  /** Shape-specific animation (type depends on shape) */
  shapeSpecific?: RectangleAnimation | EllipseAnimation | StarAnimation;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a default animatable property with initial value
 */
function createAnimatable(baseValue: number): AnimatableProperty {
  return {
    baseValue,
    keyframes: [],
  };
}

/**
 * Create default shape transform
 * 创建默认形状变换
 */
export function createDefaultShapeTransform(): ShapeTransform {
  return {
    x: createAnimatable(50), // Center (percentage)
    y: createAnimatable(50), // Center (percentage)
    scaleX: createAnimatable(1), // 100%
    scaleY: createAnimatable(1), // 100%
    rotation: createAnimatable(0), // No rotation
    opacity: createAnimatable(1), // Fully visible
    anchorX: 0.5, // Center anchor
    anchorY: 0.5, // Center anchor
  };
}

/**
 * Create default stroke animation
 * 创建默认描边动画
 */
export function createDefaultStrokeAnimation(initialWidth = 2): StrokeAnimation {
  return {
    width: createAnimatable(initialWidth),
    opacity: createAnimatable(1),
    dashOffset: createAnimatable(0),
    trimStart: createAnimatable(0), // Start of path
    trimEnd: createAnimatable(1), // End of path (fully drawn)
  };
}

/**
 * Create default fill animation
 * 创建默认填充动画
 */
export function createDefaultFillAnimation(): FillAnimation {
  return {
    opacity: createAnimatable(1),
  };
}

/**
 * Create default rectangle animation
 */
export function createDefaultRectangleAnimation(
  width = 40,
  height = 30,
  cornerRadius = 0,
): RectangleAnimation {
  return {
    width: createAnimatable(width),
    height: createAnimatable(height),
    cornerRadius: createAnimatable(cornerRadius),
  };
}

/**
 * Create default ellipse animation
 */
export function createDefaultEllipseAnimation(radiusX = 20, radiusY = 15): EllipseAnimation {
  return {
    radiusX: createAnimatable(radiusX),
    radiusY: createAnimatable(radiusY),
  };
}

/**
 * Create default star animation
 */
export function createDefaultStarAnimation(
  outerRadius = 25,
  innerRadiusRatio = 0.4,
  points = 5,
): StarAnimation {
  return {
    outerRadius: createAnimatable(outerRadius),
    innerRadiusRatio: createAnimatable(innerRadiusRatio),
    points: createAnimatable(points),
  };
}

/**
 * Create complete shape animation state
 * 创建完整的形状动画状态
 */
export function createDefaultShapeAnimationState(): ShapeAnimationState {
  return {
    transform: createDefaultShapeTransform(),
    stroke: createDefaultStrokeAnimation(),
    fill: createDefaultFillAnimation(),
  };
}

// =============================================================================
// Animation Utilities
// =============================================================================

/**
 * Check if a property has any keyframes
 * 检查属性是否有关键帧
 */
export function hasKeyframes(property: AnimatableProperty): boolean {
  return property.keyframes.length > 0;
}

/**
 * Check if shape animation state has any keyframes
 * 检查形状动画状态是否有任何关键帧
 */
export function hasAnyKeyframes(state: ShapeAnimationState): boolean {
  const transformProps = [
    state.transform.x,
    state.transform.y,
    state.transform.scaleX,
    state.transform.scaleY,
    state.transform.rotation,
    state.transform.opacity,
  ];

  const strokeProps = [
    state.stroke.width,
    state.stroke.opacity,
    state.stroke.dashOffset,
    state.stroke.trimStart,
    state.stroke.trimEnd,
  ];

  const fillProps = [state.fill.opacity];

  return [...transformProps, ...strokeProps, ...fillProps].some(hasKeyframes);
}

/**
 * Get all keyframe times from a shape animation state
 * 获取形状动画状态中的所有关键帧时间
 */
export function getAllKeyframeTimes(state: ShapeAnimationState): number[] {
  const times = new Set<number>();

  const collectTimes = (prop: AnimatableProperty) => {
    prop.keyframes.forEach((kf) => times.add(kf.time));
  };

  // Transform
  collectTimes(state.transform.x);
  collectTimes(state.transform.y);
  collectTimes(state.transform.scaleX);
  collectTimes(state.transform.scaleY);
  collectTimes(state.transform.rotation);
  collectTimes(state.transform.opacity);

  // Stroke
  collectTimes(state.stroke.width);
  collectTimes(state.stroke.opacity);
  collectTimes(state.stroke.dashOffset);
  collectTimes(state.stroke.trimStart);
  collectTimes(state.stroke.trimEnd);

  // Fill
  collectTimes(state.fill.opacity);

  // Shape-specific
  if (state.shapeSpecific) {
    if ('width' in state.shapeSpecific) {
      // Rectangle
      collectTimes((state.shapeSpecific as RectangleAnimation).width);
      collectTimes((state.shapeSpecific as RectangleAnimation).height);
      collectTimes((state.shapeSpecific as RectangleAnimation).cornerRadius);
    } else if ('radiusX' in state.shapeSpecific) {
      // Ellipse
      collectTimes((state.shapeSpecific as EllipseAnimation).radiusX);
      collectTimes((state.shapeSpecific as EllipseAnimation).radiusY);
    } else if ('outerRadius' in state.shapeSpecific) {
      // Star
      collectTimes((state.shapeSpecific as StarAnimation).outerRadius);
      collectTimes((state.shapeSpecific as StarAnimation).innerRadiusRatio);
      collectTimes((state.shapeSpecific as StarAnimation).points);
    }
  }

  return Array.from(times).sort((a, b) => a - b);
}

// =============================================================================
// Stroke Animation Presets
// =============================================================================

/**
 * Stroke animation preset types
 * 描边动画预设类型
 */
export type StrokeAnimationPreset =
  | 'draw-on' // Path draws on from start to end
  | 'draw-off' // Path draws off from start to end
  | 'draw-on-reverse' // Path draws on from end to start
  | 'draw-off-reverse' // Path draws off from end to start
  | 'dash-march' // Marching dashes
  | 'pulse' // Width pulsing
  | 'fade-in' // Opacity fade in
  | 'fade-out'; // Opacity fade out

/**
 * Stroke animation preset i18n keys
 */
export const STROKE_ANIMATION_PRESET_I18N_KEYS: Record<StrokeAnimationPreset, string> = {
  'draw-on': 'shape.stroke.preset.drawOn',
  'draw-off': 'shape.stroke.preset.drawOff',
  'draw-on-reverse': 'shape.stroke.preset.drawOnReverse',
  'draw-off-reverse': 'shape.stroke.preset.drawOffReverse',
  'dash-march': 'shape.stroke.preset.dashMarch',
  pulse: 'shape.stroke.preset.pulse',
  'fade-in': 'shape.stroke.preset.fadeIn',
  'fade-out': 'shape.stroke.preset.fadeOut',
};

/**
 * Apply a stroke animation preset
 * 应用描边动画预设
 */
export function applyStrokeAnimationPreset(
  animation: StrokeAnimation,
  preset: StrokeAnimationPreset,
  duration: number,
  easing: EasingType = 'ease-in-out',
): StrokeAnimation {
  const createKf = (time: number, value: number): AnimationKeyframe => ({
    id: `kf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    time,
    value,
    easing,
  });

  switch (preset) {
    case 'draw-on':
      return {
        ...animation,
        trimStart: { baseValue: 0, keyframes: [] },
        trimEnd: {
          baseValue: 0,
          keyframes: [createKf(0, 0), createKf(duration, 1)],
        },
      };

    case 'draw-off':
      return {
        ...animation,
        trimStart: {
          baseValue: 0,
          keyframes: [createKf(0, 0), createKf(duration, 1)],
        },
        trimEnd: { baseValue: 1, keyframes: [] },
      };

    case 'draw-on-reverse':
      return {
        ...animation,
        trimStart: {
          baseValue: 1,
          keyframes: [createKf(0, 1), createKf(duration, 0)],
        },
        trimEnd: { baseValue: 1, keyframes: [] },
      };

    case 'draw-off-reverse':
      return {
        ...animation,
        trimStart: { baseValue: 0, keyframes: [] },
        trimEnd: {
          baseValue: 1,
          keyframes: [createKf(0, 1), createKf(duration, 0)],
        },
      };

    case 'dash-march':
      // Animate dash offset for marching effect
      return {
        ...animation,
        dashOffset: {
          baseValue: 0,
          keyframes: [
            createKf(0, 0),
            createKf(duration, 100), // Offset by 100 pixels
          ],
        },
      };

    case 'pulse':
      // Width pulse effect
      const baseWidth = animation.width.baseValue;
      return {
        ...animation,
        width: {
          baseValue: baseWidth,
          keyframes: [
            createKf(0, baseWidth),
            createKf(duration / 2, baseWidth * 2),
            createKf(duration, baseWidth),
          ],
        },
      };

    case 'fade-in':
      return {
        ...animation,
        opacity: {
          baseValue: 0,
          keyframes: [createKf(0, 0), createKf(duration, 1)],
        },
      };

    case 'fade-out':
      return {
        ...animation,
        opacity: {
          baseValue: 1,
          keyframes: [createKf(0, 1), createKf(duration, 0)],
        },
      };

    default:
      return animation;
  }
}
