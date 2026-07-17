import type {
  CanvasConnection,
  CanvasNode,
  ConnectionType,
  ContainerPolicyName,
} from '@neko/shared';
import { getContainerPolicyName, getNodeParentId } from '@neko/shared';

export type CanvasConnectionProjectionMode = 'top-level' | 'local-container';

export type ProjectedConnectionKind = 'direct' | 'aggregate' | 'internal' | 'hidden';

export type ConnectionOrderSyncMode =
  'none' | 'derive-from-container' | 'sync-sequence-edges' | 'sync-branch-priority';

export type ConnectionProjectionDiagnosticSeverity = 'info' | 'warning' | 'error';

export type ConnectionProjectionDiagnosticCode =
  | 'dangling-endpoint'
  | 'hidden-endpoint'
  | 'aggregate-projection'
  | 'internal-projection'
  | 'unsupported-order-sync'
  | 'policy-disallowed-cycle'
  | 'container-unavailable';

export interface ConnectionProjectionDiagnostic {
  code: ConnectionProjectionDiagnosticCode;
  severity: ConnectionProjectionDiagnosticSeverity;
  message: string;
  connectionId?: string;
  nodeId?: string;
  containerId?: string;
}

export interface CanvasConnectionRenderBounds {
  nodeId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface CanvasConnectionProjectionInput {
  nodes: readonly CanvasNode[];
  connections: readonly CanvasConnection[];
  visibleNodeIds?: readonly string[];
  expandedContainerIds?: readonly string[];
  renderBounds?: readonly CanvasConnectionRenderBounds[];
  mode?: CanvasConnectionProjectionMode;
  localContainerId?: string;
}

export interface DirectConnectionView {
  kind: 'direct';
  id: string;
  connection: CanvasConnection;
  sourceNode: CanvasNode;
  targetNode: CanvasNode;
  underlyingConnectionIds: readonly string[];
}

export interface AggregateConnectionView {
  kind: 'aggregate';
  id: string;
  connection: CanvasConnection;
  sourceNode: CanvasNode;
  targetNode: CanvasNode;
  sourceVisibleNodeId: string;
  targetVisibleNodeId: string;
  underlyingConnectionIds: readonly string[];
  count: number;
  diagnostics: readonly ConnectionProjectionDiagnostic[];
}

export interface InternalConnectionSummary {
  kind: 'internal';
  id: string;
  containerId: string;
  connectionIds: readonly string[];
  count: number;
  diagnostics: readonly ConnectionProjectionDiagnostic[];
}

export interface HiddenConnectionView {
  kind: 'hidden';
  id: string;
  connectionId: string;
  reason: ConnectionProjectionDiagnosticCode;
}

export interface CanvasConnectionProjectionResult {
  directConnections: readonly DirectConnectionView[];
  aggregateConnections: readonly AggregateConnectionView[];
  internalSummaries: readonly InternalConnectionSummary[];
  derivedSequenceConnections: readonly DerivedSequenceConnectionView[];
  hiddenConnections: readonly HiddenConnectionView[];
  hiddenConnectionIds: readonly string[];
  diagnostics: readonly ConnectionProjectionDiagnostic[];
  orderSync: {
    defaultModes: Readonly<Record<string, ConnectionOrderSyncMode>>;
  };
}

export interface DerivedSequenceConnectionView {
  kind: 'derived-sequence';
  id: string;
  containerId: string;
  sourceId: string;
  targetId: string;
  order: number;
}

export interface SequenceEdgeSyncPlan {
  mode: 'sync-sequence-edges';
  orderedNodeIds: readonly string[];
  expectedEdges: readonly { sourceId: string; targetId: string; order: number }[];
  matchedConnectionIds: readonly string[];
  missingEdges: readonly { sourceId: string; targetId: string; order: number }[];
  staleConnectionIds: readonly string[];
}

export interface ConnectionOrderSyncPatch {
  connectionId: string;
  updates: Pick<CanvasConnection, 'priority'>;
}

interface EndpointProjection {
  originalNode: CanvasNode;
  visibleNode: CanvasNode;
  visibleNodeId: string;
  containerId?: string;
  hidden: boolean;
}

interface AggregateAccumulator {
  id: string;
  connectionIds: string[];
  connections: CanvasConnection[];
  sourceNode: CanvasNode;
  targetNode: CanvasNode;
  sourceVisibleNodeId: string;
  targetVisibleNodeId: string;
  diagnostics: ConnectionProjectionDiagnostic[];
}

const DEFAULT_CONNECTION_ORDER_SYNC_MODES = {
  scene: 'derive-from-container',
  group: 'none',
  gallery: 'none',
  artboard: 'none',
  table: 'none',
  narrative: 'sync-branch-priority',
  flow: 'sync-branch-priority',
  sequence: 'sync-sequence-edges',
} as const satisfies Readonly<Record<string, ConnectionOrderSyncMode>>;

const CYCLE_DISALLOWED_CONNECTION_TYPES = new Set<ConnectionType>([
  'derived-from',
  'sequence',
  'transition',
]);

export function getDefaultConnectionOrderSyncMode(
  policyName: ContainerPolicyName | string | undefined,
): ConnectionOrderSyncMode {
  if (!policyName) return 'none';
  const modes: Readonly<Record<string, ConnectionOrderSyncMode>> =
    DEFAULT_CONNECTION_ORDER_SYNC_MODES;
  return modes[policyName] ?? 'none';
}

export function projectCanvasConnectionView(
  input: CanvasConnectionProjectionInput,
): CanvasConnectionProjectionResult {
  const mode = input.mode ?? 'top-level';
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const renderBoundById = new Map(input.renderBounds?.map((bounds) => [bounds.nodeId, bounds]));
  const visibleNodeIds = new Set(input.visibleNodeIds ?? input.nodes.map((node) => node.id));
  const expandedContainerIds = new Set(input.expandedContainerIds ?? []);
  const directConnections: DirectConnectionView[] = [];
  const aggregateByKey = new Map<string, AggregateAccumulator>();
  const internalByContainer = new Map<string, InternalConnectionSummary>();
  const hiddenConnections: HiddenConnectionView[] = [];
  const diagnostics: ConnectionProjectionDiagnostic[] = [];
  const derivedSequenceConnections = deriveSequenceConnectionsFromContainerOrder(input.nodes);

  for (const connection of input.connections) {
    const sourceNode = nodeById.get(connection.sourceId);
    const targetNode = nodeById.get(connection.targetId);

    if (!sourceNode || !targetNode) {
      diagnostics.push(createDanglingEndpointDiagnostic(connection, sourceNode, targetNode));
      hiddenConnections.push({
        kind: 'hidden',
        id: `hidden:${connection.id}`,
        connectionId: connection.id,
        reason: 'dangling-endpoint',
      });
      continue;
    }

    const cycleDiagnostic = getPolicyCycleDiagnostic(connection);
    if (cycleDiagnostic) diagnostics.push(cycleDiagnostic);

    const sourceProjection = projectEndpoint({
      node: sourceNode,
      nodeById,
      visibleNodeIds,
      expandedContainerIds,
      mode,
      localContainerId: input.localContainerId,
    });
    const targetProjection = projectEndpoint({
      node: targetNode,
      nodeById,
      visibleNodeIds,
      expandedContainerIds,
      mode,
      localContainerId: input.localContainerId,
    });

    if (!sourceProjection || !targetProjection) {
      diagnostics.push(createContainerUnavailableDiagnostic(connection, sourceNode, targetNode));
      hiddenConnections.push({
        kind: 'hidden',
        id: `hidden:${connection.id}`,
        connectionId: connection.id,
        reason: 'container-unavailable',
      });
      continue;
    }

    if (!sourceProjection.hidden && !targetProjection.hidden) {
      directConnections.push({
        kind: 'direct',
        id: connection.id,
        connection,
        sourceNode: applyRenderBounds(sourceProjection.visibleNode, renderBoundById),
        targetNode: applyRenderBounds(targetProjection.visibleNode, renderBoundById),
        underlyingConnectionIds: [connection.id],
      });
      continue;
    }

    if (
      sourceProjection.containerId &&
      sourceProjection.containerId === targetProjection.containerId &&
      sourceProjection.hidden &&
      targetProjection.hidden
    ) {
      const summary = getOrCreateInternalSummary(internalByContainer, sourceProjection.containerId);
      summary.connectionIds = [...summary.connectionIds, connection.id];
      summary.count = summary.connectionIds.length;
      summary.diagnostics = [
        ...summary.diagnostics,
        createInternalProjectionDiagnostic(connection, sourceProjection.containerId),
      ];
      diagnostics.push(
        createInternalProjectionDiagnostic(connection, sourceProjection.containerId),
      );
      hiddenConnections.push({
        kind: 'hidden',
        id: `hidden:${connection.id}`,
        connectionId: connection.id,
        reason: 'internal-projection',
      });
      continue;
    }

    const sourceVisibleNode = applyRenderBounds(sourceProjection.visibleNode, renderBoundById);
    const targetVisibleNode = applyRenderBounds(targetProjection.visibleNode, renderBoundById);

    if (sourceVisibleNode.id === targetVisibleNode.id) {
      diagnostics.push(createHiddenEndpointDiagnostic(connection, sourceVisibleNode.id));
      hiddenConnections.push({
        kind: 'hidden',
        id: `hidden:${connection.id}`,
        connectionId: connection.id,
        reason: 'hidden-endpoint',
      });
      continue;
    }

    const key = `${sourceVisibleNode.id}->${targetVisibleNode.id}:${connection.type ?? 'default'}`;
    const diagnostic = createAggregateProjectionDiagnostic(
      connection,
      sourceVisibleNode.id,
      targetVisibleNode.id,
    );
    const existing = aggregateByKey.get(key);
    if (existing) {
      existing.connectionIds.push(connection.id);
      existing.connections.push(connection);
      existing.diagnostics.push(diagnostic);
    } else {
      aggregateByKey.set(key, {
        id: `aggregate:${key}`,
        connectionIds: [connection.id],
        connections: [connection],
        sourceNode: sourceVisibleNode,
        targetNode: targetVisibleNode,
        sourceVisibleNodeId: sourceVisibleNode.id,
        targetVisibleNodeId: targetVisibleNode.id,
        diagnostics: [diagnostic],
      });
    }
    diagnostics.push(diagnostic);
  }

  const aggregateConnections = [...aggregateByKey.values()].map((item): AggregateConnectionView => {
    const representative = item.connections[0]!;
    return {
      kind: 'aggregate',
      id: item.id,
      connection: {
        ...representative,
        id: item.id,
        sourceId: item.sourceVisibleNodeId,
        targetId: item.targetVisibleNodeId,
        label: representative.label,
      },
      sourceNode: item.sourceNode,
      targetNode: item.targetNode,
      sourceVisibleNodeId: item.sourceVisibleNodeId,
      targetVisibleNodeId: item.targetVisibleNodeId,
      underlyingConnectionIds: [...item.connectionIds],
      count: item.connectionIds.length,
      diagnostics: [...item.diagnostics],
    };
  });

  return {
    directConnections,
    aggregateConnections,
    internalSummaries: [...internalByContainer.values()],
    derivedSequenceConnections,
    hiddenConnections,
    hiddenConnectionIds: hiddenConnections.map((connection) => connection.connectionId),
    diagnostics,
    orderSync: { defaultModes: DEFAULT_CONNECTION_ORDER_SYNC_MODES },
  };
}

export function createsDisallowedConnectionCycle(
  nodes: readonly CanvasNode[],
  connections: readonly CanvasConnection[],
  connection: Pick<CanvasConnection, 'sourceId' | 'targetId' | 'type'>,
): boolean {
  if (!isCycleDisallowedConnectionType(connection.type)) return false;
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(connection.sourceId) || !nodeIds.has(connection.targetId)) return true;
  return hasPath(connections, connection.targetId, connection.sourceId, connection.sourceId);
}

