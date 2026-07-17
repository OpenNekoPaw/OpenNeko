import * as PopoverPrimitive from '@radix-ui/react-popover';
import type React from 'react';
import type { ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface PopoverProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly align?: PopoverPrimitive.PopoverContentProps['align'];
  readonly side?: PopoverPrimitive.PopoverContentProps['side'];
}

export function Popover({
  align = 'center',
  children,
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
          className={cn(
            'z-50 min-w-40 rounded-[var(--neko-radius-md,8px)] border border-[var(--neko-border)]',
            'bg-[var(--neko-glass-bg,var(--vscode-editorWidget-background))] p-2 text-sm text-[var(--vscode-foreground)]',
            'shadow-[var(--neko-shadow-md,0_8px_24px_rgba(0,0,0,0.28))] outline-none',
          )}
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
          <PopoverPrimitive.Arrow className="fill-[var(--neko-border)]" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
