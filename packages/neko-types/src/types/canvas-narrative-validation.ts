import type {
  CanvasNarrativeConnectionLike,
  CanvasNarrativeNodeLike,
} from './canvas-narrative-contract';
import {
  isNarrativeEndingNode,
  isNarrativeStartNode,
  isNarrativeTraversalNode,
} from './canvas-flow-traversal';
import {
  validateNarrativeAssetRef,
  type NarrativeAssetValidationDiagnostic,
} from './narrative-asset';

export type NarrativeGraphValidationCode =
  | 'multiple-narrative-start'
  | 'narrative-start-incoming-edge'
  | 'narrative-ending-outgoing-edge'
  | 'invalid-narrative-scene-ref'
  | 'invalid-narrative-asset-ref';

export interface NarrativeGraphValidationDiagnostic {
  readonly code: NarrativeGraphValidationCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly connectionId?: string;
  readonly path?: string;
  readonly assetDiagnostics?: readonly NarrativeAssetValidationDiagnostic[];
}

const SUPPORTED_NARRATIVE_SCENE_EXTENSION = '.fountain';

export function validateCanvasNarrativeGraph(canvas: {
  readonly nodes: readonly CanvasNarrativeNodeLike[];
  readonly connections: readonly CanvasNarrativeConnectionLike[];
}): readonly NarrativeGraphValidationDiagnostic[] {
  const diagnostics: NarrativeGraphValidationDiagnostic[] = [];
  const startNodes = canvas.nodes.filter(isNarrativeStartNode);

  if (startNodes.length > 1) {
    diagnostics.push({
      code: 'multiple-narrative-start',
      message: 'A narrative graph can contain at most one narrative-start node.',
    });
  }

  for (const connection of canvas.connections) {
    const sourceNode = findNode(canvas.nodes, connection.sourceId);
    const targetNode = findNode(canvas.nodes, connection.targetId);
    if (!sourceNode || !targetNode || !isNarrativeRuntimeConnection(connection)) continue;

    if (isNarrativeStartNode(targetNode) && isNarrativeRuntimeNode(sourceNode)) {
      diagnostics.push({
        code: 'narrative-start-incoming-edge',
        message: 'narrative-start nodes must not accept incoming runtime edges.',
        nodeId: targetNode.id,
        connectionId: connection.id,
      });
    }

    if (isNarrativeEndingNode(sourceNode) && isNarrativeRuntimeNode(targetNode)) {
      diagnostics.push({
        code: 'narrative-ending-outgoing-edge',
        message: 'narrative-ending nodes must not emit outgoing runtime edges.',
        nodeId: sourceNode.id,
        connectionId: connection.id,
      });
    }
  }

  for (const node of canvas.nodes) {
    if (node.type !== 'narrative-scene') continue;

    const data = readRecord(node.data);
    const sceneRef = data ? readStringField(data, 'sceneRef') : undefined;
    if (sceneRef !== undefined && !isSupportedNarrativeSceneRef(sceneRef)) {
      diagnostics.push({
        code: 'invalid-narrative-scene-ref',
        message: 'Narrative scene refs must point to standard .fountain files.',
        nodeId: node.id,
        path: sceneRef,
      });
    }

    for (const field of ['backgroundRef', 'bgm'] as const) {
      const assetRef = data?.[field];
      if (assetRef === undefined) continue;
      const assetDiagnostics = validateNarrativeAssetRef(assetRef);
      if (assetDiagnostics.length > 0) {
        diagnostics.push({
          code: 'invalid-narrative-asset-ref',
          message: `Narrative scene ${field} must use a durable NarrativeAssetRef.`,
          nodeId: node.id,
          assetDiagnostics,
        });
      }
    }
  }

  return diagnostics;
}

export function isSupportedNarrativeSceneRef(path: string): boolean {
  return path.trim().toLowerCase().endsWith(SUPPORTED_NARRATIVE_SCENE_EXTENSION);
}

function isNarrativeRuntimeConnection(connection: CanvasNarrativeConnectionLike): boolean {
  return (
    connection.type === undefined || connection.type === 'default' || connection.type === 'choice'
  );
}

function isNarrativeRuntimeNode(node: CanvasNarrativeNodeLike): boolean {
  return isNarrativeTraversalNode(node);
}

function findNode(
  nodes: readonly CanvasNarrativeNodeLike[],
  nodeId: string,
): CanvasNarrativeNodeLike | undefined {
  return nodes.find((node) => node.id === nodeId);
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readStringField(
  data: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = (data as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}