export function deriveSequenceConnectionsFromContainerOrder(
  nodes: readonly CanvasNode[],
): DerivedSequenceConnectionView[] {
  const result: DerivedSequenceConnectionView[] = [];

  for (const node of nodes) {
    if (
      getDefaultConnectionOrderSyncMode(getContainerPolicyName(node)) !== 'derive-from-container'
    ) {
      continue;
    }

    const childIds = node.container?.childIds ?? [];
    for (let index = 0; index < childIds.length - 1; index += 1) {
      const sourceId = childIds[index];
      const targetId = childIds[index + 1];
      if (!sourceId || !targetId) continue;
      result.push({
        kind: 'derived-sequence',
        id: `derived-sequence-${node.id}-${sourceId}-${targetId}`,
        containerId: node.id,
        sourceId,
        targetId,
        order: index,
      });
    }
  }

  return result;
}

export function createSequenceEdgeSyncPlan(
  connections: readonly CanvasConnection[],
  orderedNodeIds: readonly string[],
): SequenceEdgeSyncPlan {
  const expectedEdges = orderedNodeIds.slice(0, -1).map((sourceId, index) => ({
    sourceId,
    targetId: orderedNodeIds[index + 1]!,
    order: index,
  }));
  const sequenceConnections = connections.filter(
    (connection) => connection.type === 'sequence' || connection.type === 'transition',
  );
  const matchedConnectionIds: string[] = [];
  const missingEdges: Array<{ sourceId: string; targetId: string; order: number }> = [];

  for (const edge of expectedEdges) {
    const match = sequenceConnections.find(
      (connection) =>
        connection.sourceId === edge.sourceId && connection.targetId === edge.targetId,
    );
    if (match) {
      matchedConnectionIds.push(match.id);
    } else {
      missingEdges.push(edge);
    }
  }

  const expectedKeys = new Set(
    expectedEdges.map((edge) => `${edge.sourceId}\u0000${edge.targetId}`),
  );
  const orderedNodeIdSet = new Set(orderedNodeIds);
  const staleConnectionIds = sequenceConnections
    .filter(
      (connection) =>
        orderedNodeIdSet.has(connection.sourceId) &&
        orderedNodeIdSet.has(connection.targetId) &&
        !expectedKeys.has(`${connection.sourceId}\u0000${connection.targetId}`),
    )
    .map((connection) => connection.id);

  return {
    mode: 'sync-sequence-edges',
    orderedNodeIds,
    expectedEdges,
    matchedConnectionIds,
    missingEdges,
    staleConnectionIds,
  };
}

