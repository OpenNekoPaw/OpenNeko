import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onChange' | 'role'
> {
  readonly checked: boolean;
  readonly id?: string;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly onCheckedChange?: (checked: boolean) => void;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, className, description, disabled, id, label, onCheckedChange, ...buttonProps },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      aria-checked={checked}
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-[var(--neko-radius-sm,6px)] text-xs',
        'text-[var(--vscode-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={(event) => {
        buttonProps.onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
          onCheckedChange?.(!checked);
        }
      }}
      {...getKeyboardBoundaryMetadata({
        scope: 'form-control',
        ownerId: id ? `switch:${id}` : 'switch',
        ownedKeys: ['Space', 'Enter'],
      })}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 rounded-full border border-[var(--neko-border)] transition-colors',
          checked ? 'bg-[var(--neko-accent)]' : 'bg-[var(--neko-surface)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-[var(--vscode-editor-background)] transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
      {label !== undefined || description !== undefined ? (
        <span className="grid min-w-0 gap-0.5 text-left">
          {label !== undefined ? <span className="min-w-0 truncate">{label}</span> : null}
          {description !== undefined ? (
            <span className="min-w-0 text-[11px] text-[var(--vscode-descriptionForeground)]">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
});
