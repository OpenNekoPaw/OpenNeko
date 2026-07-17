/**
 * OverlayWaveform - Overlay mode viewer with dual waveforms.
 * DiffRegionOverlay - SVG overlay for diff region highlights.
 * Extracted from AudioDiffViewer.tsx.
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';

// =============================================================================
// Diff Region Overlay
// =============================================================================

export interface DiffRegionOverlayProps {
  regions: Array<{ start: number; end: number }>;
  duration: number;
  width: number;
  height: number;
  zoom?: number;
  scrollOffset?: number;
  /** SVG fill color for region rects (default: red diff style) */
  fillColor?: string;
  /** SVG stroke color for region rects (default: red diff style) */
  strokeColor?: string;
}

export const DiffRegionOverlay = memo(function DiffRegionOverlay({
  regions,
  duration,
  width,
  height,
  zoom = 1,
  scrollOffset = 0,
  fillColor = 'rgba(239, 68, 68, 0.15)',
  strokeColor = 'rgba(239, 68, 68, 0.3)',
}: DiffRegionOverlayProps) {
  if (!regions.length || duration <= 0) return null;

  const visibleFraction = 1 / zoom;
  const visibleStart = scrollOffset * duration;
  const visibleEnd = (scrollOffset + visibleFraction) * duration;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {regions.map((region, i) => {
        // Skip regions outside visible range
        if (region.end < visibleStart || region.start > visibleEnd) return null;
        // Clamp to visible range and map to pixel coordinates
        const clampedStart = Math.max(region.start, visibleStart);
        const clampedEnd = Math.min(region.end, visibleEnd);
        const x = ((clampedStart - visibleStart) / (visibleEnd - visibleStart)) * width;
        const w = ((clampedEnd - clampedStart) / (visibleEnd - visibleStart)) * width;
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={Math.max(1, w)}
            height={height}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
});

// =============================================================================
// Overlay Waveform
// =============================================================================

interface OverlayWaveformProps {
  currentWaveform: number[];
  previousWaveform: number[];
  currentTime: number;
  duration: number;
  zoom: number;
  scrollOffset: number;
  onZoomChange: (zoom: number) => void;
  onScrollOffsetChange: (offset: number) => void;
  onSeek: (time: number) => void;
}

export const OverlayWaveform = memo(function OverlayWaveform({
  currentWaveform,
  previousWaveform,
  currentTime,
  duration,
  zoom,
  scrollOffset,
  onZoomChange,
  onScrollOffsetChange,
  onSeek,
}: OverlayWaveformProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const height = 200;
  const isDraggingRef = useRef(false);
  const lastDragXRef = useRef(0);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.floor(entry.contentRect.width - 32)); // subtract padding
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = containerWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const centerY = height / 2;
    const visibleFraction = 1 / zoom;
    const startFraction = scrollOffset;

    ctx.clearRect(0, 0, width, height);

    // Draw centerline
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Helper to draw a waveform with viewport
    const drawWaveform = (peaks: number[], fillStyle: string) => {
      const startIdx = Math.floor(startFraction * peaks.length);
      const visibleCount = Math.ceil(visibleFraction * peaks.length);
      const peaksPerPixel = visibleCount / width;

      ctx.fillStyle = fillStyle;
      for (let x = 0; x < width; x++) {
        const s = startIdx + Math.floor(x * peaksPerPixel);
        const e = startIdx + Math.floor((x + 1) * peaksPerPixel);
        let maxPeak = 0;
        for (let i = s; i < e && i < peaks.length; i++) {
          if (peaks[i]! > maxPeak) maxPeak = peaks[i]!;
        }
        const barHeight = Math.max(1, maxPeak * (height - 4));
        const y = centerY - barHeight / 2;
        ctx.fillRect(x, y, 1, barHeight);
      }
    };

    // Draw previous waveform (red)
    drawWaveform(previousWaveform, 'rgba(239, 68, 68, 0.5)');
    // Draw current waveform (green)
    drawWaveform(currentWaveform, 'rgba(34, 197, 94, 0.5)');

    // Draw playhead
    if (duration > 0) {
      const timeFraction = currentTime / duration;
      if (timeFraction >= startFraction && timeFraction <= startFraction + visibleFraction) {
        const playheadX = ((timeFraction - startFraction) / visibleFraction) * width;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
      }
    }
  }, [
    currentWaveform,
    previousWaveform,
    currentTime,
    duration,
    containerWidth,
    zoom,
    scrollOffset,
  ]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xFraction = (e.clientX - rect.left) / rect.width;
      const visibleFraction = 1 / zoom;
      const absoluteFraction = scrollOffset + xFraction * visibleFraction;
      onSeek(absoluteFraction * duration);
    },
    [onSeek, duration, zoom, scrollOffset],
  );

  // Wheel zoom: Ctrl+wheel = zoom, plain wheel = scroll
  // Use native addEventListener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const cursorFraction = (e.clientX - rect.left) / rect.width;
        const cursorTime = scrollOffset + cursorFraction / zoom;
        const zoomDelta = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(1, Math.min(64, zoom * zoomDelta));
        const newOffset = Math.max(
          0,
          Math.min(1 - 1 / newZoom, cursorTime - cursorFraction / newZoom),
        );
        onZoomChange(newZoom);
        onScrollOffsetChange(newOffset);
      } else {
        const scrollDelta = (e.deltaY / containerWidth) * (1 / zoom);
        const newOffset = Math.max(0, Math.min(1 - 1 / zoom, scrollOffset + scrollDelta));
        onScrollOffsetChange(newOffset);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, scrollOffset, containerWidth, onZoomChange, onScrollOffsetChange]);

  // Middle-click drag to pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 && zoom > 1) {
        e.preventDefault();
        isDraggingRef.current = true;
        lastDragXRef.current = e.clientX;
      }
    },
    [zoom],
  );

  useEffect(() => {
    if (zoom <= 1) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastDragXRef.current;
      lastDragXRef.current = e.clientX;
      const scrollDelta = (-dx / containerWidth) * (1 / zoom);
      const newOffset = Math.max(0, Math.min(1 - 1 / zoom, scrollOffset + scrollDelta));
      onScrollOffsetChange(newOffset);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom, scrollOffset, containerWidth, onScrollOffsetChange]);

  return (
    <div
      ref={containerRef}
      className="flex-1 m-2 bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)] p-4"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500/50 rounded" />
            <span className="text-[var(--vscode-descriptionForeground)]">
              {t('mediaDiff.audio.previous')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500/50 rounded" />
            <span className="text-[var(--vscode-descriptionForeground)]">
              {t('mediaDiff.audio.current')}
            </span>
          </div>
        </div>
        {zoom > 1 && (
          <span className="text-[var(--vscode-descriptionForeground)]">{zoom.toFixed(1)}x</span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="block cursor-pointer mx-auto"
        style={{ width: containerWidth, height }}
        onClick={handleClick}
      />
      {zoom > 1 && (
        <div className="relative h-2 bg-[var(--vscode-editor-background)] rounded mt-2">
          <div
            className="absolute h-full bg-[var(--vscode-button-background)] rounded opacity-60"
            style={{
              left: `${scrollOffset * 100}%`,
              width: `${(1 / zoom) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
});
