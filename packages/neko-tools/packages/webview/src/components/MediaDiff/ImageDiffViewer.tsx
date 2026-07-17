/**
 * ImageDiffViewer Component
 * Image comparison viewer with multiple view modes
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import type { ImageDiffDetails } from '@neko/shared';
import type { ImageDiffViewerProps } from './types';

// =============================================================================
// Side-by-Side View
// =============================================================================

interface SideBySideViewProps {
  currentSrc: string;
  previousSrc: string;
  zoom: number;
}

const SideBySideView = memo(function SideBySideView({
  currentSrc,
  previousSrc,
  zoom,
}: SideBySideViewProps) {
  return (
    <div className="flex flex-1 gap-2 p-2 overflow-auto">
      <div className="flex-1 flex flex-col items-center">
        <div className="mb-2 text-xs font-medium text-[var(--tools-fg-secondary)]">
          Previous (HEAD)
        </div>
        <div className="tools-card flex flex-1 items-center justify-center overflow-auto">
          <img
            src={previousSrc}
            alt="Previous version"
            className="max-w-full max-h-full object-contain"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            draggable={false}
          />
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center">
        <div className="mb-2 text-xs font-medium text-[var(--tools-fg-secondary)]">
          Current (Working)
        </div>
        <div className="tools-card flex flex-1 items-center justify-center overflow-auto">
          <img
            src={currentSrc}
            alt="Current version"
            className="max-w-full max-h-full object-contain"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Slider View
// =============================================================================

interface SliderViewProps {
  currentSrc: string;
  previousSrc: string;
  sliderPosition: number;
  onSliderChange: (position: number) => void;
  zoom: number;
}

const SliderView = memo(function SliderView({
  currentSrc,
  previousSrc,
  sliderPosition,
  onSliderChange,
  zoom,
}: SliderViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onSliderChange(Math.max(0, Math.min(1, x)));
    },
    [isDragging, onSliderChange],
  );

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="tools-card relative m-2 flex-1 cursor-col-resize select-none overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      <img
        src={previousSrc}
        alt="Previous version"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${(1 - sliderPosition) * 100}% 0 0)` }}
      >
        <img
          src={currentSrc}
          alt="Current version"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          draggable={false}
        />
      </div>
      <div
        className="absolute top-0 bottom-0 z-10 w-1 cursor-col-resize bg-[var(--tools-accent)] shadow-lg"
        style={{ left: `${sliderPosition * 100}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[var(--tools-accent)] shadow-lg">
          <span className="text-xs text-[var(--tools-accent-fg)]">↔</span>
        </div>
      </div>
      <div className="tools-overlay-chip absolute top-2 left-2 px-2 py-1 text-xs">Previous</div>
      <div className="tools-overlay-chip absolute top-2 right-2 px-2 py-1 text-xs">Current</div>
    </div>
  );
});

// =============================================================================
// Overlay View
// =============================================================================

interface OverlayViewProps {
  currentSrc: string;
  previousSrc: string;
  opacity: number;
  zoom: number;
}

const OverlayView = memo(function OverlayView({
  currentSrc,
  previousSrc,
  opacity,
  zoom,
}: OverlayViewProps) {
  return (
    <div className="tools-card relative m-2 flex-1 overflow-hidden">
      <img
        src={previousSrc}
        alt="Previous version"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        draggable={false}
      />
      <img
        src={currentSrc}
        alt="Current version"
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          opacity,
          transform: `scale(${zoom})`,
          transformOrigin: 'center',
        }}
        draggable={false}
      />
      <div className="tools-overlay-chip absolute bottom-2 right-2 px-2 py-1 text-xs">
        Opacity: {Math.round(opacity * 100)}%
      </div>
    </div>
  );
});

// =============================================================================
// Onion Skin View
// =============================================================================

interface OnionSkinViewProps {
  currentSrc: string;
  previousSrc: string;
  heatmapSrc?: string;
  zoom: number;
}

const OnionSkinView = memo(function OnionSkinView({
  currentSrc,
  previousSrc: _previousSrc,
  heatmapSrc,
  zoom,
}: OnionSkinViewProps) {
  const [showHeatmap, setShowHeatmap] = useState(true);

  return (
    <div className="tools-card relative m-2 flex-1 overflow-hidden">
      <img
        src={currentSrc}
        alt="Current version"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
        draggable={false}
      />
      {heatmapSrc && showHeatmap && (
        <img
          src={heatmapSrc}
          alt="Difference heatmap"
          className="absolute inset-0 w-full h-full object-contain mix-blend-multiply"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center',
            opacity: 0.7,
          }}
          draggable={false}
        />
      )}
      <button
        type="button"
        className="tools-overlay-chip absolute top-2 right-2 px-2 py-1 text-xs transition-[filter] hover:brightness-110"
        onClick={() => setShowHeatmap(!showHeatmap)}
      >
        {showHeatmap ? 'Hide' : 'Show'} Heatmap
      </button>
      {showHeatmap && (
        <div className="tools-overlay-chip absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 text-xs">
          <span>Difference:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm" />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500 rounded-sm" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm" />
            <span>High</span>
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Details Panel
// =============================================================================

interface ImageDetailsProps {
  details?: ImageDiffDetails;
}

const ImageDetails = memo(function ImageDetails({ details }: ImageDetailsProps) {
  if (!details) return null;

  const { dimensions, pixelDifference } = details;

  return (
    <div className="border-t border-[var(--tools-divider)] bg-[var(--tools-panel)] p-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="mb-1 text-[var(--tools-fg-secondary)]">Dimensions</div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {dimensions.previous.width}×{dimensions.previous.height}
            </span>
            <span>→</span>
            <span className="text-green-400">
              {dimensions.current.width}×{dimensions.current.height}
            </span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[var(--tools-fg-secondary)]">Pixel Difference</div>
          <div className="text-yellow-400">{(pixelDifference * 100).toFixed(2)}%</div>
        </div>
        <div>
          <div className="mb-1 text-[var(--tools-fg-secondary)]">Similarity</div>
          <div className="text-blue-400">{(details.structuralSimilarity * 100).toFixed(2)}%</div>
        </div>
        <div>
          <div className="mb-1 text-[var(--tools-fg-secondary)]">Color Diff</div>
          <div className="text-purple-400">{(details.colorHistogramDiff * 100).toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Main ImageDiffViewer Component
// =============================================================================

export const ImageDiffViewer = memo(function ImageDiffViewer({
  viewMode,
  currentSrc,
  previousSrc,
  details,
  heatmapSrc,
  sliderPosition = 0.5,
  onSliderChange,
  overlayOpacity = 0.5,
  zoom = 1,
  isLoading,
  error,
}: ImageDiffViewerProps) {
  const handleSliderChange = useCallback(
    (position: number) => {
      onSliderChange?.(position);
    },
    [onSliderChange],
  );

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--tools-danger)]">
        <div className="text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="tools-spinner mx-auto mb-2 h-8 w-8 animate-spin" />
          <div className="text-sm text-[var(--tools-fg-secondary)]">Loading images...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {viewMode === 'side-by-side' && (
        <SideBySideView currentSrc={currentSrc} previousSrc={previousSrc} zoom={zoom} />
      )}
      {viewMode === 'slider' && (
        <SliderView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          sliderPosition={sliderPosition}
          onSliderChange={handleSliderChange}
          zoom={zoom}
        />
      )}
      {viewMode === 'overlay' && (
        <OverlayView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          opacity={overlayOpacity}
          zoom={zoom}
        />
      )}
      {viewMode === 'onion-skin' && (
        <OnionSkinView
          currentSrc={currentSrc}
          previousSrc={previousSrc}
          heatmapSrc={heatmapSrc}
          zoom={zoom}
        />
      )}
      <ImageDetails details={details} />
    </div>
  );
});
