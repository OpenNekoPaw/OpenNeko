import type { CanvasNode } from '@neko-canvas/domain';
import { getContainerChildIds, getContainerPolicyName, isGroupNode } from '@neko-canvas/domain';
import {
  canContainerAcceptChild,
  createBuiltInContainerPolicyRegistry,
  getContainerPolicy,
} from './containerPolicies';

export interface ContainerActionResult {
  nodes: CanvasNode[];
  changed: boolean;
  error?: string;
}

export interface CreateCompositeInput {
  container: CanvasNode;
  children: CanvasNode[];
}

const CONTAINER_POLICIES = createBuiltInContainerPolicyRegistry();

export function addContainerChild(
  nodes: CanvasNode[],
  containerId: string,
  childId: string,
  insertIndex?: number,
): ContainerActionResult {
  const container = nodes.find((node) => node.id === containerId);
  const child = nodes.find((node) => node.id === childId);
  if (!container || !child) {
    return { nodes, changed: false, error: 'container or child not found' };
  }
  if (!isGroupNode(container)) {
    return { nodes, changed: false, error: 'Canvas Group container required' };
  }

  if (containerId === childId || isDescendant(nodes, childId, containerId)) {
    return { nodes, changed: false, error: 'container cycle rejected' };
  }

  const policy = getContainerPolicy(CONTAINER_POLICIES, getContainerPolicyName(container));
  if (!canContainerAcceptChild(policy, child)) {
    return { nodes, changed: false, error: 'child rejected by container policy' };
  }

  let nextNodes = nodes;
  const previousParentId = child.parentId;
  if (previousParentId && previousParentId !== containerId) {
    nextNodes = removeContainerChild(nextNodes, previousParentId, childId).nodes;
  }

  const nextChildIds = insertChildId(getContainerChildIds(container), childId, insertIndex);
  nextNodes = nextNodes.map((node) => {
    if (node.id === containerId) {
      return withContainerChildIds(node, nextChildIds);
    }

    if (node.id === childId) {
      return withParentId(node, container);
    }

    return node;
  });

  return { nodes: nextNodes, changed: true };
}

export function removeContainerChild(
  nodes: CanvasNode[],
  containerId: string,
  childId: string,
): ContainerActionResult {
  const container = nodes.find((node) => node.id === containerId);
  const child = nodes.find((node) => node.id === childId);
  if (!container || !child) {
    return { nodes, changed: false, error: 'container or child not found' };
  }
  if (!isGroupNode(container)) {
    return { nodes, changed: false, error: 'Canvas Group container required' };
  }

  const nextChildIds = getContainerChildIds(container).filter((id) => id !== childId);
  const nextNodes = nodes.map((node) => {
    if (node.id === containerId) {
      return withContainerChildIds(node, nextChildIds);
    }

    if (node.id === childId) {
      return withoutParentId(node, containerId);
    }

    return node;
  });

  return { nodes: nextNodes, changed: true };
}

export function reorderContainerChildren(
  nodes: CanvasNode[],
  containerId: string,
  childIds: string[],
): ContainerActionResult {
  const container = nodes.find((node) => node.id === containerId);
  if (!container) {
    return { nodes, changed: false, error: 'container not found' };
  }
  if (!isGroupNode(container)) {
    return { nodes, changed: false, error: 'Canvas Group container required' };
  }

  const currentIds = getContainerChildIds(container);
  const dedupedIds = childIds.filter((childId, index) => childIds.indexOf(childId) === index);
  if (
    dedupedIds.length !== currentIds.length ||
    dedupedIds.some((childId) => !currentIds.includes(childId))
  ) {
    return { nodes, changed: false, error: 'child order does not match container membership' };
  }

  return {
    nodes: nodes.map((node) =>
      node.id === containerId ? withContainerChildIds(node, dedupedIds) : node,
    ),
    changed: true,
  };
}

