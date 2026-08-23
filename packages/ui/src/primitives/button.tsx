import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils';
import type { PrimitiveBaseProps } from './types';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, PrimitiveBaseProps {
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
}

const variantClassNames = {
  default:
    'bg-[var(--neko-button-background,var(--neko-accent))] text-[var(--neko-button-foreground)] hover:bg-[var(--neko-button-hoverBackground,var(--neko-button-background,var(--neko-accent)))]',
  ghost: 'bg-transparent text-[var(--neko-foreground)] hover:bg-[var(--neko-hover)]',
  secondary:
    'bg-[var(--neko-surface)] text-[var(--neko-foreground)] border border-[var(--neko-border)] hover:bg-[var(--neko-hover)]',
  danger:
    'bg-[var(--neko-danger)] text-[var(--neko-button-foreground)] hover:bg-[var(--neko-inputValidation-errorBackground,var(--neko-danger))]',
} satisfies Record<NonNullable<PrimitiveBaseProps['variant']>, string>;

const sizeClassNames = {
  xs: 'h-6 px-2 text-[11px]',
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
} satisfies Record<NonNullable<PrimitiveBaseProps['size']>, string>;

const densityClassNames = {
  compact: 'gap-1',
  default: 'gap-1.5',
} satisfies Record<NonNullable<PrimitiveBaseProps['density']>, string>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    density = 'default',
    disabled,
    leadingIcon,
    size = 'sm',
    trailingIcon,
    type = 'button',
    variant = 'default',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--neko-radius-sm,6px)] font-medium',
        'transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--neko-focusBorder)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--neko-editor-background)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClassNames[variant],
        sizeClassNames[size],
        densityClassNames[density],
        className,
      )}
      {...props}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
