import type {
  CanvasNode,
  CanvasNodeType,
  ContainerDeleteBehavior,
  ContainerPolicyName,
} from '@neko/shared';
import { CANVAS_NODE_TYPES } from '@neko/shared';

export interface ContainerPolicy {
  name: ContainerPolicyName;
  acceptedNodeTypes?: CanvasNodeType[];
  deleteBehavior: ContainerDeleteBehavior;
  layoutMode: 'manual' | 'grid' | 'sequence' | 'table';
  allowNestedContainers: boolean;
}

export type ContainerPolicyRegistry = ReadonlyMap<ContainerPolicyName, ContainerPolicy>;

const BUILT_IN_CONTAINER_POLICIES: ContainerPolicy[] = [
  {
    name: 'scene',
    acceptedNodeTypes: ['shot'],
    deleteBehavior: 'release-children',
    layoutMode: 'sequence',
    allowNestedContainers: false,
  },
  {
    name: 'group',
    acceptedNodeTypes: [...CANVAS_NODE_TYPES],
    deleteBehavior: 'release-children',
    layoutMode: 'manual',
    allowNestedContainers: true,
  },
  {
    name: 'artboard',
    deleteBehavior: 'release-children',
    layoutMode: 'grid',
    allowNestedContainers: true,
  },
  {
    name: 'table',
    deleteBehavior: 'release-children',
    layoutMode: 'table',
    allowNestedContainers: true,
  },
  {
    name: 'gallery',
    acceptedNodeTypes: ['media'],
    deleteBehavior: 'delete-subtree',
    layoutMode: 'grid',
    allowNestedContainers: false,
  },
];

export function createBuiltInContainerPolicyRegistry(): ContainerPolicyRegistry {
  return new Map(BUILT_IN_CONTAINER_POLICIES.map((policy) => [policy.name, policy]));
}

export function getContainerPolicy(
  registry: ContainerPolicyRegistry,
  policyName: ContainerPolicyName | undefined,
): ContainerPolicy | undefined {
  return policyName ? registry.get(policyName) : undefined;
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

  return !policy.acceptedNodeTypes || policy.acceptedNodeTypes.includes(child.type);
}
