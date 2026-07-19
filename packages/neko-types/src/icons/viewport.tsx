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

export function PointerIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M5 3l12 9-5 1.2 3.4 5.9-2.5 1.4-3.3-5.8L6 18z" />
    </svg>
  );
}

export function InspectIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <rect x="3" y="4" width="15" height="13" rx="2" />
      <path d="m13 12 8 3.5-3.6 1.2-1.2 3.6z" />
    </svg>
  );
}

export function MoveIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M12 3v18M3 12h18" />
      <path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />
    </svg>
  );
}

export function RotateIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M6.1 9A7 7 0 0 1 18.7 6L20 12" />
      <path d="M17.9 15A7 7 0 0 1 5.3 18L4 12" />
    </svg>
  );
}

export function ScaleIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M8 3H3v5M16 21h5v-5M3 3l6 6M21 21l-6-6" />
      <path d="M16 3h5v5M8 21H3v-5" />
    </svg>
  );
}

export function GridIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  );
}

export function AxesIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="3.5" r="2" />
      <circle cx="4.5" cy="17" r="2" />
      <circle cx="19.5" cy="17" r="2" />
      <path d="M12 9.5v-4M9.9 13.4l-3.7 2.4M14.1 13.4l3.7 2.4" />
    </svg>
  );
}

export function FrameSelectionIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      <path d="M9 9h6v6H9z" />
    </svg>
  );
}

export function MannequinIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6v6m-5-3 5-2 5 2M9 20l3-8 3 8M7 9l-2 6M17 9l2 6" />
    </svg>
  );
}

export function CubeIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />
    </svg>
  );
}

export function LightIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-1 .7-1.5 1.5-1.5 2.5h-4c0-1-.5-1.8-1.5-2.5Z" />
    </svg>
  );
}

export function PanoramaIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      <path d="M4 8a10 4 0 0 1 16 0M4 16a10 4 0 0 0 16 0M3 12h18" />
      <path d="m6 9-3 3 3 3M18 9l3 3-3 3" />
    </svg>
  );
}
