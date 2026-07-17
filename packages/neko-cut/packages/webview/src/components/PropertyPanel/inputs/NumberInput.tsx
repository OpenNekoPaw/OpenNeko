import { memo } from 'react';
import { NumberPropertyRow } from '@neko/ui/creative';

export interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

export const NumberInput = memo(function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
}: NumberInputProps) {
  return (
    <NumberPropertyRow
      density="compact"
      disabled={disabled}
      id={label}
      label={label}
      max={max}
      min={min}
      onPreviewChange={(_, nextValue) => onChange(nextValue)}
      step={step}
      unit={unit}
      value={value}
    />
  );
});
