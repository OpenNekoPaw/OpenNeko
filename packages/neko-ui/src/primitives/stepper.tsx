import { forwardRef, useEffect, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface StepperProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  readonly id: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly label?: string;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly onPreviewChange?: (id: string, value: number) => void;
  readonly onCommit?: (id: string, value: number) => void;
}

export const Stepper = forwardRef<HTMLDivElement, StepperProps>(function Stepper(
  {
    className,
    disabled,
    id,
    label,
    max,
    min,
    onCommit,
    onPreviewChange,
    step = 1,
    unit,
    value,
    ...divProps
  },
  ref,
) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const update = (delta: number): void => {
    const next = clamp(roundToStep(draft + delta, step), { min, max });
    setDraft(next);
    onPreviewChange?.(id, next);
    onCommit?.(id, next);
  };

  return (
    <div
      {...divProps}
      ref={ref}
      className={cn('inline-flex min-w-0 items-center gap-1 text-xs', className)}
      {...getKeyboardBoundaryMetadata({
        scope: 'form-control',
        ownerId: `stepper:${id}`,
        ownedKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'],
      })}
      onKeyDown={(event) => {
        divProps.onKeyDown?.(event);
        if (event.defaultPrevented || disabled) {
          return;
        }

        switch (event.key) {
          case 'ArrowUp':
          case 'ArrowRight':
            event.preventDefault();
            update(step);
            break;
          case 'ArrowDown':
          case 'ArrowLeft':
            event.preventDefault();
            update(-step);
            break;
          case 'Home':
            if (min !== undefined) {
              event.preventDefault();
              updateTo(min);
            }
            break;
          case 'End':
            if (max !== undefined) {
              event.preventDefault();
              updateTo(max);
            }
            break;
          default:
            break;
        }
      }}
      tabIndex={disabled ? undefined : 0}
    >
      {label ? (
        <span className="min-w-0 truncate text-[var(--vscode-descriptionForeground)]">{label}</span>
      ) : null}
      <button
        aria-label={label ? `Decrease ${label}` : `Decrease ${id}`}
        className={stepperButtonClassName}
        disabled={disabled || (min !== undefined && draft <= min)}
        type="button"
        onClick={() => update(-step)}
      >
        -
      </button>
      <span className="min-w-10 text-center tabular-nums text-[var(--vscode-foreground)]">
        {draft}
        {unit ? <span className="text-[var(--vscode-descriptionForeground)]">{unit}</span> : null}
      </span>
      <button
        aria-label={label ? `Increase ${label}` : `Increase ${id}`}
        className={stepperButtonClassName}
        disabled={disabled || (max !== undefined && draft >= max)}
        type="button"
        onClick={() => update(step)}
      >
        +
      </button>
    </div>
  );

  function updateTo(nextValue: number): void {
    const next = clamp(roundToStep(nextValue, step), { min, max });
    setDraft(next);
    onPreviewChange?.(id, next);
    onCommit?.(id, next);
  }
});

const stepperButtonClassName = cn(
  'inline-flex h-6 w-6 items-center justify-center rounded-[var(--neko-radius-sm,6px)]',
  'border border-[var(--neko-border)] bg-[var(--neko-surface)] text-xs',
  'outline-none hover:bg-[var(--neko-hover)] focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

function clamp(value: number, { max, min }: Pick<StepperProps, 'min' | 'max'>): number {
  return Math.max(
    min ?? Number.NEGATIVE_INFINITY,
    Math.min(max ?? Number.POSITIVE_INFINITY, value),
  );
}

function roundToStep(value: number, step: number): number {
  const precision = step.toString().split('.')[1]?.length ?? 0;
  return Number(value.toFixed(precision));
}
