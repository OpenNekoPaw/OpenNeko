/**
 * ZoomControls - Zoom control panel component
 * Provides zoom in/out buttons, zoom percentage display, and fit/reset actions
 */

import { useCallback } from 'react';
import { MIN_ZOOM, MAX_ZOOM } from '../../hooks/useViewportTransform';

// =============================================================================
// Types
// =============================================================================

export interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (zoom: number) => void;
  onFitContent: () => void;
  onResetViewport: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

// =============================================================================
// Component
// =============================================================================

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomTo,
  onFitContent,
  onResetViewport,
}: ZoomControlsProps) {
  const zoomPercent = Math.round(zoom * 100);
  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

  const handlePresetSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        onZoomTo(value);
      }
    },
    [onZoomTo],
  );

  return (
    <div
      className="flex items-center gap-1 rounded-lg p-1 shadow-lg"
      style={{ backgroundColor: 'var(--control-bg)', border: '1px solid var(--control-border)' }}
    >
      {/* Zoom out button */}
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className="w-7 h-7 flex items-center justify-center rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ color: 'var(--control-fg)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--control-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Zoom out (Ctrl+-)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Zoom percentage dropdown */}
      <select
        value={zoom}
        onChange={handlePresetSelect}
        className="w-16 h-7 bg-transparent text-center text-xs border-none outline-none cursor-pointer rounded"
        style={{ color: 'var(--control-fg)' }}
        title="Select zoom level"
      >
        {ZOOM_PRESETS.map((preset) => (
          <option key={preset} value={preset} style={{ backgroundColor: 'var(--control-bg)' }}>
            {Math.round(preset * 100)}%
          </option>
        ))}
        {/* Add current zoom if not in presets */}
        {!ZOOM_PRESETS.includes(zoom) && (
          <option value={zoom} style={{ backgroundColor: 'var(--control-bg)' }}>
            {zoomPercent}%
          </option>
        )}
      </select>

      {/* Zoom in button */}
      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className="w-7 h-7 flex items-center justify-center rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ color: 'var(--control-fg)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--control-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Zoom in (Ctrl++)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--control-border)' }} />

      {/* Fit content button */}
      <button
        onClick={onFitContent}
        className="w-7 h-7 flex items-center justify-center rounded transition-colors"
        style={{ color: 'var(--control-fg)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--control-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Fit content"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeOpacity="0.5" />
        </svg>
      </button>

      {/* Reset viewport button */}
      <button
        onClick={onResetViewport}
        className="w-7 h-7 flex items-center justify-center rounded transition-colors"
        style={{ color: 'var(--control-fg)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--control-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        title="Reset viewport (100%)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 12a9 9 0 1 0 9-9" />
          <polyline points="3 3 3 9 9 9" />
        </svg>
      </button>
    </div>
  );
}
