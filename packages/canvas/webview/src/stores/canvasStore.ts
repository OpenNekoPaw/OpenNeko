import { create, createStore, type StateCreator } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type {
  CanvasData,
  CanvasNode,
  CanvasConnection,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  PortDefinition,
} from '@neko/canvas-domain';
import type { CanvasNodeUpdateOperation } from '@neko/canvas-domain';
import {
  createNodeConnectionEndpoint,
  getContainerChildIds,
  getContainerPolicyName,
  getNodeParentId,
  isContainerNode,
} from '@neko/canvas-domain';
import { useHistoryStore, type HistoryStoreApi } from './historyStore';
import { useCanvasOperationStore, type CanvasOperationStoreApi } from './canvasOperationStore';
import {
  addContainerChild,
  releaseContainerChildren,
  removeContainerChild,
  reorderContainerChildren,
  translateContainerSubtree,
} from '../utils/containerActions';
import { autoArrangeContainer } from '../utils/containerLayout';
import { NODE_DEFAULT_SIZES } from '../utils/nodeFactory';
import {
  createCanvasComposite,
  deriveCanvasNode,
  extractStructuredCanvasContent,
  applyCanvasAgentContent,
  updateCanvasBlock,
} from '../utils/canvasAgentOperations';
import {
  clampNodeSize,
  clampNodeStoredSize,
  clampNodeStoredSizes,
  resolveNodeMinSize,
} from '../utils/nodeSizing';
import { createsDisallowedConnectionCycle } from '../utils/connectionProjection';
import { resolveCanvasDropContainer } from '../utils/containerMembership';
import {
  arrangeSpatialGroup,
  clampSpatialGroupResize,
  expandSpatialGroupToIncludeChild,
  fitSpatialGroupToContent,
  setSpatialGroupCollapsed,
  type SpatialGroupSort,
} from '../utils/spatialGroupLayout';
import {
  type CanvasConnectionMutationResult,
  validateCanvasConnectionDraft,
} from '../utils/canvasConnectionAuthoring';

// =============================================================================
// Types
// =============================================================================

export interface CanvasSelection {
  nodeIds: string[];
  connectionIds: string[];
}

export interface CanvasStore {
  // ==================== State ====================
  canvasData: CanvasData | null;
  selection: CanvasSelection;
  // ==================== Data Actions ====================
  setCanvasData: (data: CanvasData) => void;
  updateCanvasData: (updates: Partial<CanvasData>, options?: { dirty?: boolean }) => void;
  setPlaybackEntry: (nodeId: string) => void;

