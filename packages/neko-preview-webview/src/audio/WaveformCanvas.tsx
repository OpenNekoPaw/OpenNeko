/**
 * WaveformCanvas - Audio waveform visualization
 *
 * Renders waveform peaks data on a Canvas element with
 * a playback position indicator. Colors are theme-aware
 * via CSS custom properties.
 */

import { useRef, useEffect, useCallback } from 'react';

interface WaveformCanvasProps {
  /** Waveform peak values (normalized -1 to 1) */
  peaks: number[] | null;
  /** Total duration in seconds */
  duration: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Called on drag end — commits the seek */
  onSeekCommit: (time: number) => void;
  /** Called during drag — updates UI time only */
  onSeeking?: (time: number) => void;
}

/** Read a CSS custom property from :root, with fallback */
function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function WaveformCanvas({
  peaks,
  duration,
  currentTime,
  onSeekCommit,
  onSeeking,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** CSS logical dimensions (independent of DPR) */
  const logicalSizeRef = useRef({ width: 0, height: 0 });

  // =========================================================================
  // Drawing
  // =========================================================================

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use CSS logical dimensions — the context is already scaled by DPR
    const { width, height } = logicalSizeRef.current;
    if (width === 0 || height === 0) return;
    const centerY = height / 2;

    // Theme-aware colors
    const waveColor = getCssVar('--neko-preview-accent', '#0e639c');
    const waveBgColor = getCssVar('--neko-preview-surface', 'rgba(255, 255, 255, 0.05)');
    const progressColor = getCssVar('--neko-preview-accent-hover', '#1a8fff');
    const cursorColor = getCssVar('--neko-preview-text-primary', '#fff');

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = waveBgColor;
    ctx.fillRect(0, 0, width, height);

    if (!peaks || peaks.length === 0) {
      // No data — draw center line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      return;
    }

    // Progress position
    const progressX = duration > 0 ? (currentTime / duration) * width : 0;

    // Draw waveform bars
    const barWidth = Math.max(1, width / peaks.length);
    const halfHeight = height * 0.4; // Leave some padding

    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      const peakValue = Math.abs(peaks[i] ?? 0);
      const barHeight = Math.max(1, peakValue * halfHeight);

      // Color based on whether we've played past this point
      ctx.fillStyle = x < progressX ? progressColor : waveColor;

      // Draw symmetric bar (above and below center)
      ctx.fillRect(x, centerY - barHeight, barWidth - 0.5, barHeight * 2);
    }

    // Draw playback cursor
    if (duration > 0) {
      ctx.fillStyle = cursorColor;
      ctx.fillRect(progressX - 1, 0, 2, height);
    }
  }, [peaks, duration, currentTime]);

  // Hold latest draw in a ref so ResizeObserver doesn't need to re-subscribe
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // =========================================================================
  // Resize handling — observer created once, calls draw via ref
  // =========================================================================

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;

        // Store CSS logical dimensions for draw()
        logicalSizeRef.current = { width, height };

        // Set physical backing store size
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        // Scale context so draw() works in CSS logical coordinates
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }

        drawRef.current();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw when data or time changes
  useEffect(() => {
    draw();
  }, [draw]);

  // =========================================================================
  // Drag to seek (scrub/commit pattern — matches ProgressBar)
  // =========================================================================

  const getTimeFromClientX = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas || duration <= 0) return 0;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const time = getTimeFromClientX(e.clientX);
      onSeeking?.(time);

      const handleMouseMove = (ev: MouseEvent) => {
        const t = getTimeFromClientX(ev.clientX);
        onSeeking?.(t);
      };

      const handleMouseUp = (ev: MouseEvent) => {
        const t = getTimeFromClientX(ev.clientX);
        onSeekCommit(t);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [getTimeFromClientX, onSeekCommit, onSeeking],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
      onMouseDown={handleMouseDown}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
    </div>
  );
}
