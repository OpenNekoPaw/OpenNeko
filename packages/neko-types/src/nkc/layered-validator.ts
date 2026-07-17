// =============================================================================
// NKC Layered Canvas Validator
//
// Validates cross-layer invariants that require reading multiple Canvas nodes.
// The structural validator remains in validator.ts; this module checks the
// organization, content, and relationship contracts introduced by v2.
// =============================================================================

import type { ValidationError, ValidationResult } from '../config/config-adapter';
import type { CanvasConnection, CanvasData, CanvasNode } from '../types/canvas';
import type {
  CanvasBlock,
  CanvasConnectionEndpoint,
  ContainerSection,
  FieldBinding,
  JsonPointerPath,
} from '../types/canvas-layered';
import {
  getContainerChildReferences,
  getContainerPolicyName,
  getNodeParentReferences,
} from '../utils/canvasLayered';

export interface NkcLayeredValidateOptions {
  /** When true, warnings are promoted to errors. */
  strict?: boolean;
}

interface ParentCandidate {
  parentId: string;
  source: string;
}

interface ChildCandidate {
  childId: string;
  source: string;
}

interface ValidationContext {
  nodeById: Map<string, CanvasNode>;
  nodePathById: Map<string, string>;
  parentRefsByChildId: Map<string, ParentCandidate[]>;
  childRefsByParentId: Map<string, ChildCandidate[]>;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function validateNkcLayered(
  data: CanvasData,
  options: NkcLayeredValidateOptions = {},
): ValidationResult {
  const context = createValidationContext(data);

  validateSpatialLayer(data, context);
  validateOrganizationLayer(context);
  validateContentBindings(data, context);
  validateConnections(data.connections, context);

  const effectiveErrors = options.strict
    ? [...context.errors, ...context.warnings]
    : context.errors;

  return {
    valid: effectiveErrors.length === 0,
    errors: effectiveErrors.filter((error) => error.severity === 'error'),
    warnings: options.strict ? [] : context.warnings,
  };
}

function createValidationContext(data: CanvasData): ValidationContext {
  const nodeById = new Map<string, CanvasNode>();
  const nodePathById = new Map<string, string>();
  const parentRefsByChildId = new Map<string, ParentCandidate[]>();
  const childRefsByParentId = new Map<string, ChildCandidate[]>();
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  data.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;

    if (nodeById.has(node.id)) {
      errors.push({
        field: `${path}.id`,
        message: `duplicate node id "${node.id}"`,
        severity: 'error',
      });
    }

    nodeById.set(node.id, node);
    nodePathById.set(node.id, path);

    for (const parentRef of getNodeParentReferences(node)) {
      appendMapValue(parentRefsByChildId, node.id, {
        parentId: parentRef.parentId,
        source: parentRef.source,
      });
    }

    for (const childRef of getContainerChildReferences(node)) {
      appendMapValue(childRefsByParentId, node.id, {
        childId: childRef.childId,
        source: childRef.source,
      });
    }
  });

  return {
    nodeById,
    nodePathById,
    parentRefsByChildId,
    childRefsByParentId,
    errors,
    warnings,
  };
}

function validateSpatialLayer(data: CanvasData, context: ValidationContext): void {
  data.nodes.forEach((node) => {
    const path = getNodePath(context, node.id);

    if (!Number.isFinite(node.position.x)) {
      context.errors.push({
        field: `${path}.position.x`,
        message: 'must be a finite absolute canvas coordinate',
        severity: 'error',
      });
    }

    if (!Number.isFinite(node.position.y)) {
      context.errors.push({
        field: `${path}.position.y`,
        message: 'must be a finite absolute canvas coordinate',
        severity: 'error',
      });
    }

    if (node.size.width <= 0 || !Number.isFinite(node.size.width)) {
      context.errors.push({
        field: `${path}.size.width`,
        message: 'must be a positive finite canvas size',
        severity: 'error',
      });
    }

    if (node.size.height <= 0 || !Number.isFinite(node.size.height)) {
      context.errors.push({
        field: `${path}.size.height`,
        message: 'must be a positive finite canvas size',
        severity: 'error',
      });
    }
  });
}

