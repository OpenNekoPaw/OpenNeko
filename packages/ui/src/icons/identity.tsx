import React from 'react';
import type { IconProps } from './types';

void React;

const base = (strokeWidth: number) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function BotIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
      <path d="M9 17h6" />
    </svg>
  );
}

export function UserIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function UsersIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M16 4.6a4 4 0 0 1 0 6.8" />
      <path d="M18 15a6 6 0 0 1 4 6" />
    </svg>
  );
}

export function MessageIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}
