import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface ToggleGroupOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export interface ToggleGroupProps {
  readonly options: readonly ToggleGroupOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly label?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onValueChange?: (value: string) => void;
}

export function ToggleGroup({
  className,
  defaultValue,
  disabled,
  label,
  onValueChange,
  options,
  value,
}: ToggleGroupProps): React.ReactElement {
  return (
    <ToggleGroupPrimitive.Root
      aria-label={label}
      className={cn(
        'inline-flex min-h-7 items-center gap-1 rounded-[var(--neko-radius-sm,6px)]',
        'border border-[var(--neko-border)] bg-[var(--neko-surface)] p-0.5',
        className,
      )}
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={onValueChange}
      type="single"
      value={value}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--neko-radius-sm,6px)] px-2',
            'text-xs text-[var(--vscode-descriptionForeground)] outline-none transition-colors',
            'hover:bg-[var(--neko-hover)] hover:text-[var(--vscode-foreground)]',
            'focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
            'data-[state=on]:bg-[var(--vscode-button-secondaryBackground,var(--vscode-editor-background))]',
            'data-[state=on]:text-[var(--vscode-foreground)]',
            'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          )}
          disabled={option.disabled}
          value={option.value}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