function validateOrganizationLayer(context: ValidationContext): void {
  for (const [childId, parents] of context.parentRefsByChildId) {
    const uniqueParentIds = new Set(parents.map((parent) => parent.parentId));
    if (uniqueParentIds.size > 1) {
      context.errors.push({
        field: `${getNodePath(context, childId)}.parentId`,
        message: `node has multiple parents: ${Array.from(uniqueParentIds).join(', ')}`,
        severity: 'error',
      });
    }

    for (const parent of parents) {
      if (!context.nodeById.has(parent.parentId)) {
        context.errors.push({
          field: `${getNodePath(context, childId)}.parentId`,
          message: `references missing parent "${parent.parentId}"`,
          severity: 'error',
        });
        continue;
      }

      const childIds = getChildIdsForParent(context, parent.parentId);
      if (!childIds.includes(childId)) {
        context.errors.push({
          field: `${getNodePath(context, childId)}.parentId`,
          message: `parent "${parent.parentId}" does not include this node as a child`,
          severity: 'error',
        });
      }
    }
  }

  for (const [parentId, children] of context.childRefsByParentId) {
    const seen = new Set<string>();
    const duplicateChildIds = new Set<string>();

    for (const child of children) {
      if (!context.nodeById.has(child.childId)) {
        context.errors.push({
          field: `${getNodePath(context, parentId)}.container.childIds`,
          message: `references missing child "${child.childId}"`,
          severity: 'error',
        });
        continue;
      }

      if (seen.has(child.childId)) {
        duplicateChildIds.add(child.childId);
      }
      seen.add(child.childId);

      const parentIds = getParentIdsForChild(context, child.childId);
      if (!parentIds.includes(parentId)) {
        context.errors.push({
          field: `${getNodePath(context, parentId)}.container.childIds`,
          message: `child "${child.childId}" does not reference this parent`,
          severity: 'error',
        });
      }
    }

    for (const duplicateChildId of duplicateChildIds) {
      context.warnings.push({
        field: `${getNodePath(context, parentId)}.container.childIds`,
        message: `child "${duplicateChildId}" appears more than once across container mirrors`,
        severity: 'warning',
      });
    }
  }

  validateContainerCycles(context);
}

function validateContainerCycles(context: ValidationContext): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  for (const nodeId of context.nodeById.keys()) {
    visitContainerNode(nodeId, context, visiting, visited, stack);
  }
}

function visitContainerNode(
  nodeId: string,
  context: ValidationContext,
  visiting: Set<string>,
  visited: Set<string>,
  stack: string[],
): void {
  if (visited.has(nodeId)) {
    return;
  }

  if (visiting.has(nodeId)) {
    const cycleStart = stack.indexOf(nodeId);
    const cycle = cycleStart >= 0 ? [...stack.slice(cycleStart), nodeId] : [...stack, nodeId];
    context.errors.push({
      field: `${getNodePath(context, nodeId)}.container.childIds`,
      message: `container cycle detected: ${cycle.join(' -> ')}`,
      severity: 'error',
    });
    return;
  }

  visiting.add(nodeId);
  stack.push(nodeId);

  for (const childId of getChildIdsForParent(context, nodeId)) {
    if (context.nodeById.has(childId)) {
      visitContainerNode(childId, context, visiting, visited, stack);
    }
  }

  stack.pop();
  visiting.delete(nodeId);
  visited.add(nodeId);
}

function validateContentBindings(data: CanvasData, context: ValidationContext): void {
  data.nodes.forEach((node) => {
    if (!node.content) {
      return;
    }

    validateSectionBindings(
      node,
      node.content,
      `${getNodePath(context, node.id)}.content`,
      context,
    );
  });
}

function validateSectionBindings(
  node: CanvasNode,
  section: ContainerSection,
  path: string,
  context: ValidationContext,
): void {
  validateBlocks(node, section.blocks ?? [], `${path}.blocks`, context);

  section.sections?.forEach((childSection, index) => {
    validateSectionBindings(node, childSection, `${path}.sections[${index}]`, context);
  });

  section.childSlots?.forEach((slot, index) => {
    if (slot.childIds) {
      validateChildSlotIds(node, slot.childIds, `${path}.childSlots[${index}].childIds`, context);
    }
  });
}

function validateBlocks(
  node: CanvasNode,
  blocks: CanvasBlock[],
  path: string,
  context: ValidationContext,
): void {
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;

    if (block.binding) {
      validateFieldBinding(node, block.binding, `${blockPath}.binding`, context);
    }

    if (block.collection) {
      validateFieldBinding(
        node,
        block.collection.source,
        `${blockPath}.collection.source`,
        context,
      );
    }

    if (block.projection?.sourceBinding) {
      validateFieldBinding(
        node,
        block.projection.sourceBinding,
        `${blockPath}.projection.sourceBinding`,
        context,
      );
    }

    block.projection?.columns?.forEach((column, columnIndex) => {
      if (column.binding) {
        validateFieldBinding(
          node,
          column.binding,
          `${blockPath}.projection.columns[${columnIndex}].binding`,
          context,
        );
      }
    });

    if (block.childSlot?.childIds) {
      validateChildSlotIds(
        node,
        block.childSlot.childIds,
        `${blockPath}.childSlot.childIds`,
        context,
      );
    }

    if (block.children) {
      validateBlocks(node, block.children, `${blockPath}.children`, context);
    }
  });
}

function validateFieldBinding(
  node: CanvasNode,
  binding: FieldBinding,
  path: string,
  context: ValidationContext,
): void {
  if (!isJsonPointerPath(binding.path)) {
    context.errors.push({
      field: `${path}.path`,
      message: 'must be a JSON Pointer-style path',
      severity: 'error',
    });
    return;
  }

  if (binding.required === true && !hasJsonPointerValue(node.data, binding.path)) {
    context.errors.push({
      field: `${path}.path`,
      message: `required binding path "${binding.path}" does not exist in node.data`,
      severity: 'error',
    });
  }
}

