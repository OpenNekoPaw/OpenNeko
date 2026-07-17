import type { CanvasNode } from '@neko/shared';
import { getContainerPolicyName, getNodeParentId } from '@neko/shared';
import {
  canContainerAcceptChild,
  createBuiltInContainerPolicyRegistry,
  getContainerPolicy,
} from './containerPolicies';
import { getContainerDescendantIds } from './containerActions';

export interface CanvasDropContainerResolution {
  readonly targetContainerId?: string;
  readonly diagnostic?: string;
}

export interface CanvasDropContainerOptions {
  /** Descendants translate with a moved container and therefore cannot become new drop targets. */
  readonly movingSubtree?: boolean;
}

const CONTAINER_HEADER_HEIGHT = 48;
const CONTAINER_POLICIES = createBuiltInContainerPolicyRegistry();

export function resolveCanvasDropContainer(
  nodes: readonly CanvasNode[],
  movedNodeId: string,
  options: CanvasDropContainerOptions = {},
): CanvasDropContainerResolution {
  const movedNode = nodes.find((node) => node.id === movedNodeId);
  if (!movedNode) return { diagnostic: `Moved Canvas node not found: ${movedNodeId}` };
  const descendants = movedNode.container
    ? new Set(getContainerDescendantIds([...nodes], movedNodeId))
    : new Set<string>();
  const eligible = nodes.flatMap((container) => {
    if (container.id === movedNodeId || !container.container) return [];
    if (!containsNodeCenter(container, movedNode)) return [];
    if (descendants.has(container.id)) {
      if (options.movingSubtree) return [];
      return [{ container, depth: containerDepth(nodes, container), cycle: true }];
    }
    const policy = getContainerPolicy(CONTAINER_POLICIES, getContainerPolicyName(container));
    if (!canContainerAcceptChild(policy, movedNode)) return [];
    return [{ container, depth: containerDepth(nodes, container), cycle: false }];
  });
  eligible.sort((left, right) => {
    if (left.depth !== right.depth) return right.depth - left.depth;
    if (left.container.zIndex !== right.container.zIndex) {
      return right.container.zIndex - left.container.zIndex;
    }
    return left.container.id.localeCompare(right.container.id);
  });
  const winner = eligible[0];
  if (!winner) return {};
  if (winner.cycle) {
    return {
      diagnostic: `Canvas container cycle rejected: ${movedNodeId} -> ${winner.container.id}`,
    };
  }
  return { targetContainerId: winner.container.id };
}

function containsNodeCenter(container: CanvasNode, node: CanvasNode): boolean {
  const centerX = node.position.x + node.size.width / 2;
  const centerY = node.position.y + node.size.height / 2;
  return (
    centerX >= container.position.x &&
    centerX <= container.position.x + container.size.width &&
    centerY >= container.position.y + CONTAINER_HEADER_HEIGHT &&
    centerY <= container.position.y + container.size.height
  );
}

function containerDepth(nodes: readonly CanvasNode[], container: CanvasNode): number {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set([container.id]);
  let parentId = getNodeParentId(container);
  let depth = 0;
  while (parentId) {
    if (visiting.has(parentId)) {
      throw new Error(`Canvas container cycle detected at "${parentId}".`);
    }
    visiting.add(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) throw new Error(`Canvas container parent not found: ${parentId}`);
    depth += 1;
    parentId = getNodeParentId(parent);
  }
  return depth;
}
