import type { CSSProperties } from 'react';
import { Slider } from '@neko/ui/primitives';

export interface MacSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  onChange: (value: number) => void;
}

export function MacSlider({
  className = '',
  disabled,
  max = 1,
  min = 0,
  onChange,
  step = 0.01,
  style,
  title,
  value,
}: MacSliderProps) {
  const label = typeof title === 'string' ? title : undefined;

  return (
    <div className={className || 'w-full'} style={style} title={label}>
      <Slider
        disabled={disabled}
        label={label}
        max={max}
        min={min}
        onCommit={onChange}
        onPreviewChange={onChange}
        step={step}
        value={value}
      />
    </div>
  );
}
