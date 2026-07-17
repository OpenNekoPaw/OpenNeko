import { useCallback, useState } from 'react';
import { formatTime } from '@neko/neko-client';

export interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeekCommit: (time: number) => void;
  onSeeking?: (time: number) => void;
  variant?: 'default' | 'video';
  formatTooltip?: (time: number) => string;
}

export function ProgressBar({
  currentTime,
  duration,
  formatTooltip = formatTime,
  onSeekCommit,
  onSeeking,
  variant = 'default',
}: ProgressBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [seekingTime, setSeekingTime] = useState(0);
  const boundedDuration = readBoundedDuration(duration);
  const displayTime = clampTime(isDragging ? seekingTime : currentTime, boundedDuration);
  const progressPercent = boundedDuration > 0 ? (displayTime / boundedDuration) * 100 : 0;
  const trackClass = variant === 'video' ? 'bg-white/25' : 'bg-[var(--neko-surface)]';
  const fillClass = variant === 'video' ? 'bg-white' : 'bg-[var(--neko-accent)]';

  const readTime = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): number => {
      if (boundedDuration <= 0) return 0;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      return ratio * boundedDuration;
    },
    [boundedDuration],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const time = readTime(event);
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setIsDragging(true);
      setSeekingTime(time);
      onSeeking?.(time);
    },
    [onSeeking, readTime],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const time = readTime(event);
      setSeekingTime(time);
      onSeeking?.(time);
    },
    [isDragging, onSeeking, readTime],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const time = readTime(event);
      setIsDragging(false);
      onSeekCommit(time);
    },
    [onSeekCommit, readTime],
  );

  return (
    <div
      aria-label={formatTooltip(displayTime)}
      aria-valuemax={boundedDuration}
      aria-valuemin={0}
      aria-valuenow={displayTime}
      aria-valuetext={formatTooltip(displayTime)}
      className="group cursor-pointer py-1 outline-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="slider"
      tabIndex={0}
    >
      <div
        className={`h-1 overflow-hidden rounded-[var(--neko-radius-sm,6px)] transition-all group-hover:h-1.5 ${trackClass}`}
      >
        <div
          className={`h-full transition-[width] duration-150 ${fillClass}`}
          data-neko-preview-progress-fill
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

function readBoundedDuration(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0;
  if (duration <= 0) return 0;
  return Math.min(time, duration);
}
