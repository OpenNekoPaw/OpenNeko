import type { CanvasPlaybackRouteCandidate, CanvasPlaybackUnit } from '@neko/canvas-domain';

export interface StorylineGraphOccurrence {
  readonly routeId: string;
  readonly routeIndex: number;
  readonly unitId: string;
  readonly unitIndex: number;
}

export interface StorylineGraphNode {
  readonly key: string;
  readonly sourceNodeId: string;
  readonly column: number;
  readonly lane: number;
  readonly isolated: boolean;
  readonly routeIds: readonly string[];
  readonly occurrences: readonly StorylineGraphOccurrence[];
}

export interface StorylineGraphEdge {
  readonly id: string;
  readonly routeId: string;
  readonly lane: number;
  readonly sourceKey: string;
  readonly targetKey: string;
}

export interface StorylineGraphLayout {
  readonly nodes: readonly StorylineGraphNode[];
  readonly edges: readonly StorylineGraphEdge[];
  readonly columnCount: number;
  readonly laneCount: number;
}

export type StorylineOrderPosition = 'unsequenced' | 'start' | 'step' | 'end' | 'only';

export interface StorylineSequenceEdge {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}

export interface StorylineSequenceGraph {
  readonly nodeIds: readonly string[];
  readonly edges: readonly StorylineSequenceEdge[];
}

export type StorylineBranchMoveDirection = 'before' | 'after';

export type StorylineGraphNodeRole =
  | 'isolated'
  | 'start'
  | 'start-branch'
  | 'step'
  | 'branch'
  | 'merge'
  | 'branch-merge'
  | 'merge-end'
  | 'end';

interface MutableGraphNode {
  readonly key: string;
  readonly sourceNodeId: string;
  readonly order: number;
  readonly occurrences: StorylineGraphOccurrence[];
  readonly routeIds: Set<string>;
}

export function buildStorylineGraphLayout(
  routes: readonly CanvasPlaybackRouteCandidate[],
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
): StorylineGraphLayout {
  const nodesByKey = new Map<string, MutableGraphNode>();
  const edges: StorylineGraphEdge[] = [];

  routes.forEach((route, routeIndex) => {
    const routeKeys: string[] = [];
    route.unitIds.forEach((unitId, unitIndex) => {
      const unit = unitById.get(unitId);
      if (!unit) return;
      const key = unit.sourceNodeId;
      let node = nodesByKey.get(key);
      if (!node) {
        node = {
          key,
          sourceNodeId: unit.sourceNodeId,
          order: nodesByKey.size,
          occurrences: [],
          routeIds: new Set<string>(),
        };
        nodesByKey.set(key, node);
      }
      node.occurrences.push({ routeId: route.id, routeIndex, unitId, unitIndex });
      node.routeIds.add(route.id);
      routeKeys.push(key);
    });

    for (let index = 1; index < routeKeys.length; index += 1) {
      const sourceKey = routeKeys[index - 1];
      const targetKey = routeKeys[index];
      if (!sourceKey || !targetKey || sourceKey === targetKey) continue;
      edges.push({
        id: `${route.id}:${index - 1}:${sourceKey}:${targetKey}`,
        routeId: route.id,
        lane: routeIndex,
        sourceKey,
        targetKey,
      });
    }
  });

  const columns = assignGraphColumns(nodesByKey, edges);
  const connectedKeys = new Set(edges.flatMap((edge) => [edge.sourceKey, edge.targetKey]));
  const nodes = Array.from(nodesByKey.values())
    .map<StorylineGraphNode>((node) => ({
      key: node.key,
      sourceNodeId: node.sourceNodeId,
      column: columns.get(node.key) ?? 0,
      lane: Math.min(...node.occurrences.map((occurrence) => occurrence.routeIndex)),
      isolated: !connectedKeys.has(node.key),
      routeIds: Array.from(node.routeIds),
      occurrences: node.occurrences,
    }))
    .sort((left, right) => left.column - right.column || left.lane - right.lane);

  return {
    nodes,
    edges,
    columnCount: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.column)) + 1,
    laneCount: routes.length,
  };
}

export function resolveStorylineOrderPosition(
  unitIndex: number,
  routeLength: number,
  unsequenced: boolean,
): StorylineOrderPosition {
  if (unsequenced) return 'unsequenced';
  if (routeLength <= 1) return 'only';
  if (unitIndex === 0) return 'start';
  if (unitIndex === routeLength - 1) return 'end';
  return 'step';
}

