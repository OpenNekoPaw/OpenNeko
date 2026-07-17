/**
 * PenToolEditor - 钢笔工具路径编辑器
 *
 * 提供交互式贝塞尔路径编辑功能：
 * - 添加/删除/移动锚点
 * - 调整控制手柄
 * - 闭合/打开路径
 * - 转换点类型（尖角/平滑）
 */

import { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { isComposingKeyboardEvent, isEditableTarget } from '@neko/ui/keyboard';
import type { BezierShape, ShapeInstance } from '../types/shape';
import type { Point2D, BezierPoint } from '../types/mask';

// =============================================================================
// Types
// =============================================================================

export type PenToolMode = 'select' | 'add' | 'delete' | 'convert';

interface PenToolEditorProps {
  /** 形状实例（必须是贝塞尔类型） */
  shape: ShapeInstance;
  /** 容器宽度 */
  width: number;
  /** 容器高度 */
  height: number;
  /** 当前工具模式 */
  mode: PenToolMode;
  /** 路径更新回调 */
  onPathChange: (points: BezierPoint[], closed: boolean) => void;
  /** 选中点变化回调 */
  onSelectionChange?: (pointIndex: number | null) => void;
  /** 是否显示控制手柄 */
  showHandles?: boolean;
  /** 是否只读 */
  readonly?: boolean;
}

interface DragState {
  type: 'anchor' | 'handleIn' | 'handleOut';
  pointIndex: number;
  startPos: Point2D;
  originalPoint: BezierPoint;
}

// =============================================================================
// Constants
// =============================================================================

const POINT_RADIUS = 6;
const HANDLE_RADIUS = 4;
const HIT_TOLERANCE = 10;
// const SNAP_THRESHOLD = 5; // Reserved for future snap-to-grid feature

// Colors
const COLORS = {
  anchor: '#ffffff',
  anchorSelected: '#4a90d9',
  anchorHover: '#7cb3f0',
  handle: '#ff6b6b',
  handleLine: 'rgba(255, 107, 107, 0.5)',
  path: '#4a90d9',
  pathPreview: 'rgba(74, 144, 217, 0.3)',
  closePath: '#22c55e',
};

// =============================================================================
// Utility Functions
// =============================================================================

function pct2px(pct: number, size: number): number {
  return (pct / 100) * size;
}

function px2pct(px: number, size: number): number {
  return (px / size) * 100;
}

function distance(p1: Point2D, p2: Point2D): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// clamp is reserved for future boundary constraint feature
// function clamp(value: number, min: number, max: number): number {
//   return Math.min(max, Math.max(min, value));
// }

/**
 * 生成 SVG 路径数据
 */
function generatePathData(
  points: BezierPoint[],
  closed: boolean,
  width: number,
  height: number,
): string {
  if (points.length === 0) return '';

  const pts = points;
  let d = `M ${pct2px(pts[0].anchor.x, width)},${pct2px(pts[0].anchor.y, height)}`;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];

    const cp1x = pct2px(prev.anchor.x + prev.handleOut.x, width);
    const cp1y = pct2px(prev.anchor.y + prev.handleOut.y, height);
    const cp2x = pct2px(curr.anchor.x + curr.handleIn.x, width);
    const cp2y = pct2px(curr.anchor.y + curr.handleIn.y, height);
    const ex = pct2px(curr.anchor.x, width);
    const ey = pct2px(curr.anchor.y, height);

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${ex},${ey}`;
  }

  if (closed && pts.length > 1) {
    const last = pts[pts.length - 1];
    const first = pts[0];

    const cp1x = pct2px(last.anchor.x + last.handleOut.x, width);
    const cp1y = pct2px(last.anchor.y + last.handleOut.y, height);
    const cp2x = pct2px(first.anchor.x + first.handleIn.x, width);
    const cp2y = pct2px(first.anchor.y + first.handleIn.y, height);

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${pct2px(first.anchor.x, width)},${pct2px(first.anchor.y, height)} Z`;
  }

  return d;
}

