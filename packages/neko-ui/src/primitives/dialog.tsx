import * as DialogPrimitive from '@radix-ui/react-dialog';
import type React from 'react';
import type { ReactNode } from 'react';
import { toCodiconClassName } from '../icons/codicon';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface DialogProps {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly trigger?: ReactNode;
  readonly description?: ReactNode;
  readonly footer?: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly closeLabel?: string;
  readonly className?: string;
}

export function Dialog({
  children,
  className,
  closeLabel = 'Close dialog',
  defaultOpen,
  description,
  footer,
  onOpenChange,
  open,
  title,
  trigger,
}: DialogProps): React.ReactElement {
  return (
    <DialogPrimitive.Root defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn('fixed inset-0 z-50 bg-[var(--neko-overlay-bg,rgba(0,0,0,0.45))]')}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 gap-3',
            'rounded-[var(--neko-radius-md,8px)] border border-[var(--neko-border)]',
            'bg-[var(--vscode-editorWidget-background)] p-4 text-[var(--vscode-foreground)]',
            'shadow-[var(--neko-shadow-lg,0_16px_48px_rgba(0,0,0,0.36))] outline-none',
            className,
          )}
          {...getKeyboardBoundaryMetadata({
            scope: 'modal',
            ownerId: 'dialog',
            priority: 50,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          })}
        >
          <div className="grid gap-1 pr-8">
            <DialogPrimitive.Title className="text-sm font-semibold text-[var(--vscode-foreground)]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-xs text-[var(--vscode-descriptionForeground)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <div className="min-h-0 text-sm">{children}</div>
          {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className={cn(
              'absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center',
              'rounded-[var(--neko-radius-sm,6px)] text-[var(--vscode-icon-foreground,var(--vscode-foreground))]',
              'outline-none hover:bg-[var(--neko-hover)] focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
            )}
            type="button"
          >
            <span aria-hidden="true" className={toCodiconClassName('close')} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
