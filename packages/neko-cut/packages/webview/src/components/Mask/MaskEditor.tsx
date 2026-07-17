/**
 * MaskEditor Component
 * 蒙版编辑器 - Canvas绘制和编辑蒙版形状
 */

import { memo, useCallback, useRef, useEffect, useState } from 'react';
import type { MaskInstance, RectangleMask, EllipseMask } from '../../types/mask';

// =============================================================================
// Types
// =============================================================================

interface MaskEditorProps {
  mask: MaskInstance;
  onChange: (mask: MaskInstance) => void;
  width?: number;
  height?: number;
}

// =============================================================================
// Main Component
// =============================================================================

export const MaskEditor = memo(function MaskEditor({
  mask,
  onChange,
  width = 300,
  height = 200,
}: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null);

  // Convert percentage to pixels
  const pctToPixel = useCallback((pct: number, dimension: number): number => {
    return (pct / 100) * dimension;
  }, []);

  // Convert pixels to percentage
  const pixelToPct = useCallback((px: number, dimension: number): number => {
    return (px / dimension) * 100;
  }, []);

  // Draw the mask
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw checkerboard background
    const checkerSize = 10;
    for (let y = 0; y < height; y += checkerSize) {
      for (let x = 0; x < width; x += checkerSize) {
        const isEven = (x / checkerSize + y / checkerSize) % 2 === 0;
        ctx.fillStyle = isEven ? '#333' : '#555';
        ctx.fillRect(x, y, checkerSize, checkerSize);
      }
    }

    // Draw mask shape
    ctx.save();

    switch (mask.shape.type) {
      case 'rectangle': {
        const rect = mask.shape as RectangleMask;
        const centerX = pctToPixel(rect.centerX, width);
        const centerY = pctToPixel(rect.centerY, height);
        const w = pctToPixel(rect.width, width);
        const h = pctToPixel(rect.height, height);

        ctx.translate(centerX, centerY);
        ctx.rotate((rect.rotation * Math.PI) / 180);

        // Draw rectangle
        ctx.fillStyle = mask.inverted ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)';
        if (rect.cornerRadius > 0) {
          const radius = Math.min(rect.cornerRadius, w / 2, h / 2);
          ctx.beginPath();
          ctx.moveTo(-w / 2 + radius, -h / 2);
          ctx.lineTo(w / 2 - radius, -h / 2);
          ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + radius);
          ctx.lineTo(w / 2, h / 2 - radius);
          ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - radius, h / 2);
          ctx.lineTo(-w / 2 + radius, h / 2);
          ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - radius);
          ctx.lineTo(-w / 2, -h / 2 + radius);
          ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + radius, -h / 2);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-w / 2, -h / 2, w, h);
        }

        // Draw border
        ctx.strokeStyle = '#00bfff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2, -h / 2, w, h);

        // Draw handles
        ctx.fillStyle = '#00bfff';
        const handleSize = 6;
        [
          [-w / 2, -h / 2],
          [w / 2, -h / 2],
          [w / 2, h / 2],
          [-w / 2, h / 2],
          [0, -h / 2],
          [w / 2, 0],
          [0, h / 2],
          [-w / 2, 0],
        ].forEach(([x, y]) => {
          ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        });

        break;
      }

      case 'ellipse': {
        const ellipse = mask.shape as EllipseMask;
        const centerX = pctToPixel(ellipse.centerX, width);
        const centerY = pctToPixel(ellipse.centerY, height);
        const radiusX = pctToPixel(ellipse.width, width) / 2;
        const radiusY = pctToPixel(ellipse.height, height) / 2;

        ctx.translate(centerX, centerY);
        ctx.rotate((ellipse.rotation * Math.PI) / 180);

        // Draw ellipse
        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fillStyle = mask.inverted ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)';
        ctx.fill();

        // Draw border
        ctx.strokeStyle = '#00bfff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw handles
        ctx.fillStyle = '#00bfff';
        const handleSize = 6;
        [
          [-radiusX, 0],
          [radiusX, 0],
          [0, -radiusY],
          [0, radiusY],
        ].forEach(([x, y]) => {
          ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        });

        break;
      }

      case 'polygon':
      case 'bezier':
        // Simplified rendering - full implementation would be more complex
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#00bfff';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, width - 20, height - 20);
        break;
    }

    ctx.restore();

    // Draw opacity info
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Opacity: ${Math.round(mask.opacity * 100)}%`, 5, 15);
    ctx.fillText(`Feather: ${mask.feather}px`, 5, 30);
  }, [mask, width, height, pctToPixel]);

  // Handle mouse events
  const handleMouseDown = useCallback((_e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragHandle('center'); // Simplified - would detect specific handle
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !dragHandle) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (mask.shape.type === 'rectangle') {
        const shape = mask.shape as RectangleMask;
        onChange({
          ...mask,
          shape: {
            ...shape,
            centerX: pixelToPct(mouseX, width),
            centerY: pixelToPct(mouseY, height),
          },
        });
      } else if (mask.shape.type === 'ellipse') {
        const shape = mask.shape as EllipseMask;
        onChange({
          ...mask,
          shape: {
            ...shape,
            centerX: pixelToPct(mouseX, width),
            centerY: pixelToPct(mouseY, height),
          },
        });
      }
    },
    [isDragging, dragHandle, mask, onChange, width, height, pixelToPct],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
  }, []);

  return (
    <div className="flex justify-center">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-[var(--vscode-panel-border)] rounded cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
});

export default MaskEditor;
