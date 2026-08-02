import React from 'react';
import type { ResizeHandleBindings } from './useResizable';

export interface ResizeHandleProps {
  handleProps: ResizeHandleBindings;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}

export function ResizeHandle({
  handleProps,
  className,
  label,
  style,
}: ResizeHandleProps): React.ReactElement {
  const { style: handleStyle, ...bindings } = handleProps;

  return (
    <div
      {...bindings}
      aria-label={label}
      className={className}
      style={{ ...handleStyle, ...style }}
    />
  );
}
