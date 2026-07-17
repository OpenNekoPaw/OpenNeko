import type {
  CanvasNarrativeConnectionLike,
  CanvasNarrativeNodeLike,
} from './canvas-narrative-contract';
import type { NarrativeRuntimeNodeType } from './narrative-preview';

export interface NarrativeChoiceEdge {
  readonly connectionId: string;
  readonly targetNodeId: string;
  readonly choiceText?: string;
  readonly condition?: string;
  readonly priority: number;
}

export interface NarrativeFlowTraversalResult {
  readonly startNodeId?: string;
  readonly successors: Readonly<Record<string, readonly string[]>>;
  readonly predecessors: Readonly<Record<string, readonly string[]>>;
  readonly defaultPath: readonly string[];
  readonly choices: Readonly<Record<string, readonly NarrativeChoiceEdge[]>>;
  readonly deadEndNodeIds: readonly string[];
  readonly endingNodeIds: readonly string[];
  readonly accidentalDeadEndNodeIds: readonly string[];
  readonly cycles: readonly (readonly string[])[];
}

export const NARRATIVE_TRAVERSAL_NODE_TYPES = [
  'narrative-start',
  'narrative-scene',
  'choice',
  'merge',
  'narrative-ending',
] as const satisfies readonly NarrativeRuntimeNodeType[];

export type NarrativeTraversalNodeType = (typeof NARRATIVE_TRAVERSAL_NODE_TYPES)[number];

export const NARRATIVE_NODE_TYPES = [...NARRATIVE_TRAVERSAL_NODE_TYPES, 'narrative-note'] as const;

export type NarrativeNodeType = (typeof NARRATIVE_NODE_TYPES)[number];

export const NARRATIVE_TRAVERSAL_NODE_TYPE_SET: ReadonlySet<NarrativeTraversalNodeType> = new Set(
  NARRATIVE_TRAVERSAL_NODE_TYPES,
);

export const NARRATIVE_NODE_TYPE_SET: ReadonlySet<NarrativeNodeType> = new Set(
  NARRATIVE_NODE_TYPES,
);

export function traverseNarrativeFlow(
  nodes: readonly CanvasNarrativeNodeLike[],
  connections: readonly CanvasNarrativeConnectionLike[],
  startNodeId?: string,
): NarrativeFlowTraversalResult {
  const narrativeNodeIds = new Set(
    nodes.filter((node) => isNarrativeTraversalNode(node)).map((node) => node.id),
  );
  const narrativeConnections = connections.filter(
    (connection) =>
      narrativeNodeIds.has(connection.sourceId) &&
      narrativeNodeIds.has(connection.targetId) &&
      (connection.type === 'choice' ||
        connection.type === 'default' ||
        connection.type === undefined),
  );

  const successors: Record<string, string[]> = {};
  const predecessors: Record<string, string[]> = {};
  const choices: Record<string, NarrativeChoiceEdge[]> = {};

  for (const nodeId of narrativeNodeIds) {
    successors[nodeId] = [];
    predecessors[nodeId] = [];
    choices[nodeId] = [];
  }

  for (const connection of narrativeConnections) {
    successors[connection.sourceId]?.push(connection.targetId);
    predecessors[connection.targetId]?.push(connection.sourceId);
    choices[connection.sourceId]?.push({
      connectionId: connection.id,
      targetNodeId: connection.targetId,
      choiceText: connection.choiceText,
      condition: connection.condition,
      priority: connection.priority ?? 0,
    });
  }

  for (const edges of Object.values(choices)) {
    edges.sort((left, right) => left.priority - right.priority);
  }

  const startNodeByType = nodes.find(
    (node) => isNarrativeStartNode(node) && narrativeNodeIds.has(node.id),
  );
  const resolvedStartNodeId =
    startNodeByType?.id ??
    (startNodeId && narrativeNodeIds.has(startNodeId) ? startNodeId : undefined) ??
    nodes.find((node) => narrativeNodeIds.has(node.id))?.id;
  const deadEndNodeIds = Array.from(narrativeNodeIds).filter(
    (nodeId) => (successors[nodeId]?.length ?? 0) === 0,
  );
  const endingNodeIds = nodes
    .filter((node) => isNarrativeEndingNode(node) && narrativeNodeIds.has(node.id))
    .map((node) => node.id);

  return {
    startNodeId: resolvedStartNodeId,
    successors,
    predecessors,
    defaultPath: resolvedStartNodeId
      ? buildDefaultPath(resolvedStartNodeId, choices, narrativeNodeIds.size)
      : [],
    choices,
    deadEndNodeIds,
    endingNodeIds,
    accidentalDeadEndNodeIds: deadEndNodeIds.filter((nodeId) => !endingNodeIds.includes(nodeId)),
    cycles: detectCycles(successors),
  };
}

export function isNarrativeNode(node: Pick<CanvasNarrativeNodeLike, 'type'>): boolean {
  return NARRATIVE_NODE_TYPE_SET.has(node.type as NarrativeNodeType);
}

export function isNarrativeTraversalNode(
  node: Pick<CanvasNarrativeNodeLike, 'type'>,
): node is Pick<CanvasNarrativeNodeLike, 'type'> & { readonly type: NarrativeTraversalNodeType } {
  return NARRATIVE_TRAVERSAL_NODE_TYPE_SET.has(node.type as NarrativeTraversalNodeType);
}

export function isNarrativeStartNode(
  node: Pick<CanvasNarrativeNodeLike, 'type'>,
): node is Pick<CanvasNarrativeNodeLike, 'type'> & { readonly type: 'narrative-start' } {
  return node.type === 'narrative-start';
}

export function isNarrativeEndingNode(
  node: Pick<CanvasNarrativeNodeLike, 'type'>,
): node is Pick<CanvasNarrativeNodeLike, 'type'> & { readonly type: 'narrative-ending' } {
  return node.type === 'narrative-ending';
}

function buildDefaultPath(
  startNodeId: string,
  choices: Readonly<Record<string, readonly NarrativeChoiceEdge[]>>,
  nodeLimit: number,
): readonly string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = startNodeId;

  while (current && !visited.has(current) && path.length <= nodeLimit) {
    path.push(current);
    visited.add(current);
    current = choices[current]?.[0]?.targetNodeId;
  }

  return path;
}

function detectCycles(
  successors: Readonly<Record<string, readonly string[]>>,
): readonly string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      if (cycleStart >= 0) {
        cycles.push([...stack.slice(cycleStart), nodeId]);
      }
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    stack.push(nodeId);
    for (const successor of successors[nodeId] ?? []) {
      visit(successor);
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of Object.keys(successors)) {
    visit(nodeId);
  }

  return cycles;
}
