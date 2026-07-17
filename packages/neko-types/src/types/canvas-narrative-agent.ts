import type {
  CanvasNarrativeConnectionLike,
  CanvasNarrativeNodeLike,
} from './canvas-narrative-contract';
import { isSupportedNarrativeSceneRef } from './canvas-narrative-validation';
import { traverseNarrativeFlow } from './canvas-flow-traversal';
import { WhitelistConditionEvaluator } from './narrative-runtime';

export type CanvasNarrativeAgentDiagnosticCode =
  | 'narrative-missing-entry'
  | 'narrative-unreachable-node'
  | 'narrative-accidental-dead-end'
  | 'narrative-missing-ending'
  | 'narrative-invalid-scene-ref'
  | 'narrative-unresolved-variable'
  | 'narrative-unsupported-condition';

export interface CanvasNarrativeAgentDiagnostic {
  readonly code: CanvasNarrativeAgentDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly nodeId?: string;
  readonly connectionId?: string;
  readonly path?: string;
  readonly variableName?: string;
}

export interface CanvasNarrativeNodeAgentSummary {
  readonly role: 'start' | 'scene' | 'choice' | 'merge' | 'ending' | 'note';
  readonly sceneRef?: string;
  readonly choiceLabels?: readonly string[];
  readonly conditions?: readonly string[];
  readonly endingLabel?: string;
  readonly endingType?: string;
  readonly variableEffects?: readonly string[];
  readonly diagnostics?: readonly CanvasNarrativeAgentDiagnostic[];
}

export interface CanvasNarrativeAgentAnalysis {
  readonly diagnostics: readonly CanvasNarrativeAgentDiagnostic[];
  readonly nodeSummaries: Readonly<Record<string, CanvasNarrativeNodeAgentSummary>>;
}

export function analyzeCanvasNarrativeForAgent(input: {
  readonly nodes: readonly CanvasNarrativeNodeLike[];
  readonly connections: readonly CanvasNarrativeConnectionLike[];
  readonly variableNames?: readonly string[];
  readonly entryNodeId?: string;
}): CanvasNarrativeAgentAnalysis {
  const narrativeNodes = input.nodes.filter(isNarrativeAgentNode);
  const traversal = traverseNarrativeFlow(input.nodes, input.connections, input.entryNodeId);
  const diagnostics: CanvasNarrativeAgentDiagnostic[] = [];
  const variableNames = new Set(input.variableNames ?? []);
  const evaluator = new WhitelistConditionEvaluator();

  if (!traversal.startNodeId) {
    diagnostics.push({
      code: 'narrative-missing-entry',
      severity: 'error',
      message: 'Narrative graph has no playable entry node.',
    });
  }

  if (traversal.endingNodeIds.length === 0) {
    diagnostics.push({
      code: 'narrative-missing-ending',
      severity: 'error',
      message: 'Narrative graph has no narrative-ending node.',
    });
  }

  const reachable = collectReachableNodeIds(traversal.startNodeId, traversal.successors);
  for (const node of narrativeNodes) {
    if (isRuntimeNarrativeAgentNode(node) && traversal.startNodeId && !reachable.has(node.id)) {
      diagnostics.push({
        code: 'narrative-unreachable-node',
        severity: 'warning',
        message: `Narrative node "${node.id}" is not reachable from the entry path.`,
        nodeId: node.id,
      });
    }
  }

  for (const nodeId of traversal.accidentalDeadEndNodeIds) {
    diagnostics.push({
      code: 'narrative-accidental-dead-end',
      severity: 'warning',
      message: `Narrative node "${nodeId}" has no outgoing runtime edge and is not an ending.`,
      nodeId,
    });
  }

  for (const node of narrativeNodes) {
    if (node.type !== 'narrative-scene') continue;
    const sceneRef = readStringField(node.data, 'sceneRef');
    if (!sceneRef) {
      diagnostics.push({
        code: 'narrative-invalid-scene-ref',
        severity: 'error',
        message: 'Narrative scene node has no .fountain scene reference.',
        nodeId: node.id,
      });
      continue;
    }
    if (!isSupportedNarrativeSceneRef(sceneRef)) {
      diagnostics.push({
        code: 'narrative-invalid-scene-ref',
        severity: 'error',
        message: 'Narrative scene refs must point to standard .fountain files.',
        nodeId: node.id,
        path: sceneRef,
      });
    }
  }

  const validationVariables = Object.fromEntries(
    [...variableNames].map((name) => [name, 0] as const),
  );
  for (const connection of input.connections) {
    if (!connection.condition) continue;
    const evaluation = evaluator.evaluate(connection.condition, validationVariables);
    for (const conditionDiagnostic of evaluation.diagnostics) {
      diagnostics.push({
        code:
          conditionDiagnostic.code === 'condition-missing-variable'
            ? 'narrative-unresolved-variable'
            : 'narrative-unsupported-condition',
        severity: 'error',
        message: conditionDiagnostic.message,
        connectionId: connection.id,
        variableName: conditionDiagnostic.variableName,
      });
    }
  }

  const nodeSummaries: Record<string, CanvasNarrativeNodeAgentSummary> = {};
  for (const node of narrativeNodes) {
    const summary = summarizeNarrativeNodeForAgent(node, input.connections, diagnostics);
    if (summary) {
      nodeSummaries[node.id] = summary;
    }
  }

  return {
    diagnostics,
    nodeSummaries,
  };
}

