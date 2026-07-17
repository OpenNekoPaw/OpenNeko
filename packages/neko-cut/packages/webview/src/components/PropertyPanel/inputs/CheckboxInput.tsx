import { memo } from 'react';
import { Checkbox } from '@neko/ui/primitives';

export interface CheckboxInputProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const CheckboxInput = memo(function CheckboxInput({
  label,
  checked,
  onChange,
  disabled,
}: CheckboxInputProps) {
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      id={label}
      label={label}
      onCheckedChange={onChange}
    />
  );
});
