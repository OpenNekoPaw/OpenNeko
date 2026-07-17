/**
 * Shape factory functions (mirrors webview defaults to avoid webview dependency).
 */

import type { Shape, ShapeStyle, ShapeInstance } from '@neko/shared';
import { DEFAULT_SHAPE_STYLE, generateId } from '@neko/shared';

export function createShapeId(): string {
  return `shape-${generateId()}`;
}

export function createDefaultShapeStyle(): ShapeStyle {
  return structuredClone(DEFAULT_SHAPE_STYLE);
}

export function createRectangleShape(centerX = 50, centerY = 50, width = 40, height = 30): Shape {
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

export function createEllipseShape(centerX = 50, centerY = 50, radiusX = 20, radiusY = 15): Shape {
  return {
    shapeType: 'ellipse',
    centerX,
    centerY,
    radiusX,
    radiusY,
    rotation: 0,
  };
}

export function createPolygonShape(sides = 6): Shape {
  const points: Array<{ x: number; y: number }> = [];
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

export function createStarShape(centerX = 50, centerY = 50, points = 5, outerRadius = 25): Shape {
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

export function createLineShape(startX = 25, startY = 50, endX = 75, endY = 50): Shape {
  return {
    shapeType: 'line',
    startX,
    startY,
    endX,
    endY,
  };
}

export function createBezierShape(): Shape {
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

export function createShapeInstance(
  shape: Shape,
  name?: string,
  style?: Partial<ShapeStyle>,
): ShapeInstance {
  return {
    id: createShapeId(),
    name: name || `Shape ${shape.shapeType}`,
    shape,
    style: {
      ...createDefaultShapeStyle(),
      ...(style || {}),
    },
    zIndex: 0,
    visible: true,
    locked: false,
  };
}

export function applyStyleOverrides(
  baseStyle: ShapeStyle,
  style?: Record<string, unknown>,
): ShapeStyle {
  if (!style || typeof style !== 'object') {
    return baseStyle;
  }

  const next = structuredClone(baseStyle);
  const styleAny = style as Partial<ShapeStyle> & {
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
  };

  if (styleAny.fill && typeof styleAny.fill === 'object') {
    next.fill = { ...next.fill, ...(styleAny.fill as ShapeStyle['fill']) };
  }
  if (styleAny.stroke && typeof styleAny.stroke === 'object') {
    next.stroke = { ...next.stroke, ...(styleAny.stroke as ShapeStyle['stroke']) };
  }
  if (styleAny.shadow && typeof styleAny.shadow === 'object') {
    next.shadow = { ...next.shadow, ...(styleAny.shadow as ShapeStyle['shadow']) };
  }

  if (styleAny.fillColor) {
    next.fill = { ...next.fill, type: 'solid', color: styleAny.fillColor };
  }
  if (styleAny.strokeColor || styleAny.strokeWidth !== undefined) {
    next.stroke = {
      ...next.stroke,
      enabled: true,
      color: styleAny.strokeColor || next.stroke.color,
      width: styleAny.strokeWidth ?? next.stroke.width,
    };
  }
  if (styleAny.opacity !== undefined) {
    next.fill = { ...next.fill, opacity: styleAny.opacity };
  }

  return next;
}

/**
 * Mask factory (mirrors webview defaults).
 */
export function createMaskInstance(shapeType: string, name?: string): Record<string, unknown> {
  const id = `mask-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const createRectangleMask = () => ({
    type: 'rectangle',
    centerX: 50,
    centerY: 50,
    width: 50,
    height: 50,
    rotation: 0,
    cornerRadius: 0,
  });

  const createEllipseMask = () => ({
    type: 'ellipse',
    centerX: 50,
    centerY: 50,
    width: 50,
    height: 50,
    rotation: 0,
  });

  const createPolygonMask = () => ({
    type: 'polygon',
    points: [
      { x: 50, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ],
  });

  const createBezierPoint = (x: number, y: number) => ({
    anchor: { x, y },
    handleIn: { x: 0, y: 0 },
    handleOut: { x: 0, y: 0 },
    linkedHandles: true,
  });

  const createBezierMask = () => ({
    type: 'bezier',
    points: [
      createBezierPoint(25, 25),
      createBezierPoint(75, 25),
      createBezierPoint(75, 75),
      createBezierPoint(25, 75),
    ],
    closed: true,
  });

  let shape: Record<string, unknown>;
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
    default:
      shape = createRectangleMask();
      break;
  }

  return {
    id,
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
