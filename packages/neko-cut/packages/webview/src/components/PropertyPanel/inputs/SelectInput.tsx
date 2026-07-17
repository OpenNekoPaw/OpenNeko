import { memo } from 'react';

export interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

export const SelectInput = memo(function SelectInput({
  label,
  value,
  onChange,
  options,
  disabled,
}: SelectInputProps) {
  return (
    <div className="nk-prop-row">
      <label
        className="truncate text-[11px] text-[var(--nk-fg-secondary)]"
        style={{ width: '80px', flexShrink: 0 }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="nk-select flex-1 text-[11px] disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});
