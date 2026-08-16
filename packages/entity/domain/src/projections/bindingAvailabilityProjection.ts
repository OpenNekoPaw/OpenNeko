import type {
  EntityBindingAvailabilityProjectionValue,
  ProjectEntityBindingAttentionAction,
} from '../contracts';
import { serializeContentReferenceTarget } from '@neko/content';

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
  switch (representation.kind) {
    case 'workspace-file':
      return representation.path;
    case 'document-entry':
      return `${serializeContentReferenceTarget(representation.source)}#${representation.entryPath}`;
    case 'generated-output':
      return representation.path;
    case 'package-resource':
      return `${representation.packageId}/${representation.resourcePath}`;
  }
}
