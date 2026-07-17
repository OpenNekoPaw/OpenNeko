import { memo } from 'react';
import { ColorPropertyRow } from '@neko/ui/creative';

export interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const ColorInput = memo(function ColorInput({
  label,
  value,
  onChange,
  disabled,
}: ColorInputProps) {
  return (
    <ColorPropertyRow
      density="compact"
      disabled={disabled}
      id={label}
      label={label}
      onPreviewChange={(_, nextValue) => onChange(nextValue)}
      value={value}
    />
  );
});