  // ==================== Node Actions ====================
  addNode: (node: Omit<CanvasNode, 'id'>) => string;
  addNodes: (nodes: Array<Omit<CanvasNode, 'id'>>) => string[];
  updateNode: (id: string, updates: CanvasNodeUpdates) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  /** Record history + update position (call on drag end) */
  moveNodeEnd: (id: string, position: { x: number; y: number }) => void;
  /** Record history + final resize (call on resize end) */
  resizeNodeEnd: (
    id: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Record history + final rotation (call on rotate end) */
  rotateNodeEnd: (id: string, rotation: number) => void;
  /** Update node port definitions (records history) */
  updateNodePorts: (id: string, ports: PortDefinition[]) => void;

  // ==================== Reorder Actions ====================
  /** Reorder a node to a new zIndex (for layer panel drag) */
  reorderNode: (id: string, newZIndex: number) => void;

  // ==================== Container Actions ====================
  /** Remove a child from its Group without deleting the child node. */
  removeChildFromContainer: (containerId: string, childId: string) => void;

  // ==================== Group Actions ====================
  /** Group selected nodes into an existing or new group */
  groupNodes: (childIds: string[]) => string;
  /** Ungroup: remove group node, release children */
  ungroupNodes: (groupId: string) => void;
  reorderGroupChildren: (
    groupId: string,
    childIds: string[],
    autoLayout?: boolean,
  ) => { changed: boolean };
  arrangeGroup: (groupId: string, sort: SpatialGroupSort) => void;
  fitGroupToContent: (groupId: string) => void;
  setGroupCollapsed: (groupId: string, collapsed: boolean) => void;

  // ==================== Connection Actions ====================
  addConnection: (connection: Omit<CanvasConnection, 'id'>) => CanvasConnectionMutationResult;
  updateConnection: (
    id: string,
    updates: Partial<CanvasConnection>,
  ) => CanvasConnectionMutationResult;
  removeConnection: (id: string) => void;

  // ==================== Derive Actions ====================
  /** Create a successor node positioned to the right, auto-connected. Uses targetType if given, else same type as source. */
  deriveSuccessorNode: (sourceNodeId: string, targetType?: string) => string | null;
  /** API/Agent derive path using preset, placement, and connection contracts. */
  deriveNode: (request: CanvasDeriveNodeRequest) => CanvasDeriveNodeResult | null;
  /** API/Agent atomic composite creation path. */
  createComposite: (request: CanvasCreateCompositeRequest) => CanvasCreateCompositeResult | null;
  /** Update a composable block binding or explicit JSON Pointer path. */
  updateBlock: (request: CanvasUpdateBlockRequest) => CanvasUpdateBlockResult | null;
  /** Extract structured content without preview runtime state. */
  extractStructuredContent: (
    request: CanvasExtractStructuredContentRequest,
  ) => CanvasExtractStructuredContentResult;
  /** Apply Agent-generated text, prompt, or structured content through shared target validation. */
  applyAgentContent: (payload: CanvasAgentContentPayload) => CanvasAgentApplyContentResult | null;

  // ==================== Selection Actions ====================
  selectNode: (id: string, multi?: boolean) => void;
  selectConnection: (id: string, multi?: boolean) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  deleteSelected: () => void;

  // ==================== Inline Node Expansion ====================

  // ==================== History Actions ====================
  undo: () => void;
  redo: () => void;
}

type CanvasNodeUpdates = CanvasNodeUpdateOperation['payload']['updates'];

export function canCreateCanvasConnection(
  nodes: readonly CanvasNode[],
  connection: Pick<CanvasConnection, 'sourceId' | 'targetId' | 'type'>,
  existingConnections: readonly CanvasConnection[] = [],
): boolean {
  if (connection.sourceId === connection.targetId) return false;
  const sourceNode = nodes.some((node) => node.id === connection.sourceId);
  const targetNode = nodes.some((node) => node.id === connection.targetId);
  if (!sourceNode || !targetNode) return false;
  if (createsDisallowedConnectionCycle(nodes, existingConnections, connection)) return false;
  return true;
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeCanvasConnectionInput(
  connection: Omit<CanvasConnection, 'id'>,
  id: string,
): CanvasConnection {
  return {
    ...connection,
    id,
    type: connection.type ?? 'reference',
    sourceEndpoint: connection.sourceEndpoint ?? createNodeConnectionEndpoint(connection.sourceId),
    targetEndpoint: connection.targetEndpoint ?? createNodeConnectionEndpoint(connection.targetId),
  };
}

function arePositionsEqual(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
): boolean {
  return a?.x === b?.x && a?.y === b?.y;
}

function areSizesEqual(
  a: { width: number; height: number } | undefined,
  b: { width: number; height: number } | undefined,
): boolean {
  return a?.width === b?.width && a?.height === b?.height;
}

function filterConnectionsTouchingNodeIds(
  connections: readonly CanvasConnection[],
  removedNodeIds: ReadonlySet<string>,
): CanvasConnection[] {
  return connections.filter(
    (conn) => !removedNodeIds.has(conn.sourceId) && !removedNodeIds.has(conn.targetId),
  );
}

function deleteCanvasSelection(
  nodes: CanvasNode[],
  selectedNodeIds: ReadonlySet<string>,
): { readonly nodes: CanvasNode[]; readonly removedNodeIds: ReadonlySet<string> } {
  const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id));
  const removedNodeIds = new Set<string>();
  for (const node of selectedNodes) {
    removedNodeIds.add(node.id);
  }

  let nextNodes = nodes;
  for (const node of selectedNodes) {
    if (isContainerNode(node)) {
      const result = releaseContainerChildren(nextNodes, node.id);
      if (!result.changed)
        throw new Error(result.error ?? `Could not release ${node.id} children.`);
      nextNodes = result.nodes;
    }
  }

  for (const node of selectedNodes) {
    const parentId = getNodeParentId(node);
    if (!parentId || removedNodeIds.has(parentId)) continue;
    const result = removeContainerChild(nextNodes, parentId, node.id);
    if (!result.changed) {
      throw new Error(result.error ?? `Could not remove ${node.id} from ${parentId}.`);
    }
    nextNodes = result.nodes;
  }

  return {
    nodes: nextNodes.filter((node) => !removedNodeIds.has(node.id)),
    removedNodeIds,
  };
}