export function buildStorylineSequenceGraphLayout(
  orderedNodeIds: readonly string[],
  edges: readonly StorylineSequenceEdge[],
  unitById: ReadonlyMap<string, CanvasPlaybackUnit>,
): StorylineGraphLayout {
  const unitBySourceNodeId = new Map(
    Array.from(unitById.values()).map((unit) => [unit.sourceNodeId, unit]),
  );
  const orderedNodeIdSet = new Set(orderedNodeIds);
  if (orderedNodeIdSet.size !== orderedNodeIds.length) {
    throw new Error('Storyline graph contains duplicate node identities.');
  }
  if (orderedNodeIds.some((nodeId) => !unitBySourceNodeId.has(nodeId))) {
    throw new Error('Storyline graph references a missing playback unit.');
  }
  const edgeKeys = new Set<string>();
  const graphEdges = edges.map<StorylineGraphEdge>((edge, index) => {
    if (
      !orderedNodeIdSet.has(edge.sourceNodeId) ||
      !orderedNodeIdSet.has(edge.targetNodeId) ||
      edge.sourceNodeId === edge.targetNodeId
    ) {
      throw new Error('Storyline graph contains an invalid edge endpoint.');
    }
    const key = storylineSequenceEdgeKey(edge);
    if (edgeKeys.has(key)) throw new Error('Storyline graph contains a duplicate edge.');
    edgeKeys.add(key);
    return {
      id: `draft:${index}:${key}`,
      routeId: 'draft',
      lane: 0,
      sourceKey: edge.sourceNodeId,
      targetKey: edge.targetNodeId,
    };
  });
  const mutableNodes = new Map<string, MutableGraphNode>(
    orderedNodeIds.map((nodeId, order) => [
      nodeId,
      {
        key: nodeId,
        sourceNodeId: nodeId,
        order,
        occurrences: [],
        routeIds: new Set(['draft']),
      },
    ]),
  );
  const columns = assignGraphColumns(mutableNodes, graphEdges);
  const indegree = new Map(orderedNodeIds.map((nodeId) => [nodeId, 0]));
  const targetsBySource = new Map<string, string[]>();
  edges.forEach((edge) => {
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
    targetsBySource.set(edge.sourceNodeId, [
      ...(targetsBySource.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
  });
  const displayOrder: string[] = [];
  const queued = orderedNodeIds.filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0);
  const displayed = new Set<string>();
  while (queued.length > 0) {
    const nodeId = queued.shift();
    if (!nodeId || displayed.has(nodeId)) continue;
    displayed.add(nodeId);
    displayOrder.push(nodeId);
    queued.push(...(targetsBySource.get(nodeId) ?? []));
  }
  orderedNodeIds.forEach((nodeId) => {
    if (!displayed.has(nodeId)) displayOrder.push(nodeId);
  });
  const nodesByColumn = new Map<number, string[]>();
  displayOrder.forEach((nodeId) => {
    const column = columns.get(nodeId) ?? 0;
    nodesByColumn.set(column, [...(nodesByColumn.get(column) ?? []), nodeId]);
  });
  const laneByNodeId = new Map<string, number>();
  nodesByColumn.forEach((nodeIds) =>
    nodeIds.forEach((nodeId, lane) => laneByNodeId.set(nodeId, lane)),
  );
  const connectedNodeIds = new Set(edges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]));
  const nodes = orderedNodeIds
    .map<StorylineGraphNode>((nodeId) => {
      const unit = unitBySourceNodeId.get(nodeId);
      if (!unit) throw new Error('Storyline graph references a missing playback unit.');
      const column = columns.get(nodeId) ?? 0;
      const lane = laneByNodeId.get(nodeId) ?? 0;
      return {
        key: nodeId,
        sourceNodeId: nodeId,
        column,
        lane,
        isolated: !connectedNodeIds.has(nodeId),
        routeIds: ['draft'],
        occurrences: [
          {
            routeId: 'draft',
            routeIndex: lane,
            unitId: unit.id,
            unitIndex: column,
          },
        ],
      };
    })
    .sort((left, right) => left.column - right.column || left.lane - right.lane);
  return {
    nodes,
    edges: graphEdges.map((edge) => ({
      ...edge,
      lane: laneByNodeId.get(edge.sourceKey) ?? 0,
    })),
    columnCount: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.column)) + 1,
    laneCount: Math.max(0, ...Array.from(nodesByColumn.values(), (nodeIds) => nodeIds.length)),
  };
}

