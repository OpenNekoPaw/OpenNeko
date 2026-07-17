import * as TabsPrimitive from '@radix-ui/react-tabs';
import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface TabsItem {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly content?: ReactNode;
}

export interface TabsProps {
  readonly items: readonly TabsItem[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: TabsPrimitive.TabsProps['orientation'];
  readonly className?: string;
  readonly listClassName?: string;
  readonly contentClassName?: string;
}

export function Tabs({
  className,
  contentClassName,
  defaultValue,
  items,
  listClassName,
  onValueChange,
  orientation = 'horizontal',
  value,
}: TabsProps): React.ReactElement {
  const fallbackValue = items[0]?.value;

  return (
    <TabsPrimitive.Root
      className={cn('grid min-h-0 gap-2', className)}
      defaultValue={defaultValue ?? fallbackValue}
      onValueChange={onValueChange}
      orientation={orientation}
      value={value}
    >
      <TabsPrimitive.List
        className={cn(
          'inline-flex min-h-8 items-center gap-1 rounded-[var(--neko-radius-sm,6px)]',
          'bg-[var(--neko-surface)] p-1 text-xs',
          listClassName,
        )}
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            className={cn(
              'inline-flex h-6 items-center justify-center rounded-[var(--neko-radius-sm,6px)] px-2',
              'text-[var(--vscode-descriptionForeground)] outline-none transition-colors',
              'hover:bg-[var(--neko-hover)] hover:text-[var(--vscode-foreground)]',
              'focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
              'data-[state=active]:bg-[var(--vscode-editor-background)] data-[state=active]:text-[var(--vscode-foreground)]',
              'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            )}
            disabled={item.disabled}
            value={item.value}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content
          key={item.value}
          className={cn('min-h-0 outline-none', contentClassName)}
          value={item.value}
        >
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
