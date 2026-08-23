import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils';
import type { PrimitiveBaseProps } from './types';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, PrimitiveBaseProps {
  readonly icon: ReactNode;
  readonly label: string;
}

const sizeClassNames = {
  xs: 'h-6 w-6',
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
} satisfies Record<NonNullable<PrimitiveBaseProps['size']>, string>;

const variantClassNames = {
  default:
    'bg-[var(--neko-button-background,var(--neko-accent))] text-[var(--neko-button-foreground)] hover:bg-[var(--neko-button-hoverBackground,var(--neko-button-background,var(--neko-accent)))]',
  ghost: 'bg-transparent text-[var(--neko-foreground)] hover:bg-[var(--neko-hover)]',
  secondary:
    'bg-[var(--neko-surface)] text-[var(--neko-foreground)] border border-[var(--neko-border)] hover:bg-[var(--neko-hover)]',
  danger:
    'bg-[var(--neko-danger)] text-[var(--neko-button-foreground)] hover:bg-[var(--neko-inputValidation-errorBackground,var(--neko-danger))]',
} satisfies Record<NonNullable<PrimitiveBaseProps['variant']>, string>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, disabled, icon, label, size = 'sm', type = 'button', variant = 'ghost', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--neko-radius-sm,6px)]',
        'transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--neko-focusBorder)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--neko-editor-background)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClassNames[variant],
        sizeClassNames[size],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
});
