/**
 * CanvasGrid - low-cost canvas-backed background grid.
 *
 * The grid follows runtime viewport pan/zoom without creating one DOM node per dot.
 */

import { useEffect, useRef } from 'react';
import type { CanvasViewport } from '@neko/shared';

const GRID_SIZE = 20;
const GRID_MAJOR_INTERVAL = 5;
const MIN_GRID_ZOOM = 0.15;

export interface CanvasGridProps {
  viewport: CanvasViewport;
  width: number;
  height: number;
}

export function CanvasGrid({ viewport, width, height }: CanvasGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const styles = getComputedStyle(canvas);
    const backgroundColor = styles.getPropertyValue('--canvas-bg').trim() || '#1e1e1e';
    const gridColor = styles.getPropertyValue('--canvas-grid').trim() || '#333333';
    const majorColor = styles.getPropertyValue('--canvas-grid-major').trim() || gridColor;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (viewport.zoom < MIN_GRID_ZOOM) return;

    const pattern = resolveGridPattern(viewport);
    drawGridDots(ctx, {
      width,
      height,
      gridSize: pattern.gridSize,
      offsetX: pattern.offsetX,
      offsetY: pattern.offsetY,
      gridColor,
      majorColor,
    });
  }, [height, viewport, width]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      data-canvas-background="grid"
    />
  );
}

export function resolveGridPattern(viewport: CanvasViewport): {
  gridSize: number;
  offsetX: number;
  offsetY: number;
} {
  const { zoom, pan } = viewport;
  const effectiveGridSize = zoom < 0.25 ? GRID_SIZE * 4 : zoom < 0.5 ? GRID_SIZE * 2 : GRID_SIZE;
  const gridSize = effectiveGridSize * zoom;

  return {
    gridSize,
    offsetX: pan.x % gridSize,
    offsetY: pan.y % gridSize,
  };
}

function drawGridDots(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number;
    height: number;
    gridSize: number;
    offsetX: number;
    offsetY: number;
    gridColor: string;
    majorColor: string;
  },
): void {
  const cols = Math.ceil(input.width / input.gridSize) + 2;
  const rows = Math.ceil(input.height / input.gridSize) + 2;
  const startCol = Math.floor(-input.offsetX / input.gridSize);
  const startRow = Math.floor(-input.offsetY / input.gridSize);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = input.offsetX + col * input.gridSize;
      const y = input.offsetY + row * input.gridSize;

      if (
        x < -input.gridSize ||
        x > input.width + input.gridSize ||
        y < -input.gridSize ||
        y > input.height + input.gridSize
      ) {
        continue;
      }

      const globalCol = startCol + col;
      const globalRow = startRow + row;
      const isMajor =
        globalCol % GRID_MAJOR_INTERVAL === 0 && globalRow % GRID_MAJOR_INTERVAL === 0;

      ctx.beginPath();
      ctx.arc(x, y, isMajor ? 1.5 : 1, 0, Math.PI * 2);
      ctx.fillStyle = isMajor ? input.majorColor : input.gridColor;
      ctx.fill();
    }
  }
}