function syncNodeContainerMembership(nodes: CanvasNode[], movedNodeId: string): CanvasNode[] {
  const movedNode = nodes.find((n) => n.id === movedNodeId);
  if (!movedNode) return nodes;
  const resolution = resolveCanvasDropContainer(nodes, movedNodeId, {
    movingSubtree: isContainerNode(movedNode),
  });
  if (resolution.diagnostic) throw new Error(resolution.diagnostic);
  const targetContainer = resolution.targetContainerId
    ? nodes.find((node) => node.id === resolution.targetContainerId)
    : undefined;

  let nextNodes = nodes;

  if (targetContainer) {
    const result = addContainerChild(nextNodes, targetContainer.id, movedNodeId);
    if (!result.changed) {
      throw new Error(
        result.error ??
          `Could not add Canvas node "${movedNodeId}" to Group "${targetContainer.id}"`,
      );
    }
    nextNodes = expandSpatialGroupToIncludeChild(result.nodes, targetContainer.id, movedNodeId);
  } else {
    const currentParentId = getNodeParentId(movedNode);
    if (currentParentId) {
      nextNodes = removeContainerChild(nextNodes, currentParentId, movedNodeId).nodes;
      const defaultSize = NODE_DEFAULT_SIZES[movedNode.type];
      if (defaultSize) {
        nextNodes = nextNodes.map((n) => (n.id === movedNodeId ? { ...n, size: defaultSize } : n));
      }
    }
  }

  return nextNodes;
}

function normalizeCanvasData(canvasData: CanvasData): CanvasData {
  return {
    ...canvasData,
    nodes: clampNodeStoredSizes(canvasData.nodes),
  };
}

function clampNodeUpdateSize(node: CanvasNode, updates: CanvasNodeUpdates): CanvasNodeUpdates {
  if (!updates.size) {
    return updates;
  }

  return {
    ...updates,
    size: clampNodeSize(updates.size, resolveNodeMinSize(node)),
  };
}

// =============================================================================
// Store
// =============================================================================

