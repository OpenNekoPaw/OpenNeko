import type React from 'react';
import type { ReactNode } from 'react';
import { Button, Select } from '../primitives';
import type { SelectOption } from '../primitives';
import { cn } from '../utils';
import { ColorPicker } from './color-picker';
import type { ColorPickerProps } from './color-picker';
import { NumberInput } from './number-input';
import type { NumberInputProps } from './number-input';
import { NumberSlider } from './number-slider';
import type { NumberSliderProps } from './number-slider';

export type PropertyRowDensity = 'compact' | 'default';

export interface PanelSectionProps {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly density?: PropertyRowDensity;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export interface PropertyRowProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly density?: PropertyRowDensity;
  readonly propertyId?: string;
  readonly className?: string;
  readonly controlClassName?: string;
  readonly actions?: ReactNode;
  readonly resetLabel?: ReactNode;
  readonly onReset?: () => void;
  readonly keyframe?: ReactNode;
  readonly children: ReactNode;
}

export interface AxisGroupProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly density?: PropertyRowDensity;
  readonly className?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

export interface AxisGroupAxisProps extends Omit<
  NumberInputProps,
  'id' | 'label' | 'onCommit' | 'onPreviewChange'
> {
  readonly axis: string;
  readonly id?: string;
  readonly keyframe?: ReactNode;
  readonly reset?: ReactNode;
  readonly onPreviewChange?: (axis: string, value: number) => void;
  readonly onCommit?: (axis: string, value: number) => void;
}

export interface NumberPropertyRowProps
  extends
    Omit<NumberInputProps, 'label' | 'onCommit' | 'onPreviewChange'>,
    Pick<
      PropertyRowProps,
      'actions' | 'description' | 'density' | 'keyframe' | 'onReset' | 'resetLabel'
    > {
  readonly label: ReactNode;
  readonly onPreviewChange?: (id: string, value: number) => void;
  readonly onCommit?: (id: string, value: number) => void;
}

export interface SliderPropertyRowProps
  extends
    Omit<NumberSliderProps, 'label' | 'onCommit' | 'onPreviewChange'>,
    Pick<
      PropertyRowProps,
      'actions' | 'description' | 'density' | 'keyframe' | 'onReset' | 'resetLabel'
    > {
  readonly label: ReactNode;
  readonly onPreviewChange?: (id: string, value: number) => void;
  readonly onCommit?: (id: string, value: number) => void;
}

export interface ColorPropertyRowProps
  extends
    Omit<ColorPickerProps, 'label' | 'onCommit' | 'onPreviewChange'>,
    Pick<
      PropertyRowProps,
      'actions' | 'description' | 'density' | 'keyframe' | 'onReset' | 'resetLabel'
    > {
  readonly label: ReactNode;
  readonly onPreviewChange?: (id: string, value: string) => void;
  readonly onCommit?: (id: string, value: string) => void;
}

export interface SelectPropertyRowProps extends Pick<
  PropertyRowProps,
  'actions' | 'description' | 'density' | 'keyframe' | 'onReset' | 'resetLabel'
> {
  readonly id: string;
  readonly label: ReactNode;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onPreviewChange?: (id: string, value: string) => void;
  readonly onCommit?: (id: string, value: string) => void;
}

export function PanelSection({
  children,
  className,
  description,
  density = 'default',
  disabled,
  title,
}: PanelSectionProps): React.ReactElement {
  return (
    <section
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn(
        'grid border-t border-[var(--neko-border)] first:border-t-0 first:pt-0',
        density === 'compact' ? 'gap-1 pt-1.5' : 'gap-1.5 pt-2',
        disabled ? 'opacity-60' : null,
        className,
      )}
    >
      {title !== undefined || description !== undefined ? (
        <header className="grid gap-0.5 px-1">
          {title !== undefined ? (
            <h3 className="m-0 text-[11px] font-semibold uppercase text-[var(--vscode-descriptionForeground)]">
              {title}
            </h3>
          ) : null}
          {description !== undefined ? (
            <p className="m-0 text-[11px] text-[var(--vscode-descriptionForeground)]">
              {description}
            </p>
          ) : null}
        </header>
      ) : null}
      <div className={cn('grid', density === 'compact' ? 'gap-1' : 'gap-1.5')}>{children}</div>
    </section>
  );
}