export function wouldCreateStorylineSequenceCycle(
  edges: readonly StorylineSequenceEdge[],
  candidate: StorylineSequenceEdge,
): boolean {
  if (candidate.sourceNodeId === candidate.targetNodeId) return true;
  const targetsBySource = new Map<string, string[]>();
  for (const edge of edges) {
    targetsBySource.set(edge.sourceNodeId, [
      ...(targetsBySource.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
  }
  const visiting = [candidate.targetNodeId];
  const visited = new Set<string>();
  while (visiting.length > 0) {
    const nodeId = visiting.pop();
    if (!nodeId || visited.has(nodeId)) continue;
    if (nodeId === candidate.sourceNodeId) return true;
    visited.add(nodeId);
    visiting.push(...(targetsBySource.get(nodeId) ?? []));
  }
  return false;
}

export function resolveStorylineGraphNodeRole(
  nodeId: string,
  edges: readonly StorylineSequenceEdge[],
): StorylineGraphNodeRole {
  const incoming = edges.filter((edge) => edge.targetNodeId === nodeId).length;
  const outgoing = edges.filter((edge) => edge.sourceNodeId === nodeId).length;
  if (incoming === 0 && outgoing === 0) return 'isolated';
  if (incoming === 0 && outgoing > 1) return 'start-branch';
  if (incoming === 0) return 'start';
  if (outgoing === 0 && incoming > 1) return 'merge-end';
  if (outgoing === 0) return 'end';
  if (incoming > 1 && outgoing > 1) return 'branch-merge';
  if (outgoing > 1) return 'branch';
  if (incoming > 1) return 'merge';
  return 'step';
}

export function storylineSequenceEdgeKey(edge: StorylineSequenceEdge): string {
  return `${edge.sourceNodeId}\u0000${edge.targetNodeId}`;
}

export function moveStorylineGraphNode(
  graph: StorylineSequenceGraph,
  movedNodeId: string,
  referenceNodeId: string,
  direction: StorylineBranchMoveDirection,
): StorylineSequenceGraph {
  if (movedNodeId === referenceNodeId) return graph;
  const remainingNodeIds = graph.nodeIds.filter((nodeId) => nodeId !== movedNodeId);
  const referenceIndex = remainingNodeIds.indexOf(referenceNodeId);
  if (referenceIndex < 0 || !graph.nodeIds.includes(movedNodeId)) {
    throw new Error('Storyline branch move references a missing node.');
  }
  const insertionIndex = direction === 'before' ? referenceIndex : referenceIndex + 1;
  const nodeIds = [...remainingNodeIds];
  nodeIds.splice(insertionIndex, 0, movedNodeId);
  const nodeOrder = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  const edges = graph.edges
    .map((edge, index) => ({ edge, index }))
    .sort((left, right) => {
      const sourceDelta =
        (nodeOrder.get(left.edge.sourceNodeId) ?? Number.MAX_SAFE_INTEGER) -
        (nodeOrder.get(right.edge.sourceNodeId) ?? Number.MAX_SAFE_INTEGER);
      if (sourceDelta !== 0) return sourceDelta;
      const targetDelta =
        (nodeOrder.get(left.edge.targetNodeId) ?? Number.MAX_SAFE_INTEGER) -
        (nodeOrder.get(right.edge.targetNodeId) ?? Number.MAX_SAFE_INTEGER);
      return targetDelta || left.index - right.index;
    })
    .map(({ edge }) => edge);
  return { nodeIds, edges };
}

function assignGraphColumns(
  nodesByKey: ReadonlyMap<string, MutableGraphNode>,
  edges: readonly StorylineGraphEdge[],
): ReadonlyMap<string, number> {
  const columns = new Map<string, number>();
  const indegrees = new Map<string, number>();
  const targetsBySource = new Map<string, Set<string>>();
  nodesByKey.forEach((_node, key) => {
    columns.set(key, 0);
    indegrees.set(key, 0);
  });

  edges.forEach((edge) => {
    let targets = targetsBySource.get(edge.sourceKey);
    if (!targets) {
      targets = new Set<string>();
      targetsBySource.set(edge.sourceKey, targets);
    }
    if (targets.has(edge.targetKey)) return;
    targets.add(edge.targetKey);
    indegrees.set(edge.targetKey, (indegrees.get(edge.targetKey) ?? 0) + 1);
  });

  const queue = Array.from(nodesByKey.values())
    .filter((node) => indegrees.get(node.key) === 0)
    .sort((left, right) => left.order - right.order);
  let visited = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    visited += 1;
    const sourceColumn = columns.get(node.key) ?? 0;
    const targets = Array.from(targetsBySource.get(node.key) ?? []);
    targets.forEach((targetKey) => {
      columns.set(targetKey, Math.max(columns.get(targetKey) ?? 0, sourceColumn + 1));
      const nextIndegree = (indegrees.get(targetKey) ?? 0) - 1;
      indegrees.set(targetKey, nextIndegree);
      if (nextIndegree !== 0) return;
      const target = nodesByKey.get(targetKey);
      if (!target) return;
      queue.push(target);
      queue.sort((left, right) => left.order - right.order);
    });
  }

  if (visited !== nodesByKey.size) {
    throw new Error('Storyline graph contains a cycle among source identities.');
  }
  return columns;
}
