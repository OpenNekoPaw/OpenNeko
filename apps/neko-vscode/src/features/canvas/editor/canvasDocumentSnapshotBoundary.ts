import type { CanvasData } from '@neko/shared';

export interface CanvasDocumentSnapshotBoundaryInput {
  readonly authoritative: CanvasData;
  readonly candidate: CanvasData;
  readonly confirmedRemovedNodeIds: Iterable<string>;
}

export interface CanvasContentNodeDelta {
  readonly removedNodeIds: Iterable<string>;
  readonly restoredNodeIds: Iterable<string>;
}

export function applyCanvasContentNodeDelta(
  confirmedRemovedNodeIds: Iterable<string>,
  delta: CanvasContentNodeDelta,
): ReadonlySet<string> {
  const next = new Set(confirmedRemovedNodeIds);
  for (const nodeId of delta.restoredNodeIds) next.delete(nodeId);
  for (const nodeId of delta.removedNodeIds) next.add(nodeId);
  return next;
}

export function assertCanvasDocumentSnapshotBoundary(
  input: CanvasDocumentSnapshotBoundaryInput,
): void {
  const candidateNodeIds = new Set(input.candidate.nodes.map((node) => node.id));
  const confirmedRemovedNodeIds = new Set(input.confirmedRemovedNodeIds);
  const unconfirmedRemovedNodeIds = input.authoritative.nodes
    .map((node) => node.id)
    .filter((nodeId) => !candidateNodeIds.has(nodeId) && !confirmedRemovedNodeIds.has(nodeId));

  if (unconfirmedRemovedNodeIds.length === 0) return;

  throw new Error(
    `unconfirmed-node-removal: Canvas save snapshot removed ${unconfirmedRemovedNodeIds.join(
      ', ',
    )} without matching Webview mutation evidence.`,
  );
}
