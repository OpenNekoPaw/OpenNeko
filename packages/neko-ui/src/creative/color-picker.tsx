import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface ColorSwatchProps {
  readonly value: string;
  readonly alpha?: number;
  readonly label?: string;
  readonly className?: string;
}

export interface ColorPickerProps extends ColorSwatchProps {
  readonly id: string;
  readonly disabled?: boolean;
  readonly onPreviewChange?: (id: string, value: string) => void;
  readonly onCommit?: (id: string, value: string) => void;
}

export function ColorSwatch({
  alpha = 1,
  className,
  label,
  value,
}: ColorSwatchProps): React.ReactElement {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-block h-5 w-5 rounded-[var(--neko-radius-sm,6px)] border border-[var(--neko-border)]',
        className,
      )}
      role={label ? 'img' : undefined}
      style={{ backgroundColor: value, opacity: alpha }}
    />
  );
}

export function ColorPicker({
  alpha,
  className,
  disabled,
  id,
  label,
  onCommit,
  onPreviewChange,
  value,
}: ColorPickerProps): React.ReactElement {
  const [draftValue, setDraftValue] = useState(value);
  const draftValueRef = useRef(value);

  useEffect(() => {
    setDraftValue(value);
    draftValueRef.current = value;
  }, [value]);

  return (
    <label className={cn('flex min-w-0 items-center gap-2 text-xs', className)}>
      {label ? (
        <span className="min-w-0 flex-1 truncate text-[var(--vscode-descriptionForeground)]">
          {label}
        </span>
      ) : null}
      <span className="flex items-center gap-2">
        <ColorSwatch alpha={alpha} label={label ? `${label} swatch` : undefined} value={value} />
        <input
          aria-label={label ?? id}
          className="h-7 w-10 cursor-pointer rounded-[var(--neko-radius-sm,6px)] border border-[var(--neko-border)] bg-[var(--vscode-input-background)] p-0 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          {...getKeyboardBoundaryMetadata({
            scope: 'text-input',
            ownerId: `color-input:${id}`,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          })}
          onBlur={() => {
            onCommit?.(id, draftValueRef.current);
          }}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setDraftValue(nextValue);
            draftValueRef.current = nextValue;
            onPreviewChange?.(id, nextValue);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCommit?.(id, draftValueRef.current);
            }
          }}
          type="color"
          value={draftValue}
        />
      </span>
    </label>
  );
}