function createCanvasState(
  historyStore: HistoryStoreApi,
  operationStore: CanvasOperationStoreApi,
): StateCreator<CanvasStore> {
  const recordHistory = (canvasData: CanvasData | null): void => {
    if (!canvasData) return;
    historyStore.getState().pushState(canvasData);
  };
  const recordCanvasDirty = (description: string): void => {
    operationStore.getState().recordDirty(description);
  };

  return (set, get) => ({
    // ==================== Initial State ====================
    canvasData: null,
    selection: { nodeIds: [], connectionIds: [] },
    // ==================== Data Actions ====================
    setCanvasData: (data) => {
      set({ canvasData: normalizeCanvasData(data) });
    },

    updateCanvasData: (updates, options) => {
      const { canvasData } = get();
      if (!canvasData) return;
      set({
        canvasData: normalizeCanvasData({
          ...canvasData,
          ...updates,
        }),
      });
      if (options?.dirty !== false) {
        recordCanvasDirty('Update canvas data');
      }
    },

    setPlaybackEntry: (nodeId) => {
      const { canvasData } = get();
      if (!canvasData || !canvasData.nodes.some((node) => node.id === nodeId)) return;
      if (
        canvasData.playback?.entryIds?.[0] === nodeId &&
        canvasData.playback.entryIds.length === 1
      ) {
        return;
      }

      recordHistory(canvasData);
      set({
        canvasData: normalizeCanvasData({
          ...canvasData,
          playback: {
            ...(canvasData.playback ?? { version: 1 }),
            version: 1,
            entryIds: [nodeId],
          },
        }),
      });
      recordCanvasDirty('Update canvas playback entry');
    },

    // ==================== Node Actions ====================
    addNode: (node) => {
      const { canvasData } = get();
      if (!canvasData) return '';

      recordHistory(canvasData);

      const id = generateId();
      const newNode = clampNodeStoredSize({ ...node, id } as CanvasNode);

      set({
        canvasData: normalizeCanvasData({
          ...canvasData,
          nodes: [...canvasData.nodes, newNode],
        }),
      });

      operationStore.getState().recordNodeAdd(newNode);
      return id;
    },

    addNodes: (nodes) => {
      const { canvasData } = get();
      if (!canvasData) return [];

      recordHistory(canvasData);

      const ids: string[] = [];
      const newNodes = nodes.map((node) => {
        const id = generateId();
        ids.push(id);
        return clampNodeStoredSize({ ...node, id } as CanvasNode);
      });

      set({
        canvasData: normalizeCanvasData({
          ...canvasData,
          nodes: [...canvasData.nodes, ...newNodes],
        }),
      });

      const ops = operationStore.getState();
      for (const node of newNodes) {
        ops.recordNodeAdd(node);
      }
      return ids;
    },

    updateNode: (id, updates) => {
      const { canvasData } = get();
      if (!canvasData) return;

      recordHistory(canvasData);

      const oldNode = canvasData.nodes.find((n) => n.id === id);
      const before: CanvasNodeUpdates = {};
      if (oldNode) {
        for (const key of Object.keys(updates) as Array<keyof CanvasNodeUpdates>) {
          Object.assign(before, { [key]: oldNode[key] });
        }
      }
      const normalizedUpdates = oldNode ? clampNodeUpdateSize(oldNode, updates) : updates;

      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) =>
            node.id === id ? ({ ...node, ...normalizedUpdates } as CanvasNode) : node,
          ),
        },
      });

      operationStore.getState().recordNodeUpdate(id, normalizedUpdates, before);
    },

    updateNodeData: (id, data) => {
      const { canvasData } = get();
      if (!canvasData) return;

      recordHistory(canvasData);

      const oldNode = canvasData.nodes.find((n) => n.id === id);
      const before: Partial<CanvasNode> = {};
      if (oldNode) {
        before.data = oldNode.data;
      }

      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) =>
            node.id === id
              ? ({
                  ...node,
                  data: { ...node.data, ...data },
                } as CanvasNode)
              : node,
          ),
        },
      });

      operationStore
        .getState()
        .recordNodeUpdate(id, { data: { ...oldNode?.data, ...data } }, before);
    },

    removeNode: (id) => {
      const { canvasData, selection } = get();
      if (!canvasData) return;

      const removedNode = canvasData.nodes.find((n) => n.id === id);
      if (!removedNode) return;
      recordHistory(canvasData);

      const removedNodeIds = new Set([removedNode.id]);
      const removedConnections = canvasData.connections.filter(
        (conn) => removedNodeIds.has(conn.sourceId) || removedNodeIds.has(conn.targetId),
      );

      const membershipNodes = removedNode.parentId
        ? removeContainerChild(canvasData.nodes, removedNode.parentId, id).nodes
        : canvasData.nodes;
      let nextNodes: CanvasNode[];
      if (isContainerNode(removedNode)) {
        nextNodes = releaseContainerChildren(membershipNodes, id).nodes.filter(
          (node) => node.id !== id,
        );
      } else {
        nextNodes = membershipNodes.filter((node) => node.id !== id);
      }

      set({
        canvasData: {
          ...canvasData,
          nodes: nextNodes,
          connections: filterConnectionsTouchingNodeIds(canvasData.connections, removedNodeIds),
        },
        selection: {
          ...selection,
          nodeIds: selection.nodeIds.filter((nodeId) => !removedNodeIds.has(nodeId)),
        },
      });

      operationStore.getState().recordNodeRemove(id, removedNode, removedConnections);
      operationStore.getState().recordContentNodeDelta([...removedNodeIds]);
    },

    moveNodeEnd: (id, position) => {
      const { canvasData } = get();
      if (!canvasData) return;

      const oldNode = canvasData.nodes.find((n) => n.id === id);
      if (!oldNode || arePositionsEqual(oldNode.position, position)) return;
      recordHistory(canvasData);

      if (isContainerNode(oldNode)) {
        const dx = position.x - oldNode.position.x;
        const dy = position.y - oldNode.position.y;
        const translatedNodes = translateContainerSubtree(canvasData.nodes, id, { x: dx, y: dy });
        const nextNodes = syncNodeContainerMembership(translatedNodes, id);
        set({ canvasData: { ...canvasData, nodes: nextNodes } });
      } else {
        const movedNodes = canvasData.nodes.map((node) =>
          node.id === id ? { ...node, position } : node,
        );
        const nextNodes = syncNodeContainerMembership(movedNodes, id);
        set({ canvasData: { ...canvasData, nodes: nextNodes } });
      }

      operationStore.getState().recordNodeUpdate(id, { position }, { position: oldNode.position });
    },

    resizeNodeEnd: (id, size, position) => {
      const { canvasData } = get();
      if (!canvasData) return;

      const oldNode = canvasData.nodes.find((n) => n.id === id);
      if (!oldNode) return;
      const minimumSize = clampNodeSize(size, resolveNodeMinSize(oldNode));
      const spatialClamp =
        getContainerPolicyName(oldNode) === 'group'
          ? clampSpatialGroupResize(canvasData.nodes, id, minimumSize, position)
          : { size: minimumSize, position };
      if (
        areSizesEqual(oldNode.size, spatialClamp.size) &&
        arePositionsEqual(oldNode.position, spatialClamp.position)
      ) {
        return;
      }
      recordHistory(canvasData);

      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) =>
            node.id === id
              ? { ...node, size: spatialClamp.size, position: spatialClamp.position }
              : node,
          ),
        },
      });

      operationStore
        .getState()
        .recordNodeUpdate(
          id,
          { size: spatialClamp.size, position: spatialClamp.position },
          { size: oldNode.size, position: oldNode.position },
        );
    },

    rotateNodeEnd: (id, rotation) => {
      const { canvasData } = get();
      if (!canvasData) return;

      const oldNode = canvasData.nodes.find((n) => n.id === id);
      if (!oldNode || (oldNode.rotation ?? 0) === rotation) return;
      recordHistory(canvasData);

      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, rotation } : node)),
        },
      });

      operationStore.getState().recordNodeUpdate(id, { rotation }, { rotation: oldNode.rotation });
    },

    updateNodePorts: (id, ports) => {
      const { canvasData } = get();
      if (!canvasData) return;

      const oldNode = canvasData.nodes.find((n) => n.id === id);
      recordHistory(canvasData);

      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) => (node.id === id ? { ...node, ports } : node)),
        },
      });

      if (oldNode) {
        operationStore.getState().recordNodeUpdate(id, { ports }, { ports: oldNode.ports });
      }
    },

    // ==================== Reorder Actions ====================
    reorderNode: (id, newZIndex) => {
      const { canvasData } = get();
      if (!canvasData) return;

      const oldNode = canvasData.nodes.find((n) => n.id === id);
      recordHistory(canvasData);

      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((node) =>
            node.id === id ? { ...node, zIndex: newZIndex } : node,
          ),
        },
      });

      if (oldNode) {
        operationStore.getState().recordNodeReorder(id, newZIndex, oldNode.zIndex);
      }
    },

    // ==================== Group Actions ====================
    groupNodes: (childIds) => {
      const { canvasData } = get();
      if (!canvasData || childIds.length === 0) return '';

      recordHistory(canvasData);

      // Calculate bounding box of children
      const children = canvasData.nodes.filter((n) => childIds.includes(n.id));
      if (children.length === 0) return '';

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const child of children) {
        minX = Math.min(minX, child.position.x);
        minY = Math.min(minY, child.position.y);
        maxX = Math.max(maxX, child.position.x + child.size.width);
        maxY = Math.max(maxY, child.position.y + child.size.height);
      }

      const padding = 20;
      const id = generateId();
      const maxZ = Math.max(...canvasData.nodes.map((n) => n.zIndex), 0);

      const groupNode = {
        id,
        type: 'group' as const,
        position: { x: minX - padding, y: minY - padding },
        size: { width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 },
        zIndex: maxZ + 1,
        locked: false,
        container: {
          policy: 'group' as const,
          childIds,
        },
        data: {
          label: 'Group',
        },
      };

      const nextNodes = [...canvasData.nodes, groupNode as CanvasNode];
      let linkedNodes = nextNodes;
      for (const childId of childIds) {
        linkedNodes = addContainerChild(linkedNodes, id, childId).nodes;
      }

      set({
        canvasData: {
          ...canvasData,
          nodes: linkedNodes,
        },
        selection: { nodeIds: [id], connectionIds: [] },
      });

      operationStore.getState().recordNodeGroup(groupNode as CanvasNode, childIds);
      return id;
    },

    removeChildFromContainer: (containerId, childId) => {
      const { canvasData } = get();
      if (!canvasData) return;

      const container = canvasData.nodes.find((n) => n.id === containerId);
      if (!container) return;

      recordHistory(canvasData);

      const nextNodes = removeContainerChild(canvasData.nodes, containerId, childId).nodes;

      set({
        canvasData: {
          ...canvasData,
          nodes: nextNodes,
          connections: canvasData.connections,
        },
      });
      recordCanvasDirty('Remove child from container');
    },

    reorderGroupChildren: (groupId, childIds, autoLayout = false) => {
      const { canvasData } = get();
      if (!canvasData) {
        throw new Error('Canvas data is unavailable');
      }
      const result = reorderContainerChildren(canvasData.nodes, groupId, childIds);
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.changed) {
        return { changed: false };
      }
      const nodes = autoLayout
        ? autoArrangeContainer(result.nodes, { containerId: groupId, mode: 'sequence' })
        : result.nodes;
      recordHistory(canvasData);
      set({ canvasData: { ...canvasData, nodes } });
      recordCanvasDirty('Reorder Group children');
      return { changed: true };
    },

    ungroupNodes: (groupId) => {
      const { canvasData } = get();
      if (!canvasData) return;

      const groupNode = canvasData.nodes.find((n) => n.id === groupId);
      if (!groupNode || (groupNode.type as string) !== 'group') return;

      recordHistory(canvasData);

      const childIds = getContainerChildIds(groupNode);
      const releasedNodes = releaseContainerChildren(canvasData.nodes, groupId).nodes;

      set({
        canvasData: {
          ...canvasData,
          nodes: releasedNodes.filter((n) => n.id !== groupId),
          // Remove connections to/from the group node
          connections: canvasData.connections.filter(
            (c) => c.sourceId !== groupId && c.targetId !== groupId,
          ),
        },
        selection: { nodeIds: childIds, connectionIds: [] },
      });

      operationStore.getState().recordContentNodeDelta([groupId]);
      operationStore.getState().recordNodeUngroup(groupId, groupNode, childIds);
    },

    arrangeGroup: (groupId, sort) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const nextNodes = arrangeSpatialGroup(canvasData.nodes, groupId, sort);
      if (nextNodes === canvasData.nodes) return;
      recordHistory(canvasData);
      set({ canvasData: { ...canvasData, nodes: nextNodes } });
      recordCanvasDirty('Arrange spatial Group');
    },

    fitGroupToContent: (groupId) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const nextNodes = fitSpatialGroupToContent(canvasData.nodes, groupId);
      if (nextNodes === canvasData.nodes) return;
      recordHistory(canvasData);
      set({ canvasData: { ...canvasData, nodes: nextNodes } });
      recordCanvasDirty('Fit spatial Group to content');
    },

    setGroupCollapsed: (groupId, collapsed) => {
      const { canvasData } = get();
      if (!canvasData) return;
      const nextNodes = setSpatialGroupCollapsed(canvasData.nodes, groupId, collapsed);
      if (nextNodes === canvasData.nodes) return;
      recordHistory(canvasData);
      set({ canvasData: { ...canvasData, nodes: nextNodes } });
      recordCanvasDirty(collapsed ? 'Collapse spatial Group' : 'Expand spatial Group');
    },

    // ==================== Connection Actions ====================
    addConnection: (connection) => {
      const { canvasData } = get();
      if (!canvasData) return { ok: false, reason: 'missing-canvas' };
      const validation = validateCanvasConnectionDraft(
        canvasData.nodes,
        canvasData.connections,
        connection,
      );
      if (!validation.ok) return validation;

      recordHistory(canvasData);

      const id = generateId();
      const newConnection: CanvasConnection = normalizeCanvasConnectionInput(connection, id);

      set({
        canvasData: {
          ...canvasData,
          connections: [...canvasData.connections, newConnection],
        },
      });

      operationStore.getState().recordConnectionAdd(newConnection);
      return { ok: true, connectionId: id };
    },

    updateConnection: (id, updates) => {
      const { canvasData } = get();
      if (!canvasData) return { ok: false, reason: 'missing-canvas' };
      const oldConnection = canvasData.connections.find((conn) => conn.id === id);
      if (!oldConnection) return { ok: false, reason: 'missing-connection' };
      const nextConnection = { ...oldConnection, ...updates };
      if (JSON.stringify(oldConnection) === JSON.stringify(nextConnection)) {
        return { ok: true, connectionId: id };
      }
      const validation = validateCanvasConnectionDraft(
        canvasData.nodes,
        canvasData.connections,
        nextConnection,
        { ignoreConnectionId: id },
      );
      if (!validation.ok) return validation;

      recordHistory(canvasData);

      set({
        canvasData: {
          ...canvasData,
          connections: canvasData.connections.map((conn) =>
            conn.id === id ? nextConnection : conn,
          ),
        },
      });
      recordCanvasDirty('Update connection');
      return { ok: true, connectionId: id };
    },

    removeConnection: (id) => {
      const { canvasData, selection } = get();
      if (!canvasData) return;

      const removedConnection = canvasData.connections.find((c) => c.id === id);
      if (!removedConnection) return;
      recordHistory(canvasData);

      set({
        canvasData: {
          ...canvasData,
          connections: canvasData.connections.filter((conn) => conn.id !== id),
        },
        selection: {
          ...selection,
          connectionIds: selection.connectionIds.filter((connId) => connId !== id),
        },
      });

      operationStore.getState().recordConnectionRemove(id, removedConnection);
    },

    // ==================== Derive Actions ====================
    deriveSuccessorNode: (sourceNodeId, targetType?) => {
      const result = get().deriveNode({
        sourceNodeId,
        targetType: targetType as CanvasNode['type'] | undefined,
      });
      return result?.nodeId ?? null;
    },

    deriveNode: (request) => {
      const { canvasData } = get();
      if (!canvasData) return null;

      const mutation = deriveCanvasNode(
        {
          nodes: canvasData.nodes,
          connections: canvasData.connections,
          generateId,
        },
        request,
      );
      recordHistory(canvasData);

      set({
        canvasData: normalizeCanvasData({
          ...canvasData,
          nodes: mutation.nodes,
          connections: mutation.connections,
        }),
        selection: { nodeIds: [mutation.result.nodeId], connectionIds: [] },
      });

      operationStore.getState().recordNodeAdd(mutation.result.node as CanvasNode);
      if (mutation.result.connectionId) {
        const connection = mutation.connections.find(
          (item) => item.id === mutation.result.connectionId,
        );
        if (connection) {
          operationStore.getState().recordConnectionAdd(connection);
        }
      }

      return mutation.result;
    },

    createComposite: (request) => {
      const { canvasData } = get();
      if (!canvasData) return null;

      const mutation = createCanvasComposite(
        {
          nodes: canvasData.nodes,
          connections: canvasData.connections,
          generateId,
        },
        request,
      );
      recordHistory(canvasData);

      set({
        canvasData: normalizeCanvasData({
          ...canvasData,
          nodes: mutation.nodes,
          connections: mutation.connections,
        }),
        selection: { nodeIds: [mutation.result.containerId], connectionIds: [] },
      });

      const previousNodeIds = new Set(canvasData.nodes.map((node) => node.id));
      const addedNodes = mutation.nodes.filter((node) => !previousNodeIds.has(node.id));
      for (const node of addedNodes) {
        operationStore.getState().recordNodeAdd(node);
      }
      const previousConnectionIds = new Set(
        canvasData.connections.map((connection) => connection.id),
      );
      const addedConnections = mutation.connections.filter(
        (connection) => !previousConnectionIds.has(connection.id),
      );
      for (const connection of addedConnections) {
        operationStore.getState().recordConnectionAdd(connection);
      }

      return mutation.result;
    },

    updateBlock: (request) => {
      const { canvasData } = get();
      if (!canvasData) return null;

      const node = canvasData.nodes.find((candidate) => candidate.id === request.nodeId);
      if (!node) {
        throw new Error(`Node "${request.nodeId}" not found`);
      }

      const result = updateCanvasBlock(node, request);
      recordHistory(canvasData);

      set({
        canvasData: {
          ...canvasData,
          nodes: canvasData.nodes.map((candidate) =>
            candidate.id === request.nodeId ? result.node : candidate,
          ),
        },
      });

      operationStore
        .getState()
        .recordNodeUpdate(
          request.nodeId,
          { data: result.data } as Partial<CanvasNode>,
          { data: node.data } as Partial<CanvasNode>,
        );

      return {
        nodeId: result.nodeId,
        changed: result.changed,
        data: result.data,
      };
    },

    extractStructuredContent: (request) => {
      const { canvasData, selection } = get();
      const nodes = canvasData?.nodes ?? [];
      return extractStructuredCanvasContent(nodes, canvasData?.connections ?? [], {
        ...request,
        nodeIds:
          request.nodeIds ??
          (selection.nodeIds.length > 0 ? selection.nodeIds : nodes.map((node) => node.id)),
      });
    },

    applyAgentContent: (payload) => {
      const { canvasData } = get();
      if (!canvasData) return null;

      const mutation = applyCanvasAgentContent(
        {
          nodes: canvasData.nodes,
          connections: canvasData.connections,
          generateId,
        },
        payload,
      );
      recordHistory(canvasData);

      set({
        canvasData: normalizeCanvasData({
          ...canvasData,
          nodes: mutation.nodes,
          connections: mutation.connections,
        }),
        selection: mutation.result.nodeId
          ? { nodeIds: [mutation.result.nodeId], connectionIds: [] }
          : get().selection,
      });

      const previousNodeIds = new Set(canvasData.nodes.map((node) => node.id));
      const ops = operationStore.getState();
      for (const node of mutation.nodes) {
        if (!previousNodeIds.has(node.id)) {
          ops.recordNodeAdd(node);
        }
      }
      if (mutation.result.nodeId && previousNodeIds.has(mutation.result.nodeId)) {
        const before = canvasData.nodes.find((node) => node.id === mutation.result.nodeId);
        const after = mutation.nodes.find((node) => node.id === mutation.result.nodeId);
        if (before && after) {
          ops.recordNodeUpdate(
            mutation.result.nodeId,
            { data: after.data } as Partial<CanvasNode>,
            { data: before.data } as Partial<CanvasNode>,
          );
        }
      }

      return mutation.result;
    },

    // ==================== Selection Actions ====================
    selectNode: (id, multi = false) => {
      const { selection } = get();

      if (multi) {
        const isSelected = selection.nodeIds.includes(id);
        set({
          selection: {
            ...selection,
            nodeIds: isSelected
              ? selection.nodeIds.filter((nodeId) => nodeId !== id)
              : [...selection.nodeIds, id],
          },
        });
      } else {
        set({
          selection: { nodeIds: [id], connectionIds: [] },
        });
      }
    },

    selectConnection: (id, multi = false) => {
      const { selection } = get();

      if (multi) {
        const isSelected = selection.connectionIds.includes(id);
        set({
          selection: {
            ...selection,
            connectionIds: isSelected
              ? selection.connectionIds.filter((connId) => connId !== id)
              : [...selection.connectionIds, id],
          },
        });
      } else {
        set({
          selection: { nodeIds: [], connectionIds: [id] },
        });
      }
    },

    selectNodes: (ids) => {
      set({
        selection: { nodeIds: ids, connectionIds: [] },
      });
    },

    clearSelection: () => {
      set({
        selection: { nodeIds: [], connectionIds: [] },
      });
    },

    deleteSelected: () => {
      const { selection, canvasData } = get();
      if (!canvasData) return;
      if (selection.nodeIds.length === 0 && selection.connectionIds.length === 0) return;

      recordHistory(canvasData);

      const deletion = deleteCanvasSelection(canvasData.nodes, new Set(selection.nodeIds));
      const connectionsToRemove = new Set(selection.connectionIds);

      set({
        canvasData: {
          ...canvasData,
          nodes: deletion.nodes,
          connections: canvasData.connections.filter(
            (conn) =>
              !connectionsToRemove.has(conn.id) &&
              !deletion.removedNodeIds.has(conn.sourceId) &&
              !deletion.removedNodeIds.has(conn.targetId),
          ),
        },
        selection: { nodeIds: [], connectionIds: [] },
      });
      operationStore.getState().recordContentNodeDelta([...deletion.removedNodeIds]);
      recordCanvasDirty('Delete selection');
    },

    // ==================== History Actions ====================
    undo: () => {
      const { canvasData } = get();
      if (!canvasData) return;

      const previousState = historyStore.getState().undo(canvasData);
      if (previousState) {
        set({
          canvasData: previousState,
          selection: { nodeIds: [], connectionIds: [] },
        });
        operationStore
          .getState()
          .recordContentNodeDelta(
            findRemovedCanvasNodeIds(canvasData, previousState),
            findRemovedCanvasNodeIds(previousState, canvasData),
          );
        recordCanvasDirty('Undo canvas edit');
      }
    },

    redo: () => {
      const { canvasData } = get();
      if (!canvasData) return;

      const nextState = historyStore.getState().redo(canvasData);
      if (nextState) {
        set({
          canvasData: nextState,
          selection: { nodeIds: [], connectionIds: [] },
        });
        operationStore
          .getState()
          .recordContentNodeDelta(
            findRemovedCanvasNodeIds(canvasData, nextState),
            findRemovedCanvasNodeIds(nextState, canvasData),
          );
        recordCanvasDirty('Redo canvas edit');
      }
    },
  });
}

export type CanvasStoreApi = StoreApi<CanvasStore>;

export function createCanvasStore(
  historyStore: HistoryStoreApi,
  operationStore: CanvasOperationStoreApi,
): CanvasStoreApi {
  return createStore(createCanvasState(historyStore, operationStore));
}

/** Test/default standalone store. Production Roots use CanvasStoreScopeProvider. */
export const useCanvasStore = create(createCanvasState(useHistoryStore, useCanvasOperationStore));

function findRemovedCanvasNodeIds(previous: CanvasData, next: CanvasData): readonly string[] {
  const nextNodeIds = new Set(next.nodes.map((node) => node.id));
  return previous.nodes.map((node) => node.id).filter((nodeId) => !nextNodeIds.has(nodeId));
}
