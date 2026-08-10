import type { CanvasConnection, CanvasData, GenerationCanvasNode } from './types/canvas';
import {
  applyCanvasGenerationOutputs,
  authorCanvasGeneratedText,
  bindCanvasGenerationJob,
  createCanvasGenerationNodeData,
  selectCanvasGenerationOutput,
  updateCanvasGenerationRecipe,
  type CanvasGenerationKind,
  type CanvasGenerationModelBinding,
  type CanvasGenerationOutputBinding,
  type CanvasGenerationRecipe,
} from './types/canvas-generation-node';
import { resolveCanvasGenerationNodeDefaultSize } from './canvas-node-sizing';

export { resolveCanvasGenerationNodeDefaultSize } from './canvas-node-sizing';

export function createCanvasGenerationNode(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly kind: CanvasGenerationKind;
  readonly position: { readonly x: number; readonly y: number };
  readonly defaultModel?: CanvasGenerationModelBinding;
}): CanvasData {
  if (input.canvas.nodes.some((node) => node.id === input.nodeId)) {
    throw new Error(`Canvas node identity "${input.nodeId}" already exists.`);
  }
  const node: GenerationCanvasNode = {
    id: input.nodeId,
    type: 'generation',
    position: { ...input.position },
    size: resolveCanvasGenerationNodeDefaultSize(input.kind),
    zIndex:
      input.canvas.nodes.reduce((highest, candidate) => Math.max(highest, candidate.zIndex), -1) +
      1,
    data: createCanvasGenerationNodeData(input.kind, input.defaultModel),
  };
  return { ...input.canvas, nodes: [...input.canvas.nodes, node] };
}

export function updateCanvasGenerationNodeRecipe(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly recipe: CanvasGenerationRecipe;
}): CanvasData {
  return replaceGenerationNode(input.canvas, input.nodeId, (node) => ({
    ...node,
    data: updateCanvasGenerationRecipe(node.data, input.recipe),
  }));
}

export function bindCanvasGenerationNodeJob(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly submissionId: string;
  readonly recipeInputFingerprint: string;
  readonly jobRef: CanvasGenerationOutputBinding['jobRef'];
}): CanvasData {
  return replaceGenerationNode(input.canvas, input.nodeId, (node) => {
    const result = bindCanvasGenerationJob(node.data, input);
    if (result.status === 'rejected') throw new Error(result.diagnostic.message);
    return { ...node, data: result.data };
  });
}

export function applyCanvasGenerationNodeOutputs(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly submissionId: string;
  readonly recipeInputFingerprint: string;
  readonly jobRef: CanvasGenerationOutputBinding['jobRef'];
  readonly outputs: readonly CanvasGenerationOutputBinding[];
}): CanvasData {
  return replaceGenerationNode(input.canvas, input.nodeId, (node) => {
    const result = applyCanvasGenerationOutputs(node.data, input);
    if (result.status === 'rejected') throw new Error(result.diagnostic.message);
    return { ...node, data: result.data };
  });
}

export function selectCanvasGenerationNodeOutput(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly outputId: string;
}): CanvasData {
  return replaceGenerationNode(input.canvas, input.nodeId, (node) => ({
    ...node,
    data: selectCanvasGenerationOutput(node.data, input.outputId),
  }));
}

export function authorCanvasGenerationNodeText(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly text: string;
}): CanvasData {
  return replaceGenerationNode(input.canvas, input.nodeId, (node) => ({
    ...node,
    data: authorCanvasGeneratedText(node.data, input.text),
  }));
}

export function attachCanvasGenerationReference(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly sourceNodeId: string;
}): CanvasData {
  requireCanvasGenerationNode(input.canvas, input.nodeId);
  if (!input.canvas.nodes.some((node) => node.id === input.sourceNodeId)) {
    throw new Error(`Canvas Generation reference source "${input.sourceNodeId}" does not exist.`);
  }
  const connection: CanvasConnection = {
    id: `generation-reference:${encodeURIComponent(input.sourceNodeId)}:${encodeURIComponent(input.nodeId)}`,
    sourceId: input.sourceNodeId,
    targetId: input.nodeId,
    type: 'reference',
    sourceEndpoint: { nodeId: input.sourceNodeId, scope: 'node' },
    targetEndpoint: { nodeId: input.nodeId, scope: 'port', portId: 'reference' },
  };
  if (input.canvas.connections.some((candidate) => candidate.id === connection.id)) {
    throw new Error(`Canvas Generation reference "${connection.id}" already exists.`);
  }
  return { ...input.canvas, connections: [...input.canvas.connections, connection] };
}

export function requireCanvasGenerationNode(
  canvas: CanvasData,
  nodeId: string,
): GenerationCanvasNode {
  const node = canvas.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== 'generation') {
    throw new Error(`Canvas Generation node "${nodeId}" does not exist.`);
  }
  return node;
}

function replaceGenerationNode(
  canvas: CanvasData,
  nodeId: string,
  update: (node: GenerationCanvasNode) => GenerationCanvasNode,
): CanvasData {
  const target = requireCanvasGenerationNode(canvas, nodeId);
  const next = update(target);
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) => (node.id === nodeId ? next : node)),
  };
}
