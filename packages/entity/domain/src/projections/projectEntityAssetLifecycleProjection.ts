import {
  assertProjectEntityAssetLifecycleEvent,
  type ProjectEntityAssetLifecycleEvent,
  type ProjectEntityAssetProvenanceAvailabilityProjection,
  type ProjectEntityRecord,
} from '../contracts/index';

export function projectEntityAssetLifecycleAvailability(
  entity: ProjectEntityRecord,
  eventValue: unknown,
): ProjectEntityAssetProvenanceAvailabilityProjection | null {
  const event = assertProjectEntityAssetLifecycleEvent(eventValue);
  const provenance = entity.provenance;
  if (!provenance || provenance.origin.assetId !== event.asset.assetId) return null;
  const origin = sameRevision(provenance.origin, event.asset);
  const applied = sameRevision(provenance.applied, event.asset);
  if (!origin && !applied) return null;
  return {
    entityId: entity.entityId,
    asset: event.asset,
    relation: origin && applied ? 'origin-and-applied' : origin ? 'origin' : 'applied',
    availability:
      event.state === 'installed'
        ? 'available'
        : event.state === 'uninstalled'
          ? 'unavailable'
          : 'remote-tombstone',
    observedAt: event.observedAt,
  };
}

function sameRevision(
  left: ProjectEntityAssetLifecycleEvent['asset'],
  right: ProjectEntityAssetLifecycleEvent['asset'],
): boolean {
  return (
    left.assetId === right.assetId &&
    left.revision === right.revision &&
    left.digest === right.digest
  );
}
