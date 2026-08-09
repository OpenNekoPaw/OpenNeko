import type { CanvasData, GenerationCanvasNode } from './types/canvas';
import {
  applyCanvasGenerationOutputs,
  authorCanvasGeneratedText,
  bindCanvasGenerationJob,
  createCanvasGenerationNodeData,
  selectCanvasGenerationOutput,
  updateCanvasGenerationRecipe,
  type CanvasGenerationKind,
  type CanvasGenerationOutputBinding,
  type CanvasGenerationRecipe,
} from './types/canvas-generation-node';

const CANVAS_GENERATION_NODE_DEFAULT_SIZES = {
  prompt: { width: 320, height: 220 },
  image: { width: 300, height: 220 },
  audio: { width: 300, height: 120 },
  video: { width: 300, height: 220 },
} satisfies Record<CanvasGenerationKind, { readonly width: number; readonly height: number }>;

export function resolveCanvasGenerationNodeDefaultSize(kind: CanvasGenerationKind): {
  readonly width: number;
  readonly height: number;
} {
  return { ...CANVAS_GENERATION_NODE_DEFAULT_SIZES[kind] };
}

export function createCanvasGenerationNode(input: {
  readonly canvas: CanvasData;
  readonly nodeId: string;
  readonly kind: CanvasGenerationKind;
  readonly position: { readonly x: number; readonly y: number };
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
    data: createCanvasGenerationNodeData(input.kind),
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
