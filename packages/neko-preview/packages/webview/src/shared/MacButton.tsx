import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from '@neko/ui/primitives';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface MacButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  active?: boolean;
}

const variantMap: Record<ButtonVariant, 'default' | 'secondary' | 'ghost'> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  icon: 'ghost',
};

const sizeMap: Record<ButtonSize, 'xs' | 'sm' | 'md'> = {
  sm: 'xs',
  md: 'sm',
  lg: 'md',
};

export function MacButton({
  active = false,
  children,
  className = '',
  size = 'md',
  variant = 'secondary',
  ...props
}: MacButtonProps) {
  const iconClass =
    variant === 'icon'
      ? size === 'lg'
        ? 'h-12 w-12 rounded-full'
        : size === 'sm'
          ? 'h-7 w-7 rounded-full p-0'
          : 'h-9 w-9 rounded-full p-0'
      : '';
  const activeClass = active ? 'bg-[var(--neko-hover)] text-[var(--vscode-foreground)]' : '';

  return (
    <Button
      className={`${iconClass} ${activeClass} ${className}`}
      size={sizeMap[size]}
      variant={variantMap[variant]}
      {...props}
    >
      {children}
    </Button>
  );
}
