/**
 * ShapeRenderer - 形状渲染组件
 *
 * 负责将 ShapeInstance 渲染为 SVG 图形
 * 支持所有形状类型：矩形、椭圆、多边形、星形、线段、贝塞尔路径
 */

import { memo, useMemo, Fragment, type ReactNode, type MouseEvent } from 'react';
import type {
  ShapeInstance,
  Shape,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
  BezierShape,
  ShapeStyle,
  ShapeFill,
  ShapeShadow,
  GradientFill,
} from '../types/shape';
import { generateStarPoints } from '../types/shape';

// =============================================================================
// Props Types
// =============================================================================

interface ShapeRendererProps {
  /** Shape instance to render */
  shape: ShapeInstance;
  /** Container width in pixels */
  width: number;
  /** Container height in pixels */
  height: number;
  /** Whether shape is selected */
  selected?: boolean;
  /** Click handler */
  onClick?: (shapeId: string) => void;
  /** Interactive mode (show handles when selected) */
  interactive?: boolean;
}

interface SingleShapeProps {
  shape: Shape;
  style: ShapeStyle;
  width: number;
  height: number;
  gradientId: string;
  shadowId: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert percentage to pixel value
 */
function pct2px(pct: number, size: number): number {
  return (pct / 100) * size;
}

/**
 * Generate SVG gradient definition
 */
function renderGradientDef(gradient: GradientFill, gradientId: string): React.ReactNode {
  if (gradient.type === 'linear') {
    const angle = gradient.angle || 0;
    const rad = (angle * Math.PI) / 180;
    const x1 = 50 - Math.cos(rad) * 50;
    const y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50;
    const y2 = 50 + Math.sin(rad) * 50;

    return (
      <linearGradient id={gradientId} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}>
        {gradient.stops.map((stop, i) => (
          <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
        ))}
      </linearGradient>
    );
  } else {
    const cx = gradient.centerX ?? 0.5;
    const cy = gradient.centerY ?? 0.5;
    const r = gradient.radius ?? 0.5;

    return (
      <radialGradient id={gradientId} cx={`${cx * 100}%`} cy={`${cy * 100}%`} r={`${r * 100}%`}>
        {gradient.stops.map((stop, i) => (
          <stop key={i} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
        ))}
      </radialGradient>
    );
  }
}

/**
 * Generate SVG shadow filter definition
 */
function renderShadowFilter(shadow: ShapeShadow, shadowId: string): React.ReactNode {
  if (!shadow.enabled) return null;

  return (
    <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow
        dx={shadow.offsetX}
        dy={shadow.offsetY}
        stdDeviation={shadow.blur / 2}
        floodColor={shadow.color}
      />
    </filter>
  );
}

/**
 * Get fill attribute value
 */
function getFillValue(fill: ShapeFill, gradientId: string): string {
  if (fill.type === 'none') return 'none';
  if (fill.type === 'gradient' && fill.gradient) return `url(#${gradientId})`;
  return fill.color || 'none';
}

/**
 * Get common SVG style props (without ref-related issues)
 */
interface ShapeStyleAttrs {
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  strokeMiterlimit?: number;
  strokeDasharray?: string;
  strokeDashoffset?: number;
  filter?: string;
}

function getStyleProps(style: ShapeStyle, gradientId: string, shadowId: string): ShapeStyleAttrs {
  const { fill, stroke, shadow } = style;

  return {
    fill: getFillValue(fill, gradientId),
    fillOpacity: fill.type !== 'none' ? fill.opacity : undefined,
    stroke: stroke.enabled ? stroke.color : 'none',
    strokeWidth: stroke.enabled ? stroke.width : undefined,
    strokeOpacity: stroke.enabled ? stroke.opacity : undefined,
    strokeLinecap: stroke.enabled ? stroke.lineCap : undefined,
    strokeLinejoin: stroke.enabled ? stroke.lineJoin : undefined,
    strokeMiterlimit: stroke.enabled && stroke.lineJoin === 'miter' ? stroke.miterLimit : undefined,
    strokeDasharray:
      stroke.enabled && stroke.dashArray.length > 0 ? stroke.dashArray.join(' ') : undefined,
    strokeDashoffset: stroke.enabled && stroke.dashOffset ? stroke.dashOffset : undefined,
    filter: shadow.enabled ? `url(#${shadowId})` : undefined,
  };
}

// =============================================================================
// Shape Renderers
// =============================================================================

