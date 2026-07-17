// =============================================================================
// Canvas Layered Model Helpers
//
// Pure helpers for layered Canvas organization contracts.
// =============================================================================

import type { CanvasNode } from '../types/canvas';
import type { ContainerPolicyName } from '../types/canvas-layered';

export type CanvasContainerChildSource = 'container';

export interface CanvasContainerChildReference {
  parentId: string;
  childId: string;
  source: CanvasContainerChildSource;
}

export type CanvasParentReferenceSource = 'parentId';

export interface CanvasParentReference {
  nodeId: string;
  parentId: string;
  source: CanvasParentReferenceSource;
}

export function getContainerChildIds(node: CanvasNode): string[] {
  return uniqueStrings(node.container?.childIds ?? []);
}

export function getContainerChildReferences(node: CanvasNode): CanvasContainerChildReference[] {
  const references: CanvasContainerChildReference[] = [];

  for (const childId of node.container?.childIds ?? []) {
    references.push({ parentId: node.id, childId, source: 'container' });
  }

  return references;
}

export function getNodeParentId(node: CanvasNode): string | undefined {
  return node.parentId;
}

export function getNodeParentReferences(node: CanvasNode): CanvasParentReference[] {
  const references: CanvasParentReference[] = [];

  if (node.parentId) {
    references.push({ nodeId: node.id, parentId: node.parentId, source: 'parentId' });
  }

  return references;
}

export function isContainerNode(node: CanvasNode): boolean {
  return getContainerChildIds(node).length > 0 || node.container !== undefined;
}

export function getContainerPolicyName(node: CanvasNode): ContainerPolicyName | undefined {
  if (node.container?.policy) {
    return node.container.policy;
  }

  switch (node.type) {
    case 'scene':
      return 'scene';
    case 'group':
      return 'group';
    case 'artboard':
      return 'artboard';
    case 'table':
      return 'table';
    default:
      return undefined;
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}
