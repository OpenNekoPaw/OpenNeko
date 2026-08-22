import type { CanvasNode } from '@neko/canvas-domain';
import { getNodeParentId, isContainerNode } from '@neko/canvas-domain';
import { translateContainerSubtree } from './containerActions';

export interface CanvasSelectionTranslation {
  readonly nodes: CanvasNode[];
  readonly rootIds: readonly string[];
}

export function translateCanvasSelection(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
  delta: { readonly x: number; readonly y: number },
): CanvasSelectionTranslation {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
    throw new Error('Canvas selection translation requires a finite delta.');
  }

  const rootIds = resolveCanvasSelectionMoveRoots(nodes, selectedNodeIds);
  if (rootIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
    return { nodes: [...nodes], rootIds };
  }

  let nextNodes = [...nodes];
  for (const rootId of rootIds) {
    const root = nextNodes.find((node) => node.id === rootId);
    if (!root) {
      throw new Error(`Canvas selection movement root not found: ${rootId}`);
    }
    nextNodes = isContainerNode(root)
      ? translateContainerSubtree(nextNodes, rootId, delta)
      : nextNodes.map((node) =>
          node.id === rootId
            ? {
                ...node,
                position: {
                  x: node.position.x + delta.x,
                  y: node.position.y + delta.y,
                },
              }
            : node,
        );
  }

  return { nodes: nextNodes, rootIds };
}

export function resolveCanvasSelectionMoveRoots(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
): readonly string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const movableIds = new Set(
    selectedNodeIds.filter((nodeId) => {
      const node = nodeById.get(nodeId);
      return node !== undefined && node.locked !== true;
    }),
  );

  return nodes.flatMap((node) => {
    if (!movableIds.has(node.id)) return [];

    const visited = new Set([node.id]);
    let parentId = getNodeParentId(node);
    while (parentId) {
      if (visited.has(parentId)) {
        throw new Error(`Canvas selection container cycle detected at "${parentId}".`);
      }
      visited.add(parentId);
      if (movableIds.has(parentId)) return [];
      const parent = nodeById.get(parentId);
      if (!parent) {
        throw new Error(`Canvas selection parent not found: ${parentId}`);
      }
      parentId = getNodeParentId(parent);
    }

    return [node.id];
  });
}