const RectangleRenderer = memo(function RectangleRenderer({
  shape,
  style,
  width,
  height,
  gradientId,
  shadowId,
}: SingleShapeProps) {
  const rect = shape as RectangleShape;
  const cx = pct2px(rect.centerX, width);
  const cy = pct2px(rect.centerY, height);
  const w = pct2px(rect.width, width);
  const h = pct2px(rect.height, height);
  const rx = (rect.cornerRadius / 100) * Math.min(w, h);

  const styleProps = getStyleProps(style, gradientId, shadowId);

  return (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={rx}
      ry={rx}
      transform={rect.rotation ? `rotate(${rect.rotation} ${cx} ${cy})` : undefined}
      {...styleProps}
    />
  );
});

const EllipseRenderer = memo(function EllipseRenderer({
  shape,
  style,
  width,
  height,
  gradientId,
  shadowId,
}: SingleShapeProps) {
  const ellipse = shape as EllipseShape;
  const cx = pct2px(ellipse.centerX, width);
  const cy = pct2px(ellipse.centerY, height);
  const rx = pct2px(ellipse.radiusX, width);
  const ry = pct2px(ellipse.radiusY, height);

  const styleProps = getStyleProps(style, gradientId, shadowId);

  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      transform={ellipse.rotation ? `rotate(${ellipse.rotation} ${cx} ${cy})` : undefined}
      {...styleProps}
    />
  );
});

const PolygonRenderer = memo(function PolygonRenderer({
  shape,
  style,
  width,
  height,
  gradientId,
  shadowId,
}: SingleShapeProps) {
  const polygon = shape as PolygonShape;
  const points = polygon.points
    .map((p) => `${pct2px(p.x, width)},${pct2px(p.y, height)}`)
    .join(' ');

  const styleProps = getStyleProps(style, gradientId, shadowId);

  return <polygon points={points} {...styleProps} />;
});

const StarRenderer = memo(function StarRenderer({
  shape,
  style,
  width,
  height,
  gradientId,
  shadowId,
}: SingleShapeProps) {
  const star = shape as StarShape;
  const starPoints = generateStarPoints(star);
  const points = starPoints.map((p) => `${pct2px(p.x, width)},${pct2px(p.y, height)}`).join(' ');

  const styleProps = getStyleProps(style, gradientId, shadowId);

  return <polygon points={points} {...styleProps} />;
});

const LineRenderer = memo(function LineRenderer({
  shape,
  style,
  width,
  height,
  shadowId,
}: Omit<SingleShapeProps, 'gradientId'>) {
  const line = shape as LineShape;
  const x1 = pct2px(line.startX, width);
  const y1 = pct2px(line.startY, height);
  const x2 = pct2px(line.endX, width);
  const y2 = pct2px(line.endY, height);

  const { stroke, shadow } = style;

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke.enabled ? stroke.color : '#333'}
      strokeWidth={stroke.enabled ? stroke.width : 2}
      strokeOpacity={stroke.enabled ? stroke.opacity : 1}
      strokeLinecap={stroke.lineCap}
      strokeLinejoin={stroke.lineJoin}
      strokeDasharray={stroke.dashArray.length > 0 ? stroke.dashArray.join(' ') : undefined}
      filter={shadow.enabled ? `url(#${shadowId})` : undefined}
    />
  );
});

const BezierRenderer = memo(function BezierRenderer({
  shape,
  style,
  width,
  height,
  gradientId,
  shadowId,
}: SingleShapeProps) {
  const bezier = shape as BezierShape;

  // Build SVG path from bezier points
  const pathData = useMemo(() => {
    if (bezier.points.length === 0) return '';

    const pts = bezier.points;
    let d = `M ${pct2px(pts[0].anchor.x, width)},${pct2px(pts[0].anchor.y, height)}`;

    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];

      // Control point 1 (from previous point's handleOut)
      const cp1x = pct2px(prev.anchor.x + prev.handleOut.x, width);
      const cp1y = pct2px(prev.anchor.y + prev.handleOut.y, height);

      // Control point 2 (from current point's handleIn)
      const cp2x = pct2px(curr.anchor.x + curr.handleIn.x, width);
      const cp2y = pct2px(curr.anchor.y + curr.handleIn.y, height);

      // End point
      const ex = pct2px(curr.anchor.x, width);
      const ey = pct2px(curr.anchor.y, height);

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${ex},${ey}`;
    }

    if (bezier.closed && pts.length > 1) {
      const last = pts[pts.length - 1];
      const first = pts[0];

      const cp1x = pct2px(last.anchor.x + last.handleOut.x, width);
      const cp1y = pct2px(last.anchor.y + last.handleOut.y, height);
      const cp2x = pct2px(first.anchor.x + first.handleIn.x, width);
      const cp2y = pct2px(first.anchor.y + first.handleIn.y, height);

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${pct2px(first.anchor.x, width)},${pct2px(first.anchor.y, height)} Z`;
    }

    return d;
  }, [bezier.points, bezier.closed, width, height]);

  const styleProps = getStyleProps(style, gradientId, shadowId);

  return <path d={pathData} {...styleProps} />;
});