export function releaseContainerChildren(
  nodes: CanvasNode[],
  containerId: string,
): ContainerActionResult {
  const container = nodes.find((node) => node.id === containerId);
  if (!container) {
    return { nodes, changed: false, error: 'container not found' };
  }
  if (!isGroupNode(container)) {
    return { nodes, changed: false, error: 'Canvas Group container required' };
  }

  const childIds = getContainerChildIds(container);
  const childIdSet = new Set(childIds);
  const nextNodes = nodes.map((node) => {
    if (node.id === containerId) {
      return withContainerChildIds(node, []);
    }

    if (childIdSet.has(node.id)) {
      return withoutParentId(node, containerId);
    }

    return node;
  });

  return { nodes: nextNodes, changed: true };
}

export function createContainerComposite(
  nodes: CanvasNode[],
  input: CreateCompositeInput,
): ContainerActionResult {
  const newNodeIds = [input.container.id, ...input.children.map((child) => child.id)];
  const duplicateInputId = newNodeIds.find((id, index) => newNodeIds.indexOf(id) !== index);
  if (duplicateInputId) {
    return { nodes, changed: false, error: `duplicate node id: ${duplicateInputId}` };
  }

  const duplicateExistingId = newNodeIds.find((id) => nodes.some((existing) => existing.id === id));
  if (duplicateExistingId) {
    return { nodes, changed: false, error: `duplicate node id: ${duplicateExistingId}` };
  }

  let nextNodes = [...nodes, input.container, ...input.children];

  for (const child of input.children) {
    const result = addContainerChild(nextNodes, input.container.id, child.id);
    if (!result.changed) {
      return { nodes, changed: false, error: result.error };
    }
    nextNodes = result.nodes;
  }

  return { nodes: nextNodes, changed: true };
}

export function getContainerDescendantIds(nodes: CanvasNode[], containerId: string): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const container = nodeById.get(containerId);
  if (!container) {
    throw new Error(`Canvas Group "${containerId}" not found`);
  }
  if (!isGroupNode(container)) {
    throw new Error(`Canvas node "${containerId}" is not a Group`);
  }
  const result: string[] = [];
  const visiting = new Set<string>();

  function visit(parentId: string): void {
    if (visiting.has(parentId)) {
      return;
    }
    visiting.add(parentId);

    const parent = nodeById.get(parentId);
    if (!parent) {
      return;
    }

    if (!isGroupNode(parent)) {
      return;
    }
    for (const childId of getContainerChildIds(parent)) {
      result.push(childId);
      visit(childId);
    }
  }

  visit(containerId);
  return result;
}

export function translateContainerSubtree(
  nodes: CanvasNode[],
  containerId: string,
  delta: { x: number; y: number },
): CanvasNode[] {
  const childIds = new Set(getContainerDescendantIds(nodes, containerId));

  return nodes.map((node) => {
    if (node.id === containerId || childIds.has(node.id)) {
      return {
        ...node,
        position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
      };
    }

    return node;
  });
}

function withContainerChildIds(node: CanvasNode, childIds: string[]): CanvasNode {
  if (!isGroupNode(node)) {
    throw new Error(`Canvas node "${node.id}" is not a Group`);
  }

  return {
    ...node,
    container: {
      ...(node.container ?? {}),
      policy: 'group',
      childIds,
    },
    data: { ...node.data },
  };
}

function withParentId(node: CanvasNode, parent: CanvasNode): CanvasNode {
  return { ...node, parentId: parent.id };
}

function withoutParentId(node: CanvasNode, parentId: string): CanvasNode {
  if (node.parentId !== parentId) {
    return node;
  }

  return { ...node, parentId: undefined };
}

function insertChildId(
  childIds: string[],
  childId: string,
  insertIndex: number | undefined,
): string[] {
  const withoutChild = childIds.filter((id) => id !== childId);
  if (insertIndex === undefined || insertIndex < 0 || insertIndex >= withoutChild.length) {
    return [...withoutChild, childId];
  }

  return [...withoutChild.slice(0, insertIndex), childId, ...withoutChild.slice(insertIndex)];
}

function isDescendant(
  nodes: CanvasNode[],
  ancestorId: string,
  candidateDescendantId: string,
): boolean {
  const ancestor = nodes.find((node) => node.id === ancestorId);
  if (!ancestor || !isGroupNode(ancestor)) {
    return false;
  }
  return getContainerDescendantIds(nodes, ancestorId).includes(candidateDescendantId);
}
