import * as PopoverPrimitive from '@radix-ui/react-popover';
import type React from 'react';
import type { ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';
import './popover.css';

export interface PopoverProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly contentClassName?: string;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly align?: PopoverPrimitive.PopoverContentProps['align'];
  readonly side?: PopoverPrimitive.PopoverContentProps['side'];
}

export function Popover({
  align = 'center',
  children,
  contentClassName,
  defaultOpen,
  onOpenChange,
  open,
  side = 'bottom',
  trigger,
}: PopoverProps): React.ReactElement {
  return (
    <PopoverPrimitive.Root defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          className={cn('neko-popover-surface', contentClassName)}
          side={side}
          sideOffset={6}
          {...getKeyboardBoundaryMetadata({
            scope: 'popover',
            ownerId: 'popover',
            priority: 30,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          })}
        >
          {children}
          <PopoverPrimitive.Arrow className="neko-popover-arrow" data-neko-popover-arrow="true" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