export function createBranchPrioritySyncPatches(
  connections: readonly CanvasConnection[],
  sourceNodeId: string,
  orderedTargetIds: readonly string[],
): ConnectionOrderSyncPatch[] {
  return orderedTargetIds.flatMap((targetId, priority) => {
    const connection = connections.find(
      (item) =>
        item.sourceId === sourceNodeId &&
        item.targetId === targetId &&
        (item.type === 'choice' || item.type === 'default'),
    );
    return connection ? [{ connectionId: connection.id, updates: { priority } }] : [];
  });
}

function projectEndpoint(input: {
  node: CanvasNode;
  nodeById: ReadonlyMap<string, CanvasNode>;
  visibleNodeIds: ReadonlySet<string>;
  expandedContainerIds: ReadonlySet<string>;
  mode: CanvasConnectionProjectionMode;
  localContainerId?: string;
}): EndpointProjection | undefined {
  const parentId = getNodeParentId(input.node);
  if (!parentId) {
    return {
      originalNode: input.node,
      visibleNode: input.node,
      visibleNodeId: input.node.id,
      hidden: !input.visibleNodeIds.has(input.node.id),
    };
  }

  if (input.mode === 'local-container' && input.localContainerId === parentId) {
    return {
      originalNode: input.node,
      visibleNode: input.node,
      visibleNodeId: input.node.id,
      containerId: parentId,
      hidden: false,
    };
  }

  if (input.expandedContainerIds.has(parentId) && input.visibleNodeIds.has(input.node.id)) {
    return {
      originalNode: input.node,
      visibleNode: input.node,
      visibleNodeId: input.node.id,
      containerId: parentId,
      hidden: false,
    };
  }

  const visibleContainer = findNearestVisibleContainer({
    nodeId: parentId,
    nodeById: input.nodeById,
    visibleNodeIds: input.visibleNodeIds,
  });
  if (!visibleContainer) return undefined;

  return {
    originalNode: input.node,
    visibleNode: visibleContainer,
    visibleNodeId: visibleContainer.id,
    containerId: visibleContainer.id,
    hidden: true,
  };
}

