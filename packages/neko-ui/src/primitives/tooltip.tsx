import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { createContext, useContext } from 'react';
import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

const TooltipProviderContext = createContext(false);

export interface TooltipProps {
  readonly children: ReactNode;
  readonly content: ReactNode;
  readonly side?: TooltipPrimitive.TooltipContentProps['side'];
}

export function Tooltip({ children, content, side = 'top' }: TooltipProps): React.ReactElement {
  const hasProvider = useContext(TooltipProviderContext);
  const tooltip = (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className={cn(
            'z-50 rounded-[var(--neko-radius-sm,6px)] border border-[var(--neko-border)]',
            'bg-[var(--neko-glass-bg,var(--vscode-editorWidget-background))] px-2 py-1',
            'text-xs text-[var(--vscode-foreground)] shadow-[var(--neko-shadow-sm,0_2px_8px_rgba(0,0,0,0.25))]',
          )}
          side={side}
          sideOffset={6}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--neko-border)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );

  return hasProvider ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>;
}

export interface TooltipProviderProps {
  readonly children: ReactNode;
  readonly delayDuration?: number;
  readonly skipDelayDuration?: number;
}

export function TooltipProvider({
  children,
  delayDuration = 350,
  skipDelayDuration = 300,
}: TooltipProviderProps): React.ReactElement {
  return (
    <TooltipProviderContext.Provider value>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
      >
        {children}
      </TooltipPrimitive.Provider>
    </TooltipProviderContext.Provider>
  );
}
