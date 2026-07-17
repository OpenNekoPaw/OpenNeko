import type {
  EntityAssetBindingAvailability,
  EntityAssetBindingRole,
  EntityAssetBindingStatus,
} from '@neko/shared';

export interface EntityBindingAvailabilityProjectionInput {
  readonly role: EntityAssetBindingRole;
  readonly assetRef: string;
  readonly status: EntityAssetBindingStatus;
  readonly availability: EntityAssetBindingAvailability;
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
    label: `${binding.role}: ${binding.assetRef}`,
    description,
    unavailable: binding.availability !== 'active',
    statusLabel,
    availabilityLabel,
  };
}

export function projectEntityBindingAvailabilityText(
  binding: EntityBindingAvailabilityProjectionInput,
): string {
  const projection = projectEntityBindingAvailability(binding);
  return `${projection.label} · ${projection.description}`;
}

function bindingStatusLabel(status: EntityAssetBindingStatus): string {
  switch (status) {
    case 'confirmed':
      return 'confirmed';
    case 'suggested':
      return 'suggested';
    case 'rejected':
      return 'rejected';
  }
}

function bindingAvailabilityLabel(availability: EntityAssetBindingAvailability): string {
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
