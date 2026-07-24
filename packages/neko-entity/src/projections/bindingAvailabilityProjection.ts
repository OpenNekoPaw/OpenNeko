import type {
  EntityRepresentationBindingAvailability,
  EntityRepresentationTarget,
  EntityRepresentationRole,
  EntityRepresentationBindingStatus,
} from '@neko/shared';

export interface EntityBindingAvailabilityProjectionInput {
  readonly role: EntityRepresentationRole;
  readonly representation: EntityRepresentationTarget;
  readonly status: EntityRepresentationBindingStatus;
  readonly availability: EntityRepresentationBindingAvailability;
  readonly orphanedAt?: string;
  readonly isDefault?: boolean;
}

export interface EntityBindingAvailabilityProjection {
  readonly label: string;
  readonly description: string;
  readonly unavailable: boolean;
  readonly statusLabel: string;
  readonly availabilityLabel: string;
}

export function projectEntityBindingAvailability(
  binding: EntityBindingAvailabilityProjectionInput,
): EntityBindingAvailabilityProjection {
  const availabilityLabel = bindingAvailabilityLabel(binding.availability);
  const statusLabel = bindingStatusLabel(binding.status);
  const defaultLabel = binding.isDefault ? 'default' : undefined;
  const orphanedAtLabel =
    binding.availability === 'orphaned' && binding.orphanedAt
      ? `orphaned at ${binding.orphanedAt}`
      : undefined;
  const description = compactStrings([
    statusLabel,
    availabilityLabel,
    defaultLabel,
    orphanedAtLabel,
  ]).join(' · ');
  return {
    label: `${binding.role}: ${representationLabel(binding.representation)}`,
    description,
    unavailable: binding.availability !== 'active',
    statusLabel,
    availabilityLabel,
  };
}

function representationLabel(representation: EntityRepresentationTarget): string {
  switch (representation.kind) {
    case 'workspace-file':
      return representation.path;
    case 'document-entry':
      return `${representation.source.path}#${representation.entryPath}`;
    case 'generated-output':
      return representation.path;
    case 'package-resource':
      return `${representation.packageId}/${representation.resourcePath}`;
  }
}

export function projectEntityBindingAvailabilityText(
  binding: EntityBindingAvailabilityProjectionInput,
): string {
  const projection = projectEntityBindingAvailability(binding);
  return `${projection.label} · ${projection.description}`;
}

function bindingStatusLabel(status: EntityRepresentationBindingStatus): string {
  switch (status) {
    case 'confirmed':
      return 'confirmed';
    case 'suggested':
      return 'suggested';
    case 'rejected':
      return 'rejected';
  }
}

function bindingAvailabilityLabel(availability: EntityRepresentationBindingAvailability): string {
  switch (availability) {
    case 'active':
      return 'available';
    case 'orphaned':
      return 'unavailable';
    case 'archived':
      return 'archived';
  }
}

function compactStrings(values: readonly (string | undefined)[]): string[] {
  return values.filter((value): value is string => value !== undefined && value.length > 0);
}
