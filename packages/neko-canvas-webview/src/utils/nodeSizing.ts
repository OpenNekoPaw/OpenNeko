import type { CanonicalCanvasNodeType } from '@neko-canvas/domain';

export interface NodeSize {
  width: number;
  height: number;
}

export interface NodeSizingInput {
  type: string;
  size?: NodeSize;
  container?: unknown;
}

export const DEFAULT_NODE_MIN_SIZE: NodeSize = { width: 180, height: 120 };
const DEFAULT_CONTAINER_MIN_SIZE: NodeSize = { width: 260, height: 180 };

const KNOWN_NODE_TYPE_MIN_SIZES = {
  markdown: { width: 180, height: 120 },
  media: { width: 200, height: 120 },
  group: { width: 260, height: 180 },
  job: { width: 240, height: 150 },
  file: { width: 180, height: 160 },
  'canvas-embed': { width: 220, height: 150 },
} satisfies Record<CanonicalCanvasNodeType, NodeSize>;

const NODE_TYPE_MIN_SIZES: Readonly<Partial<Record<string, NodeSize>>> = KNOWN_NODE_TYPE_MIN_SIZES;

export function resolveNodeMinSize(node: NodeSizingInput): NodeSize {
  const knownSize = NODE_TYPE_MIN_SIZES[node.type];
  if (knownSize) {
    return knownSize;
  }

  return node.container ? DEFAULT_CONTAINER_MIN_SIZE : DEFAULT_NODE_MIN_SIZE;
}

export function clampNodeSize(size: NodeSize, minSize: NodeSize): NodeSize {
  return {
    width: Math.max(minSize.width, normalizeSizeAxis(size.width)),
    height: Math.max(minSize.height, normalizeSizeAxis(size.height)),
  };
}

export function clampNodeRenderSize(
  node: NodeSizingInput,
  options: { renderHeight?: number; minSize?: NodeSize } = {},
): NodeSize {
  const minSize = options.minSize ?? resolveNodeMinSize(node);
  const clampedSize = clampNodeSize(node.size ?? minSize, minSize);
  if (options.renderHeight !== undefined) {
    return {
      width: clampedSize.width,
      height: Math.max(0, normalizeSizeAxis(options.renderHeight)),
    };
  }
  return clampedSize;
}

export function clampNodeStoredSize<TNode extends NodeSizingInput & { size: NodeSize }>(
  node: TNode,
): TNode {
  const nextSize = clampNodeSize(node.size, resolveNodeMinSize(node));
  if (nextSize.width === node.size.width && nextSize.height === node.size.height) {
    return node;
  }

  return {
    ...node,
    size: nextSize,
  };
}

export function clampNodeStoredSizes<TNode extends NodeSizingInput & { size: NodeSize }>(
  nodes: readonly TNode[],
): TNode[] {
  return nodes.map(clampNodeStoredSize);
}

function normalizeSizeAxis(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
