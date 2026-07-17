import type { CanvasNode, GroupCanvasNode } from '@neko/shared';
import { getContainerChildIds, getContainerPolicyName, isGroupNode } from '@neko/shared';
import { getContainerDescendantIds, reorderContainerChildren } from './containerActions';

export type SpatialGroupSort = 'stable' | 'name' | 'type' | 'created';

const GROUP_PADDING = 24;
const GROUP_HEADER = 56;
const GROUP_GAP = 20;
const GROUP_COLUMN_WIDTH = 312;

export function arrangeSpatialGroup(
  nodes: CanvasNode[],
  groupId: string,
  sort: SpatialGroupSort,
): CanvasNode[] {
  const group = requireManualGroup(nodes, groupId);
  const childOrder = getContainerChildIds(group);
  const childById = new Map(nodes.map((node) => [node.id, node]));
  const children = childOrder.flatMap((id) => {
    const child = childById.get(id);
    return child ? [child] : [];
  });
  if (children.length !== childOrder.length) {
    throw new Error(`Spatial Group "${groupId}" references a missing child.`);
  }
  const sorted = [...children].sort((left, right) =>
    compareChildren(left, right, sort, childOrder),
  );
  const sortedIds = sorted.map((child) => child.id);
  const positions = arrangeUnlockedChildren(
    group,
    sorted.filter((child) => !child.locked),
  );
  const orderChanged = sortedIds.some((id, index) => id !== childOrder[index]);
  const positionChanged = sorted.some((child) => {
    const position = positions.get(child.id);
    return position && (position.x !== child.position.x || position.y !== child.position.y);
  });
  if (!orderChanged && !positionChanged) return nodes;

  const reordered = orderChanged
    ? reorderContainerChildren(nodes, groupId, sortedIds)
    : { nodes, changed: true };
  if (!reordered.changed) throw new Error(reordered.error ?? 'Could not sort spatial Group.');
  const deltas = new Map<string, { x: number; y: number }>();
  for (const child of sorted) {
    const position = positions.get(child.id);
    if (!position) continue;
    deltas.set(child.id, {
      x: position.x - child.position.x,
      y: position.y - child.position.y,
    });
  }
  const deltaByNodeId = new Map<string, { x: number; y: number }>();
  for (const [childId, delta] of deltas) {
    deltaByNodeId.set(childId, delta);
    for (const descendantId of getContainerDescendantIds(reordered.nodes, childId)) {
      deltaByNodeId.set(descendantId, delta);
    }
  }
  return reordered.nodes.map((node) => {
    const delta = deltaByNodeId.get(node.id);
    if (!delta || (delta.x === 0 && delta.y === 0)) return node;
    return {
      ...node,
      position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
    };
  });
}

export function expandSpatialGroupToIncludeChild(
  nodes: CanvasNode[],
  groupId: string,
  childId: string,
): CanvasNode[] {
  const group = requireManualGroup(nodes, groupId);
  const child = nodes.find((node) => node.id === childId);
  if (!child) throw new Error(`Spatial Group child not found: ${childId}`);
  const left = Math.min(group.position.x, child.position.x - GROUP_PADDING);
  const top = Math.min(group.position.y, child.position.y - GROUP_HEADER);
  const right = Math.max(
    group.position.x + group.size.width,
    child.position.x + child.size.width + GROUP_PADDING,
  );
  const bottom = Math.max(
    group.position.y + group.size.height,
    child.position.y + child.size.height + GROUP_PADDING,
  );
  if (
    left === group.position.x &&
    top === group.position.y &&
    right === group.position.x + group.size.width &&
    bottom === group.position.y + group.size.height
  ) {
    return nodes;
  }
  return nodes.map((node) =>
    node.id === groupId
      ? {
          ...node,
          position: { x: left, y: top },
          size: { width: right - left, height: bottom - top },
        }
      : node,
  );
}

export function fitSpatialGroupToContent(nodes: CanvasNode[], groupId: string): CanvasNode[] {
  const group = requireManualGroup(nodes, groupId);
  const children = getSpatialGroupDescendants(nodes, group);
  if (children.length === 0) return nodes;
  const left = Math.min(...children.map((child) => child.position.x)) - GROUP_PADDING;
  const top = Math.min(...children.map((child) => child.position.y)) - GROUP_HEADER;
  const right =
    Math.max(...children.map((child) => child.position.x + child.size.width)) + GROUP_PADDING;
  const bottom =
    Math.max(...children.map((child) => child.position.y + child.size.height)) + GROUP_PADDING;
  if (
    group.position.x === left &&
    group.position.y === top &&
    group.size.width === right - left &&
    group.size.height === bottom - top
  ) {
    return nodes;
  }
  return nodes.map((node) =>
    node.id === groupId
      ? {
          ...node,
          position: { x: left, y: top },
          size: { width: right - left, height: bottom - top },
        }
      : node,
  );
}

