import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface ScrollAreaProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly viewportClassName?: string;
  readonly orientation?: 'vertical' | 'horizontal' | 'both';
}

export function ScrollArea({
  children,
  className,
  orientation = 'vertical',
  viewportClassName,
}: ScrollAreaProps): React.ReactElement {
  const showVertical = orientation === 'vertical' || orientation === 'both';
  const showHorizontal = orientation === 'horizontal' || orientation === 'both';

  return (
    <ScrollAreaPrimitive.Root className={cn('relative min-h-0 overflow-hidden', className)}>
      <ScrollAreaPrimitive.Viewport className={cn('h-full w-full', viewportClassName)}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      {showVertical ? <ScrollBar orientation="vertical" /> : null}
      {showHorizontal ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner className="bg-[var(--neko-surface)]" />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  orientation,
}: {
  readonly orientation: 'vertical' | 'horizontal';
}): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        'flex touch-none select-none bg-transparent p-0.5 transition-colors',
        orientation === 'vertical' ? 'h-full w-2.5' : 'h-2.5 flex-col',
      )}
      orientation={orientation}
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-[var(--neko-border)]" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
