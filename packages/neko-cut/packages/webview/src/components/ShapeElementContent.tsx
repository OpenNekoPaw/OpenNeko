/**
 * ShapeElementContent - Timeline shape element content rendering
 *
 * Displays a simplified preview of the shape element on the timeline.
 * Uses the engine-aligned ShapeElement fields (shapeType, fill, stroke, strokeWidth).
 */

import { memo } from 'react';
import type { ShapeElement } from '../types';

interface ShapeElementContentProps {
  element: ShapeElement;
  width: number;
  height: number;
}

/**
 * Get a simplified SVG path for the shape type thumbnail
 */
function getShapePath(shapeType: string, w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.35;
  const ry = h * 0.35;

  switch (shapeType) {
    case 'rectangle':
      return `M ${cx - rx} ${cy - ry} h ${rx * 2} v ${ry * 2} h ${-rx * 2} Z`;
    case 'ellipse': {
      const kappa = 0.5522847498;
      const ox = rx * kappa;
      const oy = ry * kappa;
      return `M ${cx - rx} ${cy}
        C ${cx - rx} ${cy - oy}, ${cx - ox} ${cy - ry}, ${cx} ${cy - ry}
        C ${cx + ox} ${cy - ry}, ${cx + rx} ${cy - oy}, ${cx + rx} ${cy}
        C ${cx + rx} ${cy + oy}, ${cx + ox} ${cy + ry}, ${cx} ${cy + ry}
        C ${cx - ox} ${cy + ry}, ${cx - rx} ${cy + oy}, ${cx - rx} ${cy} Z`;
    }
    case 'polygon': {
      // Default pentagon
      const sides = 5;
      const points = Array.from({ length: sides }, (_, i) => {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
      });
      return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    }
    case 'star': {
      const numPoints = 5;
      const innerR = rx * 0.4;
      const points: string[] = [];
      for (let i = 0; i < numPoints * 2; i++) {
        const angle = (i * Math.PI) / numPoints - Math.PI / 2;
        const r = i % 2 === 0 ? rx : innerR;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        points.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
      }
      return points.join(' ') + ' Z';
    }
    case 'line':
      return `M ${cx - rx} ${cy + ry} L ${cx + rx} ${cy - ry}`;
    case 'bezier':
      return `M ${cx - rx} ${cy + ry} C ${cx - rx * 0.5} ${cy - ry}, ${cx + rx * 0.5} ${cy - ry}, ${cx + rx} ${cy + ry}`;
    default:
      return `M ${cx - rx} ${cy - ry} h ${rx * 2} v ${ry * 2} h ${-rx * 2} Z`;
  }
}

export const ShapeElementContent = memo(function ShapeElementContent({
  element,
  width,
  height,
}: ShapeElementContentProps) {
  // Thumbnail padding
  const padding = 4;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-indigo-800/60">
      {/* Shape thumbnail preview */}
      <svg
        className="absolute"
        style={{
          left: padding,
          top: padding,
          width: innerWidth,
          height: innerHeight,
        }}
        viewBox={`0 0 ${innerWidth} ${innerHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={getShapePath(element.shapeType, innerWidth, innerHeight)}
          fill={element.fill || '#4a90d9'}
          fillOpacity={0.8}
          stroke={element.stroke || '#333333'}
          strokeWidth={Math.min(element.strokeWidth || 2, 2)}
          strokeOpacity={0.8}
        />
      </svg>

      {/* Element name */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-0.5 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-[10px] text-white truncate select-none drop-shadow-sm">
          {element.name}
        </span>
      </div>

      {/* Shape type indicator */}
      <div className="absolute top-1 right-1">
        <div className="w-3 h-3 rounded-sm flex items-center justify-center bg-black/40">
          <ShapeTypeIcon type={element.shapeType} />
        </div>
      </div>
    </div>
  );
});

/**
 * Shape type icon
 */
const ShapeTypeIcon = memo(function ShapeTypeIcon({ type }: { type: string }) {
  const iconClass = 'w-2 h-2 text-white/80';

  switch (type) {
    case 'rectangle':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <rect x="1" y="2" width="8" height="6" rx="0.5" />
        </svg>
      );
    case 'ellipse':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <ellipse cx="5" cy="5" rx="4" ry="3" />
        </svg>
      );
    case 'polygon':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <polygon points="5,1 9,4 7,9 3,9 1,4" />
        </svg>
      );
    case 'star':
      return (
        <svg className={iconClass} viewBox="0 0 10 10" fill="currentColor">
          <polygon points="5,1 6,4 9,4 7,6 8,9 5,7 2,9 3,6 1,4 4,4" />
        </svg>
      );
    case 'line':
      return (
        <svg
          className={iconClass}
          viewBox="0 0 10 10"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        >
          <line x1="1" y1="9" x2="9" y2="1" />
        </svg>
      );
    case 'bezier':
      return (
        <svg
          className={iconClass}
          viewBox="0 0 10 10"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        >
          <path d="M1,8 C3,2 7,2 9,8" />
        </svg>
      );
    default:
      return null;
  }
});
