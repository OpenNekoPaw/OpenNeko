/**
 * Shape Layer Types
 * 形状图层类型定义
 *
 * Core types are imported from @neko/shared for Single Source of Truth.
 * This file extends with webview-specific utilities (factory functions, type guards).
 *
 * 形状图层是一种可动画的矢量图形元素，
 * 复用蒙版系统的形状定义并扩展填充/描边/阴影属性
 */

// =============================================================================
// Re-export Core Types from Shared
// =============================================================================

export type {
  ShapeType,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
  BezierShape,
  Shape,
  GradientStop,
  GradientType,
  GradientFill,
  FillType,
  ShapeFill,
  StrokeLineCap,
  StrokeLineJoin,
  ShapeStroke,
  ShapeShadow,
  ShapeStyle,
  ShapeInstance,
  Point2D,
  BezierPoint,
} from '@neko/shared';

export {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_SHADOW,
  DEFAULT_SHAPE_STYLE,
} from '@neko/shared';

import type {
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
  BezierShape,
  Shape,
  ShapeFill,
  ShapeStroke,
  ShapeShadow,
  ShapeStyle,
  ShapeInstance,
  Point2D,
} from '@neko/shared';

import {
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_SHADOW,
  DEFAULT_SHAPE_STYLE,
} from '@neko/shared';

import type { ShapeAnimationState } from './shapeAnimation';

// =============================================================================
// Webview-Specific Extensions: ShapeInstance with Animation
// =============================================================================

/**
 * Extended ShapeInstance with animation support (webview-specific)
 * 带动画支持的扩展 ShapeInstance（webview 特有）
 */
export interface AnimatedShapeInstance extends ShapeInstance {
  /** Animation state (optional, for animated shapes) */
  animation?: ShapeAnimationState;
}

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Generate unique shape ID
 */
