import * as SliderPrimitive from '@radix-ui/react-slider';
import type React from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';

export interface SliderProps {
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly className?: string;
  readonly onPreviewChange?: (value: number) => void;
  readonly onCommit?: (value: number) => void;
}

export function Slider({
  className,
  disabled,
  label,
  max = 100,
  min = 0,
  onCommit,
  onPreviewChange,
  step = 1,
  value,
}: SliderProps): React.ReactElement {
  return (
    <SliderPrimitive.Root
      aria-label={label}
      className={cn('relative flex h-5 w-full touch-none select-none items-center', className)}
      disabled={disabled}
      max={max}
      min={min}
      onValueChange={(nextValue) => {
        const first = nextValue[0];
        if (first !== undefined) {
          onPreviewChange?.(first);
        }
      }}
      onValueCommit={(nextValue) => {
        const first = nextValue[0];
        if (first !== undefined) {
          onCommit?.(first);
        }
      }}
      step={step}
      value={[value]}
      {...getKeyboardBoundaryMetadata({
        scope: 'timeline',
        ownerId: label ? `slider:${label}` : 'slider',
        ownedKeys: [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ],
      })}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-[var(--neko-surface)]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--neko-accent)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block h-3.5 w-3.5 rounded-full border border-[var(--neko-border)] bg-[var(--vscode-editor-background)] shadow-[var(--neko-shadow-sm,0_2px_8px_rgba(0,0,0,0.25))] outline-none focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)] disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  );
}
