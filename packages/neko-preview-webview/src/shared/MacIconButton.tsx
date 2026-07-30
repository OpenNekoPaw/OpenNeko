import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IconButton } from '@neko/ui/primitives';

export type IconButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface MacIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  children: ReactNode;
  active?: boolean;
  variant?: 'default' | 'primary';
}

const sizeClassMap: Record<IconButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
  xl: 'h-14 w-14',
};

export function MacIconButton({
  active = false,
  children,
  className = '',
  size = 'md',
  title,
  variant = 'default',
  ...props
}: MacIconButtonProps) {
  const label = typeof title === 'string' ? title : (props['aria-label'] ?? 'Icon button');
  const activeClass = active ? 'bg-[var(--neko-hover)] text-[var(--vscode-foreground)]' : '';

  return (
    <IconButton
      className={`${sizeClassMap[size]} rounded-full ${activeClass} ${className}`}
      icon={children}
      label={label}
      title={title}
      variant={variant === 'primary' ? 'default' : 'ghost'}
      {...props}
    />
  );
}
