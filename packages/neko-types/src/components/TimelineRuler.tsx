/**
 * TimelineRuler — Shared time ruler for timeline editors.
 *
 * Design: canvas always covers the visible viewport width.
 * Tick positions are offset by scrollRef.current.scrollLeft so the ruler
 * appears to "follow" the tracks without the canvas itself scrolling.
 * This sidesteps the .neko-ruler { overflow: hidden } constraint.
 *
 * CSS class `.neko-ruler` is injected by the Tailwind preset plugin.
 */

import React, { useCallback, useEffect, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimelineRulerProps {
  duration: number;
  /** Pixels per second. Both packages pass: 50 * zoomLevel */
  pixelsPerSecond: number;
  onSeek: (time: number) => void;
  /** Height in pixels. Default: 24 */
  height?: number;
  /**
   * The scrollable tracks container. The ruler listens to its scroll events
   * and offsets tick positions accordingly so the ruler stays in sync.
   */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  showLabels?: boolean;
}

// ── Tick interval calculation ─────────────────────────────────────────────────

interface TickConfig {
  interval: number; // seconds between micro ticks (finest unit)
  minorEvery: number; // every Nth micro tick is a minor tick (medium height)
  majorEvery: number; // every Nth micro tick is a major tick (tallest, labeled)
  // majorEvery should be a multiple of minorEvery
}

function calcTickConfig(pps: number): TickConfig {
  // Three-tier tick hierarchy: micro (shortest) → minor (medium) → major (tallest, labeled).
  // Minimum tick interval is 1 s (no sub-second ticks).
  // Keep micro ticks at least ~20 px apart; major labels at least ~200 px apart.
  if (pps >= 50) return { interval: 1, minorEvery: 5, majorEvery: 10 }; // micro@1s minor@5s major@10s
  if (pps >= 20) return { interval: 2, minorEvery: 5, majorEvery: 5 }; // micro@2s major@10s
  if (pps >= 10) return { interval: 5, minorEvery: 2, majorEvery: 6 }; // micro@5s minor@10s major@30s
  if (pps >= 4) return { interval: 10, minorEvery: 3, majorEvery: 6 }; // micro@10s minor@30s major@60s
  if (pps >= 2) return { interval: 30, minorEvery: 2, majorEvery: 4 }; // micro@30s minor@60s major@2min
  return { interval: 60, minorEvery: 1, majorEvery: 5 }; // minor@60s major@5min
}

/** Consistent M:SS format (e.g. "0:00", "0:30", "1:05", "10:00") */
function formatRulerTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TimelineRuler({
  duration,
  pixelsPerSecond,
  onSeek,
  height = 24,
  scrollRef,
  className,
  showLabels = true,
}: TimelineRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = height;

    if (w <= 0 || h <= 0) return;

    // Resize canvas to match viewport (not total timeline width)
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Current horizontal scroll of the tracks container
    const scrollLeft = scrollRef?.current?.scrollLeft ?? 0;

    // Read CSS variables for theming
    const style = getComputedStyle(document.documentElement);
    const fg = style.getPropertyValue('--neko-fg-secondary').trim() || '#8e8e93';
    const divider = style.getPropertyValue('--neko-divider').trim() || 'rgba(255,255,255,0.06)';
    const surface = style.getPropertyValue('--neko-surface').trim() || '#242426';

    // Reset transform absolutely to avoid cumulative scaling across redraws
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, w, h);

    // Bottom border
    ctx.fillStyle = divider;
    ctx.fillRect(0, h - 1, w, 1);

    // Compute visible time range
    const { interval, minorEvery, majorEvery } = calcTickConfig(pixelsPerSecond);
    const visibleStart = scrollLeft / pixelsPerSecond;
    const visibleEnd = (scrollLeft + w) / pixelsPerSecond;

    // Snap to the first tick index at or before visibleStart
    const firstTickIdx = Math.floor(visibleStart / interval);

    ctx.font = `10px var(--vscode-font-family, system-ui, sans-serif)`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = fg;

    for (let i = firstTickIdx; ; i++) {
      // Use integer arithmetic to avoid floating-point drift
      const t = Math.round(i * interval * 1000) / 1000;
      if (t > duration + interval) break;
      if (t > visibleEnd + interval) break;

      // Canvas-relative x position
      const x = Math.round(t * pixelsPerSecond - scrollLeft);
      if (x > w + 2) break;
      if (x < -2) continue;

      const isMajor = i % majorEvery === 0;
      const isMinor = !isMajor && i % minorEvery === 0;
      // micro: all other ticks

      const tickH = isMajor ? 11 : isMinor ? 6 : 3;
      ctx.globalAlpha = isMajor ? 1 : isMinor ? 0.55 : 0.3;
      ctx.fillRect(x, h - tickH - 1, 1, tickH);

      if (isMajor && showLabels) {
        ctx.globalAlpha = 0.75;
        ctx.fillText(formatRulerTime(t), x + 3, 3);
      }
    }
    ctx.globalAlpha = 1;
  }, [duration, pixelsPerSecond, height, scrollRef, showLabels]);

  // Redraw when props change
  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Redraw when the tracks container scrolls
  useEffect(() => {
    const scrollEl = scrollRef?.current;
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll', draw, { passive: true });
    return () => scrollEl.removeEventListener('scroll', draw);
  }, [draw, scrollRef]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scrollLeft = scrollRef?.current?.scrollLeft ?? 0;
      const x = e.clientX - rect.left + scrollLeft;
      const time = Math.max(0, Math.min(duration, x / pixelsPerSecond));
      onSeek(time);
    },
    [duration, pixelsPerSecond, onSeek, scrollRef],
  );

  return (
    <div
      ref={containerRef}
      className={`neko-ruler${className ? ` ${className}` : ''}`}
      style={{ height }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} onPointerDown={handlePointerDown} />
    </div>
  );
}
