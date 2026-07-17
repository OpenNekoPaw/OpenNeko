/**
 * MacButton - macOS-style button component
 *
 * Variants:
 * - primary: Solid background with accent color
 * - secondary: Glass effect with border
 * - ghost: Transparent with hover effect
 * - icon: Circular icon button
 */

import { type ReactNode, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface MacButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  active?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-neko-preview-primary hover:bg-neko-preview-primary-hover active:bg-neko-preview-primary-active text-white',
  secondary:
    'bg-neko-glass hover:bg-neko-glass-hover active:bg-neko-glass-active neko-speed-border text-neko-preview-text-primary',
  ghost:
    'bg-transparent hover:bg-neko-surface active:bg-neko-surface-hover text-neko-preview-text-primary',
  icon: 'bg-transparent hover:bg-neko-surface active:bg-neko-surface-hover text-neko-preview-text-secondary hover:text-neko-preview-text-primary rounded-full',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
};

export function MacButton({
  variant = 'secondary',
  size = 'md',
  children,
  active = false,
  className = '',
  disabled = false,
  ...props
}: MacButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all duration-150 outline-none focus:ring-2 focus:ring-neko-preview-primary/50 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClass = variantClasses[variant];
  const sizeClass = variant === 'icon' ? iconSizeClasses[size] : sizeClasses[size];
  const roundedClass = variant === 'icon' ? '' : 'rounded-neko-md';
  const activeClass = active ? 'bg-neko-glass-active' : '';

  return (
    <button
      className={`${baseClasses} ${variantClass} ${sizeClass} ${roundedClass} ${activeClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
