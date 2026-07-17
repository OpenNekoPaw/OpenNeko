/**
 * SpectrumCanvas - Real-time frequency spectrum analyzer
 *
 * Taps into the existing Web Audio graph via AudioStreamClient's
 * GainNode to create an AnalyserNode for FFT visualization.
 * Colors are theme-aware via CSS custom properties.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { EngineAvAudioStreamClient } from '@neko/neko-client';

interface SpectrumCanvasProps {
  audioClient: EngineAvAudioStreamClient | null;
  isPlaying: boolean;
}

/** Read a CSS custom property from :root, with fallback */
function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function SpectrumCanvas({ audioClient, isPlaying }: SpectrumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logicalSizeRef = useRef({ width: 0, height: 0 });
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // =========================================================================
  // AnalyserNode lifecycle — connect/disconnect from audio graph
  // =========================================================================

  useEffect(() => {
    if (!audioClient) return;

    const audioCtx = audioClient.getAudioContext();
    const gainNode = audioClient.getGainNode();
    if (!audioCtx || !gainNode) return;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    gainNode.connect(analyser); // branch tap — doesn't interrupt gain→destination
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

    return () => {
      try {
        gainNode.disconnect(analyser);
      } catch {
        // already disconnected
      }
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [audioClient]);

  // =========================================================================
  // Drawing
  // =========================================================================

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = logicalSizeRef.current;
    if (width === 0 || height === 0) return;

    const accentColor = getCssVar('--neko-preview-accent', '#0e639c');
    const accentHover = getCssVar('--neko-preview-accent-hover', '#1a8fff');
    const bgColor = getCssVar('--neko-preview-surface', 'rgba(255, 255, 255, 0.05)');

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return;

    analyser.getByteFrequencyData(data);

    const binCount = data.length;
    const barGap = 2;
    const barWidth = Math.max(1, (width - barGap * (binCount - 1)) / binCount);

    for (let i = 0; i < binCount; i++) {
      const value = (data[i] ?? 0) / 255;
      const barHeight = value * height;
      const x = i * (barWidth + barGap);
      const y = height - barHeight;

      // Gradient from accent to accent-hover based on intensity
      const ratio = value;
      ctx.fillStyle = ratio > 0.6 ? accentHover : accentColor;
      ctx.globalAlpha = 0.4 + value * 0.6;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
  }, []);

  // Hold latest draw in a ref so ResizeObserver doesn't re-subscribe
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // =========================================================================
  // Animation loop
  // =========================================================================

  useEffect(() => {
    if (!isPlaying) {
      // Draw once to clear/show empty state
      drawRef.current();
      return;
    }

    let running = true;
    const loop = () => {
      if (!running) return;
      drawRef.current();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying]);

  // =========================================================================
  // Resize handling
  // =========================================================================

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;

        logicalSizeRef.current = { width, height };

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }

        drawRef.current();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative rounded-lg bg-neko-surface overflow-hidden"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
