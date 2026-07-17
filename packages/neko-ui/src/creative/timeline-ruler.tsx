/**
 * TimelineRuler - shared canvas ruler for timeline editors.
 *
 * The canvas covers the visible viewport width. Tick positions are offset by
 * scrollRef.current.scrollLeft so the ruler follows the track scroller without
 * the canvas itself becoming scrollable.
 */

import React, { useCallback, useEffect, useRef } from 'react';

export interface TimelineRulerProps {
  readonly duration: number;
  readonly pixelsPerSecond: number;
  readonly onSeek: (time: number) => void;
  readonly height?: number;
  readonly scrollRef?: React.RefObject<HTMLDivElement | null>;
  readonly className?: string;
  readonly showLabels?: boolean;
}

interface TickConfig {
  readonly interval: number;
  readonly minorEvery: number;
  readonly majorEvery: number;
}

export function TimelineRuler({
  className,
  duration,
  height = 24,
  onSeek,
  pixelsPerSecond,
  scrollRef,
  showLabels = true,
}: TimelineRulerProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const rulerHeight = height;

    if (width <= 0 || rulerHeight <= 0) return;

    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(rulerHeight * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${rulerHeight}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scrollLeft = scrollRef?.current?.scrollLeft ?? 0;
    const style = getComputedStyle(document.documentElement);
    const fg = style.getPropertyValue('--neko-fg-secondary').trim() || '#8e8e93';
    const divider = style.getPropertyValue('--neko-divider').trim() || 'rgba(255,255,255,0.06)';
    const surface = style.getPropertyValue('--neko-surface').trim() || '#242426';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, rulerHeight);
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, width, rulerHeight);
    ctx.fillStyle = divider;
    ctx.fillRect(0, rulerHeight - 1, width, 1);

    const { interval, majorEvery, minorEvery } = calcTickConfig(pixelsPerSecond);
    const visibleStart = scrollLeft / pixelsPerSecond;
    const visibleEnd = (scrollLeft + width) / pixelsPerSecond;
    const firstTickIdx = Math.floor(visibleStart / interval);

    ctx.font = '10px var(--vscode-font-family, system-ui, sans-serif)';
    ctx.textBaseline = 'top';
    ctx.fillStyle = fg;

    for (let index = firstTickIdx; ; index += 1) {
      const time = Math.round(index * interval * 1000) / 1000;
      if (time > duration + interval || time > visibleEnd + interval) break;

      const x = Math.round(time * pixelsPerSecond - scrollLeft);
      if (x > width + 2) break;
      if (x < -2) continue;

      const isMajor = index % majorEvery === 0;
      const isMinor = !isMajor && index % minorEvery === 0;
      const tickHeight = isMajor ? 11 : isMinor ? 6 : 3;
      ctx.globalAlpha = isMajor ? 1 : isMinor ? 0.55 : 0.3;
      ctx.fillRect(x, rulerHeight - tickHeight - 1, 1, tickHeight);

      if (isMajor && showLabels) {
        ctx.globalAlpha = 0.75;
        ctx.fillText(formatRulerTime(time), x + 3, 3);
      }
    }
    ctx.globalAlpha = 1;
  }, [duration, height, pixelsPerSecond, scrollRef, showLabels]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [draw]);

  useEffect(() => {
    const scrollElement = scrollRef?.current;
    if (!scrollElement) return;
    scrollElement.addEventListener('scroll', draw, { passive: true });
    return () => scrollElement.removeEventListener('scroll', draw);
  }, [draw, scrollRef]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scrollLeft = scrollRef?.current?.scrollLeft ?? 0;
      const x = event.clientX - rect.left + scrollLeft;
      const time = Math.max(0, Math.min(duration, x / pixelsPerSecond));
      onSeek(time);
    },
    [duration, onSeek, pixelsPerSecond, scrollRef],
  );

  return (
    <div
      ref={containerRef}
      className={className ? `neko-ruler ${className}` : 'neko-ruler'}
      style={{ height }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} onPointerDown={handlePointerDown} />
    </div>
  );
}

function calcTickConfig(pixelsPerSecond: number): TickConfig {
  if (pixelsPerSecond >= 50) return { interval: 1, minorEvery: 5, majorEvery: 10 };
  if (pixelsPerSecond >= 20) return { interval: 2, minorEvery: 5, majorEvery: 5 };
  if (pixelsPerSecond >= 10) return { interval: 5, minorEvery: 2, majorEvery: 6 };
  if (pixelsPerSecond >= 4) return { interval: 10, minorEvery: 3, majorEvery: 6 };
  if (pixelsPerSecond >= 2) return { interval: 30, minorEvery: 2, majorEvery: 4 };
  return { interval: 60, minorEvery: 1, majorEvery: 5 };
}

function formatRulerTime(time: number): string {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
