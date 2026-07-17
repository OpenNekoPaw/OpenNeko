import { useState } from 'react';
import type React from 'react';
import { cn } from '../utils';

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: React.ReactNode;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps {
  readonly label: string;
  readonly options: readonly SegmentedControlOption[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly className?: string;
  readonly id?: string;
  readonly controls?: string;
}

export function SegmentedControl({
  className,
  controls,
  id,
  label,
  onValueChange,
  options,
  value,
}: SegmentedControlProps): React.ReactElement {
  const [focusedValue, setFocusedValue] = useState<string | null>(null);
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const thumbWidth = `${100 / Math.max(options.length, 1)}%`;

  return (
    <div
      id={id}
      className={cn('neko-segmented-control', className)}
      role="tablist"
      aria-label={label}
      style={SEGMENTED_CONTROL_STYLE}
    >
      <span
        className="neko-segmented-control-thumb"
        aria-hidden="true"
        style={{
          ...SEGMENTED_CONTROL_THUMB_STYLE,
          width: thumbWidth,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-controls={controls}
            aria-selected={selected}
            className={cn('neko-segmented-control-item', selected ? 'active' : null)}
            disabled={option.disabled}
            title={option.description ?? String(option.label)}
            onBlur={() => setFocusedValue((current) => (current === option.value ? null : current))}
            onClick={() => onValueChange(option.value)}
            onFocus={() => setFocusedValue(option.value)}
            onMouseEnter={() => setHoveredValue(option.value)}
            onMouseLeave={() =>
              setHoveredValue((current) => (current === option.value ? null : current))
            }
            style={{
              ...SEGMENTED_CONTROL_ITEM_STYLE,
              ...(hoveredValue === option.value && !selected
                ? SEGMENTED_CONTROL_ITEM_HOVER_STYLE
                : null),
              ...(focusedValue === option.value ? SEGMENTED_CONTROL_ITEM_FOCUS_STYLE : null),
              ...(option.disabled ? SEGMENTED_CONTROL_ITEM_DISABLED_STYLE : null),
              ...(selected ? SEGMENTED_CONTROL_ITEM_ACTIVE_STYLE : null),
            }}
          >
            <span className="neko-segmented-control-label" style={SEGMENTED_CONTROL_LABEL_STYLE}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const SEGMENTED_CONTROL_STYLE: React.CSSProperties = {
  display: 'flex',
  position: 'relative',
  gap: 0,
  width: '100%',
  maxWidth: 176,
  margin: '0 auto',
  padding: 2,
  border: '1px solid var(--vscode-widget-border, var(--vscode-input-border, #d0d7de))',
  borderRadius: 999,
  background: 'var(--vscode-input-background, var(--vscode-editor-background, #ffffff))',
  boxShadow:
    'inset 0 1px 2px rgba(0, 0, 0, 0.12), inset 0 -1px 0 rgba(255, 255, 255, 0.58), 0 1px 0 rgba(255, 255, 255, 0.45)',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const SEGMENTED_CONTROL_THUMB_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  bottom: 2,
  left: 2,
  border: '1px solid rgba(255, 255, 255, 0.58)',
  borderRadius: 999,
  background: 'var(--vscode-button-background, #0e639c)',
  boxShadow:
    '0 1px 1px rgba(255, 255, 255, 0.32) inset, 0 1px 3px rgba(0, 0, 0, 0.24), 0 0 0 1px var(--vscode-focusBorder, rgba(0, 122, 255, 0.26))',
  pointerEvents: 'none',
  transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  zIndex: 0,
};

const SEGMENTED_CONTROL_ITEM_STYLE: React.CSSProperties = {
  position: 'relative',
  flex: '1 1 0',
  minWidth: 0,
  height: 24,
  border: '1px solid transparent',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--vscode-foreground, inherit)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  lineHeight: '22px',
  padding: '0 8px',
  textAlign: 'center',
  outline: 'none',
  transition: 'background 120ms ease, color 120ms ease, box-shadow 120ms ease',
  zIndex: 1,
};

const SEGMENTED_CONTROL_ITEM_HOVER_STYLE: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--vscode-foreground, #000000) 6%, transparent)',
};

const SEGMENTED_CONTROL_ITEM_FOCUS_STYLE: React.CSSProperties = {
  boxShadow: '0 0 0 2px var(--vscode-focusBorder, rgba(0, 122, 255, 0.42)) inset',
};

const SEGMENTED_CONTROL_ITEM_DISABLED_STYLE: React.CSSProperties = {
  cursor: 'not-allowed',
  opacity: 0.5,
};

const SEGMENTED_CONTROL_ITEM_ACTIVE_STYLE: React.CSSProperties = {
  color: 'var(--vscode-button-foreground, #ffffff)',
  fontWeight: 600,
};

const SEGMENTED_CONTROL_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