export function clampSpatialGroupResize(
  nodes: readonly CanvasNode[],
  groupId: string,
  size: { readonly width: number; readonly height: number },
  position: { readonly x: number; readonly y: number },
): { size: { width: number; height: number }; position: { x: number; y: number } } {
  const group = requireManualGroup(nodes, groupId);
  const children = getSpatialGroupDescendants(nodes, group);
  if (children.length === 0) return { size: { ...size }, position: { ...position } };
  const minLeft = Math.min(...children.map((child) => child.position.x)) - GROUP_PADDING;
  const minTop = Math.min(...children.map((child) => child.position.y)) - GROUP_HEADER;
  const minRight =
    Math.max(...children.map((child) => child.position.x + child.size.width)) + GROUP_PADDING;
  const minBottom =
    Math.max(...children.map((child) => child.position.y + child.size.height)) + GROUP_PADDING;
  const left = Math.min(position.x, minLeft);
  const top = Math.min(position.y, minTop);
  return {
    position: { x: left, y: top },
    size: {
      width: Math.max(size.width + (position.x - left), minRight - left),
      height: Math.max(size.height + (position.y - top), minBottom - top),
    },
  };
}

export function setSpatialGroupCollapsed(
  nodes: CanvasNode[],
  groupId: string,
  collapsed: boolean,
): CanvasNode[] {
  const group = requireManualGroup(nodes, groupId);
  if (group.container?.collapsed === collapsed) return nodes;
  return nodes.map((node) => {
    if (node.id !== groupId) return node;
    if (!isGroupNode(node)) {
      throw new Error(`Manual spatial Group not found: ${groupId}`);
    }
    return {
      ...node,
      container: {
        ...(node.container ?? { policy: 'group', childIds: [] }),
        collapsed,
      },
    };
  });
}

function arrangeUnlockedChildren(
  group: GroupCanvasNode,
  children: readonly CanvasNode[],
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let y = group.position.y + GROUP_HEADER;
  for (let rowStart = 0; rowStart < children.length; rowStart += 2) {
    const row = children.slice(rowStart, rowStart + 2);
    row.forEach((child, column) => {
      positions.set(child.id, {
        x: group.position.x + GROUP_PADDING + column * (GROUP_COLUMN_WIDTH + GROUP_GAP),
        y,
      });
    });
    y += Math.max(...row.map((child) => child.size.height)) + GROUP_GAP;
  }
  return positions;
}

function getSpatialGroupDescendants(
  nodes: readonly CanvasNode[],
  group: GroupCanvasNode,
): CanvasNode[] {
  const descendantIds = new Set(getContainerDescendantIds([...nodes], group.id));
  return nodes.filter((node) => descendantIds.has(node.id));
}

function requireManualGroup(nodes: readonly CanvasNode[], groupId: string): GroupCanvasNode {
  const group = nodes.find((node) => node.id === groupId);
  if (!group || !isGroupNode(group) || getContainerPolicyName(group) !== 'group') {
    throw new Error(`Manual spatial Group not found: ${groupId}`);
  }
  return group;
}

function compareChildren(
  left: CanvasNode,
  right: CanvasNode,
  sort: SpatialGroupSort,
  stableOrder: readonly string[],
): number {
  if (sort === 'stable') return stableOrder.indexOf(left.id) - stableOrder.indexOf(right.id);
  if (sort === 'type')
    return left.type.localeCompare(right.type) || left.id.localeCompare(right.id);
  if (sort === 'created') {
    const leftCreated = readNumber(readNodeDataValue(left, 'createdAt'));
    const rightCreated = readNumber(readNodeDataValue(right, 'createdAt'));
    return leftCreated - rightCreated || left.id.localeCompare(right.id);
  }
  return readName(left).localeCompare(readName(right)) || left.id.localeCompare(right.id);
}

function readName(node: CanvasNode): string {
  for (const key of ['title', 'label', 'name'] as const) {
    const value = readNodeDataValue(node, key);
    if (typeof value === 'string' && value.trim()) return value;
  }
  return node.id;
}

function readNodeDataValue(node: CanvasNode, key: string): unknown {
  return Object.entries(node.data).find(([entryKey]) => entryKey === key)?.[1];
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}
