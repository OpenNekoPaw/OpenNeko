/**
 * MacIconButton - macOS-style icon button
 *
 * Circular button with icon, commonly used in media controls.
 */

import { type ReactNode, type ButtonHTMLAttributes } from 'react';

export type IconButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface MacIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  children: ReactNode;
  active?: boolean;
  variant?: 'default' | 'primary';
}

const sizeClasses: Record<IconButtonSize, { button: string; icon: string }> = {
  sm: { button: 'w-7 h-7', icon: 'w-4 h-4' },
  md: { button: 'w-9 h-9', icon: 'w-5 h-5' },
  lg: { button: 'w-11 h-11', icon: 'w-6 h-6' },
  xl: { button: 'w-14 h-14', icon: 'w-7 h-7' },
};

export function MacIconButton({
  size = 'md',
  children,
  active = false,
  variant = 'default',
  className = '',
  disabled = false,
  ...props
}: MacIconButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-full transition-all duration-150 outline-none focus:ring-2 focus:ring-neko-preview-primary/50 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses =
    variant === 'primary'
      ? 'bg-neko-preview-text-primary text-neko-preview-bg hover:scale-105'
      : 'bg-transparent text-neko-preview-text-secondary hover:text-neko-preview-text-primary hover:scale-110';

  const activeClass = active ? 'bg-neko-glass-active' : '';
  const { button: buttonSize } = sizeClasses[size];

  return (
    <button
      className={`${baseClasses} ${variantClasses} ${buttonSize} ${activeClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
