import type { CanvasConnection, CanvasNode, PortDefinition } from '@neko-canvas/domain';
import { arePortTypesCompatible, getDefaultPorts } from '@neko-canvas/domain';
import { createsDisallowedConnectionCycle } from './connectionProjection';

export type CanvasConnectionRejectionReason =
  | 'missing-canvas'
  | 'missing-connection'
  | 'missing-source'
  | 'missing-target'
  | 'self-connection'
  | 'missing-source-endpoint'
  | 'missing-target-endpoint'
  | 'source-direction'
  | 'target-direction'
  | 'incompatible-port-types'
  | 'target-capacity'
  | 'duplicate'
  | 'cycle';

export type CanvasConnectionValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: CanvasConnectionRejectionReason };

export type CanvasConnectionMutationResult =
  | { readonly ok: true; readonly connectionId: string }
  | { readonly ok: false; readonly reason: CanvasConnectionRejectionReason };

export function validateCanvasConnectionDraft(
  nodes: readonly CanvasNode[],
  existingConnections: readonly CanvasConnection[],
  connection: Omit<CanvasConnection, 'id'> | CanvasConnection,
  options: { readonly ignoreConnectionId?: string } = {},
): CanvasConnectionValidationResult {
  const sourceNode = nodes.find((node) => node.id === connection.sourceId);
  if (!sourceNode) return { ok: false, reason: 'missing-source' };
  const targetNode = nodes.find((node) => node.id === connection.targetId);
  if (!targetNode) return { ok: false, reason: 'missing-target' };
  if (connection.sourceId === connection.targetId) {
    return { ok: false, reason: 'self-connection' };
  }
  if (connection.sourceEndpoint.nodeId !== sourceNode.id) {
    return { ok: false, reason: 'missing-source-endpoint' };
  }
  if (connection.targetEndpoint.nodeId !== targetNode.id) {
    return { ok: false, reason: 'missing-target-endpoint' };
  }

  const sourcePort = resolveEndpointPort(sourceNode, connection.sourceEndpoint);
  if (connection.sourceEndpoint.scope === 'port' && !sourcePort) {
    return { ok: false, reason: 'missing-source-endpoint' };
  }
  const targetPort = resolveEndpointPort(targetNode, connection.targetEndpoint);
  if (connection.targetEndpoint.scope === 'port' && !targetPort) {
    return { ok: false, reason: 'missing-target-endpoint' };
  }
  if (sourcePort?.type === 'input') return { ok: false, reason: 'source-direction' };
  if (targetPort?.type === 'output') return { ok: false, reason: 'target-direction' };
  if (
    sourcePort &&
    targetPort &&
    !arePortTypesCompatible(sourcePort.dataType, targetPort.dataType)
  ) {
    return { ok: false, reason: 'incompatible-port-types' };
  }

  const comparableConnections = existingConnections.filter(
    (item) => item.id !== options.ignoreConnectionId,
  );
  if (isDuplicateConnection(comparableConnections, connection)) {
    return { ok: false, reason: 'duplicate' };
  }
  if (
    targetPort &&
    connection.type !== 'sequence' &&
    countConnectionsToPort(comparableConnections, targetNode.id, targetPort.id) >=
      (targetPort.maxConnections ?? 1)
  ) {
    return { ok: false, reason: 'target-capacity' };
  }
  if (createsDisallowedConnectionCycle(nodes, comparableConnections, connection)) {
    return { ok: false, reason: 'cycle' };
  }
  return { ok: true };
}

function resolveEndpointPort(
  node: CanvasNode,
  endpoint: CanvasConnection['sourceEndpoint'],
): PortDefinition | undefined {
  if (endpoint.nodeId !== node.id || endpoint.scope !== 'port') return undefined;
  return (node.ports ?? getDefaultPorts(node.type)).find((port) => port.id === endpoint.portId);
}

function isDuplicateConnection(
  existingConnections: readonly CanvasConnection[],
  connection: Omit<CanvasConnection, 'id'> | CanvasConnection,
): boolean {
  return existingConnections.some((item) => {
    if (
      item.sourceId !== connection.sourceId ||
      item.targetId !== connection.targetId ||
      item.type !== connection.type
    ) {
      return false;
    }
    if (connection.type === 'sequence') return true;
    return (
      areEndpointsEqual(item.sourceEndpoint, connection.sourceEndpoint) &&
      areEndpointsEqual(item.targetEndpoint, connection.targetEndpoint)
    );
  });
}

function areEndpointsEqual(
  left: CanvasConnection['sourceEndpoint'],
  right: CanvasConnection['sourceEndpoint'],
): boolean {
  return (
    left.nodeId === right.nodeId &&
    left.scope === right.scope &&
    (left.scope !== 'port' || right.scope !== 'port' || left.portId === right.portId)
  );
}

function countConnectionsToPort(
  connections: readonly CanvasConnection[],
  nodeId: string,
  portId: string,
): number {
  return connections.filter(
    (item) =>
      item.targetId === nodeId &&
      item.targetEndpoint.scope === 'port' &&
      item.targetEndpoint.portId === portId,
  ).length;
}