function findNearestVisibleContainer(input: {
  nodeId: string;
  nodeById: ReadonlyMap<string, CanvasNode>;
  visibleNodeIds: ReadonlySet<string>;
}): CanvasNode | undefined {
  const visited = new Set<string>();
  let currentId: string | undefined = input.nodeId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = input.nodeById.get(currentId);
    if (!node) return undefined;
    if (input.visibleNodeIds.has(node.id)) return node;
    currentId = getNodeParentId(node);
  }

  return undefined;
}

function applyRenderBounds(
  node: CanvasNode,
  renderBoundById: ReadonlyMap<string, CanvasConnectionRenderBounds>,
): CanvasNode {
  const bounds = renderBoundById.get(node.id);
  if (!bounds) return node;
  return {
    ...node,
    position: bounds.position,
    size: bounds.size,
  };
}

function getOrCreateInternalSummary(
  summaries: Map<string, InternalConnectionSummary>,
  containerId: string,
): InternalConnectionSummary {
  const existing = summaries.get(containerId);
  if (existing) return existing;
  const summary: InternalConnectionSummary = {
    kind: 'internal',
    id: `internal:${containerId}`,
    containerId,
    connectionIds: [],
    count: 0,
    diagnostics: [],
  };
  summaries.set(containerId, summary);
  return summary;
}

