import type {
  EntityBindingAvailabilityProjectionValue,
  ProjectEntityBindingAttentionAction,
} from '../contracts';

export interface EntityBindingAvailabilityProjection {
  readonly label: string;
  readonly description: string;
  readonly unavailable: boolean;
  readonly availabilityLabel: string;
  readonly action?: ProjectEntityBindingAttentionAction;
}

export function projectEntityBindingAvailability(
  binding: EntityBindingAvailabilityProjectionValue,
): EntityBindingAvailabilityProjection {
  const availabilityLabel = binding.availability === 'available' ? 'available' : 'needs attention';
  const action = binding.attention?.action;
  const description = [binding.owner, availabilityLabel, binding.isDefault ? 'default' : undefined]
    .filter((value): value is string => value !== undefined)
    .join(' · ');
  return {
    label: `${binding.role}: ${representationLabel(binding.representation)}`,
    description,
    unavailable: binding.availability !== 'available',
    availabilityLabel,
    ...(action ? { action } : {}),
  };
}

export function projectEntityBindingAvailabilityText(
  binding: EntityBindingAvailabilityProjectionValue,
): string {
  const projection = projectEntityBindingAvailability(binding);
  return `${projection.label} · ${projection.description}`;
}

function representationLabel(
  representation: EntityBindingAvailabilityProjectionValue['representation'],
): string {
  const fileLabel =
    representation.file.authority === 'workspace'
      ? representation.file.path
      : `${representation.file.packageId}/${representation.file.path}`;
  return representation.selector?.kind === 'entry'
    ? `${fileLabel}#${representation.selector.path}`
    : fileLabel;
}
