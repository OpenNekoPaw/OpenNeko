/**
 * ProgressBar - Seek-safe progress bar component
 *
 * Separates drag preview from actual seek to avoid "seek storm" on large files.
 * Only commits seek on mouseup.
 *
 * The hover time tooltip is shown only when `formatTooltip` is provided.
 * Consumers that need time formatting should pass e.g. `formatTime` from @neko/neko-client.
 */

import { useState, useRef, useCallback } from 'react';

export interface ProgressBarProps {
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Called on mouseup — commits the seek to backend */
  onSeekCommit: (time: number) => void;
  /** Called during drag — updates UI time only (no backend seek) */
  onSeeking?: (time: number) => void;
  /** Visual variant: 'default' uses theme colors, 'video' uses white for dark overlays */
  variant?: 'default' | 'video';
  /** Optional tooltip formatter. If omitted, hover tooltip is not shown. */
  formatTooltip?: (time: number) => string;
}

export function ProgressBar({
  currentTime,
  duration,
  onSeekCommit,
  onSeeking,
  variant = 'default',
  formatTooltip,
}: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [seekingTime, setSeekingTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  // =========================================================================
  // Helpers
  // =========================================================================

  const getTimeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  // =========================================================================
  // Mouse interactions
  // =========================================================================

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const time = getTimeFromClientX(e.clientX);
      setIsDragging(true);
      setSeekingTime(time);
      onSeeking?.(time);

      const handleMouseMove = (ev: MouseEvent) => {
        const t = getTimeFromClientX(ev.clientX);
        setSeekingTime(t);
        onSeeking?.(t);
      };

      const handleMouseUp = (ev: MouseEvent) => {
        const t = getTimeFromClientX(ev.clientX);
        setIsDragging(false);
        onSeekCommit(t);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [getTimeFromClientX, onSeekCommit, onSeeking],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverTime(ratio * duration);
      setHoverX(e.clientX - rect.left);
    },
    [duration],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  // =========================================================================
  // Computed values
  // =========================================================================

  const displayTime = isDragging ? seekingTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  const isVideo = variant === 'video';
  const trackBg = isVideo ? 'bg-white/25' : 'neko-progress-track-bg';
  const fillBg = isVideo ? 'bg-white' : 'bg-neko-preview-primary';
  const thumbBg = isVideo ? 'bg-white' : 'bg-neko-preview-text-primary';

  return (
    <div className="relative w-full">
      <div
        ref={trackRef}
        className={`relative h-1 rounded-full ${trackBg} cursor-pointer transition-all duration-150 hover:h-1.5 group`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`absolute top-0 left-0 h-full rounded-full ${fillBg}`}
          style={{ width: `${progress}%` }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${thumbBg} shadow-neko-sm opacity-0 group-hover:opacity-100 transition-opacity -ml-1.5`}
          style={{ left: `${progress}%` }}
        />
      </div>

      {/* Hover tooltip — only shown when formatTooltip is provided */}
      {formatTooltip && hoverTime !== null && !isDragging && (
        <div
          className="absolute -top-8 -translate-x-1/2 px-2 py-1 bg-neko-glass backdrop-blur-neko-glass-sm rounded-neko-sm text-xs text-neko-preview-text-primary shadow-neko-md pointer-events-none"
          style={{ left: `${hoverX}px` }}
        >
          {formatTooltip(hoverTime)}
        </div>
      )}
    </div>
  );
}
