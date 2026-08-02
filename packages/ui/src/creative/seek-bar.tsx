import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';

export interface SeekBarProps {
  readonly currentTime: number;
  readonly duration: number;
  readonly onSeekCommit: (time: number) => void;
  readonly onSeeking?: (time: number) => void;
  readonly variant?: 'default' | 'video';
  readonly formatTooltip?: (time: number) => string;
}

export function SeekBar({
  currentTime,
  duration,
  formatTooltip,
  onSeekCommit,
  onSeeking,
  variant = 'default',
}: SeekBarProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [seekingTime, setSeekingTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

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

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const time = getTimeFromClientX(event.clientX);
      setIsDragging(true);
      setSeekingTime(time);
      onSeeking?.(time);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextTime = getTimeFromClientX(moveEvent.clientX);
        setSeekingTime(nextTime);
        onSeeking?.(nextTime);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        const commitTime = getTimeFromClientX(upEvent.clientX);
        setIsDragging(false);
        onSeekCommit(commitTime);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [getTimeFromClientX, onSeekCommit, onSeeking],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setHoverTime(ratio * duration);
      setHoverX(event.clientX - rect.left);
    },
    [duration],
  );

  const displayTime = isDragging ? seekingTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const isVideo = variant === 'video';
  const trackBg = isVideo ? 'bg-white/25' : 'neko-progress-track-bg';
  const fillBg = isVideo ? 'bg-white' : 'bg-neko-preview-primary';
  const thumbBg = isVideo ? 'bg-white' : 'bg-neko-preview-text-primary';

  return (
    <div
      className="relative w-full"
      {...getKeyboardBoundaryMetadata({
        scope: 'timeline',
        ownerId: 'seek-bar',
        ownedKeys: ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Space'],
      })}
    >
      <div
        ref={trackRef}
        className={`relative h-1 rounded-full ${trackBg} cursor-pointer transition-all duration-150 hover:h-1.5 group`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverTime(null)}
      >
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${fillBg}`}
          style={{ width: `${progress}%` }}
        />
        <div
          className={`absolute top-1/2 -ml-1.5 h-3 w-3 -translate-y-1/2 rounded-full ${thumbBg} opacity-0 shadow-neko-sm transition-opacity group-hover:opacity-100`}
          style={{ left: `${progress}%` }}
        />
      </div>

      {formatTooltip && hoverTime !== null && !isDragging ? (
        <div
          className="absolute -top-8 -translate-x-1/2 rounded-neko-sm bg-neko-glass px-2 py-1 text-xs text-neko-preview-text-primary shadow-neko-md backdrop-blur-neko-glass-sm pointer-events-none"
          style={{ left: `${hoverX}px` }}
        >
          {formatTooltip(hoverTime)}
        </div>
      ) : null}
    </div>
  );
}

export { SeekBar as ProgressBar };
export type { SeekBarProps as ProgressBarProps };
