import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface CollapsibleProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly disabled?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
  readonly contentClassName?: string;
}

export function Collapsible({
  children,
  className,
  contentClassName,
  defaultOpen,
  disabled,
  onOpenChange,
  open,
  trigger,
}: CollapsibleProps): React.ReactElement {
  return (
    <CollapsiblePrimitive.Root
      className={cn('grid min-h-0 gap-1', className)}
      defaultOpen={defaultOpen}
      disabled={disabled}
      onOpenChange={onOpenChange}
      open={open}
    >
      <CollapsiblePrimitive.Trigger asChild>{trigger}</CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content
        className={cn('min-h-0 data-[state=closed]:hidden', contentClassName)}
      >
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}