// =============================================================================
// Main Component
// =============================================================================

export const ShapeRenderer = memo(function ShapeRenderer({
  shape,
  width,
  height,
  selected,
  onClick,
  interactive = false,
}: ShapeRendererProps) {
  // Skip invisible shapes
  if (!shape.visible) return null;

  const gradientId = `gradient-${shape.id}`;
  const shadowId = `shadow-${shape.id}`;

  // Determine which renderer to use
  const renderShape = () => {
    const props: SingleShapeProps = {
      shape: shape.shape,
      style: shape.style,
      width,
      height,
      gradientId,
      shadowId,
    };

    switch (shape.shape.shapeType) {
      case 'rectangle':
        return <RectangleRenderer {...props} />;
      case 'ellipse':
        return <EllipseRenderer {...props} />;
      case 'polygon':
        return <PolygonRenderer {...props} />;
      case 'star':
        return <StarRenderer {...props} />;
      case 'line':
        return (
          <LineRenderer
            shape={shape.shape}
            style={shape.style}
            width={width}
            height={height}
            shadowId={shadowId}
          />
        );
      case 'bezier':
        return <BezierRenderer {...props} />;
      default:
        return null;
    }
  };

  // Generate defs for gradients and shadows
  const defs = useMemo(() => {
    const elements: ReactNode[] = [];

    // Gradient
    if (shape.style.fill.type === 'gradient' && shape.style.fill.gradient) {
      elements.push(
        <Fragment key="gradient">
          {renderGradientDef(shape.style.fill.gradient, gradientId)}
        </Fragment>,
      );
    }

    // Shadow
    if (shape.style.shadow.enabled) {
      elements.push(
        <Fragment key="shadow">{renderShadowFilter(shape.style.shadow, shadowId)}</Fragment>,
      );
    }

    return elements.length > 0 ? <defs>{elements}</defs> : null;
  }, [shape.style.fill, shape.style.shadow, gradientId, shadowId]);

  // Handle click
  const handleClick = (e: MouseEvent) => {
    if (onClick && !shape.locked) {
      e.stopPropagation();
      onClick(shape.id);
    }
  };

  return (
    <g
      className={`shape-instance ${selected ? 'selected' : ''} ${shape.locked ? 'locked' : ''}`}
      onClick={handleClick}
      style={{ cursor: shape.locked ? 'not-allowed' : 'pointer' }}
    >
      {defs}
      {renderShape()}

      {/* Selection outline */}
      {selected && interactive && (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="none"
          stroke="#4a90d9"
          strokeWidth={2}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}
    </g>
  );
});

// =============================================================================
// Shape Layer Renderer (renders all shapes in a ShapeElement)
// =============================================================================

interface ShapeLayerRendererProps {
  /** Shape instances to render, sorted by zIndex */
  shapes: ShapeInstance[];
  /** Container width */
  width: number;
  /** Container height */
  height: number;
  /** Currently selected shape ID */
  selectedShapeId?: string;
  /** Shape click handler */
  onShapeClick?: (shapeId: string) => void;
  /** Interactive mode */
  interactive?: boolean;
}

export const ShapeLayerRenderer = memo(function ShapeLayerRenderer({
  shapes,
  width,
  height,
  selectedShapeId,
  onShapeClick,
  interactive = false,
}: ShapeLayerRendererProps) {
  // Sort shapes by zIndex (lower zIndex = drawn first = behind)
  const sortedShapes = useMemo(() => {
    return [...shapes].sort((a, b) => a.zIndex - b.zIndex);
  }, [shapes]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shape-layer-renderer"
      style={{ overflow: 'visible' }}
    >
      {sortedShapes.map((shape) => (
        <ShapeRenderer
          key={shape.id}
          shape={shape}
          width={width}
          height={height}
          selected={shape.id === selectedShapeId}
          onClick={onShapeClick}
          interactive={interactive}
        />
      ))}
    </svg>
  );
});

export default ShapeRenderer;
