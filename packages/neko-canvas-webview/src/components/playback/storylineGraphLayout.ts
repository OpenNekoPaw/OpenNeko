import type { CanvasPlaybackRouteCandidate, CanvasPlaybackUnit } from '@neko/shared';

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
  const nodes = Array.from(nodesByKey.values())
    .map<StorylineGraphNode>((node) => ({
      key: node.key,
      sourceNodeId: node.sourceNodeId,
      column: columns.get(node.key) ?? 0,
      lane: Math.min(...node.occurrences.map((occurrence) => occurrence.routeIndex)),
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
    throw new Error('Storyline graph contains cyclic source identities.');
  }
  return columns;
}
