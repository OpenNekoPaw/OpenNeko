import React from 'react';
import type { ResizeHandleBindings } from './useResizable';

export interface ResizeHandleProps {
  handleProps: ResizeHandleBindings;
  className?: string;
  style?: React.CSSProperties;
}

export function ResizeHandle({
  handleProps,
  className,
  style,
}: ResizeHandleProps): React.ReactElement {
  const { style: handleStyle, ...bindings } = handleProps;

  return <div {...bindings} className={className} style={{ ...handleStyle, ...style }} />;
}
