import { describe, it, expect } from 'vitest';
import {
  createShapeId,
  createDefaultShapeStyle,
  createRectangleShape,
  createEllipseShape,
  createPolygonShape,
  createStarShape,
  createLineShape,
  createBezierShape,
  createShapeInstance,
  applyStyleOverrides,
  createMaskInstance,
} from '../shapeFactories';
import { DEFAULT_SHAPE_STYLE } from '@neko/shared';

// ---------------------------------------------------------------------------
// createShapeId
// ---------------------------------------------------------------------------
describe('createShapeId', () => {
  it('returns a string prefixed with "shape-"', () => {
    const id = createShapeId();
    expect(id).toMatch(/^shape-.+/);
  });

  it('generates unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createShapeId()));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// createDefaultShapeStyle
// ---------------------------------------------------------------------------
describe('createDefaultShapeStyle', () => {
  it('returns a deep clone of DEFAULT_SHAPE_STYLE', () => {
    const style = createDefaultShapeStyle();
    expect(style).toEqual(DEFAULT_SHAPE_STYLE);
    // Must be a new reference (deep clone)
    expect(style).not.toBe(DEFAULT_SHAPE_STYLE);
    expect(style.fill).not.toBe(DEFAULT_SHAPE_STYLE.fill);
    expect(style.stroke).not.toBe(DEFAULT_SHAPE_STYLE.stroke);
    expect(style.shadow).not.toBe(DEFAULT_SHAPE_STYLE.shadow);
  });
});

// ---------------------------------------------------------------------------
// createRectangleShape
// ---------------------------------------------------------------------------
describe('createRectangleShape', () => {
  it('returns correct shapeType', () => {
    expect(createRectangleShape().shapeType).toBe('rectangle');
  });

  it('uses default parameters', () => {
    const shape = createRectangleShape();
    expect(shape).toEqual({
      shapeType: 'rectangle',
      centerX: 50,
      centerY: 50,
      width: 40,
      height: 30,
      rotation: 0,
      cornerRadius: 0,
    });
  });

  it('accepts custom parameters', () => {
    const shape = createRectangleShape(10, 20, 60, 80);
    expect(shape).toEqual({
      shapeType: 'rectangle',
      centerX: 10,
      centerY: 20,
      width: 60,
      height: 80,
      rotation: 0,
      cornerRadius: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// createEllipseShape
// ---------------------------------------------------------------------------
describe('createEllipseShape', () => {
  it('returns correct shapeType', () => {
    expect(createEllipseShape().shapeType).toBe('ellipse');
  });

  it('uses default parameters', () => {
    const shape = createEllipseShape();
    expect(shape).toEqual({
      shapeType: 'ellipse',
      centerX: 50,
      centerY: 50,
      radiusX: 20,
      radiusY: 15,
      rotation: 0,
    });
  });

  it('accepts custom parameters', () => {
    const shape = createEllipseShape(0, 0, 100, 50);
    expect(shape).toEqual({
      shapeType: 'ellipse',
      centerX: 0,
      centerY: 0,
      radiusX: 100,
      radiusY: 50,
      rotation: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// createPolygonShape
// ---------------------------------------------------------------------------
describe('createPolygonShape', () => {
  it('returns correct shapeType', () => {
    expect(createPolygonShape().shapeType).toBe('polygon');
  });

  it('generates the correct number of points (default 6)', () => {
    const shape = createPolygonShape();
    expect(shape.shapeType).toBe('polygon');
    if (shape.shapeType !== 'polygon') return;
    expect(shape.points).toHaveLength(6);
  });

  it('generates the correct number of points for custom sides', () => {
    const triangle = createPolygonShape(3);
    if (triangle.shapeType !== 'polygon') return;
    expect(triangle.points).toHaveLength(3);

    const octagon = createPolygonShape(8);
    if (octagon.shapeType !== 'polygon') return;
    expect(octagon.points).toHaveLength(8);
  });

  it('places first point at the top (angle = -PI/2)', () => {
    const shape = createPolygonShape(4);
    if (shape.shapeType !== 'polygon') return;
    const first = shape.points[0];
    expect(first).toBeDefined();
    // At angle -PI/2: x = 50 + cos(-PI/2)*25 = 50, y = 50 + sin(-PI/2)*25 = 25
    expect(first!.x).toBeCloseTo(50, 5);
    expect(first!.y).toBeCloseTo(25, 5);
  });

  it('distributes points evenly around the center (50, 50) with radius 25', () => {
    const sides = 6;
    const shape = createPolygonShape(sides);
    if (shape.shapeType !== 'polygon') return;

    for (let i = 0; i < sides; i++) {
      const pt = shape.points[i];
      expect(pt).toBeDefined();
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      expect(pt!.x).toBeCloseTo(50 + Math.cos(angle) * 25, 5);
      expect(pt!.y).toBeCloseTo(50 + Math.sin(angle) * 25, 5);
    }
  });

  it('handles sides = 1 edge case', () => {
    const shape = createPolygonShape(1);
    if (shape.shapeType !== 'polygon') return;
    expect(shape.points).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createStarShape
// ---------------------------------------------------------------------------
describe('createStarShape', () => {
  it('returns correct shapeType', () => {
    expect(createStarShape().shapeType).toBe('star');
  });

  it('uses default parameters', () => {
    const shape = createStarShape();
    expect(shape).toEqual({
      shapeType: 'star',
      centerX: 50,
      centerY: 50,
      points: 5,
      outerRadius: 25,
      innerRadiusRatio: 0.4,
      rotation: 0,
    });
  });

  it('accepts custom parameters', () => {
    const shape = createStarShape(10, 20, 8, 40);
    expect(shape.shapeType).toBe('star');
    if (shape.shapeType !== 'star') return;
    expect(shape.centerX).toBe(10);
    expect(shape.centerY).toBe(20);
    expect(shape.points).toBe(8);
    expect(shape.outerRadius).toBe(40);
    // Fixed values should remain
    expect(shape.innerRadiusRatio).toBe(0.4);
    expect(shape.rotation).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createLineShape
// ---------------------------------------------------------------------------
describe('createLineShape', () => {
  it('returns correct shapeType', () => {
    expect(createLineShape().shapeType).toBe('line');
  });

  it('uses default parameters (horizontal line)', () => {
    const shape = createLineShape();
    expect(shape).toEqual({
      shapeType: 'line',
      startX: 25,
      startY: 50,
      endX: 75,
      endY: 50,
    });
  });

  it('accepts custom parameters', () => {
    const shape = createLineShape(0, 0, 100, 100);
    expect(shape.shapeType).toBe('line');
    if (shape.shapeType !== 'line') return;
    expect(shape.startX).toBe(0);
    expect(shape.startY).toBe(0);
    expect(shape.endX).toBe(100);
    expect(shape.endY).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// createBezierShape
// ---------------------------------------------------------------------------
describe('createBezierShape', () => {
  it('returns correct shapeType', () => {
    expect(createBezierShape().shapeType).toBe('bezier');
  });

  it('returns an open path with two points', () => {
    const shape = createBezierShape();
    if (shape.shapeType !== 'bezier') return;
    expect(shape.closed).toBe(false);
    expect(shape.points).toHaveLength(2);
  });

  it('has correct anchor positions', () => {
    const shape = createBezierShape();
    if (shape.shapeType !== 'bezier') return;

    const p0 = shape.points[0];
    const p1 = shape.points[1];
    expect(p0).toBeDefined();
    expect(p1).toBeDefined();

    expect(p0!.anchor).toEqual({ x: 25, y: 50 });
    expect(p1!.anchor).toEqual({ x: 75, y: 50 });
  });

  it('has correct handle structure with linkedHandles', () => {
    const shape = createBezierShape();
    if (shape.shapeType !== 'bezier') return;

    const p0 = shape.points[0]!;
    expect(p0.handleIn).toEqual({ x: 0, y: 0 });
    expect(p0.handleOut).toEqual({ x: 10, y: -20 });
    expect(p0.linkedHandles).toBe(true);

    const p1 = shape.points[1]!;
    expect(p1.handleIn).toEqual({ x: -10, y: -20 });
    expect(p1.handleOut).toEqual({ x: 0, y: 0 });
    expect(p1.linkedHandles).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createShapeInstance
// ---------------------------------------------------------------------------
describe('createShapeInstance', () => {
  it('returns a ShapeInstance with generated id', () => {
    const shape = createRectangleShape();
    const instance = createShapeInstance(shape);
    expect(instance.id).toMatch(/^shape-.+/);
  });

  it('uses default name based on shapeType', () => {
    const shape = createEllipseShape();
    const instance = createShapeInstance(shape);
    expect(instance.name).toBe('Shape ellipse');
  });

  it('uses provided name when given', () => {
    const shape = createRectangleShape();
    const instance = createShapeInstance(shape, 'My Rect');
    expect(instance.name).toBe('My Rect');
  });

  it('includes shape reference', () => {
    const shape = createStarShape();
    const instance = createShapeInstance(shape);
    expect(instance.shape).toBe(shape);
  });

  it('uses default style when no style override provided', () => {
    const shape = createLineShape();
    const instance = createShapeInstance(shape);
    expect(instance.style).toEqual(DEFAULT_SHAPE_STYLE);
  });

  it('merges partial style overrides', () => {
    const shape = createRectangleShape();
    const instance = createShapeInstance(shape, undefined, {
      fill: { type: 'solid', color: '#ff0000', opacity: 0.5 },
    });
    expect(instance.style.fill.color).toBe('#ff0000');
    expect(instance.style.fill.opacity).toBe(0.5);
    // Stroke should still be default
    expect(instance.style.stroke).toEqual(DEFAULT_SHAPE_STYLE.stroke);
  });

  it('has correct default metadata', () => {
    const shape = createRectangleShape();
    const instance = createShapeInstance(shape);
    expect(instance.zIndex).toBe(0);
    expect(instance.visible).toBe(true);
    expect(instance.locked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyStyleOverrides
// ---------------------------------------------------------------------------
describe('applyStyleOverrides', () => {
  const getBaseStyle = () => createDefaultShapeStyle();

  it('returns base style when style is undefined', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, undefined);
    expect(result).toBe(base);
  });

  it('returns base style when style is not an object', () => {
    const base = getBaseStyle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = applyStyleOverrides(base, null as any);
    expect(result).toBe(base);
  });

  it('merges fill object overrides', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, {
      fill: { type: 'solid', color: '#ff0000', opacity: 0.8 },
    });
    expect(result.fill.color).toBe('#ff0000');
    expect(result.fill.opacity).toBe(0.8);
    expect(result.fill.type).toBe('solid');
    // Stroke unchanged
    expect(result.stroke).toEqual(base.stroke);
  });

  it('merges stroke object overrides', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, {
      stroke: { enabled: false, color: '#00ff00', width: 5 },
    });
    expect(result.stroke.enabled).toBe(false);
    expect(result.stroke.color).toBe('#00ff00');
    expect(result.stroke.width).toBe(5);
  });

  it('merges shadow object overrides', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, {
      shadow: { enabled: true, blur: 20 },
    });
    expect(result.shadow.enabled).toBe(true);
    expect(result.shadow.blur).toBe(20);
    // Other shadow properties remain from base
    expect(result.shadow.color).toBe(base.shadow.color);
  });

  it('applies fillColor shorthand', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, { fillColor: '#abcdef' });
    expect(result.fill.type).toBe('solid');
    expect(result.fill.color).toBe('#abcdef');
  });

  it('applies strokeColor shorthand', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, { strokeColor: '#123456' });
    expect(result.stroke.enabled).toBe(true);
    expect(result.stroke.color).toBe('#123456');
  });

  it('applies strokeWidth shorthand', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, { strokeWidth: 10 });
    expect(result.stroke.enabled).toBe(true);
    expect(result.stroke.width).toBe(10);
    // Color stays as base
    expect(result.stroke.color).toBe(base.stroke.color);
  });

  it('applies opacity shorthand to fill', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, { opacity: 0.5 });
    expect(result.fill.opacity).toBe(0.5);
  });

  it('does not mutate the base style', () => {
    const base = getBaseStyle();
    const originalFillColor = base.fill.color;
    applyStyleOverrides(base, { fillColor: '#ffffff' });
    expect(base.fill.color).toBe(originalFillColor);
  });

  it('applies both fill object and fillColor (fillColor wins for color)', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, {
      fill: { type: 'none', opacity: 0.3 },
      fillColor: '#aabbcc',
    });
    // fillColor runs after fill merge, so it overrides color and sets type to solid
    expect(result.fill.type).toBe('solid');
    expect(result.fill.color).toBe('#aabbcc');
  });

  it('handles empty style object', () => {
    const base = getBaseStyle();
    const result = applyStyleOverrides(base, {});
    expect(result).toEqual(base);
    expect(result).not.toBe(base); // structuredClone creates new object
  });
});

// ---------------------------------------------------------------------------
// createMaskInstance
// ---------------------------------------------------------------------------
describe('createMaskInstance', () => {
  it('returns mask with generated id prefixed with "mask-"', () => {
    const mask = createMaskInstance('rectangle');
    expect(mask['id']).toMatch(/^mask-.+/);
  });

  it('uses default name based on shapeType', () => {
    const mask = createMaskInstance('ellipse');
    expect(mask['name']).toBe('Mask ellipse');
  });

  it('uses provided name when given', () => {
    const mask = createMaskInstance('rectangle', 'Custom Mask');
    expect(mask['name']).toBe('Custom Mask');
  });

  it('has correct default metadata', () => {
    const mask = createMaskInstance('rectangle');
    expect(mask['enabled']).toBe(true);
    expect(mask['feather']).toBe(0);
    expect(mask['expansion']).toBe(0);
    expect(mask['opacity']).toBe(100);
    expect(mask['inverted']).toBe(false);
    expect(mask['blendMode']).toBe('add');
    expect(mask['order']).toBe(0);
  });

  describe('rectangle mask', () => {
    it('creates rectangle shape', () => {
      const mask = createMaskInstance('rectangle');
      const shape = mask['shape'] as Record<string, unknown>;
      expect(shape['type']).toBe('rectangle');
      expect(shape['centerX']).toBe(50);
      expect(shape['centerY']).toBe(50);
      expect(shape['width']).toBe(50);
      expect(shape['height']).toBe(50);
      expect(shape['rotation']).toBe(0);
      expect(shape['cornerRadius']).toBe(0);
    });
  });

  describe('ellipse mask', () => {
    it('creates ellipse shape', () => {
      const mask = createMaskInstance('ellipse');
      const shape = mask['shape'] as Record<string, unknown>;
      expect(shape['type']).toBe('ellipse');
      expect(shape['centerX']).toBe(50);
      expect(shape['centerY']).toBe(50);
      expect(shape['width']).toBe(50);
      expect(shape['height']).toBe(50);
      expect(shape['rotation']).toBe(0);
    });
  });

  describe('polygon mask', () => {
    it('creates triangle polygon', () => {
      const mask = createMaskInstance('polygon');
      const shape = mask['shape'] as Record<string, unknown>;
      expect(shape['type']).toBe('polygon');
      const points = shape['points'] as Array<{ x: number; y: number }>;
      expect(points).toHaveLength(3);
      expect(points[0]).toEqual({ x: 50, y: 20 });
      expect(points[1]).toEqual({ x: 80, y: 80 });
      expect(points[2]).toEqual({ x: 20, y: 80 });
    });
  });

  describe('bezier mask', () => {
    it('creates closed bezier path with 4 points', () => {
      const mask = createMaskInstance('bezier');
      const shape = mask['shape'] as Record<string, unknown>;
      expect(shape['type']).toBe('bezier');
      expect(shape['closed']).toBe(true);

      const points = shape['points'] as Array<{
        anchor: { x: number; y: number };
        handleIn: { x: number; y: number };
        handleOut: { x: number; y: number };
        linkedHandles: boolean;
      }>;
      expect(points).toHaveLength(4);
    });

    it('has correct anchor positions for bezier mask', () => {
      const mask = createMaskInstance('bezier');
      const shape = mask['shape'] as Record<string, unknown>;
      const points = shape['points'] as Array<{
        anchor: { x: number; y: number };
        handleIn: { x: number; y: number };
        handleOut: { x: number; y: number };
        linkedHandles: boolean;
      }>;
      expect(points[0]!.anchor).toEqual({ x: 25, y: 25 });
      expect(points[1]!.anchor).toEqual({ x: 75, y: 25 });
      expect(points[2]!.anchor).toEqual({ x: 75, y: 75 });
      expect(points[3]!.anchor).toEqual({ x: 25, y: 75 });
    });

    it('all bezier points have zero handles and linked', () => {
      const mask = createMaskInstance('bezier');
      const shape = mask['shape'] as Record<string, unknown>;
      const points = shape['points'] as Array<{
        anchor: { x: number; y: number };
        handleIn: { x: number; y: number };
        handleOut: { x: number; y: number };
        linkedHandles: boolean;
      }>;
      for (const pt of points) {
        expect(pt.handleIn).toEqual({ x: 0, y: 0 });
        expect(pt.handleOut).toEqual({ x: 0, y: 0 });
        expect(pt.linkedHandles).toBe(true);
      }
    });
  });

  describe('unknown shape type', () => {
    it('falls back to rectangle mask', () => {
      const mask = createMaskInstance('unknown-type');
      const shape = mask['shape'] as Record<string, unknown>;
      expect(shape['type']).toBe('rectangle');
    });
  });
});
