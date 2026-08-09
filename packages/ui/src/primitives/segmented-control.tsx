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
  readonly appearance?: 'accent' | 'neutral';
  readonly label: string;
  readonly options: readonly SegmentedControlOption[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly className?: string;
  readonly id?: string;
  readonly controls?: string;
  readonly density?: 'compact' | 'comfortable';
  readonly maxWidth?: number | string;
}

export function SegmentedControl({
  appearance = 'accent',
  className,
  controls,
  density = 'compact',
  id,
  label,
  maxWidth = 176,
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
      data-appearance={appearance}
      role="tablist"
      aria-label={label}
      style={{
        ...SEGMENTED_CONTROL_STYLE,
        ...(appearance === 'neutral' ? SEGMENTED_CONTROL_NEUTRAL_STYLE : null),
        maxWidth,
      }}
    >
      <span
        className="neko-segmented-control-thumb"
        aria-hidden="true"
        style={{
          ...SEGMENTED_CONTROL_THUMB_STYLE,
          ...(appearance === 'neutral' ? SEGMENTED_CONTROL_NEUTRAL_THUMB_STYLE : null),
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
            aria-description={option.description}
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
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              const enabledOptions = options.filter((candidate) => !candidate.disabled);
              const currentIndex = enabledOptions.findIndex(
                (candidate) => candidate.value === option.value,
              );
              if (currentIndex < 0 || enabledOptions.length === 0) return;
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? enabledOptions.length - 1
                    : (currentIndex +
                        (event.key === 'ArrowRight' ? 1 : -1) +
                        enabledOptions.length) %
                      enabledOptions.length;
              const nextOption = enabledOptions[nextIndex];
              if (!nextOption) return;
              event.preventDefault();
              onValueChange(nextOption.value);
              const nextElement = Array.from(
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[data-segmented-value]',
                ) ?? [],
              ).find((element) => element.dataset.segmentedValue === nextOption.value);
              nextElement?.focus();
            }}
            data-segmented-value={option.value}
            style={{
              ...SEGMENTED_CONTROL_ITEM_STYLE,
              ...(density === 'comfortable' ? SEGMENTED_CONTROL_ITEM_COMFORTABLE_STYLE : null),
              ...(hoveredValue === option.value && !selected
                ? SEGMENTED_CONTROL_ITEM_HOVER_STYLE
                : null),
              ...(focusedValue === option.value ? SEGMENTED_CONTROL_ITEM_FOCUS_STYLE : null),
              ...(option.disabled ? SEGMENTED_CONTROL_ITEM_DISABLED_STYLE : null),
              ...(selected ? SEGMENTED_CONTROL_ITEM_ACTIVE_STYLE : null),
              ...(selected && appearance === 'neutral'
                ? SEGMENTED_CONTROL_NEUTRAL_ITEM_ACTIVE_STYLE
                : null),
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
  border: '1px solid var(--neko-widget-border, var(--neko-input-border, #d0d7de))',
  borderRadius: 999,
  background: 'var(--neko-input-background, var(--neko-editor-background, #ffffff))',
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
  background: 'var(--neko-button-background, #0e639c)',
  boxShadow:
    '0 1px 1px rgba(255, 255, 255, 0.32) inset, 0 1px 3px rgba(0, 0, 0, 0.24), 0 0 0 1px var(--neko-focusBorder, rgba(0, 122, 255, 0.26))',
  pointerEvents: 'none',
  transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  zIndex: 0,
};

const SEGMENTED_CONTROL_NEUTRAL_STYLE: React.CSSProperties = {
  border: '1px solid var(--neko-widget-border, rgba(0, 0, 0, 0.1))',
  background: 'color-mix(in srgb, var(--neko-foreground, #242424) 7%, transparent)',
  boxShadow: 'none',
};

const SEGMENTED_CONTROL_NEUTRAL_THUMB_STYLE: React.CSSProperties = {
  border: '1px solid var(--neko-widget-border, rgba(0, 0, 0, 0.1))',
  background: 'var(--neko-editor-background, #ffffff)',
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
};

const SEGMENTED_CONTROL_ITEM_STYLE: React.CSSProperties = {
  position: 'relative',
  flex: '1 1 0',
  minWidth: 0,
  height: 24,
  border: '1px solid transparent',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--neko-foreground, inherit)',
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
  background: 'color-mix(in srgb, var(--neko-foreground, #000000) 6%, transparent)',
};

const SEGMENTED_CONTROL_ITEM_COMFORTABLE_STYLE: React.CSSProperties = {
  height: 30,
  fontSize: 13,
  lineHeight: '28px',
};

const SEGMENTED_CONTROL_ITEM_FOCUS_STYLE: React.CSSProperties = {
  boxShadow: '0 0 0 2px var(--neko-focusBorder, rgba(0, 122, 255, 0.42)) inset',
};

const SEGMENTED_CONTROL_ITEM_DISABLED_STYLE: React.CSSProperties = {
  cursor: 'not-allowed',
  opacity: 0.5,
};

const SEGMENTED_CONTROL_ITEM_ACTIVE_STYLE: React.CSSProperties = {
  color: 'var(--neko-button-foreground, #ffffff)',
  fontWeight: 600,
};

const SEGMENTED_CONTROL_NEUTRAL_ITEM_ACTIVE_STYLE: React.CSSProperties = {
  color: 'var(--neko-foreground, #242424)',
};

const SEGMENTED_CONTROL_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
