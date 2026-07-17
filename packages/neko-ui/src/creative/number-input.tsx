import { useEffect, useState } from 'react';
import type React from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface NumberInputProps {
  readonly id: string;
  readonly label?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onPreviewChange?: (id: string, value: number) => void;
  readonly onCommit?: (id: string, value: number) => void;
}

export function NumberInput({
  className,
  disabled,
  id,
  label,
  max,
  min,
  onCommit,
  onPreviewChange,
  step,
  unit,
  value,
}: NumberInputProps): React.ReactElement {
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = (): void => {
    const parsed = parseBoundedNumber(draft, value, { min, max });
    setDraft(String(parsed));
    onCommit?.(id, parsed);
  };

  return (
    <label className={cn('flex min-w-0 items-center gap-2 text-xs', className)}>
      {label ? (
        <span className="min-w-0 flex-1 truncate text-[var(--vscode-descriptionForeground)]">
          {label}
        </span>
      ) : null}
      <span className="flex min-w-0 items-center gap-1">
        <input
          aria-label={label ?? id}
          className={cn(
            'h-7 w-20 rounded-[var(--neko-radius-sm,6px)] border border-[var(--neko-border)]',
            'bg-[var(--vscode-input-background)] px-2 text-right text-xs text-[var(--vscode-input-foreground)]',
            'outline-none focus-visible:border-[var(--vscode-focusBorder)] disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={disabled}
          {...getKeyboardBoundaryMetadata({
            scope: 'text-input',
            ownerId: `number-input:${id}`,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown'],
          })}
          inputMode="decimal"
          max={max}
          min={min}
          onBlur={commitDraft}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setDraft(next);
            const parsed = parseOptionalNumber(next, { min, max });
            if (parsed !== undefined) {
              onPreviewChange?.(id, parsed);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitDraft();
            }
          }}
          step={step}
          type="number"
          value={draft}
        />
        {unit ? (
          <span className="shrink-0 text-[11px] text-[var(--vscode-descriptionForeground)]">
            {unit}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function parseOptionalNumber(
  value: string,
  bounds: Pick<NumberInputProps, 'min' | 'max'>,
): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, bounds) : undefined;
}

function parseBoundedNumber(
  value: string,
  fallback: number,
  bounds: Pick<NumberInputProps, 'min' | 'max'>,
): number {
  return parseOptionalNumber(value, bounds) ?? clamp(fallback, bounds);
}

function clamp(value: number, { max, min }: Pick<NumberInputProps, 'min' | 'max'>): number {
  return Math.max(
    min ?? Number.NEGATIVE_INFINITY,
    Math.min(max ?? Number.POSITIVE_INFINITY, value),
  );
}
