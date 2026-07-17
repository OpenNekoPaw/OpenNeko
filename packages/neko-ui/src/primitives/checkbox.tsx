import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'onChange' | 'type'
> {
  readonly checked: boolean;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, className, description, disabled, id, label, onCheckedChange, ...inputProps },
  ref,
) {
  const inputId = id ?? inputProps.name;
  return (
    <label
      className={cn(
        'inline-flex min-w-0 items-center gap-2 text-xs text-[var(--vscode-foreground)]',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <input
        {...inputProps}
        ref={ref}
        id={inputId}
        checked={checked}
        className={cn(
          'h-4 w-4 shrink-0 rounded-[var(--neko-radius-sm,6px)] accent-[var(--neko-accent)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
        {...getKeyboardBoundaryMetadata({
          scope: 'form-control',
          ownerId: inputId ? `checkbox:${inputId}` : 'checkbox',
          ownedKeys: ['Space', 'Enter'],
        })}
      />
      {label !== undefined || description !== undefined ? (
        <span className="grid min-w-0 gap-0.5">
          {label !== undefined ? <span className="min-w-0 truncate">{label}</span> : null}
          {description !== undefined ? (
            <span className="min-w-0 text-[11px] text-[var(--vscode-descriptionForeground)]">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
});
