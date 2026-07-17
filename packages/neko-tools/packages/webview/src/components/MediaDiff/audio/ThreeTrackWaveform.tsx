/**
 * ThreeTrackWaveform - Three-track layout (Previous / Current / Diff).
 * Extracted from AudioDiffViewer.tsx.
 */

import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';
import { WaveformCanvas } from './WaveformCanvas';
import { DiffRegionOverlay } from './OverlayWaveform';

interface ThreeTrackWaveformProps {
  currentWaveform: number[];
  previousWaveform: number[];
  currentTime: number;
  duration: number;
  diffRegions?: Array<{ start: number; end: number }>;
  silenceRegions?: {
    current: Array<{ start: number; end: number }>;
    previous: Array<{ start: number; end: number }>;
  };
  zoom: number;
  scrollOffset: number;
  onZoomChange: (zoom: number) => void;
  onScrollOffsetChange: (offset: number) => void;
  onSeek: (time: number) => void;
}

export const ThreeTrackWaveform = memo(function ThreeTrackWaveform({
  currentWaveform,
  previousWaveform,
  currentTime,
  duration,
  diffRegions = [],
  silenceRegions,
  zoom,
  scrollOffset,
  onZoomChange,
  onScrollOffsetChange,
  onSeek,
}: ThreeTrackWaveformProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const trackHeight = 80;
  const isDraggingRef = useRef(false);
  const lastDragXRef = useRef(0);

  // Compute diff waveform: |A - B|
  const diffWaveform = useMemo(() => {
    const len = Math.max(currentWaveform.length, previousWaveform.length);
    const diff = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      const a = previousWaveform[i] ?? 0;
      const b = currentWaveform[i] ?? 0;
      diff[i] = Math.abs(a - b);
    }
    return diff;
  }, [currentWaveform, previousWaveform]);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Wheel zoom: Ctrl+wheel = zoom, plain wheel = scroll
  // Use native addEventListener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom centered on cursor position
        const rect = el.getBoundingClientRect();
        const cursorFraction = (e.clientX - rect.left) / rect.width;
        const cursorTime = scrollOffset + cursorFraction / zoom;

        const zoomDelta = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(1, Math.min(64, zoom * zoomDelta));
        // Adjust scroll to keep cursor position stable
        const newOffset = Math.max(
          0,
          Math.min(1 - 1 / newZoom, cursorTime - cursorFraction / newZoom),
        );
        onZoomChange(newZoom);
        onScrollOffsetChange(newOffset);
      } else {
        // Horizontal scroll
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

  const tracks = [
    {
      key: 'previous' as const,
      label: t('mediaDiff.audio.trackPrevious'),
      peaks: previousWaveform,
      color: '#ef4444',
    },
    {
      key: 'current' as const,
      label: t('mediaDiff.audio.trackCurrent'),
      peaks: currentWaveform,
      color: '#22c55e',
    },
    {
      key: 'diff' as const,
      label: t('mediaDiff.audio.trackDiff'),
      peaks: diffWaveform,
      color: '#eab308',
    },
  ];

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-2 space-y-1"
      onMouseDown={handleMouseDown}
    >
      {/* Zoom indicator */}
      {zoom > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--vscode-descriptionForeground)] px-1 mb-1">
          <span>{t('mediaDiff.audio.zoom', { level: zoom.toFixed(1) })}</span>
          <span>
            {duration > 0
              ? `${(scrollOffset * duration).toFixed(1)}s – ${((scrollOffset + 1 / zoom) * duration).toFixed(1)}s`
              : ''}
          </span>
          <span className="opacity-60">{t('mediaDiff.audio.wheelHint')}</span>
        </div>
      )}
      {tracks.map((track) => (
        <div key={track.key} className="relative">
          <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-0.5 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: track.color }} />
            {track.label}
          </div>
          <div className="relative bg-[var(--vscode-input-background)] rounded border border-[var(--vscode-panel-border)]">
            {/* Diff regions overlay (diff track only) */}
            {track.key === 'diff' && diffRegions.length > 0 && (
              <DiffRegionOverlay
                regions={diffRegions}
                duration={duration}
                width={containerWidth}
                height={trackHeight}
                zoom={zoom}
                scrollOffset={scrollOffset}
              />
            )}
            {/* Silence region overlays (previous / current tracks) */}
            {track.key === 'previous' && (silenceRegions?.previous.length ?? 0) > 0 && (
              <DiffRegionOverlay
                regions={silenceRegions!.previous}
                duration={duration}
                width={containerWidth}
                height={trackHeight}
                zoom={zoom}
                scrollOffset={scrollOffset}
                fillColor="rgba(251, 191, 36, 0.18)"
                strokeColor="rgba(251, 191, 36, 0.5)"
              />
            )}
            {track.key === 'current' && (silenceRegions?.current.length ?? 0) > 0 && (
              <DiffRegionOverlay
                regions={silenceRegions!.current}
                duration={duration}
                width={containerWidth}
                height={trackHeight}
                zoom={zoom}
                scrollOffset={scrollOffset}
                fillColor="rgba(251, 191, 36, 0.18)"
                strokeColor="rgba(251, 191, 36, 0.5)"
              />
            )}
            <WaveformCanvas
              peaks={track.peaks}
              width={containerWidth}
              height={trackHeight}
              color={track.color}
              currentTime={currentTime}
              duration={duration}
              zoom={zoom}
              scrollOffset={scrollOffset}
              onSeek={onSeek}
            />
          </div>
        </div>
      ))}
      {/* Minimap scrollbar when zoomed */}
      {zoom > 1 && (
        <div className="relative h-2 bg-[var(--vscode-input-background)] rounded mt-1 mx-1">
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