/**
 * 创建新的贝塞尔点
 */
function createBezierPoint(x: number, y: number): BezierPoint {
  return {
    anchor: { x, y },
    handleIn: { x: 0, y: 0 },
    handleOut: { x: 0, y: 0 },
    linkedHandles: true,
  };
}

/**
 * 转换点类型：尖角 ↔ 平滑
 */
function togglePointType(point: BezierPoint): BezierPoint {
  if (point.linkedHandles) {
    // 转换为尖角：解除手柄链接
    return { ...point, linkedHandles: false };
  } else {
    // 转换为平滑：链接手柄并对称
    const avgLen =
      (Math.sqrt(point.handleIn.x ** 2 + point.handleIn.y ** 2) +
        Math.sqrt(point.handleOut.x ** 2 + point.handleOut.y ** 2)) /
      2;

    // 使用 handleOut 方向
    const angle = Math.atan2(point.handleOut.y, point.handleOut.x);

    return {
      ...point,
      handleIn: { x: -Math.cos(angle) * avgLen, y: -Math.sin(angle) * avgLen },
      handleOut: { x: Math.cos(angle) * avgLen, y: Math.sin(angle) * avgLen },
      linkedHandles: true,
    };
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

interface AnchorPointProps {
  point: BezierPoint;
  index: number;
  width: number;
  height: number;
  selected: boolean;
  hovered: boolean;
  onMouseDown: (index: number, type: 'anchor' | 'handleIn' | 'handleOut') => void;
  onMouseEnter: (index: number) => void;
  onMouseLeave: () => void;
  showHandles: boolean;
  mode: PenToolMode;
  isFirst: boolean;
  canClose: boolean;
}

const AnchorPoint = memo(function AnchorPoint({
  point,
  index,
  width,
  height,
  selected,
  hovered,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  showHandles,
  mode,
  isFirst,
  canClose,
}: AnchorPointProps) {
  const x = pct2px(point.anchor.x, width);
  const y = pct2px(point.anchor.y, height);

  // Handle positions (relative to anchor, converted to absolute)
  const handleInX = x + pct2px(point.handleIn.x, width);
  const handleInY = y + pct2px(point.handleIn.y, height);
  const handleOutX = x + pct2px(point.handleOut.x, width);
  const handleOutY = y + pct2px(point.handleOut.y, height);

  const hasHandleIn = point.handleIn.x !== 0 || point.handleIn.y !== 0;
  const hasHandleOut = point.handleOut.x !== 0 || point.handleOut.y !== 0;

  // Determine anchor color
  let anchorColor = COLORS.anchor;
  if (selected) anchorColor = COLORS.anchorSelected;
  else if (hovered) anchorColor = COLORS.anchorHover;
  if (isFirst && canClose && hovered) anchorColor = COLORS.closePath;

  // Cursor based on mode
  const getCursor = () => {
    switch (mode) {
      case 'add':
        return 'crosshair';
      case 'delete':
        return 'not-allowed';
      case 'convert':
        return 'pointer';
      default:
        return 'move';
    }
  };

  return (
    <g className="bezier-point">
      {/* Handle lines and circles (only when selected or showHandles) */}
      {(selected || showHandles) && (
        <>
          {/* Handle In line */}
          {hasHandleIn && (
            <line
              x1={x}
              y1={y}
              x2={handleInX}
              y2={handleInY}
              stroke={COLORS.handleLine}
              strokeWidth={1}
            />
          )}

          {/* Handle Out line */}
          {hasHandleOut && (
            <line
              x1={x}
              y1={y}
              x2={handleOutX}
              y2={handleOutY}
              stroke={COLORS.handleLine}
              strokeWidth={1}
            />
          )}

          {/* Handle In circle */}
          {hasHandleIn && (
            <circle
              cx={handleInX}
              cy={handleInY}
              r={HANDLE_RADIUS}
              fill={COLORS.handle}
              stroke="#fff"
              strokeWidth={1}
              cursor="move"
              onMouseDown={(e) => {
                e.stopPropagation();
                onMouseDown(index, 'handleIn');
              }}
            />
          )}

          {/* Handle Out circle */}
          {hasHandleOut && (
            <circle
              cx={handleOutX}
              cy={handleOutY}
              r={HANDLE_RADIUS}
              fill={COLORS.handle}
              stroke="#fff"
              strokeWidth={1}
              cursor="move"
              onMouseDown={(e) => {
                e.stopPropagation();
                onMouseDown(index, 'handleOut');
              }}
            />
          )}
        </>
      )}

      {/* Anchor point */}
      <circle
        cx={x}
        cy={y}
        r={selected ? POINT_RADIUS + 2 : POINT_RADIUS}
        fill={anchorColor}
        stroke="#333"
        strokeWidth={selected ? 2 : 1}
        cursor={getCursor()}
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(index, 'anchor');
        }}
        onMouseEnter={() => onMouseEnter(index)}
        onMouseLeave={onMouseLeave}
      />

      {/* Point index label (debug) */}
      {selected && (
        <text x={x} y={y - POINT_RADIUS - 6} fontSize={10} fill="#666" textAnchor="middle">
          {index}
        </text>
      )}
    </g>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const PenToolEditor = memo(function PenToolEditor({
  shape,
  width,
  height,
  mode,
  onPathChange,
  onSelectionChange,
  showHandles = true,
  readonly = false,
}: PenToolEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [previewPoint, setPreviewPoint] = useState<Point2D | null>(null);

  // Extract bezier data from shape
  const bezierShape = shape.shape as BezierShape;
  const points = bezierShape.points;
  const closed = bezierShape.closed;

  // Generate path data
  const pathData = useMemo(
    () => generatePathData(points, closed, width, height),
    [points, closed, width, height],
  );

  // Preview path (when adding point)
  const previewPathData = useMemo(() => {
    if (!previewPoint || points.length === 0 || mode !== 'add') return '';

    const lastPoint = points[points.length - 1];
    const lastX = pct2px(lastPoint.anchor.x, width);
    const lastY = pct2px(lastPoint.anchor.y, height);
    const cp1x = pct2px(lastPoint.anchor.x + lastPoint.handleOut.x, width);
    const cp1y = pct2px(lastPoint.anchor.y + lastPoint.handleOut.y, height);

    return `M ${lastX},${lastY} C ${cp1x},${cp1y} ${previewPoint.x},${previewPoint.y} ${previewPoint.x},${previewPoint.y}`;
  }, [previewPoint, points, width, height, mode]);

  // Get mouse position relative to SVG
  const getMousePos = useCallback((e: MouseEvent | React.MouseEvent): Point2D => {
    if (!svgRef.current) return { x: 0, y: 0 };

    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Handle point selection change
  useEffect(() => {
    onSelectionChange?.(selectedPoint);
  }, [selectedPoint, onSelectionChange]);

  // Mouse down handler
  const handleMouseDown = useCallback(
    (pointIndex: number, type: 'anchor' | 'handleIn' | 'handleOut') => {
      if (readonly) return;

      const point = points[pointIndex];

      switch (mode) {
        case 'select':
          setSelectedPoint(pointIndex);
          setDragState({
            type,
            pointIndex,
            startPos: { x: 0, y: 0 },
            originalPoint: { ...point },
          });
          break;

        case 'delete':
          if (points.length > 2) {
            const newPoints = points.filter((_, i) => i !== pointIndex);
            onPathChange(newPoints, closed && newPoints.length > 2);
            setSelectedPoint(null);
          }
          break;

        case 'convert':
          const newPoints = [...points];
          newPoints[pointIndex] = togglePointType(point);
          onPathChange(newPoints, closed);
          break;

        case 'add':
          // 在添加模式下点击第一个点时闭合路径
          if (pointIndex === 0 && points.length > 2 && !closed) {
            onPathChange(points, true);
          }
          break;
      }
    },
    [mode, points, closed, readonly, onPathChange],
  );

  // SVG click handler (add new point)
  const handleSvgClick = useCallback(
    (e: React.MouseEvent) => {
      if (readonly || mode !== 'add') return;

      // Don't add if clicking on existing point
      if ((e.target as Element).closest('.bezier-point')) return;

      const pos = getMousePos(e);
      const pctX = px2pct(pos.x, width);
      const pctY = px2pct(pos.y, height);

      // Check if clicking near first point to close
      if (points.length > 2 && !closed) {
        const firstX = pct2px(points[0].anchor.x, width);
        const firstY = pct2px(points[0].anchor.y, height);
        if (distance(pos, { x: firstX, y: firstY }) < HIT_TOLERANCE) {
          onPathChange(points, true);
          return;
        }
      }

      // Add new point
      const newPoint = createBezierPoint(pctX, pctY);

      // If there's a previous point, create smooth handles
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        const dx = pctX - lastPoint.anchor.x;
        const dy = pctY - lastPoint.anchor.y;
        const handleLen = Math.sqrt(dx * dx + dy * dy) * 0.3;
        const angle = Math.atan2(dy, dx);

        newPoint.handleIn = {
          x: -Math.cos(angle) * handleLen,
          y: -Math.sin(angle) * handleLen,
        };
      }

      onPathChange([...points, newPoint], closed);
      setSelectedPoint(points.length);
    },
    [mode, points, closed, width, height, readonly, getMousePos, onPathChange],
  );

  // Mouse move handler (during drag)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getMousePos(e);

      // Update preview point in add mode
      if (mode === 'add' && !dragState) {
        setPreviewPoint(pos);
      }

      // Handle dragging
      if (!dragState || readonly) return;

      const { type, pointIndex, originalPoint } = dragState;
      const pctX = px2pct(pos.x, width);
      const pctY = px2pct(pos.y, height);

      const newPoints = [...points];
      const point = { ...newPoints[pointIndex] };

      switch (type) {
        case 'anchor': {
          // Move anchor point to new position
          point.anchor = { x: pctX, y: pctY };
          break;
        }

        case 'handleIn': {
          const anchorX = pct2px(point.anchor.x, width);
          const anchorY = pct2px(point.anchor.y, height);
          const relX = px2pct(pos.x - anchorX, width);
          const relY = px2pct(pos.y - anchorY, height);

          point.handleIn = { x: relX, y: relY };

          // Mirror handleOut if linked
          if (point.linkedHandles) {
            const len = Math.sqrt(relX ** 2 + relY ** 2);
            const outLen = Math.sqrt(
              originalPoint.handleOut.x ** 2 + originalPoint.handleOut.y ** 2,
            );
            if (len > 0) {
              point.handleOut = {
                x: (-relX / len) * outLen,
                y: (-relY / len) * outLen,
              };
            }
          }
          break;
        }

        case 'handleOut': {
          const anchorX = pct2px(point.anchor.x, width);
          const anchorY = pct2px(point.anchor.y, height);
          const relX = px2pct(pos.x - anchorX, width);
          const relY = px2pct(pos.y - anchorY, height);

          point.handleOut = { x: relX, y: relY };

          // Mirror handleIn if linked
          if (point.linkedHandles) {
            const len = Math.sqrt(relX ** 2 + relY ** 2);
            const inLen = Math.sqrt(originalPoint.handleIn.x ** 2 + originalPoint.handleIn.y ** 2);
            if (len > 0) {
              point.handleIn = {
                x: (-relX / len) * inLen,
                y: (-relY / len) * inLen,
              };
            }
          }
          break;
        }
      }

      newPoints[pointIndex] = point;
      onPathChange(newPoints, closed);
    },
    [dragState, mode, points, closed, width, height, readonly, getMousePos, onPathChange],
  );

  // Mouse up handler
  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Mouse leave handler
  const handleMouseLeave = useCallback(() => {
    setPreviewPoint(null);
    setHoveredPoint(null);
    if (dragState) {
      setDragState(null);
    }
  }, [dragState]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readonly) return;
      if (isComposingKeyboardEvent(e) || isEditableTarget(e.target)) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedPoint !== null && points.length > 2) {
            const newPoints = points.filter((_, i) => i !== selectedPoint);
            onPathChange(newPoints, closed && newPoints.length > 2);
            setSelectedPoint(null);
          }
          break;

        case 'Escape':
          setSelectedPoint(null);
          setDragState(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPoint, points, closed, readonly, onPathChange]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pen-tool-editor"
      style={{
        cursor: mode === 'add' ? 'crosshair' : 'default',
        userSelect: 'none',
      }}
      onClick={handleSvgClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main path */}
      <path
        d={pathData}
        fill="none"
        stroke={COLORS.path}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />

      {/* Preview path (when adding) */}
      {previewPathData && (
        <path
          d={previewPathData}
          fill="none"
          stroke={COLORS.pathPreview}
          strokeWidth={2}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}

      {/* Anchor points with handles */}
      {points.map((point, index) => (
        <AnchorPoint
          key={index}
          point={point}
          index={index}
          width={width}
          height={height}
          selected={selectedPoint === index}
          hovered={hoveredPoint === index}
          onMouseDown={handleMouseDown}
          onMouseEnter={setHoveredPoint}
          onMouseLeave={() => setHoveredPoint(null)}
          showHandles={showHandles}
          mode={mode}
          isFirst={index === 0}
          canClose={!closed && points.length > 2}
        />
      ))}

      {/* Preview point (when adding) */}
      {previewPoint && mode === 'add' && (
        <circle
          cx={previewPoint.x}
          cy={previewPoint.y}
          r={POINT_RADIUS}
          fill="rgba(74, 144, 217, 0.5)"
          stroke="#4a90d9"
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
    </svg>
  );
});

// =============================================================================
// Toolbar Component
// =============================================================================

interface PenToolbarProps {
  mode: PenToolMode;
  onModeChange: (mode: PenToolMode) => void;
  onClosePath?: () => void;
  onOpenPath?: () => void;
  canClose?: boolean;
  canOpen?: boolean;
}

export const PenToolbar = memo(function PenToolbar({
  mode,
  onModeChange,
  onClosePath,
  onOpenPath,
  canClose = false,
  canOpen = false,
}: PenToolbarProps) {
  const tools: { mode: PenToolMode; icon: string; label: string }[] = [
    { mode: 'select', icon: '↖', label: '选择/移动' },
    { mode: 'add', icon: '+', label: '添加点' },
    { mode: 'delete', icon: '−', label: '删除点' },
    { mode: 'convert', icon: '◇', label: '转换点' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-800 rounded">
      {tools.map((tool) => (
        <button
          key={tool.mode}
          className={`px-2 py-1 text-sm rounded transition-colors ${
            mode === tool.mode
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          onClick={() => onModeChange(tool.mode)}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}

      <div className="w-px h-4 bg-gray-600 mx-1" />

      {canClose && (
        <button
          className="px-2 py-1 text-sm bg-green-700 text-white rounded hover:bg-green-600"
          onClick={onClosePath}
          title="闭合路径"
        >
          ○
        </button>
      )}

      {canOpen && (
        <button
          className="px-2 py-1 text-sm bg-yellow-700 text-white rounded hover:bg-yellow-600"
          onClick={onOpenPath}
          title="打开路径"
        >
          ⌒
        </button>
      )}
    </div>
  );
});

export default PenToolEditor;
