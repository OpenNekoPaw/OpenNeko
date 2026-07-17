/**
 * CurvesPanel Component
 * RGB曲线调整面板
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { CurvesAdjustment, CurvePoint, CurveAdjustment } from '../../types/colorCorrection';

// =============================================================================
// Types
// =============================================================================

interface CurvesPanelProps {
  curves: CurvesAdjustment;
  onChange: (curves: CurvesAdjustment) => void;
}

type ChannelType = 'rgb' | 'red' | 'green' | 'blue';

const CHANNEL_COLORS: Record<ChannelType, string> = {
  rgb: '#ffffff',
  red: '#ff4444',
  green: '#44ff44',
  blue: '#4444ff',
};

// =============================================================================
// Curve Editor Component
// =============================================================================

interface CurveEditorProps {
  points: CurvePoint[];
  color: string;
  onChange: (points: CurvePoint[]) => void;
}

const CurveEditor = memo(function CurveEditor({ points, color, onChange }: CurveEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const CANVAS_SIZE = 180;
  const POINT_RADIUS = 5;

  // Draw the curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const pos = (i / 4) * CANVAS_SIZE;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(CANVAS_SIZE, pos);
      ctx.stroke();
    }

    // Draw diagonal reference line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_SIZE);
    ctx.lineTo(CANVAS_SIZE, 0);
    ctx.stroke();

    // Sort points by x
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);

    // Draw curve
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Draw smooth curve through points
    if (sortedPoints.length >= 2) {
      for (let i = 0; i < sortedPoints.length - 1; i++) {
        const p0 = sortedPoints[Math.max(0, i - 1)];
        const p1 = sortedPoints[i];
        const p2 = sortedPoints[i + 1];
        const p3 = sortedPoints[Math.min(sortedPoints.length - 1, i + 2)];

        const x1 = p1.x * CANVAS_SIZE;
        const y1 = (1 - p1.y) * CANVAS_SIZE;
        const x2 = p2.x * CANVAS_SIZE;
        const y2 = (1 - p2.y) * CANVAS_SIZE;

        if (i === 0) {
          ctx.moveTo(x1, y1);
        }

        // Catmull-Rom to Bezier conversion
        const cp1x = x1 + (x2 - p0.x * CANVAS_SIZE) / 6;
        const cp1y = y1 + ((1 - p2.y) * CANVAS_SIZE - (1 - p0.y) * CANVAS_SIZE) / 6;
        const cp2x = x2 - (p3.x * CANVAS_SIZE - x1) / 6;
        const cp2y = y2 - ((1 - p3.y) * CANVAS_SIZE - y1) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      }
    } else if (sortedPoints.length === 1) {
      const x = sortedPoints[0].x * CANVAS_SIZE;
      const y = (1 - sortedPoints[0].y) * CANVAS_SIZE;
      ctx.moveTo(x - 2, y);
      ctx.lineTo(x + 2, y);
    }
    ctx.stroke();

    // Draw points
    sortedPoints.forEach((point) => {
      const x = point.x * CANVAS_SIZE;
      const y = (1 - point.y) * CANVAS_SIZE;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [points, color]);

  // Handle mouse events
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / CANVAS_SIZE));
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / CANVAS_SIZE));
      return { x, y };
    },
    [],
  );

  const findPointAtPosition = useCallback(
    (x: number, y: number): number => {
      const threshold = POINT_RADIUS / CANVAS_SIZE;
      return points.findIndex((p) => {
        const dx = p.x - x;
        const dy = p.y - y;
        return Math.sqrt(dx * dx + dy * dy) < threshold * 2;
      });
    },
    [points],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e);
      const pointIndex = findPointAtPosition(x, y);

      if (pointIndex >= 0) {
        setDraggingIndex(pointIndex);
      } else {
        // Add new point
        const newPoints = [...points, { x, y }].sort((a, b) => a.x - b.x);
        onChange(newPoints);
        // Find and start dragging the new point
        const newIndex = newPoints.findIndex(
          (p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01,
        );
        if (newIndex >= 0) {
          setDraggingIndex(newIndex);
        }
      }
    },
    [getCanvasCoords, findPointAtPosition, points, onChange],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (draggingIndex === null) return;

      const { x, y } = getCanvasCoords(e);
      const newPoints = [...points];

      // Don't allow moving first and last points horizontally
      if (draggingIndex === 0) {
        newPoints[draggingIndex] = { x: 0, y };
      } else if (draggingIndex === points.length - 1) {
        newPoints[draggingIndex] = { x: 1, y };
      } else {
        newPoints[draggingIndex] = { x, y };
      }

      onChange(newPoints);
    },
    [draggingIndex, getCanvasCoords, points, onChange],
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e);
      const pointIndex = findPointAtPosition(x, y);

      if (pointIndex >= 0 && pointIndex !== 0 && pointIndex !== points.length - 1) {
        // Remove point (but not first or last)
        const newPoints = points.filter((_, i) => i !== pointIndex);
        onChange(newPoints);
      }
    },
    [getCanvasCoords, findPointAtPosition, points, onChange],
  );

  return (
    <div ref={containerRef} className="relative">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="bg-[var(--vscode-editor-background)] rounded border border-[var(--vscode-panel-border)] cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const CurvesPanel = memo(function CurvesPanel({ curves, onChange }: CurvesPanelProps) {
  const { t } = useTranslation();
  const [activeChannel, setActiveChannel] = useState<ChannelType>('rgb');

  const handleChannelChange = useCallback((channel: ChannelType) => {
    setActiveChannel(channel);
  }, []);

  const handlePointsChange = useCallback(
    (points: CurvePoint[]) => {
      const channelData: CurveAdjustment = {
        ...curves[activeChannel],
        points,
        enabled: true,
      };

      onChange({
        ...curves,
        [activeChannel]: channelData,
      });
    },
    [curves, activeChannel, onChange],
  );

  const handleResetCurve = useCallback(() => {
    const defaultPoints: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];

    onChange({
      ...curves,
      [activeChannel]: {
        enabled: false,
        points: defaultPoints,
      },
    });
  }, [curves, activeChannel, onChange]);

  const handleToggleEnabled = useCallback(() => {
    onChange({
      ...curves,
      [activeChannel]: {
        ...curves[activeChannel],
        enabled: !curves[activeChannel].enabled,
      },
    });
  }, [curves, activeChannel, onChange]);

  return (
    <div className="space-y-2">
      {/* Channel Tabs */}
      <div className="flex gap-1">
        {(['rgb', 'red', 'green', 'blue'] as const).map((channel) => (
          <button
            key={channel}
            className={`flex-1 px-2 py-1 text-[10px] rounded transition-colors ${
              activeChannel === channel
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
            }`}
            style={{
              borderBottom:
                activeChannel === channel ? `2px solid ${CHANNEL_COLORS[channel]}` : undefined,
            }}
            onClick={() => handleChannelChange(channel)}
          >
            {t(`colorCorrection.curves.${channel}`)}
          </button>
        ))}
      </div>

      {/* Curve Editor */}
      <div className="flex justify-center">
        <CurveEditor
          points={curves[activeChannel].points}
          color={CHANNEL_COLORS[activeChannel]}
          onChange={handlePointsChange}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[10px]">
          <input
            type="checkbox"
            checked={curves[activeChannel].enabled}
            onChange={handleToggleEnabled}
            className="accent-[var(--vscode-button-background)]"
          />
          <span className="text-[var(--vscode-foreground)]">{t('colorCorrection.enabled')}</span>
        </label>
        <button
          className="px-2 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
          onClick={handleResetCurve}
        >
          {t('colorCorrection.curves.resetCurve')}
        </button>
      </div>
    </div>
  );
});

export default CurvesPanel;
