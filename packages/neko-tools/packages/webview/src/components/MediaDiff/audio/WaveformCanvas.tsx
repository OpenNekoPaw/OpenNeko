/**
 * WaveformCanvas - Canvas-based waveform visualization with playhead.
 * Extracted from AudioDiffViewer.tsx.
 */

import { memo, useRef, useEffect, useCallback } from 'react';

export interface WaveformCanvasProps {
  peaks: number[];
  width: number;
  height: number;
  color: string;
  currentTime?: number;
  duration?: number;
  /** Zoom level: 1 = full view, 2 = half visible, etc. */
  zoom?: number;
  /** Scroll offset as fraction of total duration (0-1) */
  scrollOffset?: number;
  onSeek?: (time: number) => void;
}

export const WaveformCanvas = memo(function WaveformCanvas({
  peaks,
  width,
  height,
  color,
  currentTime = 0,
  duration = 0,
  zoom = 1,
  scrollOffset = 0,
  onSeek,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const centerY = height / 2;

    // Viewport: which portion of peaks to render
    const visibleFraction = 1 / zoom;
    const startFraction = scrollOffset;
    const startPeakIdx = Math.floor(startFraction * peaks.length);
    const visiblePeakCount = Math.ceil(visibleFraction * peaks.length);
    const peaksPerPixel = visiblePeakCount / width;

    ctx.clearRect(0, 0, width, height);

    // Draw centerline
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw waveform (only visible portion)
    ctx.fillStyle = color;
    for (let x = 0; x < width; x++) {
      const s = startPeakIdx + Math.floor(x * peaksPerPixel);
      const e = startPeakIdx + Math.floor((x + 1) * peaksPerPixel);

      let maxPeak = 0;
      for (let i = s; i < e && i < peaks.length; i++) {
        if (peaks[i]! > maxPeak) maxPeak = peaks[i]!;
      }

      const barHeight = Math.max(1, maxPeak * (height - 4));
      const y = centerY - barHeight / 2;
      ctx.fillRect(x, y, 1, barHeight);
    }

    // Draw playhead (only if within visible range)
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
  }, [peaks, width, height, color, currentTime, duration, zoom, scrollOffset]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xFraction = (e.clientX - rect.left) / rect.width;
      // Map click position back to absolute time
      const visibleFraction = 1 / zoom;
      const absoluteFraction = scrollOffset + xFraction * visibleFraction;
      onSeek(absoluteFraction * duration);
    },
    [onSeek, duration, zoom, scrollOffset],
  );

  return (
    <canvas
      ref={canvasRef}
      className="block cursor-pointer"
      style={{ width, height }}
      onClick={handleClick}
    />
  );
});