function createDanglingEndpointDiagnostic(
  connection: CanvasConnection,
  sourceNode: CanvasNode | undefined,
  _targetNode: CanvasNode | undefined,
): ConnectionProjectionDiagnostic {
  const missing = !sourceNode ? connection.sourceId : connection.targetId;
  return {
    code: 'dangling-endpoint',
    severity: 'error',
    connectionId: connection.id,
    nodeId: missing,
    message: `Connection ${connection.id} references missing node ${missing}.`,
  };
}

function createContainerUnavailableDiagnostic(
  connection: CanvasConnection,
  sourceNode: CanvasNode,
  targetNode: CanvasNode,
): ConnectionProjectionDiagnostic {
  return {
    code: 'container-unavailable',
    severity: 'warning',
    connectionId: connection.id,
    message: `Connection ${connection.id} cannot resolve a visible container for ${sourceNode.id} or ${targetNode.id}.`,
  };
}

function createAggregateProjectionDiagnostic(
  connection: CanvasConnection,
  sourceNodeId: string,
  targetNodeId: string,
): ConnectionProjectionDiagnostic {
  return {
    code: 'aggregate-projection',
    severity: 'info',
    connectionId: connection.id,
    message: `Connection ${connection.id} is projected through ${sourceNodeId} -> ${targetNodeId}.`,
  };
}

function createInternalProjectionDiagnostic(
  connection: CanvasConnection,
  containerId: string,
): ConnectionProjectionDiagnostic {
  return {
    code: 'internal-projection',
    severity: 'info',
    connectionId: connection.id,
    containerId,
    message: `Connection ${connection.id} is internal to container ${containerId}.`,
  };
}

function createHiddenEndpointDiagnostic(
  connection: CanvasConnection,
  nodeId: string,
): ConnectionProjectionDiagnostic {
  return {
    code: 'hidden-endpoint',
    severity: 'warning',
    connectionId: connection.id,
    nodeId,
    message: `Connection ${connection.id} collapsed to hidden endpoint ${nodeId}.`,
  };
}

function getPolicyCycleDiagnostic(
  connection: CanvasConnection,
): ConnectionProjectionDiagnostic | undefined {
  if (
    connection.sourceId !== connection.targetId ||
    !isCycleDisallowedConnectionType(connection.type)
  ) {
    return undefined;
  }
  return {
    code: 'policy-disallowed-cycle',
    severity: 'error',
    connectionId: connection.id,
    message: `Connection ${connection.id} creates a disallowed ${connection.type} cycle.`,
  };
}

function isCycleDisallowedConnectionType(type: CanvasConnection['type']): boolean {
  return type !== undefined && CYCLE_DISALLOWED_CONNECTION_TYPES.has(type);
}

function hasPath(
  connections: readonly Pick<CanvasConnection, 'sourceId' | 'targetId' | 'type'>[],
  startId: string,
  targetId: string,
  ignoredSourceId: string,
): boolean {
  const visited = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const connection of connections) {
      if (connection.sourceId === ignoredSourceId && connection.targetId === startId) continue;
      if (!isCycleDisallowedConnectionType(connection.type)) continue;
      if (connection.sourceId === current) {
        stack.push(connection.targetId);
      }
    }
  }

  return false;
}
