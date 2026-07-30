import type { CanvasNode } from '@neko/shared';
import { getContainerPolicyName, getNodeParentId } from '@neko/shared';
import { createBuiltInContainerPolicyRegistry, getContainerPolicy } from './containerPolicies';

export interface CanvasNodeRenderPlan {
  readonly nodes: readonly CanvasNode[];
  readonly renderedNodeIds: ReadonlySet<string>;
  readonly hiddenNodeIds: ReadonlySet<string>;
  readonly expandedSpatialContainerIds: ReadonlySet<string>;
}

const CONTAINER_POLICIES = createBuiltInContainerPolicyRegistry();

export function projectCanvasNodeRenderPlan(nodes: readonly CanvasNode[]): CanvasNodeRenderPlan {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const renderedNodeIds = new Set<string>();
  const hiddenNodeIds = new Set<string>();
  const depthById = new Map<string, number>();

  for (const node of nodes) {
    const result = resolveRenderEligibility(node, nodeById);
    depthById.set(node.id, result.depth);
    (result.rendered ? renderedNodeIds : hiddenNodeIds).add(node.id);
  }

  const rendered = nodes
    .filter((node) => renderedNodeIds.has(node.id))
    .sort((left, right) => {
      const depthDelta = (depthById.get(left.id) ?? 0) - (depthById.get(right.id) ?? 0);
      if (depthDelta !== 0) return depthDelta;
      if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex;
      return left.id.localeCompare(right.id);
    });
  const expandedSpatialContainerIds = new Set(
    rendered
      .filter((node) => {
        const policy = getContainerPolicy(CONTAINER_POLICIES, getContainerPolicyName(node));
        return policy?.layoutMode === 'manual' && node.container?.collapsed !== true;
      })
      .map((node) => node.id),
  );
  return { nodes: rendered, renderedNodeIds, hiddenNodeIds, expandedSpatialContainerIds };
}

export function getTopLevelCanvasNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
  return [...projectCanvasNodeRenderPlan(nodes).nodes];
}

function resolveRenderEligibility(
  node: CanvasNode,
  nodeById: ReadonlyMap<string, CanvasNode>,
): { readonly rendered: boolean; readonly depth: number } {
  let parentId = getNodeParentId(node);
  let depth = 0;
  const visiting = new Set([node.id]);
  while (parentId) {
    if (visiting.has(parentId)) {
      throw new Error(`Canvas container cycle detected while rendering node "${node.id}".`);
    }
    visiting.add(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) {
      throw new Error(`Canvas node "${node.id}" references missing parent "${parentId}".`);
    }
    const policy = getContainerPolicy(CONTAINER_POLICIES, getContainerPolicyName(parent));
    if (!policy) {
      throw new Error(`Canvas parent "${parentId}" has no registered container policy.`);
    }
    if (policy.layoutMode !== 'manual' || parent.container?.collapsed === true) {
      return { rendered: false, depth };
    }
    depth += 1;
    parentId = getNodeParentId(parent);
  }
  return { rendered: true, depth };
}