function generateShapeId(): string {
  return `shape-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create default rectangle shape
 */
export function createRectangleShape(
  centerX = 50,
  centerY = 50,
  width = 40,
  height = 30,
): RectangleShape {
  return {
    shapeType: 'rectangle',
    centerX,
    centerY,
    width,
    height,
    rotation: 0,
    cornerRadius: 0,
  };
}

/**
 * Create default ellipse shape
 */
export function createEllipseShape(
  centerX = 50,
  centerY = 50,
  radiusX = 20,
  radiusY = 15,
): EllipseShape {
  return {
    shapeType: 'ellipse',
    centerX,
    centerY,
    radiusX,
    radiusY,
    rotation: 0,
  };
}

/**
 * Create default polygon shape (triangle)
 */
export function createPolygonShape(sides = 3): PolygonShape {
  const points: Point2D[] = [];
  const centerX = 50;
  const centerY = 50;
  const radius = 25;

  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }

  return {
    shapeType: 'polygon',
    points,
  };
}

/**
 * Create default star shape
 */
export function createStarShape(
  centerX = 50,
  centerY = 50,
  points = 5,
  outerRadius = 25,
): StarShape {
  return {
    shapeType: 'star',
    centerX,
    centerY,
    points,
    outerRadius,
    innerRadiusRatio: 0.4,
    rotation: 0,
  };
}

/**
 * Create default line shape
 */
export function createLineShape(startX = 25, startY = 50, endX = 75, endY = 50): LineShape {
  return {
    shapeType: 'line',
    startX,
    startY,
    endX,
    endY,
  };
}

/**
 * Create default bezier shape
 */
export function createBezierShape(): BezierShape {
  return {
    shapeType: 'bezier',
    points: [
      {
        anchor: { x: 25, y: 50 },
        handleIn: { x: 0, y: 0 },
        handleOut: { x: 10, y: -20 },
        linkedHandles: true,
      },
      {
        anchor: { x: 75, y: 50 },
        handleIn: { x: -10, y: -20 },
        handleOut: { x: 0, y: 0 },
        linkedHandles: true,
      },
    ],
    closed: false,
  };
}

/**
 * Create default fill
 */
export function createDefaultFill(color = '#4a90d9'): ShapeFill {
  return {
    ...DEFAULT_SHAPE_FILL,
    color,
  };
}

/**
 * Create default stroke
 */
export function createDefaultStroke(color = '#333333', width = 2): ShapeStroke {
  return {
    ...DEFAULT_SHAPE_STROKE,
    color,
    width,
  };
}

/**
 * Create default shadow
 */
export function createDefaultShadow(): ShapeShadow {
  return { ...DEFAULT_SHAPE_SHADOW };
}

/**
 * Create default shape style
 */
export function createDefaultShapeStyle(): ShapeStyle {
  return { ...DEFAULT_SHAPE_STYLE };
}

/**
 * Create a shape instance
 */
export function createShapeInstance(
  shape: Shape,
  name?: string,
  style?: Partial<ShapeStyle>,
): ShapeInstance {
  return {
    id: generateShapeId(),
    name: name || `Shape ${shape.shapeType}`,
    shape,
    style: {
      ...createDefaultShapeStyle(),
      ...style,
    },
    zIndex: 0,
    visible: true,
    locked: false,
  };
}

/**
 * Clone a shape instance
 */
export function cloneShapeInstance(instance: ShapeInstance): ShapeInstance {
  return {
    ...instance,
    id: generateShapeId(),
    shape: structuredClone(instance.shape),
    style: structuredClone(instance.style),
  };
}

// =============================================================================
// Webview-Specific Extensions: Utility Functions
// =============================================================================

/**
 * Get bounding box of a shape
 * 获取形状的边界框
 */
export function getShapeBounds(shape: Shape): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  switch (shape.shapeType) {
    case 'rectangle': {
      const halfW = shape.width / 2;
      const halfH = shape.height / 2;
      return {
        minX: shape.centerX - halfW,
        minY: shape.centerY - halfH,
        maxX: shape.centerX + halfW,
        maxY: shape.centerY + halfH,
        width: shape.width,
        height: shape.height,
      };
    }
    case 'ellipse': {
      return {
        minX: shape.centerX - shape.radiusX,
        minY: shape.centerY - shape.radiusY,
        maxX: shape.centerX + shape.radiusX,
        maxY: shape.centerY + shape.radiusY,
        width: shape.radiusX * 2,
        height: shape.radiusY * 2,
      };
    }
    case 'polygon': {
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
    case 'star': {
      return {
        minX: shape.centerX - shape.outerRadius,
        minY: shape.centerY - shape.outerRadius,
        maxX: shape.centerX + shape.outerRadius,
        maxY: shape.centerY + shape.outerRadius,
        width: shape.outerRadius * 2,
        height: shape.outerRadius * 2,
      };
    }
    case 'line': {
      const minX = Math.min(shape.startX, shape.endX);
      const maxX = Math.max(shape.startX, shape.endX);
      const minY = Math.min(shape.startY, shape.endY);
      const maxY = Math.max(shape.startY, shape.endY);
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
    case 'bezier': {
      const xs = shape.points.map((p) => p.anchor.x);
      const ys = shape.points.map((p) => p.anchor.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
  }
}

/**
 * Check if point is inside shape (basic implementation)
 * 检查点是否在形状内部
 */
export function isPointInShape(shape: Shape, x: number, y: number): boolean {
  switch (shape.shapeType) {
    case 'rectangle': {
      const halfW = shape.width / 2;
      const halfH = shape.height / 2;
      // Simplified: ignore rotation for now
      return (
        x >= shape.centerX - halfW &&
        x <= shape.centerX + halfW &&
        y >= shape.centerY - halfH &&
        y <= shape.centerY + halfH
      );
    }
    case 'ellipse': {
      // Simplified: ignore rotation
      const dx = x - shape.centerX;
      const dy = y - shape.centerY;
      return (
        (dx * dx) / (shape.radiusX * shape.radiusX) + (dy * dy) / (shape.radiusY * shape.radiusY) <=
        1
      );
    }
    case 'polygon': {
      // Ray casting algorithm
      let inside = false;
      const points = shape.points;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x,
          yi = points[i].y;
        const xj = points[j].x,
          yj = points[j].y;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    }
    case 'star': {
      // Simplified: check if within outer radius
      const dx = x - shape.centerX;
      const dy = y - shape.centerY;
      return Math.sqrt(dx * dx + dy * dy) <= shape.outerRadius;
    }
    case 'line': {
      // Lines don't have an interior
      return false;
    }
    case 'bezier': {
      // For bezier, check bounding box as approximation
      const bounds = getShapeBounds(shape);
      return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
    }
  }
}

/**
 * Generate star points
 * 生成星形顶点
 */
export function generateStarPoints(star: StarShape): Point2D[] {
  const points: Point2D[] = [];
  const innerRadius = star.outerRadius * star.innerRadiusRatio;
  const angleStep = Math.PI / star.points;
  const startAngle = -Math.PI / 2 + (star.rotation * Math.PI) / 180;

  for (let i = 0; i < star.points * 2; i++) {
    const angle = startAngle + i * angleStep;
    const radius = i % 2 === 0 ? star.outerRadius : innerRadius;
    points.push({
      x: star.centerX + Math.cos(angle) * radius,
      y: star.centerY + Math.sin(angle) * radius,
    });
  }

  return points;
}

// =============================================================================
// Webview-Specific Extensions: Type Guards
// =============================================================================

export function isRectangleShape(shape: Shape): shape is RectangleShape {
  return shape.shapeType === 'rectangle';
}

export function isEllipseShape(shape: Shape): shape is EllipseShape {
  return shape.shapeType === 'ellipse';
}

export function isPolygonShape(shape: Shape): shape is PolygonShape {
  return shape.shapeType === 'polygon';
}

export function isStarShape(shape: Shape): shape is StarShape {
  return shape.shapeType === 'star';
}

export function isLineShape(shape: Shape): shape is LineShape {
  return shape.shapeType === 'line';
}

export function isBezierShape(shape: Shape): shape is BezierShape {
  return shape.shapeType === 'bezier';
}
