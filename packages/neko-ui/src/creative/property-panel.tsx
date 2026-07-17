import type React from 'react';
import type { ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { TooltipProvider } from '../primitives';
import { cn } from '../utils';
import { KeyframeButton } from './keyframe-button';
import type {
  PropertyGroupDefinition,
  PropertyPanelProps,
  PropertyPanelRowProps,
} from './property-panel-types';
import { assertNever } from './property-types';
import type { PropertyDefinition } from './property-types';
import { Checkbox } from '../primitives/checkbox';
import {
  PanelSection,
  PropertyRow,
  ColorPropertyRow,
  NumberPropertyRow,
  SelectPropertyRow,
  SliderPropertyRow,
} from './property-composition';

type InlinePropertyControlDefinition = Extract<PropertyDefinition, { kind: 'text' | 'boolean' }>;

export function PropertyPanel({
  emptyState,
  groups,
  onCommit,
  onPreviewChange,
  onReset,
  onToggleKeyframe,
  properties,
  renderRow,
  resetLabel,
}: PropertyPanelProps): React.ReactElement {
  if (properties.length === 0) {
    return (
      <div className="rounded-[var(--neko-radius-sm,6px)] border border-dashed border-[var(--neko-border)] p-3 text-xs text-[var(--vscode-descriptionForeground)]">
        {emptyState ?? 'No editable properties'}
      </div>
    );
  }

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const rowProps = { onCommit, onPreviewChange, onReset, onToggleKeyframe, resetLabel };

  if (groups && groups.length > 0) {
    return (
      <TooltipProvider>
        <div className="grid gap-3">
          {groups.map((group) => (
            <PropertyGroup key={group.id} group={group}>
              {group.propertyIds
                .map((propertyId) => propertyById.get(propertyId))
                .filter((property): property is PropertyDefinition => property !== undefined)
                .map((property) =>
                  renderPropertyRow({
                    property,
                    renderRow,
                    rowProps,
                  }),
                )}
            </PropertyGroup>
          ))}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid gap-1.5">
        {properties.map((property) =>
          renderPropertyRow({
            property,
            renderRow,
            rowProps,
          }),
        )}
      </div>
    </TooltipProvider>
  );
}

export interface PropertyGroupProps {
  readonly group: PropertyGroupDefinition;
  readonly children: ReactNode;
}

export function PropertyGroup({ children, group }: PropertyGroupProps): React.ReactElement {
  return <PanelSection title={group.label}>{group.collapsed ? null : children}</PanelSection>;
}

export function SchemaPropertyRow({
  onCommit,
  onPreviewChange,
  onReset,
  onToggleKeyframe,
  property,
  resetLabel,
}: PropertyPanelRowProps): React.ReactElement {
  const rowActions = property.animatable ? (
    <KeyframeButton
      animatable={property.animatable}
      disabled={property.disabled}
      hasKeyframes={property.hasKeyframes}
      isAtKeyframe={property.isAtKeyframe}
      onToggleKeyframe={onToggleKeyframe}
      propertyId={property.id}
    />
  ) : null;

  switch (property.kind) {
    case 'number':
      return (
        <NumberPropertyRow
          disabled={property.disabled}
          id={property.id}
          keyframe={rowActions}
          label={property.label}
          max={property.max}
          min={property.min}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          onReset={onReset ? () => onReset(property.id) : undefined}
          resetLabel={resetLabel}
          step={property.step}
          unit={property.unit}
          value={property.value}
        />
      );
    case 'slider':
      return (
        <SliderPropertyRow
          disabled={property.disabled}
          id={property.id}
          keyframe={rowActions}
          label={property.label}
          max={property.max}
          min={property.min}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          onReset={onReset ? () => onReset(property.id) : undefined}
          resetLabel={resetLabel}
          step={property.step}
          unit={property.unit}
          value={property.value}
        />
      );
    case 'text':
      return (
        <PropertyRow
          disabled={property.disabled}
          keyframe={rowActions}
          label={property.label}
          onReset={onReset ? () => onReset(property.id) : undefined}
          propertyId={property.id}
          resetLabel={resetLabel}
        >
          {renderPropertyControl(property, onPreviewChange, onCommit)}
        </PropertyRow>
      );
    case 'color':
      return (
        <ColorPropertyRow
          alpha={property.alpha}
          disabled={property.disabled}
          id={property.id}
          keyframe={rowActions}
          label={property.label}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          onReset={onReset ? () => onReset(property.id) : undefined}
          resetLabel={resetLabel}
          value={property.value}
        />
      );
    case 'boolean':
      return (
        <PropertyRow
          disabled={property.disabled}
          keyframe={rowActions}
          label={property.label}
          onReset={onReset ? () => onReset(property.id) : undefined}
          propertyId={property.id}
          resetLabel={resetLabel}
        >
          {renderPropertyControl(property, onPreviewChange, onCommit)}
        </PropertyRow>
      );
    case 'select':
      return (
        <SelectPropertyRow
          disabled={property.disabled}
          id={property.id}
          keyframe={rowActions}
          label={property.label}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          onReset={onReset ? () => onReset(property.id) : undefined}
          options={property.options}
          resetLabel={resetLabel}
          value={property.value}
        />
      );
    default:
      return assertNever(property);
  }
}

function renderPropertyRow({
  property,
  renderRow,
  rowProps,
}: {
  readonly property: PropertyDefinition;
  readonly renderRow?: PropertyPanelProps['renderRow'];
  readonly rowProps: Omit<PropertyPanelRowProps, 'property'>;
}): ReactNode {
  const props = { ...rowProps, property };
  return (
    <div key={property.id}>{renderRow ? renderRow(props) : <SchemaPropertyRow {...props} />}</div>
  );
}

function renderPropertyControl(
  property: InlinePropertyControlDefinition,
  onPreviewChange: PropertyPanelRowProps['onPreviewChange'],
  onCommit: PropertyPanelRowProps['onCommit'],
): ReactNode {
  switch (property.kind) {
    case 'text':
      return (
        <input
          aria-label={property.label}
          className={cn(
            'h-7 w-full rounded-[var(--neko-radius-sm,6px)] border border-[var(--neko-border)]',
            'bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)]',
            'outline-none focus-visible:border-[var(--vscode-focusBorder)] disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={property.disabled}
          {...getKeyboardBoundaryMetadata({
            scope: 'text-input',
            ownerId: `property-text:${property.id}`,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          })}
          onBlur={(event) => onCommit?.(property.id, event.currentTarget.value)}
          onChange={(event) => onPreviewChange?.(property.id, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCommit?.(property.id, event.currentTarget.value);
            }
          }}
          type="text"
          value={property.value}
        />
      );
    case 'boolean':
      return (
        <Checkbox
          aria-label={property.label}
          checked={property.value}
          disabled={property.disabled}
          label={property.value ? 'On' : 'Off'}
          onCheckedChange={(checked) => {
            onPreviewChange?.(property.id, checked);
            onCommit?.(property.id, checked);
          }}
        />
      );
    default:
      return assertNever(property);
  }
}