export function summarizeNarrativeNodeForAgent(
  node: CanvasNarrativeNodeLike,
  connections: readonly CanvasNarrativeConnectionLike[] = [],
  diagnostics: readonly CanvasNarrativeAgentDiagnostic[] = [],
): CanvasNarrativeNodeAgentSummary | undefined {
  if (!isNarrativeAgentNode(node)) return undefined;

  const outgoing = connections.filter((connection) => connection.sourceId === node.id);
  const nodeDiagnostics = diagnostics.filter((diagnostic) => diagnostic.nodeId === node.id);
  const summary: CanvasNarrativeNodeAgentSummary = {
    role: toNarrativeAgentRole(node.type),
    ...(node.type === 'narrative-scene'
      ? { sceneRef: readStringField(node.data, 'sceneRef') }
      : {}),
    ...(outgoing.length > 0
      ? {
          choiceLabels: outgoing
            .map((connection) => connection.choiceText ?? connection.label)
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
          conditions: outgoing
            .map((connection) => connection.condition)
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
        }
      : {}),
    ...(node.type === 'narrative-ending'
      ? {
          endingLabel: readStringField(node.data, 'endingLabel'),
          endingType: readStringField(node.data, 'endingType'),
        }
      : {}),
    ...readVariableEffectsSummary(node.data),
    ...(nodeDiagnostics.length > 0 ? { diagnostics: nodeDiagnostics } : {}),
  };

  return summary;
}

function collectReachableNodeIds(
  startNodeId: string | undefined,
  successors: Readonly<Record<string, readonly string[]>>,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const queue = startNodeId ? [startNodeId] : [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    queue.push(...(successors[nodeId] ?? []));
  }
  return reachable;
}

function isNarrativeAgentNode(node: CanvasNarrativeNodeLike): boolean {
  return (
    node.type === 'narrative-start' ||
    node.type === 'narrative-scene' ||
    node.type === 'choice' ||
    node.type === 'merge' ||
    node.type === 'narrative-ending' ||
    node.type === 'narrative-note'
  );
}

function isRuntimeNarrativeAgentNode(node: CanvasNarrativeNodeLike): boolean {
  return node.type !== 'narrative-note' && isNarrativeAgentNode(node);
}

function toNarrativeAgentRole(
  type: CanvasNarrativeNodeLike['type'],
): CanvasNarrativeNodeAgentSummary['role'] {
  switch (type) {
    case 'narrative-start':
      return 'start';
    case 'narrative-scene':
      return 'scene';
    case 'choice':
      return 'choice';
    case 'merge':
      return 'merge';
    case 'narrative-ending':
      return 'ending';
    case 'narrative-note':
    default:
      return 'note';
  }
}

function readVariableEffectsSummary(
  data: unknown,
): Pick<CanvasNarrativeNodeAgentSummary, 'variableEffects'> {
  if (!isRecord(data) || !Array.isArray(data['variableEffects'])) return {};
  const effects = data['variableEffects'].flatMap((effect) => {
    if (!isRecord(effect)) return [];
    const variableId = typeof effect['variableId'] === 'string' ? effect['variableId'] : undefined;
    const operation = typeof effect['operation'] === 'string' ? effect['operation'] : undefined;
    return variableId && operation ? [`${operation}:${variableId}`] : [];
  });
  return effects.length > 0 ? { variableEffects: effects } : {};
}

function readStringField(data: unknown, field: string): string | undefined {
  if (!isRecord(data)) return undefined;
  const value = data[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
