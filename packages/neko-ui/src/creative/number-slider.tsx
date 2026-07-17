import { useEffect, useState } from 'react';
import type React from 'react';
import { NumberInput } from './number-input';
import { Slider } from '../primitives/slider';

export interface NumberSliderProps {
  readonly id: string;
  readonly label?: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly onPreviewChange?: (id: string, value: number) => void;
  readonly onCommit?: (id: string, value: number) => void;
}

export function NumberSlider({
  disabled,
  id,
  label,
  max,
  min,
  onCommit,
  onPreviewChange,
  step = 1,
  unit,
  value,
}: NumberSliderProps): React.ReactElement {
  const [draftValue, setDraftValue] = useState(value);
  const previewValue = (nextValue: number): void => {
    setDraftValue(nextValue);
    onPreviewChange?.(id, nextValue);
  };
  const commitValue = (nextValue: number): void => {
    setDraftValue(nextValue);
    onCommit?.(id, nextValue);
  };

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        {label ? (
          <span className="min-w-0 flex-1 truncate text-[var(--vscode-descriptionForeground)]">
            {label}
          </span>
        ) : null}
        <Slider
          className="min-w-24 flex-1"
          disabled={disabled}
          label={label ?? id}
          max={max}
          min={min}
          onCommit={commitValue}
          onPreviewChange={previewValue}
          step={step}
          value={draftValue}
        />
      </div>
      <NumberInput
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onCommit={onCommit}
        onPreviewChange={onPreviewChange}
        step={step}
        unit={unit}
        value={value}
      />
    </div>
  );
}
