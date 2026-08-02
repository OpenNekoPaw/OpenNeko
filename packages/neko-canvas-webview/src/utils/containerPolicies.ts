import type { CanonicalCanvasNodeType, CanvasNode } from '@neko-canvas/domain';
import { CANVAS_NODE_TYPES } from '@neko-canvas/domain';

export interface ContainerPolicy {
  name: 'group';
  acceptedNodeTypes: readonly CanonicalCanvasNodeType[];
  layoutMode: 'manual';
  allowNestedContainers: boolean;
}

export type ContainerPolicyRegistry = ReadonlyMap<'group', ContainerPolicy>;

const BUILT_IN_CONTAINER_POLICIES: ContainerPolicy[] = [
  {
    name: 'group',
    acceptedNodeTypes: [...CANVAS_NODE_TYPES],
    layoutMode: 'manual',
    allowNestedContainers: true,
  },
];

export function createBuiltInContainerPolicyRegistry(): ContainerPolicyRegistry {
  return new Map(BUILT_IN_CONTAINER_POLICIES.map((policy) => [policy.name, policy]));
}

export function getContainerPolicy(
  registry: ContainerPolicyRegistry,
  policyName: string | undefined,
): ContainerPolicy | undefined {
  return policyName === 'group' ? registry.get(policyName) : undefined;
}

export function canContainerAcceptChild(
  policy: ContainerPolicy | undefined,
  child: CanvasNode,
): boolean {
  if (!policy) {
    return false;
  }

  if (!policy.allowNestedContainers && child.container) {
    return false;
  }

  return policy.acceptedNodeTypes.some((type) => type === child.type);
}