function validateChildSlotIds(
  node: CanvasNode,
  childIds: string[],
  path: string,
  context: ValidationContext,
): void {
  const containerChildIds = getChildIdsForParent(context, node.id);

  childIds.forEach((childId, index) => {
    if (!context.nodeById.has(childId)) {
      context.errors.push({
        field: `${path}[${index}]`,
        message: `references missing child "${childId}"`,
        severity: 'error',
      });
    } else if (!containerChildIds.includes(childId)) {
      context.warnings.push({
        field: `${path}[${index}]`,
        message: `child "${childId}" is not a direct child of container "${node.id}"`,
        severity: 'warning',
      });
    }
  });
}

function validateConnections(connections: CanvasConnection[], context: ValidationContext): void {
  connections.forEach((connection, index) => {
    validateConnectionNodeId(connection.sourceId, `connections[${index}].sourceId`, context);
    validateConnectionNodeId(connection.targetId, `connections[${index}].targetId`, context);
    validateEndpoint(connection.sourceEndpoint, `connections[${index}].sourceEndpoint`, context);
    validateEndpoint(connection.targetEndpoint, `connections[${index}].targetEndpoint`, context);
  });
}

function validateConnectionNodeId(nodeId: string, path: string, context: ValidationContext): void {
  if (!context.nodeById.has(nodeId)) {
    context.errors.push({
      field: path,
      message: `references missing node "${nodeId}"`,
      severity: 'error',
    });
  }
}

function validateEndpoint(
  endpoint: CanvasConnectionEndpoint,
  path: string,
  context: ValidationContext,
): void {
  const node = context.nodeById.get(endpoint.nodeId);
  if (!node) {
    context.errors.push({
      field: `${path}.nodeId`,
      message: `references missing node "${endpoint.nodeId}"`,
      severity: 'error',
    });
    return;
  }

  if (endpoint.portId && !(node.ports ?? []).some((port) => port.id === endpoint.portId)) {
    context.errors.push({
      field: `${path}.portId`,
      message: `references missing port "${endpoint.portId}"`,
      severity: 'error',
    });
  }

  if (endpoint.blockId && !node.content) {
    context.errors.push({
      field: `${path}.blockId`,
      message: `references block "${endpoint.blockId}" on a node without composable content`,
      severity: 'error',
    });
  } else if (endpoint.blockId && node.content && !hasBlockId(node.content, endpoint.blockId)) {
    context.errors.push({
      field: `${path}.blockId`,
      message: `references missing block "${endpoint.blockId}"`,
      severity: 'error',
    });
  }

  if (endpoint.fieldPath) {
    if (!isJsonPointerPath(endpoint.fieldPath)) {
      context.errors.push({
        field: `${path}.fieldPath`,
        message: 'must be a JSON Pointer-style path',
        severity: 'error',
      });
    } else if (!hasJsonPointerValue(node.data, endpoint.fieldPath)) {
      context.errors.push({
        field: `${path}.fieldPath`,
        message: `references missing field "${endpoint.fieldPath}"`,
        severity: 'error',
      });
    }
  }
}

function hasBlockId(section: ContainerSection, blockId: string): boolean {
  for (const block of section.blocks ?? []) {
    if (block.id === blockId || hasBlockInChildren(block, blockId)) {
      return true;
    }
  }

  for (const childSection of section.sections ?? []) {
    if (hasBlockId(childSection, blockId)) {
      return true;
    }
  }

  return false;
}

function hasBlockInChildren(block: CanvasBlock, blockId: string): boolean {
  for (const child of block.children ?? []) {
    if (child.id === blockId || hasBlockInChildren(child, blockId)) {
      return true;
    }
  }

  return false;
}

function hasJsonPointerValue(root: unknown, path: JsonPointerPath): boolean {
  if (path === '') {
    return true;
  }

  const segments = path
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }

    if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
      continue;
    }

    return false;
  }

  return true;
}

function isJsonPointerPath(path: string): path is JsonPointerPath {
  return path === '' || path.startsWith('/');
}

function getNodePath(context: ValidationContext, nodeId: string): string {
  return context.nodePathById.get(nodeId) ?? `nodes[? id=${nodeId}]`;
}

function getParentIdsForChild(context: ValidationContext, childId: string): string[] {
  return uniqueStrings((context.parentRefsByChildId.get(childId) ?? []).map((ref) => ref.parentId));
}

function getChildIdsForParent(context: ValidationContext, parentId: string): string[] {
  const parentNode = context.nodeById.get(parentId);
  if (!parentNode || !getContainerPolicyName(parentNode)) {
    return [];
  }

  return uniqueStrings((context.childRefsByParentId.get(parentId) ?? []).map((ref) => ref.childId));
}

function appendMapValue<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue): void {
  const values = map.get(key);
  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