export function PropertyRow({
  actions,
  children,
  className,
  controlClassName,
  density = 'default',
  description,
  disabled,
  keyframe,
  label,
  onReset,
  propertyId,
  resetLabel,
}: PropertyRowProps): React.ReactElement {
  return (
    <div
      className={cn(
        'grid items-center gap-2 rounded-[var(--neko-radius-sm,6px)] text-xs hover:bg-[var(--neko-hover)]',
        density === 'compact'
          ? 'min-h-7 grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1.5fr)_auto] px-1 py-0.5'
          : 'min-h-8 grid-cols-[minmax(7rem,0.9fr)_minmax(0,1.4fr)_auto] px-1 py-1',
        disabled ? 'opacity-60' : null,
        className,
      )}
      data-property-id={propertyId}
    >
      <span className="grid min-w-0 gap-0.5 text-[var(--vscode-descriptionForeground)]">
        <span className="min-w-0 truncate">{label}</span>
        {description !== undefined ? (
          <span className="min-w-0 text-[11px] leading-tight">{description}</span>
        ) : null}
      </span>
      <div className={cn('min-w-0', controlClassName)}>{children}</div>
      <div className="flex items-center justify-end gap-1">
        {actions}
        {onReset ? (
          <Button disabled={disabled} onClick={onReset} size="xs" variant="ghost">
            {resetLabel ?? 'Reset'}
          </Button>
        ) : null}
        {keyframe}
      </div>
    </div>
  );
}

function AxisGroupRoot({
  actions,
  children,
  className,
  density = 'default',
  description,
  disabled,
  label,
}: AxisGroupProps): React.ReactElement {
  return (
    <PropertyRow
      actions={actions}
      className={className}
      density={density}
      description={description}
      disabled={disabled}
      label={label}
    >
      <div className="grid min-w-0 gap-1 sm:grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))]">
        {children}
      </div>
    </PropertyRow>
  );
}

function AxisGroupAxis({
  axis,
  disabled,
  id,
  keyframe,
  onCommit,
  onPreviewChange,
  reset,
  ...inputProps
}: AxisGroupAxisProps): React.ReactElement {
  const axisId = id ?? axis;
  return (
    <div className="flex min-w-0 items-center gap-1" data-property-id={axisId}>
      <span className="w-3 shrink-0 text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
        {axis}
      </span>
      <NumberInput
        {...inputProps}
        className="min-w-0"
        disabled={disabled}
        id={axisId}
        onCommit={(_, value) => onCommit?.(axis, value)}
        onPreviewChange={(_, value) => onPreviewChange?.(axis, value)}
      />
      {reset}
      {keyframe}
    </div>
  );
}

export const AxisGroup = Object.assign(AxisGroupRoot, { Axis: AxisGroupAxis });

export function NumberPropertyRow({
  actions,
  description,
  density,
  keyframe,
  label,
  onReset,
  resetLabel,
  ...inputProps
}: NumberPropertyRowProps): React.ReactElement {
  return (
    <PropertyRow
      actions={actions}
      density={density}
      description={description}
      disabled={inputProps.disabled}
      keyframe={keyframe}
      label={label}
      onReset={onReset}
      propertyId={inputProps.id}
      resetLabel={resetLabel}
    >
      <NumberInput {...inputProps} />
    </PropertyRow>
  );
}

export function SliderPropertyRow({
  actions,
  description,
  density,
  keyframe,
  label,
  onReset,
  resetLabel,
  ...sliderProps
}: SliderPropertyRowProps): React.ReactElement {
  return (
    <PropertyRow
      actions={actions}
      density={density}
      description={description}
      disabled={sliderProps.disabled}
      keyframe={keyframe}
      label={label}
      onReset={onReset}
      propertyId={sliderProps.id}
      resetLabel={resetLabel}
    >
      <NumberSlider {...sliderProps} />
    </PropertyRow>
  );
}

export function ColorPropertyRow({
  actions,
  description,
  density,
  keyframe,
  label,
  onReset,
  resetLabel,
  ...colorProps
}: ColorPropertyRowProps): React.ReactElement {
  return (
    <PropertyRow
      actions={actions}
      density={density}
      description={description}
      disabled={colorProps.disabled}
      keyframe={keyframe}
      label={label}
      onReset={onReset}
      propertyId={colorProps.id}
      resetLabel={resetLabel}
    >
      <ColorPicker {...colorProps} />
    </PropertyRow>
  );
}

export function SelectPropertyRow({
  actions,
  className,
  description,
  density,
  disabled,
  id,
  keyframe,
  label,
  onCommit,
  onPreviewChange,
  onReset,
  options,
  placeholder,
  resetLabel,
  value,
}: SelectPropertyRowProps): React.ReactElement {
  return (
    <PropertyRow
      actions={actions}
      density={density}
      description={description}
      disabled={disabled}
      keyframe={keyframe}
      label={label}
      onReset={onReset}
      propertyId={id}
      resetLabel={resetLabel}
    >
      <Select
        className={className}
        disabled={disabled}
        label={typeof label === 'string' ? label : id}
        options={options}
        placeholder={placeholder}
        value={value}
        onValueChange={(nextValue) => {
          onPreviewChange?.(id, nextValue);
          onCommit?.(id, nextValue);
        }}
      />
    </PropertyRow>
  );
}
