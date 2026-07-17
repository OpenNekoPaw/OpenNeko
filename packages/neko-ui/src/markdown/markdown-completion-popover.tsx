import type React from 'react';
import type { MarkdownCompletionItem } from './types';
import { cn } from '../utils';

export interface MarkdownCompletionPopoverProps {
  readonly items: readonly MarkdownCompletionItem[];
  readonly activeIndex?: number;
  readonly onSelect: (item: MarkdownCompletionItem) => void;
  readonly className?: string;
}

export function MarkdownCompletionPopover({
  items,
  activeIndex = 0,
  onSelect,
  className,
}: MarkdownCompletionPopoverProps): React.ReactElement | null {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'absolute left-2 top-full z-20 mt-1 max-h-44 min-w-44 overflow-auto rounded border border-gray-200 bg-white p-1 text-xs shadow-lg',
        className,
      )}
      data-markdown-completion-popover="true"
      role="listbox"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            'flex w-full min-w-0 flex-col rounded px-2 py-1 text-left',
            index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-gray-800',
          )}
          data-markdown-completion-item={item.id}
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
        >
          <span className="truncate font-medium">{item.label}</span>
          {item.detail ? (
            <span className="truncate text-[10px] opacity-70">{item.detail}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
