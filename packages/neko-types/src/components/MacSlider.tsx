/**
 * MacSlider - macOS-style slider component
 *
 * Uses .neko-slider CSS class for pseudo-element styling (::-webkit-slider-thumb).
 * The CSS class must be present in the consuming package's stylesheet.
 */

import { type InputHTMLAttributes } from 'react';

export interface MacSliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

export function MacSlider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  className = '',
  ...props
}: MacSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`neko-slider ${className}`}
      style={{
        background: `linear-gradient(to right, var(--neko-preview-primary) 0%, var(--neko-preview-primary) ${percentage}%, rgba(255, 255, 255, 0.15) ${percentage}%, rgba(255, 255, 255, 0.15) 100%)`,
      }}
      {...props}
    />
  );
}
