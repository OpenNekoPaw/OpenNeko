// =============================================================================
// Shape System (形状系统)
// =============================================================================

import { Point2D, BezierPoint } from './geometry';

/**
 * Shape type enum
 * 形状类型枚举
 */
export type ShapeType = 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'line' | 'bezier';

// -----------------------------------------------------------------------------
// Shape Definitions
// -----------------------------------------------------------------------------

/**
 * Base shape properties
 */
interface BaseShape {
  shapeType: ShapeType;
}

/**
 * Rectangle shape
 */
export interface RectangleShape extends BaseShape {
  shapeType: 'rectangle';
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
  /** Corner radius (0-50, as percentage of min(width, height)) */
  cornerRadius: number;
}

/**
 * Ellipse shape
 */
export interface EllipseShape extends BaseShape {
  shapeType: 'ellipse';
  /** Center X (0-100%) */
  centerX: number;
  /** Center Y (0-100%) */
  centerY: number;
  /** Radius X (0-100%) */
  radiusX: number;
  /** Radius Y (0-100%) */
  radiusY: number;
  /** Rotation in degrees */
  rotation: number;
}

/**
 * Polygon shape
 */
export interface PolygonShape extends BaseShape {
  shapeType: 'polygon';
  /** Points defining the polygon (normalized 0-100%) */
  points: Point2D[];
}

/**
 * Star shape
 */
export interface StarShape extends BaseShape {
  shapeType: 'star';
  /** Center X (0-100%) */
  centerX: number;
  /** Center Y (0-100%) */
  centerY: number;
  /** Number of points (3-20) */
  points: number;
  /** Outer radius (0-100%) */
  outerRadius: number;
  /** Inner radius as ratio of outer radius (0-1) */
  innerRadiusRatio: number;
  /** Rotation in degrees */
  rotation: number;
}

/**
 * Line shape
 */
export interface LineShape extends BaseShape {
  shapeType: 'line';
  /** Start point X (0-100%) */
  startX: number;
  /** Start point Y (0-100%) */
  startY: number;
  /** End point X (0-100%) */
  endX: number;
  /** End point Y (0-100%) */
  endY: number;
}

/**
 * Bezier path shape
 */
export interface BezierShape extends BaseShape {
  shapeType: 'bezier';
  /** Bezier points defining the path */
  points: BezierPoint[];
  /** Whether the path is closed */
  closed: boolean;
}

/**
 * Union of all shape types
 */
export type Shape =
  RectangleShape | EllipseShape | PolygonShape | StarShape | LineShape | BezierShape;

// -----------------------------------------------------------------------------
// Shape Style Properties
// -----------------------------------------------------------------------------

/**
 * Gradient stop definition
 */
export interface GradientStop {
  /** Position (0-1) */
  offset: number;
  /** Color value */
  color: string;
}

/**
 * Gradient fill type
 */
export type GradientType = 'linear' | 'radial';

/**
 * Gradient fill definition
 */
export interface GradientFill {
  type: GradientType;
  /** Gradient stops */
  stops: GradientStop[];
  /** Angle in degrees (for linear gradient) */
  angle?: number;
  /** Center X (for radial gradient, 0-1) */
  centerX?: number;
  /** Center Y (for radial gradient, 0-1) */
  centerY?: number;
  /** Radius (for radial gradient, as ratio) */
  radius?: number;
}

/**
 * Fill type
 */
export type FillType = 'none' | 'solid' | 'gradient';

/**
 * Fill definition
 */
export interface ShapeFill {
  type: FillType;
  /** Solid color (for solid fill) */
  color?: string;
  /** Gradient definition (for gradient fill) */
  gradient?: GradientFill;
  /** Fill opacity (0-1) */
  opacity: number;
}

/**
 * Stroke line cap
 */
export type StrokeLineCap = 'butt' | 'round' | 'square';

/**
 * Stroke line join
 */
export type StrokeLineJoin = 'miter' | 'round' | 'bevel';

/**
 * Stroke definition
 */
export interface ShapeStroke {
  /** Whether stroke is enabled */
  enabled: boolean;
  /** Stroke color */
  color: string;
  /** Stroke width in pixels */
  width: number;
  /** Stroke opacity (0-1) */
  opacity: number;
  /** Line cap style */
  lineCap: StrokeLineCap;
  /** Line join style */
  lineJoin: StrokeLineJoin;
  /** Miter limit for miter joins */
  miterLimit: number;
  /** Dash array (empty for solid line) */
  dashArray: number[];
  /** Dash offset */
  dashOffset: number;
}

/**
 * Shadow definition
 */
export interface ShapeShadow {
  /** Whether shadow is enabled */
  enabled: boolean;
  /** Shadow color */
  color: string;
  /** Shadow blur radius */
  blur: number;
  /** Shadow X offset */
  offsetX: number;
  /** Shadow Y offset */
  offsetY: number;
  /** Shadow spread (optional, for inner shadows) */
  spread?: number;
  /** Whether it's an inner shadow */
  inset?: boolean;
}

/**
 * Shape style properties
 */
export interface ShapeStyle {
  /** Fill properties */
  fill: ShapeFill;
  /** Stroke properties */
  stroke: ShapeStroke;
  /** Shadow properties */
  shadow: ShapeShadow;
}

/**
 * Shape layer instance
 */
export interface ShapeInstance {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Shape definition */
  shape: Shape;
  /** Style properties */
  style: ShapeStyle;
  /** Layer order (higher = on top) */
  zIndex: number;
  /** Whether shape is visible */
  visible: boolean;
  /** Whether shape is locked */
  locked: boolean;
}

// -----------------------------------------------------------------------------
// Default Shape Values
// -----------------------------------------------------------------------------

export const DEFAULT_SHAPE_FILL: ShapeFill = {
  type: 'solid',
  color: '#4a90d9',
  opacity: 1,
};

export const DEFAULT_SHAPE_STROKE: ShapeStroke = {
  enabled: true,
  color: '#333333',
  width: 2,
  opacity: 1,
  lineCap: 'round',
  lineJoin: 'round',
  miterLimit: 10,
  dashArray: [],
  dashOffset: 0,
};

export const DEFAULT_SHAPE_SHADOW: ShapeShadow = {
  enabled: false,
  color: 'rgba(0, 0, 0, 0.3)',
  blur: 10,
  offsetX: 4,
  offsetY: 4,
};

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  fill: DEFAULT_SHAPE_FILL,
  stroke: DEFAULT_SHAPE_STROKE,
  shadow: DEFAULT_SHAPE_SHADOW,
};
