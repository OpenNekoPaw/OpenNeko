import type React from 'react';
import { cn } from '../utils';

export interface ProgressProps {
  readonly value: number;
  readonly max?: number;
  readonly label?: string;
  readonly className?: string;
}

export function Progress({
  className,
  label,
  max = 100,
  value,
}: ProgressProps): React.ReactElement {
  const boundedMax = Number.isFinite(max) && max > 0 ? max : 100;
  const boundedValue = Math.max(0, Math.min(boundedMax, value));
  const percent = (boundedValue / boundedMax) * 100;

  return (
    <div
      aria-label={label}
      aria-valuemax={boundedMax}
      aria-valuemin={0}
      aria-valuenow={boundedValue}
      className={cn(
        'h-1.5 overflow-hidden rounded-[var(--neko-radius-sm,6px)] bg-[var(--neko-surface)]',
        className,
      )}
      role="progressbar"
    >
      <div
        className="h-full bg-[var(--neko-accent)] transition-[width] duration-150"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
